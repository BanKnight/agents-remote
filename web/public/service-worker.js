const CACHE_NAME = "agents-remote-shell-v6";
const NAVIGATION_TIMEOUT_MS = 3000;

const APP_SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithCacheFallback(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/assets/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname === "/manifest.webmanifest";

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetched = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached ?? (await fetched) ?? Response.error();
};

const networkFirstWithCacheFallback = async (request) => {
  try {
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), NAVIGATION_TIMEOUT_MS),
      ),
    ]);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      void cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = (await cache.match(request)) ?? (await cache.match("/"));
    return cached ?? Response.error();
  }
};
