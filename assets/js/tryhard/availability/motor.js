// Linha de base motora.
//
// Um ponto aparece em momento imprevisível e a pessoa toca assim que o vê. O
// que sai daqui é quanto do tempo de resposta é só mão e tela — útil como
// contexto ao ler o tempo de recuperação.
//
// O que este número NÃO é: uma constante para subtrair do tempo de resposta e
// chamar o resto de "tempo cognitivo". Percepção, decisão e movimento não se
// separam por subtração (§18). Ele aparece apenas nas métricas avançadas.

export const MOTOR_BASELINE = {
  trials: 12,
  minWaitMs: 700,
  maxWaitMs: 1800,
  /** Toque antes disto é antecipação, não reação. */
  minValidMs: 120,
  /** Acima disto houve distração, não latência motora. */
  maxValidMs: 1200,
  minValidTrials: 6,
};

/** Mediana: resistente ao toque distraído que a faixa não pegou. */
export function median(values) {
  if (!values.length) return null;
  const ordenados = [...values].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2);
}

/** Fecha a calibração; devolve null quando sobrou pouca coisa confiável. */
export function summarizeMotorBaseline(times) {
  const validos = times.filter(
    (t) => t >= MOTOR_BASELINE.minValidMs && t <= MOTOR_BASELINE.maxValidMs,
  );
  if (validos.length < MOTOR_BASELINE.minValidTrials) {
    return { medianMs: null, valid: validos.length, total: times.length };
  }
  return {
    medianMs: median(validos),
    fastestMs: Math.min(...validos),
    valid: validos.length,
    total: times.length,
  };
}
