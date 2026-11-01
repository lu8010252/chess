// 落子动画：不改各棋种的绘制，只在「旧画面」和「新画面」之间补一段过渡
//   slide：棋子沿路径从起点滑到终点（途中带轻微抬起和投影）
//   drop ：棋子从上方落到交叉点
// 各棋种通过 moveAnim(state, {w,h}) 告诉这里：路径、半径、（可选）怎么画这枚棋子

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createAnimator(canvas) {
  const oldFrame = document.createElement('canvas'); // 走子前的画面
  const newFrame = document.createElement('canvas'); // 走子后的画面
  let raf = 0;

  const copy = (dst) => {
    dst.width = canvas.width;
    dst.height = canvas.height;
    dst.getContext('2d').drawImage(canvas, 0, 0);
  };

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /** 把当前画布存成「旧画面」（每次画完都调用） */
  function snapshot() {
    copy(oldFrame);
  }

  function clipShape(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'rect') {
      const rr = r * 0.3;
      ctx.roundRect ? ctx.roundRect(x - r, y - r, r * 2, r * 2, rr) : ctx.rect(x - r, y - r, r * 2, r * 2);
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.clip();
  }

  /**
   * 播放一次动画。drawFresh() 负责把「新状态」画到画布上。
   * 返回 false 表示没法做动画（尺寸变了等），此时已经直接画好新画面。
   */
  function play(geo, ms, ctx, cssW, drawFresh) {
    stop();
    if (!geo || oldFrame.width !== canvas.width || oldFrame.height !== canvas.height || !oldFrame.width) {
      drawFresh();
      snapshot();
      return false;
    }
    drawFresh();
    copy(newFrame);

    const k = canvas.width / cssW;
    const pts = geo.path;
    const last = pts[pts.length - 1];
    const r = geo.r;

    // 没有现成的画法时，直接从新画面里截取棋子图像
    let sprite = geo.sprite;
    if (!sprite) {
      const size = Math.ceil(r * 2 * k);
      const crop = document.createElement('canvas');
      crop.width = crop.height = size;
      const cc = crop.getContext('2d');
      cc.save();
      clipShape(cc, geo.shape, size / 2, size / 2, size / 2);
      cc.drawImage(newFrame, (last.x - r) * k, (last.y - r) * k, size, size, 0, 0, size, size);
      cc.restore();
      sprite = (c, x, y) => c.drawImage(crop, x - r, y - r, r * 2, r * 2);
    }

    // 路径累计长度，用来按距离分配时间
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      seg.push(d);
      total += d;
    }

    const t0 = performance.now();
    const frame = now => {
      const t = Math.min(1, (now - t0) / ms);
      const e = ease(t);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(newFrame, 0, 0);

      // 目的地先还原成「走子前」的样子（空格，或被吃的那枚棋子）
      ctx.save();
      clipShape(ctx, geo.shape === 'rect' ? 'rect' : 'circle', last.x * k, last.y * k, r * 1.18 * k);
      ctx.drawImage(oldFrame, 0, 0);
      ctx.restore();

      ctx.setTransform(k, 0, 0, k, 0, 0);
      if (geo.kind === 'drop') {
        const s = 1.4 - 0.4 * e;
        ctx.save();
        ctx.globalAlpha = Math.min(1, e * 1.8);
        ctx.shadowColor = 'rgba(20,12,4,0.35)';
        ctx.shadowBlur = r * (0.8 * (1 - e) + 0.2);
        ctx.shadowOffsetY = r * 0.5 * (1 - e);
        ctx.translate(last.x, last.y - (1 - e) * r * 0.9);
        ctx.scale(s, s);
        sprite(ctx, 0, 0);
        ctx.restore();
      } else {
        // 沿路径取当前位置
        let dist = e * total;
        let x = pts[0].x;
        let y = pts[0].y;
        for (let i = 0; i < seg.length; i++) {
          if (dist <= seg[i] || i === seg.length - 1) {
            const u = seg[i] > 0 ? Math.min(1, dist / seg[i]) : 1;
            x = pts[i].x + (pts[i + 1].x - pts[i].x) * u;
            y = pts[i].y + (pts[i + 1].y - pts[i].y) * u;
            break;
          }
          dist -= seg[i];
        }
        const lift = Math.sin(Math.PI * t);
        ctx.save();
        ctx.shadowColor = 'rgba(20,12,4,0.4)';
        ctx.shadowBlur = r * 0.5 * lift;
        ctx.shadowOffsetY = r * 0.35 * lift;
        ctx.translate(x, y - r * 0.25 * lift);
        ctx.scale(1 + 0.1 * lift, 1 + 0.1 * lift);
        sprite(ctx, 0, 0);
        ctx.restore();
      }
      ctx.restore();

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(newFrame, 0, 0);
        ctx.restore();
        snapshot();
      }
    };
    raf = requestAnimationFrame(frame);
    return true;
  }

  return { play, stop, snapshot, get playing() { return raf !== 0; } };
}
