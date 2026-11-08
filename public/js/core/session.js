// 对局会话：加载游戏模块、调用 AI（Worker 计算）、悔棋、存档
import { getGame } from '../games/index.js';
import { cloneForAI } from '../games/_util.js';

const SAVE_KEY = 'qige.session.v1';

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.gameId || !data.state) return null;
    return data;
  } catch {
    return null;
  }
}

export class Session {
  constructor() {
    this.mod = null;
    this.state = null;
    this.gameId = null;
    this.opts = null;
    this.listeners = new Set();

    this.worker = null;
    this.workerBroken = false;
    this.pending = new Map();
    this.reqId = 0;
    this.gen = 0;
    this.busy = false;
    this.lastBy = 'human';

    this.saved = readSave();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  get meta() {
    return this.mod ? this.mod.meta : null;
  }

  hasSaved() {
    return !!(this.state || this.saved);
  }

  start(gameId, opts = {}) {
    const mod = getGame(gameId);
    if (!mod) throw new Error(`未找到游戏：${gameId}`);
    this.gameId = gameId;
    this.mod = mod;
    this.opts = {
      mode: !mod.meta.solo && opts.mode === 'pve' ? 'pve' : 'pvp',
      level: Number(opts.level) || 2,
      humanSeat: Number(opts.humanSeat) === 1 ? 1 : 0,
      variant: typeof opts.variant === 'string' ? opts.variant : ''
    };
    this.state = mod.create(this.opts);
    this.gen++;
    this.busy = false;
    this.save();
    this.emit();
    this.maybeAI();
    return this.state;
  }

  resume() {
    const data = this.saved;
    this.saved = null;
    if (!data) return false;
    const mod = getGame(data.gameId);
    if (!mod || !data.state || data.state.id !== data.gameId) return false;
    this.gameId = data.gameId;
    this.mod = mod;
    this.opts = data.opts || this.defaultOpts();
    this.state = data.state;
    if (!this.state.history) this.state.history = [];
    this.gen++;
    this.emit();
    // 存档时可能正处于电脑思考中，恢复后继续
    this.maybeAI();
    return true;
  }

  defaultOpts() {
    return { mode: 'pvp', level: 2, humanSeat: 0 };
  }

  isAITurn() {
    const s = this.state;
    return !!(s && !s.over && s.mode === 'pve' && s.seats && s.seats[s.turn] && s.seats[s.turn].ai);
  }

  tap(x, y, w, h) {
    if (!this.state || this.busy || this.state.over) return null;
    if (this.isAITurn()) return null;
    const res = this.mod.tap(this.state, { x, y, w, h }) || { ok: true, moved: false };
    this.lastBy = 'human';
    this.emit();
    if (res.moved) {
      this.save();
      this.maybeAI();
    }
    return res;
  }

  /** 滑动操作（2048、华容道、数字华容道）：pt 带起点 x、y、棋盘宽高 w、h 和位移 dx、dy */
  swipe(dir, pt = {}) {
    if (!this.state || this.busy || this.state.over || !this.mod.swipe) return null;
    const res = this.mod.swipe(this.state, dir, pt) || { ok: true, moved: false };
    this.lastBy = 'human';
    this.emit();
    if (res.moved) this.save();
    return res;
  }

  action(id) {
    if (!this.state || this.busy) return null;
    if (this.isAITurn() && !this.state.over) {
      const allowed = (this.mod.actions ? this.mod.actions(this.state) : []).some(a => a.id === id);
      if (!allowed) return null;
    }
    const res = (this.mod.action ? this.mod.action(this.state, id) : null) || { ok: true, moved: false };
    this.emit();
    if (res.moved) {
      this.save();
      this.maybeAI();
    }
    return res;
  }

  undo() {
    if (!this.state || !this.state.history || this.state.history.length === 0) return false;
    this.gen++;
    this.busy = false;
    this.pending.clear();

    let steps = 0;
    while (steps < 8) {
      if (!this.mod.undo(this.state)) break;
      steps++;
      if (this.state.mode !== 'pve') break;
      if (this.state.turn === this.state.humanSeat) break;
      if (!this.state.history || !this.state.history.length) break;
    }
    this.save();
    this.emit();
    return true;
  }

  restart() {
    if (!this.gameId) return;
    this.start(this.gameId, this.opts || this.defaultOpts());
  }

  async maybeAI() {
    if (!this.isAITurn()) {
      this.busy = false;
      return;
    }
    this.busy = true;
    this.emit();
    const gen = this.gen;
    const payload = cloneForAI(this.state);
    const t0 = Date.now();
    try {
      const move = await this.think(payload);
      if (gen !== this.gen || !this.state) return;
      // 电脑「想一会儿」再落子：算得再快也至少停顿一下，才有一来一回下棋的感觉
      const wait = this.aiDelay() - (Date.now() - t0);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      if (gen !== this.gen || !this.state) return;
      if (move) this.mod.applyMove(this.state, move);
    } catch (err) {
      console.warn('[ai] 计算失败', err);
    }
    if (gen !== this.gen) return;
    this.busy = false;
    this.lastBy = 'ai';
    this.save();
    this.emit();
    // 若轮到电脑（人机对局中连续思考）则继续
    if (this.isAITurn()) this.maybeAI();
  }

  /** 电脑每一步的最短思考时间（毫秒）：水平越高停得越久 */
  aiDelay() {
    const level = (this.state && this.state.level) || 2;
    const [lo, hi] = { 1: [600, 1000], 2: [800, 1400], 3: [1000, 1700] }[level] || [800, 1400];
    return lo + Math.random() * (hi - lo);
  }

  async think(payload) {
    if (!this.workerBroken && !this.worker) this.spawnWorker();
    if (!this.worker) return this.thinkLocal(payload);

    const id = ++this.reqId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('AI 超时'));
        }
      }, 20000);
      this.pending.set(id, {
        resolve: v => { clearTimeout(timer); resolve(v); },
        reject: e => { clearTimeout(timer); reject(e); }
      });
      this.worker.postMessage({ id, gameId: this.gameId, state: payload });
    }).catch(() => this.thinkLocal(payload));
  }

  spawnWorker() {
    try {
      // APK 里 index.html 会设置 __QIGE_CLASSIC__，改用降级打包好的经典 Worker（旧 WebView 也能跑）
      const classic = !!window.__QIGE_CLASSIC__;
      const url = new URL(classic ? 'js/ai-worker-bundle.js' : 'js/core/ai-worker.js', window.location.href).toString();
      const worker = classic ? new Worker(url) : new Worker(url, { type: 'module' });
      worker.onmessage = ev => {
        const d = ev.data || {};
        const p = this.pending.get(d.id);
        if (!p) return;
        this.pending.delete(d.id);
        if (d.error) p.reject(new Error(d.error));
        else p.resolve(d.move);
      };
      worker.onerror = ev => {
        console.warn('[ai] worker 异常', ev.message);
        this.workerBroken = true;
        try { worker.terminate(); } catch {}
        this.worker = null;
        for (const p of this.pending.values()) p.reject(new Error('worker error'));
        this.pending.clear();
      };
      this.worker = worker;
    } catch (err) {
      this.workerBroken = true;
      this.worker = null;
    }
  }

  thinkLocal(payload) {
    return new Promise(resolve => {
      // 让出一帧，避免界面卡死在同一次渲染里
      setTimeout(() => {
        try {
          resolve(this.mod.aiMove(payload));
        } catch (err) {
          console.warn('[ai] 本地计算失败', err);
          resolve(null);
        }
      }, 30);
    });
  }

  save() {
    if (!this.state || !this.gameId) return;
    try {
      const light = { ...this.state, history: (this.state.history || []).slice(-48) };
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        gameId: this.gameId,
        opts: this.opts,
        state: light
      }));
      this.saved = null;
    } catch (err) {
      // 存储超限时静默忽略，不影响对局
    }
  }
}
