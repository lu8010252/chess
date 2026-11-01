// 五子棋：15×15，无禁手，横竖斜先连五者胜
import { pushHistory, popHistory, finish, makeSeats, makeClock } from './_util.js';
import { boardSurface, PALETTE, stone, halo } from './_draw.js';

const N = 15;
const WIN = 5;
const KEYS = ['board', 'turn', 'lastMove', 'ply', 'over', 'result', 'note', 'winLine', 'hand', 'capture', 'lastEat'];

// 「连五吃子」玩法：每方手里的棋子数
const HAND = 24;

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
  variants: [
    { id: 'classic', label: '经典五子棋', desc: '先连成五子者胜' },
    { id: 'capture', label: '连五吃子', desc: `每方 ${HAND} 子，连五吃对方一子，没子者负` }
  ],
  rules: [
    { h: '棋盘与落子', p: '棋盘为 15×15 条线构成的交叉点（225 个落子点）。双方轮流在空闲交叉点落下一颗棋子，棋子落下后不可移动。' },
    { h: '胜负判定', p: '横、竖、斜任意方向连续五颗同色棋子即为「五连」。五颗以上连续同样算胜。' },
    { h: '先手优势', p: '黑方先行，天然带有先手优势。本作不设禁手规则，双方规则完全对等，适合休闲对弈与新手练习。' },
    { h: '和棋', p: '当 225 个交叉点全部下满仍无人连成五子，判为和棋。' },
    { h: '【连五吃子】玩法', p: `开局选「连五吃子」。双方各有 ${HAND} 枚棋子，轮流从手里落子。谁连成五子，不算赢：先从棋盘上吃掉对方任意 1 枚棋子（被吃的子永久出局），然后连成五子的这几枚收回自己手里，可以继续用。` },
    { h: '【连五吃子】怎么分胜负', p: '轮到你时手里已经没有棋子，你就输了；对方连成五子的次数越多，你的子就越少。双方同时用完时，比盘上最长的一条连线，长的赢，一样长才和棋；若一方的棋子（手里 + 棋盘上）全被吃光，也判负。' },
    { h: '常用战术', p: '「活三」指两端都空的三连，对手必须应对；「冲四」指一端被封的四连，只能堵不能挡。同时制造两个威胁（双三、四三）往往能直接取胜。' }
  ],
  tips: [
    '开局优先占据天元（正中心）附近，向四周扩张更灵活。',
    '进攻的同时注意堵住对手的活三，不要只顾自己连子。',
    '斜线方向最容易被忽视，落子前四向都要扫一眼。',
    '「四三胜」是最常见的制胜手段：一手同时形成冲四和活三，对手只能挡一处。',
    '连五吃子：别把棋子浪费在没用的地方，手里的子用完就输；连五后收回的五子是翻盘的本钱。',
    '连五吃子：吃子时优先吃掉对方最有威胁的那条线上的棋子，或者打断对方的活三。'
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
    variant: opts.variant === 'capture' ? 'capture' : 'classic',
    hand: [HAND, HAND],
    capture: false,
    lastEat: null,
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

/** 数某方在棋盘上的棋子 */
function onBoard(board, color) {
  let n = 0;
  for (let i = 0; i < board.length; i++) if (board[i] === color) n++;
  return n;
}

/** 某方在盘上最长的连线（横竖斜）长度 */
function longestRun(board, color) {
  let best = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (board[y * N + x] !== color) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const px = x - dx;
        const py = y - dy;
        if (inside(px, py) && board[py * N + px] === color) continue; // 只从线头开始数
        let len = 0;
        let cx = x;
        let cy = y;
        while (inside(cx, cy) && board[cy * N + cx] === color) {
          len++;
          cx += dx;
          cy += dy;
        }
        if (len > best) best = len;
      }
    }
  }
  return best;
}

/** 连五吃子：轮到下一方；手里没子就输 */
function nextTurn(state) {
  state.turn = 1 - state.turn;
  const me = state.turn;
  const other = 1 - me;
  if (state.hand[me] <= 0) {
    if (state.hand[other] <= 0) {
      // 双方同时用完：比盘上最长的连线，长者胜，一样长则和棋
      const a = longestRun(state.board, 1);
      const b = longestRun(state.board, 2);
      if (a === b) {
        finish(state, null, `双方的棋子都用完了，最长连线都是 ${a} 子，和棋`, 'empty');
      } else {
        const w = a > b ? 0 : 1;
        finish(state, w, `双方的棋子都用完了，${state.seats[w].name}的连线更长（${Math.max(a, b)} 对 ${Math.min(a, b)}），获胜！`, 'longest');
      }
      state.note = state.result.text;
    } else {
      finish(state, other, `${state.seats[me].name}手里没有棋子了，${state.seats[other].name}获胜！`, 'nostones');
      state.note = `${state.seats[me].name}没子了`;
    }
    return;
  }
  state.note = `轮到${state.seats[me].name}（手里 ${state.hand[me]} 子）`;
}

/** 连五后收回五子 */
function clearLine(state) {
  if (!state.winLine) return;
  for (const [x, y] of state.winLine) {
    state.board[y * N + x] = 0;
    state.hand[state.turn] += 1;
  }
  state.winLine = null;
}

/** 连五吃子：落子 */
function placeCapture(state, x, y) {
  pushHistory(state, KEYS);
  const color = state.turn + 1;
  state.board[y * N + x] = color;
  state.hand[state.turn] -= 1;
  state.lastMove = { x, y };
  state.lastEat = null;
  state.ply++;

  const line = checkWin(state.board, x, y, color);
  if (line) {
    state.winLine = line;
    if (onBoard(state.board, 3 - color) === 0) {
      // 对方盘上没有棋子可吃：直接收回五子，轮到对方
      clearLine(state);
      nextTurn(state);
    } else {
      state.capture = true;
      state.note = `${state.seats[state.turn].name}连成五子！点选对方一枚棋子吃掉`;
    }
    return true;
  }
  nextTurn(state);
  return true;
}

/** 连五吃子：吃子 */
function applyEat(state, ex, ey) {
  if (!state.capture || !inside(ex, ey)) return false;
  const oppColor = 2 - state.turn;
  if (state.board[ey * N + ex] !== oppColor) return false;
  pushHistory(state, KEYS);
  state.board[ey * N + ex] = 0;
  state.lastEat = { x: ex, y: ey };
  clearLine(state);
  state.capture = false;

  const opp = 1 - state.turn;
  if (state.hand[opp] + onBoard(state.board, oppColor) <= 0) {
    finish(state, state.turn, `${state.seats[opp].name}的棋子被吃光了，${state.seats[state.turn].name}获胜！`, 'eaten');
    state.note = `${state.seats[opp].name}没子了`;
    return true;
  }
  nextTurn(state);
  return true;
}

export function applyMove(state, move) {
  if (!move || state.over) return false;
  if (move.eat) return applyEat(state, move.eat.x, move.eat.y);
  if (state.capture) return false;
  const { x, y } = move;
  if (!inside(x, y) || state.board[y * N + x] !== 0) return false;
  if (state.variant === 'capture') {
    if (state.hand[state.turn] <= 0) return false;
    return placeCapture(state, x, y);
  }

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
  if (state.capture) {
    if (state.board[gy * N + gx] !== 2 - state.turn) return { ok: false, msg: '五连成功！请点选对方的一枚棋子吃掉' };
    const eaten = applyMove(state, { eat: { x: gx, y: gy } });
    return { ok: eaten, moved: eaten };
  }
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

/** 连五吃子：挑一枚对方棋子吃掉——吃完（且我的五子收回后）对方的最强威胁最小，其次让我自己更有机会 */
function chooseEat(state) {
  const me = state.turn + 1;
  const opp = 3 - me;
  const base = state.board.slice();
  for (const [x, y] of state.winLine || []) base[y * N + x] = 0;
  const level = state.level || 2;
  const options = [];
  for (let i = 0; i < base.length; i++) {
    if (base[i] !== opp) continue;
    const x = i % N;
    const y = Math.floor(i / N);
    base[i] = 0;
    const oppPower = bestThreat(base, opp);
    const myPower = bestThreat(base, me);
    base[i] = opp;
    options.push({ x, y, val: -oppPower * 1.0 + myPower * 0.2 });
  }
  if (!options.length) return null;
  options.sort((a, b) => b.val - a.val);
  const pool = level === 1 ? options.slice(0, Math.min(5, options.length)) : level === 2 ? options.slice(0, Math.min(2, options.length)) : options.slice(0, 1);
  const p = pool[Math.floor(Math.random() * pool.length)];
  return { eat: { x: p.x, y: p.y } };
}

export function aiMove(state) {
  if (state.capture) return chooseEat(state);
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

  // 连五吃子：可以吃的对方棋子都圈出来；上一次被吃掉的位置打个叉
  if (state.capture) {
    const oppColor = 2 - state.turn;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (state.board[y * N + x] === oppColor) {
          halo(ctx, L.x0 + x * L.step, L.y0 + y * L.step, r * 1.08, 'rgba(235,85,65,0.95)', Math.max(2, r * 0.14));
        }
      }
    }
  }
  if (state.lastEat) {
    const ex = L.x0 + state.lastEat.x * L.step;
    const ey = L.y0 + state.lastEat.y * L.step;
    ctx.save();
    ctx.strokeStyle = 'rgba(210,60,45,0.9)';
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.5, ey - r * 0.5);
    ctx.lineTo(ex + r * 0.5, ey + r * 0.5);
    ctx.moveTo(ex + r * 0.5, ey - r * 0.5);
    ctx.lineTo(ex - r * 0.5, ey + r * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // 最后一步标记
  if (state.lastMove && state.board[state.lastMove.y * N + state.lastMove.x]) {
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
    for (let x = 0; x < N; x++) {
      if (state.capture && state.board[y * N + x] !== 2 - state.turn) continue; // 吃子时只能选对方的子
      pts.push({ x: L.x0 + x * L.step, y: L.y0 + y * L.step, r: L.step * 0.46 });
    }
  }
  return pts;
}

/** 座位条上的补充信息（连五吃子显示手里/盘上的棋子数） */
export function seatInfo(state, i) {
  if (state.variant !== 'capture') return '';
  return `手 ${state.hand[i]} · 盘 ${onBoard(state.board, i + 1)}`;
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
