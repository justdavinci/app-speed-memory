// Telas do Try Hard: treino do dia, módulos, progresso e configuração.
// A condução da sessão fica em runner.js e o desenho do estímulo em view.js —
// aqui é só navegação, formulários e painéis.

import { esc, fmtDateTime, fmtDuration, pct } from '../util.js';
import { lineChart, barChart } from '../charts.js';
import {
  DEFAULT_TRY_HARD_SETTINGS, MODULE_IDS, MODULE_SPECS, PRESETS, STIMULUS_TYPES,
  TRY_HARD_CONFIG,
} from './config.js';
import { dimensionsOf, initialState } from './difficulty.js';
import * as store from './store.js';
import { createControl, runRoutineSession } from './runner.js';
import { createView } from './view.js';
import { getFrameMs, getRefreshHz, measureFrameMs } from './timing.js';
import { getModule } from './modules/index.js';
import { MAX_TIER, TRANSFER_PRESETS, TRANSFER_TIERS } from './transfer/config.js';
import { pressureSummary } from './transfer/adapt.js';
import { holdoutTemplates } from './transfer/novelty.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  tab: 'today',
  moduleFilter: 'all',
  range: 30,
  detailModule: null,
  running: false,
  control: null,
  view: null,
  draftRoutine: null,
};

let hooks = {};

/* ------------------------------ utilidades ------------------------------ */

const tile = (value, label, modifier = '') => `<div class="tile ${modifier}">
    <div class="tile__value">${esc(String(value))}</div>
    <div class="tile__label">${esc(label)}</div>
  </div>`;

const minutesLabel = (m) => `${m} min`;

function routineTotalMinutes(routine) {
  return routine.modules.reduce((a, m) => a + (m.minutes || 0), 0);
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function difficultyLabel(moduleId, difficultyState) {
  const dims = dimensionsOf(moduleId);
  if (!dims.length || !difficultyState) return '—';
  return dims.map((d) => {
    const value = difficultyState[d.key];
    if (value === undefined) return null;
    if (d.format === 'pct') return `${d.label} ${Math.round(value * 100)}%`;
    return `${d.label} ${d.unit === 'ms' ? formatMs(value) : value}`;
  }).filter(Boolean).join(' · ');
}

/* -------------------------------- telas --------------------------------- */

function renderTabs() {
  $$('[data-th-tab]').forEach((btn) => {
    const active = btn.dataset.thTab === state.tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  for (const name of ['today', 'modules', 'transfer', 'progress', 'config']) {
    $(`#th-panel-${name}`).hidden = name !== state.tab;
  }
}

export function render() {
  renderTabs();
  if (state.tab === 'today') renderToday();
  if (state.tab === 'modules') renderModules();
  if (state.tab === 'transfer') renderTransfer();
  if (state.tab === 'progress') renderProgress();
  if (state.tab === 'config') renderConfig();
}

/* ------------------------------ treino do dia --------------------------- */

function renderToday() {
  const routine = store.getActiveRoutine();
  const dashboard = store.getDashboard();
  const today = dashboard.series[dashboard.series.length - 1];
  const isToday = today && today.day === new Date().toISOString().slice(0, 10);

  const steps = routine.modules.map((block, i) => {
    const spec = MODULE_SPECS[block.moduleId];
    const skill = store.getModuleStats(block.moduleId);
    return `<button class="th-step" data-module-detail="${block.moduleId}">
        <span class="th-step__index">${i + 1}</span>
        <span class="th-step__main">
          <span class="th-step__name">${esc(spec.name)}</span>
          <span class="th-step__meta">${minutesLabel(block.minutes)} · ${esc(PRESETS[block.preset]?.label || 'Try Hard')}${skill.calibrating ? ' · calibrando' : ''}</span>
        </span>
        <span class="th-step__go">›</span>
      </button>`;
  }).join('');

  const records = MODULE_IDS
    .map((id) => ({ id, stats: store.getModuleStats(id) }))
    .filter((m) => m.stats.bests?.bestExposureMs || m.stats.bests?.bestThroughput)
    .sort((a, b) => (b.stats.bests.bestThroughput || 0) - (a.stats.bests.bestThroughput || 0))
    .slice(0, 4)
    .map((m) => `<div class="th-record-row">
        <span>${esc(MODULE_SPECS[m.id].name)}</span>
        <span>${formatMs(m.stats.bests.bestExposureMs)} · ${m.stats.bests.bestThroughput || 0}</span>
      </div>`).join('');

  $('#th-panel-today').innerHTML = `
    <div class="card th-card--main">
      <p class="th-kicker">Treino de hoje</p>
      <h2 class="th-big">${esc(routine.name)}</h2>
      <p class="th-hint">~${routineTotalMinutes(routine)} min · ${routine.modules.length} exercícios</p>
      <button class="btn btn--primary btn--lg" id="th-start-routine">Iniciar treino</button>
    </div>

    <div class="card">
      <h2 class="card__title">Sequência</h2>
      <div class="th-steps">${steps}</div>
    </div>

    <div class="card">
      <h2 class="card__title">Hoje</h2>
      <div class="tiles">
        ${tile(isToday ? today.trials : 0, 'tentativas')}
        ${tile(isToday ? pct(today.accuracy) : '—', 'precisão')}
        ${tile(isToday ? today.throughput : '—', 'throughput')}
        ${tile(dashboard.streak?.current || 0, 'dias seguidos')}
      </div>
    </div>

    ${records ? `<div class="card">
      <h2 class="card__title">Recordes recentes</h2>
      <div class="th-records">${records}</div>
      <p class="chart__caption">Melhor exposição e melhor throughput por módulo.</p>
    </div>` : ''}`;

  $('#th-start-routine').addEventListener('click', () => startRoutine(routine));
  bindModuleDetail($('#th-panel-today'));
}

/* -------------------------------- módulos -------------------------------- */

function renderModules() {
  if (state.detailModule) { renderModuleDetail(state.detailModule); return; }
  const cards = MODULE_IDS.map((id) => {
    const spec = MODULE_SPECS[id];
    const stats = store.getModuleStats(id);
    return `<div class="card th-module">
        <div class="th-module__head">
          <h3 class="th-module__name">${esc(spec.name)}</h3>
          <span class="th-module__time">${spec.defaultMinutes} min</span>
        </div>
        <p class="th-hint">${esc(spec.blurb)}</p>
        <p class="th-module__stats">${stats.trialsDone} tentativas · ${stats.accuracy === null ? 'sem dados' : pct(stats.accuracy)}</p>
        <div class="row">
          <button class="btn btn--ghost" data-module-detail="${id}">Detalhes</button>
          <button class="btn btn--primary" data-module-train="${id}">Treinar</button>
        </div>
      </div>`;
  }).join('');

  $('#th-panel-modules').innerHTML = cards;
  bindModuleDetail($('#th-panel-modules'));
  $$('[data-module-train]', $('#th-panel-modules')).forEach((btn) => {
    btn.addEventListener('click', () => openQuickTrain(btn.dataset.moduleTrain));
  });
}

function bindModuleDetail(root) {
  $$('[data-module-detail]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.detailModule = btn.dataset.moduleDetail;
      state.tab = 'modules';
      render();
    });
  });
}

function renderModuleDetail(moduleId) {
  const spec = MODULE_SPECS[moduleId];
  const stats = store.getModuleStats(moduleId);
  const bests = stats.bests || {};
  const series = store.getDailySeries(moduleId, state.range);
  const mod = getModule(moduleId);

  $('#th-panel-modules').innerHTML = `
    <button class="btn btn--ghost" id="th-back">‹ Todos os módulos</button>
    <div class="card">
      <h2 class="card__title">${esc(spec.name)}</h2>
      <p class="th-hint">${esc(spec.blurb)}</p>
      <div class="tiles">
        ${tile(formatMs(bests.bestExposureMs), 'melhor exposição')}
        ${tile(bests.bestMatrix || (bests.bestItems ? `${bests.bestItems} itens` : '—'), bests.bestMatrix ? 'melhor matriz' : 'mais itens')}
        ${tile(stats.accuracy === null ? '—' : pct(stats.accuracy), 'precisão')}
        ${tile(bests.bestThroughput || '—', 'melhor throughput')}
        ${bests.bestCueDelayMs !== undefined ? tile(formatMs(bests.bestCueDelayMs), 'maior retrocue') : ''}
        ${bests.bestMaskDelayMs !== undefined ? tile(formatMs(bests.bestMaskDelayMs), 'menor intervalo de máscara') : ''}
        ${tile(stats.trialsDone, 'tentativas')}
      </div>
      <p class="chart__caption">Dificuldade atual: ${esc(difficultyLabel(moduleId, stats.difficulty))}${stats.calibrating ? ' · calibrando' : ''}</p>
      <div class="row row--wrap">
        <button class="btn btn--primary" data-module-train="${moduleId}">Treinar</button>
        ${mod.adaptive === false ? '' : `<button class="btn btn--ghost" id="th-recalibrate">Recalibrar</button>`}
      </div>
    </div>

    <div class="card">
      <h2 class="card__title">Evolução</h2>
      ${rangeChips()}
      <div class="chart">${lineChart(series.map((d) => ({ value: d.accuracy })), -1)}</div>
      <p class="chart__caption">Precisão por dia${series.length ? '' : ' — treine para começar a série'}</p>
      <div class="chart chart--bars">${barChart(series.map((d) => ({ value: d.throughput, max: 1000 })))}</div>
      <p class="chart__caption">Iconic Throughput médio por dia</p>
    </div>`;

  $('#th-back').addEventListener('click', () => { state.detailModule = null; render(); });
  $$('[data-module-train]').forEach((b) => b.addEventListener('click', () => openQuickTrain(moduleId)));
  $('#th-recalibrate')?.addEventListener('click', () => {
    store.recalibrate(moduleId);
    hooks.toast?.('Módulo recalibrado.');
    render();
  });
  bindRangeChips();
}

function rangeChips() {
  const labels = { 7: '7D', 30: '30D', 90: '90D', 0: 'TUDO' };
  return `<div class="chips th-ranges">${TRY_HARD_CONFIG.historyChartRanges.map((r) => (
    `<button class="chip${state.range === r ? ' is-active' : ''}" data-range="${r}">${labels[r]}</button>`
  )).join('')}</div>`;
}

function bindRangeChips() {
  $$('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.range = Number(btn.dataset.range);
      render();
    });
  });
}

/* ----------------------------- treino rápido ---------------------------- */

function openQuickTrain(moduleId) {
  const spec = MODULE_SPECS[moduleId];
  const mod = getModule(moduleId);
  const stats = store.getModuleStats(moduleId);
  const fixed = mod.protocolTrials;
  const dims = dimensionsOf(moduleId);

  const sheet = $('#th-sheet');
  sheet.innerHTML = `
    <div class="th-sheet__panel">
      <h2 class="card__title">${esc(spec.name)}</h2>
      <p class="th-hint">${esc(spec.blurb)}</p>

      ${fixed ? `<p class="th-hint">Protocolo fixo de ${fixed} tentativas.</p>` : `
      <div class="field">
        <div class="field__head"><span class="field__label">Duração</span></div>
        <div class="segmented" id="th-quick-length">
          ${TRY_HARD_CONFIG.quickDurationsMin.map((m, i) => (
            `<button class="segmented__opt" data-length="min:${m}" aria-checked="${i === 1}" role="radio">${m} min</button>`
          )).join('')}
          ${TRY_HARD_CONFIG.quickTrialCounts.map((t) => (
            `<button class="segmented__opt" data-length="trials:${t}" aria-checked="false" role="radio">${t}</button>`
          )).join('')}
          <button class="segmented__opt" data-length="unlimited" aria-checked="false" role="radio">Livre</button>
        </div>
      </div>

      <div class="field">
        <div class="field__head"><span class="field__label">Dificuldade</span></div>
        <div class="segmented" id="th-quick-preset">
          ${Object.values(PRESETS).map((p) => (
            `<button class="segmented__opt" data-preset="${p.id}" aria-checked="${p.id === 'tryhard'}" role="radio">${esc(p.label)}</button>`
          )).join('')}
        </div>
        <p class="field__hint" id="th-quick-preset-hint">Adaptativa: o app persegue 70–85% de acerto.</p>
      </div>

      ${spec.stimulusTypes.length > 1 ? `<div class="field">
        <div class="field__head"><span class="field__label">Estímulo</span></div>
        <div class="segmented" id="th-quick-stimulus">
          ${spec.stimulusTypes.map((t) => (
            `<button class="segmented__opt" data-stimulus="${t}" aria-checked="${t === spec.defaultStimulus}" role="radio">${esc(STIMULUS_TYPES[t].label)}</button>`
          )).join('')}
        </div>
      </div>` : ''}

      <div class="field" id="th-manual-fields" hidden>
        ${dims.map((d) => manualField(d, stats.difficulty?.[d.key] ?? d.start)).join('')}
      </div>`}

      <div class="row">
        <button class="btn btn--ghost" data-sheet="close">Cancelar</button>
        <button class="btn btn--primary" data-sheet="start">Começar</button>
      </div>
    </div>`;
  sheet.hidden = false;

  const choice = { length: 'min:10', preset: 'tryhard', stimulus: spec.defaultStimulus, manual: {} };

  const pickGroup = (containerId, attr, key, after) => {
    const container = $(`#${containerId}`);
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest(`[data-${attr}]`);
      if (!btn) return;
      $$(`[data-${attr}]`, container).forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      choice[key] = btn.dataset[attr];
      after?.(choice[key]);
    });
  };
  pickGroup('th-quick-length', 'length', 'length');
  pickGroup('th-quick-preset', 'preset', 'preset', (preset) => {
    const manual = preset === 'custom';
    const fields = $('#th-manual-fields');
    if (fields) fields.hidden = !manual;
    $('#th-quick-preset-hint').textContent = manual
      ? 'Manual: os parâmetros abaixo valem para a sessão inteira.'
      : 'Adaptativa: o app persegue 70–85% de acerto.';
  });
  pickGroup('th-quick-stimulus', 'stimulus', 'stimulus');

  $$('[data-manual]', sheet).forEach((input) => {
    input.addEventListener('input', () => {
      choice.manual[input.dataset.manual] = Number(input.value);
      const out = $(`#out-${input.dataset.manual}`, sheet);
      if (out) out.textContent = manualValueLabel(moduleId, input.dataset.manual, Number(input.value));
    });
  });

  // Sem `once`: o ouvinte precisa sobreviver aos cliques nas opções e só sair
  // quando o usuário realmente escolher começar ou cancelar.
  const onSheetClick = (e) => {
    const action = e.target.closest('[data-sheet]')?.dataset.sheet;
    if (!action) return;
    sheet.removeEventListener('click', onSheetClick);
    sheet.hidden = true;
    if (action !== 'start') return;

    const block = {
      moduleId,
      preset: choice.preset,
      stimulus: choice.stimulus,
      adaptive: choice.preset !== 'custom',
      manual: choice.preset === 'custom',
      difficulty: choice.preset === 'custom' ? { ...stats.difficulty, ...choice.manual } : null,
    };
    if (choice.length.startsWith('min:')) block.minutes = Number(choice.length.slice(4));
    else if (choice.length.startsWith('trials:')) block.trials = Number(choice.length.slice(7));
    else block.unlimited = true;

    startRoutine({ id: `quick-${moduleId}`, name: MODULE_SPECS[moduleId].name, modules: [block] });
  };
  sheet.addEventListener('click', onSheetClick);
}

function manualField(dim, value) {
  const isLadder = dim.kind === 'ladder';
  const min = isLadder ? 0 : dim.min;
  const max = isLadder ? dim.values.length - 1 : dim.max;
  const step = isLadder ? 1 : dim.step;
  const current = isLadder ? Math.max(0, dim.values.indexOf(value)) : value;
  return `<div class="field__head">
      <span class="field__label">${esc(dim.label)}</span>
      <output class="field__value" id="out-${dim.key}">${manualValueLabelFromDim(dim, value)}</output>
    </div>
    <input class="stepper__range" type="range" data-manual="${dim.key}" data-ladder="${isLadder}"
           min="${min}" max="${max}" step="${step}" value="${current}" aria-label="${esc(dim.label)}" />`;
}

function manualValueLabelFromDim(dim, value) {
  if (dim.format === 'pct') return `${Math.round(value * 100)}%`;
  if (dim.unit === 'ms') return formatMs(value);
  return String(value);
}

function manualValueLabel(moduleId, key, raw) {
  const dim = dimensionsOf(moduleId).find((d) => d.key === key);
  if (!dim) return String(raw);
  const value = dim.kind === 'ladder' ? dim.values[raw] : raw;
  return manualValueLabelFromDim(dim, value);
}

/* ------------------------------- mundo real ------------------------------ */

function tierLadderMarkup(tier) {
  return `<div class="th-tiers">${TRANSFER_TIERS.map((t) => {
    const stateClass = t.tier < tier ? ' is-done' : t.tier === tier ? ' is-now' : '';
    return `<div class="th-tier${stateClass}">
        <span class="th-tier__n">${t.tier}</span>
        <span class="th-tier__main">
          <span class="th-tier__name">${esc(t.name)}</span>
          <span class="th-tier__blurb">${esc(t.blurb)}</span>
        </span>
      </div>`;
  }).join('')}</div>`;
}

function familyRowsMarkup(families) {
  if (!families.length) return '<p class="th-hint">Ainda sem tentativas de transferência.</p>';
  return `<div class="th-records">${families.map((f) => `<div class="th-record-row">
      <span>${esc(f.name)}</span>
      <span>${f.trials} · ${pct(f.accuracy)}${f.novelAccuracy === null ? '' : ` · novo ${pct(f.novelAccuracy)}`}</span>
    </div>`).join('')}</div>`;
}

function gapLabel(gap) {
  if (gap === null || gap === undefined) return '—';
  const sign = gap >= 0 ? '' : '−';
  return `${sign}${Math.abs(Math.round(gap * 100))} pp`;
}

function renderTransfer() {
  const report = store.getTransferReport();
  const settings = store.getTransferSettings();
  const tier = report.tier;
  const pressure = pressureSummary(store.getTransferTrials());
  const reserved = holdoutTemplates(tier);
  const benchmarks = store.getTransferBenchmarks();
  const last = benchmarks[benchmarks.length - 1] || null;

  $('#th-panel-transfer').innerHTML = `
    <div class="card th-card--main">
      <p class="th-kicker">Real World Transfer</p>
      <h2 class="th-big">${report.realWorldIndex}</h2>
      <p class="th-hint">Índice de Mundo Real · faixa ${tier} de ${MAX_TIER} — ${esc(TRANSFER_TIERS[tier].name)}</p>
      <div class="row row--wrap">
        <button class="btn btn--primary" data-transfer-train="real-world">Treinar transferência</button>
        <button class="btn btn--ghost" data-transfer-train="chaos-mode">Modo Caos</button>
      </div>
    </div>

    <div class="tiles">
      ${tile(report.generalization === null ? '—' : pct(report.generalization), 'generalização')}
      ${tile(gapLabel(report.transferGap), 'lacuna de transferência')}
      ${tile(report.novelAccuracy === null ? '—' : pct(report.novelAccuracy), 'acerto em material novo')}
      ${tile(report.trainedAccuracy === null ? '—' : pct(report.trainedAccuracy), 'acerto no já treinado')}
      ${tile(report.novelTrials, 'tentativas novas')}
      ${tile(report.trials, 'tentativas na janela')}
    </div>
    <p class="chart__caption">A lacuna é a diferença entre acertar no material já treinado e no material novo.
      Quanto menor, mais a habilidade sobrevive fora do formato de treino. São índices internos do app,
      não medidas científicas validadas.</p>

    <div class="card">
      <h2 class="card__title">O que o treino está fazendo</h2>
      <p class="th-big-line">${esc(pressure.label)}</p>
      <p class="th-hint">${esc(pressure.reason)}</p>
      ${report.overfit.overfit ? `<p class="th-warn">O desempenho está preso ao material treinado
        (${gapLabel(report.overfit.gap)} de diferença). O currículo já está variando mais o material
        em vez de encurtar o tempo.</p>` : ''}
    </div>

    <div class="card">
      <h2 class="card__title">Escada de material</h2>
      ${tierLadderMarkup(tier)}
      <p class="chart__caption">A faixa só sobe com bom desempenho em material que você ainda não treinou.</p>
    </div>

    <div class="card">
      <h2 class="card__title">Por formato</h2>
      ${familyRowsMarkup(report.families)}
      <p class="chart__caption">"novo" é o acerto em modelos inéditos ou reservados daquele formato.</p>
    </div>

    <div class="card">
      <h2 class="card__title">Pressão de transferência</h2>
      <div class="segmented" id="th-transfer-preset">
        ${Object.values(TRANSFER_PRESETS).map((p) => (
          `<button class="segmented__opt" data-transfer-preset="${p.id}"
            aria-checked="${settings.preset === p.id}" role="radio">${esc(p.label)}</button>`
        )).join('')}
      </div>
      <p class="field__hint" id="th-transfer-preset-hint">${esc(TRANSFER_PRESETS[settings.preset]?.blurb || '')}</p>

      <div id="th-transfer-custom" ${settings.preset === 'custom' ? '' : 'hidden'}>
        <div class="field__head">
          <span class="field__label">Material inédito</span>
          <output class="field__value" id="out-novelty">${Math.round((settings.noveltyRate ?? 0.45) * 100)}%</output>
        </div>
        <input class="stepper__range" type="range" id="th-novelty" min="20" max="85" step="5"
               value="${Math.round((settings.noveltyRate ?? 0.45) * 100)}" aria-label="Material inédito" />

        <div class="field__head">
          <span class="field__label">Profundidade das perguntas</span>
          <output class="field__value" id="out-querybias">${settings.queryBias > 0 ? '+' : ''}${settings.queryBias || 0}</output>
        </div>
        <input class="stepper__range" type="range" id="th-querybias" min="-1" max="1" step="1"
               value="${settings.queryBias || 0}" aria-label="Profundidade das perguntas" />
      </div>

      <div class="field">
        <div class="field__head">
          <span class="field__label">Travar a faixa</span>
          <output class="field__value" id="out-lock">${settings.lockedTier === null ? 'automática' : `faixa ${settings.lockedTier}`}</output>
        </div>
        <input class="stepper__range" type="range" id="th-lock-tier" min="-1" max="${MAX_TIER}" step="1"
               value="${settings.lockedTier === null ? -1 : settings.lockedTier}" aria-label="Travar a faixa" />
        <p class="field__hint">À esquerda de tudo, o app escolhe a faixa sozinho.</p>
      </div>
    </div>

    <div class="card">
      <h2 class="card__title">Transfer Benchmark</h2>
      <p class="th-hint">Protocolo fixo em modelos reservados — material que nunca aparece no treino.
        Serve para comparar dias com a mesma régua.</p>
      ${last ? `<div class="th-records">
        <div class="th-record-row"><span>Último resultado</span><span>${pct(last.accuracy)} · ${fmtDateTime(last.completedAt)}</span></div>
        ${last.blocks.map((b) => `<div class="th-record-row"><span>${esc(b.label)}</span><span>${pct(b.accuracy)}</span></div>`).join('')}
      </div>` : ''}
      ${benchmarks.length > 1 ? `<div class="chart chart--bars">${barChart(benchmarks.map((b) => ({ value: Math.round(b.accuracy * 100), max: 100 })))}</div>
        <p class="chart__caption">Acerto por execução do protocolo v${last.protocolVersion}.</p>` : ''}
      <button class="btn btn--primary" data-transfer-train="transfer-benchmark">Rodar benchmark</button>
    </div>

    <div class="card">
      <h2 class="card__title">Modelos reservados desta faixa</h2>
      <div class="th-records">${reserved.map((t) => `<div class="th-record-row">
        <span>${esc(t.label)}</span><span>${esc(t.familyId)}</span>
      </div>`).join('') || '<p class="th-hint">Nenhum nesta faixa.</p>'}</div>
      <p class="chart__caption">Eles nunca aparecem em treino. Só assim dá para medir se a habilidade
        transferiu, em vez de medir prática no mesmo material.</p>
    </div>`;

  bindTransferEvents();
}

function bindTransferEvents() {
  $$('[data-transfer-train]').forEach((btn) => {
    btn.addEventListener('click', () => openQuickTrain(btn.dataset.transferTrain));
  });

  $$('[data-transfer-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.transferPreset;
      const preset = TRANSFER_PRESETS[id];
      store.updateTransferSettings({
        preset: id,
        noveltyRate: preset.noveltyRate,
        tierBias: preset.tierBias,
        queryBias: preset.queryBias,
      });
      render();
    });
  });

  const novelty = $('#th-novelty');
  novelty?.addEventListener('input', () => {
    $('#out-novelty').textContent = `${novelty.value}%`;
  });
  novelty?.addEventListener('change', () => {
    store.updateTransferSettings({ noveltyRate: Number(novelty.value) / 100 });
  });

  const queryBias = $('#th-querybias');
  queryBias?.addEventListener('input', () => {
    const v = Number(queryBias.value);
    $('#out-querybias').textContent = `${v > 0 ? '+' : ''}${v}`;
  });
  queryBias?.addEventListener('change', () => {
    store.updateTransferSettings({ queryBias: Number(queryBias.value) });
  });

  const lock = $('#th-lock-tier');
  lock?.addEventListener('input', () => {
    const v = Number(lock.value);
    $('#out-lock').textContent = v < 0 ? 'automática' : `faixa ${v}`;
  });
  lock?.addEventListener('change', () => {
    const v = Number(lock.value);
    store.updateTransferSettings({ lockedTier: v < 0 ? null : v });
  });
}

/* -------------------------------- progresso ------------------------------ */

function renderProgress() {
  const dashboard = store.getDashboard();
  const moduleId = state.moduleFilter === 'all' ? null : state.moduleFilter;
  const series = store.getDailySeries(moduleId, state.range);
  const comparisons = store.getComparisons(moduleId);
  const stats = moduleId ? store.getModuleStats(moduleId) : null;

  const filters = ['all', ...MODULE_IDS].map((id) => (
    `<button class="chip${state.moduleFilter === id ? ' is-active' : ''}" data-module-filter="${id}">`
    + `${id === 'all' ? 'Tudo' : esc(MODULE_SPECS[id].name)}</button>`
  )).join('');

  const comparisonRow = (label, value) => `<div class="th-record-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  const delta = (now, before) => {
    if (before === null || before === undefined || !before) return '—';
    const d = ((now - before) / before) * 100;
    return `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))}%`;
  };

  $('#th-panel-progress').innerHTML = `
    <div class="tiles">
      ${tile(dashboard.throughput || '—', 'throughput médio')}
      ${tile(formatMs(moduleId ? stats.bests?.bestExposureMs : dashboard.bestExposureMs), 'melhor exposição')}
      ${tile(moduleId ? (stats.bests?.bestItems || '—') : (dashboard.bestItems || '—'), 'mais itens')}
      ${tile(dashboard.accuracy === null ? '—' : pct(dashboard.accuracy), 'precisão média')}
      ${tile(fmtDuration(dashboard.trainingMs), 'tempo de treino')}
      ${tile(dashboard.totalTrials, 'tentativas')}
    </div>

    <div class="chips">${filters}</div>
    ${rangeChips()}

    <div class="card">
      <h2 class="card__title">Precisão</h2>
      <div class="chart">${lineChart(series.map((d) => ({ value: d.accuracy })), -1)}</div>
      <h2 class="card__title">Iconic Throughput</h2>
      <div class="chart chart--bars">${barChart(series.map((d) => ({ value: d.throughput, max: 1000 })))}</div>
      <h2 class="card__title">Melhor exposição do dia</h2>
      <div class="chart chart--bars">${barChart(series.map((d) => ({
        value: d.bestExposureMs === null ? 0 : Math.max(0, 1000 - d.bestExposureMs),
        max: 1000,
      })))}</div>
      <p class="chart__caption">Barra maior é exposição menor: quanto mais alto, mais rápido.</p>
    </div>

    ${comparisons ? `<div class="card">
      <h2 class="card__title">Comparação</h2>
      <div class="th-records">
        ${comparisonRow('vs. ontem', delta(comparisons.today.throughput, comparisons.yesterday?.throughput))}
        ${comparisonRow('vs. média de 7 dias', delta(comparisons.today.throughput, comparisons.average7))}
        ${comparisonRow('vs. média de 30 dias', delta(comparisons.today.throughput, comparisons.average30))}
      </div>
      <p class="chart__caption">Variação do desempenho no exercício, não do seu cérebro.</p>
    </div>` : ''}

    <div class="card">
      <h2 class="card__title">Consistência de treino</h2>
      ${heatmapMarkup(store.getDailySeries(null, 0))}
      <p class="chart__caption">Cada quadrado é um dia; mais claro, mais tentativas.</p>
    </div>`;

  $$('[data-module-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.moduleFilter = btn.dataset.moduleFilter;
      render();
    });
  });
  bindRangeChips();
}

function heatmapMarkup(series) {
  const byDay = new Map(series.map((d) => [d.day, d]));
  const max = Math.max(1, ...series.map((d) => d.trials));
  const days = [];
  for (let i = 69; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const entry = byDay.get(date);
    const level = entry ? Math.ceil((entry.trials / max) * 4) : 0;
    days.push(`<i class="th-heat__cell" data-level="${level}" title="${date}${entry ? ` · ${entry.trials} tentativas` : ''}"></i>`);
  }
  return `<div class="th-heat">${days.join('')}</div>`;
}

/* ------------------------------ configuração ----------------------------- */

function renderConfig() {
  const settings = store.getSettings();
  const routine = state.draftRoutine || JSON.parse(JSON.stringify(store.getActiveRoutine()));
  state.draftRoutine = routine;

  const rows = routine.modules.map((block, i) => {
    const spec = MODULE_SPECS[block.moduleId];
    return `<div class="th-row" data-index="${i}">
        <div class="th-row__head">
          <span class="th-row__name">${esc(spec.name)}</span>
          <span class="th-row__time">${minutesLabel(block.minutes)}</span>
        </div>
        <div class="th-row__controls">
          <button class="th-mini" data-move="up" data-index="${i}" aria-label="Subir">↑</button>
          <button class="th-mini" data-move="down" data-index="${i}" aria-label="Descer">↓</button>
          <button class="th-mini" data-minutes="-1" data-index="${i}" aria-label="Menos tempo">−</button>
          <button class="th-mini" data-minutes="1" data-index="${i}" aria-label="Mais tempo">+</button>
          <select class="th-select" data-preset-for="${i}" aria-label="Dificuldade">
            ${Object.values(PRESETS).filter((p) => p.id !== 'custom').map((p) => (
              `<option value="${p.id}"${block.preset === p.id ? ' selected' : ''}>${esc(p.label)}</option>`
            )).join('')}
          </select>
          <select class="th-select" data-stimulus-for="${i}" aria-label="Estímulo">
            ${spec.stimulusTypes.map((t) => (
              `<option value="${t}"${block.stimulus === t ? ' selected' : ''}>${esc(STIMULUS_TYPES[t].label)}</option>`
            )).join('')}
          </select>
          <button class="th-mini th-mini--danger" data-remove="${i}" aria-label="Remover">✕</button>
        </div>
      </div>`;
  }).join('');

  const available = MODULE_IDS.map((id) => `<option value="${id}">${esc(MODULE_SPECS[id].name)}</option>`).join('');
  const toggle = (id, label, hint, on) => `<label class="switch">
      <span><strong>${esc(label)}</strong><small>${esc(hint)}</small></span>
      <input type="checkbox" data-setting="${id}"${on ? ' checked' : ''} />
      <span class="switch__track" aria-hidden="true"></span>
    </label>`;

  $('#th-panel-config').innerHTML = `
    <div class="card">
      <h2 class="card__title">Rotina</h2>
      <div class="th-rows">${rows}</div>
      <p class="th-total">Total: ${routineTotalMinutes(routine)} min</p>
      <div class="row row--wrap">
        <select class="th-select" id="th-add-module">${available}</select>
        <button class="btn btn--ghost" id="th-add">+ Adicionar</button>
      </div>
      <div class="row row--wrap">
        <button class="btn btn--ghost" id="th-restore">Restaurar padrão</button>
        <button class="btn btn--primary" id="th-save-routine">Salvar rotina</button>
      </div>
    </div>

    <div class="card">
      <h2 class="card__title">Treino</h2>
      ${toggle('adaptive', 'Dificuldade adaptativa', 'Desligada, cada módulo usa os parâmetros manuais.', settings.adaptive)}
      ${toggle('countdown', 'Contagem inicial', '3, 2, 1 antes de começar e ao retomar.', settings.countdown)}
      ${toggle('masking', 'Permitir máscara', 'Vale para os módulos que usam interferência visual.', settings.masking)}
      ${toggle('sound', 'Som', 'Retorno sonoro depois da resposta, nunca durante a exposição.', settings.sound)}
      ${toggle('immersive', 'Modo imersivo', 'Esconde a navegação durante o treino.', settings.immersive)}
      ${toggle('advancedMetrics', 'Métricas avançadas', 'Mostra taxa de atualização, quadro e parâmetros durante o treino.', settings.advancedMetrics)}
      <div class="field">
        <div class="field__head"><span class="field__label">Feedback</span></div>
        <div class="segmented" id="th-feedback-mode">
          ${['full', 'minimal', 'none'].map((m) => (
            `<button class="segmented__opt" data-feedback="${m}" role="radio" aria-checked="${settings.feedback === m}">`
            + `${m === 'full' ? 'Completo' : m === 'minimal' ? 'Mínimo' : 'Nenhum'}</button>`
          )).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card__title">Estímulos disponíveis</h2>
      ${Object.values(STIMULUS_TYPES).map((t) => (
        `<label class="switch"><span><strong>${esc(t.label)}</strong></span>`
        + `<input type="checkbox" data-stimulus-type="${t.id}"${settings.stimulusTypes[t.id] ? ' checked' : ''} />`
        + '<span class="switch__track" aria-hidden="true"></span></label>'
      )).join('')}
    </div>

    <div class="card card--soft">
      <h2 class="card__title">Calibração</h2>
      <p class="th-hint">Cada módulo aprende o seu nível nas primeiras tentativas. Recalibrar zera essa estimativa.</p>
      <div class="row row--wrap">
        ${MODULE_IDS.filter((id) => MODULE_SPECS[id].adaptive !== false).map((id) => (
          `<button class="btn btn--ghost" data-recalibrate="${id}">${esc(MODULE_SPECS[id].name)}</button>`
        )).join('')}
      </div>
      <p class="chart__caption">Sua tela: ${getRefreshHz()} Hz · um quadro a cada ${getFrameMs().toFixed(1)} ms.</p>
      <button class="btn btn--ghost" id="th-show-onboarding">Rever a introdução</button>
    </div>`;

  bindConfigEvents(routine);
}

function bindConfigEvents(routine) {
  const panel = $('#th-panel-config');

  panel.addEventListener('click', (e) => {
    const move = e.target.closest('[data-move]');
    const minutes = e.target.closest('[data-minutes]');
    const remove = e.target.closest('[data-remove]');
    const recalibrate = e.target.closest('[data-recalibrate]');

    if (move) {
      const i = Number(move.dataset.index);
      const j = move.dataset.move === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= routine.modules.length) return;
      [routine.modules[i], routine.modules[j]] = [routine.modules[j], routine.modules[i]];
      renderConfig();
      return;
    }
    if (minutes) {
      const i = Number(minutes.dataset.index);
      const delta = Number(minutes.dataset.minutes);
      routine.modules[i].minutes = Math.max(1, Math.min(60, routine.modules[i].minutes + delta));
      renderConfig();
      return;
    }
    if (remove) {
      routine.modules.splice(Number(remove.dataset.remove), 1);
      renderConfig();
      return;
    }
    if (recalibrate) {
      store.recalibrate(recalibrate.dataset.recalibrate);
      hooks.toast?.(`${MODULE_SPECS[recalibrate.dataset.recalibrate].name} recalibrado.`);
    }
  });

  panel.addEventListener('change', (e) => {
    const preset = e.target.closest('[data-preset-for]');
    const stimulus = e.target.closest('[data-stimulus-for]');
    const setting = e.target.closest('[data-setting]');
    const stimulusType = e.target.closest('[data-stimulus-type]');

    if (preset) routine.modules[Number(preset.dataset.presetFor)].preset = preset.value;
    if (stimulus) routine.modules[Number(stimulus.dataset.stimulusFor)].stimulus = stimulus.value;
    if (setting) {
      store.updateSettings({ [setting.dataset.setting]: setting.checked });
      state.view?.setAdvancedMetrics(store.getSettings().advancedMetrics);
    }
    if (stimulusType) {
      const types = { ...store.getSettings().stimulusTypes, [stimulusType.dataset.stimulusType]: stimulusType.checked };
      store.updateSettings({ stimulusTypes: types });
    }
  });

  $('#th-feedback-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feedback]');
    if (!btn) return;
    store.updateSettings({ feedback: btn.dataset.feedback });
    renderConfig();
  });

  $('#th-add').addEventListener('click', () => {
    const moduleId = $('#th-add-module').value;
    const spec = MODULE_SPECS[moduleId];
    routine.modules.push({
      moduleId,
      minutes: spec.defaultMinutes,
      preset: 'tryhard',
      adaptive: spec.adaptive !== false,
      stimulus: spec.defaultStimulus,
    });
    renderConfig();
  });

  $('#th-save-routine').addEventListener('click', () => {
    if (!routine.modules.length) { hooks.toast?.('A rotina precisa de ao menos um exercício.'); return; }
    const saved = { ...routine, isDefault: false, id: routine.isDefault ? `routine-${Date.now().toString(36)}` : routine.id, name: routine.isDefault ? 'Minha rotina' : routine.name };
    store.saveRoutine(saved);
    state.draftRoutine = null;
    hooks.toast?.('Rotina salva.');
    state.tab = 'today';
    render();
  });

  $('#th-restore').addEventListener('click', () => {
    store.restoreDefaultRoutine();
    state.draftRoutine = null;
    hooks.toast?.('Rotina padrão restaurada.');
    render();
  });

  $('#th-show-onboarding').addEventListener('click', () => showOnboarding(true));
}

/* ------------------------------ onboarding ------------------------------- */

const ONBOARDING = [
  { title: 'Treino de alta intensidade', text: 'Você verá estímulos por frações de segundo. Nada pisca a tela inteira: só o estímulo aparece e some.' },
  { title: 'Não mova os olhos', text: 'Nos exercícios com cruz central, mantenha o olhar no ponto. O app não tem como saber para onde você olhou — isso depende de você.' },
  { title: 'Não tente falar tudo por dentro', text: 'Vários exercícios foram feitos para favorecer a percepção visual paralela, não a repetição verbal.' },
  { title: 'Errar faz parte', text: 'A dificuldade se ajusta ao seu desempenho e procura te manter entre 70% e 85% de acerto.' },
];

export function showOnboarding(force = false, onDone = null) {
  const settings = store.getSettings();
  if (settings.onboarded && !force) return false;

  const el = $('#th-onboarding');
  let index = 0;
  const draw = () => {
    const step = ONBOARDING[index];
    el.innerHTML = `<div class="th-onboarding__panel">
        <p class="th-kicker">${index + 1} de ${ONBOARDING.length}</p>
        <h2 class="th-big">${esc(step.title)}</h2>
        <p class="prose">${esc(step.text)}</p>
        <div class="row">
          <button class="btn btn--ghost" data-onboarding="skip">Pular</button>
          <button class="btn btn--primary" data-onboarding="next">${index === ONBOARDING.length - 1 ? 'Começar' : 'Avançar'}</button>
        </div>
      </div>`;
  };
  draw();
  el.hidden = false;
  el.onclick = (e) => {
    const action = e.target.closest('[data-onboarding]')?.dataset.onboarding;
    if (!action) return;
    if (action === 'next' && index < ONBOARDING.length - 1) { index += 1; draw(); return; }
    el.hidden = true;
    el.onclick = null;
    store.updateSettings({ onboarded: true });
    // Quem chegou aqui tentando treinar continua de onde parou — inclusive
    // quem pulou a apresentação: pular é pular o texto, não o treino.
    onDone?.();
  };
  return true;
}

/* -------------------------------- sessão --------------------------------- */

async function startRoutine(routine) {
  if (state.running) return;
  if (showOnboarding(false, () => startRoutine(routine))) return;

  state.running = true;
  const overlay = $('#th-play');
  overlay.hidden = false;
  document.body.classList.toggle('th-immersive', store.getSettings().immersive !== false);
  hooks.setChromeHidden?.(true);

  const control = createControl();
  state.control = control;
  const view = createView({
    stage: $('#th-stage'),
    center: $('#th-center'),
    stimulus: $('#th-stimulus'),
    prompt: $('#th-prompt'),
    response: $('#th-response'),
    feedback: $('#th-feedback'),
    summary: $('#th-summary'),
    moduleName: $('#th-module-name'),
    position: $('#th-position'),
    counter: $('#th-counter'),
    bar: $('#th-bar'),
    metrics: $('#th-metrics'),
    sessionBar: $('#th-session-bar'),
  });
  view.setAdvancedMetrics(store.getSettings().advancedMetrics);
  view.bindControl(control);
  state.view = view;
  view.reset();

  let session = null;
  try {
    session = await runRoutineSession(routine, view, control, {});
  } finally {
    state.running = false;
    state.control = null;
    view.reset();
    overlay.hidden = true;
    document.body.classList.remove('th-immersive');
    hooks.setChromeHidden?.(false);
  }

  if (session && session.trials > 0) showSessionResult(session);
  state.detailModule = null;
  render();
}

/** Resumo de transferência, quando a sessão passou por um módulo do Mundo real. */
function transferResultMarkup(session) {
  const blocks = session.modules.filter((m) => m.transfer);
  if (!blocks.length) return '';
  const last = blocks[blocks.length - 1].transfer;
  const moved = last.tierAfter !== undefined && last.tierAfter !== last.tierBefore;
  const parts = [];
  if (last.blockTrials !== undefined) {
    parts.push(`${last.novelTrials} de ${last.blockTrials} exposições em material novo`);
  }
  if (last.families?.length) parts.push(`${last.families.length} formato(s)`);
  if (last.transferGap !== null && last.transferGap !== undefined) {
    parts.push(`lacuna ${gapLabel(last.transferGap)}`);
  }

  return `<div class="th-result__transfer">
      <p class="th-kicker">Mundo real</p>
      ${last.realWorldIndex !== undefined ? `<p class="th-big-line">Índice ${last.realWorldIndex}</p>` : ''}
      ${parts.length ? `<p class="th-hint">${esc(parts.join(' · '))}</p>` : ''}
      ${moved ? `<p class="th-record">Faixa ${last.tierBefore} → ${last.tierAfter}: ${esc(TRANSFER_TIERS[last.tierAfter].name)}</p>` : ''}
      ${last.pressureReason ? `<p class="th-hint">${esc(last.pressureReason)}</p>` : ''}
    </div>`;
}

function showSessionResult(session) {
  const previous = store.getSessions().filter((s) => s.id !== session.id).slice(-5);
  const previousThroughput = previous.length
    ? Math.round(previous.reduce((a, s) => a + (s.throughput || 0), 0) / previous.length)
    : null;

  $('#th-panel-today').scrollIntoView?.({ block: 'start' });
  const result = $('#th-result');
  result.hidden = false;
  result.innerHTML = `<div class="th-result__panel">
      <p class="th-kicker">${session.completed ? 'Try Hard completo' : 'Sessão encerrada'}</p>
      <h2 class="th-big">${esc(session.routineName || 'Treino')}</h2>
      <div class="tiles">
        ${tile(fmtDuration(session.durationMs), 'tempo')}
        ${tile(pct(session.accuracy), 'precisão média')}
        ${tile(formatMs(session.bestExposureMs), 'melhor exposição')}
        ${tile(session.correctItems, 'itens recuperados')}
        ${tile(session.throughput, 'throughput')}
        ${tile(session.personalBests, 'recordes')}
      </div>
      ${previousThroughput !== null ? `<p class="th-hint">Throughput médio das últimas sessões: ${previousThroughput}.</p>` : ''}
      <div class="th-result__modules">
        ${session.modules.map((m) => `<div class="th-record-row">
            <span>${esc(m.name)}</span>
            <span>${m.trials} tentativas · ${pct(m.accuracy)} · ${formatMs(m.bestExposureMs)}</span>
          </div>`).join('')}
      </div>
      ${transferResultMarkup(session)}
      <button class="btn btn--primary btn--lg" data-result="close">Concluir</button>
    </div>`;
  result.onclick = (e) => {
    if (!e.target.closest('[data-result]')) return;
    result.hidden = true;
    result.onclick = null;
  };
}

/* ------------------------------- inicialização --------------------------- */

export function initTryHard(externalHooks = {}) {
  hooks = externalHooks;

  $$('[data-th-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.thTab;
      state.detailModule = null;
      render();
    });
  });

  $('#th-quit').addEventListener('click', async () => {
    if (!state.control) return;
    const ok = await (hooks.confirm?.('Encerrar o treino?', 'As tentativas já respondidas ficam salvas.', 'Encerrar') ?? Promise.resolve(true));
    if (ok) state.control.abort();
  });

  $('#th-pause').addEventListener('click', () => {
    if (!state.control) return;
    if (state.control.paused) {
      $('#th-paused').hidden = true;
      state.control.resume();
    } else {
      state.control.pause();
      state.view?.reset();
      $('#th-paused').hidden = false;
    }
  });

  $('#th-resume').addEventListener('click', () => {
    $('#th-paused').hidden = true;
    state.control?.resume();
  });

  // A medição do quadro é feita uma vez, no primeiro acesso à área.
  measureFrameMs().then(() => { if (state.tab === 'config') render(); });

  render();
}

export function onEnterTryHard() {
  render();
}

/** Exposto para a exportação/importação geral do app. */
export const tryHardStore = store;
