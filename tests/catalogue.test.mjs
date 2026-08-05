import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const sourceUrl = new URL("../src/catalog.ts", import.meta.url);
const prototypeUrl = new URL("../src/Prototype.tsx", import.meta.url);

const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
const catalogueSource = await readFile(sourceUrl, "utf8");
const prototypeSource = await readFile(prototypeUrl, "utf8");

test("the imported catalogue contains 42 complete and internally consistent recipes", () => {
  assert.equal(catalogue.recipes.length, 42);
  assert.equal(catalogue.meta.nombre_recettes, 42);
  assert.equal(new Set(catalogue.recipes.map((recipe) => recipe.id)).size, 42);
  assert.equal(new Set(catalogue.recipes.map((recipe) => recipe.slug)).size, 42);

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

test("every recipe has an explicit editorial review", () => {
  const reviewedIds = [...catalogueSource.matchAll(/^\s{2}(r\d{3}): \{/gm)].map((match) => match[1]);
  assert.equal(reviewedIds.length, 42);
  assert.deepEqual(new Set(reviewedIds), new Set(catalogue.recipes.map((recipe) => recipe.id)));
});

test("higher-risk culinary entries retain visible cautions", () => {
  for (const id of ["r004", "r006", "r011", "r023", "r032", "r036", "r040", "r042"]) {
    assert.match(catalogueSource, new RegExp(`${id}: \\{ status: "caution"`));
  }
  assert.match(prototypeSource, /catalogueReview\?\.caution/);
  assert.match(prototypeSource, /review\.caution/);
});

test("unverified mechanism claims are not rendered as clinical effects", () => {
  assert.doesNotMatch(prototypeSource, /item\.action/);
  assert.match(prototypeSource, /ne garantit pas un bénéfice clinique individuel/);
  assert.match(prototypeSource, /ne prouve pas qu'un ingrédient isolé/);
});

