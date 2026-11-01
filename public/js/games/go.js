// 围棋（9 路）：气与提子、禁自杀、简单劫争、双方连续停一手终局数子
import { pushHistory, popHistory, finish, makeSeats } from './_util.js';
import { boardSurface, PALETTE, stone, halo, boardLabel } from './_draw.js';

const N = 9;
const KOMI = 6.5;
const KEYS = ['board', 'turn', 'lastMove', 'ko', 'passes', 'ply', 'over', 'result', 'note', 'captured'];

const idx = (x, y) => y * N + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

const NEIGHBORS = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const list = [];
    if (x > 0) list.push(idx(x - 1, y));
    if (x < N - 1) list.push(idx(x + 1, y));
    if (y > 0) list.push(idx(x, y - 1));
    if (y < N - 1) list.push(idx(x, y + 1));
    NEIGHBORS[idx(x, y)] = list;
  }
}

const coord = (x, y) => `${'ABCDEFGHI'[x]}${N - y}`;
const seatName = state => state.seats[state.turn].name;

export const meta = {
  id: 'go',
  name: '围棋',
  en: 'Go',
  tag: '9 路棋盘',
  goal: '在 9×9 的棋盘上，黑白双方轮流落子，围住更多的地盘。棋子被对方完全包围（没有气）时会被提掉。终局时数己方棋子与围住的空点，多者获胜（白方贴 6.5 目）。',
  seatNames: ['黑方', '白方'],
  seatColors: ['#14161a', '#f4efe3'],
  aspect: 1,
  seats: 2,
  rules: [
    { h: '气与提子', p: '棋子上下左右紧邻的空点是它的「气」。一块相连的同色棋共享气。当一块棋的所有气都被对方占据，这块棋就会被提掉（从棋盘上拿走）。' },
    { h: '禁止自杀', p: '落子后如果自己这块棋没有气，且没有同时提掉对方的棋子，这步棋不合法，不能下。' },
    { h: '简单劫争', p: '提掉对方一子后，如果自己刚下的棋只剩一口气，对方不能立刻在同一位置回提，必须先到别处落子（本作按简单劫规则处理）。' },
    { h: '停一手与终局', p: '觉得自己没有好点可下时，可以「停一手」。双方连续停一手，对局结束，进入数子。' },
    { h: '数子规则', p: '中国规则数子法：己方棋子数 + 只被己方包围的空点数 = 己方得分。白方额外贴 6.5 目。得分多者获胜，非常接近时可能出现和棋。' }
  ],
  tips: [
    '开局先占角、再占边，最后向中间发展，不要一开始就在二线以下爬。',
    '不要盲目贴身紧气，先看看自己的棋有没有被切断的危险。',
    '「眼」是棋块的气源，做活需要两只真眼；不要随手填掉自己的眼。',
    '提子之前先算清对方能否反提，劫争要留意全局的劫材。'
  ]
};

export function create(opts = {}) {
  const state = {
    id: 'go',
    mode: opts.mode || 'pvp',
    level: opts.level || 2,
    humanSeat: opts.humanSeat || 0,
    turn: 0,
    over: false,
    result: null,
    note: '黑方先行，点击棋盘交叉点落子',
    ply: 0,
    history: [],
    seats: [],
    board: new Array(N * N).fill(0),
    lastMove: null,
    ko: null,
    passes: 0,
    captured: [0, 0]
  };
  state.seats = makeSeats(state, meta.seatNames);
  return state;
}

export function demo() {
  const s = create({ mode: 'pvp' });
  const seq = [
    [4, 4], [3, 3], [6, 6], [5, 5], [2, 2], [4, 2], [6, 2], [6, 3], [5, 3], [4, 3]
  ];
  // 用简单的落子序列构造中盘局面（若某步非法则跳过）
  for (const [x, y] of seq) {
    if (!s.over) applyMove(s, { x, y });
  }
  s.history = [];
  return s;
}

/* ---------------- 棋块与气 ---------------- */

function groupInfo(board, start) {
  const color = board[start];
  const stones = [];
  const libs = new Set();
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    stones.push(i);
    const x = i % N;
    const y = Math.floor(i / N);
    for (const n of NEIGHBORS[i]) {
      if (board[n] === 0) libs.add(n);
      else if (board[n] === color && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
    void x; void y;
  }
  return { stones, liberties: libs };
}

/** 在棋盘上落下 color 子并提掉无气的对方棋块；若自杀返回 null */
function place(board, x, y, color) {
  const i = idx(x, y);
  if (board[i] !== 0) return null;
  board[i] = color;

  const captured = [];
  const enemy = 3 - color;
  for (const n of NEIGHBORS[i]) {
    if (board[n] !== enemy) continue;
    const g = groupInfo(board, n);
    if (g.liberties.size === 0) {
      for (const s of g.stones) {
        board[s] = 0;
        captured.push(s);
      }
    }
  }

  const own = groupInfo(board, i);
  if (own.liberties.size === 0 && captured.length === 0) {
    board[i] = 0;
    return null;
  }
  return { captured, liberties: own.liberties.size, stones: own.stones };
}

function tryPlay(board, x, y, color, ko) {
  if (!inside(x, y) || board[idx(x, y)] !== 0) return null;
  if (ko && ko.x === x && ko.y === y) return null;
  return place(board, x, y, color);
}

/* ---------------- 计分 ---------------- */

function scoreArea(board) {
  const black = { stones: 0, terr: 0 };
  const white = { stones: 0, terr: 0 };
  const visited = new Array(N * N).fill(false);

  for (let i = 0; i < N * N; i++) {
    if (board[i] === 1) black.stones++;
    else if (board[i] === 2) white.stones++;
  }

  for (let i = 0; i < N * N; i++) {
    if (board[i] !== 0 || visited[i]) continue;
    const region = [];
    const border = new Set();
    const stack = [i];
    visited[i] = true;
    while (stack.length) {
      const p = stack.pop();
      region.push(p);
      for (const n of NEIGHBORS[p]) {
        if (board[n] === 0) {
          if (!visited[n]) {
            visited[n] = true;
            stack.push(n);
          }
        } else {
          border.add(board[n]);
        }
      }
    }
    if (border.size === 1) {
      if ([...border][0] === 1) black.terr += region.length;
      else white.terr += region.length;
    }
  }

  return {
    black: black.stones + black.terr,
    white: white.stones + white.terr,
    blackStones: black.stones,
    whiteStones: white.stones,
    blackTerr: black.terr,
    whiteTerr: white.terr
  };
}

function endByScore(state, reason = 'score') {
  const sc = scoreArea(state.board);
  const b = sc.black;
  const w = sc.white + KOMI;
  const diff = b - w;
  const text = diff > 0
    ? `终局：黑 ${b} 目 : 白 ${w} 目，黑胜 ${Math.abs(diff)} 目`
    : diff < 0
      ? `终局：黑 ${b} 目 : 白 ${w} 目，白胜 ${Math.abs(diff)} 目`
      : `终局：黑 ${b} 目 : 白 ${w} 目，双方和棋`;
  const winner = diff > 0 ? 0 : diff < 0 ? 1 : null;
  finish(state, winner, text, reason);
  state.note = text;
}

/* ---------------- 走子 ---------------- */

export function applyMove(state, move) {
  if (!state || state.over || !move) return false;

  if (move.pass) {
    pushHistory(state, KEYS);
    const seat = seatName(state);
    state.ply++;
    state.passes = (state.passes || 0) + 1;
    state.lastMove = null;
    state.ko = null;
    const mover = state.turn;
    state.turn = 1 - mover;
    state.note = `${seat}停一手`;
    if (state.passes >= 2) endByScore(state, 'pass');
    return true;
  }

  const { x, y } = move;
  if (!inside(x, y)) return false;
  const i = idx(x, y);
  if (state.board[i] !== 0) return false;
  if (state.ko && state.ko.x === x && state.ko.y === y) return false;

  const color = state.turn + 1;
  const test = [];
  for (let k = 0; k < state.board.length; k++) test.push(state.board[k]);
  const res = place(test, x, y, color);
  if (!res) return false;

  pushHistory(state, KEYS);
  const captured = res.captured;

  state.board = test;
  state.ply++;
  state.passes = 0;
  state.lastMove = { x, y, color };
  state.captured = state.captured || [0, 0];
  state.captured[state.turn] += captured.length;

  // 简单劫：只提一子且自身只剩一口气时，禁止对方立即回提
  let ko = null;
  if (captured.length === 1 && res.liberties === 1) {
    const ci = captured[0];
    ko = { x: ci % N, y: Math.floor(ci / N) };
  }
  state.ko = ko;

  const mover = state.turn;
  const seat = state.seats[mover].name;
  let note = `${seat}落子（${coord(x, y)}）`;
  if (captured.length) note += `，提掉 ${captured.length} 子`;

  state.turn = 1 - mover;
  state.note = note;
  return true;
}

/* ---------------- 交互 ---------------- */

function layout(w, h) {
  const size = Math.min(w, h);
  const pad = size * 0.045;
  const step = (size - pad * 2) / (N - 1);
  return { size, pad, step, x0: (w - size) / 2 + pad, y0: (h - size) / 2 + pad, w, h };
}

export function tap(state, pt) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  const L = layout(pt.w, pt.h);
  const gx = Math.round((pt.x - L.x0) / L.step);
  const gy = Math.round((pt.y - L.y0) / L.step);
  if (!inside(gx, gy)) return { ok: false, msg: '请点击棋盘交叉点' };
  const cx = L.x0 + gx * L.step;
  const cy = L.y0 + gy * L.step;
  if (Math.hypot(pt.x - cx, pt.y - cy) > L.step * 0.52) return { ok: false, msg: '请点击棋盘交叉点' };
  if (state.board[idx(gx, gy)]) return { ok: false, msg: '这个交叉点已经有子了' };
  if (state.ko && state.ko.x === gx && state.ko.y === gy) return { ok: false, msg: '打劫：这里暂时不能落子' };
  const ok = applyMove(state, { x: gx, y: gy });
  if (!ok) return { ok: false, msg: '自杀手不合法，换一个点试试' };
  return { ok: true, moved: true };
}

export function undo(state) {
  return popHistory(state, KEYS);
}

export function actions(state) {
  if (!state || state.over) return [];
  return [
    { id: 'pass', label: '停一手' },
    { id: 'resign', label: '认输' }
  ];
}

export function action(state, id) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  if (id === 'pass') {
    const ok = applyMove(state, { pass: true });
    return { ok, moved: ok };
  }
  if (id === 'resign') {
    const loser = state.turn;
    finish(state, 1 - loser, `${state.seats[loser].name}认输，${state.seats[1 - loser].name}获胜`, 'resign');
    state.note = state.result.text;
    return { ok: true, moved: true };
  }
  return { ok: false, msg: '未知操作' };
}

/* ---------------- AI ---------------- */

/** 简单真眼判断：该空点的四邻与斜角全部是己方棋子/边界 */
function isOwnEye(board, x, y, color) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (inside(nx, ny) && board[idx(nx, ny)] !== color) return false;
  }
  return true;
}

function moveValue(board, x, y, color, ko, lastMove, level) {
  const test = board.slice();
  const res = tryPlay(test, x, y, color, ko);
  if (!res) return -Infinity;

  let value = 0;
  const cap = res.captured.length;
  value += cap * 12;

  const libs = res.liberties;
  value += Math.min(libs, 4) * 1.6;
  if (libs === 1 && cap === 0) value -= 14;
  if (libs === 2) value += 1;

  const i = idx(x, y);
  const enemy = 3 - color;
  let ownAdj = 0;
  let enemyAdj = 0;
  for (const n of NEIGHBORS[i]) {
    const v = board[n];
    if (v === color) ownAdj++;
    else if (v === enemy) enemyAdj++;
  }
  value += ownAdj * 0.8 + enemyAdj * 0.5;

  // 围住对方只剩一气的棋块：紧气要点
  for (const n of NEIGHBORS[i]) {
    if (board[n] !== enemy) continue;
    const g = groupInfo(board, n);
    if (g.liberties.size === 1) value += 3.5;
    else if (g.liberties.size === 2) value += 1.2;
  }

  // 避免填自己的眼
  if (isOwnEye(board, x, y, color)) value -= 30;

  // 靠近上一手
  if (lastMove) {
    const d = Math.max(Math.abs(x - lastMove.x), Math.abs(y - lastMove.y));
    if (d <= 2) value += (3 - d) * 1.1;
  }

  // 中心权重与边角平衡
  value += (4 - Math.max(Math.abs(x - 4), Math.abs(y - 4))) * 0.35;

  if (level === 1) value += Math.random() * 8;
  else if (level === 2) value += Math.random() * 2;
  return value;
}

function candidates(board, ko, lastMove) {
  const out = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[idx(x, y)]) continue;
      if (ko && ko.x === x && ko.y === y) continue;
      if (lastMove) {
        const d = Math.max(Math.abs(x - lastMove.x), Math.abs(y - lastMove.y));
        if (d > 3) continue;
      }
      out.push([x, y]);
    }
  }
  if (!out.length) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!board[idx(x, y)] && !(ko && ko.x === x && ko.y === y)) out.push([x, y]);
      }
    }
  }
  return out;
}

function opponentBestCapture(board, color, ko) {
  // 估算对手在我落子后能提掉的最大子数
  const enemy = 3 - color;
  let best = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[idx(x, y)]) continue;
      const test = board.slice();
      const r = tryPlay(test, x, y, enemy, null);
      if (r && r.captured.length > best) best = r.captured.length;
    }
  }
  void ko;
  return best;
}

export function aiMove(state) {
  if (!state || state.over) return null;
  const color = state.turn + 1;
  const board = state.board.slice();
  const level = state.level || 2;
  const cands = candidates(board, state.ko, state.lastMove);

  let best = null;
  let bestVal = -Infinity;
  const deadline = Date.now() + (level === 3 ? 1400 : 550);

  for (const [x, y] of cands) {
    if (level >= 2 && Date.now() > deadline) break;
    const val = moveValue(board, x, y, color, state.ko, state.lastMove, level);
    if (val > bestVal) {
      bestVal = val;
      best = { x, y };
    }
  }

  if (!best) return { pass: true };

  // 困难档：再看对手的即时应手，避免送吃
  if (level === 3) {
    const top = [];
    for (const [x, y] of cands) {
      const v = moveValue(board, x, y, color, state.ko, state.lastMove, 3);
      if (v > -Infinity) top.push({ x, y, v });
      if (top.length > 80) break;
    }
    top.sort((a, b) => b.v - a.v);
    let finest = top[0];
    let finestVal = -Infinity;
    const limit = top.slice(0, 6);
    for (const c of limit) {
      const test = board.slice();
      const r = tryPlay(test, c.x, c.y, color, state.ko);
      if (!r) continue;
      const threat = opponentBestCapture(test, color, null);
      const val = c.v - threat * 6;
      if (val > finestVal) {
        finestVal = val;
        finest = c;
      }
      if (Date.now() > deadline) break;
    }
    if (finest) best = { x: finest.x, y: finest.y };
  }

  if (level === 1) {
    // 简单档：在靠前的候选中随机
    const pool = [];
    for (const [x, y] of cands) {
      const v = moveValue(board, x, y, color, state.ko, state.lastMove, 1);
      if (v > -Infinity) pool.push({ x, y, v });
    }
    pool.sort((a, b) => b.v - a.v);
    const use = pool.slice(0, Math.max(3, Math.ceil(pool.length * 0.35)));
    if (use.length) {
      const pick = use[Math.floor(Math.random() * use.length)];
      return { x: pick.x, y: pick.y };
    }
  }

  // 只有确实无子可落时才停一手，避免早早结束
  return best;
}

/* ---------------- 绘制 ---------------- */

export function draw(ctx, state, g) {
  const { w, h } = g;
  boardSurface(ctx, w, h, PALETTE.wood);
  const L = layout(w, h);
  const step = L.step;
  const end = step * (N - 1);

  ctx.save();
  ctx.strokeStyle = 'rgba(56,34,12,0.66)';
  ctx.lineWidth = Math.max(1, step * 0.03);
  for (let i = 0; i < N; i++) {
    ctx.beginPath();
    ctx.moveTo(L.x0, L.y0 + i * step);
    ctx.lineTo(L.x0 + end, L.y0 + i * step);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(L.x0 + i * step, L.y0);
    ctx.lineTo(L.x0 + i * step, L.y0 + end);
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(2, step * 0.06);
  ctx.strokeRect(L.x0, L.y0, end, end);

  ctx.fillStyle = 'rgba(48,28,8,0.72)';
  for (const [x, y] of [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]) {
    ctx.beginPath();
    ctx.arc(L.x0 + x * step, L.y0 + y * step, step * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 终局实地淡色标记
  if (state.over && state.result && (state.result.reason === 'pass' || state.result.reason === 'score')) {
    const sc = scoreArea(state.board);
    const visited = new Array(N * N).fill(false);
    for (let i = 0; i < N * N; i++) {
      if (state.board[i] !== 0 || visited[i]) continue;
      const stack = [i];
      visited[i] = true;
      const region = [];
      const border = new Set();
      while (stack.length) {
        const p = stack.pop();
        region.push(p);
        for (const n of NEIGHBORS[p]) {
          if (state.board[n] === 0) {
            if (!visited[n]) {
              visited[n] = true;
              stack.push(n);
            }
          } else border.add(state.board[n]);
        }
      }
      if (border.size === 1) {
        const color = [...border][0];
        ctx.fillStyle = color === 1 ? 'rgba(30,32,38,0.3)' : 'rgba(250,248,240,0.5)';
        for (const p of region) {
          ctx.fillRect(
            L.x0 + (p % N) * step - step * 0.16,
            L.y0 + Math.floor(p / N) * step - step * 0.16,
            step * 0.32,
            step * 0.32
          );
        }
      }
    }
    void sc;
  }

  const r = step * 0.43;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = state.board[idx(x, y)];
      if (!v) continue;
      const cx = L.x0 + x * step;
      const cy = L.y0 + y * step;
      stone(ctx, cx, cy, r, v === 1 ? 'black' : 'white');
    }
  }

  if (state.lastMove) {
    const { x, y, color } = state.lastMove;
    const cx = L.x0 + x * step;
    const cy = L.y0 + y * step;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = color === 1 ? 'rgba(255,214,110,0.95)' : 'rgba(230,80,60,0.95)';
    ctx.fill();
    halo(ctx, cx, cy, r * 0.9, color === 1 ? 'rgba(255,214,110,0.5)' : 'rgba(230,80,60,0.5)', Math.max(1.5, r * 0.12));
  }

  if (state.ko) {
    const cx = L.x0 + state.ko.x * step;
    const cy = L.y0 + state.ko.y * step;
    ctx.strokeStyle = 'rgba(255,210,100,0.8)';
    ctx.lineWidth = Math.max(1.5, step * 0.05);
    ctx.strokeRect(cx - step * 0.14, cy - step * 0.14, step * 0.28, step * 0.28);
  }

  if (!state.over) {
    boardLabel(ctx, `${seatName(state)}行棋`, L.x0 + end / 2, L.y0 - step * 0.55, Math.max(10, step * 0.34), 'rgba(60,36,12,0.6)');
  }
}

/** 遥控器 / 键盘光标可停靠的点位（画布像素坐标） */
export function cursorPoints(state, g) {
  const L = layout(g.w, g.h);
  const pts = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) pts.push({ x: L.x0 + x * L.step, y: L.y0 + y * L.step, r: L.step * 0.46 });
  }
  return pts;
}

/** 落子动画：棋子从上方落到交叉点 */
export function moveAnim(state, g) {
  const m = state.lastMove;
  if (!m || m.x === undefined) return null;
  const L = layout(g.w, g.h);
  const v = state.board[idx(m.x, m.y)];
  if (!v) return null;
  const r = L.step * 0.43;
  const x = L.x0 + m.x * L.step;
  const y = L.y0 + m.y * L.step;
  return {
    kind: 'drop',
    path: [{ x, y }],
    r,
    sprite: (c, px, py) => stone(c, px, py, r, v === 1 ? 'black' : 'white')
  };
}
