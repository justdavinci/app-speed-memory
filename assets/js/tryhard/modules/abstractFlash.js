// Abstract Flash.
//
// Símbolos sem nome fácil, para reduzir o apoio da fala interna. A tarefa
// alterna entre reconhecer quais apareceram (entre distratores) e reproduzir a
// ordem — duas exigências diferentes sobre o mesmo estímulo.

import { generateAbstractSymbols } from '../stimuli.js';
import { SYMBOL_IDS } from '../symbols.js';
import { rShuffle, rSample } from '../rng.js';
import { compareUnordered, comparePositional } from '../metrics.js';

export default {
  id: 'abstract-flash',

  generate({ difficulty, rng }) {
    const count = difficulty.stimulusCount;
    const shown = generateAbstractSymbols(count, { rng });
    const distractors = rSample(
      rng,
      SYMBOL_IDS.filter((id) => !shown.includes(id)),
      Math.min(difficulty.distractorCount, SYMBOL_IDS.length - count),
    );
    // Reproduzir a ordem só faz sentido com poucos símbolos.
    const task = count <= 4 && rng() < 0.4 ? 'order' : 'select';

    return {
      items: shown,
      stimulusType: 'symbols',
      exposureMs: difficulty.exposureMs,
      expected: shown,
      totalItems: count,
      task,
      extraComplexity: 1.1,
      response: task === 'order'
        ? {
          kind: 'chips',
          slots: count,
          pool: rShuffle(rng, shown.concat(distractors)),
          symbols: true,
          prompt: 'Reproduza a ordem',
        }
        : {
          kind: 'multi',
          expectedCount: count,
          options: rShuffle(rng, shown.concat(distractors)),
          symbols: true,
          prompt: `Quais ${count} símbolos apareceram?`,
        },
      render: { kind: 'symbolRow' },
    };
  },

  score(trial, given) {
    return trial.task === 'order'
      ? comparePositional(trial.expected, given)
      : compareUnordered(trial.expected, given);
  },
};
