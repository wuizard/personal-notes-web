/**
 * Notes Maker service worker.
 *
 * Hand-written rather than generated. `@serwist/next` (and next-pwa) are
 * webpack plugins, and Next 16 builds with Turbopack by default — they simply
 * do not run. Rather than force the whole project onto a non-default builder
 * for one file, this owns the ~90 lines of caching the app actually needs.
 *
 * No build-time precache manifest is required, because:
 *   - /_next/static/** is content-hashed, so cache-first is safe forever
 *   - navigations are network-first with a cache fallback, so the shell boots
 *     offline from whatever was last seen
 *
 * The app's DATA never touches this cache. Notes live in IndexedDB
 * (docs/08) and are read directly by the app, so the service worker is only
 * responsible for the shell.
 */

const VERSION = "v1";
const SHELL_CACHE = `nm-shell-${VERSION}`;
const STATIC_CACHE = `nm-static-${VERSION}`;
// A static file, deliberately: it is locale-independent and needs no JS, so it
// renders even when everything else has failed.
//
// Requested WITHOUT the .html extension: Cloudflare's asset handling
// (`html_handling: "auto-trailing-slash"`) 307s `/offline.html` to `/offline`,
// and `cache.add()` rejects a redirected response — which would leave the
// offline fallback silently uninstalled.
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individual failures must not abort the install, or one 404 leaves the
      // user with no service worker at all.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("nm-") && !keep.has(n)).map((n) => caches.delete(n)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, falling back to the cached page, then to the
  // offline page. This is what lets the app open with no connection.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) {
            void putInCache(SHELL_CACHE, request, preload.clone());
            return preload;
          }
          const fresh = await fetch(request);
          void putInCache(SHELL_CACHE, request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })(),
    );
    return;
  }

  // Hashed build output is immutable — cache-first, never revalidate.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  // Icons, manifest, fonts: cache-first with a background refresh.
  if (/\.(?:png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
  }
});

async function putInCache(cacheName, request, response) {
  // Opaque and error responses would poison the cache.
  if (!response || !response.ok || response.type === "opaque") return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
}

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  void putInCache(cacheName, request, response.clone());
  return response;
}

async function staleWhileRevalidate(cacheName, request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      void putInCache(cacheName, request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await network) ?? Response.error();
}
