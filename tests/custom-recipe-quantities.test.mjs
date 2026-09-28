import assert from "node:assert/strict";
import test from "node:test";
import { MAX_CUSTOM_RECIPE_INGREDIENT_QUANTITY } from "../src/domain.ts";
import {
  adjustCustomRecipeQuantity,
  customRecipeQuantityStep,
  formatCustomRecipeQuantity,
} from "../src/custom-recipe-quantities.ts";
import { DEFAULT_APP_STATE, exportAppState, importAppState, migrateAppState, normalizeCustomRecipe } from "../src/storage.ts";
import { RECIPES } from "../src/recipes.ts";

const UNITS = [["g", 5], ["ml", 5], ["piece", 0.25], ["c_soupe", 0.25], ["c_cafe", 0.25]];

test("les cinq unités utilisent leur pas culinaire sans conversion d'unité", () => {
  for (const [unit, step] of UNITS) {
    assert.equal(customRecipeQuantityStep(unit), step, unit);
    assert.equal(adjustCustomRecipeQuantity(1, unit, 1), 1 + step, unit);
    assert.equal(adjustCustomRecipeQuantity(10, unit, -1), 10 - step, unit);
  }
});

test("les petits décimaux gardent leur précision sur les allers-retours usuels", () => {
  const cases = [
    [0.004, 5.004, 0.254],
    [0.125, 5.125, 0.375],
    [0.1, 5.1, 0.35],
    [1.25, 6.25, 1.5],
    [2.71828, 7.71828, 2.96828],
    [1e-8, 5.00000001, 0.25000001],
    [1.23456789, 6.23456789, 1.48456789],
    [123.000004, 128.000004, 123.250004],
  ];
  for (const [unit, step] of UNITS) {
    for (const [quantity, gramResult, countResult] of cases) {
      const increased = adjustCustomRecipeQuantity(quantity, unit, 1);
      assert.equal(increased, step === 5 ? gramResult : countResult, `${quantity} ${unit} : augmentation`);
      assert.equal(adjustCustomRecipeQuantity(increased, unit, -1), quantity, `${quantity} ${unit} : retour`);
    }
  }
});

test("la diminution atteint volontairement zéro sans produire une quantité négative", () => {
  for (const [unit, step] of UNITS) {
    for (const quantity of [0, 0.004, 0.125, step]) {
      assert.equal(adjustCustomRecipeQuantity(quantity, unit, -1), 0, `${quantity} ${unit}`);
    }
    assert.equal(adjustCustomRecipeQuantity(0, unit, 1), step, unit);
  }
});

test("le prochain pas au-delà de la borne est refusé sans plafonnement silencieux", () => {
  assert.equal(MAX_CUSTOM_RECIPE_INGREDIENT_QUANTITY, 1_000_000);
  for (const [unit, step] of UNITS) {
    const maximum = MAX_CUSTOM_RECIPE_INGREDIENT_QUANTITY;
    assert.equal(adjustCustomRecipeQuantity(maximum - step, unit, 1), maximum, unit);
    assert.equal(adjustCustomRecipeQuantity(maximum - step + 0.001, unit, 1), null, unit);
    assert.equal(adjustCustomRecipeQuantity(maximum, unit, 1), null, unit);
    assert.equal(adjustCustomRecipeQuantity(maximum, unit, -1), maximum - step, unit);
  }
});

test("les entrées non finies, négatives, hors borne ou non numériques sont refusées", () => {
  for (const quantity of [NaN, Infinity, -Infinity, -0.1, -1, 1_000_001, Number.MAX_VALUE, "1", null, undefined]) {
    for (const [unit] of UNITS) {
      assert.equal(adjustCustomRecipeQuantity(quantity, unit, 1), null, `${String(quantity)} ${unit}`);
      assert.equal(adjustCustomRecipeQuantity(quantity, unit, -1), null, `${String(quantity)} ${unit}`);
    }
  }
});

test("l'éditeur affiche exactement les décimaux français sans arrondir à une ou deux décimales", () => {
  for (const [quantity, expected] of [
    [0, "0"], [-0, "0"], [0.004, "0,004"], [0.1, "0,1"], [0.125, "0,125"],
    [1.25, "1,25"], [2.71828, "2,71828"], [1.2345678901234567, "1,2345678901234567"], [1_000_000, "1000000"],
  ]) {
    assert.equal(formatCustomRecipeQuantity(quantity), expected);
  }
});

test("les exposants sont développés sans faire disparaître les petites quantités", () => {
  assert.equal(formatCustomRecipeQuantity(1e-7), "0,0000001");
  assert.equal(formatCustomRecipeQuantity(1.25e-7), "0,000000125");
  assert.equal(formatCustomRecipeQuantity(1e21), "1000000000000000000000");
  for (const quantity of [1e-300, Number.MIN_VALUE, Number.MAX_VALUE]) {
    const formatted = formatCustomRecipeQuantity(quantity);
    assert.doesNotMatch(formatted, /[eE]/);
    assert.notEqual(formatted, "0");
    assert.equal(Number(formatted.replace(",", ".")), quantity);
  }
  assert.equal(formatCustomRecipeQuantity(Number.MIN_VALUE), `0,${"0".repeat(323)}5`);
  // Editing still stores a Number: adding a quarter cannot retain a subnormal
  // residual. This test promises exact untouched display, not an impossible
  // arithmetic round trip below IEEE-754 precision.
  assert.equal(adjustCustomRecipeQuantity(Number.MIN_VALUE, "piece", 1), 0.25);
  assert.equal(adjustCustomRecipeQuantity(Number.MIN_VALUE, "piece", -1), 0);
});

function personalRecipe() {
  return {
    id: "perso-quantity-math", title: "Mes quantités précises", mealTypes: ["lunch"],
    diet: ["classic"], prepMinutes: 15, restMinutes: 2880, costPerPortion: 2,
    seasons: ["all-year"], equipment: [], allergens: ["lait"], tags: [],
    ingredients: [
      { id: "carrot", name: "Carotte", quantity: 0.004, unit: "g", category: "fruit-vegetable" },
      { id: "milk", name: "Lait", quantity: 0.125, unit: "ml", category: "fresh", allergens: ["lait"] },
      { id: "egg", name: "Œuf", quantity: 0.1, unit: "piece", category: "fresh", allergens: ["œuf"] },
      { id: "olive-oil", name: "Huile d'olive", quantity: 1.25, unit: "c_soupe", category: "grocery", pantryStaple: true },
      { id: "pepper", name: "Poivre facultatif", quantity: Number.MIN_VALUE, unit: "c_cafe", category: "grocery", optional: true },
    ],
    nutrition: { calories: 100, protein: 2, fiber: 3, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    nutritionRecalculated: true, costRecalculated: true,
    description: "Fixture de précision indépendante du planificateur.", steps: ["Préparer les ingrédients."],
    conservation: "Au frais.", image: "/assets/recipe-placeholder.svg",
  };
}

test("calculs, normalisation et sauvegarde n'altèrent pas les quantités sources ni leurs métadonnées", () => {
  const recipe = personalRecipe();
  const before = structuredClone(recipe);
  for (const ingredient of recipe.ingredients) {
    adjustCustomRecipeQuantity(ingredient.quantity, ingredient.unit, 1);
    formatCustomRecipeQuantity(ingredient.quantity);
  }
  const normalized = normalizeCustomRecipe(recipe);
  assert.deepEqual(normalized, before);
  assert.deepEqual(recipe, before);

  const source = migrateAppState({ ...structuredClone(DEFAULT_APP_STATE), customRecipes: [recipe] });
  const sourceBefore = structuredClone(source);
  const backup = exportAppState(source);
  const restored = importAppState(backup);
  assert.equal(JSON.parse(backup).version, DEFAULT_APP_STATE.version);
  assert.deepEqual(restored.customRecipes[0], before);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(recipe, before);
});

test("normalisation et sauvegarde préservent fractions, identités, options et allergènes d'une recette adaptée", () => {
  const recipe = {
    ...structuredClone(RECIPES[0]), id: "perso-quantities-storage",
    ingredients: [
      { id: "carrot", name: "carotte", quantity: 0.004, unit: "g", category: "fruit-vegetable" },
      { id: "almond", name: "amande", quantity: 2.71828, unit: "c_cafe", category: "grocery", optional: true, pantryStaple: true, allergens: ["fruits à coque"] },
    ],
  };
  const before = structuredClone(recipe);
  const normalized = normalizeCustomRecipe(recipe);
  assert.deepEqual(normalized.ingredients, recipe.ingredients);
  const state = migrateAppState({ ...structuredClone(DEFAULT_APP_STATE), customRecipes: [recipe] });
  const backup = exportAppState(state);
  assert.equal(JSON.parse(backup).version, DEFAULT_APP_STATE.version);
  assert.deepEqual(importAppState(backup), state);
  assert.deepEqual(importAppState(backup).customRecipes[0].ingredients, recipe.ingredients);
  assert.deepEqual(recipe, before);
});
