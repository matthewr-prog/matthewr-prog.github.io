/* EmployMe service worker: offline app shell; network-first navigations + data JSON so updates show on reopen. */
const VERSION = 'employme-v0.1.0';
const SHELL = VERSION + '-shell';
const DATA = 'employme-data-v1';
const DATA_FILES = ['./data/jobs.json'];
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './css/app.css',
  './js/util.js', './js/search.js', './js/views.js', './js/app.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => caches.open(DATA).then((d) => Promise.all(DATA_FILES.map((f) => d.add(new Request(f, { cache: 'reload' })).catch(() => null)))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('employme-v') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Nominatim / OSM embeds: network only

  // job data: network-first so new listings show at once; last copy kept for offline
  if (/\/data\/.+\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req.url, { cache: 'no-cache' }).then((r) => {
      if (r && r.ok) { const copy = r.clone(); caches.open(DATA).then((c) => c.put(req, copy)); }
      return r;
    }).catch(() => caches.open(DATA).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || Response.error())));
    return;
  }
  // page loads: network-first, cached copy offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req.url, { cache: 'no-cache' }).then((r) => {
      if (r && r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('./index.html', copy)); }
      return r;
    }).catch(() => caches.open(SHELL).then((c) => c.match('./index.html'))));
    return;
  }
  // shell assets: stale-while-revalidate
  e.respondWith(caches.open(SHELL).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { net.catch(() => {}); return hit; }
    const r = await net;
    return r || Response.error();
  }));
});
