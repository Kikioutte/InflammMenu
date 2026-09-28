import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";

const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const precache = await readFile(new URL("../scripts/generate-precache.mjs", import.meta.url), "utf8");
const execFileAsync = promisify(execFile);

test("service worker requires a complete shell before skipWaiting", () => {
  assert.match(worker, /Promise\.all\(APP_SHELL/);
  assert.doesNotMatch(worker, /Promise\.allSettled\(APP_SHELL/);
  assert.match(worker, /precacheShell\(\)\.then\(\(\) => self\.skipWaiting\(\)\)/);
});

test("service worker revalidates catalogue requests without caching unchecked payloads", async () => {
  assert.match(worker, /async function catalogueNetworkFirst/);
  assert.match(worker, /fetch\(request, \{ cache: "no-cache" \}\)/);
  assert.match(worker, /return await matchCached\(cache, request\) \|\| response/);
  assert.match(worker, /event\.respondWith\(catalogueNetworkFirst\(request\)\)/);
  assert.match(worker, /recettes-anti-inflammatoires\(\?:-\[\^\/\]\+\)\?/);

  const cachedResponse = { source: "validated offline catalogue" };
  const networkResponse = { ok: true, type: "basic", source: "unchecked network catalogue" };
  let cacheWrites = 0;
  const context = {
    URL,
    Response,
    fetch: async () => networkResponse,
    caches: {
      open: async () => ({
        match: async () => cachedResponse,
        put: async () => { cacheWrites += 1; },
      }),
    },
    self: {
      addEventListener() {},
      location: { origin: "https://example.test" },
    },
  };
  vm.runInNewContext(worker, context, { filename: "sw.js" });

  assert.equal(await context.catalogueNetworkFirst({ url: "https://example.test/catalogue.json" }), networkResponse);
  assert.equal(cacheWrites, 0, "an unchecked HTTP 200 response must never replace the validated cache");

  context.fetch = async () => { throw new Error("offline"); };
  assert.equal(await context.catalogueNetworkFirst({ url: "https://example.test/catalogue.json" }), cachedResponse);
});

test("service worker bounds runtime images", () => {
  assert.match(worker, /MAX_RUNTIME_IMAGES = 120/);
  assert.match(worker, /trimCache/);
});

const IMAGE_VERSION = "012345abcdef";
const OLD_IMAGE_VERSION = "abcdef012345";
const photoPath = (stem, width, version = IMAGE_VERSION, base = "/") => `${base}assets/recipes/responsive/${version}/${stem}.w${width}.webp`;

function imageHarness(base = "/", responsiveHero = false) {
  const origin = "https://example.test";
  const stores = new Map();
  const journal = [];
  const requests = [];
  const listeners = new Map();
  const hooks = {};
  const absolute = request => new URL(typeof request === "string" ? request : request.url, origin).href;
  function basicResponse(body, status = 200, contentType = "image/webp", type = "basic") {
    function decorate(response) {
      Object.defineProperty(response, "type", { value: type });
      const clone = response.clone.bind(response);
      response.clone = () => decorate(clone());
      return response;
    }
    return decorate(new Response(body, { status, headers: { "Content-Type": contentType } }));
  }
  function cache(name) {
    if (!stores.has(name)) {
      const entries = new Map();
      stores.set(name, {
        entries,
        keys: async () => [...entries.keys()].map(url => ({ url })),
        match: async request => entries.get(absolute(request))?.clone(),
        put: async (request, response) => {
          const url = absolute(request);
          await hooks.beforePut?.(name, url);
          entries.set(url, response.clone());
          journal.push({ operation: "put", name, url });
        },
        delete: async request => {
          const url = absolute(request);
          const deleted = entries.delete(url);
          journal.push({ operation: "delete", name, url });
          return deleted;
        },
      });
    }
    return stores.get(name);
  }
  const hero = responsiveHero ? photoPath("_hero/inflamm-hero-bowl", 1200, IMAGE_VERSION, base) : `${base}assets/inflamm-hero-bowl.jpg`;
  const source = worker.replace(/const APP_SHELL = \[[\s\S]*?\];/, `const APP_SHELL = ${JSON.stringify([base, `${base}index.html`, hero, `${base}icons/icon-192.png`])};`);
  const context = {
    URL, Response,
    fetch: async request => { requests.push(absolute(request)); return basicResponse(absolute(request)); },
    caches: { open: async name => cache(name) },
    self: { addEventListener: (type, listener) => listeners.set(type, listener), location: { origin } },
  };
  vm.runInNewContext(source, context, { filename: "sw.js" });
  const runtime = cache("inflamm-menu-runtime-v2");
  const shell = cache("inflamm-menu-shell-__SHELL_VERSION__");
  const seed = (target, pathname, body, contentType = "image/webp") => target.entries.set(absolute(pathname), basicResponse(body, 200, contentType));
  function image(pathname) {
    let result;
    listeners.get("fetch")({
      request: { url: absolute(pathname), method: "GET", mode: "no-cors", destination: "image" },
      respondWith: promise => { result = promise; },
    });
    return result;
  }
  return { context, runtime, shell, seed, image, absolute, basicResponse, journal, requests, hooks };
}

test("photo identity is bounded to the deployment, directory, version and supported size", () => {
  for (const base of ["/", "/InflammMenu/"]) {
    const { context, absolute } = imageHarness(base);
    const legacy = context.photoFor(absolute(photoPath("soupe", 160, IMAGE_VERSION, base)));
    const generated = context.photoFor(absolute(photoPath("generated/soupe", 900, IMAGE_VERSION, base)));
    assert.equal(legacy.original, absolute(`${base}assets/recipes/soupe.jpg`));
    assert.equal(generated.original, absolute(`${base}assets/recipes/generated/soupe.jpg`));
    assert.notEqual(legacy.original, generated.original);
    assert.equal(generated.width, 900);
    assert.equal(generated.version, IMAGE_VERSION);
    const hero = context.photoFor(absolute(photoPath("_hero/inflamm-hero-bowl", 1200, IMAGE_VERSION, base)));
    assert.equal(hero.original, absolute(`${base}assets/inflamm-hero-bowl.jpg`));
    assert.equal(hero.hero, true);
    for (const pathname of [
      photoPath("soupe", 640, "not-a-version", base), photoPath("soupe", 480, IMAGE_VERSION, base),
      photoPath("_hero/inflamm-hero-bowl", 160, IMAGE_VERSION, base), photoPath("other/soupe", 160, IMAGE_VERSION, base),
      photoPath("soupe", 160, IMAGE_VERSION, base) + "?different=photo", photoPath("soupe", 160, IMAGE_VERSION, base) + "#fragment",
      photoPath("generated%2Fsoupe", 160, IMAGE_VERSION, base), `/outside${photoPath("soupe", 160, IMAGE_VERSION, base)}`,
    ]) assert.equal(context.photoFor(absolute(pathname)), null, pathname);
    assert.equal(context.photoFor(`https://other.test${photoPath("soupe", 160, IMAGE_VERSION, base)}`), null);
  }
});

test("a visited thumbnail remains available offline for a detail or device-pixel-ratio change", async () => {
  for (const base of ["/", "/InflammMenu/"]) {
    const h = imageHarness(base);
    const small = photoPath("generated/soupe", 160, IMAGE_VERSION, base);
    assert.equal(await (await h.image(small)).text(), h.absolute(small));
    h.context.fetch = async () => { throw new Error("offline"); };
    for (const width of [320, 640, 900]) {
      assert.equal(await (await h.image(photoPath("generated/soupe", width, IMAGE_VERSION, base))).text(), h.absolute(small));
    }
    assert.equal(h.runtime.entries.size, 1, "fallbacks do not duplicate the thumbnail under larger URLs");
  }
});

test("offline fallback selects the largest valid sibling, including an older fingerprint", async () => {
  const h = imageHarness();
  h.seed(h.runtime, photoPath("generated/soupe", 160, OLD_IMAGE_VERSION), "small");
  h.seed(h.runtime, photoPath("generated/soupe", 640, OLD_IMAGE_VERSION), "large");
  h.seed(h.runtime, photoPath("generated/soupe", 900, OLD_IMAGE_VERSION), "host fallback", "text/html");
  h.seed(h.runtime, photoPath("soupe", 900, OLD_IMAGE_VERSION), "different V1 photo");
  h.context.fetch = async () => { throw new Error("offline"); };
  assert.equal(await (await h.image(photoPath("generated/soupe", 900))).text(), "large");
  await assert.rejects(h.image(photoPath("generated/autre", 900)), /offline/);
  assert.deepEqual(h.journal, [], "fallback is read-only");
});

test("old JPEG entries and the original shell hero remain usable without cross-photo fallbacks", async () => {
  const h = imageHarness("/InflammMenu/");
  h.seed(h.runtime, "/InflammMenu/assets/recipes/generated/soupe.jpg", "original JPEG", "image/jpeg");
  h.seed(h.shell, "/InflammMenu/assets/inflamm-hero-bowl.jpg", "original hero", "image/jpeg");
  h.context.fetch = async () => { throw new Error("offline"); };
  assert.equal(await (await h.image(photoPath("generated/soupe", 900, IMAGE_VERSION, "/InflammMenu/"))).text(), "original JPEG");
  assert.equal(await (await h.image(photoPath("_hero/inflamm-hero-bowl", 960, IMAGE_VERSION, "/InflammMenu/"))).text(), "original hero");
  await assert.rejects(h.image(photoPath("soupe", 900, IMAGE_VERSION, "/InflammMenu/")), /offline/);
  assert.equal(h.shell.entries.size, 1);
  assert.equal(h.runtime.entries.size, 1);
});

test("older tabs requesting JPEGs can reuse a matching cached variant, but never a different photo", async () => {
  for (const base of ["/", "/InflammMenu/"]) {
    const h = imageHarness(base);
    h.seed(h.runtime, photoPath("generated/soupe", 900, IMAGE_VERSION, base), "replacement full-size photo");
    h.seed(h.runtime, photoPath("_hero/inflamm-hero-bowl", 960, IMAGE_VERSION, base), "replacement hero");
    h.context.fetch = async () => { throw new Error("offline"); };
    assert.equal(await (await h.image(`${base}assets/recipes/generated/soupe.jpg`)).text(), "replacement full-size photo");
    assert.equal(await (await h.image(`${base}assets/inflamm-hero-bowl.jpg`)).text(), "replacement hero");
    await assert.rejects(h.image(`${base}assets/recipes/soupe.jpg`), /offline/);
    assert.deepEqual(h.journal, []);
  }
});

test("the installed full-size WebP hero serves smaller sizes and legacy JPEG requests offline", async () => {
  for (const base of ["/", "/InflammMenu/"]) {
    const h = imageHarness(base, true);
    const hero = photoPath("_hero/inflamm-hero-bowl", 1200, IMAGE_VERSION, base);
    h.seed(h.shell, hero, "installed full-size WebP hero");
    h.seed(h.shell, `${base}assets/recipes/inflamm-hero-bowl.jpg`, "different recipe", "image/jpeg");
    h.seed(h.runtime, photoPath("_hero/inflamm-hero-bowl", 640, OLD_IMAGE_VERSION, base), "smaller old hero");
    h.shell.keys = async () => { throw new Error("the shell must not be scanned"); };
    h.context.fetch = async () => { throw new Error("offline"); };
    for (const pathname of [photoPath("_hero/inflamm-hero-bowl", 640, IMAGE_VERSION, base), photoPath("_hero/inflamm-hero-bowl", 960, IMAGE_VERSION, base), `${base}assets/inflamm-hero-bowl.jpg`]) {
      assert.equal(await (await h.image(pathname)).text(), "installed full-size WebP hero");
    }
    await assert.rejects(h.image(photoPath("inflamm-hero-bowl", 900, IMAGE_VERSION, base)), /offline/);
    assert.equal(h.runtime.entries.size, 1, "a shell fallback is never copied into the runtime cache");
    assert.deepEqual(h.journal, []);
  }
});

test("runtime image replacement and eviction cannot delete the precached WebP hero", async () => {
  const h = imageHarness("/", true);
  const hero = photoPath("_hero/inflamm-hero-bowl", 1200);
  h.seed(h.shell, hero, "installed hero");
  await h.image(photoPath("_hero/inflamm-hero-bowl", 640));
  await h.image(photoPath("_hero/inflamm-hero-bowl", 960));
  await Promise.all(Array.from({ length: 121 }, (_, index) => h.image(photoPath(`other-photo-${index}`, 160))));
  assert.equal(h.runtime.entries.size, 120);
  assert.equal(h.runtime.entries.has(h.absolute(hero)), false);
  assert.equal(await (await h.image(hero)).text(), "installed hero");
  assert.equal(h.journal.some(entry => entry.name.startsWith("inflamm-menu-shell-")), false);
});

test("404, outages, HTML fallbacks and non-image responses never replace a cached photo", async () => {
  for (const [status, contentType, type] of [[404, "image/webp", "basic"], [503, "image/webp", "basic"], [200, "text/html", "basic"], [200, "text/plain", "basic"], [200, "image/webp", "opaque"]]) {
    const h = imageHarness();
    const small = photoPath("soupe", 160);
    h.seed(h.runtime, small, "kept photo");
    h.context.fetch = async () => h.basicResponse("bad response", status, contentType, type);
    assert.equal(await (await h.image(photoPath("soupe", 900))).text(), "kept photo");
    assert.equal(h.runtime.entries.size, 1);
    assert.deepEqual(h.journal, []);
    const withoutFallback = await h.image(photoPath("other-photo", 900));
    assert.equal(withoutFallback.status, status, "without a cached photo the component can try its JPEG fallback");
    assert.equal(h.runtime.entries.size, 1);
  }
});

test("an invalid exact cache entry is ignored and arbitrary images cannot cache HTML", async () => {
  const h = imageHarness();
  h.seed(h.runtime, photoPath("soupe", 900), "old HTML pollution", "text/html");
  h.seed(h.runtime, photoPath("soupe", 320, OLD_IMAGE_VERSION), "good smaller photo");
  h.context.fetch = async () => h.basicResponse("HTML fallback", 200, "text/html");
  assert.equal(await (await h.image(photoPath("soupe", 900))).text(), "good smaller photo");
  assert.equal(await (await h.image("/assets/unrecognized.jpg")).text(), "HTML fallback");
  assert.equal(h.runtime.entries.size, 2);
  assert.deepEqual(h.journal, []);
});

test("successful writes retain only the largest current variant and preserve a useful legacy JPEG", async () => {
  const h = imageHarness();
  const original = "/assets/recipes/soupe.jpg";
  h.seed(h.runtime, original, "legacy 900", "image/jpeg");
  h.seed(h.runtime, photoPath("soupe", 640, OLD_IMAGE_VERSION), "old edition");
  const small = photoPath("soupe", 160);
  await h.image(small);
  assert.deepEqual([...h.runtime.entries.keys()], [h.absolute(original), h.absolute(small)]);
  const firstPut = h.journal.findIndex(entry => entry.operation === "put");
  const firstDelete = h.journal.findIndex(entry => entry.operation === "delete");
  assert.ok(firstPut >= 0 && firstDelete > firstPut, "a new usable image is stored before an older variant is removed");
  h.context.fetch = async request => h.basicResponse(h.absolute(request));
  await h.image(photoPath("soupe", 900));
  assert.deepEqual([...h.runtime.entries.keys()], [h.absolute(photoPath("soupe", 900))]);
  const fetchedSmaller = await h.image(photoPath("soupe", 320));
  assert.equal(await fetchedSmaller.text(), h.absolute(photoPath("soupe", 320)), "the fetched smaller image is still returned");
  assert.deepEqual([...h.runtime.entries.keys()], [h.absolute(photoPath("soupe", 900))]);
});

test("a changed fingerprint is stored before removing older variants of only the same photo", async () => {
  const h = imageHarness();
  const other = photoPath("generated/soupe", 900, OLD_IMAGE_VERSION);
  h.seed(h.runtime, photoPath("soupe", 900, OLD_IMAGE_VERSION), "old edition");
  h.seed(h.runtime, other, "different photo");
  await h.image(photoPath("soupe", 160));
  assert.deepEqual([...h.runtime.entries.keys()], [h.absolute(other), h.absolute(photoPath("soupe", 160))]);
  assert.equal(await h.runtime.entries.get(h.absolute(other)).text(), "different photo");
});

test("quota failure preserves the last photo and does not poison subsequent cache writes", async () => {
  const h = imageHarness();
  const old = photoPath("soupe", 160, OLD_IMAGE_VERSION);
  h.seed(h.runtime, old, "last offline photo");
  h.seed(h.runtime, "/assets/recipes/soupe.jpg", "legacy full-size", "image/jpeg");
  const before = [...h.runtime.entries.keys()];
  h.hooks.beforePut = async () => { throw new Error("QuotaExceededError"); };
  const response = await h.image(photoPath("soupe", 900));
  assert.equal(await response.text(), h.absolute(photoPath("soupe", 900)), "the network image is still usable");
  assert.deepEqual([...h.runtime.entries.keys()], before);
  assert.deepEqual(h.journal, [], "no pre-emptive eviction on a failed write");
  h.hooks.beforePut = undefined;
  await h.image(photoPath("soupe", 900));
  assert.deepEqual([...h.runtime.entries.keys()], [h.absolute(photoPath("soupe", 900))]);
});

test("concurrent thumbnail and detail writes cannot drop the largest same-edition photo", async () => {
  for (const firstWidth of [160, 900]) {
    const h = imageHarness();
    let release;
    let started;
    const held = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    const first = photoPath("soupe", firstWidth);
    const second = photoPath("soupe", firstWidth === 160 ? 900 : 160);
    h.hooks.beforePut = async (_name, url) => {
      if (url === h.absolute(first)) { started(); await held; }
    };
    const firstResponse = h.image(first);
    await entered;
    const secondResponse = h.image(second);
    release();
    const responses = await Promise.all([firstResponse, secondResponse]);
    assert.deepEqual(await Promise.all(responses.map(response => response.text())), [h.absolute(first), h.absolute(second)]);
    assert.deepEqual([...h.runtime.entries.keys()], [h.absolute(photoPath("soupe", 900))]);
  }
});

test("runtime image storage remains bounded at 120 entries without touching shell icons", async () => {
  const h = imageHarness();
  h.seed(h.shell, "/icons/icon-192.png", "installed icon", "image/png");
  h.seed(h.shell, "/assets/inflamm-hero-bowl.jpg", "installed hero", "image/jpeg");
  await Promise.all(Array.from({ length: 123 }, (_, index) => h.image(photoPath(`photo-${index}`, 160))));
  assert.equal(h.runtime.entries.size, 120);
  await h.image(photoPath("photo-122", 900));
  assert.equal(h.runtime.entries.size, 120);
  assert.equal(h.runtime.entries.has(h.absolute(photoPath("photo-122", 160))), false);
  await h.image(photoPath("_hero/inflamm-hero-bowl", 1200));
  assert.equal(h.runtime.entries.size, 120);
  assert.equal(await (await h.image("/icons/icon-192.png")).text(), "installed icon");
  assert.equal(await h.shell.entries.get(h.absolute("/assets/inflamm-hero-bowl.jpg")).text(), "installed hero");
  assert.equal(h.journal.some(entry => entry.name.startsWith("inflamm-menu-shell-")), false);
});

function shellHarness(source = worker) {
  const entries = new Map();
  const requests = [];
  const writes = [];
  const listeners = new Map();
  let skippedWaiting = false;
  const basicResponse = (body, status = 200, type = "text/html") => {
    const response = new Response(body, { status, headers: { "Content-Type": type } });
    Object.defineProperty(response, "type", { value: "basic" });
    return response;
  };
  const context = {
    URL, Response,
    fetch: async (request) => {
      requests.push(request);
      if (request.endsWith(".js")) return basicResponse("export const ready = true;", 200, "application/javascript");
      if (request.endsWith(".css")) return basicResponse("body { color: green; }", 200, "text/css");
      return basicResponse('<script src="/assets/current.js"></script><link href="/assets/unlisted.css" rel="stylesheet">');
    },
    caches: { open: async () => ({
      match: async (request) => entries.get(typeof request === "string" ? request : new URL(request.url).pathname)?.clone(),
      put: async (request, response) => { writes.push(request); entries.set(request, response.clone()); },
    }) },
    self: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting: async () => { skippedWaiting = true; },
      location: { origin: "https://example.test" },
    },
  };
  vm.runInNewContext(source, context, { filename: "sw.js" });
  return { context, entries, requests, writes, listeners, basicResponse, didSkipWaiting: () => skippedWaiting };
}

test("a newer online document never replaces the complete installed offline shell", async () => {
  const { context, entries, writes, basicResponse } = shellHarness();
  const oldHtml = '<script src="/assets/installed-v1.js"></script>';
  const newHtml = '<script src="/assets/not-yet-installed-v2.js"></script>';
  entries.set("/index.html", basicResponse(oldHtml));
  context.fetch = async () => basicResponse(newHtml);
  const navigation = { url: "https://example.test/" };
  assert.equal(await (await context.navigationResponse(navigation)).text(), newHtml, "online visits remain fresh");
  context.fetch = async () => { throw new Error("connection lost during update"); };
  assert.equal(await (await context.navigationResponse(navigation)).text(), oldHtml);
  assert.deepEqual(writes, [], "navigation must never mutate the installed snapshot");
});

test("a server outage falls back to the installed shell only for canonical navigation", async () => {
  const { context, entries, basicResponse } = shellHarness();
  entries.set("/index.html", basicResponse("complete installed application"));
  context.fetch = async () => basicResponse("temporary outage", 503);
  for (const pathname of ["/", "/index.html"]) {
    assert.equal(await (await context.navigationResponse({ url: `https://example.test${pathname}` })).text(), "complete installed application");
  }
  assert.equal((await context.navigationResponse({ url: "https://example.test/unknown" })).status, 503);
});

test("installation fetches listed assets once and discovers additional HTML references", async () => {
  const source = worker.replace('/manifest.webmanifest"', '/manifest.webmanifest",\n  "/assets/current.js"');
  const { context, requests, listeners, didSkipWaiting, entries } = shellHarness(source);
  let installation;
  listeners.get("install")({ waitUntil: promise => { installation = promise; } });
  await installation;
  assert.equal(requests.filter(path => path === "/assets/current.js").length, 1);
  assert.equal(requests.filter(path => path === "/assets/unlisted.css").length, 1);
  assert.ok(entries.has("/assets/unlisted.css"));
  assert.equal(didSkipWaiting(), true);
});

test("an interrupted asset download cannot modify the existing shell or activate a worker", async () => {
  const { context, entries, writes, listeners, didSkipWaiting, basicResponse } = shellHarness();
  const installedHtml = '<script src="/assets/installed.js"></script>';
  entries.set("/index.html", basicResponse(installedHtml));
  context.fetch = async (request) => {
    if (request === "/assets/missing.js") throw new Error("connection interrupted");
    return basicResponse('<script src="/assets/missing.js"></script>');
  };
  let installation;
  listeners.get("install")({ waitUntil: promise => { installation = promise; } });
  await assert.rejects(installation, /connection interrupted/);
  assert.equal(didSkipWaiting(), false);
  assert.deepEqual(writes, []);
  assert.equal(await entries.get("/index.html").text(), installedHtml);
});

test("an HTML fallback for a missing JavaScript or stylesheet is not a valid shell asset", async () => {
  for (const missingAsset of ["/assets/missing.js", "/assets/missing.css"]) {
    const { context, writes, basicResponse } = shellHarness();
    context.fetch = async () => basicResponse(`<script src="${missingAsset}"></script>`);
    await assert.rejects(context.precacheShell(), /Application asset returned HTML/);
    assert.deepEqual(writes, []);
  }
});

test("service worker reserves catalogue v1 for validated page-side migration", async () => {
  const listeners = new Map();
  const deleted = [];
  let claimed = false;
  const context = {
    URL,
    Response,
    fetch: async () => { throw new Error("unused"); },
    caches: {
      keys: async () => [
        "inflamm-menu-shell-current",
        "inflamm-menu-catalogue-v0",
        "inflamm-menu-catalogue-v1",
        "inflamm-menu-catalogue-v2",
      ],
      delete: async (name) => { deleted.push(name); return true; },
      open: async () => ({ match: async () => null }),
    },
    self: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      clients: { claim: async () => { claimed = true; } },
      location: { origin: "https://example.test" },
    },
  };
  vm.runInNewContext(worker, context, { filename: "sw.js" });

  let activation;
  listeners.get("activate")({ waitUntil: (promise) => { activation = promise; } });
  await activation;

  assert.match(worker, /CATALOGUE_CACHE = `\$\{CATALOGUE_CACHE_PREFIX\}v2`/);
  assert.match(worker, /LEGACY_CATALOGUE_CACHE = `\$\{CATALOGUE_CACHE_PREFIX\}v1`/);
  assert.deepEqual(deleted, ["inflamm-menu-shell-current", "inflamm-menu-catalogue-v0"]);
  assert.equal(claimed, true);
});

test("service worker reuses same-origin shell responses despite host Vary headers", () => {
  assert.match(worker, /cache\.match\(request, \{ ignoreVary: true \}\)/);
  assert.match(worker, /shellEntry\("\/index\.html"\)/);
  assert.match(worker, /async function navigationResponse[\s\S]*fetch\(request, \{ cache: "no-cache" \}\)/);
});

test("installation validates HTML and navigation preserves its versioned shell", () => {
  assert.match(worker, /function isHtmlResponse/);
  assert.match(worker, /response\.headers\.get\("Content-Type"\)/);
  assert.match(worker, /if \(!indexResponse \|\| !isHtmlResponse\(indexResponse\)\)/);
  assert.match(worker, /function isCanonicalShellNavigation/);
  const navigation = worker.slice(worker.indexOf("async function navigationResponse"), worker.indexOf('self.addEventListener("fetch"'));
  assert.doesNotMatch(navigation, /putSafely|cache\.put/);
});

test("precache discovers unquoted CSS url references", () => {
  assert.ok(precache.includes("matchAll(/url\\("));
  assert.match(precache, /woff2/);
});

test("precache includes JSON resources used for offline planner cautions", () => {
  assert.match(precache, /json/);
  assert.match(precache, /planner-cautions/);
});

test("precache includes every Vite JS/CSS chunk but excludes the deferred catalogue JSON", async (t) => {
  const output = await mkdtemp(path.join(tmpdir(), "inflamm-menu-precache-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  await mkdir(path.join(output, "assets"), { recursive: true });
  await Promise.all([
    writeFile(path.join(output, "index.html"), '<script type="module" src="/InflammMenu/assets/index-test.js"></script>'),
    writeFile(path.join(output, "manifest.webmanifest"), JSON.stringify({ icons: [] })),
    writeFile(path.join(output, "sw.js"), worker),
    writeFile(path.join(output, "assets/index-test.js"), 'import("./catalog-validation-test.js");'),
    writeFile(path.join(output, "assets/catalog-validation-test.js"), "export const valid = true;"),
    writeFile(path.join(output, "assets/lazy-feature-test.css"), ".lazy { display: block; }"),
    writeFile(path.join(output, "assets/recettes-anti-inflammatoires-test.json"), '{"recipes":[]}'),
  ]);

  await execFileAsync(process.execPath, [
    fileURLToPath(new URL("../scripts/generate-precache.mjs", import.meta.url)),
    output,
    "/InflammMenu/",
  ]);
  const generatedWorker = await readFile(path.join(output, "sw.js"), "utf8");

  assert.match(generatedWorker, /\/InflammMenu\/assets\/catalog-validation-test\.js/);
  assert.match(generatedWorker, /\/InflammMenu\/assets\/lazy-feature-test\.css/);
  assert.doesNotMatch(generatedWorker, /recettes-anti-inflammatoires-test\.json/);
});

test("document CSP does not require HTTPS rewriting during local validation", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /upgrade-insecure-requests/);
  assert.match(html, /object-src 'none'/);
});

test("publishes canonical metadata and a Pages fallback", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const pages = await readFile(new URL("../scripts/prepare-github-pages.mjs", import.meta.url), "utf8");
  assert.match(html, /rel="canonical"/);
  assert.match(html, /property="og:url"/);
  assert.match(html, /rel="icon"/);
  assert.match(pages, /404\.html/);
  assert.ok(pages.includes("og\\.(?:png|jpe?g)"));
});

test("document CSP allows the Vite development preamble without opening remote scripts", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(html, /script-src[^;]*https?:/);
});
