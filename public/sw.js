// Service worker: caches the big, rarely-changing files (models, sounds, three.js) so the game
// starts fast on phones. Pages and game code always come from the network first so updates show up.
const CACHE = 'undead-ops-assets-v9';
const CACHE_FIRST = ['/assets/', '/lib/', '/jsm/', '/icons/'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/ws') || url.pathname.startsWith('/api/')) return;
  if (CACHE_FIRST.some((p) => url.pathname.startsWith(p))) {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }));
  } else {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  }
});
