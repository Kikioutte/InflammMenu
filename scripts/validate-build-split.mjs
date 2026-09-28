#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadStartupGraph, validateStartupGraph } from "./startup-graph.mjs";

const output = path.resolve(process.cwd(), process.argv[2] ?? "dist/client");
const graph = await loadStartupGraph(output);
const { index } = graph;
validateStartupGraph(graph);
const serviceWorker = await readFile(path.join(output, "sw.js"), "utf8");
assert.doesNotMatch(index, /catalogue-[A-Za-z0-9_-]+\.js/, "le catalogue complet est préchargé par index.html");
assert.doesNotMatch(index, /secondary-views-[A-Za-z0-9_-]+\.js/, "les écrans secondaires sont préchargés par index.html");

const appShell = serviceWorker.match(/const APP_SHELL = \[[\s\S]*?\];/)?.[0] ?? "";
const secondaryChunk = (await readdir(path.join(output, "assets"))).find((name) => /^secondary-views-[A-Za-z0-9_-]+\.js$/.test(name));
assert(secondaryChunk, "les écrans secondaires ne sont pas séparés dans un chunk différé");
assert(appShell.includes(`/assets/${secondaryChunk}`), "les écrans secondaires manquent au précache hors ligne");
assert.match(appShell, /\/assets\/catalog-validation-[A-Za-z0-9_-]+\.js/, "le validateur JSON différé manque au précache hors ligne");
assert.doesNotMatch(appShell, /catalogue-/, "le catalogue différé ne doit pas être précaché");
assert.doesNotMatch(appShell, /recettes-anti-inflammatoires[^"']*\.json/, "le gros JSON catalogue ne doit pas être précaché");
assert.doesNotMatch(appShell, /\/og\.(?:png|jpe?g)/i, "l'image sociale ne doit pas bloquer l'installation hors ligne");

if (output.endsWith(path.join("dist", "pages"))) {
  assert.match(index, /\/InflammMenu\/og\.jpg/, "l'image sociale GitHub Pages n'est pas rebasée");
  assert.doesNotMatch(index, /content=["']\/og\.jpg["']/, "un chemin racine cassé subsiste pour l'image sociale");
  assert.doesNotMatch(index, /script-src[^;]*'unsafe-inline'/, "la CSP publiée autorise encore les scripts inline");
}

console.log(`Découpage valide : ${graph.initialFiles.length} fichiers JavaScript critiques, ${graph.rawBytes} octets (${graph.gzipBytes} gzip niveau 6 au total), planificateur et validateur préchargés, écrans secondaires différés et précachés, catalogue et image sociale différés.`);
