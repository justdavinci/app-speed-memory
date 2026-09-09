// Partial Report / Retrocue.
//
// A matriz pisca e some. SÓ DEPOIS disso aparece o aviso de qual região será
// cobrada. Como não dá para saber antes, a única saída é capturar a cena
// inteira — é esse desconhecimento prévio que define a tarefa.
//
// O atraso entre o fim da exposição e o aviso (`cueDelayMs`) mede por quanto
// tempo a representação ainda pode ser consultada depois de sumir.

import { generateCue, generateMatrix, isSymbolType, poolFor, regionCells, regionLabel } from '../stimuli.js';
import { comparePositional } from '../metrics.js';

export default {
  id: 'partial-report',

  generate({ difficulty, stimulus, rng }) {
    const rows = difficulty.matrixRows;
    const cols = difficulty.matrixColumns;
    const matrix = generateMatrix({ rows, cols, type: stimulus, rng });
    const kinds = rows >= 3 && cols >= 3 ? ['row', 'col', 'quadrant'] : ['row', 'col'];
    const cue = generateCue(matrix, { rng, kinds });
    const wanted = regionCells(matrix, cue);

    return {
      matrix,
      cue,
      cueLabel: regionLabel(matrix, cue),
      stimulusType: stimulus,
      exposureMs: difficulty.exposureMs,
      cueDelayMs: difficulty.cueDelayMs || 0,
      expected: wanted.map((c) => c.value),
      totalItems: wanted.length,
      highlight: wanted.map((c) => c.index),
      extraComplexity: 1 + (rows * cols) / 40,
      response: {
        kind: 'chips',
        slots: wanted.length,
        pool: poolFor(stimulus),
        symbols: isSymbolType(stimulus),
        prompt: regionLabel(matrix, cue),
      },
      render: { kind: 'matrix' },
    };
  },

  score(trial, given) {
    return comparePositional(trial.expected, given);
  },
};
