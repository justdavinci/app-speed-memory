// UI do Perfil de Processamento. A escala 0–100 é interna ao app: não é QI,
// percentil populacional nem diagnóstico clínico.
//
// O bootstrap do Memory Lab é carregado como módulo independente e instala sua
// aba após a navegação principal terminar de inicializar.

import '../memoryLab/bootstrap.js';
import { esc } from '../util.js';
import { processingProfile } from './processingProfile.js';

export function card() {
  const p = processingProfile();
  const cells = p.components.map((c) => `<div class="th-subscore${c.points === null ? ' is-empty' : ''}">
      <div class="th-subscore__top">
        <span class="th-subscore__name">${esc(c.name)}</span>
        <span class="th-subscore__points">${c.points === null ? '—' : c.points}</span>
      </div>
      <div class="th-subscore__bar" aria-hidden="true"><i style="--score:${c.points ?? 0}%"></i></div>
      <p class="th-subscore__raw">${esc(c.raw)}</p>
      <p class="th-subscore__confidence">confiança: ${esc(c.confidence)}</p>
      <details class="th-subscore__details"><summary>O que representa</summary><p>${esc(c.description)}</p></details>
    </div>`).join('');

  const diagnosis = p.bottleneck
    ? `<div class="th-profile-note"><strong>Gargalo aparente: ${esc(p.bottleneck.name)}</strong>
        <span>${esc(p.bottleneck.raw)}. Isto é uma leitura do protocolo atual, não um limite biológico.</span></div>`
    : '<div class="th-profile-note"><strong>Ainda sem perfil suficiente.</strong><span>Rode o Daily Benchmark e acumule dados de Availability/Retention/Transfer.</span></div>';

  return `<div class="card th-profile-card">
      <div class="th-profile-head">
        <div>
          <p class="th-kicker">Perfil de processamento</p>
          <h2 class="card__title">7 subscores funcionais</h2>
        </div>
      </div>
      <p class="th-hint">Pontos de Processamento (0–100). Funcionam como um mapa de subcomponentes do app, não como “subQI” normativo.</p>
      <div class="th-subscore-grid">${cells}</div>
      ${diagnosis}
      <p class="chart__caption">São exatamente sete pontos principais. Cada um precisa ser lido junto com o dado bruto e a confiança; sem amostra comparável, o app mostra “—” em vez de estimar.</p>
    </div>`;
}
