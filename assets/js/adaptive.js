// Teste adaptativo de velocidade de processamento.
//
// A dificuldade tem duas dimensões, e a escada mexe nas duas:
//
// - tempo: quanto menor a exposição, mais difícil;
// - quantidade: quanto mais itens na série, mais difícil.
//
// A regra é "2 para baixo, 1 para cima": duas séries seguidas inteiramente
// certas sobem a dificuldade, uma série errada desce. Isso converge para o
// ponto em que a pessoa acerta a série inteira em cerca de 71% das vezes.
//
// A escada alterna as duas dimensões: um passo encurta o tempo, o seguinte
// acrescenta um item, e assim por diante. Quando uma delas chega ao limite —
// o tempo no piso da tela, a quantidade no teto — a escada usa só a outra.
// Descer faz o caminho inverso. Alternar importa porque os dois passos têm
// tamanho parecido na régua: um degrau de tempo muda a dificuldade em cerca de
// 25%, e sair de 4 para 5 itens muda em 20%.
//
// Como as séries variam de tamanho, o que a escada compara não é o tempo bruto
// e sim o tempo convertido para a carga de referência da régua (ver
// perception.js): 8 dígitos em 100 ms equivalem a 4 dígitos em 50 ms.

import { EXPOSURE_STEPS, basisFor, classify } from './perception.js';
import { clamp, randInt } from './util.js';

export const TEST = {
  maxTrials: 30,          // teto de séries
  stopReversals: 8,       // ou encerra antes, quando a escada se estabiliza
  thresholdReversals: 6,  // viradas usadas na média final
  // Ler três palavras custa mais que ver quatro dígitos: cada estímulo tem os
  // seus limites.
  startMs: { digits: 500, words: 900 },
  ceilingMs: { digits: 2000, words: 3000 },
  itemCount: { digits: 4, words: 3 },
  minCount: { digits: 3, words: 2 },
  maxCount: { digits: 12, words: 8 },
  intervalMinMs: 1500,    // espera sorteada e sem contagem
  intervalMaxMs: 4000,
  bigStep: 2,             // passos largos até a escada se aproximar do limiar
  smallStep: 1,
  reversalsBeforeSmallStep: 2,
};

/**
 * Cria a escada.
 * @param {{mode:string, floorMs?:number}} opts `floorMs` é o piso real do
 *   aparelho (um quadro da tela): abaixo dele os degraus seriam
 *   indistinguíveis e a escada mediria ruído.
 */
export function createStaircase({ mode, floorMs = 5 } = {}) {
  const ceiling = TEST.ceilingMs[mode] ?? TEST.ceilingMs.digits;
  const start = TEST.startMs[mode] ?? TEST.startMs.digits;
  const floor = clamp(floorMs, EXPOSURE_STEPS[0], ceiling);
  const steps = EXPOSURE_STEPS.filter((ms) => ms >= floor && ms <= ceiling);
  if (!steps.length) steps.push(floor);

  let index = steps.findIndex((ms) => ms >= start);
  if (index < 0) index = steps.length - 1;

  return {
    mode,
    steps,
    index,
    count: TEST.itemCount[mode] ?? TEST.itemCount.digits,
    minCount: TEST.minCount[mode] ?? TEST.minCount.digits,
    maxCount: TEST.maxCount[mode] ?? TEST.maxCount.digits,
    ceilingMs: ceiling,
    floorMs: steps[0],
    direction: 0,
    lastDim: 'count',       // faz o primeiro passo mexer no tempo
    consecutiveCorrect: 0,
    reversals: [],
    trials: [],
    done: false,
  };
}

export function currentExposure(st) {
  return st.steps[st.index];
}

export function currentCount(st) {
  return st.count;
}

/** Dificuldade atual, na régua da carga de referência. */
export function currentBasis(st) {
  return basisFor(st.mode, currentExposure(st), st.count);
}

/** Espera até a próxima série, sorteada dentro da faixa do teste. */
export function nextInterval(rnd = Math.random) {
  return randInt(TEST.intervalMinMs, TEST.intervalMaxMs, rnd);
}

/** Ordem das dimensões nesta jogada: a que não foi usada da última vez vem primeiro. */
function dimOrder(st) {
  return st.lastDim === 'time' ? ['count', 'time'] : ['time', 'count'];
}

/**
 * Sobe a dificuldade: encurta o tempo ou acrescenta um item, alternando.
 * @returns {boolean} se conseguiu subir
 */
function harder(st, step) {
  for (const dim of dimOrder(st)) {
    if (dim === 'time' && st.index > 0) {
      st.index = Math.max(0, st.index - step);
      st.lastDim = 'time';
      return true;
    }
    if (dim === 'count' && st.count < st.maxCount) {
      st.count += 1;
      st.lastDim = 'count';
      return true;
    }
  }
  return false; // no piso da tela e no teto de itens
}

/**
 * Desce a dificuldade: alonga o tempo ou tira um item, alternando.
 * @returns {boolean} se conseguiu descer
 */
function easier(st, step) {
  for (const dim of dimOrder(st)) {
    if (dim === 'time' && st.index < st.steps.length - 1) {
      st.index = Math.min(st.steps.length - 1, st.index + step);
      st.lastDim = 'time';
      return true;
    }
    if (dim === 'count' && st.count > st.minCount) {
      st.count -= 1;
      st.lastDim = 'count';
      return true;
    }
  }
  return false; // no teto de tempo e no piso de itens
}

/**
 * Registra uma série respondida e move a escada.
 * @param {object} st
 * @param {{perfect:boolean, correct:number, total:number}} result
 */
export function recordTrial(st, result) {
  if (st.done) return st;

  const exposureMs = currentExposure(st);
  const count = st.count;
  st.trials.push({
    exposureMs,
    count,
    basisMs: basisFor(st.mode, exposureMs, count),
    perfect: !!result.perfect,
    accuracy: result.total ? result.correct / result.total : 0,
  });

  let move = 0;
  if (result.perfect) {
    st.consecutiveCorrect += 1;
    if (st.consecutiveCorrect >= 2) {
      move = -1; // mais difícil
      st.consecutiveCorrect = 0;
    }
  } else {
    st.consecutiveCorrect = 0;
    move = 1; // mais fácil
  }

  if (move !== 0) {
    if (st.direction !== 0 && move !== st.direction) {
      st.reversals.push(basisFor(st.mode, exposureMs, count));
    }
    st.direction = move;
    const step = st.reversals.length >= TEST.reversalsBeforeSmallStep ? TEST.smallStep : TEST.bigStep;
    if (move < 0) harder(st, step);
    else easier(st, step);
  }

  st.done = st.trials.length >= TEST.maxTrials || st.reversals.length >= TEST.stopReversals;
  return st;
}

/** Média geométrica: a escala de tempos é multiplicativa, não aditiva. */
function geometricMean(values) {
  const logs = values.map((v) => Math.log(v));
  return Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
}

/** Precisão média por combinação de quantidade e tempo, da mais fácil à mais difícil. */
export function accuracyByExposure(trials) {
  const groups = new Map();
  for (const t of trials) {
    const key = `${t.count}|${t.exposureMs}`;
    const entry = groups.get(key)
      || { count: t.count, exposureMs: t.exposureMs, basisMs: t.basisMs, trials: 0, perfect: 0, sum: 0 };
    entry.trials += 1;
    entry.perfect += t.perfect ? 1 : 0;
    entry.sum += t.accuracy;
    groups.set(key, entry);
  }
  return [...groups.values()]
    .map((e) => ({ ...e, accuracy: e.sum / e.trials }))
    .sort((a, b) => b.basisMs - a.basisMs);
}

/** Maior quantidade de itens em que a pessoa acertou uma série inteira. */
export function spanReached(trials) {
  const certas = trials.filter((t) => t.perfect);
  return certas.length ? Math.max(...certas.map((t) => t.count)) : 0;
}

/**
 * Fecha o teste e estima o limiar, já na régua da carga de referência.
 *
 * `quality` diz o quanto confiar no número:
 * - 'convergiu': média geométrica das últimas viradas, o caso normal;
 * - 'invicto': não errou nenhuma série; a dificuldade subiu até o fim;
 * - 'piso': chegou ao limite do aparelho e ao teto de itens;
 * - 'teto': errou até o tempo mais longo com a menor quantidade;
 * - 'parcial': acabaram as séries antes de a escada se estabilizar.
 */
export function finishTest(st) {
  const used = st.reversals.slice(-TEST.thresholdReversals);
  const lastIndex = st.steps.length - 1;
  let basis;
  let quality;

  if (used.length >= 2) {
    basis = geometricMean(used);
    quality = 'convergiu';
  } else if (st.trials.length && st.trials.every((t) => t.perfect)) {
    basis = geometricMean(st.trials.slice(-4).map((t) => t.basisMs));
    quality = 'invicto';
  } else if (st.index === 0 && st.count >= st.maxCount) {
    basis = basisFor(st.mode, st.steps[0], st.maxCount);
    quality = 'piso';
  } else if (st.index === lastIndex && st.count <= st.minCount) {
    basis = basisFor(st.mode, st.steps[lastIndex], st.minCount);
    quality = 'teto';
  } else {
    basis = geometricMean(st.trials.slice(-6).map((t) => t.basisMs));
    quality = 'parcial';
  }

  const basisMs = Math.round(basis);
  const { band, level, levels, scale } = classify(st.mode, basisMs, scaleRefCount(st.mode));
  const span = spanReached(st.trials);

  return {
    mode: st.mode,
    basisMs,
    scaleId: scale.id,
    refCount: scale.refCount,
    band,
    level,
    levels,
    quality,
    span,
    finalCount: st.count,
    trials: st.trials.length,
    reversals: st.reversals.length,
    floorMs: st.floorMs,
    ceilingMs: st.ceilingMs,
    curve: accuracyByExposure(st.trials),
    finishedAt: new Date().toISOString(),
  };
}

/** Carga de referência da régua do modo. */
function scaleRefCount(mode) {
  return classify(mode, 1, 1).scale.refCount;
}
