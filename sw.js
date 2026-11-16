/* Thermocables Portal — Service Worker
 * Strategy:
 *   - App shell (HTML, SW, manifest): network-first → cache fallback
 *   - Data (data.csv, bom.csv): network-first → cache fallback
 *   - Same-origin assets: stale-while-revalidate
 *   - Cross-origin (CDNs, fonts): cache-first
 */

const VERSION      = 'v1.0.1';
const SHELL_CACHE  = `tc-shell-${VERSION}`;
const DATA_CACHE   = `tc-data-${VERSION}`;

// URLs to pre-cache on install
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
      // Add each URL individually so one failure doesn't block install
      await Promise.all(
        SHELL_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Precache failed:', url, err.message))
        )
      );
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
      await self.clients.claim();
    })()
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // Data files → network-first (fresh when online, cached when offline)
  if (/\/data\.csv$/i.test(url.pathname) || /\/bom\.csv$/i.test(url.pathname)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // HTML navigation → network-first so app updates propagate
  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  // Same-origin assets → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  // Cross-origin (CDNs, fonts) → cache-first
  event.respondWith(cacheFirst(req, SHELL_CACHE));
});

/* ---------- STRATEGY: NETWORK-FIRST ---------- */
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  // Strip ?v=... so all versions share one cache key
  const cacheKey = new Request(req.url.split('?')[0], { method: 'GET' });

  try {
    // Bypass HTTP cache so we always get truly fresh data when online
    const fresh = await fetch(cacheKey, { cache: 'no-store' });
    if (fresh.ok) await cache.put(cacheKey, fresh.clone());
    return fresh;
  } catch (err) {
    // Network failed → serve from cache (offline mode)
    const cached = await cache.match(cacheKey);
    if (cached) {
      console.log('[SW] Offline — serving cached:', cacheKey.url);
      return cached;
    }
    // Nothing cached — return a helpful error
    return new Response(
      'Offline — this resource has never been loaded. Please connect to the internet once to cache it.',
      { status: 503, headers: { 'Content-Type': 'text/plain' } }
    );
  }
}

/* ---------- STRATEGY: STALE-WHILE-REVALIDATE ---------- */
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

/* ---------- STRATEGY: CACHE-FIRST ---------- */
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

/* ---------- MESSAGE HANDLING (optional manual sync) ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_DATA_CACHE') {
    caches.delete(DATA_CACHE).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});
