/*
 * Fenn service worker (production builds only; see src/pwa/registerSw.ts).
 *
 * - Precaches the app shell: "/", the offline page, the manifest and icons.
 * - Hashed build files (/assets/*) are cache-first: their names change on every build.
 * - Page navigations are network-first; offline they fall back to the cached
 *   shell, then to /offline.html.
 * - Never cached: /api/*, /r/* (listing pages count visits), other origins
 *   (Supabase, fonts, video) and range requests (video).
 *
 * The cache name carries the app version (?v= on the registration URL), and
 * old caches are deleted when a new version activates.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = `fenn-shell-${VERSION}`;
const ASSET_CACHE = `fenn-assets-${VERSION}`;
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/fenn.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fenn-') && k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function neverCache(url, request) {
  return (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/r/') ||
    request.headers.has('range')
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (neverCache(url, request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === '/') {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/')) || (await caches.match('/offline.html')) || Response.error())
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
