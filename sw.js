const CACHE = 'baby-tracker-v11';
// Keep ?v= in step with index.html so precached URLs match page requests
const ASSETS = [
  '.',
  'index.html',
  'css/styles.css?v=11',
  'js/app.js?v=11',
  'js/config.js?v=11',
  'js/icons.js?v=11',
  'js/store.js?v=11',
  'js/schedules.js?v=11',
  'js/trends.js?v=11',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first (revalidating, so new deploys land immediately), cache fallback.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
