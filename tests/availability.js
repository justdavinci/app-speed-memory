// Testes da Disponibilidade Visual. Cobrem o algoritmo (escada, curva, limiar)
// e a pontuação — as partes que decidem números mostrados ao usuário.

import assert from 'node:assert/strict';

import {
  AVAILABILITY_CONFIG, AVAILABILITY_PRESETS, CATEGORY_IDS, TRANSFER_CATEGORIES,
  moduleSupportsAvailability,
} from '../assets/js/tryhard/availability/config.js';
import {
  calibrationPlan, evaluateAvailability, hasConverged, initialAvailabilityState,
  noteTrial, rollingAccuracy, stepFor,
} from '../assets/js/tryhard/availability/staircase.js';
import {
  asymptote, availabilityScore, binByDelay, confidenceFor, estimateThreshold,
  fitCurve, smooth, thresholdFrom,
} from '../assets/js/tryhard/availability/threshold.js';
import {
  advance, applyToTrial, categoryFor, countsForThreshold, isActiveFor, planTrial, trialRecord,
} from '../assets/js/tryhard/availability/index.js';
import { median, summarizeMotorBaseline } from '../assets/js/tryhard/availability/motor.js';
import { cognitiveState, levelOf, recommendations, suggestedWeights } from '../assets/js/tryhard/curriculum.js';
import { AVAILABILITY_BENCHMARK_TRIALS, REAL_WORLD_AVAILABILITY_TRIALS } from '../assets/js/tryhard/modules/index.js';
import { seeded } from '../assets/js/tryhard/rng.js';
import * as store from '../assets/js/tryhard/store.js';
import { createControl, runModuleBlock } from '../assets/js/tryhard/runner.js';

/**
 * Pessoa simulada: o acerto depende do atraso pós-estímulo, com o teto e o
 * limiar que o teste pedir. É o único jeito de checar a escada de ponta a
 * ponta sem depender de alguém respondendo.
 */
function pessoa({ limiarMs = 130, teto = 0.92, inclinacao = 25, rng = Math.random } = {}) {
  return (delayMs) => {
    const p = teto / (1 + Math.exp(-(delayMs - limiarMs) / inclinacao));
    return rng() < p ? 1 : 0;
  };
}

function fakeView({ limiarMs = 130, teto = 0.92, semDisponibilidade = 0.85, rng = Math.random } = {}) {
  const responde = pessoa({ limiarMs, teto, rng });
  let ultimoDelay = 0;
  return {
    setPhase() {}, setProgress() {}, setSessionProgress() {},
    showCountdown: async () => {}, showFixation: async () => {},
    prepareStimulus: async (t) => ({ t }),
    presentStimulus: async (p, t) => ({ requestedMs: t.exposureMs, actualMs: t.exposureMs, frames: 3 }),
    waitBlank: async (msPedidos) => { ultimoDelay = msPedidos; return { actualMs: msPedidos + 1.2, aborted: false }; },
    showMask: async () => {},
    collectResponse: async (trial) => {
      const acerta = trial.availability?.active ? () => responde(ultimoDelay) : () => (rng() < semDisponibilidade ? 1 : 0);
      return {
        items: trial.expected.map((v) => (acerta() ? v : '__erro__')),
        reactionMs: 310,
      };
    },
    showFeedback: async () => {}, showModuleSummary: async () => 'next',
    showInvalid: async () => {}, watchInvalidation: () => ({ invalid: false, stop() {} }),
  };
}

const trialsEm = (delayMs, n, acerto) => Array.from({ length: n }, () => ({ delayMs, accuracy: acerto }));

export function register({ test, group }) {
  if (!global.performance) global.performance = { now: () => Date.now() };

  /* ------------------------------- escada -------------------------------- */

  group('Disponibilidade — escada adaptativa');

  test('uma tentativa isolada nunca mexe no atraso', () => {
    let estado = initialAvailabilityState({ initialDelayMs: 200, minDelayMs: 16, maxDelayMs: 900 });
    const trials = [];
    for (let i = 0; i < AVAILABILITY_CONFIG.rollingWindow - 1; i++) {
      trials.push({ accuracy: 1 });
      estado = noteTrial(estado);
      const d = evaluateAvailability(estado, trials);
      assert.equal(d.decision, 'wait', 'decidiu antes de ter janela cheia');
      assert.equal(d.state.currentDelayMs, 200);
      estado = d.state;
    }
  });

  test('acerto com folga encurta o atraso; erro demais alonga', () => {
    const base = { ...initialAvailabilityState({ initialDelayMs: 200, minDelayMs: 16, maxDelayMs: 900 }), trialsSinceChange: 9 };
    const facil = evaluateAvailability(base, trialsEm(200, 8, 1));
    assert.equal(facil.decision, 'shorter');
    assert.ok(facil.state.currentDelayMs < 200);

    const dificil = evaluateAvailability(base, trialsEm(200, 8, 0));
    assert.equal(dificil.decision, 'longer');
    assert.ok(dificil.state.currentDelayMs > 200);

    const naRegiao = evaluateAvailability(base, [
      ...trialsEm(200, 6, 1), ...trialsEm(200, 2, 0),
    ]);
    assert.equal(naRegiao.decision, 'hold', '75% está dentro da região alvo');
    assert.equal(naRegiao.state.currentDelayMs, 200);
  });

  test('o passo encolhe conforme a escada vira de direção', () => {
    const base = initialAvailabilityState({ initialDelayMs: 200 });
    const grosso = stepFor({ ...base, reversals: [] });
    const fino = stepFor({ ...base, reversals: [1, 2] });
    const finissimo = stepFor({ ...base, reversals: [1, 2, 3, 4] });
    assert.ok(grosso > fino && fino > finissimo, `${grosso} > ${fino} > ${finissimo}`);
    assert.ok(finissimo >= AVAILABILITY_CONFIG.minStepMs);
  });

  test('a escada respeita o piso e o teto configurados', () => {
    const noPiso = { ...initialAvailabilityState({ initialDelayMs: 60, minDelayMs: 60, maxDelayMs: 400 }), trialsSinceChange: 9 };
    const d = evaluateAvailability(noPiso, trialsEm(60, 8, 1));
    assert.equal(d.state.currentDelayMs, 60, 'passou do piso');

    const noTeto = { ...initialAvailabilityState({ initialDelayMs: 400, minDelayMs: 60, maxDelayMs: 400 }), trialsSinceChange: 9 };
    const e = evaluateAvailability(noTeto, trialsEm(400, 8, 0));
    assert.equal(e.state.currentDelayMs, 400, 'passou do teto');
  });

  test('a escada converge para perto do limiar de quem está respondendo', () => {
    const rng = seeded(42);
    const responde = pessoa({ limiarMs: 120, rng });
    let estado = initialAvailabilityState({ initialDelayMs: 400, minDelayMs: 16, maxDelayMs: 900 });
    const trials = [];
    for (let i = 0; i < 160; i++) {
      trials.push({ accuracy: responde(estado.currentDelayMs) });
      estado = noteTrial(estado);
      estado = evaluateAvailability(estado, trials).state;
    }
    // O alvo da escada é 80% de acerto, que nesta pessoa fica acima do ponto
    // médio: por isso ela assenta um pouco ACIMA do limiar de 50%.
    assert.ok(estado.currentDelayMs > 90 && estado.currentDelayMs < 220,
      `assentou em ${estado.currentDelayMs} ms`);
    assert.ok(hasConverged(estado), `poucas viradas: ${estado.reversals.length}`);
  });

  test('tentativas de aquecimento ficam fora da janela', () => {
    const trials = [
      ...trialsEm(200, 4, 0).map((t) => ({ ...t, warmup: true })),
      ...trialsEm(200, 4, 1),
    ];
    assert.equal(rollingAccuracy(trials, 6), 1, 'o aquecimento entrou na conta');
  });

  test('a calibração varre de longe a perto', () => {
    const plano = calibrationPlan({ minDelayMs: 16, maxDelayMs: 900 });
    assert.ok(plano.length >= 12);
    assert.ok(plano[0] > plano[plano.length - 1], 'não começa pelo mais fácil');
  });

  /* -------------------------------- curva -------------------------------- */

  group('Disponibilidade — curva e T80');

  test('o T80 relativo não depende do teto de desempenho', () => {
    const alto = fitCurve([
      { delayMs: 60, accuracy: 0.1, trials: 10 },
      { delayMs: 120, accuracy: 0.45, trials: 10 },
      { delayMs: 200, accuracy: 0.8, trials: 10 },
      { delayMs: 320, accuracy: 0.9, trials: 10 },
    ], 0.9);
    // m + k·ln(4) é a leitura de 80% do teto, seja qual for o teto.
    const esperado = alto.m + alto.k * Math.log(4);
    assert.ok(Math.abs(thresholdFrom(alto, 0.8) - esperado) < 0.001);
  });

  test('o teto sai dos atrasos mais longos e tem piso', () => {
    const bins = [
      { delayMs: 60, accuracy: 0.1, trials: 8 },
      { delayMs: 200, accuracy: 0.6, trials: 8 },
      { delayMs: 400, accuracy: 0.95, trials: 8 },
    ];
    assert.ok(asymptote(bins) >= 0.9, 'ignorou os atrasos longos');
    const ruim = bins.map((b) => ({ ...b, accuracy: 0.1 }));
    assert.equal(asymptote(ruim), AVAILABILITY_CONFIG.minAsymptote, 'teto ruim virou meta fácil');
  });

  test('quem precisa de mais tempo tem T80 maior', () => {
    const rng = seeded(8);
    const amostra = (limiarMs) => {
      const responde = pessoa({ limiarMs, rng });
      const trials = [];
      for (const d of [400, 300, 240, 190, 150, 120, 95, 75, 60]) {
        for (let i = 0; i < 8; i++) trials.push({ delayMs: d, accuracy: responde(d), exposureMs: 100 });
      }
      return estimateThreshold(trials).t80;
    };
    const rapido = amostra(90);
    const lento = amostra(220);
    assert.ok(lento > rapido + 40, `${lento} deveria ser bem maior que ${rapido}`);
  });

  test('poucos dados não viram T80: primeiro é calibração', () => {
    const poucas = trialsEm(200, 3, 1).map((t) => ({ ...t, exposureMs: 100 }));
    const r = estimateThreshold(poucas);
    assert.equal(r.t80, null, 'estimou com três tentativas');
    assert.equal(r.confidence, 'baixa');
  });

  test('sem curva, as viradas da escada seguram a estimativa', () => {
    const poucas = trialsEm(150, 4, 1);
    const r = estimateThreshold(poucas, { reversals: [140, 160, 150, 155] });
    assert.ok(r.t80 > 130 && r.t80 < 170, `veio ${r.t80}`);
    assert.equal(r.source, 'escada');
  });

  test('a confiança cresce com tentativas e variedade de atrasos', () => {
    assert.equal(confidenceFor({ trials: 6, delays: 2, rmse: 0.05 }), 'baixa');
    assert.equal(confidenceFor({ trials: 25, delays: 3, rmse: 0.2 }), 'média');
    assert.equal(confidenceFor({ trials: 60, delays: 5, rmse: 0.05 }), 'alta');
  });

  test('o T80 sai inteiro, sem precisão falsa', () => {
    const rng = seeded(3);
    const responde = pessoa({ limiarMs: 137, rng });
    const trials = [];
    for (const d of [300, 220, 170, 130, 100, 70]) {
      for (let i = 0; i < 10; i++) trials.push({ delayMs: d, accuracy: responde(d), exposureMs: 90 });
    }
    const r = estimateThreshold(trials);
    assert.equal(r.t80, Math.round(r.t80), 'saiu com casa decimal');
  });

  test('a suavização segue o valor novo sem pular para ele', () => {
    assert.equal(smooth(null, 200), 200, 'a primeira leitura vale inteira');
    const s = smooth(200, 100);
    assert.ok(s < 200 && s > 100, `${s} deveria ficar no meio`);
    assert.equal(smooth(200, null), 200, 'sem leitura nova, mantém');
  });

  test('o índice normaliza por categoria em vez de somar milissegundos', () => {
    // 200 ms numa cena é bom; 200 ms em números não é. O índice tem de refletir.
    const cena = availabilityScore({ scenes: { t80: 200, confidence: 'alta' } });
    const numeros = availabilityScore({ numbers: { t80: 200, confidence: 'alta' } });
    assert.ok(cena > numeros, `cena ${cena} deveria valer mais que números ${numeros}`);
    assert.equal(availabilityScore({}), null);
    assert.ok(availabilityScore({ numbers: { t80: 40, confidence: 'alta' } }) <= 1000);
  });

  test('os atrasos são agrupados pelo valor pedido', () => {
    const bins = binByDelay([
      { delayMs: 100, accuracy: 1 }, { delayMs: 100, accuracy: 0 },
      { delayMs: 200, accuracy: 1 }, { delayMs: 200, accuracy: 1, warmup: true },
    ]);
    assert.deepEqual(bins.map((b) => [b.delayMs, b.trials, b.accuracy]), [[100, 2, 0.5], [200, 1, 1]]);
  });

  /* ------------------------------- decisão ------------------------------- */

  group('Disponibilidade — quando ela entra');

  test('o interruptor geral manda em todos os módulos', () => {
    const s = { enabled: false, preset: 'max', modules: { 'partial-report': 'on' } };
    assert.equal(isActiveFor(s, 'partial-report'), false, 'ligou com o geral desligado');
    assert.equal(isActiveFor({ ...s, enabled: true }, 'partial-report'), true);
  });

  test('cada módulo pode herdar, ligar ou desligar', () => {
    const s = { enabled: true, preset: 'balanced', modules: {} };
    assert.equal(isActiveFor(s, 'partial-report'), true, 'herdar deveria seguir o preset');
    assert.equal(isActiveFor({ ...s, modules: { 'partial-report': 'off' } }, 'partial-report'), false);
    assert.equal(isActiveFor({ ...s, preset: 'off', modules: { 'partial-report': 'on' } }, 'partial-report'), true);
  });

  test('módulos incompatíveis nunca usam disponibilidade', () => {
    const s = { enabled: true, preset: 'max', modules: { 'visual-threshold': 'on' } };
    assert.equal(isActiveFor(s, 'visual-threshold'), false);
    assert.equal(moduleSupportsAvailability('visual-threshold'), false);
    assert.ok(moduleSupportsAvailability('real-world'), 'o Mundo real precisa ser compatível');
  });

  test('mesmo ligada, nem toda tentativa compatível usa', () => {
    const rng = seeded(12);
    const s = { enabled: true, preset: 'balanced', modules: {} };
    let ativas = 0;
    for (let i = 0; i < 300; i++) {
      const p = planTrial({
        settings: s, moduleId: 'partial-report', trial: { stimulusType: 'digits', matrix: {} },
        state: null, calibrated: 99, rng,
      });
      if (p.active) ativas += 1;
    }
    const fracao = ativas / 300;
    const alvo = AVAILABILITY_PRESETS.balanced.share;
    assert.ok(Math.abs(fracao - alvo) < 0.09, `${fracao.toFixed(2)} longe de ${alvo}`);
    assert.ok(fracao < 1, 'usou em todas: perde a mistura com tentativas normais');
  });

  test('o atraso de disponibilidade ocupa a vaga do aviso, sem somar', () => {
    const trial = { cueDelayMs: 80, moduleId: 'partial-report' };
    applyToTrial(trial, { active: true, category: 'matrices', delayMs: 150, phase: 'training', mode: 'adaptive', cleanRetrieval: false });
    assert.equal(trial.cueDelayMs, 150, 'o atraso pedido não valeu');
    assert.equal(trial.availability.supersededCueDelayMs, 80, 'perdeu o registro do que substituiu');
  });

  test('a categoria sai do material, não do módulo', () => {
    assert.equal(categoryFor({ stimulusType: 'digits' }), 'numbers');
    assert.equal(categoryFor({ stimulusType: 'digits', matrix: {} }), 'matrices');
    assert.equal(categoryFor({ transfer: { familyId: 'map-diagram' } }), 'maps');
    assert.equal(categoryFor({ transfer: { familyId: 'document-fragment' } }), 'documents');
    for (const id of TRANSFER_CATEGORIES) assert.ok(CATEGORY_IDS.includes(id));
  });

  test('só a primeira pergunta conta para o limiar', () => {
    assert.equal(countsForThreshold({ queryIndex: 1 }), true);
    assert.equal(countsForThreshold({ queryIndex: 2 }), false, 'a segunda pergunta envolve retenção');
    assert.equal(countsForThreshold({ queryIndex: 1, warmup: true }), false);
  });

  test('no modo manual a escada não se mexe', () => {
    const estado = initialAvailabilityState({ initialDelayMs: 200 });
    const d = advance(estado, trialsEm(200, 8, 1), { mode: 'manual' });
    assert.equal(d.state.currentDelayMs, 200);
    assert.equal(d.changed, false);
  });

  test('a tentativa registrada separa disponibilidade de tempo de resposta', () => {
    const trial = {
      moduleId: 'partial-report',
      availability: { active: true, category: 'matrices', requestedDelayMs: 150, phase: 'training', mode: 'adaptive' },
    };
    const r = trialRecord({
      trial,
      result: { itemAccuracy: 0.75 },
      record: { timestamp: 'agora', actualExposureMs: 100, retrievalMs: 320 },
      timing: { actualMs: 151.4 },
    });
    assert.equal(r.delayMs, 150);
    assert.equal(r.actualDelayMs, 151.4, 'perdeu o tempo real da espera');
    assert.equal(r.retrievalMs, 320);
    assert.notEqual(r.delayMs, r.retrievalMs, 'as duas métricas não podem ser a mesma');
  });

  /* ------------------------------- sessão -------------------------------- */

  group('Disponibilidade — sessão');

  test('desligada, nada muda no ciclo da tentativa', async () => {
    store.setBackendForTesting();
    const resumo = await runModuleBlock(
      { moduleId: 'partial-report', trials: 12, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
      fakeView({ rng: seeded(1) }), createControl(), { seed: 4 },
    );
    assert.equal(resumo.availability, undefined, 'apareceu resumo sem estar ligada');
    assert.equal(store.getAvailabilityTrials('matrices').length, 0);
  });

  test('ligada, a sessão registra tentativas e estima o limiar', async () => {
    store.setBackendForTesting();
    store.updateAvailabilitySettings({ enabled: true, preset: 'max', initialDelayMs: 400, minDelayMs: 16, maxDelayMs: 900 });
    const rng = seeded(21);

    let resumo;
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      resumo = await runModuleBlock(
        { moduleId: 'partial-report', trials: 30, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
        fakeView({ limiarMs: 130, rng }), createControl(), { seed: 50 + i },
      );
    }

    assert.ok(resumo.availability, 'o bloco não devolveu resumo');
    assert.ok(resumo.availability.trials > 0);
    const estado = store.getAvailabilityState('matrices');
    assert.ok(estado.currentDelayMs < 400, `o atraso não desceu: ${estado.currentDelayMs}`);
    assert.ok(estado.estimatedT80 > 60 && estado.estimatedT80 < 320, `T80 fora do esperado: ${estado.estimatedT80}`);
    assert.ok(store.getAvailabilitySeries('matrices').length > 0, 'a série de evolução ficou vazia');
    assert.notEqual(resumo.availability.retrievalMs, resumo.availability.t80);
  });

  test('a exposição fica parada enquanto o atraso ainda procura o limiar', async () => {
    store.setBackendForTesting();
    store.updateAvailabilitySettings({ enabled: true, preset: 'max', initialDelayMs: 400, minDelayMs: 16, maxDelayMs: 900 });
    const resumo = await runModuleBlock(
      { moduleId: 'partial-report', trials: 40, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
      fakeView({ limiarMs: 130, rng: seeded(6) }), createControl(), { seed: 31 },
    );
    assert.equal(resumo.startingDifficulty.exposureMs, resumo.endingDifficulty.exposureMs,
      'exposição e atraso mudaram juntos: fica impossível ler o resultado');
  });

  test('o Mundo real mede por família e separa material novo', async () => {
    store.setBackendForTesting();
    store.updateAvailabilitySettings({ enabled: true, preset: 'max' });
    store.updateTransferSettings({ preset: 'transfer', lockedTier: 3 });
    const resumo = await runModuleBlock(
      { moduleId: 'real-world', trials: 40, preset: 'tryhard', adaptive: true, stimulus: 'scenes' },
      fakeView({ limiarMs: 240, rng: seeded(15) }), createControl(), { seed: 63 },
    );
    assert.ok(resumo.availability.trials > 0);
    const categorias = Object.keys(resumo.availability.categories);
    assert.ok(categorias.length >= 1);
    for (const id of categorias) assert.ok(CATEGORY_IDS.includes(id), `categoria estranha: ${id}`);
    const registradas = categorias.flatMap((c) => store.getAvailabilityTrials(c));
    assert.ok(registradas.some((t) => t.novel || t.holdout) || registradas.length > 0);
  });

  test('o benchmark mede sem ensinar: a escada de treino não se mexe', async () => {
    store.setBackendForTesting();
    store.updateAvailabilitySettings({ enabled: true, preset: 'max' });
    await runModuleBlock(
      { moduleId: 'partial-report', trials: 20, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
      fakeView({ limiarMs: 130, rng: seeded(2) }), createControl(), { seed: 70 },
    );
    const antes = { ...store.getAvailabilityState('matrices') };
    const guardadas = store.getAvailabilityTrials('matrices').length;

    const bench = await runModuleBlock(
      { moduleId: 'availability-benchmark', preset: 'tryhard', adaptive: false, stimulus: 'mixed' },
      fakeView({ limiarMs: 130, rng: seeded(9) }), createControl(), { seed: 71 },
    );
    assert.equal(bench.trials, AVAILABILITY_BENCHMARK_TRIALS);
    assert.equal(store.getAvailabilityState('matrices').currentDelayMs, antes.currentDelayMs,
      'o benchmark adaptou a escada');
    assert.equal(store.getAvailabilityTrials('matrices').length, guardadas,
      'o benchmark entrou no log de treino');

    const guardados = store.getAvailabilityBenchmarks();
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].kind, 'abstract');
    assert.ok(guardados[0].t80 === null || guardados[0].t80 > 0);
  });

  test('o benchmark do mundo real usa só material reservado', async () => {
    store.setBackendForTesting();
    const resumo = await runModuleBlock(
      { moduleId: 'real-world-availability', preset: 'tryhard', adaptive: false, stimulus: 'scenes' },
      fakeView({ limiarMs: 220, rng: seeded(17) }), createControl(), { seed: 44 },
    );
    assert.equal(resumo.trials, REAL_WORLD_AVAILABILITY_TRIALS);
    const guardados = store.getAvailabilityBenchmarks();
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].kind, 'realWorld');
    assert.equal(guardados[0].families.length, 5);
  });

  /* ---------------------------- linha de base ---------------------------- */

  group('Disponibilidade — linha de base do toque');

  test('a mediana ignora o toque distraído', () => {
    assert.equal(median([200, 210, 220]), 210);
    const r = summarizeMotorBaseline([210, 205, 215, 208, 212, 209, 3000, 40]);
    assert.equal(r.medianMs, 210, 'o toque de 3 s entrou na conta');
    assert.equal(r.valid, 6);
  });

  test('poucos toques válidos não viram linha de base', () => {
    assert.equal(summarizeMotorBaseline([210, 205]).medianMs, null);
  });

  /* ------------------------------ currículo ------------------------------ */

  group('Disponibilidade — currículo');

  test('os três eixos apontam o que treinar', () => {
    const rapidoESemTransferencia = {
      capture: 0.7, availability: 0.7, transfer: 0.2, detail: {},
    };
    assert.ok(recommendations(rapidoESemTransferencia).some((r) => r.action === 'transfer'));

    const capturaAltaLento = { capture: 0.8, availability: 0.2, transfer: 0.5, detail: {} };
    assert.ok(recommendations(capturaAltaLento).some((r) => r.action === 'availability'));

    const tudoBom = { capture: 0.7, availability: 0.7, transfer: 0.7, detail: {} };
    assert.ok(recommendations(tudoBom).some((r) => r.id === 'subir-tudo'));
  });

  test('sem dados, o currículo não inventa recomendação', () => {
    store.setBackendForTesting();
    const estado = cognitiveState();
    assert.equal(estado.availability, null);
    assert.deepEqual(recommendations(estado).map((r) => r.id), ['coletar']);
  });

  test('a lacuna de disponibilidade vira recomendação de variedade', () => {
    const estado = { capture: 0.5, availability: 0.5, transfer: 0.5, detail: { availabilityGapMs: 90 } };
    const r = recommendations(estado);
    assert.ok(r.some((x) => x.id === 'lacuna-disponibilidade'));
  });

  test('o eixo mais fraco pede mais peso, sem zerar os outros', () => {
    const pesos = suggestedWeights({ capture: 0.9, availability: 0.2, transfer: 0.6, detail: {} });
    assert.ok(pesos.availability > pesos.capture);
    assert.ok(pesos.capture > 0, 'zerou um eixo');
    assert.equal(levelOf(null), 'sem dados');
  });

  /* ---------------------------- persistência ----------------------------- */

  group('Disponibilidade — persistência');

  test('o estado entra na exportação e volta na importação', () => {
    store.setBackendForTesting();
    store.updateAvailabilitySettings({ enabled: true, preset: 'intensive', cleanRetrieval: true });
    store.setAvailabilityForModule('iconic-readout', 'off');
    store.recordAvailabilityTrial({
      timestamp: new Date().toISOString(), moduleId: 'iconic-readout', category: 'matrices',
      delayMs: 150, actualDelayMs: 151, accuracy: 0.8, exposureMs: 100, retrievalMs: 300, queryIndex: 1,
    });

    const copia = store.exportAll();
    store.setBackendForTesting();
    assert.equal(store.getAvailabilitySettings().enabled, false);

    store.importAll(copia);
    assert.equal(store.getAvailabilitySettings().preset, 'intensive');
    assert.equal(store.getAvailabilitySettings().cleanRetrieval, true);
    assert.equal(store.getAvailabilitySettings().modules['iconic-readout'], 'off');
    assert.equal(store.getAvailabilityTrials('matrices').length, 1);
  });

  test('o log por categoria é limitado', () => {
    store.setBackendForTesting();
    for (let i = 0; i < AVAILABILITY_CONFIG.maxStoredTrialsPerCategory + 30; i++) {
      store.recordAvailabilityTrial({
        timestamp: new Date().toISOString(), moduleId: 'partial-report', category: 'numbers',
        delayMs: 150, accuracy: 1, exposureMs: 100, queryIndex: 1,
      });
    }
    assert.equal(store.getAvailabilityTrials('numbers').length, AVAILABILITY_CONFIG.maxStoredTrialsPerCategory);
  });

  test('o recorde exige curva e dados, não uma sorte isolada', () => {
    store.setBackendForTesting();
    store.recordAvailabilityTrial({
      timestamp: new Date().toISOString(), moduleId: 'partial-report', category: 'numbers',
      delayMs: 20, accuracy: 1, exposureMs: 100, queryIndex: 1,
    });
    const fechado = store.closeAvailabilityCategory('numbers');
    assert.equal(fechado.bestStableT80, null, 'uma tentativa virou recorde');
  });
}
