import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const catalogue = JSON.parse(await readFile("research/pilot-r426-r450.final.json", "utf8"));
assert.equal(validateCatalogue(catalogue).recipeCount, 25);
assert.equal(catalogue.meta.status, "editorial-validated");
assert.equal(catalogue.recipes.filter((recipe) => recipe.app.planner.eligible).length, 14);
assert.equal(catalogue.recipes.slice(15).filter((recipe) => recipe.app.planner.eligible).length, 0);
for (const recipe of catalogue.recipes) {
  assert.equal(recipe.provenance.reviewed_at, catalogue.meta.reviewed_at);
  assert.match(recipe.score_note, /ne mesure ni ne prouve aucun effet médical/);
  assert.deepEqual([...recipe.app.planner.allergens].sort(), [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort());
  if (Number(recipe.id.slice(1)) <= 440) assert.match(recipe.app.review.caution, /cuire.*cœur/i);
}
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r433").app.review.caution, /sodium/i);
console.log("Lot final r426-r450 validé : 14 plats de volaille éligibles, 10 accompagnements exclus.");
