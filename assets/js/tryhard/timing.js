// Motor de temporização.
//
// A tela desenha em quadros: em 60 Hz um quadro dura ~16,7 ms, em 120 Hz
// ~8,3 ms. Nenhum setTimeout muda isso. Toda exposição desta área passa por
// aqui, que sincroniza aparecer e sumir com quadros reais e devolve a duração
// que de fato ficou na tela — é ela que vai para os resultados.

let frameMs = 16.7;
let measured = false;

/** Duração de um quadro medida neste aparelho. */
export function getFrameMs() {
  return frameMs;
}

export function getRefreshHz() {
  return Math.round(1000 / frameMs);
}

export function isMeasured() {
  return measured;
}

/** Mede a duração do quadro pela mediana de algumas amostras. */
export function measureFrameMs(samples = 12) {
  return new Promise((resolve) => {
    const deltas = [];
    let last = 0;
    const tick = (ts) => {
      if (last) deltas.push(ts - last);
      last = ts;
      if (deltas.length < samples) {
        requestAnimationFrame(tick);
        return;
      }
      deltas.sort((a, b) => a - b);
      const median = deltas[Math.floor(deltas.length / 2)];
      if (median > 1 && median < 100) {
        frameMs = median;
        measured = true;
      }
      resolve(frameMs);
    };
    requestAnimationFrame(tick);
  });
}

/** Quantos quadros uma duração pedida ocupa, no mínimo um. */
export function framesFor(requestedMs) {
  return Math.max(1, Math.round(requestedMs / frameMs));
}

/** Duração que o aparelho consegue entregar para o tempo pedido. */
export function achievableMs(requestedMs) {
  return framesFor(requestedMs) * frameMs;
}

/** O tempo pedido é menor que um quadro? */
export function isBelowFrame(requestedMs) {
  return requestedMs < frameMs;
}

/**
 * Apresenta um estímulo por um tempo, sincronizado com os quadros da tela.
 *
 * `show` é chamado dentro de um quadro e `hide` no primeiro quadro que alcança
 * a duração pedida (arredondando para o quadro mais próximo, nunca menos de
 * um). A promessa resolve com a duração real entre os dois quadros.
 *
 * @param {{show:Function, hide:Function, requestedMs:number, signal?:{aborted:boolean}}} opts
 * @returns {Promise<{requestedMs:number, actualMs:number, frames:number, aborted:boolean}>}
 */
export function presentStimulus({ show, hide, requestedMs, signal }) {
  return new Promise((resolve) => {
    const target = Math.max(0, requestedMs) - frameMs / 2;
    let raf = 0;
    let t0 = 0;
    let frames = 0;

    const finish = (actualMs, aborted) => {
      cancelAnimationFrame(raf);
      resolve({ requestedMs, actualMs, frames, aborted: !!aborted });
    };

    const step = (ts) => {
      if (signal?.aborted) { hide(); finish(ts - t0, true); return; }
      frames += 1;
      const elapsed = ts - t0;
      if (elapsed >= target) {
        hide();
        finish(elapsed, false);
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const start = (ts) => {
      if (signal?.aborted) { finish(0, true); return; }
      show();
      t0 = ts;
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(start);
  });
}

/** Espera sincronizada com quadros, para atrasos curtos (máscara, retrocue). */
export function waitMs(ms, signal) {
  if (ms <= 0) return Promise.resolve({ actualMs: 0, aborted: !!signal?.aborted });
  return new Promise((resolve) => {
    const start = performance.now();
    let raf = 0;
    const step = (ts) => {
      if (signal?.aborted) { cancelAnimationFrame(raf); resolve({ actualMs: ts - start, aborted: true }); return; }
      if (ts - start >= ms - frameMs / 2) { resolve({ actualMs: ts - start, aborted: false }); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
}

/** Só para testes: fixa a duração do quadro sem medir. */
export function setFrameMsForTesting(ms) {
  frameMs = ms;
  measured = false;
}
