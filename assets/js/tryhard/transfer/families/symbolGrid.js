// Tier 0 — símbolos soltos.
//
// É o material do Try Hard clássico, presente aqui para servir de linha de
// base: é contra o desempenho neste formato que se mede o quanto a habilidade
// sobrevive quando o material muda.

import { createScene, element } from '../scene.js';
import { generateItems, poolFor } from '../../stimuli.js';
import { symbolSvg } from '../../symbols.js';
import { densityFor, esc, pickVariant, rPick, rSample, wrap } from './util.js';

const TEMPLATES = [
  { id: 'grid', label: 'Grade' },
  { id: 'strip', label: 'Faixa' },
  { id: 'stack', label: 'Coluna dupla' },
  { id: 'corners', label: 'Cantos', holdout: true },
  { id: 'diagonal', label: 'Diagonal', holdout: true },
];

const TYPES = ['digits', 'letters', 'mixed', 'symbols'];

function shapeFor(templateId, count) {
  switch (templateId) {
    case 'strip': return { rows: 1, cols: count };
    case 'stack': return { rows: Math.ceil(count / 2), cols: 2 };
    case 'corners': return { rows: 2, cols: Math.ceil(count / 2) };
    case 'diagonal': { const side = Math.min(5, Math.max(3, count)); return { rows: side, cols: side }; }
    default: {
      const cols = Math.min(5, Math.max(2, Math.round(Math.sqrt(count * 1.3))));
      return { rows: Math.ceil(count / cols), cols };
    }
  }
}

/** Onde cada item cai, dado o modelo. A diagonal deixa buracos de propósito. */
function placements(templateId, count, shape) {
  if (templateId === 'diagonal') {
    // Escada que dá a volta na grade: nunca duas peças na mesma célula.
    const side = shape.cols;
    return Array.from({ length: count }, (_, i) => ({
      row: i % side,
      col: (i + Math.floor(i / side)) % side,
    }));
  }
  if (templateId === 'corners') {
    const spots = [];
    for (let i = 0; i < count; i++) {
      const row = i % 2;
      const col = i < 2 ? 0 : shape.cols - 1 - Math.floor((i - 2) / 2);
      spots.push({ row, col: Math.max(0, Math.min(shape.cols - 1, col)) });
    }
    return spots;
  }
  return Array.from({ length: count }, (_, i) => ({
    row: Math.floor(i / shape.cols),
    col: i % shape.cols,
  }));
}

export default {
  id: 'symbol-grid',
  name: 'Símbolos',
  tier: 0,
  blurb: 'Dígitos, letras e símbolos sem contexto.',
  templates: TEMPLATES,

  generate({ difficulty, rng, templateId = 'grid', variantAmount = 0.5 }) {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
    const count = densityFor(difficulty, { min: 3, max: 12, base: 6 });
    const type = rPick(rng, TYPES);
    const symbols = type === 'symbols';
    const values = generateItems(type, count, { rng, unique: true, avoidCompressible: true });
    const shape = shapeFor(template.id, count);
    const spots = placements(template.id, count, shape);
    const variant = pickVariant(rng, variantAmount);

    const elements = values.map((value, i) => element({
      id: `c${i}`,
      label: value,
      value,
      category: /^[0-9]$/.test(value) ? 'dígitos' : symbols ? 'símbolos' : 'letras',
      row: spots[i].row,
      col: spots[i].col,
      kind: symbols ? 'symbol' : 'char',
    }));

    const pool = poolFor(type).filter((v) => !values.includes(v));
    const distractors = rSample(rng, pool, 6);

    const cellAt = new Map(elements.map((e) => [`${e.row}:${e.col}`, e]));
    const cells = [];
    for (let r = 0; r < shape.rows; r++) {
      for (let c = 0; c < shape.cols; c++) {
        const e = cellAt.get(`${r}:${c}`);
        cells.push(`<span class="th-sc__cell${e ? '' : ' is-empty'}">`
          + (e ? (symbols ? symbolSvg(e.value, { size: 34 }) : esc(e.value)) : '')
          + '</span>');
      }
    }

    return createScene({
      familyId: 'symbol-grid',
      templateId: template.id,
      templateLabel: template.label,
      tier: 0,
      elements,
      distractors,
      variant,
      layout: { kind: 'grid', rows: shape.rows, cols: shape.cols },
      queryKinds: ['position', 'neighbor', 'presence', 'absent', 'count'],
      html: wrap(
        `<div class="th-sc__grid" style="--cols:${shape.cols}">${cells.join('')}</div>`,
        { variant, kind: 'grid' },
      ),
    });
  },
};
