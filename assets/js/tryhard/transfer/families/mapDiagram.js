// Tier 4 — mapas e diagramas.
//
// Aqui o que importa deixa de ser a lista e passa a ser a relação espacial:
// o que está perto do quê, por qual linha, em que região da tela. A legenda
// obriga a cruzar cor com significado, coisa que nenhuma grade de dígitos pede.

import { createScene, element } from '../scene.js';
import {
  CITIES, COLORS, COLOR_NAMES, STATIONS, code,
} from '../vocab.js';
import { densityFor, esc, pickVariant, regionOf, rInt, rPick, rSample, wrap } from './util.js';

const TEMPLATES = [
  { id: 'linhas', label: 'Mapa de linhas' },
  { id: 'planta', label: 'Planta baixa' },
  { id: 'rede', label: 'Diagrama de rede', holdout: true },
  { id: 'rota', label: 'Rota com paradas', holdout: true },
];

const KINDS = ['estação', 'terminal', 'baldeação'];

/** Posições sem sobreposição: sorteia e rejeita o que ficou perto demais. */
function scatter(count, rng, minDistance = 0.22) {
  const points = [];
  let guard = 0;
  while (points.length < count && guard < count * 60) {
    guard += 1;
    const p = { x: 0.12 + rng() * 0.76, y: 0.14 + rng() * 0.72 };
    if (points.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minDistance)) points.push(p);
  }
  while (points.length < count) {
    points.push({ x: 0.12 + rng() * 0.76, y: 0.14 + rng() * 0.72 });
  }
  return points;
}

/** Caminho encadeado: cada nó liga ao seguinte, o que dá o traçado da linha. */
function chainLinks(points, rng, extra = 0) {
  const links = points.slice(1).map((_, i) => [i, i + 1]);
  for (let i = 0; i < extra; i++) {
    const a = rInt(rng, 0, points.length - 1);
    const b = rInt(rng, 0, points.length - 1);
    if (a !== b && !links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) links.push([a, b]);
  }
  return links;
}

function svgFor({ points, nodes, links, template, variant }) {
  const line = (a, b, color) => `<line x1="${(points[a].x * 100).toFixed(1)}" y1="${(points[a].y * 100).toFixed(1)}"`
    + ` x2="${(points[b].x * 100).toFixed(1)}" y2="${(points[b].y * 100).toFixed(1)}"`
    + ` stroke="${color}" stroke-width="1.6" stroke-linecap="round" />`;

  const edges = links.map(([a, b]) => line(a, b, COLORS[nodes[a].colorName] || '#888')).join('');

  const marks = nodes.map((n, i) => {
    const p = points[i];
    const x = (p.x * 100).toFixed(1);
    const y = (p.y * 100).toFixed(1);
    const shape = template === 'planta'
      ? `<rect x="${(p.x * 100 - 5).toFixed(1)}" y="${(p.y * 100 - 4).toFixed(1)}" width="10" height="8" rx="1.4"
           fill="${COLORS[n.colorName]}" opacity="0.85" />`
      : `<circle cx="${x}" cy="${y}" r="${n.attribute === 'terminal' ? 3.6 : 2.6}"
           fill="${COLORS[n.colorName]}" stroke="var(--sc-ink)" stroke-width="0.6" />`;
    return `${shape}<text class="th-sc__node-label" x="${x}" y="${(p.y * 100 + 8.4).toFixed(1)}"
        text-anchor="middle">${esc(n.label)}</text>`;
  }).join('');

  return `<svg class="th-sc__map" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="diagrama">${edges}${marks}</svg>`;
}

export default {
  id: 'map-diagram',
  name: 'Mapas e diagramas',
  tier: 4,
  blurb: 'Nós, ligações e legenda em relação espacial.',
  templates: TEMPLATES,

  generate({ difficulty, rng, templateId = 'linhas', variantAmount = 0.5 }) {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
    const count = densityFor(difficulty, { min: 3, max: 8, base: 5 });
    const variant = pickVariant(rng, variantAmount);

    const namePool = template.id === 'rota' ? CITIES : STATIONS;
    const names = rSample(rng, namePool, count);
    const colors = rSample(rng, COLOR_NAMES, Math.min(3, Math.max(2, Math.ceil(count / 3))));
    const points = scatter(count, rng, template.id === 'planta' ? 0.28 : 0.22);

    const nodes = names.map((label, i) => ({
      label,
      colorName: colors[i % colors.length],
      attribute: template.id === 'planta' ? rPick(rng, ['sala', 'corredor', 'depósito']) : rPick(rng, KINDS),
      numeric: rInt(rng, 1, 24),
    }));

    // A planta baixa é um arranjo de cômodos: ligar tudo com linhas só
    // atrapalharia a leitura do espaço.
    const links = template.id === 'planta' ? []
      : template.id === 'rede' ? chainLinks(points, rng, Math.max(1, Math.floor(count / 2)))
        : chainLinks(points, rng, 0);

    const elements = nodes.map((n, i) => {
      const region = regionOf(points[i].x, points[i].y, 3, 3);
      return element({
        id: `n${i}`,
        label: n.label,
        value: `linha ${n.colorName}`,
        numeric: n.numeric,
        category: n.colorName,
        attribute: n.attribute,
        x: points[i].x,
        y: points[i].y,
        row: region.row,
        col: region.col,
        kind: 'node',
      });
    });

    const legend = `<div class="th-sc__legend">${colors.map((c) => (
      `<span class="th-sc__legend-item"><i style="background:${COLORS[c]}"></i>${esc(c)}</span>`
    )).join('')}</div>`;

    const used = new Set(names);
    const pool = [...STATIONS, ...CITIES].filter((v) => !used.has(v));

    return createScene({
      familyId: 'map-diagram',
      templateId: template.id,
      templateLabel: template.label,
      tier: 4,
      title: template.id === 'planta' ? `Planta ${code(rng, 2)}` : 'Mapa',
      elements,
      distractors: rSample(rng, pool, 6),
      variant,
      layout: { kind: 'regions', rows: 3, cols: 3 },
      attributeNoun: 'o tipo',
      queryKinds: ['value', 'attribute', 'position', 'count', 'extreme', 'compare', 'presence', 'absent', 'label'],
      html: wrap(
        svgFor({ points, nodes, links, template: template.id, variant }) + legend,
        { variant, kind: 'map' },
      ),
    });
  },
};
