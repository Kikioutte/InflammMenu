const CACHE_NAME = "inflamm-menu-shell-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/og.png",
  "/assets/inflamm-hero-bowl.png",
  "/assets/lentil-walnut-salad.png",
  "/assets/salmon-broccoli-rice.png",
  "/assets/olive-sprig.png",
  "/assets/iphone/Bezel.png",
  "/assets/iphone/Keyboard.png",
  "/assets/android/Pixel10.png",
  "/assets/android/Keyboard.png",
  "/assets/android/navigation-bar.svg",
  "/assets/status/ios-status-icons.svg",
  "/assets/status/status-icons.svg"
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
  const cache = await caches.open(CACHE_NAME);
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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await cache.put(request, response.clone());
  return response;
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
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
    event.respondWith(cacheFirst(request));
  }
});
