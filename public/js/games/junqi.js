// 二人军棋（陆战棋）：5×12 棋盘，随机合法布阵，明暗交战，吃军旗获胜
import { pushHistory, popHistory, finish, makeSeats, shuffle, pick } from './_util.js';
import { boardSurface, PALETTE, pieceText, halo, roundRect } from './_draw.js';

const W = 5;
const H = 12;
const KEYS = ['board', 'turn', 'lastMove', 'ply', 'over', 'result', 'note', 'lastMoves'];

const RANK = { 司令: 9, 军长: 8, 师长: 7, 旅长: 6, 团长: 5, 营长: 4, 连长: 3, 排长: 2, 工兵: 1 };
const VAL = { 司令: 100, 军长: 70, 师长: 55, 旅长: 45, 团长: 35, 营长: 25, 连长: 18, 排长: 12, 工兵: 16, 炸弹: 40, 地雷: 26, 军旗: 1000 };

const ROSTER = [
  ['司令', 1], ['军长', 1], ['师长', 2], ['旅长', 2], ['团长', 2], ['营长', 2],
  ['连长', 3], ['排长', 3], ['工兵', 3], ['炸弹', 2], ['地雷', 3], ['军旗', 1]
];

const RAIL_ROWS = new Set([2, 5, 6, 9]);

const idx = (x, y) => y * W + x;

export const meta = {
  id: 'junqi',
  name: '军棋',
  en: 'Junqi',
  tag: '夺旗制胜',
  goal: '二人军棋（陆战棋）：每方 25 枚棋子随机布阵，棋子身份对敌人隐藏。通过铁路快速行军、吃掉对方棋子并夺取对方军旗，先扛走军旗的一方获胜。',
  seatNames: ['红方', '蓝方'],
  seatColors: ['#c8402f', '#2f6fb0'],
  aspect: 0.5,
  seats: 2,
  rules: [
    { h: '布阵', p: '开局双方各有 25 枚棋子，自动随机布阵：军旗只能放在大本营，地雷只能放在后两排，炸弹不能放在最前线。开局前可以点「重新布阵」重排。' },
    { h: '行军', p: '普通棋子每步上下左右走一格。铁路（两侧纵线与第 2、5、6、9 横线）上可以直线滑行任意格，前提是路径全空；工兵还能在铁路上拐弯行走。若轮到自己时没有任何棋能走，则停一手。' },
    { h: '行营与大本营', p: '行营中的棋子不会被攻击（但可以主动出击）。大本营中的棋子不能移动出去，用来保护军旗与地雷。' },
    { h: '战斗', p: '司令 > 军长 > 师长 > 旅长 > 团长 > 营长 > 连长 > 排长 > 工兵。同级同归于尽，大吃小。炸弹与任何子同归于尽；地雷不能移动，普通子撞雷阵亡，工兵可挖雷，炸弹碰雷同归于尽。' },
    { h: '胜利条件', p: '吃掉对方的军旗立即获胜。交战双方的身份会翻明，之后双方都能看到这两枚棋子的真实身份。若 300 回合内双方都未夺得军旗，则按剩余棋子（不含军旗）的子力总和判定胜负。' }
  ],
  tips: [
    '工兵是拆雷与提速的关键，别过早送掉三名工兵。',
    '司令、军长等大子不要莽撞冲锋，先用小子试探对方身份。',
    '铁路直线滑行很快，但要注意沿线是否有埋伏；行营是安全的休整点。',
    '地雷与军旗通常在大本营附近，用炸弹或工兵去试探后排的「?」往往有机会。'
  ]
};

/* ---------------- 棋盘位置 ---------------- */

const SIDE_PATTERN = [
  [1, 3],
  [0, 1, 2, 3, 4],
  [0, 1, 2, 3, 4],
  [0, 1, 2, 3, 4],
  [0, 1, 2, 3, 4],
  [1, 2, 3]
];

function validPos(x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return false;
  const row = y <= 5 ? y : 11 - y;
  return SIDE_PATTERN[row].includes(x);
}

function isCamp(x, y) {
  if (y <= 5) return (y === 2 && (x === 1 || x === 3)) || (y === 3 && x === 2) || (y === 4 && (x === 1 || x === 3));
  const ry = 11 - y;
  return (ry === 2 && (x === 1 || x === 3)) || (ry === 3 && x === 2) || (ry === 4 && (x === 1 || x === 3));
}

function isHQ(x, y, side) {
  return y === (side === 0 ? 11 : 0) && (x === 1 || x === 3);
}

function isRail(x, y) {
  return validPos(x, y) && (x === 0 || x === 4 || RAIL_ROWS.has(y));
}

const POSITIONS = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (validPos(x, y)) POSITIONS.push({ x, y });
  }
}

const NEIGH = new Map();
for (const p of POSITIONS) {
  const list = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (validPos(p.x + dx, p.y + dy)) list.push({ x: p.x + dx, y: p.y + dy });
  }
  NEIGH.set(`${p.x},${p.y}`, list);
}

const SIDE_POS = [[], []];
for (const p of POSITIONS) {
  (p.y <= 5 ? SIDE_POS[1] : SIDE_POS[0]).push(p);
}

/* ---------------- 布阵 ---------------- */

function roster() {
  const list = [];
  for (const [type, count] of ROSTER) {
    for (let i = 0; i < count; i++) list.push(type);
  }
  return list;
}

function deploySide(board, side) {
  const pos = SIDE_POS[side];
  const backRow = side === 0 ? 11 : 0;
  const backTwo = side === 0 ? [10, 11] : [0, 1];
  const frontRow = side === 0 ? 6 : 5;

  for (const p of pos) board[idx(p.x, p.y)] = null;

  const keys = pos.map(p => ({ ...p }));
  const backPositions = keys.filter(p => p.y === backRow);
  const backTwoPositions = keys.filter(p => backTwo.includes(p.y));
  const nonFront = keys.filter(p => p.y !== frontRow);

  const flagAt = pick(backPositions);
  board[idx(flagAt.x, flagAt.y)] = { side, type: '军旗', revealed: false };

  const mineCands = backTwoPositions.filter(p => !(p.x === flagAt.x && p.y === flagAt.y));
  shuffle(mineCands);
  for (let i = 0; i < 3; i++) {
    const p = mineCands[i];
    board[idx(p.x, p.y)] = { side, type: '地雷', revealed: false };
  }

  const used = new Set([`${flagAt.x},${flagAt.y}`]);
  for (let i = 0; i < 3; i++) used.add(`${mineCands[i].x},${mineCands[i].y}`);
  const bombCands = nonFront.filter(p => !used.has(`${p.x},${p.y}`));
  shuffle(bombCands);
  for (let i = 0; i < 2; i++) {
    const p = bombCands[i];
    board[idx(p.x, p.y)] = { side, type: '炸弹', revealed: false };
    used.add(`${p.x},${p.y}`);
  }

  const restPositions = keys.filter(p => !used.has(`${p.x},${p.y}`));
  const types = roster().filter(t => t !== '军旗' && t !== '地雷' && t !== '炸弹');
  shuffle(types);
  shuffle(restPositions);
  for (let i = 0; i < restPositions.length; i++) {
    const p = restPositions[i];
    board[idx(p.x, p.y)] = { side, type: types[i], revealed: false };
  }
}

export function create(opts = {}) {
  const slide = new Array(W * H).fill(null);
  deploySide(slide, 0);
  deploySide(slide, 1);

  const state = {
    id: 'junqi',
    mode: opts.mode || 'pvp',
    level: opts.level || 2,
    humanSeat: opts.humanSeat || 0,
    turn: 0,
    over: false,
    result: null,
    note: '红方先行：点选己方棋子，再点目标位置',
    ply: 0,
    history: [],
    seats: [],
    board: slide,
    lastMove: null,
    selected: null,
    hints: [],
    lastMoves: []
  };
  state.seats = makeSeats(state, meta.seatNames);
  return state;
}

export function demo() {
  const s = create({ mode: 'pvp' });
  // 翻开几枚中路棋子，让缩略图更有“军棋”的感觉
  for (let x = 1; x <= 3; x++) {
    const blue = s.board[idx(x, 4)];
    if (blue) blue.revealed = true;
    const red = s.board[idx(x, 7)];
    if (red) red.revealed = true;
  }
  s.history = [];
  return s;
}

/* ---------------- 走法 ---------------- */

function railSlide(board, from, engineer) {
  const out = [];
  if (!isRail(from.x, from.y)) return out;

  if (!engineer) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let nx = from.x + dx, ny = from.y + dy;
      while (isRail(nx, ny)) {
        const p = board[idx(nx, ny)];
        if (p) {
          if (!isCamp(nx, ny)) out.push({ x: nx, y: ny });
          break;
        }
        out.push({ x: nx, y: ny });
        nx += dx;
        ny += dy;
      }
    }
    return out;
  }

  // 工兵：沿铁路网络寻路，可拐弯
  const seen = new Set([`${from.x},${from.y}`]);
  const stack = [{ x: from.x, y: from.y }];
  while (stack.length) {
    const cur = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !isRail(nx, ny)) continue;
      seen.add(key);
      const p = board[idx(nx, ny)];
      if (p) {
        if (!isCamp(nx, ny)) out.push({ x: nx, y: ny });
      } else {
        out.push({ x: nx, y: ny });
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return out;
}

function pieceMoves(board, p) {
  if (!p || p.type === '军旗' || p.type === '地雷') return [];
  if (isHQ(p.x, p.y, p.side)) return [];

  const out = [];
  const seen = new Set();
  const add = (x, y) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    const target = board[idx(x, y)];
    if (target && target.side === p.side) return;
    if (target && isCamp(x, y)) return;
    seen.add(key);
    out.push({ x, y });
  };

  for (const n of NEIGH.get(`${p.x},${p.y}`) || []) add(n.x, n.y);

  if (isRail(p.x, p.y)) {
    const engineer = p.type === '工兵';
    const slides = railSlide(board, p, engineer);
    for (const s of slides) {
      if (s.x === p.x && s.y === p.y) continue;
      add(s.x, s.y);
    }
  }
  return out;
}

function allMoves(board, side) {
  const out = [];
  for (const p of POSITIONS) {
    const piece = board[idx(p.x, p.y)];
    if (!piece || piece.side !== side) continue;
    for (const to of pieceMoves(board, { ...piece, ...p })) {
      out.push({ from: { x: p.x, y: p.y }, to });
    }
  }
  return out;
}

/* ---------------- 战斗 ---------------- */

function perform(board, from, to) {
  const a = board[idx(from.x, from.y)];
  const d = board[idx(to.x, to.y)];
  if (!d) {
    board[idx(to.x, to.y)] = a;
    board[idx(from.x, from.y)] = null;
    return { move: true };
  }

  a.revealed = true;
  d.revealed = true;
  const base = { attacker: a.type, defender: d.type };

  if (d.type === '军旗') {
    board[idx(from.x, from.y)] = null;
    board[idx(to.x, to.y)] = a;
    return { ...base, flag: true, outcome: 'flag' };
  }

  if (d.type === '地雷') {
    if (a.type === '工兵') {
      board[idx(from.x, from.y)] = null;
      board[idx(to.x, to.y)] = a;
      return { ...base, outcome: 'mine-win' };
    }
    if (a.type === '炸弹') {
      board[idx(from.x, from.y)] = null;
      board[idx(to.x, to.y)] = null;
      return { ...base, outcome: 'both' };
    }
    board[idx(from.x, from.y)] = null;
    return { ...base, outcome: 'lose' };
  }

  if (a.type === '炸弹' || d.type === '炸弹') {
    board[idx(from.x, from.y)] = null;
    board[idx(to.x, to.y)] = null;
    return { ...base, outcome: 'both' };
  }

  if (RANK[a.type] > RANK[d.type]) {
    board[idx(from.x, from.y)] = null;
    board[idx(to.x, to.y)] = a;
    return { ...base, outcome: 'win' };
  }
  if (RANK[a.type] === RANK[d.type]) {
    board[idx(from.x, from.y)] = null;
    board[idx(to.x, to.y)] = null;
    return { ...base, outcome: 'both' };
  }

  board[idx(from.x, from.y)] = null;
  return { ...base, outcome: 'lose' };
}

function noteFor(state, mover, res) {
  const seat = state.seats[mover].name;
  const opp = state.seats[1 - mover].name;
  if (res.move) return `${seat}移动棋子`;
  const a = res.attacker;
  const d = res.defender;
  if (res.flag) return `${seat} ${a} 夺得 ${opp} 军旗！`;
  if (res.outcome === 'mine-win') return `${seat} 工兵挖掉 ${opp} 地雷`;
  if (res.outcome === 'both') return `${seat} ${a} 与 ${opp} ${d} 同归于尽`;
  if (res.outcome === 'win') return `${seat} ${a} 吃掉 ${opp} ${d}`;
  return `${seat} ${a} 撞上 ${opp} ${d}，阵亡`;
}

function material(board, side) {
  let sum = 0;
  for (const p of POSITIONS) {
    const q = board[idx(p.x, p.y)];
    if (!q || q.side !== side || q.type === '军旗') continue;
    sum += VAL[q.type] || 0;
  }
  return sum;
}

/** 久战未夺旗时按剩余子力判定，避免无休止对局 */
function timeUp(state) {
  if (state.over || state.ply < 600) return false;
  const a = material(state.board, 0);
  const b = material(state.board, 1);
  if (a === b) {
    finish(state, null, '久战未夺军旗，双方子力相当，判为和棋', 'material');
  } else {
    const win = a > b ? 0 : 1;
    finish(state, win, `久战未夺军旗，${state.seats[win].name}子力占优，获胜`, 'material');
  }
  state.note = state.result.text;
  return true;
}

export function applyMove(state, move) {
  if (!state || state.over || !move) return false;

  // 无棋可动：停一手；双方都无棋可动则按子力判定
  if (move.type === 'pass') {
    const side = state.turn;
    if (allMoves(state.board, side).length) return false;
    pushHistory(state, KEYS);
    state.ply++;
    state.selected = null;
    state.hints = [];
    const next = 1 - side;
    if (!allMoves(state.board, next).length) {
      const mine = material(state.board, side);
      const theirs = material(state.board, next);
      if (mine === theirs) {
        finish(state, null, '双方都无棋可动，判为和棋', 'stalemate');
      } else {
        const win = mine > theirs ? side : next;
        finish(state, win, `${state.seats[win].name}子力占优，获胜`, 'material');
      }
      state.note = state.result.text;
    } else {
      state.turn = next;
      state.note = `${state.seats[side].name}无棋可动，停一手，轮到${state.seats[next].name}`;
      timeUp(state);
    }
    return true;
  }

  if (!move.from || !move.to) return false;
  const side = state.turn;
  const legal = allMoves(state.board, side);
  const canon = legal.find(m => m.from.x === move.from.x && m.from.y === move.from.y && m.to.x === move.to.x && m.to.y === move.to.y);
  if (!canon) return false;

  pushHistory(state, KEYS);

  const mover = state.turn;
  const res = perform(state.board, move.from, move.to);

  state.ply++;
  state.lastMove = { from: { ...move.from }, to: { ...move.to } };
  if (!state.lastMoves) state.lastMoves = [];
  state.lastMoves.push({ side: mover, from: { ...move.from }, to: { ...move.to } });
  if (state.lastMoves.length > 8) state.lastMoves.shift();
  state.selected = null;
  state.hints = [];

  let note = noteFor(state, mover, res);
  const moverSeat = state.seats[mover].name;

  if (res.flag) {
    finish(state, mover, `${moverSeat}夺得军旗，获胜！`, 'flag');
    note = state.result.text;
  } else {
    state.turn = 1 - mover;
    note += `，轮到${state.seats[state.turn].name}`;
    state.note = note;
    timeUp(state);
    return true;
  }
  state.note = note;
  return true;
}

/* ---------------- 交互 ---------------- */

function layout(w, h) {
  const pad = Math.min(w, h) * 0.035;
  const cell = Math.min((w - pad * 2) / W, (h - pad * 2) / H);
  return { cell, x0: (w - cell * W) / 2, y0: (h - cell * H) / 2, w, h };
}

function cellAt(pt) {
  const L = layout(pt.w, pt.h);
  const gx = Math.floor((pt.x - L.x0) / L.cell);
  const gy = Math.floor((pt.y - L.y0) / L.cell);
  if (!validPos(gx, gy)) return null;
  return { x: gx, y: gy, L };
}

export function tap(state, pt) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  const p = cellAt(pt);
  if (!p) return { ok: false, msg: '请点击棋盘上的点位' };
  const side = state.turn;
  const piece = state.board[idx(p.x, p.y)];

  if (state.selected) {
    const sel = state.selected;
    if (p.x === sel.x && p.y === sel.y) {
      state.selected = null;
      state.hints = [];
      return { ok: true, moved: false };
    }
    if (piece && piece.side === side) {
      selectPiece(state, p, side);
      return { ok: true, moved: false };
    }
    if (!state.hints.some(h => h.x === p.x && h.y === p.y)) {
      return { ok: false, msg: '这里走不过去' };
    }
    const ok = applyMove(state, { from: { x: sel.x, y: sel.y }, to: { x: p.x, y: p.y } });
    if (!ok) return { ok: false, msg: '不合规则的走法' };
    return { ok: true, moved: true };
  }

  if (piece && piece.side === side) {
    selectPiece(state, p, side);
    return { ok: true, moved: false };
  }
  if (piece) return { ok: false, msg: '那是对方的棋子' };
  return { ok: false, msg: '请先点选己方棋子' };
}

function selectPiece(state, p, side) {
  state.selected = { x: p.x, y: p.y };
  state.hints = pieceMoves(state.board, { ...state.board[idx(p.x, p.y)], ...p });
}

export function undo(state) {
  const ok = popHistory(state, KEYS);
  if (ok) {
    state.selected = null;
    state.hints = [];
  }
  return ok;
}

export function actions(state) {
  if (!state || state.over) return [];
  if (state.mode === 'pve' && state.turn !== state.humanSeat) return [];
  if (state.ply === 0) return [{ id: 'redeploy', label: '重新布阵' }];
  if (!allMoves(state.board, state.turn).length) return [{ id: 'pass', label: '无棋可动，停一手' }];
  return [];
}

export function action(state, id) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  if (id === 'pass') {
    const ok = applyMove(state, { type: 'pass' });
    return { ok, moved: ok };
  }
  if (id !== 'redeploy' || state.ply !== 0) return { ok: false, msg: '现在不能重新布阵' };
  pushHistory(state, KEYS);
  deploySide(state.board, 0);
  deploySide(state.board, 1);
  state.selected = null;
  state.hints = [];
  state.note = '已重新随机布阵';
  return { ok: true, moved: true };
}

/* ---------------- AI（诚实：不读取未翻明的敌方身份） ---------------- */

function aiView(state, side) {
  const board = state.board.map(p => {
    if (!p) return null;
    if (p.side === side) return { ...p };
    return { side: p.side, type: p.revealed ? p.type : '?', revealed: p.revealed };
  });
  return board;
}

function attackScore(attacker, defender, known) {
  if (!known) {
    const table = { 司令: 70, 军长: 48, 师长: 28, 旅长: 12, 团长: 0, 营长: -14, 连长: -26, 排长: -34, 工兵: -30, 炸弹: -12 };
    return table[attacker] || -20;
  }
  if (defender === '军旗') return 900;
  if (defender === '地雷') {
    if (attacker === '工兵') return VAL.地雷;
    if (attacker === '炸弹') return -VAL.炸弹;
    return -VAL[attacker];
  }
  if (attacker === '炸弹' || defender === '炸弹') return -VAL[attacker] + (VAL[defender] || 0) * 0.4;
  if (RANK[attacker] > RANK[defender]) return VAL[defender];
  if (RANK[attacker] === RANK[defender]) return -VAL[attacker];
  return -VAL[attacker];
}

function scoreMove(board, move, side, pressure = 0) {
  const a = board[idx(move.from.x, move.from.y)];
  const target = board[idx(move.to.x, move.to.y)];
  const forward = side === 0 ? move.from.y - move.to.y : move.to.y - move.from.y;
  let score = forward * 2;

  if (target) {
    const known = target.type !== '?';
    // pressure 随手数增加：久战不下时主动求战，避免双方在营地里反复打转
    score += pressure + attackScore(a.type, target.type, known);
    if (!known) {
      // 未翻明的棋子主要靠猜：靠近敌方大本营的位置更可能是军旗或地雷
      const enemyBack = side === 0 ? 0 : 11;
      const d = Math.abs(move.to.y - enemyBack);
      if (d <= 1) {
        score += a.type === '工兵' ? 46 : a.type === '司令' || a.type === '军长' ? 28 : 12;
      }
    }
  }

  if (isCamp(move.to.x, move.to.y)) score += 8;

  // 军旗必定在敌方大本营：任何棋子踏入敌方大本营都值得试，工兵更要抢
  if (isHQ(move.to.x, move.to.y, 1 - side)) {
    score += a.type === '工兵' ? 260 : 120;
  }

  // 工兵是拆雷与夺旗的主力：让它主动向敌方底线靠拢
  if (a.type === '工兵') {
    const enemyBack = side === 0 ? 0 : 11;
    const before = Math.abs(move.from.y - enemyBack);
    const after = Math.abs(move.to.y - enemyBack);
    score += (before - after) * 6;
  }
  return score;
}

export function aiMove(state) {
  if (!state || state.over) return null;
  const side = state.turn;
  const board = aiView(state, side);
  const moves = allMoves(board, side);
  if (!moves.length) return { type: 'pass' };
  const level = state.level || 2;
  // 久战不下时逐渐变得更主动，避免双方一直绕圈
  const pressure = Math.min(60, Math.floor(state.ply / 60) * 8);

  // 反重复：同一方反复发出同一着、或刚走过去又立刻走回来，重罚，打破原地打转
  const own = (state.lastMoves || []).filter(x => x.side === side);
  const prev = own[own.length - 1];
  const loopPenalty = (m) => {
    let p = 0;
    if (own.some(x => x.from.x === m.from.x && x.from.y === m.from.y && x.to.x === m.to.x && x.to.y === m.to.y)) p -= 70;
    if (prev && prev.from.x === m.to.x && prev.from.y === m.to.y && prev.to.x === m.from.x && prev.to.y === m.from.y) p -= 90;
    return p;
  };
  const scored = moves.map(m => ({ ...m, score: scoreMove(board, m, side, pressure) + loopPenalty(m) }));
  scored.sort((a, b) => b.score - a.score);

  if (level === 1) {
    const pool = scored.map(m => ({ ...m, score: m.score + Math.random() * 40 }));
    pool.sort((a, b) => b.score - a.score);
    const top = pool.slice(0, Math.max(2, Math.ceil(pool.length * 0.4)));
    const chosen = top[Math.floor(Math.random() * top.length)];
    return { from: chosen.from, to: chosen.to };
  }

  if (level === 2) {
    for (const m of scored) m.score += Math.random() * 4;
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 2);
    const chosen = top[Math.floor(Math.random() * top.length)];
    return { from: chosen.from, to: chosen.to };
  }

  // 困难：只额外评估「落点会不会被反吃」，不吃子力以外的亏
  const deadline = Date.now() + 1200;
  let best = scored[0];
  let bestVal = -Infinity;
  const top = scored.slice(0, Math.min(8, scored.length));
  for (const m of top) {
    const test = board.map(p => (p ? { ...p } : null));
    const moved = test[idx(m.from.x, m.from.y)];
    test[idx(m.to.x, m.to.y)] = moved;
    test[idx(m.from.x, m.from.y)] = null;
    const enemy = 1 - side;
    let exposed = false;
    for (const reply of allMoves(test, enemy)) {
      if (reply.to.x === m.to.x && reply.to.y === m.to.y) { exposed = true; break; }
      if (Date.now() > deadline) break;
    }
    const cautious = Math.max(0, 1 - state.ply / 350);
    const risk = exposed ? (VAL[moved.type] || 30) * 0.5 * cautious : 0;
    const val = m.score - risk + Math.random() * 3;
    if (val > bestVal) {
      bestVal = val;
      best = m;
    }
    if (Date.now() > deadline) break;
  }
  return { from: best.from, to: best.to };
}

/* ---------------- 绘制 ---------------- */

function drawRailLine(ctx, a, b, cell) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = Math.max(2, cell * 0.1);
  ctx.strokeStyle = 'rgba(205,215,190,0.55)';
  ctx.stroke();
  ctx.lineWidth = Math.max(0.8, cell * 0.035);
  ctx.strokeStyle = 'rgba(30,36,30,0.7)';
  ctx.stroke();
}

export function draw(ctx, state, g) {
  const { w, h } = g;
  boardSurface(ctx, w, h, PALETTE.ink);
  const L = layout(w, h);
  const cell = L.cell;
  const cx = (x) => L.x0 + (x + 0.5) * cell;
  const cy = (y) => L.y0 + (y + 0.5) * cell;

  // 木框
  ctx.save();
  ctx.strokeStyle = 'rgba(214,220,204,0.22)';
  ctx.lineWidth = Math.max(2, cell * 0.06);
  ctx.strokeRect(L.x0 + cell * 0.12, L.y0 + cell * 0.12, cell * (W - 0.24), cell * (H - 0.24));
  ctx.restore();

  // 连线
  for (const p of POSITIONS) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (!validPos(q.x, q.y)) continue;
      const a = { x: cx(p.x), y: cy(p.y) };
      const b = { x: cx(q.x), y: cy(q.y) };
      if (isRail(p.x, p.y) && isRail(q.x, q.y)) {
        drawRailLine(ctx, a, b, cell);
      } else {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = Math.max(1, cell * 0.03);
        ctx.strokeStyle = 'rgba(210,220,200,0.28)';
        ctx.stroke();
      }
    }
  }

  // 行营与大本营
  for (const p of POSITIONS) {
    const px = cx(p.x);
    const py = cy(p.y);
    if (isCamp(p.x, p.y)) {
      ctx.save();
      ctx.setLineDash([cell * 0.12, cell * 0.08]);
      ctx.strokeStyle = 'rgba(180,220,190,0.5)';
      ctx.lineWidth = Math.max(1.5, cell * 0.04);
      roundRect(ctx, px - cell * 0.4, py - cell * 0.4, cell * 0.8, cell * 0.8, cell * 0.18);
      ctx.stroke();
      ctx.restore();
    }
    if (isHQ(p.x, p.y, 0) || isHQ(p.x, p.y, 1)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(236,196,96,0.7)';
      ctx.lineWidth = Math.max(2, cell * 0.055);
      roundRect(ctx, px - cell * 0.42, py - cell * 0.42, cell * 0.84, cell * 0.84, cell * 0.14);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 视野：人机看人类一方；双人看当前行棋方
  const viewer = state.mode === 'pve' ? state.humanSeat : state.turn;

  // 棋子
  for (const p of POSITIONS) {
    const piece = state.board[idx(p.x, p.y)];
    if (!piece) continue;
    const px = cx(p.x);
    const py = cy(p.y);
    const mine = piece.side === viewer;
    const showText = mine || piece.revealed;
    const red = piece.side === 0;
    const wCard = cell * 0.8;
    const hCard = cell * 0.68;

    ctx.save();
    roundRect(ctx, px - wCard / 2, py - hCard / 2, wCard, hCard, cell * 0.16);
    let fill;
    if (!showText) {
      fill = 'rgba(54,58,66,0.95)';
    } else {
      fill = red ? '#b43828' : '#2b5f97';
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = showText ? 'rgba(255,240,210,0.55)' : 'rgba(180,188,200,0.35)';
    ctx.lineWidth = Math.max(1.2, cell * 0.03);
    ctx.stroke();

    if (showText) {
      pieceText(ctx, piece.type, px, py, wCard * 0.86, Math.min(cell * 0.42, hCard * 0.82), 'rgba(255,246,228,0.96)', 800);
      if (!mine) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();
      }
    } else {
      pieceText(ctx, '?', px, py, wCard * 0.7, cell * 0.45, 'rgba(214,224,236,0.85)', 800);
    }
    ctx.restore();
  }

  // 最后一步
  if (state.lastMove) {
    for (const p of [state.lastMove.from, state.lastMove.to]) {
      const px = cx(p.x);
      const py = cy(p.y);
      ctx.strokeStyle = 'rgba(255,206,96,0.65)';
      ctx.lineWidth = Math.max(1.5, cell * 0.045);
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 选中
  if (state.selected) {
    const px = cx(state.selected.x);
    const py = cy(state.selected.y);
    halo(ctx, px, py, cell * 0.46, 'rgba(255,206,96,0.95)', Math.max(2, cell * 0.05));
  }

  // 落点
  for (const t of state.hints || []) {
    const px = cx(t.x);
    const py = cy(t.y);
    const occupied = !!state.board[idx(t.x, t.y)];
    ctx.beginPath();
    ctx.arc(px, py, cell * (occupied ? 0.4 : 0.16), 0, Math.PI * 2);
    ctx.fillStyle = occupied ? 'rgba(220,80,62,0.25)' : 'rgba(255,218,120,0.45)';
    ctx.fill();
  }

  // 轮次提示
  if (!state.over) {
    ctx.save();
    ctx.font = `600 ${Math.max(10, cell * 0.32)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(230,236,224,0.5)';
    ctx.fillText(state.mode === 'pve' ? (state.turn === state.humanSeat ? '轮到你行棋' : '电脑思考中…') : `${state.seats[state.turn].name}行棋`, w / 2, h - cell * 0.35);
    ctx.restore();
  }
}
