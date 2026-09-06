const CACHE_NAME = "vequence-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./auth.html",
  "./article.html",
  "./editor.html",
  "./groups.html",
  "./profile.html",
  "./settings.html",
  "./admin.html",
  "./VoyegerAI.html",
  "./app.js",
  "./admin.js",
  "./styles.css",
  "./manifest.json",
  "./Assets/icon-192.png",
  "./Assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle normal GET requests.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache Supabase/API requests.
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }

        return response;
      })
      .catch(() => caches.match(request))
  );
});
