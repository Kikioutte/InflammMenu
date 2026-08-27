import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const load = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);
const priorPaths = [
  "research/ciqual-map-r051-r075.json",
  "research/ciqual-map-r076-r100.json",
  "research/ciqual-map-r101-r125.json",
  "research/ciqual-map-r126-r150.json",
  "research/ciqual-map-r151-r175.json",
  "research/ciqual-map-r176-r200.json",
  "research/ciqual-map-r201-r225.json",
  "research/ciqual-map-r226-r250.json",
];
const [draft, nutrition, final, mapping, ciqual, usda, ...priorMaps] = await Promise.all([
  load("research/pilot-r276-r300.draft.json"),
  load("research/pilot-r276-r300.nutrition.json"),
  load("research/pilot-r276-r300.final.json"),
  load("research/ciqual-map-r276-r300.json"),
  load("research/ciqual-2025-core.json"),
  load("research/usda-sr-fallbacks.json"),
  ...priorPaths.map(load),
]);

const expectedIds = Array.from({ length: 25 }, (_, index) => `r${276 + index}`);
assert.deepEqual(final.recipes.map(({ id }) => id), expectedIds);
assert.equal(final.meta.schema_version, "2.1.0");
assert.equal(final.meta.status, "editorial-validated");
assert.equal(final.meta.reviewed_at, "2026-08-05");
assert.match(final.meta.culinary_notice, /aucune.*testée physiquement/i);
assert.match(final.meta.cost_notice, /estimations/i);
validateCatalogue(final, { taxonomy: "legacy" });

const requiredIds = new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id)));
const mappingById = new Map(mapping.ingredients.map((entry) => [entry.ingredient_id, entry]));
assert.equal(mappingById.size, 100);
assert.deepEqual(new Set(mappingById.keys()), requiredIds);
assert.equal(mapping.meta.reused_validated_mapping_count, 71);
assert.equal(mapping.meta.manually_reviewed_mapping_count, 29);
assert.deepEqual(mapping.meta.fallback_scope, ["romarin-frais"]);

const latestPriorById = new Map();
for (const prior of priorMaps) for (const entry of prior.ingredients) latestPriorById.set(entry.ingredient_id, entry);
for (const id of requiredIds) {
  const entry = mappingById.get(id);
  assert.ok(["validated", "caution"].includes(entry.review_status), `${id}: correspondance non relue`);
  const prior = latestPriorById.get(id);
  if (prior) {
    assert.equal(entry.selected_ciqual_code, prior.selected_ciqual_code, `${id}: code Ciqual validé non réutilisé`);
    assert.equal(entry.source_dataset, prior.source_dataset, `${id}: source validée non réutilisée`);
    assert.equal(entry.selected_source_code, prior.selected_source_code, `${id}: code source validé non réutilisé`);
  }
}
const ciqualCodes = new Set(ciqual.foods.map(({ code }) => code));
const usdaCodes = new Set(usda.foods.map(({ fdc_id }) => fdc_id));
for (const entry of mapping.ingredients) {
  if (entry.source_dataset === "usda-sr") {
    assert.ok(usdaCodes.has(entry.selected_source_code), `${entry.ingredient_id}: code USDA inconnu`);
  } else {
    assert.ok(ciqualCodes.has(String(entry.selected_source_code ?? entry.selected_ciqual_code)), `${entry.ingredient_id}: code Ciqual inconnu`);
  }
}

function convertedGrams(recipeId, ingredientId) {
  const recipe = draft.recipes.find(({ id }) => id === recipeId);
  const ingredient = recipe.ingredients.find(({ id }) => id === ingredientId);
  const entry = mappingById.get(ingredientId);
  const occurrence = entry.occurrence_overrides?.[recipeId];
  const factor = occurrence?.grams_per_normalized_unit
    ?? entry.grams_per_unit?.[ingredient.unite_normalisee]
    ?? entry.grams_per_normalized_unit;
  return occurrence?.grams_total ?? ingredient.quantite_normalisee * factor;
}

assert.equal(convertedGrams("r276", "courge-spaghetti"), 1000);
assert.equal(convertedGrams("r278", "artichaut"), 200);
assert.equal(convertedGrams("r278", "quinoa-rouge"), 660);
assert.equal(convertedGrams("r278", "marjolaine-fraiche"), 4.95);
assert.equal(convertedGrams("r280", "pois-bambara-secs"), 280);
assert.equal(convertedGrams("r283", "creme-avoine"), 250);
assert.equal(convertedGrams("r286", "graines-lupin-cuites"), 228);
assert.equal(convertedGrams("r288", "cacao-non-sucre"), 6);
assert.equal(convertedGrams("r292", "citronnelle"), 1);
assert.equal(convertedGrams("r294", "bouillon-legumes-celeri"), 200);
assert.equal(convertedGrams("r298", "shiitake-frais"), 240);

const draftById = new Map(draft.recipes.map((recipe) => [recipe.id, recipe]));
const nutritionById = new Map(nutrition.recipes.map((recipe) => [recipe.id, recipe]));
let eligibleCount = 0;
let calculationCautionCount = 0;
for (const recipe of final.recipes) {
  const original = draftById.get(recipe.id);
  const calculated = nutritionById.get(recipe.id);
  for (const field of ["titre", "categorie", "temps", "portions", "ingredients", "etapes", "substitutions"]) {
    assert.deepEqual(recipe[field], calculated[field], `${recipe.id}: ${field} modifié pendant la finalisation`);
  }
  assert.deepEqual(recipe.nutrition_par_portion, calculated.nutrition_par_portion, `${recipe.id}: nutrition modifiée pendant la finalisation`);
  assert.equal(recipe.app.planner.cost_per_portion_eur, original.app.planner.cost_per_portion_eur, `${recipe.id}: coût estimé modifié`);
  assert.ok(["salade", "plat"].includes(recipe.categorie), `${recipe.id}: catégorie non assimilable à un repas`);
  assert.equal(recipe.app.planner.eligible, true, `${recipe.id}: vrai repas non activé`);
  eligibleCount += 1;
  assert.ok(recipe.app.planner.meal_types.includes("lunch") && recipe.app.planner.meal_types.includes("dinner"));
  assert.ok(recipe.app.planner.equipment.every((value) => ["hob", "oven", "microwave", "blender", "toaster", "steamer"].includes(value)));
  assert.ok(recipe.nutrition_par_portion.calories >= 300 && recipe.nutrition_par_portion.calories <= 600, `${recipe.id}: énergie de repas peu plausible`);
  assert.ok(recipe.nutrition_par_portion.proteines_g >= 10, `${recipe.id}: protéines trop faibles pour un repas annoncé complet`);
  assert.ok(recipe.nutrition_par_portion.sodium_mg <= 500, `${recipe.id}: sodium élevé non exclu`);
  assert.equal(recipe.app.review.stage, "editorial-validated");
  assert.equal(recipe.app.review.status, "caution");
  assert.match(recipe.app.review.summary, /recette non testée physiquement/i);
  assert.equal(recipe.provenance.reviewed_at, "2026-08-05");
  assert.ok(recipe.score_anti_inflammatoire >= 1 && recipe.score_anti_inflammatoire <= 10);
  assert.match(recipe.score_note, /modèle méditerranéen global/i);
  assert.match(recipe.score_note, /ne mesure aucun effet médical/i);
  const editorialText = [recipe.description, recipe.app.review.summary, recipe.app.review.caution, recipe.score_note].join(" ");
  assert.ok(!/(guérit|guérison|prévient une maladie|traite une maladie|réduit l'inflammation|combat l'inflammation)/i.test(editorialText), `${recipe.id}: allégation médicale`);
  if (recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions") {
    calculationCautionCount += 1;
    assert.match(recipe.app.review.caution, /Réserve de calcul/i, `${recipe.id}: réserve de calcul non visible`);
  }
}

assert.equal(eligibleCount, 25);
assert.equal(calculationCautionCount, 21);
assert.deepEqual(final.recipes.find(({ id }) => id === "r285").app.planner.allergens, ["moutarde"]);
assert.deepEqual(final.recipes.find(({ id }) => id === "r286").app.planner.allergens, ["lupin"]);
assert.ok(final.recipes.find(({ id }) => id === "r294").app.planner.allergens.includes("celeri"));
assert.deepEqual([...final.recipes.find(({ id }) => id === "r298").app.planner.allergens].sort(), ["sesame", "soja"]);
const r286 = final.recipes.find(({ id }) => id === "r286");
assert.ok(r286.nutrition_par_portion.calories >= 390 && r286.nutrition_par_portion.calories <= 450, "r286: facteur d'hydratation du lupin incohérent");
assert.match(r286.app.review.caution, /facteur 0,38/i);

console.log(`Lot final r276-r300 valide : ${eligibleCount} vrais repas éligibles, ${calculationCautionCount} réserves nutritionnelles.`);
