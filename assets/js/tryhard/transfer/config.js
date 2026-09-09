// REAL WORLD TRANSFER — configuração do motor de transferência.
//
// O Try Hard treina percepção com estímulos artificiais. Este módulo existe
// para que essa habilidade não fique presa ao formato do treino: conforme a
// pessoa melhora, o material apresentado deixa de ser abstrato e passa a se
// parecer com o que ela encontra fora do app — listas, interfaces, documentos,
// mapas, cenas e combinações de tudo isso.
//
// Todo número de protocolo mora aqui, como no resto do Try Hard.

/** Faixas de progressão. A pessoa nunca é jogada direto no fim da escada. */
export const TRANSFER_TIERS = [
  { tier: 0, name: 'Símbolos', blurb: 'Material abstrato, como no restante do Try Hard.', families: ['symbol-grid'] },
  { tier: 1, name: 'Informação estruturada', blurb: 'Rótulo e valor: preços, placares, campos com nome.', families: ['symbol-grid', 'structured-info'] },
  { tier: 2, name: 'Interfaces', blurb: 'Painéis, listas e estados como os de um aplicativo.', families: ['structured-info', 'interface-panel'] },
  { tier: 3, name: 'Documentos', blurb: 'Recibos, tabelas, formulários e crachás.', families: ['interface-panel', 'document-fragment'] },
  { tier: 4, name: 'Mapas e diagramas', blurb: 'Relações espaciais com legenda e ligações.', families: ['document-fragment', 'map-diagram'] },
  { tier: 5, name: 'Cenas', blurb: 'Objetos posicionados, com atributos que variam.', families: ['map-diagram', 'scene-layout'] },
  { tier: 6, name: 'Misturado', blurb: 'Formatos diferentes na mesma exposição, sem aviso do que vem.', families: ['structured-info', 'interface-panel', 'document-fragment', 'map-diagram', 'scene-layout', 'composite'] },
];

export const MAX_TIER = TRANSFER_TIERS.length - 1;

export const TRANSFER_CONFIG = {
  version: 2,
  // v2 invalida o log anterior porque holdouts podiam aparecer no treino.
  templateVersion: 2,
  benchmarkVersion: 1,

  transferGapTarget: 0.12,
  transferGapThreshold: 0.18,
  overfitGapThreshold: 0.28,

  minTrialsPerSide: 6,
  metricsWindow: 60,
  gapExposureBucketMs: 25,

  noveltyRange: [0.2, 0.85],
  holdoutPolicy: 'validation-only',
  // Compatibilidade do helper para chamadas antigas que omitiam `mode`.
  // O aplicativo nunca usa este caminho: módulos reais passam training,
  // chaos ou validation explicitamente.
  legacyHoldoutRate: 0.15,
  templateShareCeiling: 0.35,

  tierUpAccuracy: 0.78,
  tierUpTrials: 12,
  tierDownAccuracy: 0.45,

  realWorldWeights: {
    novelAccuracy: 0.34,
    breadth: 0.2,
    tier: 0.18,
    speed: 0.16,
    queryDepth: 0.12,
  },
  realWorldScale: 1000,
  speedReferenceMs: 1200,
  speedFloorMs: 20,

  maxStoredTransferTrials: 400,
  maxStoredBenchmarks: 40,
};

export const TRANSFER_PRESETS = {
  raw: { id: 'raw', label: 'Velocidade pura', blurb: 'Prioriza tempo curto no material já conhecido.', noveltyRate: 0.2, tierBias: -1, queryBias: -1, speedBias: 1 },
  balanced: { id: 'balanced', label: 'Equilibrado', blurb: 'Divide o esforço entre velocidade e variedade.', noveltyRate: 0.45, tierBias: 0, queryBias: 0, speedBias: 0 },
  transfer: { id: 'transfer', label: 'Máxima transferência', blurb: 'Prioriza material novo e perguntas imprevisíveis.', noveltyRate: 0.8, tierBias: 1, queryBias: 1, speedBias: -1 },
  custom: { id: 'custom', label: 'Manual', blurb: 'Você escolhe faixa, novidade e profundidade.', noveltyRate: 0.45, tierBias: 0, queryBias: 0, speedBias: 0 },
};

export const DEFAULT_TRANSFER_SETTINGS = {
  preset: 'balanced',
  noveltyRate: TRANSFER_PRESETS.balanced.noveltyRate,
  tierBias: 0,
  queryBias: 0,
  lockedTier: null,
  interleave: true,
};

export const RAW_ESCALATION = [
  'exposureMs', 'informationDensity', 'queryComplexity',
  'exposureMs', 'retentionDelayMs', 'interferenceLevel',
];

export const GENERALIZATION_ESCALATION = [
  'contextualVariation', 'tier', 'responseVariation',
  'queryComplexity', 'contextualVariation', 'tier',
];

export const QUERY_LEVELS = {
  1: ['value', 'attribute', 'presence'],
  2: ['value', 'attribute', 'presence', 'label', 'position', 'neighbor'],
  3: ['value', 'attribute', 'label', 'position', 'neighbor', 'count', 'extreme'],
  4: ['label', 'position', 'neighbor', 'count', 'extreme', 'compare', 'absent'],
};

export const QUERIES_PER_TRIAL = { 1: 1, 2: 1, 3: 2, 4: 3 };
