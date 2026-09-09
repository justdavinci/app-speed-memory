// Testes do Real World Transfer. Como o resto da suíte: sem navegador, sem
// dependências, tudo pelo mesmo `node tests/run.js`.

import assert from 'node:assert/strict';

import { MAX_TIER, TRANSFER_CONFIG, TRANSFER_PRESETS } from '../assets/js/tryhard/transfer/config.js';
import { seeded } from '../assets/js/tryhard/rng.js';
import {
  allTemplates, FAMILIES, FAMILY_IDS, generateScene, getFamily,
} from '../assets/js/tryhard/transfer/families/index.js';
import { sceneComplexity, sceneSignature } from '../assets/js/tryhard/transfer/scene.js';
import { generateQueries, scoreQueries, QUERY_KINDS } from '../assets/js/tryhard/transfer/queries.js';
import {
  createNoveltyState, holdoutTemplates, noteUse, pickTemplate, templateKey, variationAmount,
} from '../assets/js/tryhard/transfer/novelty.js';
import {
  breadth, detectOverfitting, familyBreakdown, generalizationScore, realWorldIndex,
  splitTrials, tierRecommendation, trainedTemplateKeys, transferGap, transferReport,
} from '../assets/js/tryhard/transfer/metrics.js';
import {
  effectiveNoveltyRate, effectiveQueryComplexity, effectiveTier, escalationFor, nextTier, pressureFor,
} from '../assets/js/tryhard/transfer/adapt.js';
import { getModule } from '../assets/js/tryhard/modules/index.js';
import { TRANSFER_BENCHMARK_TRIALS } from '../assets/js/tryhard/modules/transferBenchmark.js';
import { stimulusMarkup } from '../assets/js/tryhard/view.js';
import * as store from '../assets/js/tryhard/store.js';
import { createControl, runModuleBlock } from '../assets/js/tryhard/runner.js';

const DIFFICULTY = {
  exposureMs: 300,
  tier: 0,
  informationDensity: 6,
  queryComplexity: 2,
  retentionDelayMs: 0,
  interferenceLevel: 0,
  responseVariation: 0.2,
  contextualVariation: 0.5,
};

/** Interface falsa: responde com a precisão pedida, sem navegador. */
function fakeView({ ability = 1, onTrial } = {}) {
  return {
    setPhase() {}, setProgress() {}, setSessionProgress() {},
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
        reactionMs: 700,
      };
    },
    showFeedback: async () => {},
    showModuleSummary: async () => 'next',
    showInvalid: async () => {},
    watchInvalidation: () => ({ invalid: false, stop() {} }),
  };
}

/** Tentativa sintética do log de transferência. */
const trial = (over = {}) => ({
  timestamp: new Date().toISOString(),
  familyId: 'structured-info',
  templateId: 'precos',
  tier: 1,
  novel: false,
  holdout: false,
  accuracy: 0.9,
  exposureMs: 300,
  queryComplexity: 2,
  queryKinds: ['value'],
  invalid: false,
  ...over,
});

export function register({ test, group }) {
  if (!global.performance) global.performance = { now: () => Date.now() };

  /* ----------------------------- famílias ------------------------------- */

  group('Transfer — famílias de estímulo');

  test('toda família declara faixa, modelos e ao menos um reservado no conjunto', () => {
    for (const id of FAMILY_IDS) {
      const family = FAMILIES[id];
      assert.equal(family.id, id);
      assert.equal(typeof family.generate, 'function');
      assert.ok(family.templates.length >= 2, `${id}: precisa de mais de um modelo`);
      assert.ok(family.tier >= 0 && family.tier <= MAX_TIER, `${id}: faixa fora do intervalo`);
    }
    assert.ok(allTemplates().some((t) => t.holdout), 'nenhum modelo reservado no conjunto');
  });

  test('todo modelo gera cena desenhável, com elementos identificáveis', () => {
    for (const t of allTemplates()) {
      const rng = seeded(t.familyId.length * 31 + t.templateId.length);
      const scene = generateScene(t.familyId, { difficulty: DIFFICULTY, rng, templateId: t.templateId });
      const label = `${t.familyId}/${t.templateId}`;

      assert.ok(scene.elements.length >= 2, `${label}: cena vazia demais`);
      assert.ok(scene.html.includes('<div class="th-sc'), `${label}: sem marcação`);
      assert.equal(new Set(scene.elements.map((e) => e.id)).size, scene.elements.length, `${label}: ids repetidos`);
      assert.ok(sceneComplexity(scene) >= 1, `${label}: complexidade inválida`);
      for (const e of scene.elements) assert.ok(e.label, `${label}: elemento sem rótulo`);
    }
  });

  test('cenas em grade nunca põem dois elementos na mesma célula', () => {
    for (const t of allTemplates()) {
      const rng = seeded(t.templateId.length + 5);
      const scene = generateScene(t.familyId, { difficulty: { ...DIFFICULTY, informationDensity: 9 }, rng, templateId: t.templateId });
      if (scene.layout.kind !== 'grid') continue;
      const cells = scene.elements.filter((e) => e.row !== null).map((e) => `${e.row}:${e.col}`);
      assert.equal(new Set(cells).size, cells.length, `${t.familyId}/${t.templateId}: colisão de células`);
    }
  });

  test('a variação de contexto muda a aparência do mesmo modelo', () => {
    const assinaturas = new Set();
    for (let i = 0; i < 30; i++) {
      const scene = generateScene('structured-info', {
        difficulty: DIFFICULTY, rng: seeded(100 + i), templateId: 'precos', variantAmount: 1,
      });
      assinaturas.add(sceneSignature(scene));
    }
    assert.ok(assinaturas.size >= 4, `variedade insuficiente: ${assinaturas.size}`);
  });

  /* ------------------------------ perguntas ----------------------------- */

  group('Transfer — perguntas');

  test('todo modelo produz pergunta respondível, e a correção separa acerto de erro', () => {
    for (const t of allTemplates()) {
      const rng = seeded(t.familyId.length * 7 + 3);
      const scene = generateScene(t.familyId, { difficulty: DIFFICULTY, rng, templateId: t.templateId });
      const queries = generateQueries(scene, { complexity: 2, rng });
      const label = `${t.familyId}/${t.templateId}`;

      assert.ok(queries.length >= 1, `${label}: sem pergunta`);
      for (const q of queries) {
        assert.ok(q.text, `${label}: pergunta sem texto`);
        assert.ok(q.answer !== undefined && q.answer !== '', `${label}: pergunta sem resposta`);
        assert.ok(['choice', 'cell'].includes(q.response.kind), `${label}: widget desconhecido`);
        if (q.response.kind === 'choice') {
          assert.ok(q.response.options.includes(String(q.answer)), `${label}: resposta fora das opções`);
        }
      }

      const certo = scoreQueries(queries, queries.map((q) => q.answer));
      assert.equal(certo.itemAccuracy, 1, `${label}: acerto total não pontuou`);
      const errado = scoreQueries(queries, queries.map(() => '__erro__'));
      assert.equal(errado.itemAccuracy, 0, `${label}: erro total pontuou`);
    }
  });

  test('a profundidade libera tipos de pergunta mais exigentes', () => {
    const rng = seeded(21);
    const scene = generateScene('document-fragment', { difficulty: { ...DIFFICULTY, informationDensity: 8 }, rng, templateId: 'tabela' });
    const rasos = new Set();
    const fundos = new Set();
    for (let i = 0; i < 30; i++) {
      generateQueries(scene, { complexity: 1, rng: seeded(i) }).forEach((q) => rasos.add(q.kind));
      generateQueries(scene, { complexity: 4, rng: seeded(i) }).forEach((q) => fundos.add(q.kind));
    }
    assert.ok(!rasos.has('compare'), 'comparação não deveria aparecer no nível raso');
    assert.ok(fundos.has('compare') || fundos.has('extreme'), 'nível fundo não trouxe pergunta relacional');
    assert.ok(fundos.size >= rasos.size);
  });

  test('perguntas repetidas sobre a mesma cena variam de tipo e de alvo', () => {
    const scene = generateScene('interface-panel', { difficulty: DIFFICULTY, rng: seeded(33), templateId: 'painel' });
    const tipos = new Set();
    const alvos = new Set();
    for (let i = 0; i < 25; i++) {
      generateQueries(scene, { complexity: 3, rng: seeded(200 + i) }).forEach((q) => {
        tipos.add(q.kind);
        if (q.targetId) alvos.add(q.targetId);
      });
    }
    assert.ok(tipos.size >= 3, `poucos tipos de pergunta: ${[...tipos]}`);
    assert.ok(alvos.size >= 3, `poucos alvos diferentes: ${alvos.size}`);
  });

  test('a mesma tentativa não repete tipo de pergunta nem alvo', () => {
    const scene = generateScene('scene-layout', { difficulty: { ...DIFFICULTY, informationDensity: 8 }, rng: seeded(44), templateId: 'mesa' });
    for (let i = 0; i < 20; i++) {
      const queries = generateQueries(scene, { complexity: 4, rng: seeded(300 + i) });
      const tipos = queries.map((q) => q.kind);
      assert.equal(new Set(tipos).size, tipos.length, 'tipo de pergunta repetido na mesma tentativa');
      const alvos = queries.map((q) => q.targetId).filter(Boolean);
      assert.equal(new Set(alvos).size, alvos.length, 'mesmo alvo cobrado duas vezes');
    }
  });

  test('todos os tipos de pergunta declarados são construíveis em alguma cena', () => {
    const vistos = new Set();
    for (const t of allTemplates()) {
      for (let i = 0; i < 12; i++) {
        const rng = seeded(i * 13 + t.templateId.length);
        const scene = generateScene(t.familyId, { difficulty: { ...DIFFICULTY, informationDensity: 8 }, rng, templateId: t.templateId });
        [1, 2, 3, 4].forEach((level) => {
          generateQueries(scene, { complexity: level, rng }).forEach((q) => vistos.add(q.kind));
        });
      }
    }
    for (const kind of QUERY_KINDS) assert.ok(vistos.has(kind), `tipo nunca gerado: ${kind}`);
  });

  /* ------------------------- não avisar de antemão ----------------------- */

  group('Transfer — nada é avisado antes');

  test('a cena apresentada não contém a pergunta nem a resposta', () => {
    store.setBackendForTesting();
    const mod = getModule('real-world');
    const rng = seeded(77);
    const context = mod.beginBlock();

    for (let i = 0; i < 25; i++) {
      const t = mod.generate({ difficulty: { ...DIFFICULTY, tier: 4 }, rng, context });
      const marcacao = stimulusMarkup(t);
      // O conteúdo aparece — é o estímulo. O que não pode aparecer é o
      // enunciado: saber de antemão o que será cobrado dispensa capturar a cena.
      for (const q of t.queries) {
        assert.ok(!marcacao.includes(q.text), 'o enunciado apareceu durante a exposição');
      }
      assert.ok(!/Qual|Onde|Quantos/.test(marcacao), 'pergunta vazou para o estímulo');
      assert.equal(t.response.prompt, 'Sobre o que apareceu', 'o aviso de resposta descreve a pergunta antes');
    }
  });

  /* ------------------------------ novidade ------------------------------ */

  group('Transfer — motor de novidade');

  test('modelos reservados nunca entram no conjunto treinado', () => {
    const rng = seeded(12);
    const state = createNoveltyState();
    const treinados = new Set();
    let reservadosVistos = 0;

    for (let i = 0; i < 300; i++) {
      const pick = pickTemplate({ tier: 5, rng, state, trainedKeys: treinados, noveltyRate: 0.5 });
      if (pick.holdout) {
        reservadosVistos += 1;
        assert.ok(pick.novel, 'material reservado deveria contar como novo');
      } else {
        treinados.add(pick.key);
      }
      noteUse(state, { key: pick.key });
    }

    assert.ok(reservadosVistos > 0, 'material reservado nunca apareceu');
    for (const t of holdoutTemplates(5)) {
      assert.ok(!treinados.has(templateKey(t.familyId, t.templateId)), 'reservado virou treinado');
    }
  });

  test('o sorteio nunca repete o modelo anterior', () => {
    const rng = seeded(4);
    const state = createNoveltyState();
    let anterior = null;
    for (let i = 0; i < 200; i++) {
      const pick = pickTemplate({ tier: 6, rng, state, trainedKeys: [], noveltyRate: 0.5 });
      assert.notEqual(pick.key, anterior, 'modelo repetido em sequência');
      anterior = pick.key;
      noteUse(state, { key: pick.key });
    }
  });

  test('nenhum modelo domina a janela recente', () => {
    const rng = seeded(6);
    const state = createNoveltyState();
    const contagem = new Map();
    for (let i = 0; i < 240; i++) {
      const pick = pickTemplate({ tier: 4, rng, state, trainedKeys: [], noveltyRate: 0.5 });
      contagem.set(pick.key, (contagem.get(pick.key) || 0) + 1);
      noteUse(state, { key: pick.key });
    }
    const maior = Math.max(...contagem.values()) / 240;
    assert.ok(maior <= TRANSFER_CONFIG.templateShareCeiling + 0.1, `um modelo ficou com ${Math.round(maior * 100)}%`);
  });

  test('a faixa define quais famílias podem aparecer', () => {
    const rng = seeded(15);
    const state = createNoveltyState();
    const familias = new Set();
    for (let i = 0; i < 60; i++) {
      const pick = pickTemplate({ tier: 0, rng, state, trainedKeys: [], noveltyRate: 0.6 });
      familias.add(pick.familyId);
      noteUse(state, { key: pick.key });
    }
    assert.deepEqual([...familias], ['symbol-grid'], 'faixa 0 deveria usar só símbolos');
  });

  test('a variação sobe quando o mesmo modelo insiste em aparecer', () => {
    const state = createNoveltyState();
    const base = variationAmount(state, { contextualVariation: 0.3, key: 'a/b' });
    for (let i = 0; i < 10; i++) noteUse(state, { key: 'a/b' });
    const depois = variationAmount(state, { contextualVariation: 0.3, key: 'a/b' });
    assert.ok(depois > base, 'repetição não aumentou a variação');
  });

  /* ------------------------------ métricas ------------------------------ */

  group('Transfer — métricas');

  test('a lacuna só é calculada com tentativas dos dois lados', () => {
    const poucas = Array.from({ length: 4 }, () => trial());
    assert.equal(transferGap(poucas), null);

    const treinado = Array.from({ length: 10 }, () => trial({ accuracy: 0.9 }));
    const novo = Array.from({ length: 10 }, () => trial({ novel: true, accuracy: 0.5 }));
    assert.equal(transferGap([...treinado, ...novo]), 0.4);
  });

  test('a separação conta treinado, novo e reservado', () => {
    const lista = [
      ...Array.from({ length: 5 }, () => trial()),
      ...Array.from({ length: 3 }, () => trial({ novel: true })),
      ...Array.from({ length: 2 }, () => trial({ holdout: true })),
    ];
    const split = splitTrials(lista);
    assert.equal(split.trained.length, 5);
    assert.equal(split.novel.length, 5, 'reservado também conta como novo');
    assert.equal(split.holdout.length, 2);
  });

  test('o sobreajuste é detectado quando o novo fica muito atrás', () => {
    const preso = [
      ...Array.from({ length: 10 }, () => trial({ accuracy: 0.92 })),
      ...Array.from({ length: 10 }, () => trial({ novel: true, accuracy: 0.5 })),
    ];
    const diagnostico = detectOverfitting(preso);
    assert.equal(diagnostico.overfit, true);
    assert.ok(diagnostico.gap >= TRANSFER_CONFIG.overfitGapThreshold);

    const saudavel = [
      ...Array.from({ length: 10 }, () => trial({ accuracy: 0.8 })),
      ...Array.from({ length: 10 }, () => trial({ novel: true, accuracy: 0.76 })),
    ];
    assert.equal(detectOverfitting(saudavel).overfit, false);
  });

  test('a generalização desconta repertório estreito', () => {
    const umaFamilia = Array.from({ length: 20 }, () => trial({ novel: true, accuracy: 0.8 }));
    const variado = Array.from({ length: 20 }, (_, i) => trial({
      novel: true, accuracy: 0.8, familyId: FAMILY_IDS[i % FAMILY_IDS.length],
    }));
    assert.ok(generalizationScore(variado) > generalizationScore(umaFamilia));
    assert.ok(breadth(variado) > breadth(umaFamilia));
  });

  test('o Índice de Mundo Real fica entre 0 e 1000 e premia acerto em material novo', () => {
    const fraco = Array.from({ length: 20 }, () => trial({ novel: true, accuracy: 0.2, exposureMs: 900 }));
    const forte = Array.from({ length: 20 }, (_, i) => trial({
      novel: true, accuracy: 1, exposureMs: 40, queryComplexity: 4, familyId: FAMILY_IDS[i % FAMILY_IDS.length],
    }));
    const a = realWorldIndex(fraco, { tier: 0 });
    const b = realWorldIndex(forte, { tier: MAX_TIER });
    assert.ok(a >= 0 && b <= 1000);
    assert.ok(b > a, 'desempenho melhor não elevou o índice');
    assert.equal(realWorldIndex([], { tier: 0 }), 0);
  });

  test('a faixa só sobe com desempenho em material novo', () => {
    const soTreinado = Array.from({ length: 20 }, () => trial({ accuracy: 1 }));
    assert.equal(tierRecommendation(soTreinado, 2), 'hold', 'subiu sem material novo');

    const comNovo = [
      ...Array.from({ length: 10 }, () => trial({ accuracy: 0.85 })),
      ...Array.from({ length: 10 }, () => trial({ novel: true, accuracy: 0.85 })),
    ];
    assert.equal(tierRecommendation(comNovo, 2), 'up');

    const ruim = Array.from({ length: 20 }, () => trial({ accuracy: 0.2 }));
    assert.equal(tierRecommendation(ruim, 2), 'down');
    assert.equal(tierRecommendation(ruim, 0), 'hold', 'não desce abaixo da primeira faixa');
  });

  test('a faixa não passa do topo da escada', () => {
    const bom = [
      ...Array.from({ length: 10 }, () => trial({ accuracy: 0.9 })),
      ...Array.from({ length: 10 }, () => trial({ novel: true, accuracy: 0.9 })),
    ];
    assert.equal(nextTier(bom, MAX_TIER), MAX_TIER);
  });

  test('os modelos já treinados saem do log, sem contar os reservados', () => {
    const chaves = trainedTemplateKeys([
      trial({ familyId: 'a', templateId: '1' }),
      trial({ familyId: 'a', templateId: '1' }),
      trial({ familyId: 'b', templateId: '2', holdout: true }),
    ]);
    assert.deepEqual([...chaves], ['a/1']);
  });

  test('o detalhamento por família ordena da faixa mais baixa para a mais alta', () => {
    const lista = [
      ...Array.from({ length: 4 }, () => trial({ familyId: 'scene-layout' })),
      ...Array.from({ length: 4 }, () => trial({ familyId: 'symbol-grid' })),
    ];
    const linhas = familyBreakdown(lista);
    assert.deepEqual(linhas.map((f) => f.familyId), ['symbol-grid', 'scene-layout']);
  });

  /* ----------------------------- adaptação ------------------------------ */

  group('Transfer — para onde apertar');

  test('lacuna grande manda variar o material; lacuna pequena manda apertar o tempo', () => {
    const presa = [
      ...Array.from({ length: 10 }, () => trial({ accuracy: 0.95 })),
      ...Array.from({ length: 10 }, () => trial({ novel: true, accuracy: 0.55 })),
    ];
    const solta = [
      ...Array.from({ length: 10 }, () => trial({ accuracy: 0.8 })),
      ...Array.from({ length: 10 }, () => trial({ novel: true, accuracy: 0.78 })),
    ];
    assert.equal(pressureFor(presa).axis, 'generalization');
    assert.equal(pressureFor(solta).axis, 'raw');
    assert.notDeepEqual(escalationFor(presa), escalationFor(solta));
    assert.ok(escalationFor(presa).includes('contextualVariation'));
    assert.ok(escalationFor(solta).includes('exposureMs'));
  });

  test('sem comparação possível, o treino segue no ritmo normal', () => {
    assert.equal(pressureFor([]).axis, 'raw');
    assert.equal(pressureFor([]).gap, null);
  });

  test('os presets deslocam faixa, novidade e profundidade', () => {
    const base = { tier: 3, queryComplexity: 2 };
    const raw = { preset: 'raw', lockedTier: null };
    const max = { preset: 'transfer', lockedTier: null };
    assert.ok(effectiveTier(base, raw) < effectiveTier(base, max));
    assert.ok(effectiveQueryComplexity(base, raw) < effectiveQueryComplexity(base, max));
    assert.ok(effectiveNoveltyRate(raw) < effectiveNoveltyRate(max));
    assert.equal(effectiveTier(base, { preset: 'balanced', lockedTier: 1 }), 1, 'a trava manual mandou');
    for (const preset of Object.values(TRANSFER_PRESETS)) {
      const rate = effectiveNoveltyRate({ preset: preset.id, noveltyRate: preset.noveltyRate });
      assert.ok(rate >= TRANSFER_CONFIG.noveltyRange[0] && rate <= TRANSFER_CONFIG.noveltyRange[1]);
    }
  });

  /* ------------------------------- sessão ------------------------------- */

  group('Transfer — sessão');

  test('uma sessão de transferência registra família, modelo e lado da comparação', async () => {
    store.setBackendForTesting();
    const resumo = await runModuleBlock(
      { moduleId: 'real-world', trials: 24, preset: 'tryhard', adaptive: true, stimulus: 'scenes' },
      fakeView({ ability: 0.85 }), createControl(), { seed: 31 },
    );

    assert.equal(resumo.trials, 24);
    const registradas = store.getTransferTrials();
    assert.equal(registradas.length, 24);
    for (const t of registradas) {
      assert.ok(getFamily(t.familyId), `família desconhecida: ${t.familyId}`);
      assert.ok(t.templateId, 'sem modelo');
      assert.ok(t.accuracy >= 0 && t.accuracy <= 1);
    }
    assert.ok(resumo.transfer, 'o bloco não devolveu resumo de transferência');
    assert.ok(resumo.transfer.families.length >= 1);
    assert.ok(resumo.transfer.realWorldIndex >= 0);
  });

  test('acertar sempre no material treinado não é suficiente para subir de faixa', async () => {
    store.setBackendForTesting();
    store.updateTransferSettings({ preset: 'raw', noveltyRate: 0.2, tierBias: -1, queryBias: -1 });
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      await runModuleBlock(
        { moduleId: 'real-world', trials: 15, preset: 'tryhard', adaptive: true, stimulus: 'scenes' },
        fakeView({ ability: 1 }), createControl(), { seed: 60 + i },
      );
    }
    const relatorio = store.getTransferReport();
    assert.ok(relatorio.tier <= 2, `a faixa subiu rápido demais: ${relatorio.tier}`);
    assert.ok(relatorio.novelTrials > 0, 'nem com pouca novidade o material novo apareceu');
  });

  test('o material novo continua aparecendo mesmo no preset de velocidade', async () => {
    store.setBackendForTesting();
    store.updateTransferSettings({ preset: 'raw', noveltyRate: 0.2 });
    await runModuleBlock(
      { moduleId: 'real-world', trials: 30, preset: 'tryhard', adaptive: true, stimulus: 'scenes' },
      fakeView({ ability: 0.8 }), createControl(), { seed: 88 },
    );
    const relatorio = store.getTransferReport();
    assert.ok(relatorio.novelTrials >= 3, 'a validação sumiu com a novidade baixa');
  });

  test('o Modo Caos varia mais o material que o treino normal', async () => {
    store.setBackendForTesting();
    store.updateTransferSettings({ preset: 'balanced', noveltyRate: 0.45 });
    const caos = await runModuleBlock(
      { moduleId: 'chaos-mode', trials: 20, preset: 'tryhard', adaptive: true, stimulus: 'scenes' },
      fakeView({ ability: 0.7 }), createControl(), { seed: 5 },
    );
    assert.ok(caos.transfer.families.length >= 2, 'o caos ficou preso a uma família');
    assert.ok(caos.transfer.novelTrials >= 4, 'o caos repetiu material conhecido');
  });

  test('o Transfer Benchmark roda o protocolo fixo só em material reservado', async () => {
    store.setBackendForTesting();
    const resumo = await runModuleBlock(
      { moduleId: 'transfer-benchmark', preset: 'tryhard', adaptive: false, stimulus: 'scenes' },
      fakeView({ ability: 0.8 }), createControl(), { seed: 17 },
    );

    assert.equal(resumo.trials, TRANSFER_BENCHMARK_TRIALS);
    assert.equal(resumo.protocolVersion, TRANSFER_CONFIG.benchmarkVersion);
    for (const t of store.getTransferTrials()) {
      assert.equal(t.holdout, true, 'o benchmark usou material treinável');
      assert.equal(t.mode, 'benchmark');
    }
    const guardados = store.getTransferBenchmarks();
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].blocks.length, 3);
    assert.equal(guardados[0].blocks.reduce((a, b) => a + b.trials, 0), TRANSFER_BENCHMARK_TRIALS);
  });

  test('o benchmark não mexe na faixa nem na dificuldade adaptativa', async () => {
    store.setBackendForTesting();
    store.setTransferTier(3);
    const antes = JSON.stringify(store.getSkill('transfer-benchmark').state);
    await runModuleBlock(
      { moduleId: 'transfer-benchmark', preset: 'tryhard', adaptive: false, stimulus: 'scenes' },
      fakeView({ ability: 0.9 }), createControl(), { seed: 23 },
    );
    assert.equal(store.getTransferTier(), 3);
    assert.equal(JSON.stringify(store.getSkill('transfer-benchmark').state), antes);
  });

  /* ----------------------------- persistência --------------------------- */

  group('Transfer — persistência');

  test('o estado de transferência entra na exportação e volta na importação', () => {
    store.setBackendForTesting();
    store.updateTransferSettings({ preset: 'transfer', lockedTier: 4 });
    store.setTransferTier(2);
    store.recordTransferTrial(trial({ familyId: 'map-diagram', templateId: 'linhas', novel: true }));

    const copia = store.exportAll();
    store.setBackendForTesting();
    assert.equal(store.getTransferTier(), 0, 'o armazenamento novo deveria estar limpo');

    store.importAll(copia);
    assert.equal(store.getTransferTier(), 2);
    assert.equal(store.getTransferSettings().lockedTier, 4);
    assert.equal(store.getTransferTrials().length, 1);
  });

  test('o log de transferência é limitado para não crescer sem fim', () => {
    store.setBackendForTesting();
    for (let i = 0; i < TRANSFER_CONFIG.maxStoredTransferTrials + 40; i++) {
      store.recordTransferTrial(trial());
    }
    assert.equal(store.getTransferTrials().length, TRANSFER_CONFIG.maxStoredTransferTrials);
  });

  test('o relatório fecha com os números que o painel mostra', () => {
    store.setBackendForTesting();
    Array.from({ length: 10 }, () => store.recordTransferTrial(trial({ accuracy: 0.9 })));
    Array.from({ length: 10 }, () => store.recordTransferTrial(trial({ novel: true, accuracy: 0.6, familyId: 'map-diagram' })));

    const relatorio = store.getTransferReport();
    assert.equal(relatorio.trials, 20);
    assert.equal(relatorio.trainedTrials, 10);
    assert.equal(relatorio.novelTrials, 10);
    assert.ok(Math.abs(relatorio.transferGap - 0.3) < 1e-9);
    assert.equal(relatorio.families.length, 2);
    assert.deepEqual(transferReport(store.getTransferTrials(), { tier: 0 }).transferGap, relatorio.transferGap);
  });
}
