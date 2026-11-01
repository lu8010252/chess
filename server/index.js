// 零依赖静态文件服务：为 /public 提供静态资源，支持 SPA 回退与弱缓存策略
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
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

const server = createServer(async (req, res) => {
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
