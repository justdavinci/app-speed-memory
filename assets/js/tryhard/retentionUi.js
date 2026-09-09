// UI do treino de Retenção. Fica separado de Availability porque as duas
// métricas têm direções opostas e históricos independentes.

import { esc, pct } from '../util.js';
import {
  getRetentionReport, getRetentionSettings, getRetentionSeries,
  recalibrateRetention, updateRetentionSettings,
} from './retention.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = (v) => {
  if (v === null || v === undefined) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',')} s` : `${Math.round(v)} ms`;
};

export function configCard() {
  const s = getRetentionSettings();
  const r = getRetentionReport();
  return `<div class="card">
      <h2 class="card__title">Retenção pós-estímulo</h2>
      <p class="th-hint">Segundo objetivo temporal: em vez de fazer a pergunta aparecer cada vez mais cedo,
        você força a representação a sobreviver por mais tempo antes de poder responder.</p>

      <label class="switch">
        <span><strong>Treino de retenção</strong><small>As tentativas são separadas do T80 de disponibilidade.</small></span>
        <input type="checkbox" id="rt-enabled"${s.enabled ? ' checked' : ''} />
        <span class="switch__track" aria-hidden="true"></span>
      </label>

      <div id="rt-options"${s.enabled ? '' : ' hidden'}>
        <div class="field">
          <div class="field__head"><span class="field__label">Quanto do treino compatível usa</span>
            <output class="field__value" id="out-rt-share">${Math.round(s.share * 100)}%</output></div>
          <input class="stepper__range" type="range" id="rt-share" min="10" max="80" step="5"
                 value="${Math.round(s.share * 100)}" aria-label="Fração de retenção" />
          <p class="field__hint">Se Disponibilidade também estiver ligada, Retenção ocupa sua própria fração de tentativas;
            nunca são aplicadas juntas na mesma tentativa.</p>
        </div>

        <div class="field">
          <div class="field__head"><span class="field__label">Modo</span></div>
          <div class="segmented" id="rt-mode">
            ${['adaptive', 'fixed', 'range'].map((mode) => `<button class="segmented__opt" data-rt-mode="${mode}"
              role="radio" aria-checked="${s.mode === mode}">${mode === 'adaptive' ? 'Adaptativo' : mode === 'fixed' ? 'Fixo' : 'Faixa'}</button>`).join('')}
          </div>
          <p class="field__hint">${s.mode === 'adaptive'
            ? 'Adaptativo: mantém a carga do exercício estável e aumenta o intervalo quando o acerto sobra.'
            : s.mode === 'fixed'
              ? 'Fixo: toda tentativa de retenção espera exatamente o mesmo intervalo.'
              : 'Faixa: o intervalo é sorteado a cada tentativa, impedindo antecipar o momento da pergunta.'}</p>
        </div>

        ${s.mode === 'adaptive' ? adaptiveFields(s) : s.mode === 'fixed' ? fixedFields(s) : rangeFields(s)}

        <div class="tiles">
          <div class="tile"><div class="tile__value">${fmt(r.t80)}</div><div class="tile__label">Retention T80</div></div>
          <div class="tile"><div class="tile__value">${fmt(r.currentDelayMs)}</div><div class="tile__label">intervalo atual</div></div>
          <div class="tile"><div class="tile__value">${esc(r.confidence)}</div><div class="tile__label">confiança</div></div>
        </div>
        <button class="btn btn--ghost" id="rt-recalibrate">Recalibrar retenção</button>
      </div>

      <p class="chart__caption">Retention T80 é uma métrica funcional interna: maior é melhor. Não mede duração da memória icônica
        nem um tempo neural direto.</p>
    </div>`;
}

function adaptiveFields(s) {
  return `<div class="field">
      <div class="field__head"><span class="field__label">Alvo</span><output class="field__value" id="out-rt-target">${Math.round(s.targetAccuracy * 100)}%</output></div>
      <input class="stepper__range" type="range" id="rt-target" min="65" max="90" step="5" value="${Math.round(s.targetAccuracy * 100)}" />
      <div class="field__head"><span class="field__label">Atraso mínimo</span><output class="field__value" id="out-rt-min">${fmt(s.minDelayMs)}</output></div>
      <input class="stepper__range" type="range" id="rt-min" min="250" max="5000" step="250" value="${s.minDelayMs}" />
      <div class="field__head"><span class="field__label">Atraso máximo</span><output class="field__value" id="out-rt-max">${fmt(s.maxDelayMs)}</output></div>
      <input class="stepper__range" type="range" id="rt-max" min="1000" max="30000" step="500" value="${s.maxDelayMs}" />
    </div>`;
}

function fixedFields(s) {
  return `<div class="field">
      <div class="field__head"><span class="field__label">Esperar antes de responder</span><output class="field__value" id="out-rt-fixed">${fmt(s.fixedDelayMs)}</output></div>
      <input class="stepper__range" type="range" id="rt-fixed" min="250" max="30000" step="250" value="${s.fixedDelayMs}" />
    </div>`;
}

function rangeFields(s) {
  return `<div class="field">
      <div class="field__head"><span class="field__label">De</span><output class="field__value" id="out-rt-range-min">${fmt(s.rangeMinMs)}</output></div>
      <input class="stepper__range" type="range" id="rt-range-min" min="250" max="30000" step="250" value="${s.rangeMinMs}" />
      <div class="field__head"><span class="field__label">Até</span><output class="field__value" id="out-rt-range-max">${fmt(s.rangeMaxMs)}</output></div>
      <input class="stepper__range" type="range" id="rt-range-max" min="250" max="30000" step="250" value="${s.rangeMaxMs}" />
    </div>`;
}

export function bindConfig(hooks = {}) {
  const rerender = hooks.render || (() => {});
  $('#rt-enabled')?.addEventListener('change', (e) => {
    updateRetentionSettings({ enabled: e.target.checked });
    rerender();
  });
  $$('[data-rt-mode]').forEach((btn) => btn.addEventListener('click', () => {
    updateRetentionSettings({ mode: btn.dataset.rtMode });
    rerender();
  }));

  const slider = (id, out, map, patch) => {
    const el = $(`#${id}`);
    el?.addEventListener('input', () => { $(`#${out}`).textContent = map(Number(el.value)); });
    el?.addEventListener('change', () => updateRetentionSettings(patch(Number(el.value))));
  };
  slider('rt-share', 'out-rt-share', (v) => `${v}%`, (v) => ({ share: v / 100 }));
  slider('rt-target', 'out-rt-target', (v) => `${v}%`, (v) => ({ targetAccuracy: v / 100 }));
  slider('rt-min', 'out-rt-min', fmt, (v) => ({ minDelayMs: v }));
  slider('rt-max', 'out-rt-max', fmt, (v) => ({ maxDelayMs: v }));
  slider('rt-fixed', 'out-rt-fixed', fmt, (v) => ({ fixedDelayMs: v }));
  slider('rt-range-min', 'out-rt-range-min', fmt, (v) => ({ rangeMinMs: v }));
  slider('rt-range-max', 'out-rt-range-max', fmt, (v) => ({ rangeMaxMs: v }));

  $('#rt-recalibrate')?.addEventListener('click', () => {
    recalibrateRetention();
    hooks.toast?.('Retenção recalibrada.');
    rerender();
  });
}

export function progressCard() {
  const r = getRetentionReport();
  const series = getRetentionSeries();
  const last = series[series.length - 1] || null;
  return `<div class="card">
      <h2 class="card__title">Retenção</h2>
      <div class="tiles">
        <div class="tile"><div class="tile__value">${fmt(r.t80)}</div><div class="tile__label">Retention T80</div></div>
        <div class="tile"><div class="tile__value">${fmt(r.currentDelayMs)}</div><div class="tile__label">intervalo atual</div></div>
        <div class="tile"><div class="tile__value">${last?.accuracy === undefined ? '—' : pct(last.accuracy)}</div><div class="tile__label">acerto recente</div></div>
      </div>
      <p class="chart__caption">Maior é melhor: é o lado direito da janela pós-estímulo. A Disponibilidade mede o lado esquerdo, isto é, quão cedo você consegue usar a informação.</p>
    </div>`;
}

export function sessionSummary(session) {
  const blocks = session.modules.filter((m) => m.retention?.trials);
  if (!blocks.length) return '';
  const r = blocks[blocks.length - 1].retention;
  return `<div class="th-result__transfer">
      <p class="th-kicker">Retenção</p>
      <p class="th-big-line">Retention T80 ${fmt(r.t80)}</p>
      <p class="th-hint">${r.trials} tentativas · acerto ${r.accuracy === null ? '—' : pct(r.accuracy)} · confiança ${esc(r.confidence)}</p>
    </div>`;
}
