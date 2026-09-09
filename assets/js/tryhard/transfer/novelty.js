// Motor de novidade.
//
// O risco de qualquer treino perceptivo é a pessoa ficar boa no treino em vez
// de ficar boa em perceber. Isso acontece quando o material se repete: mesmo
// modelo, mesma posição, mesmo tipo de pergunta, mesma resposta. Este arquivo
// existe para impedir isso.
//
// Três garantias:
//  1. nenhum modelo domina a janela recente;
//  2. parte das exposições usa material que a pessoa nunca treinou;
//  3. alguns modelos são HOLDOUTS VERDADEIROS — nunca aparecem em treino,
//     inclusive no Modo Caos. Só podem aparecer em validação/benchmark.

import { MAX_TIER, TRANSFER_CONFIG, TRANSFER_TIERS } from './config.js';
import { allTemplates, getFamily } from './families/index.js';

export const templateKey = (familyId, templateId) => `${familyId}/${templateId}`;

/** Estado de curto prazo do sorteio. Não precisa ser persistido. */
export function createNoveltyState() {
  return { recent: [], lastKey: null, lastKinds: [], lastAnswers: [] };
}

/** Famílias liberadas numa faixa. */
export function familiesForTier(tier) {
  const t = Math.min(MAX_TIER, Math.max(0, Math.round(tier)));
  return TRANSFER_TIERS[t].families;
}

/** Todos os modelos candidatos de uma faixa. */
export function candidatesForTier(tier) {
  const families = new Set(familiesForTier(tier));
  return allTemplates().filter((t) => families.has(t.familyId));
}

/** Fração da janela recente ocupada por um modelo. */
function shareOf(recent, key) {
  if (!recent.length) return 0;
  return recent.filter((r) => r === key).length / recent.length;
}

/**
 * Escolhe o próximo modelo.
 *
 * `training` e `chaos` usam SOMENTE o pool aberto. `validation` usa SOMENTE
 * holdouts. Esta separação é propositalmente rígida: depois que um template
 * reservado aparece com resposta/feedback, ele já não é uma medida limpa de
 * transferência futura.
 */
export function pickTemplate({
  tier, rng = Math.random, state = createNoveltyState(), trainedKeys = [],
  noveltyRate = 0.45, mode = 'training',
}) {
  const trained = trainedKeys instanceof Set ? trainedKeys : new Set(trainedKeys);
  const pool = candidatesForTier(tier);
  const withKey = pool.map((t) => ({ ...t, key: templateKey(t.familyId, t.templateId) }));

  const holdouts = withKey.filter((t) => t.holdout);
  const openPool = withKey.filter((t) => !t.holdout);
  const unseen = openPool.filter((t) => !trained.has(t.key));
  const seen = openPool.filter((t) => trained.has(t.key));

  let bucket;
  let reason;
  if (mode === 'validation') {
    // Falhar explicitamente é melhor que cair silenciosamente no pool treinável
    // e chamar aquilo de validação.
    if (!holdouts.length) throw new Error(`Sem holdout disponível na faixa ${tier}`);
    bucket = holdouts;
    reason = 'reservado';
  } else if (mode === 'chaos') {
    bucket = unseen.length ? unseen : openPool;
    reason = 'caos';
  } else if (unseen.length && rng() < noveltyRate) {
    bucket = unseen;
    reason = 'inédito';
  } else if (seen.length) {
    bucket = seen;
    reason = 'conhecido';
  } else {
    bucket = openPool;
    reason = 'inédito';
  }

  // Em treino nunca existe fallback para `withKey`, pois isso poderia vazar
  // holdout. Se uma faixa não tiver modelo aberto, a configuração está errada.
  if (!bucket.length) {
    throw new Error(`Sem modelo treinável disponível na faixa ${tier}`);
  }

  // Evita repetir o modelo anterior e o que já domina a janela recente.
  const ceiling = TRANSFER_CONFIG.templateShareCeiling;
  const filtered = bucket.filter((t) => t.key !== state.lastKey
    && shareOf(state.recent, t.key) < ceiling);
  const finalPool = filtered.length ? filtered : bucket.filter((t) => t.key !== state.lastKey);
  const choices = finalPool.length ? finalPool : bucket;

  const chosen = choices[Math.floor(rng() * choices.length)];
  return {
    familyId: chosen.familyId,
    templateId: chosen.templateId,
    key: chosen.key,
    novel: !trained.has(chosen.key),
    holdout: !!chosen.holdout,
    reason,
  };
}

/** Registra o que acabou de ser usado, para o próximo sorteio evitar. */
export function noteUse(state, { key, queryKinds = [], answers = [] }) {
  state.recent.push(key);
  if (state.recent.length > 20) state.recent.shift();
  state.lastKey = key;
  state.lastKinds = queryKinds;
  state.lastAnswers = answers;
  return state;
}

/**
 * Quanto a próxima cena deve variar de aparência. Sobe com a pressão de
 * generalização e com a repetição recente do mesmo modelo.
 */
export function variationAmount(state, { contextualVariation = 0.5, key = null } = {}) {
  const repetition = key ? shareOf(state.recent, key) : 0;
  return Math.min(1, Math.max(0.15, contextualVariation + repetition * 0.5));
}

/** Modelos reservados de uma faixa, para o painel explicar o que é validação. */
export function holdoutTemplates(tier) {
  return candidatesForTier(tier).filter((t) => t.holdout);
}

/** Nome legível de um modelo, para relatórios. */
export function templateLabel(familyId, templateId) {
  const family = getFamily(familyId);
  const t = family?.templates.find((x) => x.id === templateId);
  return `${family?.name || familyId} · ${t?.label || templateId}`;
}
