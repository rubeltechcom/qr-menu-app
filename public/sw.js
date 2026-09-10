/**
 * Service worker for the staff console.
 *
 * Deliberately conservative. This is an ordering system: a stale menu
 * price or a cached order queue is worse than a spinner, so nothing
 * that changes is ever served from cache. What it does buy:
 *
 *   - installability (browsers require a service worker with a fetch
 *     handler before offering "Add to home screen")
 *   - a real page instead of the browser's dinosaur when the wifi in
 *     the back of the restaurant drops for a moment
 *   - instant loads of the app shell's static assets
 *
 * Strategy, by request type:
 *   - navigations      network first, offline page as the fallback
 *   - build assets     cache first (immutable, content-hashed URLs)
 *   - uploaded photos  cache first (keys are unique per upload)
 *   - everything else  straight to the network, never cached
 */

const VERSION = "v1";
const SHELL_CACHE = `qrmenu-shell-${VERSION}`;
const ASSET_CACHE = `qrmenu-assets-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      // Take over as soon as it is ready rather than waiting for every
      // tab to close — a kitchen tablet is never closed.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is ever cacheable, and only our own origin.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch live data or the event stream. Serving a cached order
  // queue would show a kitchen work that is already done.
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/uploads/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ??
          new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
        );
      }),
    );
    return;
  }

  // Content-hashed build output and uploaded photos: the bytes behind
  // one of these URLs never change, so cache-first is safe and fast.
  const isImmutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/api/uploads/") ||
    url.pathname.startsWith("/icons/");

  if (isImmutable) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

/**
 * Lets the page trigger an immediate update, so a redeploy can take
 * effect without staff hunting for a refresh button.
 */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting();
});
