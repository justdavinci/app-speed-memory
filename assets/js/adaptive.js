// Teste adaptativo de velocidade de processamento.
//
// Método: escada psicofísica "2 para baixo, 1 para cima". Duas séries seguidas
// totalmente certas encurtam a exposição; uma série errada alonga. Essa regra
// converge para o tempo em que a pessoa acerta a série inteira em cerca de 71%
// das vezes — o limiar que o teste estima.
//
// A carga (quantidade de itens) é fixa de propósito: se ela variasse junto com
// o tempo, não daria para saber qual das duas coisas o resultado mediu.

import { EXPOSURE_STEPS, bandFor, bandLevel } from './perception.js';
import { clamp, randInt } from './util.js';

export const TEST = {
  maxTrials: 30,          // teto pedido: no máximo 30 séries
  stopReversals: 8,       // ou encerra antes, quando a escada já se estabilizou
  thresholdReversals: 6,  // reversões usadas na média final
  startMs: 500,
  ceilingMs: 2000,        // acima disso não é mais teste de percepção
  itemCount: { digits: 4, words: 3 },
  intervalMinMs: 1500,    // espera sorteada e sem contagem: nada de ritmo previsível
  intervalMaxMs: 4000,
  bigStep: 2,             // passos largos até a escada se aproximar do limiar
  smallStep: 1,
  reversalsBeforeSmallStep: 2,
};

/**
 * Cria a escada.
 * @param {{mode:string, floorMs?:number}} opts `floorMs` é o piso real do
 *   aparelho (um quadro da tela): abaixo dele os degraus seriam indistinguíveis
 *   e a escada mediria ruído.
 */
export function createStaircase({ mode, floorMs = 5 } = {}) {
  const floor = clamp(floorMs, EXPOSURE_STEPS[0], TEST.ceilingMs);
  const steps = EXPOSURE_STEPS.filter((ms) => ms >= floor && ms <= TEST.ceilingMs);
  if (!steps.length) steps.push(floor);

  let index = steps.findIndex((ms) => ms >= TEST.startMs);
  if (index < 0) index = steps.length - 1;

  return {
    mode,
    steps,
    index,
    floorMs: steps[0],
    direction: 0,
    consecutiveCorrect: 0,
    reversals: [],
    trials: [],
    done: false,
  };
}

export function currentExposure(st) {
  return st.steps[st.index];
}

/** Espera até a próxima série, sorteada dentro da faixa do teste. */
export function nextInterval(rnd = Math.random) {
  return randInt(TEST.intervalMinMs, TEST.intervalMaxMs, rnd);
}

/**
 * Registra uma série respondida e move a escada.
 * @param {object} st
 * @param {{perfect:boolean, correct:number, total:number}} result
 */
export function recordTrial(st, result) {
  if (st.done) return st;

  const exposureMs = currentExposure(st);
  st.trials.push({
    exposureMs,
    perfect: !!result.perfect,
    accuracy: result.total ? result.correct / result.total : 0,
  });

  let move = 0;
  if (result.perfect) {
    st.consecutiveCorrect += 1;
    if (st.consecutiveCorrect >= 2) {
      move = -1; // mais rápido
      st.consecutiveCorrect = 0;
    }
  } else {
    st.consecutiveCorrect = 0;
    move = 1; // mais devagar
  }

  if (move !== 0) {
    if (st.direction !== 0 && move !== st.direction) st.reversals.push(exposureMs);
    st.direction = move;
    const step = st.reversals.length >= TEST.reversalsBeforeSmallStep ? TEST.smallStep : TEST.bigStep;
    st.index = clamp(st.index + move * step, 0, st.steps.length - 1);
  }

  st.done = st.trials.length >= TEST.maxTrials || st.reversals.length >= TEST.stopReversals;
  return st;
}

/** Média geométrica: a escala de tempos é multiplicativa, não aditiva. */
function geometricMean(values) {
  const logs = values.map((v) => Math.log(v));
  return Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
}

/** Precisão média por tempo de exposição visitado, do mais lento ao mais rápido. */
export function accuracyByExposure(trials) {
  const byMs = new Map();
  for (const t of trials) {
    const entry = byMs.get(t.exposureMs) || { exposureMs: t.exposureMs, trials: 0, perfect: 0, sum: 0 };
    entry.trials += 1;
    entry.perfect += t.perfect ? 1 : 0;
    entry.sum += t.accuracy;
    byMs.set(t.exposureMs, entry);
  }
  return [...byMs.values()]
    .map((e) => ({ ...e, accuracy: e.sum / e.trials }))
    .sort((a, b) => b.exposureMs - a.exposureMs);
}

/**
 * Fecha o teste e estima o limiar.
 *
 * `quality` diz o quanto confiar no número:
 * - 'convergiu': média geométrica das últimas reversões, o caso normal;
 * - 'piso': acertou tudo até o degrau mais rápido possível no aparelho;
 * - 'teto': errou até o degrau mais lento do teste;
 * - 'parcial': acabaram as séries antes de a escada se estabilizar.
 */
export function finishTest(st) {
  const used = st.reversals.slice(-TEST.thresholdReversals);
  const lastIndex = st.steps.length - 1;
  let thresholdMs;
  let quality;

  if (used.length >= 2) {
    thresholdMs = geometricMean(used);
    quality = 'convergiu';
  } else if (st.index === 0) {
    thresholdMs = st.steps[0];
    quality = 'piso';
  } else if (st.index === lastIndex) {
    thresholdMs = st.steps[lastIndex];
    quality = 'teto';
  } else {
    thresholdMs = geometricMean(st.trials.slice(-6).map((t) => t.exposureMs));
    quality = 'parcial';
  }

  const rounded = Math.round(thresholdMs);
  const band = bandFor(rounded);

  return {
    mode: st.mode,
    thresholdMs: rounded,
    band,
    level: bandLevel(band),
    levels: 7,
    quality,
    trials: st.trials.length,
    reversals: st.reversals.length,
    floorMs: st.floorMs,
    curve: accuracyByExposure(st.trials),
    finishedAt: new Date().toISOString(),
  };
}
