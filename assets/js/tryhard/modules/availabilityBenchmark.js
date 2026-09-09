// Availability Benchmark v1 — protocolo fixo de disponibilidade.
//
// Este módulo NÃO adapta e NÃO ensina: ele mede. A estrutura do estímulo é
// sempre a mesma, o conteúdo é sorteado novo, e os atrasos vêm de uma lista
// fixa embaralhada — sorteada de propósito, para que a pessoa não consiga se
// preparar para o instante da pergunta (§53).
//
// Mudar qualquer número daqui exige subir `benchmarkVersion`, senão o
// histórico passa a comparar coisas diferentes.

import { AVAILABILITY_CONFIG } from '../availability/config.js';
import { applyToTrial, planTrial } from '../availability/index.js';
import { estimateThreshold } from '../availability/threshold.js';
import { generateCue, generateMatrix, poolFor, regionCells, regionLabel } from '../stimuli.js';
import { comparePositional } from '../metrics.js';
import { rShuffle } from '../rng.js';
import * as store from '../store.js';

/** Protocolo v1: exposição fixa, matriz fixa, oito atrasos × três repetições. */
export const AVAILABILITY_BENCHMARK_PROTOCOL = {
  version: AVAILABILITY_CONFIG.benchmarkVersion,
  exposureMs: 120,
  matrixRows: 3,
  matrixColumns: 3,
  stimulus: 'mixed',
  category: 'matrices',
  delaysMs: [300, 240, 190, 150, 120, 95, 75, 60],
  repeats: 3,
};

export const AVAILABILITY_BENCHMARK_TRIALS = AVAILABILITY_BENCHMARK_PROTOCOL.delaysMs.length
  * AVAILABILITY_BENCHMARK_PROTOCOL.repeats;

/** A ordem dos atrasos é embaralhada; o conjunto é sempre o mesmo. */
export function delayPlan(rng) {
  const p = AVAILABILITY_BENCHMARK_PROTOCOL;
  const lista = [];
  for (let i = 0; i < p.repeats; i++) lista.push(...p.delaysMs);
  return rShuffle(rng, lista);
}

export default {
  id: 'availability-benchmark',
  adaptive: false,
  protocolTrials: AVAILABILITY_BENCHMARK_TRIALS,
  protocolVersion: AVAILABILITY_BENCHMARK_PROTOCOL.version,

  beginBlock({ rng }) {
    return { delays: delayPlan(rng), results: [] };
  },

  generate({ rng, context, trialIndex }) {
    const p = AVAILABILITY_BENCHMARK_PROTOCOL;
    const matrix = generateMatrix({
      rows: p.matrixRows, cols: p.matrixColumns, type: p.stimulus, rng, avoidCompressible: true,
    });
    const cue = generateCue(matrix, { rng, kinds: ['row', 'col'] });
    const pedidos = regionCells(matrix, cue);

    const trial = {
      matrix,
      cue,
      cueLabel: regionLabel(matrix, cue),
      stimulusType: p.stimulus,
      exposureMs: p.exposureMs,
      cueDelayMs: 0,
      expected: pedidos.map((c) => c.value),
      totalItems: pedidos.length,
      extraComplexity: 1 + (p.matrixRows * p.matrixColumns) / 40,
      response: {
        kind: 'chips',
        slots: pedidos.length,
        pool: poolFor(p.stimulus),
        prompt: regionLabel(matrix, cue),
      },
      render: { kind: 'matrix' },
      benchmarkBlock: 'availability',
      protocolVersion: p.version,
    };

    const delayMs = context.delays[trialIndex % context.delays.length];
    return applyToTrial(trial, planTrial({
      settings: store.getAvailabilitySettings(),
      moduleId: 'availability-benchmark',
      trial,
      force: true,
      forcedDelayMs: delayMs,
    }));
  },

  score(trial, given) {
    return comparePositional(trial.expected, given);
  },

  onTrialRecorded({ trial, result, record, context }) {
    context.results.push({
      timestamp: record.timestamp,
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
    if (context.results.length < AVAILABILITY_BENCHMARK_TRIALS) return null;
    const estimativa = estimateThreshold(context.results);
    const registro = {
      id: `ab-${Date.now().toString(36)}`,
      kind: 'abstract',
      protocolVersion: AVAILABILITY_BENCHMARK_PROTOCOL.version,
      completedAt: new Date().toISOString(),
      category: AVAILABILITY_BENCHMARK_PROTOCOL.category,
      trials: context.results.length,
      t80: estimativa.t80,
      confidence: estimativa.confidence,
      accuracy: estimativa.accuracy,
      exposureMs: AVAILABILITY_BENCHMARK_PROTOCOL.exposureMs,
      levels: estimativa.levels,
    };
    store.addAvailabilityBenchmark(registro);
    return registro;
  },
};
