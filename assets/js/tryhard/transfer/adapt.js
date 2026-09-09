// Decisão de para onde apertar.
//
// O motor de dificuldade do Try Hard sabe subir e descer uma dimensão por vez,
// mas não sabe QUAL dimensão importa agora. Aqui entra a regra central do Real
// World Transfer:
//
//   lacuna de transferência grande  →  aumentar a pressão de generalização
//                                      (variar contexto, subir de faixa,
//                                       variar formato de resposta)
//   lacuna pequena                  →  aumentar a dificuldade bruta
//                                      (menos tempo, mais informação, mais
//                                       atraso, mais interferência)
//
// Ou seja: acelerar só é permitido enquanto a habilidade estiver acompanhando
// o material novo. Do contrário o app estaria treinando a pessoa a ficar boa
// no próprio app.

import {
  GENERALIZATION_ESCALATION, MAX_TIER, RAW_ESCALATION, TRANSFER_CONFIG, TRANSFER_PRESETS,
} from './config.js';
import { transferGap, tierRecommendation } from './metrics.js';

/** Qual eixo apertar agora. */
export function pressureFor(trials) {
  const gap = transferGap(trials);
  if (gap === null) {
    return { axis: 'raw', gap: null, reason: 'ainda sem comparação — segue no ritmo normal' };
  }
  if (gap >= TRANSFER_CONFIG.overfitGapThreshold) {
    return { axis: 'generalization', gap, reason: 'desempenho preso ao material treinado' };
  }
  if (gap >= TRANSFER_CONFIG.transferGapThreshold) {
    return { axis: 'generalization', gap, reason: 'material novo ainda custa caro' };
  }
  return { axis: 'raw', gap, reason: 'transferência acompanhando: dá para apertar o tempo' };
}

/** Ordem de escalada correspondente ao eixo escolhido. */
export function escalationFor(trials) {
  return pressureFor(trials).axis === 'generalization'
    ? GENERALIZATION_ESCALATION
    : RAW_ESCALATION;
}

/** Faixa efetiva de uma tentativa, considerando preset e trava manual. */
export function effectiveTier(difficulty, settings = {}) {
  if (settings.lockedTier !== null && settings.lockedTier !== undefined) {
    return Math.min(MAX_TIER, Math.max(0, Math.round(settings.lockedTier)));
  }
  const preset = TRANSFER_PRESETS[settings.preset] || TRANSFER_PRESETS.balanced;
  const bias = settings.preset === 'custom' ? (settings.tierBias || 0) : preset.tierBias;
  return Math.min(MAX_TIER, Math.max(0, Math.round((difficulty?.tier ?? 0) + bias)));
}

/** Profundidade efetiva das perguntas. */
export function effectiveQueryComplexity(difficulty, settings = {}) {
  const preset = TRANSFER_PRESETS[settings.preset] || TRANSFER_PRESETS.balanced;
  const bias = settings.preset === 'custom' ? (settings.queryBias || 0) : preset.queryBias;
  return Math.min(4, Math.max(1, Math.round((difficulty?.queryComplexity ?? 1) + bias)));
}

/** Fração de material inédito pedida pelo preset. */
export function effectiveNoveltyRate(settings = {}) {
  const preset = TRANSFER_PRESETS[settings.preset] || TRANSFER_PRESETS.balanced;
  const rate = settings.preset === 'custom' ? settings.noveltyRate : preset.noveltyRate;
  const [min, max] = TRANSFER_CONFIG.noveltyRange;
  return Math.min(max, Math.max(min, rate ?? preset.noveltyRate));
}

/**
 * Ajuste de faixa ao fim de um bloco. Sobe só com desempenho estável em
 * material novo; desce quando o bloco inteiro ficou fora de alcance.
 */
export function nextTier(trials, currentTier) {
  const decision = tierRecommendation(trials, currentTier);
  if (decision === 'up') return Math.min(MAX_TIER, currentTier + 1);
  if (decision === 'down') return Math.max(0, currentTier - 1);
  return currentTier;
}

/** Frase curta sobre o que o motor está fazendo, para o painel não ser opaco. */
export function pressureSummary(trials) {
  const { axis, gap, reason } = pressureFor(trials);
  return {
    axis,
    gap,
    reason,
    label: axis === 'generalization' ? 'Variando o material' : 'Apertando o tempo',
  };
}
