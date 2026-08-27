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

test("only canonical HTML navigations may refresh the offline shell", () => {
  assert.match(worker, /function isHtmlResponse/);
  assert.match(worker, /response\.headers\.get\("Content-Type"\)/);
  assert.match(worker, /if \(!indexResponse \|\| !isHtmlResponse\(indexResponse\)\)/);
  assert.match(worker, /function isCanonicalShellNavigation/);
  assert.match(worker, /isCanonicalShellNavigation\(request\) && isHtmlResponse\(response\)/);
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
