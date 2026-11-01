// 离线缓存：安装后可断网使用
const VERSION = 'qige-v4';
const CACHE = `${VERSION}-static`;

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/core/app.js',
  '/js/core/session.js',
  '/js/core/version.js',
  '/js/core/ai-worker.js',
  '/js/games/index.js',
  '/js/games/_util.js',
  '/js/games/_draw.js',
  '/js/games/gomoku.js',
  '/js/games/xiangqi.js',
  '/js/games/junqi.js',
  '/js/games/chess.js',
  '/js/games/go.js',
  '/js/games/checkers.js',
  '/js/games/aeroplane.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 页面导航：优先网络，离线时用缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then(hit => hit || caches.match('/')))
    );
    return;
  }

  // 静态资源：缓存优先，后台更新
  event.respondWith(
    caches.match(req).then(hit => {
      const refresh = fetch(req).then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
      if (hit) {
        refresh.catch(() => {}); // 先给缓存，后台静默更新，下次打开就是新版
        return hit;
      }
      return refresh;
    })
  );
});
