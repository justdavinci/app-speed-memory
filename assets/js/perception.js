// Escala de tempos de exposição e os níveis de cada tipo de estímulo.
//
// São duas réguas, porque os dois estímulos não se comparam na mesma: ver um
// dígito é reconhecer um caractere, ler uma palavra exige acesso ao léxico.
//
// Cada régua tem uma carga de referência, e o tempo medido é convertido para
// ela antes de virar nível. Assim quantidade e tempo entram na mesma conta:
// 8 dígitos em 100 ms valem o mesmo que 4 dígitos em 50 ms.

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
    id: 'relampago',
    max: 10,
    range: 'até 10 ms',
    name: 'Relâmpago',
    text: 'No limite do que a visão registra. Poucas pessoas acertam uma sequência aqui.',
  },
  {
    id: 'faisca',
    max: 20,
    range: '10–20 ms',
    name: 'Faísca',
    text: 'Tempo de captar um dígito, às vezes dois, antes da imagem sumir.',
  },
  {
    id: 'flash',
    max: 50,
    range: '20–50 ms',
    name: 'Flash',
    text: 'Vários dígitos de uma vez, com a atenção bem afiada.',
  },
  {
    id: 'piscada',
    max: 100,
    range: '50–100 ms',
    name: 'Piscada',
    text: 'A sequência inteira cabe no tempo de uma piscada.',
  },
  {
    id: 'olhada',
    max: 200,
    range: '100–200 ms',
    name: 'Olhada',
    text: 'Tempo suficiente para registrar a sequência com folga.',
  },
  {
    id: 'vista',
    max: 500,
    range: '200–500 ms',
    name: 'Vista calma',
    text: 'Aqui o limite deixa de ser a visão e passa a ser a memória.',
  },
  {
    id: 'sempressa',
    max: Infinity,
    range: 'acima de 500 ms',
    name: 'Sem pressa',
    text: 'Tempo à vontade para ver: o desafio é só lembrar.',
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
    id: 'relampago',
    max: 35,
    range: 'até 35 ms',
    name: 'Relâmpago',
    text: 'Mais rápido do que a leitura costuma alcançar, mesmo com uma palavra só.',
  },
  {
    id: 'faisca',
    max: 70,
    range: '35–70 ms',
    name: 'Faísca',
    text: 'Uma ou outra palavra é reconhecida; a maioria escapa antes de virar memória.',
  },
  {
    id: 'flash',
    max: 120,
    range: '70–120 ms',
    name: 'Flash',
    text: 'Acima do ritmo da leitura veloz. Funciona com palavras curtas e familiares.',
  },
  {
    id: 'piscada',
    max: 200,
    range: '120–200 ms',
    name: 'Piscada',
    text: 'Ritmo de quem lê rápido e treinado: 300 a 500 palavras por minuto.',
  },
  {
    id: 'olhada',
    max: 300,
    range: '200–300 ms',
    name: 'Olhada',
    text: 'Ritmo de leitura corrente, entre 200 e 300 palavras por minuto.',
  },
  {
    id: 'vista',
    max: 500,
    range: '300–500 ms',
    name: 'Vista calma',
    text: 'Tempo de sobra para ler cada palavra e já começar a memorizar.',
  },
  {
    id: 'sempressa',
    max: Infinity,
    range: 'acima de 500 ms',
    name: 'Sem pressa',
    text: 'A leitura não é mais o gargalo: o desafio é memória e estratégia.',
  },
];

/**
 * As duas réguas. `refCount` é a carga de referência: o tempo medido é
 * convertido para ela antes de virar nível, o que deixa comparáveis séries de
 * tamanhos diferentes.
 */
export const BAND_SCALES = {
  digits: {
    id: 'digits',
    label: 'Dígitos',
    refCount: 4,
    unit: 'tempo para 4 dígitos',
    unitShort: 'por 4 dígitos',
    bands: DIGIT_BANDS,
  },
  words: {
    id: 'words',
    label: 'Palavras',
    refCount: 1,
    unit: 'tempo por palavra',
    unitShort: 'por palavra',
    bands: WORD_BANDS,
  },
};

/** Régua de um modo de treino. Frases também são estímulo verbal. */
export function scaleForMode(mode) {
  return mode === 'digits' ? BAND_SCALES.digits : BAND_SCALES.words;
}

/**
 * Converte um tempo de exposição para a carga de referência da régua.
 * 8 dígitos em 100 ms e 4 dígitos em 50 ms dão o mesmo valor: é assim que
 * quantidade e tempo entram na mesma conta.
 */
export function basisFor(mode, exposureMs, count) {
  const scale = scaleForMode(mode);
  if (!count || count <= 0) return exposureMs;
  return (exposureMs * scale.refCount) / count;
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
