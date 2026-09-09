// Gerador aleatório com semente opcional.
// Semente fixa deixa os testes determinísticos; sem semente, usa Math.random.

/** mulberry32: pequeno, rápido e com distribuição boa o bastante para estímulos. */
export function seeded(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  return seed === undefined || seed === null ? Math.random : seeded(seed);
}

export function rInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function rPick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function rShuffle(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `n` itens distintos; repete apenas se o conjunto for menor que `n`. */
export function rSample(rng, list, n) {
  if (n <= list.length) return rShuffle(rng, list).slice(0, n);
  const out = rShuffle(rng, list);
  while (out.length < n) out.push(rPick(rng, list));
  return out;
}
