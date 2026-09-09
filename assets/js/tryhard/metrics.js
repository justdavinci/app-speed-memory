// Cálculo de desempenho. Nenhuma dessas fórmulas mora em componente visual.

import { STIMULUS_TYPES, TRY_HARD_CONFIG } from './config.js';

/** Acertou a tentativa inteira? */
export function trialAccuracy(trial) {
  return trial.exact ? 1 : 0;
}

/** Fração de itens corretos: 7 de 8 vale 87,5%, mesmo com a sequência errada. */
export function itemAccuracy(correctItems, totalItems) {
  if (!totalItems) return 0;
  return Math.min(1, Math.max(0, correctItems / totalItems));
}

/** Compara duas listas posição a posição. */
export function comparePositional(expected, given, normalize = (v) => String(v ?? '').trim().toUpperCase()) {
  const cells = expected.map((exp, i) => {
    const got = given[i];
    const ok = got !== undefined && got !== null && got !== '' && normalize(got) === normalize(exp);
    return { index: i, expected: exp, given: got ?? '', ok };
  });
  const correct = cells.filter((c) => c.ok).length;
  return {
    cells,
    correct,
    total: expected.length,
    itemAccuracy: itemAccuracy(correct, expected.length),
    exact: correct === expected.length,
  };
}

/** Compara sem exigir ordem: cada item digitado casa com um esperado só uma vez. */
export function compareUnordered(expected, given, normalize = (v) => String(v ?? '').trim().toUpperCase()) {
  const pool = given.map(normalize);
  const used = new Array(pool.length).fill(false);
  const cells = expected.map((exp, i) => {
    const target = normalize(exp);
    const at = pool.findIndex((g, j) => !used[j] && g === target);
    if (at >= 0) {
      used[at] = true;
      return { index: i, expected: exp, given: given[at], ok: true };
    }
    return { index: i, expected: exp, given: '', ok: false };
  });
  const correct = cells.filter((c) => c.ok).length;
  const extra = given.filter((_, i) => !used[i]);
  return {
    cells,
    extra,
    correct,
    total: expected.length,
    itemAccuracy: itemAccuracy(correct, expected.length),
    exact: correct === expected.length && extra.length === 0,
  };
}

const THROUGHPUT = {
  referenceExposureMs: 1000,   // exposição confortável: componente de velocidade = 0
  floorExposureMs: 8,          // exposição extrema: componente de velocidade = 1
  referenceItems: 6,           // carga que vale complexidade 1
  referenceWeight: 1.3,        // peso do estímulo misto, usado como normalizador
  speedFloor: 0.15,            // piso do fator de velocidade, para acerto lento valer algo
  performanceExponent: 1.3,    // premia acerto alto sem zerar acerto parcial
  scale: 1000,
};

/**
 * Iconic Throughput — métrica própria do app, de 0 a 1000.
 *
 * Combina três componentes normalizados:
 *  - desempenho: itens recuperados sobre itens apresentados;
 *  - velocidade: exposição em escala logarítmica entre 1000 ms e 8 ms, limitada
 *    nas duas pontas (é o que impede o valor explodir quando a exposição tende
 *    a zero);
 *  - complexidade: quantidade de itens e tipo de estímulo, também limitada.
 *
 * Mil exige acerto perfeito no piso físico da tela com carga alta. Não é uma
 * medida científica validada: é um índice interno para acompanhar evolução.
 */
export function calculateThroughput({ correctItems, totalItems, exposureMs, stimulusType = 'digits', extraComplexity = 1 }) {
  if (!totalItems || !exposureMs) return 0;
  const t = THROUGHPUT;

  const performance = itemAccuracy(correctItems, totalItems);
  if (performance <= 0) return 0;

  const clampedExposure = Math.min(t.referenceExposureMs, Math.max(t.floorExposureMs, exposureMs));
  const speed = Math.log(t.referenceExposureMs / clampedExposure)
    / Math.log(t.referenceExposureMs / t.floorExposureMs);

  const weight = STIMULUS_TYPES[stimulusType]?.weight ?? 1;
  const itemsFactor = Math.log2(1 + totalItems) / Math.log2(1 + t.referenceItems);
  const complexity = Math.min(1.35, Math.max(0.4, (itemsFactor * weight * extraComplexity) / t.referenceWeight));

  const value = t.scale
    * Math.pow(performance, t.performanceExponent)
    * (t.speedFloor + (1 - t.speedFloor) * speed)
    * complexity;

  return Math.round(Math.min(t.scale, Math.max(0, value)));
}

/** Média de precisão por item das últimas `window` tentativas válidas. */
export function calculateRollingPerformance(trials, window = TRY_HARD_CONFIG.rollingWindow) {
  const valid = trials.filter((t) => !t.invalid);
  const slice = valid.slice(-window);
  if (!slice.length) return null;
  return slice.reduce((a, t) => a + (t.itemAccuracy ?? 0), 0) / slice.length;
}

/** Assinatura da dificuldade, para comparar apenas o que é comparável. */
export function difficultySignature(trial) {
  const d = trial.difficulty || {};
  return Object.keys(d).sort().map((k) => `${k}:${d[k]}`).join('|');
}

/**
 * Consistência: o quanto o desempenho varia entre tentativas de mesma
 * dificuldade. Comparar dificuldades diferentes penalizaria quem está
 * progredindo, então o desvio é calculado dentro de cada configuração.
 */
export function calculateConsistency(trials) {
  const valid = trials.filter((t) => !t.invalid);
  if (valid.length < 4) return null;

  const groups = new Map();
  for (const t of valid) {
    const key = difficultySignature(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t.itemAccuracy ?? 0);
  }

  let weighted = 0;
  let weight = 0;
  for (const values of groups.values()) {
    if (values.length < 3) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    weighted += Math.sqrt(variance) * values.length;
    weight += values.length;
  }
  if (!weight) return null;

  // Desvio de 0,5 (metade da escala de precisão) é o pior caso considerado.
  const sd = weighted / weight;
  return Math.min(1, Math.max(0, 1 - sd / 0.5));
}

/** Queda acentuada de desempenho nos últimos minutos. */
export function detectFatigue(trials) {
  const cfg = TRY_HARD_CONFIG;
  const valid = trials.filter((t) => !t.invalid);
  if (valid.length < cfg.fatigueWindow * 2) return null;
  const recent = valid.slice(-cfg.fatigueWindow);
  const before = valid.slice(-cfg.fatigueWindow * 2, -cfg.fatigueWindow);
  const mean = (list) => list.reduce((a, t) => a + (t.itemAccuracy ?? 0), 0) / list.length;
  const a = mean(before);
  const b = mean(recent);
  if (a <= 0) return null;
  const drop = (a - b) / a;
  return drop >= cfg.fatigueDropRatio ? { drop, before: a, recent: b } : null;
}

/**
 * Recordes. Exposição e atrasos só entram com precisão mínima — senão uma
 * tentativa de sorte no escuro viraria recorde.
 */
export function calculatePersonalBests(previous, trial) {
  const best = { ...(previous || {}) };
  const acc = trial.itemAccuracy ?? 0;
  const qualifies = acc >= TRY_HARD_CONFIG.personalBestMinAccuracy;
  const beaten = [];

  const better = (key, value, cmp) => {
    if (value === undefined || value === null || Number.isNaN(value)) return;
    if (best[key] === undefined || cmp(value, best[key])) {
      best[key] = value;
      beaten.push(key);
    }
  };
  const lower = (a, b) => a < b;
  const higher = (a, b) => a > b;

  better('bestThroughput', trial.throughput, higher);
  if (qualifies) {
    better('bestExposureMs', Math.round(trial.actualExposureMs ?? trial.requestedExposureMs), lower);
    better('bestItems', trial.totalItems, higher);
    if (trial.difficulty?.matrixRows && trial.difficulty?.matrixColumns) {
      const cells = trial.difficulty.matrixRows * trial.difficulty.matrixColumns;
      if (best.bestMatrixCells === undefined || cells > best.bestMatrixCells) {
        best.bestMatrixCells = cells;
        best.bestMatrix = `${trial.difficulty.matrixRows} × ${trial.difficulty.matrixColumns}`;
        beaten.push('bestMatrix');
      }
    }
    if (trial.difficulty?.cueDelayMs !== undefined) better('bestCueDelayMs', trial.difficulty.cueDelayMs, higher);
    if (trial.difficulty?.maskDelayMs !== undefined) better('bestMaskDelayMs', trial.difficulty.maskDelayMs, lower);
    if (trial.difficulty?.contrast !== undefined) better('bestContrast', trial.difficulty.contrast, lower);
    if (trial.difficulty?.peripheralDistance !== undefined) better('bestDistance', trial.difficulty.peripheralDistance, higher);
  }
  return { best, beaten };
}

/** Resumo de um conjunto de tentativas. */
export function summarizeTrials(trials) {
  const valid = trials.filter((t) => !t.invalid);
  const totalItems = valid.reduce((a, t) => a + (t.totalItems || 0), 0);
  const correctItems = valid.reduce((a, t) => a + (t.correctItems || 0), 0);
  const exact = valid.filter((t) => t.exact).length;
  const throughputs = valid.map((t) => t.throughput || 0);
  const exposures = valid
    .filter((t) => (t.itemAccuracy ?? 0) >= TRY_HARD_CONFIG.personalBestMinAccuracy)
    .map((t) => t.actualExposureMs ?? t.requestedExposureMs)
    .filter((v) => typeof v === 'number');

  return {
    trials: valid.length,
    invalid: trials.length - valid.length,
    totalItems,
    correctItems,
    accuracy: totalItems ? correctItems / totalItems : 0,
    exactRate: valid.length ? exact / valid.length : 0,
    throughput: throughputs.length ? Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length) : 0,
    bestThroughput: throughputs.length ? Math.max(...throughputs) : 0,
    bestExposureMs: exposures.length ? Math.round(Math.min(...exposures)) : null,
    consistency: calculateConsistency(trials),
    reactionMs: valid.length
      ? Math.round(valid.reduce((a, t) => a + (t.reactionMs || 0), 0) / valid.length)
      : 0,
  };
}
