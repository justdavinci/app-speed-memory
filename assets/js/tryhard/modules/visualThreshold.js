// Visual Threshold.
//
// Discriminação de orientação com contraste e tamanho reduzidos. Serve de
// base para os outros módulos: se o estímulo sequer é visível, não há o que
// memorizar. É o único módulo em que baixar o contraste é parte do exercício,
// e não uma falha de legibilidade.

import { ORIENTATIONS } from '../symbols.js';
import { rPick, rShuffle } from '../rng.js';
import { itemAccuracy } from '../metrics.js';

export default {
  id: 'visual-threshold',

  generate({ difficulty, rng }) {
    const target = rPick(rng, ORIENTATIONS);
    return {
      orientation: target,
      stimulusType: 'shapes',
      exposureMs: difficulty.exposureMs,
      contrast: difficulty.contrast ?? 1,
      itemScale: difficulty.itemScale ?? 1,
      expected: [target.id],
      totalItems: 1,
      extraComplexity: 0.8,
      response: {
        kind: 'choice',
        options: rShuffle(rng, ORIENTATIONS.map((o) => o.id)),
        orientations: true,
        prompt: 'Qual era a inclinação?',
      },
      render: { kind: 'orientation' },
    };
  },

  score(trial, given) {
    const ok = String(given[0] ?? '') === trial.expected[0];
    return {
      cells: [{ index: 0, expected: trial.expected[0], given: given[0] ?? '', ok }],
      correct: ok ? 1 : 0,
      total: 1,
      itemAccuracy: itemAccuracy(ok ? 1 : 0, 1),
      exact: ok,
    };
  },
};
