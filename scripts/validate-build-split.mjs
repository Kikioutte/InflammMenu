#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const output = path.resolve(process.cwd(), process.argv[2] ?? "dist/client");
const index = await readFile(path.join(output, "index.html"), "utf8");
const serviceWorker = await readFile(path.join(output, "sw.js"), "utf8");
const entryPath = index.match(/<script[^>]+src=["']([^"']+)["']/)?.[1];
assert(entryPath, "bundle d'entrée introuvable");
assert.doesNotMatch(index, /catalogue-[A-Za-z0-9_-]+\.js/, "le catalogue complet est préchargé par index.html");

const relativeEntry = entryPath.replace(/^\/(?:InflammMenu\/)?/, "");
const entryStats = await stat(path.join(output, relativeEntry));
const entryContents = await readFile(path.join(output, relativeEntry));
const entryGzipSize = gzipSync(entryContents).byteLength;
assert(entryStats.size < 1_360_000, `bundle initial trop lourd : ${entryStats.size} octets`);
assert(entryGzipSize < 320_000, `bundle initial gzip trop lourd : ${entryGzipSize} octets`);

const appShell = serviceWorker.match(/const APP_SHELL = \[[\s\S]*?\];/)?.[0] ?? "";
assert.doesNotMatch(appShell, /catalogue-/, "le catalogue différé ne doit pas être précaché");
assert.doesNotMatch(appShell, /\/og\.(?:png|jpe?g)/i, "l'image sociale ne doit pas bloquer l'installation hors ligne");

if (output.endsWith(path.join("dist", "pages"))) {
  assert.match(index, /\/InflammMenu\/og\.jpg/, "l'image sociale GitHub Pages n'est pas rebasée");
  assert.doesNotMatch(index, /content=["']\/og\.jpg["']/, "un chemin racine cassé subsiste pour l'image sociale");
}

console.log(`Découpage valide : bundle initial ${entryStats.size} octets (${entryGzipSize} gzip), catalogue et image sociale absents du précache initial.`);
