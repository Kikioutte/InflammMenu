import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateCatalogue } from "../scripts/validate-catalogue.mjs";

const dataUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const sourceUrl = new URL("../src/catalog.ts", import.meta.url);
const plannerGeneratorUrl = new URL("../scripts/generate-planner-recipes.mjs", import.meta.url);
const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
const catalogueSource = await readFile(sourceUrl, "utf8");
const plannerGeneratorSource = await readFile(plannerGeneratorUrl, "utf8");

function clone(value) {
  return structuredClone(value);
}

function v21Fixture() {
  const recipe = clone(catalogue.recipes[0]);
  delete recipe.app.duplicate_of;
  recipe.app.planner.eligible = true;
  recipe.app.planner.active_minutes = recipe.temps.preparation;
  recipe.app.planner.equipment = ["hob", "oven", "microwave", "blender", "toaster", "steamer"];
  recipe.ingredients = recipe.ingredients.map((ingredient, index) => ({
    ...ingredient,
    id: `ingredient-${index + 1}`,
    quantite_normalisee: ingredient.quantite,
    unite_normalisee: "piece",
    facultatif: false,
  }));
  recipe.provenance = {
    type: "original",
    author: "InflammMenu",
    license: "CC BY-SA 4.0",
    created_at: "2026-08-05",
    reviewed_at: "2026-08-05",
    sources: [{
      kind: "nutrition",
      title: "Table Ciqual 2025",
      url: "https://ciqual.anses.fr/",
      version: "2025",
      accessed_at: "2026-08-05",
    }],
  };
  return {
    ...clone(catalogue),
    meta: { ...clone(catalogue.meta), schema_version: "2.1.0", nombre_recettes: 1 },
    recipes: [recipe],
  };
}

test("the validator remains backward-compatible with the published v2 catalogue", () => {
  const fixture = clone(catalogue);
  fixture.meta.schema_version = "2.0.0";
  const result = validateCatalogue(fixture);
  assert.equal(result.schemaVersion, "2.0.0");
  assert.equal(result.recipeCount, catalogue.recipes.length);
});

test("schema v2.1 accepts normalized ingredients, full equipment and provenance", () => {
  const fixture = v21Fixture();
  fixture.recipes[0].ingredients[0].pantry_staple = true;
  const result = validateCatalogue(fixture);
  assert.equal(result.schemaVersion, "2.1.0");
  assert.equal(result.recipeCount, 1);
});

test("pantry_staple rejects non-boolean values", () => {
  const fixture = v21Fixture();
  fixture.recipes[0].ingredients[0].pantry_staple = "yes";
  assert.throws(() => validateCatalogue(fixture), /pantry_staple doit être booléen/);
});

test("schema v2.1 rejects a partial normalized ingredient block", () => {
  const fixture = v21Fixture();
  delete fixture.recipes[0].ingredients[0].facultatif;
  assert.throws(() => validateCatalogue(fixture), /champs normalisés requis en v2\.1/);
});

test("schema v2.1 rejects active time beyond total recipe time", () => {
  const fixture = v21Fixture();
  fixture.recipes[0].app.planner.active_minutes = fixture.recipes[0].temps.total + 1;
  assert.throws(() => validateCatalogue(fixture), /temps actif supérieur au temps total/);
});

test("schema v2.1 rejects passive rest counted as active cooking time", () => {
  const fixture = v21Fixture();
  fixture.recipes[0].temps.repos = 60;
  fixture.recipes[0].temps.total = fixture.recipes[0].temps.preparation + fixture.recipes[0].temps.cuisson + 60;
  fixture.recipes[0].app.planner.active_minutes = fixture.recipes[0].temps.preparation + fixture.recipes[0].temps.cuisson + 1;
  assert.throws(() => validateCatalogue(fixture), /temps actif inclut du repos passif/);
});

test("the planner adapter prefers v2.1 canonical values with a v2 fallback", () => {
  assert.match(plannerGeneratorSource, /ingredient\.id \?\? `catalog-/);
  assert.match(plannerGeneratorSource, /ingredient\.quantite_normalisee !== undefined/);
  assert.match(plannerGeneratorSource, /active_minutes \?\? recipe\.temps\.preparation \+ recipe\.temps\.cuisson/);
  assert.match(plannerGeneratorSource, /pantry_staple === true/);
  assert.match(catalogueSource, /new URL\("\.\/data\/recettes-anti-inflammatoires\.json", import\.meta\.url\)/);
  assert.match(catalogueSource, /fetch\(catalogueUrl/);
});

test("demonstrably unrelated foods do not carry gluten or tree-nut allergens", () => {
  for (const recipe of catalogue.recipes) {
    for (const ingredient of recipe.ingredients) {
      if (ingredient.nom === "sirop d'érable") assert.ok(!ingredient.allergenes.includes("gluten"), recipe.id);
      if (ingredient.nom.toLocaleLowerCase("fr").includes("champignon")) {
        assert.ok(!ingredient.allergenes.includes("fruits-a-coque"), recipe.id);
      }
    }
  }
  const walnuts = catalogue.recipes[0].ingredients.find((ingredient) => ingredient.nom === "noix de Grenoble concassées");
  assert.deepEqual(walnuts?.allergenes, ["fruits-a-coque"]);
});
