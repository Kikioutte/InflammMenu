import { shoppingIdentityFor } from "../src/shopping.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesRecipeSearch } from "../src/recipe-search.ts";
import { normalizeCollections, normalizeManualItems, shoppingContext, catalogueShoppingRecipe, shoppingConflict } from "../src/personal-library.ts";
import { DEFAULT_APP_STATE, migrateAppState, exportAppState, importAppState, stampAppStateChanges, mergeAppStateReplicas } from "../src/storage.ts";
import { buildShoppingList } from "../src/engine.ts";
import { DEFAULT_PROFILE } from "../src/domain.ts";
import { RECIPES } from "../src/recipes.ts";
import { isRecipeReferenceId } from "../src/recipe-references.ts";
import { execFileSync } from "node:child_process";
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

test("compact reference registry matches every real recipe without loading the full catalogue", () => {
  execFileSync(process.execPath, [new URL("../scripts/generate-recipe-reference-ids.mjs", import.meta.url).pathname, "--check"]);
  for (const recipe of RECIPES) assert.equal(isRecipeReferenceId(recipe.id), true, recipe.id);
  for (const recipe of data.recipes) {
    assert.equal(isRecipeReferenceId(recipe.id), true, recipe.id);
    assert.equal(isRecipeReferenceId(`catalog-${recipe.id}`), true, recipe.id);
  }
  for (const id of ["not-a-recipe", "salade-thon-haricots-rouge", "catalog-r999999", "r999999", "catalog-r000711", "perso-", "perso-!", "perso-" + "a".repeat(156), null, 42]) {
    assert.equal(isRecipeReferenceId(id), false, String(id));
  }
  // The validator imports only its ID index; it neither imports nor fetches
  // recipes, catalogue loading, React or the application registry.
  const source = readFileSync(new URL("../src/recipe-references.ts", import.meta.url), "utf8");
  assert.equal((source.match(/^import /gm) ?? []).length, 1);
  assert.doesNotMatch(source, /from ["'].*(?:recipes\.ts|catalog\.ts|recipe-registry)|\bfetch\(/);
});

test("all 36 V1 recipes retain collections and shopping through session changes, backups and replica merges", () => {
  const base = RECIPES.filter((recipe) => !recipe.id.startsWith("catalog-"));
  assert.equal(base.length, 36);
  const initial = migrateAppState(DEFAULT_APP_STATE);
  const ids = base.map((recipe) => recipe.id);
  const state = stampAppStateChanges(initial, {
    ...initial,
    recipeCollections: [{ id: "collection-v1", name: "Mes recettes V1", recipeIds: ids }],
    shoppingRecipes: base.map((recipe) => ({ recipe, portions: 3 })),
  }, 100, "v1-tab");
  const restored = importAppState(exportAppState(state));
  const otherTab = stampAppStateChanges(initial, { ...initial, shoppingItems: [{ id: "article-other", name: "Papier cuisson", checked: false }] }, 101, "other-tab");
  for (const candidate of [state, restored, mergeAppStateReplicas(restored, otherTab), mergeAppStateReplicas(otherTab, restored)]) {
    assert.deepEqual(candidate.recipeCollections[0].recipeIds, ids);
    assert.deepEqual(candidate.shoppingRecipes.map((entry) => entry.recipe.id), ids);
    assert.equal(candidate.currentPlan, null);
    for (const [index, entry] of candidate.shoppingRecipes.entries()) {
      assert.equal(entry.portions, 3);
      assert.deepEqual(entry.recipe.ingredients, base[index].ingredients);
    }
  }
  const salad = base.find((recipe) => recipe.id === "salade-thon-haricots-rouges");
  const context = shoppingContext(null, RECIPES, [{ recipe: salad, portions: 3 }], DEFAULT_PROFILE);
  const shopping = buildShoppingList(context.plan, context.recipes);
  for (const ingredient of salad.ingredients.filter((item) => item.id === "tuna" || item.id === "kidney-bean")) {
    const item = shopping.find((entry) => entry.ingredientId === shoppingIdentityFor(ingredient.id).shoppingId);
    assert.ok(item, ingredient.name);
    assert.ok(item.amounts.some((amount) => amount.unit === ingredient.unit && amount.quantity === ingredient.quantity * 3), ingredient.name);
  }
});

test("deferred catalogue and personal references remain valid while invented IDs are rejected consistently", () => {
  const personal = { ...RECIPES[0], id: "perso-test.1_recipe" };
  const allowed = [RECIPES[0].id, "catalog-r711", "r711", personal.id];
  const unknown = ["never-existed", "catalog-r999999", "r999999"];
  const state = migrateAppState({
    ...DEFAULT_APP_STATE,
    customRecipes: [personal],
    recipeCollections: [{ id: "collection-references", name: "Références", recipeIds: [...allowed, ...unknown] }],
    shoppingRecipes: [...allowed, ...unknown].map((id) => ({ recipe: { ...RECIPES[0], id }, portions: 2 })),
  });
  const restored = importAppState(exportAppState(state));
  assert.deepEqual(restored.recipeCollections[0].recipeIds, allowed);
  assert.deepEqual(restored.shoppingRecipes.map((entry) => entry.recipe.id), allowed);
  // An independent shopping snapshot still works after its original personal
  // recipe has been deleted; clearing it would discard the user's purchases.
  assert.deepEqual(migrateAppState({ ...restored, customRecipes: [] }).shoppingRecipes.map((entry) => entry.recipe.id), allowed);
});
