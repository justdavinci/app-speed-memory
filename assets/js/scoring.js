// Comparação da resposta digitada com a sequência mostrada.
import { normalizeToken, onlyDigits, tokenizeWords } from './util.js';

/** Quebra o texto digitado nos itens comparáveis do modo. */
export function parseInput(mode, text) {
  if (mode === 'digits') return onlyDigits(text).split('').filter(Boolean);
  return tokenizeWords(text);
}

/**
 * Compara posição a posição a resposta esperada com a digitada.
 * A posição importa: um item esquecido no meio desalinha o restante, como nas
 * competições de memória.
 *
 * @returns {{cells: Array, correct: number, total: number, perfect: boolean, extra: string[]}}
 */
export function scoreSeries(mode, expected, given, opts = {}) {
  const strictAccents = !!opts.strictAccents;
  const norm = (t) => (mode === 'digits' ? String(t).trim() : normalizeToken(t, strictAccents));

  const cells = expected.map((exp, i) => {
    const got = given[i];
    const ok = got !== undefined && norm(got) === norm(exp);
    return { expected: exp, given: got ?? '', ok, missing: got === undefined };
  });

  const extra = given.slice(expected.length);
  const correct = cells.filter((c) => c.ok).length;

  return {
    cells,
    extra,
    correct,
    total: expected.length,
    perfect: correct === expected.length && extra.length === 0,
  };
}

/** Consolida as séries de uma sessão. */
export function summarize(series) {
  const total = series.reduce((a, s) => a + s.total, 0);
  const correct = series.reduce((a, s) => a + s.correct, 0);
  const perfectSeries = series.filter((s) => s.perfect).length;

  let best = 0;
  let run = 0;
  for (const s of series) {
    run = s.perfect ? run + 1 : 0;
    if (run > best) best = run;
  }

  return {
    correct,
    total,
    accuracy: total ? correct / total : 0,
    perfectSeries,
    bestStreak: best,
  };
}
