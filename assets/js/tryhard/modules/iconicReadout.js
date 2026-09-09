// Iconic Readout.
//
// A matriz some e só então vem a pergunta. As categorias variam de propósito
// — posição, vizinhança, localização — para o exercício não virar uma
// recitação decorada da matriz na ordem de leitura.

import { generateMatrix, isSymbolType } from '../stimuli.js';
import { rInt, rPick, rSample, rShuffle } from '../rng.js';
import { itemAccuracy } from '../metrics.js';

const QUESTION_KINDS = ['whatAt', 'whereIs', 'rightOf', 'above'];

function optionsFor(matrix, correct, rng, size = 6) {
  const others = matrix.cells
    .map((c) => c.value)
    .filter((v) => v !== correct);
  const pool = rShuffle(rng, [...new Set(others)]).slice(0, size - 1);
  return rShuffle(rng, [correct, ...pool]);
}

function buildQuestion(matrix, rng) {
  const kinds = matrix.cols > 1 ? QUESTION_KINDS : ['whatAt', 'whereIs'];
  const kind = rPick(rng, kinds);
  const cells = matrix.cells;

  if (kind === 'whereIs') {
    const target = rPick(rng, cells);
    return {
      kind,
      text: `Onde estava "${target.value}"?`,
      answer: String(target.index),
      response: { kind: 'cell', rows: matrix.rows, cols: matrix.cols },
      symbol: isSymbolType(matrix.type) ? target.value : null,
    };
  }

  if (kind === 'rightOf' || kind === 'above') {
    const candidates = cells.filter((c) => (kind === 'rightOf' ? c.col < matrix.cols - 1 : c.row > 0));
    if (candidates.length) {
      const anchor = rPick(rng, candidates);
      const target = cells.find((c) => (kind === 'rightOf'
        ? c.row === anchor.row && c.col === anchor.col + 1
        : c.row === anchor.row - 1 && c.col === anchor.col));
      return {
        kind,
        text: kind === 'rightOf'
          ? `O que estava logo à direita de "${anchor.value}"?`
          : `O que estava logo acima de "${anchor.value}"?`,
        answer: target.value,
        response: { kind: 'choice', options: optionsFor(matrix, target.value, rng), symbols: isSymbolType(matrix.type) },
      };
    }
  }

  const cell = rPick(rng, cells);
  return {
    kind: 'whatAt',
    text: `Qual item estava na linha ${cell.row + 1}, coluna ${cell.col + 1}?`,
    answer: cell.value,
    response: { kind: 'choice', options: optionsFor(matrix, cell.value, rng), symbols: isSymbolType(matrix.type) },
  };
}

export default {
  id: 'iconic-readout',

  generate({ difficulty, stimulus, rng }) {
    const matrix = generateMatrix({
      rows: difficulty.matrixRows,
      cols: difficulty.matrixColumns,
      type: stimulus,
      rng,
    });
    const wanted = Math.max(1, difficulty.questionCount || 1);
    const questions = [];
    const seen = new Set();
    for (let i = 0; i < wanted * 3 && questions.length < wanted; i++) {
      const q = buildQuestion(matrix, rng);
      const key = `${q.kind}|${q.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(q);
    }

    return {
      matrix,
      questions,
      stimulusType: stimulus,
      exposureMs: difficulty.exposureMs,
      cueDelayMs: difficulty.cueDelayMs || 0,
      expected: questions.map((q) => q.answer),
      totalItems: questions.length,
      extraComplexity: 1 + (matrix.rows * matrix.cols) / 40,
      response: { kind: 'questions', questions, prompt: 'Responda sobre a cena' },
      render: { kind: 'matrix' },
    };
  },

  score(trial, given) {
    const cells = trial.expected.map((expected, i) => ({
      index: i,
      expected,
      given: given[i] ?? '',
      ok: String(given[i] ?? '') === String(expected),
    }));
    const correct = cells.filter((c) => c.ok).length;
    return {
      cells,
      correct,
      total: cells.length,
      itemAccuracy: itemAccuracy(correct, cells.length),
      exact: correct === cells.length,
    };
  },
};
