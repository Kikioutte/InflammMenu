#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const output = path.resolve(process.cwd(), process.argv[2] ?? "dist/client");
const index = await readFile(path.join(output, "index.html"), "utf8");
const serviceWorker = await readFile(path.join(output, "sw.js"), "utf8");
const entryPath = index.match(/<script[^>]+src=["']([^"']+)["']/)?.[1];
assert(entryPath, "bundle d'entrée introuvable");
assert.doesNotMatch(index, /catalogue-[A-Za-z0-9_-]+\.js/, "le catalogue complet est préchargé par index.html");

// Count the entry AND all eagerly preloaded modules. Moving code to a shared
// initial chunk must never bypass the existing transfer budget.
const initialPaths = [...new Set([entryPath, ...[...index.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/g)].map((match) => match[1])])];
let entryBytes = 0;
let entryGzipSize = 0;
for (const publicPath of initialPaths) {
  const relativePath = publicPath.replace(/^\/(?:InflammMenu\/)?/, "");
  const contents = await readFile(path.join(output, relativePath));
  entryBytes += contents.byteLength;
  entryGzipSize += gzipSync(contents).byteLength;
}
assert(entryBytes < 1_370_000, `JavaScript initial trop lourd : ${entryBytes} octets`);
assert(entryGzipSize < 320_000, `JavaScript initial gzip trop lourd : ${entryGzipSize} octets`);

const appShell = serviceWorker.match(/const APP_SHELL = \[[\s\S]*?\];/)?.[0] ?? "";
assert.match(appShell, /\/assets\/catalog-validation-[A-Za-z0-9_-]+\.js/, "le validateur JSON différé manque au précache hors ligne");
assert.doesNotMatch(appShell, /catalogue-/, "le catalogue différé ne doit pas être précaché");
assert.doesNotMatch(appShell, /recettes-anti-inflammatoires[^"']*\.json/, "le gros JSON catalogue ne doit pas être précaché");
assert.doesNotMatch(appShell, /\/og\.(?:png|jpe?g)/i, "l'image sociale ne doit pas bloquer l'installation hors ligne");

if (output.endsWith(path.join("dist", "pages"))) {
  assert.match(index, /\/InflammMenu\/og\.jpg/, "l'image sociale GitHub Pages n'est pas rebasée");
  assert.doesNotMatch(index, /content=["']\/og\.jpg["']/, "un chemin racine cassé subsiste pour l'image sociale");
  assert.doesNotMatch(index, /script-src[^;]*'unsafe-inline'/, "la CSP publiée autorise encore les scripts inline");
}

console.log(`Découpage valide : bundle initial ${entryBytes} octets (${entryGzipSize} gzip), validateur JSON précaché, catalogue et image sociale différés.`);
