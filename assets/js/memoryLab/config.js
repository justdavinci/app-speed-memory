// MEMORY LAB — protocolo de memória geral a partir de uma única exposição.
//
// A ambição é alta, mas a mensuração continua conservadora: o app tenta
// reduzir as perdas ao longo do pipeline CAPTURE → BIND → STABILIZE → RETAIN
// → RESIST INTERFERENCE → RETRIEVE → TRANSFER. Nenhuma métrica é apresentada
// como diagnóstico, QI ou garantia de "memória fotográfica".

export const MEMORY_LAB_CONFIG = {
  version: 1,
  datasetVersion: 1,
  targetAccuracy: 0.80,
  trainingZone: [0.72, 0.86],
  minComparableTrials: 6,
  maxStoredTrials: 1200,
  maxStoredSessions: 120,
  maxSeenStimuli: 5000,

  // Exposição cai somente depois que a representação está estável.
  exposureLadderMs: [4000, 3200, 2600, 2100, 1700, 1400, 1150, 950, 800, 650, 525, 425, 350, 275, 225, 175, 140],
  initialExposureMs: 1700,

  // Retenção cresce em uma escala muito mais lenta que Availability.
  retentionLadderMs: [0, 500, 1000, 1500, 2500, 4000, 7000, 10000, 15000, 30000, 60000],
  initialRetentionMs: 1500,

  // Reativação sem reexposição: cada probe usa perguntas que não apareceram
  // no teste imediato. A recuperação ainda pode fortalecer o traço, por isso
  // os registros distinguem idade da memória e número de probes anteriores.
  deferredProbeDelaysMs: [5 * 60 * 1000, 24 * 60 * 60 * 1000],
  deferredQuestionsPerProbe: 1,

  // Holdout nunca é escolhido em treino. "novel" é material de avaliação
  // dentro de uma família já conhecida; "holdout" fica reservado a benchmark.
  trainingSplits: ['train'],
  novelSplits: ['novel'],
  validationSplits: ['holdout'],

  // A v1 é deliberadamente curta para proteger os olhos e preservar material.
  defaultTrialsPerSession: 5,
  maxTrialsPerSession: 12,

  // Escada adaptativa: uma variável de cada vez.
  adaptationWindow: 6,
  minTrialsBetweenChanges: 3,
};

export const MEMORY_LAB_MODES = {
  'one-shot': {
    id: 'one-shot',
    name: 'One Shot',
    icon: '◎',
    description: 'Uma única exposição. A mesma unidade nunca volta a ser mostrada.',
    primaryComponent: 'capture',
    queryCount: 3,
    retentionMultiplier: 1,
    interference: false,
  },
  'page-capture': {
    id: 'page-capture',
    name: 'Page Capture',
    icon: '▤',
    description: 'Capture arquitetura, conteúdo, âncoras e posição em uma página realista.',
    primaryComponent: 'reconstruction',
    queryCount: 4,
    retentionMultiplier: 0.7,
    interference: false,
  },
  binding: {
    id: 'binding',
    name: 'Binding',
    icon: '↔',
    description: 'Preserve quem estava ligado a quê: pessoa, número, lugar, ação e ordem.',
    primaryComponent: 'binding',
    queryCount: 3,
    retentionMultiplier: 1,
    interference: false,
  },
  separation: {
    id: 'separation',
    name: 'Pattern Separation',
    icon: '≠',
    description: 'Duas representações muito parecidas precisam continuar distintas.',
    primaryComponent: 'separation',
    queryCount: 2,
    retentionMultiplier: 0.7,
    interference: 'similar',
  },
  interference: {
    id: 'interference',
    name: 'Interferência',
    icon: '⧖',
    description: 'Forme o traço e faça-o sobreviver a informação nova antes da recuperação.',
    primaryComponent: 'interference',
    queryCount: 3,
    retentionMultiplier: 1,
    interference: 'different',
  },
  'life-transfer': {
    id: 'life-transfer',
    name: 'Life Transfer',
    icon: '◇',
    description: 'Benchmark com material reservado. Mede; não ensina nem adapta.',
    primaryComponent: 'transfer',
    queryCount: 4,
    retentionMultiplier: 1,
    interference: false,
    benchmark: true,
  },
};

export const PIPELINE_COMPONENTS = [
  { id: 'capture', name: 'One-shot capture', short: 'Captura', direction: 'up' },
  { id: 'binding', name: 'Binding', short: 'Binding', direction: 'up' },
  { id: 'separation', name: 'Pattern separation', short: 'Separação', direction: 'up' },
  { id: 'retention', name: 'Retention', short: 'Retenção', direction: 'up' },
  { id: 'interference', name: 'Interference resistance', short: 'Interferência', direction: 'up' },
  { id: 'reconstruction', name: 'Retrieval / reconstruction', short: 'Reconstrução', direction: 'up' },
  { id: 'transfer', name: 'Novel / life transfer', short: 'Transferência', direction: 'up' },
];

export const DEFAULT_MEMORY_LAB_SETTINGS = {
  mode: 'one-shot',
  trialsPerSession: MEMORY_LAB_CONFIG.defaultTrialsPerSession,
  adaptive: true,
  exposureMs: MEMORY_LAB_CONFIG.initialExposureMs,
  retentionMs: MEMORY_LAB_CONFIG.initialRetentionMs,
  layoutVariation: true,
  fontScale: 1,
  showSourceAfterSession: true,
  feedback: 'block', // sem revelar respostas durante benchmark/one-shot
};
