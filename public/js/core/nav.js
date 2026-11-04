// 遥控器 / 键盘导航：方向键移动焦点与棋盘光标，确定键点击/落子，返回键退一层
// 触屏、鼠标操作不受影响：只有按过方向键/确定键后才进入「遥控模式」，再触摸/点击就退出。
import { getPlugin } from './native.js';

const DIRS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0]
};

// 进入对局时光标的起始位置（占棋盘宽高的比例）；没列出的棋种从正中开始
const START_FRAC = { chess: 0.78, xiangqi: 0.78, junqi: 0.78, checkers: 0.82 };

export function exitApp() {
  try {
    const u = getPlugin('ApkUpdater');
    if (u && u.exit) {
      u.exit();
      return;
    }
  } catch {}
  try {
    getPlugin('App').exitApp();
  } catch {}
}

export function initNav(api) {
  const { session, ui } = api;
  let cur = null; // 棋盘光标：{fx, fy}，占画布宽高的比例，缩放/旋转后位置不变
  let prevFocus = null;

  const cursorEl = document.createElement('div');
  cursorEl.className = 'cursor hidden';
  ui.stage.appendChild(cursorEl);

  const dpadOn = () => document.body.classList.contains('dpad');
  const enableDpad = () => document.body.classList.add('dpad');
  const disableDpad = () => {
    document.body.classList.remove('dpad');
    cursorEl.classList.add('hidden');
  };

  /* ---------- 棋盘点位 ---------- */

  function pointsNow() {
    const mod = session.mod;
    if (!mod || !session.state || typeof mod.cursorPoints !== 'function') return [];
    const { w, h } = api.getBoardSize();
    try {
      return mod.cursorPoints(session.state, { w, h }) || [];
    } catch {
      return [];
    }
  }

  function nearest(pts, x, y) {
    let best = null;
    let bd = Infinity;
    for (const p of pts) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** 让光标落在最近的合法点位上，返回该点位（没有点位时返回 null） */
  function snapCursor() {
    const pts = pointsNow();
    if (!pts.length) return null;
    const { w, h } = api.getBoardSize();
    if (!cur) {
      const f = START_FRAC[session.mod.meta.id] || 0.5;
      cur = { fx: 0.5, fy: f };
    }
    const p = nearest(pts, cur.fx * w, cur.fy * h);
    cur = { fx: p.x / w, fy: p.y / h };
    return p;
  }

  function renderCursor() {
    const onBoard = dpadOn() && !api.isOverlayOpen() && api.isTable() && document.activeElement === ui.canvas;
    const p = onBoard ? snapCursor() : null;
    if (!p) {
      cursorEl.classList.add('hidden');
      return;
    }
    const r = Math.max(10, p.r);
    cursorEl.style.width = cursorEl.style.height = `${r * 2}px`;
    cursorEl.style.left = `${ui.canvas.offsetLeft + p.x - r}px`;
    cursorEl.style.top = `${ui.canvas.offsetTop + p.y - r}px`;
    cursorEl.classList.remove('hidden');
  }

  /* ---------- 方向选择 ---------- */

  /** 在候选点里选出 from 朝 dir 方向最合适的一个；候选需带 x、y */
  function pickDir(from, cands, dir) {
    let best = null;
    let bs = Infinity;
    for (const c of cands) {
      const dx = c.x - from.x;
      const dy = c.y - from.y;
      const along = dx * dir[0] + dy * dir[1];
      const perp = Math.abs(dx * dir[1] - dy * dir[0]);
      if (along <= 1) continue;
      if (perp > along * 1.4) continue; // 只看前方约 ±54° 的扇形
      const score = along + perp * 2;
      if (score < bs) {
        bs = score;
        best = c;
      }
    }
    return best;
  }

  function scopeEl() {
    const ov = api.getOverlay();
    if (ov) return ov;
    return api.isTable() ? ui.table : ui.home;
  }

  function focusables(root) {
    return [...root.querySelectorAll('button, input, summary, [tabindex="0"]')].filter(
      el => !el.disabled && el.getClientRects().length > 0 && !el.closest('[hidden]')
    );
  }

  function focusSpatial(from, dir, exclude) {
    const cands = [];
    for (const el of focusables(scopeEl())) {
      if (el === exclude) continue;
      const r = el.getBoundingClientRect();
      // 用「离 from 最近的矩形边缘点」做参照，宽大的元素（棋盘）也能正确判断方向
      cands.push({
        el,
        x: Math.min(Math.max(from.x, r.left), r.right),
        y: Math.min(Math.max(from.y, r.top), r.bottom)
      });
    }
    const next = pickDir(from, cands, dir);
    if (!next) return false;
    next.el.focus({ preventScroll: true });
    next.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    renderCursor();
    return true;
  }

  function move(dir) {
    const ae = document.activeElement;
    const inScope = ae && ae !== document.body && scopeEl().contains(ae);
    if (!inScope) {
      focusDefault();
      return;
    }
    if (ae === ui.canvas && !api.isOverlayOpen()) {
      const p = snapCursor();
      if (p) {
        const next = pickDir(p, pointsNow(), dir);
        if (next) {
          const { w, h } = api.getBoardSize();
          cur = { fx: next.x / w, fy: next.y / h };
          renderCursor();
          return;
        }
        // 到棋盘边缘：跳到旁边的按钮
        const rect = ui.canvas.getBoundingClientRect();
        focusSpatial({ x: rect.left + p.x, y: rect.top + p.y }, dir, ui.canvas);
        return;
      }
    }
    const r = ae.getBoundingClientRect();
    focusSpatial({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, dir, ae);
  }

  function confirmOnBoard() {
    const p = snapCursor();
    if (!p) return;
    const { w, h } = api.getBoardSize();
    const res = session.tap(p.x, p.y, w, h);
    if (res && res.ok === false && res.msg) api.toast(res.msg);
  }

  /* ---------- 焦点管理 ---------- */

  function focusDefault() {
    const ov = api.getOverlay();
    let el = null;
    if (ov) {
      el = ov.querySelector('.primary, .btn.gold') || focusables(ov)[0];
    } else if (api.isTable()) {
      if (pointsNow().length) el = ui.canvas;
      else el = ui.actions.querySelector('button') || document.getElementById('btn-back');
    } else {
      el = document.getElementById('btn-resume') || ui.grid.querySelector('.game-card');
    }
    if (el) {
      el.focus({ preventScroll: true });
      renderCursor();
    }
  }

  /* ---------- 返回键 ---------- */

  function goBack(fromNative) {
    if (window.__qigeBack && window.__qigeBack()) return;
    if (fromNative) exitApp();
  }

  /* ---------- 事件 ---------- */

  document.addEventListener('keydown', ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tag = ev.target && ev.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const k = ev.key;

    if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || (k === 'Backspace' && !typing)) {
      ev.preventDefault();
      goBack(false);
      return;
    }
    if (typing) return;

    if (DIRS[k]) {
      ev.preventDefault();
      const first = !dpadOn();
      enableDpad();
      if (first) focusDefault();
      else move(DIRS[k]);
      return;
    }
    if (k === 'Enter' || k === ' ') {
      const first = !dpadOn();
      enableDpad();
      if (document.activeElement === ui.canvas) {
        ev.preventDefault();
        confirmOnBoard();
      } else if (first && (!document.activeElement || document.activeElement === document.body)) {
        ev.preventDefault();
        focusDefault();
      }
      // 其余情况交给浏览器：焦点在按钮上时 Enter 本来就是点击
    }
  }, true);

  document.addEventListener('pointerdown', ev => {
    disableDpad();
  }, true);

  // 安卓返回键（Capacitor）：接管后不会直接退出应用
  try {
    const appPlugin = getPlugin('App');
    if (appPlugin && appPlugin.addListener) appPlugin.addListener('backButton', () => goBack(true));
  } catch {}

  ui.canvas.setAttribute('tabindex', '0');
  ui.canvas.addEventListener('blur', () => cursorEl.classList.add('hidden'));
  ui.canvas.addEventListener('focus', renderCursor);

  /* ---------- 给 app.js 的接口 ---------- */

  return {
    refreshCursor: renderCursor,
    afterEnterTable() {
      cur = null;
      if (dpadOn()) focusDefault();
    },
    afterGoHome() {
      cursorEl.classList.add('hidden');
      if (dpadOn()) focusDefault();
    },
    onOverlayOpened(el) {
      const ae = document.activeElement;
      if (ae && ae !== document.body && !ae.closest('.overlay')) prevFocus = ae;
      if (dpadOn()) requestAnimationFrame(() => {
        const first = el.querySelector('.primary, .btn.gold') || focusables(el)[0];
        if (first) first.focus({ preventScroll: true });
        renderCursor();
      });
    },
    onOverlayClosed() {
      if (!dpadOn()) return;
      const el = prevFocus;
      prevFocus = null;
      if (el && el.isConnected && el.getClientRects().length) el.focus({ preventScroll: true });
      else focusDefault();
      renderCursor();
    }
  };
}
