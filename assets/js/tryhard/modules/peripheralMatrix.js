// Peripheral Matrix.
//
// Uma matriz inteira em uma exposição só, curta demais para leitura serial.
// A cruz de fixação antes do estímulo existe para o olhar já começar no
// centro, em vez de varrer a matriz item a item.

import { generateMatrix, isSymbolType, poolFor } from '../stimuli.js';
import { comparePositional } from '../metrics.js';

export default {
  id: 'peripheral-matrix',

  generate({ difficulty, stimulus, rng }) {
    const rows = difficulty.matrixRows;
    const cols = difficulty.matrixColumns;
    const matrix = generateMatrix({ rows, cols, type: stimulus, rng });

    return {
      matrix,
      stimulusType: stimulus,
      exposureMs: difficulty.exposureMs,
      expected: matrix.cells.map((c) => c.value),
      totalItems: matrix.cells.length,
      extraComplexity: 1 + (rows * cols) / 30,
      response: {
        kind: 'grid',
        rows,
        cols,
        pool: poolFor(stimulus),
        symbols: isSymbolType(stimulus),
        prompt: 'Reconstrua a matriz',
      },
      render: { kind: 'matrix' },
    };
  },

  score(trial, given) {
    return comparePositional(trial.expected, given);
  },
};
