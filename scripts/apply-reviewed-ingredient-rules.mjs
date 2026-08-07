#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogueUrl = new URL("src/data/recettes-anti-inflammatoires.json", root);
const aliasesUrl = new URL("src/data/ingredient-id-aliases.json", root);
const rulesUrl = new URL("src/data/ingredient-shopping-rules.json", root);
const [catalogue, aliasSource, ruleSource] = await Promise.all(
  [catalogueUrl, aliasesUrl, rulesUrl].map(async (url) => JSON.parse(await readFile(url, "utf8"))),
);

function normalize(value) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const aliases = new Map(Object.entries(aliasSource.aliases).map(([alias, canonical]) => [normalize(alias), normalize(canonical)]));
for (const group of aliasSource.canonical_groups) {
  const canonical = normalize(group.canonical_id);
  for (const alias of group.aliases) {
    const normalizedAlias = normalize(alias);
    if (normalizedAlias !== canonical) aliases.set(normalizedAlias, canonical);
  }
}
function canonicalId(rawId) {
  let current = normalize(rawId);
  const visited = new Set();
  while (aliases.has(current) && !visited.has(current)) {
    visited.add(current);
    current = aliases.get(current);
  }
  return current;
}

const rules = new Map(Object.entries(ruleSource.rules).map(([id, rule]) => [canonicalId(id), rule]));
let changedIds = 0;
let pantryStaples = 0;
let repairedEggAllergens = 0;

for (const recipe of catalogue.recipes) {
  for (const ingredient of recipe.ingredients) {
    const canonical = canonicalId(ingredient.id);
    if (ingredient.id !== canonical) {
      ingredient.id = canonical;
      changedIds += 1;
    }
    if (rules.get(canonical)?.pantry_staple === true) {
      ingredient.pantry_staple = true;
      pantryStaples += 1;
    } else {
      delete ingredient.pantry_staple;
    }
    if (canonical === "egg" && !ingredient.allergenes.includes("oeuf")) {
      ingredient.allergenes = [...ingredient.allergenes, "oeuf"];
      recipe.app.planner.allergens = [...new Set([...recipe.app.planner.allergens, "oeuf"])];
      repairedEggAllergens += 1;
    }
  }
}

await writeFile(catalogueUrl, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`Règles appliquées : ${changedIds} identifiants canonisés, ${pantryStaples} ingrédients de placard, ${repairedEggAllergens} allergènes œuf réparés.`);
