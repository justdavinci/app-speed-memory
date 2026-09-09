// A que categoria uma tentativa pertence.
//
// O limiar é guardado por categoria de propósito: uma cena natural leva muito
// mais tempo para ficar disponível do que quatro dígitos, e um número único
// misturando os dois não diria nada sobre nenhum dos dois (§31).

import { AVAILABILITY_CATEGORIES, TRANSFER_CATEGORIES } from './config.js';

const BY_FAMILY = {
  'symbol-grid': null,            // decidido pelo tipo de estímulo da cena
  'structured-info': 'structured',
  'interface-panel': 'interfaces',
  'document-fragment': 'documents',
  'map-diagram': 'maps',
  'scene-layout': 'scenes',
  composite: 'composite',
};

const BY_STIMULUS = {
  digits: 'numbers',
  letters: 'letters',
  mixed: 'letters',
  symbols: 'symbols',
  shapes: 'symbols',
};

/**
 * Categoria de uma tentativa. Matrizes ganham categoria própria porque a
 * apreensão de uma grade inteira é outra tarefa, mesmo com os mesmos dígitos.
 *
 * @param {object} trial  { moduleId, stimulusType, transfer, matrix, render }
 */
export function categoryFor(trial) {
  const familia = trial?.transfer?.familyId;
  if (familia) {
    const direto = BY_FAMILY[familia];
    if (direto) return direto;
    // A grade de símbolos do Mundo real cai na categoria do que ela mostra.
    return BY_STIMULUS[trial.stimulusType] || 'symbols';
  }
  if (trial?.render?.kind === 'matrix' || trial?.matrix) return 'matrices';
  return BY_STIMULUS[trial?.stimulusType] || 'numbers';
}

export function categoryLabel(id) {
  return AVAILABILITY_CATEGORIES[id]?.label || id;
}

export function isTransferCategory(id) {
  return TRANSFER_CATEGORIES.includes(id);
}
