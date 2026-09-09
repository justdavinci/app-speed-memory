// Telas da Disponibilidade Visual.
//
// Fica separado de ui.js porque são pedaços que aparecem em quatro lugares
// diferentes — configuração, treino rápido, Mundo real e progresso — e juntar
// tudo no arquivo principal só tornaria os dois piores de ler.

import { esc, fmtDateTime, pct } from '../../util.js';
import { barChart } from '../../charts.js';
import * as store from '../store.js';
import {
  AVAILABILITY_CATEGORIES, AVAILABILITY_CONFIG, AVAILABILITY_PRESETS,
  CATEGORY_IDS, moduleSupportsAvailability,
} from './config.js';
import { categoryLabel } from './categories.js';
import { MOTOR_BASELINE, summarizeMotorBaseline } from './motor.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ms = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} ms`);

/** Diferença em ms só vira mensagem quando passa da margem de ruído (§44). */
export function deltaLabel(now, before) {
  if (now === null || before === null || now === undefined || before === undefined) return null;
  const d = now - before;
  if (Math.abs(d) < AVAILABILITY_CONFIG.noiseMarginMs) return 'sem mudança relevante';
  return `${d < 0 ? '−' : '+'}${Math.abs(Math.round(d))} ms`;
}

/* ----------------------------- configuração ----------------------------- */

export function configCard() {
  const s = store.getAvailabilitySettings();
  const relatorio = store.getAvailabilityReport();
  const manual = s.mode === 'manual';

  const categorias = CATEGORY_IDS
    .filter((id) => relatorio.categories[id])
    .map((id) => {
      const c = relatorio.categories[id];
      return `<div class="th-record-row">
          <span>${esc(categoryLabel(id))}</span>
          <span>${c.calibrating ? 'calibrando' : `T80 ${ms(c.smoothedT80 ?? c.t80)}`} · ${esc(c.confidence)}</span>
        </div>`;
    }).join('');

  return `<div class="card">
      <h2 class="card__title">Disponibilidade visual</h2>
      <p class="th-hint">Treine para tornar uma informação visual recém-vista utilizável cada vez mais rapidamente.</p>

      <label class="switch">
        <span>
          <strong>Treino de disponibilidade</strong>
          <small>Depois que o estímulo some, o app varia quanto espera antes de perguntar.</small>
        </span>
        <input type="checkbox" id="av-enabled"${s.enabled ? ' checked' : ''} />
        <span class="switch__track" aria-hidden="true"></span>
      </label>

      <div id="av-options"${s.enabled ? '' : ' hidden'}>
        <div class="field">
          <div class="field__head"><span class="field__label">Quanto do treino usa</span></div>
          <div class="segmented" id="av-preset">
            ${Object.values(AVAILABILITY_PRESETS).filter((p) => p.id !== 'off').map((p) => (
              `<button class="segmented__opt" data-av-preset="${p.id}" role="radio"
                aria-checked="${s.preset === p.id}">${esc(p.label)}</button>`
            )).join('')}
          </div>
          <p class="field__hint">${esc(AVAILABILITY_PRESETS[s.preset]?.blurb || '')}
            Mesmo no máximo, algumas tentativas seguem normais — misturar evita que você se adapte ao formato.</p>
        </div>

        <div class="field">
          <div class="field__head"><span class="field__label">Modo</span></div>
          <div class="segmented" id="av-mode">
            <button class="segmented__opt" data-av-mode="adaptive" role="radio" aria-checked="${!manual}">Adaptativo</button>
            <button class="segmented__opt" data-av-mode="manual" role="radio" aria-checked="${manual}">Manual</button>
          </div>
          <p class="field__hint">${manual
            ? 'Manual: o atraso é o que você escolher, sem adaptação.'
            : 'Adaptativo: o app persegue o alvo de acerto e encurta o atraso quando sobra folga.'}</p>
        </div>

        <div id="av-adaptive"${manual ? ' hidden' : ''}>
          <div class="field__head">
            <span class="field__label">Alvo de acerto</span>
            <output class="field__value" id="out-av-target">${Math.round(s.targetAccuracy * 100)}%</output>
          </div>
          <input class="stepper__range" type="range" id="av-target" min="60" max="90" step="5"
                 value="${Math.round(s.targetAccuracy * 100)}" aria-label="Alvo de acerto" />

          <div class="field__head">
            <span class="field__label">Atraso mínimo</span>
            <output class="field__value" id="out-av-min">${ms(s.minDelayMs)}</output>
          </div>
          <input class="stepper__range" type="range" id="av-min" min="0" max="300" step="10"
                 value="${s.minDelayMs}" aria-label="Atraso mínimo" />

          <div class="field__head">
            <span class="field__label">Atraso máximo</span>
            <output class="field__value" id="out-av-max">${ms(s.maxDelayMs)}</output>
          </div>
          <input class="stepper__range" type="range" id="av-max" min="200" max="900" step="25"
                 value="${s.maxDelayMs}" aria-label="Atraso máximo" />
        </div>

        <div id="av-manual"${manual ? '' : ' hidden'}>
          <label class="switch">
            <span><strong>Sortear dentro de uma faixa</strong><small>Em vez de um valor fixo.</small></span>
            <input type="checkbox" id="av-manual-random"${s.manualRandom ? ' checked' : ''} />
            <span class="switch__track" aria-hidden="true"></span>
          </label>
          <div id="av-manual-fixed"${s.manualRandom ? ' hidden' : ''}>
            <div class="field__head">
              <span class="field__label">Atraso</span>
              <output class="field__value" id="out-av-manual">${ms(s.manualDelayMs)}</output>
            </div>
            <input class="stepper__range" type="range" id="av-manual-delay" min="0" max="600" step="10"
                   value="${s.manualDelayMs}" aria-label="Atraso manual" />
          </div>
          <div id="av-manual-range"${s.manualRandom ? '' : ' hidden'}>
            <div class="field__head">
              <span class="field__label">De</span>
              <output class="field__value" id="out-av-manual-min">${ms(s.manualMinMs)}</output>
            </div>
            <input class="stepper__range" type="range" id="av-manual-min" min="0" max="600" step="10"
                   value="${s.manualMinMs}" aria-label="Atraso mínimo manual" />
            <div class="field__head">
              <span class="field__label">Até</span>
              <output class="field__value" id="out-av-manual-max">${ms(s.manualMaxMs)}</output>
            </div>
            <input class="stepper__range" type="range" id="av-manual-max" min="0" max="600" step="10"
                   value="${s.manualMaxMs}" aria-label="Atraso máximo manual" />
          </div>
        </div>

        <label class="switch">
          <span>
            <strong>Retrieval limpo</strong>
            <small>A pergunta aparece sozinha; as alternativas entram ${AVAILABILITY_CONFIG.cleanRetrievalOptionsDelayMs} ms depois.</small>
          </span>
          <input type="checkbox" id="av-clean"${s.cleanRetrieval ? ' checked' : ''} />
          <span class="switch__track" aria-hidden="true"></span>
        </label>
        <p class="field__hint">Ver as opções junto com a pergunta ajuda a reconstruir a resposta.
          Separando as duas, o que se mede é recuperação, não reconhecimento.</p>

        ${categorias ? `<div class="field">
          <div class="field__head"><span class="field__label">Por categoria</span></div>
          <div class="th-records">${categorias}</div>
        </div>` : ''}

        <div class="row row--wrap">
          <button class="btn btn--ghost" id="av-recalibrate">Recalibrar</button>
          <button class="btn btn--ghost" id="av-motor">Calibrar toque</button>
        </div>
        <p class="field__hint">${s.motorBaselineMs
          ? `Linha de base do toque: ${ms(s.motorBaselineMs)}. Serve de contexto para o tempo de resposta, não para subtrair dele.`
          : 'A calibração do toque é opcional e aparece só nas métricas avançadas.'}</p>
      </div>

      <p class="chart__caption">Esta é uma medida funcional de desempenho no exercício,
        não uma medição direta da atividade neural.</p>
    </div>`;
}

export function bindConfig(hooks = {}) {
  const rerender = hooks.render || (() => {});

  $('#av-enabled')?.addEventListener('change', (e) => {
    const ligando = e.target.checked;
    store.updateAvailabilitySettings({ enabled: ligando });
    if (ligando && !store.getAvailabilitySettings().onboarded) {
      hooks.intro?.();
      return;
    }
    rerender();
  });

  const slider = (id, out, format, apply) => {
    const el = $(`#${id}`);
    el?.addEventListener('input', () => { $(`#${out}`).textContent = format(Number(el.value)); });
    el?.addEventListener('change', () => apply(Number(el.value)));
  };

  $$('[data-av-preset]').forEach((btn) => btn.addEventListener('click', () => {
    store.updateAvailabilitySettings({ preset: btn.dataset.avPreset });
    rerender();
  }));
  $$('[data-av-mode]').forEach((btn) => btn.addEventListener('click', () => {
    store.updateAvailabilitySettings({ mode: btn.dataset.avMode });
    rerender();
  }));

  slider('av-target', 'out-av-target', (v) => `${v}%`, (v) => store.updateAvailabilitySettings({ targetAccuracy: v / 100 }));
  slider('av-min', 'out-av-min', ms, (v) => store.updateAvailabilitySettings({ minDelayMs: v }));
  slider('av-max', 'out-av-max', ms, (v) => store.updateAvailabilitySettings({ maxDelayMs: v }));
  slider('av-manual-delay', 'out-av-manual', ms, (v) => store.updateAvailabilitySettings({ manualDelayMs: v }));
  slider('av-manual-min', 'out-av-manual-min', ms, (v) => store.updateAvailabilitySettings({ manualMinMs: v }));
  slider('av-manual-max', 'out-av-manual-max', ms, (v) => store.updateAvailabilitySettings({ manualMaxMs: v }));

  $('#av-manual-random')?.addEventListener('change', (e) => {
    store.updateAvailabilitySettings({ manualRandom: e.target.checked });
    rerender();
  });
  $('#av-clean')?.addEventListener('change', (e) => {
    store.updateAvailabilitySettings({ cleanRetrieval: e.target.checked });
  });

  $('#av-recalibrate')?.addEventListener('click', () => {
    CATEGORY_IDS.forEach((id) => store.recalibrateAvailability(id));
    hooks.toast?.('Disponibilidade recalibrada.');
    rerender();
  });
  $('#av-motor')?.addEventListener('click', () => hooks.motor?.());
}

/* ---------------------------- treino rápido ----------------------------- */

/** Campo do treino rápido e do editor de rotina, por módulo (§74). */
export function moduleField(moduleId) {
  if (!moduleSupportsAvailability(moduleId)) return '';
  const s = store.getAvailabilitySettings();
  const escolha = s.modules?.[moduleId] || 'inherit';
  const relatorio = store.getAvailabilityReport();
  const categorias = Object.entries(relatorio.categories).filter(([, c]) => c.t80 !== null);
  const atual = categorias.length
    ? `Atraso atual ${ms(categorias[0][1].currentDelayMs)} · T80 estimado ${ms(categorias[0][1].smoothedT80 ?? categorias[0][1].t80)}`
    : 'Ainda calibrando o atraso desta categoria.';

  return `<div class="field">
      <div class="field__head"><span class="field__label">Disponibilidade visual</span></div>
      <div class="segmented" id="av-module">
        <button class="segmented__opt" data-av-module="inherit" role="radio" aria-checked="${escolha === 'inherit'}">Herdar</button>
        <button class="segmented__opt" data-av-module="on" role="radio" aria-checked="${escolha === 'on'}">Ligado</button>
        <button class="segmented__opt" data-av-module="off" role="radio" aria-checked="${escolha === 'off'}">Desligado</button>
      </div>
      <p class="field__hint">${s.enabled
        ? esc(atual)
        : 'O interruptor geral está desligado, então nenhum módulo usa.'}</p>
    </div>`;
}

export function bindModuleField(moduleId, root = document) {
  $$('[data-av-module]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('[data-av-module]', root).forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      store.setAvailabilityForModule(moduleId, btn.dataset.avModule);
    });
  });
}

/* ------------------------------ Mundo real ------------------------------ */

export function transferCard() {
  const s = store.getAvailabilitySettings();
  const r = store.getAvailabilityReport();
  const escolha = s.modules?.['real-world'] || 'inherit';
  const ligado = s.enabled && escolha !== 'off';

  return `<div class="card">
      <h2 class="card__title">Disponibilidade visual</h2>
      <p class="th-hint">As perguntas sobre painéis, documentos, mapas e cenas aparecem
        cada vez mais cedo depois que o material some.</p>
      <label class="switch">
        <span><strong>Usar no Mundo real</strong><small>${s.enabled
          ? 'Vale para as famílias compatíveis.'
          : 'Ligue o interruptor geral em Config para poder usar.'}</small></span>
        <input type="checkbox" id="av-transfer"${ligado ? ' checked' : ''}${s.enabled ? '' : ' disabled'} />
        <span class="switch__track" aria-hidden="true"></span>
      </label>
      <div class="tiles">
        <div class="tile"><div class="tile__value">${ms(r.transferT80)}</div><div class="tile__label">T80 em material realista</div></div>
        <div class="tile"><div class="tile__value">${ms(r.novelT80)}</div><div class="tile__label">T80 em material novo</div></div>
        <div class="tile"><div class="tile__value">${r.transferGapMs === null ? '—' : `${Math.round(r.transferGapMs)} ms`}</div><div class="tile__label">lacuna de disponibilidade</div></div>
      </div>
      <p class="chart__caption">A lacuna é quanto tempo a mais o material inédito precisa.
        Quanto menor, mais a velocidade conquistada está transferindo.</p>
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

/** Barra maior é atraso menor: a escala é invertida de propósito (§47). */
function availabilityChart(series, category) {
  if (!series.length) return '<p class="chart__empty">Sem dados de disponibilidade ainda.</p>';
  const ancora = category ? AVAILABILITY_CATEGORIES[category] : null;
  const teto = ancora ? ancora.slowMs : Math.max(...series.map((d) => d.t80), 400);
  return barChart(series.map((d) => ({ value: Math.max(0, teto - d.t80), max: teto })));
}

export function progressCards({ range = 30, category = null } = {}) {
  const r = store.getAvailabilityReport();
  const series = store.getAvailabilitySeries(category, range);
  const disponiveis = CATEGORY_IDS.filter((id) => r.categories[id]);
  const ultimo = series[series.length - 1] || null;
  const anterior = series.length > 1 ? series[series.length - 2] : null;

  const filtros = ['all', ...disponiveis].map((id) => (
    `<button class="chip${(category || 'all') === id ? ' is-active' : ''}" data-av-cat="${id}">`
    + `${id === 'all' ? 'Tudo' : esc(categoryLabel(id))}</button>`
  )).join('');

  const linhas = disponiveis.map((id) => {
    const c = r.categories[id];
    return `<div class="th-record-row">
        <span>${esc(categoryLabel(id))}</span>
        <span>${c.calibrating ? 'calibrando' : ms(c.smoothedT80 ?? c.t80)}${c.exposureMs ? ` · exposição ${ms(c.exposureMs)}` : ''}</span>
      </div>`;
  }).join('');

  const benchmarks = store.getAvailabilityBenchmarks().slice(-4).reverse();

  return `<div class="card">
      <h2 class="card__title">Disponibilidade visual</h2>
      <div class="tiles">
        <div class="tile"><div class="tile__value">${r.score === null ? '—' : r.score}</div><div class="tile__label">índice</div></div>
        <div class="tile"><div class="tile__value">${ms(ultimo?.t80)}</div><div class="tile__label">T80 recente</div></div>
        <div class="tile"><div class="tile__value">${esc(deltaLabel(ultimo?.t80 ?? null, anterior?.t80 ?? null) || '—')}</div><div class="tile__label">variação</div></div>
      </div>
      ${disponiveis.length > 1 ? `<div class="chips">${filtros}</div>` : ''}
      <div class="chart chart--bars">${availabilityChart(series, category)}</div>
      <p class="chart__caption">Barra maior é atraso menor: quanto mais alto, mais cedo a informação ficou utilizável.
        O T80 é o intervalo pós-estímulo em que o acerto chega a 80% do seu teto recente naquele material.</p>
      ${linhas ? `<div class="th-records">${linhas}</div>
        <p class="chart__caption">Cada material tem escala própria: uma cena leva naturalmente mais tempo que quatro dígitos.</p>` : ''}
      ${benchmarks.length ? `<h2 class="card__title">Benchmarks</h2>
        <div class="th-records">${benchmarks.map((b) => `<div class="th-record-row">
          <span>${b.kind === 'realWorld' ? 'Mundo real' : 'Abstrato'} · ${esc(fmtDateTime(b.completedAt))}</span>
          <span>${ms(b.t80)} · ${esc(b.confidence)}</span>
        </div>`).join('')}</div>` : ''}
    </div>`;
}

export function bindProgress(onCategory) {
  $$('[data-av-cat]').forEach((btn) => {
    btn.addEventListener('click', () => onCategory(btn.dataset.avCat === 'all' ? null : btn.dataset.avCat));
  });
}

/* --------------------------- resumo da sessão --------------------------- */

export function sessionSummary(session) {
  const blocos = session.modules.filter((m) => m.availability?.trials);
  if (!blocos.length) return '';
  const a = blocos[blocos.length - 1].availability;
  const estado = Object.entries(a.categories)[0]?.[1] || {};
  const variacao = deltaLabel(a.t80, estado.smoothedT80 === a.t80 ? null : estado.smoothedT80);

  return `<div class="th-result__transfer">
      <p class="th-kicker">Disponibilidade visual</p>
      <p class="th-big-line">T80 ${ms(a.t80)}</p>
      <p class="th-hint">${a.trials} tentativas · acerto ${a.accuracy === null ? '—' : pct(a.accuracy)}
        · tempo de resposta ${ms(a.retrievalMs)} · confiança ${esc(a.confidence)}</p>
      ${variacao ? `<p class="th-hint">${esc(variacao)} em relação à média recente.</p>` : ''}
      ${a.bestStableT80 !== null && a.bestStableT80 !== undefined
        ? `<p class="th-hint">Melhor estável: ${ms(a.bestStableT80)}.</p>` : ''}
    </div>`;
}

/* --------------------------- primeira ativação -------------------------- */

export const INTRO = [
  {
    title: 'Disponibilidade visual',
    text: 'Depois que algo some da tela, ainda leva um tempo até aquela informação poder ser '
      + 'recuperada com precisão. Este treino reduz progressivamente esse intervalo.',
  },
  {
    title: 'Como funciona',
    text: 'Você verá um estímulo rapidamente. Assim que ele sumir, a pergunta pode aparecer quase '
      + 'imediatamente. Não toque em nada antes da pergunta — o app ajusta o intervalo sozinho.',
  },
  {
    title: 'O que o número significa',
    text: 'Esta é uma medida funcional de desempenho no exercício, não uma medição direta da '
      + 'atividade neural. Ela diz com quanto tempo você consegue acertar, não o que o cérebro fez.',
  },
];

/**
 * Apresentação da primeira ativação. Reaproveita o painel do onboarding do
 * Try Hard, então não há um segundo componente de tela para manter.
 */
export function showIntro(el, onDone) {
  let index = 0;
  const draw = () => {
    const passo = INTRO[index];
    el.innerHTML = `<div class="th-onboarding__panel">
        <p class="th-kicker">${index + 1} de ${INTRO.length}</p>
        <h2 class="th-big">${esc(passo.title)}</h2>
        <p class="prose">${esc(passo.text)}</p>
        <div class="row">
          <button class="btn btn--ghost" data-av-intro="skip">Pular</button>
          <button class="btn btn--primary" data-av-intro="next">${index === INTRO.length - 1 ? 'Começar calibração' : 'Avançar'}</button>
        </div>
      </div>`;
  };
  draw();
  el.hidden = false;
  el.onclick = (e) => {
    const acao = e.target.closest('[data-av-intro]')?.dataset.avIntro;
    if (!acao) return;
    if (acao === 'next' && index < INTRO.length - 1) { index += 1; draw(); return; }
    el.hidden = true;
    el.onclick = null;
    store.updateAvailabilitySettings({ onboarded: true });
    onDone?.(acao === 'next');
  };
}

/* --------------------------- calibração do toque ------------------------ */

/**
 * Um ponto aparece em momento imprevisível; a pessoa toca assim que o vê.
 * É a única parte do recurso em que o tempo medido é só motor.
 */
export function runMotorBaseline(refs, { onDone, toast } = {}) {
  const tempos = [];
  let ativo = true;

  const encerrar = () => {
    ativo = false;
    refs.center.innerHTML = '';
    refs.prompt.textContent = '';
    refs.response.innerHTML = '';
    refs.response.onclick = null;
    const resumo = summarizeMotorBaseline(tempos);
    if (resumo.medianMs) {
      store.updateAvailabilitySettings({ motorBaselineMs: resumo.medianMs });
      toast?.(`Linha de base do toque: ${resumo.medianMs} ms.`);
    } else {
      toast?.('Poucos toques válidos. A calibração foi descartada.');
    }
    onDone?.(resumo);
  };

  const proxima = (n) => {
    if (!ativo) return;
    if (n >= MOTOR_BASELINE.trials) { encerrar(); return; }
    refs.prompt.textContent = `Toque assim que o ponto aparecer · ${n + 1} de ${MOTOR_BASELINE.trials}`;
    refs.center.innerHTML = '';
    refs.response.innerHTML = '<button class="btn btn--lg" data-av-tap>Toque aqui quando aparecer</button>';

    const espera = MOTOR_BASELINE.minWaitMs
      + Math.random() * (MOTOR_BASELINE.maxWaitMs - MOTOR_BASELINE.minWaitMs);
    let mostradoEm = null;
    const timer = setTimeout(() => {
      if (!ativo) return;
      refs.center.innerHTML = '<div class="av-dot"></div>';
      mostradoEm = performance.now();
    }, espera);

    refs.response.onclick = (e) => {
      if (!e.target.closest('[data-av-tap]')) return;
      clearTimeout(timer);
      if (mostradoEm === null) {
        // Tocou antes do ponto: não é reação, é antecipação. Repete.
        refs.center.innerHTML = '<p class="th-hint">Cedo demais — espere o ponto aparecer.</p>';
        setTimeout(() => proxima(n), 700);
        return;
      }
      tempos.push(performance.now() - mostradoEm);
      refs.center.innerHTML = '';
      setTimeout(() => proxima(n + 1), 350);
    };
  };

  proxima(0);
  return { stop: encerrar };
}
