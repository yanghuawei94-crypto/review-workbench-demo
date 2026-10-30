// ============================================================
// sw.js — 演示版 Service Worker（GitHub Pages 离线缓存）
// 策略：
//   - 页面导航（HTML）：网络优先，失败回缓存（保证拿到最新版，断网兜底）
//   - 静态资源：缓存优先，miss 时网络回填
// precache：主文档 + 同源 vendor 三件（Tailwind / sql.js js+wasm）
//   —— 静态资源已全部同源化（vendor/），无跨域 CORS 问题，cache.add 即可
// 发版必改：CACHE 版本号递增（旧缓存自动清理）
// ============================================================
const CACHE = 'rw-demo-v3';
const PRECACHE = [
  './',                      // 主文档
  'vendor/tailwind.js',
  'vendor/sql-wasm.js',
  'vendor/sql-wasm.wasm',
];

// 安装：逐个预缓存（单个失败不阻塞，仅该资源失去离线能力）
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async (url) => {
      try { await cache.add(url); } catch (e) { console.warn('[sw] precache 失败：', url, e.message); }
    }));
    self.skipWaiting();
  })());
});

// 激活：清旧版本缓存并立即接管
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 拦截请求：导航网络优先，其余缓存优先
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    // 导航：先网络（拿最新版），失败回缓存（离线兜底）
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./', fresh.clone());           // 统一以 './' 键存放最新文档
        return fresh;
      } catch (e) {
        const cached = await caches.match('./', { ignoreSearch: true });
        if (cached) return cached;
        return new Response('离线且无缓存，请联网后首次访问本页。', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // 资源：缓存优先，miss 回网络并回填（仅同源与 precache 清单，不代存第三方）
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (resp.ok && req.url.startsWith(self.location.origin)) {
        const cache = await caches.open(CACHE);
        cache.put(req, resp.clone());
      }
      return resp;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
