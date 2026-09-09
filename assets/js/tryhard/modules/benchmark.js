// Daily Benchmark — protocolo fixo.
//
// Este módulo NÃO adapta. Ele repete todo dia a mesma estrutura de
// dificuldade, com conteúdo sorteado diferente, para que dois dias possam ser
// comparados. Mudar a dificuldade base aqui exige subir a versão do protocolo,
// senão o histórico passa a comparar coisas diferentes.

import { TRY_HARD_CONFIG } from '../config.js';
import { generateItems, poolFor } from '../stimuli.js';
import { comparePositional } from '../metrics.js';
import { recordBenchmarkProfile } from '../processingProfile.js';
import peripheralMatrix from './peripheralMatrix.js';
import abstractFlash from './abstractFlash.js';
import iconicReadout from './iconicReadout.js';

export const BENCHMARK_PROTOCOL = {
  version: TRY_HARD_CONFIG.benchmarkProtocolVersion,
  blocks: [
    { id: 'sequence', trials: 5, label: 'Sequência', difficulty: { exposureMs: 120, stimulusCount: 6 }, stimulus: 'digits' },
    { id: 'matrix', trials: 5, label: 'Matriz', difficulty: { exposureMs: 150, matrixRows: 3, matrixColumns: 3 }, stimulus: 'digits' },
    { id: 'symbols', trials: 5, label: 'Símbolos', difficulty: { exposureMs: 250, stimulusCount: 4, distractorCount: 5 }, stimulus: 'symbols' },
    { id: 'readout', trials: 5, label: 'Readout', difficulty: { exposureMs: 200, matrixRows: 3, matrixColumns: 3, cueDelayMs: 50, questionCount: 1 }, stimulus: 'mixed' },
  ],
};

export const BENCHMARK_TRIALS = BENCHMARK_PROTOCOL.blocks.reduce((a, b) => a + b.trials, 0);

function blockFor(trialIndex) {
  let offset = 0;
  for (const block of BENCHMARK_PROTOCOL.blocks) {
    if (trialIndex < offset + block.trials) return block;
    offset += block.trials;
  }
  return BENCHMARK_PROTOCOL.blocks[BENCHMARK_PROTOCOL.blocks.length - 1];
}

export default {
  id: 'benchmark',
  adaptive: false,
  protocolTrials: BENCHMARK_TRIALS,
  protocolVersion: BENCHMARK_PROTOCOL.version,

  beginBlock() {
    return { profileTrials: [] };
  },

  generate(ctx) {
    const block = blockFor(ctx.trialIndex || 0);
    const shared = { ...ctx, difficulty: block.difficulty, stimulus: block.stimulus };
    let trial;

    if (block.id === 'sequence') {
      const items = generateItems(block.stimulus, block.difficulty.stimulusCount, {
        rng: ctx.rng,
        avoidCompressible: true,
      });
      trial = {
        items,
        stimulusType: block.stimulus,
        exposureMs: block.difficulty.exposureMs,
        expected: items,
        totalItems: items.length,
        extraComplexity: 1,
        response: { kind: 'chips', slots: items.length, pool: poolFor(block.stimulus), prompt: 'Digite a sequência' },
        render: { kind: 'sequence' },
        score: (t, given) => comparePositional(t.expected, given),
      };
    } else if (block.id === 'matrix') {
      trial = peripheralMatrix.generate(shared);
      trial.score = (t, given) => peripheralMatrix.score(t, given);
    } else if (block.id === 'symbols') {
      trial = abstractFlash.generate(shared);
      trial.score = (t, given) => abstractFlash.score(t, given);
    } else {
      trial = iconicReadout.generate(shared);
      trial.score = (t, given) => iconicReadout.score(t, given);
    }

    return {
      ...trial,
      benchmarkBlock: block.id,
      benchmarkLabel: block.label,
      protocolVersion: BENCHMARK_PROTOCOL.version,
    };
  },

  score(trial, given) {
    return trial.score ? trial.score(trial, given) : comparePositional(trial.expected, given);
  },

  onTrialRecorded({ trial, result, record, context }) {
    if (!context?.profileTrials) return;
    context.profileTrials.push({
      block: trial.benchmarkBlock,
      protocolVersion: trial.protocolVersion,
      timestamp: record.timestamp,
      correctItems: result.correct,
      totalItems: result.total,
      accuracy: result.itemAccuracy,
      requestedExposureMs: record.requestedExposureMs,
      actualExposureMs: record.actualExposureMs,
      rows: trial.matrix?.rows || trial.difficultyState?.matrixRows || null,
      cols: trial.matrix?.cols || trial.difficultyState?.matrixColumns || null,
      cueDelayMs: trial.cueDelayMs || 0,
    });
  },

  finishBlock({ context }) {
    if (!context?.profileTrials?.length) return null;
    recordBenchmarkProfile({
      protocolVersion: BENCHMARK_PROTOCOL.version,
      completedAt: new Date().toISOString(),
      trials: context.profileTrials,
    });
    // A persistência acima é side-effect deliberado. Não devolvemos payload
    // porque o runner reserva `finishBlock()` para resumos específicos do
    // módulo (Transfer usa esse canal) e não queremos o benchmark parecer
    // resultado de transferência.
    return null;
  },
};
