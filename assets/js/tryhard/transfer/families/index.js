// Registro das famílias de estímulo.
//
// Acrescentar um formato novo é escrever o arquivo, exportar o objeto com
// `generate()` e listá-lo aqui. As faixas (config.js) referenciam as famílias
// pelo id, então o currículo se ajusta sozinho.

import symbolGrid from './symbolGrid.js';
import structuredInfo from './structuredInfo.js';
import interfacePanel from './interfacePanel.js';
import documentFragment from './documentFragment.js';
import mapDiagram from './mapDiagram.js';
import sceneLayout from './sceneLayout.js';
import composite from './composite.js';

export const FAMILIES = {
  'symbol-grid': symbolGrid,
  'structured-info': structuredInfo,
  'interface-panel': interfacePanel,
  'document-fragment': documentFragment,
  'map-diagram': mapDiagram,
  'scene-layout': sceneLayout,
  composite,
};

export const FAMILY_IDS = Object.keys(FAMILIES);

export function getFamily(id) {
  return FAMILIES[id] || null;
}

/** Todos os modelos de todas as famílias, com a marca de reservado. */
export function allTemplates() {
  return FAMILY_IDS.flatMap((familyId) => FAMILIES[familyId].templates.map((t) => ({
    familyId,
    templateId: t.id,
    label: t.label,
    holdout: !!t.holdout,
    tier: FAMILIES[familyId].tier,
  })));
}

/**
 * Gera a cena de uma família, resolvendo dependências (o formato misturado
 * precisa das outras famílias para compor).
 */
export function generateScene(familyId, options) {
  const family = getFamily(familyId);
  if (!family) throw new Error(`Família desconhecida: ${familyId}`);
  if (!family.needsSources) return family.generate(options);
  const sources = FAMILY_IDS
    .filter((id) => id !== familyId && FAMILIES[id].tier >= 1 && !FAMILIES[id].needsSources)
    .map((id) => FAMILIES[id]);
  return family.generate({ ...options, sources });
}
