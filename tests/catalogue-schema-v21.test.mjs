import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectCatalogueSeasons } from "../scripts/catalogue-seasons.mjs";
import {
  CANONICAL_CATALOGUE_REGIMES,
  PULSE_INGREDIENT_IDS,
  normalizeCatalogueRecipeTaxonomy,
  weeklyTargetsForCatalogueRecipe,
} from "../scripts/catalogue-taxonomy.mjs";
import { validateCatalogue } from "../scripts/validate-catalogue.mjs";

const dataUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const sourceUrl = new URL("../src/catalog.ts", import.meta.url);
const plannerGeneratorUrl = new URL("../scripts/generate-planner-recipes.mjs", import.meta.url);
const plannerDataUrl = new URL("../src/data/planner-recipes.json", import.meta.url);
const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
const plannerRecipes = JSON.parse(await readFile(plannerDataUrl, "utf8"));
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
    facultatif: ingredient.facultatif ?? false,
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

test("explicitly optional catalogue ingredients are flagged and projected without false positives", () => {
  const expected = [
    "r001:catalog-sirop-d-erable",
    "r002:catalog-miel-de-thym-ou-sirop-d-agave",
    "r004:catalog-miel-brut",
    "r005:ginger",
    "r007:catalog-piment-de-cayenne",
    "r011:catalog-piment-vert",
    "r015:catalog-piment-oiseau",
    "r018:catalog-vin-blanc-sec",
    "r019:catalog-vin-blanc-sec",
    "r026:catalog-piment-de-cayenne",
    "r027:catalog-sirop-d-erable",
    "r032:catalog-cannelle-de-ceylan",
    "r032:catalog-gingembre-en-poudre",
    "r039:catalog-feta-ou-fromage-de-brebis",
    "r042:catalog-miel-brut",
    "r043:catalog-miel",
    "r043:catalog-feuilles-de-menthe-fraiche",
    "r045:walnut",
    "r048:coriandre-fraiche",
    "r049:catalog-piment-doux",
    "r050:catalog-sirop-d-erable",
  ];
  const actual = catalogue.recipes.flatMap((recipe) => recipe.ingredients
    .filter((ingredient) => ingredient.facultatif)
    .map((ingredient) => `${recipe.id}:${ingredient.id}`));
  assert.deepEqual(actual, expected);

  const projected = plannerRecipes.flatMap((recipe) => recipe.ingredients
    .filter((ingredient) => ingredient.optional)
    .map((ingredient) => `${recipe.id}:${ingredient.id}`));
  assert.deepEqual(projected, expected
    .filter((entry) => ["r002", "r007", "r011", "r015", "r043", "r045", "r048", "r049", "r050"].includes(entry.slice(0, 4)))
    .map((entry) => `catalog-${entry}`));

  const roastingOnly = catalogue.recipes.find((recipe) => recipe.id === "r031")
    ?.ingredients.find((ingredient) => ingredient.nom === "cerneaux de noix");
  assert.equal(roastingOnly?.facultatif, false, "« torréfiés si souhaité » ne rend pas les noix facultatives");
});

test("the validator rejects an explicit optional label without the matching flag", () => {
  const fixture = v21Fixture();
  fixture.recipes[0].ingredients[0].note = "Facultatif, selon le goût";
  fixture.recipes[0].ingredients[0].facultatif = false;
  assert.throws(() => validateCatalogue(fixture), /mention facultative incohérente/);
  fixture.recipes[0].ingredients[0].facultatif = true;
  assert.doesNotThrow(() => validateCatalogue(fixture));
});

test("a lactose-free recipe cannot require an ingredient that declares milk", () => {
  const fixture = v21Fixture();
  const recipe = fixture.recipes[0];
  recipe.regimes = ["sans-lactose"];
  recipe.ingredients = recipe.ingredients.map((ingredient) => ({
    ...ingredient,
    note: "",
    allergenes: [],
  }));
  recipe.ingredients[0].allergenes = ["lait"];
  recipe.ingredients[0].facultatif = false;
  recipe.app.planner.allergens = ["lait"];

  assert.throws(() => validateCatalogue(fixture), /r001: régime sans-lactose incompatible avec un ingrédient obligatoire contenant du lait/);

  recipe.ingredients[0].facultatif = true;
  assert.doesNotThrow(() => validateCatalogue(fixture), "un ingrédient laitier réellement facultatif peut être omis");
});

test("r169 no longer advertises a lactose-free version while yogurt is mandatory", () => {
  const recipe = catalogue.recipes.find((entry) => entry.id === "r169");
  assert.ok(recipe, "r169 absente du catalogue");
  assert.ok(
    recipe.ingredients.some((ingredient) => !ingredient.facultatif && ingredient.allergenes.includes("lait")),
    "le yaourt obligatoire de r169 doit rester explicitement déclaré comme lait",
  );
  assert.equal(recipe.regimes.includes("sans-lactose"), false);

  const optionalDairyRecipe = catalogue.recipes.find((entry) => entry.id === "r039");
  assert.ok(optionalDairyRecipe?.regimes.includes("sans-lactose"));
  const optionalDairyIngredients = optionalDairyRecipe.ingredients
    .filter((ingredient) => ingredient.allergenes.includes("lait"));
  assert.ok(optionalDairyIngredients.length > 0, "r039 doit toujours déclarer sa feta comme lait");
  assert.ok(
    optionalDairyIngredients.every((ingredient) => ingredient.facultatif),
    "r039 reste sans lactose uniquement parce que sa feta peut être omise",
  );
});

test("catalogue seasons use the five canonical taxonomy values", () => {
  const expected = ["automne", "ete", "hiver", "printemps", "toute-annee"];
  assert.deepEqual([...new Set(catalogue.recipes.flatMap((recipe) => recipe.saisons))].sort(), expected);
  assert.deepEqual([...catalogue.taxonomie_tags.saisons].sort(), expected);

  const fixture = v21Fixture();
  fixture.recipes[0].saisons = ["été"];
  assert.throws(() => validateCatalogue(fixture), /r001\.saisons: valeur inconnue été/);
  fixture.recipes[0].saisons = [];
  assert.throws(() => validateCatalogue(fixture), /r001: au moins une saison requise/);
  assert.throws(() => projectCatalogueSeasons(["été"], "r-test"), /r-test: saison inconnue été/);
  assert.deepEqual(projectCatalogueSeasons(["ete", "toute-annee", "ete"], "r-test"), ["summer", "all-year"]);
});

test("catalogue regimes, tags and weekly targets are closed and canonical", () => {
  assert.equal(PULSE_INGREDIENT_IDS.length, 45, "la liste éditoriale des légumineuses doit rester explicitement revue");
  assert.deepEqual(catalogue.taxonomie_tags.regimes, CANONICAL_CATALOGUE_REGIMES);

  for (const recipe of catalogue.recipes) {
    assert.equal(new Set(recipe.regimes).size, recipe.regimes.length, `${recipe.id}: régimes dupliqués`);
    assert.equal(new Set(recipe.tags).size, recipe.tags.length, `${recipe.id}: tags dupliqués`);
    assert.ok(recipe.tags.every((tag) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)), `${recipe.id}: tag non canonique`);
    assert.ok(!recipe.tags.includes("brouillon"), `${recipe.id}: marqueur brouillon publié`);
    assert.deepEqual(recipe.app.planner.targets, weeklyTargetsForCatalogueRecipe(recipe), `${recipe.id}: objectifs métier`);
  }

  for (const recipe of plannerRecipes) {
    assert.equal(new Set(recipe.tags).size, recipe.tags.length, `${recipe.id}: tags projetés dupliqués`);
  }

  assert.deepEqual(catalogue.recipes.find((recipe) => recipe.id === "r254")?.app.planner.targets, []);
  assert.deepEqual(catalogue.recipes.find((recipe) => recipe.id === "r392")?.app.planner.targets, ["seafood"]);
  assert.ok(catalogue.recipes.find((recipe) => recipe.id === "r007")?.app.planner.targets.includes("pulse"));
  assert.ok(catalogue.recipes.find((recipe) => recipe.id === "r355")?.app.planner.targets.includes("finfish"));
  assert.deepEqual(catalogue.recipes.find((recipe) => recipe.id === "r399")?.app.planner.targets, ["pulse", "seafood"]);

  for (const id of ["r048", "r201", "r231", "r257", "r269", "r272", "r287", "r313", "r327", "r341", "r420"]) {
    assert.ok(catalogue.recipes.find((recipe) => recipe.id === id)?.app.planner.targets.includes("pulse"), `${id}: portion substantielle de fèves ou d'edamame`);
  }

  const mismatched = v21Fixture();
  mismatched.recipes[0].app.planner.targets = ["finfish"];
  assert.throws(() => validateCatalogue(mismatched), /classification métier incohérente/);

  const draft = v21Fixture();
  draft.recipes[0].tags.push("brouillon");
  assert.throws(() => validateCatalogue(draft), /marqueur brouillon est interdit/);

  const invalidTag = v21Fixture();
  invalidTag.recipes[0].tags = [null];
  assert.throws(() => validateCatalogue(invalidTag), /chaîne non vide requise/);
  assert.throws(() => normalizeCatalogueRecipeTaxonomy(invalidTag.recipes[0]), /tag catalogue doit être une chaîne/);

  const spoofedStatus = v21Fixture();
  spoofedStatus.meta.status = "draft";
  spoofedStatus.recipes[0].regimes = ["volaille"];
  delete spoofedStatus.recipes[0].app.planner.targets;
  assert.throws(
    () => validateCatalogue(spoofedStatus),
    /valeur inconnue volaille/,
    "le contenu ne peut pas activer lui-même la taxonomie permissive",
  );

  const explicitLegacy = structuredClone(spoofedStatus);
  explicitLegacy.taxonomie_tags.regimes = [...explicitLegacy.taxonomie_tags.regimes, "volaille"];
  assert.doesNotThrow(() => validateCatalogue(explicitLegacy, { taxonomy: "legacy" }));
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
  assert.match(plannerGeneratorSource, /ingredient\.facultatif === true/);
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

test("r036 declares gluten while barley miso remains an allowed ingredient variant", () => {
  const recipe = catalogue.recipes.find((entry) => entry.id === "r036");
  assert.ok(recipe, "r036 absente du catalogue");
  const miso = recipe.ingredients.find((ingredient) => ingredient.id === "catalog-pate-de-miso-non-pasteurise");
  assert.ok(miso, "ingrédient miso absent de r036");
  assert.match(miso.note, /orge/i);
  assert.ok(miso.allergenes.includes("gluten"), "le miso d’orge doit déclarer le gluten");
  assert.ok(recipe.app.planner.allergens.includes("gluten"), "le filtre planificateur doit déclarer le gluten");
});
