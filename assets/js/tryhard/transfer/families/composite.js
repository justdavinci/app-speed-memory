// Tier 6 — material heterogêneo.
//
// Duas ou três famílias na mesma exposição, sem aviso de qual delas será
// cobrada. É o formato que mais se parece com a vida: a informação não chega
// separada por tipo, e a pergunta pode ser sobre qualquer pedaço dela.

import { createScene } from '../scene.js';
import { pickVariant, rSample, wrap } from './util.js';

const TEMPLATES = [
  { id: 'duplo', label: 'Dois blocos' },
  { id: 'empilhado', label: 'Bloco espacial + lista' },
  { id: 'triplo', label: 'Três blocos', holdout: true },
];

/** Quantos pedaços cada modelo junta. */
const PARTS = { duplo: 2, empilhado: 2, triplo: 3 };

/** Formatos que se viram em pouca altura, bons para empilhar. */
const COMPACT = new Set(['structured-info', 'interface-panel', 'document-fragment']);
/** Formatos espaciais: entram no máximo um por cena. */
const SPATIAL = new Set(['map-diagram', 'scene-layout']);

/**
 * Escolhe as famílias de cada modelo. Os blocos ficam empilhados porque num
 * celular sobra altura e falta largura: lado a lado, cada pedaço viraria uma
 * coluna estreita demais para ser lida numa fração de segundo.
 */
function sourcesFor(templateId, sources, rng) {
  const compact = sources.filter((f) => COMPACT.has(f.id));
  const spatial = sources.filter((f) => SPATIAL.has(f.id));
  if (templateId === 'empilhado' && spatial.length && compact.length) {
    return [rSample(rng, spatial, 1)[0], rSample(rng, compact, 1)[0]];
  }
  const wanted = PARTS[templateId] || 2;
  const pool = compact.length >= wanted ? compact : sources;
  return rSample(rng, pool, Math.min(wanted, pool.length));
}

export default {
  id: 'composite',
  name: 'Misturado',
  tier: 6,
  blurb: 'Formatos diferentes na mesma exposição.',
  templates: TEMPLATES,
  needsSources: true,

  generate({ difficulty, rng, templateId = 'duplo', variantAmount = 0.6, sources = [] }) {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
    const variant = pickVariant(rng, variantAmount);
    const chosen = sourcesFor(template.id, sources, rng);
    const parts = chosen.length;

    const density = difficulty?.informationDensity ?? 6;
    const perPart = Math.min(4, Math.max(2, Math.round(density / parts)));
    const sub = chosen.map((family) => {
      const templates = family.templates.filter((t) => !t.holdout);
      const pick = templates[Math.floor(rng() * templates.length)] || family.templates[0];
      return family.generate({
        difficulty: { ...difficulty, informationDensity: perPart },
        rng,
        templateId: pick.id,
        variantAmount,
      });
    });

    // Os identificadores são prefixados para que dois blocos nunca colidam.
    const elements = sub.flatMap((scene, i) => scene.elements.map((e) => ({
      ...e,
      id: `p${i}-${e.id}`,
      category: e.category || scene.familyId,
      // A posição em grade vale dentro do bloco; combinada, ela perde sentido.
      row: null,
      col: null,
    })));

    const distractors = [...new Set(sub.flatMap((s) => s.distractors))];
    const blocks = sub.map((s) => `<div class="th-sc__block">${s.html}</div>`).join('');

    return createScene({
      familyId: 'composite',
      templateId: template.id,
      templateLabel: template.label,
      tier: 6,
      title: '',
      elements,
      distractors,
      variant,
      layout: { kind: 'stack', rows: null, cols: null },
      queryKinds: ['value', 'label', 'attribute', 'count', 'extreme', 'compare', 'presence', 'absent'],
      html: wrap(
        `<div class="th-sc__composite" data-parts="${parts}">${blocks}</div>`,
        { variant, kind: 'composite' },
      ),
    });
  },
};
