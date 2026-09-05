const SHELL_CACHE_PREFIX = "inflamm-menu-shell-";
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}__SHELL_VERSION__`;
const RUNTIME_CACHE_PREFIX = "inflamm-menu-runtime-";
const RUNTIME_CACHE = `${RUNTIME_CACHE_PREFIX}v2`;
const CATALOGUE_CACHE_PREFIX = "inflamm-menu-catalogue-";
const CATALOGUE_CACHE = `${CATALOGUE_CACHE_PREFIX}v2`;
const LEGACY_CATALOGUE_CACHE = `${CATALOGUE_CACHE_PREFIX}v1`;
const MAX_RUNTIME_IMAGES = 120;
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest"
];

async function fetchRequired(request) {
  const response = await fetch(request, { cache: "reload" });
  if (!response.ok || response.type !== "basic") throw new Error(`Unable to precache ${request}: ${response.status}`);
  return response;
}

async function matchCached(cache, request) {
  // All requests reaching this worker are same-origin. Ignoring Vary keeps the
  // immutable shell usable when a static host adds a response-only Vary header.
  return cache.match(request, { ignoreVary: true });
}

function shellEntry(suffix) {
  return APP_SHELL.find((path) => path.endsWith(suffix));
}

function isHtmlResponse(response) {
  const contentType = response.headers.get("Content-Type") ?? "";
  return contentType.split(";", 1)[0].trim().toLowerCase() === "text/html";
}

function isCanonicalShellNavigation(request) {
  const pathname = new URL(request.url).pathname;
  return [shellEntry("/"), shellEntry("/index.html")]
    .filter(Boolean)
    .includes(pathname);
}

async function trimCache(cache, maximum) {
  const keys = await cache.keys();
  const excess = keys.length - maximum;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((request) => cache.delete(request)));
}

async function putSafely(cache, request, response, maximum) {
  try {
    await cache.put(request, response.clone());
  } catch {
    if (maximum) {
      await trimCache(cache, Math.max(1, Math.floor(maximum / 2)));
      try { await cache.put(request, response.clone()); } catch { return; }
    }
  }
  if (maximum) await trimCache(cache, maximum);
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const responses = await Promise.all(APP_SHELL.map((path) => fetchRequired(path)));
  await Promise.all(APP_SHELL.map((path, index) => cache.put(path, responses[index].clone())));

  const indexResponse = await matchCached(cache, shellEntry("/index.html") ?? "/index.html")
    || await matchCached(cache, shellEntry("/") ?? "/");
  if (!indexResponse || !isHtmlResponse(indexResponse)) throw new Error("Application shell HTML index missing");
  const html = await indexResponse.text();
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => `${url.pathname}${url.search}`);
  // The generated manifest already contains the entry, styles and preloads.
  // Discover extra references for development/older manifests without fetching
  // the entire initial bundle a second time on every installation.
  const uniqueAssets = [...new Set(assetPaths)].filter((path) => !APP_SHELL.includes(path));
  const assetResponses = await Promise.all(uniqueAssets.map((path) => fetchRequired(path)));
  await Promise.all(uniqueAssets.map((path, index) => cache.put(path, assetResponses[index].clone())));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) =>
          (key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE) ||
          (key.startsWith(RUNTIME_CACHE_PREFIX) && key !== RUNTIME_CACHE) ||
          (key.startsWith(CATALOGUE_CACHE_PREFIX) && key !== CATALOGUE_CACHE && key !== LEGACY_CATALOGUE_CACHE))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName, maximum) {
  const cache = await caches.open(cacheName);
  const cached = await matchCached(cache, request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await putSafely(cache, request, response, maximum);
  return response;
}

async function catalogueNetworkFirst(request) {
  const cache = await caches.open(CATALOGUE_CACHE);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    // Catalogue responses are only persisted by cacheCatalogueForOffline()
    // after the page has parsed and validated the complete payload. Keeping
    // this read-through strategy write-free prevents an unchecked HTTP 200
    // response from replacing the last explicitly validated offline copy.
    if (response.ok && response.type === "basic") return response;
    return await matchCached(cache, request) || response;
  } catch (error) {
    const cached = await matchCached(cache, request);
    if (cached) return cached;
    throw error;
  }
}

async function navigationResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response.status >= 500 && isCanonicalShellNavigation(request)) throw new Error("Application server unavailable");
    // Keep the versioned offline document immutable. A newer network document
    // can refer to assets that have not arrived yet; only a complete worker
    // installation may replace the offline shell. Online visits stay fresh.
    return response;
  } catch {
    const fallback = await matchCached(cache, shellEntry("/index.html") ?? "/index.html")
      || await matchCached(cache, shellEntry("/") ?? "/");
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
  if (/\/recettes-anti-inflammatoires(?:-[^/]+)?\.json$/.test(url.pathname)) {
    event.respondWith(catalogueNetworkFirst(request));
    return;
  }
  if (url.pathname.endsWith("planner-cautions.json")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  if (["script", "style", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  if (request.destination === "image") {
    const belongsToShell = APP_SHELL.includes(url.pathname);
    event.respondWith(cacheFirst(request, belongsToShell ? SHELL_CACHE : RUNTIME_CACHE, belongsToShell ? undefined : MAX_RUNTIME_IMAGES));
  }
});
