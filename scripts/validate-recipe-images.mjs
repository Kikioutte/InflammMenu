import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const researchUrl = new URL("../research/", import.meta.url);
const publicUrl = new URL("../public/assets/recipes/generated/", import.meta.url);
const names = await readdir(researchUrl);

const recipes = new Map();
for (const name of names.filter((entry) => /^pilot-r\d{3}-r\d{3}\.draft\.json$/.test(entry))) {
  const catalogue = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
  for (const recipe of catalogue.recipes) recipes.set(recipe.id, recipe);
}

const requiredIds = new Set();
for (const name of names.filter((entry) => /^pilot-r\d{3}-r\d{3}\.final\.json$/.test(entry))) {
  const catalogue = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
  for (const recipe of catalogue.recipes) {
    recipes.set(recipe.id, recipe);
    requiredIds.add(recipe.id);
  }
}

for (const name of names.filter((entry) => /^image-prompts-r\d{3}-r\d{3}\.json$/.test(entry))) {
  const document = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
  const prompts = document.prompts ?? document;
  for (const prompt of prompts.filter((entry) => entry.status === "generated_inspected_optimized")) requiredIds.add(prompt.id);
}

let validated = 0;
for (const id of [...requiredIds].sort()) {
    const prompt = { id };
    const recipe = recipes.get(prompt.id);
    assert.ok(recipe, `${prompt.id}: recette introuvable`);
    const imageUrl = new URL(recipe.image.nom_fichier, publicUrl);
    const details = await stat(imageUrl);
    assert.ok(details.size <= 350 * 1024, `${prompt.id}: image supérieure à 350 Ko`);
    const { stdout } = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", imageUrl.pathname]);
    assert.match(stdout, /pixelWidth: 900/, `${prompt.id}: largeur différente de 900 px`);
    assert.match(stdout, /pixelHeight: 900/, `${prompt.id}: hauteur différente de 900 px`);
    validated += 1;
}

console.log(`${validated} images requises par les lots finaux ou marquées inspectées sont optimisées et valides.`);
