// Persistência do Try Hard.
//
// Segue o padrão do resto do app: localStorage com queda para memória quando o
// navegador bloqueia (aba privada, cookies desligados). Guarda o necessário e
// nada além: tentativas antigas viram agregado diário, e o log cru fica limitado.

import { DEFAULT_ROUTINE, DEFAULT_TRY_HARD_SETTINGS, MODULE_SPECS, TRY_HARD_CONFIG } from './config.js';
import { initialState } from './difficulty.js';
import { calculatePersonalBests, calculateRollingPerformance } from './metrics.js';
import { DEFAULT_TRANSFER_SETTINGS, TRANSFER_CONFIG } from './transfer/config.js';
import { trainedTemplateKeys, transferReport } from './transfer/metrics.js';
import {
  AVAILABILITY_CONFIG, CATEGORY_IDS, DEFAULT_AVAILABILITY_SETTINGS, TRANSFER_CATEGORIES,
} from './availability/config.js';
import { initialAvailabilityState } from './availability/staircase.js';
import { categoryReport } from './availability/index.js';
import { availabilityScore, smooth } from './availability/threshold.js';

const KEY = 'speedmemory.tryhard.v1';
const SESSION_LIMIT = 200;

const memory = new Map();
let backend = {
  getItem(k) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) return v;
    } catch (_) { /* ignorado */ }
    return memory.has(k) ? memory.get(k) : null;
  },
  setItem(k, v) {
    memory.set(k, v);
    try { localStorage.setItem(k, v); } catch (_) { /* ignorado */ }
  },
};

/** Só para testes: troca o armazenamento por um em memória. */
export function setBackendForTesting(custom) {
  backend = custom || {
    store: new Map(),
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
    setItem(k, v) { this.store.set(k, v); },
  };
  cache = null;
}

let cache = null;

function emptyData() {
  return {
    version: TRY_HARD_CONFIG.version,
    settings: { ...DEFAULT_TRY_HARD_SETTINGS },
    routines: [JSON.parse(JSON.stringify(DEFAULT_ROUTINE))],
    activeRoutineId: DEFAULT_ROUTINE.id,
    skills: {},
    sessions: [],
    daily: {},
    trials: {},
    streak: { current: 0, longest: 0, lastDate: null },
    transfer: emptyTransfer(),
    availability: emptyAvailability(),
  };
}

/** Estado da disponibilidade visual: ajustes, escadas por categoria e log. */
function emptyAvailability() {
  return {
    version: AVAILABILITY_CONFIG.version,
    settings: { ...DEFAULT_AVAILABILITY_SETTINGS, modules: {} },
    categories: {},
    trials: {},
    series: [],
    benchmarks: [],
  };
}

/** Estado do Real World Transfer: ajustes, log próprio e benchmarks. */
function emptyTransfer() {
  return {
    version: TRANSFER_CONFIG.version,
    templateVersion: TRANSFER_CONFIG.templateVersion,
    settings: { ...DEFAULT_TRANSFER_SETTINGS },
    tier: 0,
    trials: [],
    benchmarks: [],
  };
}

export function load() {
  if (cache) return cache;
  const raw = backend.getItem(KEY);
  if (!raw) { cache = emptyData(); return cache; }
  try {
    const saved = JSON.parse(raw);
    const data = { ...emptyData(), ...saved };
    data.settings = { ...DEFAULT_TRY_HARD_SETTINGS, ...(saved.settings || {}) };
    data.settings.stimulusTypes = {
      ...DEFAULT_TRY_HARD_SETTINGS.stimulusTypes,
      ...(saved.settings?.stimulusTypes || {}),
    };
    if (!Array.isArray(data.routines) || !data.routines.length) data.routines = emptyData().routines;
    data.transfer = { ...emptyTransfer(), ...(saved.transfer || {}) };
    data.transfer.settings = { ...DEFAULT_TRANSFER_SETTINGS, ...(saved.transfer?.settings || {}) };
    // Modelos mudam entre versões: o log antigo não descreve o material atual.
    if (data.transfer.templateVersion !== TRANSFER_CONFIG.templateVersion) {
      data.transfer.trials = [];
      data.transfer.templateVersion = TRANSFER_CONFIG.templateVersion;
    }
    data.availability = { ...emptyAvailability(), ...(saved.availability || {}) };
    data.availability.settings = {
      ...DEFAULT_AVAILABILITY_SETTINGS,
      ...(saved.availability?.settings || {}),
      modules: { ...(saved.availability?.settings?.modules || {}) },
    };
    cache = data;
  } catch (_) {
    cache = emptyData();
  }
  return cache;
}

export function save(data = cache) {
  cache = data;
  backend.setItem(KEY, JSON.stringify(data));
  return data;
}

export function resetForTesting() {
  cache = emptyData();
  save(cache);
  return cache;
}

/* ------------------------------- ajustes -------------------------------- */

export function getSettings() {
  return load().settings;
}

export function updateSettings(patch) {
  const data = load();
  data.settings = { ...data.settings, ...patch };
  return save(data).settings;
}

/* ------------------------------- rotinas -------------------------------- */

export function getRoutines() {
  return load().routines;
}

export function getActiveRoutine() {
  const data = load();
  return data.routines.find((r) => r.id === data.activeRoutineId) || data.routines[0];
}

export function saveRoutine(routine) {
  const data = load();
  const now = new Date().toISOString();
  const index = data.routines.findIndex((r) => r.id === routine.id);
  const record = { ...routine, updatedAt: now, createdAt: routine.createdAt || now };
  if (index >= 0) data.routines[index] = record;
  else data.routines.push(record);
  data.activeRoutineId = record.id;
  save(data);
  return record;
}

export function restoreDefaultRoutine() {
  const data = load();
  const fresh = JSON.parse(JSON.stringify(DEFAULT_ROUTINE));
  const index = data.routines.findIndex((r) => r.id === fresh.id);
  if (index >= 0) data.routines[index] = fresh;
  else data.routines.unshift(fresh);
  data.activeRoutineId = fresh.id;
  save(data);
  return fresh;
}

/* --------------------------- estado de habilidade ----------------------- */

/** Estado adaptativo de um módulo, criado na primeira vez com calibração ligada. */
export function getSkill(moduleId) {
  const data = load();
  if (!data.skills[moduleId]) {
    data.skills[moduleId] = {
      moduleId,
      state: initialState(moduleId),
      cursor: 0,
      calibrating: true,
      trialsDone: 0,
      trialsSinceChange: 0,
      rollingAccuracy: null,
      bests: {},
      moduleVersion: MODULE_SPECS[moduleId]?.version || 1,
      difficultyEngineVersion: TRY_HARD_CONFIG.difficultyEngineVersion,
      updatedAt: new Date().toISOString(),
    };
    save(data);
  }
  return data.skills[moduleId];
}

export function updateSkill(moduleId, patch) {
  const data = load();
  const current = getSkill(moduleId);
  data.skills[moduleId] = { ...current, ...patch, updatedAt: new Date().toISOString() };
  save(data);
  return data.skills[moduleId];
}

/** Volta o módulo ao estado inicial e reabre a calibração. */
export function recalibrate(moduleId) {
  return updateSkill(moduleId, {
    state: initialState(moduleId),
    cursor: 0,
    calibrating: true,
    trialsSinceChange: 0,
  });
}

/* ------------------------------ tentativas ------------------------------ */

function dayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Forma compacta: o log cru não precisa guardar o estímulo inteiro. */
function compactTrial(trial) {
  return {
    t: trial.timestamp,
    ia: Math.round((trial.itemAccuracy ?? 0) * 1000) / 1000,
    ci: trial.correctItems,
    ti: trial.totalItems,
    ex: trial.actualExposureMs ? Math.round(trial.actualExposureMs * 10) / 10 : null,
    rq: trial.requestedExposureMs ?? null,
    th: trial.throughput ?? 0,
    rt: trial.reactionMs ?? null,
    d: trial.difficulty || {},
    x: trial.exact ? 1 : 0,
    iv: trial.invalid ? 1 : 0,
  };
}

/**
 * Registra uma tentativa: atualiza recordes, agregado do dia e o log limitado.
 * Tentativas invalidadas (aba escondida, giro de tela) entram só como contagem.
 */
export function recordTrial(moduleId, trial) {
  const data = load();
  const skill = getSkill(moduleId);

  if (!data.trials[moduleId]) data.trials[moduleId] = [];
  const log = data.trials[moduleId];
  log.push(compactTrial(trial));
  if (log.length > TRY_HARD_CONFIG.maxStoredTrialsPerModule) {
    log.splice(0, log.length - TRY_HARD_CONFIG.maxStoredTrialsPerModule);
  }

  let beaten = [];
  if (!trial.invalid) {
    const day = dayKey(trial.timestamp);
    if (!data.daily[day]) data.daily[day] = {};
    const bucket = data.daily[day][moduleId] || {
      trials: 0, correctItems: 0, totalItems: 0, throughputSum: 0, bestExposureMs: null, durationMs: 0, exact: 0,
    };
    bucket.trials += 1;
    bucket.correctItems += trial.correctItems || 0;
    bucket.totalItems += trial.totalItems || 0;
    bucket.throughputSum += trial.throughput || 0;
    bucket.exact += trial.exact ? 1 : 0;
    const exposure = trial.actualExposureMs ?? trial.requestedExposureMs;
    if ((trial.itemAccuracy ?? 0) >= TRY_HARD_CONFIG.personalBestMinAccuracy && exposure) {
      bucket.bestExposureMs = bucket.bestExposureMs === null
        ? Math.round(exposure) : Math.min(bucket.bestExposureMs, Math.round(exposure));
    }
    data.daily[day][moduleId] = bucket;

    const pb = calculatePersonalBests(skill.bests, trial);
    beaten = pb.beaten;
    data.skills[moduleId] = {
      ...skill,
      bests: pb.best,
      trialsDone: (skill.trialsDone || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  save(data);
  return { beaten, bests: data.skills[moduleId]?.bests || {} };
}

/** Tentativas guardadas de um módulo, mais recentes por último. */
export function getTrials(moduleId) {
  const log = load().trials[moduleId] || [];
  return log.map((t) => ({
    timestamp: t.t,
    itemAccuracy: t.ia,
    correctItems: t.ci,
    totalItems: t.ti,
    actualExposureMs: t.ex,
    requestedExposureMs: t.rq,
    throughput: t.th,
    reactionMs: t.rt,
    difficulty: t.d,
    exact: !!t.x,
    invalid: !!t.iv,
  }));
}

/* -------------------------------- sessões ------------------------------- */

export function addSession(session) {
  const data = load();
  data.sessions.push(session);
  if (data.sessions.length > SESSION_LIMIT) {
    data.sessions.splice(0, data.sessions.length - SESSION_LIMIT);
  }
  updateStreak(data, session.completedAt || new Date().toISOString());
  save(data);
  return session;
}

export function getSessions(moduleId) {
  const sessions = load().sessions;
  if (!moduleId) return sessions;
  return sessions.filter((s) => s.modules?.some((m) => m.moduleId === moduleId));
}

/** Sequência de dias treinados. Integra com o mesmo registro de sessões. */
function updateStreak(data, isoDate) {
  const today = dayKey(isoDate);
  const streak = data.streak || { current: 0, longest: 0, lastDate: null };
  if (streak.lastDate === today) return streak;

  const yesterday = dayKey(new Date(new Date(today).getTime() - 86400000));
  streak.current = streak.lastDate === yesterday ? streak.current + 1 : 1;
  streak.longest = Math.max(streak.longest || 0, streak.current);
  streak.lastDate = today;
  data.streak = streak;
  return streak;
}

export function getStreak() {
  return load().streak;
}

/* ------------------------------ estatísticas ---------------------------- */

/** Agregados diários de um módulo (ou de todos), do mais antigo ao mais novo. */
export function getDailySeries(moduleId, days = 0) {
  const data = load();
  const entries = Object.entries(data.daily).sort(([a], [b]) => a.localeCompare(b));
  const cutoff = days > 0 ? dayKey(new Date(Date.now() - days * 86400000)) : null;

  return entries
    .filter(([day]) => !cutoff || day >= cutoff)
    .map(([day, modules]) => {
      const list = moduleId ? [modules[moduleId]].filter(Boolean) : Object.values(modules);
      if (!list.length) return null;
      const trials = list.reduce((a, b) => a + b.trials, 0);
      const totalItems = list.reduce((a, b) => a + b.totalItems, 0);
      const correctItems = list.reduce((a, b) => a + b.correctItems, 0);
      const throughputSum = list.reduce((a, b) => a + b.throughputSum, 0);
      const exposures = list.map((b) => b.bestExposureMs).filter((v) => typeof v === 'number');
      return {
        day,
        trials,
        totalItems,
        correctItems,
        accuracy: totalItems ? correctItems / totalItems : 0,
        throughput: trials ? Math.round(throughputSum / trials) : 0,
        bestExposureMs: exposures.length ? Math.min(...exposures) : null,
      };
    })
    .filter(Boolean);
}

/** Números do painel de um módulo, todos derivados de treino real. */
export function getModuleStats(moduleId) {
  const skill = load().skills[moduleId];
  const trials = getTrials(moduleId);
  const valid = trials.filter((t) => !t.invalid);
  const totalItems = valid.reduce((a, t) => a + (t.totalItems || 0), 0);
  const correctItems = valid.reduce((a, t) => a + (t.correctItems || 0), 0);
  const sessions = getSessions(moduleId);

  return {
    moduleId,
    trialsDone: skill?.trialsDone || 0,
    sessions: sessions.length,
    accuracy: totalItems ? correctItems / totalItems : null,
    rolling: calculateRollingPerformance(valid),
    bests: skill?.bests || {},
    difficulty: skill?.state || null,
    calibrating: skill ? !!skill.calibrating : true,
    recentTrials: valid.slice(-60),
  };
}

/** Números do painel geral. */
export function getDashboard() {
  const data = load();
  const modules = Object.keys(data.skills);
  const series = getDailySeries(null, 0);
  const totalTrials = modules.reduce((a, id) => a + (data.skills[id].trialsDone || 0), 0);
  const trainingMs = data.sessions.reduce((a, s) => a + (s.durationMs || 0), 0);
  const bestThroughput = modules.reduce((a, id) => Math.max(a, data.skills[id].bests?.bestThroughput || 0), 0);
  const exposures = modules
    .map((id) => data.skills[id].bests?.bestExposureMs)
    .filter((v) => typeof v === 'number');
  const items = modules.map((id) => data.skills[id].bests?.bestItems || 0);
  const totals = series.reduce((a, d) => ({
    correct: a.correct + d.correctItems,
    total: a.total + d.totalItems,
    throughput: a.throughput + d.throughput * d.trials,
    trials: a.trials + d.trials,
  }), { correct: 0, total: 0, throughput: 0, trials: 0 });

  return {
    totalTrials,
    trainingMs,
    sessions: data.sessions.length,
    accuracy: totals.total ? totals.correct / totals.total : null,
    throughput: totals.trials ? Math.round(totals.throughput / totals.trials) : 0,
    bestThroughput,
    bestExposureMs: exposures.length ? Math.min(...exposures) : null,
    bestItems: items.length ? Math.max(...items) : 0,
    streak: data.streak,
    series,
  };
}

/** Comparação com ontem e com as médias recentes. */
export function getComparisons(moduleId) {
  const series = getDailySeries(moduleId, 0);
  if (!series.length) return null;
  const today = series[series.length - 1];
  const mean = (list, key) => (list.length ? list.reduce((a, d) => a + d[key], 0) / list.length : null);
  const previous = series.slice(0, -1);
  return {
    today,
    yesterday: previous.length ? previous[previous.length - 1] : null,
    average7: mean(previous.slice(-7), 'throughput'),
    average30: mean(previous.slice(-30), 'throughput'),
    accuracy7: mean(previous.slice(-7), 'accuracy'),
  };
}

/* -------------------------- Real World Transfer ------------------------- */

export function getTransferSettings() {
  return load().transfer.settings;
}

export function updateTransferSettings(patch) {
  const data = load();
  data.transfer.settings = { ...data.transfer.settings, ...patch };
  return save(data).transfer.settings;
}

/** Faixa alcançada. Vive fora do estado de dificuldade porque atravessa blocos. */
export function getTransferTier() {
  return load().transfer.tier || 0;
}

export function setTransferTier(tier) {
  const data = load();
  data.transfer.tier = Math.max(0, Math.round(tier));
  save(data);
  return data.transfer.tier;
}

function compactTransferTrial(trial) {
  return {
    t: trial.timestamp,
    f: trial.familyId,
    p: trial.templateId,
    r: trial.tier,
    n: trial.novel ? 1 : 0,
    h: trial.holdout ? 1 : 0,
    a: Math.round((trial.accuracy ?? 0) * 1000) / 1000,
    e: trial.exposureMs ? Math.round(trial.exposureMs * 10) / 10 : null,
    q: trial.queryComplexity || 1,
    k: trial.queryKinds || [],
    m: trial.mode || 'training',
    iv: trial.invalid ? 1 : 0,
  };
}

function expandTransferTrial(t) {
  return {
    timestamp: t.t,
    familyId: t.f,
    templateId: t.p,
    tier: t.r,
    novel: !!t.n,
    holdout: !!t.h,
    accuracy: t.a,
    exposureMs: t.e,
    queryComplexity: t.q,
    queryKinds: t.k || [],
    mode: t.m || 'training',
    invalid: !!t.iv,
  };
}

/** Registra uma tentativa de transferência no log próprio. */
export function recordTransferTrial(trial) {
  const data = load();
  const log = data.transfer.trials;
  log.push(compactTransferTrial(trial));
  if (log.length > TRANSFER_CONFIG.maxStoredTransferTrials) {
    log.splice(0, log.length - TRANSFER_CONFIG.maxStoredTransferTrials);
  }
  save(data);
  return trial;
}

export function getTransferTrials() {
  return load().transfer.trials.map(expandTransferTrial);
}

/** Modelos que a pessoa já treinou — o que o motor de novidade considera visto. */
export function getTrainedTemplateKeys() {
  return trainedTemplateKeys(getTransferTrials());
}

export function getTransferReport() {
  return transferReport(getTransferTrials(), { tier: getTransferTier() });
}

export function addTransferBenchmark(record) {
  const data = load();
  data.transfer.benchmarks.push(record);
  if (data.transfer.benchmarks.length > TRANSFER_CONFIG.maxStoredBenchmarks) {
    data.transfer.benchmarks.splice(0, data.transfer.benchmarks.length - TRANSFER_CONFIG.maxStoredBenchmarks);
  }
  save(data);
  return record;
}

export function getTransferBenchmarks() {
  return load().transfer.benchmarks;
}

/* ------------------------ disponibilidade visual ------------------------ */

export function getAvailabilitySettings() {
  return load().availability.settings;
}

export function updateAvailabilitySettings(patch) {
  const data = load();
  data.availability.settings = { ...data.availability.settings, ...patch };
  return save(data).availability.settings;
}

/** Escolha de um módulo: herdar, ligado ou desligado. */
export function setAvailabilityForModule(moduleId, choice) {
  const data = load();
  const modules = { ...data.availability.settings.modules };
  if (choice === 'inherit') delete modules[moduleId];
  else modules[moduleId] = choice;
  data.availability.settings = { ...data.availability.settings, modules };
  return save(data).availability.settings;
}

/** Escada de uma categoria, criada na primeira vez. */
export function getAvailabilityState(category) {
  const data = load();
  if (!data.availability.categories[category]) {
    data.availability.categories[category] = {
      category,
      ...initialAvailabilityState(data.availability.settings),
      estimatedT80: null,
      smoothedT80: null,
      bestStableT80: null,
      confidence: 'baixa',
      calibratedTrials: 0,
      lastCalibrationAt: null,
      updatedAt: new Date().toISOString(),
    };
    save(data);
  }
  return data.availability.categories[category];
}

export function updateAvailabilityState(category, patch) {
  const data = load();
  const atual = getAvailabilityState(category);
  data.availability.categories[category] = {
    ...atual, ...patch, updatedAt: new Date().toISOString(),
  };
  save(data);
  return data.availability.categories[category];
}

/** Volta a categoria à calibração inicial. */
export function recalibrateAvailability(category) {
  const settings = getAvailabilitySettings();
  return updateAvailabilityState(category, {
    ...initialAvailabilityState(settings),
    calibratedTrials: 0,
    lastCalibrationAt: null,
  });
}

function compactAvailabilityTrial(t) {
  return {
    t: t.timestamp,
    m: t.moduleId,
    d: Math.round(t.delayMs),
    ad: t.actualDelayMs === null || t.actualDelayMs === undefined ? null : Math.round(t.actualDelayMs * 10) / 10,
    a: Math.round((t.accuracy ?? 0) * 1000) / 1000,
    e: t.exposureMs ? Math.round(t.exposureMs) : null,
    r: t.retrievalMs ?? null,
    q: t.queryIndex ?? 1,
    p: t.phase || 'training',
    c: t.cleanRetrieval ? 1 : 0,
    w: t.warmup ? 1 : 0,
    n: t.novel ? 1 : 0,
    h: t.holdout ? 1 : 0,
    iv: t.invalid ? 1 : 0,
  };
}

function expandAvailabilityTrial(t) {
  return {
    timestamp: t.t,
    moduleId: t.m,
    delayMs: t.d,
    actualDelayMs: t.ad,
    accuracy: t.a,
    exposureMs: t.e,
    retrievalMs: t.r,
    queryIndex: t.q ?? 1,
    phase: t.p || 'training',
    cleanRetrieval: !!t.c,
    warmup: !!t.w,
    novel: !!t.n,
    holdout: !!t.h,
    invalid: !!t.iv,
  };
}

export function recordAvailabilityTrial(record) {
  const data = load();
  const cat = record.category;
  if (!data.availability.trials[cat]) data.availability.trials[cat] = [];
  const log = data.availability.trials[cat];
  log.push(compactAvailabilityTrial(record));
  if (log.length > AVAILABILITY_CONFIG.maxStoredTrialsPerCategory) {
    log.splice(0, log.length - AVAILABILITY_CONFIG.maxStoredTrialsPerCategory);
  }
  save(data);
  return record;
}

export function getAvailabilityTrials(category) {
  const log = load().availability.trials[category] || [];
  return log.map(expandAvailabilityTrial);
}

/** Todas as categorias com pelo menos uma tentativa guardada. */
export function getAvailabilityCategories() {
  const data = load();
  return CATEGORY_IDS.filter((id) => (data.availability.trials[id] || []).length > 0);
}

/**
 * Fecha a leitura de uma categoria: estimativa do dia, valor suavizado e
 * recorde. Recorde exige dados suficientes e melhora acima do ruído (§45).
 */
export function closeAvailabilityCategory(category) {
  const state = getAvailabilityState(category);
  const trials = getAvailabilityTrials(category);
  const relatorio = categoryReport(trials, state);
  const cfg = AVAILABILITY_CONFIG;

  const suavizado = smooth(state.smoothedT80, relatorio.t80);
  let melhor = state.bestStableT80;
  // Recorde exige curva de verdade, não uma sorte isolada num atraso curto:
  // a média de acerto aqui é baixa de propósito, porque a escada precisa
  // amostrar abaixo do limiar para saber onde ele está.
  const podeSerRecorde = relatorio.t80 !== null
    && relatorio.source === 'curva'
    && relatorio.trials >= cfg.minTrialsForBest
    && relatorio.confidence !== 'baixa';
  if (podeSerRecorde && (melhor === null || relatorio.t80 <= melhor - cfg.bestImprovementMs)) {
    melhor = relatorio.t80;
  }

  updateAvailabilityState(category, {
    estimatedT80: relatorio.t80,
    smoothedT80: suavizado,
    bestStableT80: melhor,
    confidence: relatorio.confidence,
    rollingAccuracy: relatorio.accuracy,
  });
  return { ...relatorio, smoothedT80: suavizado, bestStableT80: melhor };
}

/** Um ponto na série de evolução, gravado ao fim de cada bloco. */
export function addAvailabilityPoint(point) {
  const data = load();
  data.availability.series.push({
    day: dayKey(point.timestamp || new Date().toISOString()),
    c: point.category,
    t: point.t80,
    n: point.trials,
    a: Math.round((point.accuracy ?? 0) * 1000) / 1000,
    e: point.exposureMs ? Math.round(point.exposureMs) : null,
  });
  if (data.availability.series.length > AVAILABILITY_CONFIG.historyLimit) {
    data.availability.series.splice(0, data.availability.series.length - AVAILABILITY_CONFIG.historyLimit);
  }
  save(data);
  return point;
}

/** Série diária do T80 de uma categoria (ou de todas), do mais antigo ao mais novo. */
export function getAvailabilitySeries(category = null, days = 0) {
  const data = load();
  const corte = days > 0 ? dayKey(new Date(Date.now() - days * 86400000)) : null;
  const porDia = new Map();
  for (const p of data.availability.series) {
    if (category && p.c !== category) continue;
    if (corte && p.day < corte) continue;
    if (p.t === null || p.t === undefined) continue;
    if (!porDia.has(p.day)) porDia.set(p.day, { day: p.day, soma: 0, peso: 0, trials: 0, acc: 0, exp: 0 });
    const b = porDia.get(p.day);
    b.soma += p.t * p.n;
    b.peso += p.n;
    b.trials += p.n;
    b.acc += (p.a || 0) * p.n;
    b.exp += (p.e || 0) * p.n;
  }
  return [...porDia.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((b) => ({
      day: b.day,
      t80: b.peso ? Math.round(b.soma / b.peso) : null,
      trials: b.trials,
      accuracy: b.peso ? b.acc / b.peso : 0,
      exposureMs: b.peso ? Math.round(b.exp / b.peso) : null,
    }));
}

export function addAvailabilityBenchmark(record) {
  const data = load();
  data.availability.benchmarks.push(record);
  if (data.availability.benchmarks.length > 40) {
    data.availability.benchmarks.splice(0, data.availability.benchmarks.length - 40);
  }
  save(data);
  return record;
}

export function getAvailabilityBenchmarks() {
  return load().availability.benchmarks;
}

/**
 * Painel completo: uma leitura por categoria, o índice agregado, a
 * disponibilidade em material realista e a distância entre o que foi treinado
 * e o que é novo (§33–§35).
 */
export function getAvailabilityReport() {
  const categorias = {};
  for (const id of getAvailabilityCategories()) {
    categorias[id] = closeAvailabilityCategoryRead(id);
  }

  const realistas = TRANSFER_CATEGORIES.filter((id) => categorias[id]?.t80);
  const transferT80 = realistas.length
    ? Math.round(realistas.reduce((a, id) => a + categorias[id].t80, 0) / realistas.length)
    : null;

  // Treinado × inédito, dentro das mesmas categorias realistas.
  const treinadas = [];
  const novas = [];
  for (const id of TRANSFER_CATEGORIES) {
    const trials = getAvailabilityTrials(id).filter((t) => !t.invalid && !t.warmup && (t.queryIndex ?? 1) === 1);
    if (!trials.length) continue;
    treinadas.push(...trials.filter((t) => !t.novel && !t.holdout));
    novas.push(...trials.filter((t) => t.novel || t.holdout));
  }
  const min = AVAILABILITY_CONFIG.minTrialsForEstimate;
  const treinadoT80 = treinadas.length >= min ? categoryReport(treinadas, null).t80 : null;
  const novoT80 = novas.length >= min ? categoryReport(novas, null).t80 : null;

  return {
    categories: categorias,
    score: availabilityScore(categorias),
    transferT80,
    trainedT80: treinadoT80,
    novelT80: novoT80,
    transferGapMs: treinadoT80 !== null && novoT80 !== null ? novoT80 - treinadoT80 : null,
    settings: getAvailabilitySettings(),
  };
}

/** Leitura sem gravar: o painel não deve mexer no estado ao ser aberto. */
function closeAvailabilityCategoryRead(category) {
  const state = load().availability.categories[category] || null;
  const relatorio = categoryReport(getAvailabilityTrials(category), state);
  return {
    ...relatorio,
    smoothedT80: state?.smoothedT80 ?? relatorio.t80,
    bestStableT80: state?.bestStableT80 ?? null,
  };
}

/** Tudo do Try Hard, para entrar na exportação geral do app. */
export function exportAll() {
  return JSON.parse(JSON.stringify(load()));
}

export function importAll(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Dados do Try Hard inválidos.');
  const data = { ...emptyData(), ...payload };
  return save(data);
}
