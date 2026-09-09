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
  DEFAULT_SETTINGS, exposureOf, importHistory, levelFrom, levelsByMode, migrateSettings,
  statsFor, testLevels,
} from '../assets/js/storage.js';
import {
  BAND_SCALES, DIGIT_BANDS, EXPOSURE_STEPS, MIN_EXPOSURE_MS, WORD_BANDS,
  averageLevel, basisFor, bandIn, classify, formatExposure, formatLevel, levelOf,
  scaleForMode, stepIndexFor,
} from '../assets/js/perception.js';
import {
  TEST, accuracyByExposure, createStaircase, currentBasis, currentCount, currentExposure,
  finishTest, nextInterval, recordTrial, spanReached,
} from '../assets/js/adaptive.js';

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

/* ------------------------ resposta sem ordem ---------------------------- */

group('Correção sem ordem obrigatória');

const semOrdem = { ordered: false };

test('palavras fora de ordem valem quando a ordem é livre', () => {
  const r = scoreSeries('words', ['casa', 'pipa', 'vela'], ['vela', 'casa', 'pipa'], semOrdem);
  assert.equal(r.correct, 3);
  assert.ok(r.perfect);
});

test('as mesmas palavras fora de ordem erram quando a ordem conta', () => {
  const r = scoreSeries('words', ['casa', 'pipa', 'vela'], ['vela', 'casa', 'pipa']);
  assert.equal(r.correct, 0);
});

test('repetir a mesma palavra não rende dois acertos', () => {
  const r = scoreSeries('words', ['casa', 'pipa'], ['casa', 'casa'], semOrdem);
  assert.equal(r.correct, 1);
  assert.deepEqual(r.extra, ['casa']);
  assert.ok(!r.perfect);
});

test('sem ordem, o que não apareceu conta como faltando', () => {
  const r = scoreSeries('words', ['casa', 'pipa'], ['pipa'], semOrdem);
  assert.equal(r.correct, 1);
  assert.ok(r.cells.find((c) => c.expected === 'casa').missing);
});

test('sem ordem, sobra de palavra impede o "perfeito"', () => {
  const r = scoreSeries('words', ['casa'], ['casa', 'pipa'], semOrdem);
  assert.equal(r.correct, 1);
  assert.ok(!r.perfect);
});

test('acentuação flexível continua valendo sem ordem', () => {
  const r = scoreSeries('words', ['coração', 'pipa'], ['pipa', 'coracao'], semOrdem);
  assert.ok(r.perfect);
});

/* -------------------------- teste adaptativo ---------------------------- */

group('Teste adaptativo de velocidade');

/**
 * Pessoa simulada com dois limites: um de tempo (na régua da carga de
 * referência) e um de memória (quantos itens consegue segurar).
 */
function simulate({ thresholdMs, span = 99, mode = 'digits', floorMs = 17, rnd = Math.random }) {
  const st = createStaircase({ mode, floorMs });
  while (!st.done) {
    const basis = currentBasis(st);
    const pTempo = 1 / (1 + Math.exp(-(Math.log(basis) - Math.log(thresholdMs)) * 3));
    const pSpan = st.count <= span ? 1 : Math.pow(0.3, st.count - span);
    const perfect = rnd() < pTempo * pSpan;
    recordTrial(st, { perfect, correct: perfect ? st.count : 1, total: st.count });
  }
  return finishTest(st);
}

test('o teste nunca passa de 30 séries', () => {
  for (let i = 0; i < 30; i++) {
    assert.ok(simulate({ thresholdMs: 80, span: 6 }).trials <= TEST.maxTrials);
  }
});

test('a escada alterna tempo e quantidade a cada passo', () => {
  const st = createStaircase({ mode: 'digits', floorMs: 17 });
  const passos = [];
  for (let i = 0; i < 8; i++) {
    passos.push({ count: currentCount(st), ms: currentExposure(st) });
    recordTrial(st, { perfect: true, correct: st.count, total: st.count });
  }
  const mudouTempo = passos.some((p, i) => i > 0 && p.ms !== passos[i - 1].ms);
  const mudouQuantidade = passos.some((p, i) => i > 0 && p.count !== passos[i - 1].count);
  assert.ok(mudouTempo, 'o tempo deveria encurtar');
  assert.ok(mudouQuantidade, 'a quantidade deveria crescer');
});

test('duas séries certas sobem a dificuldade; uma errada desce', () => {
  const st = createStaircase({ mode: 'digits', floorMs: 5 });
  const inicio = currentBasis(st);
  recordTrial(st, { perfect: true, correct: 4, total: 4 });
  assert.equal(currentBasis(st), inicio, 'uma só não deveria mexer na escada');
  recordTrial(st, { perfect: true, correct: 4, total: 4 });
  assert.ok(currentBasis(st) < inicio, 'duas seguidas deveriam dificultar');
  const dificil = currentBasis(st);
  recordTrial(st, { perfect: false, correct: 1, total: 4 });
  assert.ok(currentBasis(st) > dificil, 'errar deveria facilitar');
});

test('quem acerta tudo ganha itens em vez de travar no piso da tela', () => {
  const st = createStaircase({ mode: 'digits', floorMs: 17 });
  while (!st.done) recordTrial(st, { perfect: true, correct: st.count, total: st.count });
  const r = finishTest(st);
  assert.ok(r.finalCount > TEST.itemCount.digits, `a quantidade deveria crescer, ficou em ${r.finalCount}`);
  assert.ok(r.span >= r.finalCount - 1);
  assert.equal(r.quality, 'invicto');
});

test('a escada respeita o piso da tela e o teto de itens', () => {
  const st = createStaircase({ mode: 'digits', floorMs: 17 });
  for (let i = 0; i < 200; i++) recordTrial(st, { perfect: true, correct: st.count, total: st.count });
  assert.ok(st.steps[0] >= 17, 'nenhum degrau abaixo de um quadro da tela');
  assert.ok(currentCount(st) <= TEST.maxCount.digits);
  assert.ok(currentExposure(st) >= 17);
});

test('quem erra tudo para no tempo mais longo e na menor quantidade', () => {
  const st = createStaircase({ mode: 'digits', floorMs: 17 });
  while (!st.done) recordTrial(st, { perfect: false, correct: 0, total: st.count });
  const r = finishTest(st);
  assert.equal(r.quality, 'teto');
  assert.equal(r.finalCount, TEST.minCount.digits);
  assert.equal(r.level, 1);
});

test('limiares de tempo diferentes produzem estimativas separadas', () => {
  const mediana = (thresholdMs) => {
    const xs = Array.from({ length: 31 }, () => simulate({ thresholdMs, span: 8 }).basisMs)
      .sort((a, b) => a - b);
    return xs[15];
  };
  assert.ok(mediana(400) > mediana(40) * 2, 'as estimativas deveriam se separar claramente');
});

test('memória curta aparece como quantidade menor alcançada', () => {
  const mediana = (span) => {
    const xs = Array.from({ length: 21 }, () => simulate({ thresholdMs: 60, span }).span)
      .sort((a, b) => a - b);
    return xs[10];
  };
  assert.ok(mediana(8) > mediana(4), 'quem segura mais itens deveria chegar mais longe');
});

test('cada tipo de teste usa a sua régua, o seu teto e a sua carga', () => {
  const digitos = createStaircase({ mode: 'digits', floorMs: 17 });
  const palavras = createStaircase({ mode: 'words', floorMs: 17 });
  assert.equal(digitos.ceilingMs, TEST.ceilingMs.digits);
  assert.equal(palavras.ceilingMs, TEST.ceilingMs.words);
  assert.ok(currentExposure(palavras) > currentExposure(digitos), 'palavras começam mais devagar');
  assert.equal(currentCount(digitos), 4);
  assert.equal(currentCount(palavras), 3);

  while (!palavras.done) recordTrial(palavras, { perfect: false, correct: 0, total: palavras.count });
  const r = finishTest(palavras);
  assert.equal(r.scaleId, 'words');
  assert.equal(r.refCount, 1);
  assert.equal(r.band.id, WORD_BANDS[WORD_BANDS.length - 1].id);
});

test('o teste de dígitos reporta o tempo na carga de 4 dígitos', () => {
  const st = createStaircase({ mode: 'digits', floorMs: 17 });
  while (!st.done) recordTrial(st, { perfect: false, correct: 0, total: st.count });
  const r = finishTest(st);
  assert.equal(r.scaleId, 'digits');
  assert.equal(r.refCount, 4);
  assert.equal(r.band.id, DIGIT_BANDS[DIGIT_BANDS.length - 1].id);
});

test('o nível fica dentro da escala de 7 faixas', () => {
  for (const alvo of [20, 60, 150, 400, 1500]) {
    const r = simulate({ thresholdMs: alvo, span: 7 });
    assert.ok(r.level >= 1 && r.level <= 7, `nível fora da escala: ${r.level}`);
    assert.equal(r.levels, 7);
  }
});

test('a curva agrupa por quantidade e tempo, da série mais fácil à mais difícil', () => {
  const curva = accuracyByExposure([
    { exposureMs: 100, count: 4, basisMs: 100, perfect: true, accuracy: 1 },
    { exposureMs: 100, count: 4, basisMs: 100, perfect: false, accuracy: 0.5 },
    { exposureMs: 100, count: 8, basisMs: 50, perfect: true, accuracy: 1 },
  ]);
  assert.equal(curva.length, 2, 'mesma exposição com quantidades diferentes são linhas distintas');
  assert.equal(curva[0].basisMs, 100, 'a mais fácil vem primeiro');
  assert.equal(curva[0].trials, 2);
  assert.equal(curva[0].accuracy, 0.75);
  assert.equal(curva[1].count, 8);
});

test('spanReached é a maior quantidade acertada por inteiro', () => {
  assert.equal(spanReached([
    { count: 4, perfect: true }, { count: 6, perfect: false }, { count: 5, perfect: true },
  ]), 5);
  assert.equal(spanReached([{ count: 4, perfect: false }]), 0);
});

test('a espera entre séries do teste é sorteada dentro da faixa', () => {
  for (let i = 0; i < 200; i++) {
    const ms = nextInterval();
    assert.ok(ms >= TEST.intervalMinMs && ms <= TEST.intervalMaxMs);
  }
});

test('o teste guarda séries, viradas e a data', () => {
  const r = simulate({ thresholdMs: 80, span: 6 });
  assert.equal(r.trials, r.curve.reduce((a, c) => a + c.trials, 0));
  assert.ok(r.reversals >= 0);
  assert.ok(r.finishedAt);
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

test('a régua dos dígitos cobre toda a escala, do limiar ao tempo livre', () => {
  const scale = BAND_SCALES.digits;
  for (const ms of EXPOSURE_STEPS) assert.ok(bandIn(scale, ms), `sem faixa para ${ms} ms`);
  assert.equal(bandIn(scale, 5).id, 'relampago');
  assert.equal(bandIn(scale, 10).id, 'relampago');
  assert.equal(bandIn(scale, 11).id, 'faisca');
  assert.equal(bandIn(scale, 50).id, 'flash');
  assert.equal(bandIn(scale, 100).id, 'piscada');
  assert.equal(bandIn(scale, 200).id, 'olhada');
  assert.equal(bandIn(scale, 500).id, 'vista');
  assert.equal(bandIn(scale, 10000).id, 'sempressa');
});

test('a régua das palavras cobre toda a escala, por palavra', () => {
  const scale = BAND_SCALES.words;
  for (const ms of EXPOSURE_STEPS) assert.ok(bandIn(scale, ms), `sem faixa para ${ms} ms`);
  assert.equal(bandIn(scale, 30).id, 'relampago');
  assert.equal(bandIn(scale, 60).id, 'faisca');
  assert.equal(bandIn(scale, 100).id, 'flash');
  assert.equal(bandIn(scale, 170).id, 'piscada');
  assert.equal(bandIn(scale, 250).id, 'olhada');
  assert.equal(bandIn(scale, 400).id, 'vista');
  assert.equal(bandIn(scale, 1000).id, 'sempressa');
});

test('as duas réguas têm 7 níveis e limites crescentes', () => {
  for (const scale of [BAND_SCALES.digits, BAND_SCALES.words]) {
    assert.equal(scale.bands.length, 7);
    for (let i = 1; i < scale.bands.length; i++) {
      assert.ok(scale.bands[i].max > scale.bands[i - 1].max, `${scale.id}: limites fora de ordem`);
    }
    assert.equal(levelOf(scale, scale.bands[0]), 7, 'a faixa mais rápida é o nível 7');
    assert.equal(levelOf(scale, scale.bands[6]), 1, 'a faixa mais lenta é o nível 1');
  }
});

test('cada régua converte o tempo para a sua carga de referência', () => {
  assert.equal(scaleForMode('digits').id, 'digits');
  assert.equal(scaleForMode('words').id, 'words');
  assert.equal(scaleForMode('sentence').id, 'words', 'frase também é estímulo verbal');
  assert.equal(basisFor('digits', 600, 4), 600, '4 dígitos é a carga de referência');
  assert.equal(basisFor('digits', 100, 8), 50, '8 dígitos em 100 ms = 4 dígitos em 50 ms');
  assert.equal(basisFor('words', 600, 3), 200);
  assert.equal(basisFor('sentence', 800, 8), 100);
});

test('quantidade e tempo entram na mesma conta', () => {
  const a = classify('digits', 50, 4);
  const b = classify('digits', 100, 8);
  assert.equal(a.basisMs, b.basisMs);
  assert.equal(a.level, b.level, 'dobrar itens e tempo mantém o nível');
});

test('o mesmo tempo cai em níveis diferentes conforme o estímulo', () => {
  const digitos = classify('digits', 600, 4);
  const palavras = classify('words', 600, 3);
  assert.equal(digitos.basisMs, 600);
  assert.equal(palavras.basisMs, 200);
  assert.notEqual(digitos.band.id, palavras.band.id);
  assert.equal(digitos.scale.id, 'digits');
  assert.equal(palavras.scale.id, 'words');
});

test('mais palavras no mesmo tempo total significam menos tempo por palavra', () => {
  const poucas = classify('words', 1500, 3);
  const muitas = classify('words', 1500, 10);
  assert.ok(muitas.basisMs < poucas.basisMs);
  assert.ok(muitas.level >= poucas.level, 'mais palavras no mesmo tempo é mais difícil');
});

test('a média só existe com os dois tipos e fica entre eles', () => {
  assert.equal(averageLevel([{ level: 6 }, { level: 4 }]), 5);
  assert.equal(averageLevel([{ level: 6 }, { level: 5 }]), 5.5);
  assert.equal(averageLevel([{ level: 6 }, null]), null, 'faltando um tipo, não há média');
  assert.equal(averageLevel([]), null);
});

test('formatLevel usa vírgula e omite casa decimal inteira', () => {
  assert.equal(formatLevel(5), '5');
  assert.equal(formatLevel(5.5), '5,5');
  assert.equal(formatLevel(null), '—');
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
  assert.equal(level.band.id, 'olhada');
});

test('sem nenhuma série perfeita não há nível', () => {
  assert.equal(levelFrom([{ config: { exposureMs: 50 }, totals: { perfectSeries: 0 } }]), null);
});

test('statsFor expõe o nível junto das demais estatísticas', () => {
  const stats = statsFor([fakeSession('digits', 1, 8, 2024, 2)], 'digits');
  assert.ok(stats.level, 'deveria haver nível');
  assert.equal(stats.level.exposureMs, 10000);
});

test('cada modo é classificado na sua própria régua', () => {
  const sess = (mode, ms, count, perfect, day) => ({
    id: `${mode}${day}`, mode, config: { count, exposureMs: ms },
    finishedAt: new Date(2026, 0, day).toISOString(),
    totals: { accuracy: 0.9, correct: 9, total: 10, perfectSeries: perfect }, series: [],
  });
  const history = [
    sess('digits', 80, 4, 2, 1),
    sess('digits', 40, 4, 0, 2),   // sem série perfeita: não conta
    sess('words', 900, 5, 1, 3),
    sess('sentence', 4000, 8, 1, 4),
  ];
  const levels = levelsByMode(history);
  assert.equal(levels.digits.basisMs, 80, 'dígitos com a carga de referência batem o tempo total');
  assert.equal(levels.words.basisMs, 180, 'palavras comparam o tempo por palavra');
  assert.equal(levels.sentence.basisMs, 500);
  assert.equal(levels.digits.scale.id, 'digits');
  assert.equal(levels.words.scale.id, 'words');
});

test('a média do histórico combina dígitos e palavras, sem as frases', () => {
  const sess = (mode, ms, count, day) => ({
    id: `${mode}${day}`, mode, config: { count, exposureMs: ms },
    finishedAt: new Date(2026, 0, day).toISOString(),
    totals: { accuracy: 1, correct: 10, total: 10, perfectSeries: 1 }, series: [],
  });
  const comAmbos = levelsByMode([sess('digits', 80, 4, 1), sess('words', 900, 5, 2)]);
  assert.equal(comAmbos.average, (comAmbos.digits.level + comAmbos.words.level) / 2);

  const soDigitos = levelsByMode([sess('digits', 80, 4, 1)]);
  assert.equal(soDigitos.average, null);

  const semPalavras = levelsByMode([sess('digits', 80, 4, 1), sess('sentence', 4000, 8, 2)]);
  assert.equal(semPalavras.average, null, 'frases não substituem o teste de palavras');
});

test('levelFrom escolhe o menor valor na régua do modo, não o menor tempo total', () => {
  const sess = (mode, ms, count, day) => ({
    id: `${mode}${day}`, mode, config: { count, exposureMs: ms },
    finishedAt: new Date(2026, 0, day).toISOString(),
    totals: { accuracy: 1, correct: 10, total: 10, perfectSeries: 1 }, series: [],
  });
  // 1000 ms para 10 palavras (100 ms/palavra) é melhor que 600 ms para 3 (200 ms/palavra)
  const level = levelFrom([sess('words', 600, 3, 1), sess('words', 1000, 10, 2)], 'words');
  assert.equal(level.basisMs, 100);
  assert.equal(level.exposureMs, 1000);
});

test('testLevels pega o teste mais recente de cada tipo e a média', () => {
  const t = (mode, level, id) => ({ id, mode, level, basisMs: 100 });
  const levels = testLevels([t('digits', 6, 'a'), t('words', 3, 'b'), t('digits', 4, 'c')]);
  assert.equal(levels.digits.level, 4, 'o mais recente, não o melhor');
  assert.equal(levels.words.level, 3);
  assert.equal(levels.average, 3.5);
  assert.equal(testLevels([t('digits', 6, 'a')]).average, null);
});

test('importHistory rejeita conteúdo que não é lista', () => {
  assert.throws(() => importHistory({ oops: true }), /lista de sessões/);
});

/* ------------------------------- Try Hard ------------------------------- */

const tryhard = await import('./tryhard.js');
tryhard.register({ test, group, assert });

/* -------------------------------- fecho --------------------------------- */

console.log(`\n${passed} testes passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
