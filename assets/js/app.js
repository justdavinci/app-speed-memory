// Camada de interface: navegação, configuração, condução do treino,
// resultado e histórico. Toda a regra de jogo vive em engine.js/scoring.js.

import { chunk, clamp, esc, fmtDateTime, fmtDuration, pct } from './util.js';
import {
  DEFAULT_SETTINGS, LIMITS, MODES, MODE_LABELS, MODE_UNITS,
  addSession, clearHistory, importHistory, loadHistory, loadSettings,
  saveSettings, statsFor,
} from './storage.js';
import {
  advance, createSession, currentRound, finishSession, isLastRound, submitRound,
} from './engine.js';
import { barChart, lineChart } from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  settings: loadSettings(),
  history: loadHistory(),
  session: null,
  record: null,        // último resultado de sessão (tela de resultado)
  view: 'train',
  filter: 'all',
  chartIndex: -1,
  typed: '',           // buffer do teclado numérico
};

/* ===================== controle de tempo cancelável ===================== */

let runToken = 0;
let pending = null;

/** Espera `ms`, mas pode ser cancelada por abortRun(). */
function sleep(ms) {
  return new Promise((resolve) => {
    const id = setTimeout(() => { pending = null; resolve('done'); }, ms);
    pending = { resolve, cancel: () => clearTimeout(id) };
  });
}

/** Barra de tempo animada; resolve com 'done', 'skip' ou 'abort'. */
function runTimer(ms) {
  const fill = $('#timer-fill');
  const label = $('#timer-left');
  return new Promise((resolve) => {
    const start = performance.now();
    let raf = 0;
    const step = (now) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / ms);
      fill.style.transform = `scaleX(${1 - p})`;
      label.textContent = (Math.max(0, ms - elapsed) / 1000).toFixed(1).replace('.', ',');
      if (p >= 1) { pending = null; resolve('done'); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    pending = {
      resolve,
      cancel: () => cancelAnimationFrame(raf),
      skip: () => { cancelAnimationFrame(raf); pending = null; resolve('skip'); },
    };
  });
}

function abortRun() {
  runToken++;
  if (pending) {
    pending.cancel();
    const { resolve } = pending;
    pending = null;
    resolve('abort');
  }
}

/* ============================== feedback ================================ */

let audioCtx = null;

function beep(freq = 660, ms = 70, gain = 0.05) {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    vol.gain.value = gain;
    osc.connect(vol).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + ms / 1000);
  } catch (_) { /* áudio indisponível: segue sem som */ }
}

function buzz(pattern) {
  if (!state.settings.haptics) return;
  try { navigator.vibrate?.(pattern); } catch (_) { /* ignorado */ }
}

let toastTimer = 0;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/** Diálogo de confirmação; resolve true/false. */
function confirmDialog(title, text, okLabel = 'Confirmar') {
  const dlg = $('#dialog');
  $('#dialog-title').textContent = title;
  $('#dialog-text').textContent = text;
  $('#dialog-ok').textContent = okLabel;
  return new Promise((resolve) => {
    const done = (value) => {
      $('#dialog-ok').removeEventListener('click', onOk);
      $('#dialog-cancel').removeEventListener('click', onCancel);
      dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      resolve(value);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onClose = () => done(false);
    $('#dialog-ok').addEventListener('click', onOk);
    $('#dialog-cancel').addEventListener('click', onCancel);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}

/* ============================ tela mantida acesa ======================== */

let wakeLock = null;

async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (_) { /* recurso opcional */ }
}

/* ============================== navegação =============================== */

const VIEW_TITLES = {
  train: ['Treinar', 'Escolha o modo e a dificuldade'],
  history: ['Histórico', 'Sua evolução ao longo do tempo'],
  results: ['Resultado', 'Como foi a sua sessão'],
  settings: ['Ajustes', 'Preferências do aplicativo'],
};

function showView(view) {
  state.view = view;
  for (const name of ['train', 'history', 'results', 'settings']) {
    $(`#view-${name}`).hidden = name !== view;
  }
  $$('.tab').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  const [title, sub] = VIEW_TITLES[view];
  $('#topbar-title').textContent = title;
  $('#topbar-sub').textContent = sub;
  $('#main').scrollTop = 0;
  if (view === 'history') renderHistory();
}

/* ========================= configuração do treino ======================= */

function cfg() {
  return state.settings.perMode[state.settings.mode];
}

function persist() {
  saveSettings(state.settings);
}

function totalExposureMs(mode, config) {
  const perSeries = config.pace === 'perItem' ? config.seconds * config.count : config.seconds;
  return perSeries * state.settings.series * 1000;
}

function renderTrain() {
  const mode = state.settings.mode;
  const c = cfg();
  const limits = LIMITS[mode];

  $$('.mode').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.mode === mode));
  });

  const countInput = $('#in-count');
  countInput.min = limits.min;
  countInput.max = limits.max;
  c.count = clamp(c.count, limits.min, limits.max);
  countInput.value = c.count;

  $('#label-count').textContent =
    mode === 'sentence' ? 'Palavras na frase' : `${MODE_LABELS[mode]} por série`;
  $('#out-count').textContent = c.count;
  $('#hint-count').textContent = {
    digits: 'Quantos dígitos aparecem em cada série.',
    words: 'Quantas palavras soltas aparecem em cada série.',
    sentence: 'A frase é gerada com exatamente essa quantidade de palavras.',
  }[mode];

  $('#in-seconds').value = c.seconds;
  $('#out-seconds').textContent = `${c.seconds}s`;
  $$('[data-pace]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.pace === c.pace));
  });
  $('#hint-pace').textContent = c.pace === 'total'
    ? 'O tempo vale para a série inteira.'
    : `O tempo vale para cada item — ${c.seconds * c.count}s por série.`;

  $('#in-series').value = state.settings.series;
  $('#out-series').textContent = state.settings.series;

  $('#field-group').hidden = mode !== 'digits';
  $$('[data-group]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(Number(btn.dataset.group) === (c.group || 0)));
  });

  const unit = MODE_UNITS[mode];
  const n = state.settings.series;
  $('#estimate').textContent =
    `${n} série${n > 1 ? 's' : ''} × ${c.count} ${unit} · ${fmtDuration(totalExposureMs(mode, c))} de exposição no total`;

  renderLastSummary();
}

function renderLastSummary() {
  const box = $('#last-summary');
  const mine = state.history.filter((s) => s.mode === state.settings.mode);
  if (!mine.length) { box.hidden = true; return; }

  const last = mine[mine.length - 1];
  const stats = statsFor(state.history, state.settings.mode);
  box.hidden = false;
  $('#last-tiles').innerHTML = [
    tile(pct(last.totals.accuracy), 'precisão'),
    tile(`${last.totals.correct}/${last.totals.total}`, 'itens'),
    tile(String(last.config.count), MODE_UNITS[state.settings.mode].split(' ')[0]),
    tile(stats.bestSpan ? String(stats.bestSpan) : '—', 'recorde de série'),
  ].join('');
}

function tile(value, label, modifier = '') {
  return `<div class="tile ${modifier}">
      <div class="tile__value">${esc(value)}</div>
      <div class="tile__label">${esc(label)}</div>
    </div>`;
}

/* =============================== o treino =============================== */

function showStage(name) {
  for (const stage of ['ready', 'memorize', 'recall', 'feedback']) {
    $(`#stage-${stage}`).hidden = stage !== name;
  }
}

function renderPlayProgress() {
  const s = state.session;
  const bar = $('#play-progress');
  bar.innerHTML = s.rounds
    .map((r, i) => {
      let cls = '';
      if (r.result) cls = r.result.perfect ? 'is-done' : 'is-miss';
      else if (i === s.index) cls = 'is-now';
      return `<i class="${cls}"></i>`;
    })
    .join('');
  $('#play-counter').textContent = `${Math.min(s.index + 1, s.rounds.length)}/${s.rounds.length}`;
}

/** Marcação do conteúdo mostrado na memorização. */
function contentMarkup(mode, content, config, itemIndex = null) {
  if (itemIndex !== null) {
    const item = content.items[itemIndex];
    const cls = mode === 'digits' ? 'solo' : 'solo solo--word';
    return `<div class="${cls}">${esc(item)}</div>`;
  }
  if (mode === 'digits') {
    const size = content.items.length > 32 ? ' digits--tiny' : content.items.length > 16 ? ' digits--dense' : '';
    const blocks = chunk(content.items.join(''), config.group || 0);
    return `<div class="digits${size}">${blocks.map((b) => `<span>${esc(b)}</span>`).join('')}</div>`;
  }
  if (mode === 'words') {
    return `<div class="word-list">${content.items.map((w) => `<span class="word-chip">${esc(w)}</span>`).join('')}</div>`;
  }
  return `<p class="sentence">${esc(content.display)}</p>`;
}

async function startSession() {
  const config = {
    mode: state.settings.mode,
    count: cfg().count,
    seconds: cfg().seconds,
    pace: cfg().pace,
    group: cfg().group || 0,
    series: state.settings.series,
  };
  state.session = createSession(config);
  $('#play').hidden = false;
  $('#tabbar').hidden = true;
  await runRound();
}

async function runRound() {
  const token = ++runToken;
  const s = state.session;
  const round = currentRound(s);
  if (!round) return;

  renderPlayProgress();
  showStage('ready');
  $('#ready-kicker').textContent = `Série ${s.index + 1} de ${s.rounds.length}`;

  if (state.settings.countdown) {
    $('#btn-go').hidden = true;
    $('#ready-hint').textContent = 'Prepare-se…';
    for (const n of [3, 2, 1]) {
      $('#countdown').textContent = String(n);
      $('#countdown').style.animation = 'none';
      void $('#countdown').offsetWidth;
      $('#countdown').style.animation = '';
      beep(520, 55, 0.04);
      if ((await sleep(650)) === 'abort' || token !== runToken) return;
    }
    await memorize(token);
  } else {
    $('#countdown').textContent = '👁';
    $('#ready-hint').textContent = 'Toque quando estiver pronto.';
    $('#btn-go').hidden = false;
    $('#btn-go').onclick = () => { $('#btn-go').hidden = true; memorize(token); };
  }
}

async function memorize(token) {
  const s = state.session;
  const round = currentRound(s);
  const { mode, config } = { mode: s.mode, config: s.config };

  showStage('memorize');
  keepAwake(true);
  beep(880, 60, 0.05);
  $('#btn-ready').hidden = config.pace === 'perItem';

  if (config.pace === 'perItem') {
    for (let i = 0; i < round.content.items.length; i++) {
      $('#content').innerHTML = contentMarkup(mode, round.content, config, i);
      const out = await runTimer(config.seconds * 1000);
      if (out === 'abort' || token !== runToken) return;
    }
  } else {
    $('#content').innerHTML = contentMarkup(mode, round.content, config);
    const out = await runTimer(config.seconds * 1000);
    if (out === 'abort' || token !== runToken) return;
  }

  beep(440, 90, 0.05);
  keepAwake(false);
  toRecall();
}

function toRecall() {
  const s = state.session;
  showStage('recall');
  state.typed = '';

  const isDigits = s.mode === 'digits';
  $('#answer-digits').hidden = !isDigits;
  $('#answer-text').hidden = isDigits;
  $('#recall-kicker').textContent = isDigits
    ? 'Digite os dígitos na ordem'
    : s.mode === 'words' ? 'Digite as palavras na ordem' : 'Escreva a frase que você viu';

  if (isDigits) {
    $('#digits-total').textContent = s.config.count;
    renderTyped();
  } else {
    const input = $('#text-input');
    input.value = '';
    input.placeholder = s.mode === 'words'
      ? 'Separe por espaço ou vírgula'
      : 'Escreva a frase completa';
    $('#words-total').textContent = s.config.count;
    updateWordCount();
    setTimeout(() => input.focus(), 60);
  }
}

function renderTyped() {
  $('#digits-display').textContent = chunk(state.typed, state.session.config.group || 0).join(' ');
  $('#digits-count').textContent = state.typed.length;
}

function updateWordCount() {
  const n = $('#text-input').value.trim().split(/[\s,;]+/).filter(Boolean).length;
  $('#words-count').textContent = n;
}

function submitAnswer(text) {
  const s = state.session;
  const result = submitRound(s, text, { strictAccents: state.settings.strictAccents });
  if (!result) return;

  buzz(result.perfect ? 30 : [40, 60, 40]);
  beep(result.perfect ? 880 : 200, result.perfect ? 90 : 160, 0.05);
  renderPlayProgress();
  renderFeedback(result);
  showStage('feedback');
  $('#btn-next').textContent = isLastRound(s) ? 'Ver resultado' : 'Próxima série';
}

function renderFeedback(result) {
  const s = state.session;
  const head = $('#feedback-headline');
  head.textContent = result.perfect
    ? 'Perfeito!'
    : `${result.correct} de ${result.total} certos`;
  head.className = `feedback__headline ${result.perfect ? 'is-ok' : 'is-bad'}`;

  const digitCls = s.mode === 'digits' ? ' cell--digit' : '';
  const cells = result.cells.map((c) => {
    const given = c.ok
      ? ''
      : `<span class="cell__given${c.missing ? ' cell__given--empty' : ''}">${esc(c.missing ? '—' : c.given)}</span>`;
    return `<span class="cell${digitCls} ${c.ok ? 'is-ok' : 'is-bad'}">
        <span>${esc(c.expected)}</span>${given}
      </span>`;
  });

  const extras = result.extra.map(
    (e) => `<span class="cell${digitCls} is-bad"><span>+${esc(e)}</span><span class="cell__given">a mais</span></span>`,
  );

  $('#diff').innerHTML = cells.concat(extras).join('');
}

function nextRound() {
  const s = state.session;
  if (isLastRound(s)) {
    endSession();
  } else {
    advance(s);
    runRound();
  }
}

function endSession() {
  const record = finishSession(state.session);
  state.history = addSession(record);
  state.record = record;
  state.session = null;
  abortRun();
  keepAwake(false);
  $('#play').hidden = true;
  $('#tabbar').hidden = false;
  renderResults(record);
  showView('results');
  renderTrain();
}

async function quitSession() {
  const done = state.session.rounds.filter((r) => r.result).length;
  const ok = await confirmDialog(
    'Sair do treino?',
    done ? `As ${done} séries já respondidas não serão salvas.` : 'A sessão será descartada.',
    'Sair',
  );
  if (!ok) return;
  abortRun();
  keepAwake(false);
  state.session = null;
  $('#play').hidden = true;
  $('#tabbar').hidden = false;
  showView('train');
}

/* ============================== resultado =============================== */

function renderResults(record) {
  const { totals, config, mode } = record;
  const accuracy = Math.round(totals.accuracy * 100);

  $('#result-ring').style.setProperty('--p', accuracy);
  $('#result-accuracy').textContent = `${accuracy}%`;
  $('#result-title').textContent =
    `${MODE_LABELS[mode]} · ${config.count} ${MODE_UNITS[mode]} · ${config.seconds}s`;

  const previous = state.history
    .filter((s) => s.mode === mode && s.id !== record.id && s.config.count === config.count);
  const bestBefore = previous.length ? Math.max(...previous.map((s) => s.totals.accuracy)) : null;

  let sub;
  if (bestBefore === null) sub = 'Primeira sessão com essa configuração — é a sua nova referência.';
  else if (totals.accuracy > bestBefore) sub = `Novo recorde! Antes: ${pct(bestBefore)}.`;
  else if (totals.accuracy === bestBefore) sub = `Empatou com o seu melhor: ${pct(bestBefore)}.`;
  else sub = `Seu melhor nessa configuração é ${pct(bestBefore)}.`;
  $('#result-sub').textContent = sub;

  $('#result-tiles').innerHTML = [
    tile(`${totals.correct}/${totals.total}`, 'itens certos'),
    tile(`${totals.perfectSeries}/${record.series.length}`, 'séries perfeitas'),
    tile(String(totals.bestStreak), 'melhor sequência'),
    tile(fmtDuration(record.durationMs), 'duração'),
  ].join('');

  $('#result-series').innerHTML = record.series
    .map((s, i) => {
      const p = s.total ? (s.correct / s.total) * 100 : 0;
      return `<div class="series-row">
          <span class="series-row__label">${i + 1}ª</span>
          <span class="series-row__bar"><span class="series-row__fill${s.perfect ? ' is-perfect' : ''}" style="width:${p.toFixed(0)}%"></span></span>
          <span class="series-row__score">${s.correct}/${s.total}</span>
        </div>`;
    })
    .join('');
}

/* =============================== histórico ============================== */

function filteredHistory() {
  const list = state.filter === 'all'
    ? state.history
    : state.history.filter((s) => s.mode === state.filter);
  return list.slice().sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));
}

function renderHistory() {
  const list = filteredHistory();
  const stats = statsFor(state.history, state.filter === 'all' ? null : state.filter);

  const trendTile = stats.trend === null
    ? tile('—', 'tendência')
    : tile(
      `${stats.trend >= 0 ? '+' : '−'}${Math.abs(Math.round(stats.trend * 100))}%`,
      'últimas 5 vs. anteriores',
      stats.trend >= 0 ? 'tile--up' : 'tile--down',
    );

  $('#stat-tiles').innerHTML = [
    tile(String(stats.sessions), 'sessões'),
    tile(stats.sessions ? pct(stats.recent) : '—', 'precisão recente'),
    tile(stats.bestSpan ? String(stats.bestSpan) : '—', 'maior série perfeita'),
    trendTile,
  ].join('');

  const recent = list.slice(-30);
  state.chartIndex = clamp(state.chartIndex, -1, recent.length - 1);
  $('#chart-accuracy').innerHTML = lineChart(
    recent.map((s) => ({ value: s.totals.accuracy })),
    state.chartIndex,
  );
  $('#chart-items').innerHTML = barChart(
    recent.map((s) => ({
      value: s.totals.correct,
      max: s.totals.total,
      perfect: s.totals.correct === s.totals.total,
    })),
  );
  renderChartCaption(recent);

  $('#history-list').innerHTML = list.length
    ? list.slice().reverse().slice(0, 60).map(historyItem).join('')
    : '<p class="empty">Nenhuma sessão registrada ainda.</p>';
}

function renderChartCaption(recent) {
  const caption = $('#chart-caption');
  if (!recent.length) { caption.textContent = ''; return; }
  const i = state.chartIndex;
  if (i < 0 || !recent[i]) {
    caption.textContent = `Últimas ${recent.length} sessões. Toque em um ponto para ver os detalhes.`;
    return;
  }
  const s = recent[i];
  caption.textContent =
    `${fmtDateTime(s.finishedAt)} · ${MODE_LABELS[s.mode]} · ${s.config.count} × ${s.config.seconds}s · ${pct(s.totals.accuracy)}`;
}

function historyItem(s) {
  const acc = Math.round(s.totals.accuracy * 100);
  return `<article class="history-item">
      <div class="history-item__main">
        <div class="history-item__title">${MODE_LABELS[s.mode]} · ${s.config.count} ${esc(MODE_UNITS[s.mode])}</div>
        <div class="history-item__meta">${fmtDateTime(s.finishedAt)} · ${s.config.seconds}s${s.config.pace === 'perItem' ? '/item' : ''} · ${s.series.length} séries · ${s.totals.perfectSeries} perfeitas</div>
      </div>
      <div class="history-item__score${acc >= 90 ? ' is-high' : ''}">${acc}%</div>
    </article>`;
}

function exportData() {
  const payload = {
    app: 'speed-memory',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: state.history,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speed-memory-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Arquivo gerado.');
}

async function handleImport(file) {
  try {
    const data = JSON.parse(await file.text());
    const sessions = Array.isArray(data) ? data : data.sessions;
    state.history = importHistory(sessions, false);
    renderHistory();
    renderTrain();
    toast('Histórico importado.');
  } catch (err) {
    toast(`Não foi possível importar: ${err.message}`);
  }
}

/* ================================ ajustes =============================== */

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  $$('[data-theme-opt]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.themeOpt === state.settings.theme));
  });
}

function renderSettings() {
  $('#sw-accents').checked = state.settings.strictAccents;
  $('#sw-countdown').checked = state.settings.countdown;
  $('#sw-sound').checked = state.settings.sound;
  $('#sw-haptics').checked = state.settings.haptics;
  applyTheme();
}

/* =============================== eventos ================================ */

function bindEvents() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });

  $$('.mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.mode = btn.dataset.mode;
      persist();
      renderTrain();
    });
  });

  const setValue = (key, value) => {
    if (key === 'series') {
      state.settings.series = clamp(value, 1, 20);
    } else if (key === 'count') {
      const l = LIMITS[state.settings.mode];
      cfg().count = clamp(value, l.min, l.max);
    } else if (key === 'seconds') {
      cfg().seconds = clamp(value, 1, 120);
    }
    persist();
    renderTrain();
  };

  $('#in-count').addEventListener('input', (e) => setValue('count', Number(e.target.value)));
  $('#in-seconds').addEventListener('input', (e) => setValue('seconds', Number(e.target.value)));
  $('#in-series').addEventListener('input', (e) => setValue('series', Number(e.target.value)));

  $$('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.step;
      const delta = Number(btn.dataset.delta);
      const current = key === 'series' ? state.settings.series : cfg()[key];
      setValue(key, current + delta);
    });
  });

  $$('[data-pace]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cfg().pace = btn.dataset.pace;
      persist();
      renderTrain();
    });
  });

  $$('[data-group]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cfg().group = Number(btn.dataset.group);
      persist();
      renderTrain();
    });
  });

  $('#btn-start').addEventListener('click', startSession);
  $('#btn-quit').addEventListener('click', quitSession);
  $('#btn-ready').addEventListener('click', () => pending?.skip?.());
  $('#btn-next').addEventListener('click', nextRound);
  $('#btn-confirm').addEventListener('click', () => submitAnswer($('#text-input').value));

  $('#text-input').addEventListener('input', updateWordCount);
  $('#text-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitAnswer($('#text-input').value);
    }
  });

  $('#keypad').addEventListener('click', (e) => {
    const key = e.target.closest('.key')?.dataset.key;
    if (key) handleKey(key);
  });

  document.addEventListener('keydown', (e) => {
    if ($('#play').hidden || $('#stage-recall').hidden || state.session?.mode !== 'digits') return;
    if (/^[0-9]$/.test(e.key)) { handleKey(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { handleKey('back'); e.preventDefault(); }
    else if (e.key === 'Enter') { handleKey('ok'); e.preventDefault(); }
  });

  $('#btn-again').addEventListener('click', () => { showView('train'); startSession(); });
  $('#btn-harder').addEventListener('click', () => {
    const l = LIMITS[state.settings.mode];
    cfg().count = clamp(cfg().count + 1, l.min, l.max);
    persist();
    showView('train');
    toast(`Dificuldade: ${cfg().count} ${MODE_UNITS[state.settings.mode]}.`);
    renderTrain();
  });
  $('#btn-to-history').addEventListener('click', () => showView('history'));

  $$('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      state.chartIndex = -1;
      $$('.chip').forEach((c) => {
        const active = c === chip;
        c.classList.toggle('is-active', active);
        c.setAttribute('aria-selected', String(active));
      });
      renderHistory();
    });
  });

  $('#chart-accuracy').addEventListener('click', (e) => {
    const hit = e.target.closest('.hit');
    if (!hit) return;
    state.chartIndex = Number(hit.dataset.i);
    renderHistory();
  });

  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
    e.target.value = '';
  });
  $('#btn-clear').addEventListener('click', async () => {
    const ok = await confirmDialog('Apagar histórico?', 'Todas as sessões salvas neste aparelho serão removidas. Não dá para desfazer.', 'Apagar');
    if (!ok) return;
    clearHistory();
    state.history = [];
    state.chartIndex = -1;
    renderHistory();
    renderTrain();
    toast('Histórico apagado.');
  });

  $$('[data-theme-opt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.theme = btn.dataset.themeOpt;
      persist();
      applyTheme();
    });
  });

  const toggle = (id, key) => {
    $(id).addEventListener('change', (e) => {
      state.settings[key] = e.target.checked;
      persist();
    });
  };
  toggle('#sw-accents', 'strictAccents');
  toggle('#sw-countdown', 'countdown');
  toggle('#sw-sound', 'sound');
  toggle('#sw-haptics', 'haptics');

  // A tela pode apagar durante exposições longas.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !$('#stage-memorize').hidden) keepAwake(true);
  });
}

function handleKey(key) {
  const s = state.session;
  if (!s) return;
  if (key === 'back') {
    state.typed = state.typed.slice(0, -1);
  } else if (key === 'ok') {
    submitAnswer(state.typed);
    return;
  } else if (state.typed.length < s.config.count + 10) {
    state.typed += key;
  }
  renderTyped();
}

/* ================================ início ================================ */

function init() {
  if (!MODES.includes(state.settings.mode)) state.settings.mode = DEFAULT_SETTINGS.mode;
  bindEvents();
  applyTheme();
  renderSettings();
  renderTrain();
  showView('train');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline é opcional */ });
    });
  }
}

init();
