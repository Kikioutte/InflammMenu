const SHELL_CACHE_PREFIX = "inflamm-menu-shell-";
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}__SHELL_VERSION__`;
const RUNTIME_CACHE = "inflamm-menu-runtime-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest"
];

async function cacheResponse(cache, request) {
  try {
    const response = await fetch(request, { cache: "reload" });
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  } catch {
    return null;
  }
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(APP_SHELL.map((path) => cacheResponse(cache, path)));

  // The production HTML contains hashed Vite entry files. Discover and cache
  // them during installation so the very first installed version works offline.
  const indexResponse = await cache.match("/index.html") || await cache.match("/");
  if (!indexResponse) return;
  const html = await indexResponse.text();
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => `${url.pathname}${url.search}`);
  await Promise.allSettled([...new Set(assetPaths)].map((path) => cacheResponse(cache, path)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await cache.put(request, response.clone());
  return response;
}

async function navigationResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    const fallback = await cache.match("/index.html") || await cache.match("/");
    if (fallback) return fallback;
    return new Response(
      "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Inflamm’Menu</title><body><p>Inflamm’Menu est momentanément indisponible hors connexion.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    const belongsToShell = APP_SHELL.includes(url.pathname);
    event.respondWith(cacheFirst(request, belongsToShell || request.destination !== "image" ? SHELL_CACHE : RUNTIME_CACHE));
  }
});
