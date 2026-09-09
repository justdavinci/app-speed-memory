// Registro dos módulos. Acrescentar um exercício novo é escrever o arquivo,
// declarar as dimensões dele em config.js e listá-lo aqui.

import partialReport from './partialReport.js';
import maskResistance from './maskResistance.js';
import peripheralMatrix from './peripheralMatrix.js';
import iconicReadout from './iconicReadout.js';
import peripheralFixation from './peripheralFixation.js';
import abstractFlash from './abstractFlash.js';
import visualThreshold from './visualThreshold.js';
import benchmark from './benchmark.js';

export const MODULES = {
  'partial-report': partialReport,
  'mask-resistance': maskResistance,
  'peripheral-matrix': peripheralMatrix,
  'iconic-readout': iconicReadout,
  'peripheral-fixation': peripheralFixation,
  'abstract-flash': abstractFlash,
  'visual-threshold': visualThreshold,
  benchmark,
};

export function getModule(id) {
  return MODULES[id] || null;
}

export { BENCHMARK_PROTOCOL, BENCHMARK_TRIALS } from './benchmark.js';
