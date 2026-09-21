import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { recalculateCustomNutrition, recalculateRecipeEstimates } from "../src/recipe-nutrition.ts";
import { IMPORTED_PLAN_RECIPES } from "../src/planner-catalog.ts";
import { RECIPES } from "../src/recipes.ts";

const recipe = id => IMPORTED_PLAN_RECIPES.find(item => item.id === id);
const scale = (ingredients, ratio) => ingredients.map(item => ({ ...item, quantity: item.quantity * ratio }));

test("derived coefficients still match reviewed sources and all current catalogue totals", () => {
  execFileSync(process.execPath, ["scripts/generate-recipe-nutrition.mjs", "--check"], { cwd: new URL("../", import.meta.url) });
  const table = JSON.parse(readFileSync(new URL("../src/data/recipe-nutrition.json", import.meta.url)));
  assert.equal(Object.keys(table).length, 957);
  assert.ok(table["catalog-r1087"], "the recent association recipes are retained");
  assert.equal(table["catalog-r551"], undefined, "unmapped CREAMi ingredients are not guessed");
});

test("partial quantity edits use reviewed nutrition but retain an explicitly unrecalculated cost without ingredient prices", async () => {
  const source = recipe("catalog-r051");
  const ingredients = source.ingredients.map((item, index) => index === 0 ? { ...item, quantity: item.quantity * 2 } : item);
  const result = await recalculateRecipeEstimates(source, ingredients);
  assert.equal(result.nutritionRecalculated, true);
  assert.ok(result.nutrition.calories > source.nutrition.calories);
  assert.ok(result.nutrition.calories < source.nutrition.calories * 2);
  assert.equal(result.costPerPortion, source.costPerPortion);
  assert.equal(result.costRecalculated, false);
  assert.deepEqual(await recalculateCustomNutrition(`perso-${source.id}-fixture`, ingredients), result.nutrition);
});

test("association ingredient quantities recalculate editorial prices and supported nutrients", async () => {
  const source = recipe("catalog-r631");
  const ingredients = source.ingredients.map(item => item.id === "riz-complet" ? { ...item, quantity: item.quantity + 70 } : item);
  const result = await recalculateRecipeEstimates(source, ingredients);
  assert.equal(result.costRecalculated, true);
  assert.equal(result.costPerPortion, 1.62, "70 g extra rice at the reviewed 4 euro/kg assumption");
  assert.equal(result.nutritionRecalculated, true);
  assert.ok(result.nutrition.calories > 600);
  assert.ok(result.nutrition.protein > source.nutrition.protein);
  assert.equal((await recalculateCustomNutrition("perso-catalog-r1030-variant", recipe("catalog-r1030").ingredients)).calories, 371);
});

test("removing a supported ingredient recalculates the remaining nutrition instead of preserving the old total", async () => {
  const source = recipe("catalog-r051");
  const remaining = source.ingredients.slice(1);
  const before = await recalculateCustomNutrition(source.id, source.ingredients);
  const after = await recalculateCustomNutrition(source.id, remaining);
  assert.ok(after.calories < before.calories);
});

test("new substitutes, unit changes, optional changes and duplicate rows never invent nutrition", async () => {
  const source = recipe("catalog-r051");
  const first = source.ingredients[0];
  for (const ingredients of [
    [{ ...first, id: "unknown-food" }],
    [{ ...first, unit: first.unit === "g" ? "ml" : "g" }],
    [{ ...first, optional: !first.optional }],
    [first, first],
    [{ ...first, quantity: Number.NaN }],
    [{ ...first, quantity: 0 }],
    [{ ...first, quantity: 1_000_001 }],
    [],
  ]) assert.equal(await recalculateCustomNutrition(source.id, ingredients), null);
  assert.equal(await recalculateCustomNutrition("perso-unknown", source.ingredients), null);
});

test("uniform quantities scale published estimates for legacy recipes without making a network request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("offline"); };
  try {
    const source = RECIPES[0];
    const result = await recalculateRecipeEstimates(source, scale(source.ingredients, 2));
    assert.equal(result.costPerPortion, Math.round(source.costPerPortion * 2 * 100) / 100);
    assert.equal(result.costRecalculated, true);
    assert.equal(result.nutrition.calories, Math.round(source.nutrition.calories * 2));
    assert.equal(result.nutritionRecalculated, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("an already uncertain estimate does not become trusted after a proportional edit", async () => {
  const source = { ...RECIPES[0], nutritionRecalculated: false, costRecalculated: false };
  const result = await recalculateRecipeEstimates(source, scale(source.ingredients, 2));
  assert.equal(result.costPerPortion, source.costPerPortion);
  assert.equal(result.costRecalculated, false);
  assert.deepEqual(result.nutrition, source.nutrition);
  assert.equal(result.nutritionRecalculated, false);
});

test("reviewed coefficients can restore a valid estimate independently of stale retained numbers", async () => {
  const original = recipe("catalog-r631");
  const source = { ...original, costPerPortion: 99, costRecalculated: false, nutrition: { ...original.nutrition, calories: 999 }, nutritionRecalculated: false };
  const result = await recalculateRecipeEstimates(source, source.ingredients);
  assert.equal(result.costPerPortion, original.costPerPortion);
  assert.equal(result.costRecalculated, true);
  assert.equal(result.nutrition.calories, Math.round(original.nutrition.calories));
  assert.equal(result.nutritionRecalculated, true);
});

test("a partial edit to an unmapped or composed source marks both estimates without mutating the recipe", async () => {
  const source = { ...RECIPES[0], id: "perso-repas-r1000-r1030-r1087" };
  const snapshot = structuredClone(source);
  const result = await recalculateRecipeEstimates(source, source.ingredients.slice(1));
  assert.equal(result.costRecalculated, false);
  assert.equal(result.nutritionRecalculated, false);
  assert.deepEqual(source, snapshot);
  assert.equal(result.nutrition.calories, source.nutrition.calories);
});
