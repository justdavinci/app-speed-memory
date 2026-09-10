// MEMORY LAB — interface v2.
// Mantém a aba experimental isolada do runner clássico/Try Hard.

import { esc, pct } from '../util.js';
import { MEMORY_LAB_CONFIG, MEMORY_LAB_MODES } from './config.js';
import { datasetStats, LITERATURE_SEED_META } from './dataset.js';
import { allCorpusStimuli, clearImportedCorpus, getImportedPack, importCorpusPack } from './corpus.js';
import {
  adaptAfterTrial, buildRecord, createMemoryTrial, freshCounts, markTrialExposure,
  materializeProbe, scheduleDeferredFromTrial,
} from './engine.js';
import { pipelineProfile, formatDelay } from './metrics.js';
import { scoreQuestion, scoreResponses } from './questions.js';
import * as store from './store.js';
import { measureFrameMs, presentStimulus, waitMs, getRefreshHz, getFrameMs } from '../tryhard/timing.js';

let root = null;
let overlay = null;
let toast = () => {};
let activeTab = 'train';
let sessionControl = null;

const $ = (sel, base = document) => base.querySelector(sel);

function makeControl() {
  const listeners = new Set();
  const control = {
    aborted: false,
    signal: null,
    abort() {
      if (this.aborted) return;
      this.aborted = true;
      [...listeners].forEach((fn) => fn());
      listeners.clear();
    },
    onAbort(fn) {
      if (this.aborted) { fn(); return () => {}; }
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  // Referência estável: waitMs/presentStimulus leem o estado atual, não um
  // snapshot criado antes de o usuário tocar em "encerrar".
  control.signal = { get aborted() { return control.aborted; } };
  return control;
}

function modeCards() {
  return Object.values(MEMORY_LAB_MODES).map((m) => {
    const skill = store.getSkill(m.id);
    return `<article class="ml-mode-card">
      <div class="ml-mode-card__icon">${esc(m.icon)}</div>
      <div class="ml-mode-card__body"><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p>
      <small>${m.benchmark ? 'benchmark · sem adaptação' : `${formatDelay(skill.exposureMs)} exposição · ${formatDelay(skill.retentionMs)} retenção`}</small></div>
      <button class="btn btn--primary" data-ml-start="${esc(m.id)}">Iniciar</button>
    </article>`;
  }).join('');
}

function manualTimingMarkup(s) {
  return `<div class="ml-manual-grid">
    <label class="field"><span class="field__label">Exposição</span><select class="ml-select" data-ml-setting="exposureMs">${MEMORY_LAB_CONFIG.exposureLadderMs.map((v) => `<option value="${v}"${v === s.exposureMs ? ' selected' : ''}>${formatDelay(v)}</option>`).join('')}</select></label>
    <label class="field"><span class="field__label">Retenção antes da pergunta</span><select class="ml-select" data-ml-setting="retentionMs">${MEMORY_LAB_CONFIG.retentionLadderMs.map((v) => `<option value="${v}"${v === s.retentionMs ? ' selected' : ''}>${formatDelay(v)}</option>`).join('')}</select></label>
  </div>`;
}

function renderTrainPanel() {
  const s = store.getSettings();
  const due = store.getDueProbes().length;
  const pending = store.getPendingProbes().length;
  const fresh = freshCounts();
  return `<div class="ml-stack">
    <div class="ml-hero">
      <p class="ml-kicker">MEMORY LAB · ONE EXPOSURE</p>
      <h2>Uma vez. Tente fazer ficar.</h2>
      <p>Treine para reduzir a perda em cada transição: capturar, ligar, estabilizar, manter, resistir e recuperar — até que a habilidade sobreviva fora do formato treinado.</p>
      <div class="ml-hero__pipeline"><span>CAPTURE</span><i>→</i><span>BIND</span><i>→</i><span>RETAIN</span><i>→</i><span>RESIST</span><i>→</i><span>RETRIEVE</span><i>→</i><span>TRANSFER</span></div>
      <button class="btn btn--primary btn--lg" data-ml-start="one-shot">Começar One Shot</button>
    </div>
    ${due ? `<div class="card ml-due-card"><div><p class="ml-kicker">SEM REEXPOSIÇÃO</p><h2 class="card__title">${due} recuperação${due === 1 ? '' : 'ões'} vencida${due === 1 ? '' : 's'}</h2><p class="prose">Responda sobre material visto antes sem tornar a vê-lo.</p></div><button class="btn btn--primary" data-ml-probes>Responder agora</button></div>` : pending ? `<div class="card card--soft"><strong>${pending} probe${pending === 1 ? '' : 's'} agendado${pending === 1 ? '' : 's'}</strong><p class="field__hint">A página não será mostrada novamente.</p></div>` : ''}
    <div class="ml-stats-row"><div class="ml-mini"><strong>${fresh.train}</strong><span>train virgens</span></div><div class="ml-mini"><strong>${fresh.novel}</strong><span>novel intactos</span></div><div class="ml-mini"><strong>${fresh.holdout}</strong><span>holdouts intactos</span></div></div>
    <div class="card"><h2 class="card__title">Pressão do protocolo</h2>
      <label class="switch"><span><strong>Adaptação automática</strong><small>Precisão primeiro; depois uma variável temporal por vez.</small></span><input type="checkbox" data-ml-setting="adaptive"${s.adaptive ? ' checked' : ''}/><span class="switch__track"></span></label>
      <div class="field"><div class="field__head"><span class="field__label">Unidades por sessão</span><output class="field__value" id="ml-out-trials">${s.trialsPerSession}</output></div><input class="stepper__range" type="range" min="1" max="${MEMORY_LAB_CONFIG.maxTrialsPerSession}" step="1" value="${s.trialsPerSession}" data-ml-setting="trialsPerSession" /></div>
      <label class="switch"><span><strong>Variar layout</strong><small>O mecanismo precisa sobreviver a aparências diferentes.</small></span><input type="checkbox" data-ml-setting="layoutVariation"${s.layoutVariation ? ' checked' : ''}/><span class="switch__track"></span></label>
      ${s.adaptive ? `<p class="chart__caption">Zona-alvo ${Math.round(MEMORY_LAB_CONFIG.trainingZone[0] * 100)}–${Math.round(MEMORY_LAB_CONFIG.trainingZone[1] * 100)}%. Exposição e retenção não mudam juntas.</p>` : manualTimingMarkup(s)}
    </div>
    <div class="card card--soft"><h2 class="card__title">A aposta alta</h2><p class="prose">O alvo operacional é aproximar-se de <strong>ver uma única vez e continuar conseguindo consultar a representação depois</strong>. O Lab mede a aproximação; não promete ausência literal de esquecimento.</p></div>
  </div>`;
}

function retentionCurveMarkup(retention) {
  if (!retention?.bins?.length) return '';
  return `<div class="card"><h2 class="card__title">Curva de retenção</h2><div class="ml-retention-curve">${retention.bins.map((b) => `<div class="ml-retention-row"><span>${formatDelay(b.delayMs)}</span><i><b style="--w:${Math.round(b.accuracy * 100)}%"></b></i><strong>${Math.round(b.accuracy * 100)}%</strong><small>n=${b.n}</small></div>`).join('')}</div><p class="chart__caption">Retenção em branco + probes tardios sem reexposição. Tentativas com interferência ficam fora desta curva.</p></div>`;
}

function renderProfilePanel() {
  const p = pipelineProfile(store.getTrials(), store.getCompletedProbes());
  const cells = p.components.map((c) => `<div class="ml-score${c.points === null ? ' is-empty' : ''}"><div class="ml-score__head"><span>${esc(c.short)}</span><strong>${c.points === null ? '—' : c.points}</strong></div><div class="ml-score__bar"><i style="--score:${c.points ?? 0}%"></i></div><p>${esc(c.raw)}</p><small>confiança: ${esc(c.confidence)}</small></div>`).join('');
  return `<div class="ml-stack"><div class="card"><p class="ml-kicker">PIPELINE PROFILE</p><h2 class="card__title">7 pontos funcionais</h2><p class="prose">A escala 0–100 é interna ao protocolo. Só primeira exposição ou benchmark reservado pode alimentar o perfil; repetição treina, mas não infla a nota.</p><div class="ml-score-grid">${cells}</div>${p.bottleneck ? `<div class="ml-bottleneck"><strong>Gargalo aparente: ${esc(p.bottleneck.name)}</strong><span>${esc(p.bottleneck.raw)}. Isso descreve o protocolo, não um limite biológico.</span></div>` : '<p class="field__hint">Ainda faltam dados elegíveis para localizar um gargalo.</p>'}</div>${retentionCurveMarkup(p.components.find((c) => c.id === 'retention'))}</div>`;
}

function renderCorpusPanel() {
  const seed = datasetStats();
  const imported = getImportedPack();
  const all = allCorpusStimuli();
  const fresh = freshCounts();
  return `<div class="ml-stack">
    <div class="card"><p class="ml-kicker">CORPUS REAL V1</p><h2 class="card__title">${esc(LITERATURE_SEED_META.label)}</h2><div class="tiles"><div class="tile"><div class="tile__value">${seed.total}</div><div class="tile__label">seed</div></div><div class="tile"><div class="tile__value">${all.length}</div><div class="tile__label">total local</div></div><div class="tile"><div class="tile__value">${fresh.train}</div><div class="tile__label">train virgens</div></div><div class="tile"><div class="tile__value">${fresh.holdout}</div><div class="tile__label">holdout virgens</div></div></div><p class="prose">Os PDFs e a diagramação editorial não foram enviados ao repositório. O seed usa conteúdo das obras em domínio público e layouts próprios do app.</p><p class="chart__caption">${esc(LITERATURE_SEED_META.note)}</p></div>
    <div class="card"><h2 class="card__title">Corpus privado no aparelho</h2>${imported ? `<p class="prose"><strong>${esc(imported.label)}</strong> · ${imported.stimuli.length} unidades. Fica apenas neste armazenamento local.</p><button class="btn btn--danger-ghost" data-ml-clear-corpus>Remover corpus privado</button>` : '<p class="prose">Você pode importar um pack JSON preparado a partir de livros, artigos e documentos reais sem colocá-los no GitHub público.</p>'}<input id="ml-corpus-file" type="file" accept="application/json,.json" hidden /><button class="btn btn--ghost" data-ml-import-corpus>${imported ? 'Substituir pack JSON' : 'Importar pack JSON'}</button><p class="field__hint">Para grandes bibliotecas, a próxima etapa será IndexedDB; esta v1 usa armazenamento local simples.</p></div>
    <div class="card"><h2 class="card__title">Integridade experimental</h2><ul class="facts"><li><strong>One Shot:</strong> uma unidade exibida nunca volta a ser virgem.</li><li><strong>Splits:</strong> derivações herdam train/novel/holdout.</li><li><strong>Holdout:</strong> só entra em Life Transfer.</li><li><strong>Familiaridade prévia:</strong> Machado não é true-novel se o usuário já conhece a obra.</li></ul></div>
  </div>`;
}

function renderDuePanel() {
  const due = store.getDueProbes();
  const pending = store.getPendingProbes();
  const completed = store.getCompletedProbes().slice(-8).reverse();
  return `<div class="ml-stack"><div class="card"><p class="ml-kicker">DELAYED RETRIEVAL</p><h2 class="card__title">Sem olhar de novo</h2><p class="prose">A pergunta usa informação da exposição original; a página não reaparece.</p><div class="tiles"><div class="tile"><div class="tile__value">${due.length}</div><div class="tile__label">vencidos</div></div><div class="tile"><div class="tile__value">${pending.length}</div><div class="tile__label">pendentes</div></div></div><button class="btn btn--primary" data-ml-probes${due.length ? '' : ' disabled'}>Responder vencidos</button></div>${completed.length ? `<div class="card"><h2 class="card__title">Últimos probes</h2><div class="history-list">${completed.map((p) => `<div class="history-item"><div><strong>${esc(p.source || 'material')}</strong><small>${formatDelay(p.actualAgeMs ?? p.delayMs)} sem reexposição</small></div><span>${p.correct ? '✓' : '×'}</span></div>`).join('')}</div></div>` : ''}</div>`;
}

function renderModulesPanel() {
  return `<div class="ml-stack"><div class="card card--soft"><strong>One Shot é o núcleo.</strong><p class="prose">Os drills existem para atacar uma transição; depois da primeira medida fresca, preferem material já visto para preservar o estoque virgem.</p></div><div class="ml-mode-grid">${modeCards()}</div></div>`;
}

function tabsMarkup() {
  const tabs = [['train', 'Treino'], ['modules', 'Módulos'], ['due', 'Depois'], ['profile', 'Perfil'], ['corpus', 'Corpus']];
  return `<div class="chips chips--tabs ml-tabs" role="tablist">${tabs.map(([id, label]) => `<button class="chip${activeTab === id ? ' is-active' : ''}" data-ml-tab="${id}" role="tab" aria-selected="${activeTab === id}">${label}</button>`).join('')}</div>`;
}

export function renderMemoryLab() {
  if (!root) return;
  const panel = activeTab === 'modules' ? renderModulesPanel() : activeTab === 'due' ? renderDuePanel() : activeTab === 'profile' ? renderProfilePanel() : activeTab === 'corpus' ? renderCorpusPanel() : renderTrainPanel();
  root.innerHTML = `<div class="ml-shell">${tabsMarkup()}<div class="ml-panel">${panel}</div></div>`;
}

export function initMemoryLab({ rootElement, toast: toastFn } = {}) {
  root = rootElement || $('#memory-lab-root');
  if (!root) return;
  toast = toastFn || (() => {});
  ensureOverlay();
  root.addEventListener('click', onRootClick);
  root.addEventListener('change', onRootChange);
  root.addEventListener('input', onRootInput);
  measureFrameMs().catch(() => {});
  renderMemoryLab();
}

export function onEnterMemoryLab() { renderMemoryLab(); }

function onRootClick(e) {
  const tab = e.target.closest('[data-ml-tab]');
  if (tab) { activeTab = tab.dataset.mlTab; renderMemoryLab(); return; }
  const start = e.target.closest('[data-ml-start]');
  if (start) { runMemorySession(start.dataset.mlStart); return; }
  if (e.target.closest('[data-ml-probes]')) { runDueProbes(); return; }
  if (e.target.closest('[data-ml-import-corpus]')) { $('#ml-corpus-file', root)?.click(); return; }
  if (e.target.closest('[data-ml-clear-corpus]')) {
    if (window.confirm('Remover o corpus privado deste aparelho? O histórico de exposições será preservado.')) {
      clearImportedCorpus(); toast('Corpus privado removido.'); renderMemoryLab();
    }
  }
}

function onRootInput(e) {
  if (e.target.dataset.mlSetting === 'trialsPerSession') $('#ml-out-trials', root).textContent = e.target.value;
}

async function onRootChange(e) {
  if (e.target.id === 'ml-corpus-file') {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const pack = importCorpusPack(await file.text());
      toast(`${pack.stimuli.length} unidades importadas localmente.`);
    } catch (err) { toast(`Corpus inválido: ${err.message}`); }
    renderMemoryLab();
    return;
  }
  const key = e.target.dataset.mlSetting;
  if (!key) return;
  let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (['trialsPerSession', 'exposureMs', 'retentionMs'].includes(key)) value = Number(value);
  store.updateSettings({ [key]: value });
  renderMemoryLab();
}

function ensureOverlay() {
  overlay = $('#ml-play');
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'ml-play'; overlay.className = 'ml-play'; overlay.hidden = true;
  overlay.innerHTML = '<div class="ml-play__bar"><button class="icon-btn" data-ml-quit aria-label="Encerrar">✕</button><div class="ml-play__progress"><i></i></div><span class="ml-play__counter"></span></div><div class="ml-stage" id="ml-stage"></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target.closest('[data-ml-quit]')) abortSession(); });
}

function abortSession() {
  sessionControl?.abort();
  overlay.hidden = true;
  document.body.classList.remove('ml-immersive');
  renderMemoryLab();
}

function setStage(html, phase = '') {
  const stage = $('#ml-stage', overlay); stage.dataset.phase = phase; stage.innerHTML = html;
}

async function countdown(label) {
  for (const n of [3, 2, 1]) {
    if (sessionControl.aborted) return false;
    setStage(`<div class="ml-countdown"><span>${n}</span><small>${esc(label)}</small></div>`, 'countdown');
    // eslint-disable-next-line no-await-in-loop
    await waitMs(550, sessionControl.signal);
  }
  return !sessionControl.aborted;
}

function pageMarkup(stimulus, layout = 'book', label = '') {
  return `<article class="ml-page ml-page--${esc(layout)}">${label ? `<div class="ml-page__label">${esc(label)}</div>` : ''}<header><small>${esc(stimulus.chapter || stimulus.source)}</small><h2>${esc(stimulus.title)}</h2></header><div class="ml-page__body">${stimulus.blocks.map((b) => `<p>${esc(b)}</p>`).join('')}</div></article>`;
}

function factSheetMarkup(stimulus, rows = null, label = '') {
  const data = rows || stimulus.facts.slice(0, 3).map((f) => ({ prompt: f.prompt, answer: f.answer }));
  return `<article class="ml-page ml-page--facts">${label ? `<div class="ml-page__label">${esc(label)}</div>` : ''}<header><small>${esc(stimulus.source)}</small><h2>Ficha de relações</h2></header><dl>${data.map((r) => `<div><dt>${esc(r.prompt)}</dt><dd>${esc(r.answer)}</dd></div>`).join('')}</dl></article>`;
}

function targetMarkup(trial, label = '') { return trial.renderKind === 'fact-sheet' ? factSheetMarkup(trial.target, null, label) : pageMarkup(trial.target, trial.layout, label); }

async function timedMarkup(html, ms) {
  const stage = $('#ml-stage', overlay); stage.dataset.phase = 'stimulus'; stage.innerHTML = `<div class="ml-flash-layer" style="visibility:hidden">${html}</div>`;
  const layer = $('.ml-flash-layer', stage); void layer.offsetHeight;
  return presentStimulus({ show: () => { layer.style.visibility = 'visible'; }, hide: () => { layer.style.visibility = 'hidden'; }, requestedMs: ms, signal: sessionControl.signal });
}

async function presentTrial(trial) {
  const timing = await timedMarkup(targetMarkup(trial, trial.mode === 'separation' ? 'Ficha A' : ''), trial.exposureMs);
  if (timing.actualMs > 0 && sessionControl.aborted) { markTrialExposure(trial, timing, null); return { aborted: true }; }
  let secondaryTiming = null;
  if (trial.mode === 'separation' && trial.secondary) {
    await waitMs(300, sessionControl.signal);
    if (sessionControl.aborted) { markTrialExposure(trial, timing, null); return { aborted: true }; }
    secondaryTiming = await timedMarkup(factSheetMarkup(trial.target, trial.secondary.rows, 'Ficha B'), trial.exposureMs);
  } else if (trial.interference) {
    await waitMs(250, sessionControl.signal);
    if (sessionControl.aborted) { markTrialExposure(trial, timing, null); return { aborted: true }; }
    secondaryTiming = await timedMarkup(pageMarkup(trial.interference, 'compact', 'INTERFERÊNCIA'), Math.max(650, Math.min(1600, trial.exposureMs)));
  }
  markTrialExposure(trial, timing, secondaryTiming);
  if (sessionControl.aborted) return { aborted: true };
  setStage('<div class="ml-blank"><span>+</span></div>', 'retention');
  const retentionTiming = await waitMs(trial.retentionMs, sessionControl.signal);
  return { timing, secondaryTiming, retentionTiming, aborted: sessionControl.aborted };
}

async function askQuestion(question, index, total) {
  const started = performance.now();
  setStage(`<div class="ml-question"><p class="ml-question__counter">Pergunta ${index + 1} de ${total}</p><h2>${esc(question.prompt)}</h2><div class="ml-options">${question.options.map((o, i) => `<button class="ml-option" data-ml-answer="${esc(o)}"><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join('')}</div><p class="ml-keyhint">Teclado: 1–4</p></div>`, 'question');
  return new Promise((resolve) => {
    const stage = $('#ml-stage', overlay); let finished = false; let offAbort = () => {};
    const done = (value, aborted = false) => {
      if (finished) return; finished = true; offAbort(); stage.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey);
      resolve({ value, aborted, reactionMs: Math.round(performance.now() - started) });
    };
    const onClick = (e) => { const btn = e.target.closest('[data-ml-answer]'); if (btn) done(btn.dataset.mlAnswer); };
    const onKey = (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[1-4]$/.test(e.key)) { const btn = stage.querySelectorAll('[data-ml-answer]')[Number(e.key) - 1]; if (btn) { e.preventDefault(); done(btn.dataset.mlAnswer); } } };
    stage.addEventListener('click', onClick); document.addEventListener('keydown', onKey); offAbort = sessionControl.onAbort(() => done(null, true));
  });
}

function waitForEndButton() {
  return new Promise((resolve) => {
    const stage = $('#ml-stage', overlay); let offAbort = () => {};
    const done = () => { offAbort(); stage.removeEventListener('click', onClick); resolve(); };
    const onClick = (e) => { if (e.target.closest('[data-ml-end]')) done(); };
    stage.addEventListener('click', onClick); offAbort = sessionControl.onAbort(done);
  });
}

async function runMemorySession(mode) {
  ensureOverlay(); sessionControl = makeControl(); overlay.hidden = false; document.body.classList.add('ml-immersive');
  const settings = store.getSettings(); const spec = MEMORY_LAB_MODES[mode]; const requested = Math.max(1, Math.min(MEMORY_LAB_CONFIG.maxTrialsPerSession, settings.trialsPerSession));
  const records = []; const sources = new Set(); const sessionStart = Date.now();
  if (!await countdown(spec.name)) return;

  for (let i = 0; i < requested && !sessionControl.aborted; i++) {
    const trial = createMemoryTrial({ mode, settings });
    if (trial.exhausted) { setStage(`<div class="ml-message"><h2>Material virgem esgotado</h2><p>${esc(trial.reason)}</p><button class="btn btn--primary" data-ml-end>Voltar</button></div>`, 'message'); await waitForEndButton(); break; }
    $('.ml-play__counter', overlay).textContent = `${i + 1}/${requested}`; $('.ml-play__progress i', overlay).style.width = `${Math.round((i / requested) * 100)}%`;
    const startedAt = new Date().toISOString();
    // eslint-disable-next-line no-await-in-loop
    const presentation = await presentTrial(trial); if (presentation.aborted) break;
    const answers = []; const rts = [];
    for (let q = 0; q < trial.questions.length; q++) {
      // eslint-disable-next-line no-await-in-loop
      const answer = await askQuestion(trial.questions[q], q, trial.questions.length); if (answer.aborted) break;
      answers.push(answer.value); rts.push(answer.reactionMs);
    }
    if (sessionControl.aborted || answers.length !== trial.questions.length) break;
    const result = scoreResponses(trial.questions, answers); result.perQuestion = result.perQuestion.map((q, idx) => ({ ...q, reactionMs: rts[idx] }));
    const record = buildRecord({ trial, result, timing: presentation.timing, retentionTiming: presentation.retentionTiming, interferenceTiming: presentation.secondaryTiming, startedAt, answeredAt: new Date().toISOString() });
    store.recordTrial(record); adaptAfterTrial(mode, record, settings); scheduleDeferredFromTrial(trial, Date.now()); records.push(record); sources.add(trial.target.source);
    const reveal = mode !== 'one-shot' && mode !== 'life-transfer';
    setStage(`<div class="ml-message"><p class="ml-kicker">REGISTRADO</p><h2>${reveal ? `${result.correct}/${result.total}` : 'Representação testada'}</h2><p>${reveal ? 'Treino registrado.' : 'O gabarito fica oculto para proteger a recuperação tardia.'}</p></div>`, 'feedback');
    // eslint-disable-next-line no-await-in-loop
    await waitMs(600, sessionControl.signal);
  }

  if (sessionControl.aborted) return;
  const total = records.reduce((a, r) => a + r.total, 0); const correct = records.reduce((a, r) => a + r.correct, 0);
  const session = { id: `mls-${Date.now().toString(36)}`, mode, startedAt: new Date(sessionStart).toISOString(), completedAt: new Date().toISOString(), trials: records.length, accuracy: total ? correct / total : 0, oneShotValid: records.filter((r) => r.oneShotValid).length, sources: [...sources], protocolVersion: MEMORY_LAB_CONFIG.version };
  if (records.length) store.addSession(session);
  $('.ml-play__progress i', overlay).style.width = '100%';
  setStage(`<div class="ml-result"><p class="ml-kicker">${esc(spec.name.toUpperCase())}</p><h2>${records.length ? pct(session.accuracy) : '—'}</h2><p>${records.length} unidade${records.length === 1 ? '' : 's'} · ${session.oneShotValid} primeira${session.oneShotValid === 1 ? '' : 's'} exposição${session.oneShotValid === 1 ? '' : 'ões'}</p><div class="ml-result__timing"><span>${getRefreshHz()} Hz</span><span>quadro ${getFrameMs().toFixed(1)} ms</span></div><button class="btn btn--primary btn--lg" data-ml-end>Concluir</button></div>`, 'result');
  await waitForEndButton(); if (sessionControl.aborted) return;
  overlay.hidden = true; document.body.classList.remove('ml-immersive'); sessionControl = null; activeTab = 'profile'; renderMemoryLab();
}

async function runDueProbes() {
  ensureOverlay(); const due = store.getDueProbes(); if (!due.length) { toast('Nenhuma recuperação vencida agora.'); return; }
  sessionControl = makeControl(); overlay.hidden = false; document.body.classList.add('ml-immersive');
  for (let i = 0; i < due.length && !sessionControl.aborted; i++) {
    const probe = materializeProbe(due[i]); if (!probe) continue;
    $('.ml-play__counter', overlay).textContent = `${i + 1}/${due.length}`; $('.ml-play__progress i', overlay).style.width = `${Math.round((i / due.length) * 100)}%`;
    const ageMs = Date.now() - probe.encodedAt;
    setStage(`<div class="ml-message"><p class="ml-kicker">SEM REEXPOSIÇÃO</p><h2>${formatDelay(ageMs)} depois</h2><p>Recupere o que restou da exposição original.</p></div>`, 'probe-intro');
    // eslint-disable-next-line no-await-in-loop
    await waitMs(650, sessionControl.signal); if (sessionControl.aborted) break;
    // eslint-disable-next-line no-await-in-loop
    const response = await askQuestion(probe.question, 0, 1); if (response.aborted) break;
    const correct = scoreQuestion(probe.question, response.value); const actualAgeMs = Date.now() - probe.encodedAt;
    store.completeProbe(probe.key, { correct, response: response.value, actualAgeMs, source: probe.source });
    setStage(`<div class="ml-message"><h2>${correct ? 'Recuperado' : 'Não recuperado'}</h2><p>O original continua oculto.</p></div>`, 'probe-feedback');
    // eslint-disable-next-line no-await-in-loop
    await waitMs(500, sessionControl.signal);
  }
  if (!sessionControl.aborted) { setStage('<div class="ml-result"><p class="ml-kicker">DELAYED RETRIEVAL</p><h2>Concluído</h2><p>A curva foi atualizada.</p><button class="btn btn--primary btn--lg" data-ml-end>Ver perfil</button></div>', 'result'); await waitForEndButton(); }
  if (sessionControl?.aborted) return;
  overlay.hidden = true; document.body.classList.remove('ml-immersive'); sessionControl = null; activeTab = 'profile'; renderMemoryLab();
}
