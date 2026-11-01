// 中国象棋：九路十行，红先黑后，将死或困毙判负
import { pushHistory, popHistory, finish, makeSeats } from './_util.js';
import { boardSurface, PALETTE, discPiece, halo, roundRect } from './_draw.js';

const W = 9;
const H = 10;
const KEYS = ['board', 'turn', 'lastMove', 'ply', 'over', 'result', 'note'];

const KING = 1;
const ADVISOR = 2;
const ELEPHANT = 3;
const HORSE = 4;
const ROOK = 5;
const CANNON = 6;
const PAWN = 7;

const CHARS = {
  1: ['帅', '将'],
  2: ['仕', '士'],
  3: ['相', '象'],
  4: ['马', '马'],
  5: ['车', '车'],
  6: ['炮', '炮'],
  7: ['兵', '卒']
};

const NAMES = {
  [KING]: '帅/将',
  [ADVISOR]: '仕/士',
  [ELEPHANT]: '相/象',
  [HORSE]: '马',
  [ROOK]: '车',
  [CANNON]: '炮',
  [PAWN]: '兵/卒'
};

const VAL = { [KING]: 12000, [ROOK]: 900, [CANNON]: 460, [HORSE]: 450, [ADVISOR]: 200, [ELEPHANT]: 200, [PAWN]: 100 };

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HORSE_OFF = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

const idx = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const signOf = v => (v > 0 ? 1 : -1);

export const meta = {
  id: 'xiangqi',
  name: '中国象棋',
  en: 'Xiangqi',
  tag: '将死对方主帅',
  goal: '九路十行的棋盘，红方在下、黑方在上，红先黑后。把对方的主帅（帅/将）将死，或让对方无子可动（困毙），即取得胜利。',
  seatNames: ['红方', '黑方'],
  seatColors: ['#c8402f', '#1d2027'],
  aspect: 0.9,
  seats: 2,
  rules: [
    { h: '棋盘与行军', p: '棋盘由 9 条竖线和 10 条横线组成，棋子走在交叉点上。中间「楚河汉界」把棋盘分为两半，红方在下、黑方在上，红方先行。' },
    { h: '棋子走法', p: '车走直线任意格；马走「日」字（紧邻方向有子会被蹩马腿）；炮走直线、但吃子必须隔一个棋子；相/象走「田」字且不能过河（塞象眼时不能走）；仕/士只能在九宫内斜走一步；帅/将只能在九宫内直走一步。' },
    { h: '兵与卒', p: '兵/卒未过河只能向前一步；过了河以后可以向前或左右横走一步，但永远不能后退。' },
    { h: '将军与将死', p: '一方棋子下一步能吃到对方主帅，叫「将军」，对方必须应将。若被将军且无法解将，即为「将死」，对方获胜；若没有被将军却无任何可走的棋，叫「困毙」，同样判负。' },
    { h: '白脸将', p: '双方主帅不能在同一条竖线上直接相对（中间无棋子）。任何会导致「白脸将」的走法都非法，这也是防守时常用的牵制手段。' }
  ],
  tips: [
    '车是威力最大的棋子，尽量早些出车、占据开阔的直线。',
    '马怕蹩腿：走马之前先看落脚点和「马腿」位置有没有子。',
    '炮需炮架才能吃子，用己方或对方的子作炮架，常常能暗藏杀机。',
    '兵过河后价值大增，但要留意它不能后退，别把兵推到无用之地。',
    '进攻时常用「双车错」「马后炮」「铁门栓」等组合，别只靠单个棋子硬冲。'
  ]
};

export function create(opts = {}) {
  const mode = opts.mode || 'pvp';
  const state = {
    id: 'xiangqi',
    mode,
    level: opts.level || 2,
    humanSeat: opts.humanSeat || 0,
    turn: 0,
    over: false,
    result: null,
    note: '红方先行，请选择要走的棋子',
    ply: 0,
    history: [],
    seats: [],
    board: new Array(W * H).fill(0),
    lastMove: null,
    selected: null,
    hints: []
  };

  const back = [ROOK, HORSE, ELEPHANT, ADVISOR, KING, ADVISOR, ELEPHANT, HORSE, ROOK];
  // 黑方在上（y=0），红方在下（y=9）
  for (let x = 0; x < W; x++) {
    state.board[idx(x, 0)] = -back[x];
    state.board[idx(x, 9)] = back[x];
  }
  state.board[idx(1, 2)] = -CANNON;
  state.board[idx(7, 2)] = -CANNON;
  state.board[idx(1, 7)] = CANNON;
  state.board[idx(7, 7)] = CANNON;
  for (const x of [0, 2, 4, 6, 8]) {
    state.board[idx(x, 3)] = -PAWN;
    state.board[idx(x, 6)] = PAWN;
  }

  state.seats = makeSeats(state, meta.seatNames);
  return state;
}

export function demo() {
  const s = create({ mode: 'pvp' });
  const seq = [
    { from: { x: 1, y: 7 }, to: { x: 1, y: 4 } },
    { from: { x: 7, y: 0 }, to: { x: 6, y: 2 } },
    { from: { x: 1, y: 9 }, to: { x: 2, y: 7 } },
    { from: { x: 4, y: 3 }, to: { x: 4, y: 4 } }
  ];
  for (const mv of seq) applyMove(s, mv);
  s.history = [];
  s.selected = null;
  s.hints = [];
  return s;
}

/* ---------------- 基础规则 ---------------- */

function inPalace(x, y, side) {
  if (x < 3 || x > 5) return false;
  return side > 0 ? y >= 7 && y <= 9 : y >= 0 && y <= 2;
}

function findKing(board, side) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = board[idx(x, y)];
      if (v && Math.abs(v) === KING && signOf(v) === side) return { x, y };
    }
  }
  return null;
}

/** 判断 (x,y) 是否被 side 一方攻击 */
function attacked(board, x, y, side) {
  // 车（以及贴身攻击的将）
  for (const [dx, dy] of ORTHO) {
    let nx = x + dx, ny = y + dy;
    while (inside(nx, ny)) {
      const v = board[idx(nx, ny)];
      if (v) {
        if (signOf(v) === side) {
          const p = Math.abs(v);
          if (p === ROOK) return true;
          if (p === KING && Math.abs(nx - x) + Math.abs(ny - y) === 1) return true;
        }
        break;
      }
      nx += dx;
      ny += dy;
    }
  }

  // 炮：隔一个棋子才能打到
  for (const [dx, dy] of ORTHO) {
    let nx = x + dx, ny = y + dy;
    let screens = 0;
    while (inside(nx, ny)) {
      const v = board[idx(nx, ny)];
      if (v) {
        if (screens === 1) {
          if (signOf(v) === side && Math.abs(v) === CANNON) return true;
          break;
        }
        screens++;
      }
      nx += dx;
      ny += dy;
    }
  }

  // 马
  for (const [dx, dy] of HORSE_OFF) {
    const ax = x + dx, ay = y + dy;
    if (!inside(ax, ay)) continue;
    const v = board[idx(ax, ay)];
    if (!v || signOf(v) !== side || Math.abs(v) !== HORSE) continue;
    const leg = Math.abs(dx) === 1
      ? { x: ax, y: ay + Math.sign(y - ay) }
      : { x: ax + Math.sign(x - ax), y: ay };
    if (!board[idx(leg.x, leg.y)]) return true;
  }

  // 相/象
  for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
    const ax = x + dx, ay = y + dy;
    if (!inside(ax, ay)) continue;
    const v = board[idx(ax, ay)];
    if (!v || signOf(v) !== side || Math.abs(v) !== ELEPHANT) continue;
    const ownSide = ay >= 5 ? 1 : -1;
    if (ownSide !== side) continue;
    if (!board[idx(x + dx / 2, y + dy / 2)]) return true;
  }

  // 仕/士
  for (const [dx, dy] of DIAG) {
    const ax = x + dx, ay = y + dy;
    if (!inside(ax, ay)) continue;
    const v = board[idx(ax, ay)];
    if (v && signOf(v) === side && Math.abs(v) === ADVISOR && inPalace(ax, ay, side)) return true;
  }

  // 兵/卒
  const pawnY = side > 0 ? y + 1 : y - 1;
  const ownRow = side > 0 ? y + 1 : y - 1;
  if (inside(x, pawnY)) {
    const v = board[idx(x, pawnY)];
    if (v && signOf(v) === side && Math.abs(v) === PAWN) {
      if (ownRow >= 0) return true;
    }
  }
  for (const dx of [-1, 1]) {
    if (!inside(x + dx, y)) continue;
    const v = board[idx(x + dx, y)];
    if (!v || signOf(v) !== side || Math.abs(v) !== PAWN) continue;
    const crossed = side > 0 ? y <= 4 : y >= 5;
    if (crossed) return true;
  }

  return false;
}

function kingsFacing(board) {
  let rk = null, bk = null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = board[idx(x, y)];
      if (!v || Math.abs(v) !== KING) continue;
      if (v > 0) rk = { x, y };
      else bk = { x, y };
    }
  }
  if (!rk || !bk || rk.x !== bk.x) return false;
  const x = rk.x;
  const y0 = Math.min(rk.y, bk.y), y1 = Math.max(rk.y, bk.y);
  for (let y = y0 + 1; y < y1; y++) {
    if (board[idx(x, y)]) return false;
  }
  return true;
}

function genPseudo(board, side) {
  const out = [];
  const push = (fx, fy, tx, ty) => {
    if (!inside(tx, ty)) return;
    const target = board[idx(tx, ty)];
    if (target && signOf(target) === side) return;
    out.push({ from: { x: fx, y: fy }, to: { x: tx, y: ty } });
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = board[idx(x, y)];
      if (!v || signOf(v) !== side) continue;
      const p = Math.abs(v);

      if (p === PAWN) {
        const fy = side > 0 ? y - 1 : y + 1;
        push(x, y, x, fy);
        const crossed = side > 0 ? y <= 4 : y >= 5;
        if (crossed) {
          push(x, y, x - 1, y);
          push(x, y, x + 1, y);
        }
      } else if (p === ADVISOR) {
        for (const [dx, dy] of DIAG) {
          const tx = x + dx, ty = y + dy;
          if (inPalace(tx, ty, side)) push(x, y, tx, ty);
        }
      } else if (p === ELEPHANT) {
        for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
          const tx = x + dx, ty = y + dy;
          if (!inside(tx, ty)) continue;
          const eye = board[idx(x + dx / 2, y + dy / 2)];
          if (eye) continue;
          const ownSide = side > 0 ? ty >= 5 : ty <= 4;
          if (!ownSide) continue;
          push(x, y, tx, ty);
        }
      } else if (p === HORSE) {
        for (const [dx, dy] of HORSE_OFF) {
          const tx = x + dx, ty = y + dy;
          if (!inside(tx, ty)) continue;
          const leg = Math.abs(dx) === 1
            ? { x, y: y + Math.sign(dy) }
            : { x: x + Math.sign(dx), y };
          if (board[idx(leg.x, leg.y)]) continue;
          push(x, y, tx, ty);
        }
      } else if (p === ROOK) {
        for (const [dx, dy] of ORTHO) {
          let tx = x + dx, ty = y + dy;
          while (inside(tx, ty)) {
            const t = board[idx(tx, ty)];
            if (!t) {
              out.push({ from: { x, y }, to: { x: tx, y: ty } });
            } else {
              if (signOf(t) !== side) out.push({ from: { x, y }, to: { x: tx, y: ty } });
              break;
            }
            tx += dx;
            ty += dy;
          }
        }
      } else if (p === CANNON) {
        for (const [dx, dy] of ORTHO) {
          let tx = x + dx, ty = y + dy;
          let screens = 0;
          while (inside(tx, ty)) {
            const t = board[idx(tx, ty)];
            if (!t) {
              if (screens === 0) out.push({ from: { x, y }, to: { x: tx, y: ty } });
            } else {
              if (screens === 0) {
                screens = 1;
              } else {
                if (signOf(t) !== side) out.push({ from: { x, y }, to: { x: tx, y: ty } });
                break;
              }
            }
            tx += dx;
            ty += dy;
          }
        }
      } else if (p === KING) {
        for (const [dx, dy] of ORTHO) {
          const tx = x + dx, ty = y + dy;
          if (inPalace(tx, ty, side)) push(x, y, tx, ty);
        }
      }
    }
  }
  return out;
}

/** 生成完全合法的走法（过滤送将与白脸将） */
function genLegal(board, side) {
  const pseudo = genPseudo(board, side);
  const out = [];
  const king = findKing(board, side);
  for (const m of pseudo) {
    const f = idx(m.from.x, m.from.y);
    const t = idx(m.to.x, m.to.y);
    const cap = board[t];
    board[t] = board[f];
    board[f] = 0;

    let ok = !kingsFacing(board);
    if (ok && king) {
      const kx = m.from.x === king.x && m.from.y === king.y ? m.to.x : king.x;
      const ky = m.from.x === king.x && m.from.y === king.y ? m.to.y : king.y;
      ok = !attacked(board, kx, ky, -side);
    }

    board[f] = board[t];
    board[t] = cap;
    if (ok) out.push(m);
  }
  return out;
}

function isLegalMove(board, move, side) {
  if (!move || !move.from || !move.to) return false;
  const f = idx(move.from.x, move.from.y);
  const t = idx(move.to.x, move.to.y);
  if (!inside(move.from.x, move.from.y) || !inside(move.to.x, move.to.y)) return false;
  const piece = board[f];
  if (!piece || signOf(piece) !== side) return false;
  for (const m of genLegal(board, side)) {
    if (m.from.x === move.from.x && m.from.y === move.from.y && m.to.x === move.to.x && m.to.y === move.to.y) return true;
  }
  return false;
}

function pieceName(v) {
  const p = Math.abs(v);
  const i = v > 0 ? 0 : 1;
  return CHARS[p][i];
}

/* ---------------- 走子 ---------------- */

export function applyMove(state, move) {
  if (!state || state.over || !move) return false;
  const side = state.turn === 0 ? 1 : -1;
  if (!isLegalMove(state.board, move, side)) return false;

  pushHistory(state, KEYS);

  const f = idx(move.from.x, move.from.y);
  const t = idx(move.to.x, move.to.y);
  const piece = state.board[f];
  const cap = state.board[t];
  state.board[t] = piece;
  state.board[f] = 0;

  state.ply++;
  state.lastMove = { from: { ...move.from }, to: { ...move.to }, piece: Math.abs(piece) };
  state.selected = null;
  state.hints = [];

  const mover = state.turn;
  const seat = state.seats[mover].name;
  let note = cap
    ? `${seat} ${pieceName(piece)} 吃掉 ${state.seats[1 - mover].name} ${pieceName(cap)}`
    : `${seat} ${pieceName(piece)} 移动`;

  state.turn = 1 - mover;

  const oppSide = -side;
  const oppKing = findKing(state.board, oppSide);
  const inCheck = !!(oppKing && attacked(state.board, oppKing.x, oppKing.y, side));
  const replies = genLegal(state.board, oppSide);

  if (replies.length === 0) {
    if (inCheck) {
      finish(state, mover, `${seat}将死对方，获胜！`, 'mate');
    } else {
      finish(state, mover, `${state.seats[1 - mover].name}无子可动，困毙判负`, 'stalemate');
    }
    note = state.result.text;
  } else if (inCheck) {
    note += '，将军！';
  }

  state.note = note;
  return true;
}

/* ---------------- 交互 ---------------- */

function layout(w, h) {
  // 四周各留 0.7 格：边线上的棋子（半径约 0.44 格）和选中光圈不会被画布裁掉
  const m = 0.7;
  const step = Math.min(w / (W - 1 + m * 2), h / (H - 1 + m * 2));
  return {
    step,
    x0: (w - step * (W - 1)) / 2,
    y0: (h - step * (H - 1)) / 2,
    w,
    h
  };
}

function hitPoint(pt) {
  const L = layout(pt.w, pt.h);
  const gx = Math.round((pt.x - L.x0) / L.step);
  const gy = Math.round((pt.y - L.y0) / L.step);
  if (!inside(gx, gy)) return null;
  const cx = L.x0 + gx * L.step;
  const cy = L.y0 + gy * L.step;
  if (Math.hypot(pt.x - cx, pt.y - cy) > L.step * 0.52) return null;
  return { x: gx, y: gy };
}

export function tap(state, pt) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  const p = hitPoint(pt);
  if (!p) return { ok: false, msg: '请点击棋盘交叉点' };
  const side = state.turn === 0 ? 1 : -1;
  const v = state.board[idx(p.x, p.y)];

  if (state.selected) {
    const sel = state.selected;
    if (p.x === sel.x && p.y === sel.y) {
      state.selected = null;
      state.hints = [];
      return { ok: true, moved: false };
    }
    if (v && signOf(v) === side) {
      selectPiece(state, p, side);
      return { ok: true, moved: false };
    }
    const canGo = state.hints.some(h => h.x === p.x && h.y === p.y);
    if (!canGo) return { ok: false, msg: '这个位置走不过去' };
    const ok = applyMove(state, { from: { x: sel.x, y: sel.y }, to: { x: p.x, y: p.y } });
    if (!ok) return { ok: false, msg: '不合规则的走法' };
    return { ok: true, moved: true };
  }

  if (v && signOf(v) === side) {
    selectPiece(state, p, side);
    return { ok: true, moved: false };
  }
  if (v) return { ok: false, msg: '那是对方的棋子' };
  return { ok: false, msg: '请先点选自己的棋子' };
}

function selectPiece(state, p, side) {
  state.selected = { x: p.x, y: p.y };
  const moves = genLegal(state.board, side);
  state.hints = moves
    .filter(m => m.from.x === p.x && m.from.y === p.y)
    .map(m => m.to);
}

export function undo(state) {
  const ok = popHistory(state, KEYS);
  if (ok) {
    state.selected = null;
    state.hints = [];
  }
  return ok;
}

export function actions() {
  return [];
}

/* ---------------- AI ---------------- */

function pst(p, x, y, side) {
  const yy = side > 0 ? y : 9 - y;
  if (p === PAWN) {
    const advance = (6 - yy) * 16;
    const crossed = yy <= 4 ? 34 : 0;
    return advance + crossed + (4 - Math.abs(x - 4)) * 2;
  }
  if (p === HORSE) return (4 - Math.abs(x - 4)) * 8 + (6 - Math.abs(yy - 7)) * 6;
  if (p === CANNON) return (4 - Math.abs(x - 4)) * 7;
  if (p === ROOK) return (4 - Math.abs(x - 4)) * 2;
  if (p === KING) return yy >= 8 ? 6 : 0;
  return 0;
}

function evaluate(board, side) {
  let score = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = board[idx(x, y)];
      if (!v) continue;
      const s = signOf(v);
      const p = Math.abs(v);
      score += s * (VAL[p] + pst(p, x, y, s));
    }
  }
  return score * (side > 0 ? 1 : -1);
}

function orderMoves(board, moves) {
  return moves.sort((a, b) => {
    const ca = board[idx(a.to.x, a.to.y)];
    const cb = board[idx(b.to.x, b.to.y)];
    const va = ca ? VAL[Math.abs(ca)] * 10 - VAL[Math.abs(board[idx(a.from.x, a.from.y)])] : 0;
    const vb = cb ? VAL[Math.abs(cb)] * 10 - VAL[Math.abs(board[idx(b.from.x, b.from.y)])] : 0;
    return vb - va;
  });
}

let searchAbort = false;

function search(board, side, depth, alpha, beta, deadline) {
  if (searchAbort) return 0;
  if (Date.now() > deadline) {
    searchAbort = true;
    return 0;
  }
  if (depth <= 0) return evaluate(board, side);

  const moves = genLegal(board, side);
  if (moves.length === 0) return -92000;
  orderMoves(board, moves);

  let best = -Infinity;
  for (const m of moves) {
    const f = idx(m.from.x, m.from.y);
    const t = idx(m.to.x, m.to.y);
    const cap = board[t];
    board[t] = board[f];
    board[f] = 0;
    const v = -search(board, -side, depth - 1, -beta, -alpha, deadline);
    board[f] = board[t];
    board[t] = cap;
    if (searchAbort) return best === -Infinity ? 0 : best;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function quickScore(board, m, side) {
  const cap = board[idx(m.to.x, m.to.y)];
  const piece = Math.abs(board[idx(m.from.x, m.from.y)]);
  let score = 0;
  if (cap) score += VAL[Math.abs(cap)] * 10 - VAL[piece];
  score += pst(piece, m.to.x, m.to.y, side) - pst(piece, m.from.x, m.from.y, side);
  return score;
}

export function aiMove(state) {
  if (!state || state.over) return null;
  const side = state.turn === 0 ? 1 : -1;
  const board = state.board.slice();
  const moves = genLegal(board, side);
  if (!moves.length) return null;
  orderMoves(board, moves);

  const level = state.level || 2;

  if (level === 1) {
    const scored = moves.map(m => ({ m, s: quickScore(board, m, side) + Math.random() * 120 }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, Math.max(2, Math.ceil(scored.length * 0.45)));
    return top[Math.floor(Math.random() * top.length)].m;
  }

  const maxDepth = level === 2 ? 2 : 4;
  const deadline = Date.now() + (level === 2 ? 420 : 1250);
  searchAbort = false;
  let best = moves[0];

  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -Infinity;
    let bestVal = -Infinity;
    let localBest = null;
    for (const m of moves) {
      const f = idx(m.from.x, m.from.y);
      const t = idx(m.to.x, m.to.y);
      const cap = board[t];
      board[t] = board[f];
      board[f] = 0;
      const v = -search(board, -side, depth - 1, -Infinity, -alpha, deadline);
      board[f] = board[t];
      board[t] = cap;
      if (searchAbort) break;
      if (v > bestVal) {
        bestVal = v;
        localBest = m;
      }
      if (v > alpha) alpha = v;
    }
    if (searchAbort) break;
    if (localBest) best = localBest;
    if (bestVal > 80000) break;
    if (Date.now() > deadline) break;
  }

  return best;
}

/* ---------------- 绘制 ---------------- */

export function draw(ctx, state, g) {
  const { w, h } = g;
  boardSurface(ctx, w, h, PALETTE.wood);
  const L = layout(w, h);
  const step = L.step;
  const endX = step * (W - 1);
  const endY = step * (H - 1);

  // 棋盘内衬
  ctx.save();
  ctx.fillStyle = 'rgba(247,229,193,0.94)';
  roundRect(ctx, L.x0 - step * 0.55, L.y0 - step * 0.55, endX + step * 1.1, endY + step * 1.1, step * 0.18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(122,78,38,0.55)';
  ctx.lineWidth = Math.max(1.5, step * 0.035);
  ctx.stroke();
  ctx.restore();

  // 网格
  ctx.save();
  ctx.strokeStyle = 'rgba(74,44,18,0.72)';
  ctx.lineWidth = Math.max(1, step * 0.028);
  for (let y = 0; y < H; y++) {
    ctx.beginPath();
    ctx.moveTo(L.x0, L.y0 + y * step);
    ctx.lineTo(L.x0 + endX, L.y0 + y * step);
    ctx.stroke();
  }
  for (let x = 0; x < W; x++) {
    const px = L.x0 + x * step;
    if (x === 0 || x === W - 1) {
      ctx.beginPath();
      ctx.moveTo(px, L.y0);
      ctx.lineTo(px, L.y0 + endY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(px, L.y0);
      ctx.lineTo(px, L.y0 + step * 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, L.y0 + step * 5);
      ctx.lineTo(px, L.y0 + endY);
      ctx.stroke();
    }
  }

  // 外框
  ctx.lineWidth = Math.max(2, step * 0.06);
  ctx.strokeRect(L.x0, L.y0, endX, endY);

  // 九宫斜线
  ctx.lineWidth = Math.max(1, step * 0.026);
  for (const y0 of [0, 7]) {
    ctx.beginPath();
    ctx.moveTo(L.x0 + 3 * step, L.y0 + y0 * step);
    ctx.lineTo(L.x0 + 5 * step, L.y0 + (y0 + 2) * step);
    ctx.moveTo(L.x0 + 5 * step, L.y0 + y0 * step);
    ctx.lineTo(L.x0 + 3 * step, L.y0 + (y0 + 2) * step);
    ctx.stroke();
  }
  ctx.restore();

  // 楚河汉界
  const riverY = L.y0 + step * 4.5;
  ctx.save();
  ctx.fillStyle = 'rgba(96,58,26,0.62)';
  ctx.font = `600 ${Math.max(10, step * 0.56)}px "STKaiti", "KaiTi", "Songti SC", "Microsoft YaHei", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('楚  河', L.x0 + step * 2.1, riverY);
  ctx.fillText('汉  界', L.x0 + step * 6.1, riverY);
  ctx.restore();

  // 将军提示：被攻击的帅/将红光
  const checkedSide = state.turn === 0 ? 1 : -1;
  const king = findKing(state.board, checkedSide);
  const inCheck = !state.over && king && attacked(state.board, king.x, king.y, -checkedSide);

  const r = step * 0.44;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = state.board[idx(x, y)];
      if (!v) continue;
      const cx = L.x0 + x * step;
      const cy = L.y0 + y * step;
      const red = v > 0;
      discPiece(ctx, cx, cy, r, red ? 'red' : 'black', pieceName(v), r * 1.12);
    }
  }

  // 可走点提示
  for (const p of state.hints || []) {
    const cx = L.x0 + p.x * step;
    const cy = L.y0 + p.y * step;
    const occupied = !!state.board[idx(p.x, p.y)];
    ctx.beginPath();
    ctx.arc(cx, cy, step * (occupied ? 0.42 : 0.17), 0, Math.PI * 2);
    ctx.fillStyle = occupied ? 'rgba(196,62,45,0.28)' : 'rgba(56,110,64,0.5)';
    ctx.fill();
  }

  // 选中
  if (state.selected) {
    const cx = L.x0 + state.selected.x * step;
    const cy = L.y0 + state.selected.y * step;
    halo(ctx, cx, cy, r * 1.05, 'rgba(255,196,84,0.95)', Math.max(2, step * 0.06));
  }

  // 最后一步
  if (state.lastMove) {
    for (const p of [state.lastMove.from, state.lastMove.to]) {
      const cx = L.x0 + p.x * step;
      const cy = L.y0 + p.y * step;
      ctx.save();
      ctx.strokeStyle = 'rgba(250,168,60,0.9)';
      ctx.lineWidth = Math.max(2, step * 0.045);
      const s = step * 0.2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * r, cy + sy * r - sy * s);
        ctx.lineTo(cx + sx * r, cy + sy * r);
        ctx.lineTo(cx + sx * r - sx * s, cy + sy * r);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  if (inCheck && king) {
    const cx = L.x0 + king.x * step;
    const cy = L.y0 + king.y * step;
    halo(ctx, cx, cy, r * 1.16, 'rgba(255,80,60,0.95)', Math.max(2, step * 0.07));
  }
}
