// RETENTION — treino pós-estímulo complementar à Disponibilidade Visual.
//
// Disponibilidade pergunta "quão cedo a informação já pode ser usada?" e
// tenta REDUZIR o atraso. Retenção pergunta "por quanto tempo ela continua
// utilizável?" e tenta AUMENTAR o atraso. Os dois logs e estados são separados
// para que segundos de espera nunca contaminem o T80 de disponibilidade.

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
  mode: 'adaptive', // adaptive | fixed | range
  targetAccuracy: RETENTION_CONFIG.targetAccuracy,
  initialDelayMs: 1500,
  minDelayMs: 250,
  maxDelayMs: 15000,
  fixedDelayMs: 3000,
  rangeMinMs: 1000,
  rangeMaxMs: 5000,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function resolveRetentionSettings(settings) {
  return { ...DEFAULT_RETENTION_SETTINGS, ...(settings || {}) };
}

function allowedLadder(s) {
  return RETENTION_CONFIG.ladderMs.filter((v) => v >= s.minDelayMs && v <= s.maxDelayMs);
}

function nearestIndex(values, value) {
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

export function planRetentionTrial({ settings, state, rng = Math.random, warmup = false }) {
  const s = resolveRetentionSettings(settings);
  return {
    active: true,
    delayMs: retentionDelay(s, state, rng),
    mode: s.mode,
    warmup,
  };
}

export function applyRetentionToTrial(trial, plan, category) {
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

/** Escada inversa à disponibilidade: acerto alto alonga o atraso. */
export function advanceRetention(state, trials, settings) {
  const s = resolveRetentionSettings(settings);
  const base = { ...(state || initialRetentionState(s)) };
  if (s.mode !== 'adaptive') return { state: base, changed: false, decision: 'hold' };

  const valid = trials.filter((t) => !t.invalid && !t.warmup).slice(-RETENTION_CONFIG.rollingWindow);
  if (valid.length < RETENTION_CONFIG.rollingWindow) return { state: base, changed: false, decision: 'hold' };
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
    idx += 1; decision = 'longer';
  } else if (acc <= s.targetAccuracy - RETENTION_CONFIG.lowerMargin && idx > 0) {
    idx -= 1; decision = 'shorter';
  }
  if (decision === 'hold') return { state: base, changed: false, decision };
  base.currentDelayMs = ladder[idx];
  base.trialsSinceChange = 0;
  return { state: base, changed: true, decision };
}

/**
 * Estima Retention T80: maior atraso em que a curva ainda cruza ~80%.
 * Usa actualDelayMs quando disponível e interpola o primeiro cruzamento de
 * cima para baixo. É deliberadamente conservador e devolve null com poucos
 * dados, em vez de fabricar precisão.
 */
export function estimateRetentionT80(trials, target = RETENTION_CONFIG.targetAccuracy) {
  const valid = trials.filter((t) => !t.invalid && !t.warmup && typeof (t.actualDelayMs ?? t.delayMs) === 'number');
  if (valid.length < RETENTION_CONFIG.minTrialsForEstimate) {
    return { t80: null, confidence: 'baixa', trials: valid.length, accuracy: mean(valid.map((t) => t.accuracy)) };
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
    return { t80: null, confidence: 'baixa', trials: valid.length, accuracy: mean(valid.map((t) => t.accuracy)), levels };
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

  const confidence = valid.length >= 30 && levels.length >= 5 ? 'alta'
    : valid.length >= 18 && levels.length >= 4 ? 'média' : 'baixa';
  return { t80, confidence, trials: valid.length, accuracy: mean(valid.map((t) => t.accuracy)), levels };
}

export function retentionReport(trials, state, settings) {
  const s = resolveRetentionSettings(settings);
  const est = estimateRetentionT80(trials, s.targetAccuracy);
  const rt = trials.map((t) => t.retrievalMs).filter((v) => typeof v === 'number' && v > 0);
  return {
    ...est,
    currentDelayMs: state?.currentDelayMs ?? null,
    retrievalMs: rt.length ? Math.round(mean(rt)) : null,
    mode: s.mode,
    calibrating: est.t80 === null,
  };
}

/** Pontuação interna 0–100: logarítmica, usada só como resumo do perfil. */
export function retentionPoints(t80) {
  if (t80 === null || t80 === undefined || t80 <= 0) return null;
  const lo = 250;
  const hi = 30000;
  const v = clamp(t80, lo, hi);
  return Math.round(100 * Math.log(v / lo) / Math.log(hi / lo));
}
