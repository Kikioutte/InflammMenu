#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { RECIPES } from "../src/recipes.ts";

// An ID-only registry lets persistence validate references without fetching the
// full catalogue or pulling its recipe text into the startup bundle.
const catalogue = JSON.parse(await readFile(new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url), "utf8"));
const ids = {
  base: RECIPES.filter((recipe) => !recipe.id.startsWith("catalog-")).map((recipe) => recipe.id).sort(),
  catalogue: catalogue.recipes.map((recipe) => recipe.id).sort(),
};
const output = new URL("../src/data/recipe-reference-ids.json", import.meta.url);
const serialized = `${JSON.stringify(ids)}\n`;
if (process.argv.includes("--check")) {
  assert.equal(await readFile(output, "utf8"), serialized, "Registre d’identifiants obsolète : exécutez node scripts/generate-recipe-reference-ids.mjs");
} else await writeFile(output, serialized);
