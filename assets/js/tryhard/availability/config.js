// VISUAL AVAILABILITY — configuração central.
//
// A pergunta que este treino faz não é "quanto você lembra", e sim "quão cedo
// depois de a imagem sumir aquilo já pode ser recuperado com precisão". O app
// controla esse intervalo experimentalmente; nada aqui depende de a pessoa
// dizer quando sentiu que terminou de processar.
//
// Importante em toda a interface: isto é desempenho no exercício, não medida
// direta de atividade neural.

/** Degraus de atraso pós-estímulo, em ms. Finos embaixo, largos em cima. */
export const AVAILABILITY_LADDER = [
  16, 25, 33, 42, 50, 60, 75, 90, 100, 117, 133, 150,
  175, 200, 230, 265, 300, 350, 400, 450, 500, 600, 750, 900,
];

export const AVAILABILITY_CONFIG = {
  version: 1,
  benchmarkVersion: 1,

  /** Região de acerto que a escada persegue. */
  targetAccuracy: 0.80,
  /** Acima disto o atraso encurta; abaixo do piso ele aumenta. */
  upperMargin: 0.05,
  lowerMargin: 0.15,

  /** Janela de análise: nenhuma tentativa isolada mexe no atraso. */
  rollingWindow: 6,
  minTrialsBetweenChanges: 3,

  /** Passo relativo ao atraso atual: grosso no começo, fino perto do limiar. */
  coarseStepRatio: 0.14,
  fineStepRatio: 0.07,
  finestStepRatio: 0.035,
  reversalsBeforeFine: 2,
  reversalsBeforeFinest: 4,
  minStepMs: 4,
  /** A escada é considerada convergida a partir daqui. */
  convergedReversals: 6,

  defaultDelayMs: 200,
  defaultMinDelayMs: 50,
  defaultMaxDelayMs: 500,
  hardFloorMs: 0,
  hardCeilingMs: 1500,

  /** Modo Retrieval Limpo: a pergunta primeiro, as alternativas depois. */
  cleanRetrievalOptionsDelayMs: 300,

  /** Calibração inicial: varre de longe a perto para achar a região. */
  calibrationDelays: [400, 300, 250, 200, 150, 100],
  calibrationRepeats: 2,
  minTrialsForEstimate: 12,
  minTrialsForBest: 24,
  minDelaysForCurve: 3,

  /** Recorde só muda com melhora que não seja ruído. */
  bestImprovementMs: 5,
  /** Diferença menor que isto não vira comemoração no resumo. */
  noiseMarginMs: 5,

  /** Suavização entre sessões, para o painel não oscilar. */
  smoothingAlpha: 0.35,

  /** Depois de uma pausa, as primeiras tentativas não contam para o limiar. */
  warmupTrials: 2,

  /** Escala do índice agregado. */
  scoreScale: 1000,
  maxStoredTrialsPerCategory: 300,
  historyLimit: 200,

  /**
   * Onde o T80 é lido. `relativeToAsymptote` mede 80% do teto de desempenho
   * recente da pessoa naquela configuração (§9); desligado, usa o alvo
   * absoluto. Fica centralizado aqui de propósito, para poder mudar depois
   * sem caçar a decisão pelo código.
   */
  thresholdLevel: 0.80,
  relativeToAsymptote: true,
  /** Piso do teto assintótico: sem isso um teto ruim vira meta fácil demais. */
  minAsymptote: 0.55,
};

/**
 * Presets de quanto do treino usa disponibilidade. Nunca 100%: misturar
 * tentativas normais é o que impede a pessoa de se adaptar ao formato
 * em vez de à tarefa (§39).
 */
export const AVAILABILITY_PRESETS = {
  off: { id: 'off', label: 'Desligado', share: 0, blurb: 'Nenhuma tentativa usa disponibilidade visual.' },
  balanced: { id: 'balanced', label: 'Equilibrado', share: 0.35, blurb: 'Cerca de um terço das tentativas compatíveis.' },
  intensive: { id: 'intensive', label: 'Intensivo', share: 0.65, blurb: 'Cerca de dois terços das tentativas compatíveis.' },
  max: { id: 'max', label: 'Máxima velocidade', share: 0.85, blurb: 'Quase todas, preservando alguma variedade.' },
};

export const DEFAULT_AVAILABILITY_SETTINGS = {
  enabled: false,
  preset: 'balanced',
  mode: 'adaptive',            // adaptive | manual
  targetAccuracy: AVAILABILITY_CONFIG.targetAccuracy,
  initialDelayMs: AVAILABILITY_CONFIG.defaultDelayMs,
  minDelayMs: AVAILABILITY_CONFIG.defaultMinDelayMs,
  maxDelayMs: AVAILABILITY_CONFIG.defaultMaxDelayMs,
  manualDelayMs: 150,
  manualRandom: false,
  manualMinMs: 80,
  manualMaxMs: 150,
  cleanRetrieval: false,
  onboarded: false,
  motorBaselineMs: null,
  /** Por módulo: 'inherit' | 'on' | 'off'. Ausente = herda o global. */
  modules: {},
};

/** Módulos em que o intervalo entre sumir e perguntar faz sentido. */
export const AVAILABILITY_MODULES = [
  'partial-report',
  'iconic-readout',
  'peripheral-matrix',
  'abstract-flash',
  'mask-resistance',
  'peripheral-fixation',
  'real-world',
  'chaos-mode',
];

export function moduleSupportsAvailability(moduleId) {
  return AVAILABILITY_MODULES.includes(moduleId);
}

/** Rótulos das categorias em que o limiar é medido separadamente. */
/**
 * `slowMs` e `fastMs` são as âncoras da escala interna do app: material com
 * mais coisa para ler demora mais para ficar disponível, então comparar o
 * mesmo número de milissegundos entre categorias diferentes não diria nada.
 * São referências do app, não valores científicos.
 */
export const AVAILABILITY_CATEGORIES = {
  numbers: { id: 'numbers', label: 'Números', realWorld: false, slowMs: 500, fastMs: 60 },
  letters: { id: 'letters', label: 'Letras', realWorld: false, slowMs: 550, fastMs: 70 },
  symbols: { id: 'symbols', label: 'Símbolos', realWorld: false, slowMs: 600, fastMs: 90 },
  matrices: { id: 'matrices', label: 'Matrizes', realWorld: false, slowMs: 650, fastMs: 100 },
  structured: { id: 'structured', label: 'Listas e fichas', realWorld: true, slowMs: 700, fastMs: 120 },
  interfaces: { id: 'interfaces', label: 'Interfaces', realWorld: true, slowMs: 750, fastMs: 130 },
  documents: { id: 'documents', label: 'Documentos e tabelas', realWorld: true, slowMs: 850, fastMs: 160 },
  maps: { id: 'maps', label: 'Mapas', realWorld: true, slowMs: 800, fastMs: 150 },
  scenes: { id: 'scenes', label: 'Cenas', realWorld: true, slowMs: 800, fastMs: 150 },
  composite: { id: 'composite', label: 'Misturado', realWorld: true, slowMs: 900, fastMs: 180 },
};

export const CATEGORY_IDS = Object.keys(AVAILABILITY_CATEGORIES);

/** Categorias que contam para a disponibilidade em material realista (§33). */
export const TRANSFER_CATEGORIES = CATEGORY_IDS.filter((id) => AVAILABILITY_CATEGORIES[id].realWorld);
