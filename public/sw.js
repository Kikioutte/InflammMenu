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
  // Static hosts may answer a missing JS/CSS URL with their HTML fallback.
  // Such a response is HTTP 200, but cannot form a working installed shell.
  if (/\.(?:m?js|css)(?:\?|$)/.test(request) && isHtmlResponse(response)) {
    throw new Error(`Application asset returned HTML: ${request}`);
  }
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
  const responses = await Promise.all(APP_SHELL.map((path) => fetchRequired(path)));
  const indexResponse = responses[APP_SHELL.indexOf(shellEntry("/index.html") ?? "/index.html")]
    || responses[APP_SHELL.indexOf(shellEntry("/") ?? "/")];
  if (!indexResponse || !isHtmlResponse(indexResponse)) throw new Error("Application shell HTML index missing");
  const html = await indexResponse.clone().text();
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => `${url.pathname}${url.search}`);
  // The generated manifest already contains the bundle and its chunks. Keep
  // discovering additional references without fetching listed assets twice.
  const uniqueAssets = [...new Set(assetPaths)].filter((path) => !APP_SHELL.includes(path));
  const assetResponses = await Promise.all(uniqueAssets.map((path) => fetchRequired(path)));
  // Do not write even the document until every required download has succeeded.
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(APP_SHELL.map((path, index) => cache.put(path, responses[index].clone())));
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

function isImageResponse(response) {
  return Boolean(response?.ok && response.type === "basic"
    && /^image\/[a-z0-9.+-]+(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? ""));
}

/** Only generated local photo paths can share a fallback; never match by basename alone. */
function photoFor(request) {
  const url = new URL(typeof request === "string" ? request : request.url, self.location.origin);
  const base = shellEntry("/") ?? "/";
  if (url.origin !== self.location.origin || url.search || url.hash || !url.pathname.startsWith(base)) return null;
  const relative = url.pathname.slice(base.length);
  const variant = relative.match(/^assets\/recipes\/responsive\/([a-f0-9]{12})\/(generated\/)?([a-zA-Z0-9][a-zA-Z0-9_-]{0,199})\.w(160|320|640|900)\.webp$/);
  if (variant) return {
    original: `${url.origin}${base}assets/recipes/${variant[2] ?? ""}${variant[3]}.jpg`,
    version: variant[1], width: Number(variant[4]), variant: true, hero: false,
  };
  const hero = relative.match(/^assets\/recipes\/responsive\/([a-f0-9]{12})\/_hero\/inflamm-hero-bowl\.w(640|960|1200)\.webp$/);
  if (hero) return {
    original: `${url.origin}${base}assets/inflamm-hero-bowl.jpg`,
    version: hero[1], width: Number(hero[2]), variant: true, hero: true,
  };
  if (/^assets\/recipes\/(?:generated\/)?[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}\.jpg$/.test(relative)) {
    return { original: url.href, version: null, width: 900, variant: false, hero: false };
  }
  if (relative === "assets/inflamm-hero-bowl.jpg") {
    return { original: url.href, version: null, width: 1200, variant: false, hero: true };
  }
  return null;
}

async function cachedPhotoEntries(cache, photo) {
  const entries = [];
  for (const request of await cache.keys()) {
    const other = photoFor(request);
    if (other?.original === photo.original) entries.push({ request, photo: other });
  }
  return entries;
}

async function cachedPhotoResponse(cache, photo) {
  const entries = await cachedPhotoEntries(cache, photo);
  if (photo.hero) {
    const shell = await caches.open(SHELL_CACHE);
    // Consult the small installed manifest, not every cached JS/font key.
    // Older shells held the JPEG; newer shells hold the full-size WebP.
    for (const request of new Set([...APP_SHELL, photo.original])) {
      const other = photoFor(request);
      if (other?.original === photo.original) entries.push({ request, photo: other, cache: shell });
    }
  }
  // A legacy full-size JPEG can be better than a visited thumbnail. Among
  // equally large variants prefer the requested edition, but old editions
  // remain useful when a size or device-pixel ratio changes while offline.
  entries.sort((a, b) => b.photo.width - a.photo.width
    || Number(b.photo.version === photo.version) - Number(a.photo.version === photo.version));
  for (const entry of entries) {
    const cached = await matchCached(entry.cache ?? cache, entry.request);
    if (isImageResponse(cached)) return cached;
  }
  return null;
}

let runtimeImageWrites = Promise.resolve();
function cacheRuntimeImage(cache, request, response) {
  // Fetches stay parallel. Only the bounded cache mutation is serialized so a
  // slower thumbnail response cannot overwrite a larger same-edition photo.
  const write = runtimeImageWrites.then(async () => {
    const photo = photoFor(request);
    const siblings = photo ? await cachedPhotoEntries(cache, photo) : [];
    if (photo?.variant) {
      for (const sibling of siblings) {
        if (sibling.photo.variant && sibling.photo.version === photo.version && sibling.photo.width >= photo.width
          && isImageResponse(await matchCached(cache, sibling.request))) return;
      }
    }
    // A quota failure must not evict the last usable photo. In contrast to the
    // generic shell writer, do not trim first and retry a still-failing put.
    try { await cache.put(request, response.clone()); } catch { return; }
    for (const sibling of siblings) {
      if (sibling.request.url === request.url) continue;
      // Preserve a useful legacy full-size JPEG until the replacement reaches
      // its width. The installed full-size hero lives in the shell, untouched.
      if (sibling.photo.variant || sibling.photo.width <= photo.width) await cache.delete(sibling.request);
    }
    await trimCache(cache, MAX_RUNTIME_IMAGES);
  });
  runtimeImageWrites = write.catch(() => {});
  return runtimeImageWrites;
}

async function imageResponse(request, belongsToShell) {
  const cache = await caches.open(belongsToShell ? SHELL_CACHE : RUNTIME_CACHE);
  const cached = await matchCached(cache, request);
  if (isImageResponse(cached)) return cached;
  const photo = photoFor(request);
  let response;
  let failure;
  try { response = await fetch(request); } catch (error) { failure = error; }
  if (isImageResponse(response)) {
    if (belongsToShell) await putSafely(cache, request, response);
    else await cacheRuntimeImage(cache, request, response);
    return response;
  }
  // A static-host HTML fallback is not a photo, even with status 200. Never
  // persist it or let it hide a previously downloaded size of the same photo.
  if (photo) {
    const runtime = belongsToShell ? await caches.open(RUNTIME_CACHE) : cache;
    const fallback = await cachedPhotoResponse(runtime, photo);
    if (fallback) return fallback;
  }
  if (response) return response;
  throw failure;
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
    // Preserve the document whose complete assets were installed together.
    // A newer online document must not replace it until its worker installs.
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
    event.respondWith(imageResponse(request, belongsToShell));
  }
});
