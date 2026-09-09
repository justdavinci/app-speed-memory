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
import * as availability from './availability/index.js';
import { AVAILABILITY_CONFIG } from './availability/config.js';
import { hasConverged } from './availability/staircase.js';

/** Controle externo da sessão: pausar, encerrar. */
export function createControl() {
  let paused = false;
  let aborted = false;
  let resumed = false;
  let resumeWaiters = [];
  // Quem estiver esperando o usuário (uma resposta, um resumo) precisa ser
  // avisado do encerramento: sem isso a promessa nunca resolve e a sessão
  // fica pendurada com o overlay na tela.
  let abortWaiters = [];
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
      const waiters = abortWaiters;
      abortWaiters = [];
      waiters.forEach((fn) => fn());
    },

    /** Avisa quando a sessão for encerrada. Devolve como cancelar o aviso. */
    onAbort(fn) {
      if (aborted) { fn(); return () => {}; }
      abortWaiters.push(fn);
      return () => { abortWaiters = abortWaiters.filter((f) => f !== fn); };
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
  // Módulos com estado próprio de bloco (o Real World Transfer guarda o motor
  // de novidade aqui) recebem um contexto criado uma vez e repassado adiante.
  const context = mod.beginBlock?.({ block, moduleId, settings, difficulty, rng, adaptive }) || null;

  // Disponibilidade visual: escada própria, separada da dificuldade. O estado
  // é por categoria de estímulo, então é carregado sob demanda.
  const availabilitySettings = store.getAvailabilitySettings();
  const availabilityOn = block.availability !== false
    && availability.isActiveFor(availabilitySettings, moduleId);
  const availabilityStates = new Map();
  const availabilityTrials = new Map();
  const availabilityUsed = new Set();
  let warmupLeft = 0;

  const availabilityStateOf = (category) => {
    if (!availabilityStates.has(category)) {
      availabilityStates.set(category, store.getAvailabilityState(category));
      availabilityTrials.set(category, store.getAvailabilityTrials(category));
    }
    return availabilityStates.get(category);
  };

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
      // Depois de uma pausa as primeiras tentativas são de readaptação: contam
      // como treino, mas ficam fora da conta do limiar (§66).
      if (availabilityOn) warmupLeft = AVAILABILITY_CONFIG.warmupTrials;
    }

    const trialIndex = trials.length;
    const trial = mod.generate({ difficulty, stimulus, rng, settings, trialIndex, context });
    trial.moduleId = moduleId;
    trial.difficultyState = { ...difficulty };

    // Um módulo pode chegar com o plano pronto (é o caso dos benchmarks, que
    // ditam o atraso em vez de deixar a escada decidir).
    if (availabilityOn && !trial.availability) {
      const categoria = availability.categoryFor(trial);
      const escada = availabilityStateOf(categoria);
      const plano = availability.planTrial({
        settings: availabilitySettings,
        moduleId,
        trial,
        state: escada,
        calibrated: escada.calibratedTrials || 0,
        rng,
        warmup: warmupLeft > 0,
      });
      availability.applyToTrial(trial, plano);
      if (plano.active) {
        trial.cleanRetrievalDelayMs = plano.cleanRetrieval
          ? AVAILABILITY_CONFIG.cleanRetrievalOptionsDelayMs : 0;
        if (warmupLeft > 0) warmupLeft -= 1;
      }
    }

    view.setProgress?.({
      trialIndex,
      trialsDone: trials.filter((t) => !t.invalid).length,
      budget,
      elapsedMs,
      difficulty,
      calibrating,
      availability: trial.availability?.active ? {
        delayMs: trial.availability.requestedDelayMs,
        phase: trial.availability.phase,
        t80: availabilityStates.get(trial.availability.category)?.smoothedT80 ?? null,
        accuracy: availabilityStates.get(trial.availability.category)?.rollingAccuracy ?? null,
      } : null,
    });

    const outcome = await runTrial({ trial, mod, view, control, settings, rng });

    if (outcome.invalid) {
      trials.push({ invalid: true, reason: outcome.reason, timestamp: new Date().toISOString() });
      store.recordTrial(moduleId, { invalid: true, timestamp: new Date().toISOString(), difficulty });
      await view.showInvalid?.(outcome.reason);
      continue;
    }
    if (outcome.aborted) break;

    const result = mod.score(trial, outcome.response, context);
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
      // Tempo a partir do instante em que responder virou possível. É outra
      // coisa que disponibilidade, e nunca substitui a estimativa dela (§17).
      retrievalMs: outcome.reactionMs,
      availabilityActualMs: outcome.availabilityTiming?.actualMs ?? null,
      throughput,
      difficulty: { ...difficulty },
      benchmarkBlock: trial.benchmarkBlock || null,
      protocolVersion: trial.protocolVersion || null,
      invalid: false,
    };
    trials.push(record);

    const saved = store.recordTrial(moduleId, record);
    if (saved.beaten.length) personalBests += 1;
    mod.onTrialRecorded?.({ trial, result, record, context });

    // O benchmark mede sem ensinar: não mexe na escada nem entra no log de
    // treino, senão o protocolo fixo contaminaria a adaptação (§72).
    if (trial.availability?.active && trial.availability.phase !== 'benchmark') {
      const categoria = trial.availability.category;
      const entrada = availability.trialRecord({
        trial, result, record, timing: outcome.availabilityTiming,
      });
      store.recordAvailabilityTrial(entrada);
      availabilityUsed.add(categoria);

      const log = availabilityTrials.get(categoria) || [];
      log.push(entrada);
      availabilityTrials.set(categoria, log);

      const anterior = availabilityStateOf(categoria);
      const emCalibracao = trial.availability.phase === 'calibration';
      const decisao = availability.advance(anterior, log, availabilitySettings);
      availabilityStates.set(categoria, {
        ...decisao.state,
        calibratedTrials: (anterior.calibratedTrials || 0) + (emCalibracao ? 1 : 0),
        lastCalibrationAt: emCalibracao ? new Date().toISOString() : anterior.lastCalibrationAt,
      });
      store.updateAvailabilityState(categoria, availabilityStates.get(categoria));
    }
    opts.onTrial?.(record, result);

    trialsSinceChange += 1;
    if (adaptive) {
      const decision = evaluate(
        moduleId,
        { state: difficulty, cursor, calibrating, trialsSinceChange },
        trials,
        { order: escalationOrder() },
      );
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

  /**
   * Ordem de escalada da dificuldade. Enquanto a escada de disponibilidade
   * ainda procura o limiar, a exposição fica parada: mexer nas duas ao mesmo
   * tempo tornaria impossível dizer se a pessoa passou a ver mais rápido ou
   * apenas viu por menos tempo (§49).
   */
  function escalationOrder() {
    const base = mod.escalationOrder?.({ context, trials, difficulty }) || null;
    if (!availabilityOn || !availabilityUsed.size) return base;
    const procurando = [...availabilityUsed]
      .some((c) => !hasConverged(availabilityStates.get(c) || {}));
    if (!procurando) return base;
    const ordem = base || MODULE_SPECS[moduleId]?.escalation || [];
    const semExposicao = ordem.filter((k) => k !== 'exposureMs');
    return semExposicao.length ? semExposicao : ordem;
  }

  /** Fecha as categorias tocadas e devolve o resumo de disponibilidade. */
  function finishAvailability() {
    if (!availabilityUsed.size) return null;
    const categorias = {};
    for (const categoria of availabilityUsed) {
      const fechado = store.closeAvailabilityCategory(categoria);
      categorias[categoria] = fechado;
      if (fechado.t80 !== null) {
        store.addAvailabilityPoint({
          category: categoria,
          t80: fechado.t80,
          trials: fechado.trials,
          accuracy: fechado.accuracy,
          exposureMs: fechado.exposureMs,
        });
      }
    }
    const doBloco = [...availabilityUsed]
      .flatMap((c) => availabilityTrials.get(c) || [])
      .filter((t) => t.timestamp >= startedAt);
    const rt = doBloco.map((t) => t.retrievalMs).filter((v) => typeof v === 'number' && v > 0);
    const principal = Object.values(categorias).find((c) => c.t80 !== null) || null;
    return {
      categories: categorias,
      trials: doBloco.length,
      delaysMs: doBloco.map((t) => t.delayMs),
      accuracy: doBloco.length ? doBloco.reduce((a, t) => a + (t.accuracy ?? 0), 0) / doBloco.length : null,
      retrievalMs: rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : null,
      t80: principal?.t80 ?? null,
      smoothedT80: principal?.smoothedT80 ?? null,
      bestStableT80: principal?.bestStableT80 ?? null,
      confidence: principal?.confidence ?? 'baixa',
    };
  }

  function finish() {
    const summary = summarizeTrials(trials);
    const completedAt = new Date().toISOString();
    const extra = mod.finishBlock?.({ context, trials, difficulty, adaptive }) || null;
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
      ...(extra ? { transfer: extra } : {}),
      ...(availabilityUsed.size ? { availability: finishAvailability() } : {}),
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

    // Tela neutra entre o estímulo e a pergunta. Nada da pergunta pode estar
    // visível aqui: o que se mede é o intervalo, não a leitura antecipada.
    let availabilityTiming = null;
    if (trial.cueDelayMs) {
      const espera = await view.waitBlank(trial.cueDelayMs, control.signal);
      if (trial.availability?.active) {
        availabilityTiming = espera || { actualMs: trial.cueDelayMs };
      }
    }
    if (guard.invalid) return { invalid: true, reason: guard.reason };

    const response = await view.collectResponse(trial, control);
    if (response.aborted) return { aborted: true };
    if (guard.invalid) return { invalid: true, reason: guard.reason };

    return {
      response: response.items,
      reactionMs: response.reactionMs,
      timing,
      availabilityTiming,
    };
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
