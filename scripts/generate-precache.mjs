#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, process.argv[2] ?? "dist/client");
const requestedBase = process.argv[3] ?? "/";
const base = `/${requestedBase.replace(/^\/+|\/+$/g, "")}${requestedBase === "/" ? "" : "/"}`;
const normalizedBase = base === "//" ? "/" : base;
const serviceWorkerPath = path.join(output, "sw.js");
const indexPath = path.join(output, "index.html");
const manifestPath = path.join(output, "manifest.webmanifest");
const excludedPath = /\/(?:recipes|iphone|android|status|qa)\//;
const socialImagePath = /\/og\.(?:png|jpe?g)$/i;
const shellExtension = /\.(?:css|html|js|json|jpg|png|svg|webmanifest|woff2?)$/i;

for (const file of [serviceWorkerPath, indexPath, manifestPath]) {
  if (!existsSync(file)) throw new Error(`Fichier de build manquant : ${file}`);
}

function filesIn(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory() ? filesIn(file) : [file];
  });
}

function toPublicPath(reference) {
  if (!reference || reference.startsWith("data:") || reference.startsWith("http")) return null;
  return new URL(reference, `https://inflamm-menu.test${normalizedBase}`).pathname;
}

function outputFileFor(publicPath) {
  const withoutBase = normalizedBase !== "/" && publicPath.startsWith(normalizedBase)
    ? publicPath.slice(normalizedBase.length)
    : publicPath.replace(/^\//, "");
  return path.join(output, withoutBase || "index.html");
}

const references = new Set([
  normalizedBase,
  `${normalizedBase}index.html`,
  `${normalizedBase}manifest.webmanifest`,
]);
const plannerCautionsPath = `${normalizedBase}data/planner-cautions.json`;
if (existsSync(outputFileFor(plannerCautionsPath))) references.add(plannerCautionsPath);
const indexHtml = readFileSync(indexPath, "utf8");
for (const match of indexHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const publicPath = toPublicPath(match[1]);
  if (publicPath) references.add(publicPath);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const icon of manifest.icons ?? []) {
  const publicPath = toPublicPath(icon.src);
  if (publicPath) references.add(publicPath);
}

const outputFiles = filesIn(output);
for (const file of outputFiles) {
  const relativePath = path.relative(output, file).split(path.sep).join("/");
  if (/^assets\/.*\.(?:css|js)$/i.test(relativePath)) {
    references.add(`${normalizedBase}${relativePath}`);
  }
  if (!/\.(?:css|html|js)$/i.test(file)) continue;
  const contents = readFileSync(file, "utf8");
  const discovered = [
    ...contents.matchAll(/["'`](\/[^"'`\s)]+\.(?:jpg|png|svg|woff2?))["'`]/gi),
    ...contents.matchAll(/url\(\s*["']?([^"')\s]+\.(?:jpg|png|svg|woff2?))["']?\s*\)/gi),
  ];
  for (const match of discovered) {
    const publicPath = toPublicPath(match[1]);
    if (publicPath) references.add(publicPath);
  }
}

const appShell = [...references]
  .filter((publicPath) => !excludedPath.test(publicPath) && !socialImagePath.test(publicPath))
  .filter((publicPath) => publicPath === normalizedBase || shellExtension.test(publicPath))
  .filter((publicPath) => existsSync(outputFileFor(publicPath)))
  .sort();

if (!appShell.includes(normalizedBase) || !appShell.includes(`${normalizedBase}index.html`)) {
  throw new Error("Le précache généré ne contient pas les points d’entrée de l’application.");
}
if (appShell.some((publicPath) => excludedPath.test(publicPath) || socialImagePath.test(publicPath))) {
  throw new Error("Le précache contient une image de recette, de partage, de QA ou de simulateur.");
}

const hash = createHash("sha256");
for (const publicPath of appShell) {
  const file = outputFileFor(publicPath);
  hash.update(publicPath);
  hash.update(readFileSync(file));
}
const version = hash.digest("hex").slice(0, 12);
let serviceWorker = readFileSync(serviceWorkerPath, "utf8");
serviceWorker = serviceWorker
  .replace("__SHELL_VERSION__", version)
  .replace(/const APP_SHELL = \[[\s\S]*?\];/, `const APP_SHELL = ${JSON.stringify(appShell, null, 2)};`);
writeFileSync(serviceWorkerPath, serviceWorker);

console.log(`Précache ${version} généré : ${appShell.length} ressources pour ${normalizedBase}`);
