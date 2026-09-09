// Gerador de frases em português com número exato de palavras.
//
// A frase é montada por orações: cada oração tem um núcleo obrigatório
// (sujeito + verbo [+ objeto]) e "encaixes" opcionais (adjetivo, advérbio,
// locução adverbial). Uma busca com retrocesso escolhe a combinação de
// encaixes que fecha exatamente o orçamento de palavras. Quando o total pedido
// é maior do que cabe em uma oração, novas orações são ligadas por conectivos.

import { pick, randInt, shuffle } from '../util.js';
import {
  SUBJECTS, OBJECTS, ADJ_PERSON, ADJ_THING, VERBS_INTRANS, VERBS_TRANS,
  ADVERBS, PHRASES_BY_LEN, CONNECTORS, article, adjForm,
} from './lexicon.js';

export const MIN_SENTENCE_WORDS = 3;
const MIN_CLAUSE = 3;
const MAX_CLAUSE = 12;

/** Divide o total de palavras em orações viáveis (cada conectivo custa 1). */
function planClauseSizes(total, rnd) {
  const sizes = [];
  let rem = total;
  while (rem > MAX_CLAUSE) {
    const maxChunk = Math.min(MAX_CLAUSE, rem - 1 - MIN_CLAUSE);
    const minChunk = Math.max(MIN_CLAUSE, maxChunk - 4);
    const chunk = randInt(minChunk, maxChunk, rnd);
    sizes.push(chunk);
    rem -= chunk + 1; // +1 pelo conectivo
  }
  sizes.push(rem);
  return sizes;
}

/**
 * Encontra uma atribuição de custos para os encaixes somando exatamente
 * `extras`. Retorna um mapa slot -> custo, ou null se impossível.
 */
function solveSlots(slots, extras, rnd) {
  const order = shuffle(slots, rnd);
  const chosen = {};
  function walk(i, left) {
    if (left === 0) return true;
    if (i >= order.length) return false;
    const slot = order[i];
    for (const cost of shuffle(slot.costs, rnd)) {
      if (cost > left) continue;
      chosen[slot.name] = cost;
      if (walk(i + 1, left - cost)) return true;
      delete chosen[slot.name];
    }
    return false;
  }
  return walk(0, extras) ? chosen : null;
}

/** Locução adverbial com exatamente `len` palavras, sem repetir as já usadas. */
function phraseOfLength(len, used, rnd) {
  const pool = (PHRASES_BY_LEN[len] || []).filter((p) => !used.has(p));
  const p = pool.length ? pick(pool, rnd) : pick(PHRASES_BY_LEN[len], rnd);
  used.add(p);
  return p.split(' ');
}

/** Verbos compatíveis com o sujeito (animais não vendem nem consertam nada). */
function verbsFor(subject, transitive) {
  const list = transitive ? VERBS_TRANS : VERBS_INTRANS;
  return subject.k === 'h' ? list : list.filter((v) => !v.h);
}

/** Objetos que o verbo aceita ("comeu" só combina com comida). */
function objectsFor(verb) {
  const pool = OBJECTS.filter((o) => o.t.some((t) => verb.t.includes(t)));
  return pool.length ? pool : OBJECTS;
}

/** Monta uma oração com exatamente `size` palavras. */
function buildClause(size, rnd, usedPhrases) {
  const transitive = size >= 5;
  const base = transitive ? 5 : 3;
  const extras = size - base;

  const slots = [
    { name: 'advPre', costs: [0, 1] },
    { name: 'subjAdj', costs: [0, 1] },
    { name: 'advEnd', costs: [0, 1] },
    { name: 'pp1', costs: [0, 2, 3, 4] },
    { name: 'pp2', costs: [0, 2, 3, 4] },
  ];
  if (transitive) slots.push({ name: 'objAdj', costs: [0, 1] });

  const chosen = solveSlots(slots, extras, rnd) || {};
  const has = (n) => (chosen[n] || 0) > 0;

  const subject = pick(SUBJECTS, rnd);
  const verb = pick(verbsFor(subject, transitive), rnd);
  const words = [];

  if (has('advPre')) words.push(pick(ADVERBS, rnd));
  words.push(article(subject.g), subject.w);
  if (has('subjAdj')) words.push(adjForm(pick(ADJ_PERSON, rnd), subject.g));
  words.push(verb.w);
  if (has('advEnd')) words.push(pick(ADVERBS, rnd));
  if (transitive) {
    const object = pick(objectsFor(verb), rnd);
    words.push(article(object.g), object.w);
    if (has('objAdj')) words.push(adjForm(pick(ADJ_THING, rnd), object.g));
  }
  for (const slot of ['pp1', 'pp2']) {
    const len = chosen[slot] || 0;
    if (len >= 2) words.push(...phraseOfLength(len, usedPhrases, rnd));
  }
  return words;
}

/**
 * Gera uma frase com sentido e com exatamente `wordCount` palavras.
 * @param {number} wordCount mínimo de 3 palavras
 * @returns {{items: string[], answer: string[], display: string}}
 */
export function generateSentence(wordCount, opts = {}, rnd = Math.random) {
  const total = Math.max(MIN_SENTENCE_WORDS, Math.floor(wordCount));
  const sizes = planClauseSizes(total, rnd);
  const usedPhrases = new Set();
  const words = [];

  sizes.forEach((size, i) => {
    if (i > 0) words.push(pick(CONNECTORS, rnd));
    words.push(...buildClause(size, rnd, usedPhrases));
  });

  const display =
    words[0].charAt(0).toUpperCase() + words[0].slice(1) + ' ' + words.slice(1).join(' ') + '.';

  return { items: words, answer: words, display: words.length === 1 ? words[0] : display };
}
