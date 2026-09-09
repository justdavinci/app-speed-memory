// Service worker: cache do "app shell" para funcionar offline.
// A versão no nome do cache invalida tudo quando os arquivos mudam.
const CACHE = 'piscamemory-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/js/app.js',
  './assets/js/util.js',
  './assets/js/storage.js',
  './assets/js/scoring.js',
  './assets/js/engine.js',
  './assets/js/charts.js',
  './assets/js/perception.js',
  './assets/js/adaptive.js',
  './assets/js/generators/digits.js',
  './assets/js/generators/words.js',
  './assets/js/generators/sentences.js',
  './assets/js/generators/lexicon.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache primeiro (o app é estático); a rede só entra quando falta no cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      return response;
    }).catch(() => caches.match('./index.html'))),
  );
});
