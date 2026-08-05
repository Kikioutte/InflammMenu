import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const [draft, nutrition, final, mapping, ciqual, usda] = await Promise.all(
  [
    "research/pilot-r476-r500.draft.json",
    "research/pilot-r476-r500.nutrition.json",
    "research/pilot-r476-r500.final.json",
    "research/ciqual-map-r476-r500.json",
    "research/ciqual-2025-core.json",
    "research/usda-sr-fallbacks.json",
  ].map((file) => readFile(new URL(file, root), "utf8").then(JSON.parse)),
);

assert.equal(mapping.meta.ingredient_count, 69);
assert.equal(mapping.meta.reused_count, 65);
const requiredIngredients = [
  ...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.id))),
].sort();
assert.deepEqual(
  mapping.ingredients.map((entry) => entry.ingredient_id),
  requiredIngredients,
);

const ciqualCodes = new Set(ciqual.foods.map((food) => String(food.code)));
const usdaCodes = new Set(usda.foods.map((food) => String(food.fdc_id)));
for (const entry of mapping.ingredients) {
  assert.ok(["validated", "caution"].includes(entry.review_status), entry.ingredient_id);
  if ((entry.source_dataset ?? "ciqual") === "ciqual") {
    assert.ok(ciqualCodes.has(String(entry.selected_ciqual_code)), entry.ingredient_id);
  } else {
    assert.equal(entry.source_dataset, "usda-sr");
    assert.ok(usdaCodes.has(String(entry.selected_source_code)), entry.ingredient_id);
  }
}

const result = validateCatalogue(final);
assert.equal(result.recipeCount, 25);
assert.equal(final.meta.status, "editorial-validated");
assert.match(final.meta.culinary_notice, /aucune.*testée physiquement/i);
assert.match(final.meta.cost_notice, /estimations/i);
assert.match(final.meta.nutrition_notice, /Ciqual 2025/i);

const nutritionById = new Map(nutrition.recipes.map((recipe) => [recipe.id, recipe]));
for (const recipe of final.recipes) {
  const source = nutritionById.get(recipe.id);
  for (const field of [
    "titre",
    "categorie",
    "temps",
    "portions",
    "ingredients",
    "etapes",
    "substitutions",
    "nutrition_par_portion",
  ]) {
    assert.deepEqual(recipe[field], source[field], `${recipe.id}:${field}`);
  }

  assert.ok(["dessert", "sauce"].includes(recipe.categorie));
  assert.equal(recipe.app.planner.eligible, false);
  assert.equal(recipe.app.review.stage, "editorial-validated");
  assert.equal(recipe.app.review.status, "caution");
  assert.match(recipe.app.review.summary, /ne constitue pas seul un repas complet/i);
  assert.match(recipe.app.review.caution, /non testée physiquement/i);
  assert.match(recipe.app.review.caution, /coût et rendement restent estimés/i);
  assert.match(recipe.score_note, /ne mesure aucun effet médical/i);
  assert.equal(recipe.provenance.reviewed_at, "2026-08-05");
  assert.ok(recipe.app.planner.cost_per_portion_eur > 0);

  const allergens = [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort();
  assert.deepEqual([...recipe.app.planner.allergens].sort(), allergens);

  const values = recipe.nutrition_par_portion;
  assert.ok(values.calories >= 20 && values.calories <= 350, `${recipe.id}: calories`);
  assert.ok(values.proteines_g >= 0 && values.proteines_g <= 20, `${recipe.id}: protéines`);
  assert.ok(values.fibres_g >= 0 && values.fibres_g <= 15, `${recipe.id}: fibres`);
  assert.ok(values.sodium_mg >= 0 && values.sodium_mg <= 500, `${recipe.id}: sodium`);
  if (values.estimation.statut === "calculated-with-cautions") {
    assert.match(recipe.app.review.caution, /réserve de calcul nutritionnel/i);
  }

  const text = JSON.stringify(recipe).toLowerCase();
  assert.ok(
    !/(?:^|\W)(?:gu[ée]rit|soigne)(?:$|\W)|réduit l'inflammation|traite une maladie/i.test(text),
    `${recipe.id}: promesse médicale interdite`,
  );
}

for (const id of ["r479", "r483"]) {
  assert.match(final.recipes.find((recipe) => recipe.id === id).app.review.caution, /cuire.*cœur/i);
}
for (const id of ["r484", "r486", "r493", "r495", "r500"]) {
  assert.match(final.recipes.find((recipe) => recipe.id === id).app.review.caution, /préparation crue/i);
}
for (const id of ["r485", "r488", "r496", "r498"]) {
  assert.match(final.recipes.find((recipe) => recipe.id === id).app.review.caution, /sodium/i);
}
assert.match(final.recipes.find((recipe) => recipe.id === "r482").app.review.caution, /médicaments/i);
assert.match(final.recipes.find((recipe) => recipe.id === "r480").app.review.caution, /chaîne du froid/i);
assert.equal(final.recipes.filter((recipe) => recipe.app.planner.eligible).length, 0);

console.log(
  "Lot final r476-r500 valide : 8 desserts et 17 sauces relus, aucun faux repas activé.",
);
