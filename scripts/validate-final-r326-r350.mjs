import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const catalogue = JSON.parse(await readFile("research/pilot-r326-r350.final.json", "utf8"));
assert.equal(validateCatalogue(catalogue).recipeCount, 25);
assert.equal(catalogue.meta.status, "editorial-validated");
assert.deepEqual(catalogue.recipes.filter((recipe) => !recipe.app.planner.eligible).map((recipe) => recipe.id), ["r330", "r336"]);
for (const recipe of catalogue.recipes) {
  assert.equal(recipe.provenance.reviewed_at, catalogue.meta.reviewed_at);
  assert.match(recipe.score_note, /ne mesure ni ne prouve aucun effet médical/);
  assert.deepEqual([...recipe.app.planner.allergens].sort(), [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort());
}
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r330").app.review.caution, /iode/i);
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r336").app.review.caution, /sodium/i);
console.log("Lot final r326-r350 validé : 25 plats relus, 23 éligibles.");
