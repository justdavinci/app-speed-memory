// Adaptador de interface do Try Hard: é ele que o runner chama para desenhar
// estímulo, máscara, aviso, resposta e correção.
//
// Regra que atravessa este arquivo: nada de layout mudando durante a
// exposição. O estímulo é montado antes, escondido, e aparecer é só trocar a
// visibilidade — remontar componentes no instante crítico estragaria o tempo.

import { esc } from '../util.js';
import { symbolSvg, barSvg, ORIENTATIONS } from './symbols.js';
import { presentStimulus, waitMs, getFrameMs, getRefreshHz } from './timing.js';
import { TRY_HARD_CONFIG } from './config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function itemMarkup(value, { symbols, size = 44 } = {}) {
  return symbols ? symbolSvg(value, { size }) : esc(String(value));
}

function matrixMarkup(matrix, { symbols, scale = 1 } = {}) {
  const cells = matrix.cells.map((c) => (
    `<span class="th-cell">${itemMarkup(c.value, { symbols, size: 38 * scale })}</span>`
  )).join('');
  return `<div class="th-matrix" style="--cols:${matrix.cols};--rows:${matrix.rows}">${cells}</div>`;
}

function sequenceMarkup(items, { symbols } = {}) {
  return `<div class="th-sequence">${items.map((v) => `<span>${itemMarkup(v, { symbols })}</span>`).join('')}</div>`;
}

function peripheralMarkup(trial) {
  const scale = trial.itemScale ?? 1;
  const items = trial.items.map((item) => {
    const x = 50 + item.x * 46;
    const y = 50 + item.y * 46;
    return `<span class="th-peripheral__item" style="left:${x}%;top:${y}%;font-size:${(1.6 * scale).toFixed(2)}rem">`
      + `${itemMarkup(item.value, { symbols: trial.stimulusType === 'symbols' || trial.stimulusType === 'shapes', size: 40 * scale })}</span>`;
  }).join('');
  return `<div class="th-peripheral"><span class="th-fixation-mark">+</span>${items}</div>`;
}

export function stimulusMarkup(trial) {
  const symbols = trial.stimulusType === 'symbols' || trial.stimulusType === 'shapes';
  switch (trial.render?.kind) {
    case 'scene': return `<div class="th-scene-wrap">${trial.sceneHtml || ''}</div>`;
    case 'matrix': return matrixMarkup(trial.matrix, { symbols });
    case 'sequence': return sequenceMarkup(trial.items, { symbols: false });
    case 'peripheral': return peripheralMarkup(trial);
    case 'symbolRow': return `<div class="th-symbol-row">${trial.items.map((id) => symbolSvg(id, { size: 56 })).join('')}</div>`;
    case 'orientation': return `<div class="th-orientation" style="transform:scale(${trial.itemScale ?? 1})">`
      + `${barSvg({ degrees: trial.orientation.degrees, size: 120, contrast: trial.contrast ?? 1 })}</div>`;
    default: return sequenceMarkup(trial.items || [], { symbols });
  }
}

function fitScene(layer) {
  const scene = layer.querySelector('.th-sc');
  if (!scene) return;
  const box = layer.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const current = Number(scene.style.getPropertyValue('--sc-scale')) || 1;
  const rect = scene.getBoundingClientRect();
  const width = Math.max(rect.width, scene.scrollWidth * current);
  const height = Math.max(rect.height, scene.scrollHeight * current);
  if (!width || !height) return;
  const ratio = Math.min(1, (box.width - 4) / width, (box.height - 4) / height);
  if (ratio >= 0.999) return;
  scene.style.setProperty('--sc-scale', String(Math.max(0.45, current * ratio)));
}

function maskMarkup(trial) {
  const mask = trial.mask;
  if (!mask) return '';
  if (mask.kind === 'scene') {
    const cells = Array.from({ length: 36 }, (_, i) => (
      `<span>${esc(mask.chars[i % mask.chars.length] || '#')}</span>`
    )).join('');
    return `<div class="th-scene-mask">${cells}</div>`;
  }
  const cls = mask.kind === 'noise' ? ' th-sequence--noise' : '';
  return `<div class="th-sequence${cls}">${mask.chars.map((c) => `<span>${esc(c)}</span>`).join('')}</div>`;
}

/**
 * Ponte para teclado físico. O mobile continua 100% touch e nenhum teclado
 * virtual é aberto; no desktop as teclas simplesmente acionam os mesmos
 * botões que já existiam.
 */
function installPhysicalKeyboard(stage, responseEl) {
  const handler = (e) => {
    if (stage.dataset.stage !== 'response') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Enter') {
      const ok = responseEl.querySelector('[data-action="ok"]');
      if (ok) { e.preventDefault(); ok.click(); }
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const back = responseEl.querySelector('[data-action="back"], [data-action="clear"]');
      if (back) { e.preventDefault(); back.click(); }
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const active = responseEl.querySelector('.th-grid__cell.is-active');
      const grid = active?.closest('.th-grid');
      if (!active || !grid) return;
      const cells = [...grid.querySelectorAll('[data-cell]')];
      const cols = Number(getComputedStyle(grid).getPropertyValue('--cols')) || Math.round(Math.sqrt(cells.length)) || 1;
      const i = Number(active.dataset.cell);
      const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : cols;
      const next = cells[i + delta];
      if (next) { e.preventDefault(); next.click(); }
      return;
    }

    if (e.key.length !== 1) return;
    const key = e.key.toLocaleUpperCase('pt-BR');
    const values = [...responseEl.querySelectorAll('[data-value]')];
    const exact = values.find((btn) => String(btn.dataset.value).toLocaleUpperCase('pt-BR') === key);
    if (exact) {
      e.preventDefault();
      exact.click();
      return;
    }

    // Em questões de múltipla escolha sem opção literal 1..9, as teclas
    // numéricas selecionam a posição da opção.
    if (/^[1-9]$/.test(e.key)) {
      const options = [...responseEl.querySelectorAll('.th-option[data-value]')];
      const option = options[Number(e.key) - 1];
      if (option) { e.preventDefault(); option.click(); }
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}

export function createView(refs) {
  const layer = refs.stimulus;
  const promptEl = refs.prompt;
  const responseEl = refs.response;
  const feedbackEl = refs.feedback;

  let advanced = false;
  let control = null;
  responseEl.tabIndex = -1;
  installPhysicalKeyboard(refs.stage, responseEl);

  const clearLayer = () => { layer.innerHTML = ''; layer.hidden = true; };
  const signal = () => control?.signal;

  const interactive = (build) => new Promise((resolve) => {
    let off = () => {};
    const done = (value) => { off(); resolve(value); };
    off = control?.onAbort?.(() => done({ aborted: true })) || (() => {});
    build(done);
  });

  const view = {
    setAdvancedMetrics(on) { advanced = !!on; },
    bindControl(sessionControl) { control = sessionControl; },

    setPhase({ name, position }) {
      refs.moduleName.textContent = name;
      refs.position.textContent = position ? `Exercício ${position.index + 1} de ${position.total}` : '';
      refs.position.hidden = !position;
    },

    setSessionProgress({ index, total }) {
      refs.sessionBar.innerHTML = Array.from({ length: total }, (_, i) => (
        `<i class="${i < index ? 'is-done' : i === index ? 'is-now' : ''}"></i>`
      )).join('');
      refs.sessionBar.hidden = total <= 1;
    },

    setProgress({ trialsDone, budget, elapsedMs, difficulty, calibrating, availability, retention }) {
      const parts = [];
      if (budget.kind === 'time') {
        const left = Math.max(0, budget.durationMs - elapsedMs);
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        parts.push(`${m}:${String(s).padStart(2, '0')}`);
        refs.bar.style.setProperty('--p', `${Math.min(100, (elapsedMs / budget.durationMs) * 100)}%`);
      } else if (budget.kind === 'trials') {
        parts.push(`${trialsDone}/${budget.trials}`);
        refs.bar.style.setProperty('--p', `${Math.min(100, (trialsDone / budget.trials) * 100)}%`);
      } else {
        parts.push(`${trialsDone} tentativas`);
        refs.bar.style.setProperty('--p', '100%');
      }
      if (calibrating) parts.push('calibrando');
      refs.counter.textContent = parts.join(' · ');
      refs.metrics.hidden = !advanced;
      if (advanced) {
        const lines = [`${getRefreshHz()} Hz · quadro ${getFrameMs().toFixed(1)} ms`];
        lines.push(Object.entries(difficulty || {}).map(([k, v]) => `${k}=${v}`).join(' · '));
        if (availability) {
          lines.push(`availability ${Math.round(availability.delayMs)} ms (${availability.phase})`
            + (availability.t80 ? ` · T80 ${availability.t80} ms` : '')
            + (availability.accuracy ? ` · janela ${Math.round(availability.accuracy * 100)}%` : ''));
        }
        if (retention) {
          lines.push(`retenção ${(retention.delayMs / 1000).toFixed(2)} s (${retention.mode})`
            + (retention.t80 ? ` · T80 ${(retention.t80 / 1000).toFixed(2)} s` : '')
            + (retention.accuracy ? ` · janela ${Math.round(retention.accuracy * 100)}%` : ''));
        }
        refs.metrics.textContent = lines.filter(Boolean).join(' · ');
      }
    },

    async showCountdown(seconds, { name } = {}) {
      refs.stage.dataset.stage = 'countdown';
      for (let n = seconds; n > 0; n--) {
        if (signal()?.aborted) break;
        refs.center.innerHTML = `<div class="th-countdown">${n}</div>`
          + (name ? `<p class="th-hint">${esc(name)}</p>` : '');
        await waitMs(700, signal());
      }
      refs.center.innerHTML = '';
    },

    async showFixation(ms, { keep } = {}) {
      refs.stage.dataset.stage = 'fixation';
      refs.center.innerHTML = '<div class="th-fixation">+</div>';
      await waitMs(ms, signal());
      if (!keep) refs.center.innerHTML = '';
    },

    async prepareStimulus(trial) {
      layer.innerHTML = stimulusMarkup(trial);
      layer.hidden = false;
      layer.style.visibility = 'hidden';
      void layer.offsetHeight;
      if (trial.render?.kind === 'scene') fitScene(layer);
      return {
        show: () => { layer.style.visibility = 'visible'; },
        hide: () => { layer.style.visibility = 'hidden'; },
      };
    },

    async presentStimulus(prepared, trial, signal) {
      refs.stage.dataset.stage = 'stimulus';
      const timing = await presentStimulus({ show: prepared.show, hide: prepared.hide, requestedMs: trial.exposureMs, signal });
      clearLayer();
      if (!trial.keepFixation) refs.center.innerHTML = '';
      return timing;
    },

    async waitBlank(ms, signal) {
      refs.stage.dataset.stage = 'blank';
      return waitMs(ms, signal);
    },

    async showMask(trial, durationMs, signal) {
      refs.stage.dataset.stage = 'mask';
      layer.innerHTML = maskMarkup(trial);
      layer.hidden = false;
      layer.style.visibility = 'hidden';
      void layer.offsetHeight;
      await presentStimulus({ show: () => { layer.style.visibility = 'visible'; }, hide: () => { layer.style.visibility = 'hidden'; }, requestedMs: durationMs, signal });
      clearLayer();
    },

    watchInvalidation() {
      const guard = { invalid: false, reason: null, stop: null };
      const onHidden = () => {
        if (document.visibilityState === 'hidden') {
          guard.invalid = true;
          guard.reason = 'A tela saiu de foco durante a tentativa.';
        }
      };
      const onOrientation = () => { guard.invalid = true; guard.reason = 'A tela girou durante a tentativa.'; };
      document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('orientationchange', onOrientation);
      guard.stop = () => {
        document.removeEventListener('visibilitychange', onHidden);
        window.removeEventListener('orientationchange', onOrientation);
      };
      return guard;
    },

    async showInvalid(reason) {
      refs.stage.dataset.stage = 'feedback';
      feedbackEl.hidden = false;
      feedbackEl.innerHTML = `<p class="th-feedback__title is-warn">Tentativa descartada</p><p class="th-hint">${esc(reason || 'Algo interrompeu a apresentação.')}</p>`;
      await waitMs(900, signal());
      feedbackEl.hidden = true;
    },

    collectResponse(trial) {
      refs.stage.dataset.stage = 'response';
      const pending = collectResponse({ trial, promptEl, responseEl, interactive, wait: (ms) => waitMs(ms, signal()) });
      queueMicrotask(() => responseEl.focus({ preventScroll: true }));
      return pending;
    },

    async showFeedback(result, trial, info) {
      const mode = info.mode || 'full';
      if (mode === 'none') { await waitMs(120, signal()); return; }
      refs.stage.dataset.stage = 'feedback';
      responseEl.innerHTML = '';
      promptEl.textContent = '';
      feedbackEl.hidden = false;
      const ok = result.exact;
      const title = ok ? 'Correto' : `${result.correct} de ${result.total}`;
      const lines = [];
      if (mode === 'full') {
        lines.push(`${Math.round(info.exposure)} ms`);
        lines.push(`throughput ${info.throughput}`);
        if (info.change) lines.push(`${info.change.label} ${info.change.direction === 'harder' ? '↑' : '↓'} ${info.change.to}`);
      }
      feedbackEl.innerHTML = `<p class="th-feedback__title ${ok ? 'is-ok' : 'is-bad'}">${esc(title)}</p>`
        + (lines.length ? `<p class="th-hint">${lines.map(esc).join(' · ')}</p>` : '')
        + (info.newRecords?.length ? '<p class="th-record">novo recorde</p>' : '');
      await waitMs(mode === 'full' ? TRY_HARD_CONFIG.feedbackFullMs : TRY_HARD_CONFIG.feedbackMinimalMs, signal());
      feedbackEl.hidden = true;
    },

    showFatigueNotice(fatigue) {
      return interactive((done) => {
        feedbackEl.hidden = false;
        feedbackEl.innerHTML = `<p class="th-feedback__title is-warn">Desempenho caiu ${Math.round(fatigue.drop * 100)}%</p>`
          + '<p class="th-hint">Nos últimos minutos, comparado ao começo. Uma pausa pode ajudar.</p>'
          + '<div class="row"><button class="btn btn--ghost" data-fatigue="pause">Pausar</button><button class="btn btn--primary" data-fatigue="continue">Continuar</button></div>';
        const onClick = (e) => {
          const choice = e.target.closest('[data-fatigue]')?.dataset.fatigue;
          if (!choice) return;
          feedbackEl.removeEventListener('click', onClick);
          feedbackEl.hidden = true;
          done(choice);
        };
        feedbackEl.addEventListener('click', onClick);
      });
    },

    showModuleSummary(summary, { next } = {}) {
      return interactive((done) => {
        refs.stage.dataset.stage = 'summary';
        refs.summary.hidden = false;
        refs.summary.innerHTML = moduleSummaryMarkup(summary, next);
        const onClick = (e) => {
          const action = e.target.closest('[data-summary]')?.dataset.summary;
          if (!action) return;
          refs.summary.removeEventListener('click', onClick);
          refs.summary.hidden = true;
          done(action);
        };
        refs.summary.addEventListener('click', onClick);
      });
    },

    reset() {
      clearLayer();
      refs.center.innerHTML = '';
      responseEl.innerHTML = '';
      promptEl.textContent = '';
      feedbackEl.hidden = true;
      refs.summary.hidden = true;
    },
  };

  return view;
}

export function moduleSummaryMarkup(summary, next) {
  const tile = (value, label) => `<div class="tile"><div class="tile__value">${esc(String(value))}</div><div class="tile__label">${esc(label)}</div></div>`;
  const minutes = Math.floor(summary.durationMs / 60000);
  const seconds = Math.floor((summary.durationMs % 60000) / 1000);
  return `<h2 class="card__title">${esc(summary.name)} concluído</h2><div class="tiles">
      ${tile(`${minutes}:${String(seconds).padStart(2, '0')}`, 'duração')}${tile(summary.trials, 'tentativas')}${tile(`${Math.round(summary.accuracy * 100)}%`, 'precisão')}
      ${tile(summary.bestExposureMs === null ? '—' : `${summary.bestExposureMs} ms`, 'melhor exposição')}${tile(summary.throughput, 'throughput')}
      ${tile(`${summary.difficultyDelta >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(summary.difficultyDelta * 100))}%`, 'dificuldade')}</div>
    ${summary.personalBests ? `<p class="th-record">${summary.personalBests} recorde(s) nesta rodada</p>` : ''}
    <div class="row row--wrap"><button class="btn btn--ghost" data-summary="stop">Encerrar</button><button class="btn btn--primary" data-summary="next">${next ? `Próximo: ${esc(next)}` : 'Continuar'}</button></div>`;
}

async function collectResponse({ trial, promptEl, responseEl, interactive, wait }) {
  const spec = trial.response;
  promptEl.textContent = spec.prompt || '';
  if (trial.cleanRetrievalDelayMs > 0 && wait) {
    responseEl.innerHTML = `<p class="th-question th-question--cue">${esc(cueTextOf(trial))}</p>`;
    const espera = await wait(trial.cleanRetrievalDelayMs);
    responseEl.innerHTML = '';
    if (espera?.aborted) return { items: [], reactionMs: 0, aborted: true };
  }
  const started = performance.now();
  return interactive((finish) => {
    const done = (items) => {
      responseEl.innerHTML = '';
      responseEl.onclick = null;
      finish({ items, reactionMs: Math.round(performance.now() - started) });
    };
    switch (spec.kind) {
      case 'chips': return renderChips(responseEl, spec, done);
      case 'grid': return renderGrid(responseEl, spec, done);
      case 'multi': return renderMulti(responseEl, spec, done);
      case 'choice': return renderChoice(responseEl, spec, done);
      case 'cell': return renderCellPicker(responseEl, spec, done);
      case 'questions': return renderQuestions(responseEl, spec, done);
      default: return done([]);
    }
  });
}

function cueTextOf(trial) {
  const spec = trial.response;
  if (spec.kind === 'questions') return spec.questions?.[0]?.text || spec.prompt || '';
  return spec.prompt || '';
}

function chipButton(value, symbols) {
  return `<button class="th-chip${symbols ? ' th-chip--symbol' : ''}" data-value="${esc(String(value))}">${itemMarkup(value, { symbols, size: 34 })}</button>`;
}

const keyboardHint = '<span class="th-keyboard-hint">teclado físico ativo · Enter confirma · Backspace apaga</span>';

function renderChips(root, spec, done) {
  const answer = [];
  const draw = () => {
    const slots = Array.from({ length: spec.slots }, (_, i) => `<span class="th-slot${i === answer.length ? ' is-active' : ''}">${answer[i] !== undefined ? itemMarkup(answer[i], { symbols: spec.symbols, size: 26 }) : ''}</span>`).join('');
    root.innerHTML = `<div class="th-slots">${slots}</div><div class="th-chips">${spec.pool.map((v) => chipButton(v, spec.symbols)).join('')}</div>`
      + `<div class="th-actions"><button class="btn btn--ghost" data-action="back">Apagar</button><button class="btn btn--primary" data-action="ok">Confirmar</button>${keyboardHint}</div>`;
  };
  draw();
  root.onclick = (e) => {
    const chip = e.target.closest('.th-chip');
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (chip && answer.length < spec.slots) { answer.push(chip.dataset.value); draw(); return; }
    if (action === 'back') { answer.pop(); draw(); return; }
    if (action === 'ok') { root.onclick = null; done(answer); }
  };
}

function renderGrid(root, spec, done) {
  const total = spec.rows * spec.cols;
  const answer = new Array(total).fill('');
  let cursor = 0;
  const draw = () => {
    const cells = answer.map((v, i) => `<button class="th-grid__cell${i === cursor ? ' is-active' : ''}" data-cell="${i}">${v ? itemMarkup(v, { symbols: spec.symbols, size: 28 }) : ''}</button>`).join('');
    root.innerHTML = `<div class="th-grid" style="--cols:${spec.cols}">${cells}</div><div class="th-chips">${spec.pool.map((v) => chipButton(v, spec.symbols)).join('')}</div>`
      + `<div class="th-actions"><button class="btn btn--ghost" data-action="clear">Limpar</button><button class="btn btn--primary" data-action="ok">Confirmar</button>${keyboardHint}</div>`;
  };
  draw();
  root.onclick = (e) => {
    const cell = e.target.closest('[data-cell]');
    const chip = e.target.closest('.th-chip');
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (cell) { cursor = Number(cell.dataset.cell); draw(); return; }
    if (chip) { answer[cursor] = chip.dataset.value; cursor = Math.min(total - 1, cursor + 1); draw(); return; }
    if (action === 'clear') { answer[cursor] = ''; draw(); return; }
    if (action === 'ok') { root.onclick = null; done(answer); }
  };
}

function renderMulti(root, spec, done) {
  const chosen = [];
  const draw = () => {
    root.innerHTML = `<p class="th-hint">${chosen.length} de ${spec.expectedCount}</p><div class="th-options">${spec.options.map((v) => `<button class="th-option${chosen.includes(v) ? ' is-chosen' : ''}" data-value="${esc(v)}">${itemMarkup(v, { symbols: spec.symbols, size: 44 })}</button>`).join('')}</div>`
      + '<div class="th-actions"><button class="btn btn--primary" data-action="ok">Confirmar</button></div>';
  };
  draw();
  root.onclick = (e) => {
    const option = e.target.closest('[data-value]');
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (option) {
      const v = option.dataset.value;
      const at = chosen.indexOf(v);
      if (at >= 0) chosen.splice(at, 1);
      else if (chosen.length < spec.expectedCount) chosen.push(v);
      draw();
      return;
    }
    if (action === 'ok') { root.onclick = null; done(chosen); }
  };
}

function renderChoice(root, spec, done) {
  const label = (v) => {
    if (spec.orientations) {
      const o = ORIENTATIONS.find((x) => x.id === v);
      return barSvg({ degrees: o?.degrees ?? 0, size: 44 });
    }
    const glyph = spec.glyphs?.[v];
    if (glyph) return `${symbolSvg(glyph, { size: 34 })}<span class="th-option__name">${esc(v)}</span>`;
    return itemMarkup(v, { symbols: spec.symbols, size: 40 });
  };
  root.innerHTML = `<div class="th-options">${spec.options.map((v) => `<button class="th-option" data-value="${esc(v)}">${label(v)}</button>`).join('')}</div>`
    + '<span class="th-keyboard-hint">teclas 1–9 também selecionam opções</span>';
  root.onclick = (e) => {
    const option = e.target.closest('[data-value]');
    if (!option) return;
    root.onclick = null;
    done([option.dataset.value]);
  };
}

function renderCellPicker(root, spec, done) {
  const total = spec.rows * spec.cols;
  root.innerHTML = `<div class="th-grid" style="--cols:${spec.cols}">${Array.from({ length: total }, (_, i) => `<button class="th-grid__cell" data-cell="${i}"></button>`).join('')}</div>`;
  root.onclick = (e) => {
    const cell = e.target.closest('[data-cell]');
    if (!cell) return;
    root.onclick = null;
    done([cell.dataset.cell]);
  };
}

function renderQuestions(root, spec, done) {
  const answers = [];
  const ask = (index) => {
    if (index >= spec.questions.length) { done(answers); return; }
    const q = spec.questions[index];
    const head = document.createElement('p');
    head.className = 'th-question';
    head.innerHTML = `${esc(q.text)}${q.symbol ? ` ${symbolSvg(q.symbol, { size: 30 })}` : ''}`;
    root.innerHTML = '';
    root.appendChild(head);
    const holder = document.createElement('div');
    root.appendChild(holder);
    const next = (items) => { answers.push(items[0]); ask(index + 1); };
    if (q.response.kind === 'cell') renderCellPicker(holder, q.response, next);
    else renderChoice(holder, q.response, next);
  };
  ask(0);
}

export { collectResponse };
