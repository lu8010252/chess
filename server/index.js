// 零依赖静态文件服务：为 /public 提供静态资源，支持 SPA 回退与弱缓存策略
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]).replace(/\/+$/g, '') || '/');
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

    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=86400',
      etag,
      // PWA 在子路径部署时也能正常工作
      'service-worker-allowed': '/'
    });
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
