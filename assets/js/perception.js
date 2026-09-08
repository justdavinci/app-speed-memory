// Escala de tempos de exposição e a classificação perceptual associada.
//
// A tabela de faixas é informativa: descreve o que a literatura de percepção
// visual e memória icônica costuma observar em cada duração. Serve para situar
// o treino, não para diagnosticar nada.

/**
 * Passos do seletor de exposição, em milissegundos. Finos embaixo (onde 5 ms
 * fazem diferença) e grossos em cima (onde 5 s não fazem).
 */
export const EXPOSURE_STEPS = [
  5, 8, 10, 13, 16, 20, 25, 30, 40, 50, 65, 80,
  100, 125, 150, 200, 250, 300, 400, 500, 650, 800,
  1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 6500, 8000,
  10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 90000, 120000,
];

export const MIN_EXPOSURE_MS = EXPOSURE_STEPS[0];
export const MAX_EXPOSURE_MS = EXPOSURE_STEPS[EXPOSURE_STEPS.length - 1];

/** Índice do passo mais próximo de `ms` (para posicionar o controle). */
export function stepIndexFor(ms) {
  let best = 0;
  let dist = Infinity;
  EXPOSURE_STEPS.forEach((step, i) => {
    const d = Math.abs(step - ms);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

/** "5 ms", "250 ms", "1,5 s", "10 s" */
export function formatExposure(ms) {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  const text = Number.isInteger(s) ? String(s) : s.toFixed(1).replace('.', ',');
  return `${text} s`;
}

/**
 * Faixas de exposição. `max` é o limite superior inclusivo, em ms.
 * As seis primeiras vêm da tabela de referência; a última é a extensão para
 * tempos acima dela, onde o desafio deixa de ser perceptual.
 */
export const PERCEPTION_BANDS = [
  {
    id: 'limiar',
    max: 10,
    range: '5–10 ms',
    name: 'Limiar visual',
    text: 'Pode haver processamento visual, mas identificação consciente confiável é difícil.',
  },
  {
    id: 'identificacao',
    max: 20,
    range: '10–20 ms',
    name: 'Identificação isolada',
    text: 'Um dígito ou estímulo simples pode às vezes ser identificado.',
  },
  {
    id: 'multiplo',
    max: 50,
    range: '20–50 ms',
    name: 'Reconhecimento múltiplo',
    text: 'Já pode ser suficiente para reconhecer vários caracteres em condições ideais.',
  },
  {
    id: 'iconica',
    max: 100,
    range: '50–100 ms',
    name: 'Memória icônica',
    text: 'Faixa da duração clássica dos experimentos de memória icônica (~50 ms): cerca de 4 a 5 caracteres relatados em média.',
  },
  {
    id: 'codificacao',
    max: 200,
    range: '100–200 ms',
    name: 'Codificação eficiente',
    text: 'Uma sequência curta já pode ser codificada com bastante eficiência.',
  },
  {
    id: 'memoria',
    max: 500,
    range: '200–500 ms',
    name: 'Memória e atenção',
    text: 'A limitação começa a ser muito mais de capacidade de memória e atenção do que de percepção.',
  },
  {
    id: 'livre',
    max: Infinity,
    range: 'acima de 500 ms',
    name: 'Leitura confortável',
    text: 'Fora da faixa da tabela: o tempo já dá para ler à vontade e o desafio é inteiramente de memória.',
  },
];

/** Faixa perceptual correspondente a uma exposição em ms. */
export function bandFor(ms) {
  return PERCEPTION_BANDS.find((b) => ms <= b.max) || PERCEPTION_BANDS[PERCEPTION_BANDS.length - 1];
}

/** Posição (1-based) da faixa na tabela, para exibir como "nível". */
export function bandLevel(band) {
  return PERCEPTION_BANDS.length - PERCEPTION_BANDS.indexOf(band);
}
