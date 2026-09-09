// Estimativa do limiar de disponibilidade.
//
// A partir de tentativas espalhadas por vários atrasos, ajusta uma curva
// acerto × atraso e lê dela o T80. O eixo temporal usa o atraso REAL entregue
// pela tela quando ele foi medido; o atraso pedido é apenas fallback.
//
// A curva também aceita um piso de acerto ao acaso (gamma). Quando não há
// informação sobre chance, gamma=0 preserva a compatibilidade com o protocolo
// anterior. Isso permite que benchmarks de escolha forçada sejam corrigidos
// sem fingir que desempenho sem memória tende necessariamente a zero.

import { AVAILABILITY_CATEGORIES, AVAILABILITY_CONFIG, CATEGORY_IDS } from './config.js';

const cfg = AVAILABILITY_CONFIG;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

/** Agrupa as tentativas pelo atraso realmente entregue (ou pedido, se faltar). */
export function binByDelay(trials) {
  const bins = new Map();
  for (const t of trials) {
    if (t.invalid || t.warmup) continue;
    const observed = t.actualDelayMs ?? t.delayMs;
    const d = Math.round(observed);
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

/** Teto de desempenho: média ponderada dos atrasos mais longos. */
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
 * Ajusta `p(d) = gamma + (A-gamma)/(1 + exp(-(d-m)/k))` por busca em grade.
 * `gamma` é o piso de acerto ao acaso. Com gamma=0 a fórmula é idêntica à v1.
 */
export function fitCurve(bins, A, options = {}) {
  if (bins.length < cfg.minDelaysForCurve || !A) return null;
  const gamma = clamp(options.chanceFloor ?? options.gamma ?? 0, 0, Math.max(0, A - 0.01));
  const delays = bins.map((b) => b.delayMs);
  const menor = Math.min(...delays);
  const maior = Math.max(...delays);
  const faixa = Math.max(20, maior - menor);

  const erro = (m, k) => bins.reduce((soma, b) => {
    const p = gamma + (A - gamma) / (1 + Math.exp(-(b.delayMs - m) / k));
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
  return {
    m: melhor.m,
    k: melhor.k,
    A,
    gamma,
    rmse: Math.sqrt(melhor.erro / Math.max(1, peso)),
  };
}

/**
 * Lê da curva o atraso em que o desempenho alcança o nível pedido.
 *
 * Em modo relativo, `level=0.8` significa 80% do intervalo útil entre chance
 * (gamma) e o teto A, não simplesmente 80% de A. Com gamma=0 o resultado
 * continua sendo `m + k·ln(4)` para T80.
 */
export function thresholdFrom(fit, level = cfg.thresholdLevel, options = {}) {
  if (!fit) return null;
  const relativo = options.relativeToAsymptote ?? cfg.relativeToAsymptote;
  const gamma = fit.gamma ?? 0;
  const alvo = relativo ? gamma + level * (fit.A - gamma) : level;
  if (alvo <= gamma || alvo >= fit.A) return null;
  const normalized = (alvo - gamma) / (fit.A - gamma);
  const valor = fit.m + fit.k * Math.log(normalized / (1 - normalized));
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

/** Estimativa completa de uma categoria/condição. */
export function estimateThreshold(trials, state = null, options = {}) {
  const validas = trials.filter((t) => !t.invalid && !t.warmup);
  const bins = binByDelay(validas);
  const A = asymptote(bins);
  const fit = fitCurve(bins, A, options);
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
    chanceFloor: fit?.gamma ?? (options.chanceFloor ?? 0),
    curve: fit,
    bins,
    trials: validas.length,
    delays: bins.length,
    accuracy: validas.length ? mean(validas.map((t) => t.accuracy ?? 0)) : null,
    exposureMs: validas.length ? mean(validas.map((t) => t.exposureMs || 0)) : null,
    confidence: confidenceFor({ trials: validas.length, delays: bins.length, rmse: fit?.rmse }),
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

/** Índice agregado 0–1000, normalizado por categoria. */
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
