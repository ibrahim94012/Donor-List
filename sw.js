const CACHE_NAME = "blood-donor-app-v7";
const APP_SHELL = "./index.html";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./fav.jpeg",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"
];

// Install: pre-cache the app shell
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => {
            // Don't let one failed asset (e.g. no internet on first install) break the whole install
            console.log("SW: could not pre-cache", url, err);
          })
        )
      );
    })
  );
});

// Activate: only clean up old caches once we've confirmed the new
// cache actually has a working app shell. This is what protects
// offline devices from ever being left without a usable cache.
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      let shellReady = await cache.match(APP_SHELL);

      if (!shellReady) {
        try {
          await cache.add(APP_SHELL);
          shellReady = true;
        } catch (err) {
          console.log("SW: activate could not secure app shell (likely offline) — keeping old caches so the device still has a working copy", err);
        }
      }

      if (shellReady) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        );
      }

      await self.clients.claim();
    })()
  );
});

// Fetch: cache-first, falling back to network, and refresh the cache in the background
self.addEventListener("fetch", event => {
  const req = event.request;

  // Only handle GET requests; let everything else (Firebase websocket etc.) pass through
  if (req.method !== "GET") return;

  // Page navigations get a dedicated strategy: no matter what the exact
  // request URL looks like, always guarantee the cached app shell as the
  // offline fallback. This is what makes "open the app with no internet"
  // reliable across devices and launch methods (browser tab, home screen icon, etc.)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(APP_SHELL, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(req)) ||
            (await cache.match(APP_SHELL)) ||
            (await cache.match("./"))
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cachedResponse => {
      const networkFetch = fetch(req)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      // Serve cache immediately if we have it, otherwise wait for network
      return cachedResponse || networkFetch;
    })
  );
});
