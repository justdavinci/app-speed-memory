// Perguntas geradas depois da exposição.
//
// Regra que define o exercício: a pergunta nasce da cena, nunca é anunciada
// antes. Como o mesmo material pode ser cobrado por valor, por posição, por
// vizinhança, por contagem, por extremo ou por comparação, decorar "o que
// costuma cair" não ajuda — a única estratégia que funciona é captar a cena.

import { rPick, rSample, rShuffle } from '../rng.js';
import { QUERIES_PER_TRIAL, QUERY_LEVELS } from './config.js';
import { gridElements, neighborOf, numericElements } from './scene.js';
import { itemAccuracy } from '../metrics.js';

const DIRECTIONS = [
  { id: 'right', label: 'à direita de' },
  { id: 'left', label: 'à esquerda de' },
  { id: 'above', label: 'acima de' },
  { id: 'below', label: 'abaixo de' },
];

function choice(options, { rng, symbols = false }) {
  return { kind: 'choice', options: rShuffle(rng, options), symbols };
}

/**
 * Cenas de figuras citam os símbolos pelo nome em português, mas a resposta
 * mostra o desenho: quem viu uma forma escolhe a forma, sem ter de traduzir a
 * figura em palavra antes de responder.
 */
function attachGlyphs(scene, query) {
  if (!scene.glyphs) return query;
  const out = { ...query };
  if (out.response.kind === 'choice') {
    out.response = { ...out.response, glyphs: scene.glyphs };
  }
  // O enunciado cita o alvo entre aspas; se for um símbolo, ele aparece
  // desenhado ao lado da pergunta. Com mais de um citado, nenhum: mostrar
  // apenas um seria pista de qual deles importa.
  const citados = [...String(out.text).matchAll(/"([^"]+)"/g)]
    .map((m) => scene.glyphs[m[1]])
    .filter(Boolean);
  if (citados.length === 1) out.symbol = citados[0];
  return out;
}

/** Alternativas plausíveis: valores da própria cena, depois distratores. */
function optionsAround(correct, pool, rng, size = 4) {
  const unique = [...new Set(pool.map((v) => String(v)))].filter((v) => v !== String(correct) && v !== '');
  const picked = rSample(rng, unique, Math.max(0, size - 1));
  return [String(correct), ...picked];
}

function valuePool(scene) {
  return scene.elements.map((e) => e.value).concat(scene.distractors || []);
}

function labelPool(scene) {
  return scene.elements.map((e) => e.label);
}

/* ------------------------------ construtores ---------------------------- */

const BUILDERS = {
  value(scene, rng) {
    const target = rPick(rng, scene.elements.filter((e) => e.value !== ''));
    if (!target) return null;
    return {
      kind: 'value',
      targetId: target.id,
      text: `Qual era o valor de "${target.label}"?`,
      answer: target.value,
      response: choice(optionsAround(target.value, valuePool(scene), rng), { rng }),
    };
  },

  attribute(scene, rng) {
    const withAttr = scene.elements.filter((e) => e.attribute);
    const target = rPick(rng, withAttr);
    if (!target) return null;
    const pool = scene.elements.map((e) => e.attribute).filter(Boolean);
    if (new Set(pool).size < 2) return null;
    return {
      kind: 'attribute',
      targetId: target.id,
      text: `Qual era ${scene.attributeNoun || 'a situação'} de "${target.label}"?`,
      answer: target.attribute,
      response: choice(optionsAround(target.attribute, pool, rng), { rng }),
    };
  },

  label(scene, rng) {
    const usable = scene.elements.filter((e) => e.value !== '');
    const counts = new Map();
    usable.forEach((e) => counts.set(e.value, (counts.get(e.value) || 0) + 1));
    const target = rPick(rng, usable.filter((e) => counts.get(e.value) === 1));
    if (!target) return null;
    return {
      kind: 'label',
      targetId: target.id,
      text: `Qual item tinha o valor "${target.value}"?`,
      answer: target.label,
      response: choice(optionsAround(target.label, labelPool(scene), rng), { rng }),
    };
  },

  presence(scene, rng) {
    const target = rPick(rng, scene.elements);
    if (!target) return null;
    const absent = (scene.distractors || []).filter((v) => !labelPool(scene).includes(v));
    if (absent.length < 2) return null;
    return {
      kind: 'presence',
      targetId: target.id,
      text: 'Qual destes apareceu?',
      answer: target.label,
      response: choice([target.label, ...rSample(rng, absent, 3)], { rng }),
    };
  },

  absent(scene, rng) {
    const absent = (scene.distractors || []).filter((v) => !labelPool(scene).includes(v));
    const missing = rPick(rng, absent);
    const present = rSample(rng, labelPool(scene), 3);
    if (!missing || present.length < 3) return null;
    return {
      kind: 'absent',
      targetId: null,
      text: 'Qual destes NÃO apareceu?',
      answer: missing,
      response: choice([missing, ...present], { rng }),
    };
  },

  position(scene, rng) {
    const cells = gridElements(scene);
    const target = rPick(rng, cells);
    const cols = scene.layout.cols;
    const rows = scene.layout.rows;
    if (!target || !cols || !rows || cols * rows > 30) return null;
    // Em cenas livres a grade é uma malha de regiões, não a posição exata.
    const regions = scene.layout.kind === 'regions';
    return {
      kind: 'position',
      targetId: target.id,
      text: regions
        ? `Em que região da tela estava "${target.label}"?`
        : `Onde estava "${target.label}"?`,
      answer: String(target.row * cols + target.col),
      response: { kind: 'cell', rows, cols },
    };
  },

  neighbor(scene, rng) {
    // Só faz sentido onde a grade é a posição real. Em cenas livres as linhas
    // e colunas são regiões grossas, e "logo à direita" seria mentira.
    if (scene.layout.kind !== 'grid') return null;
    const cells = gridElements(scene);
    if (cells.length < 3) return null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const anchor = rPick(rng, cells);
      const dir = rPick(rng, DIRECTIONS);
      const found = neighborOf(scene, anchor, dir.id);
      if (found && found.id !== anchor.id) {
        return {
          kind: 'neighbor',
          targetId: found.id,
          text: `O que estava logo ${dir.label} "${anchor.label}"?`,
          answer: found.label,
          response: choice(optionsAround(found.label, labelPool(scene), rng), { rng }),
        };
      }
    }
    return null;
  },

  count(scene, rng) {
    const groups = new Map();
    scene.elements.forEach((e) => {
      const key = e.attribute || e.category;
      if (!key) return;
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    const keys = [...groups.keys()];
    if (keys.length < 2) return null;
    const key = rPick(rng, keys);
    const answer = groups.get(key);
    if (answer > 9) return null;
    const options = [answer];
    for (let d = 1; options.length < 4 && d < 5; d++) {
      if (answer - d >= 0) options.push(answer - d);
      if (options.length < 4) options.push(answer + d);
    }
    return {
      kind: 'count',
      targetId: null,
      text: `Quantos itens estavam em "${key}"?`,
      answer: String(answer),
      response: choice(options.map(String), { rng }),
    };
  },

  extreme(scene, rng) {
    const nums = numericElements(scene);
    if (nums.length < 3) return null;
    const wantMax = rng() < 0.5;
    const sorted = [...nums].sort((a, b) => a.numeric - b.numeric);
    const target = wantMax ? sorted[sorted.length - 1] : sorted[0];
    const runnerUp = wantMax ? sorted[sorted.length - 2] : sorted[1];
    if (target.numeric === runnerUp.numeric) return null;
    return {
      kind: 'extreme',
      targetId: target.id,
      text: wantMax ? 'Qual item tinha o maior valor?' : 'Qual item tinha o menor valor?',
      answer: target.label,
      response: choice(optionsAround(target.label, nums.map((e) => e.label), rng), { rng }),
    };
  },

  compare(scene, rng) {
    const nums = numericElements(scene);
    if (nums.length < 2) return null;
    const pair = rSample(rng, nums, 2);
    if (pair.length < 2 || pair[0].numeric === pair[1].numeric) return null;
    const answer = pair[0].numeric > pair[1].numeric ? 'Sim' : 'Não';
    return {
      kind: 'compare',
      targetId: pair[0].id,
      text: `"${pair[0].label}" era maior que "${pair[1].label}"?`,
      answer,
      response: { kind: 'choice', options: ['Sim', 'Não'] },
    };
  },
};

export const QUERY_KINDS = Object.keys(BUILDERS);

/**
 * Monta as perguntas de uma tentativa.
 *
 * @param {object} scene
 * @param {object} opts
 * @param {number} opts.complexity  profundidade 1..4
 * @param {function} opts.rng
 * @param {string[]} [opts.avoidKinds]  tipos usados na tentativa anterior
 * @param {number} [opts.responseVariation] 0..1 — quanto o formato de resposta varia
 * @returns {Array} perguntas
 */
export function generateQueries(scene, { complexity = 1, rng = Math.random, avoidKinds = [], responseVariation = 0 } = {}) {
  const level = Math.min(4, Math.max(1, Math.round(complexity)));
  const allowed = QUERY_LEVELS[level];
  const wanted = QUERIES_PER_TRIAL[level];
  const familyKinds = scene.queryKinds || null;

  // Tipos preferidos: os liberados no nível, menos os da tentativa anterior.
  const eligible = allowed.filter((k) => (!familyKinds || familyKinds.includes(k)));
  const fresh = eligible.filter((k) => !avoidKinds.includes(k));
  const order = rShuffle(rng, fresh.length >= wanted ? fresh : eligible);

  const queries = [];
  const usedKinds = new Set();
  const usedTargets = new Set();

  for (const kind of order.concat(rShuffle(rng, eligible))) {
    if (queries.length >= wanted) break;
    if (usedKinds.has(kind)) continue;
    const raw = BUILDERS[kind]?.(scene, rng);
    if (!raw) continue;
    const built = attachGlyphs(scene, raw);
    if (built.targetId && usedTargets.has(built.targetId)) continue;
    usedKinds.add(kind);
    if (built.targetId) usedTargets.add(built.targetId);
    queries.push({ ...built, id: `q${queries.length}`, index: queries.length });
  }

  // Cena pobre demais para o nível pedido: garante ao menos uma pergunta.
  if (!queries.length) {
    const fallback = BUILDERS.value(scene, rng) || BUILDERS.presence(scene, rng);
    if (fallback) queries.push({ ...attachGlyphs(scene, fallback), id: 'q0', index: 0 });
  }

  return responseVariation > 0 ? varyResponses(queries, rng, responseVariation) : queries;
}

/**
 * Varia o formato de resposta sem mudar o que é perguntado: às vezes escolher
 * entre quatro, às vezes entre seis, às vezes apontar na grade. Formato fixo
 * vira hábito motor, e hábito motor não é percepção.
 */
function varyResponses(queries, rng, amount) {
  return queries.map((q) => {
    if (q.response.kind !== 'choice' || rng() > amount) return q;
    const options = q.response.options;
    if (options.length <= 2) return q;
    const size = rng() < 0.5 ? Math.min(6, options.length + 2) : options.length;
    return { ...q, response: { ...q.response, options: rShuffle(rng, options).slice(0, size) } };
  });
}

const norm = (v) => String(v ?? '').trim().toUpperCase();

/** Corrige as respostas, uma por pergunta. */
export function scoreQueries(queries, given) {
  const cells = queries.map((q, i) => ({
    index: i,
    kind: q.kind,
    expected: q.answer,
    given: given?.[i] ?? '',
    ok: norm(given?.[i]) !== '' && norm(given?.[i]) === norm(q.answer),
  }));
  const correct = cells.filter((c) => c.ok).length;
  return {
    cells,
    correct,
    total: cells.length,
    itemAccuracy: itemAccuracy(correct, cells.length),
    exact: correct === cells.length,
  };
}
