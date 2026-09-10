// MEMORY LAB — persistência local.
//
// O estado guarda explicitamente quais unidades já foram EXPOSTAS. Um probe
// tardio pode perguntar sobre a unidade, mas nunca a reexibe. Isso é a base do
// protocolo One Shot e também impede que holdouts virem treino por acidente.

import { DEFAULT_MEMORY_LAB_SETTINGS, MEMORY_LAB_CONFIG } from './config.js';

const KEY = `speedmemory.memory-lab.v${MEMORY_LAB_CONFIG.version}`;
const fallback = new Map();
let memoryBackend = null;
let cache = null;

function defaultBackend() {
  return {
    getItem(k) {
      if (memoryBackend) return memoryBackend.getItem(k);
      try {
        const v = localStorage.getItem(k);
        if (v !== null) return v;
      } catch (_) { /* storage indisponível */ }
      return fallback.get(k) ?? null;
    },
    setItem(k, v) {
      if (memoryBackend) { memoryBackend.setItem(k, v); return; }
      fallback.set(k, v);
      try { localStorage.setItem(k, v); } catch (_) { /* segue em memória */ }
    },
  };
}

const backend = defaultBackend();

function emptySkill() {
  return {
    exposureMs: MEMORY_LAB_CONFIG.initialExposureMs,
    retentionMs: MEMORY_LAB_CONFIG.initialRetentionMs,
    trialsSinceChange: 0,
    rollingAccuracy: null,
    axisCursor: 0,
  };
}

function emptyData() {
  return {
    version: MEMORY_LAB_CONFIG.version,
    datasetVersion: MEMORY_LAB_CONFIG.datasetVersion,
    settings: { ...DEFAULT_MEMORY_LAB_SETTINGS },
    skills: {},
    seen: {},
    trials: [],
    sessions: [],
    dueProbes: [],
    completedProbes: [],
  };
}

function load() {
  if (cache) return cache;
  const raw = backend.getItem(KEY);
  if (!raw) return (cache = emptyData());
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== MEMORY_LAB_CONFIG.version) return (cache = emptyData());
    cache = {
      ...emptyData(),
      ...parsed,
      settings: { ...DEFAULT_MEMORY_LAB_SETTINGS, ...(parsed.settings || {}) },
      skills: parsed.skills || {},
      seen: parsed.seen || {},
      trials: Array.isArray(parsed.trials) ? parsed.trials : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      dueProbes: Array.isArray(parsed.dueProbes) ? parsed.dueProbes : [],
      completedProbes: Array.isArray(parsed.completedProbes) ? parsed.completedProbes : [],
    };
  } catch (_) {
    cache = emptyData();
  }
  return cache;
}

function save() {
  backend.setItem(KEY, JSON.stringify(cache || emptyData()));
}

export function setMemoryLabBackendForTesting(custom = null) {
  memoryBackend = custom || {
    data: new Map(),
    getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
    setItem(k, v) { this.data.set(k, v); },
  };
  cache = null;
}

export function resetMemoryLabForTesting() {
  cache = emptyData();
  save();
  return cache;
}

export function getSettings() {
  return { ...load().settings };
}

export function updateSettings(patch) {
  const data = load();
  data.settings = { ...data.settings, ...patch };
  save();
  return { ...data.settings };
}

export function getSkill(mode) {
  const data = load();
  if (!data.skills[mode]) {
    data.skills[mode] = emptySkill();
    save();
  }
  return { ...data.skills[mode] };
}

export function updateSkill(mode, patch) {
  const data = load();
  data.skills[mode] = { ...emptySkill(), ...(data.skills[mode] || {}), ...patch };
  save();
  return { ...data.skills[mode] };
}

export function isSeen(stimulusId) {
  return !!load().seen[stimulusId];
}

export function seenInfo(stimulusId) {
  const x = load().seen[stimulusId];
  return x ? { ...x } : null;
}

export function markSeen(stimulusId, info = {}) {
  const data = load();
  if (!data.seen[stimulusId]) {
    data.seen[stimulusId] = {
      firstSeenAt: new Date().toISOString(),
      exposures: 1,
      ...info,
    };
  } else {
    // Uma segunda exposição é registrada como violação observável; nunca é
    // silenciosamente tratada como One Shot válido.
    data.seen[stimulusId] = {
      ...data.seen[stimulusId],
      exposures: (data.seen[stimulusId].exposures || 1) + 1,
      lastRepeatAt: new Date().toISOString(),
    };
  }
  const ids = Object.keys(data.seen);
  if (ids.length > MEMORY_LAB_CONFIG.maxSeenStimuli) {
    ids.sort((a, b) => String(data.seen[a].firstSeenAt).localeCompare(String(data.seen[b].firstSeenAt)));
    for (const id of ids.slice(0, ids.length - MEMORY_LAB_CONFIG.maxSeenStimuli)) delete data.seen[id];
  }
  save();
  return { ...data.seen[stimulusId] };
}

export function recordTrial(trial) {
  const data = load();
  data.trials.push(trial);
  if (data.trials.length > MEMORY_LAB_CONFIG.maxStoredTrials) {
    data.trials.splice(0, data.trials.length - MEMORY_LAB_CONFIG.maxStoredTrials);
  }
  save();
  return trial;
}

export function getTrials(filter = {}) {
  let xs = load().trials.slice();
  if (filter.mode) xs = xs.filter((t) => t.mode === filter.mode);
  if (filter.component) xs = xs.filter((t) => t.component === filter.component || t.components?.includes(filter.component));
  if (filter.split) xs = xs.filter((t) => t.split === filter.split);
  if (filter.probe !== undefined) xs = xs.filter((t) => !!t.probe === !!filter.probe);
  return xs;
}

export function addSession(session) {
  const data = load();
  data.sessions.push(session);
  if (data.sessions.length > MEMORY_LAB_CONFIG.maxStoredSessions) {
    data.sessions.splice(0, data.sessions.length - MEMORY_LAB_CONFIG.maxStoredSessions);
  }
  save();
  return session;
}

export function getSessions() {
  return load().sessions.slice();
}

/**
 * Agenda probes sem reexposição. Duplicatas por stimulus/question/delay são
 * rejeitadas para a curva de retenção não ganhar amostras artificiais.
 */
export function scheduleProbe(probe) {
  const data = load();
  const key = `${probe.stimulusId}|${probe.questionId}|${probe.delayMs}`;
  const exists = data.dueProbes.some((p) => p.key === key)
    || data.completedProbes.some((p) => p.key === key);
  if (exists) return false;
  data.dueProbes.push({ ...probe, key });
  data.dueProbes.sort((a, b) => a.dueAt - b.dueAt);
  save();
  return true;
}

export function getDueProbes(now = Date.now()) {
  return load().dueProbes.filter((p) => p.dueAt <= now).map((p) => ({ ...p }));
}

export function getPendingProbes() {
  return load().dueProbes.map((p) => ({ ...p }));
}

export function completeProbe(key, result) {
  const data = load();
  const at = data.dueProbes.findIndex((p) => p.key === key);
  if (at < 0) return null;
  const [probe] = data.dueProbes.splice(at, 1);
  const completed = { ...probe, ...result, completedAt: new Date().toISOString() };
  data.completedProbes.push(completed);
  if (data.completedProbes.length > 1000) data.completedProbes.splice(0, data.completedProbes.length - 1000);
  save();
  return completed;
}

export function getCompletedProbes() {
  return load().completedProbes.slice();
}

export function freshCount(ids) {
  return ids.reduce((n, id) => n + (isSeen(id) ? 0 : 1), 0);
}

export function exportMemoryLabData() {
  return JSON.parse(JSON.stringify(load()));
}
