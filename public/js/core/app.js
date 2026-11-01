// 界面主逻辑：首页 / 对局页 / 弹层 / 棋盘自适应 / PWA
import { Session } from './session.js';
import { GAMES, getGame } from '../games/index.js';
import { VERSION } from './version.js';
import { initNav } from './nav.js';
import { initUpdater } from './updater.js';

const LEVELS = [
  { v: 1, label: '简单', desc: '轻松上手' },
  { v: 2, label: '普通', desc: '势均力敌' },
  { v: 3, label: '困难', desc: '全力应战' }
];

const OPTS_KEY = 'qige.opts.v1';
const session = new Session();
const ui = {};
let boardSize = { w: 640, h: 640 };
let overlay = null;
let overlayKind = null;
let shownResult = '';
let toastTimer = 0;
let deferredPrompt = null;
let renderQueued = false;
let nav = null;
let updater = null;

function loadOpts() {
  try {
    return JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveOpts(id, opts) {
  try {
    const all = loadOpts();
    all[id] = opts;
    localStorage.setItem(OPTS_KEY, JSON.stringify(all));
  } catch {}
}

function mount() {
  document.getElementById('app').innerHTML = `
    <section class="screen home" id="home">
      <header class="home-head">
        <div class="brand">
          <div class="brand-mark">棋</div>
          <div>
            <h1>棋阁</h1>
            <p>七种棋类 · 双人对弈 / 人机对战 · 平板大棋盘</p>
          </div>
        </div>
        <div class="home-actions" id="home-actions"></div>
      </header>
      <div class="grid" id="grid"></div>
      <footer class="home-foot">
        五子棋 · 象棋 · 军棋 · 国际象棋 · 围棋 · 跳棋 · 飞行棋<br />
        支持离线使用，可安装到平板上运行<br />
        <span class="ver">版本 v${VERSION}</span>
      </footer>
    </section>

    <section class="screen table" id="table" hidden>
      <header class="topbar">
        <button class="icon-btn" id="btn-back" aria-label="返回">←</button>
        <div class="title-box">
          <strong id="t-name">—</strong>
          <span id="t-sub"></span>
        </div>
        <div class="tools">
          <button class="btn ghost" id="btn-rules">规则</button>
          <button class="btn ghost" id="btn-undo">悔棋</button>
          <button class="btn ghost" id="btn-restart">重开</button>
          <button class="btn ghost" id="btn-full">全屏</button>
        </div>
      </header>

      <div class="stage" id="stage">
        <canvas id="board" width="640" height="640"></canvas>
        <div class="thinking hidden" id="thinking"><span class="dot"></span>电脑思考中…</div>
      </div>

      <footer class="bottombar">
        <div class="seats" id="seats"></div>
        <div class="note" id="note"></div>
        <div class="game-actions" id="actions"></div>
      </footer>

      <button class="floating-exit hidden" id="btn-exit-full" aria-label="退出全屏">✕</button>
    </section>
  `;

  ui.home = document.getElementById('home');
  ui.table = document.getElementById('table');
  ui.grid = document.getElementById('grid');
  ui.homeActions = document.getElementById('home-actions');
  ui.tName = document.getElementById('t-name');
  ui.tSub = document.getElementById('t-sub');
  ui.stage = document.getElementById('stage');
  ui.canvas = document.getElementById('board');
  ui.ctx = ui.canvas.getContext('2d');
  ui.thinking = document.getElementById('thinking');
  ui.toast = document.createElement('div');
  ui.toast.className = 'toast hidden';
  ui.toast.setAttribute('role', 'status');
  document.body.appendChild(ui.toast);
  ui.seats = document.getElementById('seats');
  ui.note = document.getElementById('note');
  ui.actions = document.getElementById('actions');
  ui.exitFull = document.getElementById('btn-exit-full');

  ui.canvas.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    const rect = ui.canvas.getBoundingClientRect();
    const res = session.tap(ev.clientX - rect.left, ev.clientY - rect.top, rect.width, rect.height);
    if (res && res.ok === false && res.msg) toast(res.msg);
  });
  ui.canvas.addEventListener('contextmenu', ev => ev.preventDefault());

  document.getElementById('btn-back').onclick = goHome;
  document.getElementById('btn-rules').onclick = () => openRules(session.mod);
  document.getElementById('btn-undo').onclick = () => {
    if (session.undo()) toast('已悔棋');
  };
  document.getElementById('btn-restart').onclick = () => {
    closeOverlay();
    session.restart();
    toast('新的一局开始了');
  };
  document.getElementById('btn-full').onclick = toggleFullscreen;
  ui.exitFull.onclick = exitImmersive;

  ui.actions.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === '__again') {
      shownResult = '';
      session.restart();
      return;
    }
    const res = session.action(btn.dataset.action);
    if (res && res.ok === false && res.msg) toast(res.msg);
  });

  const ro = new ResizeObserver(() => fitBoard());
  ro.observe(ui.stage);
  window.addEventListener('orientationchange', () => setTimeout(fitBoard, 120));
  document.addEventListener('fullscreenchange', () => {
    const fs = !!document.fullscreenElement;
    document.body.classList.toggle('immersive', fs);
    ui.exitFull.classList.toggle('hidden', !fs);
    setTimeout(fitBoard, 80);
  });

  session.onChange(() => {
    updateChrome();
    scheduleDraw();
    nav?.refreshCursor();
  });

  nav = initNav({
    session,
    ui,
    getBoardSize: () => boardSize,
    getOverlay: () => overlay,
    isOverlayOpen: () => !!overlay,
    closeOverlay: () => closeOverlay(),
    isTable: () => !ui.table.hidden,
    goHome: () => goHome(),
    toast: msg => toast(msg)
  });
  updater = initUpdater({
    showOverlay: (el, kind) => showOverlay(el, kind),
    closeOverlay: () => closeOverlay(),
    toast: msg => toast(msg)
  });

  renderHome();
  updater.autoCheck();
  window.addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault();
    deferredPrompt = ev;
    renderHome();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    renderHome();
  });
}

/* ---------------- 首页 ---------------- */

function renderHome() {
  const cards = GAMES.map(mod => {
    const card = document.createElement('button');
    card.className = 'game-card';
    card.dataset.id = mod.meta.id;
    card.style.setProperty('--i', String(GAMES.indexOf(mod)));
    card.innerHTML = `
      <div class="thumb"><canvas></canvas></div>
      <div class="card-meta">
        <span class="card-name">${mod.meta.name}</span>
        <span class="card-tag">${mod.meta.tag}</span>
      </div>`;
    card.addEventListener('click', () => openSetup(mod.meta.id));
    drawThumb(card.querySelector('canvas'), mod);
    return card;
  });

  ui.grid.replaceChildren(...cards);

  const actions = [];
  if (session.hasSaved()) {
    actions.push(`<button class="btn gold" id="btn-resume">继续上局${session.state ? '：' + session.meta.name : ''}</button>`);
  }
  if (updater && updater.available()) actions.push(`<button class="btn" id="btn-update">检查更新</button>`);
  if (!isStandalone() && !(updater && updater.available())) actions.push(`<button class="btn" id="btn-install">安装到桌面</button>`);
  actions.push(`<button class="btn ghost" id="btn-home-full">全屏</button>`);
  ui.homeActions.innerHTML = actions.join('');

  const resumeBtn = document.getElementById('btn-resume');
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      if (!session.state && !session.resume()) {
        toast('存档已失效，请重新开始');
        return;
      }
      enterTable();
    };
  }
  const updateBtn = document.getElementById('btn-update');
  if (updateBtn) updateBtn.onclick = () => updater.open();
  const installBtn = document.getElementById('btn-install');
  if (installBtn) installBtn.onclick = installApp;
  document.getElementById('btn-home-full').onclick = toggleFullscreen;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}

function drawThumb(canvas, mod) {
  try {
    const aspect = mod.meta.aspect || 1;
    // aspect = 宽/高：竖版棋盘（军棋 0.5）要把高度拉长，而不是压扁
    const W = 420;
    const H = Math.max(140, Math.round(W / aspect));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const state = (mod.demo && mod.demo()) || mod.create({ mode: 'pvp', level: 2, humanSeat: 0 });
    mod.draw(ctx, state, { w: W, h: H });
  } catch (err) {
    console.warn('[thumb]', mod.meta.id, err);
    canvas.width = 480;
    canvas.height = 480;
  }
}

/* ---------------- 开局设置 ---------------- */

function openSetup(gameId) {
  const mod = getGame(gameId);
  if (!mod) return;
  const { meta } = mod;
  const stored = loadOpts()[gameId] || {};
  const opts = {
    mode: stored.mode === 'pve' ? 'pve' : 'pvp',
    level: [1, 2, 3].includes(stored.level) ? stored.level : 2,
    humanSeat: stored.humanSeat === 1 ? 1 : 0
  };

  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="sheet">
      <div class="sheet-head">
        <div class="mini"><canvas width="160" height="160"></canvas></div>
        <div>
          <h2>${meta.name}</h2>
          <p>${meta.goal}</p>
        </div>
      </div>
      <div id="setup-fields"></div>
      <button class="primary" data-start>开始对弈</button>
      <button class="secondary" data-rules>先看玩法教学</button>
    </div>`;
  showOverlay(wrap, 'setup');
  drawThumb(wrap.querySelector('.mini canvas'), mod);

  const fields = wrap.querySelector('#setup-fields');

  const refresh = () => {
    const keep = [...fields.querySelectorAll('button')].indexOf(document.activeElement);
    fields.innerHTML = `
      <div class="field">
        <label>对战模式</label>
        <div class="seg">
          <button data-mode="pvp" class="${opts.mode === 'pvp' ? 'on' : ''}">双人对弈<small>同一台设备轮流下</small></button>
          <button data-mode="pve" class="${opts.mode === 'pve' ? 'on' : ''}">人机对战<small>和电脑下棋</small></button>
        </div>
      </div>
      ${opts.mode === 'pve' ? `
      <div class="field">
        <label>电脑水平</label>
        <div class="seg">
          ${LEVELS.map(l => `
            <button data-level="${l.v}" class="${opts.level === l.v ? 'on' : ''}">
              ${l.label}<small>${l.desc}</small>
            </button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>我执</label>
        <div class="seg">
          <button data-seat="0" class="${opts.humanSeat === 0 ? 'on' : ''}">${meta.seatNames[0]}先手</button>
          <button data-seat="1" class="${opts.humanSeat === 1 ? 'on' : ''}">${meta.seatNames[1]}后手</button>
        </div>
      </div>` : ''}`;

    fields.querySelectorAll('[data-mode]').forEach(btn => {
      btn.onclick = () => { opts.mode = btn.dataset.mode; refresh(); };
    });
    fields.querySelectorAll('[data-level]').forEach(btn => {
      btn.onclick = () => { opts.level = Number(btn.dataset.level); refresh(); };
    });
    fields.querySelectorAll('[data-seat]').forEach(btn => {
      btn.onclick = () => { opts.humanSeat = Number(btn.dataset.seat); refresh(); };
    });
    if (keep >= 0) fields.querySelectorAll('button')[keep]?.focus({ preventScroll: true });
  };
  refresh();

  wrap.querySelector('[data-start]').onclick = () => {
    saveOpts(gameId, opts);
    closeOverlay();
    session.start(gameId, opts);
    enterTable();
  };
  wrap.querySelector('[data-rules]').onclick = () => openRules(mod, () => openSetup(gameId));
}

/* ---------------- 对局页 ---------------- */

function enterTable() {
  if (!session.state) {
    goHome();
    return;
  }
  ui.home.hidden = true;
  ui.table.hidden = false;
  ui.canvas.style.width = '0px';
  ui.canvas.style.height = '0px';
  shownResult = '';
  updateChrome();
  requestAnimationFrame(() => {
    fitBoard();
    nav?.afterEnterTable();
  });
}

function goHome() {
  ui.table.hidden = true;
  ui.home.hidden = false;
  ui.home.style.display = '';
  exitImmersive();
  if (overlayKind === 'result') closeOverlay();
  renderHome();
  nav?.afterGoHome();
}

function updateChrome() {
  if (!session.mod || !session.state) return;
  const { meta } = session.mod;
  const st = session.state;
  const levelName = (LEVELS.find(l => l.v === st.level) || LEVELS[1]).label;

  ui.tName.textContent = meta.name;
  ui.tSub.textContent = st.mode === 'pve' ? `人机对战 · ${levelName}` : '双人对弈 · 同屏轮流';

  const turns = st.seats.map((seat, i) => {
    const color = (meta.seatColors && meta.seatColors[i]) || '#9aa4b2';
    const active = !st.over && st.turn === i;
    return `<div class="seat ${active ? 'active' : ''}">
      <span class="stone-dot" style="background:${color}"></span>
      ${seat.name}${seat.ai ? '（电脑）' : ''}
    </div>`;
  }).join('');
  ui.seats.innerHTML = turns;

  ui.note.textContent = st.over ? (st.result ? st.result.text : '对局结束') : (st.note || '');
  ui.thinking.classList.toggle('hidden', !session.busy);

  const undoBtn = document.getElementById('btn-undo');
  undoBtn.disabled = !(st.history && st.history.length) || session.busy;

  const actions = session.mod.actions ? session.mod.actions(st) : [];
  if (st.over) actions.push({ id: '__again', label: '再来一局', primary: true });
  ui.actions.innerHTML = actions.map(a => `
    <button class="btn ${a.primary ? 'gold' : 'ghost'}" data-action="${a.id}">${a.label}</button>`).join('');

  if (st.over && st.result) {
    const key = `${st.result.text}|${st.result.reason}`;
    if (shownResult !== key && overlayKind !== 'rules') {
      shownResult = key;
      showResult(st);
    }
  } else if (overlayKind === 'result') {
    closeOverlay();
    shownResult = '';
  }
}

function fitBoard() {
  if (!session.mod || ui.table.hidden) return;
  const box = ui.stage.getBoundingClientRect();
  const availW = Math.max(140, box.width - 14);
  const availH = Math.max(140, box.height - 14);
  const aspect = session.meta.aspect || 1;

  let w = availW;
  let h = availW / aspect;
  if (h > availH) {
    h = availH;
    w = h * aspect;
  }

  const dpr = Math.min(3, window.devicePixelRatio || 1);
  ui.canvas.style.width = `${Math.round(w)}px`;
  ui.canvas.style.height = `${Math.round(h)}px`;
  ui.canvas.width = Math.round(w * dpr);
  ui.canvas.height = Math.round(h * dpr);
  ui.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  boardSize = { w, h };
  drawBoard();
  nav?.refreshCursor();
}

function scheduleDraw() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    drawBoard();
  });
}

function drawBoard() {
  if (!session.mod || !session.state || ui.table.hidden) return;
  const { w, h } = boardSize;
  try {
    ui.ctx.clearRect(0, 0, w, h);
    session.mod.draw(ui.ctx, session.state, { w, h });
  } catch (err) {
    console.warn('[draw]', session.meta && session.meta.id, err);
  }
}

/* ---------------- 弹层 ---------------- */

function showOverlay(el, kind) {
  closeOverlay();
  overlay = el;
  overlayKind = kind;
  nav?.onOverlayOpened(el);
  document.body.appendChild(el);
  el.addEventListener('pointerdown', ev => {
    if (ev.target === el && kind !== 'result') closeOverlay();
  });
}

function closeOverlay() {
  const had = !!overlay;
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
  overlayKind = null;
  if (had) nav?.onOverlayClosed();
}

function openRules(mod, back) {
  if (!mod) return;
  const meta = mod.meta;
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="sheet">
      <div class="sheet-head">
        <div class="mini"><canvas></canvas></div>
        <div>
          <h2>${meta.name} · 玩法教学</h2>
          <p>${meta.en} · 两分钟看懂规则</p>
        </div>
      </div>
      <div class="rule-goal">${meta.goal}</div>
      <div>
        ${meta.rules.map((r, i) => `
          <div class="rule-item">
            <span class="no">${i + 1}</span>
            <div><h3>${r.h}</h3><p>${r.p}</p></div>
          </div>`).join('')}
      </div>
      <div class="tips-title">实战小贴士</div>
      <ul class="tips">${meta.tips.map(t => `<li>${t}</li>`).join('')}</ul>
      <button class="primary" data-close>${back ? '看懂了，去开局' : '知道了，继续下棋'}</button>
    </div>`;
  showOverlay(wrap, 'rules');
  drawThumb(wrap.querySelector('canvas'), mod);
  wrap.querySelector('[data-close]').onclick = () => {
    closeOverlay();
    if (back) back();
  };
}

function showResult(st) {
  const r = st.result;
  const plies = Number.isFinite(st.ply) ? st.ply : (st.history ? st.history.length : null);
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="result-card">
      <div class="big">${r.text}</div>
      <div class="sub">${st.mode === 'pve' ? '人机对战' : '双人对弈'}${plies ? ` · 共 ${plies} 手` : ''}</div>
      <div class="row">
        <button class="btn gold" data-r="again">再来一局</button>
        <button class="btn" data-r="view">看看棋盘</button>
        <button class="btn" data-r="home">返回首页</button>
      </div>
    </div>`;
  showOverlay(wrap, 'result');
  wrap.querySelector('[data-r="again"]').onclick = () => {
    closeOverlay();
    shownResult = '';
    session.restart();
  };
  wrap.querySelector('[data-r="view"]').onclick = () => closeOverlay();
  wrap.querySelector('[data-r="home"]').onclick = () => {
    closeOverlay();
    shownResult = '';
    goHome();
  };
}

function toast(msg) {
  if (!ui.toast) return;
  ui.toast.textContent = msg;
  ui.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 1900);
}

/* ---------------- 全屏 / 安装 ---------------- */

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    return;
  }
  const req = document.documentElement.requestFullscreen;
  if (req) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      return;
    } catch {}
  }
  // 不支持全屏 API（如 iPad Safari）时退化为沉浸布局
  document.body.classList.add('immersive');
  ui.exitFull.classList.remove('hidden');
  setTimeout(fitBoard, 80);
}

function exitImmersive() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  document.body.classList.remove('immersive');
  ui.exitFull.classList.add('hidden');
  setTimeout(fitBoard, 80);
}

async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    renderHome();
    if (choice && choice.outcome === 'accepted') toast('已添加到设备');
    return;
  }
  toast('请用浏览器菜单中的「添加到主屏幕 / 安装应用」');
}

/* ---------------- 启动 ---------------- */

mount();

// APK（Capacitor）里资源本来就在本地，不用 Service Worker，
// 还要清掉旧缓存，否则更新 APK 后会先看到旧界面
if ('serviceWorker' in navigator) {
  if (window.Capacitor) {
    navigator.serviceWorker.getRegistrations()
      .then(list => list.forEach(r => r.unregister()))
      .catch(() => {});
    if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}
