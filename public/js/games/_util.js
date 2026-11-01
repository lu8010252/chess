// 各游戏模块共用的小工具：历史快照、结果判定、随机数

const MAX_HISTORY = 160;

/**
 * 保存快照。只保存指定字段，避免把整个 state 反复深拷贝造成内存膨胀。
 * @param {object} state 游戏状态
 * @param {string[]} keys 需要回滚的字段名
 */
export function pushHistory(state, keys) {
  const snap = {};
  for (const k of keys) snap[k] = structuredClone(state[k]);
  const h = state.history || (state.history = []);
  h.push(snap);
  if (h.length > MAX_HISTORY) h.shift();
}

/** 回滚一步，成功返回 true */
export function popHistory(state, keys) {
  const h = state.history;
  if (!h || h.length === 0) return false;
  const snap = h.pop();
  for (const k of keys) {
    if (snap[k] !== undefined) state[k] = snap[k];
  }
  state.ui = undefined;
  return true;
}

/** 标记终局 */
export function finish(state, winner, text, reason = '') {
  state.over = true;
  state.result = { winner, text, reason };
}

/** 生成座位数组：mode 为 pve 时，非 humanSeat 的位置由电脑执子 */
export function makeSeats(state, names) {
  return names.map((name, i) => ({
    name,
    ai: state.mode === 'pve' && i !== state.humanSeat
  }));
}

/** 当前行动方是否是电脑 */
export function isAITurn(state) {
  return !state.over && state.mode === 'pve' && !!state.seats[state.turn]?.ai;
}

/** 简单伪随机（AI 降智时使用，允许种子以便自测可复现） */
export function randInt(n, rnd = Math.random) {
  return Math.floor(rnd() * n);
}

export function pick(arr, rnd = Math.random) {
  return arr[randInt(arr.length, rnd)];
}

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1, rnd);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 限时搜索：返回 true 表示已超时 */
export function makeClock(ms) {
  const end = Date.now() + ms;
  return () => Date.now() > end;
}

/** 把像素坐标裁剪到棋盘范围内 */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** 供 AI worker 使用：去掉历史与临时 UI，保留必要信息 */
export function cloneForAI(state) {
  const c = structuredClone(state);
  c.history = [];
  delete c.ui;
  return c;
}
