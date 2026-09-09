// Regressões da Retenção, Perfil de Processamento e integração temporal.

import assert from 'node:assert/strict';
import {
  advanceRetention, estimateRetentionT80, getRetentionReport, getRetentionTrials,
  initialRetentionState, planRetentionTrial, recordRetentionTrial, resetRetentionForTesting,
  setRetentionBackendForTesting, updateRetentionSettings,
} from '../assets/js/tryhard/retention.js';
import {
  processingProfile, recordBenchmarkProfile, setProcessingProfileBackendForTesting,
} from '../assets/js/tryhard/processingProfile.js';
import * as store from '../assets/js/tryhard/store.js';
import { createControl, runModuleBlock } from '../assets/js/tryhard/runner.js';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function memoryBackend() {
  return {
    store: new Map(),
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
    setItem(k, v) { this.store.set(k, v); },
  };
}

function fakeView() {
  let lastDelay = 0;
  return {
    setPhase() {}, setProgress() {}, setSessionProgress() {},
    showCountdown: async () => {},
    showFixation: async () => {},
    prepareStimulus: async (trial) => ({ trial }),
    presentStimulus: async (prepared, trial) => ({ requestedMs: trial.exposureMs, actualMs: trial.exposureMs, frames: 3 }),
    waitBlank: async (ms) => { lastDelay = ms; return { actualMs: ms + 0.4, aborted: false }; },
    showMask: async () => {},
    collectResponse: async (trial) => ({ items: [...trial.expected], reactionMs: 400 }),
    showFeedback: async () => {},
    showModuleSummary: async () => 'next',
    showInvalid: async () => {},
    watchInvalidation: () => ({ invalid: false, stop() {} }),
    get lastDelay() { return lastDelay; },
  };
}

console.log('\nRetenção — motor');

await test('modo fixo usa exatamente o intervalo configurado', () => {
  const s = { enabled: true, share: 1, mode: 'fixed', fixedDelayMs: 4000, minDelayMs: 250, maxDelayMs: 15000 };
  const plan = planRetentionTrial({ settings: s, state: initialRetentionState(s), rng: () => 0 });
  assert.equal(plan.active, true);
  assert.equal(plan.delayMs, 4000);
});

await test('modo faixa sorteia apenas dentro dos limites', () => {
  const s = { enabled: true, share: 1, mode: 'range', rangeMinMs: 2000, rangeMaxMs: 5000, minDelayMs: 250, maxDelayMs: 15000 };
  const low = planRetentionTrial({ settings: s, rng: () => 0 });
  const high = planRetentionTrial({ settings: s, rng: () => 0.999 });
  assert.ok(low.delayMs >= 2000 && low.delayMs <= 5000);
  assert.ok(high.delayMs >= 2000 && high.delayMs <= 5000);
  assert.ok(high.delayMs > low.delayMs);
});

await test('acerto alto alonga a escada adaptativa', () => {
  const s = { enabled: true, share: 1, mode: 'adaptive', initialDelayMs: 1000, minDelayMs: 250, maxDelayMs: 15000, targetAccuracy: 0.8 };
  let state = initialRetentionState(s);
  state.trialsSinceChange = 3;
  const trials = Array.from({ length: 6 }, () => ({ accuracy: 1, delayMs: 1000, actualDelayMs: 1000, invalid: false, warmup: false }));
  const next = advanceRetention(state, trials, s);
  assert.equal(next.changed, true);
  assert.equal(next.decision, 'longer');
  assert.ok(next.state.currentDelayMs > state.currentDelayMs);
});

await test('Retention T80 usa atraso real e encontra queda da curva', () => {
  const trials = [];
  for (const [delay, actual, acc] of [[500, 520, 1], [1000, 1020, .9], [2000, 2020, .82], [4000, 4020, .6]]) {
    for (let i = 0; i < 5; i++) trials.push({ delayMs: delay, actualDelayMs: actual, accuracy: acc, invalid: false, warmup: false });
  }
  const r = estimateRetentionT80(trials, .8);
  assert.ok(r.t80 > 2000 && r.t80 < 4000, `T80 inesperado: ${r.t80}`);
});

console.log('\nRetenção — integração');

await test('retention trial não entra no log de Availability', async () => {
  store.setBackendForTesting(memoryBackend());
  setRetentionBackendForTesting(memoryBackend());
  resetRetentionForTesting();
  store.updateAvailabilitySettings({ enabled: true, preset: 'max' });
  updateRetentionSettings({ enabled: true, share: 1, mode: 'fixed', fixedDelayMs: 2000 });

  const view = fakeView();
  const summary = await runModuleBlock(
    { moduleId: 'partial-report', trials: 3, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
    view, createControl(), { seed: 991 },
  );
  assert.ok(summary.retention?.trials > 0, 'o bloco não registrou retenção');
  assert.equal(store.getAvailabilityTrials('matrices').length, 0, 'retenção contaminou Availability');
  assert.ok(getRetentionTrials('matrices').length > 0);
  assert.ok(view.lastDelay >= 2000);
});

console.log('\nPerfil de Processamento');

await test('perfil tem exatamente sete componentes e não inventa dados', () => {
  store.setBackendForTesting(memoryBackend());
  setRetentionBackendForTesting(memoryBackend());
  resetRetentionForTesting();
  setProcessingProfileBackendForTesting(memoryBackend());
  const p = processingProfile();
  assert.equal(p.components.length, 7);
  assert.equal(p.components.filter((c) => c.points !== null).length, 0);
});

await test('Daily Benchmark alimenta os quatro subscores perceptivos', () => {
  store.setBackendForTesting(memoryBackend());
  setRetentionBackendForTesting(memoryBackend());
  resetRetentionForTesting();
  setProcessingProfileBackendForTesting(memoryBackend());
  const blocks = ['sequence', 'matrix', 'symbols', 'readout'];
  recordBenchmarkProfile({
    protocolVersion: 1,
    completedAt: new Date().toISOString(),
    trials: blocks.flatMap((block) => Array.from({ length: 5 }, () => ({
      block, protocolVersion: 1, correctItems: 4, totalItems: 5, accuracy: .8,
      actualExposureMs: 150, requestedExposureMs: 150, rows: 3, cols: 3, cueDelayMs: 50,
    }))),
  });
  const p = processingProfile();
  const firstFour = p.components.slice(0, 4);
  assert.ok(firstFour.every((c) => c.points === 80));
  assert.equal(p.measured, 4);
});

await test('retenção persiste em storage separado', () => {
  setRetentionBackendForTesting(memoryBackend());
  resetRetentionForTesting();
  updateRetentionSettings({ enabled: true, mode: 'fixed', fixedDelayMs: 3000 });
  recordRetentionTrial({
    timestamp: new Date().toISOString(), moduleId: 'partial-report', category: 'matrices',
    delayMs: 3000, actualDelayMs: 3010, accuracy: 1, exposureMs: 150, retrievalMs: 400,
    mode: 'fixed', warmup: false, invalid: false,
  });
  assert.equal(getRetentionTrials('matrices').length, 1);
  assert.equal(getRetentionReport().settings.enabled, true);
});

console.log(`\n${passed} testes de retenção/perfil passaram.`);
