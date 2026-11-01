// 五子棋：15×15，无禁手，横竖斜先连五者胜
import { pushHistory, popHistory, finish, makeSeats, makeClock } from './_util.js';
import { boardSurface, PALETTE, stone, halo } from './_draw.js';

const N = 15;
const WIN = 5;
const KEYS = ['board', 'turn', 'lastMove', 'ply', 'over', 'result', 'note', 'winLine'];

export const meta = {
  id: 'gomoku',
  name: '五子棋',
  en: 'Gomoku',
  tag: '先连成五子者胜',
  goal: '在 15×15 的棋盘交叉点上落子，黑方先行。任何一方先让自己的五颗（或更多）棋子连成一条横、竖或斜线，即取得胜利。',
  seatNames: ['黑方', '白方'],
  seatColors: ['#14161a', '#f4efe3'],
  aspect: 1,
  seats: 2,
  rules: [
    { h: '棋盘与落子', p: '棋盘为 15×15 条线构成的交叉点（225 个落子点）。双方轮流在空闲交叉点落下一颗棋子，棋子落下后不可移动。' },
    { h: '胜负判定', p: '横、竖、斜任意方向连续五颗同色棋子即为「五连」。五颗以上连续同样算胜。' },
    { h: '先手优势', p: '黑方先行，天然带有先手优势。本作不设禁手规则，双方规则完全对等，适合休闲对弈与新手练习。' },
    { h: '和棋', p: '当 225 个交叉点全部下满仍无人连成五子，判为和棋。' },
    { h: '常用战术', p: '「活三」指两端都空的三连，对手必须应对；「冲四」指一端被封的四连，只能堵不能挡。同时制造两个威胁（双三、四三）往往能直接取胜。' }
  ],
  tips: [
    '开局优先占据天元（正中心）附近，向四周扩张更灵活。',
    '进攻的同时注意堵住对手的活三，不要只顾自己连子。',
    '斜线方向最容易被忽视，落子前四向都要扫一眼。',
    '「四三胜」是最常见的制胜手段：一手同时形成冲四和活三，对手只能挡一处。'
  ]
};

export function create(opts = {}) {
  const mode = opts.mode || 'pvp';
  const level = opts.level || 2;
  const humanSeat = opts.humanSeat || 0;
  const state = {
    id: 'gomoku',
    mode, level, humanSeat,
    turn: 0,
    board: new Array(N * N).fill(0),
    lastMove: null,
    winLine: null,
    ply: 0,
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
  const s = create({ mode: 'pvp' });
  const put = (x, y, c) => { s.board[y * N + x] = c; };
  const seq = [
    [7, 7, 1], [8, 8, 2], [6, 7, 1], [7, 8, 2], [8, 7, 1],
    [6, 8, 2], [9, 7, 1], [5, 8, 2], [7, 6, 1], [9, 9, 2],
    [6, 6, 1], [8, 6, 2], [7, 9, 1], [5, 9, 2]
  ];
  for (const [x, y, c] of seq) put(x, y, c);
  s.turn = 0;
  s.lastMove = { x: 7, y: 9 };
  s.ply = seq.length;
  return s;
}

const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

/** 判定某点落子后是否连五，返回连成的坐标数组或 null */
function checkWin(board, x, y, color) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    const line = [[x, y]];
    for (let s = 1; s <= 4; s++) {
      const nx = x + dx * s, ny = y + dy * s;
      if (!inside(nx, ny) || board[ny * N + nx] !== color) break;
      line.push([nx, ny]);
    }
    for (let s = 1; s <= 4; s++) {
      const nx = x - dx * s, ny = y - dy * s;
      if (!inside(nx, ny) || board[ny * N + nx] !== color) break;
      line.unshift([nx, ny]);
    }
    if (line.length >= WIN) return line;
  }
  return null;
}

export function applyMove(state, move) {
  if (!move || state.over) return false;
  const { x, y } = move;
  if (!inside(x, y) || state.board[y * N + x] !== 0) return false;

  pushHistory(state, KEYS);
  const color = state.turn + 1;
  const idx = y * N + x;
  state.board[idx] = color;
  state.lastMove = { x, y };
  state.ply++;

  const line = checkWin(state.board, x, y, color);
  if (line) {
    state.winLine = line;
    finish(state, state.turn, `${state.seats[state.turn].name} 五连成线，获胜！`, 'five');
    state.note = `${state.seats[state.turn].name}连成五子`;
  } else if (state.ply >= N * N) {
    finish(state, null, '棋盘已满，双方和棋', 'full');
    state.note = '棋盘已满，和棋';
  } else {
    state.turn = 1 - state.turn;
    state.note = `${state.seats[1 - state.turn].name}落子（${coord(x, y)}）`;
  }
  return true;
}

export function tap(state, pt) {
  if (state.over) return { ok: false, msg: '对局已结束' };
  const L = layout(pt.w, pt.h);
  const gx = Math.round((pt.x - L.x0) / L.step);
  const gy = Math.round((pt.y - L.y0) / L.step);
  if (!inside(gx, gy)) return { ok: false, msg: '请点击棋盘内的交叉点' };
  const cx = L.x0 + gx * L.step, cy = L.y0 + gy * L.step;
  if (Math.hypot(pt.x - cx, pt.y - cy) > L.step * 0.52) return { ok: false, msg: '请点击棋盘交叉点' };
  if (state.board[gy * N + gx]) return { ok: false, msg: '这里已经有子了' };
  const ok = applyMove(state, { x: gx, y: gy });
  return { ok, moved: ok };
}

export function undo(state) {
  return popHistory(state, KEYS);
}

export function actions(state) {
  return [];
}

// ============ AI ============

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function runScore(board, x, y, color, dx, dy) {
  let count = 1;
  let open = 0;

  for (const sign of [1, -1]) {
    for (let s = 1; s <= 4; s++) {
      const nx = x + dx * s * sign, ny = y + dy * s * sign;
      if (!inside(nx, ny)) break;
      const v = board[ny * N + nx];
      if (v === color) count++;
      else {
        if (v === 0) open++;
        break;
      }
    }
  }

  if (count >= WIN) return 1e7;
  if (count === 4) return open === 2 ? 6e6 : open === 1 ? 1.2e6 : 0;
  if (count === 3) return open === 2 ? 5e5 : open === 1 ? 8e4 : 0;
  if (count === 2) return open === 2 ? 6e4 : open === 1 ? 4e3 : 0;
  return open === 2 ? 3e3 : 2e2;
}

/** 假设在 (x,y) 落 color 子的总威胁值 */
function threat(board, x, y, color) {
  let total = 0;
  for (const [dx, dy] of DIRS) {
    const s = runScore(board, x, y, color, dx, dy);
    total += s;
    if (s >= 1e7) return 1e7;
  }
  return total;
}

function candidates(board) {
  const out = [];
  let any = false;
  for (let i = 0; i < N * N; i++) if (board[i]) { any = true; break; }
  if (!any) return [[7, 7]];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[y * N + x]) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2 && !near; dx++) {
          const nx = x + dx, ny = y + dy;
          if (inside(nx, ny) && board[ny * N + nx]) near = true;
        }
      }
      if (near) out.push([x, y]);
    }
  }
  return out.length ? out : [[7, 7]];
}

function bestThreat(board, color) {
  let best = 0;
  const cands = candidates(board);
  for (const [x, y] of cands) {
    const t = threat(board, x, y, color);
    if (t > best) best = t;
  }
  return best;
}

export function aiMove(state) {
  const board = state.board.slice();
  const me = state.turn + 1;
  const opp = 3 - me;
  const cands = candidates(board);

  // 空盘直接走中心
  if (state.ply === 0) return { x: 7, y: 7 };

  const scored = [];
  for (const [x, y] of cands) {
    const atk = threat(board, x, y, me);
    const def = threat(board, x, y, opp);
    if (atk >= 1e7) return { x, y };              // 自己能连五
    scored.push({ x, y, atk, def, value: atk * 1.12 + def * 0.98 });
  }

  // 对手能连五则必须堵（除非自己能赢，已在上面返回）
  let block = null;
  let blockDef = 0;
  for (const s of scored) {
    if (s.def >= 1e7 && s.def > blockDef) { block = s; blockDef = s.def; }
  }
  if (block) return { x: block.x, y: block.y };

  scored.sort((a, b) => b.value - a.value);
  const level = state.level || 2;

  if (level === 1) {
    const top = scored.slice(0, Math.max(3, Math.ceil(scored.length * 0.35)));
    return pick(simNoise(top));
  }
  if (level === 2) {
    const top = scored.slice(0, 2);
    // 稍微增加一点随机，避免每局一模一样
    return pick(top);
  }

  // 困难：两层搜索，考虑对手最佳应手
  const top = scored.slice(0, Math.min(7, scored.length));
  let best = top[0], bestVal = -Infinity;
  const clock = makeClock(1200);
  for (const s of top) {
    board[s.y * N + s.x] = me;
    let reply = 0;
    if (!clock()) {
      for (const [x, y] of candidates(board)) {
        if (!board[y * N + x]) {
          const t = threat(board, x, y, opp);
          if (t > reply) reply = t;
        }
      }
    }
    board[s.y * N + s.x] = 0;
    const val = s.atk * 1.1 + s.def * 1.0 - reply * 0.75;
    if (val > bestVal) { bestVal = val; best = s; }
  }
  return { x: best.x, y: best.y };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function simNoise(list) {
  return list.map(o => ({ ...o, n: o.value * (0.75 + Math.random() * 0.5) }))
    .sort((a, b) => b.n - a.n).slice(0, 2);
}

// ============ 绘制 ============

function layout(w, h) {
  const size = Math.min(w, h);
  const pad = size * 0.045;
  const step = (size - pad * 2) / (N - 1);
  return { size, pad, step, x0: (w - size) / 2 + pad, y0: (h - size) / 2 + pad };
}

function coord(x, y) {
  return `${'ABCDEFGHIJKLMNO'[x]}${N - y}`;
}

export function draw(ctx, state, g) {
  const { w, h } = g;
  boardSurface(ctx, w, h, PALETTE.wood);
  const L = layout(w, h);
  const end = (N - 1) * L.step;

  // 网格
  ctx.save();
  ctx.strokeStyle = 'rgba(58,34,12,0.62)';
  ctx.lineWidth = Math.max(1, L.step * 0.035);
  for (let i = 0; i < N; i++) {
    const p = i * L.step;
    ctx.beginPath();
    ctx.moveTo(L.x0, L.y0 + p);
    ctx.lineTo(L.x0 + end, L.y0 + p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(L.x0 + p, L.y0);
    ctx.lineTo(L.x0 + p, L.y0 + end);
    ctx.stroke();
  }

  // 外框加粗
  ctx.lineWidth = Math.max(2, L.step * 0.075);
  ctx.strokeRect(L.x0, L.y0, end, end);

  // 星位
  ctx.fillStyle = 'rgba(50,28,8,0.75)';
  for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]]) {
    ctx.beginPath();
    ctx.arc(L.x0 + x * L.step, L.y0 + y * L.step, L.step * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 棋子
  const r = L.step * 0.43;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = state.board[y * N + x];
      if (!v) continue;
      const cx = L.x0 + x * L.step;
      const cy = L.y0 + y * L.step;
      stone(ctx, cx, cy, r, v === 1 ? 'black' : 'white');
      if (state.winLine && state.winLine.some(([wx, wy]) => wx === x && wy === y)) {
        halo(ctx, cx, cy, r * 0.85, 'rgba(255,196,84,0.95)', Math.max(2, r * 0.16));
      }
    }
  }

  // 最后一步标记
  if (state.lastMove) {
    const { x, y } = state.lastMove;
    const cx = L.x0 + x * L.step, cy = L.y0 + y * L.step;
    const c = state.board[y * N + x] === 1 ? 'rgba(255,205,110,0.95)' : 'rgba(230,80,60,0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
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
  const v = state.board[m.y * N + m.x];
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
