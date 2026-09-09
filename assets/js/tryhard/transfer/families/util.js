// Utilidades comuns às famílias de estímulo.

import { esc } from '../../../util.js';
import { rInt, rPick, rSample, rShuffle } from '../../rng.js';
import { PALETTES } from '../vocab.js';

export { esc, rInt, rPick, rSample, rShuffle };

/** Quantos elementos a cena deve ter, dado o alvo e os limites da família. */
export function densityFor(difficulty, { min, max, base = 5 }) {
  const wanted = Math.round(difficulty?.informationDensity ?? base);
  return Math.min(max, Math.max(min, wanted));
}

/**
 * Variação de apresentação. Duas exposições do mesmo modelo não devem parecer
 * a mesma tela: muda paleta, alinhamento, densidade visual e ordem.
 * `amount` (0..1) vem da dimensão contextualVariation.
 */
export function pickVariant(rng, amount = 0.5) {
  const roll = () => rng() < amount;
  return {
    palette: roll() ? rPick(rng, PALETTES) : 'claro',
    align: roll() ? rPick(rng, ['left', 'right']) : 'left',
    dense: roll(),
    reversed: roll() && rng() < 0.5,
    accent: rInt(rng, 0, 3),
    scale: roll() ? [0.9, 1, 1.08][rInt(rng, 0, 2)] : 1,
  };
}

/** Atributos de estilo derivados da variação, aplicados na raiz da cena. */
export function variantAttrs(variant) {
  return `data-palette="${esc(variant.palette || 'claro')}" data-align="${esc(variant.align || 'left')}"`
    + `${variant.dense ? ' data-dense="1"' : ''} style="--sc-scale:${variant.scale || 1}"`;
}

/**
 * Malha grossa de regiões para cenas com posição livre. Serve para perguntar
 * "em que região estava" sem exigir precisão de pixel.
 */
export function regionOf(x, y, cols = 3, rows = 3) {
  const col = Math.min(cols - 1, Math.max(0, Math.floor(x * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(y * rows)));
  return { row, col };
}

/** Envelope padrão da cena, com título opcional. */
export function wrap(inner, { variant, kind, title = '' }) {
  return `<div class="th-sc th-sc--${esc(kind)}" ${variantAttrs(variant)}>`
    + (title ? `<div class="th-sc__title">${esc(title)}</div>` : '')
    + inner
    + '</div>';
}
