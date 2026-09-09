// Estimativa do limiar de disponibilidade.
//
// A partir de tentativas espalhadas por vários atrasos, ajusta uma curva
// acerto × atraso e lê dela o T80: o menor intervalo pós-estímulo em que o
// desempenho chega a 80% do teto recente da pessoa naquela configuração.
//
// Nada disso vem de uma tentativa só. Com poucos dados o app diz "calibrando"
// em vez de inventar um número — mostrar T80 depois de três tentativas seria
// precisão falsa.

import { AVAILABILITY_CATEGORIES, AVAILABILITY_CONFIG, CATEGORY_IDS } from './config.js';

const cfg = AVAILABILITY_CONFIG;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

/** Agrupa as tentativas por atraso pedido, que é o eixo x da curva. */
export function binByDelay(trials) {
  const bins = new Map();
  for (const t of trials) {
    if (t.invalid || t.warmup) continue;
    const d = Math.round(t.delayMs);
    if (!Number.isFinite(d)) continue;
    if (!bins.has(d)) bins.set(d, { delayMs: d, trials: 0, sum: 0 });
    const b = bins.get(d);
    b.trials += 1;
    b.sum += t.accuracy ?? 0;
  }
  return [...bins.values()]
    .map((b) => ({ ...b, accuracy: b.sum / b.trials }))
    .sort((a, b) => a.delayMs - b.delayMs);
}

/**
 * Teto de desempenho: média dos atrasos mais longos. É contra ele que o T80
 * é lido quando `relativeToAsymptote` está ligado — 80% do que a pessoa
 * consegue com tempo de sobra, não 80% absolutos.
 */
export function asymptote(bins) {
  if (!bins.length) return null;
  const corte = Math.max(1, Math.ceil(bins.length / 3));
  const longos = bins.slice(-corte);
  const total = longos.reduce((a, b) => a + b.trials, 0);
  if (!total) return null;
  const media = longos.reduce((a, b) => a + b.accuracy * b.trials, 0) / total;
  return clamp(media, cfg.minAsymptote, 1);
}

/**
 * Ajusta `p(d) = A / (1 + exp(-(d - m) / k))` por busca em grade, do grosso ao
 * fino. Sem biblioteca e sem derivada: são poucos pontos, e uma varredura
 * determinística é mais previsível de depurar que um otimizador.
 */
export function fitCurve(bins, A) {
  if (bins.length < cfg.minDelaysForCurve || !A) return null;
  const delays = bins.map((b) => b.delayMs);
  const menor = Math.min(...delays);
  const maior = Math.max(...delays);
  const faixa = Math.max(20, maior - menor);

  const erro = (m, k) => bins.reduce((soma, b) => {
    const p = A / (1 + Math.exp(-(b.delayMs - m) / k));
    return soma + b.trials * (b.accuracy - p) ** 2;
  }, 0);

  let melhor = { m: (menor + maior) / 2, k: faixa / 4, erro: Infinity };
  let centroM = melhor.m;
  let centroK = melhor.k;
  let passoM = faixa;
  let passoK = faixa / 2;

  for (let rodada = 0; rodada < 5; rodada++) {
    for (let i = -6; i <= 6; i++) {
      const m = centroM + (i * passoM) / 6;
      for (let j = -6; j <= 6; j++) {
        const k = centroK + (j * passoK) / 6;
        if (k < 3) continue;
        const e = erro(m, k);
        if (e < melhor.erro) melhor = { m, k, erro: e };
      }
    }
    centroM = melhor.m;
    centroK = melhor.k;
    passoM /= 3;
    passoK /= 3;
  }

  const peso = bins.reduce((a, b) => a + b.trials, 0);
  return { m: melhor.m, k: melhor.k, A, rmse: Math.sqrt(melhor.erro / Math.max(1, peso)) };
}

/**
 * Lê da curva o atraso em que o acerto chega a `level`.
 *
 * Com `relativeToAsymptote`, o alvo é uma fração do teto — e aí a conta não
 * depende do teto: 80% de A resolve para `m + k·ln(4)`, seja qual for A.
 * A decisão entre relativo e absoluto mora em config.js de propósito (§9).
 */
export function thresholdFrom(fit, level = cfg.thresholdLevel, options = {}) {
  if (!fit) return null;
  const relativo = options.relativeToAsymptote ?? cfg.relativeToAsymptote;
  const alvo = relativo ? level * fit.A : level;
  if (alvo <= 0 || alvo >= fit.A) return null;
  const valor = fit.m + fit.k * Math.log(alvo / (fit.A - alvo));
  return Number.isFinite(valor) ? valor : null;
}

/** Média geométrica: a escala de tempos é multiplicativa, não aditiva. */
function geometricMean(values) {
  const positivos = values.filter((v) => v > 0);
  if (!positivos.length) return null;
  return Math.exp(positivos.reduce((a, v) => a + Math.log(v), 0) / positivos.length);
}

/** Quanta fé o número merece, em três degraus honestos. */
export function confidenceFor({ trials, delays, rmse }) {
  if (trials < cfg.minTrialsForEstimate || delays < cfg.minDelaysForCurve) return 'baixa';
  if (trials >= 40 && delays >= 4 && (rmse ?? 1) < 0.14) return 'alta';
  if (trials >= 20 && delays >= 3) return 'média';
  return 'baixa';
}

/**
 * Estimativa completa de uma categoria.
 *
 * @param {Array} trials tentativas de disponibilidade { delayMs, accuracy, invalid, warmup }
 * @param {object} [state] escada, usada como plano B quando faltam dados para a curva
 * @returns {{t80:number|null, curve:object|null, ...}}
 */
export function estimateThreshold(trials, state = null, options = {}) {
  const validas = trials.filter((t) => !t.invalid && !t.warmup);
  const bins = binByDelay(validas);
  const A = asymptote(bins);
  const fit = fitCurve(bins, A);
  const nivel = options.level ?? cfg.thresholdLevel;

  let t80 = validas.length >= cfg.minTrialsForEstimate ? thresholdFrom(fit, nivel, options) : null;
  let origem = t80 === null ? null : 'curva';

  // Sem curva confiável, as viradas da escada ainda dizem onde é o limiar.
  if (t80 === null && (state?.reversals?.length || 0) >= 2) {
    t80 = geometricMean(state.reversals.slice(-6));
    origem = t80 === null ? null : 'escada';
  }

  const clamped = t80 === null ? null : clamp(t80, 0, cfg.hardCeilingMs);
  return {
    t80: clamped === null ? null : Math.round(clamped),
    source: origem,
    asymptote: A,
    curve: fit,
    bins,
    trials: validas.length,
    delays: bins.length,
    accuracy: validas.length ? mean(validas.map((t) => t.accuracy ?? 0)) : null,
    exposureMs: validas.length ? mean(validas.map((t) => t.exposureMs || 0)) : null,
    confidence: confidenceFor({ trials: validas.length, delays: bins.length, rmse: fit?.rmse }),
    // Fora da interface padrão, mas úteis em métricas avançadas.
    levels: fit ? {
      t50: round(thresholdFrom(fit, 0.5, options)),
      t75: round(thresholdFrom(fit, 0.75, options)),
      t80: round(thresholdFrom(fit, 0.8, options)),
      t90: round(thresholdFrom(fit, 0.9, options)),
    } : null,
  };
}

function round(v) {
  return v === null || v === undefined ? null : Math.round(v);
}

/** Média móvel entre sessões: o painel mostra isto, não o valor do dia. */
export function smooth(previous, current, alpha = cfg.smoothingAlpha) {
  if (current === null || current === undefined) return previous ?? null;
  if (previous === null || previous === undefined) return current;
  return Math.round(previous + alpha * (current - previous));
}

/**
 * Índice agregado 0–1000. Não é média de milissegundos: cada categoria é
 * normalizada nas próprias âncoras antes de entrar na conta, senão categorias
 * naturalmente lentas puxariam tudo para baixo (§32).
 */
export function availabilityScore(porCategoria) {
  const partes = [];
  for (const id of CATEGORY_IDS) {
    const entrada = porCategoria?.[id];
    const t80 = entrada?.t80;
    if (!t80) continue;
    const { slowMs, fastMs } = AVAILABILITY_CATEGORIES[id];
    const posicao = Math.log(slowMs / t80) / Math.log(slowMs / fastMs);
    const peso = entrada.confidence === 'alta' ? 1 : entrada.confidence === 'média' ? 0.7 : 0.4;
    partes.push({ valor: clamp(posicao, 0, 1), peso });
  }
  if (!partes.length) return null;
  const soma = partes.reduce((a, p) => a + p.peso, 0);
  const valor = partes.reduce((a, p) => a + p.valor * p.peso, 0) / soma;
  return Math.round(clamp(valor, 0, 1) * cfg.scoreScale);
}
