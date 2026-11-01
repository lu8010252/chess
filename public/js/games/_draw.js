// 各游戏共用的绘制工具（木纹底、棋子、圆角、文字适配）

const surfaceCache = new Map();

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PALETTE = {
  wood: { name: 'wood', top: '#e8c088', bottom: '#cf9a5c', grain: 'rgba(120,72,28,0.10)', edge: '#a9743f' },
  paper: { name: 'paper', top: '#f4e2bd', bottom: '#e2c48e', grain: 'rgba(150,110,50,0.08)', edge: '#c39d63' },
  ink: { name: 'ink', top: '#2a3140', bottom: '#1b2130', grain: 'rgba(255,255,255,0.05)', edge: '#0d1118' },
  jade: { name: 'jade', top: '#2f6357', bottom: '#20463d', grain: 'rgba(255,255,255,0.06)', edge: '#12302a' }
};

function makeSurface(w, h, pal) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, w * 0.6, h);
  grad.addColorStop(0, pal.top);
  grad.addColorStop(1, pal.bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 木纹 / 纸纹：固定种子的细线，保证每次重绘一致
  const rnd = mulberry32(Math.round(w * 7 + h * 13));
  g.strokeStyle = pal.grain;
  g.lineWidth = Math.max(1, w / 520);
  for (let i = 0; i < 42; i++) {
    const y0 = rnd() * h;
    const amp = (rnd() - 0.5) * h * 0.06;
    g.beginPath();
    g.moveTo(-4, y0);
    g.bezierCurveTo(w * 0.3, y0 + amp, w * 0.65, y0 - amp, w + 4, y0 + amp * 0.4);
    g.stroke();
  }

  // 四周暗角，让棋盘更有质感
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  return c;
}

/** 绘制木纹棋盘底 */
export function boardSurface(ctx, w, h, pal = PALETTE.wood) {
  const key = `${Math.round(w)}x${Math.round(h)}:${pal.name}`;
  let s = surfaceCache.get(key);
  if (!s) {
    s = makeSurface(Math.round(w), Math.round(h), pal);
    surfaceCache.set(key, s);
    if (surfaceCache.size > 6) surfaceCache.delete(surfaceCache.keys().next().value);
  }
  ctx.drawImage(s, 0, 0, w, h);
}

/** 圆角矩形路径 */
export function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** 立体围棋子 */
export function stone(ctx, x, y, r, color) {
  ctx.save();
  // 投影
  ctx.beginPath();
  ctx.arc(x + r * 0.06, y + r * 0.16, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,12,4,0.32)';
  ctx.fill();

  const g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.4, r * 0.2, x, y, r);
  if (color === 'black') {
    g.addColorStop(0, '#6e737a');
    g.addColorStop(0.45, '#22262c');
    g.addColorStop(1, '#07090c');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#f3efe4');
    g.addColorStop(1, '#c9c2b1');
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = color === 'black' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.restore();
}

/** 棋子上的文字（自动缩小以适配） */
export function pieceText(ctx, text, x, y, maxW, maxH, color, weight = 700) {
  let size = maxH;
  do {
    ctx.font = `${weight} ${size}px "STKaiti", "KaiTi", "Kaiti SC", "Songti SC", "PingFang SC", "Microsoft YaHei", serif`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 1;
  } while (size > 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + size * 0.04);
}

/** 发光高亮圈（用于选中/最后一步） */
export function halo(ctx, x, y, r, color = 'rgba(255,214,110,0.95)', width = 3) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();
}

/** 圆角按钮底色 */
export function pill(ctx, x, y, w, h, fill, stroke) {
  roundRect(ctx, x, y, w, h, Math.min(w, h) / 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** 棋盘坐标标注用的小字 */
export function boardLabel(ctx, text, x, y, size, color) {
  ctx.save();
  ctx.font = `600 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
