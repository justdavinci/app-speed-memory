// Geração de listas de palavras aleatórias.
import { sample } from '../util.js';
import { WORD_BANK } from './lexicon.js';

/**
 * Sorteia palavras distintas do banco.
 * @param {number} count
 * @returns {{items: string[], answer: string[], display: string}}
 */
export function generateWords(count, opts = {}, rnd = Math.random) {
  const bank = opts.bank && opts.bank.length ? opts.bank : WORD_BANK;
  const words = sample(bank, count, rnd);
  return { items: words, answer: words, display: words.join(' ') };
}
