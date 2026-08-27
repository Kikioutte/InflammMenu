import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const load = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);
const priorMapPaths = [
  "research/ciqual-map-r051-r075.json",
  "research/ciqual-map-r076-r100.json",
  "research/ciqual-map-r101-r125.json",
  "research/ciqual-map-r126-r150.json",
];
const [draft, nutrition, final, mapping, ciqual, usda, ...priorMaps] = await Promise.all([
  load("research/pilot-r176-r200.draft.json"),
  load("research/pilot-r176-r200.nutrition.json"),
  load("research/pilot-r176-r200.final.json"),
  load("research/ciqual-map-r176-r200.json"),
  load("research/ciqual-2025-core.json"),
  load("research/usda-sr-fallbacks.json"),
  ...priorMapPaths.map(load),
]);

const expectedIds = Array.from({ length: 25 }, (_, index) => `r${176 + index}`);
assert.deepEqual(final.recipes.map(({ id }) => id), expectedIds);
assert.equal(final.meta.schema_version, "2.1.0");
assert.equal(final.meta.status, "editorial-validated");
assert.equal(final.meta.reviewed_at, "2026-08-05");
assert.match(final.meta.culinary_notice, /aucune.*testée physiquement/i);
assert.match(final.meta.cost_notice, /estimations/i);
validateCatalogue(final, { taxonomy: "legacy" });

const requiredIds = new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id)));
const mappingById = new Map(mapping.ingredients.map((entry) => [entry.ingredient_id, entry]));
assert.equal(mappingById.size, 72);
assert.deepEqual(new Set(mappingById.keys()), requiredIds);
assert.equal(mapping.meta.reused_validated_mapping_count, 61);
assert.equal(mapping.meta.manually_reviewed_mapping_count, 11);
assert.deepEqual(mapping.meta.fallback_scope, ["cardamome-moulue", "graines-chia", "romarin-frais"]);

const latestPriorById = new Map();
for (const prior of priorMaps) {
  for (const entry of prior.ingredients) latestPriorById.set(entry.ingredient_id, entry);
}
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

assert.equal(convertedGrams("r177", "graines-lin-moulues"), 30);
assert.equal(convertedGrams("r192", "cacao-non-sucre"), 35);
assert.equal(convertedGrams("r198", "tahini"), 45);
assert.equal(convertedGrams("r195", "abricot"), 800);
assert.equal(convertedGrams("r199", "prune"), 700);
assert.equal(convertedGrams("r200", "coing"), 500);
assert.equal(convertedGrams("r177", "orange"), 35);
assert.equal(convertedGrams("r189", "orange"), 185);
assert.equal(convertedGrams("r193", "orange"), 65);
assert.equal(convertedGrams("r196", "orange"), 150);
assert.equal(convertedGrams("r194", "mangue"), 300);

const draftById = new Map(draft.recipes.map((recipe) => [recipe.id, recipe]));
const nutritionById = new Map(nutrition.recipes.map((recipe) => [recipe.id, recipe]));
let calculationCautionCount = 0;
for (const recipe of final.recipes) {
  const original = draftById.get(recipe.id);
  const calculated = nutritionById.get(recipe.id);
  for (const field of ["titre", "categorie", "temps", "portions", "ingredients", "etapes", "substitutions"]) {
    assert.deepEqual(recipe[field], calculated[field], `${recipe.id}: ${field} modifié pendant la finalisation`);
  }
  assert.deepEqual(recipe.nutrition_par_portion, calculated.nutrition_par_portion, `${recipe.id}: nutrition modifiée pendant la finalisation`);
  assert.equal(recipe.app.planner.cost_per_portion_eur, original.app.planner.cost_per_portion_eur, `${recipe.id}: coût estimé modifié`);
  assert.equal(recipe.app.planner.eligible, false, `${recipe.id}: collation ou dessert activé comme repas`);
  assert.ok(["snack", "dessert"].includes(recipe.categorie));
  assert.equal(recipe.app.review.stage, "editorial-validated");
  assert.equal(recipe.app.review.status, "caution");
  assert.match(recipe.app.review.summary, /non testée physiquement/i);
  assert.match(recipe.app.review.summary, /hors planificateur/i);
  assert.equal(recipe.provenance.reviewed_at, "2026-08-05");
  assert.ok(recipe.score_anti_inflammatoire >= 1 && recipe.score_anti_inflammatoire <= 10);
  assert.match(recipe.score_note, /modèle méditerranéen global/i);
  assert.match(recipe.score_note, /ne mesure aucun effet médical/i);
  assert.ok(recipe.nutrition_par_portion.calories >= 80 && recipe.nutrition_par_portion.calories <= 320, `${recipe.id}: énergie par portion peu plausible`);

  const editorialText = [recipe.description, recipe.app.review.summary, recipe.app.review.caution, recipe.score_note].join(" ");
  assert.ok(!/(guérit|guérison|prévient une maladie|traite une maladie|réduit l'inflammation|combat l'inflammation)/i.test(editorialText), `${recipe.id}: allégation médicale`);
  if (recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions") {
    calculationCautionCount += 1;
    assert.match(recipe.app.review.caution, /Réserve de calcul/i, `${recipe.id}: réserve de calcul non visible`);
  }
}

assert.equal(calculationCautionCount, 11);
const r185 = final.recipes.find(({ id }) => id === "r185");
assert.ok(r185.app.planner.allergens.includes("sulfites"));
assert.match(r185.app.review.caution, /sulfites/i);
const r194 = final.recipes.find(({ id }) => id === "r194");
assert.ok(r194.nutrition_par_portion.acides_gras_satures_g >= 5.5);
assert.match(r194.app.review.caution, /graisses saturées.*6 g/i);
const r198 = final.recipes.find(({ id }) => id === "r198");
assert.deepEqual([...r198.app.planner.allergens].sort(), ["sesame", "soja"]);

console.log(`Lot final r176-r200 valide : 25 collations/desserts hors planificateur, ${calculationCautionCount} réserves nutritionnelles.`);
