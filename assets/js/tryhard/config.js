// TRY HARD — configuração central.
//
// Todo número que governa protocolo de treino mora aqui: alvos de desempenho,
// janelas de análise, degraus de dificuldade e o que cada módulo pode variar.
// Mexer no treino é mexer neste arquivo, não caçar constantes pela interface.

/** Degraus de exposição, em ms. A adaptação anda por índice, não por subtração. */
export const EXPOSURE_LADDER = [
  8, 10, 13, 16, 20, 25, 30, 40, 50, 65, 80, 100,
  125, 150, 200, 250, 300, 400, 500, 650, 800, 1000,
];

/** Degraus de atraso (retrocue, máscara), em ms. */
export const DELAY_LADDER = [0, 30, 50, 80, 110, 150, 200, 250, 300, 400, 500, 650, 800];

export const TRY_HARD_CONFIG = {
  version: 1,
  difficultyEngineVersion: 1,

  // Região de desempenho que a adaptação persegue.
  targetAccuracyMin: 0.70,
  targetAccuracyMax: 0.85,
  increaseAbove: 0.875,
  decreaseBelow: 0.55,

  // Janela de análise: nenhuma tentativa isolada muda a dificuldade.
  rollingWindow: 8,
  minTrialsBetweenChanges: 4,

  // Calibração inicial: janela curta e passos dobrados até achar a região.
  calibrationTrials: 8,
  calibrationWindow: 4,
  calibrationStepScale: 2,

  // Recalibração automática quando a pessoa foge da região por muito tempo.
  recalibrationWindow: 24,
  recalibrationAbove: 0.93,
  recalibrationBelow: 0.42,

  fixationMinMs: 450,
  fixationMaxMs: 750,
  countdownSeconds: 3,
  feedbackFullMs: 900,
  feedbackMinimalMs: 450,

  // Queda de desempenho que merece um aviso discreto.
  fatigueWindow: 20,
  fatigueDropRatio: 0.15,

  // Recorde de exposição só conta com precisão mínima.
  personalBestMinAccuracy: 0.80,

  benchmarkProtocolVersion: 1,
  quickDurationsMin: [5, 10, 15],
  quickTrialCounts: [20, 50, 100],
  historyChartRanges: [7, 30, 90, 0],   // 0 = tudo
  maxStoredTrialsPerModule: 400,
};

/** Tipos de estímulo disponíveis, com peso de complexidade para o throughput. */
export const STIMULUS_TYPES = {
  digits: { id: 'digits', label: 'Números', weight: 1.0 },
  letters: { id: 'letters', label: 'Letras', weight: 1.15 },
  mixed: { id: 'mixed', label: 'Números + letras', weight: 1.3 },
  symbols: { id: 'symbols', label: 'Símbolos abstratos', weight: 1.5 },
  shapes: { id: 'shapes', label: 'Formas', weight: 1.4 },
};

export const PRESETS = {
  warmup: { id: 'warmup', label: 'Aquecimento', offset: -3, adaptive: true },
  tryhard: { id: 'tryhard', label: 'Try Hard', offset: 0, adaptive: true },
  insane: { id: 'insane', label: 'Insano', offset: 2, adaptive: true },
  custom: { id: 'custom', label: 'Manual', offset: 0, adaptive: false },
};

const exposure = (start, label = 'Exposição') => ({
  key: 'exposureMs', kind: 'ladder', values: EXPOSURE_LADDER, start, harder: 'down', label, unit: 'ms',
});
const delay = (key, start, label, harder) => ({
  key, kind: 'ladder', values: DELAY_LADDER, start, harder, label, unit: 'ms',
});
const count = (key, start, min, max, label, harder = 'up') => ({
  key, kind: 'int', min, max, step: 1, start, harder, label,
});
const ratio = (key, start, min, max, step, label, harder) => ({
  key, kind: 'float', min, max, step, start, harder, label, format: 'pct',
});

/**
 * Módulos. `dimensions` lista o que a dificuldade pode mexer e `escalation`
 * a ordem em que as dimensões sobem — uma por vez, para sempre sabermos o que
 * ficou mais difícil.
 */
export const MODULE_SPECS = {
  'partial-report': {
    id: 'partial-report',
    name: 'Partial Report',
    blurb: 'Capture a cena inteira antes de descobrir o que será pedido.',
    defaultMinutes: 12,
    stimulusTypes: ['digits', 'letters', 'mixed', 'symbols'],
    defaultStimulus: 'mixed',
    dimensions: [
      exposure(150),
      count('matrixRows', 2, 2, 5, 'Linhas'),
      count('matrixColumns', 3, 3, 6, 'Colunas'),
      delay('cueDelayMs', 0, 'Atraso do aviso', 'up'),
    ],
    escalation: ['exposureMs', 'cueDelayMs', 'matrixColumns', 'exposureMs', 'matrixRows'],
  },
  'mask-resistance': {
    id: 'mask-resistance',
    name: 'Mask Resistance',
    blurb: 'Recupere a informação mesmo depois da interferência visual.',
    defaultMinutes: 7,
    stimulusTypes: ['digits', 'letters', 'mixed'],
    defaultStimulus: 'digits',
    dimensions: [
      exposure(100),
      delay('maskDelayMs', 250, 'Intervalo até a máscara', 'down'),
      count('stimulusCount', 5, 3, 12, 'Itens'),
      count('maskComplexity', 1, 1, 3, 'Complexidade da máscara'),
    ],
    escalation: ['maskDelayMs', 'exposureMs', 'stimulusCount', 'maskDelayMs', 'maskComplexity'],
  },
  'peripheral-matrix': {
    id: 'peripheral-matrix',
    name: 'Peripheral Matrix',
    blurb: 'Treine apreensão paralela em uma única exposição.',
    defaultMinutes: 8,
    stimulusTypes: ['digits', 'letters', 'symbols', 'shapes'],
    defaultStimulus: 'digits',
    dimensions: [
      exposure(200),
      count('matrixRows', 2, 2, 5, 'Linhas'),
      count('matrixColumns', 2, 2, 5, 'Colunas'),
    ],
    escalation: ['exposureMs', 'matrixColumns', 'exposureMs', 'matrixRows'],
  },
  'iconic-readout': {
    id: 'iconic-readout',
    name: 'Iconic Readout',
    blurb: 'Consulte mentalmente uma cena que já desapareceu.',
    defaultMinutes: 5,
    stimulusTypes: ['digits', 'letters', 'mixed'],
    defaultStimulus: 'mixed',
    dimensions: [
      exposure(250),
      count('matrixRows', 3, 2, 5, 'Linhas'),
      count('matrixColumns', 4, 3, 6, 'Colunas'),
      delay('cueDelayMs', 50, 'Atraso da pergunta', 'up'),
      count('questionCount', 1, 1, 3, 'Perguntas'),
    ],
    escalation: ['exposureMs', 'cueDelayMs', 'questionCount', 'matrixColumns', 'matrixRows'],
  },
  'peripheral-fixation': {
    id: 'peripheral-fixation',
    name: 'Peripheral Fixation',
    blurb: 'Amplie o que você percebe sem largar o ponto de fixação.',
    defaultMinutes: 6,
    stimulusTypes: ['digits', 'letters', 'shapes'],
    defaultStimulus: 'digits',
    dimensions: [
      exposure(150),
      ratio('peripheralDistance', 0.45, 0.30, 0.95, 0.08, 'Distância do centro', 'up'),
      count('stimulusCount', 3, 2, 8, 'Itens'),
      ratio('itemScale', 1, 0.5, 1, 0.08, 'Tamanho', 'down'),
    ],
    escalation: ['exposureMs', 'peripheralDistance', 'stimulusCount', 'itemScale'],
  },
  'abstract-flash': {
    id: 'abstract-flash',
    name: 'Abstract Flash',
    blurb: 'Treine memória visual reduzindo o apoio verbal.',
    defaultMinutes: 6,
    stimulusTypes: ['symbols', 'shapes'],
    defaultStimulus: 'symbols',
    dimensions: [
      exposure(300),
      count('stimulusCount', 3, 2, 8, 'Símbolos'),
      count('distractorCount', 4, 2, 10, 'Distratores'),
    ],
    escalation: ['exposureMs', 'stimulusCount', 'distractorCount', 'exposureMs'],
  },
  'visual-threshold': {
    id: 'visual-threshold',
    name: 'Visual Threshold',
    blurb: 'Pressione o limite inicial da percepção visual.',
    defaultMinutes: 4,
    stimulusTypes: ['shapes'],
    defaultStimulus: 'shapes',
    dimensions: [
      exposure(80),
      ratio('contrast', 1, 0.08, 1, 0.09, 'Contraste', 'down'),
      ratio('itemScale', 1, 0.4, 1, 0.1, 'Tamanho', 'down'),
    ],
    escalation: ['contrast', 'exposureMs', 'itemScale', 'contrast'],
  },
  benchmark: {
    id: 'benchmark',
    name: 'Daily Benchmark',
    blurb: 'Protocolo fixo, para comparar dias diferentes com a mesma régua.',
    defaultMinutes: 2,
    adaptive: false,
    stimulusTypes: ['mixed'],
    defaultStimulus: 'mixed',
    dimensions: [],
    escalation: [],
  },
};

export const MODULE_IDS = Object.keys(MODULE_SPECS);

/** Rotina padrão: 40 minutos, na ordem sugerida. */
export const DEFAULT_ROUTINE = {
  id: 'default',
  name: 'Rotina padrão',
  isDefault: true,
  modules: [
    { moduleId: 'partial-report', minutes: 12, preset: 'tryhard', adaptive: true, stimulus: 'mixed' },
    { moduleId: 'peripheral-matrix', minutes: 8, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
    { moduleId: 'mask-resistance', minutes: 7, preset: 'tryhard', adaptive: true, stimulus: 'digits' },
    { moduleId: 'abstract-flash', minutes: 6, preset: 'tryhard', adaptive: true, stimulus: 'symbols' },
    { moduleId: 'iconic-readout', minutes: 5, preset: 'tryhard', adaptive: true, stimulus: 'mixed' },
    { moduleId: 'benchmark', minutes: 2, preset: 'tryhard', adaptive: false, stimulus: 'mixed' },
  ],
};

export const DEFAULT_TRY_HARD_SETTINGS = {
  adaptive: true,
  feedback: 'full',          // full | minimal | none
  countdown: true,
  sound: false,
  fixationMs: null,          // null = faixa padrão com variação
  masking: true,
  immersive: true,
  advancedMetrics: false,
  onboarded: false,
  stimulusTypes: { digits: true, letters: true, mixed: true, symbols: true, shapes: true },
};
