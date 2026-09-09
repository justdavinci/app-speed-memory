// Motor de currículo.
//
// Três eixos, não um número. Captura é quanto se apreende numa exposição;
// disponibilidade é quão cedo aquilo pode ser usado; transferência é se isso
// sobrevive quando o material muda. Um treino pode ir muito bem num eixo e
// mal em outro — "recorde de 50 ms" sozinho não diz nada sobre os outros dois.
//
// O que sai daqui é recomendação, não mudança automática: a rotina é do
// usuário, e mexer nela sem pedir seria decidir por ele.

import * as store from './store.js';
import { AVAILABILITY_CONFIG } from './availability/config.js';

const BOM = 0.62;
const FRACO = 0.45;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Rótulo de um eixo, para a interface não repetir a mesma conta. */
export function levelOf(value) {
  if (value === null || value === undefined) return 'sem dados';
  if (value >= BOM) return 'forte';
  if (value < FRACO) return 'fraco';
  return 'médio';
}

/**
 * Estado nos três eixos, cada um de 0 a 1.
 *
 * @returns {{capture:number|null, availability:number|null, transfer:number|null, ...}}
 */
export function cognitiveState() {
  const painel = store.getDashboard();
  const transferencia = store.getTransferReport();
  const disponibilidade = store.getAvailabilityReport();

  const capture = painel.totalTrials >= 20 && painel.throughput
    ? clamp01(painel.throughput / 1000)
    : null;

  const availability = disponibilidade.score === null
    ? null
    : clamp01(disponibilidade.score / AVAILABILITY_CONFIG.scoreScale);

  const transfer = transferencia.generalization === null
    ? null
    : clamp01(transferencia.generalization);

  return {
    capture,
    availability,
    transfer,
    detail: {
      throughput: painel.throughput,
      bestExposureMs: painel.bestExposureMs,
      accuracy: painel.accuracy,
      availabilityScore: disponibilidade.score,
      transferT80: disponibilidade.transferT80,
      availabilityGapMs: disponibilidade.transferGapMs,
      generalization: transferencia.generalization,
      transferGap: transferencia.transferGap,
      tier: transferencia.tier,
      categories: disponibilidade.categories,
    },
  };
}

/**
 * O que treinar a seguir. Cada recomendação diz o porquê: sugestão sem motivo
 * é adivinhação com cara de conselho.
 */
export function recommendations(state = cognitiveState()) {
  const { capture, availability, transfer } = state;
  const lista = [];

  const semDados = [capture, availability, transfer].filter((v) => v === null).length;
  if (semDados >= 2) {
    lista.push({
      id: 'coletar',
      title: 'Ainda faltam dados',
      text: 'Treine mais algumas sessões para os três eixos aparecerem. '
        + 'Recomendação sem dados seria chute.',
    });
    return lista;
  }

  if (capture !== null && availability !== null) {
    if (capture >= BOM && availability < FRACO) {
      lista.push({
        id: 'peso-disponibilidade',
        title: 'Você captura bem, mas demora a poder usar',
        text: 'A captura está forte e a disponibilidade não acompanha. '
          + 'Vale aumentar o peso da Disponibilidade Visual nos exercícios compatíveis.',
        action: 'availability',
      });
    }
    if (availability >= BOM && capture < FRACO) {
      lista.push({
        id: 'fundamentos',
        title: 'A informação fica disponível cedo, mas é pouca',
        text: 'Recuperar rápido pouca coisa tem limite. Vale voltar aos fundamentos: '
          + 'mais itens por exposição antes de encurtar mais o tempo.',
        action: 'capture',
      });
    }
  }

  if (availability !== null && transfer !== null && availability >= BOM && transfer < FRACO) {
    lista.push({
      id: 'mais-mundo-real',
      title: 'Rápido no conhecido, travado no novo',
      text: 'A disponibilidade melhorou onde você já treinou, mas não em material inédito. '
        + 'Aumente o Mundo real e a fração de material novo em vez de encurtar mais o atraso.',
      action: 'transfer',
    });
  }

  if (transfer !== null && capture !== null && transfer >= BOM && capture < FRACO) {
    lista.push({
      id: 'fundamentos-transfer',
      title: 'Boa generalização, captura baixa',
      text: 'Você lida bem com material variado, mas apreende pouco por exposição. '
        + 'Vale peso maior nos exercícios de captura.',
      action: 'capture',
    });
  }

  const gap = state.detail.availabilityGapMs;
  if (gap !== null && gap !== undefined && gap > 60) {
    lista.push({
      id: 'lacuna-disponibilidade',
      title: `Material novo demora ${Math.round(gap)} ms a mais`,
      text: 'A velocidade conquistada não está transferindo por inteiro. '
        + 'Mais variedade de formatos ajuda mais do que reduzir o atraso no que já é conhecido.',
      action: 'transfer',
    });
  }

  const todosBons = [capture, availability, transfer].every((v) => v !== null && v >= BOM);
  if (todosBons) {
    lista.push({
      id: 'subir-tudo',
      title: 'Os três eixos estão fortes',
      text: 'Dá para subir a complexidade geral: mais itens, faixa mais alta no Mundo real '
        + 'e perguntas mais profundas.',
      action: 'complexity',
    });
  }

  if (!lista.length) {
    lista.push({
      id: 'seguir',
      title: 'Nada gritando por atenção',
      text: 'Os eixos estão equilibrados. Seguir a rotina atual já resolve.',
    });
  }
  return lista;
}

/**
 * Peso sugerido por eixo dentro do MESMO tempo de rotina. Ligar a
 * disponibilidade não pode transformar 40 minutos em 60: o que muda é a
 * composição das tentativas, não a duração (§64).
 */
export function suggestedWeights(state = cognitiveState()) {
  const base = { capture: 1, availability: 1, transfer: 1 };
  const eixos = ['capture', 'availability', 'transfer'];
  const validos = eixos.filter((e) => state[e] !== null);
  if (validos.length < 2) return base;

  for (const eixo of validos) {
    // Quanto mais fraco o eixo, mais peso ele pede — sem zerar os outros.
    base[eixo] = Math.round((1.6 - state[eixo]) * 100) / 100;
  }
  const soma = eixos.reduce((a, e) => a + base[e], 0);
  const fator = eixos.length / soma;
  for (const eixo of eixos) base[eixo] = Math.round(base[eixo] * fator * 100) / 100;
  return base;
}
