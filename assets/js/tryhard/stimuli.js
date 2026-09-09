// Geradores de estímulo. Todos aceitam um gerador aleatório com semente, o que
// deixa os testes determinísticos sem mudar o comportamento em produção.

import { makeRng, rInt, rPick, rSample, rShuffle } from './rng.js';
import { SYMBOL_IDS } from './symbols.js';
import { STIMULUS_TYPES } from './config.js';

/** Letras sem as que se confundem com dígitos (I, O) ou entre si (Q). */
export const LETTER_POOL = 'ABCDEFGHJKLMNPRSTUVXZ'.split('');
export const DIGIT_POOL = '0123456789'.split('');
export const MIXED_POOL = DIGIT_POOL.concat(LETTER_POOL);

/** Conjunto de onde um tipo de estímulo sorteia. */
export function poolFor(type) {
  switch (type) {
    case 'letters': return LETTER_POOL;
    case 'mixed': return MIXED_POOL;
    case 'symbols': return SYMBOL_IDS;
    case 'shapes': return SYMBOL_IDS.slice(0, 8);
    default: return DIGIT_POOL;
  }
}

export function isSymbolType(type) {
  return type === 'symbols' || type === 'shapes';
}

/**
 * A sequência é fácil demais de comprimir?
 * Repetições, progressões e alternâncias (123456, 111111, 202020) medem
 * memória de regra, não de percepção — o benchmark precisa evitá-las.
 */
export function isHighlyCompressible(items) {
  if (items.length < 4) return false;
  const nums = items.map((v) => Number(v));
  const numeric = nums.every((n) => Number.isFinite(n));

  const unique = new Set(items).size;
  if (unique <= Math.ceil(items.length / 3)) return true;          // pouquíssimos valores
  if (items.every((v) => v === items[0])) return true;             // tudo igual

  // alternância a,b,a,b...
  if (items.length >= 4 && items.every((v, i) => v === items[i % 2])) return true;

  if (numeric) {
    const diffs = nums.slice(1).map((n, i) => n - nums[i]);
    if (diffs.every((d) => d === diffs[0])) return true;           // progressão aritmética
    // longa subsequência crescente/decrescente de passo 1
    let run = 1;
    for (let i = 1; i < diffs.length; i++) {
      if (diffs[i] === diffs[i - 1] && Math.abs(diffs[i]) === 1) run += 1;
      else run = 1;
      if (run >= 3) return true;
    }
  }
  return false;
}

/** Sequência de itens do tipo pedido, evitando repetição imediata. */
export function generateItems(type, count, options = {}) {
  const { rng = Math.random, unique = false, avoidCompressible = false } = options;
  const pool = options.pool || poolFor(type);

  for (let attempt = 0; attempt < 20; attempt++) {
    let items;
    if (unique || isSymbolType(type)) {
      items = rSample(rng, pool, count);
    } else {
      items = [];
      for (let i = 0; i < count; i++) {
        let v;
        let guard = 0;
        do { v = rPick(rng, pool); guard += 1; }
        while (guard < 12 && items.length && v === items[items.length - 1]);
        items.push(v);
      }
    }
    if (!avoidCompressible || !isHighlyCompressible(items)) return items;
  }
  return rSample(rng, pool, count);
}

export const generateDigits = (n, o = {}) => generateItems('digits', n, o);
export const generateLetters = (n, o = {}) => generateItems('letters', n, o);
export const generateMixedCharacters = (n, o = {}) => generateItems('mixed', n, o);
export const generateAbstractSymbols = (n, o = {}) => generateItems('symbols', n, { ...o, unique: true });

/**
 * Matriz de estímulos.
 * @returns {{rows:number, cols:number, type:string, cells:Array<{row:number,col:number,index:number,value:string}>}}
 */
export function generateMatrix({ rows, cols, type = 'digits', rng = Math.random, avoidCompressible = false }) {
  const total = rows * cols;
  const values = generateItems(type, total, { rng, avoidCompressible, unique: isSymbolType(type) });
  const cells = values.map((value, index) => ({
    index,
    row: Math.floor(index / cols),
    col: index % cols,
    value,
  }));
  return { rows, cols, type, cells };
}

/** Itens de uma linha, coluna ou quadrante. */
export function regionCells(matrix, region) {
  const { rows, cols, cells } = matrix;
  switch (region.kind) {
    case 'row': return cells.filter((c) => c.row === region.index);
    case 'col': return cells.filter((c) => c.col === region.index);
    case 'quadrant': {
      const midRow = Math.ceil(rows / 2);
      const midCol = Math.ceil(cols / 2);
      const top = region.index === 0 || region.index === 1;
      const left = region.index === 0 || region.index === 2;
      return cells.filter((c) => (top ? c.row < midRow : c.row >= midRow)
        && (left ? c.col < midCol : c.col >= midCol));
    }
    case 'cells': return region.indexes.map((i) => cells[i]).filter(Boolean);
    default: return cells;
  }
}

export function regionLabel(matrix, region) {
  switch (region.kind) {
    case 'row': return `Linha ${region.index + 1}`;
    case 'col': return `Coluna ${region.index + 1}`;
    case 'quadrant': return ['Quadrante superior esquerdo', 'Quadrante superior direito',
      'Quadrante inferior esquerdo', 'Quadrante inferior direito'][region.index];
    case 'cells': return `${region.indexes.length} posições marcadas`;
    default: return 'Tudo';
  }
}

/**
 * Sorteia a região que será pedida DEPOIS da exposição. Quem chama nunca
 * mostra isso antes: é justamente a ignorância prévia que força a pessoa a
 * capturar a cena inteira.
 */
export function generateCue(matrix, { rng = Math.random, kinds = ['row', 'col', 'quadrant'] } = {}) {
  const kind = rPick(rng, kinds);
  if (kind === 'row') return { kind, index: rInt(rng, 0, matrix.rows - 1) };
  if (kind === 'col') return { kind, index: rInt(rng, 0, matrix.cols - 1) };
  if (kind === 'cells') {
    const n = Math.min(3, matrix.cells.length);
    return { kind, indexes: rSample(rng, matrix.cells.map((c) => c.index), n).sort((a, b) => a - b) };
  }
  return { kind: 'quadrant', index: rInt(rng, 0, 3) };
}

/**
 * Máscara visual. Nunca reaproveita os itens do estímulo: uma máscara que
 * contém a resposta deixa de ser interferência e vira pista.
 */
export function generateMask({ length, complexity = 1, rng = Math.random, exclude = [] }) {
  const noise = '#%@&*$?!+=~§¤×÷'.split('');
  const blocked = new Set(exclude.map((v) => String(v)));
  const pool = complexity >= 3
    ? noise.concat('▚▞▛▜▙▟▘▝'.split(''))
    : complexity === 2 ? noise.concat(MIXED_POOL.filter((c) => !blocked.has(c))) : noise;
  const chars = [];
  for (let i = 0; i < length; i++) {
    let c;
    let guard = 0;
    do { c = rPick(rng, pool); guard += 1; }
    while (guard < 12 && (blocked.has(c) || (chars.length && c === chars[chars.length - 1])));
    chars.push(c);
  }
  return { chars, complexity, kind: complexity >= 3 ? 'noise' : complexity === 2 ? 'characters' : 'symbols' };
}

/**
 * Posições ao redor de um centro, para a fixação periférica.
 * Os ângulos são espalhados para os itens não se amontoarem de um lado só.
 * `distance` é a fração do raio disponível.
 */
export function generateSpatialConfiguration({ count, distance = 0.5, rng = Math.random, jitter = 0.12 }) {
  const base = rng() * Math.PI * 2;
  const slice = (Math.PI * 2) / count;
  return Array.from({ length: count }, (_, i) => {
    const angle = base + slice * i + (rng() - 0.5) * slice * 0.5;
    const radius = Math.max(0.15, Math.min(1, distance + (rng() - 0.5) * jitter));
    return {
      index: i,
      angle,
      radius,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

/** Peso de complexidade do tipo, usado no throughput. */
export function complexityWeight(type) {
  return STIMULUS_TYPES[type]?.weight ?? 1;
}

/** Fábrica pronta com semente, útil em testes. */
export function withSeed(seed) {
  const rng = makeRng(seed);
  return {
    rng,
    items: (type, n, o = {}) => generateItems(type, n, { ...o, rng }),
    matrix: (o) => generateMatrix({ ...o, rng }),
    cue: (m, o = {}) => generateCue(m, { ...o, rng }),
    mask: (o) => generateMask({ ...o, rng }),
    spatial: (o) => generateSpatialConfiguration({ ...o, rng }),
    shuffle: (list) => rShuffle(rng, list),
  };
}
