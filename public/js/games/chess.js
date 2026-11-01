// 国际象棋：8×8，白先，含王车易位、吃过路兵、兵升变、将死/逼和/三次重复/50 回合
import { pushHistory, popHistory, finish, makeSeats } from './_util.js';
import { boardSurface, PALETTE, halo, roundRect } from './_draw.js';

const W = 8;
const KEYS = ['board', 'castling', 'ep', 'halfmove', 'turn', 'lastMove', 'ply', 'over', 'result', 'note', 'reps'];

const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;

const VAL = { [PAWN]: 100, [KNIGHT]: 320, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 0 };
const NAMES = ['', '兵', '马', '象', '车', '后', '王'];
const KNIGHT_OFF = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const idx = (x, y) => y * W + x;
const onBoard = (x, y) => x >= 0 && y >= 0 && x < W && y < W;
const signOf = v => (v > 0 ? 1 : -1);

export const meta = {
  id: 'chess',
  name: '国际象棋',
  en: 'Chess',
  tag: '将死对方国王',
  goal: '8×8 的棋盘，白方在下、黑方在上，白先。通过吃子、控制中心与将军，把对方的国王将死即获胜；无子可动但未被将军则判「逼和」。',
  seatNames: ['白方', '黑方'],
  seatColors: ['#f1ead6', '#23262d'],
  aspect: 1,
  seats: 2,
  rules: [
    { h: '棋子走法', p: '兵向前走一格（起始可走两格），吃子则斜前一格；马走「日」字可越子；象走斜线；车走直线；后横竖斜任意格；王每次只走一格。' },
    { h: '特殊走法', p: '王车易位：王向一侧走两格、车跳到王的内侧，要求王与车都没动过、中间无子、王不在被将且经过的格不被攻击。吃过路兵：对方的兵直走两格经过你兵的斜吃格时，可立即斜吃它。' },
    { h: '兵升变', p: '兵走到对方底线时，可升变为后、车、象或马。本作自动升变为「后」，并在提示中说明。' },
    { h: '将死与逼和', p: '被将军且没有任何解将的走法即「将死」，对方获胜。若没有被将军却无合法走法，则判「逼和」，双方和棋。' },
    { h: '和棋规则', p: '同一局面出现三次、连续 50 回合没有吃子也没有兵移动、或双方子力不足以将死对方时，均判和棋。' }
  ],
  tips: [
    '开局先出马、象、兵，尽快王车易位保护国王，别急着冒进。',
    '兵是棋盘的骨架，兵形好坏往往决定中局强弱。',
    '车要占开阔的直线或次底线；后不要过早出动被对方追打。',
    '交换子力前算清价值：马≈象≈3 兵，车≈5 兵，后≈9 兵。',
    '残局中王是强力棋子，要主动走向中心参与进攻或掩护兵升变。'
  ]
};

export function create(opts = {}) {
  const mode = opts.mode || 'pvp';
  const b = new Array(64).fill(0);
  const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
  for (let x = 0; x < W; x++) {
    b[idx(x, 0)] = -back[x];
    b[idx(x, 1)] = -PAWN;
    b[idx(x, 6)] = PAWN;
    b[idx(x, 7)] = back[x];
  }

  const state = {
    id: 'chess',
    mode,
    level: opts.level || 2,
    humanSeat: opts.humanSeat || 0,
    turn: 0,
    over: false,
    result: null,
    note: '白方先行，请选择要走的棋子',
    ply: 0,
    history: [],
    seats: [],
    board: b,
    castling: 15,
    ep: null,
    halfmove: 0,
    lastMove: null,
    selected: null,
    hints: [],
    reps: []
  };
  state.reps = [positionKey({ board: b, castling: 15, ep: null, turn: 1 })];
  state.seats = makeSeats(state, meta.seatNames);
  return state;
}

export function demo() {
  const s = create({ mode: 'pvp' });
  const seq = [
    { from: { x: 4, y: 6 }, to: { x: 4, y: 4 } },
    { from: { x: 4, y: 1 }, to: { x: 4, y: 3 } },
    { from: { x: 6, y: 7 }, to: { x: 5, y: 5 } },
    { from: { x: 6, y: 0 }, to: { x: 5, y: 2 } }
  ];
  for (const mv of seq) applyMove(s, mv);
  s.history = [];
  s.reps = [];
  s.selected = null;
  s.hints = [];
  return s;
}

/* ---------------- 局面工具 ---------------- */

function positionKey(pos) {
  const ep = pos.ep ? `${pos.ep.x},${pos.ep.y}` : '-';
  return `${pos.board.join('')}|${pos.castling}|${ep}|${pos.turn}`;
}

function findKing(board, side) {
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (v && Math.abs(v) === KING && signOf(v) === side) return { x: i % W, y: Math.floor(i / W) };
  }
  return null;
}

function isAttacked(board, x, y, by) {
  const b = board;

  for (const [dx, dy] of ORTHO) {
    let nx = x + dx, ny = y + dy;
    while (onBoard(nx, ny)) {
      const v = b[idx(nx, ny)];
      if (v) {
        if (signOf(v) === by) {
          const p = Math.abs(v);
          if (p === ROOK || p === QUEEN) return true;
          if (p === KING && Math.abs(nx - x) + Math.abs(ny - y) === 1) return true;
        }
        break;
      }
      nx += dx;
      ny += dy;
    }
  }

  for (const [dx, dy] of DIAG) {
    let nx = x + dx, ny = y + dy;
    while (onBoard(nx, ny)) {
      const v = b[idx(nx, ny)];
      if (v) {
        if (signOf(v) === by) {
          const p = Math.abs(v);
          if (p === BISHOP || p === QUEEN) return true;
        }
        break;
      }
      nx += dx;
      ny += dy;
    }
  }

  for (const [dx, dy] of KNIGHT_OFF) {
    const nx = x + dx, ny = y + dy;
    if (!onBoard(nx, ny)) continue;
    const v = b[idx(nx, ny)];
    if (v && signOf(v) === by && Math.abs(v) === KNIGHT) return true;
  }

  // 兵：白兵从下方斜上吃，黑兵从上方斜下吃
  const py = by > 0 ? y + 1 : y - 1;
  for (const dx of [-1, 1]) {
    const nx = x + dx;
    if (!onBoard(nx, py)) continue;
    const v = b[idx(nx, py)];
    if (v && signOf(v) === by && Math.abs(v) === PAWN) return true;
  }

  return false;
}

function inCheck(board, side) {
  const k = findKing(board, side);
  return !!k && isAttacked(board, k.x, k.y, -side);
}

/** 生成伪合法走法（未过滤送将） */
function genPseudo(pos, side) {
  const b = pos.board;
  const out = [];
  const add = (fx, fy, tx, ty, extra) => {
    if (!onBoard(tx, ty)) return;
    const target = b[idx(tx, ty)];
    if (target && signOf(target) === side) return;
    out.push({ from: { x: fx, y: fy }, to: { x: tx, y: ty }, ...(extra || {}) });
  };

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const v = b[idx(x, y)];
      if (!v || signOf(v) !== side) continue;
      const p = Math.abs(v);

      if (p === PAWN) {
        const dir = side > 0 ? -1 : 1;
        const startY = side > 0 ? 6 : 1;
        const lastY = side > 0 ? 0 : 7;
        const oneY = y + dir;
        if (onBoard(x, oneY) && !b[idx(x, oneY)]) {
          add(x, y, x, oneY, oneY === lastY ? { promo: QUEEN } : null);
          const twoY = y + dir * 2;
          if (y === startY && !b[idx(x, twoY)]) add(x, y, x, twoY);
        }
        for (const dx of [-1, 1]) {
          const tx = x + dx, ty = y + dir;
          if (!onBoard(tx, ty)) continue;
          const t = b[idx(tx, ty)];
          if (t && signOf(t) !== side) add(x, y, tx, ty, ty === lastY ? { promo: QUEEN } : null);
          else if (!t && pos.ep && pos.ep.x === tx && pos.ep.y === ty) add(x, y, tx, ty, { ep: true });
        }
      } else if (p === KNIGHT) {
        for (const [dx, dy] of KNIGHT_OFF) add(x, y, x + dx, y + dy);
      } else if (p === BISHOP) {
        for (const [dx, dy] of DIAG) {
          let tx = x + dx, ty = y + dy;
          while (onBoard(tx, ty)) {
            const t = b[idx(tx, ty)];
            if (t) {
              if (signOf(t) !== side) out.push({ from: { x, y }, to: { x: tx, y: ty } });
              break;
            }
            out.push({ from: { x, y }, to: { x: tx, y: ty } });
            tx += dx;
            ty += dy;
          }
        }
      } else if (p === ROOK) {
        for (const [dx, dy] of ORTHO) {
          let tx = x + dx, ty = y + dy;
          while (onBoard(tx, ty)) {
            const t = b[idx(tx, ty)];
            if (t) {
              if (signOf(t) !== side) out.push({ from: { x, y }, to: { x: tx, y: ty } });
              break;
            }
            out.push({ from: { x, y }, to: { x: tx, y: ty } });
            tx += dx;
            ty += dy;
          }
        }
      } else if (p === QUEEN) {
        for (const [dx, dy] of [...ORTHO, ...DIAG]) {
          let tx = x + dx, ty = y + dy;
          while (onBoard(tx, ty)) {
            const t = b[idx(tx, ty)];
            if (t) {
              if (signOf(t) !== side) out.push({ from: { x, y }, to: { x: tx, y: ty } });
              break;
            }
            out.push({ from: { x, y }, to: { x: tx, y: ty } });
            tx += dx;
            ty += dy;
          }
        }
      } else if (p === KING) {
        for (const [dx, dy] of [...ORTHO, ...DIAG]) add(x, y, x + dx, y + dy);

        // 王车易位
        const rank = side > 0 ? 7 : 0;
        const rights = pos.castling;
        const kSideRight = side > 0 ? 1 : 4;
        const qSideRight = side > 0 ? 2 : 8;
        if (y === rank && x === 4 && !isAttacked(b, 4, rank, -side)) {
          if ((rights & kSideRight) && !b[idx(5, rank)] && !b[idx(6, rank)]
            && !isAttacked(b, 5, rank, -side) && !isAttacked(b, 6, rank, -side)) {
            out.push({ from: { x: 4, y: rank }, to: { x: 6, y: rank }, castle: 'K' });
          }
          if ((rights & qSideRight) && !b[idx(3, rank)] && !b[idx(2, rank)] && !b[idx(1, rank)]
            && !isAttacked(b, 3, rank, -side) && !isAttacked(b, 2, rank, -side)) {
            out.push({ from: { x: 4, y: rank }, to: { x: 2, y: rank }, castle: 'Q' });
          }
        }
      }
    }
  }
  return out;
}

/** 执行一步（就地修改 pos），返回用于撤销的信息 */
function doMove(pos, m) {
  const b = pos.board;
  const f = idx(m.from.x, m.from.y);
  const t = idx(m.to.x, m.to.y);
  const piece = b[f];
  const cap = b[t];
  const undo = { f, t, piece, cap, capEp: null, castle: null, castling: pos.castling, ep: pos.ep, half: pos.halfmove };

  b[f] = 0;
  b[t] = piece;

  if (m.ep) {
    const es = idx(m.to.x, m.from.y);
    undo.capEp = { sq: es, piece: b[es] };
    b[es] = 0;
  }
  if (m.castle) {
    const rank = m.from.y;
    if (m.castle === 'K') {
      const rf = idx(7, rank), rt = idx(5, rank);
      undo.castle = { from: rf, to: rt };
      b[rt] = b[rf];
      b[rf] = 0;
    } else {
      const rf = idx(0, rank), rt = idx(3, rank);
      undo.castle = { from: rf, to: rt };
      b[rt] = b[rf];
      b[rf] = 0;
    }
  }
  if (m.promo) b[t] = m.promo * signOf(piece);

  let c = pos.castling;
  const ap = Math.abs(piece);
  if (ap === KING) c &= signOf(piece) > 0 ? ~3 : ~12;
  if (ap === ROOK) {
    if (m.from.x === 0) c &= signOf(piece) > 0 ? ~2 : ~8;
    else if (m.from.x === 7) c &= signOf(piece) > 0 ? ~1 : ~4;
  }
  if (cap && Math.abs(cap) === ROOK) {
    if (m.to.x === 0) c &= signOf(cap) > 0 ? ~2 : ~8;
    else if (m.to.x === 7) c &= signOf(cap) > 0 ? ~1 : ~4;
  }
  pos.castling = c;

  pos.ep = ap === PAWN && Math.abs(m.to.y - m.from.y) === 2
    ? { x: m.from.x, y: (m.from.y + m.to.y) / 2 }
    : null;
  pos.halfmove = (ap === PAWN || !!cap || !!m.ep) ? 0 : pos.halfmove + 1;
  pos.turn = -pos.turn;
  return undo;
}

function undoMove(pos, m, u) {
  const b = pos.board;
  if (u.castle) {
    b[u.castle.from] = b[u.castle.to];
    b[u.castle.to] = 0;
  }
  b[u.f] = u.piece;
  b[u.t] = u.cap || 0;
  if (u.capEp) b[u.capEp.sq] = u.capEp.piece;
  pos.castling = u.castling;
  pos.ep = u.ep;
  pos.halfmove = u.half;
  pos.turn = -pos.turn;
}

function genLegal(pos) {
  const side = pos.turn;
  const pseudo = genPseudo(pos, side);
  const out = [];
  for (const m of pseudo) {
    const u = doMove(pos, m);
    if (!inCheck(pos.board, side)) out.push(m);
    undoMove(pos, m, u);
  }
  return out;
}

function insufficientMaterial(board) {
  const pieces = [];
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (v) pieces.push({ v, x: i % W, y: Math.floor(i / W) });
  }
  if (pieces.some(p => {
    const t = Math.abs(p.v);
    return t === PAWN || t === ROOK || t === QUEEN;
  })) return false;
  const minors = pieces.filter(p => {
    const t = Math.abs(p.v);
    return t === KNIGHT || t === BISHOP;
  });
  if (minors.length === 0) return true;
  if (minors.length === 1) return true;
  if (minors.length === 2 && minors.every(p => Math.abs(p.v) === BISHOP)) {
    return ((minors[0].x + minors[0].y) % 2) === ((minors[1].x + minors[1].y) % 2);
  }
  return false;
}

/* ---------------- 走子 ---------------- */

export function applyMove(state, move) {
  if (!state || state.over || !move || !move.from || !move.to) return false;
  const side = state.turn === 0 ? 1 : -1;
  const legal = genLegal({ board: state.board, castling: state.castling, ep: state.ep, turn: side, halfmove: state.halfmove });
  const canon = legal.find(m => m.from.x === move.from.x && m.from.y === move.from.y && m.to.x === move.to.x && m.to.y === move.to.y);
  if (!canon) return false;

  pushHistory(state, KEYS);

  const mover = state.turn;
  const cap = state.board[idx(canon.to.x, canon.to.y)];
  const movedPiece = state.board[idx(canon.from.x, canon.from.y)];

  const view = {
    board: state.board,
    castling: state.castling,
    ep: state.ep,
    halfmove: state.halfmove,
    turn: side
  };
  doMove(view, canon);
  state.castling = view.castling;
  state.ep = view.ep;
  state.halfmove = view.halfmove;

  state.ply++;
  state.lastMove = { from: { ...canon.from }, to: { ...canon.to } };
  state.selected = null;
  state.hints = [];
  state.turn = 1 - mover;

  const seat = state.seats[mover].name;
  const oppSeat = state.seats[1 - mover].name;
  let note = '';

  if (canon.castle) {
    note = `${seat} 王车易位`;
  } else if (canon.ep) {
    note = `${seat} ${NAMES[PAWN]} 吃过路兵，吃掉 ${oppSeat} ${NAMES[PAWN]}`;
  } else if (canon.promo) {
    note = cap
      ? `${seat} ${NAMES[PAWN]} 升变为后，吃掉 ${oppSeat} ${NAMES[Math.abs(cap)]}`
      : `${seat} ${NAMES[PAWN]} 升变为后`;
  } else if (cap) {
    note = `${seat} ${NAMES[Math.abs(movedPiece)]} 吃掉 ${oppSeat} ${NAMES[Math.abs(cap)]}`;
  } else {
    note = `${seat} ${NAMES[Math.abs(movedPiece)]} 移动`;
  }

  // 局面记录（三次重复）
  const key = positionKey({ board: state.board, castling: state.castling, ep: state.ep, turn: state.turn === 0 ? 1 : -1 });
  if (!state.reps) state.reps = [];
  state.reps.push(key);
  if (state.reps.length > 120) state.reps.shift();
  const repeats = state.reps.filter(k => k === key).length;

  const oppSide = -side;
  const checked = inCheck(state.board, oppSide);
  const replies = genLegal({
    board: state.board, castling: state.castling, ep: state.ep, turn: oppSide, halfmove: state.halfmove
  });

  if (replies.length === 0) {
    if (checked) {
      finish(state, mover, `${seat}将死对方，获胜！`, 'mate');
    } else {
      finish(state, null, `逼和：${oppSeat}无子可动，双方和棋`, 'stalemate');
    }
    note = state.result.text;
  } else if (checked) {
    note += '，将军！';
  } else if (repeats >= 3) {
    finish(state, null, '同一局面重复三次，判为和棋', 'repetition');
    note = state.result.text;
  } else if (state.halfmove >= 100) {
    finish(state, null, '连续 50 回合无吃子无兵动，判为和棋', 'fifty');
    note = state.result.text;
  } else if (insufficientMaterial(state.board)) {
    finish(state, null, '双方子力不足以将死对方，判为和棋', 'material');
    note = state.result.text;
  }

  state.note = note;
  return true;
}

/* ---------------- 交互 ---------------- */

function layout(w, h) {
  const size = Math.min(w, h);
  const pad = size * 0.055;
  const cell = (size - pad * 2) / W;
  return { size, pad, cell, x0: (w - size) / 2 + pad, y0: (h - size) / 2 + pad, w, h };
}

function squareAt(pt) {
  const L = layout(pt.w, pt.h);
  const gx = Math.floor((pt.x - L.x0) / L.cell);
  const gy = Math.floor((pt.y - L.y0) / L.cell);
  if (!onBoard(gx, gy)) return null;
  return { x: gx, y: gy };
}

export function tap(state, pt) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  const p = squareAt(pt);
  if (!p) return { ok: false, msg: '请点击棋盘内的格子' };
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
    if (!canGo) {
      // 王车易位的目标格不在普通提示里，直接尝试走子
      const ok = applyMove(state, { from: { x: sel.x, y: sel.y }, to: { x: p.x, y: p.y } });
      if (ok) return { ok: true, moved: true };
      return { ok: false, msg: '这个位置走不过去' };
    }
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
  const legal = genLegal({
    board: state.board, castling: state.castling, ep: state.ep, turn: side, halfmove: state.halfmove
  });
  state.hints = legal
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
  const yy = side > 0 ? y : 7 - y;
  if (p === PAWN) {
    return (6 - yy) * 9 + (3.5 - Math.abs(x - 3.5)) * 3;
  }
  if (p === KNIGHT) return (3.5 - Math.abs(x - 3.5)) * 14 + (3.5 - Math.abs(yy - 3.5)) * 10;
  if (p === BISHOP) return (3.5 - Math.abs(x - 3.5)) * 6 + (3.5 - Math.abs(yy - 3.5)) * 4;
  if (p === ROOK) return yy <= 1 ? 22 : 0;
  if (p === QUEEN) return (3.5 - Math.abs(x - 3.5)) * 4;
  if (p === KING) return yy >= 6 ? 12 : -8;
  return 0;
}

function evaluate(board, side) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (!v) continue;
    const s = signOf(v);
    const p = Math.abs(v);
    const x = i % W;
    const y = Math.floor(i / W);
    score += s * (VAL[p] + pst(p, x, y, s));
  }
  return score * (side > 0 ? 1 : -1);
}

function moveScore(board, m) {
  const cap = board[idx(m.to.x, m.to.y)];
  const attacker = Math.abs(board[idx(m.from.x, m.from.y)]);
  let score = 0;
  if (cap) score += VAL[Math.abs(cap)] * 10 - attacker;
  if (m.promo) score += 800;
  if (m.castle) score += 60;
  return score;
}

function orderMoves(board, moves) {
  return moves.sort((a, b) => moveScore(board, b) - moveScore(board, a));
}

let aborted = false;

function quiesce(pos, alpha, beta, deadline, depth) {
  if (aborted) return alpha;
  if (Date.now() > deadline) {
    aborted = true;
    return alpha;
  }
  const stand = evaluate(pos.board, pos.turn);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;

  const moves = genLegal(pos).filter(m => pos.board[idx(m.to.x, m.to.y)] || m.ep || m.promo);
  orderMoves(pos.board, moves);
  for (const m of moves) {
    const u = doMove(pos, m);
    const v = -quiesce(pos, -beta, -alpha, deadline, depth - 1);
    undoMove(pos, m, u);
    if (aborted) return alpha;
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(pos, depth, alpha, beta, deadline) {
  if (aborted) return 0;
  if (Date.now() > deadline) {
    aborted = true;
    return 0;
  }
  if (depth <= 0) return quiesce(pos, alpha, beta, deadline, 3);

  const moves = genLegal(pos);
  if (moves.length === 0) {
    return inCheck(pos.board, pos.turn) ? -99000 : 0;
  }
  orderMoves(pos.board, moves);

  let best = -Infinity;
  for (const m of moves) {
    const u = doMove(pos, m);
    const v = -negamax(pos, depth - 1, -beta, -alpha, deadline);
    undoMove(pos, m, u);
    if (aborted) return best === -Infinity ? 0 : best;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export function aiMove(state) {
  if (!state || state.over) return null;
  const side = state.turn === 0 ? 1 : -1;
  const pos = {
    board: state.board.slice(),
    castling: state.castling,
    ep: state.ep ? { ...state.ep } : null,
    halfmove: state.halfmove,
    turn: side
  };

  const moves = genLegal(pos);
  if (!moves.length) return null;
  orderMoves(pos.board, moves);

  const level = state.level || 2;

  if (level === 1) {
    const scored = moves.map(m => {
      const u = doMove(pos, m);
      const s = -evaluate(pos.board, -side) + Math.random() * 120;
      undoMove(pos, m, u);
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, Math.max(2, Math.ceil(scored.length * 0.5)));
    return top[Math.floor(Math.random() * top.length)].m;
  }

  const maxDepth = level === 2 ? 2 : 4;
  const deadline = Date.now() + (level === 2 ? 420 : 1500);
  aborted = false;
  let best = moves[0];

  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -Infinity;
    let bestVal = -Infinity;
    let localBest = null;
    for (const m of moves) {
      const u = doMove(pos, m);
      let v = -negamax(pos, depth - 1, -Infinity, -alpha, deadline);
      undoMove(pos, m, u);
      if (aborted) break;
      if (level >= 3 && depth >= 2) v += Math.random() * 6;
      if (v > bestVal) {
        bestVal = v;
        localBest = m;
      }
      if (v > alpha) alpha = v;
    }
    if (aborted) break;
    if (localBest) best = localBest;
    if (bestVal > 90000) break;
    if (Date.now() > deadline) break;
  }
  return best;
}

/* ---------------- 绘制 ---------------- */

const GLYPHS = {
  white: ['', '♙', '♘', '♗', '♖', '♕', '♔'],
  black: ['', '♟', '♞', '♝', '♜', '♛', '♚']
};

export function draw(ctx, state, g) {
  const { w, h } = g;
  boardSurface(ctx, w, h, PALETTE.ink);
  const L = layout(w, h);
  const cell = L.cell;

  // 棋盘外框
  ctx.save();
  ctx.fillStyle = 'rgba(20,22,28,0.9)';
  roundRect(ctx, L.x0 - cell * 0.28, L.y0 - cell * 0.28, cell * W + cell * 0.56, cell * W + cell * 0.56, cell * 0.14);
  ctx.fill();
  ctx.restore();

  // 深浅格
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const px = L.x0 + x * cell;
      const py = L.y0 + y * cell;
      ctx.fillStyle = (x + y) % 2 === 0 ? '#efd9b4' : '#a9743f';
      ctx.fillRect(px, py, cell, cell);
    }
  }

  // 最后一步
  if (state.lastMove) {
    for (const p of [state.lastMove.from, state.lastMove.to]) {
      ctx.fillStyle = 'rgba(255,206,90,0.32)';
      ctx.fillRect(L.x0 + p.x * cell, L.y0 + p.y * cell, cell, cell);
    }
  }

  // 可走点
  for (const p of state.hints || []) {
    const cx = L.x0 + (p.x + 0.5) * cell;
    const cy = L.y0 + (p.y + 0.5) * cell;
    const occupied = !!state.board[idx(p.x, p.y)];
    if (occupied) {
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.44, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(206,64,48,0.85)';
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(48,86,60,0.62)';
      ctx.fill();
    }
  }

  // 棋子
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const v = state.board[idx(x, y)];
      if (!v) continue;
      const px = L.x0 + (x + 0.5) * cell;
      const py = L.y0 + (y + 0.5) * cell;
      const glyph = GLYPHS[v > 0 ? 'white' : 'black'][Math.abs(v)];
      const size = cell * 0.82;
      ctx.font = `${size}px "Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols2", "DejaVu Sans", serif`;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = cell * 0.08;
      ctx.shadowOffsetY = cell * 0.04;
      if (v > 0) {
        ctx.strokeStyle = 'rgba(42,30,16,0.9)';
        ctx.lineWidth = Math.max(1.6, cell * 0.055);
        ctx.strokeText(glyph, px, py + cell * 0.02);
        ctx.fillStyle = '#fbf7ee';
        ctx.fillText(glyph, px, py + cell * 0.02);
      } else {
        ctx.strokeStyle = 'rgba(235,225,200,0.55)';
        ctx.lineWidth = Math.max(1.2, cell * 0.04);
        ctx.strokeText(glyph, px, py + cell * 0.02);
        ctx.fillStyle = '#15171c';
        ctx.fillText(glyph, px, py + cell * 0.02);
      }
      ctx.restore();
    }
  }
  ctx.restore();

  // 选中
  if (state.selected) {
    const cx = L.x0 + (state.selected.x + 0.5) * cell;
    const cy = L.y0 + (state.selected.y + 0.5) * cell;
    ctx.strokeStyle = 'rgba(255,205,90,0.95)';
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.strokeRect(L.x0 + state.selected.x * cell + cell * 0.05, L.y0 + state.selected.y * cell + cell * 0.05, cell * 0.9, cell * 0.9);
  }

  // 被将军的王
  const side = state.turn === 0 ? 1 : -1;
  const king = findKing(state.board, side);
  if (!state.over && king && isAttacked(state.board, king.x, king.y, -side)) {
    const cx = L.x0 + (king.x + 0.5) * cell;
    const cy = L.y0 + (king.y + 0.5) * cell;
    const grad = ctx.createRadialGradient(cx, cy, cell * 0.1, cx, cy, cell * 0.6);
    grad.addColorStop(0, 'rgba(255,70,55,0.55)');
    grad.addColorStop(1, 'rgba(255,70,55,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.6, 0, Math.PI * 2);
    ctx.fill();
    halo(ctx, cx, cy, cell * 0.55, 'rgba(255,90,70,0.9)', Math.max(2, cell * 0.06));
  }

  // 坐标
  ctx.save();
  ctx.font = `600 ${cell * 0.24}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = 'rgba(240,228,204,0.55)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let x = 0; x < W; x++) {
    ctx.fillText('abcdefgh'[x], L.x0 + (x + 0.5) * cell, L.y0 + W * cell + cell * 0.32);
  }
  ctx.textAlign = 'right';
  for (let y = 0; y < W; y++) {
    ctx.fillText(String(8 - y), L.x0 - cell * 0.16, L.y0 + (y + 0.5) * cell);
  }
  ctx.restore();
}
