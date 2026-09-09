// Métricas de transferência.
//
// A pergunta que este arquivo responde é: o desempenho da pessoa depende do
// material específico que ela treinou, ou sobrevive quando o material muda?
//
// Para isso as tentativas são separadas em dois lados. TREINADO é material que
// ela já viu antes. NOVO é material inédito — em especial os modelos
// reservados, que nunca aparecem em treino. A distância entre os dois lados é
// o que chamamos de lacuna de transferência.
//
// Nada aqui é medida científica validada: são índices internos do app, úteis
// para acompanhar evolução e para o motor decidir o que fazer a seguir.

import { MAX_TIER, TRANSFER_CONFIG } from './config.js';
import { FAMILY_IDS, getFamily } from './families/index.js';

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/** Uma tentativa conta como "nova" quando o modelo era inédito ou reservado. */
export const isNovel = (t) => !!(t.novel || t.holdout);

/** Separa as tentativas nos dois lados da comparação. */
export function splitTrials(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const valid = trials.filter((t) => !t.invalid).slice(-window);
  return {
    all: valid,
    trained: valid.filter((t) => !isNovel(t)),
    novel: valid.filter((t) => isNovel(t)),
    holdout: valid.filter((t) => t.holdout),
  };
}

/**
 * Lacuna de transferência: quanto o desempenho cai quando o material é novo.
 * Devolve null enquanto não houver tentativas suficientes dos dois lados —
 * comparar com três tentativas de cada lado seria ruído, não medida.
 */
export function transferGap(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const { trained, novel } = splitTrials(trials, window);
  const min = TRANSFER_CONFIG.minTrialsPerSide;
  if (trained.length < min || novel.length < min) return null;
  const a = mean(trained.map((t) => t.accuracy));
  const b = mean(novel.map((t) => t.accuracy));
  return Math.round((a - b) * 1000) / 1000;
}

/** Quantas famílias diferentes a pessoa já enfrentou, de 0 a 1. */
export function breadth(trials) {
  const families = new Set(trials.filter((t) => !t.invalid).map((t) => t.familyId));
  return Math.min(1, families.size / FAMILY_IDS.length);
}

/**
 * Índice de generalização (0 a 1): desempenho em material novo, descontado
 * pela estreiteza do repertório. Acertar 90% sempre no mesmo formato não
 * generaliza nada, e a métrica precisa dizer isso.
 */
export function generalizationScore(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const { novel, all } = splitTrials(trials, window);
  if (novel.length < TRANSFER_CONFIG.minTrialsPerSide) return null;
  const accuracy = mean(novel.map((t) => t.accuracy)) ?? 0;
  const coverage = breadth(all);
  const novelShare = all.length ? novel.length / all.length : 0;
  const confidence = Math.min(1, novel.length / (TRANSFER_CONFIG.minTrialsPerSide * 3));
  const value = accuracy * (0.55 + 0.25 * coverage + 0.2 * Math.min(1, novelShare * 2)) * confidence;
  return Math.round(Math.min(1, value) * 1000) / 1000;
}

/**
 * Índice de Mundo Real (0 a 1000). Junta cinco componentes normalizados:
 * acerto em material novo, variedade de formatos, faixa alcançada, velocidade
 * e profundidade das perguntas. Só sobe de verdade quem acerta rápido,
 * material variado e perguntas difíceis.
 */
export function realWorldIndex(trials, { tier = 0, window = TRANSFER_CONFIG.metricsWindow } = {}) {
  const { all, novel } = splitTrials(trials, window);
  if (!all.length) return 0;
  const w = TRANSFER_CONFIG.realWorldWeights;

  const novelAccuracy = novel.length ? (mean(novel.map((t) => t.accuracy)) ?? 0) : 0;
  const coverage = breadth(all);
  const tierPart = Math.min(1, tier / MAX_TIER);

  const exposures = all.map((t) => t.exposureMs).filter((v) => typeof v === 'number' && v > 0);
  const exposure = exposures.length ? Math.min(...exposures) : TRANSFER_CONFIG.speedReferenceMs;
  const clamped = Math.min(TRANSFER_CONFIG.speedReferenceMs, Math.max(TRANSFER_CONFIG.speedFloorMs, exposure));
  const speed = Math.log(TRANSFER_CONFIG.speedReferenceMs / clamped)
    / Math.log(TRANSFER_CONFIG.speedReferenceMs / TRANSFER_CONFIG.speedFloorMs);

  const depth = Math.min(1, ((mean(all.map((t) => t.queryComplexity || 1)) ?? 1) - 1) / 3);

  const value = w.novelAccuracy * novelAccuracy
    + w.breadth * coverage
    + w.tier * tierPart
    + w.speed * speed
    + w.queryDepth * depth;

  return Math.round(Math.min(1, Math.max(0, value)) * TRANSFER_CONFIG.realWorldScale);
}

/**
 * Sobreajuste: a pessoa vai bem no que treinou e mal no resto. Quando isso
 * acontece, a resposta certa não é acelerar — é variar o material.
 */
export function detectOverfitting(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const gap = transferGap(trials, window);
  if (gap === null) return { overfit: false, gap: null, reason: 'dados insuficientes' };
  const { trained, novel } = splitTrials(trials, window);
  const trainedAccuracy = mean(trained.map((t) => t.accuracy)) ?? 0;

  if (gap >= TRANSFER_CONFIG.overfitGapThreshold && trainedAccuracy >= 0.7) {
    return {
      overfit: true,
      gap,
      trainedAccuracy,
      novelAccuracy: mean(novel.map((t) => t.accuracy)) ?? 0,
      reason: 'desempenho preso ao material treinado',
    };
  }
  return { overfit: false, gap, trainedAccuracy, novelAccuracy: mean(novel.map((t) => t.accuracy)) ?? 0, reason: 'dentro do esperado' };
}

/** Desempenho por família, para o painel mostrar onde está o buraco. */
export function familyBreakdown(trials, window = TRANSFER_CONFIG.metricsWindow) {
  const valid = trials.filter((t) => !t.invalid).slice(-window * 2);
  return FAMILY_IDS.map((familyId) => {
    const list = valid.filter((t) => t.familyId === familyId);
    if (!list.length) return null;
    const novel = list.filter(isNovel);
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

/** Modelos já enfrentados, para o motor de novidade saber o que é inédito. */
export function trainedTemplateKeys(trials) {
  const keys = new Set();
  trials.forEach((t) => {
    if (t.invalid || t.holdout) return;
    keys.add(`${t.familyId}/${t.templateId}`);
  });
  return keys;
}

/**
 * A faixa deve subir, descer ou ficar? Só sobe quem vai bem em material NOVO:
 * subir com base no material já treinado seria promover o sobreajuste.
 */
export function tierRecommendation(trials, currentTier, window = TRANSFER_CONFIG.metricsWindow) {
  const { novel, all } = splitTrials(trials, window);
  if (all.length < TRANSFER_CONFIG.tierUpTrials) return 'hold';
  const recent = all.slice(-TRANSFER_CONFIG.tierUpTrials);
  const recentAccuracy = mean(recent.map((t) => t.accuracy)) ?? 0;
  if (recentAccuracy <= TRANSFER_CONFIG.tierDownAccuracy && currentTier > 0) return 'down';

  if (novel.length < TRANSFER_CONFIG.minTrialsPerSide) return 'hold';
  const novelAccuracy = mean(novel.map((t) => t.accuracy)) ?? 0;
  const gap = transferGap(trials, window);
  const gapOk = gap === null || gap <= TRANSFER_CONFIG.transferGapThreshold;
  if (novelAccuracy >= TRANSFER_CONFIG.tierUpAccuracy && gapOk && currentTier < MAX_TIER) return 'up';
  return 'hold';
}

/** Relatório completo, usado pelo painel e pelo resultado da sessão. */
export function transferReport(trials, { tier = 0 } = {}) {
  const split = splitTrials(trials);
  const overfit = detectOverfitting(trials);
  return {
    trials: split.all.length,
    trainedTrials: split.trained.length,
    novelTrials: split.novel.length,
    holdoutTrials: split.holdout.length,
    trainedAccuracy: split.trained.length ? mean(split.trained.map((t) => t.accuracy)) : null,
    novelAccuracy: split.novel.length ? mean(split.novel.map((t) => t.accuracy)) : null,
    holdoutAccuracy: split.holdout.length ? mean(split.holdout.map((t) => t.accuracy)) : null,
    transferGap: overfit.gap,
    generalization: generalizationScore(trials),
    realWorldIndex: realWorldIndex(trials, { tier }),
    overfit,
    breadth: breadth(split.all),
    families: familyBreakdown(trials),
    tier,
    recommendation: tierRecommendation(trials, tier),
  };
}
