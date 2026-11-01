// 零依赖静态文件服务：为 /public 提供静态资源，支持 SPA 回退与弱缓存策略
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const PORT = Number(process.env.PORT || 8030);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.md']);
const gzCache = new Map();

function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null; // 形如 /%E0%A4%A 的坏编码，直接 400
  }
  const clean = normalize(decoded.replace(/\/+$/g, '') || '/');
  if (clean.includes('..')) return null;
  return clean === '/' ? join(ROOT, 'index.html') : join(ROOT, clean);
}

// ---- 在线更新代理：APK 内的「检查更新」可以指向本站，由本服务器去 GitHub 取最新发布 ----
const REPO = process.env.GITHUB_REPO || 'lu8010252/chess';
const GH_HEADERS = {
  'user-agent': 'qige-chess-update',
  accept: 'application/vnd.github+json',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
};
let latestCache = { at: 0, data: null };

async function latestRelease() {
  if (latestCache.data && Date.now() - latestCache.at < 10 * 60 * 1000) return latestCache.data;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: GH_HEADERS });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  const asset = (j.assets || []).find(a => /\.apk$/i.test(a.name));
  if (!asset) throw new Error('最新发布里没有 APK');
  latestCache = {
    at: Date.now(),
    data: { version: j.tag_name, notes: j.body || '', size: asset.size, url: asset.browser_download_url, name: asset.name }
  };
  return latestCache.data;
}

async function handleUpdate(req, res, pathname) {
  try {
    const rel = await latestRelease();
    if (pathname === '/api/update') {
      const body = JSON.stringify({ version: rel.version, notes: rel.notes, size: rel.size, apkUrl: '/api/update/apk' });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' });
      return res.end(body);
    }
    const up = await fetch(rel.url, { headers: { 'user-agent': 'qige-chess-update' }, redirect: 'follow' });
    if (!up.ok || !up.body) throw new Error(`下载 ${up.status}`);
    const headers = {
      'content-type': 'application/vnd.android.package-archive',
      'content-disposition': `attachment; filename="${rel.name}"`,
      'access-control-allow-origin': '*'
    };
    const len = up.headers.get('content-length');
    if (len) headers['content-length'] = len;
    res.writeHead(200, headers);
    Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
}

const server = createServer(async (req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/api/update' || pathname === '/api/update/apk') return handleUpdate(req, res, pathname);
  const filePath = resolvePath(req.url || '/');
  if (!filePath) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw Object.assign(new Error('is dir'), { code: 'ENOTDIR' });

    const body = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const etag = `W/"${info.size}-${Math.round(info.mtimeMs)}"`;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag });
      return res.end();
    }

    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=86400',
      etag,
      'x-content-type-options': 'nosniff',
      // PWA 在子路径部署时也能正常工作
      'service-worker-allowed': '/'
    };

    // 文本类资源 gzip 压缩（结果按 etag 缓存在内存里，只压一次）
    if (COMPRESSIBLE.has(ext) && body.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      let zipped = gzCache.get(etag);
      if (!zipped) {
        zipped = gzipSync(body);
        gzCache.set(etag, zipped);
      }
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding', 'content-length': zipped.length });
      return res.end(zipped);
    }

    res.writeHead(200, { ...headers, 'content-length': body.length });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      // 未知路径回退到首页，便于前端路由 / 直接访问 /play/xxx
      try {
        const html = await readFile(join(ROOT, 'index.html'));
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
        return res.end(html);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
      }
    }
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`棋阁已启动：http://localhost:${PORT}  (HOST=${HOST})`);
});
