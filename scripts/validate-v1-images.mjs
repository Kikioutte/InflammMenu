#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recipesSource = readFileSync(path.join(root, "src", "recipes.ts"), "utf8");
const recipePaths = [...recipesSource.matchAll(/image:\s*"(\/assets\/recipes\/[^"\s]+)"/g)].map((match) => match[1]);

assert.equal(recipePaths.length, 36, "36 images V1 doivent être référencées");
assert.equal(new Set(recipePaths).size, 36, "chaque recette V1 doit avoir une image distincte");

for (const publicPath of recipePaths) {
  assert.match(publicPath, /\.jpg$/i, `${publicPath}: format JPG attendu`);
  const file = path.join(root, "public", publicPath.replace(/^\//, ""));
  assert.ok(existsSync(file), `${publicPath}: fichier absent`);
  assert.ok(statSync(file).size <= 350 * 1024, `${publicPath}: image supérieure à 350 Kio`);
}

const shellImages = [
  ["assets/inflamm-hero-bowl.jpg", 400 * 1024],
  ["assets/olive-sprig.svg", 2 * 1024],
];
for (const [relativePath, maximumBytes] of shellImages) {
  const file = path.join(root, "public", relativePath);
  assert.ok(existsSync(file), `${relativePath}: fichier absent`);
  assert.ok(statSync(file).size <= maximumBytes, `${relativePath}: image encore trop lourde`);
}

for (const removedPath of [
  "assets/inflamm-hero-bowl.png",
  "assets/lentil-walnut-salad.png",
  "assets/olive-sprig.png",
  "assets/salmon-broccoli-rice.png",
]) {
  assert.equal(existsSync(path.join(root, "public", removedPath)), false, `${removedPath}: ancien fichier encore présent`);
}

console.log("Images V1 valides : 36 JPG optimisés, héros et décoration contrôlés.");
