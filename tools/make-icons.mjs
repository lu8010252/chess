// 生成 PWA 图标 PNG（零依赖：手写最小 PNG 编码器 + 超采样抗锯齿）
// 用法：node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = data.length;
  const out = Buffer.alloc(len + 12);
  out.writeUInt32BE(len, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  out.writeUInt32BE(crc, len + 8);
  return out;
}

function encodePNG(rgba, w, h) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    src.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const makeBuffer = size => ({ w: size, h: size, data: new Uint8ClampedArray(size * size * 4) });

function blend(c, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4;
  const d = c.data;
  const aa = Math.min(1, a);
  const da = d[i + 3] / 255;
  const oa = aa + da * (1 - aa);
  if (oa <= 0) return;
  d[i] = (r * aa + d[i] * da * (1 - aa)) / oa;
  d[i + 1] = (g * aa + d[i + 1] * da * (1 - aa)) / oa;
  d[i + 2] = (b * aa + d[i + 2] * da * (1 - aa)) / oa;
  d[i + 3] = oa * 255;
}

function sdfRoundRect(x, y, x0, y0, x1, y1, rad) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2 - rad;
  const hh = (y1 - y0) / 2 - rad;
  const dx = Math.abs(x - cx) - hw;
  const dy = Math.abs(y - cy) - hh;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rad;
}

function fillRoundRect(c, x0, y0, x1, y1, rad, colorAt) {
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const d = sdfRoundRect(x + 0.5, y + 0.5, x0, y0, x1, y1, rad);
      const a = Math.min(1, Math.max(0, 0.5 - d));
      if (a <= 0) continue;
      const col = colorAt(x, y);
      blend(c, x, y, col[0], col[1], col[2], a);
    }
  }
}

function fillRectAA(c, x0, y0, x1, y1, color) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    const cy = Math.min(y1, y + 1) - Math.max(y0, y);
    if (cy <= 0) continue;
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const cx = Math.min(x1, x + 1) - Math.max(x0, x);
      if (cx <= 0) continue;
      blend(c, x, y, color[0], color[1], color[2], cx * cy);
    }
  }
}

function fillCircle(c, cx, cy, rad, colorAt) {
  for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
    for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = Math.min(1, Math.max(0, rad + 0.5 - dist));
      if (a <= 0) continue;
      const col = colorAt(x + 0.5 - cx, y + 0.5 - cy, dist / rad);
      blend(c, x, y, col[0], col[1], col[2], a);
    }
  }
}

function stoneColor(kind, dx, dy, t) {
  const hl = Math.max(0, 1 - Math.hypot(dx + 0.34, dy + 0.38) * 1.5);
  if (kind === 'black') {
    const rim = 1 - t;
    return [
      (14 + hl * 72) * rim + 6 * t,
      (17 + hl * 76) * rim + 8 * t,
      (22 + hl * 84) * rim + 11 * t
    ];
  }
  const rim = 1 - t;
  return [
    (198 + hl * 57) * rim + 176 * t,
    (192 + hl * 60) * rim + 168 * t,
    (175 + hl * 64) * rim + 148 * t
  ];
}

/** 绘制图标：坐标基于 512 设计稿 */
function drawArt(c, size, { bleed = false, inset = 0 } = {}) {
  const k = size / 512;
  const pad = (12 + inset) * k;
  const x0 = pad, y0 = pad, x1 = size - pad, y1 = size - pad;
  const rad = Math.max(0, (104 - inset) * k);

  const bg = (x, y) => {
    const t = (y - y0) / Math.max(1, y1 - y0);
    return [27 - 17 * t, 37 - 23 * t, 49 - 29 * t];
  };

  if (bleed) {
    for (let y = 0; y < size; y++) {
      const t = y / size;
      for (let x = 0; x < size; x++) blend(c, x, y, 20 - 12 * t, 28 - 16 * t, 38 - 20 * t, 1);
    }
  } else {
    fillRoundRect(c, x0, y0, x1, y1, rad, bg);
  }

  // 金色边框
  const bw = 7 * k;
  fillRoundRect(c, x0, y0, x1, y1, rad, () => [228, 185, 104]);
  fillRoundRect(c, x0 + bw, y0 + bw, x1 - bw, y1 - bw, Math.max(0, rad - bw), bg);

  // 棋盘线
  const gx0 = 146 * k, gx1 = 366 * k;
  const step = (gx1 - gx0) / 2;
  const lw = 4.5 * k;
  const gold = [228, 185, 104];
  for (let i = 0; i < 3; i++) {
    const p = gx0 + step * i;
    fillRectAA(c, gx0, p - lw / 2, gx1, p + lw / 2, gold);
    fillRectAA(c, p - lw / 2, gx0, p + lw / 2, gx1, gold);
  }
  fillCircle(c, 256 * k, 256 * k, 5.5 * k, () => gold);

  // 黑子 + 白子
  const r = 44 * k;
  fillCircle(c, 258 * k, 261 * k, r, () => [6, 8, 11]);
  fillCircle(c, 256 * k, 256 * k, r, (dx, dy, t) => stoneColor('black', dx / r, dy / r, t));
  fillCircle(c, 237 * k, 239 * k, 8 * k, () => [255, 255, 255]);

  fillCircle(c, 368 * k, 371 * k, r, () => [58, 48, 32]);
  fillCircle(c, 366 * k, 366 * k, r, (dx, dy, t) => stoneColor('white', dx / r, dy / r, t));
  fillCircle(c, 347 * k, 349 * k, 7 * k, () => [255, 255, 255]);
}

function render(size, opts) {
  const SS = 3;
  const S = size * SS;
  const c = makeBuffer(S);
  drawArt(c, S, opts);

  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          r += c.data[i]; g += c.data[i + 1]; b += c.data[i + 2]; a += c.data[i + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return encodePNG(out, size, size);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ['icon-512.png', 512, {}],
  ['icon-192.png', 192, {}],
  ['apple-touch-icon.png', 180, {}],
  ['maskable-512.png', 512, { bleed: true, inset: 58 }]
];

for (const [name, size, opts] of files) {
  const buf = render(size, opts);
  writeFileSync(OUT_DIR + name, buf);
  console.log(`生成 ${name} (${size}×${size}, ${(buf.length / 1024).toFixed(1)}KB)`);
}
