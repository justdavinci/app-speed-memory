// Comparação da resposta digitada com a sequência mostrada.
import { normalizeToken, onlyDigits, tokenizeWords } from './util.js';

/** Quebra o texto digitado nos itens comparáveis do modo. */
export function parseInput(mode, text) {
  if (mode === 'digits') return onlyDigits(text).split('').filter(Boolean);
  return tokenizeWords(text);
}

/**
 * Compara a resposta esperada com a digitada.
 *
 * Com `ordered` (padrão), a posição importa: um item esquecido no meio
 * desalinha o restante, como nas competições de memória. Sem ordem, basta que
 * o item apareça em algum lugar da resposta — cada item digitado só pode
 * casar com um esperado, então repetir a mesma palavra não rende dois acertos.
 *
 * @returns {{cells: Array, correct: number, total: number, perfect: boolean, extra: string[]}}
 */
export function scoreSeries(mode, expected, given, opts = {}) {
  const strictAccents = !!opts.strictAccents;
  const ordered = opts.ordered !== false;
  const norm = (t) => (mode === 'digits' ? String(t).trim() : normalizeToken(t, strictAccents));

  const cells = [];
  let extra;

  if (ordered) {
    expected.forEach((exp, i) => {
      const got = given[i];
      const ok = got !== undefined && norm(got) === norm(exp);
      cells.push({ expected: exp, given: got ?? '', ok, missing: got === undefined });
    });
    extra = given.slice(expected.length);
  } else {
    const pool = given.map(norm);
    const used = new Array(pool.length).fill(false);
    for (const exp of expected) {
      const target = norm(exp);
      const at = pool.findIndex((g, i) => !used[i] && g === target);
      if (at >= 0) {
        used[at] = true;
        cells.push({ expected: exp, given: given[at], ok: true, missing: false });
      } else {
        cells.push({ expected: exp, given: '', ok: false, missing: true });
      }
    }
    extra = given.filter((_, i) => !used[i]);
  }

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
