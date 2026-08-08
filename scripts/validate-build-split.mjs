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
assert.doesNotMatch(serviceWorker.match(/const APP_SHELL = \[[\s\S]*?\];/)?.[0] ?? "", /catalogue-/, "le catalogue différé ne doit pas être précaché");

console.log(`Découpage valide : bundle initial ${entryStats.size} octets (${entryGzipSize} gzip), catalogue absent du chargement initial.`);
