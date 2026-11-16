/* Thermocables Portal — Service Worker */

// 👇 1. I CHANGED THE VERSION HERE
const VERSION      = 'v1.0.1'; 
const SHELL_CACHE  = `tc-shell-${VERSION}`;
const DATA_CACHE   = `tc-data-${VERSION}`;

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Precache failed:', url, err.message))
        )
      );
      // 👇 2. I ADDED THIS LINE
      await self.skipWaiting(); 
    })()
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      );
      // 👇 3. I ADDED THIS LINE
      await self.clients.claim(); 
    })()
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  if (/\/data\.csv$/i.test(url.pathname) || /\/bom\.csv$/i.test(url.pathname)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  event.respondWith(cacheFirst(req, SHELL_CACHE));
});

/* ---------- STRATEGIES ---------- */
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cacheKey = new Request(req.url.split('?')[0], { method: 'GET' });
  try {
    const fresh = await fetch(cacheKey, { cache: 'no-store' });
    if (fresh.ok) await cache.put(cacheKey, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then(async res => {
      if (res.ok) await cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || networkPromise || new Response('', { status: 504 });
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}
