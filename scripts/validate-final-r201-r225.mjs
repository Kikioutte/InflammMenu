import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const catalogue = JSON.parse(await readFile("research/pilot-r201-r225.final.json", "utf8"));
const result = validateCatalogue(catalogue);
assert.equal(result.recipeCount, 25);
assert.equal(catalogue.meta.status, "editorial-validated");
assert.equal(catalogue.recipes.filter((recipe) => recipe.app.planner.eligible).length, 17);
for (const recipe of catalogue.recipes) {
  assert.equal(recipe.provenance.reviewed_at, catalogue.meta.reviewed_at);
  assert.match(recipe.score_note, /ne mesure ni ne prouve aucun effet médical/);
  assert.deepEqual([...recipe.app.planner.allergens].sort(), [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort());
}
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r210").app.review.caution, /lupin/i);
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r225").app.review.caution, /sodium/i);
console.log("Lot final r201-r225 validé : 25 salades relues, 17 éligibles.");
