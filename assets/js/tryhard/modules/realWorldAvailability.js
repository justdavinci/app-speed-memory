// Real World Availability Benchmark — disponibilidade em material realista.
//
// Mesma ideia do benchmark abstrato, com duas diferenças que importam: o
// material é funcional (lista, interface, documento, mapa, cena) e vem só de
// modelos RESERVADOS, que nunca aparecem em treino. Medir disponibilidade em
// material já treinado diria quanto a pessoa praticou aquele layout; medir em
// material inédito diz quão cedo informação nova fica utilizável (§73).

import { AVAILABILITY_CONFIG } from '../availability/config.js';
import { applyToTrial, categoryFor, planTrial } from '../availability/index.js';
import { estimateThreshold } from '../availability/threshold.js';
import { generateScene } from '../transfer/families/index.js';
import { generateQueries, scoreQueries } from '../transfer/queries.js';
import { sceneComplexity } from '../transfer/scene.js';
import { createNoveltyState, noteUse, pickTemplate } from '../transfer/novelty.js';
import { rShuffle } from '../rng.js';
import * as store from '../store.js';

/** Protocolo v1: cinco famílias × quatro atrasos, exposição fixa. */
export const REAL_WORLD_AVAILABILITY_PROTOCOL = {
  version: AVAILABILITY_CONFIG.benchmarkVersion,
  exposureMs: 350,
  delaysMs: [300, 220, 160, 110],
  informationDensity: 5,
  queryComplexity: 2,
  families: [
    { familyId: 'structured-info', tier: 1 },
    { familyId: 'interface-panel', tier: 2 },
    { familyId: 'document-fragment', tier: 3 },
    { familyId: 'map-diagram', tier: 4 },
    { familyId: 'scene-layout', tier: 5 },
  ],
};

export const REAL_WORLD_AVAILABILITY_TRIALS = REAL_WORLD_AVAILABILITY_PROTOCOL.families.length
  * REAL_WORLD_AVAILABILITY_PROTOCOL.delaysMs.length;

/** Cada família enfrenta cada atraso, em ordem embaralhada. */
export function benchmarkPlan(rng) {
  const p = REAL_WORLD_AVAILABILITY_PROTOCOL;
  const plano = [];
  for (const familia of p.families) {
    for (const delayMs of p.delaysMs) plano.push({ ...familia, delayMs });
  }
  return rShuffle(rng, plano);
}

export default {
  id: 'real-world-availability',
  adaptive: false,
  protocolTrials: REAL_WORLD_AVAILABILITY_TRIALS,
  protocolVersion: REAL_WORLD_AVAILABILITY_PROTOCOL.version,

  beginBlock({ rng }) {
    return { plan: benchmarkPlan(rng), novelty: createNoveltyState(), results: [] };
  },

  generate({ rng, context, trialIndex }) {
    const p = REAL_WORLD_AVAILABILITY_PROTOCOL;
    const passo = context.plan[trialIndex % context.plan.length];

    // `validation` obriga o sorteio a usar apenas modelos reservados.
    const pick = pickTemplate({
      tier: passo.tier, rng, state: context.novelty, trainedKeys: [], mode: 'validation',
    });

    const difficulty = {
      exposureMs: p.exposureMs,
      informationDensity: p.informationDensity,
      contextualVariation: 0.6,
    };
    const scene = generateScene(pick.familyId, {
      difficulty, rng, templateId: pick.templateId, variantAmount: 0.6,
    });
    const queries = generateQueries(scene, {
      complexity: p.queryComplexity, rng, avoidKinds: context.novelty.lastKinds,
    });
    noteUse(context.novelty, { key: pick.key, queryKinds: queries.map((q) => q.kind) });

    const trial = {
      scene,
      queries,
      sceneHtml: scene.html,
      stimulusType: 'scenes',
      exposureMs: p.exposureMs,
      cueDelayMs: 0,
      expected: queries.map((q) => q.answer),
      totalItems: queries.length,
      extraComplexity: sceneComplexity(scene),
      response: { kind: 'questions', questions: queries, prompt: 'Sobre o que apareceu' },
      render: { kind: 'scene' },
      benchmarkBlock: pick.familyId,
      protocolVersion: p.version,
      transfer: {
        familyId: pick.familyId,
        templateId: pick.templateId,
        templateKey: pick.key,
        tier: passo.tier,
        novel: true,
        holdout: true,
        mode: 'benchmark',
        queryComplexity: p.queryComplexity,
        queryKinds: queries.map((q) => q.kind),
      },
    };

    return applyToTrial(trial, planTrial({
      settings: store.getAvailabilitySettings(),
      moduleId: 'real-world-availability',
      trial,
      force: true,
      forcedDelayMs: passo.delayMs,
    }));
  },

  score(trial, given) {
    return scoreQueries(trial.queries, given);
  },

  onTrialRecorded({ trial, result, record, context }) {
    context.results.push({
      timestamp: record.timestamp,
      category: categoryFor(trial),
      familyId: trial.transfer.familyId,
      delayMs: trial.availability.requestedDelayMs,
      actualDelayMs: record.availabilityActualMs ?? null,
      accuracy: result.itemAccuracy,
      exposureMs: record.actualExposureMs ?? record.requestedExposureMs,
      retrievalMs: record.retrievalMs ?? null,
      queryIndex: 1,
      invalid: false,
    });
  },

  finishBlock({ context }) {
    if (context.results.length < REAL_WORLD_AVAILABILITY_TRIALS) return null;
    const geral = estimateThreshold(context.results);
    const porFamilia = REAL_WORLD_AVAILABILITY_PROTOCOL.families.map(({ familyId }) => {
      const lista = context.results.filter((r) => r.familyId === familyId);
      // Quatro tentativas não fazem curva: o número por família é a média de
      // acerto, e o T80 fica só no conjunto.
      return {
        familyId,
        trials: lista.length,
        accuracy: lista.length ? lista.reduce((a, r) => a + r.accuracy, 0) / lista.length : 0,
      };
    });

    const registro = {
      id: `rwa-${Date.now().toString(36)}`,
      kind: 'realWorld',
      protocolVersion: REAL_WORLD_AVAILABILITY_PROTOCOL.version,
      completedAt: new Date().toISOString(),
      category: 'composite',
      trials: context.results.length,
      t80: geral.t80,
      confidence: geral.confidence,
      accuracy: geral.accuracy,
      exposureMs: REAL_WORLD_AVAILABILITY_PROTOCOL.exposureMs,
      levels: geral.levels,
      families: porFamilia,
    };
    store.addAvailabilityBenchmark(registro);
    return registro;
  },
};
