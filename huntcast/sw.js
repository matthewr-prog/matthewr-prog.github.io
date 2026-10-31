/* HuntCast service worker: offline app shell + opportunistic tile/forecast caching. */
const VERSION = 'huntcast-v1.2.0';
const SHELL = VERSION + '-shell';
const TILES = 'huntcast-tiles-v1';
const API = 'huntcast-api-v1';
const DATA = 'huntcast-data-v1'; // JSON data (regs, shop, ads): network-first, kept for offline
const DATA_FILES = ['./data/regs/index.json', './data/regs/PA.json', './data/shop.json', './data/ads.json'];
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/util.js', './js/astro.js', './js/weather.js', './js/species.js', './js/model.js', './js/ads.js', './js/regs.js', './js/shop.js', './js/app.js',
  './vendor/leaflet.js', './vendor/leaflet.css', './vendor/suncalc.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES))
    // data files are best-effort: a missing one must not block installing the app shell
    .then(() => caches.open(DATA).then((d) => Promise.all(DATA_FILES.map((f) => d.add(f).catch(() => null)))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('huntcast-v') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // map tiles: cache-first, refresh in background, bounded size
  if (/tile\.openstreetmap\.org|arcgisonline\.com|opentopomap\.org/.test(url.host)) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) { c.put(req, r.clone()); trim(TILES, 600); } return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // weather APIs: not intercepted. The app keeps its own last-forecast copy in localStorage so it can flag "offline" honestly.
  if (/open-meteo\.com$/.test(url.host)) return;
  if (url.origin !== location.origin) return; // Nominatim etc.: network only

  // JSON data (data/regs/*.json, shop.json, ads.json): network-first so yearly updates show up at once,
  // falling back to the last copy when offline.
  if (/\/data\/.+\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req.url, { cache: 'no-cache' }).then((r) => {
      if (r && r.ok) { const copy = r.clone(); caches.open(DATA).then((c) => c.put(req, copy)); }
      return r;
    }).catch(() => caches.open(DATA).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || Response.error())));
    return;
  }

  // app shell: stale-while-revalidate
  e.respondWith(caches.open(SHELL).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { net.catch(() => {}); return hit; }
    const r = await net;
    return r || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
  }));
});
