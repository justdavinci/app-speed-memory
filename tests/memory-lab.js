import assert from 'node:assert/strict';
import { LITERATURE_SEED, datasetStats, validateDataset } from '../assets/js/memoryLab/dataset.js';
import { importCorpusPack, allCorpusStimuli, setCorpusBackendForTesting } from '../assets/js/memoryLab/corpus.js';
import {
  adaptAfterTrial, createMemoryTrial, markTrialExposure, scheduleDeferredFromTrial,
} from '../assets/js/memoryLab/engine.js';
import { pipelineProfile, retentionEnvelope } from '../assets/js/memoryLab/metrics.js';
import { questionBankFor } from '../assets/js/memoryLab/questions.js';
import * as store from '../assets/js/memoryLab/store.js';

let passed = 0;
const test = (name, fn) => {
  fn(); passed += 1; console.log(`  ok  ${name}`);
};

function freshBackends() {
  store.setMemoryLabBackendForTesting();
  store.resetMemoryLabForTesting();
  setCorpusBackendForTesting();
}

function fakeRecord(over = {}) {
  return {
    id: `x-${Math.random()}`,
    timestamp: new Date().toISOString(),
    mode: 'one-shot',
    component: 'capture', components: ['capture'], split: 'train',
    stimulusId: 'fake', source: 'fake', oneShotValid: true,
    measurementEligible: true, benchmark: false,
    requestedExposureMs: 1700, actualExposureMs: 1700,
    retentionRequestedMs: 1500, retentionActualMs: 1500,
    correct: 1, total: 1, accuracy: 1,
    perQuestion: [{ questionId: 'q', type: 'anchor', component: 'capture', correct: 1 }],
    invalid: false,
    ...over,
  };
}

console.log('\nMemory Lab — corpus');

test('seed real tem 18 unidades e split 12/3/3', () => {
  const stats = datasetStats();
  assert.equal(stats.total, 18);
  assert.equal(stats.train, 12);
  assert.equal(stats.novel, 3);
  assert.equal(stats.holdout, 3);
  assert.equal(validateDataset(LITERATURE_SEED).length, 0);
});

test('pack privado page-only gera banco de perguntas sem inventar resumo', () => {
  freshBackends();
  const pack = importCorpusPack({
    id: 'private-test', label: 'Teste privado', stimuli: [{
      id: 'private-page-1', split: 'train', source: 'manual real', title: 'Página real',
      blocks: ['Primeiro bloco com Alfa.', 'Segundo bloco com Beta.'],
      anchors: [{ text: 'Alfa', block: 0 }, { text: 'Beta', block: 1 }],
    }],
  });
  assert.equal(pack.stimuli.length, 1);
  const imported = allCorpusStimuli().find((s) => s.id === 'private-page-1');
  const bank = questionBankFor(imported, () => 0.4);
  assert.equal(bank.some((q) => q.type === 'semantic'), false);
  assert.equal(bank.some((q) => q.type === 'anchor'), true);
  assert.equal(bank.some((q) => q.type === 'structure'), true);
  assert.equal(bank.some((q) => q.type === 'spatial'), true);
});

console.log('\nMemory Lab — One Shot');

test('uma unidade exposta não volta ao pool One Shot fresco', () => {
  freshBackends();
  const first = createMemoryTrial({ mode: 'one-shot', seed: 123 });
  assert.ok(first.target);
  markTrialExposure(first, { actualMs: first.exposureMs });
  const second = createMemoryTrial({ mode: 'one-shot', seed: 123 });
  assert.ok(second.target);
  assert.notEqual(second.target.id, first.target.id);
});

test('Life Transfer consome apenas holdout e não o reutiliza', () => {
  freshBackends();
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    const t = createMemoryTrial({ mode: 'life-transfer', seed: 900 + i });
    assert.equal(t.split, 'holdout');
    assert.equal(t.target.split, 'holdout');
    assert.equal(used.has(t.target.id), false);
    used.add(t.target.id);
    markTrialExposure(t, { actualMs: t.exposureMs });
  }
  const exhausted = createMemoryTrial({ mode: 'life-transfer', seed: 999 });
  assert.equal(exhausted.exhausted, true);
});

test('depois da primeira medida, drill de componente prefere material já visto', () => {
  freshBackends();
  const first = createMemoryTrial({ mode: 'binding', seed: 77 });
  markTrialExposure(first, { actualMs: first.exposureMs });
  store.recordTrial(fakeRecord({ mode: 'binding', stimulusId: first.target.id, component: 'binding', components: ['binding'], perQuestion: [{ questionId: 'b', type: 'binding', component: 'binding', correct: 1 }] }));
  const second = createMemoryTrial({ mode: 'binding', seed: 78 });
  assert.equal(store.isSeen(second.target.id), true);
});

test('probes tardios usam questões não cobradas na recuperação imediata', () => {
  freshBackends();
  const trial = createMemoryTrial({ mode: 'one-shot', seed: 321 });
  markTrialExposure(trial, { actualMs: trial.exposureMs });
  const immediate = new Set(trial.questions.map((q) => q.id));
  const added = scheduleDeferredFromTrial(trial, 1_000_000);
  assert.ok(added >= 1);
  for (const probe of store.getPendingProbes()) assert.equal(immediate.has(probe.questionId), false);
});

console.log('\nMemory Lab — adaptação');

test('adaptação aperta somente um eixo por mudança', () => {
  freshBackends();
  for (let i = 0; i < 6; i++) store.recordTrial(fakeRecord({ id: `a${i}`, accuracy: 1 }));
  const before = store.getSkill('one-shot');
  adaptAfterTrial('one-shot', fakeRecord());
  adaptAfterTrial('one-shot', fakeRecord());
  const after = adaptAfterTrial('one-shot', fakeRecord());
  const exposureChanged = after.exposureMs !== before.exposureMs;
  const retentionChanged = after.retentionMs !== before.retentionMs;
  assert.notEqual(exposureChanged, retentionChanged, 'exatamente um eixo deve mudar');
  if (exposureChanged) assert.ok(after.exposureMs < before.exposureMs);
  if (retentionChanged) assert.ok(after.retentionMs > before.retentionMs);
});

console.log('\nMemory Lab — perfil');

test('perfil tem exatamente sete componentes', () => {
  const profile = pipelineProfile([], []);
  assert.equal(profile.components.length, 7);
  assert.deepEqual(profile.components.map((c) => c.id), [
    'capture', 'binding', 'separation', 'retention', 'interference', 'reconstruction', 'transfer',
  ]);
});

test('repetição não infla pontos de primeira exposição', () => {
  const eligible = fakeRecord({ perQuestion: [{ questionId: 'q1', type: 'anchor', component: 'capture', correct: 1 }] });
  const repeat = fakeRecord({ id: 'repeat', oneShotValid: false, measurementEligible: false, accuracy: 0, correct: 0, perQuestion: [{ questionId: 'q2', type: 'anchor', component: 'capture', correct: 0 }] });
  const profile = pipelineProfile([eligible, repeat], []);
  assert.equal(profile.components.find((c) => c.id === 'capture').points, 100);
});

test('retenção pura exclui interferência e usa idade real do probe', () => {
  const blank1 = fakeRecord({ id: 'r1', retentionActualMs: 1000, accuracy: 1 });
  const blank2 = fakeRecord({ id: 'r2', retentionActualMs: 1000, accuracy: 1 });
  const interference = fakeRecord({ id: 'ri', mode: 'interference', retentionActualMs: 10000, accuracy: 0 });
  const probes = [
    { delayMs: 300000, actualAgeMs: 360000, correct: 1 },
    { delayMs: 300000, actualAgeMs: 360100, correct: 1 },
  ];
  const env = retentionEnvelope([blank1, blank2, interference], probes);
  assert.equal(env.bins.some((b) => b.delayMs === 10000), false);
  assert.equal(env.bins.some((b) => b.delayMs === 360000), true);
  assert.equal(env.t80, 360000);
});

console.log(`\n${passed} testes do Memory Lab passaram.`);
