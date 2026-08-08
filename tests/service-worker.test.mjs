import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const precache = await readFile(new URL("../scripts/generate-precache.mjs", import.meta.url), "utf8");

test("service worker requires a complete shell before skipWaiting", () => {
  assert.match(worker, /Promise\.all\(APP_SHELL/);
  assert.doesNotMatch(worker, /Promise\.allSettled\(APP_SHELL/);
  assert.match(worker, /precacheShell\(\)\.then\(\(\) => self\.skipWaiting\(\)\)/);
});

test("service worker revalidates catalogue requests and bounds runtime images", () => {
  assert.match(worker, /async function networkFirst/);
  assert.match(worker, /fetch\(request, \{ cache: "no-cache" \}\)/);
  assert.match(worker, /return await cache\.match\(request\) \|\| response/);
  assert.match(worker, /event\.respondWith\(networkFirst\(request, CATALOGUE_CACHE\)\)/);
  assert.match(worker, /MAX_RUNTIME_IMAGES = 120/);
  assert.match(worker, /trimCache/);
});

test("precache discovers unquoted CSS url references", () => {
  assert.ok(precache.includes("matchAll(/url\\("));
  assert.match(precache, /woff2/);
});

test("precache includes JSON resources used for offline planner cautions", () => {
  assert.match(precache, /json/);
  assert.match(precache, /planner-cautions/);
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
