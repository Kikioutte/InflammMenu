import { readFile, writeFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;
if (outputIndex >= 0) args.splice(outputIndex, 2);
const finalFiles = args;
if (finalFiles.length === 0) {
  throw new Error("Usage: node scripts/merge-final-batches.mjs <lot.final.json> [...]");
}

const productionUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const production = JSON.parse(await readFile(productionUrl, "utf8"));
const finalRecipes = [];

for (const file of finalFiles) {
  const catalogue = JSON.parse(await readFile(file, "utf8"));
  validateCatalogue(catalogue);
  if (catalogue.meta.status !== "editorial-validated") {
    throw new Error(`${file}: lot non validé éditorialement`);
  }
  finalRecipes.push(...catalogue.recipes);
}

finalRecipes.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
const finalIds = new Set();
for (const [index, recipe] of finalRecipes.entries()) {
  if (finalIds.has(recipe.id)) throw new Error(`${recipe.id}: doublon entre lots finaux`);
  finalIds.add(recipe.id);
  const expected = `r${String(index + 51).padStart(3, "0")}`;
  if (recipe.id !== expected) throw new Error(`Suite finale interrompue : ${expected} attendu, ${recipe.id} reçu`);
  if (recipe.app.review.stage !== "editorial-validated") throw new Error(`${recipe.id}: relecture finale absente`);
}

const originalRecipes = production.recipes.filter((recipe) => Number(recipe.id.slice(1)) <= 50);
production.recipes = [...originalRecipes, ...finalRecipes];
production.meta.nombre_recettes = production.recipes.length;
production.meta.version = "2.1.0";
production.meta.date_mise_a_jour = "2026-08-05";
production.meta.description = "Catalogue culinaire structuré et relu. Les valeurs nutritionnelles indiquent leur méthode et leurs réserves; l'appréciation porte sur le profil alimentaire global et ne constitue pas une promesse médicale.";

const destination = outputFile ? new URL(`file://${outputFile}`) : productionUrl;
await writeFile(destination, `${JSON.stringify(production, null, 2)}\n`);
console.log(`${production.recipes.length} recettes fusionnées dans ${destination.pathname} (${finalRecipes.length} nouvelles).`);
