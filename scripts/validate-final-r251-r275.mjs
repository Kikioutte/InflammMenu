import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const catalogue = JSON.parse(await readFile("research/pilot-r251-r275.final.json", "utf8"));
assert.equal(validateCatalogue(catalogue, { taxonomy: "legacy" }).recipeCount, 25);
assert.equal(catalogue.meta.status, "editorial-validated");
assert.deepEqual(catalogue.recipes.filter((recipe) => !recipe.app.planner.eligible).map((recipe) => recipe.id), ["r252", "r273", "r275"]);
for (const recipe of catalogue.recipes) {
  assert.equal(recipe.provenance.reviewed_at, catalogue.meta.reviewed_at);
  assert.match(recipe.score_note, /ne mesure ni ne prouve aucun effet médical/);
  assert.deepEqual([...recipe.app.planner.allergens].sort(), [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort());
}
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r264").app.review.caution, /bouillis|bouilli|cuisson|cuits/i);
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r270").app.review.caution, /lupin/i);
console.log("Lot final r251-r275 validé : 25 salades relues, 22 éligibles.");
