// 飞行棋：52 格环形跑道 + 四条终点跑道，掷骰起飞、同色加速、撞子回基地
import { pushHistory, popHistory, finish, makeSeats, randInt } from './_util.js';
import { boardSurface, PALETTE, roundRect, halo, boardLabel } from './_draw.js';

const TRACK = 52;
const GOAL = 55; // 52~55 为终点跑道，55 为最终的家
const START = [0, 26];
const KEYS = ['planes', 'turn', 'phase', 'dice', 'ply', 'over', 'result', 'note', 'lastPlane'];

const SIDE_COLORS = ['#d1543f', '#3fae72'];
const SIDE_NAMES = ['红方', '绿方'];

// 同色奖励格与机场格，以「相对自己起点」的格数计算
const COLOR_REL = [4, 16, 28, 40];
const AIRPORT_REL = [10, 35];

/* ---------------- 棋盘几何 ---------------- */

/** 环形跑道第 i 格在 14×14 网格中的坐标（0 为红方起点，26 为绿方起点） */
function trackCell(i) {
  const n = ((i % TRACK) + TRACK) % TRACK;
  if (n < 14) return { x: n, y: 13 };
  if (n < 27) return { x: 13, y: 13 - (n - 13) };
  if (n < 40) return { x: 13 - (n - 26), y: 0 };
  return { x: 0, y: n - 39 };
}

// 每家 4 格终点跑道（52~55，最后一格为家）
const HOME_CELLS = [
    [{ x: 1, y: 12 }, { x: 2, y: 12 }, { x: 3, y: 12 }, { x: 4, y: 12 }],
    [{ x: 12, y: 1 }, { x: 11, y: 1 }, { x: 10, y: 1 }, { x: 9, y: 1 }]
];

// 基地里 4 架飞机的停机位
const BASE_SLOTS = [
  [{ x: 1, y: 9 }, { x: 2, y: 9 }, { x: 1, y: 10 }, { x: 2, y: 10 }],
  [{ x: 12, y: 4 }, { x: 11, y: 4 }, { x: 12, y: 3 }, { x: 11, y: 3 }]
];

const BASE_PANEL = [
  { x: 0.55, y: 8.55, w: 4.9, h: 3.9 },
  { x: 8.55, y: 1.55, w: 4.9, h: 3.9 }
];

export const meta = {
  id: 'aeroplane',
  name: '飞行棋',
  en: 'Aeroplane Chess',
  tag: '掷骰撞子抢跑道',
  goal: '掷骰子让飞机绕跑道飞行，把对手的飞机撞回基地，最先让 4 架飞机全部到达终点的一方获胜。',
  seatNames: ['红方', '绿方'],
  seatColors: ['#d1543f', '#3fae72'],
  aspect: 1,
  seats: 2,
  rules: [
    { h: '起飞', p: '开局 4 架飞机都停在基地。只有掷出 6 点，才能把一架飞机送上自己颜色的起飞格；掷出 6 点后还可以再掷一次。' },
    { h: '前进', p: '掷出几点，就把一架飞机沿跑道前进几格。跑道共 52 格，绕行一周后进入自己颜色的 4 格终点跑道。' },
    { h: '同色与机场', p: '落在自己颜色的格子，可以额外前进 4 格；落在自己颜色的机场格，可以飞跃 12 格。每次移动最多触发一次奖励。' },
    { h: '撞机', p: '如果落点上停着对手的飞机，把对手的飞机全部送回基地；自己的飞机可以停在同一格。' },
    { h: '终点与胜负', p: '终点跑道的最后一格必须精确到达，点数过大时该飞机不能移动。4 架飞机全部到达终点者获胜。' }
  ],
  tips: [
    '开局优先掷 6 起飞，飞机越早进入跑道越有利。',
    '别把飞机停在对手背后 1~6 格的位置，很容易被撞回基地。',
    '同色格与机场格是加速通道，选飞机时可以刻意让落点踩上去。',
    '把对手快到终点的飞机撞回基地，往往比自己前进一步更划算。'
  ]
};

/* ---------------- 状态 ---------------- */

function makePlanes() {
  const planes = [];
  for (let side = 0; side < 2; side++) {
    for (let slot = 0; slot < 4; slot++) {
      planes.push({ side, slot, pos: -1, done: false });
    }
  }
  planes.forEach((p, i) => { p.id = i; });
  return planes;
}

export function create(opts = {}) {
  const state = {
    id: 'aeroplane',
    mode: opts.mode || 'pvp',
    level: opts.level || 2,
    humanSeat: opts.humanSeat || 0,
    turn: 0,
    over: false,
    result: null,
    note: '红方先掷骰子：掷出 6 点才能起飞',
    ply: 0,
    history: [],
    seats: [],
    phase: 'roll',
    dice: 0,
    planes: makePlanes(),
    lastPlane: null,
    selected: null,
    hints: []
  };
  state.seats = makeSeats(state, meta.seatNames);
  return state;
}

export function demo() {
  const s = create({ mode: 'pvp' });
  // 固定一个好看的局面：跑道上各有几架飞机，一架已经到达终点
  s.planes.forEach(p => { p.pos = -1; });
  s.planes[0].pos = 4;
  s.planes[1].pos = 20;
  s.planes[2].pos = GOAL;
  s.planes[4].pos = 30;
  s.planes[5].pos = 46;
  s.planes[6].pos = 52;
  s.turn = 0;
  s.phase = 'select';
  s.dice = 6;
  s.hints = movable(s, 0, 6);
  s.note = '红方 掷出 6 点，点选要移动的飞机';
  s.history = [];
  return s;
}

/* ---------------- 位置换算 ---------------- */

/** 飞机相对自己起点的格数（0~51） */
function relOf(side, pos) {
  const rel = side === 0 ? pos : (pos - START[1] + TRACK) % TRACK;
  return ((rel % TRACK) + TRACK) % TRACK;
}

/** 相对格数换回绝对跑道格 */
function absOf(side, rel) {
  const r = ((rel % TRACK) + TRACK) % TRACK;
  return side === 0 ? r : (r + START[1]) % TRACK;
}

/** 同色 / 机场奖励格数 */
function bonusAt(rel) {
  if (COLOR_REL.includes(rel)) return 4;
  if (AIRPORT_REL.includes(rel)) return 12;
  return 0;
}

/** 计算某架飞机在当前点数下的落点；不能走返回 null */
function computePlan(state, i, dice) {
  const p = state.planes && state.planes[i];
  if (!p || dice <= 0) return null;
  if (p.pos === GOAL) return null;

  if (p.pos === -1) {
    if (dice !== 6) return null;
    return { to: START[p.side], launch: true, bonus: 0, from: -1 };
  }

  if (p.pos <= 51) {
    const rel = relOf(p.side, p.pos) + dice;
    if (rel > GOAL) return null;
    if (rel <= 51) {
      let r = rel;
      let bonus = 0;
      const b = bonusAt(r);
      if (b && r + b <= 51) {
        r += b;
        bonus = b;
      }
      return { to: absOf(p.side, r), launch: false, bonus, from: p.pos };
    }
    return { to: rel, launch: false, bonus: 0, from: p.pos };
  }

  const np = p.pos + dice;
  if (np > GOAL) return null;
  return { to: np, launch: false, bonus: 0, from: p.pos };
}

function movable(state, side, dice) {
  const out = [];
  const list = state.planes || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].side !== side) continue;
    if (computePlan(state, i, dice)) out.push(i);
  }
  return out;
}

/* ---------------- 走子 ---------------- */

export function applyMove(state, move) {
  if (!state || state.over || !move || !state.planes) return false;
  const side = state.turn;

  if (move.type === 'roll') {
    if (state.phase !== 'roll') return false;
    pushHistory(state, KEYS);
    const d = 1 + randInt(6);
    state.dice = d;
    state.ply++;
    state.lastPlane = null;
    const ms = movable(state, side, d);
    if (!ms.length) {
      state.phase = 'roll';
      state.dice = 0;
      state.hints = [];
      state.turn = 1 - side;
      state.note = `${SIDE_NAMES[side]} 掷出 ${d} 点，没有飞机能移动，轮到${SIDE_NAMES[state.turn]}`;
      return true;
    }
    state.phase = 'select';
    state.hints = ms;
    state.note = `${SIDE_NAMES[side]} 掷出 ${d} 点，点选要移动的飞机`;
    return true;
  }

  if (move.type === 'move' && typeof move.plane === 'number') {
    if (state.phase !== 'select') return false;
    const i = move.plane;
    const p = state.planes[i];
    if (!p || p.side !== side) return false;
    const roll = state.dice;
    const plan = computePlan(state, i, roll);
    if (!plan) return false;

    pushHistory(state, KEYS);

    p.pos = plan.to;
    state.lastPlane = i;
    state.ply++;

    const parts = [`${SIDE_NAMES[side]} 一架飞机`];
    if (plan.launch) parts[0] += '起飞';
    else if (plan.bonus === 4) parts[0] += '落在同色格，额外前进 4 格';
    else if (plan.bonus === 12) parts[0] += '落在机场格，飞跃 12 格';
    if (plan.to === GOAL) parts.push('到达终点');

    let crashed = 0;
    if (plan.to <= 51) {
      for (const q of state.planes) {
        if (q.side !== side && q.pos === plan.to && q.pos >= 0) {
          q.pos = -1;
          q.done = false;
          crashed++;
        }
      }
    }
    if (crashed) parts.push(`撞回${SIDE_NAMES[1 - side]} ${crashed} 架飞机`);

    state.hints = [];
    state.selected = null;
    state.phase = 'roll';
    state.dice = 0;

    const total = state.planes.filter(q => q.side === side && q.pos === GOAL).length;
    if (total === 4) {
      finish(state, side, `${SIDE_NAMES[side]} 四架飞机全部到达终点，获胜！`, 'all-home');
      state.note = state.result.text;
      return true;
    }

    // 掷出 6 点可以再掷一次
    if (roll === 6) {
      state.note = `${parts.join('，')}；掷出 6 点，可以再掷一次`;
      return true;
    }
    state.turn = 1 - side;
    state.note = `${parts.join('，')}；轮到${SIDE_NAMES[state.turn]}`;
    return true;
  }

  return false;
}

/* ---------------- 交互 ---------------- */

export function tap(state, pt) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  if (!state.planes) return { ok: false, msg: '请重新开始一局' };
  if (state.mode !== 'pvp' && state.turn !== state.humanSeat) return { ok: false, msg: '电脑正在思考' };
  if (state.phase === 'roll') return { ok: false, msg: '请先点击「掷骰子」' };

  const L = layout(pt.w, pt.h);
  const pos = planeLayout(state, pt.w, pt.h);
  const hints = new Set(state.hints || []);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < state.planes.length; i++) {
    if (state.planes[i].side !== state.turn) continue;
    const q = pos[i];
    if (!q) continue;
    const d = Math.hypot(q.x - pt.x, q.y - pt.y);
    if (d <= L.cell * 0.55 && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return { ok: false, msg: '请点选闪动的飞机' };
  if (!hints.has(best)) return { ok: false, msg: '这架飞机这次走不了' };
  const ok = applyMove(state, { type: 'move', plane: best });
  if (!ok) return { ok: false, msg: '这架飞机这次走不了' };
  return { ok: true, moved: true };
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
  if (state.phase === 'roll') return [{ id: 'roll', label: '掷骰子', primary: true }];
  return [];
}

export function action(state, id) {
  if (!state || state.over) return { ok: false, msg: '对局已结束' };
  if (id !== 'roll') return { ok: false, msg: '未知操作' };
  const ok = applyMove(state, { type: 'roll' });
  return { ok, moved: ok };
}

/* ---------------- AI ---------------- */

function progressOf(p) {
  if (!p || p.pos === -1) return 0;
  if (p.pos <= 51) return relOf(p.side, p.pos) + 1;
  return 58 + (p.pos - 52);
}

function scorePlane(state, i, dice, level) {
  const p = state.planes[i];
  const plan = computePlan(state, i, dice);
  if (!plan) return -Infinity;

  let s = 0;
  if (plan.launch) s += 55;
  if (plan.to === GOAL) s += 900;
  else if (plan.to >= 52) s += 90 + (plan.to - 52) * 16;
  if (plan.bonus === 4) s += 30;
  if (plan.bonus === 12) s += 46;

  if (plan.to <= 51) {
    const rel = relOf(p.side, plan.to);
    s += rel * 0.4;

    // 撞子：把对手飞机送回基地
    for (const q of state.planes) {
      if (q.side === p.side || q.pos !== plan.to) continue;
      s += 45 + progressOf(q) * 1.2;
    }

    // 落点风险：对手在自己身后 1~6 格，下一手可能被撞
    if (level >= 2) {
      let risk = 0;
      for (const q of state.planes) {
        if (q.side === p.side || q.pos < 0 || q.pos > 51) continue;
        const back = (rel - relOf(q.side, q.pos) + TRACK) % TRACK;
        if (back >= 1 && back <= 6) risk++;
      }
      s -= risk * (level === 3 ? 26 : 14);
    }
    // 终点跑道前几格更安全
    if (rel >= 46) s += 12;
  }

  return s;
}

export function aiMove(state) {
  if (!state || state.over || !state.planes) return null;
  if (state.phase === 'roll') return { type: 'roll' };
  const side = state.turn;
  const ms = movable(state, side, state.dice);
  if (!ms.length) return { type: 'roll' };

  const level = state.level || 2;
  if (level === 1) {
    return { type: 'move', plane: ms[randInt(ms.length)] };
  }

  const scored = ms.map(i => ({ i, score: scorePlane(state, i, state.dice, level) + Math.random() * (level === 3 ? 3 : 12) }));
  scored.sort((a, b) => b.score - a.score);
  return { type: 'move', plane: scored[0].i };
}

/* ---------------- 绘制 ---------------- */

function layout(w, h) {
  const cell = Math.min(w, h) / 15.4;
  return { cell, ox: (w - cell * 14) / 2, oy: (h - cell * 14) / 2, w, h };
}

function cellOf(pos, side) {
  if (pos <= 51) return trackCell(pos);
  return HOME_CELLS[side][pos - 52];
}

function dirOf(pos, side) {
  if (pos <= 51) {
    const a = trackCell(pos);
    const b = trackCell(pos + 1);
    return { dx: b.x - a.x, dy: b.y - a.y };
  }
  return { dx: side === 0 ? 1 : -1, dy: 0 };
}

/** 所有飞机的屏幕坐标（含同格叠放的偏移） */
function planeLayout(state, w, h) {
  const L = layout(w, h);
  const cell = L.cell;
  const out = new Array(state.planes.length);
  const groups = new Map();
  for (let i = 0; i < state.planes.length; i++) {
    const p = state.planes[i];
    if (p.pos === -1) continue;
    if (!groups.has(p.pos)) groups.set(p.pos, []);
    groups.get(p.pos).push(i);
  }
  const offset = [[0, 0], [0.2, 0.2], [-0.2, 0.2], [0.2, -0.2]];
  for (let i = 0; i < state.planes.length; i++) {
    const p = state.planes[i];
    if (p.pos === -1) {
      const slot = BASE_SLOTS[p.side][p.slot] || BASE_SLOTS[p.side][0];
      out[i] = {
        x: L.ox + (slot.x + 0.5) * cell,
        y: L.oy + (slot.y + 0.5) * cell,
        angle: 0,
        size: cell * 0.34
      };
      continue;
    }
    const g = groups.get(p.pos);
    const k = Math.max(0, g.indexOf(i));
    const off = offset[k % offset.length];
    const c = cellOf(p.pos, p.side);
    const dir = dirOf(p.pos, p.side);
    out[i] = {
      x: L.ox + (c.x + 0.5 + off[0]) * cell,
      y: L.oy + (c.y + 0.5 + off[1]) * cell,
      angle: Math.atan2(dir.dy, dir.dx) + Math.PI / 2,
      size: cell * 0.33
    };
  }
  return out;
}

function drawPlane(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = size * 0.5;
  ctx.shadowOffsetY = size * 0.16;

  // 机身
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.22, -size * 0.08);
  ctx.lineTo(size * 0.15, size * 0.55);
  ctx.lineTo(0, size * 0.86);
  ctx.lineTo(-size * 0.15, size * 0.55);
  ctx.lineTo(-size * 0.22, -size * 0.08);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // 主翼
  ctx.beginPath();
  ctx.moveTo(-size * 0.96, size * 0.26);
  ctx.lineTo(0, -size * 0.06);
  ctx.lineTo(size * 0.96, size * 0.26);
  ctx.lineTo(size * 0.55, size * 0.44);
  ctx.lineTo(0, size * 0.2);
  ctx.lineTo(-size * 0.55, size * 0.44);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // 尾翼
  ctx.beginPath();
  ctx.moveTo(-size * 0.42, size * 0.62);
  ctx.lineTo(0, size * 0.46);
  ctx.lineTo(size * 0.42, size * 0.62);
  ctx.lineTo(0, size * 0.74);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 座舱
  ctx.beginPath();
  ctx.arc(0, -size * 0.42, size * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(0.8, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size * 0.86);
  ctx.stroke();

  ctx.restore();
}

function star(ctx, x, y, r, color) {
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 4;
    const rr = k % 2 === 0 ? r : r * 0.42;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawDice(ctx, x, y, size, value) {
  ctx.save();
  roundRect(ctx, x - size / 2, y - size / 2, size, size, size * 0.18);
  const g = ctx.createLinearGradient(x - size, y - size, x + size, y + size);
  g.addColorStop(0, '#fdf7e8');
  g.addColorStop(1, '#d9ccae');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.stroke();

  if (value <= 0) {
    boardLabel(ctx, '?', x, y, size * 0.56, 'rgba(60,50,34,0.8)');
    ctx.restore();
    return;
  }

  const dots = {
    1: [[0, 0]],
    2: [[-0.42, -0.42], [0.42, 0.42]],
    3: [[-0.42, -0.42], [0, 0], [0.42, 0.42]],
    4: [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]],
    5: [[-0.42, -0.42], [0.42, -0.42], [0, 0], [-0.42, 0.42], [0.42, 0.42]],
    6: [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0], [0.42, 0], [-0.42, 0.42], [0.42, 0.42]]
  }[value] || [[0, 0]];

  for (const [dx, dy] of dots) {
    ctx.beginPath();
    ctx.arc(x + dx * size, y + dy * size, size * 0.105, 0, Math.PI * 2);
    ctx.fillStyle = '#31261a';
    ctx.fill();
  }
  ctx.restore();
}

export function draw(ctx, state, g) {
  const { w, h } = g;
  boardSurface(ctx, w, h, PALETTE.ink);
  const L = layout(w, h);
  const cell = L.cell;
  const bx = gx => L.ox + gx * cell;
  const by = gy => L.oy + gy * cell;
  const centerX = bx(7);
  const centerY = by(7);

  ctx.save();

  // 外框
  ctx.strokeStyle = 'rgba(226,232,220,0.18)';
  ctx.lineWidth = Math.max(1.5, cell * 0.06);
  roundRect(ctx, bx(0) - cell * 0.34, by(0) - cell * 0.34, cell * 14.68, cell * 14.68, cell * 0.5);
  ctx.stroke();

  // 中央四色风车（红/绿对角，黄/蓝淡化）
  const spin = [SIDE_COLORS[0], '#d8b06a', SIDE_COLORS[1], '#6b9ecb'];
  const R = cell * 4.7;
  for (let k = 0; k < 4; k++) {
    const a0 = k * Math.PI / 2 - Math.PI / 4;
    const a1 = a0 + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, R, a0, a1);
    ctx.closePath();
    ctx.fillStyle = spin[k] + (k % 2 === 0 ? '26' : '14');
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(235,240,230,0.12)';
  ctx.lineWidth = Math.max(1, cell * 0.04);
  ctx.beginPath();
  ctx.arc(centerX, centerY, R, 0, Math.PI * 2);
  ctx.stroke();

  // 基地托盘
  for (let side = 0; side < 2; side++) {
    const b = BASE_PANEL[side];
    roundRect(ctx, bx(b.x), by(b.y), b.w * cell, b.h * cell, cell * 0.3);
    ctx.fillStyle = side === 0 ? 'rgba(209,84,63,0.16)' : 'rgba(63,174,114,0.16)';
    ctx.fill();
    ctx.strokeStyle = side === 0 ? 'rgba(209,84,63,0.55)' : 'rgba(63,174,114,0.55)';
    ctx.lineWidth = Math.max(1.2, cell * 0.045);
    ctx.stroke();
    boardLabel(ctx, `${SIDE_NAMES[side]}基地`, bx(b.x + b.w / 2), by(side === 0 ? b.y + b.h - 0.32 : b.y + 0.34), cell * 0.26, 'rgba(240,240,230,0.6)');
  }

  // 环形跑道
  const redBonus = new Set(COLOR_REL.map(r => absOf(0, r)));
  const greenBonus = new Set(COLOR_REL.map(r => absOf(1, r)));
  const redAir = new Set(AIRPORT_REL.map(r => absOf(0, r)));
  const greenAir = new Set(AIRPORT_REL.map(r => absOf(1, r)));
  const tint = ['rgba(209,84,63,0.30)', 'rgba(216,176,106,0.18)', 'rgba(63,174,114,0.30)', 'rgba(107,158,203,0.18)'];

  for (let i = 0; i < TRACK; i++) {
    const c = trackCell(i);
    const x = bx(c.x + 0.055);
    const y = by(c.y + 0.055);
    const s = cell * 0.89;
    let fill = tint[i % 4];
    let glyph = false;
    let glyphColor = '';
    if (redBonus.has(i)) { fill = 'rgba(196,64,48,0.88)'; glyph = true; glyphColor = '#ffe7d2'; }
    else if (greenBonus.has(i)) { fill = 'rgba(46,132,90,0.9)'; glyph = true; glyphColor = '#e2ffe9'; }
    else if (redAir.has(i)) { fill = 'rgba(214,82,58,0.95)'; glyph = true; glyphColor = '#fff3dc'; }
    else if (greenAir.has(i)) { fill = 'rgba(52,160,104,0.95)'; glyph = true; glyphColor = '#f0fff6'; }

    roundRect(ctx, x, y, s, s, cell * 0.16);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = i === START[0] || i === START[1] ? 'rgba(255,232,160,0.9)' : 'rgba(240,244,232,0.16)';
    ctx.lineWidth = Math.max(1, cell * (i === START[0] || i === START[1] ? 0.07 : 0.03));
    ctx.stroke();

    if (glyph) {
      if (redAir.has(i) || greenAir.has(i)) star(ctx, bx(c.x + 0.5), by(c.y + 0.5), cell * 0.26, glyphColor);
      else {
        ctx.beginPath();
        ctx.arc(bx(c.x + 0.5), by(c.y + 0.5), cell * 0.11, 0, Math.PI * 2);
        ctx.fillStyle = glyphColor;
        ctx.fill();
      }
    }
  }

  // 起飞格箭头
  boardLabel(ctx, '起', bx(0) + cell * 0.5, by(13) + cell * 0.5, cell * 0.3, 'rgba(255,246,224,0.92)');
  boardLabel(ctx, '起', bx(13) + cell * 0.5, by(0) + cell * 0.5, cell * 0.3, 'rgba(255,246,224,0.92)');

  // 终点跑道
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < 4; k++) {
      const c = HOME_CELLS[side][k];
      const x = bx(c.x + 0.06);
      const y = by(c.y + 0.06);
      const s = cell * 0.88;
      roundRect(ctx, x, y, s, s, cell * 0.16);
      ctx.fillStyle = side === 0
        ? `rgba(209,84,63,${k === 3 ? 0.92 : 0.4})`
        : `rgba(63,174,114,${k === 3 ? 0.92 : 0.4})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = Math.max(1, cell * 0.03);
      ctx.stroke();
      if (k === 3) {
        star(ctx, bx(c.x + 0.5), by(c.y + 0.5), cell * 0.28, 'rgba(255,248,226,0.95)');
      }
    }
  }

  // 可移动飞机的落点提示
  const hintPos = new Set(state.hints || []);
  if (state.phase === 'select' && state.dice > 0) {
    for (const i of state.hints || []) {
      if (!state.planes[i] || state.planes[i].side !== state.turn) continue;
      const plan = computePlan(state, i, state.dice);
      if (!plan) continue;
      const c = cellOf(plan.to, state.planes[i].side);
      ctx.save();
      ctx.setLineDash([cell * 0.12, cell * 0.09]);
      ctx.strokeStyle = SIDE_COLORS[state.turn] + 'cc';
      ctx.lineWidth = Math.max(1.4, cell * 0.06);
      ctx.beginPath();
      ctx.arc(bx(c.x + 0.5), by(c.y + 0.5), cell * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 飞机
  const pl = planeLayout(state, w, h);
  for (let i = 0; i < state.planes.length; i++) {
    const p = state.planes[i];
    const q = pl[i];
    if (!q) continue;
    const movableNow = hintPos.has(i) && p.side === state.turn && state.phase === 'select';
    if (movableNow) {
      halo(ctx, q.x, q.y, cell * 0.4, 'rgba(255,214,110,0.75)', Math.max(1.5, cell * 0.05));
    }
    const color = SIDE_COLORS[p.side];
    drawPlane(ctx, q.x, q.y, q.size, q.angle, color);
    if (p.pos === GOAL) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,236,168,0.9)';
      ctx.lineWidth = Math.max(1, cell * 0.045);
      ctx.beginPath();
      ctx.arc(q.x, q.y, cell * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 中央骰子与提示
  const diceSize = cell * 2.15;
  const turnColor = SIDE_COLORS[state.turn] || '#e8e8e0';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${cell * 0.36}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = turnColor;
  const headline = state.over
    ? '本局结束'
    : `${SIDE_NAMES[state.turn]}${state.phase === 'select' ? `掷出 ${state.dice} 点` : '准备掷骰'}`;
  ctx.fillText(headline, centerX, centerY - diceSize * 0.78);
  ctx.font = `600 ${cell * 0.26}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = 'rgba(235,240,230,0.62)';
  ctx.fillText(state.phase === 'select' ? '点选闪动的飞机' : '点击下方「掷骰子」', centerX, centerY + diceSize * 0.8);
  ctx.restore();

  drawDice(ctx, centerX, centerY, diceSize, state.dice);

  ctx.restore();
}

/** 遥控器 / 键盘光标：只停靠当前可走（闪动）的飞机；还没掷骰子时没有点位 */
export function cursorPoints(state, g) {
  if (!state || state.over || !state.planes || state.phase === 'roll') return [];
  const L = layout(g.w, g.h);
  const pos = planeLayout(state, g.w, g.h);
  const hints = state.hints || [];
  const pts = [];
  for (const i of hints) {
    const q = pos[i];
    if (q) pts.push({ x: q.x, y: q.y, r: L.cell * 0.55 });
  }
  return pts;
}
