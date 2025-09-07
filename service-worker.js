/* Basic cache-first service worker for offline play */
const CACHE = 'invaders-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/192.png',
  './icons/512.png',
  './js/game.js',
  './bgmusic.mp3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(resp => {
      const copy = resp.clone();
      const url = new URL(request.url);
      // Only cache same-origin
      if (url.origin === self.location.origin) {
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
