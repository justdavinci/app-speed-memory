// Telas de treino pós-estímulo: Availability continua medindo quão cedo a
// informação fica utilizável; Retenção mede por quanto tempo ela sobrevive.
// Os motores e históricos são independentes, mas a UX fica na mesma área.

import { esc, fmtDateTime, pct } from '../../util.js';
import { barChart } from '../../charts.js';
import * as store from '../store.js';
import {
  AVAILABILITY_CATEGORIES, AVAILABILITY_CONFIG, AVAILABILITY_PRESETS,
  CATEGORY_IDS, moduleSupportsAvailability,
} from './config.js';
import { categoryLabel } from './categories.js';
import { MOTOR_BASELINE, summarizeMotorBaseline } from './motor.js';
import * as retentionUi from '../retentionUi.js';
import * as processingProfileUi from '../processingProfileUi.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const ms = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} ms`);

export function deltaLabel(now, before) {
  if (now === null || before === null || now === undefined || before === undefined) return null;
  const d = now - before;
  if (Math.abs(d) < AVAILABILITY_CONFIG.noiseMarginMs) return 'sem mudança relevante';
  return `${d < 0 ? '−' : '+'}${Math.abs(Math.round(d))} ms`;
}

/* ----------------------------- configuração ----------------------------- */

function availabilityConfigCard() {
  const s = store.getAvailabilitySettings();
  const report = store.getAvailabilityReport();
  const manual = s.mode === 'manual';
  const categories = CATEGORY_IDS
    .filter((id) => report.categories[id])
    .map((id) => {
      const c = report.categories[id];
      return `<div class="th-record-row"><span>${esc(categoryLabel(id))}</span><span>${c.calibrating
        ? 'calibrando' : `T80 ${ms(c.smoothedT80 ?? c.t80)}`} · ${esc(c.confidence)}</span></div>`;
    }).join('');

  return `<div class="card">
      <p class="th-kicker">Treino pós-estímulo · objetivo 1</p>
      <h2 class="card__title">Disponibilidade rápida</h2>
      <p class="th-hint">Faça a informação recém-vista ficar utilizável cada vez mais cedo. Aqui, menor T80 é melhor.</p>
      <label class="switch"><span><strong>Treino de disponibilidade</strong><small>O app reduz o atraso antes da pergunta.</small></span>
        <input type="checkbox" id="av-enabled"${s.enabled ? ' checked' : ''} /><span class="switch__track" aria-hidden="true"></span></label>

      <div id="av-options"${s.enabled ? '' : ' hidden'}>
        <div class="field">
          <div class="field__head"><span class="field__label">Quanto do treino usa</span></div>
          <div class="segmented" id="av-preset">${Object.values(AVAILABILITY_PRESETS).filter((p) => p.id !== 'off').map((p) => (
            `<button class="segmented__opt" data-av-preset="${p.id}" role="radio" aria-checked="${s.preset === p.id}">${esc(p.label)}</button>`
          )).join('')}</div>
          <p class="field__hint">${esc(AVAILABILITY_PRESETS[s.preset]?.blurb || '')} Algumas tentativas seguem normais para reduzir adaptação ao formato.</p>
        </div>

        <div class="field">
          <div class="field__head"><span class="field__label">Modo</span></div>
          <div class="segmented" id="av-mode">
            <button class="segmented__opt" data-av-mode="adaptive" role="radio" aria-checked="${!manual}">Adaptativo</button>
            <button class="segmented__opt" data-av-mode="manual" role="radio" aria-checked="${manual}">Manual</button>
          </div>
          <p class="field__hint">${manual ? 'Manual: use um atraso fixo ou uma faixa curta.' : 'Adaptativo: o app encurta o atraso mantendo o alvo de acerto.'}</p>
        </div>

        ${manual ? manualAvailabilityFields(s) : adaptiveAvailabilityFields(s)}

        <label class="switch"><span><strong>Retrieval limpo</strong><small>A pergunta entra antes das alternativas.</small></span>
          <input type="checkbox" id="av-clean"${s.cleanRetrieval ? ' checked' : ''} /><span class="switch__track" aria-hidden="true"></span></label>
        <p class="field__hint">Isso reduz a ajuda que as próprias opções podem dar para reconstruir a resposta.</p>

        ${categories ? `<div class="field"><div class="field__head"><span class="field__label">Por categoria</span></div><div class="th-records">${categories}</div></div>` : ''}
        <div class="row row--wrap"><button class="btn btn--ghost" id="av-recalibrate">Recalibrar</button><button class="btn btn--ghost" id="av-motor">Calibrar toque</button></div>
        <p class="field__hint">${s.motorBaselineMs ? `Linha de base do toque: ${ms(s.motorBaselineMs)}. Contexto apenas; não é subtraída do RT.` : 'A linha de base do toque é opcional.'}</p>
      </div>
      <p class="chart__caption">Medida funcional do protocolo, não uma leitura direta de tempo neural.</p>
    </div>`;
}

function adaptiveAvailabilityFields(s) {
  return `<div class="field">
      <div class="field__head"><span class="field__label">Alvo de acerto</span><output class="field__value" id="out-av-target">${Math.round(s.targetAccuracy * 100)}%</output></div>
      <input class="stepper__range" type="range" id="av-target" min="60" max="90" step="5" value="${Math.round(s.targetAccuracy * 100)}" />
      <div class="field__head"><span class="field__label">Atraso mínimo</span><output class="field__value" id="out-av-min">${ms(s.minDelayMs)}</output></div>
      <input class="stepper__range" type="range" id="av-min" min="0" max="300" step="10" value="${s.minDelayMs}" />
      <div class="field__head"><span class="field__label">Atraso máximo</span><output class="field__value" id="out-av-max">${ms(s.maxDelayMs)}</output></div>
      <input class="stepper__range" type="range" id="av-max" min="200" max="900" step="25" value="${s.maxDelayMs}" />
    </div>`;
}

function manualAvailabilityFields(s) {
  return `<div class="field">
      <label class="switch"><span><strong>Sortear dentro de uma faixa</strong><small>Em vez de um valor fixo.</small></span>
        <input type="checkbox" id="av-manual-random"${s.manualRandom ? ' checked' : ''} /><span class="switch__track" aria-hidden="true"></span></label>
      ${s.manualRandom ? `<div class="field__head"><span class="field__label">De</span><output class="field__value" id="out-av-manual-min">${ms(s.manualMinMs)}</output></div>
        <input class="stepper__range" type="range" id="av-manual-min" min="0" max="600" step="10" value="${s.manualMinMs}" />
        <div class="field__head"><span class="field__label">Até</span><output class="field__value" id="out-av-manual-max">${ms(s.manualMaxMs)}</output></div>
        <input class="stepper__range" type="range" id="av-manual-max" min="0" max="600" step="10" value="${s.manualMaxMs}" />`
        : `<div class="field__head"><span class="field__label">Atraso</span><output class="field__value" id="out-av-manual">${ms(s.manualDelayMs)}</output></div>
        <input class="stepper__range" type="range" id="av-manual-delay" min="0" max="600" step="10" value="${s.manualDelayMs}" />`}
    </div>`;
}

export function configCard() {
  return `${availabilityConfigCard()}${retentionUi.configCard()}`;
}

export function bindConfig(hooks = {}) {
  const rerender = hooks.render || (() => {});
  $('#av-enabled')?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    store.updateAvailabilitySettings({ enabled });
    if (enabled && !store.getAvailabilitySettings().onboarded) { hooks.intro?.(); return; }
    rerender();
  });
  $$('[data-av-preset]').forEach((btn) => btn.addEventListener('click', () => { store.updateAvailabilitySettings({ preset: btn.dataset.avPreset }); rerender(); }));
  $$('[data-av-mode]').forEach((btn) => btn.addEventListener('click', () => { store.updateAvailabilitySettings({ mode: btn.dataset.avMode }); rerender(); }));

  const slider = (id, out, format, apply) => {
    const el = $(`#${id}`);
    el?.addEventListener('input', () => { const output = $(`#${out}`); if (output) output.textContent = format(Number(el.value)); });
    el?.addEventListener('change', () => apply(Number(el.value)));
  };
  slider('av-target', 'out-av-target', (v) => `${v}%`, (v) => store.updateAvailabilitySettings({ targetAccuracy: v / 100 }));
  slider('av-min', 'out-av-min', ms, (v) => store.updateAvailabilitySettings({ minDelayMs: v }));
  slider('av-max', 'out-av-max', ms, (v) => store.updateAvailabilitySettings({ maxDelayMs: v }));
  slider('av-manual-delay', 'out-av-manual', ms, (v) => store.updateAvailabilitySettings({ manualDelayMs: v }));
  slider('av-manual-min', 'out-av-manual-min', ms, (v) => store.updateAvailabilitySettings({ manualMinMs: v }));
  slider('av-manual-max', 'out-av-manual-max', ms, (v) => store.updateAvailabilitySettings({ manualMaxMs: v }));
  $('#av-manual-random')?.addEventListener('change', (e) => { store.updateAvailabilitySettings({ manualRandom: e.target.checked }); rerender(); });
  $('#av-clean')?.addEventListener('change', (e) => store.updateAvailabilitySettings({ cleanRetrieval: e.target.checked }));
  $('#av-recalibrate')?.addEventListener('click', () => { CATEGORY_IDS.forEach((id) => store.recalibrateAvailability(id)); hooks.toast?.('Disponibilidade recalibrada.'); rerender(); });
  $('#av-motor')?.addEventListener('click', () => hooks.motor?.());
  retentionUi.bindConfig(hooks);
}

/* ---------------------------- treino rápido ----------------------------- */

export function moduleField(moduleId) {
  if (!moduleSupportsAvailability(moduleId)) return '';
  const s = store.getAvailabilitySettings();
  const choice = s.modules?.[moduleId] || 'inherit';
  const report = store.getAvailabilityReport();
  const categories = Object.values(report.categories).filter((c) => c.t80 !== null);
  const current = categories.length
    ? `Availability: T80 ${ms(categories[0].smoothedT80 ?? categories[0].t80)}. Retenção é configurada globalmente em Config.`
    : 'Availability ainda calibrando. Retenção é configurada globalmente em Config.';
  return `<div class="field"><div class="field__head"><span class="field__label">Treino pós-estímulo</span></div>
      <div class="segmented" id="av-module">
        <button class="segmented__opt" data-av-module="inherit" role="radio" aria-checked="${choice === 'inherit'}">Herdar</button>
        <button class="segmented__opt" data-av-module="on" role="radio" aria-checked="${choice === 'on'}">Availability on</button>
        <button class="segmented__opt" data-av-module="off" role="radio" aria-checked="${choice === 'off'}">Availability off</button>
      </div><p class="field__hint">${esc(current)}</p></div>`;
}

export function bindModuleField(moduleId, root = document) {
  $$('[data-av-module]', root).forEach((btn) => btn.addEventListener('click', () => {
    $$('[data-av-module]', root).forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    store.setAvailabilityForModule(moduleId, btn.dataset.avModule);
  }));
}

/* ------------------------------ Mundo real ------------------------------ */

export function transferCard() {
  const s = store.getAvailabilitySettings();
  const r = store.getAvailabilityReport();
  const choice = s.modules?.['real-world'] || 'inherit';
  const enabled = s.enabled && choice !== 'off';
  return `<div class="card"><h2 class="card__title">Disponibilidade no Mundo real</h2>
      <p class="th-hint">Mede quão cedo listas, interfaces, documentos, mapas e cenas ficam recuperáveis.</p>
      <label class="switch"><span><strong>Usar Availability no Mundo real</strong><small>${s.enabled ? 'Vale para famílias compatíveis.' : 'Ligue o recurso em Config.'}</small></span>
        <input type="checkbox" id="av-transfer"${enabled ? ' checked' : ''}${s.enabled ? '' : ' disabled'} /><span class="switch__track" aria-hidden="true"></span></label>
      <div class="tiles"><div class="tile"><div class="tile__value">${ms(r.transferT80)}</div><div class="tile__label">T80 realista</div></div>
        <div class="tile"><div class="tile__value">${ms(r.novelT80)}</div><div class="tile__label">T80 novo</div></div>
        <div class="tile"><div class="tile__value">${r.transferGapMs === null ? '—' : `${Math.round(r.transferGapMs)} ms`}</div><div class="tile__label">gap</div></div></div>
    </div>`;
}

export function bindTransferCard(hooks = {}) {
  $('#av-transfer')?.addEventListener('change', (e) => {
    store.setAvailabilityForModule('real-world', e.target.checked ? 'on' : 'off');
    store.setAvailabilityForModule('chaos-mode', e.target.checked ? 'on' : 'off');
    hooks.render?.();
  });
}

/* ------------------------------- progresso ------------------------------ */

function availabilityChart(series, category) {
  if (!series.length) return '<p class="chart__empty">Sem dados de disponibilidade ainda.</p>';
  const anchor = category ? AVAILABILITY_CATEGORIES[category] : null;
  const top = anchor ? anchor.slowMs : Math.max(...series.map((d) => d.t80), 400);
  return barChart(series.map((d) => ({ value: Math.max(0, top - d.t80), max: top })));
}

function availabilityProgressCard({ range = 30, category = null } = {}) {
  const r = store.getAvailabilityReport();
  const series = store.getAvailabilitySeries(category, range);
  const available = CATEGORY_IDS.filter((id) => r.categories[id]);
  const last = series[series.length - 1] || null;
  const before = series.length > 1 ? series[series.length - 2] : null;
  const filters = ['all', ...available].map((id) => `<button class="chip${(category || 'all') === id ? ' is-active' : ''}" data-av-cat="${id}">${id === 'all' ? 'Tudo' : esc(categoryLabel(id))}</button>`).join('');
  const rows = available.map((id) => {
    const c = r.categories[id];
    return `<div class="th-record-row"><span>${esc(categoryLabel(id))}</span><span>${c.calibrating ? 'calibrando' : ms(c.smoothedT80 ?? c.t80)}${c.exposureMs ? ` · exposição ${ms(c.exposureMs)}` : ''}</span></div>`;
  }).join('');
  const benchmarks = store.getAvailabilityBenchmarks().slice(-4).reverse();

  return `<div class="card"><h2 class="card__title">Disponibilidade rápida</h2>
      <div class="tiles"><div class="tile"><div class="tile__value">${r.score === null ? '—' : r.score}</div><div class="tile__label">índice</div></div>
        <div class="tile"><div class="tile__value">${ms(last?.t80)}</div><div class="tile__label">T80 recente</div></div>
        <div class="tile"><div class="tile__value">${esc(deltaLabel(last?.t80 ?? null, before?.t80 ?? null) || '—')}</div><div class="tile__label">variação</div></div></div>
      ${available.length > 1 ? `<div class="chips">${filters}</div>` : ''}
      <div class="chart chart--bars">${availabilityChart(series, category)}</div>
      <p class="chart__caption">Barra maior = atraso menor. Availability e Retenção são métricas diferentes.</p>
      ${rows ? `<div class="th-records">${rows}</div>` : ''}
      ${benchmarks.length ? `<h2 class="card__title">Benchmarks</h2><div class="th-records">${benchmarks.map((b) => `<div class="th-record-row"><span>${b.kind === 'realWorld' ? 'Mundo real' : 'Abstrato'} · ${esc(fmtDateTime(b.completedAt))}</span><span>${ms(b.t80)} · ${esc(b.confidence)}</span></div>`).join('')}</div>` : ''}
    </div>`;
}

export function progressCards(opts = {}) {
  return `${processingProfileUi.card()}${availabilityProgressCard(opts)}${retentionUi.progressCard()}`;
}

export function bindProgress(onCategory) {
  $$('[data-av-cat]').forEach((btn) => btn.addEventListener('click', () => onCategory(btn.dataset.avCat === 'all' ? null : btn.dataset.avCat)));
}

/* --------------------------- resumo da sessão --------------------------- */

export function sessionSummary(session) {
  const blocks = session.modules.filter((m) => m.availability?.trials);
  let availabilitySummary = '';
  if (blocks.length) {
    const a = blocks[blocks.length - 1].availability;
    availabilitySummary = `<div class="th-result__transfer"><p class="th-kicker">Disponibilidade rápida</p>
      <p class="th-big-line">T80 ${ms(a.t80)}</p><p class="th-hint">${a.trials} tentativas · acerto ${a.accuracy === null ? '—' : pct(a.accuracy)} · confiança ${esc(a.confidence)}</p></div>`;
  }
  return `${availabilitySummary}${retentionUi.sessionSummary(session)}`;
}

/* --------------------------- primeira ativação -------------------------- */

export const INTRO = [
  { title: 'Disponibilidade rápida', text: 'Este objetivo reduz progressivamente o intervalo entre o estímulo desaparecer e a informação poder ser recuperada.' },
  { title: 'Retenção é outra coisa', text: 'Em Config existe um segundo objetivo: aumentar o intervalo antes da resposta. Os dois treinam lados opostos da janela pós-estímulo e não compartilham o mesmo T80.' },
  { title: 'O que os números significam', text: 'São medidas funcionais dos protocolos do app, não medições diretas de atividade neural, QI ou duração literal da memória icônica.' },
];

export function showIntro(el, onDone) {
  let index = 0;
  const draw = () => {
    const step = INTRO[index];
    el.innerHTML = `<div class="th-onboarding__panel"><p class="th-kicker">${index + 1} de ${INTRO.length}</p><h2 class="th-big">${esc(step.title)}</h2><p class="prose">${esc(step.text)}</p>
      <div class="row"><button class="btn btn--ghost" data-av-intro="skip">Pular</button><button class="btn btn--primary" data-av-intro="next">${index === INTRO.length - 1 ? 'Começar' : 'Avançar'}</button></div></div>`;
  };
  draw();
  el.hidden = false;
  el.onclick = (e) => {
    const action = e.target.closest('[data-av-intro]')?.dataset.avIntro;
    if (!action) return;
    if (action === 'next' && index < INTRO.length - 1) { index += 1; draw(); return; }
    el.hidden = true;
    el.onclick = null;
    store.updateAvailabilitySettings({ onboarded: true });
    onDone?.(action === 'next');
  };
}

/* --------------------------- calibração do toque ------------------------ */

export function runMotorBaseline(refs, { onDone, toast } = {}) {
  const times = [];
  let active = true;
  const finish = () => {
    active = false;
    refs.center.innerHTML = '';
    refs.prompt.textContent = '';
    refs.response.innerHTML = '';
    refs.response.onclick = null;
    const summary = summarizeMotorBaseline(times);
    if (summary.medianMs) {
      store.updateAvailabilitySettings({ motorBaselineMs: summary.medianMs });
      toast?.(`Linha de base do toque: ${summary.medianMs} ms.`);
    } else toast?.('Poucos toques válidos. A calibração foi descartada.');
    onDone?.(summary);
  };
  const next = (n) => {
    if (!active) return;
    if (n >= MOTOR_BASELINE.trials) { finish(); return; }
    refs.prompt.textContent = `Toque assim que o ponto aparecer · ${n + 1} de ${MOTOR_BASELINE.trials}`;
    refs.center.innerHTML = '';
    refs.response.innerHTML = '<button class="btn btn--lg" data-av-tap>Toque aqui quando aparecer</button>';
    const delay = MOTOR_BASELINE.minWaitMs + Math.random() * (MOTOR_BASELINE.maxWaitMs - MOTOR_BASELINE.minWaitMs);
    let shownAt = null;
    const timer = setTimeout(() => {
      if (!active) return;
      refs.center.innerHTML = '<div class="av-dot"></div>';
      shownAt = performance.now();
    }, delay);
    refs.response.onclick = (e) => {
      if (!e.target.closest('[data-av-tap]')) return;
      clearTimeout(timer);
      if (shownAt === null) {
        refs.center.innerHTML = '<p class="th-hint">Cedo demais — espere o ponto aparecer.</p>';
        setTimeout(() => next(n), 700);
        return;
      }
      times.push(performance.now() - shownAt);
      refs.center.innerHTML = '';
      setTimeout(() => next(n + 1), 350);
    };
  };
  next(0);
  return { stop: finish };
}
