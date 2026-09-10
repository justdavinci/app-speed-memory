// MEMORY LAB — construção das tentativas e adaptação.

import { MEMORY_LAB_CONFIG, MEMORY_LAB_MODES } from './config.js';
import { LITERATURE_SEED, stimulusById } from './dataset.js';
import { pickQuestions, questionBankFor, separationQuestion } from './questions.js';
import * as store from './store.js';
import { makeRng, rPick, rShuffle } from '../tryhard/rng.js';

const nearestIndex = (values, x) => values.reduce((best, v, i) => (
  Math.abs(v - x) < Math.abs(values[best] - x) ? i : best
), 0);

function requireFresh(mode) {
  return mode === 'one-shot' || mode === 'page-capture' || mode === 'life-transfer';
}

function splitForMode(mode) {
  return mode === 'life-transfer' ? 'holdout' : 'train';
}

export function candidateStimuli(mode, { includeSeen = false } = {}) {
  const split = splitForMode(mode);
  let xs = LITERATURE_SEED.filter((s) => s.split === split);
  if (!includeSeen || requireFresh(mode)) xs = xs.filter((s) => !store.isSeen(s.id));
  return xs;
}

export function freshCounts() {
  const count = (split) => LITERATURE_SEED.filter((s) => s.split === split && !store.isSeen(s.id)).length;
  return { train: count('train'), novel: count('novel'), holdout: count('holdout') };
}

function chooseTarget(mode, rng) {
  let candidates = candidateStimuli(mode, { includeSeen: !requireFresh(mode) });
  // Component drills podem reaproveitar conteúdo depois de o pool fresco acabar;
  // o registro deixa claro que isso não conta como One Shot válido.
  if (!candidates.length && !requireFresh(mode)) {
    candidates = LITERATURE_SEED.filter((s) => s.split === 'train');
  }
  return candidates.length ? rPick(rng, candidates) : null;
}

function chooseInterference(target, rng) {
  const seen = LITERATURE_SEED.filter((s) => s.split === 'train' && s.id !== target.id && store.isSeen(s.id));
  if (seen.length) return rPick(rng, seen);
  const any = LITERATURE_SEED.filter((s) => s.split === 'train' && s.id !== target.id);
  return any.length ? rPick(rng, any) : null;
}

function alteredFactSheet(stimulus, factIndex) {
  const rows = stimulus.facts.slice(0, 3).map((f, i) => ({ prompt: f.prompt, answer: f.answer }));
  const f = stimulus.facts[factIndex % rows.length];
  rows[factIndex % rows.length] = { prompt: f.prompt, answer: f.distractors?.[0] || 'outro valor' };
  return rows;
}

export function createMemoryTrial({ mode = 'one-shot', settings = store.getSettings(), seed = null } = {}) {
  const spec = MEMORY_LAB_MODES[mode];
  if (!spec) throw new Error(`Modo Memory Lab desconhecido: ${mode}`);
  const rng = makeRng(seed);
  const target = chooseTarget(mode, rng);
  if (!target) {
    return {
      exhausted: true,
      mode,
      split: splitForMode(mode),
      reason: mode === 'life-transfer'
        ? 'O holdout interno deste pack já foi consumido. Não o reutilizamos para fingir novidade.'
        : 'O pool fresco deste modo acabou. Adicione novo material real para preservar o protocolo One Shot.',
    };
  }

  const skill = store.getSkill(mode);
  const adaptive = settings.adaptive !== false && !spec.benchmark;
  const exposureMs = adaptive ? skill.exposureMs : settings.exposureMs;
  const baseRetention = adaptive ? skill.retentionMs : settings.retentionMs;
  const retentionMs = Math.round(baseRetention * (spec.retentionMultiplier ?? 1));
  const bank = questionBankFor(target, rng);

  let questions;
  let renderKind = 'page';
  let interference = null;
  let secondary = null;

  if (mode === 'binding') {
    renderKind = 'fact-sheet';
    questions = pickQuestions(bank, spec.queryCount, rng, ['binding', 'binding', 'binding']);
  } else if (mode === 'page-capture') {
    questions = pickQuestions(bank, spec.queryCount, rng, ['spatial', 'structure', 'semantic', 'anchor']);
  } else if (mode === 'separation') {
    renderKind = 'fact-sheet';
    const factIndex = Math.floor(rng() * Math.min(3, target.facts.length));
    secondary = { kind: 'fact-sheet', rows: alteredFactSheet(target, factIndex), label: 'Ficha B' };
    questions = [
      separationQuestion(target, factIndex, rng),
      ...pickQuestions(bank, Math.max(0, spec.queryCount - 1), rng, ['binding']),
    ];
  } else if (mode === 'interference') {
    questions = pickQuestions(bank, spec.queryCount, rng, ['anchor', 'binding', 'semantic']);
    interference = chooseInterference(target, rng);
  } else if (mode === 'life-transfer') {
    questions = pickQuestions(bank, spec.queryCount, rng, ['semantic', 'binding', 'spatial', 'anchor']);
  } else {
    questions = pickQuestions(bank, spec.queryCount, rng, ['anchor', 'binding', 'semantic']);
  }

  const chosenIds = new Set(questions.map((q) => q.id));
  const unusedQuestionIds = bank.filter((q) => !chosenIds.has(q.id)).map((q) => q.id);
  const layouts = ['book', 'article', 'compact', 'wide'];

  return {
    id: `ml-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
    mode,
    spec,
    split: target.split,
    target,
    targetWasFresh: !store.isSeen(target.id),
    oneShotValid: !store.isSeen(target.id),
    renderKind,
    layout: settings.layoutVariation === false ? 'book' : rPick(rng, layouts),
    exposureMs,
    retentionMs,
    questions,
    unusedQuestionIds: rShuffle(rng, unusedQuestionIds),
    secondary,
    interference,
    adaptive,
    benchmark: !!spec.benchmark,
  };
}

export function markTrialExposure(trial, timing, secondaryTiming = null) {
  if (!trial?.target) return null;
  const before = store.seenInfo(trial.target.id);
  const seen = store.markSeen(trial.target.id, {
    mode: trial.mode,
    split: trial.split,
    requestedExposureMs: trial.exposureMs,
    actualExposureMs: timing?.actualMs ?? null,
  });
  trial.oneShotValid = !before;
  trial.targetWasFresh = !before;

  // Um distractor real também foi externamente visto. Não pode aparecer mais
  // tarde como um "One Shot" fresco sem que o sistema saiba disso.
  if (trial.interference && !store.isSeen(trial.interference.id)) {
    store.markSeen(trial.interference.id, {
      mode: 'interference-distractor',
      split: trial.interference.split,
      requestedExposureMs: trial.exposureMs,
      actualExposureMs: secondaryTiming?.actualMs ?? null,
    });
  }
  return seen;
}

/**
 * Agenda probes de detalhes ainda não perguntados. A página não reaparece.
 */
export function scheduleDeferredFromTrial(trial, now = Date.now()) {
  if (!trial?.oneShotValid || trial.mode !== 'one-shot') return 0;
  let cursor = 0;
  let added = 0;
  MEMORY_LAB_CONFIG.deferredProbeDelaysMs.forEach((delayMs) => {
    for (let n = 0; n < MEMORY_LAB_CONFIG.deferredQuestionsPerProbe; n++) {
      const questionId = trial.unusedQuestionIds[cursor++];
      if (!questionId) return;
      if (store.scheduleProbe({
        stimulusId: trial.target.id,
        source: trial.target.source,
        questionId,
        delayMs,
        encodedAt: now,
        dueAt: now + delayMs,
        priorProbeCount: n,
        datasetVersion: MEMORY_LAB_CONFIG.datasetVersion,
      })) added += 1;
    }
  });
  return added;
}

export function materializeProbe(probe, seed = null) {
  const stimulus = stimulusById(probe.stimulusId);
  if (!stimulus) return null;
  const bank = questionBankFor(stimulus, makeRng(seed));
  const question = bank.find((q) => q.id === probe.questionId);
  if (!question) return null;
  return { ...probe, stimulus, question };
}

/**
 * Adaptação de uma variável por vez. Acima da faixa: exposição encurta ou
 * retenção cresce. Abaixo: o último eixo é aliviado. Sem amostra, nada muda.
 */
export function adaptAfterTrial(mode, record, settings = store.getSettings()) {
  const spec = MEMORY_LAB_MODES[mode];
  if (!spec || spec.benchmark || settings.adaptive === false || record.invalid) return store.getSkill(mode);
  const skill = store.getSkill(mode);
  const recent = store.getTrials({ mode }).filter((t) => !t.invalid && !t.probe).slice(-MEMORY_LAB_CONFIG.adaptationWindow);
  const trialsSinceChange = (skill.trialsSinceChange || 0) + 1;
  if (recent.length < MEMORY_LAB_CONFIG.adaptationWindow || trialsSinceChange < MEMORY_LAB_CONFIG.minTrialsBetweenChanges) {
    const rollingAccuracy = recent.length ? recent.reduce((a, t) => a + t.accuracy, 0) / recent.length : null;
    return store.updateSkill(mode, { trialsSinceChange, rollingAccuracy });
  }

  const accuracy = recent.reduce((a, t) => a + t.accuracy, 0) / recent.length;
  const [low, high] = MEMORY_LAB_CONFIG.trainingZone;
  if (accuracy >= low && accuracy <= high) {
    return store.updateSkill(mode, { trialsSinceChange, rollingAccuracy: accuracy });
  }

  const exp = MEMORY_LAB_CONFIG.exposureLadderMs;
  const ret = MEMORY_LAB_CONFIG.retentionLadderMs;
  let e = nearestIndex(exp, skill.exposureMs);
  let r = nearestIndex(ret, skill.retentionMs);
  const axis = (skill.axisCursor || 0) % 2;

  if (accuracy > high) {
    if (axis === 0 && e < exp.length - 1) e += 1; // ladder é decrescente
    else if (r < ret.length - 1) r += 1;
    else if (e < exp.length - 1) e += 1;
  } else {
    if (axis === 0 && e > 0) e -= 1;
    else if (r > 0) r -= 1;
    else if (e > 0) e -= 1;
  }

  return store.updateSkill(mode, {
    exposureMs: exp[e],
    retentionMs: ret[r],
    trialsSinceChange: 0,
    rollingAccuracy: accuracy,
    axisCursor: (skill.axisCursor || 0) + 1,
  });
}

export function buildRecord({ trial, result, timing, retentionTiming, interferenceTiming = null, startedAt, answeredAt }) {
  return {
    id: trial.id,
    timestamp: new Date().toISOString(),
    startedAt,
    answeredAt,
    mode: trial.mode,
    component: trial.spec.primaryComponent,
    components: [...new Set(result.perQuestion.map((q) => q.component).concat(trial.spec.primaryComponent))],
    split: trial.split,
    stimulusId: trial.target.id,
    source: trial.target.source,
    chapter: trial.target.chapter,
    oneShotValid: !!trial.oneShotValid,
    benchmark: !!trial.benchmark,
    requestedExposureMs: trial.exposureMs,
    actualExposureMs: timing?.actualMs ?? null,
    retentionRequestedMs: trial.retentionMs,
    retentionActualMs: retentionTiming?.actualMs ?? trial.retentionMs,
    interferenceExposureMs: interferenceTiming?.actualMs ?? null,
    correct: result.correct,
    total: result.total,
    accuracy: result.accuracy,
    perQuestion: result.perQuestion,
    invalid: false,
    protocolVersion: MEMORY_LAB_CONFIG.version,
    datasetVersion: MEMORY_LAB_CONFIG.datasetVersion,
  };
}
