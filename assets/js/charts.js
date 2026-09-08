// Gráficos em SVG puro (sem biblioteca), escaláveis e coerentes com o tema.

const W = 320;
const H = 132;
const PAD = { top: 10, right: 8, bottom: 18, left: 26 };

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

function xAt(i, n) {
  if (n <= 1) return PAD.left + plotW / 2;
  return PAD.left + (i / (n - 1)) * plotW;
}

function yAt(v) {
  return PAD.top + (1 - v) * plotH;
}

/**
 * Linha de evolução (valores de 0 a 1).
 * @param {Array<{value:number, perfect?:boolean}>} points
 * @param {number} activeIndex ponto destacado (-1 para nenhum)
 */
export function lineChart(points, activeIndex = -1) {
  if (!points.length) {
    return '<p class="chart__empty">Nenhuma sessão ainda. Faça o primeiro treino!</p>';
  }

  const n = points.length;
  const coords = points.map((p, i) => [xAt(i, n), yAt(Math.max(0, Math.min(1, p.value)))]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[n - 1][0].toFixed(1)} ${PAD.top + plotH} L${coords[0][0].toFixed(1)} ${PAD.top + plotH} Z`;

  const grid = [0, 0.5, 1]
    .map((v) => {
      const y = yAt(v);
      return `<line class="grid-line" x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" />
              <text class="axis-label" x="${PAD.left - 5}" y="${y + 3}" text-anchor="end">${Math.round(v * 100)}%</text>`;
    })
    .join('');

  const dots = coords
    .map(([x, y], i) => {
      const r = n > 40 ? 2.2 : 3.4;
      return `<circle class="dot${i === activeIndex ? ' is-active' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" />`;
    })
    .join('');

  // Áreas de toque generosas para o dedo, invisíveis no gráfico.
  const hits = coords
    .map(([x], i) => {
      const half = Math.max(6, plotW / Math.max(n, 1) / 2);
      return `<rect class="hit" data-i="${i}" x="${(x - half).toFixed(1)}" y="${PAD.top}" width="${(half * 2).toFixed(1)}" height="${plotH}" />`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Precisão por sessão">
    <defs>
      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity=".35" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#areaFill)" />
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
    ${hits}
  </svg>`;
}

/**
 * Barras de itens corretos por sessão.
 * @param {Array<{value:number, max:number, perfect?:boolean}>} bars
 */
export function barChart(bars) {
  if (!bars.length) {
    return '<p class="chart__empty">Sem dados suficientes ainda.</p>';
  }

  const n = bars.length;
  const top = Math.max(...bars.map((b) => b.max), 1);
  const slot = plotW / n;
  const bw = Math.max(3, Math.min(22, slot * 0.62));

  const rects = bars
    .map((b, i) => {
      const h = Math.max(1, (b.value / top) * plotH);
      const x = PAD.left + slot * i + (slot - bw) / 2;
      const y = PAD.top + plotH - h;
      return `<rect class="bar${b.perfect ? ' is-perfect' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" />`;
    })
    .join('');

  const labels = [0, top]
    .map((v) => {
      const y = PAD.top + plotH - (v / top) * plotH;
      return `<text class="axis-label" x="${PAD.left - 5}" y="${y + 3}" text-anchor="end">${v}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Itens corretos por sessão">
    <line class="grid-line" x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${W - PAD.right}" y2="${PAD.top + plotH}" />
    ${labels}
    ${rects}
  </svg>`;
}
