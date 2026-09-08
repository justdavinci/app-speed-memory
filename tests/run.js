// Testes sem dependências: `npm test`.
// Cobrem as partes puras (geradores, correção e motor da sessão).
import assert from 'node:assert/strict';

import { chunk, normalizeToken, onlyDigits, sample, tokenizeWords } from '../assets/js/util.js';
import { generateDigits } from '../assets/js/generators/digits.js';
import { generateWords } from '../assets/js/generators/words.js';
import { generateSentence } from '../assets/js/generators/sentences.js';
import {
  ADJ_PERSON, ADJ_THING, OBJECTS, SUBJECTS, VERBS_INTRANS, VERBS_TRANS, WORD_BANK,
} from '../assets/js/generators/lexicon.js';
import { parseInput, scoreSeries, summarize } from '../assets/js/scoring.js';
import { advance, createSession, finishSession, submitRound } from '../assets/js/engine.js';
import { importHistory, statsFor } from '../assets/js/storage.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FALHA  ${name}\n       ${err.message}`);
  }
}

function group(title) {
  console.log(`\n${title}`);
}

/* ------------------------------ utilidades ------------------------------ */

group('Utilidades');

test('normalizeToken ignora acento e pontuação por padrão', () => {
  assert.equal(normalizeToken('Coração,'), 'coracao');
  assert.equal(normalizeToken('Ação!'), normalizeToken('acao'));
});

test('normalizeToken respeita acentos no modo rigoroso', () => {
  assert.notEqual(normalizeToken('coração', true), normalizeToken('coracao', true));
});

test('tokenizeWords separa por espaço, vírgula e quebra de linha', () => {
  assert.deepEqual(tokenizeWords(' casa, pipa\nvela '), ['casa', 'pipa', 'vela']);
});

test('onlyDigits descarta qualquer coisa que não seja número', () => {
  assert.equal(onlyDigits('12 ab 3-4'), '1234');
});

test('chunk agrupa em blocos do tamanho pedido', () => {
  assert.deepEqual(chunk('1234567', 3), ['123', '456', '7']);
  assert.deepEqual(chunk('123', 0), ['123']);
});

test('sample sem repetição quando cabe no banco', () => {
  const s = sample(['a', 'b', 'c', 'd'], 3);
  assert.equal(new Set(s).size, 3);
});

/* -------------------------------- dígitos ------------------------------- */

group('Gerador de dígitos');

test('gera exatamente a quantidade pedida, só com dígitos', () => {
  for (const n of [1, 3, 8, 20, 60]) {
    const r = generateDigits(n);
    assert.equal(r.items.length, n);
    assert.match(r.display, /^[0-9]+$/);
    assert.equal(r.display.length, n);
  }
});

test('evita três dígitos iguais em sequência', () => {
  for (let i = 0; i < 200; i++) {
    assert.ok(!/(\d)\1\1/.test(generateDigits(40).display), 'repetiu três vezes');
  }
});

/* ------------------------------- palavras ------------------------------- */

group('Gerador de palavras');

test('gera a quantidade pedida sem repetir', () => {
  for (const n of [2, 5, 12, 30]) {
    const r = generateWords(n);
    assert.equal(r.items.length, n);
    assert.equal(new Set(r.items).size, n, 'palavra repetida na mesma série');
  }
});

test('todas as palavras vêm do banco', () => {
  const bank = new Set(WORD_BANK);
  for (const w of generateWords(30).items) assert.ok(bank.has(w), `fora do banco: ${w}`);
});

/* -------------------------------- frases -------------------------------- */

group('Gerador de frases');

test('a frase tem exatamente o número de palavras pedido', () => {
  for (let n = 3; n <= 30; n++) {
    for (let i = 0; i < 60; i++) {
      const r = generateSentence(n);
      assert.equal(r.items.length, n, `pedidas ${n}, vieram ${r.items.length}: ${r.display}`);
    }
  }
});

test('o texto exibido tem as mesmas palavras da resposta', () => {
  for (let i = 0; i < 200; i++) {
    const r = generateSentence(3 + (i % 20));
    const shown = tokenizeWords(r.display.replace(/\.$/, ''));
    assert.equal(shown.length, r.answer.length);
    shown.forEach((w, j) => assert.equal(normalizeToken(w), normalizeToken(r.answer[j])));
  }
});

test('a frase começa maiúscula e termina com ponto', () => {
  const r = generateSentence(8);
  assert.match(r.display, /^[A-ZÀ-Ú].*\.$/);
});

test('artigo concorda com o gênero do substantivo', () => {
  const gender = new Map();
  for (const s of SUBJECTS) gender.set(s.w, s.g);
  for (const o of OBJECTS) gender.set(o.w, o.g);

  for (let i = 0; i < 400; i++) {
    const words = generateSentence(5 + (i % 20)).items;
    words.forEach((w, j) => {
      if (w !== 'o' && w !== 'a') return;
      const noun = words[j + 1];
      if (!gender.has(noun)) return;
      assert.equal(gender.get(noun), w === 'a' ? 'f' : 'm', `"${w} ${noun}" não concorda`);
    });
  }
});

test('adjetivo concorda com o gênero do substantivo que acompanha', () => {
  const gender = new Map();
  for (const s of SUBJECTS) gender.set(s.w, s.g);
  for (const o of OBJECTS) gender.set(o.w, o.g);
  const formOf = new Map();
  for (const a of [...ADJ_PERSON, ...ADJ_THING]) {
    formOf.set(a.m, (formOf.get(a.m) || new Set()).add('m'));
    formOf.set(a.f, (formOf.get(a.f) || new Set()).add('f'));
  }

  for (let i = 0; i < 400; i++) {
    const words = generateSentence(6 + (i % 18)).items;
    words.forEach((w, j) => {
      const noun = words[j - 1];
      if (!gender.has(noun) || !formOf.has(w)) return;
      assert.ok(formOf.get(w).has(gender.get(noun)), `"${noun} ${w}" não concorda`);
    });
  }
});

test('verbo só recebe objeto compatível (nada de "comeu a escada")', () => {
  const objByName = new Map(OBJECTS.map((o) => [o.w, o]));
  const transByName = new Map(VERBS_TRANS.map((v) => [v.w, v]));

  for (let i = 0; i < 500; i++) {
    const words = generateSentence(5 + (i % 16)).items;
    words.forEach((w, j) => {
      const verb = transByName.get(w);
      if (!verb) return;
      // objeto = artigo + substantivo logo após o verbo (pode haver advérbio antes)
      const start = words[j + 1] === 'o' || words[j + 1] === 'a' ? j + 2 : j + 3;
      const obj = objByName.get(words[start]);
      if (!obj) return;
      assert.ok(obj.t.some((t) => verb.t.includes(t)), `"${w} ... ${obj.w}" é incompatível`);
    });
  }
});

test('animais não executam ações exclusivas de humanos', () => {
  const animals = new Set(SUBJECTS.filter((s) => s.k === 'a').map((s) => s.w));
  const humanOnly = new Set(
    [...VERBS_TRANS, ...VERBS_INTRANS].filter((v) => v.h).map((v) => v.w),
  );

  for (let i = 0; i < 500; i++) {
    const words = generateSentence(4 + (i % 18)).items;
    words.forEach((w, j) => {
      if (!animals.has(w)) return;
      const next = words.slice(j + 1, j + 3); // pode ter um adjetivo entre sujeito e verbo
      for (const cand of next) {
        if (humanOnly.has(cand)) assert.fail(`"${w}" não deveria "${cand}"`);
      }
    });
  }
});

test('pede menos de 3 palavras e ainda assim sai uma frase válida', () => {
  assert.equal(generateSentence(1).items.length, 3);
});

/* ------------------------------- correção ------------------------------- */

group('Correção das respostas');

test('acerto total marca a série como perfeita', () => {
  const r = scoreSeries('digits', ['1', '2', '3'], parseInput('digits', '123'));
  assert.equal(r.correct, 3);
  assert.ok(r.perfect);
});

test('a posição importa: um dígito faltando desalinha o resto', () => {
  const r = scoreSeries('digits', ['1', '2', '3', '4'], parseInput('digits', '134'));
  // só a primeira posição sobrevive: 3 e 4 escorregam e a última fica vazia
  assert.equal(r.correct, 1);
  assert.ok(!r.perfect);
});

test('itens não digitados aparecem como faltando', () => {
  const r = scoreSeries('words', ['casa', 'pipa'], parseInput('words', 'casa'));
  assert.ok(r.cells[1].missing);
  assert.equal(r.correct, 1);
});

test('itens digitados a mais são registrados e impedem o "perfeito"', () => {
  const r = scoreSeries('words', ['casa'], parseInput('words', 'casa pipa'));
  assert.deepEqual(r.extra, ['pipa']);
  assert.ok(!r.perfect);
});

test('sem exigir acento, "coracao" vale por "coração"', () => {
  const r = scoreSeries('words', ['coração'], parseInput('words', 'coracao'));
  assert.ok(r.perfect);
});

test('exigindo acento, "coracao" não vale', () => {
  const r = scoreSeries('words', ['coração'], parseInput('words', 'coracao'), { strictAccents: true });
  assert.ok(!r.perfect);
});

test('frase é comparada palavra a palavra, ignorando pontuação', () => {
  const r = scoreSeries('sentence', ['o', 'gato', 'dormiu'], parseInput('sentence', 'O gato, dormiu.'));
  assert.ok(r.perfect);
});

test('summarize soma acertos, séries perfeitas e a melhor sequência', () => {
  const s = summarize([
    { correct: 4, total: 4, perfect: true },
    { correct: 4, total: 4, perfect: true },
    { correct: 1, total: 4, perfect: false },
    { correct: 4, total: 4, perfect: true },
  ]);
  assert.equal(s.correct, 13);
  assert.equal(s.total, 16);
  assert.equal(s.perfectSeries, 3);
  assert.equal(s.bestStreak, 2);
  assert.equal(s.accuracy, 13 / 16);
});

/* --------------------------- motor da sessão ---------------------------- */

group('Sessão');

test('cria uma sessão com o número de séries pedido', () => {
  const s = createSession({ mode: 'words', count: 4, seconds: 5, pace: 'total', series: 10 });
  assert.equal(s.rounds.length, 10);
  s.rounds.forEach((r) => assert.equal(r.content.items.length, 4));
});

test('sessão completa gera o registro do histórico', () => {
  const s = createSession({ mode: 'digits', count: 5, seconds: 5, pace: 'total', series: 3 });
  s.rounds.forEach((round, i) => {
    submitRound(s, i === 1 ? '00000' : round.content.display);
    if (i < 2) advance(s);
  });
  const rec = finishSession(s);
  assert.equal(rec.series.length, 3);
  assert.equal(rec.totals.total, 15);
  assert.equal(rec.totals.perfectSeries, 2);
  assert.ok(rec.durationMs >= 0);
  assert.equal(rec.mode, 'digits');
});

test('cada modo gera o conteúdo do tamanho certo', () => {
  for (const [mode, count] of [['digits', 7], ['words', 6], ['sentence', 9]]) {
    const s = createSession({ mode, count, seconds: 5, pace: 'total', series: 2 });
    s.rounds.forEach((r) => assert.equal(r.content.answer.length, count, `modo ${mode}`));
  }
});

/* ------------------------------ histórico ------------------------------- */

group('Histórico');

const fakeSession = (mode, accuracy, count, when, perfectSeries = 0) => ({
  id: `${mode}-${when}`,
  mode,
  config: { count, seconds: 10, pace: 'total', series: 10 },
  finishedAt: new Date(when).toISOString(),
  totals: { accuracy, correct: Math.round(accuracy * 100), total: 100, perfectSeries, bestStreak: perfectSeries },
  series: [],
});

test('statsFor filtra por modo e calcula a tendência', () => {
  const history = [];
  for (let i = 0; i < 10; i++) {
    history.push(fakeSession('digits', i < 5 ? 0.5 : 0.9, 8, 2024, 0));
    history[history.length - 1].id = `d${i}`;
    history[history.length - 1].finishedAt = new Date(2024, 0, i + 1).toISOString();
  }
  history.push(fakeSession('words', 0.2, 5, 2025));

  const stats = statsFor(history, 'digits');
  assert.equal(stats.sessions, 10);
  assert.equal(Math.round(stats.recent * 100), 90);
  assert.ok(Math.abs(stats.trend - 0.4) < 1e-9, `tendência inesperada: ${stats.trend}`);
});

test('statsFor registra o maior tamanho de série com acerto perfeito', () => {
  const history = [
    fakeSession('digits', 1, 12, 2024, 3),
    fakeSession('digits', 0.4, 30, 2025, 0),
  ];
  assert.equal(statsFor(history, 'digits').bestSpan, 12);
});

test('statsFor devolve zeros quando não há sessões', () => {
  const stats = statsFor([], 'digits');
  assert.equal(stats.sessions, 0);
  assert.equal(stats.best, null);
});

test('importHistory rejeita conteúdo que não é lista', () => {
  assert.throws(() => importHistory({ oops: true }), /lista de sessões/);
});

/* -------------------------------- fecho --------------------------------- */

console.log(`\n${passed} testes passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
