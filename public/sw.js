/*
 * LibreNav service worker.
 *
 * Goal is narrow and deliberate: make the app *open* without a signal. It
 * caches the shell (HTML, JS, CSS, icons) and nothing else.
 *
 * Live data is never cached. A stale route, a stale charger list, or stale
 * traffic is worse than an honest failure — a driver acting on cached traffic
 * from an hour ago is being actively misled. Those requests always go to the
 * network and are allowed to fail.
 */

const VERSION = 'librenav-v1';
const SHELL = `${VERSION}-shell`;

/** Hosts serving live data; never served from cache. */
const LIVE_HOSTS = [
  'valhalla1.openstreetmap.de',
  'photon.komoot.io',
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.private.coffee',
  'api.openwebninja.com',
  'api.open-meteo.com'
];

self.addEventListener('install', (event) => {
  // The shell is populated lazily on first fetch; precaching hashed Next.js
  // chunk names here would mean guessing at build output.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (LIVE_HOSTS.includes(url.hostname)) return;

  // Map tiles are large and change rarely, but caching them wholesale would
  // quietly consume hundreds of megabytes. Leave them to the HTTP cache.
  if (url.hostname.includes('tiles.') || url.hostname.includes('basemaps.') || url.hostname.includes('elevation-tiles')) {
    return;
  }

  // Navigations: network first so a deploy is picked up, cache as the fallback
  // that makes the app open offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached || caches.match(new URL('./', self.registration.scope).pathname) || Response.error();
        }
      })()
    );
    return;
  }

  // Same-origin assets: cache first, since Next.js filenames are content-hashed.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(SHELL);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          return Response.error();
        }
      })()
    );
  }
});
