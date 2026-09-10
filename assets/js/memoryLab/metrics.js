// MEMORY LAB — métricas do pipeline.
//
// Os 0–100 são PONTOS INTERNOS, nunca QI/percentil. O valor bruto e a amostra
// são parte obrigatória da leitura. A função retorna null quando não há dados
// suficientes em vez de preencher buracos com estimativas.

import { PIPELINE_COMPONENTS } from './config.js';

const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function confidenceForN(n) {
  if (n >= 30) return 'alta';
  if (n >= 12) return 'média';
  if (n >= 5) return 'baixa';
  return 'insuficiente';
}

function questionEvidence(trials, component) {
  const qs = trials.flatMap((t) => (t.perQuestion || []).map((q) => ({ ...q, trial: t })))
    .filter((q) => q.component === component);
  return qs;
}

function accuracyComponent(trials, component) {
  const q = questionEvidence(trials, component);
  if (!q.length) return { points: null, accuracy: null, n: 0, confidence: 'insuficiente' };
  const accuracy = mean(q.map((x) => x.correct));
  return { points: clamp100(accuracy * 100), accuracy, n: q.length, confidence: confidenceForN(q.length) };
}

/** Maior faixa de retenção com média >= 80% e pelo menos 2 observações. */
export function retentionEnvelope(trials, probes = []) {
  const samples = [
    ...trials.filter((t) => typeof t.retentionActualMs === 'number' && t.retentionActualMs >= 0)
      .map((t) => ({ delayMs: t.retentionActualMs, accuracy: t.accuracy })),
    ...probes.filter((p) => typeof p.delayMs === 'number' && typeof p.correct === 'number')
      .map((p) => ({ delayMs: p.delayMs, accuracy: p.correct })),
  ];
  if (!samples.length) return { t80: null, bins: [], n: 0 };
  const buckets = new Map();
  for (const s of samples) {
    // Delays longos não precisam de precisão de frame para esta curva.
    const bucket = s.delayMs < 2000 ? Math.round(s.delayMs / 250) * 250
      : s.delayMs < 10000 ? Math.round(s.delayMs / 1000) * 1000
        : Math.round(s.delayMs / 5000) * 5000;
    const b = buckets.get(bucket) || [];
    b.push(s.accuracy);
    buckets.set(bucket, b);
  }
  const bins = [...buckets.entries()].map(([delayMs, xs]) => ({ delayMs, accuracy: mean(xs), n: xs.length }))
    .sort((a, b) => a.delayMs - b.delayMs);
  const stable = bins.filter((b) => b.n >= 2 && b.accuracy >= 0.80);
  return { t80: stable.length ? stable[stable.length - 1].delayMs : null, bins, n: samples.length };
}

function retentionComponent(trials, probes) {
  const env = retentionEnvelope(trials, probes);
  if (!env.n) return { points: null, raw: 'sem dados', n: 0, confidence: 'insuficiente' };
  const all = [
    ...trials.filter((t) => typeof t.retentionActualMs === 'number').map((t) => t.accuracy),
    ...probes.filter((p) => typeof p.correct === 'number').map((p) => p.correct),
  ];
  const accuracy = mean(all) ?? 0;
  // Referência interna v1: 30 s representa o topo do componente de duração;
  // a precisão ainda pesa 70%. Não é uma escala biológica.
  const delayTerm = env.t80 === null ? 0 : Math.log1p(env.t80) / Math.log1p(30000);
  const points = clamp100((accuracy * 0.70 + Math.min(1, delayTerm) * 0.30) * 100);
  return {
    points,
    raw: `${Math.round(accuracy * 100)}% · T80 estável ${env.t80 === null ? '—' : formatDelay(env.t80)}`,
    accuracy,
    t80: env.t80,
    bins: env.bins,
    n: env.n,
    confidence: confidenceForN(env.n),
  };
}

function modeAccuracy(trials, mode) {
  const xs = trials.filter((t) => t.mode === mode && !t.invalid);
  if (!xs.length) return { points: null, accuracy: null, n: 0, confidence: 'insuficiente' };
  const accuracy = mean(xs.map((t) => t.accuracy));
  return { points: clamp100(accuracy * 100), accuracy, n: xs.length, confidence: confidenceForN(xs.length) };
}

function transferComponent(trials) {
  const holdout = trials.filter((t) => t.split === 'holdout' && t.mode === 'life-transfer');
  if (!holdout.length) return { points: null, raw: 'rode Life Transfer', n: 0, confidence: 'insuficiente' };
  const accuracy = mean(holdout.map((t) => t.accuracy));
  return {
    points: clamp100(accuracy * 100),
    raw: `${Math.round(accuracy * 100)}% em ${holdout.length} holdout${holdout.length === 1 ? '' : 's'}`,
    accuracy,
    n: holdout.length,
    confidence: confidenceForN(holdout.length),
  };
}

export function pipelineProfile(trials = [], probes = []) {
  const capture = accuracyComponent(trials, 'capture');
  const binding = accuracyComponent(trials, 'binding');
  const separation = modeAccuracy(trials, 'separation');
  const retention = retentionComponent(trials, probes);
  const interference = modeAccuracy(trials, 'interference');
  const reconstruction = accuracyComponent(trials, 'reconstruction');
  const transfer = transferComponent(trials);

  const values = { capture, binding, separation, retention, interference, reconstruction, transfer };
  const components = PIPELINE_COMPONENTS.map((c) => {
    const v = values[c.id];
    let raw = v.raw;
    if (!raw && v.accuracy !== null && v.accuracy !== undefined) raw = `${Math.round(v.accuracy * 100)}% · n=${v.n}`;
    if (!raw) raw = 'ainda sem evidência';
    return { ...c, ...v, raw };
  });

  const measured = components.filter((c) => c.points !== null);
  const bottleneck = measured.length ? measured.reduce((a, b) => (b.points < a.points ? b : a)) : null;
  return { components, measured: measured.length, bottleneck };
}

export function formatDelay(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0).replace('.', ',')} s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s ? `${s}s` : ''}`.trim();
}
