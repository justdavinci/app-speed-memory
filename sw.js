// Service worker: cache do "app shell" para funcionar offline.
// A versão no nome do cache invalida tudo quando os arquivos mudam.
const CACHE = 'piscamemory-v5';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/css/tryhard-enhancements.css',
  './assets/js/app.js',
  './assets/js/util.js',
  './assets/js/storage.js',
  './assets/js/scoring.js',
  './assets/js/engine.js',
  './assets/js/charts.js',
  './assets/js/perception.js',
  './assets/js/adaptive.js',
  './assets/js/tryhard/config.js',
  './assets/js/tryhard/rng.js',
  './assets/js/tryhard/timing.js',
  './assets/js/tryhard/difficulty.js',
  './assets/js/tryhard/metrics.js',
  './assets/js/tryhard/stimuli.js',
  './assets/js/tryhard/symbols.js',
  './assets/js/tryhard/store.js',
  './assets/js/tryhard/runner.js',
  './assets/js/tryhard/view.js',
  './assets/js/tryhard/ui.js',
  './assets/js/tryhard/retention.js',
  './assets/js/tryhard/retentionUi.js',
  './assets/js/tryhard/processingProfile.js',
  './assets/js/tryhard/processingProfileUi.js',
  './assets/js/tryhard/modules/index.js',
  './assets/js/tryhard/modules/partialReport.js',
  './assets/js/tryhard/modules/maskResistance.js',
  './assets/js/tryhard/modules/peripheralMatrix.js',
  './assets/js/tryhard/modules/iconicReadout.js',
  './assets/js/tryhard/modules/peripheralFixation.js',
  './assets/js/tryhard/modules/abstractFlash.js',
  './assets/js/tryhard/modules/visualThreshold.js',
  './assets/js/tryhard/modules/benchmark.js',
  './assets/js/tryhard/modules/realWorld.js',
  './assets/js/tryhard/modules/availabilityBenchmark.js',
  './assets/js/tryhard/modules/realWorldAvailability.js',
  './assets/js/tryhard/curriculum.js',
  './assets/js/tryhard/availability/config.js',
  './assets/js/tryhard/availability/categories.js',
  './assets/js/tryhard/availability/staircase.js',
  './assets/js/tryhard/availability/threshold.js',
  './assets/js/tryhard/availability/motor.js',
  './assets/js/tryhard/availability/index.js',
  './assets/js/tryhard/availability/ui.js',
  './assets/js/tryhard/modules/transferBenchmark.js',
  './assets/js/tryhard/transfer/config.js',
  './assets/js/tryhard/transfer/scene.js',
  './assets/js/tryhard/transfer/queries.js',
  './assets/js/tryhard/transfer/novelty.js',
  './assets/js/tryhard/transfer/metrics.js',
  './assets/js/tryhard/transfer/adapt.js',
  './assets/js/tryhard/transfer/vocab.js',
  './assets/js/tryhard/transfer/families/index.js',
  './assets/js/tryhard/transfer/families/util.js',
  './assets/js/tryhard/transfer/families/symbolGrid.js',
  './assets/js/tryhard/transfer/families/structuredInfo.js',
  './assets/js/tryhard/transfer/families/interfacePanel.js',
  './assets/js/tryhard/transfer/families/documentFragment.js',
  './assets/js/tryhard/transfer/families/mapDiagram.js',
  './assets/js/tryhard/transfer/families/sceneLayout.js',
  './assets/js/tryhard/transfer/families/composite.js',
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const fromNetwork = fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(fromNetwork);
      return cached;
    }
    return (await fromNetwork) || (await cache.match('./index.html'));
  })());
});
