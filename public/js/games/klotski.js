// 华容道：4×5 棋盘，把曹操（2×2）从棋盘里挪到底部中央的出口
// 单人益智：没有电脑对手，aiMove 仅用来给「提示」和自测（BFS 求最少步数）
import { pushHistory, popHistory, finish, makeSeats } from './_util.js';
import { boardSurface, PALETTE, roundRect } from './_draw.js';

const COLS = 4;
const ROWS = 5;
const KEYS = ['pieces', 'moves', 'over', 'result', 'note', 'lastMove'];

const GEN_NAMES = { G: '关羽', Z: '张飞', Y: '赵云', M: '马超', H: '黄忠' };
const DIRS = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1]
};
const DIR_NAME = { up: '上', down: '下', left: '左', right: '右' };

// 布局：C=曹操 G/Z/Y/M/H=五虎将 s=兵 .=空位；每个字母只出现一组相连的格子
// 一步 = 一个棋子沿直线滑动任意格；steps 是 BFS 算出的最少步数
export const LAYOUTS = [
  { id: 'jinzai', name: '近在咫尺', steps: 1, rows: ['ZGGY', 'ZssY', 'MCCH', 'MCCH', 's..s'] },
  { id: 'tunbing', name: '屯兵天位', steps: 40, rows: ['sCCs', 'sCCs', 'ZGGY', 'ZMHY', '.MH.'] },
  { id: 'qitou', name: '齐头并进', steps: 74, rows: ['CCZY', 'CCZY', 'GGMH', 'ssMH', 'ss..'] },
  { id: 'zhihui', name: '指挥若定', steps: 76, rows: ['ZCCY', 'ZCCY', 'MssH', 'MGGH', 's..s'] },
  { id: 'jiangyong', name: '将拥曹营', steps: 77, rows: ['sCCs', 'ZCCY', 'ZGGY', 'MssH', 'M..H'] },
  { id: 'bingfen', name: '兵分三路', steps: 79, rows: ['ZCCY', 'ZCCY', 'sGGs', 'MssH', 'M..H'] },
  { id: 'hengdao', name: '横刀立马', steps: 90, rows: ['ZCCY', 'ZCCY', 'MGGH', 'MssH', 's..s'] }
];

export const meta = {
  id: 'klotski',
  name: '华容道',
  en: 'Klotski',
  tag: '曹操逃出华容道',
  goal: '在 4×5 的棋盘里，只靠滑动棋子，把红色的曹操（2×2）从上方一路挪到底部中央的出口。步数越少越好。',
  seatNames: ['玩家'],
  seatColors: ['#c0392b'],
  aspect: 0.8,
  seats: 1,
  solo: true,
  variants: LAYOUTS.map(l => ({ id: l.id, label: l.name, desc: l.steps ? `最少 ${l.steps} 步` : '' })),
  rules: [
    { h: '目标', p: '棋盘底部中央有一个出口。把最大的红色方块「曹操」移到出口位置（它的下沿贴着棋盘底边、左右居中），就算过关。' },
    { h: '怎么走', p: '点一下棋子选中它，再点它前面的空位，棋子就滑过去；也可以直接在棋子上向想去的方向拖动一下，拖得越远滑得越远。' },
    { h: '规则', p: '棋子只能沿直线上下左右滑动，不能斜着走，也不能转弯、不能跳过别的棋子。一个棋子沿同一方向一次滑几格都只算一步。' },
    { h: '棋子', p: '曹操 2×2；关羽、张飞、赵云、马超、黄忠是五虎将，各占两格（一横或一竖）；四个小兵各占一格。' },
    { h: '关卡', p: '开局可以选不同的布阵：从几步就能过关的「近在咫尺」，到要绕将近一百步的「横刀立马」，难度从易到难排列。' },
    { h: '提示与悔棋', p: '走进死胡同了就点「提示」，会告诉你下一步怎么走（并给出最少还需要几步）；也可以随时悔棋、重开。' }
  ],
  tips: [
    '先别急着挪曹操：它的出路被堵住时，要先把挡路的棋子一个个让开，空位是最宝贵的资源。',
    '两个空位挨在一起时，能让「兵」拐弯、让横着的棋子竖起来，局面就活了。',
    '小兵最灵活，常常用来在空位之间「搬运」，别把它们都困在角落。',
    '遇到走不通的局面，退几步重新想，别硬挤。',
    '想挑战极限就看提示里的「最少步数」，试试能不能一步不多地过关。'
  ]
};

/* ---------------- 状态与布局解析 ---------------- */

function layoutOf(id) {
  return LAYOUTS.find(l => l.id === id) || LAYOUTS[0];
}

export function parseLayout(rows) {
  const pieces = [];
  const seen = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      if (ch === 's') {
        pieces.push({ k: 's', name: '兵', r, c, w: 1, h: 1 });
        continue;
      }
      if (seen[ch]) continue;
      seen[ch] = true;
      let r1 = r, c1 = c;
      for (let rr = 0; rr < ROWS; rr++) {
        for (let cc = 0; cc < COLS; cc++) {
          if (rows[rr][cc] === ch) {
            if (rr > r1) r1 = rr;
            if (cc > c1) c1 = cc;
          }
        }
      }
      pieces.push({
        k: ch === 'C' ? 'cao' : 'g',
        name: ch === 'C' ? '曹操' : GEN_NAMES[ch],
        r, c, w: c1 - c + 1, h: r1 - r + 1
      });
    }
  }
  return pieces;
}

export function create(opts = {}) {
  const lay = layoutOf(opts.variant);
  const state = {
    id: 'klotski',
    mode: 'pvp',
    level: 2,
    humanSeat: 0,
    turn: 0,
    variant: lay.id,
    pieces: parseLayout(lay.rows),
    moves: 0,
    hints: 0,
    lastMove: null,
    over: false,
    result: null,
    note: '',
    history: [],
    seats: []
  };
  state.seats = makeSeats(state, meta.seatNames);
  return state;
}

export function demo() {
  return create({ variant: 'hengdao' });
}

function occupancy(pieces) {
  const g = new Array(COLS * ROWS).fill(-1);
  pieces.forEach((p, i) => {
    for (let dr = 0; dr < p.h; dr++) {
      for (let dc = 0; dc < p.w; dc++) g[(p.r + dr) * COLS + p.c + dc] = i;
    }
  });
  return g;
}

/** 某个棋子朝 dir 方向最多能滑几格 */
function slideRange(pieces, idx, dir, occ = occupancy(pieces)) {
  const p = pieces[idx];
  const [dr, dc] = DIRS[dir];
  let n = 0;
  for (;;) {
    n++;
    for (let a = 0; a < p.h; a++) {
      for (let b = 0; b < p.w; b++) {
        const r = p.r + a + dr * n;
        const c = p.c + b + dc * n;
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return n - 1;
        const o = occ[r * COLS + c];
        if (o !== -1 && o !== idx) return n - 1;
      }
    }
  }
}

const isGoalPieces = pieces => pieces.some(p => p.k === 'cao' && p.r === ROWS - 2 && p.c === 1);

/* ---------------- 走子 ---------------- */

export function applyMove(state, move) {
  if (!move || state.over) return false;
  const p = state.pieces[move.p];
  if (!p || !DIRS[move.dir]) return false;
  const n = Number(move.n) || 1;
  const k = slideRange(state.pieces, move.p, move.dir);
  if (n < 1 || n > k) return false;

  pushHistory(state, KEYS);
  const [dr, dc] = DIRS[move.dir];
  p.r += dr * n;
  p.c += dc * n;
  state.moves++;
  state.lastMove = { p: move.p, dir: move.dir, n };
  state.note = '';
  state.ui = { sel: move.p };

  if (isGoalPieces(state.pieces)) {
    finish(state, 0, `过关！曹操逃出华容道，用了 ${state.moves} 步`, `${state.moves} 步`);
    state.ui = undefined;
  }
  return true;
}

/** 点中的空格 (r,c)：选中的棋子往哪个方向滑几格才能盖住它 */
function moveToward(state, idx, r, c) {
  const p = state.pieces[idx];
  const occ = occupancy(state.pieces);
  for (const dir of Object.keys(DIRS)) {
    const k = slideRange(state.pieces, idx, dir, occ);
    for (let n = 1; n <= k; n++) {
      if (dir === 'right' && c === p.c + p.w - 1 + n && r >= p.r && r < p.r + p.h) return { p: idx, dir, n };
      if (dir === 'left' && c === p.c - n && r >= p.r && r < p.r + p.h) return { p: idx, dir, n };
      if (dir === 'down' && r === p.r + p.h - 1 + n && c >= p.c && c < p.c + p.w) return { p: idx, dir, n };
      if (dir === 'up' && r === p.r - n && c >= p.c && c < p.c + p.w) return { p: idx, dir, n };
    }
  }
  return null;
}

function layout(w, h) {
  const padX = w * 0.06;
  const padTop = h * 0.05;
  const padBottom = h * 0.1;
  const cell = Math.min((w - padX * 2) / COLS, (h - padTop - padBottom) / ROWS);
  return {
    cell,
    x0: (w - cell * COLS) / 2,
    y0: padTop + ((h - padTop - padBottom) - cell * ROWS) / 2
  };
}

export function tap(state, pt) {
  if (state.over) return { ok: false, msg: '已经过关啦，点「再来一局」换一关' };
  const L = layout(pt.w, pt.h);
  const c = Math.floor((pt.x - L.x0) / L.cell);
  const r = Math.floor((pt.y - L.y0) / L.cell);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) {
    if (state.ui) state.ui = undefined;
    return { ok: true, moved: false };
  }
  const occ = occupancy(state.pieces);
  const idx = occ[r * COLS + c];
  const sel = state.ui ? state.ui.sel : undefined;
  if (idx >= 0) {
    if (idx === sel) {
      state.ui = undefined;
      return { ok: true, moved: false };
    }
    state.ui = { sel: idx };
    const can = Object.keys(DIRS).some(d => slideRange(state.pieces, idx, d, occ) > 0);
    return can ? { ok: true, moved: false } : { ok: false, msg: '这块棋子被围住了，先挪开周围的棋子' };
  }
  if (sel === undefined) return { ok: false, msg: '先点一个棋子，再点它旁边的空位' };
  const mv = moveToward(state, sel, r, c);
  if (!mv) return { ok: false, msg: '这块棋子过不去，换个方向试试' };
  const ok = applyMove(state, mv);
  return { ok, moved: ok };
}

/** 在棋子上拖动：pt 里带起点 x、y 和位移 dx、dy */
export function swipe(state, dir, pt) {
  if (state.over) return { ok: false, msg: '已经过关啦，点「再来一局」换一关' };
  if (!DIRS[dir]) return { ok: true, moved: false };
  const L = layout(pt.w, pt.h);
  const c = Math.floor((pt.x - L.x0) / L.cell);
  const r = Math.floor((pt.y - L.y0) / L.cell);
  let idx = -1;
  if (c >= 0 && c < COLS && r >= 0 && r < ROWS) idx = occupancy(state.pieces)[r * COLS + c];
  if (idx < 0 && state.ui && state.ui.sel !== undefined) idx = state.ui.sel;
  if (idx < 0) return { ok: true, moved: false };
  const k = slideRange(state.pieces, idx, dir);
  if (k < 1) {
    state.ui = { sel: idx };
    return { ok: false, msg: '这块棋子往这边动不了' };
  }
  const dist = Math.max(Math.abs(pt.dx || 0), Math.abs(pt.dy || 0));
  const n = Math.min(k, Math.max(1, Math.round(dist / L.cell)));
  const ok = applyMove(state, { p: idx, dir, n });
  return { ok, moved: ok };
}

export function undo(state) {
  return popHistory(state, KEYS);
}

/* ---------------- 求解（BFS，同形棋子视为相同） ---------------- */

function typeCode(p) {
  if (p.k === 'cao') return 'C';
  if (p.k === 's') return 's';
  return p.w === 2 ? 'H' : 'V';
}

function keyOf(pieces) {
  const g = new Array(COLS * ROWS).fill('.');
  for (const p of pieces) {
    const t = typeCode(p);
    for (let a = 0; a < p.h; a++) for (let b = 0; b < p.w; b++) g[(p.r + a) * COLS + p.c + b] = t;
  }
  return g;
}

const SIZE = { C: [2, 2], H: [2, 1], V: [1, 2], s: [1, 1] };

function decode(g) {
  const used = new Array(g.length).fill(false);
  const out = [];
  for (let i = 0; i < g.length; i++) {
    if (used[i] || g[i] === '.') continue;
    const t = g[i];
    const [w, h] = SIZE[t];
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) used[(r + a) * COLS + c + b] = true;
    out.push({ t, r, c, w, h });
  }
  return out;
}

/**
 * 从当前局面求最少步的走法列表，每步 {r,c,w,h,dir,n}（r、c 是该棋子走之前的左上角）；
 * 已在终点返回 []；无解返回 null
 */
export function solve(state) {
  const start = keyOf(state.pieces);
  const startKey = start.join('');
  const goal = g => g[(ROWS - 2) * COLS + 1] === 'C' && g[(ROWS - 2) * COLS + 2] === 'C'
    && g[(ROWS - 1) * COLS + 1] === 'C' && g[(ROWS - 1) * COLS + 2] === 'C';
  if (goal(start)) return [];

  const prev = new Map();
  prev.set(startKey, null);
  let frontier = [startKey];
  while (frontier.length) {
    const next = [];
    for (const key of frontier) {
      const g = key.split('');
      for (const p of decode(g)) {
        for (const dir of Object.keys(DIRS)) {
          const [dr, dc] = DIRS[dir];
          for (let n = 1; ; n++) {
            let free = true;
            for (let a = 0; a < p.h && free; a++) {
              for (let b = 0; b < p.w && free; b++) {
                const r = p.r + a + dr * n;
                const c = p.c + b + dc * n;
                if (r < 0 || c < 0 || r >= ROWS || c >= COLS) { free = false; break; }
                const cur = g[r * COLS + c];
                const inside = r >= p.r && r < p.r + p.h && c >= p.c && c < p.c + p.w;
                if (cur !== '.' && !inside) free = false;
              }
            }
            if (!free) break;
            const ng = g.slice();
            for (let a = 0; a < p.h; a++) for (let b = 0; b < p.w; b++) ng[(p.r + a) * COLS + p.c + b] = '.';
            for (let a = 0; a < p.h; a++) for (let b = 0; b < p.w; b++) ng[(p.r + a + dr * n) * COLS + p.c + b + dc * n] = p.t;
            const nk = ng.join('');
            if (prev.has(nk)) continue;
            prev.set(nk, { from: key, mv: { r: p.r, c: p.c, w: p.w, h: p.h, dir, n } });
            if (goal(ng)) {
              const path = [];
              let cur = nk;
              while (prev.get(cur)) {
                const e = prev.get(cur);
                path.push(e.mv);
                cur = e.from;
              }
              return path.reverse();
            }
            next.push(nk);
          }
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** 把求解得到的走法（按左上角定位）转成当前局面里的 {p,dir,n} */
export function toMove(state, mv) {
  const p = state.pieces.findIndex(q => q.r === mv.r && q.c === mv.c && q.w === mv.w && q.h === mv.h);
  return p < 0 ? null : { p, dir: mv.dir, n: mv.n };
}

export function aiMove(state) {
  const path = solve(state);
  if (!path || !path.length) return null;
  return toMove(state, path[0]);
}

/* ---------------- 按钮 / 座位信息 ---------------- */

export function actions(state) {
  return state.over ? [] : [{ id: 'hint', label: '提示' }];
}

export function action(state, id) {
  if (id !== 'hint' || state.over) return null;
  const path = solve(state);
  if (!path || !path.length) return { ok: false, msg: '这个局面已经没有可走的了，请悔棋' };
  const mv = toMove(state, path[0]);
  if (!mv) return { ok: false, msg: '提示计算失败' };
  const piece = state.pieces[mv.p];
  state.hints = (state.hints || 0) + 1;
  state.ui = { sel: mv.p, hint: mv };
  state.note = `提示：把「${piece.name}」向${DIR_NAME[mv.dir]}滑 ${mv.n} 格（从这里最少还要 ${path.length} 步）`;
  return { ok: true, moved: false };
}

export function seatInfo(state) {
  return `步数 ${state.moves}`;
}

export function cursorPoints(state, g) {
  const L = layout(g.w, g.h);
  const occ = occupancy(state.pieces);
  const pts = [];
  state.pieces.forEach(p => {
    pts.push({
      x: L.x0 + (p.c + p.w / 2) * L.cell,
      y: L.y0 + (p.r + p.h / 2) * L.cell,
      r: L.cell * 0.42
    });
  });
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (occ[r * COLS + c] === -1) {
        pts.push({ x: L.x0 + (c + 0.5) * L.cell, y: L.y0 + (r + 0.5) * L.cell, r: L.cell * 0.32 });
      }
    }
  }
  return pts;
}

/* ---------------- 绘制 ---------------- */

const COLORS = {
  曹操: ['#ef5a50', '#b02a25', '#ffe9a8'],
  关羽: ['#58b974', '#2c7a48', '#f4ffe9'],
  张飞: ['#566073', '#262b36', '#f1f3f8'],
  赵云: ['#f4f7fb', '#b9c5d8', '#2a3550'],
  马超: ['#79aef0', '#3a69b5', '#ffffff'],
  黄忠: ['#e6b455', '#a97620', '#fff8e6'],
  兵: ['#d6c29a', '#a08758', '#4a3a1c']
};

const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

function drawPiece(ctx, L, p, selected) {
  const gap = Math.max(2, L.cell * 0.045);
  const x = L.x0 + p.c * L.cell + gap;
  const y = L.y0 + p.r * L.cell + gap;
  const w = p.w * L.cell - gap * 2;
  const h = p.h * L.cell - gap * 2;
  const col = COLORS[p.name] || COLORS.兵;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = L.cell * 0.12;
  ctx.shadowOffsetY = L.cell * 0.04;
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, col[0]);
  grad.addColorStop(1, col[1]);
  roundRect(ctx, x, y, w, h, L.cell * 0.14);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // 高光边
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, L.cell * 0.12);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = Math.max(1, L.cell * 0.02);
  ctx.stroke();

  // 文字
  ctx.save();
  ctx.fillStyle = col[2];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (p.k === 'cao') {
    ctx.font = `800 ${L.cell * 0.78}px ${FONT}`;
    ctx.fillText('曹', cx - L.cell * 0.45, cy + L.cell * 0.03);
    ctx.fillText('操', cx + L.cell * 0.45, cy + L.cell * 0.03);
  } else if (p.k === 's') {
    ctx.font = `800 ${L.cell * 0.46}px ${FONT}`;
    ctx.fillText('兵', cx, cy + L.cell * 0.02);
  } else if (p.w === 2) {
    ctx.font = `800 ${L.cell * 0.6}px ${FONT}`;
    ctx.fillText(p.name[0], cx - L.cell * 0.36, cy + L.cell * 0.03);
    ctx.fillText(p.name[1], cx + L.cell * 0.36, cy + L.cell * 0.03);
  } else {
    ctx.font = `800 ${L.cell * 0.6}px ${FONT}`;
    ctx.fillText(p.name[0], cx, cy - L.cell * 0.4);
    ctx.fillText(p.name[1], cx, cy + L.cell * 0.4);
  }
  ctx.restore();

  if (selected) {
    roundRect(ctx, x - 1, y - 1, w + 2, h + 2, L.cell * 0.15);
    ctx.strokeStyle = 'rgba(255,214,110,0.98)';
    ctx.lineWidth = Math.max(3, L.cell * 0.06);
    ctx.shadowColor = 'rgba(255,200,80,0.9)';
    ctx.shadowBlur = L.cell * 0.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

export function draw(ctx, state, g) {
  const { w, h } = g;
  boardSurface(ctx, w, h, PALETTE.wood);
  const L = layout(w, h);
  const bx = L.x0 - L.cell * 0.08;
  const by = L.y0 - L.cell * 0.08;
  const bw = L.cell * COLS + L.cell * 0.16;
  const bh = L.cell * ROWS + L.cell * 0.16;

  // 深色棋槽
  roundRect(ctx, bx, by, bw, bh, L.cell * 0.18);
  ctx.fillStyle = '#2b1d12';
  ctx.fill();
  // 空格凹槽
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      roundRect(ctx, L.x0 + c * L.cell + 2, L.y0 + r * L.cell + 2, L.cell - 4, L.cell - 4, L.cell * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fill();
    }
  }
  // 出口：底边中间开一个口，写上「出口」
  ctx.fillStyle = '#e8c088';
  ctx.fillRect(L.x0 + L.cell * 1 + 2, by + bh - L.cell * 0.12, L.cell * 2 - 4, L.cell * 0.2);
  ctx.save();
  ctx.fillStyle = 'rgba(70,40,10,0.85)';
  ctx.font = `700 ${Math.max(11, L.cell * 0.22)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('▼ 出口 ▼', w / 2, by + bh + (h - by - bh) * 0.48);
  ctx.restore();

  const sel = state.ui ? state.ui.sel : undefined;
  state.pieces.forEach((p, i) => {
    if (i !== sel) drawPiece(ctx, L, p, false);
  });
  if (sel !== undefined && state.pieces[sel]) drawPiece(ctx, L, state.pieces[sel], true);

  // 提示：在目的地画一圈虚线框和箭头
  const hint = state.ui && state.ui.hint;
  if (hint && state.pieces[hint.p] && !state.over) {
    const p = state.pieces[hint.p];
    const [dr, dc] = DIRS[hint.dir];
    const tx = L.x0 + (p.c + dc * hint.n) * L.cell;
    const ty = L.y0 + (p.r + dr * hint.n) * L.cell;
    ctx.save();
    ctx.setLineDash([L.cell * 0.14, L.cell * 0.1]);
    ctx.lineWidth = Math.max(2.5, L.cell * 0.05);
    ctx.strokeStyle = 'rgba(255,224,140,0.95)';
    roundRect(ctx, tx + 4, ty + 4, p.w * L.cell - 8, p.h * L.cell - 8, L.cell * 0.14);
    ctx.stroke();
    ctx.setLineDash([]);
    const ax = L.x0 + (p.c + p.w / 2) * L.cell;
    const ay = L.y0 + (p.r + p.h / 2) * L.cell;
    ctx.translate(ax + dc * L.cell * 0.55, ay + dr * L.cell * 0.55);
    ctx.rotate(Math.atan2(dr, dc));
    ctx.fillStyle = 'rgba(255,224,140,0.98)';
    ctx.beginPath();
    ctx.moveTo(L.cell * 0.22, 0);
    ctx.lineTo(-L.cell * 0.14, -L.cell * 0.2);
    ctx.lineTo(-L.cell * 0.14, L.cell * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
