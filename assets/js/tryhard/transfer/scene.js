// Esquema comum de cena.
//
// Cada família de estímulo (lista, interface, documento, mapa, cena) desenha
// coisas muito diferentes, mas todas descrevem o mesmo tipo de conteúdo: um
// punhado de elementos com rótulo, valor, categoria, estado e posição. É esse
// denominador comum que permite fazer perguntas imprevisíveis sobre qualquer
// material sem escrever um gerador de perguntas por família.
//
// Uma consequência importante: como as perguntas nascem dos elementos, e não
// do desenho, a mesma cena pode ser cobrada de dezenas de formas diferentes.
// A pessoa não tem como saber, durante a exposição, o que será pedido.

/**
 * Elemento de cena.
 * @param {object} data
 * @param {string} data.id        identificador interno
 * @param {string} data.label     nome pelo qual o elemento é citado
 * @param {string} data.value     valor mostrado (texto já formatado)
 * @param {number} [data.numeric] valor numérico, quando comparável
 * @param {string} [data.category] agrupamento (categoria, seção, cor)
 * @param {string} [data.attribute] estado/atributo secundário
 * @param {number} [data.row]     posição em grade
 * @param {number} [data.col]
 * @param {number} [data.x]       posição livre, 0..1
 * @param {number} [data.y]
 */
export function element(data) {
  return {
    id: data.id,
    label: data.label,
    value: data.value === undefined || data.value === null ? '' : String(data.value),
    numeric: typeof data.numeric === 'number' ? data.numeric : null,
    category: data.category || null,
    attribute: data.attribute || null,
    row: data.row ?? null,
    col: data.col ?? null,
    x: data.x ?? null,
    y: data.y ?? null,
    kind: data.kind || 'field',
  };
}

/**
 * Cena pronta para apresentar.
 * `html` é a marcação já montada — a apresentação não pode construir nada
 * durante a janela crítica de exposição.
 */
export function createScene({
  familyId, templateId, templateLabel, tier, title = '', elements = [],
  layout = {}, html = '', variant = {}, distractors = [], queryKinds = null,
  attributeNoun = 'a situação',
}) {
  return {
    familyId,
    templateId,
    templateLabel: templateLabel || templateId,
    tier,
    title,
    elements,
    distractors,
    queryKinds,
    attributeNoun,
    layout: { kind: 'free', rows: null, cols: null, ...layout },
    variant,
    html,
  };
}

/** Elementos que dá para localizar numa grade. */
export function gridElements(scene) {
  return scene.elements.filter((e) => e.row !== null && e.col !== null);
}

/** Elementos com valor numérico, para perguntas de comparação e extremo. */
export function numericElements(scene) {
  return scene.elements.filter((e) => e.numeric !== null);
}

/** Vizinho imediato numa grade, se existir. */
export function neighborOf(scene, target, direction) {
  const delta = {
    right: [0, 1], left: [0, -1], above: [-1, 0], below: [1, 0],
  }[direction];
  if (!delta || target.row === null || target.col === null) return null;
  return gridElements(scene).find(
    (e) => e.row === target.row + delta[0] && e.col === target.col + delta[1],
  ) || null;
}

/**
 * Custo de percepção da cena. Não é o número de elementos puro: um documento
 * com dez campos rotulados exige mais leitura que dez dígitos soltos, e a
 * variedade de categorias e atributos também pesa.
 */
export function sceneComplexity(scene) {
  const n = scene.elements.length;
  if (!n) return 1;
  const categories = new Set(scene.elements.map((e) => e.category).filter(Boolean)).size;
  const attributes = new Set(scene.elements.map((e) => e.attribute).filter(Boolean)).size;
  const textLoad = scene.elements.reduce(
    (a, e) => a + String(e.label).length * 0.02 + String(e.value).length * 0.03, 0,
  ) / n;
  const tierWeight = 1 + (scene.tier || 0) * 0.06;
  const raw = (1 + n / 12 + categories / 14 + attributes / 18 + textLoad) * tierWeight;
  return Math.round(Math.min(3.2, Math.max(1, raw)) * 100) / 100;
}

/** Assinatura usada pelo motor de novidade para não repetir a mesma cena. */
export function sceneSignature(scene) {
  return [
    scene.familyId,
    scene.templateId,
    scene.layout.kind,
    scene.variant.palette || '-',
    scene.variant.align || '-',
    scene.elements.length,
  ].join('|');
}
