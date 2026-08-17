#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "pages");
const base = "/InflammMenu/";
const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".svg", ".webmanifest"]);
const rootedPublicPath = /(["'`])\/(assets\/|icons\/|index\.html|manifest\.webmanifest|og\.(?:png|jpe?g)|sw\.js)/g;

function filesIn(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory() ? filesIn(file) : [file];
  });
}

for (const file of filesIn(output)) {
  if (!textExtensions.has(path.extname(file))) continue;

  let contents = readFileSync(file, "utf8");
  contents = contents.replace(rootedPublicPath, `$1${base}$2`);

  if (path.extname(file) === ".html") {
    contents = contents.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'");
  }

  if (path.basename(file) === "sw.js") {
    contents = contents
      .replace('  "/",', `  "${base}",`)
      .replaceAll('cache.match("/")', `cache.match("${base}")`);
  }

  writeFileSync(file, contents);
}

const manifestPath = path.join(output, "manifest.webmanifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.start_url = base;
manifest.scope = base;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

writeFileSync(path.join(output, ".nojekyll"), "");
console.log(`Prepared GitHub Pages build for ${base}`);

// Remove test-only mobile chrome from the public Pages artifact.
const { rm } = await import("node:fs/promises");
for (const relative of ["assets/iphone", "assets/android", "assets/status", "qa"]) {
  await rm(new URL(`../dist/pages/${relative}`, import.meta.url), { recursive: true, force: true });
}

// Create the GitHub Pages SPA fallback after every path has been rebased.
const { copyFile } = await import("node:fs/promises");
await copyFile(new URL("../dist/pages/index.html", import.meta.url), new URL("../dist/pages/404.html", import.meta.url));
