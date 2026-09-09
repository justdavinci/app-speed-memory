// Motor de novidade.
//
// O risco de qualquer treino perceptivo é a pessoa ficar boa no treino em vez
// de ficar boa em perceber. Isso acontece quando o material se repete: mesmo
// modelo, mesma posição, mesmo tipo de pergunta, mesma resposta. Este arquivo
// existe para impedir isso.
//
// Nos módulos reais, `training` e `chaos` nunca veem holdouts. `validation`
// usa somente holdouts. O modo `legacy` existe apenas para compatibilidade com
// chamadas antigas diretas do helper; o app não o usa.

import { MAX_TIER, TRANSFER_CONFIG, TRANSFER_TIERS } from './config.js';
import { allTemplates, getFamily } from './families/index.js';

export const templateKey = (familyId, templateId) => `${familyId}/${templateId}`;

export function createNoveltyState() {
  return { recent: [], lastKey: null, lastKinds: [], lastAnswers: [] };
}

export function familiesForTier(tier) {
  const t = Math.min(MAX_TIER, Math.max(0, Math.round(tier)));
  return TRANSFER_TIERS[t].families;
}

export function candidatesForTier(tier) {
  const families = new Set(familiesForTier(tier));
  return allTemplates().filter((t) => families.has(t.familyId));
}

function shareOf(recent, key) {
  if (!recent.length) return 0;
  return recent.filter((r) => r === key).length / recent.length;
}

/**
 * Escolhe o próximo template.
 *
 * - training: apenas templates abertos;
 * - chaos: apenas templates abertos, priorizando inéditos;
 * - validation: apenas holdouts;
 * - legacy: compatibilidade do helper antigo; pode sortear holdout.
 */
export function pickTemplate({
  tier, rng = Math.random, state = createNoveltyState(), trainedKeys = [],
  noveltyRate = 0.45, mode = 'legacy',
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
    if (!holdouts.length) throw new Error(`Sem holdout disponível na faixa ${tier}`);
    bucket = holdouts;
    reason = 'reservado';
  } else if (mode === 'chaos') {
    bucket = unseen.length ? unseen : openPool;
    reason = 'caos';
  } else if (mode === 'legacy' && rng() < (TRANSFER_CONFIG.legacyHoldoutRate || 0) && holdouts.length) {
    bucket = holdouts;
    reason = 'reservado';
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

  if (!bucket.length) {
    if (mode === 'legacy' && withKey.length) bucket = withKey;
    else throw new Error(`Sem modelo ${mode === 'validation' ? 'reservado' : 'treinável'} disponível na faixa ${tier}`);
  }

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

export function noteUse(state, { key, queryKinds = [], answers = [] }) {
  state.recent.push(key);
  if (state.recent.length > 20) state.recent.shift();
  state.lastKey = key;
  state.lastKinds = queryKinds;
  state.lastAnswers = answers;
  return state;
}

export function variationAmount(state, { contextualVariation = 0.5, key = null } = {}) {
  const repetition = key ? shareOf(state.recent, key) : 0;
  return Math.min(1, Math.max(0.15, contextualVariation + repetition * 0.5));
}

export function holdoutTemplates(tier) {
  return candidatesForTier(tier).filter((t) => t.holdout);
}

export function templateLabel(familyId, templateId) {
  const family = getFamily(familyId);
  const t = family?.templates.find((x) => x.id === templateId);
  return `${family?.name || familyId} · ${t?.label || templateId}`;
}
