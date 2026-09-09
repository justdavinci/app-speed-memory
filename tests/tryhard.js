// Testes da área Try Hard. Recebem os utilitários do arquivo principal para
// manter um único comando (`npm test`).

import assert from 'node:assert/strict';

import { EXPOSURE_LADDER, MODULE_IDS, MODULE_SPECS, DEFAULT_ROUTINE, TRY_HARD_CONFIG } from '../assets/js/tryhard/config.js';
import { seeded, rInt } from '../assets/js/tryhard/rng.js';
import {
  achievableMs, framesFor, isBelowFrame, setFrameMsForTesting, getFrameMs,
} from '../assets/js/tryhard/timing.js';
import {
  dimensionsOf, evaluate, initialState, moveDimension, needsRecalibration,
  rollingAccuracy, step, difficultyDelta, atLimit,
} from '../assets/js/tryhard/difficulty.js';
import {
  calculateConsistency, calculateThroughput, comparePositional, compareUnordered,
  calculatePersonalBests, detectFatigue, itemAccuracy, summarizeTrials,
} from '../assets/js/tryhard/metrics.js';
import {
  generateMatrix, generateMask, generateCue, generateItems, generateSpatialConfiguration,
  isHighlyCompressible, regionCells, withSeed,
} from '../assets/js/tryhard/stimuli.js';
import { SYMBOL_IDS, symbolSvg } from '../assets/js/tryhard/symbols.js';
import { getModule, MODULES, BENCHMARK_TRIALS } from '../assets/js/tryhard/modules/index.js';
import * as store from '../assets/js/tryhard/store.js';
import { blockBudget, createControl, difficultyForBlock, fixationDuration, runModuleBlock } from '../assets/js/tryhard/runner.js';

/** Interface falsa: responde com a precisão pedida, sem navegador. */
function fakeView({ ability = 1, onTrial } = {}) {
  return {
    setPhase() {}, setProgress() {}, setSessionProgress() {}, showCue() {},
    showCountdown: async () => {},
    showFixation: async () => {},
    prepareStimulus: async (trial) => ({ trial }),
    presentStimulus: async (prepared, trial) => ({
      requestedMs: trial.exposureMs, actualMs: trial.exposureMs, frames: 3, aborted: false,
    }),
    waitBlank: async () => {},
    showMask: async () => {},
    collectResponse: async (trial) => {
      onTrial?.(trial);
      return {
        items: trial.expected.map((v) => (Math.random() < ability ? v : '__erro__')),
        reactionMs: 800,
      };
    },
    showFeedback: async () => {},
    showModuleSummary: async () => 'next',
    showInvalid: async () => {},
    watchInvalidation: () => ({ invalid: false, stop() {} }),
  };
}

export function register({ test, group }) {
  if (!global.performance) global.performance = { now: () => Date.now() };

  /* ----------------------------- configuração --------------------------- */

  group('Try Hard — configuração');

  test('todos os módulos declarados têm implementação registrada', () => {
    for (const id of MODULE_IDS) {
      assert.ok(MODULES[id], `sem implementação para ${id}`);
      assert.equal(typeof MODULES[id].generate, 'function');
      assert.equal(typeof MODULES[id].score, 'function');
    }
    assert.equal(Object.keys(MODULES).length, MODULE_IDS.length);
  });

  test('a rotina padrão soma 40 minutos em 6 exercícios', () => {
    assert.equal(DEFAULT_ROUTINE.modules.length, 6);
    assert.equal(DEFAULT_ROUTINE.modules.reduce((a, m) => a + m.minutes, 0), 40);
    for (const block of DEFAULT_ROUTINE.modules) {
      assert.ok(MODULE_SPECS[block.moduleId], `módulo desconhecido na rotina: ${block.moduleId}`);
    }
  });

  test('cada dimensão de dificuldade declara direção e limites', () => {
    for (const id of MODULE_IDS) {
      for (const dim of dimensionsOf(id)) {
        assert.ok(['up', 'down'].includes(dim.harder), `${id}.${dim.key} sem direção`);
        assert.ok(dim.label, `${id}.${dim.key} sem rótulo`);
        if (dim.kind === 'ladder') assert.ok(dim.values.length > 1);
        else assert.ok(dim.max > dim.min);
      }
    }
  });

  test('a escalada de cada módulo só cita dimensões existentes', () => {
    for (const id of MODULE_IDS) {
      const keys = dimensionsOf(id).map((d) => d.key);
      for (const key of MODULE_SPECS[id].escalation || []) {
        assert.ok(keys.includes(key), `${id}: escalada cita ${key}, que não é dimensão`);
      }
    }
  });

  /* ------------------------------ temporização -------------------------- */

  group('Try Hard — temporização');

  test('nenhuma exposição fica abaixo de um quadro da tela', () => {
    setFrameMsForTesting(16.7);
    for (const ms of [1, 5, 8, 16]) {
      assert.equal(framesFor(ms), 1, `${ms}ms deveria virar um quadro`);
      assert.ok(achievableMs(ms) >= 16.6);
      assert.ok(isBelowFrame(ms) || ms >= 16.7);
    }
  });

  test('a duração pedida é arredondada para o quadro mais próximo', () => {
    setFrameMsForTesting(16.7);
    assert.equal(framesFor(50), 3);
    assert.equal(framesFor(100), 6);
    assert.ok(Math.abs(achievableMs(50) - 50.1) < 0.2);
  });

  test('telas mais rápidas entregam exposições mais curtas', () => {
    setFrameMsForTesting(8.33);
    assert.ok(achievableMs(8) < 9);
    assert.equal(framesFor(50), 6);
    setFrameMsForTesting(16.7);
  });

  test('a escala de exposição é crescente e começa em 8 ms', () => {
    assert.equal(EXPOSURE_LADDER[0], 8);
    for (let i = 1; i < EXPOSURE_LADDER.length; i++) {
      assert.ok(EXPOSURE_LADDER[i] > EXPOSURE_LADDER[i - 1]);
    }
  });

  /* ------------------------------ dificuldade --------------------------- */

  group('Try Hard — motor de dificuldade');

  test('subir a dificuldade encurta a exposição primeiro', () => {
    const state = initialState('partial-report');
    const moved = step('partial-report', state, 'harder', 0);
    assert.equal(moved.changed.key, 'exposureMs');
    assert.ok(moved.state.exposureMs < state.exposureMs);
  });

  test('a escalada muda uma dimensão por vez, na ordem declarada', () => {
    let state = initialState('partial-report');
    let cursor = 0;
    const mudadas = [];
    for (let i = 0; i < 5; i++) {
      const moved = step('partial-report', state, 'harder', cursor);
      const antes = { ...state };
      state = moved.state;
      cursor = moved.cursor;
      mudadas.push(moved.changed.key);
      const diferentes = Object.keys(state).filter((k) => state[k] !== antes[k]);
      assert.equal(diferentes.length, 1, 'mais de uma dimensão mudou de uma vez');
    }
    assert.deepEqual(mudadas.slice(0, 3), MODULE_SPECS['partial-report'].escalation.slice(0, 3));
  });

  test('dimensões respeitam os limites e não passam do fim da escala', () => {
    const dim = dimensionsOf('partial-report').find((d) => d.key === 'exposureMs');
    let value = dim.values[0];
    for (let i = 0; i < 50; i++) value = moveDimension(dim, value, 'harder').value;
    assert.equal(value, dim.values[0], 'passou do degrau mais difícil');
    assert.ok(atLimit(dim, value, 'harder'));

    const linhas = dimensionsOf('partial-report').find((d) => d.key === 'matrixRows');
    let rows = linhas.start;
    for (let i = 0; i < 50; i++) rows = moveDimension(linhas, rows, 'harder').value;
    assert.equal(rows, linhas.max);
  });

  test('acerto alto sobe, acerto baixo desce e a zona alvo mantém', () => {
    const skill = { state: initialState('mask-resistance'), cursor: 0, trialsSinceChange: 99, calibrating: false };
    const trials = (acc) => Array.from({ length: 8 }, () => ({ itemAccuracy: acc }));
    assert.equal(evaluate('mask-resistance', skill, trials(0.95)).decision, 'harder');
    assert.equal(evaluate('mask-resistance', skill, trials(0.30)).decision, 'easier');
    assert.equal(evaluate('mask-resistance', skill, trials(0.78)).decision, 'hold');
  });

  test('uma tentativa isolada não muda a dificuldade', () => {
    const skill = { state: initialState('partial-report'), cursor: 0, trialsSinceChange: 99, calibrating: false };
    const decision = evaluate('partial-report', skill, [{ itemAccuracy: 1 }]);
    assert.equal(decision.decision, 'wait');
    assert.deepEqual(decision.state, skill.state);
  });

  test('acerto e erro alternados não fazem a dificuldade ir e voltar', () => {
    // Alternar 1 e 0 dá 50% estável, abaixo da zona alvo: o certo é aliviar
    // sempre na mesma direção, nunca subir e descer a cada tentativa.
    let skill = { state: initialState('partial-report'), cursor: 0, trialsSinceChange: 99, calibrating: false };
    const trials = [];
    const direcoes = [];
    for (let i = 0; i < 40; i++) {
      trials.push({ itemAccuracy: i % 2 ? 1 : 0 });
      const decision = evaluate('partial-report', skill, trials);
      if (decision.changed) direcoes.push(decision.changed.direction);
      skill = {
        state: decision.state,
        cursor: decision.cursor,
        calibrating: false,
        trialsSinceChange: decision.changed ? 0 : (skill.trialsSinceChange + 1),
      };
    }
    const inversoes = direcoes.filter((d, i) => i > 0 && d !== direcoes[i - 1]).length;
    assert.equal(inversoes, 0, `a direção mudou ${inversoes} vezes: isso é oscilação`);
    assert.ok(direcoes.every((d) => d === 'easier'), '50% de acerto deveria aliviar, não endurecer');
  });

  test('variação dentro da zona alvo não mexe na dificuldade', () => {
    let skill = { state: initialState('partial-report'), cursor: 0, trialsSinceChange: 99, calibrating: false };
    const trials = [];
    let mudancas = 0;
    for (let i = 0; i < 40; i++) {
      trials.push({ itemAccuracy: i % 2 ? 1 : 0.6 });   // média 0,8: dentro da zona
      const decision = evaluate('partial-report', skill, trials);
      if (decision.changed) mudancas += 1;
      skill = {
        state: decision.state,
        cursor: decision.cursor,
        calibrating: false,
        trialsSinceChange: decision.changed ? 0 : (skill.trialsSinceChange + 1),
      };
    }
    assert.equal(mudancas, 0, `desempenho na zona alvo mexeu na dificuldade ${mudancas} vezes`);
  });

  test('mudanças respeitam o intervalo mínimo entre ajustes', () => {
    const skill = { state: initialState('partial-report'), cursor: 0, trialsSinceChange: 1, calibrating: false };
    const trials = Array.from({ length: 8 }, () => ({ itemAccuracy: 1 }));
    assert.equal(evaluate('partial-report', skill, trials).decision, 'wait');
  });

  test('tentativas invalidadas não entram na média móvel', () => {
    const trials = [
      { itemAccuracy: 1 }, { itemAccuracy: 1 },
      { invalid: true, itemAccuracy: 0 },
      { itemAccuracy: 1 }, { itemAccuracy: 1 },
    ];
    assert.equal(rollingAccuracy(trials, 8), 1);
  });

  test('recalibração é sugerida quando a pessoa foge da região alvo', () => {
    const alto = Array.from({ length: TRY_HARD_CONFIG.recalibrationWindow }, () => ({ itemAccuracy: 0.98 }));
    const baixo = Array.from({ length: TRY_HARD_CONFIG.recalibrationWindow }, () => ({ itemAccuracy: 0.2 }));
    const meio = Array.from({ length: TRY_HARD_CONFIG.recalibrationWindow }, () => ({ itemAccuracy: 0.78 }));
    assert.equal(needsRecalibration(alto), 'harder');
    assert.equal(needsRecalibration(baixo), 'easier');
    assert.equal(needsRecalibration(meio), null);
  });

  test('a variação de dificuldade é positiva ao endurecer', () => {
    const antes = initialState('partial-report');
    const depois = step('partial-report', antes, 'harder', 0).state;
    assert.ok(difficultyDelta('partial-report', antes, depois) > 0);
    assert.ok(difficultyDelta('partial-report', depois, antes) < 0);
  });

  /* -------------------------------- métricas ---------------------------- */

  group('Try Hard — métricas');

  test('itemAccuracy conta acerto parcial', () => {
    assert.equal(itemAccuracy(7, 8), 0.875);
    assert.equal(itemAccuracy(0, 8), 0);
    assert.equal(itemAccuracy(0, 0), 0);
  });

  test('comparação posicional distingue sequência exata de itens certos', () => {
    const r = comparePositional(['7', 'K', '3', 'M'], ['7', 'K', 'X', 'M']);
    assert.equal(r.correct, 3);
    assert.equal(r.itemAccuracy, 0.75);
    assert.ok(!r.exact);
  });

  test('comparação sem ordem não conta a mesma resposta duas vezes', () => {
    const r = compareUnordered(['A', 'B', 'C'], ['C', 'A', 'A']);
    assert.equal(r.correct, 2);
    assert.deepEqual(r.extra, ['A']);
    assert.ok(!r.exact);
  });

  test('o throughput cresce com velocidade e acerto, sem explodir', () => {
    const base = { correctItems: 6, totalItems: 6, stimulusType: 'mixed' };
    const lento = calculateThroughput({ ...base, exposureMs: 1000 });
    const rapido = calculateThroughput({ ...base, exposureMs: 20 });
    const extremo = calculateThroughput({ ...base, exposureMs: 0.0001 });
    assert.ok(rapido > lento);
    assert.ok(extremo <= 1000, 'exposição tendendo a zero não pode estourar a escala');
    assert.equal(calculateThroughput({ ...base, correctItems: 0, exposureMs: 20 }), 0);
  });

  test('acerto parcial vale menos que acerto total no mesmo tempo', () => {
    const cheio = calculateThroughput({ correctItems: 8, totalItems: 8, exposureMs: 50, stimulusType: 'digits' });
    const meio = calculateThroughput({ correctItems: 4, totalItems: 8, exposureMs: 50, stimulusType: 'digits' });
    assert.ok(cheio > meio * 1.5);
  });

  test('mais itens no mesmo tempo e acerto valem mais', () => {
    const poucos = calculateThroughput({ correctItems: 4, totalItems: 4, exposureMs: 50, stimulusType: 'digits' });
    const muitos = calculateThroughput({ correctItems: 10, totalItems: 10, exposureMs: 50, stimulusType: 'digits' });
    assert.ok(muitos > poucos);
  });

  test('consistência compara dentro da mesma dificuldade', () => {
    const estavel = Array.from({ length: 6 }, () => ({ itemAccuracy: 0.8, difficulty: { exposureMs: 100 } }));
    const oscilante = [1, 0, 1, 0, 1, 0].map((v) => ({ itemAccuracy: v, difficulty: { exposureMs: 100 } }));
    assert.ok(calculateConsistency(estavel) > 0.9);
    assert.ok(calculateConsistency(oscilante) < 0.2);
    // progressão de dificuldade não deve ser punida como inconsistência
    const progredindo = [
      ...Array.from({ length: 4 }, () => ({ itemAccuracy: 0.9, difficulty: { exposureMs: 200 } })),
      ...Array.from({ length: 4 }, () => ({ itemAccuracy: 0.6, difficulty: { exposureMs: 50 } })),
    ];
    assert.ok(calculateConsistency(progredindo) > 0.8);
  });

  test('recorde de exposição exige precisão mínima', () => {
    const ruim = calculatePersonalBests({}, { itemAccuracy: 0.4, actualExposureMs: 20, totalItems: 6, throughput: 100 });
    assert.equal(ruim.best.bestExposureMs, undefined, 'sorte no escuro não pode virar recorde');
    const bom = calculatePersonalBests({}, { itemAccuracy: 0.9, actualExposureMs: 20, totalItems: 6, throughput: 100 });
    assert.equal(bom.best.bestExposureMs, 20);
    assert.ok(bom.beaten.includes('bestExposureMs'));
  });

  test('queda de desempenho é detectada só com amostra suficiente', () => {
    const antes = Array.from({ length: 20 }, () => ({ itemAccuracy: 0.9 }));
    const depois = Array.from({ length: 20 }, () => ({ itemAccuracy: 0.6 }));
    assert.ok(detectFatigue([...antes, ...depois]));
    assert.equal(detectFatigue(antes), null, 'sem histórico anterior não há comparação');
    assert.equal(detectFatigue([...antes, ...antes]), null, 'desempenho estável não é fadiga');
  });

  test('o resumo agrega itens, precisão e melhor exposição', () => {
    const s = summarizeTrials([
      { itemAccuracy: 1, correctItems: 4, totalItems: 4, exact: true, actualExposureMs: 50, throughput: 500 },
      { itemAccuracy: 0.5, correctItems: 2, totalItems: 4, exact: false, actualExposureMs: 40, throughput: 200 },
      { invalid: true },
    ]);
    assert.equal(s.trials, 2);
    assert.equal(s.invalid, 1);
    assert.equal(s.accuracy, 0.75);
    assert.equal(s.bestExposureMs, 50, 'a tentativa de 40ms teve precisão baixa demais para contar');
  });

  /* -------------------------------- estímulos --------------------------- */

  group('Try Hard — geradores de estímulo');

  test('a matriz tem o tamanho pedido e posições coerentes', () => {
    const m = generateMatrix({ rows: 3, cols: 4, type: 'mixed', rng: seeded(1) });
    assert.equal(m.cells.length, 12);
    m.cells.forEach((c, i) => {
      assert.equal(c.index, i);
      assert.equal(c.row, Math.floor(i / 4));
      assert.equal(c.col, i % 4);
    });
  });

  test('as regiões devolvem exatamente as células daquela área', () => {
    const m = generateMatrix({ rows: 3, cols: 4, type: 'digits', rng: seeded(2) });
    assert.equal(regionCells(m, { kind: 'row', index: 1 }).length, 4);
    assert.equal(regionCells(m, { kind: 'col', index: 2 }).length, 3);
    const q = regionCells(m, { kind: 'quadrant', index: 0 });
    assert.ok(q.every((c) => c.row < 2 && c.col < 2));
  });

  test('o aviso sorteado é sempre válido para a matriz', () => {
    const rng = seeded(3);
    for (let i = 0; i < 50; i++) {
      const m = generateMatrix({ rows: 3, cols: 4, type: 'digits', rng });
      const cue = generateCue(m, { rng });
      const cells = regionCells(m, cue);
      assert.ok(cells.length > 0, 'região vazia');
      if (cue.kind === 'row') assert.ok(cue.index < m.rows);
      if (cue.kind === 'col') assert.ok(cue.index < m.cols);
    }
  });

  test('a máscara nunca contém itens do estímulo', () => {
    const rng = seeded(4);
    for (let i = 0; i < 30; i++) {
      const items = generateItems('digits', 6, { rng });
      const mask = generateMask({ length: 6, complexity: 2, rng, exclude: items });
      assert.equal(mask.chars.length, 6);
      assert.ok(!mask.chars.some((c) => items.includes(c)), 'máscara vazou a resposta');
    }
  });

  test('sequências muito compressíveis são reconhecidas', () => {
    assert.ok(isHighlyCompressible('123456'.split('')));
    assert.ok(isHighlyCompressible('111111'.split('')));
    assert.ok(isHighlyCompressible('202020'.split('')));
    assert.ok(!isHighlyCompressible('849170'.split('')));
  });

  test('o benchmark evita sequências compressíveis', () => {
    const rng = seeded(5);
    for (let i = 0; i < 60; i++) {
      const items = generateItems('digits', 6, { rng, avoidCompressible: true });
      assert.ok(!isHighlyCompressible(items), `gerou padrão fácil: ${items.join('')}`);
    }
  });

  test('as posições periféricas ficam dentro do círculo e se espalham', () => {
    const pos = generateSpatialConfiguration({ count: 6, distance: 0.7, rng: seeded(6) });
    assert.equal(pos.length, 6);
    for (const p of pos) {
      assert.ok(Math.hypot(p.x, p.y) <= 1.01, 'item fora da área');
    }
    const angulos = pos.map((p) => p.angle).sort((a, b) => a - b);
    const distintos = new Set(angulos.map((a) => Math.round(a * 10))).size;
    assert.ok(distintos >= 4, 'itens amontoados no mesmo lado');
  });

  test('os símbolos abstratos são desenhados e não se repetem na série', () => {
    assert.ok(SYMBOL_IDS.length >= 12);
    for (const id of SYMBOL_IDS) {
      const svg = symbolSvg(id, { size: 40 });
      assert.ok(svg.includes('<path'), `${id} sem traçado`);
    }
    const serie = generateItems('symbols', 6, { rng: seeded(7) });
    assert.equal(new Set(serie).size, 6);
  });

  test('o mesmo seed reproduz o mesmo estímulo', () => {
    const a = withSeed(99).matrix({ rows: 2, cols: 3, type: 'digits' });
    const b = withSeed(99).matrix({ rows: 2, cols: 3, type: 'digits' });
    assert.deepEqual(a.cells.map((c) => c.value), b.cells.map((c) => c.value));
  });

  /* --------------------------------- módulos ---------------------------- */

  group('Try Hard — módulos');

  test('cada módulo gera uma tentativa coerente e corrige o acerto total', () => {
    const rng = seeded(8);
    for (const id of MODULE_IDS) {
      const mod = getModule(id);
      const spec = MODULE_SPECS[id];
      const trial = mod.generate({
        difficulty: initialState(id),
        stimulus: spec.defaultStimulus,
        rng,
        settings: { masking: true },
        trialIndex: 0,
      });
      assert.ok(trial.expected.length > 0, `${id}: sem resposta esperada`);
      assert.equal(trial.totalItems, trial.expected.length, `${id}: contagem de itens inconsistente`);
      assert.ok(trial.exposureMs > 0, `${id}: sem exposição`);
      assert.ok(trial.response?.kind, `${id}: sem widget de resposta`);

      const certo = mod.score(trial, trial.expected);
      assert.equal(certo.itemAccuracy, 1, `${id}: acerto total não pontuou`);
      assert.ok(certo.exact);

      const errado = mod.score(trial, trial.expected.map(() => '__erro__'));
      assert.equal(errado.itemAccuracy, 0, `${id}: erro total pontuou`);
    }
  });

  test('o Partial Report só define a região depois de montar a matriz', () => {
    const rng = seeded(9);
    const mod = getModule('partial-report');
    const regioes = new Set();
    for (let i = 0; i < 40; i++) {
      const trial = mod.generate({ difficulty: { exposureMs: 150, matrixRows: 3, matrixColumns: 4, cueDelayMs: 0 }, stimulus: 'mixed', rng });
      assert.ok(trial.cueLabel, 'sem rótulo da região');
      assert.equal(trial.expected.length, trial.highlight.length);
      regioes.add(trial.cueLabel);
    }
    assert.ok(regioes.size >= 3, 'a região pedida deveria variar');
  });

  test('o retrocue usa o atraso configurado', () => {
    const trial = getModule('partial-report').generate({
      difficulty: { exposureMs: 100, matrixRows: 3, matrixColumns: 4, cueDelayMs: 250 },
      stimulus: 'digits',
      rng: seeded(10),
    });
    assert.equal(trial.cueDelayMs, 250);
  });

  test('a máscara pode ser desligada nos ajustes', () => {
    const base = { difficulty: { exposureMs: 100, maskDelayMs: 100, stimulusCount: 5, maskComplexity: 1 }, stimulus: 'digits', rng: seeded(11) };
    const com = getModule('mask-resistance').generate({ ...base, settings: { masking: true } });
    const sem = getModule('mask-resistance').generate({ ...base, settings: { masking: false } });
    assert.ok(com.mask);
    assert.equal(sem.mask, null);
    assert.equal(sem.maskDelayMs, 0);
  });

  test('o benchmark tem protocolo fixo de 20 tentativas em 4 blocos', () => {
    const rng = seeded(12);
    const mod = getModule('benchmark');
    assert.equal(mod.adaptive, false);
    assert.equal(BENCHMARK_TRIALS, 20);
    const blocos = {};
    for (let i = 0; i < BENCHMARK_TRIALS; i++) {
      const trial = mod.generate({ trialIndex: i, rng, settings: {} });
      blocos[trial.benchmarkBlock] = (blocos[trial.benchmarkBlock] || 0) + 1;
      assert.equal(trial.protocolVersion, TRY_HARD_CONFIG.benchmarkProtocolVersion);
    }
    assert.deepEqual(blocos, { sequence: 5, matrix: 5, symbols: 5, readout: 5 });
  });

  test('o benchmark varia o conteúdo mantendo a estrutura', () => {
    const mod = getModule('benchmark');
    const a = mod.generate({ trialIndex: 0, rng: seeded(1), settings: {} });
    const b = mod.generate({ trialIndex: 0, rng: seeded(2), settings: {} });
    assert.equal(a.exposureMs, b.exposureMs, 'a dificuldade do protocolo não pode variar');
    assert.equal(a.totalItems, b.totalItems);
    assert.notDeepEqual(a.expected, b.expected, 'o conteúdo deveria mudar entre os dias');
  });

  /* ------------------------------ persistência --------------------------- */

  group('Try Hard — persistência');

  test('a primeira visita traz rotina padrão e módulos em calibração', () => {
    store.setBackendForTesting();
    const routine = store.getActiveRoutine();
    assert.equal(routine.modules.length, 6);
    const skill = store.getSkill('partial-report');
    assert.ok(skill.calibrating);
    assert.deepEqual(skill.state, initialState('partial-report'));
  });

  test('tentativas alimentam recordes, agregado do dia e histórico', () => {
    store.setBackendForTesting();
    const now = new Date().toISOString();
    for (let i = 0; i < 3; i++) {
      store.recordTrial('partial-report', {
        timestamp: now, itemAccuracy: 1, correctItems: 4, totalItems: 4,
        actualExposureMs: 60 - i * 10, requestedExposureMs: 60, throughput: 500 + i,
        difficulty: { exposureMs: 60, matrixRows: 2, matrixColumns: 3 }, exact: true,
      });
    }
    const stats = store.getModuleStats('partial-report');
    assert.equal(stats.trialsDone, 3);
    assert.equal(stats.accuracy, 1);
    assert.equal(stats.bests.bestExposureMs, 40);
    assert.equal(stats.bests.bestMatrix, '2 × 3');
    assert.equal(store.getDailySeries('partial-report').length, 1);
  });

  test('tentativas invalidadas não contam como erro nem entram nos recordes', () => {
    store.setBackendForTesting();
    store.recordTrial('partial-report', { timestamp: new Date().toISOString(), invalid: true, difficulty: {} });
    const stats = store.getModuleStats('partial-report');
    assert.equal(stats.trialsDone, 0);
    assert.equal(stats.accuracy, null);
    assert.equal(store.getDailySeries('partial-report').length, 0);
  });

  test('o log de tentativas é limitado para não crescer sem fim', () => {
    store.setBackendForTesting();
    const now = new Date().toISOString();
    for (let i = 0; i < TRY_HARD_CONFIG.maxStoredTrialsPerModule + 50; i++) {
      store.recordTrial('mask-resistance', {
        timestamp: now, itemAccuracy: 1, correctItems: 5, totalItems: 5,
        actualExposureMs: 80, throughput: 400, difficulty: {}, exact: true,
      });
    }
    assert.equal(store.getTrials('mask-resistance').length, TRY_HARD_CONFIG.maxStoredTrialsPerModule);
  });

  test('rotinas podem ser salvas e o padrão restaurado', () => {
    store.setBackendForTesting();
    const custom = { id: 'minha', name: 'Minha rotina', modules: [{ moduleId: 'partial-report', minutes: 5, preset: 'tryhard', adaptive: true, stimulus: 'digits' }] };
    store.saveRoutine(custom);
    assert.equal(store.getActiveRoutine().id, 'minha');
    assert.equal(store.getActiveRoutine().modules.length, 1);
    store.restoreDefaultRoutine();
    assert.equal(store.getActiveRoutine().id, 'default');
    assert.equal(store.getActiveRoutine().modules.length, 6);
  });

  test('a sequência de dias conta treinos consecutivos', () => {
    store.setBackendForTesting();
    const hoje = new Date().toISOString();
    store.addSession({ id: 'a', startedAt: hoje, completedAt: hoje, durationMs: 1000, trials: 5, modules: [] });
    assert.equal(store.getStreak().current, 1);
    store.addSession({ id: 'b', startedAt: hoje, completedAt: hoje, durationMs: 1000, trials: 5, modules: [] });
    assert.equal(store.getStreak().current, 1, 'dois treinos no mesmo dia não contam duas vezes');
  });

  test('exportar e importar preserva o estado do Try Hard', () => {
    store.setBackendForTesting();
    store.updateSettings({ feedback: 'minimal' });
    store.recordTrial('abstract-flash', {
      timestamp: new Date().toISOString(), itemAccuracy: 1, correctItems: 3, totalItems: 3,
      actualExposureMs: 120, throughput: 300, difficulty: {}, exact: true,
    });
    const dump = store.exportAll();
    store.setBackendForTesting();
    assert.equal(store.getSettings().feedback, 'full');
    store.importAll(dump);
    assert.equal(store.getSettings().feedback, 'minimal');
    assert.equal(store.getModuleStats('abstract-flash').trialsDone, 1);
  });

  /* --------------------------------- sessão ------------------------------ */

  group('Try Hard — sessão');

  test('o orçamento do bloco respeita tempo, tentativas ou modo livre', () => {
    assert.deepEqual(blockBudget({ minutes: 5 }, 'partial-report'), { kind: 'time', durationMs: 300000 });
    assert.deepEqual(blockBudget({ trials: 20 }, 'partial-report'), { kind: 'trials', trials: 20 });
    assert.deepEqual(blockBudget({ unlimited: true }, 'partial-report'), { kind: 'unlimited' });
    assert.deepEqual(blockBudget({ minutes: 2 }, 'benchmark'), { kind: 'trials', trials: 20 },
      'o benchmark segue o protocolo, não o relógio');
  });

  test('a fixação varia dentro da faixa e respeita valor fixo', () => {
    const rng = seeded(13);
    for (let i = 0; i < 40; i++) {
      const ms = fixationDuration({}, rng);
      assert.ok(ms >= TRY_HARD_CONFIG.fixationMinMs && ms <= TRY_HARD_CONFIG.fixationMaxMs);
    }
    assert.equal(fixationDuration({ fixationMs: 500 }, rng), 500);
  });

  test('o preset Insano começa mais difícil que o Try Hard', () => {
    const skill = { state: initialState('partial-report'), cursor: 0 };
    const normal = difficultyForBlock('partial-report', { preset: 'tryhard' }, skill);
    const insano = difficultyForBlock('partial-report', { preset: 'insane' }, skill);
    const aquecimento = difficultyForBlock('partial-report', { preset: 'warmup' }, skill);
    assert.ok(difficultyDelta('partial-report', normal, insano) > 0);
    assert.ok(difficultyDelta('partial-report', normal, aquecimento) < 0);
  });

  test('o modo manual usa os parâmetros escolhidos', () => {
    const skill = { state: initialState('partial-report'), cursor: 0 };
    const manual = difficultyForBlock('partial-report', { manual: true, difficulty: { exposureMs: 30 } }, skill);
    assert.equal(manual.exposureMs, 30);
  });

  test('uma sessão completa registra tentativas, resumo e progresso', async () => {
    store.setBackendForTesting();
    const control = createControl();
    const resumo = await runModuleBlock(
      { moduleId: 'peripheral-matrix', trials: 12, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
      fakeView({ ability: 1 }), control, { seed: 21 },
    );
    assert.equal(resumo.trials, 12);
    assert.equal(resumo.accuracy, 1);
    assert.ok(resumo.throughput > 0);
    assert.equal(store.getModuleStats('peripheral-matrix').trialsDone, 12);
    assert.ok(resumo.completedAt);
  });

  test('desempenho alto durante a sessão endurece a dificuldade', async () => {
    store.setBackendForTesting();
    const antes = { ...store.getSkill('partial-report').state };
    await runModuleBlock(
      { moduleId: 'partial-report', trials: 20, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
      fakeView({ ability: 1 }), createControl(), { seed: 22 },
    );
    const depois = store.getSkill('partial-report').state;
    assert.ok(difficultyDelta('partial-report', antes, depois) > 0, 'acertar tudo deveria endurecer');
  });

  test('desempenho baixo alivia a dificuldade', async () => {
    store.setBackendForTesting();
    // parte de uma dificuldade já alta, para haver espaço para descer
    const duro = step('partial-report', initialState('partial-report'), 'harder', 0);
    store.updateSkill('partial-report', { state: duro.state, cursor: duro.cursor, calibrating: false, trialsSinceChange: 99 });
    const antes = { ...store.getSkill('partial-report').state };
    await runModuleBlock(
      { moduleId: 'partial-report', trials: 20, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
      fakeView({ ability: 0 }), createControl(), { seed: 23 },
    );
    const depois = store.getSkill('partial-report').state;
    assert.ok(difficultyDelta('partial-report', antes, depois) < 0, 'errar tudo deveria aliviar');
  });

  test('o modo manual não mexe na dificuldade adaptativa', async () => {
    store.setBackendForTesting();
    const antes = JSON.stringify(store.getSkill('mask-resistance').state);
    await runModuleBlock(
      { moduleId: 'mask-resistance', trials: 12, manual: true, adaptive: false, stimulus: 'digits', difficulty: { exposureMs: 100, maskDelayMs: 150, stimulusCount: 5, maskComplexity: 1 } },
      fakeView({ ability: 1 }), createControl(), { seed: 24 },
    );
    assert.equal(JSON.stringify(store.getSkill('mask-resistance').state), antes);
  });

  test('encerrar no meio interrompe a sessão e guarda o que foi feito', async () => {
    store.setBackendForTesting();
    const control = createControl();
    let contador = 0;
    const view = fakeView({ ability: 1, onTrial: () => { contador += 1; if (contador === 3) control.abort(); } });
    const resumo = await runModuleBlock(
      { moduleId: 'peripheral-matrix', trials: 50, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
      view, control, { seed: 25 },
    );
    assert.ok(resumo.trials >= 2 && resumo.trials < 50, `parou em ${resumo.trials}`);
    assert.equal(store.getModuleStats('peripheral-matrix').trialsDone, resumo.trials);
  });

  test('a pausa marca retomada para recomeçar com contagem', () => {
    const control = createControl();
    control.pause();
    assert.ok(control.paused);
    control.resume();
    assert.ok(!control.paused);
    assert.equal(control.consumeResumed(), true);
    assert.equal(control.consumeResumed(), false, 'a marca é consumida uma vez só');
  });

  test('o benchmark roda o protocolo inteiro sem adaptar', async () => {
    store.setBackendForTesting();
    const antes = JSON.stringify(store.getSkill('benchmark').state);
    const resumo = await runModuleBlock(
      { moduleId: 'benchmark', minutes: 2, preset: 'tryhard', adaptive: false, stimulus: 'mixed' },
      fakeView({ ability: 0.8 }), createControl(), { seed: 26 },
    );
    assert.equal(resumo.trials, BENCHMARK_TRIALS);
    assert.equal(resumo.protocolVersion, TRY_HARD_CONFIG.benchmarkProtocolVersion);
    assert.equal(JSON.stringify(store.getSkill('benchmark').state), antes);
  });
}
