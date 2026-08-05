import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const [nutrition, final, mapping, ciqual] = await Promise.all([
  "research/pilot-r401-r425.nutrition.json",
  "research/pilot-r401-r425.final.json",
  "research/ciqual-map-r401-r425.json",
  "research/ciqual-2025-core.json",
].map((file) => readFile(new URL(file, root), "utf8").then(JSON.parse)));
const excluded = new Set(["r405"]);

assert.equal(mapping.meta.ingredient_count, 85);
assert.equal(mapping.meta.reused_count, 67);
const ciqualCodes = new Set(ciqual.foods.map((food) => String(food.code)));
for (const entry of mapping.ingredients) {
  if ((entry.source_dataset ?? "ciqual") === "ciqual") assert.ok(ciqualCodes.has(String(entry.selected_ciqual_code)), `${entry.ingredient_id}: code Ciqual absent`);
  assert.ok(["validated", "caution"].includes(entry.review_status));
}

const mapped = new Map(mapping.ingredients.map((entry) => [entry.ingredient_id, entry]));
assert.equal(mapped.get("coques-fraiches").occurrence_overrides.r402.grams_total, 240);
assert.equal(mapped.get("caille-entiere").occurrence_overrides.r412.grams_total, 520);
assert.equal(mapped.get("pintade-morceaux").occurrence_overrides.r409.grams_total, 560);
assert.equal(mapped.get("poulet-haut-cuisse-sans-peau").occurrence_overrides.r406.grams_total, 525);
assert.equal(mapped.get("quinoa").grams_per_unit.g, 3);
assert.equal(mapped.get("quinoa-rouge").grams_per_unit.g, 3);
assert.equal(mapped.get("chou-vert").occurrence_overrides.r425.grams_total, 400);

assert.equal(validateCatalogue(final).recipeCount, 25);
assert.match(final.meta.culinary_notice, /aucune.*testée physiquement/i);
assert.match(final.meta.cost_notice, /estimations.*sans relevés.*datés/i);
const originalById = new Map(nutrition.recipes.map((recipe) => [recipe.id, recipe]));
for (const recipe of final.recipes) {
  const original = originalById.get(recipe.id);
  for (const field of ["titre", "categorie", "temps", "portions", "ingredients", "etapes", "nutrition_par_portion"]) {
    assert.deepEqual(recipe[field], original[field], `${recipe.id}.${field} modifié pendant la finalisation`);
  }
  assert.equal(recipe.categorie, "plat");
  assert.deepEqual(recipe.app.planner.meal_types, ["lunch", "dinner"]);
  assert.equal(recipe.app.planner.eligible, !excluded.has(recipe.id));
  assert.ok(recipe.app.planner.cost_per_portion_eur > 0);
  assert.match(recipe.score_note, /ne mesure aucun effet médical/i);
  assert.match(recipe.app.review.caution, /cuire|cuisson/i);
  assert.match(recipe.app.review.caution, /non testée physiquement/i);
  const ingredientAllergens = [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort();
  assert.deepEqual([...recipe.app.planner.allergens].sort(), ingredientAllergens, `${recipe.id}: allergènes incohérents`);
  const n = recipe.nutrition_par_portion;
  assert.ok(n.calories >= 300 && n.calories <= 650, `${recipe.id}: calories hors plage (${n.calories})`);
  assert.ok(n.proteines_g >= 15 && n.proteines_g <= 60, `${recipe.id}: protéines hors plage (${n.proteines_g})`);
  assert.ok(n.fibres_g >= 2.5, `${recipe.id}: fibres insuffisantes (${n.fibres_g})`);
  if (excluded.has(recipe.id)) {
    assert.ok(n.sodium_mg >= 800);
    assert.match(recipe.app.review.caution, /sodium calculé élevé/i);
  } else {
    assert.ok(n.sodium_mg < 800, `${recipe.id}: sodium trop élevé pour le planificateur`);
  }
  if (n.estimation.statut === "calculated-with-cautions") assert.match(recipe.app.review.caution, /réserve de calcul nutritionnel/i);
}

const detailsByRecipe = new Map(final.recipes.map((recipe) => [recipe.id, new Map(recipe.nutrition_par_portion.estimation.details.map((detail) => [detail.ingredient_id, detail]))]));
assert.equal(detailsByRecipe.get("r402").get("coques-fraiches").grams, 240);
assert.equal(detailsByRecipe.get("r402").get("quinoa").grams, 660);
assert.equal(detailsByRecipe.get("r405").get("quinoa-rouge").grams, 660);
assert.equal(detailsByRecipe.get("r412").get("caille-entiere").grams, 520);
assert.equal(detailsByRecipe.get("r425").get("chou-vert").grams, 400);
assert.equal(final.recipes.filter((recipe) => recipe.app.planner.eligible).length, 24);

console.log("Lot final r401-r425 valide : 24 repas éligibles, 1 exclusion sodium.");
