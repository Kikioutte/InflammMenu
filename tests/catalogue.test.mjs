import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const sourceUrl = new URL("../src/catalog.ts", import.meta.url);
const plannerUrl = new URL("../src/data/planner-recipes.json", import.meta.url);
const plannerGeneratorUrl = new URL("../scripts/generate-planner-recipes.mjs", import.meta.url);
const prototypeUrl = new URL("../src/Prototype.tsx", import.meta.url);

const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
const catalogueSource = await readFile(sourceUrl, "utf8");
const plannerRecipes = JSON.parse(await readFile(plannerUrl, "utf8"));
const plannerGeneratorSource = await readFile(plannerGeneratorUrl, "utf8");
const prototypeSource = await readFile(prototypeUrl, "utf8");

test("the imported catalogue is versioned, complete and internally consistent", () => {
  assert.equal(
    catalogue.meta.schema_version,
    catalogue.recipes.length > 50 ? "2.1.0" : "2.0.0",
    "la fusion complète doit activer le schéma strict v2.1",
  );
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

test("planner recipes use the editorial description rather than the internal review summary", () => {
  for (const plannerRecipe of plannerRecipes) {
    const sourceRecipe = catalogue.recipes.find((recipe) => `catalog-${recipe.id}` === plannerRecipe.id);
    assert.equal(plannerRecipe.description, sourceRecipe?.description, `${plannerRecipe.id}: mauvaise description`);
    assert.notEqual(plannerRecipe.description, sourceRecipe?.app.review.summary, `${plannerRecipe.id}: résumé interne exposé`);
  }
  assert.match(plannerGeneratorSource, /description:\s*recipe\.description/);
});

test("material duplicates are explicitly excluded from integration", () => {
  const expectedDuplicates = ["r001", "r009", "r017", "r018", "r019", "r039"];
  for (const id of expectedDuplicates) {
    assert.ok(catalogue.recipes.find((recipe) => recipe.id === id)?.app.duplicate_of, `${id}: duplicate marker missing`);
  }
  assert.equal(catalogue.recipes.filter((recipe) => recipe.app.duplicate_of).length, 6);
  assert.match(catalogueSource, /DUPLICATE_CATALOGUE_RECIPES/);
  for (const id of expectedDuplicates) assert.equal(plannerRecipes.some((recipe) => recipe.id === `catalog-${id}`), false);
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
  assert.doesNotMatch(plannerGeneratorSource, /function (allergensFor|equipmentFor|mealTypesFor|dietFor|categoryForIngredient)/);
  assert.match(plannerGeneratorSource, /recipe\.app\.planner\.eligible/);
});

test("passive infusion and fermentation are excluded from active kitchen time", () => {
  const infusion = catalogue.recipes.find((recipe) => recipe.id === "r005");
  const fermentation = catalogue.recipes.find((recipe) => recipe.id === "r023");

  assert.deepEqual(
    { active: infusion?.app.planner.active_minutes, rest: infusion?.temps.repos, total: infusion?.temps.total },
    { active: 5, rest: 480, total: 485 },
  );
  assert.deepEqual(
    { active: fermentation?.app.planner.active_minutes, rest: fermentation?.temps.repos, total: fermentation?.temps.total },
    { active: 30, rest: 10_080, total: 10_110 },
  );
});

test("unverified mechanism claims are not rendered as clinical effects", () => {
  assert.doesNotMatch(prototypeSource, /item\.action/);
  assert.match(prototypeSource, /ne garantit pas un bénéfice clinique individuel/);
  assert.match(prototypeSource, /ne prouve pas qu'un ingrédient isolé/);
});

test("les identifiants de favoris du catalogue correspondent à la projection du planificateur", async () => {
  const { catalogueFavoriteId, catalogueRecipeIdOf } = await import("../src/catalog.ts");
  const planner = JSON.parse(await readFile(new URL("../src/data/planner-recipes.json", import.meta.url), "utf8"));
  const catalogue = JSON.parse(await readFile(new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url), "utf8"));
  const eligible = catalogue.recipes.filter((recipe) => !recipe.app.duplicate_of && recipe.app.planner.eligible);
  const plannerIds = new Set(planner.map((recipe) => recipe.id));

  assert.equal(catalogueFavoriteId("r002"), "catalog-r002");
  assert.equal(catalogueFavoriteId({ id: "r002" }), "catalog-r002");
  assert.equal(catalogueFavoriteId("catalog-r002"), "catalog-r002", "l'identifiant reste stable");
  assert.equal(catalogueRecipeIdOf("catalog-r002"), "r002");
  assert.equal(catalogueRecipeIdOf("r002"), "r002");

  for (const recipe of eligible) {
    assert.ok(plannerIds.has(catalogueFavoriteId(recipe)), `${recipe.id} doit exister dans la projection`);
  }

  const notEligible = catalogue.recipes.filter((recipe) => !recipe.app.duplicate_of && !recipe.app.planner.eligible);
  assert.ok(notEligible.length > 0);
  for (const recipe of notEligible) {
    assert.equal(plannerIds.has(catalogueFavoriteId(recipe)), false, `${recipe.id} reste hors du planificateur`);
  }
});

test("la disponibilité au planificateur est expliquée sans lever la barrière éditoriale", async () => {
  const { plannerAvailabilityFor } = await import("../src/catalog.ts");
  const catalogue = JSON.parse(await readFile(new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url), "utf8"));
  const counts = { plannable: 0, duplicate: 0, "side-dish": 0, editorial: 0 };

  for (const recipe of catalogue.recipes) {
    const availability = plannerAvailabilityFor(recipe);
    counts[availability.plannable ? "plannable" : availability.kind] += 1;
    assert.equal(availability.plannable, !recipe.app.duplicate_of && recipe.app.planner.eligible);
  }

  assert.equal(counts.plannable, 327, "les recettes planifiables restent inchangées");
  assert.equal(counts.duplicate, 6);
  assert.equal(counts["side-dish"] + counts.editorial, 217);
  assert.ok(counts.editorial > 0, "des exclusions éditoriales subsistent");

  const sodiumExcluded = catalogue.recipes.find((recipe) => recipe.id === "r084");
  assert.deepEqual(plannerAvailabilityFor(sodiumExcluded), { plannable: false, kind: "editorial" });
  const drink = catalogue.recipes.find((recipe) => recipe.categorie === "boisson" && !recipe.app.planner.eligible);
  assert.deepEqual(plannerAvailabilityFor(drink), { plannable: false, kind: "side-dish" });
});

test("un échec de chargement du catalogue n'est pas mémorisé", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const loader = source.slice(source.indexOf("export function loadCatalogue"));

  assert.match(loader, /\.catch\(/, "le rejet doit être attrapé");
  assert.match(loader, /cataloguePromise = null/, "la promesse échouée doit être oubliée pour permettre un réessai");
  assert.ok(
    loader.indexOf("cataloguePromise = null") < loader.indexOf("throw"),
    "la promesse est vidée avant de propager l'erreur",
  );
});

test("les filtres et le tri du catalogue portent sur les vraies données", async () => {
  const { filterCatalogueRecipes, EMPTY_CATALOGUE_FILTERS, catalogueActiveMinutes, visibleCatalogueRecipes } = await import("../src/catalog.ts");
  const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
  const visible = visibleCatalogueRecipes(catalogue);

  assert.equal(filterCatalogueRecipes(visible, EMPTY_CATALOGUE_FILTERS).length, 544, "sans filtre, tout le catalogue visible");

  const quick = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, maxActiveMinutes: 15 });
  assert.ok(quick.length > 0 && quick.length < visible.length);
  assert.ok(quick.every((recipe) => catalogueActiveMinutes(recipe) <= 15));

  const cheap = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, cost: "economique" });
  assert.ok(cheap.every((recipe) => recipe.cout === "economique"));

  const glutenFree = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, withoutAllergen: "gluten" });
  assert.ok(glutenFree.every((recipe) => !recipe.app.planner.allergens.includes("gluten")));

  const plannable = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, plannableOnly: true });
  assert.equal(plannable.length, 327, "le filtre planifiable respecte la relecture éditoriale");

  const winter = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, season: "hiver" });
  assert.ok(winter.every((recipe) => recipe.saisons.includes("hiver") || recipe.saisons.includes("toute-annee")));

  const byTime = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, sort: "time" });
  const times = byTime.map(catalogueActiveMinutes);
  assert.deepEqual(times, [...times].sort((a, b) => a - b), "le tri par temps est croissant");

  const searched = filterCatalogueRecipes(visible, EMPTY_CATALOGUE_FILTERS, "wakame");
  assert.equal(searched.length, 1);
  assert.equal(filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, cost: "eleve" }, "wakame").length <= 1, true);
});
