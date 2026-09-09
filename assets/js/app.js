// PiscaMemory — camada de interface: navegação, configuração, condução do
// treino, resultado e histórico. A regra de jogo vive em engine.js/scoring.js.

import { chunk, clamp, esc, fmtDateTime, fmtDuration, pct } from './util.js';
import {
  DEFAULT_SETTINGS, INTERVAL_MAX_MS, LIMITS, MODES, MODE_LABELS, MODE_UNITS,
  addSession, addTest, bestTest, clearHistory, exposureOf, importHistory, loadHistory,
  loadSettings, loadTests, levelsByMode, saveSettings, statsFor, testLevels,
} from './storage.js';
import {
  advance, createSession, currentRound, finishSession, generateContent, isLastRound,
  nextIntervalMs, submitRound,
} from './engine.js';
import {
  BAND_SCALES, EXPOSURE_STEPS, classify, formatExposure, formatLevel, levelOf,
  scaleForMode, stepIndexFor,
} from './perception.js';
import {
  TEST, createStaircase, currentCount, currentExposure, finishTest, nextInterval, recordTrial,
} from './adaptive.js';
import { barChart, lineChart } from './charts.js';
import { initTryHard, onEnterTryHard, tryHardStore } from './tryhard/ui.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  settings: loadSettings(),
  history: loadHistory(),
  session: null,
  record: null,        // último resultado de sessão (tela de resultado)
  tests: loadTests(),
  testMode: 'digits',
  testResult: null,
  scaleView: 'digits',   // régua exibida na tabela do histórico
  view: 'train',
  filter: 'all',
  chartIndex: -1,
  typed: '',           // buffer do teclado numérico
  frameMs: 16.7,       // duração de um quadro, medida no início
};

/** Abaixo disso a barra de tempo vira um piscar inútil: some da tela. */
const TIMER_MIN_MS = 1000;

/**
 * Mede a duração de um quadro do aparelho. É ela que limita a exposição
 * mínima real: nenhuma tela mostra algo por menos de um quadro.
 */
function measureFrame() {
  let last = 0;
  const deltas = [];
  const tick = (ts) => {
    if (last) deltas.push(ts - last);
    last = ts;
    if (deltas.length < 8) {
      requestAnimationFrame(tick);
      return;
    }
    deltas.sort((a, b) => a - b);
    state.frameMs = deltas[Math.floor(deltas.length / 2)] || 16.7;
    renderTrain();
  };
  requestAnimationFrame(tick);
}

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

/**
 * Exposição curta: mostra o conteúdo e o retira no primeiro quadro que
 * alcança o tempo pedido. Devolve a duração REAL em tela, que é sempre um
 * múltiplo da duração do quadro do aparelho — nenhuma tela consegue menos.
 */
function flash(ms) {
  const el = $('#content');
  return new Promise((resolve) => {
    let raf = 0;
    let t0 = 0;
    const hide = () => { el.style.visibility = 'hidden'; };

    const step = (ts) => {
      if (ts - t0 >= ms) {
        hide();
        pending = null;
        resolve({ outcome: 'done', actual: ts - t0 });
        return;
      }
      raf = requestAnimationFrame(step);
    };
    // Um quadro para pintar o conteúdo, outro para começar a contar.
    const show = (ts) => {
      el.style.visibility = 'visible';
      t0 = ts;
      raf = requestAnimationFrame(step);
    };

    el.style.visibility = 'hidden';
    raf = requestAnimationFrame(show);
    pending = {
      resolve: (value) => resolve(value),
      cancel: () => { cancelAnimationFrame(raf); hide(); },
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

/** Normaliza os retornos de sleep/runTimer/flash em { outcome, actual }. */
function asOutcome(value) {
  return typeof value === 'string' ? { outcome: value, actual: null } : value;
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
  test: ['Teste', 'Descubra a sua velocidade de processamento'],
  tryhard: ['Try Hard', 'Treino avançado de percepção'],
  history: ['Histórico', 'Sua evolução ao longo do tempo'],
  results: ['Resultado', 'Como foi a sua sessão'],
  'test-result': ['Resultado do teste', 'A sua velocidade estimada'],
  settings: ['Ajustes', 'Preferências do aplicativo'],
};

function showView(view) {
  state.view = view;
  for (const name of ['train', 'test', 'tryhard', 'history', 'results', 'test-result', 'settings']) {
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
  if (view === 'test') renderTestIntro();
  if (view === 'tryhard') onEnterTryHard();
}

/* ========================= configuração do treino ======================= */

function cfg() {
  return state.settings.perMode[state.settings.mode];
}

function persist() {
  saveSettings(state.settings);
}

function totalExposureMs(config) {
  const perSeries = config.pace === 'perItem' ? config.exposureMs * config.count : config.exposureMs;
  return perSeries * state.settings.series;
}

/** Texto do intervalo configurado ("2 s", "entre 2 s e 10 s", "imediato"). */
function intervalLabel(interval) {
  if (interval.mode === 'random') {
    return `entre ${formatExposure(interval.minMs)} e ${formatExposure(interval.maxMs)}`;
  }
  return interval.ms === 0 ? 'imediato' : formatExposure(interval.ms);
}

function renderTrain() {
  const mode = state.settings.mode;
  const c = cfg();
  const limits = LIMITS[mode];
  const interval = state.settings.interval;

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

  // Exposição: o controle anda pelos passos da escala, não por milissegundos.
  const stepIndex = stepIndexFor(c.exposureMs);
  const exposure = EXPOSURE_STEPS[stepIndex];
  c.exposureMs = exposure;
  $('#in-exposure').max = EXPOSURE_STEPS.length - 1;
  $('#in-exposure').value = stepIndex;
  $('#out-exposure').textContent = formatExposure(exposure);

  const { band, basisMs, scale } = classify(mode, exposure, c.count);
  const basisText = scale.perItem
    ? ` — ${formatExposure(basisMs)} por palavra`
    : '';
  $('#exposure-band').innerHTML =
    `<strong>${esc(band.name)}</strong> · ${esc(band.range)}${esc(basisText)}<span>${esc(band.text)}</span>`;

  // Nenhuma tela mostra algo por menos de um quadro: avisar quando for o caso.
  const frame = state.frameMs;
  const hz = Math.round(1000 / frame);
  const frameHint = $('#hint-frame');
  frameHint.hidden = exposure >= frame;
  frameHint.textContent =
    `Sua tela é de ~${hz} Hz: ela não consegue mostrar nada por menos de ${frame.toFixed(0)} ms. `
    + 'O resultado mostra o tempo que apareceu de verdade.';

  $$('[data-pace]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.pace === c.pace));
  });
  $('#hint-pace').textContent = c.pace === 'total'
    ? 'O tempo vale para a série inteira.'
    : `O tempo vale para cada item — ${formatExposure(exposure * c.count)} por série.`;

  // Intervalo antes de cada série.
  $$('[data-interval-mode]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.intervalMode === interval.mode));
  });
  $('#interval-fixed').hidden = interval.mode !== 'fixed';
  $('#interval-random').hidden = interval.mode === 'fixed';
  $('#in-interval').value = interval.ms;
  $('#in-interval-min').value = interval.minMs;
  $('#in-interval-max').value = interval.maxMs;
  $('#out-interval-min').textContent = formatExposure(interval.minMs);
  $('#out-interval-max').textContent = formatExposure(interval.maxMs);
  $('#out-interval').textContent = intervalLabel(interval);
  $('#sw-countdown').checked = interval.showCountdown;
  $('#sw-position').checked = !!state.settings.randomPosition;
  $('#hint-interval').textContent = interval.mode === 'random'
    ? 'A espera é sorteada dentro da faixa a cada série, para a exposição não ser previsível.'
    : interval.ms === 0
      ? 'A série aparece assim que você tocar em “Próxima série”.'
      : 'Espera entre tocar em “Próxima série” e a próxima exposição.';

  $('#field-order').hidden = mode !== 'words';
  const ordered = c.ordered !== false;
  $$('[data-order]').forEach((btn) => {
    btn.setAttribute('aria-checked', String((btn.dataset.order === '1') === ordered));
  });
  $('#hint-order').textContent = ordered
    ? 'Cada palavra precisa estar na posição certa.'
    : 'Vale acertar as palavras em qualquer ordem.';

  $('#field-group').hidden = mode !== 'digits';
  $$('[data-group]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(Number(btn.dataset.group) === (c.group || 0)));
  });

  const unit = MODE_UNITS[mode];
  const n = state.settings.series;
  $('#estimate').textContent =
    `${n} série${n > 1 ? 's' : ''} × ${c.count} ${unit} · ${formatExposure(exposure)} de exposição · `
    + `intervalo ${intervalLabel(interval)}`;

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
  $('#play-counter').textContent = s.kind === 'test'
    ? `${Math.min(s.index + 1, TEST.maxTrials)}/${TEST.maxTrials}`
    : `${Math.min(s.index + 1, s.rounds.length)}/${s.rounds.length}`;
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
    exposureMs: cfg().exposureMs,
    pace: cfg().pace,
    group: cfg().group || 0,
    series: state.settings.series,
    interval: { ...state.settings.interval },
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
  const wait = round.intervalMs ?? nextIntervalMs(s.config.interval);

  if (wait > 0) {
    showStage('ready');
    $('#ready-kicker').textContent = `Série ${s.index + 1} de ${s.rounds.length}`;
    const showCountdown = s.config.interval.showCountdown;
    $('#ready-hint').textContent = showCountdown ? 'Prepare-se…' : 'A qualquer momento…';
    $('#countdown').classList.toggle('countdown--blind', !showCountdown);

    const started = performance.now();
    let lastBeep = Infinity;
    while (true) {
      const left = wait - (performance.now() - started);
      if (left <= 0) break;
      const secondsLeft = Math.ceil(left / 1000);
      if (showCountdown) {
        $('#countdown').textContent = String(secondsLeft);
        if (secondsLeft !== lastBeep && secondsLeft <= 3) beep(520, 55, 0.04);
      } else {
        $('#countdown').textContent = '•';
      }
      lastBeep = secondsLeft;
      const slice = Math.min(left, left % 1000 || 1000);
      if (asOutcome(await sleep(slice)).outcome === 'abort' || token !== runToken) return;
    }
  }

  await memorize(token);
}

/**
 * Posiciona o estímulo em um ponto sorteado da área de exibição, sem deixar
 * nenhuma parte dele sair da tela.
 */
function scatterContent() {
  const area = $('#content');
  const item = area.firstElementChild;
  if (!item) return;
  const livreX = Math.max(0, area.clientWidth - item.offsetWidth);
  const livreY = Math.max(0, area.clientHeight - item.offsetHeight);
  item.style.left = `${Math.round(Math.random() * livreX)}px`;
  item.style.top = `${Math.round(Math.random() * livreY)}px`;
}

async function memorize(token) {
  const s = state.session;
  const round = currentRound(s);
  const { config } = s;
  const exposureMs = round.exposureMs ?? config.exposureMs;
  // No teste nunca há barra nem botão de pular: a medida precisa ser o tempo
  // que o app controlou, e a pessoa não pode encurtar a exposição.
  const withTimer = s.kind !== 'test' && exposureMs >= TIMER_MIN_MS;

  showStage('memorize');
  keepAwake(true);
  if (withTimer) beep(880, 60, 0.05);
  $('#btn-ready').hidden = config.pace === 'perItem' || !withTimer;
  $('#timer-wrap').hidden = !withTimer;

  // No teste a posição é sempre a mesma, para não virar mais uma variável.
  const scattered = state.settings.randomPosition && s.kind !== 'test';
  $('#content').classList.toggle('content--scattered', scattered);

  const parts = config.pace === 'perItem'
    ? round.content.items.map((_, i) => i)
    : [null];

  const measured = [];
  for (const itemIndex of parts) {
    $('#content').innerHTML = contentMarkup(s.mode, round.content, config, itemIndex);
    if (scattered) scatterContent();
    const result = asOutcome(withTimer ? await runTimer(exposureMs) : await flash(exposureMs));
    if (result.outcome === 'abort' || token !== runToken) return;
    measured.push(result.actual ?? exposureMs);
    if (result.outcome === 'skip') break;
  }

  round.actualExposureMs = measured.reduce((a, b) => a + b, 0) / measured.length;
  $('#content').classList.remove('content--scattered');
  $('#content').innerHTML = '';
  $('#content').style.visibility = 'visible';
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

  const count = currentRound(s)?.count ?? s.config.count;
  if (isDigits) {
    $('#digits-total').textContent = count;
    renderTyped();
  } else {
    const input = $('#text-input');
    input.value = '';
    input.placeholder = s.mode === 'words'
      ? 'Separe por espaço ou vírgula'
      : 'Escreva a frase completa';
    $('#words-total').textContent = count;
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
  const result = submitRound(s, text, {
    strictAccents: state.settings.strictAccents,
    ordered: answersMustBeOrdered(s.mode),
  });
  if (!result) return;

  buzz(result.perfect ? 30 : [40, 60, 40]);
  beep(result.perfect ? 880 : 200, result.perfect ? 90 : 160, 0.05);

  if (s.kind === 'test') recordTrial(s.staircase, result);

  renderPlayProgress();
  renderFeedback(result);
  showStage('feedback');
  $('#btn-next').textContent = testOrSessionDone(s) ? 'Ver resultado' : 'Próxima série';
}

/** Só palavras soltas podem ser respondidas fora de ordem. */
function answersMustBeOrdered(mode) {
  return mode !== 'words' || state.settings.perMode.words.ordered !== false;
}

function testOrSessionDone(s) {
  return s.kind === 'test' ? s.staircase.done : isLastRound(s);
}

function renderFeedback(result) {
  const s = state.session;
  const head = $('#feedback-headline');
  const livre = !answersMustBeOrdered(s.mode);
  head.textContent = result.perfect
    ? 'Perfeito!'
    : `${result.correct} de ${result.total} certos${livre ? ' (ordem livre)' : ''}`;
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
  if (s.kind === 'test') {
    if (s.staircase.done) { endTest(); return; }
    advance(s);
    applyStaircaseToRound();
    runRound();
    return;
  }
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
  const isTest = state.session.kind === 'test';
  const done = state.session.rounds.filter((r) => r.result).length;
  const ok = await confirmDialog(
    isTest ? 'Sair do teste?' : 'Sair do treino?',
    done
      ? `As ${done} séries já respondidas não serão salvas.`
      : `${isTest ? 'O teste' : 'A sessão'} será descartado.`,
    'Sair',
  );
  if (!ok) return;
  abortRun();
  keepAwake(false);
  state.session = null;
  $('#play').hidden = true;
  $('#tabbar').hidden = false;
  showView(isTest ? 'test' : 'train');
}

/* ========================== teste adaptativo ============================ */

function renderTestIntro() {
  $$('[data-test-mode]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.testMode === state.testMode));
  });

  const frame = state.frameMs;
  $('#test-floor-hint').textContent =
    `Sua tela é de ~${Math.round(1000 / frame)} Hz: o tempo mais curto que ela mostra é ${frame.toFixed(0)} ms. `
    + 'Daí em diante o teste sobe a quantidade de itens.';

  const card = $('#test-last-card');
  card.hidden = !state.tests.length;
  if (!state.tests.length) return;

  const levels = testLevels(state.tests);
  $('#test-levels').innerHTML = [
    levelCard('Dígitos', levels.digits && asLevelEntry(levels.digits), 'faça o teste com dígitos'),
    levelCard('Palavras', levels.words && asLevelEntry(levels.words), 'faça o teste com palavras'),
    `<div class="level-card level-card--average">
        <span class="level-card__kind">Média dos dois tipos</span>
        <span class="level-card__value">${esc(formatLevel(levels.average))}<small> / 7</small></span>
        <span class="level-card__note">${levels.average === null
          ? 'aparece quando você tiver feito os dois testes'
          : `média entre dígitos (${levels.digits.level}) e palavras (${levels.words.level})`}</span>
      </div>`,
  ].join('');

  $('#test-average-hint').textContent = levels.average === null
    ? 'Faça os dois testes para ver a sua média.'
    : 'Dígitos e palavras têm escalas próprias; a média junta os dois níveis.';

  const mine = state.tests.filter((t) => t.mode === state.testMode);
  const best = bestTest(state.tests, state.testMode);
  $('#test-history').innerHTML = mine.length ? mine.slice().reverse().slice(0, 10).map((t) => `
      <article class="history-item">
        <div class="history-item__main">
          <div class="history-item__title">Nível ${t.level} · ${esc(t.band.name)}</div>
          <div class="history-item__meta">${fmtDateTime(t.finishedAt)} · ${esc(formatExposure(t.basisMs))} ${esc(unitOf(t))} · até ${t.span} ${t.mode === 'digits' ? 'dígitos' : 'palavras'}${t.id === best.id ? ' · melhor' : ''}</div>
        </div>
        <div class="history-item__score">${t.level}</div>
      </article>`).join('') : `<p class="empty">Nenhum teste de ${esc(MODE_LABELS[state.testMode].toLowerCase())} ainda.</p>`;
}

/** Um resultado de teste no formato dos cartões de nível. */
function asLevelEntry(result) {
  return {
    level: result.level,
    levels: result.levels ?? 7,
    band: result.band,
    basisMs: result.basisMs,
    scale: BAND_SCALES[result.scaleId] || scaleForMode(result.mode),
  };
}

function levelMarkup(result) {
  const itens = result.mode === 'digits' ? 'dígitos' : 'palavras';
  return `<span class="level__value">${result.level}</span>
    <span class="level__name">${esc(result.band.name)}</span>
    <span class="level__note">nível ${result.level} de ${result.levels} · ${esc(formatExposure(result.basisMs))} ${esc(unitOf(result))} · até ${result.span} ${itens} de uma vez</span>`;
}

/** Unidade da régua de um resultado de teste. */
function unitOf(result) {
  return (BAND_SCALES[result.scaleId] || scaleForMode(result.mode)).unitShort;
}

function startTest() {
  const mode = state.testMode;
  const count = TEST.itemCount[mode];
  const staircase = createStaircase({ mode, floorMs: state.frameMs });

  state.session = createSession({
    mode,
    count,
    exposureMs: currentExposure(staircase),
    pace: 'total',
    group: 0,
    series: TEST.maxTrials,
    interval: { mode: 'random', minMs: TEST.intervalMinMs, maxMs: TEST.intervalMaxMs, showCountdown: false },
  });
  state.session.kind = 'test';
  state.session.staircase = staircase;
  applyStaircaseToRound();

  $('#play').hidden = false;
  $('#tabbar').hidden = true;
  runRound();
}

/** A escada decide o tempo desta série e a espera até ela. */
function applyStaircaseToRound() {
  const s = state.session;
  const round = currentRound(s);
  if (!round) return;
  const count = currentCount(s.staircase);
  // A quantidade também se adapta, então o conteúdo da série é gerado agora.
  if (round.content.answer.length !== count) {
    round.content = generateContent(s.mode, count);
  }
  round.count = count;
  round.exposureMs = currentExposure(s.staircase);
  round.intervalMs = nextInterval();
}

function endTest() {
  const result = finishTest(state.session.staircase);
  result.ordered = answersMustBeOrdered(state.session.mode);
  state.tests = addTest(result);
  // O registro salvo ganhou um id: usar ele evita o teste se comparar consigo
  // mesmo ao procurar o melhor resultado anterior.
  state.testResult = state.tests[state.tests.length - 1];
  state.session = null;
  abortRun();
  keepAwake(false);
  $('#play').hidden = true;
  $('#tabbar').hidden = false;
  renderTestResult(state.testResult);
  showView('test-result');
}

function renderTestResult(result) {
  const scale = BAND_SCALES[result.scaleId] || scaleForMode(result.mode);
  const itensPlural = result.mode === 'digits' ? 'dígitos' : 'palavras';

  $('#test-result-level').innerHTML = levelMarkup(result);
  $('#test-result-level').classList.add('level--big');
  const notes = {
    convergiu: `O teste encontrou o seu limite depois de ${result.reversals} idas e vindas.`,
    invicto: `Você não errou nenhuma série: a dificuldade subiu até o fim. Dá para ir além de ${result.span} ${itensPlural}.`,
    piso: `Você chegou ao limite da tela e ao máximo de ${result.finalCount} ${itensPlural} do teste.`,
    teto: 'Nenhuma série saiu inteira, nem no tempo mais longo. Treine um pouco em tempos maiores e volte.',
    parcial: 'As 30 séries acabaram antes de fechar a conta. Refaça o teste para um número mais firme.',
  };
  $('#test-result-note').textContent = notes[result.quality];

  const previous = state.tests.filter((t) => t.mode === result.mode && t.id !== result.id);
  const best = previous.length ? Math.min(...previous.map((t) => t.basisMs)) : null;
  $('#test-result-tiles').innerHTML = [
    tile(formatExposure(result.basisMs), scale.unitShort),
    tile(`${result.span} ${itensPlural}`, 'quantidade alcançada'),
    tile(String(result.trials), 'séries'),
    tile(best === null ? 'primeiro' : formatExposure(best), best === null ? 'teste' : 'melhor anterior'),
  ].join('');

  $('#test-curve').innerHTML = result.curve.map((point) => {
    const p = Math.round(point.accuracy * 100);
    const cls = p >= 80 ? ' is-high' : p <= 40 ? ' is-low' : '';
    return `<div class="curve__row">
        <span class="curve__ms">${point.count}× ${esc(formatExposure(point.exposureMs))}</span>
        <span class="curve__bar"><span class="curve__fill${cls}" style="width:${p}%"></span></span>
        <span class="curve__value">${p}% · ${point.trials}×</span>
      </div>`;
  }).join('');

  $('#test-band-table').innerHTML = scale.bands.map((band) => {
    const current = band.id === result.band.id;
    return `<div class="band-row${current ? ' is-current' : ''}">
        <div class="band-row__range">${esc(band.range)}</div>
        <div>
          <div class="band-row__name">Nível ${levelOf(scale, band)} · ${esc(band.name)}</div>
          <div class="band-row__text">${esc(band.text)}</div>
          ${current ? `<span class="band-row__badge">seu resultado — ${esc(formatExposure(result.basisMs))} ${esc(scale.unitShort)}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

/* ============================== resultado =============================== */

function renderResults(record) {
  const { totals, config, mode } = record;
  const accuracy = Math.round(totals.accuracy * 100);

  $('#result-ring').style.setProperty('--p', accuracy);
  $('#result-accuracy').textContent = `${accuracy}%`;
  const exposure = exposureOf(config);
  $('#result-title').textContent =
    `${MODE_LABELS[mode]} · ${config.count} ${MODE_UNITS[mode]} · ${formatExposure(exposure)}`;

  const previous = state.history
    .filter((s) => s.mode === mode && s.id !== record.id && s.config.count === config.count);
  const bestBefore = previous.length ? Math.max(...previous.map((s) => s.totals.accuracy)) : null;

  let sub;
  if (bestBefore === null) sub = 'Primeira sessão com essa configuração — é a sua nova referência.';
  else if (totals.accuracy > bestBefore) sub = `Novo recorde! Antes: ${pct(bestBefore)}.`;
  else if (totals.accuracy === bestBefore) sub = `Empatou com o seu melhor: ${pct(bestBefore)}.`;
  else sub = `Seu melhor nessa configuração é ${pct(bestBefore)}.`;
  $('#result-sub').textContent = sub;

  const tiles = [
    tile(`${totals.correct}/${totals.total}`, 'itens certos'),
    tile(`${totals.perfectSeries}/${record.series.length}`, 'séries perfeitas'),
    tile(String(totals.bestStreak), 'melhor sequência'),
    tile(fmtDuration(record.durationMs), 'duração'),
  ];
  // Em exposições curtas, o tempo real na tela é limitado pelo aparelho:
  // mostrar o que de fato apareceu, não só o que foi pedido.
  if (exposure < TIMER_MIN_MS && typeof totals.actualExposureMs === 'number') {
    tiles.splice(3, 0, tile(`${Math.round(totals.actualExposureMs)} ms`, 'exposição real'));
  }
  $('#result-tiles').innerHTML = tiles.join('');

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

  renderLevels();

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

/** Cartão de nível de um tipo de estímulo. */
function levelCard(kind, entry, note) {
  if (!entry) {
    return `<div class="level-card level-card--empty">
        <span class="level-card__kind">${esc(kind)}</span>
        <span class="level-card__value">—</span>
        <span class="level-card__name">Sem nível ainda</span>
        <span class="level-card__note">${esc(note)}</span>
      </div>`;
  }
  return `<div class="level-card">
      <span class="level-card__kind">${esc(kind)}</span>
      <span class="level-card__value">${entry.level}<small> / ${entry.levels}</small></span>
      <span class="level-card__name">${esc(entry.band.name)}</span>
      <span class="level-card__note">${esc(formatExposure(entry.basisMs))} ${esc(entry.scale.unitShort)}</span>
    </div>`;
}

/** Níveis por tipo de estímulo, mais a média das duas famílias. */
function renderLevels() {
  const levels = levelsByMode(state.history);

  const cards = [
    levelCard('Dígitos', levels.digits, 'acerte uma série inteira de dígitos'),
    levelCard('Palavras', levels.words, 'acerte uma série inteira de palavras'),
  ];
  if (levels.sentence) cards.push(levelCard('Frases', levels.sentence, ''));

  cards.push(`<div class="level-card level-card--average">
      <span class="level-card__kind">Média dos dois tipos</span>
      <span class="level-card__value">${esc(formatLevel(levels.average))}<small> / 7</small></span>
      <span class="level-card__note">${levels.average === null
        ? 'aparece quando houver nível nos dois tipos, dígitos e palavras'
        : `média entre dígitos (${levels.digits.level}) e palavras (${levels.words.level})${levels.sentence ? ' — frases ficam de fora, por serem outra tarefa' : ''}`}</span>
    </div>`);

  $('#levels-by-mode').innerHTML = cards.join('');

  const scale = BAND_SCALES[state.scaleView];
  $$('[data-scale]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.scale === state.scaleView));
  });
  $('#scale-hint').textContent = scale.perItem
    ? 'Medida por palavra: o tempo total dividido pela quantidade de palavras da série.'
    : 'Medida pelo tempo total de exibição da sequência.';

  renderBandTable(scale, state.scaleView === 'digits' ? levels.digits : levels.words);
}

/** Tabela de faixas de uma régua, com a faixa alcançada em destaque. */
function renderBandTable(scale, entry) {
  $('#band-table').innerHTML = scale.bands.map((band) => {
    const current = entry && entry.band.id === band.id;
    const badge = current
      ? `<span class="band-row__badge">seu nível — ${esc(formatExposure(entry.basisMs))} ${esc(scale.unitShort)}</span>`
      : '';
    return `<div class="band-row${current ? ' is-current' : ''}">
        <div class="band-row__range">${esc(band.range)}</div>
        <div>
          <div class="band-row__name">Nível ${levelOf(scale, band)} · ${esc(band.name)}</div>
          <div class="band-row__text">${esc(band.text)}</div>
          ${badge}
        </div>
      </div>`;
  }).join('');
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
    `${fmtDateTime(s.finishedAt)} · ${MODE_LABELS[s.mode]} · ${s.config.count} × ${formatExposure(exposureOf(s.config))} · ${pct(s.totals.accuracy)}`;
}

function historyItem(s) {
  const acc = Math.round(s.totals.accuracy * 100);
  return `<article class="history-item">
      <div class="history-item__main">
        <div class="history-item__title">${MODE_LABELS[s.mode]} · ${s.config.count} ${esc(MODE_UNITS[s.mode])}</div>
        <div class="history-item__meta">${fmtDateTime(s.finishedAt)} · ${formatExposure(exposureOf(s.config))}${s.config.pace === 'perItem' ? '/item' : ''} · ${s.series.length} séries · ${s.totals.perfectSeries} perfeitas</div>
      </div>
      <div class="history-item__score${acc >= 90 ? ' is-high' : ''}">${acc}%</div>
    </article>`;
}

function exportData() {
  const payload = {
    app: 'piscamemory',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: state.history,
    tests: state.tests,
    tryhard: tryHardStore.exportAll(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `piscamemory-${new Date().toISOString().slice(0, 10)}.json`;
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
    if (data.tryhard) tryHardStore.importAll(data.tryhard);
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
    } else if (key === 'exposureIndex') {
      cfg().exposureMs = EXPOSURE_STEPS[clamp(value, 0, EXPOSURE_STEPS.length - 1)];
    } else if (key === 'interval') {
      state.settings.interval.ms = clamp(value, 0, INTERVAL_MAX_MS);
    }
    persist();
    renderTrain();
  };

  $('#in-count').addEventListener('input', (e) => setValue('count', Number(e.target.value)));
  $('#in-series').addEventListener('input', (e) => setValue('series', Number(e.target.value)));
  $('#in-exposure').addEventListener('input', (e) => setValue('exposureIndex', Number(e.target.value)));
  $('#in-interval').addEventListener('input', (e) => setValue('interval', Number(e.target.value)));

  $('#in-interval-min').addEventListener('input', (e) => {
    const interval = state.settings.interval;
    interval.minMs = clamp(Number(e.target.value), 0, INTERVAL_MAX_MS);
    if (interval.maxMs < interval.minMs) interval.maxMs = interval.minMs;
    persist();
    renderTrain();
  });
  $('#in-interval-max').addEventListener('input', (e) => {
    const interval = state.settings.interval;
    interval.maxMs = clamp(Number(e.target.value), 0, INTERVAL_MAX_MS);
    if (interval.minMs > interval.maxMs) interval.minMs = interval.maxMs;
    persist();
    renderTrain();
  });

  $$('[data-interval-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.interval.mode = btn.dataset.intervalMode;
      persist();
      renderTrain();
    });
  });

  $$('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.step;
      const delta = Number(btn.dataset.delta);
      if (key === 'exposure') {
        setValue('exposureIndex', stepIndexFor(cfg().exposureMs) + delta);
      } else if (key === 'interval') {
        setValue('interval', state.settings.interval.ms + delta * 500);
      } else {
        const current = key === 'series' ? state.settings.series : cfg()[key];
        setValue(key, current + delta);
      }
    });
  });

  $('#sw-position').addEventListener('change', (e) => {
    state.settings.randomPosition = e.target.checked;
    persist();
  });

  $('#sw-countdown').addEventListener('change', (e) => {
    state.settings.interval.showCountdown = e.target.checked;
    persist();
    renderTrain();
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

  $$('[data-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.perMode.words.ordered = btn.dataset.order === '1';
      persist();
      renderTrain();
    });
  });

  $$('[data-test-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.testMode = btn.dataset.testMode;
      renderTestIntro();
    });
  });

  $('#btn-test-start').addEventListener('click', startTest);
  $('#btn-test-again').addEventListener('click', startTest);
  $('#btn-test-to-train').addEventListener('click', () => {
    const result = state.testResult;
    if (!result) { showView('train'); return; }
    state.settings.mode = result.mode;
    // Reproduz no treino a dificuldade que o teste encontrou.
    const count = Math.max(result.span || TEST.itemCount[result.mode], TEST.minCount[result.mode]);
    const exposure = (result.basisMs * count) / result.refCount;
    cfg().exposureMs = EXPOSURE_STEPS[stepIndexFor(exposure)];
    cfg().count = count;
    persist();
    showView('train');
    renderTrain();
    toast(`Treino ajustado para ${formatExposure(cfg().exposureMs)}.`);
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
    const index = stepIndexFor(cfg().exposureMs);
    // Alterna entre um item a mais e um passo de exposição a menos.
    if (state.record?.totals.perfectSeries === state.record?.series.length && index > 0) {
      cfg().exposureMs = EXPOSURE_STEPS[index - 1];
      toast(`Exposição: ${formatExposure(cfg().exposureMs)}.`);
    } else {
      cfg().count = clamp(cfg().count + 1, l.min, l.max);
      toast(`Dificuldade: ${cfg().count} ${MODE_UNITS[state.settings.mode]}.`);
    }
    persist();
    showView('train');
    renderTrain();
  });
  $('#btn-to-history').addEventListener('click', () => showView('history'));

  $$('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      state.chartIndex = -1;
      if (chip.dataset.filter !== 'all') {
        state.scaleView = scaleForMode(chip.dataset.filter).id;
      }
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

  $$('[data-scale]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.scaleView = btn.dataset.scale;
      renderLevels();
    });
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
    state.tests = [];
    state.chartIndex = -1;
    renderHistory();
    renderTrain();
    toast('Histórico e testes apagados.');
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
  } else if (state.typed.length < (currentRound(s)?.count ?? s.config.count) + 10) {
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
  measureFrame();

  initTryHard({
    toast,
    confirm: confirmDialog,
    setChromeHidden: (hidden) => { $('#tabbar').hidden = hidden; },
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline é opcional */ });
    });
  }
}

init();
