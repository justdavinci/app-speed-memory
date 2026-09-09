// Regressões introduzidas pela auditoria de mensuração cognitiva v2.
// Rodar depois da suíte principal: `node tests/audit-v2.js`.

import assert from 'node:assert/strict';
import { seeded } from '../assets/js/tryhard/rng.js';
import { createNoveltyState, noteUse, pickTemplate } from '../assets/js/tryhard/transfer/novelty.js';
import { splitTrials, transferGap } from '../assets/js/tryhard/transfer/metrics.js';
import { binByDelay, fitCurve, thresholdFrom } from '../assets/js/tryhard/availability/threshold.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

const sampleTransfer = (over = {}) => ({
  familyId: 'structured-info',
  templateId: 'precos',
  tier: 2,
  novel: false,
  holdout: false,
  mode: 'training',
  accuracy: 0.9,
  exposureMs: 300,
  queryComplexity: 2,
  invalid: false,
  ...over,
});

console.log('\nAuditoria v2 — holdout');

test('training explícito nunca sorteia holdout', () => {
  const rng = seeded(1201);
  const state = createNoveltyState();
  const trained = new Set();
  for (let i = 0; i < 500; i++) {
    const p = pickTemplate({ tier: 6, rng, state, trainedKeys: trained, noveltyRate: 0.7, mode: 'training' });
    assert.equal(p.holdout, false, `holdout vazou no treino: ${p.key}`);
    trained.add(p.key);
    noteUse(state, { key: p.key });
  }
});

test('Modo Caos também nunca sorteia holdout', () => {
  const rng = seeded(1202);
  const state = createNoveltyState();
  for (let i = 0; i < 300; i++) {
    const p = pickTemplate({ tier: 6, rng, state, trainedKeys: [], noveltyRate: 1, mode: 'chaos' });
    assert.equal(p.holdout, false, `holdout vazou no caos: ${p.key}`);
    noteUse(state, { key: p.key });
  }
});

test('validation usa somente holdout', () => {
  const rng = seeded(1203);
  const state = createNoveltyState();
  for (let i = 0; i < 80; i++) {
    const p = pickTemplate({ tier: 5, rng, state, trainedKeys: [], mode: 'validation' });
    assert.equal(p.holdout, true, `validação usou material treinável: ${p.key}`);
    noteUse(state, { key: p.key });
  }
});

console.log('\nAuditoria v2 — Transfer Gap');

test('holdout de benchmark não entra no lado adaptativo', () => {
  const trials = [
    ...Array.from({ length: 8 }, () => sampleTransfer()),
    ...Array.from({ length: 8 }, () => sampleTransfer({ novel: true, accuracy: 0.7 })),
    ...Array.from({ length: 20 }, () => sampleTransfer({ novel: true, holdout: true, mode: 'benchmark', accuracy: 0.1 })),
  ];
  const split = splitTrials(trials);
  assert.equal(split.trainingNovel.length, 8);
  assert.equal(split.holdout.length, 20);
  assert.equal(transferGap(trials), 0.2);
});

test('dificuldade incompatível não vira falsa lacuna', () => {
  const trained = Array.from({ length: 10 }, () => sampleTransfer({ exposureMs: 300, accuracy: 0.9 }));
  const novelHarder = Array.from({ length: 10 }, () => sampleTransfer({ novel: true, exposureMs: 100, accuracy: 0.4 }));
  assert.equal(transferGap([...trained, ...novelHarder]), null);

  const novelMatched = Array.from({ length: 10 }, () => sampleTransfer({ novel: true, exposureMs: 300, accuracy: 0.6 }));
  assert.equal(transferGap([...trained, ...novelMatched]), 0.3);
});

console.log('\nAuditoria v2 — T80');

test('curva usa atraso real quando disponível', () => {
  const bins = binByDelay([
    { delayMs: 100, actualDelayMs: 116.7, accuracy: 1 },
    { delayMs: 100, actualDelayMs: 116.5, accuracy: 0 },
    { delayMs: 200, actualDelayMs: 199.8, accuracy: 1 },
  ]);
  assert.deepEqual(bins.map((b) => b.delayMs), [117, 200]);
  assert.equal(bins[0].accuracy, 0.5);
});

test('T80 relativo respeita piso de acaso', () => {
  const fit = fitCurve([
    { delayMs: 60, accuracy: 0.28, trials: 20 },
    { delayMs: 120, accuracy: 0.48, trials: 20 },
    { delayMs: 200, accuracy: 0.75, trials: 20 },
    { delayMs: 320, accuracy: 0.90, trials: 20 },
  ], 0.92, { chanceFloor: 0.25 });
  assert.ok(fit);
  assert.equal(fit.gamma, 0.25);
  const expected = fit.m + fit.k * Math.log(4);
  assert.ok(Math.abs(thresholdFrom(fit, 0.8) - expected) < 1e-9);
});

console.log(`\n${passed} testes de auditoria v2 passaram.`);
