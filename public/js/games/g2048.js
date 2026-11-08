// 2048：滑动合并相同数字，凑出 2048（或更大）
// 单人益智：没有电脑对手，aiMove 仅用来自测
import { pushHistory, popHistory, finish, makeSeats } from './_util.js';
import { roundRect } from './_draw.js';

const KEYS = ['board', 'score', 'won', 'over', 'result', 'note', 'lastMove'];
const DIRS = ['up', 'down', 'left', 'right'];

export const meta = {
  id: 'g2048',
  name: '2048',
  en: '2048',
  tag: '滑动合并，凑出 2048',
  goal: '滑动整个棋盘，让相同数字的方块撞在一起合成更大的数字，努力凑出 2048。棋盘被填满又无法合并时游戏结束。',
  seatNames: ['玩家'],
  seatColors: ['#edc22e'],
  aspect: 1,
  seats: 1,
  solo: true,
  swipeKeys: true,
  variants: [
    { id: '4', label: '经典 4×4', desc: '目标 2048' },
    { id: '5', label: '宽松 5×5', desc: '地方大，目标 4096' },
    { id: '3', label: '迷你 3×3', desc: '目标 512' }
  ],
  rules: [
    { h: '怎么玩', p: '在棋盘上向上、下、左、右滑动手指（电脑上用键盘方向键），所有方块会一起朝那个方向滑到底。' },
    { h: '合并', p: '两个数字相同的方块撞在一起，会合成一个，数字翻倍（2+2=4，4+4=8……），合成得到的数字就是你的得分。每次滑动，一个方块最多合并一次。' },
    { h: '新方块', p: '每次有效滑动之后，棋盘空位上会随机冒出一个新方块，大多是 2，偶尔是 4。' },
    { h: '目标', p: '经典玩法凑出 2048 就算达成目标（宽松 5×5 的目标是 4096，迷你 3×3 是 512），达成之后还可以继续往更高冲。' },
    { h: '结束', p: '棋盘被填满，并且任何方向都没有相同的方块可以合并时，游戏结束。' }
  ],
  tips: [
    '把最大的数字固定在一个角落，比如左下角，并且尽量只用两个方向（比如左和下）来滑。',
    '让大数字排成一整行，旁边留着小数字，这样它们能一路连环合并。',
    '尽量别往“角落相反”的方向滑，那样最大的数字容易被挤出角落。',
    '实在没办法时才用第三个方向；先想想这一步之后新方块可能出现在哪里。',
    '想拿高分可以悔棋：滑错了不要紧，点「悔棋」退回上一步。'
  ]
};

function sizeOf(variant) {
  return variant === '5' ? 5 : variant === '3' ? 3 : 4;
}

function targetOf(n) {
  return n === 5 ? 4096 : n === 3 ? 512 : 2048;
}

function bestKey(n) {
  return `qige.best.g2048.${n}`;
}

function readBest(n) {
  try {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem(bestKey(n))) || 0;
  } catch {
    return 0;
  }
}

function writeBest(n, v) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(bestKey(n), String(v));
  } catch {}
}

function spawn(state) {
  const empty = [];
  for (let i = 0; i < state.board.length; i++) if (!state.board[i]) empty.push(i);
  if (!empty.length) return -1;
  const i = empty[Math.floor(Math.random() * empty.length)];
  state.board[i] = Math.random() < 0.9 ? 2 : 4;
  return i;
}

export function create(opts = {}) {
  const n = sizeOf(opts.variant);
  const state = {
    id: 'g2048',
    mode: 'pvp',
    level: 2,
    humanSeat: 0,
    turn: 0,
    variant: String(n),
    n,
    target: targetOf(n),
    board: new Array(n * n).fill(0),
    score: 0,
    best: readBest(n),
    won: false,
    lastMove: null,
    over: false,
    result: null,
    note: '',
    history: [],
    seats: []
  };
  state.seats = makeSeats(state, meta.seatNames);
  spawn(state);
  spawn(state);
  return state;
}

export function demo() {
  const s = create({ variant: '4' });
  const v = [
    2, 4, 8, 16,
    4, 8, 16, 32,
    8, 16, 64, 128,
    2, 4, 256, 1024
  ];
  s.board = v.slice();
  s.score = 4096;
  s.lastMove = null;
  return s;
}

/* ---------------- 滑动 ---------------- */

function slideLine(line) {
  const vals = line.filter(v => v);
  const out = [];
  const merged = [];
  let gain = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2);
      gain += vals[i] * 2;
      merged.push(out.length - 1);
      i++;
    } else {
      out.push(vals[i]);
    }
  }
  while (out.length < line.length) out.push(0);
  return { out, gain, merged };
}

/** 朝 dir 滑动整个棋盘，返回新棋盘、得分增量、合并出的格子、是否有变化 */
export function slide(board, n, dir) {
  const next = board.slice();
  let gain = 0;
  const merged = [];
  let moved = false;
  for (let k = 0; k < n; k++) {
    const idxs = [];
    for (let j = 0; j < n; j++) {
      if (dir === 'left') idxs.push(k * n + j);
      else if (dir === 'right') idxs.push(k * n + (n - 1 - j));
      else if (dir === 'up') idxs.push(j * n + k);
      else idxs.push((n - 1 - j) * n + k);
    }
    const res = slideLine(idxs.map(i => board[i]));
    gain += res.gain;
    res.out.forEach((v, j) => {
      if (next[idxs[j]] !== v) moved = true;
      next[idxs[j]] = v;
    });
    res.merged.forEach(j => merged.push(idxs[j]));
  }
  return { board: next, gain, merged, moved };
}

function canMove(board, n) {
  for (const d of DIRS) if (slide(board, n, d).moved) return true;
  return false;
}

export function applyMove(state, move) {
  if (!move || state.over || DIRS.indexOf(move.dir) < 0) return false;
  const res = slide(state.board, state.n, move.dir);
  if (!res.moved) return false;

  pushHistory(state, KEYS);
  state.board = res.board;
  state.score += res.gain;
  state.note = '';
  const at = spawn(state);
  state.lastMove = { spawn: at, merged: res.merged, dir: move.dir };

  if (state.score > state.best) {
    state.best = state.score;
    writeBest(state.n, state.best);
  }
  let top = 0;
  for (const v of state.board) if (v > top) top = v;
  if (!state.won && top >= state.target) {
    state.won = true;
    state.note = `太棒了，合成了 ${state.target}！可以继续往更高冲`;
  }
  if (!canMove(state.board, state.n)) {
    finish(state, 0, `游戏结束，得分 ${state.score}`, `最大方块 ${top}`);
  }
  return true;
}

export function swipe(state, dir) {
  if (state.over) return { ok: false, msg: '游戏结束了，点「再来一局」重新开始' };
  const ok = applyMove(state, { dir });
  return { ok: true, moved: ok };
}

export function tap(state) {
  if (state.over) return { ok: false, msg: '游戏结束了，点「再来一局」重新开始' };
  return { ok: true, moved: false };
}

export function undo(state) {
  return popHistory(state, KEYS);
}

export function actions() {
  return [];
}

export function seatInfo(state) {
  return `得分 ${state.score} · 最高 ${Math.max(state.best, state.score)}`;
}

/** 简单贪心：选能得最多分、留最多空位的方向（仅用于自测） */
export function aiMove(state) {
  let best = null;
  let bs = -Infinity;
  for (const d of DIRS) {
    const r = slide(state.board, state.n, d);
    if (!r.moved) continue;
    let empty = 0;
    for (const v of r.board) if (!v) empty++;
    const s = r.gain * 2 + empty * 3 + Math.random();
    if (s > bs) {
      bs = s;
      best = { dir: d };
    }
  }
  return best;
}

/* ---------------- 绘制 ---------------- */

const TILE = {
  2: ['#eee4da', '#776e65'],
  4: ['#ede0c8', '#776e65'],
  8: ['#f2b179', '#f9f6f2'],
  16: ['#f59563', '#f9f6f2'],
  32: ['#f67c5f', '#f9f6f2'],
  64: ['#f65e3b', '#f9f6f2'],
  128: ['#edcf72', '#f9f6f2'],
  256: ['#edcc61', '#f9f6f2'],
  512: ['#edc850', '#f9f6f2'],
  1024: ['#edc53f', '#f9f6f2'],
  2048: ['#edc22e', '#f9f6f2'],
  4096: ['#3c3a32', '#f9f6f2']
};

const FONT = '"Clear Sans", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

function layout(w, h, n) {
  const side = Math.min(w, h);
  const pad = side * 0.04;
  const gap = side * (n === 5 ? 0.022 : 0.03);
  const inner = side - pad * 2;
  const cell = (inner - gap * (n - 1)) / n;
  return { x0: (w - side) / 2 + pad, y0: (h - side) / 2 + pad, cell, gap, side, pad };
}

export function draw(ctx, state, g) {
  const { w, h } = g;
  const n = state.n;
  const L = layout(w, h, n);

  // 背景
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#2a2118');
  bg.addColorStop(1, '#1b1510');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const bx = L.x0 - L.pad;
  const by = L.y0 - L.pad;
  roundRect(ctx, bx, by, L.side, L.side, L.side * 0.03);
  ctx.fillStyle = '#bbada0';
  ctx.fill();

  const pos = i => ({
    x: L.x0 + (i % n) * (L.cell + L.gap),
    y: L.y0 + Math.floor(i / n) * (L.cell + L.gap)
  });

  for (let i = 0; i < n * n; i++) {
    const p = pos(i);
    roundRect(ctx, p.x, p.y, L.cell, L.cell, L.cell * 0.08);
    ctx.fillStyle = 'rgba(238,228,218,0.35)';
    ctx.fill();
  }

  const lm = state.lastMove || {};
  for (let i = 0; i < n * n; i++) {
    const v = state.board[i];
    if (!v) continue;
    const p = pos(i);
    const col = TILE[v] || ['#3c3a32', '#f9f6f2'];
    roundRect(ctx, p.x, p.y, L.cell, L.cell, L.cell * 0.08);
    ctx.fillStyle = col[0];
    ctx.fill();
    if (v >= 128) {
      ctx.save();
      ctx.shadowColor = 'rgba(243,215,116,0.55)';
      ctx.shadowBlur = L.cell * 0.18;
      ctx.fill();
      ctx.restore();
    }
    // 新方块画一圈亮边，合并出来的画一圈白边
    const isNew = lm.spawn === i;
    const isMerged = lm.merged && lm.merged.indexOf(i) >= 0;
    if (isNew || isMerged) {
      roundRect(ctx, p.x + 1.5, p.y + 1.5, L.cell - 3, L.cell - 3, L.cell * 0.07);
      ctx.strokeStyle = isNew ? 'rgba(255,214,110,0.95)' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(2, L.cell * 0.035);
      ctx.stroke();
    }

    const digits = String(v).length;
    const size = L.cell * (digits <= 2 ? 0.5 : digits === 3 ? 0.42 : digits === 4 ? 0.34 : 0.27);
    ctx.fillStyle = col[1];
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(v), p.x + L.cell / 2, p.y + L.cell / 2 + size * 0.04);
  }
}
