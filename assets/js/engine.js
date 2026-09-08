// Máquina de estados de uma sessão de treino (sem DOM, para poder ser testada).
import { randInt, uid } from './util.js';
import { generateDigits } from './generators/digits.js';
import { generateWords } from './generators/words.js';
import { generateSentence } from './generators/sentences.js';
import { scoreSeries, summarize, parseInput } from './scoring.js';

/** Gera o conteúdo de uma série conforme o modo. */
export function generateContent(mode, count, rnd = Math.random) {
  switch (mode) {
    case 'digits':
      return generateDigits(count, {}, rnd);
    case 'words':
      return generateWords(count, {}, rnd);
    case 'sentence':
      return generateSentence(count, {}, rnd);
    default:
      throw new Error(`Modo desconhecido: ${mode}`);
  }
}

/**
 * Cria uma sessão com N séries.
 * @param {{mode:string,count:number,seconds:number,pace:string,series:number,group?:number}} config
 */
export function createSession(config, rnd = Math.random) {
  const rounds = [];
  for (let i = 0; i < config.series; i++) {
    rounds.push({ index: i, content: generateContent(config.mode, config.count, rnd), result: null });
  }
  return {
    id: uid(),
    mode: config.mode,
    config: { ...config },
    startedAt: new Date().toISOString(),
    rounds,
    index: 0,
  };
}

/**
 * Intervalo de espera até a próxima exposição, em ms.
 * No modo aleatório sorteia dentro da faixa, para o estímulo não ser previsível.
 * @param {{mode:string, ms:number, minMs:number, maxMs:number}} interval
 */
export function nextIntervalMs(interval, rnd = Math.random) {
  if (!interval) return 0;
  if (interval.mode !== 'random') return Math.max(0, interval.ms || 0);
  const min = Math.max(0, Math.min(interval.minMs, interval.maxMs));
  const max = Math.max(interval.minMs, interval.maxMs);
  return randInt(min, max, rnd);
}

export function currentRound(session) {
  return session.rounds[session.index] || null;
}

export function isLastRound(session) {
  return session.index >= session.rounds.length - 1;
}

/** Corrige a resposta digitada da série atual e avança o ponteiro. */
export function submitRound(session, text, opts = {}) {
  const round = currentRound(session);
  if (!round) return null;
  const given = parseInput(session.mode, text);
  round.given = given;
  round.raw = text;
  round.result = scoreSeries(session.mode, round.content.answer, given, opts);
  return round.result;
}

export function advance(session) {
  session.index += 1;
  return currentRound(session);
}

export function progress(session) {
  return {
    current: Math.min(session.index + 1, session.rounds.length),
    total: session.rounds.length,
    done: session.rounds.filter((r) => r.result).length,
  };
}

/** Fecha a sessão e devolve o registro que vai para o histórico. */
export function finishSession(session) {
  const results = session.rounds.filter((r) => r.result).map((r) => r.result);
  const totals = summarize(results);
  const measured = session.rounds
    .filter((r) => r.result && typeof r.actualExposureMs === 'number')
    .map((r) => r.actualExposureMs);
  totals.actualExposureMs = measured.length
    ? measured.reduce((a, b) => a + b, 0) / measured.length
    : null;
  const finishedAt = new Date().toISOString();
  return {
    id: session.id,
    mode: session.mode,
    config: { ...session.config },
    startedAt: session.startedAt,
    finishedAt,
    durationMs: new Date(finishedAt) - new Date(session.startedAt),
    totals,
    series: session.rounds
      .filter((r) => r.result)
      .map((r) => ({
        expected: r.content.answer,
        given: r.given || [],
        correct: r.result.correct,
        total: r.result.total,
        perfect: r.result.perfect,
        actualExposureMs: r.actualExposureMs ?? null,
      })),
  };
}
