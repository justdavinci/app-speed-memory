// Geração de sequências numéricas aleatórias.
import { randInt } from '../util.js';

/**
 * Gera uma sequência de dígitos aleatórios.
 * @param {number} count quantidade de dígitos
 * @param {object} [opts]
 * @param {boolean} [opts.avoidTripleRepeat] evita 3 dígitos iguais seguidos
 * @returns {{items: string[], answer: string[], display: string}}
 */
export function generateDigits(count, opts = {}, rnd = Math.random) {
  const { avoidTripleRepeat = true } = opts;
  const digits = [];
  for (let i = 0; i < count; i++) {
    let d;
    let guard = 0;
    do {
      d = String(randInt(0, 9, rnd));
      guard++;
    } while (
      avoidTripleRepeat &&
      guard < 20 &&
      digits.length >= 2 &&
      digits[digits.length - 1] === d &&
      digits[digits.length - 2] === d
    );
    digits.push(d);
  }
  return { items: digits, answer: digits, display: digits.join('') };
}
