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
import {
  advance, createSession, finishSession, nextIntervalMs, submitRound,
} from '../assets/js/engine.js';
import {
  DEFAULT_SETTINGS, exposureOf, importHistory, levelFrom, migrateSettings, statsFor,
} from '../assets/js/storage.js';
import {
  EXPOSURE_STEPS, MIN_EXPOSURE_MS, PERCEPTION_BANDS, bandFor, formatExposure, stepIndexFor,
} from '../assets/js/perception.js';

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
  const s = createSession({ mode: 'words', count: 4, exposureMs: 5000, pace: 'total', series: 10 });
  assert.equal(s.rounds.length, 10);
  s.rounds.forEach((r) => assert.equal(r.content.items.length, 4));
});

test('sessão completa gera o registro do histórico', () => {
  const s = createSession({ mode: 'digits', count: 5, exposureMs: 5000, pace: 'total', series: 3 });
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
    const s = createSession({ mode, count, exposureMs: 5000, pace: 'total', series: 2 });
    s.rounds.forEach((r) => assert.equal(r.content.answer.length, count, `modo ${mode}`));
  }
});

/* ---------------------- exposição e classificação ----------------------- */

group('Exposição e faixas perceptuais');

test('a escala de exposição vai de 5 ms a 2 minutos, sempre crescendo', () => {
  assert.equal(MIN_EXPOSURE_MS, 5);
  assert.equal(EXPOSURE_STEPS[EXPOSURE_STEPS.length - 1], 120000);
  for (let i = 1; i < EXPOSURE_STEPS.length; i++) {
    assert.ok(EXPOSURE_STEPS[i] > EXPOSURE_STEPS[i - 1], 'a escala precisa ser crescente');
  }
});

test('stepIndexFor devolve o passo mais próximo', () => {
  assert.equal(EXPOSURE_STEPS[stepIndexFor(5)], 5);
  assert.equal(EXPOSURE_STEPS[stepIndexFor(9)], 8);
  assert.equal(EXPOSURE_STEPS[stepIndexFor(10000)], 10000);
  assert.equal(EXPOSURE_STEPS[stepIndexFor(999999)], 120000);
});

test('formatExposure usa ms abaixo de 1 s e segundos acima', () => {
  assert.equal(formatExposure(5), '5 ms');
  assert.equal(formatExposure(250), '250 ms');
  assert.equal(formatExposure(1000), '1 s');
  assert.equal(formatExposure(1500), '1,5 s');
});

test('as faixas cobrem toda a escala sem buraco', () => {
  for (const ms of EXPOSURE_STEPS) assert.ok(bandFor(ms), `sem faixa para ${ms} ms`);
  assert.equal(bandFor(5).id, 'limiar');
  assert.equal(bandFor(10).id, 'limiar');
  assert.equal(bandFor(11).id, 'identificacao');
  assert.equal(bandFor(50).id, 'multiplo');
  assert.equal(bandFor(100).id, 'iconica');
  assert.equal(bandFor(200).id, 'codificacao');
  assert.equal(bandFor(500).id, 'memoria');
  assert.equal(bandFor(10000).id, 'livre');
});

test('os limites das faixas são crescentes', () => {
  for (let i = 1; i < PERCEPTION_BANDS.length; i++) {
    assert.ok(PERCEPTION_BANDS[i].max > PERCEPTION_BANDS[i - 1].max);
  }
});

/* ---------------------------- intervalo --------------------------------- */

group('Intervalo entre séries');

test('intervalo fixo devolve sempre o mesmo valor', () => {
  assert.equal(nextIntervalMs({ mode: 'fixed', ms: 2000 }), 2000);
  assert.equal(nextIntervalMs({ mode: 'fixed', ms: 0 }), 0);
});

test('intervalo aleatório fica dentro da faixa pedida', () => {
  for (let i = 0; i < 500; i++) {
    const ms = nextIntervalMs({ mode: 'random', minMs: 2000, maxMs: 10000 });
    assert.ok(ms >= 2000 && ms <= 10000, `fora da faixa: ${ms}`);
  }
});

test('intervalo aleatório varia de fato', () => {
  const valores = new Set();
  for (let i = 0; i < 200; i++) valores.add(nextIntervalMs({ mode: 'random', minMs: 2000, maxMs: 10000 }));
  assert.ok(valores.size > 10, 'deveria sortear valores diferentes');
});

test('faixa invertida não quebra o sorteio', () => {
  for (let i = 0; i < 100; i++) {
    const ms = nextIntervalMs({ mode: 'random', minMs: 9000, maxMs: 3000 });
    assert.ok(ms >= 3000 && ms <= 9000);
  }
});

/* --------------------------- ajustes salvos ----------------------------- */

group('Migração de ajustes');

test('ajustes da v1 em segundos viram milissegundos', () => {
  const v1 = { version: 1, perMode: { digits: { count: 9, seconds: 12, pace: 'total', group: 2 } } };
  const m = migrateSettings(v1);
  assert.equal(m.perMode.digits.exposureMs, 12000);
  assert.equal(m.perMode.digits.count, 9);
  assert.ok(!('seconds' in m.perMode.digits));
  assert.equal(m.version, DEFAULT_SETTINGS.version);
});

test('a contagem regressiva da v1 vira ajuste do intervalo', () => {
  assert.equal(migrateSettings({ version: 1, countdown: false }).interval.showCountdown, false);
  assert.equal(migrateSettings({ version: 1, countdown: true }).interval.showCountdown, true);
});

test('exposição salva fora dos limites é contida', () => {
  assert.equal(migrateSettings({ perMode: { digits: { exposureMs: 1 } } }).perMode.digits.exposureMs, 5);
  assert.equal(migrateSettings({ perMode: { digits: { exposureMs: 9e9 } } }).perMode.digits.exposureMs, 120000);
});

test('faixa de intervalo é normalizada (máximo nunca abaixo do mínimo)', () => {
  const m = migrateSettings({ interval: { mode: 'random', minMs: 9000, maxMs: 1000 } });
  assert.ok(m.interval.maxMs >= m.interval.minMs);
});

test('exposureOf entende registros antigos e novos', () => {
  assert.equal(exposureOf({ seconds: 10 }), 10000);
  assert.equal(exposureOf({ exposureMs: 50 }), 50);
  assert.equal(exposureOf(null), 0);
});

/* ------------------------------ histórico ------------------------------- */

group('Histórico');

const fakeSession = (mode, accuracy, count, when, perfectSeries = 0) => ({
  id: `${mode}-${when}`,
  mode,
  config: { count, exposureMs: 10000, pace: 'total', series: 10 },
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

test('o nível é a menor exposição com uma série perfeita', () => {
  const rec = (ms, perfectSeries) => ({
    id: `s${ms}`, mode: 'digits', config: { count: 5, exposureMs: ms },
    finishedAt: new Date(2025, 0, 1).toISOString(),
    totals: { accuracy: 0.8, correct: 8, total: 10, perfectSeries }, series: [],
  });
  const level = levelFrom([rec(10000, 3), rec(50, 0), rec(200, 1)]);
  assert.equal(level.exposureMs, 200, 'sessão sem série perfeita não conta');
  assert.equal(level.band.id, 'codificacao');
});

test('sem nenhuma série perfeita não há nível', () => {
  assert.equal(levelFrom([{ config: { exposureMs: 50 }, totals: { perfectSeries: 0 } }]), null);
});

test('statsFor expõe o nível junto das demais estatísticas', () => {
  const stats = statsFor([fakeSession('digits', 1, 8, 2024, 2)], 'digits');
  assert.ok(stats.level, 'deveria haver nível');
  assert.equal(stats.level.exposureMs, 10000);
});

test('importHistory rejeita conteúdo que não é lista', () => {
  assert.throws(() => importHistory({ oops: true }), /lista de sessões/);
});

/* -------------------------------- fecho --------------------------------- */

console.log(`\n${passed} testes passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
