// Escala de tempos de exposição e as classificações perceptuais associadas.
//
// São DUAS réguas, porque os dois estímulos não se comparam na mesma:
//
// - Dígitos: a régua é o tempo TOTAL de exibição da sequência. Vem da
//   literatura de memória icônica, onde um punhado de caracteres é exposto de
//   uma vez e a pessoa relata o que conseguiu.
// - Palavras: a régua é o tempo POR PALAVRA. Ler exige acesso ao léxico, e a
//   literatura de leitura mede justamente isso — duração da fixação e ritmo em
//   apresentação serial. Normalizar por palavra deixa a medida comparável entre
//   uma série de 3 e uma de 10 palavras.
//
// Ambas são referências aproximadas, em condições ideais, para situar o treino.

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
  const rounded = ms < 1000 ? Math.round(ms) : ms;
  if (rounded < 1000) return `${rounded} ms`;
  const s = rounded / 1000;
  const text = Number.isInteger(s) ? String(s) : s.toFixed(1).replace('.', ',');
  return `${text} s`;
}

/**
 * Faixas para DÍGITOS, pelo tempo total de exibição da sequência.
 * `max` é o limite superior inclusivo, em ms.
 */
export const DIGIT_BANDS = [
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

/**
 * Faixas para PALAVRAS, pelo tempo por palavra.
 *
 * Ancoradas em três referências da pesquisa em leitura: a fixação média na
 * leitura silenciosa fica em torno de 200 a 250 ms por palavra; leitura veloz
 * treinada chega perto de 120 a 200 ms por palavra; e, em apresentação serial
 * rápida, a compreensão desaba abaixo de cerca de 100 ms por palavra. Abaixo
 * disso entra o terreno do reconhecimento de palavra isolada com máscara, que
 * pode acontecer por volta de 30 a 50 ms.
 */
export const WORD_BANDS = [
  {
    id: 'lexical',
    max: 35,
    range: 'até 35 ms/palavra',
    name: 'Limiar lexical',
    text: 'Nesse tempo, mesmo uma palavra isolada só é identificada em condições ideais. Captar várias é improvável.',
  },
  {
    id: 'fugaz',
    max: 70,
    range: '35–70 ms/palavra',
    name: 'Reconhecimento fugaz',
    text: 'Uma ou outra palavra pode ser reconhecida, mas a maior parte escapa antes de virar memória.',
  },
  {
    id: 'serial',
    max: 120,
    range: '70–120 ms/palavra',
    name: 'Acima da leitura veloz',
    text: 'Mais rápido do que a compreensão costuma acompanhar em apresentação serial. Exige palavras curtas e familiares.',
  },
  {
    id: 'veloz',
    max: 200,
    range: '120–200 ms/palavra',
    name: 'Ritmo de leitura veloz',
    text: 'Perto do limite de leitores rápidos e treinados, algo como 300 a 500 palavras por minuto.',
  },
  {
    id: 'tipico',
    max: 300,
    range: '200–300 ms/palavra',
    name: 'Ritmo de leitura típico',
    text: 'Faixa da fixação média na leitura silenciosa: cerca de 200 a 300 palavras por minuto.',
  },
  {
    id: 'confortavel',
    max: 500,
    range: '300–500 ms/palavra',
    name: 'Leitura confortável',
    text: 'Tempo de sobra para ler cada palavra e ainda começar a organizar a memorização.',
  },
  {
    id: 'sempressa',
    max: Infinity,
    range: 'acima de 500 ms/palavra',
    name: 'Sem pressa',
    text: 'A leitura deixou de ser o gargalo: o desafio é inteiramente de memória e estratégia.',
  },
];

/** As duas réguas, com o rótulo da unidade em que cada uma mede. */
export const BAND_SCALES = {
  digits: {
    id: 'digits',
    label: 'Dígitos',
    unit: 'tempo total da série',
    unitShort: 'total',
    perItem: false,
    bands: DIGIT_BANDS,
  },
  words: {
    id: 'words',
    label: 'Palavras',
    unit: 'tempo por palavra',
    unitShort: 'por palavra',
    perItem: true,
    bands: WORD_BANDS,
  },
};

/** Régua de um modo de treino. Frases também são estímulo verbal. */
export function scaleForMode(mode) {
  return mode === 'digits' ? BAND_SCALES.digits : BAND_SCALES.words;
}

/**
 * Valor que a régua do modo compara: total para dígitos, por palavra para
 * estímulos verbais.
 */
export function basisFor(mode, exposureMs, count) {
  const scale = scaleForMode(mode);
  if (!scale.perItem) return exposureMs;
  return count > 0 ? exposureMs / count : exposureMs;
}

/** Faixa dentro de uma régua. */
export function bandIn(scale, basisMs) {
  return scale.bands.find((b) => basisMs <= b.max) || scale.bands[scale.bands.length - 1];
}

/** Posição da faixa na régua: 1 é a mais lenta, 7 a mais rápida. */
export function levelOf(scale, band) {
  return scale.bands.length - scale.bands.indexOf(band);
}

/**
 * Classifica uma exposição no modo indicado.
 * @returns {{scale:object, band:object, level:number, levels:number, basisMs:number}}
 */
export function classify(mode, exposureMs, count) {
  const scale = scaleForMode(mode);
  const basisMs = basisFor(mode, exposureMs, count);
  const band = bandIn(scale, basisMs);
  return { scale, band, level: levelOf(scale, band), levels: scale.bands.length, basisMs };
}

/**
 * Média dos níveis de dígitos e palavras — as duas famílias de estímulo.
 * @param {Array<{level:number}|null>} entries
 * @returns {number|null} média, ou null se faltar algum dos dois
 */
export function averageLevel(entries) {
  const valid = entries.filter((e) => e && typeof e.level === 'number');
  if (valid.length < 2) return null;
  return valid.reduce((a, e) => a + e.level, 0) / valid.length;
}

/** "5,5" com vírgula, sem casa decimal quando é inteiro. */
export function formatLevel(level) {
  if (level === null || level === undefined) return '—';
  return Number.isInteger(level) ? String(level) : level.toFixed(1).replace('.', ',');
}
