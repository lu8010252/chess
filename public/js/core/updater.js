// 在线更新（仅 APK 内可用）：检查新版本 → 应用内下载 → 唤起系统安装器
// 更新源按顺序尝试：① 你自己的更新服务器（docker 部署的这个站点，国内访问稳）② GitHub Releases
import { VERSION, UPDATE_SERVER, REPO } from './version.js';

const SERVER_KEY = 'qige.updateServer';
const SKIP_KEY = 'qige.skipVersion';

const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

function getServer() {
  try {
    return (localStorage.getItem(SERVER_KEY) || UPDATE_SERVER || '').trim().replace(/\/+$/, '');
  } catch {
    return (UPDATE_SERVER || '').trim().replace(/\/+$/, '');
  }
}

function setServer(v) {
  try {
    const t = (v || '').trim().replace(/\/+$/, '');
    if (t) localStorage.setItem(SERVER_KEY, t);
    else localStorage.removeItem(SERVER_KEY);
  } catch {}
}

function parseVer(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(latest, current) {
  const a = parseVer(latest);
  const b = parseVer(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 取最新版信息：{ version, notes, apkUrl, size, source } */
async function fetchLatest() {
  const errors = [];
  const server = getServer();
  if (server) {
    try {
      const j = await getJson(`${server}/api/update`);
      if (j && j.version && j.apkUrl) {
        const apkUrl = /^https?:/i.test(j.apkUrl) ? j.apkUrl : server + j.apkUrl;
        return { version: j.version, notes: j.notes || '', apkUrl, size: j.size || 0, source: '更新服务器' };
      }
      errors.push('更新服务器没有可用的安装包');
    } catch (e) {
      errors.push(`更新服务器连不上（${e.message || e}）`);
    }
  }
  try {
    const j = await getJson(`https://api.github.com/repos/${REPO}/releases/latest`);
    const asset = (j.assets || []).find(a => /\.apk$/i.test(a.name));
    if (!asset) throw new Error('发布里没有 APK');
    return { version: j.tag_name, notes: j.body || '', apkUrl: asset.browser_download_url, size: asset.size || 0, source: 'GitHub' };
  } catch (e) {
    errors.push(`GitHub 接口不通（${e.message || e}）`);
  }
  // 备用：只访问 github.com 网页本身（能打开 GitHub 就能用），不依赖 api.github.com
  try {
    const { tag } = await window.Capacitor.registerPlugin('ApkUpdater').latest({ repo: REPO });
    const v = String(tag).replace(/^v/, '');
    return {
      version: v,
      notes: '',
      apkUrl: `https://github.com/${REPO}/releases/download/v${v}/qige-chess-v${v}.apk`,
      size: 0,
      source: 'GitHub'
    };
  } catch (e) {
    errors.push(`GitHub 网页也不通（${e.message || e}）`);
  }
  throw new Error(errors.join('；'));
}

function cleanNotes(text) {
  return String(text || '')
    .replace(/^#+\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 360);
}

function fmtMB(n) {
  return n ? `${(n / 1048576).toFixed(1)} MB` : '';
}

/** HTML 属性转义（更新服务器地址是用户输入的，不能直接拼进模板） */
function escAttr(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 下载并安装；onProgress(已下载字节, 总字节) */
async function downloadAndInstall(info, onProgress) {
  const plugin = window.Capacitor.registerPlugin('ApkUpdater');
  if (!info.downloaded) {
    const handle = await plugin.addListener('progress', e => onProgress(e.received, e.total));
    try {
      await plugin.download({ url: info.apkUrl });
      info.downloaded = true;
    } finally {
      handle.remove();
    }
  }
  await plugin.install();
}

export function initUpdater(api) {
  const available = () => native();

  function open(auto = false, preset = null) {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `
      <div class="sheet update-sheet">
        <div class="sheet-head">
          <div>
            <h2>检查更新</h2>
            <p>当前版本 v${VERSION}</p>
          </div>
        </div>
        <div class="up-status" data-status>正在检查…</div>
        <pre class="up-notes hidden" data-notes></pre>
        <div class="up-bar hidden" data-bar><i data-fill></i></div>
        <button class="primary hidden" data-do>立即更新</button>
        <button class="secondary" data-recheck>重新检查</button>
        <details class="up-adv">
          <summary>更新服务器（可选）</summary>
          <p>国内访问 GitHub 慢或连不上时，填你自己部署的棋阁地址（和网页版同一个），例如 https://chess.example.com。建议使用 https；http 明文地址有被劫持、替换安装包的风险。</p>
          <input data-server type="url" placeholder="https://" value="${escAttr(getServer())}" />
          <button class="secondary" data-save>保存并重新检查</button>
        </details>
        <button class="secondary" data-close>${auto ? '以后再说' : '关闭'}</button>
      </div>`;
    api.showOverlay(wrap, 'update');

    const $ = sel => wrap.querySelector(sel);
    const status = $('[data-status]');
    const notes = $('[data-notes]');
    const bar = $('[data-bar]');
    const fill = $('[data-fill]');
    const doBtn = $('[data-do]');
    let info = null;
    let busy = false;

    async function check() {
      status.textContent = '正在检查…';
      notes.classList.add('hidden');
      bar.classList.add('hidden');
      doBtn.classList.add('hidden');
      info = null;
      try {
        const latest = preset || await fetchLatest();
        preset = null;
        if (isNewer(latest.version, VERSION)) {
          info = latest;
          status.textContent = `发现新版本 ${String(latest.version).replace(/^v?/, 'v')}${latest.size ? `（${fmtMB(latest.size)}）` : ''} · 来源：${latest.source}`;
          const t = cleanNotes(latest.notes);
          if (t) {
            notes.textContent = t;
            notes.classList.remove('hidden');
          }
          doBtn.textContent = '立即更新';
          doBtn.classList.remove('hidden');
          doBtn.focus?.({ preventScroll: true });
        } else {
          status.textContent = '已经是最新版本 ✓';
        }
      } catch (e) {
        status.textContent = `检查失败：${e.message || e}。可在下方填写更新服务器后重试。`;
      }
    }

    doBtn.onclick = async () => {
      if (!info || busy) return;
      busy = true;
      doBtn.disabled = true;
      bar.classList.remove('hidden');
      fill.style.width = '0%';
      status.textContent = info.downloaded ? '正在打开安装界面…' : '正在下载…';
      try {
        await downloadAndInstall(info, (got, total) => {
          const pct = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : 0;
          fill.style.width = `${pct}%`;
          status.textContent = total > 0 ? `正在下载… ${pct}%（${fmtMB(got)} / ${fmtMB(total)}）` : `正在下载… ${fmtMB(got)}`;
        });
        fill.style.width = '100%';
        status.textContent = '已下载，请在系统弹出的界面里点「安装」。装好后重新打开即可。';
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (msg.includes('need_permission')) {
          status.textContent = '请在刚打开的设置里允许「安装未知应用」，返回后再点「立即更新」。';
        } else {
          status.textContent = `更新失败：${msg}${info.source === 'GitHub' ? '（国内访问 GitHub 较慢，可在下方填写更新服务器）' : ''}`;
        }
      } finally {
        busy = false;
        doBtn.disabled = false;
        doBtn.textContent = '重试';
      }
    };

    $('[data-recheck]').onclick = () => check();
    $('[data-save]').onclick = () => {
      setServer($('[data-server]').value);
      api.toast('已保存更新服务器');
      check();
    };
    $('[data-close]').onclick = () => {
      if (auto && info) {
        try { localStorage.setItem(SKIP_KEY, info.version); } catch {}
      }
      api.closeOverlay();
    };

    check();
  }

  /** 启动几秒后静默检查一次；有新版才弹窗（同一版本点过「以后再说」就不再打扰） */
  async function autoCheck() {
    if (!native()) return;
    setTimeout(async () => {
      try {
        // 正在对局或有弹层时先不打扰，玩家可以回首页后手动检查
        if (api.canPrompt && !api.canPrompt()) return;
        const latest = await fetchLatest();
        let skipped = '';
        try { skipped = localStorage.getItem(SKIP_KEY) || ''; } catch {}
        if (isNewer(latest.version, VERSION) && latest.version !== skipped) {
          if (api.canPrompt && !api.canPrompt()) return;
          open(true, latest);
        }
      } catch {}
    }, 4000);
  }

  return { available, open: () => open(false), autoCheck };
}
