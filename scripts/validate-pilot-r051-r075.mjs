import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const pilotUrl = new URL("../research/pilot-r051-r075.draft.json", import.meta.url);
const catalogue = JSON.parse(await readFile(pilotUrl, "utf8"));
const result = validateCatalogue(catalogue, { taxonomy: "legacy" });

assert.equal(result.schemaVersion, "2.1.0");
assert.equal(result.recipeCount, 25);
assert.equal(catalogue.meta.status, "draft");
assert.match(catalogue.meta.nutrition_notice, /non validées/i);

const expectedIds = Array.from({ length: 25 }, (_, index) => `r${String(index + 51).padStart(3, "0")}`);
assert.deepEqual(catalogue.recipes.map((recipe) => recipe.id), expectedIds);

const allergenSetsByIngredientId = new Map();
for (const recipe of catalogue.recipes) {
  assert.equal(recipe.app.review.stage, "draft", `${recipe.id}: stage doit rester draft`);
  assert.equal(recipe.app.review.status, "caution", `${recipe.id}: statut prudent requis avant validation`);
  assert.equal(recipe.app.planner.eligible, false, `${recipe.id}: recette brouillon activée dans le planificateur`);
  assert.equal(recipe.nutrition_par_portion.estimation.statut, "estimated", `${recipe.id}: nutrition présentée comme validée`);
  assert.equal(recipe.score_anti_inflammatoire, 0, `${recipe.id}: indice éditorial attribué avant relecture`);
  assert.equal(recipe.provenance.reviewed_at, undefined, `${recipe.id}: date de relecture prématurée`);
  assert.ok(
    recipe.provenance.sources.every((source) => source.kind !== "nutrition" && source.kind !== "cost"),
    `${recipe.id}: provenance nutritionnelle ou tarifaire déclarée avant vérification`,
  );

  for (const ingredient of recipe.ingredients) {
    assert.ok(!ingredient.allergenes.includes("oeufs"), `${recipe.id}.${ingredient.id}: utiliser l'allergène canonique oeuf`);
    const allergenKey = JSON.stringify([...ingredient.allergenes].sort());
    const previous = allergenSetsByIngredientId.get(ingredient.id);
    if (previous !== undefined) {
      assert.equal(allergenKey, previous, `${ingredient.id}: allergènes incohérents entre recettes`);
    } else {
      allergenSetsByIngredientId.set(ingredient.id, allergenKey);
    }
  }
}

console.log(`Lot r051-r075 v${result.schemaVersion} valide : ${result.recipeCount} recettes brouillon, toutes exclues du planificateur.`);
