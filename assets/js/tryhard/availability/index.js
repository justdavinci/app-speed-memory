// Disponibilidade visual — decisão por tentativa e leitura dos resultados.
//
// Este arquivo é o meio-campo entre a configuração, a escada e o ciclo de
// tentativa do runner. Ele responde três coisas:
//
//   1. esta tentativa vai usar disponibilidade?
//   2. com que atraso?
//   3. o que sai dela para o histórico?
//
// Duas separações que o resto do app precisa respeitar:
//
//   · o atraso de disponibilidade NÃO é o intervalo até a máscara — são dois
//     tempos diferentes e ficam registrados separados (§22);
//   · disponibilidade (dezenas a centenas de ms) não é retenção (segundos).
//     Quando a disponibilidade está ativa, ela ocupa a vaga do atraso até a
//     pergunta, e o registro diz qual dos dois valeu (§30).

import {
  AVAILABILITY_CONFIG, AVAILABILITY_PRESETS, DEFAULT_AVAILABILITY_SETTINGS,
  moduleSupportsAvailability,
} from './config.js';
import { calibrationPlan, evaluateAvailability, initialAvailabilityState, noteTrial } from './staircase.js';
import { categoryFor } from './categories.js';
import { estimateThreshold } from './threshold.js';

const cfg = AVAILABILITY_CONFIG;

export { categoryFor };

/** Ajustes efetivos, com o padrão preenchido. */
export function resolveSettings(settings) {
  return { ...DEFAULT_AVAILABILITY_SETTINGS, ...(settings || {}) };
}

/**
 * A disponibilidade vale para este módulo?
 * O interruptor global manda: desligado ali, nenhum módulo usa. Ligado, cada
 * módulo ainda pode dizer herdar, ligado ou desligado (§37).
 */
export function isActiveFor(settings, moduleId) {
  const s = resolveSettings(settings);
  if (!s.enabled) return false;
  if (!moduleSupportsAvailability(moduleId)) return false;
  const escolha = s.modules?.[moduleId] || 'inherit';
  if (escolha === 'off') return false;
  if (escolha === 'on') return true;
  return (AVAILABILITY_PRESETS[s.preset] || AVAILABILITY_PRESETS.balanced).share > 0;
}

/** Fração das tentativas compatíveis que usa disponibilidade. */
export function shareFor(settings, moduleId) {
  const s = resolveSettings(settings);
  const escolha = s.modules?.[moduleId] || 'inherit';
  if (escolha === 'on') return 1;
  return (AVAILABILITY_PRESETS[s.preset] || AVAILABILITY_PRESETS.balanced).share;
}

/** Atraso pedido quando o modo é manual. */
function manualDelay(s, rng) {
  if (!s.manualRandom) return s.manualDelayMs;
  const min = Math.min(s.manualMinMs, s.manualMaxMs);
  const max = Math.max(s.manualMinMs, s.manualMaxMs);
  return Math.round(min + rng() * (max - min));
}

/**
 * Decide a tentativa.
 *
 * @param {object} opts
 * @param {object} opts.settings     ajustes de disponibilidade
 * @param {string} opts.moduleId
 * @param {object} opts.trial        tentativa já gerada pelo módulo
 * @param {object} opts.state        escada da categoria (pode ser nula)
 * @param {number} opts.calibrated   quantas tentativas de calibração já foram feitas
 * @param {function} opts.rng
 * @param {boolean} [opts.warmup]    logo após uma pausa: não conta para o limiar
 * @param {boolean} [opts.force]     benchmark: usa o atraso dado, sem sorteio
 * @param {number} [opts.forcedDelayMs]
 */
export function planTrial({
  settings, moduleId, trial, state, calibrated = 0, rng = Math.random,
  warmup = false, force = false, forcedDelayMs = null,
}) {
  const s = resolveSettings(settings);
  const category = categoryFor(trial);

  if (force) {
    return {
      active: true, category, delayMs: forcedDelayMs, phase: 'benchmark',
      mode: 'fixed', cleanRetrieval: !!s.cleanRetrieval, warmup: false,
    };
  }

  if (!isActiveFor(s, moduleId)) return { active: false, category };
  // Nem toda tentativa compatível vira tentativa de disponibilidade: misturar
  // com tentativas normais é o que evita adaptação ao formato (§39).
  if (rng() >= shareFor(s, moduleId)) return { active: false, category };

  const escada = state || initialAvailabilityState(s);

  // Calibração inicial: varredura de longe a perto, antes de a escada afinar.
  const plano = calibrationPlan(s);
  if (calibrated < plano.length && s.mode !== 'manual') {
    return {
      active: true, category, delayMs: plano[calibrated], phase: 'calibration',
      mode: 'calibration', cleanRetrieval: !!s.cleanRetrieval, warmup,
    };
  }

  const delayMs = s.mode === 'manual' ? manualDelay(s, rng) : escada.currentDelayMs;
  return {
    active: true,
    category,
    delayMs,
    phase: 'training',
    mode: s.mode,
    cleanRetrieval: !!s.cleanRetrieval,
    warmup,
  };
}

/**
 * Aplica o plano à tentativa. Quando a disponibilidade está ativa, o atraso
 * dela ocupa a vaga do atraso até a pergunta que o módulo pediria — são o
 * mesmo intervalo, e somar os dois mediria outra coisa.
 */
export function applyToTrial(trial, plan) {
  if (!plan?.active) {
    trial.availability = { active: false, category: plan?.category || null };
    return trial;
  }
  trial.availability = {
    active: true,
    category: plan.category,
    requestedDelayMs: plan.delayMs,
    phase: plan.phase,
    mode: plan.mode,
    cleanRetrieval: plan.cleanRetrieval,
    warmup: !!plan.warmup,
    // O que o módulo pediria se a disponibilidade estivesse desligada: fica
    // guardado para o histórico saber o que foi substituído.
    supersededCueDelayMs: trial.cueDelayMs || 0,
  };
  trial.cueDelayMs = plan.delayMs;
  trial.cleanRetrieval = plan.cleanRetrieval;
  return trial;
}

/** Uma tentativa de disponibilidade, no formato que o histórico guarda. */
export function trialRecord({ trial, result, record, timing }) {
  const a = trial.availability;
  if (!a?.active) return null;
  return {
    timestamp: record.timestamp,
    moduleId: trial.moduleId,
    category: a.category,
    delayMs: a.requestedDelayMs,
    actualDelayMs: timing?.actualMs ?? null,
    accuracy: result.itemAccuracy,
    exposureMs: record.actualExposureMs ?? record.requestedExposureMs,
    // Tempo de resposta a partir do momento em que responder virou possível:
    // é outra métrica, e não substitui a disponibilidade (§17).
    retrievalMs: record.retrievalMs ?? record.reactionMs ?? null,
    queryIndex: 1,
    phase: a.phase,
    mode: a.mode,
    cleanRetrieval: !!a.cleanRetrieval,
    warmup: !!a.warmup,
    novel: !!trial.transfer?.novel,
    holdout: !!trial.transfer?.holdout,
    invalid: false,
  };
}

/** Passo da escada depois de uma tentativa contabilizada. */
export function advance(state, categoryTrials, settings) {
  const s = resolveSettings(settings);
  const base = noteTrial(state || initialAvailabilityState(s));
  if (s.mode === 'manual') return { state: base, decision: 'hold', changed: false, accuracy: null };
  return evaluateAvailability(base, categoryTrials);
}

/**
 * Só a PRIMEIRA pergunta de uma tentativa mede disponibilidade. As seguintes
 * envolvem retenção adicional e contaminariam o T80 (§29).
 */
export function countsForThreshold(trial) {
  return !trial.warmup && !trial.invalid && (trial.queryIndex ?? 1) === 1;
}

/** Resumo de uma categoria, pronto para a interface. */
export function categoryReport(trials, state, options = {}) {
  const uteis = trials.filter(countsForThreshold);
  const estimativa = estimateThreshold(uteis, state, options);
  const rt = uteis.map((t) => t.retrievalMs).filter((v) => typeof v === 'number' && v > 0);
  return {
    ...estimativa,
    currentDelayMs: state?.currentDelayMs ?? null,
    retrievalMs: rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : null,
    calibrating: estimativa.t80 === null,
  };
}

export { AVAILABILITY_CONFIG, AVAILABILITY_PRESETS, cfg as availabilityConfig };
