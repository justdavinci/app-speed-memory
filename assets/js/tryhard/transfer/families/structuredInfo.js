// Tier 1 — informação estruturada.
//
// Primeiro passo para fora do abstrato: cada item passa a ter nome e valor,
// como uma etiqueta de preço, um placar ou uma ficha. O conteúdo ainda é
// pequeno, mas já exige ler um rótulo antes de guardar um número.

import { createScene, element } from '../scene.js';
import {
  CITIES, PEOPLE, PRODUCTS, SECTIONS, STATUSES, UNITS, money,
} from '../vocab.js';
import { densityFor, esc, pickVariant, rInt, rPick, rSample, wrap } from './util.js';

const TEMPLATES = [
  { id: 'precos', label: 'Lista de preços' },
  { id: 'placar', label: 'Placar' },
  { id: 'ficha', label: 'Ficha de campos' },
  { id: 'ranking', label: 'Ranking', holdout: true },
  { id: 'estoque', label: 'Estoque', holdout: true },
];

/** Cada modelo devolve rótulos, valores e o que mais a cena precisa saber. */
function buildRows(templateId, count, rng) {
  switch (templateId) {
    case 'placar': {
      const names = rSample(rng, PEOPLE, count);
      return names.map((label) => {
        const n = rInt(rng, 0, 48);
        return { label, value: String(n), numeric: n, category: 'pontos' };
      });
    }
    case 'ficha': {
      const fields = rSample(rng, [
        ['Nome', () => rPick(rng, PEOPLE)],
        ['Cidade', () => rPick(rng, CITIES)],
        ['Setor', () => rPick(rng, SECTIONS)],
        ['Sala', () => String(rInt(rng, 100, 480))],
        ['Ramal', () => String(rInt(rng, 20, 99))],
        ['Turno', () => rPick(rng, ['manhã', 'tarde', 'noite'])],
        ['Situação', () => rPick(rng, STATUSES)],
        ['Placa', () => `${rPick(rng, ['ABC', 'KLM', 'RST'])}-${rInt(rng, 1000, 9999)}`],
      ], count);
      return fields.map(([label, make]) => {
        const value = make();
        const numeric = /^\d+$/.test(value) ? Number(value) : null;
        return { label, value, numeric, category: 'campo' };
      });
    }
    case 'ranking': {
      const names = rSample(rng, CITIES, count);
      return names.map((label, i) => {
        const n = rInt(rng, 1, 99);
        return { label, value: `${n}%`, numeric: n, category: 'índice', attribute: i < 2 ? 'topo' : 'demais' };
      });
    }
    case 'estoque': {
      const names = rSample(rng, PRODUCTS, count);
      return names.map((label) => {
        const n = rInt(rng, 0, 60);
        return {
          label,
          value: `${n} ${rPick(rng, UNITS)}`,
          numeric: n,
          category: rPick(rng, SECTIONS),
          attribute: n < 10 ? 'baixo' : n < 35 ? 'normal' : 'alto',
        };
      });
    }
    default: {
      const names = rSample(rng, PRODUCTS, count);
      return names.map((label) => {
        const n = Math.round((rInt(rng, 150, 4800) / 100) * 100) / 100;
        return { label, value: money(n), numeric: n, category: rPick(rng, SECTIONS) };
      });
    }
  }
}

function rowMarkup(rows, variant, templateId) {
  const cls = templateId === 'ficha' ? ' th-sc__row--field' : '';
  return rows.map((r, i) => `<div class="th-sc__row${cls}" data-accent="${i === variant.accent ? '1' : '0'}">`
    + `<span class="th-sc__label">${esc(r.label)}</span>`
    + (r.attribute ? `<span class="th-sc__tag">${esc(r.attribute)}</span>` : '')
    + `<span class="th-sc__value">${esc(r.value)}</span></div>`).join('');
}

export default {
  id: 'structured-info',
  name: 'Informação estruturada',
  tier: 1,
  blurb: 'Rótulo e valor: preços, placares, fichas.',
  templates: TEMPLATES,

  generate({ difficulty, rng, templateId = 'precos', variantAmount = 0.5 }) {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
    const count = densityFor(difficulty, { min: 3, max: 8, base: 5 });
    const rows = buildRows(template.id, count, rng);
    const variant = pickVariant(rng, variantAmount);
    if (variant.reversed) rows.reverse();

    const elements = rows.map((r, i) => element({
      id: `r${i}`,
      label: r.label,
      value: r.value,
      numeric: r.numeric ?? null,
      category: r.category,
      attribute: r.attribute,
      row: i,
      col: 0,
      kind: 'row',
    }));

    const usedLabels = new Set(rows.map((r) => r.label));
    const distractorPool = [...PRODUCTS, ...PEOPLE, ...CITIES].filter((v) => !usedLabels.has(v));

    return createScene({
      familyId: 'structured-info',
      templateId: template.id,
      templateLabel: template.label,
      tier: 1,
      title: template.label,
      elements,
      distractors: rSample(rng, distractorPool, 6),
      variant,
      layout: { kind: 'rows', rows: rows.length, cols: 1 },
      attributeNoun: template.id === 'estoque' ? 'o nível' : template.id === 'ranking' ? 'a posição' : 'a situação',
      queryKinds: ['value', 'label', 'attribute', 'count', 'extreme', 'compare', 'presence', 'absent'],
      html: wrap(
        `<div class="th-sc__rows">${rowMarkup(rows, variant, template.id)}</div>`,
        { variant, kind: 'rows', title: template.label },
      ),
    });
  },
};
