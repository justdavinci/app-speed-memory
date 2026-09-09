// Métricas de transferência.
//
// Regra v2: a lacuna de transferência compara desempenho treinado × material
// aberto inédito somente em condições de dificuldade equivalentes. Holdouts e
// benchmarks ficam fora da adaptação; continuam disponíveis como validação.

import { MAX_TIER, TRANSFER_CONFIG } from './config.js';
import { FAMILY_IDS, getFamily } from './families/index.js';

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const round3 = (v) => Math.round(v * 1000) / 1000;

/** Categoria pública "novo": inclui material aberto inédito e holdout. */
export const isNovel = (t) => !!(t.novel || t.holdout);
/** Novo que pode alimentar adaptação: somente pool aberto durante treino. */
const isTrainingNovel = (t) => !!t.novel && !t.holdout && t.mode !== 'benchmark';

/**
 * Assinatura de dificuldade para pareamento.
 * A família NÃO entra: mudar de família é justamente parte da transferência.
 */
export function transferConditionSignature(t) {
  const bucket = TRANSFER_CONFIG.gapExposureBucketMs || 25;
  const exposure = typeof t.exposureMs === 'number' ? Math.round(t.exposureMs / bucket) * bucket : 'x';
  const retention = typeof t.retentionDelayMs === 'number' ? Math.round(t.retentionDelayMs / 50) * 50 : 'x';
  return [
    t.tier ?? 'x',
    exposure,
    t.queryComplexity ?? 'x',
    t.informationDensity ?? 'x',
    retention,
    t.interferenceLevel ?? 'x',
  ].join('|');
}

/**
 * `novel` mantém a semântica histórica (todo material novo, inclusive holdout)
 * para UI/compatibilidade. `trainingNovel` é o subconjunto seguro usado pelo
 * motor adaptativo e pelo gap difficulty-matched.
 */
export function splitTrials(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const valid = trials.filter((t) => !t.invalid).slice(-window);
  const training = valid.filter((t) => !t.holdout && t.mode !== 'benchmark');
  return {
    all: valid,
    training,
    trained: training.filter((t) => !t.novel),
    trainingNovel: training.filter(isTrainingNovel),
    novel: valid.filter(isNovel),
    holdout: valid.filter((t) => t.holdout),
  };
}

export function matchedTransferGroups(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const { trained, trainingNovel } = splitTrials(trials, window);
  const groups = new Map();
  const add = (t, side) => {
    const key = transferConditionSignature(t);
    if (!groups.has(key)) groups.set(key, { key, trained: [], novel: [] });
    groups.get(key)[side].push(t);
  };
  trained.forEach((t) => add(t, 'trained'));
  trainingNovel.forEach((t) => add(t, 'novel'));
  return [...groups.values()]
    .filter((g) => g.trained.length && g.novel.length)
    .map((g) => ({
      ...g,
      trainedAccuracy: mean(g.trained.map((t) => t.accuracy)) ?? 0,
      novelAccuracy: mean(g.novel.map((t) => t.accuracy)) ?? 0,
      weight: Math.min(g.trained.length, g.novel.length),
    }));
}

export function transferGap(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const groups = matchedTransferGroups(trials, window);
  const matched = groups.reduce((a, g) => a + g.weight, 0);
  if (matched < TRANSFER_CONFIG.minTrialsPerSide) return null;
  const weighted = groups.reduce((a, g) => a + (g.trainedAccuracy - g.novelAccuracy) * g.weight, 0);
  return round3(weighted / matched);
}

export function breadth(trials) {
  const families = new Set(trials.filter((t) => !t.invalid).map((t) => t.familyId));
  return Math.min(1, families.size / FAMILY_IDS.length);
}

export function generalizationScore(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const { trainingNovel, training } = splitTrials(trials, window);
  if (trainingNovel.length < TRANSFER_CONFIG.minTrialsPerSide) return null;
  const accuracy = mean(trainingNovel.map((t) => t.accuracy)) ?? 0;
  const coverage = breadth(training);
  const novelShare = training.length ? trainingNovel.length / training.length : 0;
  const confidence = Math.min(1, trainingNovel.length / (TRANSFER_CONFIG.minTrialsPerSide * 3));
  const value = accuracy * (0.55 + 0.25 * coverage + 0.2 * Math.min(1, novelShare * 2)) * confidence;
  return round3(Math.min(1, value));
}

export function realWorldIndex(trials, { tier = 0, window = TRANSFER_CONFIG.metricsWindow } = {}) {
  const { training, trainingNovel } = splitTrials(trials, window);
  if (!training.length) return 0;
  const w = TRANSFER_CONFIG.realWorldWeights;

  const novelAccuracy = trainingNovel.length ? (mean(trainingNovel.map((t) => t.accuracy)) ?? 0) : 0;
  const coverage = breadth(training);
  const tierPart = Math.min(1, tier / MAX_TIER);
  const exposures = training.map((t) => t.exposureMs).filter((v) => typeof v === 'number' && v > 0);
  const exposure = exposures.length ? Math.min(...exposures) : TRANSFER_CONFIG.speedReferenceMs;
  const clamped = Math.min(TRANSFER_CONFIG.speedReferenceMs, Math.max(TRANSFER_CONFIG.speedFloorMs, exposure));
  const speed = Math.log(TRANSFER_CONFIG.speedReferenceMs / clamped)
    / Math.log(TRANSFER_CONFIG.speedReferenceMs / TRANSFER_CONFIG.speedFloorMs);
  const depth = Math.min(1, ((mean(training.map((t) => t.queryComplexity || 1)) ?? 1) - 1) / 3);

  const value = w.novelAccuracy * novelAccuracy
    + w.breadth * coverage
    + w.tier * tierPart
    + w.speed * speed
    + w.queryDepth * depth;
  return Math.round(Math.min(1, Math.max(0, value)) * TRANSFER_CONFIG.realWorldScale);
}

export function detectOverfitting(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const gap = transferGap(trials, window);
  if (gap === null) return { overfit: false, gap: null, reason: 'dados comparáveis insuficientes' };
  const groups = matchedTransferGroups(trials, window);
  const total = groups.reduce((a, g) => a + g.weight, 0) || 1;
  const trainedAccuracy = groups.reduce((a, g) => a + g.trainedAccuracy * g.weight, 0) / total;
  const novelAccuracy = groups.reduce((a, g) => a + g.novelAccuracy * g.weight, 0) / total;

  if (gap >= TRANSFER_CONFIG.overfitGapThreshold && trainedAccuracy >= 0.7) {
    return {
      overfit: true,
      gap,
      trainedAccuracy,
      novelAccuracy,
      reason: 'desempenho preso ao material treinado em condições comparáveis',
    };
  }
  return { overfit: false, gap, trainedAccuracy, novelAccuracy, reason: 'dentro do esperado' };
}

export function familyBreakdown(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const valid = trials.filter((t) => !t.invalid).slice(-window * 2);
  return FAMILY_IDS.map((familyId) => {
    const list = valid.filter((t) => t.familyId === familyId && !t.holdout && t.mode !== 'benchmark');
    if (!list.length) return null;
    const novel = list.filter((t) => t.novel);
    return {
      familyId,
      name: getFamily(familyId)?.name || familyId,
      tier: getFamily(familyId)?.tier ?? 0,
      trials: list.length,
      accuracy: mean(list.map((t) => t.accuracy)),
      novelTrials: novel.length,
      novelAccuracy: novel.length ? mean(novel.map((t) => t.accuracy)) : null,
    };
  }).filter(Boolean).sort((a, b) => a.tier - b.tier);
}

export function trainedTemplateKeys(trials) {
  const keys = new Set();
  trials.forEach((t) => {
    if (t.invalid || t.holdout || t.mode === 'benchmark') return;
    keys.add(`${t.familyId}/${t.templateId}`);
  });
  return keys;
}

export function tierRecommendation(trials, currentTier, window = TRANSFER_CONFIG.metricsWindow) {
  const { trainingNovel, training } = splitTrials(trials, window);
  if (training.length < TRANSFER_CONFIG.tierUpTrials) return 'hold';
  const recent = training.slice(-TRANSFER_CONFIG.tierUpTrials);
  const recentAccuracy = mean(recent.map((t) => t.accuracy)) ?? 0;
  if (recentAccuracy <= TRANSFER_CONFIG.tierDownAccuracy && currentTier > 0) return 'down';

  if (trainingNovel.length < TRANSFER_CONFIG.minTrialsPerSide) return 'hold';
  const novelAccuracy = mean(trainingNovel.map((t) => t.accuracy)) ?? 0;
  const gap = transferGap(trials, window);
  if (gap === null) return 'hold';
  if (novelAccuracy >= TRANSFER_CONFIG.tierUpAccuracy
      && gap <= TRANSFER_CONFIG.transferGapThreshold
      && currentTier < MAX_TIER) return 'up';
  return 'hold';
}

export function transferReport(trials, { tier = 0 } = {}) {
  const split = splitTrials(trials);
  const overfit = detectOverfitting(trials);
  const matchedGroups = matchedTransferGroups(trials);
  const matchedTrials = matchedGroups.reduce((a, g) => a + g.weight, 0);
  return {
    trials: split.all.length,
    trainingTrials: split.training.length,
    trainedTrials: split.trained.length,
    novelTrials: split.novel.length,
    trainingNovelTrials: split.trainingNovel.length,
    holdoutTrials: split.holdout.length,
    trainedAccuracy: split.trained.length ? mean(split.trained.map((t) => t.accuracy)) : null,
    novelAccuracy: split.novel.length ? mean(split.novel.map((t) => t.accuracy)) : null,
    trainingNovelAccuracy: split.trainingNovel.length ? mean(split.trainingNovel.map((t) => t.accuracy)) : null,
    holdoutAccuracy: split.holdout.length ? mean(split.holdout.map((t) => t.accuracy)) : null,
    matchedTrials,
    transferGap: overfit.gap,
    generalization: generalizationScore(trials),
    realWorldIndex: realWorldIndex(trials, { tier }),
    overfit,
    breadth: breadth(split.training),
    families: familyBreakdown(trials),
    tier,
    recommendation: tierRecommendation(trials, tier),
  };
}
