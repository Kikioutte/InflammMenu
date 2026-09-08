import { shoppingIdentityFor } from "../src/shopping.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesRecipeSearch } from "../src/recipe-search.ts";
import { normalizeCollections, normalizeManualItems, shoppingContext, catalogueShoppingRecipe, shoppingConflict } from "../src/personal-library.ts";
import { DEFAULT_APP_STATE, migrateAppState, exportAppState, importAppState, stampAppStateChanges, mergeAppStateReplicas } from "../src/storage.ts";
import { buildShoppingList } from "../src/engine.ts";
import { DEFAULT_PROFILE } from "../src/domain.ts";
const data = JSON.parse(readFileSync(new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url)));
const source = data.recipes.find((r) => r.id === "r711");
const recipe = catalogueShoppingRecipe(source, "/assets/recipe-placeholder.svg");

test("search tolerates one typo, accents, transpositions and reordered words, never unrelated short words", () => {
  assert.ok(matchesRecipeSearch("Courgette à la crème de pois chiches", "courgete"));
  assert.ok(matchesRecipeSearch("Courgette", "courgte te") === false);
  assert.ok(matchesRecipeSearch("Courgette", "courgetet"));
  assert.ok(matchesRecipeSearch("Œuf, courgette et riz complet", "complet oeuf"));
  assert.equal(matchesRecipeSearch("riz au lait", "riz sans lait"), false);
  assert.equal(matchesRecipeSearch("maïs", "lait"), false);
  assert.equal(matchesRecipeSearch("courgette", "zzzzzzzzz"), false);
});

test("standalone shopping uses exact quantities, merges with week, and never changes the plan", () => {
  const extras = [{ recipe, portions: 3 }];
  const solo = shoppingContext(null, [], extras, DEFAULT_PROFILE);
  const before = JSON.stringify(solo.plan);
  const items = buildShoppingList(solo.plan, solo.recipes);
  const ingredient = recipe.ingredients.find((i) => i.name.toLowerCase().includes("cabillaud"));
  assert.equal(items.find((i) => i.ingredientId === shoppingIdentityFor(ingredient.id).shoppingId).amounts[0].quantity, ingredient.quantity * 3);
  const combined = shoppingContext(solo.plan, solo.recipes, [{ recipe, portions: 2 }], DEFAULT_PROFILE);
  assert.equal(buildShoppingList(combined.plan, combined.recipes).find((i) => i.ingredientId === shoppingIdentityFor(ingredient.id).shoppingId).amounts[0].quantity, ingredient.quantity * 5);
  assert.equal(JSON.stringify(solo.plan), before);
  assert.equal(shoppingConflict(recipe, { ...DEFAULT_PROFILE, allergies: ["poisson"] }), true);
});

test("new collections and shopping data survive export and reject malformed entries", () => {
  const state = migrateAppState({ ...DEFAULT_APP_STATE, shoppingRecipes: [{ recipe, portions: 3 }], shoppingItems: [{ id: "article-test", name: "Papier cuisson", checked: true }], recipeCollections: [{ id: "collection-test", name: "À essayer", recipeIds: ["catalog-r711", "catalog-r711"] }], extraShoppingCheckedIds: ["cabillaud"] });
  const restored = importAppState(exportAppState(state));
  assert.equal(restored.currentPlan, null);
  assert.equal(restored.shoppingRecipes[0].portions, 3);
  assert.deepEqual(restored.shoppingRecipes[0].recipe.ingredients, state.shoppingRecipes[0].recipe.ingredients);
  assert.equal(restored.shoppingItems[0].checked, true);
  assert.deepEqual(restored.recipeCollections[0].recipeIds, ["catalog-r711"]);
  assert.deepEqual(normalizeCollections([{ id: "bad", name: "x" }, null]), []);
  assert.deepEqual(normalizeManualItems([{ id: "article-bad", name: {} }, null]), []);
  assert.deepEqual(migrateAppState({ ...DEFAULT_APP_STATE, shoppingRecipes: [{ recipe, portions: Infinity }] }).shoppingRecipes, []);
});

test("old backups initialize additions without changing existing preferences", () => {
  const old = { ...DEFAULT_APP_STATE, favoriteRecipeIds: ["catalog-r711"] };
  for (const key of ["shoppingRecipes", "shoppingItems", "recipeCollections", "extraShoppingCheckedIds"]) delete old[key];
  const migrated = migrateAppState(old);
  assert.deepEqual(migrated.favoriteRecipeIds, ["catalog-r711"]);
  assert.deepEqual(migrated.recipeCollections, []);
  assert.deepEqual(migrated.shoppingRecipes, []);
});

test("different tabs preserve a collection change and a shopping change together", () => {
  const base = migrateAppState(DEFAULT_APP_STATE);
  const left = stampAppStateChanges(base, { ...base, recipeCollections: [{ id: "collection-one", name: "À essayer", recipeIds: ["catalog-r711"] }] }, 10, "left");
  const right = stampAppStateChanges(base, { ...base, shoppingItems: [{ id: "article-one", name: "Papier cuisson", checked: false }] }, 11, "right");
  const merged = mergeAppStateReplicas(left, right);
  assert.equal(merged.recipeCollections.length, 1);
  assert.equal(merged.shoppingItems.length, 1);
  assert.deepEqual(mergeAppStateReplicas(right, left).recipeCollections, merged.recipeCollections);
});
