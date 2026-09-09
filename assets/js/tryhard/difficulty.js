// Motor de dificuldade.
//
// A dificuldade é um estado multidimensional, não um número. Cada módulo
// declara que dimensões usa (exposição, itens, tamanho da matriz, atraso,
// contraste…) e em que ordem elas sobem. A adaptação mexe em UMA dimensão por
// vez, para sempre sabermos o que ficou mais difícil.
//
// A decisão vem de uma janela de tentativas, nunca de uma tentativa isolada, e
// exige um intervalo mínimo entre mudanças — é isso que evita o pinga-pongue
// de acertou/errou.

import { MODULE_SPECS, TRY_HARD_CONFIG } from './config.js';

/** Dimensões que um módulo usa. */
export function dimensionsOf(moduleId) {
  return MODULE_SPECS[moduleId]?.dimensions || [];
}

export function dimensionSpec(moduleId, key) {
  return dimensionsOf(moduleId).find((d) => d.key === key) || null;
}

/** Estado inicial declarado pelo módulo. */
export function initialState(moduleId) {
  const state = {};
  for (const dim of dimensionsOf(moduleId)) state[dim.key] = dim.start;
  return state;
}

/** Índice do valor atual numa dimensão de degraus. */
function ladderIndex(dim, value) {
  let best = 0;
  let dist = Infinity;
  dim.values.forEach((v, i) => {
    const d = Math.abs(v - value);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

function clampNumber(dim, value) {
  const v = Math.min(dim.max, Math.max(dim.min, value));
  return dim.kind === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000;
}

/**
 * Move uma dimensão `steps` degraus na direção pedida.
 * @param {'harder'|'easier'} direction
 * @returns {{value:number, moved:boolean}}
 */
export function moveDimension(dim, value, direction, steps = 1) {
  const towardHarder = direction === 'harder';
  if (dim.kind === 'ladder') {
    const i = ladderIndex(dim, value);
    const delta = (dim.harder === 'down' ? -1 : 1) * (towardHarder ? 1 : -1) * steps;
    const next = Math.min(dim.values.length - 1, Math.max(0, i + delta));
    return { value: dim.values[next], moved: next !== i };
  }
  const delta = (dim.harder === 'down' ? -1 : 1) * (towardHarder ? 1 : -1) * steps * dim.step;
  const next = clampNumber(dim, value + delta);
  return { value: next, moved: next !== value };
}

/** A dimensão já está no extremo daquela direção? */
export function atLimit(dim, value, direction) {
  return !moveDimension(dim, value, direction, 1).moved;
}

/**
 * Sobe ou desce a dificuldade em uma dimensão, seguindo a ordem de escalada do
 * módulo. `cursor` guarda em que ponto da ordem a adaptação parou.
 */
export function step(moduleId, state, direction, cursor = 0, steps = 1, orderOverride = null) {
  const spec = MODULE_SPECS[moduleId];
  const declared = spec?.escalation?.length ? spec.escalation : dimensionsOf(moduleId).map((d) => d.key);
  // Alguns módulos decidem a ordem em tempo de execução (ver transfer/adapt.js).
  const order = orderOverride?.length ? orderOverride : declared;
  if (!order.length) return { state, cursor, changed: null };

  const next = { ...state };
  // Subir segue a ordem; descer desfaz na ordem inversa, começando pela última
  // dimensão que subiu.
  const sequence = direction === 'harder'
    ? order.map((_, i) => (cursor + i) % order.length)
    : order.map((_, i) => ((cursor - 1 - i) % order.length + order.length) % order.length);

  for (const index of sequence) {
    const dim = dimensionSpec(moduleId, order[index]);
    if (!dim) continue;
    const moved = moveDimension(dim, next[dim.key], direction, steps);
    if (moved.moved) {
      next[dim.key] = moved.value;
      const newCursor = direction === 'harder' ? (index + 1) % order.length : index;
      return { state: next, cursor: newCursor, changed: { key: dim.key, label: dim.label, from: state[dim.key], to: moved.value, direction } };
    }
  }
  return { state, cursor, changed: null }; // tudo no limite
}

/** Precisão média (por item) das últimas `window` tentativas válidas. */
export function rollingAccuracy(trials, window) {
  const valid = trials.filter((t) => !t.invalid);
  const slice = valid.slice(-window);
  if (!slice.length) return null;
  return slice.reduce((a, t) => a + (t.itemAccuracy ?? 0), 0) / slice.length;
}

/**
 * Decide o que fazer com a dificuldade depois de uma tentativa.
 *
 * @param {object} skill estado do módulo: { state, cursor, trialsSinceChange, calibrating, trialsDone }
 * @param {Array} trials tentativas da sessão, mais recente por último
 * @param {object} [options] { order } — ordem de escalada decidida pelo módulo
 * @returns {{state, cursor, decision:'harder'|'easier'|'hold'|'wait', accuracy:number|null, changed:object|null, calibrating:boolean}}
 */
export function evaluate(moduleId, skill, trials, options = {}) {
  const cfg = TRY_HARD_CONFIG;
  const calibrating = !!skill.calibrating;
  const window = calibrating ? cfg.calibrationWindow : cfg.rollingWindow;
  const steps = calibrating ? cfg.calibrationStepScale : 1;
  const minBetween = calibrating ? 1 : cfg.minTrialsBetweenChanges;

  const accuracy = rollingAccuracy(trials, window);
  const validCount = trials.filter((t) => !t.invalid).length;
  const base = {
    state: skill.state,
    cursor: skill.cursor || 0,
    accuracy,
    changed: null,
    calibrating: calibrating && validCount < cfg.calibrationTrials,
  };

  if (accuracy === null || validCount < window) return { ...base, decision: 'wait' };
  if ((skill.trialsSinceChange ?? 0) < minBetween) return { ...base, decision: 'wait' };

  let direction = null;
  if (accuracy >= cfg.increaseAbove) direction = 'harder';
  else if (accuracy <= cfg.decreaseBelow) direction = 'easier';
  if (!direction) return { ...base, decision: 'hold' };

  const moved = step(moduleId, skill.state, direction, skill.cursor || 0, steps, options.order || null);
  return {
    ...base,
    state: moved.state,
    cursor: moved.cursor,
    changed: moved.changed,
    decision: moved.changed ? direction : 'hold',
  };
}

/**
 * A pessoa está muito acima ou abaixo da região alvo há tempo demais?
 * Serve para recalibrar aos poucos, sem obrigá-la a refazer nada.
 */
export function needsRecalibration(trials) {
  const cfg = TRY_HARD_CONFIG;
  const accuracy = rollingAccuracy(trials, cfg.recalibrationWindow);
  const valid = trials.filter((t) => !t.invalid).length;
  if (accuracy === null || valid < cfg.recalibrationWindow) return null;
  if (accuracy >= cfg.recalibrationAbove) return 'harder';
  if (accuracy <= cfg.recalibrationBelow) return 'easier';
  return null;
}

/** Distância percentual entre dois estados, para mostrar "dificuldade ↑ 14%". */
export function difficultyDelta(moduleId, before, after) {
  const dims = dimensionsOf(moduleId);
  if (!dims.length) return 0;
  let total = 0;
  for (const dim of dims) {
    const a = before?.[dim.key];
    const b = after?.[dim.key];
    if (a === undefined || b === undefined || a === b) continue;
    if (dim.kind === 'ladder') {
      const ia = ladderIndex(dim, a);
      const ib = ladderIndex(dim, b);
      const sign = dim.harder === 'down' ? -1 : 1;
      total += (sign * (ib - ia)) / dim.values.length;
    } else {
      const range = dim.max - dim.min || 1;
      const sign = dim.harder === 'down' ? -1 : 1;
      total += (sign * (b - a)) / range;
    }
  }
  return total;
}
