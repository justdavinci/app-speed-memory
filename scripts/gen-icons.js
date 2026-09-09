// Gera os ícones PNG do PiscaMemory sem dependências externas (canvas próprio + zlib).
// Uso: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Desenha o ícone: quadrado arredondado em degradê com três barras crescentes. */
function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const put = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    const prev = buf[i + 3] / 255;
    const alpha = a / 255;
    const out = alpha + prev * (1 - alpha);
    if (out === 0) return;
    buf[i] = (r * alpha + buf[i] * prev * (1 - alpha)) / out;
    buf[i + 1] = (g * alpha + buf[i + 1] * prev * (1 - alpha)) / out;
    buf[i + 2] = (b * alpha + buf[i + 2] * prev * (1 - alpha)) / out;
    buf[i + 3] = out * 255;
  };

  // Distância ao retângulo arredondado (negativa dentro), para bordas suaves.
  const sdf = (x, y) => {
    const dx = Math.max(radius - x, 0, x - (size - radius));
    const dy = Math.max(radius - y, 0, y - (size - radius));
    return Math.hypot(dx, dy) - radius;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = sdf(x + 0.5, y + 0.5);
      if (d > 1) continue;
      const edge = Math.min(1, Math.max(0, 1 - d)); // antialias de 1px
      const t = (x / size) * 0.45 + (y / size) * 0.55;
      const r = Math.round(91 + (139 - 91) * t);
      const g = Math.round(140 + (92 - 140) * t);
      const b = Math.round(255 + (246 - 255) * t);
      put(x, y, r, g, b, 255 * edge);
    }
  }

  // Três barras brancas de alturas crescentes ("evolução").
  const bw = size * 0.13;
  const gap = size * 0.075;
  const totalW = bw * 3 + gap * 2;
  const x0 = (size - totalW) / 2;
  const baseY = size * 0.74;
  const heights = [0.20, 0.32, 0.46].map((h) => h * size);
  heights.forEach((h, i) => {
    const left = x0 + i * (bw + gap);
    const top = baseY - h;
    const rr = bw / 2;
    for (let y = Math.floor(top); y < baseY; y++) {
      for (let x = Math.floor(left); x < left + bw; x++) {
        const cx = Math.min(Math.max(x + 0.5, left + rr), left + bw - rr);
        const cy = Math.min(Math.max(y + 0.5, top + rr), baseY - rr);
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - rr;
        if (d > 1) continue;
        put(x, y, 255, 255, 255, 255 * Math.min(1, Math.max(0, 1 - d)));
      }
    }
  });

  return png(size, size, buf);
}

for (const size of [192, 512]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, draw(size));
  console.log('gerado', file);
}
