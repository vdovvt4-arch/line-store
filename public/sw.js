const CACHE_NAME = 'line-store-v4';
const PRECACHE_URLS = ['/store', '/store/line', '/store.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache admin APIs or write endpoints
  if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/orders') || url.pathname.startsWith('/api/customer') || url.pathname.startsWith('/api/coupons')) {
    return;
  }

  // Stale-while-revalidate for /api/store and store pages/assets
  if (url.pathname === '/api/store' || url.pathname.startsWith('/store') || url.pathname === '/manifest.json' || url.pathname === '/icon.svg') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(req);
        const networkPromise = fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || networkPromise;
      })
    );
  }
});
