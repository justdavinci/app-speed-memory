// Mask Resistance.
//
// Estímulo, intervalo curtíssimo, máscara. A máscara interrompe o
// processamento do que ainda estava sendo lido, e a progressão principal é
// encurtar o intervalo entre um e outra.
//
// A máscara nunca reaproveita os caracteres do estímulo: se reaproveitasse,
// deixaria de ser interferência e viraria pista.

import { generateItems, generateMask, poolFor } from '../stimuli.js';
import { comparePositional } from '../metrics.js';

const MASK_DURATION_MS = 180;

export default {
  id: 'mask-resistance',

  generate({ difficulty, stimulus, rng, settings }) {
    const count = difficulty.stimulusCount;
    const items = generateItems(stimulus, count, { rng });
    const masking = settings?.masking !== false;
    const mask = generateMask({
      length: count,
      complexity: difficulty.maskComplexity || 1,
      rng,
      exclude: items,
    });

    return {
      items,
      mask: masking ? mask : null,
      stimulusType: stimulus,
      exposureMs: difficulty.exposureMs,
      maskDelayMs: masking ? (difficulty.maskDelayMs || 0) : 0,
      maskDurationMs: masking ? MASK_DURATION_MS : 0,
      expected: items,
      totalItems: count,
      extraComplexity: 1 + (difficulty.maskComplexity || 1) * 0.05,
      response: {
        kind: 'chips',
        slots: count,
        pool: poolFor(stimulus),
        prompt: 'Digite a sequência',
      },
      render: { kind: 'sequence' },
    };
  },

  score(trial, given) {
    return comparePositional(trial.expected, given);
  },
};
