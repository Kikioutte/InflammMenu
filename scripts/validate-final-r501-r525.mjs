import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const [nutrition, catalogue] = await Promise.all([
  readFile("research/pilot-r501-r525.nutrition.json", "utf8").then(JSON.parse),
  readFile("research/pilot-r501-r525.final.json", "utf8").then(JSON.parse),
]);
assert.equal(validateCatalogue(catalogue, { taxonomy: "legacy" }).recipeCount, 25);
assert.equal(catalogue.meta.status, "editorial-validated");
assert.equal(catalogue.recipes.filter((recipe) => recipe.app.planner.eligible).length, 18);
assert.equal(catalogue.recipes.filter((recipe) => recipe.categorie === "boisson" && recipe.app.planner.eligible).length, 0);
const sourceById = new Map(nutrition.recipes.map((recipe) => [recipe.id, recipe]));
for (const recipe of catalogue.recipes) {
  const source = sourceById.get(recipe.id);
  for (const key of ["titre", "categorie", "temps", "portions", "ingredients", "etapes", "nutrition_par_portion"]) {
    assert.deepEqual(recipe[key], source[key]);
  }
  assert.equal(recipe.provenance.reviewed_at, catalogue.meta.reviewed_at);
  assert.match(recipe.score_note, /ne mesure ni ne prouve aucun effet médical/);
  assert.match(recipe.app.review.summary, /sans revendication d'authenticité ayurvédique/);
  assert.deepEqual(
    [...recipe.app.planner.allergens].sort(),
    [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort(),
  );
  if (recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions") {
    assert.match(recipe.app.review.caution, /réserve nutritionnelle/i);
  }
}
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r511").app.review.caution, /gluten.*orge/i);
for (const id of ["r522", "r525"]) assert.match(catalogue.recipes.find((recipe) => recipe.id === id).app.review.caution, /dose culinaire/i);
console.log("Lot final r501-r525 validé : 25 adaptations culinaires relues, 18 repas éligibles.");
