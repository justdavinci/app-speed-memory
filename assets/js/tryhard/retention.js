// RETENTION — treino pós-estímulo complementar à Disponibilidade Visual.
//
// Disponibilidade pergunta "quão cedo a informação já pode ser usada?" e
// tenta REDUZIR o atraso. Retenção pergunta "por quanto tempo ela continua
// utilizável?" e tenta AUMENTAR o atraso. Logs e estados são separados para
// que segundos de espera nunca contaminem o T80 de disponibilidade.

import { moduleSupportsAvailability } from './availability/config.js';
import { categoryFor } from './availability/categories.js';

export const RETENTION_CONFIG = {
  version: 1,
  targetAccuracy: 0.80,
  upperMargin: 0.05,
  lowerMargin: 0.15,
  rollingWindow: 6,
  minTrialsBetweenChanges: 3,
  minTrialsForEstimate: 12,
  minLevelsForEstimate: 3,
  maxStoredTrialsPerCategory: 300,
  historyLimit: 200,
  ladderMs: [250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000, 15000, 20000, 30000],
};

export const DEFAULT_RETENTION_SETTINGS = {
  enabled: false,
  share: 0.35,
  mode: 'adaptive', // adaptive | fixed | range
  targetAccuracy: RETENTION_CONFIG.targetAccuracy,
  initialDelayMs: 1500,
  minDelayMs: 250,
  maxDelayMs: 15000,
  fixedDelayMs: 3000,
  rangeMinMs: 1000,
  rangeMaxMs: 5000,
};

// Nesta primeira versão Retenção significa manutenção em branco. Mask
// Resistance já injeta interferência antes da pergunta, portanto mede outro
// construto e fica reservado para um futuro eixo de Interference Resistance.
const RETENTION_EXCLUDED_MODULES = new Set(['mask-resistance']);
const STORAGE_KEY = 'speedmemory.retention.v1';
const memory = new Map();
let cache = null;
let backend = {
  getItem(k) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) return v;
    } catch (_) { /* private mode / tests */ }
    return memory.get(k) ?? null;
  },
  setItem(k, v) {
    memory.set(k, v);
    try { localStorage.setItem(k, v); } catch (_) { /* ignore */ }
  },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function emptyData() {
  return {
    version: RETENTION_CONFIG.version,
    settings: { ...DEFAULT_RETENTION_SETTINGS },
    categories: {},
    trials: {},
    series: [],
  };
}

function load() {
  if (cache) return cache;
  const raw = backend.getItem(STORAGE_KEY);
  if (!raw) return (cache = emptyData());
  try {
    const saved = JSON.parse(raw);
    cache = {
      ...emptyData(),
      ...saved,
      settings: { ...DEFAULT_RETENTION_SETTINGS, ...(saved.settings || {}) },
      categories: saved.categories || {},
      trials: saved.trials || {},
      series: Array.isArray(saved.series) ? saved.series : [],
    };
  } catch (_) {
    cache = emptyData();
  }
  return cache;
}

function save(data = cache) {
  cache = data;
  backend.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

export function setRetentionBackendForTesting(custom) {
  backend = custom || {
    store: new Map(),
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
    setItem(k, v) { this.store.set(k, v); },
  };
  cache = null;
}

export function resetRetentionForTesting() {
  cache = emptyData();
  save(cache);
  return cache;
}

export function getRetentionSettings() {
  return load().settings;
}

export function updateRetentionSettings(patch) {
  const data = load();
  data.settings = { ...data.settings, ...patch };
  save(data);
  return data.settings;
}

export function resolveRetentionSettings(settings) {
  return { ...DEFAULT_RETENTION_SETTINGS, ...(settings || {}) };
}

export function retentionActiveFor(moduleId, settings = getRetentionSettings()) {
  const s = resolveRetentionSettings(settings);
  return !!s.enabled
    && s.share > 0
    && moduleSupportsAvailability(moduleId)
    && !RETENTION_EXCLUDED_MODULES.has(moduleId);
}

function allowedLadder(s) {
  return RETENTION_CONFIG.ladderMs.filter((v) => v >= s.minDelayMs && v <= s.maxDelayMs);
}

function nearestIndex(values, value) {
  if (!values.length) return 0;
  let best = 0;
  let dist = Infinity;
  values.forEach((v, i) => {
    const d = Math.abs(v - value);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

export function initialRetentionState(settings) {
  const s = resolveRetentionSettings(settings);
  const ladder = allowedLadder(s);
  return {
    currentDelayMs: ladder[nearestIndex(ladder, s.initialDelayMs)] || s.initialDelayMs,
    trialsSinceChange: 0,
    rollingAccuracy: null,
    estimatedT80: null,
    smoothedT80: null,
    confidence: 'baixa',
  };
}

export function getRetentionState(category) {
  const data = load();
  if (!data.categories[category]) {
    data.categories[category] = {
      category,
      ...initialRetentionState(data.settings),
      updatedAt: new Date().toISOString(),
    };
    save(data);
  }
  return data.categories[category];
}

export function updateRetentionState(category, patch) {
  const data = load();
  data.categories[category] = {
    ...getRetentionState(category),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  save(data);
  return data.categories[category];
}

export function recalibrateRetention(category = null) {
  const data = load();
  const ids = category ? [category] : Object.keys(data.categories);
  ids.forEach((id) => {
    data.categories[id] = {
      category: id,
      ...initialRetentionState(data.settings),
      updatedAt: new Date().toISOString(),
    };
  });
  save(data);
}

export function retentionDelay(settings, state, rng = Math.random) {
  const s = resolveRetentionSettings(settings);
  if (s.mode === 'fixed') return clamp(s.fixedDelayMs, s.minDelayMs, s.maxDelayMs);
  if (s.mode === 'range') {
    const lo = clamp(Math.min(s.rangeMinMs, s.rangeMaxMs), s.minDelayMs, s.maxDelayMs);
    const hi = clamp(Math.max(s.rangeMinMs, s.rangeMaxMs), s.minDelayMs, s.maxDelayMs);
    return Math.round(lo + rng() * (hi - lo));
  }
  return state?.currentDelayMs ?? initialRetentionState(s).currentDelayMs;
}

export function planRetentionTrial({ settings, state, rng = Math.random, warmup = false, force = false }) {
  const s = resolveRetentionSettings(settings);
  if (!force && (!s.enabled || rng() >= s.share)) return { active: false };
  return {
    active: true,
    delayMs: retentionDelay(s, state, rng),
    mode: s.mode,
    warmup,
  };
}

export function applyRetentionToTrial(trial, plan, category = categoryFor(trial)) {
  if (!plan?.active) {
    trial.retention = { active: false, category };
    return trial;
  }
  trial.retention = {
    active: true,
    category,
    requestedDelayMs: plan.delayMs,
    mode: plan.mode,
    warmup: !!plan.warmup,
    supersededCueDelayMs: trial.cueDelayMs || 0,
  };
  trial.cueDelayMs = plan.delayMs;
  return trial;
}

export function retentionTrialRecord({ trial, result, record, timing }) {
  if (!trial.retention?.active) return null;
  return {
    timestamp: record.timestamp,
    moduleId: trial.moduleId,
    category: trial.retention.category,
    delayMs: trial.retention.requestedDelayMs,
    actualDelayMs: timing?.actualMs ?? null,
    accuracy: result.itemAccuracy,
    exposureMs: record.actualExposureMs ?? record.requestedExposureMs,
    retrievalMs: record.retrievalMs ?? record.reactionMs ?? null,
    mode: trial.retention.mode,
    warmup: !!trial.retention.warmup,
    invalid: false,
  };
}

function compactTrial(t) {
  return {
    t: t.timestamp,
    m: t.moduleId,
    d: Math.round(t.delayMs),
    ad: t.actualDelayMs === null || t.actualDelayMs === undefined ? null : Math.round(t.actualDelayMs * 10) / 10,
    a: Math.round((t.accuracy ?? 0) * 1000) / 1000,
    e: t.exposureMs ? Math.round(t.exposureMs) : null,
    r: t.retrievalMs ?? null,
    mode: t.mode || 'adaptive',
    w: t.warmup ? 1 : 0,
    iv: t.invalid ? 1 : 0,
  };
}

function expandTrial(t) {
  return {
    timestamp: t.t,
    moduleId: t.m,
    delayMs: t.d,
    actualDelayMs: t.ad,
    accuracy: t.a,
    exposureMs: t.e,
    retrievalMs: t.r,
    mode: t.mode || 'adaptive',
    warmup: !!t.w,
    invalid: !!t.iv,
  };
}

export function recordRetentionTrial(record) {
  const data = load();
  const cat = record.category;
  if (!data.trials[cat]) data.trials[cat] = [];
  data.trials[cat].push(compactTrial(record));
  if (data.trials[cat].length > RETENTION_CONFIG.maxStoredTrialsPerCategory) {
    data.trials[cat].splice(0, data.trials[cat].length - RETENTION_CONFIG.maxStoredTrialsPerCategory);
  }
  save(data);
  return record;
}

export function getRetentionTrials(category) {
  return (load().trials[category] || []).map(expandTrial);
}

/** Escada inversa à Availability: desempenho alto alonga o intervalo. */
export function advanceRetention(state, trials, settings) {
  const s = resolveRetentionSettings(settings);
  const base = { ...(state || initialRetentionState(s)) };
  if (s.mode !== 'adaptive') return { state: base, changed: false, decision: 'hold' };

  const valid = trials
    .filter((t) => !t.invalid && !t.warmup)
    .slice(-RETENTION_CONFIG.rollingWindow);
  if (valid.length < RETENTION_CONFIG.rollingWindow) {
    return { state: base, changed: false, decision: 'hold' };
  }

  const acc = mean(valid.map((t) => t.accuracy)) ?? 0;
  base.rollingAccuracy = acc;
  base.trialsSinceChange = (base.trialsSinceChange || 0) + 1;
  if (base.trialsSinceChange < RETENTION_CONFIG.minTrialsBetweenChanges) {
    return { state: base, changed: false, decision: 'hold' };
  }

  const ladder = allowedLadder(s);
  let idx = nearestIndex(ladder, base.currentDelayMs);
  let decision = 'hold';
  if (acc >= s.targetAccuracy + RETENTION_CONFIG.upperMargin && idx < ladder.length - 1) {
    idx += 1;
    decision = 'longer';
  } else if (acc <= s.targetAccuracy - RETENTION_CONFIG.lowerMargin && idx > 0) {
    idx -= 1;
    decision = 'shorter';
  }
  if (decision === 'hold') return { state: base, changed: false, decision };
  base.currentDelayMs = ladder[idx];
  base.trialsSinceChange = 0;
  return { state: base, changed: true, decision };
}

/**
 * Retention T80 = maior atraso em que a curva ainda cruza aproximadamente
 * 80% de acerto. Usa o atraso realmente entregue quando existe.
 */
export function estimateRetentionT80(trials, target = RETENTION_CONFIG.targetAccuracy) {
  const valid = trials.filter((t) => !t.invalid
    && !t.warmup
    && typeof (t.actualDelayMs ?? t.delayMs) === 'number');
  const accuracy = mean(valid.map((t) => t.accuracy));
  if (valid.length < RETENTION_CONFIG.minTrialsForEstimate) {
    return { t80: null, confidence: 'baixa', trials: valid.length, accuracy };
  }

  const buckets = new Map();
  valid.forEach((t) => {
    const d = Math.round((t.actualDelayMs ?? t.delayMs) / 250) * 250;
    if (!buckets.has(d)) buckets.set(d, []);
    buckets.get(d).push(t.accuracy ?? 0);
  });
  const levels = [...buckets.entries()]
    .map(([delayMs, xs]) => ({ delayMs, accuracy: mean(xs), n: xs.length }))
    .sort((a, b) => a.delayMs - b.delayMs);
  if (levels.length < RETENTION_CONFIG.minLevelsForEstimate) {
    return { t80: null, confidence: 'baixa', trials: valid.length, accuracy, levels };
  }

  let t80 = null;
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1];
    const b = levels[i];
    if (a.accuracy >= target && b.accuracy < target) {
      const denom = a.accuracy - b.accuracy;
      const f = denom > 0 ? (a.accuracy - target) / denom : 0;
      t80 = Math.round(a.delayMs + (b.delayMs - a.delayMs) * f);
      break;
    }
  }
  if (t80 === null) {
    const passing = levels.filter((x) => x.accuracy >= target);
    if (passing.length) t80 = passing[passing.length - 1].delayMs;
  }

  const confidence = valid.length >= 30 && levels.length >= 5
    ? 'alta'
    : valid.length >= 18 && levels.length >= 4 ? 'média' : 'baixa';
  return { t80, confidence, trials: valid.length, accuracy, levels };
}

export function retentionReport(trials, state, settings) {
  const s = resolveRetentionSettings(settings);
  const est = estimateRetentionT80(trials, s.targetAccuracy);
  const rt = trials
    .map((t) => t.retrievalMs)
    .filter((v) => typeof v === 'number' && v > 0);
  return {
    ...est,
    currentDelayMs: state?.currentDelayMs ?? null,
    retrievalMs: rt.length ? Math.round(mean(rt)) : null,
    mode: s.mode,
    calibrating: est.t80 === null,
  };
}

export function closeRetentionCategory(category) {
  const state = getRetentionState(category);
  const trials = getRetentionTrials(category);
  const report = retentionReport(trials, state, getRetentionSettings());
  const smoothed = report.t80 === null
    ? state.smoothedT80
    : state.smoothedT80 === null || state.smoothedT80 === undefined
      ? report.t80
      : Math.round(state.smoothedT80 * 0.65 + report.t80 * 0.35);
  updateRetentionState(category, {
    estimatedT80: report.t80,
    smoothedT80: smoothed,
    confidence: report.confidence,
    rollingAccuracy: report.accuracy,
  });
  return { ...report, smoothedT80: smoothed };
}

export function addRetentionPoint(point) {
  const data = load();
  data.series.push({
    day: new Date(point.timestamp || Date.now()).toISOString().slice(0, 10),
    category: point.category,
    t80: point.t80,
    accuracy: point.accuracy,
    trials: point.trials,
  });
  if (data.series.length > RETENTION_CONFIG.historyLimit) {
    data.series.splice(0, data.series.length - RETENTION_CONFIG.historyLimit);
  }
  save(data);
}

export function getRetentionSeries(category = null) {
  return load().series.filter((p) => !category || p.category === category);
}

export function getRetentionReport() {
  const data = load();
  const categories = {};
  for (const category of Object.keys(data.trials)) {
    const trials = getRetentionTrials(category);
    if (!trials.length) continue;
    categories[category] = retentionReport(
      trials,
      data.categories[category] || null,
      data.settings,
    );
  }

  const valid = Object.values(categories).filter((c) => c.t80 !== null);
  if (!valid.length) {
    const anyState = Object.values(data.categories)[0] || null;
    return {
      t80: null,
      currentDelayMs: anyState?.currentDelayMs ?? data.settings.initialDelayMs,
      confidence: 'sem dados',
      categories,
      settings: data.settings,
    };
  }

  const weighted = valid.reduce((a, c) => a + c.t80 * Math.max(1, c.trials), 0)
    / valid.reduce((a, c) => a + Math.max(1, c.trials), 0);
  const confidence = valid.every((c) => c.confidence === 'alta')
    ? 'alta'
    : valid.some((c) => c.confidence === 'baixa') ? 'baixa' : 'média';
  const current = valid
    .map((c) => c.currentDelayMs)
    .filter((v) => typeof v === 'number');

  return {
    t80: Math.round(weighted),
    currentDelayMs: current.length ? Math.round(mean(current)) : null,
    confidence,
    categories,
    settings: data.settings,
  };
}

/** Pontuação interna 0–100, logarítmica. Não é QI. */
export function retentionPoints(t80) {
  if (t80 === null || t80 === undefined || t80 <= 0) return null;
  const lo = 250;
  const hi = 30000;
  const v = clamp(t80, lo, hi);
  return Math.round(100 * Math.log(v / lo) / Math.log(hi / lo));
}
