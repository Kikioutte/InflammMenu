import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const load = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);
const [draft, nutrition, final, mapping, priorMapping, ciqual, usda] = await Promise.all([
  load("research/pilot-r076-r100.draft.json"),
  load("research/pilot-r076-r100.nutrition.json"),
  load("research/pilot-r076-r100.final.json"),
  load("research/ciqual-map-r076-r100.json"),
  load("research/ciqual-map-r051-r075.json"),
  load("research/ciqual-2025-core.json"),
  load("research/usda-sr-fallbacks.json"),
]);

const expectedIds = Array.from({ length: 25 }, (_, index) => `r${String(76 + index).padStart(3, "0")}`);
assert.deepEqual(final.recipes.map(({ id }) => id), expectedIds);
assert.equal(final.meta.schema_version, "2.1.0");
assert.equal(final.meta.status, "editorial-validated");
assert.equal(final.meta.reviewed_at, "2026-08-05");
assert.match(final.meta.culinary_notice, /aucune.*testée physiquement/i);
assert.match(final.meta.cost_notice, /estimations/i);
validateCatalogue(final, { taxonomy: "legacy" });

const requiredIds = new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id)));
const mappingById = new Map(mapping.ingredients.map((entry) => [entry.ingredient_id, entry]));
assert.equal(mappingById.size, 85);
assert.deepEqual(new Set(mappingById.keys()), requiredIds);
assert.equal(mapping.meta.reused_validated_mapping_count, 42);
assert.equal(mapping.meta.manually_reviewed_mapping_count, 43);
assert.deepEqual([...mapping.meta.fallback_scope].sort(), ["cardamome-moulue", "graines-chia"]);

const priorById = new Map(priorMapping.ingredients.map((entry) => [entry.ingredient_id, entry]));
for (const id of requiredIds) {
  const entry = mappingById.get(id);
  assert.ok(["validated", "caution"].includes(entry.review_status), `${id}: correspondance non relue`);
  if (priorById.has(id)) {
    const prior = priorById.get(id);
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
    assert.ok(ciqualCodes.has(entry.selected_ciqual_code), `${entry.ingredient_id}: code Ciqual inconnu`);
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

assert.equal(convertedGrams("r076", "menthe-fraiche"), 10);
assert.equal(convertedGrams("r083", "aneth-frais"), 15);
assert.equal(convertedGrams("r088", "coriandre-fraiche"), 15);
assert.equal(convertedGrams("r091", "graines-lin-moulues"), 20);
assert.equal(convertedGrams("r100", "graines-lin-moulues"), 20);
assert.equal(convertedGrams("r084", "pain-seigle-complet"), 160);
assert.equal(convertedGrams("r078", "prune"), 260);

const nutritionById = new Map(nutrition.recipes.map((recipe) => [recipe.id, recipe]));
const draftById = new Map(draft.recipes.map((recipe) => [recipe.id, recipe]));
let eligibleCount = 0;
let calculationCautionCount = 0;
for (const recipe of final.recipes) {
  const calculated = nutritionById.get(recipe.id);
  const original = draftById.get(recipe.id);
  for (const field of ["titre", "categorie", "temps", "portions", "ingredients", "etapes", "substitutions"]) {
    assert.deepEqual(recipe[field], calculated[field], `${recipe.id}: ${field} modifié pendant la finalisation`);
  }
  assert.deepEqual(recipe.nutrition_par_portion, calculated.nutrition_par_portion, `${recipe.id}: nutrition modifiée pendant la finalisation`);
  assert.equal(recipe.app.planner.cost_per_portion_eur, original.app.planner.cost_per_portion_eur, `${recipe.id}: coût estimé modifié`);
  assert.equal(recipe.app.review.stage, "editorial-validated");
  assert.ok(["validated", "caution"].includes(recipe.app.review.status));
  assert.equal(recipe.provenance.reviewed_at, "2026-08-05");
  assert.ok(recipe.score_anti_inflammatoire >= 1 && recipe.score_anti_inflammatoire <= 10);
  assert.match(recipe.score_note, /modèle méditerranéen global/i);
  assert.match(recipe.score_note, /ne mesure aucun effet médical/i);

  const editorialText = [recipe.description, recipe.app.review.summary, recipe.app.review.caution, recipe.score_note].join(" ");
  assert.ok(!/(guérit|guérison|prévient une maladie|traite une maladie|réduit l'inflammation|combat l'inflammation)/i.test(editorialText), `${recipe.id}: allégation médicale`);
  assert.ok(!/(recette|préparation) (?:physiquement )?testée(?!.*non)/i.test(recipe.app.review.summary), `${recipe.id}: essai physique revendiqué`);

  if (recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions") {
    calculationCautionCount += 1;
    assert.equal(recipe.app.review.status, "caution");
    assert.match(recipe.app.review.caution, /Réserve/i, `${recipe.id}: réserve de calcul non visible`);
  }
  if (recipe.app.planner.eligible) {
    eligibleCount += 1;
    assert.equal(recipe.categorie, "petit-dejeuner");
    assert.ok(recipe.app.planner.meal_types.includes("breakfast"));
    assert.ok(recipe.nutrition_par_portion.calories >= 240, `${recipe.id}: petit-déjeuner trop léger pour le planificateur`);
    assert.ok(recipe.app.planner.equipment.every((value) => ["hob", "oven", "microwave", "blender", "toaster", "steamer"].includes(value)));
  }
}

assert.equal(calculationCautionCount, 13);
assert.equal(eligibleCount, 23);
for (const id of ["r084", "r093"]) {
  const recipe = final.recipes.find((entry) => entry.id === id);
  assert.equal(recipe.app.planner.eligible, false);
  assert.ok(recipe.nutrition_par_portion.sodium_mg >= 650);
  assert.match(recipe.app.review.caution, /sodium/i);
}
const r100 = final.recipes.find(({ id }) => id === "r100");
assert.ok(r100.nutrition_par_portion.calories >= 380 && r100.nutrition_par_portion.calories <= 450, "r100: conversion noix/lin incohérente");
assert.match(r100.app.review.caution, /aucun sucre ajouté/i);

console.log(`Lot final r076-r100 valide : 25 recettes, ${eligibleCount} éligibles, ${calculationCautionCount} réserves nutritionnelles.`);
