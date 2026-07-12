/* ============================================================
   SERVICE WORKER — makes the site load even with no internet.
   Strategy: cache the app shell (HTML/JS/icon) on install, then
   serve from cache first and update the cache in the background
   whenever the network is available. Donor data itself is handled
   separately by Firebase + localStorage inside index.html.
   ============================================================ */

const CACHE_NAME = "blood-donor-app-v2";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
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

// Activate: clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first, falling back to network, and refresh the cache in the background
self.addEventListener("fetch", event => {
  const req = event.request;

  // Only handle GET requests; let everything else (Firebase websocket etc.) pass through
  if (req.method !== "GET") return;

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
