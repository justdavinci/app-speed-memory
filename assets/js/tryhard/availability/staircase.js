// Motor adaptativo do atraso.
//
// É uma escada psicofísica separada da dificuldade do exercício: enquanto o
// motor de dificuldade mexe em exposição, quantidade e matriz, este mexe só no
// intervalo entre o estímulo sumir e a pergunta aparecer.
//
// Duas regras dão o caráter dele:
//
//  1. a decisão vem de uma JANELA de tentativas, nunca de uma só — subir 25 ms
//     a cada erro e descer 25 ms a cada acerto oscilaria sem nunca convergir;
//  2. o passo encolhe conforme a escada vira de direção — busca grossa até
//     achar a região, busca fina para assentar dentro dela.

import { AVAILABILITY_CONFIG } from './config.js';

const cfg = AVAILABILITY_CONFIG;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Estado inicial da escada de uma categoria. */
export function initialAvailabilityState(settings = {}) {
  const min = settings.minDelayMs ?? cfg.defaultMinDelayMs;
  const max = settings.maxDelayMs ?? cfg.defaultMaxDelayMs;
  return {
    currentDelayMs: clamp(settings.initialDelayMs ?? cfg.defaultDelayMs, min, max),
    minDelayMs: min,
    maxDelayMs: max,
    targetAccuracy: settings.targetAccuracy ?? cfg.targetAccuracy,
    rollingAccuracy: null,
    direction: 0,          // -1 encurtando, +1 alongando
    reversals: [],
    trialsSinceChange: 0,
    trialCount: 0,
  };
}

/** Passo atual, em ms: encolhe a cada par de viradas. */
export function stepFor(state) {
  const viradas = state.reversals?.length || 0;
  const ratio = viradas >= cfg.reversalsBeforeFinest ? cfg.finestStepRatio
    : viradas >= cfg.reversalsBeforeFine ? cfg.fineStepRatio
      : cfg.coarseStepRatio;
  return Math.max(cfg.minStepMs, Math.round(state.currentDelayMs * ratio));
}

/** Acerto médio por item das últimas `window` tentativas de disponibilidade. */
export function rollingAccuracy(trials, window = cfg.rollingWindow) {
  const validas = trials.filter((t) => !t.invalid && !t.warmup);
  const fatia = validas.slice(-window);
  if (!fatia.length) return null;
  return fatia.reduce((a, t) => a + (t.accuracy ?? 0), 0) / fatia.length;
}

/** A escada já assentou? Enquanto não, a exposição fica parada (§49). */
export function hasConverged(state) {
  return (state.reversals?.length || 0) >= cfg.convergedReversals;
}

/**
 * Decide o próximo atraso a partir da janela recente.
 *
 * @param {object} state    estado da escada
 * @param {Array} trials    tentativas de disponibilidade da categoria, recentes por último
 * @returns {{state:object, decision:'shorter'|'longer'|'hold'|'wait', accuracy:number|null, changed:boolean}}
 */
export function evaluateAvailability(state, trials) {
  const janela = cfg.rollingWindow;
  const accuracy = rollingAccuracy(trials, janela);
  const validas = trials.filter((t) => !t.invalid && !t.warmup).length;
  const base = { state: { ...state, rollingAccuracy: accuracy }, accuracy, changed: false };

  if (accuracy === null || validas < janela) return { ...base, decision: 'wait' };
  if ((state.trialsSinceChange || 0) < cfg.minTrialsBetweenChanges) return { ...base, decision: 'wait' };

  const alvo = state.targetAccuracy ?? cfg.targetAccuracy;
  let direction = 0;
  if (accuracy >= alvo + cfg.upperMargin) direction = -1;        // sobra folga: pedir mais cedo
  else if (accuracy < alvo - cfg.lowerMargin) direction = 1;     // cedo demais: dar mais tempo
  if (!direction) return { ...base, decision: 'hold' };

  const passo = stepFor(state);
  const alvoMs = clamp(
    state.currentDelayMs + direction * passo,
    Math.max(cfg.hardFloorMs, state.minDelayMs),
    Math.min(cfg.hardCeilingMs, state.maxDelayMs),
  );
  if (alvoMs === state.currentDelayMs) {
    // No limite da faixa: registrar a direção mesmo assim, para o passo
    // continuar encolhendo em vez de bater na parede com passo grosso.
    return { ...base, state: { ...base.state, direction }, decision: 'hold' };
  }

  const virou = state.direction !== 0 && direction !== state.direction;
  const reversals = virou ? [...(state.reversals || []), state.currentDelayMs] : (state.reversals || []);

  return {
    state: {
      ...state,
      currentDelayMs: alvoMs,
      rollingAccuracy: accuracy,
      direction,
      reversals,
      trialsSinceChange: 0,
    },
    accuracy,
    changed: true,
    decision: direction < 0 ? 'shorter' : 'longer',
  };
}

/** Marca mais uma tentativa contabilizada sem mudança de atraso. */
export function noteTrial(state) {
  return {
    ...state,
    trialsSinceChange: (state.trialsSinceChange || 0) + 1,
    trialCount: (state.trialCount || 0) + 1,
  };
}

/**
 * Sequência de calibração: varre de longe a perto, repetindo cada degrau.
 * Serve para achar a região antes de a escada começar a afinar.
 */
export function calibrationPlan(settings = {}) {
  const min = settings.minDelayMs ?? cfg.defaultMinDelayMs;
  const max = settings.maxDelayMs ?? cfg.defaultMaxDelayMs;
  const plano = [];
  for (const delay of cfg.calibrationDelays) {
    const d = clamp(delay, min, max);
    for (let i = 0; i < cfg.calibrationRepeats; i++) plano.push(d);
  }
  return plano;
}
