// Real World Transfer.
//
// Um único exercício cobre toda a escada: começa em símbolos soltos e, à
// medida que a pessoa acompanha, o material vira lista, interface, documento,
// mapa, cena e mistura. Duas regras dão o caráter do exercício:
//
//  1. a pergunta só aparece DEPOIS que a cena some, e nunca é anunciada antes;
//  2. parte do material é reservada — nunca treinada, só usada para medir.
//
// Toda a decisão de "apertar o tempo" ou "variar o material" vem de
// transfer/adapt.js, a partir da lacuna entre material conhecido e novo.

import { generateScene } from '../transfer/families/index.js';
import { generateQueries, scoreQueries } from '../transfer/queries.js';
import { sceneComplexity } from '../transfer/scene.js';
import {
  createNoveltyState, noteUse, pickTemplate, variationAmount,
} from '../transfer/novelty.js';
import {
  effectiveNoveltyRate, effectiveQueryComplexity, effectiveTier, escalationFor, nextTier, pressureFor,
} from '../transfer/adapt.js';
import { transferReport } from '../transfer/metrics.js';
import { generateMask } from '../stimuli.js';
import { MAX_TIER } from '../transfer/config.js';
import * as store from '../store.js';

const MASK_MS = [0, 90, 130, 180];

/** Texto neutro no momento da resposta: não pode entregar o que vem depois. */
const PROMPT = 'Sobre o que apareceu';

function buildTrial({ difficulty, rng, context, mode, tier, queryComplexity, noveltyRate }) {
  const pick = pickTemplate({
    tier,
    rng,
    state: context.novelty,
    trainedKeys: context.trainedKeys,
    noveltyRate,
    mode,
  });

  const variantAmount = variationAmount(context.novelty, {
    contextualVariation: difficulty.contextualVariation ?? 0.3,
    key: pick.key,
  });

  const scene = generateScene(pick.familyId, {
    difficulty,
    rng,
    templateId: pick.templateId,
    variantAmount,
  });

  const queries = generateQueries(scene, {
    complexity: queryComplexity,
    rng,
    avoidKinds: context.novelty.lastKinds,
    responseVariation: difficulty.responseVariation ?? 0,
  });

  noteUse(context.novelty, {
    key: pick.key,
    queryKinds: queries.map((q) => q.kind),
    answers: queries.map((q) => q.answer),
  });

  const interference = Math.round(difficulty.interferenceLevel || 0);
  const mask = interference > 0
    ? generateMask({
      length: Math.min(14, 6 + scene.elements.length),
      complexity: Math.min(3, interference),
      rng,
      exclude: scene.elements.map((e) => e.value),
    })
    : null;

  return {
    scene,
    queries,
    sceneHtml: scene.html,
    stimulusType: 'scenes',
    exposureMs: difficulty.exposureMs,
    cueDelayMs: Math.round(difficulty.retentionDelayMs || 0),
    mask: mask ? { ...mask, kind: 'scene' } : null,
    maskDurationMs: mask ? MASK_MS[Math.min(3, interference)] : 0,
    maskDelayMs: 0,
    expected: queries.map((q) => q.answer),
    totalItems: queries.length,
    extraComplexity: sceneComplexity(scene),
    response: { kind: 'questions', questions: queries, prompt: PROMPT },
    render: { kind: 'scene' },
    transfer: {
      familyId: pick.familyId,
      templateId: pick.templateId,
      templateKey: pick.key,
      tier,
      novel: pick.novel,
      holdout: pick.holdout,
      reason: pick.reason,
      mode,
      queryComplexity,
      queryKinds: queries.map((q) => q.kind),
    },
  };
}

/**
 * Fábrica dos exercícios de transferência.
 * @param {object} spec { id, mode, noveltyBoost, tierBoost }
 */
export function createTransferModule({ id, mode = 'training', noveltyBoost = 0, tierBoost = 0 }) {
  return {
    id,

    beginBlock() {
      return {
        novelty: createNoveltyState(),
        trainedKeys: store.getTrainedTemplateKeys(),
        blockTrials: [],
        tierAtStart: store.getTransferTier(),
      };
    },

    generate({ difficulty, rng, context }) {
      const settings = store.getTransferSettings();
      const storedTier = store.getTransferTier();
      // A faixa vive no armazenamento (atravessa blocos), mas a dimensão de
      // dificuldade também pode empurrá-la: vale a mais alta das duas.
      const base = Math.max(storedTier, Math.round(difficulty.tier ?? 0));
      const tier = Math.min(MAX_TIER, effectiveTier({ ...difficulty, tier: base }, settings) + tierBoost);
      const queryComplexity = effectiveQueryComplexity(difficulty, settings);
      const noveltyRate = Math.min(1, effectiveNoveltyRate(settings) + noveltyBoost);

      return buildTrial({ difficulty, rng, context, mode, tier, queryComplexity, noveltyRate });
    },

    score(trial, given) {
      return scoreQueries(trial.queries, given);
    },

    onTrialRecorded({ trial, result, record, context }) {
      const entry = {
        ...trial.transfer,
        timestamp: record.timestamp,
        accuracy: result.itemAccuracy,
        exposureMs: record.actualExposureMs ?? record.requestedExposureMs,
        invalid: false,
      };
      context.blockTrials.push(entry);
      store.recordTransferTrial(entry);
      if (!trial.transfer.holdout) context.trainedKeys.add(trial.transfer.templateKey);
    },

    /** A ordem de escalada é decidida pela lacuna de transferência. */
    escalationOrder() {
      return escalationFor(store.getTransferTrials());
    },

    finishBlock({ context, adaptive }) {
      const all = store.getTransferTrials();
      const tierBefore = context.tierAtStart;
      const tierAfter = adaptive === false ? tierBefore : nextTier(all, tierBefore);
      if (tierAfter !== tierBefore) store.setTransferTier(tierAfter);

      const report = transferReport(all, { tier: tierAfter });
      const pressure = pressureFor(all);
      return {
        tierBefore,
        tierAfter,
        blockTrials: context.blockTrials.length,
        novelTrials: context.blockTrials.filter((t) => t.novel || t.holdout).length,
        holdoutTrials: context.blockTrials.filter((t) => t.holdout).length,
        families: [...new Set(context.blockTrials.map((t) => t.familyId))],
        transferGap: report.transferGap,
        generalization: report.generalization,
        realWorldIndex: report.realWorldIndex,
        overfit: report.overfit.overfit,
        pressure: pressure.axis,
        pressureReason: pressure.reason,
      };
    },
  };
}

export default createTransferModule({ id: 'real-world', mode: 'training' });

/** Modo Caos: material inédito sempre que houver, faixa um degrau acima. */
export const chaosMode = createTransferModule({
  id: 'chaos-mode',
  mode: 'chaos',
  noveltyBoost: 0.4,
  tierBoost: 1,
});
