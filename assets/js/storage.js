// Persistência local (localStorage) de preferências e histórico.
import { avg, uid } from './util.js';
import { MAX_EXPOSURE_MS, MIN_EXPOSURE_MS, averageLevel, classify } from './perception.js';

// As chaves mantêm o prefixo antigo de propósito: renomear apagaria o
// histórico de quem já vinha usando o app.
const SETTINGS_KEY = 'speedmemory.settings.v1';
const HISTORY_KEY = 'speedmemory.history.v1';
const TESTS_KEY = 'speedmemory.tests.v1';
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

export const INTERVAL_MAX_MS = 15000;

export const DEFAULT_SETTINGS = {
  version: 2,
  theme: 'auto',
  mode: 'digits',
  series: 10,
  strictAccents: false,
  sound: true,
  haptics: true,
  // Estímulo em posição sorteada na tela, em vez de sempre no centro.
  randomPosition: false,
  // Espera entre o fim de uma série e a próxima exposição.
  interval: { mode: 'fixed', ms: 2000, minMs: 2000, maxMs: 10000, showCountdown: true },
  perMode: {
    digits: { count: 8, exposureMs: 10000, pace: 'total', group: 3 },
    // `ordered`: exigir a ordem das palavras ou aceitar em qualquer ordem.
    words: { count: 5, exposureMs: 15000, pace: 'total', group: 0, ordered: true },
    sentence: { count: 8, exposureMs: 15000, pace: 'total', group: 0 },
  },
};

/** Exposição de uma configuração, aceitando registros antigos em segundos. */
export function exposureOf(config) {
  if (!config) return 0;
  if (typeof config.exposureMs === 'number') return config.exposureMs;
  return (config.seconds || 0) * 1000;
}

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
    return migrateSettings(JSON.parse(raw));
  } catch (_) {
    return structuredCloneSafe(DEFAULT_SETTINGS);
  }
}

/** Normaliza ajustes salvos, inclusive os da versão 1 (tempo em segundos). */
export function migrateSettings(saved) {
  const merged = { ...structuredCloneSafe(DEFAULT_SETTINGS), ...saved };

  merged.interval = { ...DEFAULT_SETTINGS.interval, ...(saved.interval || {}) };
  // v1 guardava um único booleano de contagem regressiva.
  if (saved.interval === undefined && typeof saved.countdown === 'boolean') {
    merged.interval.showCountdown = saved.countdown;
  }
  delete merged.countdown;
  merged.interval.mode = merged.interval.mode === 'random' ? 'random' : 'fixed';
  merged.interval.ms = clampMs(merged.interval.ms, 0, INTERVAL_MAX_MS);
  merged.interval.minMs = clampMs(merged.interval.minMs, 0, INTERVAL_MAX_MS);
  merged.interval.maxMs = clampMs(merged.interval.maxMs, merged.interval.minMs, INTERVAL_MAX_MS);

  merged.perMode = { ...DEFAULT_SETTINGS.perMode };
  for (const m of MODES) {
    const savedMode = saved.perMode?.[m] || {};
    const mode = { ...DEFAULT_SETTINGS.perMode[m], ...savedMode };
    // v1 guardava `seconds`; v2 guarda `exposureMs`.
    if (savedMode.exposureMs === undefined && typeof savedMode.seconds === 'number') {
      mode.exposureMs = savedMode.seconds * 1000;
    }
    delete mode.seconds;
    mode.exposureMs = clampMs(mode.exposureMs, MIN_EXPOSURE_MS, MAX_EXPOSURE_MS);
    if (m === 'words') mode.ordered = mode.ordered !== false;
    merged.perMode[m] = mode;
  }

  if (!MODES.includes(merged.mode)) merged.mode = DEFAULT_SETTINGS.mode;
  merged.version = DEFAULT_SETTINGS.version;
  return merged;
}

function clampMs(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
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
  writeRaw(TESTS_KEY, JSON.stringify([]));
}

/* --------------------- testes de velocidade ---------------------------- */

export function loadTests() {
  const raw = readRaw(TESTS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

/** Guarda o resultado de um teste e devolve a lista atualizada. */
export function addTest(result) {
  const list = loadTests();
  list.push({ id: uid(), ...result });
  const trimmed = list.slice(-100);
  writeRaw(TESTS_KEY, JSON.stringify(trimmed));
  return trimmed;
}

/** Melhor resultado (menor tempo na régua) de um modo, para comparar repetições. */
export function bestTest(tests, mode) {
  const list = tests.filter((t) => !mode || t.mode === mode);
  if (!list.length) return null;
  return list.reduce((a, b) => (b.basisMs < a.basisMs ? b : a));
}

/** Último teste de cada tipo e a média dos dois níveis. */
export function testLevels(tests) {
  const latest = (mode) => {
    const list = tests.filter((t) => t.mode === mode);
    return list.length ? list[list.length - 1] : null;
  };
  const digits = latest('digits');
  const words = latest('words');
  return { digits, words, average: averageLevel([digits, words]) };
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
    return { sessions: 0, best: null, bestSpan: 0, recent: 0, trend: null, level: null, list };
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
    level: levelFrom(list),
    list,
  };
}

/**
 * Nível perceptual alcançado num modo: a menor exposição em que a pessoa já
 * acertou uma série inteira. Uma série perfeita prova que o tempo foi
 * suficiente; uma sessão só com acertos parciais, não.
 *
 * A comparação é feita na régua do modo — total para dígitos, por palavra para
 * estímulos verbais —, e é por isso que ela precisa do modo, não só do tempo.
 *
 * @param {Array} history sessões (de um único modo, ou mistas com `mode` dado)
 * @param {string} [mode] modo a considerar; sem ele, usa o de cada sessão
 * @returns {{exposureMs:number, basisMs:number, band:object, level:number, levels:number, session:object}|null}
 */
export function levelFrom(history, mode) {
  const proven = history.filter((s) => (
    (!mode || s.mode === mode)
    && s.totals?.perfectSeries > 0
    && exposureOf(s.config) > 0
    && s.config?.count > 0
  ));
  if (!proven.length) return null;

  const scored = proven.map((session) => {
    const exposureMs = exposureOf(session.config);
    const info = classify(session.mode, exposureMs, session.config.count);
    return { exposureMs, session, ...info };
  });

  // "Melhor" é o menor valor na régua do próprio modo.
  const best = scored.reduce((a, b) => (b.basisMs < a.basisMs ? b : a));
  return { ...best, basisMs: Math.round(best.basisMs) };
}

/**
 * Níveis por tipo de estímulo mais a média das duas famílias.
 * Frases entram como estímulo verbal, mas fora da média: a média combina os
 * dois tipos de teste, dígitos e palavras.
 */
export function levelsByMode(history) {
  const digits = levelFrom(history, 'digits');
  const words = levelFrom(history, 'words');
  const sentence = levelFrom(history, 'sentence');
  return { digits, words, sentence, average: averageLevel([digits, words]) };
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}
