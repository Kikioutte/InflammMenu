import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { packPlannerRecipeColumns, expandPlannerRecipeColumns } from "../src/planner-recipe-columns.ts";
import { validatePlannerRecipes } from "../src/catalog-validation.ts";

const read = async (name) => JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"));
const recipes = await read("planner-recipes");
const columns = await read("planner-recipes-columns");

test("the compact startup projection preserves every canonical recipe field and recipe order", () => {
  assert.deepEqual(columns, packPlannerRecipeColumns(recipes));
  assert.deepEqual(expandPlannerRecipeColumns(columns), recipes);
  assert.equal(JSON.stringify(expandPlannerRecipeColumns(columns)), JSON.stringify(recipes));
  assert.deepEqual(validatePlannerRecipes(expandPlannerRecipeColumns(columns)), recipes);
});

test("the actual planner source expands the compact projection before runtime validation", async () => {
  const { default: source } = await import("../src/planner-source.ts");
  const { IMPORTED_PLAN_RECIPES } = await import("../src/planner-catalog.ts");
  assert.deepEqual(source, recipes);
  assert.deepEqual(IMPORTED_PLAN_RECIPES, recipes);
});

test("every expanded image respects the deployment base without changing any recipe content", async () => {
  const { plannerRecipesForBase } = await import("../src/planner-source.ts");
  for (const base of ["/", "/InflammMenu/", "/preview/other/"]) {
    const expected = recipes.map((recipe) => ({ ...recipe, image: `${base}${recipe.image.slice(1)}` }));
    assert.deepEqual(plannerRecipesForBase(base), expected);
    assert.equal(JSON.stringify(plannerRecipesForBase(base)), JSON.stringify(expected));
  }
});

test("column transport preserves missing optional fields, empty arrays and falsy values", () => {
  const input = [{ id: "first", time: 0, optional: false, tags: [] }, { id: "second", restMinutes: 60, note: "" }];
  assert.deepEqual(expandPlannerRecipeColumns(packPlannerRecipeColumns(input)), input);
  assert.equal(Object.hasOwn(expandPlannerRecipeColumns(packPlannerRecipeColumns(input))[0], "restMinutes"), false);
});

test("the generator rejects explicit null instead of silently losing a field", () => {
  assert.throws(() => packPlannerRecipeColumns([{ id: "first", note: null }]), /null interdit/);
  assert.throws(() => packPlannerRecipeColumns([]), /vide/);
});

test("malformed column lengths cannot truncate or reorder the recipe registry", () => {
  for (const invalid of [null, [], {}, { id: [] }, { id: ["first"], title: [] }, { id: ["first"], title: "wrong" }]) {
    assert.throws(() => expandPlannerRecipeColumns(invalid), /planificateur/);
  }
});

test("column transport reduces actual gzip bytes without omitting any content", () => {
  const size = (value) => gzipSync(JSON.stringify(value), { level: 6 }).length;
  assert(size(columns) < size(recipes), "la projection compacte doit économiser du transfert réel");
});
