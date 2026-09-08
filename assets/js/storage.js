// Persistência local (localStorage) de preferências e histórico.
import { avg, uid } from './util.js';

const SETTINGS_KEY = 'speedmemory.settings.v1';
const HISTORY_KEY = 'speedmemory.history.v1';
const HISTORY_LIMIT = 500;

export const MODES = ['digits', 'words', 'sentence'];

export const MODE_LABELS = {
  digits: 'Dígitos',
  words: 'Palavras',
  sentence: 'Frases',
};

export const MODE_UNITS = {
  digits: 'dígitos',
  words: 'palavras',
  sentence: 'palavras na frase',
};

/** Limites de configuração por modo. */
export const LIMITS = {
  digits: { min: 3, max: 60 },
  words: { min: 2, max: 30 },
  sentence: { min: 3, max: 30 },
};

export const DEFAULT_SETTINGS = {
  version: 1,
  theme: 'auto',
  mode: 'digits',
  series: 10,
  strictAccents: false,
  countdown: true,
  sound: true,
  haptics: true,
  perMode: {
    digits: { count: 8, seconds: 10, pace: 'total', group: 3 },
    words: { count: 5, seconds: 15, pace: 'total', group: 0 },
    sentence: { count: 8, seconds: 15, pace: 'total', group: 0 },
  },
};

/** localStorage pode falhar (aba privada, cookies bloqueados): cai para memória. */
const memory = new Map();

function readRaw(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch (_) { /* ignorado */ }
  return memory.has(key) ? memory.get(key) : null;
}

function writeRaw(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch (_) { /* ignorado */ }
}

export function loadSettings() {
  const raw = readRaw(SETTINGS_KEY);
  if (!raw) return structuredCloneSafe(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(raw);
    const merged = { ...structuredCloneSafe(DEFAULT_SETTINGS), ...saved };
    merged.perMode = { ...DEFAULT_SETTINGS.perMode };
    for (const m of MODES) {
      merged.perMode[m] = { ...DEFAULT_SETTINGS.perMode[m], ...(saved.perMode?.[m] || {}) };
    }
    if (!MODES.includes(merged.mode)) merged.mode = 'digits';
    return merged;
  } catch (_) {
    return structuredCloneSafe(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  writeRaw(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export function loadHistory() {
  const raw = readRaw(HISTORY_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

export function saveHistory(list) {
  const trimmed = list.slice(-HISTORY_LIMIT);
  writeRaw(HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed;
}

/** Grava uma sessão concluída e devolve o histórico atualizado. */
export function addSession(session) {
  const list = loadHistory();
  list.push({ id: session.id || uid(), ...session });
  return saveHistory(list);
}

export function clearHistory() {
  writeRaw(HISTORY_KEY, JSON.stringify([]));
}

/** Importa um histórico exportado; `replace` troca tudo, senão mescla por id. */
export function importHistory(list, replace = false) {
  if (!Array.isArray(list)) throw new Error('Arquivo inválido: esperava uma lista de sessões.');
  const valid = list.filter((s) => s && s.mode && s.totals && s.finishedAt);
  if (replace) return saveHistory(valid);
  const current = loadHistory();
  const seen = new Set(current.map((s) => s.id));
  const merged = current.concat(valid.filter((s) => !seen.has(s.id)));
  merged.sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));
  return saveHistory(merged);
}

/**
 * Estatísticas de evolução de um modo.
 * `trend` compara a média das 5 sessões mais recentes com as 5 anteriores.
 */
export function statsFor(history, mode) {
  const list = history
    .filter((s) => !mode || s.mode === mode)
    .sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));

  if (!list.length) {
    return { sessions: 0, best: null, bestSpan: 0, recent: 0, trend: null, list };
  }

  const acc = list.map((s) => s.totals.accuracy);
  const last5 = acc.slice(-5);
  const prev5 = acc.slice(-10, -5);

  const best = list.reduce((a, b) => {
    const key = (s) => [s.totals.accuracy, s.config.count, s.totals.correct];
    const [aA, aC, aK] = key(a);
    const [bA, bC, bK] = key(b);
    if (bA !== aA) return bA > aA ? b : a;
    if (bC !== aC) return bC > aC ? b : a;
    return bK > aK ? b : a;
  });

  // "Span": maior tamanho de série com pelo menos uma série perfeita.
  const bestSpan = list.reduce(
    (max, s) => (s.totals.perfectSeries > 0 ? Math.max(max, s.config.count) : max),
    0,
  );

  return {
    sessions: list.length,
    best,
    bestSpan,
    recent: avg(last5),
    trend: prev5.length ? avg(last5) - avg(prev5) : null,
    list,
  };
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}
