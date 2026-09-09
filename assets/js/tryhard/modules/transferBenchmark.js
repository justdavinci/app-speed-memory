// Transfer Benchmark v1 — protocolo fixo de transferência.
//
// Este módulo NÃO adapta e NÃO ensina: ele existe só para medir. Todas as
// tentativas usam modelos RESERVADOS — material que nunca aparece em treino —
// em três faixas diferentes, com tempo e profundidade fixos. Como o protocolo
// não muda, dois dias podem ser comparados; como o material nunca foi
// treinado, o resultado fala de transferência, não de familiaridade.
//
// Mudar qualquer número daqui exige subir `benchmarkVersion` em
// transfer/config.js, senão o histórico compara coisas diferentes.

import { generateScene } from '../transfer/families/index.js';
import { generateQueries, scoreQueries } from '../transfer/queries.js';
import { sceneComplexity } from '../transfer/scene.js';
import { createNoveltyState, noteUse, pickTemplate } from '../transfer/novelty.js';
import { TRANSFER_CONFIG } from '../transfer/config.js';
import { realWorldIndex } from '../transfer/metrics.js';
import * as store from '../store.js';

/** Protocolo v1: três blocos de seis tentativas, sempre nesta ordem. */
export const TRANSFER_BENCHMARK_PROTOCOL = {
  version: TRANSFER_CONFIG.benchmarkVersion,
  blocks: [
    {
      id: 'estruturado',
      label: 'Estruturado',
      trials: 6,
      tier: 1,
      difficulty: {
        exposureMs: 400, informationDensity: 5, queryComplexity: 2,
        retentionDelayMs: 0, interferenceLevel: 0, responseVariation: 0, contextualVariation: 0.5,
      },
    },
    {
      id: 'documento',
      label: 'Documento e interface',
      trials: 6,
      tier: 3,
      difficulty: {
        exposureMs: 300, informationDensity: 6, queryComplexity: 2,
        retentionDelayMs: 80, interferenceLevel: 0, responseVariation: 0, contextualVariation: 0.5,
      },
    },
    {
      id: 'espacial',
      label: 'Mapa e cena',
      trials: 6,
      tier: 5,
      difficulty: {
        exposureMs: 250, informationDensity: 6, queryComplexity: 2,
        retentionDelayMs: 120, interferenceLevel: 0, responseVariation: 0, contextualVariation: 0.5,
      },
    },
  ],
};

export const TRANSFER_BENCHMARK_TRIALS = TRANSFER_BENCHMARK_PROTOCOL.blocks
  .reduce((a, b) => a + b.trials, 0);

function blockFor(trialIndex) {
  let offset = 0;
  for (const block of TRANSFER_BENCHMARK_PROTOCOL.blocks) {
    if (trialIndex < offset + block.trials) return block;
    offset += block.trials;
  }
  return TRANSFER_BENCHMARK_PROTOCOL.blocks[TRANSFER_BENCHMARK_PROTOCOL.blocks.length - 1];
}

export default {
  id: 'transfer-benchmark',
  adaptive: false,
  protocolTrials: TRANSFER_BENCHMARK_TRIALS,
  protocolVersion: TRANSFER_BENCHMARK_PROTOCOL.version,

  beginBlock() {
    return { novelty: createNoveltyState(), results: [] };
  },

  generate({ rng, context, trialIndex }) {
    const block = blockFor(trialIndex || 0);
    // `validation` obriga o sorteio a usar apenas modelos reservados.
    const pick = pickTemplate({
      tier: block.tier,
      rng,
      state: context.novelty,
      trainedKeys: [],
      mode: 'validation',
    });

    const scene = generateScene(pick.familyId, {
      difficulty: block.difficulty,
      rng,
      templateId: pick.templateId,
      variantAmount: block.difficulty.contextualVariation,
    });

    const queries = generateQueries(scene, {
      complexity: block.difficulty.queryComplexity,
      rng,
      avoidKinds: context.novelty.lastKinds,
      responseVariation: 0,
    });

    noteUse(context.novelty, { key: pick.key, queryKinds: queries.map((q) => q.kind) });

    return {
      scene,
      queries,
      sceneHtml: scene.html,
      stimulusType: 'scenes',
      exposureMs: block.difficulty.exposureMs,
      cueDelayMs: block.difficulty.retentionDelayMs,
      expected: queries.map((q) => q.answer),
      totalItems: queries.length,
      extraComplexity: sceneComplexity(scene),
      response: { kind: 'questions', questions: queries, prompt: 'Sobre o que apareceu' },
      render: { kind: 'scene' },
      benchmarkBlock: block.id,
      benchmarkLabel: block.label,
      protocolVersion: TRANSFER_BENCHMARK_PROTOCOL.version,
      transfer: {
        familyId: pick.familyId,
        templateId: pick.templateId,
        templateKey: pick.key,
        tier: block.tier,
        novel: true,
        holdout: true,
        mode: 'benchmark',
        queryComplexity: block.difficulty.queryComplexity,
        queryKinds: queries.map((q) => q.kind),
      },
    };
  },

  score(trial, given) {
    return scoreQueries(trial.queries, given);
  },

  onTrialRecorded({ trial, result, record, context }) {
    context.results.push({
      ...trial.transfer,
      block: trial.benchmarkBlock,
      timestamp: record.timestamp,
      accuracy: result.itemAccuracy,
      exposureMs: record.actualExposureMs ?? record.requestedExposureMs,
      invalid: false,
    });
    // O benchmark também alimenta o log de transferência: são tentativas em
    // material reservado, exatamente o lado "novo" da comparação.
    store.recordTransferTrial({ ...trial.transfer, timestamp: record.timestamp, accuracy: result.itemAccuracy, exposureMs: record.actualExposureMs ?? record.requestedExposureMs });
  },

  finishBlock({ context }) {
    const results = context.results;
    if (!results.length) return null;
    const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

    const byBlock = TRANSFER_BENCHMARK_PROTOCOL.blocks.map((b) => {
      const list = results.filter((r) => r.block === b.id);
      return { id: b.id, label: b.label, tier: b.tier, trials: list.length, accuracy: mean(list.map((r) => r.accuracy)) };
    });

    const record = {
      id: `tb-${Date.now().toString(36)}`,
      protocolVersion: TRANSFER_BENCHMARK_PROTOCOL.version,
      completedAt: new Date().toISOString(),
      trials: results.length,
      accuracy: mean(results.map((r) => r.accuracy)),
      blocks: byBlock,
      realWorldIndex: realWorldIndex(store.getTransferTrials(), { tier: store.getTransferTier() }),
    };
    if (results.length === TRANSFER_BENCHMARK_TRIALS) store.addTransferBenchmark(record);
    return record;
  },
};
