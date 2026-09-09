// Utilitários genéricos, sem dependência de DOM (usados também nos testes).

/** Inteiro aleatório em [min, max] (inclusivo). */
export function randInt(min, max, rnd = Math.random) {
  return min + Math.floor(rnd() * (max - min + 1));
}

/** Escolhe um item aleatório do array. */
export function pick(arr, rnd = Math.random) {
  return arr[Math.floor(rnd() * arr.length)];
}

/** Cópia embaralhada (Fisher-Yates). */
export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** N itens distintos do array (se n > tamanho, permite repetição). */
export function sample(arr, n, rnd = Math.random) {
  if (n <= arr.length) return shuffle(arr, rnd).slice(0, n);
  const out = shuffle(arr, rnd);
  while (out.length < n) out.push(pick(arr, rnd));
  return out;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Remove acentos de uma string. */
export function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza um token para comparação.
 * @param {string} s
 * @param {boolean} strictAccents  se false, "cao" === "ção"
 */
export function normalizeToken(s, strictAccents = false) {
  let t = String(s)
    .toLowerCase()
    .replace(/[.,;:!?"'`´“”‘’()\[\]{}]/g, '')
    .trim();
  if (!strictAccents) t = stripAccents(t);
  return t;
}

/** Divide um texto livre em tokens de palavras. */
export function tokenizeWords(text) {
  return String(text)
    .split(/[\s\n\r\t,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Mantém apenas dígitos. */
export function onlyDigits(text) {
  return String(text).replace(/\D+/g, '');
}

/** Agrupa uma string em blocos de tamanho `size` ("12345", 3 -> ["123","45"]). */
export function chunk(str, size) {
  if (!size || size < 1) return [str];
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

/** Média aritmética (0 para lista vazia). */
export function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function pct(n) {
  return `${Math.round(n * 100)}%`;
}

/** "1m 23s" / "45,2s" */
export function fmtDuration(ms) {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace('.', ',')}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return `${m}m ${String(rest).padStart(2, '0')}s`;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Id curto e único o suficiente para registros locais. */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Escapa texto para interpolação segura em HTML. */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
