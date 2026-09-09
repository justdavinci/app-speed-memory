// Condução de sessões e tentativas.
//
// Um único ciclo serve a todos os módulos: preparar → fixação → exposição →
// (máscara) → (aviso) → resposta → correção → adaptação. Os módulos só
// descrevem o que mostrar e como corrigir; quem cuida de tempo, invalidação e
// persistência é este arquivo.
//
// A interface (`view`) é injetada, então o runner não conhece o DOM: é o que
// permite testar a lógica de sessão sem navegador.

import { TRY_HARD_CONFIG, MODULE_SPECS, PRESETS } from './config.js';
import { getModule } from './modules/index.js';
import { evaluate, difficultyDelta, needsRecalibration, step } from './difficulty.js';
import { calculateThroughput, detectFatigue, summarizeTrials } from './metrics.js';
import * as store from './store.js';
import { makeRng, rInt } from './rng.js';

/** Controle externo da sessão: pausar, encerrar. */
export function createControl() {
  let paused = false;
  let aborted = false;
  let resumed = false;
  let resumeWaiters = [];
  return {
    get aborted() { return aborted; },
    get paused() { return paused; },
    signal: { get aborted() { return aborted; } },
    pause() { paused = true; },
    resume() {
      if (paused) resumed = true;
      paused = false;
      resumeWaiters.forEach((fn) => fn());
      resumeWaiters = [];
    },
    /** Houve uma retomada desde a última checagem? A tentativa recomeça do zero. */
    consumeResumed() {
      const value = resumed;
      resumed = false;
      return value;
    },
    abort() {
      aborted = true;
      this.resume();
    },
    waitWhilePaused() {
      if (!paused) return Promise.resolve();
      return new Promise((resolve) => resumeWaiters.push(resolve));
    },
  };
}

/** Duração da fixação: faixa com variação, para não dar para antecipar. */
export function fixationDuration(settings, rng = Math.random) {
  if (settings?.fixationMs) return settings.fixationMs;
  return rInt(rng, TRY_HARD_CONFIG.fixationMinMs, TRY_HARD_CONFIG.fixationMaxMs);
}

/** Dificuldade inicial de um bloco, considerando o preset escolhido. */
export function difficultyForBlock(moduleId, block, skill) {
  const spec = MODULE_SPECS[moduleId];
  if (!spec?.dimensions?.length) return {};
  if (block.manual && block.difficulty) return { ...skill.state, ...block.difficulty };

  const preset = PRESETS[block.preset] || PRESETS.tryhard;
  if (!preset.offset) return { ...skill.state };

  let state = { ...skill.state };
  let cursor = skill.cursor || 0;
  const direction = preset.offset > 0 ? 'harder' : 'easier';
  for (let i = 0; i < Math.abs(preset.offset); i++) {
    const moved = step(moduleId, state, direction, cursor);
    state = moved.state;
    cursor = moved.cursor;
  }
  return state;
}

/** Quantas tentativas/quanto tempo o bloco deve durar. */
export function blockBudget(block, moduleId) {
  const mod = getModule(moduleId);
  if (mod?.protocolTrials) return { kind: 'trials', trials: mod.protocolTrials };
  if (block.unlimited) return { kind: 'unlimited' };
  if (block.trials) return { kind: 'trials', trials: block.trials };
  return { kind: 'time', durationMs: Math.max(1, block.minutes || 5) * 60000 };
}

function budgetDone(budget, { elapsedMs, trialsDone }) {
  if (budget.kind === 'unlimited') return false;
  if (budget.kind === 'trials') return trialsDone >= budget.trials;
  return elapsedMs >= budget.durationMs;
}

/**
 * Executa um módulo do começo ao fim e devolve o resumo.
 *
 * @param {object} block  { moduleId, minutes|trials|unlimited, preset, adaptive, stimulus, manual, difficulty }
 * @param {object} view   adaptador de interface (ver ui.js)
 * @param {object} control createControl()
 * @param {object} [opts] { seed, onTrial, sessionId, position }
 */
export async function runModuleBlock(block, view, control, opts = {}) {
  const moduleId = block.moduleId;
  const mod = getModule(moduleId);
  const spec = MODULE_SPECS[moduleId];
  if (!mod) throw new Error(`Módulo desconhecido: ${moduleId}`);

  const settings = store.getSettings();
  const rng = makeRng(opts.seed);
  const skill = store.getSkill(moduleId);
  const adaptive = spec.adaptive !== false && block.adaptive !== false && settings.adaptive !== false && !block.manual;

  let difficulty = difficultyForBlock(moduleId, block, skill);
  const startingDifficulty = { ...difficulty };
  let cursor = skill.cursor || 0;
  let calibrating = adaptive ? !!skill.calibrating : false;
  let trialsSinceChange = skill.trialsSinceChange || 0;

  const budget = blockBudget(block, moduleId);
  const stimulus = block.stimulus || spec.defaultStimulus;
  const trials = [];
  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  let fatigueWarned = false;
  let personalBests = 0;

  view.setPhase?.({ moduleId, name: spec.name, budget, position: opts.position });

  if (settings.countdown) {
    await view.showCountdown(TRY_HARD_CONFIG.countdownSeconds, { name: spec.name });
    if (control.aborted) return finish();
  }

  while (!control.aborted) {
    const elapsedMs = performance.now() - startMs;
    if (budgetDone(budget, { elapsedMs, trialsDone: trials.filter((t) => !t.invalid).length })) break;

    await control.waitWhilePaused();
    if (control.aborted) break;
    // Uma pausa nunca retoma no meio de uma tentativa: recomeça com contagem.
    if (control.consumeResumed?.()) {
      await view.showCountdown(TRY_HARD_CONFIG.countdownSeconds, { name: spec.name });
      if (control.aborted) break;
    }

    const trialIndex = trials.length;
    const trial = mod.generate({ difficulty, stimulus, rng, settings, trialIndex });
    trial.moduleId = moduleId;
    trial.difficultyState = { ...difficulty };

    view.setProgress?.({
      trialIndex,
      trialsDone: trials.filter((t) => !t.invalid).length,
      budget,
      elapsedMs,
      difficulty,
      calibrating,
    });

    const outcome = await runTrial({ trial, mod, view, control, settings, rng });

    if (outcome.invalid) {
      trials.push({ invalid: true, reason: outcome.reason, timestamp: new Date().toISOString() });
      store.recordTrial(moduleId, { invalid: true, timestamp: new Date().toISOString(), difficulty });
      await view.showInvalid?.(outcome.reason);
      continue;
    }
    if (outcome.aborted) break;

    const result = mod.score(trial, outcome.response);
    const exposure = outcome.timing.actualMs || trial.exposureMs;
    const throughput = calculateThroughput({
      correctItems: result.correct,
      totalItems: result.total,
      exposureMs: exposure,
      stimulusType: trial.stimulusType || stimulus,
      extraComplexity: trial.extraComplexity || 1,
    });

    const record = {
      moduleId,
      timestamp: new Date().toISOString(),
      stimulusType: trial.stimulusType || stimulus,
      requestedExposureMs: trial.exposureMs,
      actualExposureMs: outcome.timing.actualMs,
      frames: outcome.timing.frames,
      correctItems: result.correct,
      totalItems: result.total,
      itemAccuracy: result.itemAccuracy,
      exact: result.exact,
      reactionMs: outcome.reactionMs,
      throughput,
      difficulty: { ...difficulty },
      benchmarkBlock: trial.benchmarkBlock || null,
      protocolVersion: trial.protocolVersion || null,
      invalid: false,
    };
    trials.push(record);

    const saved = store.recordTrial(moduleId, record);
    if (saved.beaten.length) personalBests += 1;
    opts.onTrial?.(record, result);

    trialsSinceChange += 1;
    if (adaptive) {
      const decision = evaluate(moduleId, { state: difficulty, cursor, calibrating, trialsSinceChange }, trials);
      calibrating = decision.calibrating;
      if (decision.changed) {
        difficulty = decision.state;
        cursor = decision.cursor;
        trialsSinceChange = 0;
      }
      store.updateSkill(moduleId, {
        state: difficulty, cursor, calibrating, trialsSinceChange,
        rollingAccuracy: decision.accuracy,
      });
      await view.showFeedback(result, trial, {
        mode: settings.feedback,
        exposure,
        throughput,
        change: decision.changed,
        newRecords: saved.beaten,
      });
    } else {
      await view.showFeedback(result, trial, {
        mode: settings.feedback, exposure, throughput, newRecords: saved.beaten,
      });
    }

    if (!fatigueWarned) {
      const fatigue = detectFatigue(trials);
      if (fatigue) {
        fatigueWarned = true;
        const choice = await view.showFatigueNotice?.(fatigue);
        if (choice === 'pause') control.pause();
      }
    }
  }

  return finish();

  function finish() {
    const summary = summarizeTrials(trials);
    const completedAt = new Date().toISOString();
    const recalibration = adaptive ? needsRecalibration(store.getTrials(moduleId)) : null;
    if (recalibration) {
      const moved = step(moduleId, difficulty, recalibration, cursor);
      difficulty = moved.state;
      store.updateSkill(moduleId, { state: difficulty, cursor: moved.cursor, trialsSinceChange: 0 });
    }
    return {
      moduleId,
      name: spec.name,
      startedAt,
      completedAt,
      durationMs: performance.now() - startMs,
      settings: { stimulus, adaptive, preset: block.preset || 'tryhard' },
      startingDifficulty,
      endingDifficulty: difficulty,
      difficultyDelta: difficultyDelta(moduleId, startingDifficulty, difficulty),
      personalBests,
      protocolVersion: mod.protocolVersion || null,
      ...summary,
    };
  }
}

/** Uma tentativa: exposição, máscara, aviso e resposta. */
async function runTrial({ trial, mod, view, control, settings, rng }) {
  const guard = view.watchInvalidation();
  try {
    const prepared = await view.prepareStimulus(trial);

    if (trial.fixation !== false) {
      await view.showFixation(fixationDuration(settings, rng), { keep: !!trial.keepFixation, trial });
      if (control.aborted) return { aborted: true };
    }

    const timing = await view.presentStimulus(prepared, trial, control.signal);
    if (control.aborted) return { aborted: true };
    if (guard.invalid) return { invalid: true, reason: guard.reason };

    if (trial.mask && trial.maskDurationMs) {
      await view.waitBlank(trial.maskDelayMs || 0, control.signal);
      await view.showMask(trial, trial.maskDurationMs, control.signal);
    }

    if (trial.cueDelayMs) await view.waitBlank(trial.cueDelayMs, control.signal);
    if (guard.invalid) return { invalid: true, reason: guard.reason };

    const response = await view.collectResponse(trial, control);
    if (response.aborted) return { aborted: true };
    if (guard.invalid) return { invalid: true, reason: guard.reason };

    return { response: response.items, reactionMs: response.reactionMs, timing };
  } finally {
    guard.stop();
  }
}

/**
 * Sessão da rotina diária: encadeia os blocos sem voltar ao menu.
 */
export async function runRoutineSession(routine, view, control, opts = {}) {
  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  const modules = [];

  for (let i = 0; i < routine.modules.length; i++) {
    if (control.aborted) break;
    const block = routine.modules[i];
    view.setSessionProgress?.({ index: i, total: routine.modules.length, block });
    const summary = await runModuleBlock(block, view, control, {
      ...opts, position: { index: i, total: routine.modules.length },
    });
    modules.push(summary);
    if (control.aborted) break;
    if (i < routine.modules.length - 1) {
      const next = routine.modules[i + 1];
      const go = await view.showModuleSummary(summary, { next: MODULE_SPECS[next.moduleId]?.name });
      if (go === 'stop') break;
    }
  }

  const completedAt = new Date().toISOString();
  const totals = modules.reduce((a, m) => ({
    correct: a.correct + m.correctItems,
    total: a.total + m.totalItems,
    trials: a.trials + m.trials,
    throughput: a.throughput + m.throughput * m.trials,
  }), { correct: 0, total: 0, trials: 0, throughput: 0 });

  const session = {
    id: `th-${Date.now().toString(36)}`,
    kind: routine.modules.length > 1 ? 'routine' : 'module',
    routineId: routine.id,
    routineName: routine.name,
    startedAt,
    completedAt,
    durationMs: performance.now() - startMs,
    trials: totals.trials,
    correctItems: totals.correct,
    totalItems: totals.total,
    accuracy: totals.total ? totals.correct / totals.total : 0,
    throughput: totals.trials ? Math.round(totals.throughput / totals.trials) : 0,
    bestExposureMs: modules.reduce((a, m) => {
      if (m.bestExposureMs === null) return a;
      return a === null ? m.bestExposureMs : Math.min(a, m.bestExposureMs);
    }, null),
    personalBests: modules.reduce((a, m) => a + m.personalBests, 0),
    completed: !control.aborted,
    modules,
  };

  if (session.trials > 0) store.addSession(session);
  return session;
}
