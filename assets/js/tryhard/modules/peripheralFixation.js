// Peripheral Fixation.
//
// A cruz central fica visível o tempo todo e os itens aparecem ao redor dela.
// A dificuldade cresce afastando os itens, aumentando a quantidade e
// diminuindo o tamanho.
//
// Sem hardware de rastreamento ocular o app NÃO sabe para onde a pessoa
// olhou — por isso a instrução é explícita e a arquitetura apenas deixa a
// porta aberta para um sensor futuro, sem depender de nenhum agora.

import { generateItems, generateSpatialConfiguration, isSymbolType, poolFor } from '../stimuli.js';
import { compareUnordered } from '../metrics.js';

export default {
  id: 'peripheral-fixation',

  generate({ difficulty, stimulus, rng }) {
    const count = difficulty.stimulusCount;
    const values = generateItems(stimulus, count, { rng, unique: true });
    const positions = generateSpatialConfiguration({
      count,
      distance: difficulty.peripheralDistance,
      rng,
    });
    const items = positions.map((p, i) => ({ ...p, value: values[i] }));

    return {
      items,
      fixation: true,
      keepFixation: true,
      stimulusType: stimulus,
      exposureMs: difficulty.exposureMs,
      itemScale: difficulty.itemScale ?? 1,
      expected: values,
      totalItems: count,
      extraComplexity: 1 + difficulty.peripheralDistance * 0.4,
      response: {
        kind: 'chips',
        slots: count,
        pool: poolFor(stimulus),
        symbols: isSymbolType(stimulus),
        unordered: true,
        prompt: 'Quais itens apareceram? (a ordem não conta)',
      },
      render: { kind: 'peripheral' },
      instruction: 'Mantenha os olhos no ponto central.',
    };
  },

  score(trial, given) {
    return compareUnordered(trial.expected, given);
  },
};
