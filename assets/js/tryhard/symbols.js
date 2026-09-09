// Biblioteca de símbolos abstratos, desenhados em SVG.
//
// Não usamos caracteres Unicode exóticos de propósito: a renderização deles
// varia demais entre aparelhos, e um estímulo que muda de forma conforme o
// celular arruína a comparação entre sessões. Aqui a forma é a mesma sempre.

const V = 100; // lado do viewBox

/** Cada símbolo é um traçado fechado ou aberto dentro de um quadrado 100×100. */
export const SYMBOLS = [
  { id: 'tri-up', d: 'M50 14 L86 82 L14 82 Z', fill: true },
  { id: 'tri-down', d: 'M14 18 L86 18 L50 86 Z', fill: true },
  { id: 'square', d: 'M20 20 H80 V80 H20 Z', fill: true },
  { id: 'diamond', d: 'M50 12 L88 50 L50 88 L12 50 Z', fill: true },
  { id: 'circle', d: 'M50 14 A36 36 0 1 1 49.9 14 Z', fill: true },
  { id: 'ring', d: 'M50 16 A34 34 0 1 1 49.9 16 Z M50 34 A16 16 0 1 0 50.1 34 Z', fill: true, evenodd: true },
  { id: 'plus', d: 'M40 14 H60 V40 H86 V60 H60 V86 H40 V60 H14 V40 H40 Z', fill: true },
  { id: 'cross', d: 'M24 10 L50 36 L76 10 L90 24 L64 50 L90 76 L76 90 L50 64 L24 90 L10 76 L36 50 L10 24 Z', fill: true },
  { id: 'arrow', d: 'M50 10 L84 48 H64 V88 H36 V48 H16 Z', fill: true },
  { id: 'half', d: 'M50 14 A36 36 0 0 1 50 86 Z', fill: true },
  { id: 'hex', d: 'M30 16 H70 L90 50 L70 84 H30 L10 50 Z', fill: true },
  { id: 'star4', d: 'M50 8 L62 38 L92 50 L62 62 L50 92 L38 62 L8 50 L38 38 Z', fill: true },
  { id: 'bolt', d: 'M58 8 L22 54 H46 L38 92 L78 42 H52 Z', fill: true },
  { id: 'bars', d: 'M14 22 H86 V40 H14 Z M14 60 H86 V78 H14 Z', fill: true },
  { id: 'tee', d: 'M12 16 H88 V38 H62 V88 H38 V38 H12 Z', fill: true },
  { id: 'ell', d: 'M20 12 H44 V64 H86 V88 H20 Z', fill: true },
  { id: 'chevron', d: 'M20 18 L50 48 L80 18 L92 34 L50 78 L8 34 Z', fill: true },
  { id: 'dots', d: 'M22 22 A12 12 0 1 1 21.9 22 Z M78 22 A12 12 0 1 1 77.9 22 Z M22 78 A12 12 0 1 1 21.9 78 Z M78 78 A12 12 0 1 1 77.9 78 Z', fill: true },
];

export const SYMBOL_IDS = SYMBOLS.map((s) => s.id);

const byId = new Map(SYMBOLS.map((s) => [s.id, s]));

export function getSymbol(id) {
  return byId.get(id) || null;
}

/**
 * Marcação SVG de um símbolo.
 * @param {string} id
 * @param {{size?:number, color?:string, opacity?:number, className?:string}} [opts]
 */
export function symbolSvg(id, opts = {}) {
  const s = byId.get(id);
  if (!s) return '';
  const { size = 48, color = 'currentColor', opacity = 1, className = '' } = opts;
  const rule = s.evenodd ? ' fill-rule="evenodd"' : '';
  return `<svg class="th-symbol ${className}" viewBox="0 0 ${V} ${V}" width="${size}" height="${size}" aria-hidden="true" focusable="false">`
    + `<path d="${s.d}" fill="${color}" fill-opacity="${opacity}"${rule} /></svg>`;
}

/** Formas simples com orientação, usadas na fixação periférica e no limiar. */
export const ORIENTATIONS = [
  { id: 'vertical', label: 'Vertical', degrees: 0, glyph: '│' },
  { id: 'diag-right', label: 'Inclinada para a direita', degrees: 45, glyph: '╱' },
  { id: 'horizontal', label: 'Horizontal', degrees: 90, glyph: '─' },
  { id: 'diag-left', label: 'Inclinada para a esquerda', degrees: 135, glyph: '╲' },
];

/** Barra inclinada, para discriminação de orientação. */
export function barSvg({ degrees = 0, size = 96, contrast = 1, color = 'currentColor', thickness = 0.18 }) {
  const w = V * thickness;
  const x = (V - w) / 2;
  return `<svg class="th-bar" viewBox="0 0 ${V} ${V}" width="${size}" height="${size}" aria-hidden="true" focusable="false">`
    + `<g transform="rotate(${degrees} 50 50)">`
    + `<rect x="${x}" y="8" width="${w}" height="${V - 16}" rx="${w / 2}" fill="${color}" fill-opacity="${contrast}" />`
    + '</g></svg>';
}
