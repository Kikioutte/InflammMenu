import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const catalogue = JSON.parse(await readFile("research/pilot-r126-r150.final.json", "utf8"));
const result = validateCatalogue(catalogue);
assert.equal(result.recipeCount, 25);
assert.equal(catalogue.meta.status, "editorial-validated");
assert.deepEqual(catalogue.recipes.map((recipe) => recipe.id), Array.from({ length: 25 }, (_, index) => `r${String(index + 126).padStart(3, "0")}`));
assert.deepEqual(catalogue.recipes.filter((recipe) => recipe.app.planner.eligible).map((recipe) => recipe.id), ["r128", "r129", "r132", "r137", "r138", "r141", "r145", "r150"]);
for (const recipe of catalogue.recipes) {
  assert.equal(recipe.provenance.reviewed_at, catalogue.meta.reviewed_at);
  assert.match(recipe.score_note, /ne mesure ni ne prouve aucun effet médical/);
  assert.ok(["calculated", "calculated-with-cautions"].includes(recipe.nutrition_par_portion.estimation.statut));
  const ingredientAllergens = [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort();
  assert.deepEqual([...recipe.app.planner.allergens].sort(), ingredientAllergens);
}
console.log("Lot final r126-r150 validé : 25 soupes relues, 8 éligibles au planificateur.");
