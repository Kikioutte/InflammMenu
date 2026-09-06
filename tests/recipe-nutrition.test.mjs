import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recalculateCustomNutrition } from "../src/recipe-nutrition.ts";
import { normalizeCustomRecipe, exportAppState, migrateAppState } from "../src/storage.ts";
import { importAppState } from "../src/backup-import.ts";

const recipes = JSON.parse(await readFile(new URL("../src/data/planner-recipes.json", import.meta.url), "utf8"));
const oats = recipes.find(recipe => recipe.id === "catalog-r051");

test("the 299 covered recipes reproduce their published nutrition within its rounding precision", () => {
  let covered = 0;
  for (const recipe of recipes) {
    const result = recalculateCustomNutrition(recipe.id, recipe.ingredients);
    if (!result) continue;
    covered += 1;
    for (const field of ["calories", "protein", "fiber"]) {
      assert.ok(Math.abs(result[field] - recipe.nutrition[field]) <= (field === "calories" ? 1 : 0.100001), `${recipe.id}.${field}`);
    }
  }
  assert.equal(covered, 299);
});

test("changing only the oats updates the estimates using the reviewed food composition", async () => {
  const foods = JSON.parse(await readFile(new URL("../research/ciqual-2025-core.json", import.meta.url), "utf8"));
  const food = foods.foods.find(item => item.code === "32140").nutrients_per_100g;
  const result = recalculateCustomNutrition(oats.id, oats.ingredients.map((item, index) => index === 0 ? { ...item, quantity: item.quantity + 10 } : item));
  const original = recalculateCustomNutrition(oats.id, oats.ingredients);
  assert.ok(Math.abs(result.calories - original.calories - food.energy_kcal.value / 10) <= 1);
  assert.ok(Math.abs(result.protein - original.protein - food.protein_g.value / 10) <= 0.1);
  assert.ok(Math.abs(result.fiber - original.fiber - food.fiber_g.value / 10) <= 0.1);
});

test("removing an ingredient and scaling portions both change the nutrition without modifying the source", () => {
  const original = structuredClone(oats);
  const fewer = recalculateCustomNutrition(oats.id, oats.ingredients.slice(1));
  const doubled = recalculateCustomNutrition(oats.id, oats.ingredients.map(item => ({ ...item, quantity: item.quantity * 2 })));
  assert.ok(fewer.calories < oats.nutrition.calories);
  assert.ok(Math.abs(doubled.calories - oats.nutrition.calories * 2) <= 1);
  assert.deepEqual(oats, original);
});

test("personal copies retain their source across successive personal versions", () => {
  for (const id of ["perso-catalog-r051-abc", "perso-perso-catalog-r051-abc-def"]) {
    assert.deepEqual(recalculateCustomNutrition(id, oats.ingredients), recalculateCustomNutrition(oats.id, oats.ingredients));
  }
});

test("unknown sources, ingredients, units and optional changes never produce invented totals", () => {
  for (const id of ["perso-imported", "catalog-r002", "catalog-r999", "__proto__", "catalog-r0510"]) assert.equal(recalculateCustomNutrition(id, oats.ingredients), null);
  const first = oats.ingredients[0];
  for (const changed of [{ id: "unknown" }, { unit: "piece" }, { optional: true }, { quantity: NaN }, { quantity: Infinity }, { quantity: -1 }, { quantity: 0 }]) {
    assert.equal(recalculateCustomNutrition(oats.id, [{ ...first, ...changed }, ...oats.ingredients.slice(1)]), null);
  }
  assert.equal(recalculateCustomNutrition(oats.id, []), null);
  assert.equal(recalculateCustomNutrition(oats.id, [...oats.ingredients, first]), null);
});

test("nutrition provenance survives normalization, backup and restore without changing old recipes", async () => {
  const personal = { ...oats, id: "perso-catalog-r051-backup", nutritionRecalculated: true };
  assert.equal(normalizeCustomRecipe(personal).nutritionRecalculated, true);
  const legacy = { ...personal };
  delete legacy.nutritionRecalculated;
  assert.equal(Object.hasOwn(normalizeCustomRecipe(legacy), "nutritionRecalculated"), false);
  const state = migrateAppState({ version: 3, customRecipes: [personal], recipeNotes: { [personal.id]: "Ma note" }, favoriteRecipeIds: [personal.id] });
  const restored = await importAppState(await exportAppState(state));
  assert.equal(restored.customRecipes[0].nutritionRecalculated, true);
  assert.deepEqual(restored.customRecipes[0].nutrition, personal.nutrition);
  assert.equal(restored.recipeNotes[personal.id], "Ma note");
  assert.deepEqual(restored.favoriteRecipeIds, [personal.id]);
});
