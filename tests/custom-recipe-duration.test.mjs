import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_APP_STATE, exportAppState, importAppState, migrateAppState, normalizeCustomRecipe } from "../src/storage.ts";

function personalRecipe(patch = {}) {
  return {
    id: "perso-duration", title: "Ma recette longue", mealTypes: ["lunch"], diet: ["classic", "vegetarian", "no-pork"],
    prepMinutes: 15, restMinutes: 2880, costPerPortion: 2, seasons: ["all-year"], equipment: ["hob"], allergens: [], tags: [],
    ingredients: [{ id: "carrot", name: "carotte", quantity: 100, unit: "g", category: "fruit-vegetable" }],
    nutrition: { calories: 100, protein: 3, fiber: 2, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    nutritionRecalculated: true, costRecalculated: true,
    description: "Fixture de durée indépendante du planificateur.", steps: ["Préparer la recette.", "Prévoir le repos indiqué."],
    conservation: "À consommer rapidement.", image: "/assets/recipe-placeholder.svg", ...patch,
  };
}

test("les durées actives valides 1, 600, 601, 720 et 1440 restent intactes", () => {
  for (const prepMinutes of [1, 600, 601, 720, 1440]) {
    const recipe = personalRecipe({ prepMinutes });
    assert.deepEqual(normalizeCustomRecipe(recipe), recipe);
    assert.equal(recipe.restMinutes, 2880);
  }
});

test("les durées actives négatives, non finies ou hors bornes sont rejetées sans altérer la source", () => {
  for (const prepMinutes of [0, -1, 1441, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "1440", null]) {
    const recipe = personalRecipe({ prepMinutes });
    const before = structuredClone(recipe);
    assert.equal(normalizeCustomRecipe(recipe), null, String(prepMinutes));
    assert.deepEqual(recipe, before);
  }
});

test("l'import conserve son arrondi historique après contrôle de la borne", () => {
  assert.equal(normalizeCustomRecipe(personalRecipe({ prepMinutes: 600.5 })).prepMinutes, 601);
  assert.equal(normalizeCustomRecipe(personalRecipe({ prepMinutes: 1439.9 })).prepMinutes, 1440);
  assert.equal(normalizeCustomRecipe(personalRecipe({ prepMinutes: 1440.1 })), null);
});

test("le repos garde ses propres bornes sans être plafonné comme le temps actif", () => {
  for (const restMinutes of [0, 1441, 2880, 525600]) {
    const normalized = normalizeCustomRecipe(personalRecipe({ prepMinutes: 1440, restMinutes }));
    assert.equal(normalized.prepMinutes, 1440);
    assert.equal(normalized.restMinutes, restMinutes);
  }
  for (const restMinutes of [-1, 525601, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(normalizeCustomRecipe(personalRecipe({ restMinutes })), null);
  }
});

test("export et restauration conservent temps actif et repos distincts sans modifier le format", () => {
  const source = migrateAppState({ ...structuredClone(DEFAULT_APP_STATE), customRecipes: [personalRecipe({ prepMinutes: 1440 })] });
  const backup = exportAppState(source);
  assert.equal(JSON.parse(backup).version, DEFAULT_APP_STATE.version);
  const restored = importAppState(backup);
  assert.deepEqual(restored, source);
  assert.equal(restored.customRecipes[0].prepMinutes, 1440);
  assert.equal(restored.customRecipes[0].restMinutes, 2880);
});
