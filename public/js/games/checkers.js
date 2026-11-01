// 中国跳棋：六角星 121 孔，红方在下、蓝方在上，各 10 子，先全部进入对面营地者胜
import { pushHistory, popHistory, finish, makeSeats, shuffle } from './_util.js';
import { boardSurface, PALETTE, halo, boardLabel } from './_draw.js';

const ROW_LENGTHS = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
const KEYS = ['board', 'turn', 'ply', 'over', 'result', 'note', 'lastMove', 'chain'];

/* ---------------- 几何：三角格坐标（X 放大 2 倍避免小数） ---------------- */

const HOLES = [];               // {x, y, px, py}，px/py 为绘制坐标，初始为格坐标
const COORD = new Map();        // "X,Y" -> index
const ROW_HOLES = [];           // 每行的孔索引
const NEIGHBORS = [];           // 每个孔的相邻孔
const HOME = [];                // 0 红方营地（下方）；1 蓝方营地（上方）

for (let row = 0; row < ROW_LENGTHS.length; row++) {
  const len = ROW_LENGTHS[row];
  const list = [];
  for (let c = 0; c < len; c++) {
    const X = 2 * c - (len - 1);
    const Y = row;
    const index = HOLES.length;
    HOLES.push({ x: X, y: Y, row, col: c, px: 0, py: 0 });
    COORD.set(`${X},${Y}`, index);
    list.push(index);
    if (row <= 3) HOME.push(-1);          // 顶部三角
    else if (row >= 13) HOME.push(-1);    // 底部三角
    else HOME.push(2);                    // 2 表示中盘
  }
  ROW_HOLES.push(list);
}

// 营地标记：0 = 红方营地（底），1 = 蓝方营地（顶）
for (const i of [...ROW_HOLES[0], ...ROW_HOLES[1], ...ROW_HOLES[2], ...ROW_HOLES[3]]) HOME[i] = 1;
for (const i of [...ROW_HOLES[13], ...ROW_HOLES[14], ...ROW_HOLES[15], ...ROW_HOLES[16]]) HOME[i] = 0;

for (let i = 0; i < HOLES.length; i++) {
  const a = HOLES[i];
  const list = [];
  for (let j = 0; j < HOLES.length; j++) {
    if (i === j) continue;
    const b = HOLES[j];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if ((dy === 0 && dx === 2) || (dy === 1 && dx === 1)) list.push(j);
  }
  NEIGHBORS.push(list);
}

const START = [0, 1].map(() => []);
for (const i of ROW_HOLES[13]) START[0].push(i);
for (const i of ROW_HOLES[14]) START[0].push(i);
for (const i of ROW_HOLES[15]) START[0].push(i);
for (const i of ROW_HOLES[16]) START[0].push(i);
for (const i of ROW_HOLES[0]) START[1].push(i);
for (const i of ROW_HOLES[1]) START[1].push(i);
for (const i of ROW_HOLES[2]) START[1].push(i);
for (const i of ROW_HOLES[3]) START[1].push(i);

export const meta = {
  id: 'checkers',
  name: '跳棋',
  en: 'Chinese Checkers',
  tag: '先占满对面营地',
  goal: '六角星形的棋盘上有 121 个孔位。红方棋子在下，蓝方在上，各 10 枚。通过走动或连续跳跃，最先把己方 10 枚棋子全部送入对面三角营地的一方获胜。',
  seatNames: ['红方', '蓝方'],
  seatColors: ['#c8402f', '#2f6fb0'],
  aspect: 1,
  seats: 2,
  rules: [
    { h: '走一步', p: '每次可以把一枚己方棋子移动到一个相邻的空孔（六个方向中的任意一个）。' },
    { h: '跳跃', p: '如果相邻孔位上有一枚棋子（己方或对方都可以），且它后面的孔位是空的，就可以跳过它落在后面。一次跳跃可以连续跳多步，也可以中途改变方向。' },
    { h: '连跳与结束', p: '连续跳跃时可以一直跳到满意为止。跳跃途中点击「结束移动」按钮可以停在当前孔位，随后轮到对方。' },
    { h: '目标与胜负', p: '棋盘两端各有 10 个孔的三角营地。红方要把 10 枚棋子全部送进上方营地，蓝方则要全部送进下方营地。先完成的一方获胜。' },
    { h: '占地规则', p: '只能落在空孔上，不能落在已有棋子的孔位，也不能把棋子停在对方营地以外的地方获得胜利。' }
  ],
  tips: [
    '开局先让后排的棋子向前，给前面的棋子让出跳跃路线。',
    '多利用对方的棋子当「跳板」，连续跳跃往往比走一步快得多。',
    '注意不要把自己的棋子堵成一团，保持跳跃通道畅通。',
    '中盘时要兼顾进攻与让路：把自己营地的空位腾出来，方便后续棋子进入。'
  ]
};

export function create(opts = {}) {
  const board = new Array(HOLES.length).fill(0);
  // 红方棋子在下三角，蓝方在上三角
  const order0 = shuffle(START[0].slice());
  const order1 = shuffle(START[1].slice());
  for (const i of order0) board[i] = 1;
  for (const i of order1) board[i] = 2;

  const state = {
    id: 'checkers',
    mode: opts.mode || 'pvp',
    level: opts.level || 2,
    humanSeat: opts.humanSeat || 0,
    turn: 0,
    over: false,
    result: null,
    note: '红方先行：点选自己的棋子，再点提示的落点',
    ply: 0,
    history: [],
    seats: [],
    board,
    lastMove: null,
    selected: null,
    hints: [],
    chain: null
  };
  state.seats = makeSeats(state, meta.seatNames);
  return state;
}

export function demo() {
  const s = create({ mode: 'pvp' });
  for (let k = 0; k < 4; k++) {
    const mv = aiMove(s);
    if (!mv) break;
    applyMove(s, mv);
  }
  s.history = [];
  s.selected = null;
  s.hints = [];
  s.chain = null;
  return s;
}

/* ---------------- 走法 ---------------- */

function colorOf(state) {
  return state.turn + 1;
}

function isStep(from, to) {
  return NEIGHBORS[from].includes(to);
}

/** 判断是否为一次合法跳跃（中间有子、终点为空） */
function isJump(board, from, to) {
  const a = HOLES[from];
  const b = HOLES[to];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if (!Number.isInteger(mx) || !Number.isInteger(my)) return false;
  const mid = COORD.get(`${mx},${my}`);
  if (mid === undefined) return false;
  if (!NEIGHBORS[from].includes(mid)) return false;
  if (!NEIGHBORS[mid].includes(to)) return false;
  if (!board[mid]) return false;
  if (board[to] !== 0) return false;
  return true;
}

/** 从某孔出发的一次跳跃终点 */
function jumpTargets(board, from) {
  const out = [];
  for (const n of NEIGHBORS[from]) {
    if (!board[n]) continue;
    const a = HOLES[from];
    const b = HOLES[n];
    const tx = 2 * b.x - a.x;
    const ty = 2 * b.y - a.y;
    const t = COORD.get(`${tx},${ty}`);
    if (t === undefined) continue;
    if (board[t] === 0) out.push(t);
  }
  return out;
}

/** 从某孔出发的全部单步/单跳落点（用于交互提示） */
function immediateTargets(board, from) {
  const steps = NEIGHBORS[from].filter(n => board[n] === 0);
  const jumps = jumpTargets(board, from);
  return { steps, jumps };
}

/** 深搜所有连跳路径（用于 AI） */
function jumpPaths(board, from) {
  const out = [];
  const seen = new Set([from]);
  const stack = [{ pos: from, path: [from] }];
  while (stack.length) {
    const { pos, path } = stack.pop();
    for (const n of NEIGHBORS[pos]) {
      if (!board[n]) continue;
      const a = HOLES[pos];
      const b = HOLES[n];
      const tx = 2 * b.x - a.x;
      const ty = 2 * b.y - a.y;
      const t = COORD.get(`${tx},${ty}`);
      if (t === undefined || board[t] !== 0 || seen.has(t)) continue;
      seen.add(t);
      const nextPath = [...path, t];
      out.push({ path: nextPath, hops: nextPath.length - 1, end: t });
      stack.push({ pos: t, path: nextPath });
    }
  }
  return out;
}

function allMoves(board, color) {
  const out = [];
  for (let i = 0; i < HOLES.length; i++) {
    if (board[i] !== color) continue;
    for (const n of NEIGHBORS[i]) {
      if (board[n] === 0) out.push({ path: [i, n], hops: 1, end: n, from: i });
    }
    for (const p of jumpPaths(board, i)) out.push({ ...p, from: i });
  }
  return out;
}

/** 用索引计算推进分数 */
function progressOf(index, color) {
  const h = HOLES[index];
  const targetRow = color === 1 ? 0 : 16; // 营地尖端：越靠近越「深」，先填满深处才不会堵路
  // 用到营地尖端的真实几何距离：既奖励向前，也奖励向中间靠拢（边路的棋子不会在原地打转）
  const d = Math.hypot(h.x * 0.5, (h.y - targetRow) * 0.866);
  return (20 - d) * 1.5 + (HOME[index] === (color === 1 ? 1 : 0) ? 26 : 0);
}

/* ---------------- 走子 ---------------- */

function checkWin(state, mover) {
  const color = mover + 1;
  const target = mover === 0 ? ROW_HOLES[0].concat(ROW_HOLES[1], ROW_HOLES[2], ROW_HOLES[3])
    : ROW_HOLES[13].concat(ROW_HOLES[14], ROW_HOLES[15], ROW_HOLES[16]);
  if (target.every(i => state.board[i] === color)) {
    finish(state, mover, `${state.seats[mover].name}全部进入对面营地，获胜！`, 'home');
    state.note = state.result.text;
    return true;
  }
  return false;
}

/** 单跳或单步（供交互连跳使用） */
function doHop(state, from, to) {
  const color = colorOf(state);
  if (state.board[from] !== color || state.board[to] !== 0) return { ok: false, msg: '这一步不能走' };
  let type = '';
  if (isStep(from, to)) type = 'step';
  else if (isJump(state.board, from, to)) type = 'jump';
  else return { ok: false, msg: '只能走到相邻空孔或跳过相邻棋子' };

  pushHistory(state, KEYS);
  state.board[from] = 0;
  state.board[to] = color;
  state.ply++;
  state.lastMove = { from, to, path: [from, to], hop: type };

  if (type === 'step') {
    endTurn(state);
  } else {
    const more = jumpTargets(state.board, to);
    if (more.length) {
      state.selected = to;
      state.hints = more;
      state.chain = { origin: state.chain ? state.chain.origin : from, pos: to };
      state.note = '连跳中：继续点落点，或点「结束移动」停下';
    } else {
      state.chain = null;
      endTurn(state);
    }
  }
  return { ok: true, moved: true };
}

function endTurn(state) {
  const mover = state.turn;
  state.selected = null;
  state.hints = [];
  state.chain = null;
  state.turn = 1 - mover;
  if (!checkWin(state, mover)) {
    state.note = `${state.seats[state.turn].name}走棋`;
  }
}

/** 完整路径（AI 或一次性落子） */
export function applyMove(state, move) {
  if (!state || state.over || !move) return false;
  const path = move.path || (move.from !== undefined ? [move.from, move.to] : null);
  if (!path || path.length < 2) return false;
  const color = colorOf(state);
  const from = path[0];
  if (state.board[from] !== color) return false;

  // 校验整条路径
  let prev = from;
  for (let k = 1; k < path.length; k++) {
    const to = path[k];
    if (state.board[to] !== 0) return false;
    if (isStep(prev, to)) {
      if (k > 1) return false; // 跳完之后不能再走一步
    } else if (!isJump(state.board, prev, to)) {
      return false;
    }
    prev = to;
  }

  pushHistory(state, KEYS);
  for (let k = 1; k < path.length; k++) {
    state.board[path[k - 1]] = 0;
    state.board[path[k]] = color;
  }
  state.ply++;
  state.lastMove = { from, to: path[path.length - 1], path: path.slice(), hop: path.length > 2 ? 'multi' : (isJump(state.board, from, path[1]) ? 'jump' : 'step') };

  const mover = state.turn;
  const seat = state.seats[mover].name;
  state.note = `${seat}移动棋子（${path.length - 1} 步）`;
  state.selected = null;
  state.hints = [];
  state.chain = null;
  state.turn = 1 - mover;

  if (!checkWin(state, mover)) {
    state.note += `，轮到${state.seats[state.turn].name}`;
  }
  return true;
}

/* ---------------- 交互 ---------------- */

function layout(w, h) {
  const pad = Math.min(w, h) * 0.06;
  const unit = Math.min((w - pad * 2) / 12, (h - pad * 2) / (16 * 0.866));
  const width = 12 * unit;
  const height = 16 * 0.866 * unit;
  const x0 = (w - width) / 2;
  const y0 = (h - height) / 2;
  return { unit, x0, y0, w, h };
}

function holePos(i, L) {
  const h = HOLES[i];
  return {
    x: L.x0 + h.x * L.unit * 0.5 + 6 * L.unit,
    y: L.y0 + h.y * L.unit * 0.866
  };
}

export function tap(state, pt) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  const L = layout(pt.w, pt.h);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < HOLES.length; i++) {
    const p = holePos(i, L);
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0 || bestD > L.unit * 0.55) return { ok: false, msg: '请点击孔位' };

  const color = colorOf(state);

  // 连跳中：只能继续跳
  if (state.chain) {
    if (best === state.selected) {
      state.selected = null;
      state.hints = [];
      return { ok: true, moved: false };
    }
    if (state.board[best] !== 0) return { ok: false, msg: '只能落在空孔上' };
    if (!state.hints.includes(best)) return { ok: false, msg: '这里不能继续跳' };
    const res = doHop(state, state.selected, best);
    return res.ok ? { ok: true, moved: true } : res;
  }

  if (state.selected !== null) {
    const sel = state.selected;
    if (best === sel) {
      state.selected = null;
      state.hints = [];
      return { ok: true, moved: false };
    }
    if (state.board[best] === color) {
      selectPiece(state, best);
      return { ok: true, moved: false };
    }
    if (!state.hints.includes(best)) return { ok: false, msg: '只能走到相邻空孔或跳过棋子' };
    const res = doHop(state, sel, best);
    return res.ok ? { ok: true, moved: true } : res;
  }

  if (state.board[best] === color) {
    selectPiece(state, best);
    return { ok: true, moved: false };
  }
  if (state.board[best]) return { ok: false, msg: '这是对方的棋子' };
  return { ok: false, msg: '请先点选自己的棋子' };
}

function selectPiece(state, index) {
  state.selected = index;
  const { steps, jumps } = immediateTargets(state.board, index);
  state.hints = [...steps, ...jumps];
  state.note = steps.length || jumps.length ? '选择落点：空孔走一步，跳过棋子可连跳' : '这枚棋子没有可走的位置';
}

export function undo(state) {
  const ok = popHistory(state, KEYS);
  if (ok) {
    state.selected = null;
    state.hints = [];
    state.chain = null;
  }
  return ok;
}

export function actions(state) {
  if (!state || state.over) return [];
  if (state.chain) return [{ id: 'end', label: '结束移动', primary: true }];
  return [];
}

export function action(state, id) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  if (id === 'end' && state.chain) {
    pushHistory(state, KEYS);
    endTurn(state);
    return { ok: true, moved: true };
  }
  return { ok: false, msg: '现在不能这样做' };
}

/* ---------------- AI ---------------- */

function scoreMove(board, move, color) {
  const from = move.from;
  const to = move.end !== undefined ? move.end : move.path[move.path.length - 1];
  const target = color === 1 ? 1 : 0; // 目标营地编号
  const fromHome = HOME[from] === target;
  const toHome = HOME[to] === target;
  const targetRow = color === 1 ? 0 : 16; // 营地尖端：越靠近越「深」，先填满深处才不会堵路

  // 推进分里已经含「进入目标营地」的加成，这里不再重复奖励
  const delta = progressOf(to, color) - progressOf(from, color);
  // 连跳的奖励只发给「净推进」的走法：否则长跳跳过去再跳回来也能拿高分，就会来回横跳
  let score = delta > 0 ? delta + move.hops * 1.2 : delta - 2;

  if (fromHome && !toHome) score -= 60; // 已到位的棋子绝不再出来
  if (fromHome && toHome) {
    // 营地内只许往更深处挪（给后面的棋子腾位置），来回挪动一律不给分，避免原地横跳
    const deeper = Math.abs(HOLES[to].y - targetRow) < Math.abs(HOLES[from].y - targetRow);
    score = deeper ? Math.min(score, 3) : -30;
  }

  // 落在后排的棋子更需要动：离目标越远，挪动它的价值越高，让整支队伍一起前进
  if (!fromHome) score += Math.abs(HOLES[from].y - targetRow) * 0.18;
  // 离开己方出发营地，方便后续棋子进入
  if (HOME[from] === (color === 1 ? 0 : 1)) score += 4;
  return score;
}

export function aiMove(state) {
  if (!state || state.over) return null;
  if (state.chain) return null;
  const color = colorOf(state);
  const board = state.board.slice();
  const moves = allMoves(board, color);
  if (!moves.length) return null;

  const level = state.level || 2;
  for (const m of moves) m.score = scoreMove(board, m, color);

  if (level === 1) {
    // 简单：在「往前走」的候选里随机挑，偶尔不是最优，但不会来回倒退
    const fwd = moves.filter(m => m.score > 0);
    const base = (fwd.length ? fwd : moves).map(m => ({ ...m, score: m.score + Math.random() * 8 }));
    const pool = base.sort((a, b) => b.score - a.score);
    const top = pool.slice(0, Math.max(2, Math.ceil(pool.length * 0.4)));
    const pick = top[Math.floor(Math.random() * top.length)];
    return { path: pick.path };
  }

  moves.sort((a, b) => b.score - a.score);
  let best = moves[0];

  if (level >= 3) {
    const deadline = Date.now() + 1400;
    // 只在「推进幅度接近最优」的走法里权衡对手威胁，不让它为了防守而倒退、来回跳
    const floor = moves[0].score - 6;
    const top = moves.filter(m => m.score >= floor).slice(0, 6);
    let bestVal = -Infinity;
    for (const m of top) {
      const test = board.slice();
      for (let k = 1; k < m.path.length; k++) {
        test[m.path[k - 1]] = 0;
        test[m.path[k]] = color;
      }
      const enemy = 3 - color;
      const replies = allMoves(test, enemy).sort((a, b) => b.score - a.score);
      const threat = replies.length ? scoreMove(test, replies[0], enemy) : 0;
      const val = m.score - threat * 0.3;
      if (val > bestVal) {
        bestVal = val;
        best = m;
      }
      if (Date.now() > deadline) break;
    }
  } else if (level === 2) {
    for (const m of moves) m.score += Math.random() * 1.5;
    best = moves.slice(0, 2).sort((a, b) => b.score - a.score)[0];
  }

  return { path: best.path };
}

/* ---------------- 绘制 ---------------- */

export function draw(ctx, state, g) {
  const { w, h } = g;
  boardSurface(ctx, w, h, PALETTE.jade);
  const L = layout(w, h);

  // 六角星轮廓
  const cx = w / 2;
  const cy = h / 2;
  const R = L.unit * 6.6;
  const rIn = R * 0.62;
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k < 12; k++) {
    const ang = -Math.PI / 2 + k * Math.PI / 6;
    const rad = k % 2 === 0 ? R : rIn;
    const px = cx + rad * Math.cos(ang);
    const py = cy + rad * Math.sin(ang) * 0.94;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(12,40,34,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,225,210,0.22)';
  ctx.lineWidth = Math.max(2, L.unit * 0.1);
  ctx.stroke();
  ctx.restore();

  // 目标营地淡染（用三角形轮廓）
  const camps = [
    { apex: holePos(ROW_HOLES[0][0], L), left: holePos(ROW_HOLES[3][0], L), right: holePos(ROW_HOLES[3][3], L), color: 'rgba(200,64,47,0.14)' },
    { apex: holePos(ROW_HOLES[16][0], L), left: holePos(ROW_HOLES[13][0], L), right: holePos(ROW_HOLES[13][3], L), color: 'rgba(47,111,176,0.14)' }
  ];
  for (const camp of camps) {
    ctx.beginPath();
    ctx.moveTo(camp.apex.x, camp.apex.y - L.unit * 0.6);
    ctx.lineTo(camp.left.x - L.unit * 0.5, camp.left.y + L.unit * 0.5);
    ctx.lineTo(camp.right.x + L.unit * 0.5, camp.right.y + L.unit * 0.5);
    ctx.closePath();
    ctx.fillStyle = camp.color;
    ctx.fill();
  }

  // 孔位
  for (let i = 0; i < HOLES.length; i++) {
    const p = holePos(i, L);
    ctx.beginPath();
    ctx.arc(p.x, p.y, L.unit * 0.33, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,26,22,0.55)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, L.unit * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(214,240,226,0.12)';
    ctx.fill();
  }

  // 棋子
  for (let i = 0; i < HOLES.length; i++) {
    const v = state.board[i];
    if (!v) continue;
    const p = holePos(i, L);
    const r = L.unit * 0.34;
    const red = v === 1;
    const grad = ctx.createRadialGradient(p.x - r * 0.34, p.y - r * 0.38, r * 0.12, p.x, p.y, r);
    grad.addColorStop(0, red ? '#f0705c' : '#6fa8e0');
    grad.addColorStop(0.7, red ? '#c8402f' : '#2f6fb0');
    grad.addColorStop(1, red ? '#7d1f14' : '#173f6b');
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x - r * 0.3, p.y - r * 0.33, r * 0.23, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }

  // 最后一步
  if (state.lastMove) {
    const path = state.lastMove.path || [state.lastMove.from, state.lastMove.to];
    for (const index of path) {
      const p = holePos(index, L);
      ctx.beginPath();
      ctx.arc(p.x, p.y, L.unit * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,214,110,0.55)';
      ctx.fill();
    }
  }

  // 选中
  if (state.selected !== null && state.selected !== undefined) {
    const p = holePos(state.selected, L);
    halo(ctx, p.x, p.y, L.unit * 0.42, 'rgba(255,206,100,0.95)', Math.max(2, L.unit * 0.09));
  }

  // 落点提示
  for (const index of state.hints || []) {
    const p = holePos(index, L);
    const occupied = !!state.board[index];
    ctx.beginPath();
    ctx.arc(p.x, p.y, L.unit * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = occupied ? 'rgba(200,64,47,0.35)' : 'rgba(255,236,170,0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,170,0.7)';
    ctx.lineWidth = Math.max(1.2, L.unit * 0.045);
    ctx.stroke();
  }

  if (!state.over) {
    boardLabel(ctx, state.chain ? '连跳中' : `${state.seats[state.turn].name}行棋`, w / 2, h - L.unit * 0.5, Math.max(10, L.unit * 0.34), 'rgba(226,244,232,0.62)');
  }
}

/** 遥控器 / 键盘光标可停靠的点位（画布像素坐标） */
export function cursorPoints(state, g) {
  const L = layout(g.w, g.h);
  const pts = [];
  for (let i = 0; i < HOLES.length; i++) {
    const p = holePos(i, L);
    pts.push({ x: p.x, y: p.y, r: L.unit * 0.5 });
  }
  return pts;
}

/** 走子动画：沿着连跳路径一步步滑过去（直接截取新画面里的棋子图像） */
export function moveAnim(state, g) {
  const m = state.lastMove;
  if (!m || !m.path || m.path.length < 2) return null;
  const L = layout(g.w, g.h);
  return {
    kind: 'slide',
    path: m.path.map(i => holePos(i, L)),
    r: L.unit * 0.46,
    shape: 'circle'
  };
}
