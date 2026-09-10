// MEMORY LAB — interface e sessão imersiva.

import { esc, pct } from '../util.js';
import { MEMORY_LAB_CONFIG, MEMORY_LAB_MODES } from './config.js';
import { datasetStats, LITERATURE_SEED_META, stimulusById } from './dataset.js';
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
const $$ = (sel, base = document) => Array.from(base.querySelectorAll(sel));

function modeCards() {
  return Object.values(MEMORY_LAB_MODES).map((m) => {
    const skill = store.getSkill(m.id);
    return `<article class="ml-mode-card">
      <div class="ml-mode-card__icon">${esc(m.icon)}</div>
      <div class="ml-mode-card__body">
        <h3>${esc(m.name)}</h3>
        <p>${esc(m.description)}</p>
        <small>${m.benchmark ? 'benchmark · sem adaptação' : `${formatDelay(skill.exposureMs)} exposição · ${formatDelay(skill.retentionMs)} retenção`}</small>
      </div>
      <button class="btn btn--primary" data-ml-start="${esc(m.id)}">Iniciar</button>
    </article>`;
  }).join('');
}

function renderTrainPanel() {
  const s = store.getSettings();
  const due = store.getDueProbes().length;
  const pending = store.getPendingProbes().length;
  const fresh = freshCounts();
  return `<div class="ml-stack">
    <div class="ml-hero">
      <p class="ml-kicker">MEMORY LAB · ONE EXPOSURE</p>
      <h2>Treine para perder cada vez menos informação.</h2>
      <p>Uma exposição externa. Capture, conecte, estabilize, retenha e recupere — depois prove que isso sobrevive quando o material muda.</p>
      <div class="ml-hero__pipeline" aria-label="Pipeline de memória">
        <span>CAPTURE</span><i>→</i><span>BIND</span><i>→</i><span>RETAIN</span><i>→</i><span>RESIST</span><i>→</i><span>RETRIEVE</span><i>→</i><span>TRANSFER</span>
      </div>
      <button class="btn btn--primary btn--lg" data-ml-start="one-shot">Começar One Shot</button>
    </div>

    ${due ? `<div class="card ml-due-card">
      <div><p class="ml-kicker">SEM REEXPOSIÇÃO</p><h2 class="card__title">${due} recuperação${due === 1 ? '' : 'ões'} vencida${due === 1 ? '' : 's'}</h2>
      <p class="prose">Responda sobre material visto antes sem tornar a vê-lo.</p></div>
      <button class="btn btn--primary" data-ml-probes>Responder agora</button>
    </div>` : pending ? `<div class="card card--soft"><strong>${pending} probe${pending === 1 ? '' : 's'} agendado${pending === 1 ? '' : 's'}</strong><p class="field__hint">Eles aparecerão quando o intervalo programado vencer. A página não será mostrada novamente.</p></div>` : ''}

    <div class="ml-stats-row">
      <div class="ml-mini"><strong>${fresh.train}</strong><span>treinos frescos</span></div>
      <div class="ml-mini"><strong>${fresh.novel}</strong><span>novel reservados</span></div>
      <div class="ml-mini"><strong>${fresh.holdout}</strong><span>holdouts intactos</span></div>
    </div>

    <div class="card">
      <h2 class="card__title">Pressão do protocolo</h2>
      <label class="switch">
        <span><strong>Adaptação automática</strong><small>Precisão primeiro; depois o app encurta a exposição e alonga a retenção, uma variável por vez.</small></span>
        <input type="checkbox" data-ml-setting="adaptive"${s.adaptive ? ' checked' : ''}/><span class="switch__track"></span>
      </label>
      <div class="field">
        <div class="field__head"><span class="field__label">Unidades por sessão</span><output class="field__value" id="ml-out-trials">${s.trialsPerSession}</output></div>
        <input class="stepper__range" type="range" min="1" max="${MEMORY_LAB_CONFIG.maxTrialsPerSession}" step="1" value="${s.trialsPerSession}" data-ml-setting="trialsPerSession" />
      </div>
      <label class="switch">
        <span><strong>Variar layout</strong><small>O mesmo mecanismo precisa sobreviver a diferentes aparências de página.</small></span>
        <input type="checkbox" data-ml-setting="layoutVariation"${s.layoutVariation ? ' checked' : ''}/><span class="switch__track"></span>
      </label>
      ${!s.adaptive ? manualTimingMarkup(s) : `<p class="chart__caption">Faixa-alvo: ${Math.round(MEMORY_LAB_CONFIG.trainingZone[0] * 100)}–${Math.round(MEMORY_LAB_CONFIG.trainingZone[1] * 100)}%. O sistema não reduz exposição e aumenta retenção na mesma mudança.</p>`}
    </div>

    <div class="card card--soft">
      <h2 class="card__title">A aposta</h2>
      <p class="prose">O objetivo operacional é cada vez mais próximo de <strong>ver uma vez e continuar conseguindo consultar o que foi visto</strong>. O app mede o quanto disso acontece; não presume que exista um teto conhecido nem promete ausência literal de esquecimento.</p>
    </div>
  </div>`;
}

function manualTimingMarkup(s) {
  return `<div class="ml-manual-grid">
    <label class="field"><span class="field__label">Exposição</span>
      <select class="ml-select" data-ml-setting="exposureMs">
        ${MEMORY_LAB_CONFIG.exposureLadderMs.map((v) => `<option value="${v}"${v === s.exposureMs ? ' selected' : ''}>${formatDelay(v)}</option>`).join('')}
      </select></label>
    <label class="field"><span class="field__label">Retenção antes da pergunta</span>
      <select class="ml-select" data-ml-setting="retentionMs">
        ${MEMORY_LAB_CONFIG.retentionLadderMs.map((v) => `<option value="${v}"${v === s.retentionMs ? ' selected' : ''}>${formatDelay(v)}</option>`).join('')}
      </select></label>
  </div>`;
}

function renderProfilePanel() {
  const p = pipelineProfile(store.getTrials(), store.getCompletedProbes());
  const cells = p.components.map((c) => `<div class="ml-score${c.points === null ? ' is-empty' : ''}">
    <div class="ml-score__head"><span>${esc(c.short)}</span><strong>${c.points === null ? '—' : c.points}</strong></div>
    <div class="ml-score__bar"><i style="--score:${c.points ?? 0}%"></i></div>
    <p>${esc(c.raw)}</p><small>confiança: ${esc(c.confidence)}</small>
  </div>`).join('');
  return `<div class="ml-stack">
    <div class="card">
      <p class="ml-kicker">PIPELINE PROFILE</p>
      <h2 class="card__title">7 pontos funcionais</h2>
      <p class="prose">Escala interna 0–100 para localizar perdas no protocolo. Não é QI, percentil populacional nem exame clínico.</p>
      <div class="ml-score-grid">${cells}</div>
      ${p.bottleneck ? `<div class="ml-bottleneck"><strong>Gargalo aparente: ${esc(p.bottleneck.name)}</strong><span>${esc(p.bottleneck.raw)}. É uma leitura comportamental do protocolo atual, não um limite biológico.</span></div>` : '<p class="field__hint">Ainda faltam tentativas para localizar um gargalo.</p>'}
    </div>
    ${retentionCurveMarkup(p.components.find((c) => c.id === 'retention'))}
  </div>`;
}

function retentionCurveMarkup(retention) {
  if (!retention?.bins?.length) return '';
  const bars = retention.bins.map((b) => `<div class="ml-retention-row"><span>${formatDelay(b.delayMs)}</span><i><b style="--w:${Math.round(b.accuracy * 100)}%"></b></i><strong>${Math.round(b.accuracy * 100)}%</strong><small>n=${b.n}</small></div>`).join('');
  return `<div class="card"><h2 class="card__title">Curva de retenção One Shot</h2><div class="ml-retention-curve">${bars}</div><p class="chart__caption">Inclui manutenção durante treino e probes tardios sem reexposição. Recuperar também pode reativar a memória; por isso o app registra probes separadamente.</p></div>`;
}

function renderCorpusPanel() {
  const d = datasetStats();
  const fresh = freshCounts();
  return `<div class="ml-stack">
    <div class="card">
      <p class="ml-kicker">CORPUS REAL V1</p>
      <h2 class="card__title">${esc(LITERATURE_SEED_META.label)}</h2>
      <div class="tiles">
        <div class="tile"><div class="tile__value">${d.total}</div><div class="tile__label">unidades seed</div></div>
        <div class="tile"><div class="tile__value">${d.train}</div><div class="tile__label">train</div></div>
        <div class="tile"><div class="tile__value">${d.novel}</div><div class="tile__label">novel</div></div>
        <div class="tile"><div class="tile__value">${d.holdout}</div><div class="tile__label">holdout</div></div>
      </div>
      <p class="prose">Os PDFs, capas, notas editoriais e diagramação não foram incorporados ao repositório. O seed usa conteúdo literário de obras em domínio público e renderiza layouts próprios.</p>
      <p class="chart__caption">${esc(LITERATURE_SEED_META.note)}</p>
    </div>
    <div class="card">
      <h2 class="card__title">Integridade experimental</h2>
      <ul class="facts">
        <li><strong>One Shot:</strong> uma unidade já exibida não volta ao pool fresco.</li>
        <li><strong>Derivações não atravessam splits:</strong> página, binding e perguntas herdam o split da unidade.</li>
        <li><strong>Holdout:</strong> só entra em Life Transfer e deixa de ser virgem depois da primeira exposição.</li>
        <li><strong>Familiaridade prévia:</strong> este primeiro pack não pode provar novidade absoluta se você já conhecia as obras.</li>
      </ul>
      <div class="ml-stats-row"><div class="ml-mini"><strong>${fresh.train}</strong><span>train intactos</span></div><div class="ml-mini"><strong>${fresh.holdout}</strong><span>holdout intactos</span></div></div>
    </div>
  </div>`;
}

function renderDuePanel() {
  const due = store.getDueProbes();
  const pending = store.getPendingProbes();
  const completed = store.getCompletedProbes().slice(-8).reverse();
  return `<div class="ml-stack">
    <div class="card">
      <p class="ml-kicker">DELAYED RETRIEVAL</p><h2 class="card__title">Sem olhar de novo</h2>
      <p class="prose">A página não reaparece. O teste pergunta um detalhe que não foi usado na recuperação imediata.</p>
      <div class="tiles"><div class="tile"><div class="tile__value">${due.length}</div><div class="tile__label">vencidos</div></div><div class="tile"><div class="tile__value">${pending.length}</div><div class="tile__label">pendentes</div></div></div>
      <button class="btn btn--primary" data-ml-probes${due.length ? '' : ' disabled'}>Responder vencidos</button>
    </div>
    ${completed.length ? `<div class="card"><h2 class="card__title">Últimos probes</h2><div class="history-list">${completed.map((p) => `<div class="history-item"><div><strong>${esc(p.source || 'material')}</strong><small>${formatDelay(p.delayMs)} sem reexposição</small></div><span>${p.correct ? '✓' : '×'}</span></div>`).join('')}</div></div>` : ''}
  </div>`;
}

function renderModulesPanel() {
  return `<div class="ml-stack"><div class="card card--soft"><strong>One Shot é o núcleo.</strong><p class="prose">Os outros módulos pressionam gargalos específicos sem substituir o teste de uma única exposição.</p></div><div class="ml-mode-grid">${modeCards()}</div></div>`;
}

function tabsMarkup() {
  const tabs = [
    ['train', 'Treino'], ['modules', 'Módulos'], ['due', 'Depois'], ['profile', 'Perfil'], ['corpus', 'Corpus'],
  ];
  return `<div class="chips chips--tabs ml-tabs" role="tablist" aria-label="Seções do Memory Lab">${tabs.map(([id, label]) => `<button class="chip${activeTab === id ? ' is-active' : ''}" data-ml-tab="${id}" role="tab" aria-selected="${activeTab === id}">${label}</button>`).join('')}</div>`;
}

export function renderMemoryLab() {
  if (!root) return;
  const panel = activeTab === 'modules' ? renderModulesPanel()
    : activeTab === 'due' ? renderDuePanel()
      : activeTab === 'profile' ? renderProfilePanel()
        : activeTab === 'corpus' ? renderCorpusPanel()
          : renderTrainPanel();
  root.innerHTML = `<div class="ml-shell">${tabsMarkup()}<div class="ml-panel">${panel}</div></div>`;
}

export function initMemoryLab({ rootElement, toast: toastFn } = {}) {
  root = rootElement || $('#memory-lab-root');
  if (!root) return;
  toast = toastFn || (() => {});
  ensureOverlay();
  root.addEventListener('click', onRootClick);
  root.addEventListener('change', onSettingChange);
  root.addEventListener('input', onSettingInput);
  measureFrameMs().catch(() => {});
  renderMemoryLab();
}

export function onEnterMemoryLab() {
  renderMemoryLab();
}

function onRootClick(e) {
  const tab = e.target.closest('[data-ml-tab]');
  if (tab) { activeTab = tab.dataset.mlTab; renderMemoryLab(); return; }
  const start = e.target.closest('[data-ml-start]');
  if (start) { runMemorySession(start.dataset.mlStart); return; }
  if (e.target.closest('[data-ml-probes]')) runDueProbes();
}

function onSettingInput(e) {
  if (e.target.dataset.mlSetting === 'trialsPerSession') {
    const out = $('#ml-out-trials', root);
    if (out) out.textContent = e.target.value;
  }
}

function onSettingChange(e) {
  const key = e.target.dataset.mlSetting;
  if (!key) return;
  let value;
  if (e.target.type === 'checkbox') value = e.target.checked;
  else if (['trialsPerSession', 'exposureMs', 'retentionMs'].includes(key)) value = Number(e.target.value);
  else value = e.target.value;
  store.updateSettings({ [key]: value });
  renderMemoryLab();
}

function ensureOverlay() {
  overlay = $('#ml-play');
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'ml-play';
  overlay.className = 'ml-play';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="ml-play__bar"><button class="icon-btn" data-ml-quit aria-label="Encerrar">✕</button><div class="ml-play__progress"><i></i></div><span class="ml-play__counter"></span></div><div class="ml-stage" id="ml-stage"></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-ml-quit]')) abortSession();
  });
}

function abortSession() {
  if (sessionControl) sessionControl.aborted = true;
  overlay.hidden = true;
  document.body.classList.remove('ml-immersive');
  renderMemoryLab();
}

function makeControl() {
  return { aborted: false, get signal() { return { aborted: this.aborted }; } };
}

function setStage(html, phase = '') {
  const stage = $('#ml-stage', overlay);
  stage.dataset.phase = phase;
  stage.innerHTML = html;
}

async function countdown(label) {
  for (const n of [3, 2, 1]) {
    if (sessionControl?.aborted) return false;
    setStage(`<div class="ml-countdown"><span>${n}</span><small>${esc(label)}</small></div>`, 'countdown');
    // eslint-disable-next-line no-await-in-loop
    await waitMs(550, sessionControl.signal);
  }
  return !sessionControl.aborted;
}

function pageMarkup(stimulus, layout = 'book', label = '') {
  return `<article class="ml-page ml-page--${esc(layout)}">
    ${label ? `<div class="ml-page__label">${esc(label)}</div>` : ''}
    <header><small>${esc(stimulus.chapter)}</small><h2>${esc(stimulus.title)}</h2></header>
    <div class="ml-page__body">${stimulus.blocks.map((b) => `<p>${esc(b)}</p>`).join('')}</div>
  </article>`;
}

function factSheetMarkup(stimulus, rows = null, label = '') {
  const data = rows || stimulus.facts.slice(0, 3).map((f) => ({ prompt: f.prompt, answer: f.answer }));
  return `<article class="ml-page ml-page--facts">${label ? `<div class="ml-page__label">${esc(label)}</div>` : ''}<header><small>${esc(stimulus.source)}</small><h2>Ficha de relações</h2></header><dl>${data.map((r) => `<div><dt>${esc(r.prompt)}</dt><dd>${esc(r.answer)}</dd></div>`).join('')}</dl></article>`;
}

function targetMarkup(trial, label = '') {
  return trial.renderKind === 'fact-sheet'
    ? factSheetMarkup(trial.target, null, label)
    : pageMarkup(trial.target, trial.layout, label);
}

async function timedMarkup(html, ms) {
  const stage = $('#ml-stage', overlay);
  stage.dataset.phase = 'stimulus';
  stage.innerHTML = `<div class="ml-flash-layer" style="visibility:hidden">${html}</div>`;
  const layer = $('.ml-flash-layer', stage);
  void layer.offsetHeight;
  return presentStimulus({
    show: () => { layer.style.visibility = 'visible'; },
    hide: () => { layer.style.visibility = 'hidden'; },
    requestedMs: ms,
    signal: sessionControl.signal,
  });
}

async function presentTrial(trial) {
  const timing = await timedMarkup(targetMarkup(trial, trial.mode === 'separation' ? 'Ficha A' : ''), trial.exposureMs);
  if (sessionControl.aborted) return { aborted: true };
  let secondaryTiming = null;

  if (trial.mode === 'separation' && trial.secondary) {
    await waitMs(300, sessionControl.signal);
    secondaryTiming = await timedMarkup(factSheetMarkup(trial.target, trial.secondary.rows, 'Ficha B'), trial.exposureMs);
  } else if (trial.interference) {
    await waitMs(250, sessionControl.signal);
    const interferenceMs = Math.max(650, Math.min(1600, trial.exposureMs));
    secondaryTiming = await timedMarkup(pageMarkup(trial.interference, 'compact', 'INTERFERÊNCIA'), interferenceMs);
  }

  markTrialExposure(trial, timing, secondaryTiming);
  setStage('<div class="ml-blank"><span>+</span></div>', 'retention');
  const retentionTiming = await waitMs(trial.retentionMs, sessionControl.signal);
  return { timing, secondaryTiming, retentionTiming };
}

async function askQuestion(question, index, total) {
  const started = performance.now();
  setStage(`<div class="ml-question"><p class="ml-question__counter">Pergunta ${index + 1} de ${total}</p><h2>${esc(question.prompt)}</h2><div class="ml-options">${question.options.map((o, i) => `<button class="ml-option" data-ml-answer="${esc(o)}"><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join('')}</div><p class="ml-keyhint">Teclado: 1–4</p></div>`, 'question');
  return new Promise((resolve) => {
    const stage = $('#ml-stage', overlay);
    let finished = false;
    const done = (value) => {
      if (finished) return;
      finished = true;
      stage.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      resolve({ value, reactionMs: Math.round(performance.now() - started) });
    };
    const onClick = (e) => {
      const btn = e.target.closest('[data-ml-answer]');
      if (btn) done(btn.dataset.mlAnswer);
    };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-4]$/.test(e.key)) {
        const btn = stage.querySelectorAll('[data-ml-answer]')[Number(e.key) - 1];
        if (btn) { e.preventDefault(); done(btn.dataset.mlAnswer); }
      }
    };
    stage.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  });
}

async function runMemorySession(mode) {
  ensureOverlay();
  sessionControl = makeControl();
  overlay.hidden = false;
  document.body.classList.add('ml-immersive');
  const settings = store.getSettings();
  const spec = MEMORY_LAB_MODES[mode];
  const requested = Math.max(1, Math.min(MEMORY_LAB_CONFIG.maxTrialsPerSession, settings.trialsPerSession));
  const sessionStart = Date.now();
  const records = [];
  const sources = new Set();

  const ok = await countdown(spec.name);
  if (!ok) return;

  for (let i = 0; i < requested; i++) {
    if (sessionControl.aborted) break;
    const trial = createMemoryTrial({ mode, settings });
    if (trial.exhausted) {
      setStage(`<div class="ml-message"><h2>Material virgem esgotado</h2><p>${esc(trial.reason)}</p><button class="btn btn--primary" data-ml-end>Voltar ao Lab</button></div>`, 'message');
      await waitForEndButton();
      break;
    }
    $('.ml-play__counter', overlay).textContent = `${i + 1}/${requested}`;
    $('.ml-play__progress i', overlay).style.width = `${Math.round((i / requested) * 100)}%`;

    const startedAt = new Date().toISOString();
    // eslint-disable-next-line no-await-in-loop
    const presentation = await presentTrial(trial);
    if (presentation.aborted || sessionControl.aborted) break;

    const answers = [];
    const rts = [];
    for (let q = 0; q < trial.questions.length; q++) {
      // eslint-disable-next-line no-await-in-loop
      const answer = await askQuestion(trial.questions[q], q, trial.questions.length);
      answers.push(answer.value); rts.push(answer.reactionMs);
      if (sessionControl.aborted) break;
    }
    if (sessionControl.aborted) break;

    const result = scoreResponses(trial.questions, answers);
    result.perQuestion = result.perQuestion.map((q, idx) => ({ ...q, reactionMs: rts[idx] }));
    const record = buildRecord({
      trial, result,
      timing: presentation.timing,
      retentionTiming: presentation.retentionTiming,
      interferenceTiming: presentation.secondaryTiming,
      startedAt,
      answeredAt: new Date().toISOString(),
    });
    store.recordTrial(record);
    adaptAfterTrial(mode, record, settings);
    scheduleDeferredFromTrial(trial, Date.now());
    records.push(record);
    sources.add(trial.target.source);

    // Não revelamos respostas de One Shot / holdout antes dos probes tardios.
    const revealScore = mode !== 'one-shot' && mode !== 'life-transfer';
    setStage(`<div class="ml-message"><p class="ml-kicker">REGISTRADO</p><h2>${revealScore ? `${result.correct}/${result.total}` : 'Representação testada'}</h2><p>${revealScore ? 'O próximo estímulo muda; não dependa do conteúdo anterior.' : 'As respostas corretas não são reveladas aqui para não contaminar a retenção tardia.'}</p></div>`, 'feedback');
    // eslint-disable-next-line no-await-in-loop
    await waitMs(650, sessionControl.signal);
  }

  if (sessionControl.aborted) return;
  $('.ml-play__progress i', overlay).style.width = '100%';
  const total = records.reduce((a, r) => a + r.total, 0);
  const correct = records.reduce((a, r) => a + r.correct, 0);
  const session = {
    id: `mls-${Date.now().toString(36)}`,
    mode,
    startedAt: new Date(sessionStart).toISOString(),
    completedAt: new Date().toISOString(),
    trials: records.length,
    accuracy: total ? correct / total : 0,
    oneShotValid: records.filter((r) => r.oneShotValid).length,
    sources: [...sources],
    protocolVersion: MEMORY_LAB_CONFIG.version,
  };
  if (records.length) store.addSession(session);

  setStage(`<div class="ml-result"><p class="ml-kicker">${esc(spec.name.toUpperCase())}</p><h2>${records.length ? pct(session.accuracy) : '—'}</h2><p>${records.length} unidade${records.length === 1 ? '' : 's'} · ${session.oneShotValid} exposição${session.oneShotValid === 1 ? '' : 'ões'} virgem${session.oneShotValid === 1 ? '' : 's'}</p><div class="ml-result__timing"><span>${getRefreshHz()} Hz</span><span>quadro ${getFrameMs().toFixed(1)} ms</span></div><button class="btn btn--primary btn--lg" data-ml-end>Concluir</button></div>`, 'result');
  await waitForEndButton();
  overlay.hidden = true;
  document.body.classList.remove('ml-immersive');
  sessionControl = null;
  activeTab = 'profile';
  renderMemoryLab();
}

function waitForEndButton() {
  return new Promise((resolve) => {
    const stage = $('#ml-stage', overlay);
    const onClick = (e) => {
      if (!e.target.closest('[data-ml-end]')) return;
      stage.removeEventListener('click', onClick);
      resolve();
    };
    stage.addEventListener('click', onClick);
  });
}

async function runDueProbes() {
  ensureOverlay();
  const due = store.getDueProbes();
  if (!due.length) { toast('Nenhuma recuperação vencida agora.'); return; }
  sessionControl = makeControl();
  overlay.hidden = false;
  document.body.classList.add('ml-immersive');

  for (let i = 0; i < due.length; i++) {
    if (sessionControl.aborted) break;
    const probe = materializeProbe(due[i]);
    if (!probe) continue;
    $('.ml-play__counter', overlay).textContent = `${i + 1}/${due.length}`;
    $('.ml-play__progress i', overlay).style.width = `${Math.round((i / due.length) * 100)}%`;
    setStage(`<div class="ml-message"><p class="ml-kicker">SEM REEXPOSIÇÃO</p><h2>${formatDelay(Date.now() - probe.encodedAt)} depois</h2><p>Não tente rever a página: recupere apenas o que restou da exposição original.</p></div>`, 'probe-intro');
    // eslint-disable-next-line no-await-in-loop
    await waitMs(700, sessionControl.signal);
    // eslint-disable-next-line no-await-in-loop
    const response = await askQuestion(probe.question, 0, 1);
    const correct = scoreQuestion(probe.question, response.value);
    const ageMs = Date.now() - probe.encodedAt;
    store.completeProbe(probe.key, { correct, response: response.value, actualAgeMs: ageMs, source: probe.source });
    store.recordTrial({
      id: `probe-${Date.now().toString(36)}-${i}`,
      timestamp: new Date().toISOString(),
      mode: 'delayed-probe', component: 'retention', components: ['retention'],
      split: stimulusById(probe.stimulusId)?.split || 'train', stimulusId: probe.stimulusId,
      source: probe.source, oneShotValid: true, probe: true,
      retentionRequestedMs: probe.delayMs, retentionActualMs: ageMs,
      correct, total: 1, accuracy: correct,
      perQuestion: [{ questionId: probe.question.id, type: probe.question.type, component: 'retention', correct, reactionMs: response.reactionMs }],
      protocolVersion: MEMORY_LAB_CONFIG.version, datasetVersion: MEMORY_LAB_CONFIG.datasetVersion, invalid: false,
    });
    setStage(`<div class="ml-message"><h2>${correct ? 'Recuperado' : 'Não recuperado'}</h2><p>O conteúdo original continua oculto. O importante aqui é medir o que sobreviveu sem outra exposição.</p></div>`, 'probe-feedback');
    // eslint-disable-next-line no-await-in-loop
    await waitMs(600, sessionControl.signal);
  }

  if (!sessionControl.aborted) {
    setStage('<div class="ml-result"><p class="ml-kicker">DELAYED RETRIEVAL</p><h2>Concluído</h2><p>A curva de retenção foi atualizada.</p><button class="btn btn--primary btn--lg" data-ml-end>Ver perfil</button></div>', 'result');
    await waitForEndButton();
  }
  overlay.hidden = true;
  document.body.classList.remove('ml-immersive');
  sessionControl = null;
  activeTab = 'profile';
  renderMemoryLab();
}
