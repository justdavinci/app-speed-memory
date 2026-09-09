// PERFIL DE PROCESSAMENTO — no máximo sete subscores funcionais.
//
// Estes pontos NÃO são QI nem percentis populacionais. São uma escala interna
// 0–100 para resumir protocolos do próprio app e ajudar a localizar gargalos.
// Sempre mostramos junto o dado bruto e a confiança para o número não parecer
// mais preciso do que realmente é.

import * as store from './store.js';
import { getRetentionReport, retentionPoints } from './retention.js';

const PROFILE_KEY = 'speedmemory.processing-profile.v1';
const profileMemory = new Map();
let profileBackend = {
  getItem(k) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) return v;
    } catch (_) { /* ignore */ }
    return profileMemory.get(k) ?? null;
  },
  setItem(k, v) {
    profileMemory.set(k, v);
    try { localStorage.setItem(k, v); } catch (_) { /* ignore */ }
  },
};

const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));
const pct = (v) => `${Math.round(v * 100)}%`;
const ms = (v) => (v === null || v === undefined ? '—' : v >= 1000
  ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',')} s`
  : `${Math.round(v)} ms`);

function readProfileStore() {
  const raw = profileBackend.getItem(PROFILE_KEY);
  if (!raw) return { benchmarkRuns: [] };
  try {
    const parsed = JSON.parse(raw);
    return { benchmarkRuns: Array.isArray(parsed.benchmarkRuns) ? parsed.benchmarkRuns : [] };
  } catch (_) {
    return { benchmarkRuns: [] };
  }
}

function writeProfileStore(data) {
  profileBackend.setItem(PROFILE_KEY, JSON.stringify(data));
}

export function setProcessingProfileBackendForTesting(custom) {
  profileBackend = custom || {
    store: new Map(),
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
    setItem(k, v) { this.store.set(k, v); },
  };
}

/** Guarda a evidência fixa dos quatro blocos do Daily Benchmark. */
export function recordBenchmarkProfile(run) {
  const data = readProfileStore();
  data.benchmarkRuns.push(run);
  if (data.benchmarkRuns.length > 40) data.benchmarkRuns.splice(0, data.benchmarkRuns.length - 40);
  writeProfileStore(data);
  return run;
}

export function getBenchmarkProfileRuns() {
  return readProfileStore().benchmarkRuns;
}

function confidenceFromN(n) {
  if (n >= 20) return 'alta';
  if (n >= 10) return 'média';
  return 'baixa';
}

function benchmarkComponent(block, name, description, evidenceLabel) {
  const runs = getBenchmarkProfileRuns().slice(-4);
  const trials = runs.flatMap((r) => r.trials || []).filter((t) => t.block === block);
  if (!trials.length) {
    return { id: block, name, points: null, confidence: 'sem dados', raw: 'rode o Daily Benchmark', description };
  }
  const recent = trials.slice(-20);
  const total = recent.reduce((a, t) => a + (t.totalItems || 0), 0);
  const correct = recent.reduce((a, t) => a + (t.correctItems || 0), 0);
  const accuracy = total ? correct / total : 0;
  const last = recent[recent.length - 1];
  return {
    id: block,
    name,
    points: clamp100(accuracy * 100),
    confidence: confidenceFromN(recent.length),
    raw: `${pct(accuracy)} · ${evidenceLabel(last)}`,
    description,
    trials: recent.length,
  };
}

export function processingProfile() {
  const availability = store.getAvailabilityReport();
  const retention = getRetentionReport();
  const transfer = store.getTransferReport();

  const components = [
    benchmarkComponent(
      'sequence', 'Captura rápida',
      'Registro rápido de uma pequena sequência em exposição fixa.',
      (t) => `${t.totalItems || 0} itens · ${ms(t.actualExposureMs ?? t.requestedExposureMs)}`,
    ),
    benchmarkComponent(
      'matrix', 'Apreensão paralela',
      'Quanto da informação distribuída numa matriz é capturada em uma única exposição.',
      (t) => `${t.rows || 3}×${t.cols || 3} · ${ms(t.actualExposureMs ?? t.requestedExposureMs)}`,
    ),
    benchmarkComponent(
      'symbols', 'Codificação não verbal',
      'Captura de símbolos menos dependente de recitação verbal.',
      (t) => `${t.totalItems || 0} símbolos · ${ms(t.actualExposureMs ?? t.requestedExposureMs)}`,
    ),
    benchmarkComponent(
      'readout', 'Readout icônico',
      'Recuperação de uma cena depois que ela some e antes de saber exatamente o que será cobrado.',
      (t) => `${ms(t.actualExposureMs ?? t.requestedExposureMs)} · cue ${ms(t.cueDelayMs || 0)}`,
    ),
    {
      id: 'availability',
      name: 'Disponibilidade',
      points: availability.score === null ? null : clamp100(availability.score / 10),
      confidence: availability.score === null ? 'sem dados' : availabilityProfileConfidence(availability),
      raw: availability.score === null
        ? 'ative o treino de disponibilidade'
        : `T80 realista ${ms(availability.transferT80)} · índice ${availability.score}`,
      description: 'Quão cedo uma informação recém-vista se torna recuperável no protocolo. Menor T80 é melhor.',
    },
    {
      id: 'retention',
      name: 'Retenção',
      points: retentionPoints(retention.t80),
      confidence: retention.t80 === null ? 'sem dados' : retention.confidence,
      raw: retention.t80 === null
        ? 'ative o treino de retenção'
        : `Retention T80 ${ms(retention.t80)} · atual ${ms(retention.currentDelayMs)}`,
      description: 'Por quanto tempo a representação continua utilizável antes da recuperação. Maior T80 é melhor.',
    },
    {
      id: 'transfer',
      name: 'Generalização',
      points: transfer.generalization === null ? null : clamp100(transfer.generalization * 100),
      confidence: transfer.generalization === null ? 'sem dados' : confidenceFromN(transfer.novelTrials || 0),
      raw: transfer.generalization === null
        ? 'treine e teste material novo'
        : `${pct(transfer.generalization)} · gap ${transfer.transferGap === null ? '—' : `${Math.round(transfer.transferGap * 100)} pp`}`,
      description: 'Quanto do desempenho sobrevive quando o material muda, sem depender do template treinado.',
    },
  ];

  const measured = components.filter((c) => c.points !== null);
  const bottleneck = measured.length
    ? measured.reduce((a, b) => (b.points < a.points ? b : a))
    : null;
  const strongest = measured.length
    ? measured.reduce((a, b) => (b.points > a.points ? b : a))
    : null;

  return {
    components,
    measured: measured.length,
    bottleneck,
    strongest,
    // Média apenas como sumário visual; a interface deixa claro que não é QI.
    composite: measured.length ? Math.round(measured.reduce((a, c) => a + c.points, 0) / measured.length) : null,
  };
}

function availabilityProfileConfidence(report) {
  const cats = Object.values(report.categories || {}).filter((c) => c.t80 !== null);
  if (!cats.length) return 'baixa';
  if (cats.some((c) => c.confidence === 'baixa')) return 'baixa';
  if (cats.every((c) => c.confidence === 'alta')) return 'alta';
  return 'média';
}
