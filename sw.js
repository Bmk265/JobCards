self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // A basic fetch listener is required for PWA installability
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
