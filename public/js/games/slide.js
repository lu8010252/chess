// 数字华容道：滑动方块，把数字按 1、2、3… 的顺序排好（空格在右下角）
// 单人益智：没有电脑对手，aiMove 仅用来自测
import { pushHistory, popHistory, finish, makeSeats } from './_util.js';
import { roundRect } from './_draw.js';

const KEYS = ['tiles', 'moves', 'over', 'result', 'note', 'lastMove'];
const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

export const meta = {
  id: 'slide',
  name: '数字华容道',
  en: 'Sliding Puzzle',
  tag: '滑动方块，按 1、2、3… 排好',
  goal: '棋盘上的数字方块被打乱了，只有一个空格。不断把方块滑进空格，最后让数字从左到右、从上到下依次排好，空格留在右下角。',
  seatNames: ['玩家'],
  seatColors: ['#d9a64a'],
  aspect: 1,
  seats: 1,
  solo: true,
  variants: [
    { id: '3', label: '3×3 入门', desc: '八数码，8 个方块' },
    { id: '4', label: '4×4 经典', desc: '十五数码，15 个方块' },
    { id: '5', label: '5×5 挑战', desc: '二十四数码，24 个方块' }
  ],
  rules: [
    { h: '目标', p: '把方块按 1、2、3… 的顺序，从左到右、从上到下排好，最后一格（右下角）留作空格。' },
    { h: '怎么走', p: '点一个和空格在同一行或同一列的方块，它（连同它和空格之间的方块）会一起向空格那边滑一格；也可以直接朝空格的方向拖动方块。' },
    { h: '不能做的事', p: '不能拿起方块，也不能把方块斜着挪。每次都是整行或整列的方块平移。' },
    { h: '一定有解', p: '每一局都是从排好的状态随机滑乱得到的，所以一定能还原，只是看你要多少步。' },
    { h: '计步', p: '一次点击（一次滑动）算一步，步数越少越厉害。' }
  ],
  tips: [
    '别一个一个乱凑：先排好第一行，再排好第一列，剩下的区域越来越小，越来越好办。',
    '排每一行的最后两个数字时，要“转着圈”送进去，先把第 3 个放到第 4 个的位置，再绕回去。',
    '已经排好的方块尽量别再碰，每次破坏都要花很多步才能补回来。',
    '走进死胡同就悔棋，倒回去几步重新想。'
  ]
};

function sizeOf(variant) {
  return variant === '5' ? 5 : variant === '3' ? 3 : 4;
}

function solved(tiles) {
  for (let i = 0; i < tiles.length - 1; i++) if (tiles[i] !== i + 1) return false;
  return tiles[tiles.length - 1] === 0;
}

/** 从排好的状态随机滑若干步（不立刻走回头路），一定有解 */
function scramble(n) {
  const tiles = [];
  for (let i = 1; i < n * n; i++) tiles.push(i);
  tiles.push(0);
  let blank = n * n - 1;
  let last = -1;
  const steps = n === 3 ? 120 : n === 4 ? 320 : 700;
  for (let s = 0; s < steps || solved(tiles); s++) {
    const r = Math.floor(blank / n);
    const c = blank % n;
    const cand = [];
    if (r > 0) cand.push(blank - n);
    if (r < n - 1) cand.push(blank + n);
    if (c > 0) cand.push(blank - 1);
    if (c < n - 1) cand.push(blank + 1);
    const opts = cand.filter(i => i !== last);
    const pick = opts[Math.floor(Math.random() * opts.length)];
    tiles[blank] = tiles[pick];
    tiles[pick] = 0;
    last = blank;
    blank = pick;
  }
  return tiles;
}

export function create(opts = {}) {
  const n = sizeOf(opts.variant);
  const state = {
    id: 'slide',
    mode: 'pvp',
    level: 2,
    humanSeat: 0,
    turn: 0,
    variant: String(n),
    n,
    tiles: scramble(n),
    moves: 0,
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
  const s = create({ variant: '4' });
  s.tiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0, 14, 15];
  s.moves = 0;
  return s;
}

/**
 * 点中下标 i 的方块：它必须和空格同行或同列，
 * 返回这一步之后的新 tiles（整段方块朝空格平移一格），不符合返回 null
 */
function shift(tiles, n, i) {
  const blank = tiles.indexOf(0);
  if (i === blank || i < 0 || i >= tiles.length) return null;
  const ir = Math.floor(i / n), ic = i % n;
  const br = Math.floor(blank / n), bc = blank % n;
  if (ir !== br && ic !== bc) return null;
  const next = tiles.slice();
  const step = ir === br ? (bc > ic ? 1 : -1) : (br > ir ? n : -n);
  let cur = blank;
  while (cur !== i) {
    next[cur] = next[cur - step];
    cur -= step;
  }
  next[i] = 0;
  return next;
}

export function applyMove(state, move) {
  if (!move || state.over) return false;
  const next = shift(state.tiles, state.n, move.i);
  if (!next) return false;
  pushHistory(state, KEYS);
  state.tiles = next;
  state.moves++;
  state.lastMove = { i: move.i };
  state.note = '';
  if (solved(state.tiles)) {
    finish(state, 0, `拼好啦！一共用了 ${state.moves} 步`, `${state.moves} 步`);
  }
  return true;
}

function layout(w, h, n) {
  const side = Math.min(w, h);
  const pad = side * 0.04;
  const gap = side * (n === 5 ? 0.02 : n === 4 ? 0.026 : 0.034);
  const cell = (side - pad * 2 - gap * (n - 1)) / n;
  return { x0: (w - side) / 2 + pad, y0: (h - side) / 2 + pad, cell, gap, side, pad };
}

function cellAt(L, n, x, y) {
  const step = L.cell + L.gap;
  const c = Math.floor((x - L.x0 + L.gap / 2) / step);
  const r = Math.floor((y - L.y0 + L.gap / 2) / step);
  if (c < 0 || r < 0 || c >= n || r >= n) return -1;
  return r * n + c;
}

export function tap(state, pt) {
  if (state.over) return { ok: false, msg: '已经拼好啦，点「再来一局」重新开始' };
  const L = layout(pt.w, pt.h, state.n);
  const i = cellAt(L, state.n, pt.x, pt.y);
  if (i < 0) return { ok: true, moved: false };
  if (state.tiles[i] === 0) return { ok: false, msg: '点旁边的数字方块，把它滑进空格' };
  if (!shift(state.tiles, state.n, i)) return { ok: false, msg: '这块方块和空格不在同一行或同一列' };
  const ok = applyMove(state, { i });
  return { ok, moved: ok };
}

/** 朝 dir 拖动起点处的方块：空格必须在那个方向上 */
export function swipe(state, dir, pt) {
  if (state.over) return { ok: false, msg: '已经拼好啦，点「再来一局」重新开始' };
  const d = DIRS[dir];
  if (!d) return { ok: true, moved: false };
  const n = state.n;
  const L = layout(pt.w, pt.h, n);
  const i = cellAt(L, n, pt.x, pt.y);
  if (i < 0 || state.tiles[i] === 0) return { ok: true, moved: false };
  const blank = state.tiles.indexOf(0);
  const ir = Math.floor(i / n), ic = i % n;
  const br = Math.floor(blank / n), bc = blank % n;
  const okDir = (d[0] === 0 && ir === br && Math.sign(bc - ic) === d[1])
    || (d[1] === 0 && ic === bc && Math.sign(br - ir) === d[0]);
  if (!okDir) return { ok: false, msg: '这个方向没有空格' };
  const ok = applyMove(state, { i });
  return { ok, moved: ok };
}

export function undo(state) {
  return popHistory(state, KEYS);
}

export function actions() {
  return [];
}

export function seatInfo(state) {
  return `步数 ${state.moves}`;
}

/** 随机选一个合法的滑动（仅用于自测） */
export function aiMove(state) {
  const n = state.n;
  const blank = state.tiles.indexOf(0);
  const cand = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (i === blank) continue;
    const ir = Math.floor(i / n), ic = i % n;
    if (ir === Math.floor(blank / n) || ic === blank % n) cand.push(i);
  }
  if (!cand.length) return null;
  return { i: cand[Math.floor(Math.random() * cand.length)] };
}

export function cursorPoints(state, g) {
  const n = state.n;
  const L = layout(g.w, g.h, n);
  const pts = [];
  for (let i = 0; i < n * n; i++) {
    pts.push({
      x: L.x0 + (i % n) * (L.cell + L.gap) + L.cell / 2,
      y: L.y0 + Math.floor(i / n) * (L.cell + L.gap) + L.cell / 2,
      r: L.cell * 0.44
    });
  }
  return pts;
}

/* ---------------- 绘制 ---------------- */

const FONT = '"Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

export function draw(ctx, state, g) {
  const { w, h } = g;
  const n = state.n;
  const L = layout(w, h, n);

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#2a2118');
  bg.addColorStop(1, '#1b1510');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const bx = L.x0 - L.pad;
  const by = L.y0 - L.pad;
  roundRect(ctx, bx, by, L.side, L.side, L.side * 0.03);
  ctx.fillStyle = '#5a4128';
  ctx.fill();

  const pos = i => ({
    x: L.x0 + (i % n) * (L.cell + L.gap),
    y: L.y0 + Math.floor(i / n) * (L.cell + L.gap)
  });

  for (let i = 0; i < n * n; i++) {
    const p = pos(i);
    roundRect(ctx, p.x, p.y, L.cell, L.cell, L.cell * 0.1);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
  }

  const lastIdx = state.lastMove ? state.lastMove.i : -1;
  for (let i = 0; i < n * n; i++) {
    const v = state.tiles[i];
    if (!v) continue;
    const p = pos(i);
    const home = v === i + 1; // 已经在正确位置
    const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + L.cell);
    if (home) {
      grad.addColorStop(0, '#f2d27a');
      grad.addColorStop(1, '#cf9f3f');
    } else {
      grad.addColorStop(0, '#f1dfbd');
      grad.addColorStop(1, '#d4b583');
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = L.cell * 0.1;
    ctx.shadowOffsetY = L.cell * 0.035;
    roundRect(ctx, p.x, p.y, L.cell, L.cell, L.cell * 0.1);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    roundRect(ctx, p.x + 1.5, p.y + 1.5, L.cell - 3, L.cell - 3, L.cell * 0.09);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, L.cell * 0.02);
    ctx.stroke();

    if (i === lastIdx && !state.over) {
      roundRect(ctx, p.x, p.y, L.cell, L.cell, L.cell * 0.1);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(2, L.cell * 0.03);
      ctx.stroke();
    }

    const size = L.cell * (v >= 10 ? 0.44 : 0.52);
    ctx.fillStyle = home ? '#4a3208' : '#5b4326';
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(v), p.x + L.cell / 2, p.y + L.cell / 2 + size * 0.05);
  }
}
