import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const sourceUrl = new URL("../src/catalog.ts", import.meta.url);
const prototypeUrl = new URL("../src/Prototype.tsx", import.meta.url);

const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
const catalogueSource = await readFile(sourceUrl, "utf8");
const prototypeSource = await readFile(prototypeUrl, "utf8");

test("the imported catalogue is versioned, complete and internally consistent", () => {
  assert.equal(catalogue.meta.schema_version, "2.0.0");
  assert.ok(catalogue.recipes.length >= 50);
  assert.equal(catalogue.meta.nombre_recettes, catalogue.recipes.length);
  assert.equal(new Set(catalogue.recipes.map((recipe) => recipe.id)).size, catalogue.recipes.length);
  assert.equal(new Set(catalogue.recipes.map((recipe) => recipe.slug)).size, catalogue.recipes.length);

  for (const recipe of catalogue.recipes) {
    assert.equal(
      recipe.temps.total,
      recipe.temps.preparation + recipe.temps.cuisson + recipe.temps.repos,
      `${recipe.id}: inconsistent total time`,
    );
    assert.ok(recipe.ingredients.length > 0, `${recipe.id}: ingredients missing`);
    assert.ok(recipe.etapes.length > 0, `${recipe.id}: instructions missing`);
    assert.ok(recipe.nutrition_par_portion.calories >= 0, `${recipe.id}: invalid calories`);
  }
});

test("every recipe carries its editorial review in the JSON source", () => {
  for (const recipe of catalogue.recipes) {
    assert.match(recipe.app.review.status, /^(validated|caution)$/);
    assert.ok(recipe.app.review.summary.length > 0, `${recipe.id}: review missing`);
    if (recipe.app.review.status === "caution") {
      assert.ok(recipe.app.review.caution?.length > 0, `${recipe.id}: caution missing`);
    }
  }
  assert.doesNotMatch(catalogueSource, /CATALOGUE_REVIEWS/);
  assert.match(catalogueSource, /return recipe\.app\.review/);
});

test("material duplicates are explicitly excluded from integration", () => {
  const expectedDuplicates = ["r001", "r009", "r017", "r018", "r019", "r039"];
  for (const id of expectedDuplicates) {
    assert.ok(catalogue.recipes.find((recipe) => recipe.id === id)?.app.duplicate_of, `${id}: duplicate marker missing`);
  }
  assert.equal(catalogue.recipes.filter((recipe) => recipe.app.duplicate_of).length, 6);
  assert.match(catalogueSource, /!recipe\.app\.duplicate_of/);
});

test("higher-risk culinary entries retain visible cautions", () => {
  for (const id of ["r004", "r006", "r011", "r023", "r032", "r036", "r040", "r042"]) {
    const recipe = catalogue.recipes.find((item) => item.id === id);
    assert.equal(recipe?.app.review.status, "caution");
    assert.ok(recipe?.app.review.caution?.length > 0);
  }
  assert.match(prototypeSource, /catalogueReview\?\.caution/);
  assert.match(prototypeSource, /review\.caution/);
});

test("planner metadata is explicit and no longer inferred from recipe prose", () => {
  for (const recipe of catalogue.recipes) {
    assert.equal(typeof recipe.app.planner.eligible, "boolean");
    assert.ok(recipe.app.planner.meal_types.length > 0);
    assert.ok(recipe.app.planner.diets.length > 0);
    assert.ok(recipe.app.planner.cost_per_portion_eur > 0);
    assert.ok(Array.isArray(recipe.app.planner.equipment));
    assert.ok(Array.isArray(recipe.app.planner.allergens));
    for (const ingredient of recipe.ingredients) {
      assert.ok(ingredient.categorie_courses);
      assert.ok(Array.isArray(ingredient.allergenes));
    }
  }
  assert.doesNotMatch(catalogueSource, /function (allergensFor|equipmentFor|mealTypesFor|dietFor|categoryForIngredient)/);
  assert.match(catalogueSource, /recipe\.app\.planner\.eligible/);
});

test("unverified mechanism claims are not rendered as clinical effects", () => {
  assert.doesNotMatch(prototypeSource, /item\.action/);
  assert.match(prototypeSource, /ne garantit pas un bénéfice clinique individuel/);
  assert.match(prototypeSource, /ne prouve pas qu'un ingrédient isolé/);
});
