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

  // 斜向柔光：左上亮、右下暗，像真实台灯下的木盘
  const lg = g.createLinearGradient(0, 0, w, h);
  lg.addColorStop(0, 'rgba(255,244,214,0.20)');
  lg.addColorStop(0.5, 'rgba(255,244,214,0)');
  lg.addColorStop(1, 'rgba(0,0,0,0.10)');
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);

  // 四周暗角，让棋盘更有质感
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  // 边框斜面：外侧一圈深色，内侧一圈高光
  const bw = Math.max(2, Math.min(w, h) * 0.012);
  g.lineWidth = bw;
  g.strokeStyle = pal.edge;
  g.strokeRect(bw / 2, bw / 2, w - bw, h - bw);
  g.lineWidth = Math.max(1, bw * 0.5);
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.strokeRect(bw * 1.4, bw * 1.4, w - bw * 2.8, h - bw * 2.8);

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
  // 柔和投影
  ctx.shadowColor = 'rgba(20,12,4,0.45)';
  ctx.shadowBlur = r * 0.35;
  ctx.shadowOffsetY = r * 0.14;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color === 'black' ? '#15181d' : '#e9e3d2';
  ctx.fill();
  ctx.shadowColor = 'transparent';

  const g = ctx.createRadialGradient(x - r * 0.36, y - r * 0.42, r * 0.08, x + r * 0.08, y + r * 0.1, r * 1.05);
  if (color === 'black') {
    g.addColorStop(0, '#80858d');
    g.addColorStop(0.28, '#3a3f47');
    g.addColorStop(0.7, '#14171c');
    g.addColorStop(1, '#050607');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#f6f2e7');
    g.addColorStop(0.88, '#d8d0bd');
    g.addColorStop(1, '#b9b09b');
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // 边缘细线
  ctx.lineWidth = Math.max(0.8, r * 0.04);
  ctx.strokeStyle = color === 'black' ? 'rgba(0,0,0,0.6)' : 'rgba(120,108,84,0.55)';
  ctx.stroke();

  // 高光（椭圆，贴合球面）
  ctx.save();
  ctx.translate(x - r * 0.33, y - r * 0.4);
  ctx.rotate(-0.7);
  ctx.scale(1, 0.55);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = color === 'black' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** 象棋 / 军棋等圆形木质棋子：带投影、立体边、内圈与刻字凹痕 */
export function discPiece(ctx, cx, cy, r, tone, label, labelSize) {
  const red = tone === 'red';
  const ink = red ? '#b02c1c' : '#1d2026';
  ctx.save();
  // 投影
  ctx.shadowColor = 'rgba(30,16,4,0.5)';
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.16;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#c9a56e';
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // 棋子侧面（厚度）
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.06, r, 0, Math.PI * 2);
  ctx.fillStyle = '#a97f45';
  ctx.fill();

  // 顶面
  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#fff8e6');
  grad.addColorStop(0.6, '#f3dfb6');
  grad.addColorStop(1, '#dcb985');
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.02, r * 0.97, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = 'rgba(120,80,30,0.55)';
  ctx.stroke();

  // 内圈
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.02, r * 0.78, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.4, r * 0.07);
  ctx.strokeStyle = ink;
  ctx.stroke();

  // 刻字：先压一道高光，再落墨，形成凹痕感
  if (label) {
    pieceText(ctx, label, cx, cy + r * 0.045, r * 1.3, labelSize || r * 1.05, 'rgba(255,255,255,0.75)', 800);
    pieceText(ctx, label, cx, cy - r * 0.01, r * 1.3, labelSize || r * 1.05, ink, 800);
  }
  ctx.restore();
}

/**
 * 国际象棋矢量棋子（不依赖系统字体，各设备外观一致）
 * kind: 1 兵 2 马 3 象 4 车 5 后 6 王；white: 是否白方；cx,cy 为格子中心；size 为格宽
 */
export function chessPiece(ctx, kind, cx, cy, size, white) {
  const fillA = white ? '#fffdf6' : '#5b616c';
  const fillB = white ? '#d8ccb1' : '#15181d';
  const line = white ? '#4a3a22' : '#05070a';

  ctx.save();
  // 落地阴影
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.36, size * 0.3, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,12,4,0.32)';
  ctx.fill();

  ctx.translate(cx, cy);
  ctx.scale(size, size);
  const lw = Math.max(1.3, size * 0.045) / size;

  // 横向渐变：左亮右暗，圆柱体质感
  const body = ctx.createLinearGradient(-0.3, 0, 0.3, 0);
  body.addColorStop(0, fillA);
  body.addColorStop(1, fillB);

  const part = draw => {
    ctx.beginPath();
    draw(ctx);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = line;
    ctx.stroke();
  };
  const base = () => part(c => {
    c.moveTo(-0.3, 0.38);
    c.lineTo(-0.3, 0.31);
    c.quadraticCurveTo(-0.3, 0.27, -0.25, 0.27);
    c.lineTo(0.25, 0.27);
    c.quadraticCurveTo(0.3, 0.27, 0.3, 0.31);
    c.lineTo(0.3, 0.38);
    c.closePath();
  });
  const ball = (x, y, r) => part(c => { c.arc(x, y, r, 0, Math.PI * 2); });
  const collar = (y, hw) => part(c => {
    c.moveTo(-hw, y);
    c.lineTo(hw, y);
    c.lineTo(hw, y + 0.045);
    c.lineTo(-hw, y + 0.045);
    c.closePath();
  });
  const stem = (topY, topHW, botY, botHW) => part(c => {
    c.moveTo(-topHW, topY);
    c.lineTo(topHW, topY);
    c.quadraticCurveTo(botHW * 0.85, (topY + botY) / 2, botHW, botY);
    c.lineTo(-botHW, botY);
    c.quadraticCurveTo(-botHW * 0.85, (topY + botY) / 2, -topHW, topY);
    c.closePath();
  });

  switch (kind) {
    case 1: // 兵
      stem(-0.06, 0.09, 0.27, 0.2);
      collar(-0.1, 0.14);
      ball(0, -0.2, 0.13);
      break;
    case 2: // 马（朝左）
      part(c => {
        c.moveTo(-0.26, 0.27);
        c.quadraticCurveTo(-0.2, 0.0, -0.1, -0.08);
        c.quadraticCurveTo(-0.2, -0.06, -0.3, 0.0);
        c.quadraticCurveTo(-0.37, -0.04, -0.34, -0.12);
        c.quadraticCurveTo(-0.3, -0.24, -0.16, -0.34);
        c.lineTo(-0.1, -0.42);
        c.lineTo(-0.02, -0.35);
        c.quadraticCurveTo(0.22, -0.3, 0.27, 0.0);
        c.quadraticCurveTo(0.3, 0.14, 0.26, 0.27);
        c.closePath();
      });
      base();
      // 眼睛与鼻孔
      ctx.beginPath();
      ctx.arc(-0.12, -0.2, 0.025, 0, Math.PI * 2);
      ctx.fillStyle = line;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-0.31, -0.08, 0.018, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 3: // 象
      stem(0.0, 0.1, 0.27, 0.2);
      collar(-0.02, 0.15);
      part(c => {
        c.moveTo(0, -0.38);
        c.quadraticCurveTo(0.16, -0.22, 0.12, -0.08);
        c.quadraticCurveTo(0.1, -0.02, 0.0, -0.02);
        c.quadraticCurveTo(-0.1, -0.02, -0.12, -0.08);
        c.quadraticCurveTo(-0.16, -0.22, 0, -0.38);
        c.closePath();
      });
      ball(0, -0.41, 0.04);
      // 斜缝
      ctx.beginPath();
      ctx.moveTo(-0.03, -0.2);
      ctx.lineTo(0.07, -0.3);
      ctx.lineWidth = lw * 1.1;
      ctx.strokeStyle = line;
      ctx.stroke();
      break;
    case 4: // 车
      stem(-0.13, 0.17, 0.27, 0.22);
      collar(-0.17, 0.25);
      part(c => {
        c.moveTo(-0.25, -0.17);
        c.lineTo(-0.25, -0.37);
        c.lineTo(-0.15, -0.37);
        c.lineTo(-0.15, -0.31);
        c.lineTo(-0.05, -0.31);
        c.lineTo(-0.05, -0.37);
        c.lineTo(0.05, -0.37);
        c.lineTo(0.05, -0.31);
        c.lineTo(0.15, -0.31);
        c.lineTo(0.15, -0.37);
        c.lineTo(0.25, -0.37);
        c.lineTo(0.25, -0.17);
        c.closePath();
      });
      break;
    case 5: // 后
      stem(-0.05, 0.1, 0.27, 0.22);
      collar(-0.1, 0.17);
      part(c => {
        c.moveTo(-0.24, -0.1);
        c.lineTo(-0.3, -0.34);
        c.lineTo(-0.15, -0.2);
        c.lineTo(-0.08, -0.4);
        c.lineTo(0, -0.22);
        c.lineTo(0.08, -0.4);
        c.lineTo(0.15, -0.2);
        c.lineTo(0.3, -0.34);
        c.lineTo(0.24, -0.1);
        c.closePath();
      });
      ball(-0.3, -0.36, 0.035);
      ball(-0.08, -0.42, 0.035);
      ball(0.08, -0.42, 0.035);
      ball(0.3, -0.36, 0.035);
      break;
    default: // 王
      stem(-0.05, 0.11, 0.27, 0.22);
      collar(-0.1, 0.17);
      part(c => {
        c.moveTo(-0.2, -0.1);
        c.quadraticCurveTo(-0.26, -0.3, -0.06, -0.32);
        c.lineTo(0.06, -0.32);
        c.quadraticCurveTo(0.26, -0.3, 0.2, -0.1);
        c.closePath();
      });
      // 十字
      part(c => {
        c.moveTo(-0.025, -0.34);
        c.lineTo(-0.025, -0.4);
        c.lineTo(-0.075, -0.4);
        c.lineTo(-0.075, -0.45);
        c.lineTo(-0.025, -0.45);
        c.lineTo(-0.025, -0.5);
        c.lineTo(0.025, -0.5);
        c.lineTo(0.025, -0.45);
        c.lineTo(0.075, -0.45);
        c.lineTo(0.075, -0.4);
        c.lineTo(0.025, -0.4);
        c.lineTo(0.025, -0.34);
        c.closePath();
      });
  }
  if (kind !== 2) base();
  else base();
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
