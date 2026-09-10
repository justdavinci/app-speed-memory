// MEMORY LAB — perguntas imprevisíveis.
//
// O usuário não sabe antes da exposição se precisará de significado, detalhe,
// posição ou relação. Isso força uma representação mais ampla do estímulo em
// vez de otimizar para um único tipo de pergunta.

import { normalizeToken, shuffle } from '../util.js';

const FALSE_ANCHORS = [
  'telescópio', 'ferrovia', 'biblioteca', 'diamante', 'campanário', 'espelho',
  'navio', 'manuscrito', 'hospital', 'jardineiro', 'relógio', 'tribunal',
];

const REGION_LABELS = ['superior', 'meio', 'inferior'];

function regionFor(block, count) {
  if (count <= 1) return 'meio';
  const p = block / (count - 1);
  if (p < 0.34) return 'superior';
  if (p > 0.66) return 'inferior';
  return 'meio';
}

function choice(id, component, type, prompt, answer, distractors, rng) {
  const clean = (distractors || []).filter((x) => x !== null && x !== undefined && String(x) !== String(answer));
  const options = shuffle([answer, ...clean].slice(0, 4), rng);
  return { id, component, type, prompt, answer, options, kind: 'choice' };
}

export function questionBankFor(stimulus, rng = Math.random) {
  const out = [];

  // Conteúdo semântico só entra quando o corpus trouxe um gabarito explícito.
  // Não inferimos silenciosamente "a ideia correta" em runtime.
  if (stimulus.summary && (stimulus.semanticDistractors || []).length >= 2) {
    out.push(choice(
      `${stimulus.id}:semantic`, 'reconstruction', 'semantic',
      'Qual alternativa melhor resume o que você viu?',
      stimulus.summary,
      stimulus.semanticDistractors || [],
      rng,
    ));
  }

  // Relações concretas: pessoa↔idade, objeto↔lugar, evento↔número etc.
  (stimulus.facts || []).forEach((f, i) => {
    if (!f?.prompt || f.answer === null || f.answer === undefined || !(f.distractors || []).length) return;
    out.push(choice(
      `${stimulus.id}:fact:${i}`, 'binding', 'binding',
      f.prompt, f.answer, f.distractors || [], rng,
    ));
  });

  // Presença de âncora força detalhe literal sem pedir reprodução textual.
  const anchor = stimulus.anchors?.[0];
  if (anchor) {
    const joined = (stimulus.blocks || []).join(' ').toLowerCase();
    const falseOnes = FALSE_ANCHORS.filter((x) => !joined.includes(x.toLowerCase()));
    out.push(choice(
      `${stimulus.id}:anchor`, 'capture', 'anchor',
      'Qual destes elementos realmente apareceu no material?',
      anchor.text,
      falseOnes.slice(0, 3),
      rng,
    ));
  }

  // Estrutura e localização: essenciais para Page Capture e funcionam também
  // em packs privados que contenham apenas página + âncoras.
  if (Array.isArray(stimulus.blocks) && stimulus.blocks.length) {
    out.push(choice(
      `${stimulus.id}:structure`, 'reconstruction', 'structure',
      'Quantos blocos principais de texto havia na página?',
      String(stimulus.blocks.length),
      ['1', '2', '3', '4', '5', '6'].filter((x) => x !== String(stimulus.blocks.length)).slice(0, 3),
      rng,
    ));
  }

  const spatial = stimulus.anchors?.find((a) => stimulus.blocks?.length >= 2 && a.block >= 0);
  if (spatial) {
    const answer = regionFor(spatial.block, stimulus.blocks.length);
    out.push(choice(
      `${stimulus.id}:spatial`, 'reconstruction', 'spatial',
      `Em que região da página aparecia “${spatial.text}”?`,
      answer,
      REGION_LABELS.filter((x) => x !== answer),
      rng,
    ));
  }

  return out;
}

/** Questão específica de pattern separation usando uma ficha de relações. */
export function separationQuestion(stimulus, factIndex = 0, rng = Math.random) {
  if (!stimulus?.facts?.length) return null;
  const fact = stimulus.facts[factIndex % stimulus.facts.length];
  const altered = fact.distractors?.[0] || 'outro valor';
  return choice(
    `${stimulus.id}:separation:${factIndex}`,
    'separation',
    'separation',
    `Na PRIMEIRA ficha, qual era a resposta para: “${fact.prompt}”`,
    fact.answer,
    [altered, ...(fact.distractors || []).slice(1, 3)],
    rng,
  );
}

export function scoreQuestion(question, response) {
  const a = normalizeToken(question?.answer ?? '', false);
  const b = normalizeToken(response ?? '', false);
  return a === b ? 1 : 0;
}

export function scoreResponses(questions, responses) {
  const perQuestion = questions.map((q, i) => ({
    questionId: q.id,
    type: q.type,
    component: q.component,
    correct: scoreQuestion(q, responses[i]),
  }));
  const correct = perQuestion.reduce((n, q) => n + q.correct, 0);
  return {
    correct,
    total: questions.length,
    accuracy: questions.length ? correct / questions.length : 0,
    perQuestion,
  };
}

/**
 * Seleciona tipos variados. O primeiro nunca depende de saber previamente o
 * que será perguntado, e perguntas duplicadas são evitadas.
 */
export function pickQuestions(bank, count, rng = Math.random, preferred = []) {
  const selected = [];
  const used = new Set();
  for (const type of preferred) {
    const candidates = bank.filter((q) => q.type === type && !used.has(q.id));
    if (candidates.length) {
      const q = candidates[Math.floor(rng() * candidates.length)];
      selected.push(q); used.add(q.id);
    }
    if (selected.length >= count) return selected;
  }
  for (const q of shuffle(bank, rng)) {
    if (used.has(q.id)) continue;
    selected.push(q); used.add(q.id);
    if (selected.length >= count) break;
  }
  return selected;
}
