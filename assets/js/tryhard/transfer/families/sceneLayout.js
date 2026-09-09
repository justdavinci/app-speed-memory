// Tier 5 — cenas.
//
// Objetos com identidade, cor, estado e lugar. Não há mais uma estrutura
// tabular ajudando: o que existe é um arranjo, e cada exposição rearranja
// tudo. É o formato mais próximo de olhar para uma mesa, uma prateleira ou um
// painel de comando e ter de dizer depois o que estava ali.

import { createScene, element } from '../scene.js';
import {
  COLORS, COLOR_NAMES, OBJECTS, SHORT_STATES,
} from '../vocab.js';
import { symbolSvg, SYMBOL_IDS } from '../../symbols.js';
import { densityFor, esc, pickVariant, regionOf, rInt, rPick, rSample, wrap } from './util.js';

const TEMPLATES = [
  { id: 'mesa', label: 'Mesa' },
  { id: 'prateleira', label: 'Prateleira' },
  { id: 'comando', label: 'Painel de comando' },
  { id: 'vitrine', label: 'Vitrine', holdout: true },
  { id: 'bancada', label: 'Bancada', holdout: true },
];

/** Modelos em grade: a posição é uma célula, não uma região. */
const GRID_TEMPLATES = new Set(['prateleira', 'vitrine']);

function freePositions(count, rng) {
  const spots = [];
  let guard = 0;
  while (spots.length < count && guard < count * 60) {
    guard += 1;
    const p = { x: 0.1 + rng() * 0.8, y: 0.12 + rng() * 0.74 };
    if (spots.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= 0.24)) spots.push(p);
  }
  while (spots.length < count) spots.push({ x: 0.1 + rng() * 0.8, y: 0.12 + rng() * 0.74 });
  return spots;
}

export default {
  id: 'scene-layout',
  name: 'Cenas',
  tier: 5,
  blurb: 'Objetos posicionados, com cor e estado.',
  templates: TEMPLATES,

  generate({ difficulty, rng, templateId = 'mesa', variantAmount = 0.5 }) {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
    const count = densityFor(difficulty, { min: 3, max: 9, base: 5 });
    const variant = pickVariant(rng, variantAmount);
    const grid = GRID_TEMPLATES.has(template.id);

    const names = rSample(rng, OBJECTS, count);
    const glyphs = rSample(rng, SYMBOL_IDS, count);
    const colors = rSample(rng, COLOR_NAMES, Math.min(4, Math.max(2, Math.ceil(count / 2))));
    const states = template.id === 'comando' ? ['ligado', 'desligado'] : SHORT_STATES;

    const cols = grid ? Math.min(4, Math.max(2, Math.round(Math.sqrt(count * 1.2)))) : 3;
    const rows = grid ? Math.ceil(count / cols) : 3;
    const spots = grid ? null : freePositions(count, rng);

    const items = names.map((label, i) => ({
      label,
      glyph: glyphs[i],
      colorName: colors[i % colors.length],
      state: rPick(rng, states),
      numeric: rInt(rng, 1, 30),
      pos: grid
        ? { row: Math.floor(i / cols), col: i % cols }
        : regionOf(spots[i].x, spots[i].y, 3, 3),
      free: grid ? null : spots[i],
    }));

    const body = grid
      ? `<div class="th-sc__shelf" style="--cols:${cols}">${items.map((it) => (
        `<span class="th-sc__object" data-state="${esc(it.state)}">`
        + `<i style="color:${COLORS[it.colorName]}">${symbolSvg(it.glyph, { size: 30 })}</i>`
        + `<b>${esc(it.label)}</b></span>`
      )).join('')}</div>`
      : `<div class="th-sc__stage">${items.map((it) => (
        `<span class="th-sc__object th-sc__object--free" data-state="${esc(it.state)}"`
        + ` style="left:${(it.free.x * 100).toFixed(1)}%;top:${(it.free.y * 100).toFixed(1)}%">`
        + `<i style="color:${COLORS[it.colorName]}">${symbolSvg(it.glyph, { size: 28 })}</i>`
        + `<b>${esc(it.label)}</b></span>`
      )).join('')}</div>`;

    const elements = items.map((it, i) => element({
      id: `o${i}`,
      label: it.label,
      value: it.colorName,
      numeric: it.numeric,
      category: it.colorName,
      attribute: it.state,
      row: it.pos.row,
      col: it.pos.col,
      x: it.free?.x ?? null,
      y: it.free?.y ?? null,
      kind: 'object',
    }));

    const used = new Set(names);
    return createScene({
      familyId: 'scene-layout',
      templateId: template.id,
      templateLabel: template.label,
      tier: 5,
      title: template.label,
      elements,
      distractors: rSample(rng, OBJECTS.filter((v) => !used.has(v)), 6),
      variant,
      layout: { kind: grid ? 'grid' : 'regions', rows, cols },
      attributeNoun: 'o estado',
      queryKinds: ['value', 'attribute', 'position', 'count', 'extreme', 'presence', 'absent', 'label']
        .concat(grid ? ['neighbor'] : []),
      html: wrap(body, { variant, kind: 'scene' }),
    });
  },
};
