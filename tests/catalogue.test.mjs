import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const sourceUrl = new URL("../src/catalog.ts", import.meta.url);
const plannerUrl = new URL("../src/data/planner-recipes.json", import.meta.url);
const plannerCautionsUrl = new URL("../public/data/planner-cautions.json", import.meta.url);
const plannerCatalogUrl = new URL("../src/planner-catalog.ts", import.meta.url);
const plannerGeneratorUrl = new URL("../scripts/generate-planner-recipes.mjs", import.meta.url);
const recipeViewUrl = new URL("../src/screens/RecipeView.tsx", import.meta.url);
const catalogueRecipeViewUrl = new URL("../src/screens/CatalogueRecipeView.tsx", import.meta.url);

const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
const catalogueSource = await readFile(sourceUrl, "utf8");
const plannerRecipes = JSON.parse(await readFile(plannerUrl, "utf8"));
const plannerCautions = JSON.parse(await readFile(plannerCautionsUrl, "utf8"));
const plannerGeneratorSource = await readFile(plannerGeneratorUrl, "utf8");
const recipeViewSource = await readFile(recipeViewUrl, "utf8");
const catalogueRecipeViewSource = await readFile(catalogueRecipeViewUrl, "utf8");

let freshImportId = 0;

function importFreshCatalogueModule(label) {
  const url = new URL(sourceUrl);
  url.searchParams.set("test", `${label}-${freshImportId += 1}`);
  return import(url.href);
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}

function replaceGlobal(t, name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  });
}

function singleRecipeCatalogue(recipe) {
  return {
    ...catalogue,
    meta: { ...catalogue.meta, nombre_recettes: 1 },
    recipes: [recipe],
  };
}

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

test("la frontière runtime accepte le vrai catalogue et rejette les payloads incomplets", async () => {
  const { validateCatalogueData, validatePlannerCautions } = await import("../src/catalog-validation.ts");

  assert.equal(validateCatalogueData(catalogue).recipes.length, 1257);
  assert.throws(() => validateCatalogueData({ recipes: [{}] }), /Catalogue invalide/);
  assert.throws(
    () => validateCatalogueData({ ...catalogue, meta: { ...catalogue.meta, nombre_recettes: 0 }, categories: [], recipes: [] }),
    /tableau non vide requis/,
    "un payload vide ne constitue jamais le catalogue complet attendu par l’application",
  );
  assert.throws(
    () => validateCatalogueData(singleRecipeCatalogue(catalogue.recipes[0])),
    /1257 recettes attendues, 1 reçues/,
    "un catalogue tronqué mais auto-cohérent ne doit pas remplacer l’édition complète",
  );
  assert.throws(
    () => validateCatalogueData(singleRecipeCatalogue({}), { expectedRecipeCount: 1 }),
    /Catalogue invalide \(recipes\[0\]\.id/,
    "un objet recette vide ne doit pas franchir une enveloppe pourtant valide",
  );

  const recipeWithoutAllergens = structuredClone(catalogue.recipes[0]);
  delete recipeWithoutAllergens.app.planner.allergens;
  assert.throws(
    () => validateCatalogueData(singleRecipeCatalogue(recipeWithoutAllergens), { expectedRecipeCount: 1 }),
    /app\.planner\.allergens/,
    "un champ critique imbriqué ne doit pas être couvert par le cast TypeScript",
  );

  const v20Recipe = structuredClone(catalogue.recipes[0]);
  delete v20Recipe.provenance;
  delete v20Recipe.app.planner.targets;
  delete v20Recipe.app.planner.active_minutes;
  for (const ingredient of v20Recipe.ingredients) {
    delete ingredient.id;
    delete ingredient.quantite_normalisee;
    delete ingredient.unite_normalisee;
    delete ingredient.facultatif;
  }
  const v20Catalogue = singleRecipeCatalogue(v20Recipe);
  v20Catalogue.meta.schema_version = "2.0.0";
  assert.doesNotThrow(() => validateCatalogueData(v20Catalogue, { expectedRecipeCount: 1 }), "les ajouts v2.1 restent optionnels en v2.0");
  v20Recipe.ingredients[0].id = "oats";
  assert.throws(
    () => validateCatalogueData(v20Catalogue, { expectedRecipeCount: 1 }),
    /quantite_normalisee/,
    "un bloc de normalisation v2.0 doit être absent ou complet",
  );

  assert.equal(validatePlannerCautions(plannerCautions)["catalog-r002"], plannerCautions["catalog-r002"]);
  assert.throws(() => validatePlannerCautions([]), /Précautions invalides/);
  assert.throws(
    () => validatePlannerCautions({ "catalog-r002": "valide", "catalog-r006": 42 }),
    /Précautions invalides/,
    "une entrée valide ne doit pas masquer une autre entrée invalide",
  );
  assert.throws(() => validatePlannerCautions({}), /672 entrées attendues, 0 reçues/);

  const glutenRecipe = structuredClone(catalogue.recipes.find(({ id }) => id === "r036"));
  glutenRecipe.app.planner.allergens = [];
  assert.throws(
    () => validateCatalogueData(singleRecipeCatalogue(glutenRecipe), { expectedRecipeCount: 1 }),
    /allergens: incohérents avec les ingrédients/,
    "les allergènes du planificateur ne peuvent pas être falsifiés indépendamment des ingrédients",
  );
  const unknownAllergenRecipe = structuredClone(catalogue.recipes[0]);
  unknownAllergenRecipe.ingredients[0].allergenes = ["allergene-invente"];
  unknownAllergenRecipe.app.planner.allergens = ["allergene-invente"];
  assert.throws(
    () => validateCatalogueData(singleRecipeCatalogue(unknownAllergenRecipe), { expectedRecipeCount: 1 }),
    /valeur inconnue allergene-invente/,
  );
});

test("la projection JSON du planificateur franchit elle aussi une frontière runtime", async () => {
  const { validatePlannerRecipes } = await import("../src/catalog-validation.ts");
  const validated = validatePlannerRecipes(plannerRecipes);
  assert.equal(validated.length, plannerRecipes.length);

  const wrongCautionIds = { ...plannerCautions };
  const [removedId] = Object.keys(wrongCautionIds);
  delete wrongCautionIds[removedId];
  wrongCautionIds["catalog-id-invente"] = "Texte non vide mais rattaché à une recette inconnue.";
  const { validatePlannerCautions } = await import("../src/catalog-validation.ts");
  assert.throws(
    () => validatePlannerCautions(wrongCautionIds),
    /identifiants incohérents/,
    "le bon nombre de précautions ne peut pas masquer un dictionnaire incomplet ou falsifié",
  );

  const mismatched = structuredClone(plannerRecipes);
  mismatched[0].allergens = [];
  assert.throws(() => validatePlannerRecipes(mismatched), /allergens: incohérents avec les ingrédients/);
  assert.throws(() => validatePlannerRecipes([]), /tableau non vide requis/);

  const source = await readFile(plannerCatalogUrl, "utf8");
  assert.doesNotMatch(source, /as unknown as readonly Recipe\[\]/);
  assert.match(source, /validatePlannerRecipes/);
  const { IMPORTED_PLAN_RECIPES } = await import(plannerCatalogUrl.href);
  assert.equal(IMPORTED_PLAN_RECIPES.length, plannerRecipes.length);
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
  assert.match(recipeViewSource, /catalogueReview\?\.caution/);
  assert.match(catalogueRecipeViewSource, /review\.caution/);
});

test("planner metadata is explicit and no longer inferred from recipe prose", () => {
  for (const recipe of catalogue.recipes) {
    assert.equal(typeof recipe.app.planner.eligible, "boolean");
    assert.ok(recipe.app.planner.meal_types.length > 0);
    assert.ok(recipe.app.planner.diets.length > 0);
    assert.ok(recipe.app.planner.cost_per_portion_eur > 0);
    assert.ok(Array.isArray(recipe.app.planner.equipment));
    assert.ok(Array.isArray(recipe.app.planner.allergens));
    assert.ok(Array.isArray(recipe.app.planner.targets));
    for (const ingredient of recipe.ingredients) {
      assert.ok(ingredient.categorie_courses);
      assert.ok(Array.isArray(ingredient.allergenes));
    }
  }
  assert.doesNotMatch(plannerGeneratorSource, /function (allergensFor|equipmentFor|mealTypesFor|dietFor|categoryForIngredient)/);
  assert.match(plannerGeneratorSource, /recipe\.app\.planner\.eligible/);
});

test("r036 is rejected for gluten across catalogue, planner and replay boundaries", async () => {
  const engine = await import("../src/engine.ts");
  const { DEFAULT_PROFILE } = await import("../src/domain.ts");
  const { filterCatalogueRecipes, EMPTY_CATALOGUE_FILTERS, visibleCatalogueRecipes } = await import("../src/catalog.ts");
  const sourceRecipe = catalogue.recipes.find((recipe) => recipe.id === "r036");
  const plannerRecipe = plannerRecipes.find((recipe) => recipe.id === "catalog-r036");
  assert.ok(sourceRecipe, "r036 absente du catalogue source");
  assert.ok(plannerRecipe, "r036 absente de la projection planificateur");

  const glutenProfile = { ...DEFAULT_PROFILE, allergies: ["gluten"] };
  assert.equal(engine.recipeIsAllowed(plannerRecipe, glutenProfile), false, "le moteur doit exclure r036");

  const glutenFree = filterCatalogueRecipes(visibleCatalogueRecipes(catalogue), {
    ...EMPTY_CATALOGUE_FILTERS,
    withoutAllergen: "gluten",
  });
  assert.equal(glutenFree.some((recipe) => recipe.id === "r036"), false, "le filtre sans gluten doit exclure r036");

  const archivedMeal = {
    id: "day-0-dinner",
    dayIndex: 0,
    mealType: "dinner",
    recipeId: plannerRecipe.id,
    portions: 2,
    source: "generated",
    locked: false,
    completed: false,
    substitutions: [],
  };
  const archivedPlan = {
    id: "week-r036-regression",
    startsOn: "2026-08-24",
    generatedAt: "2026-08-24T00:00:00.000Z",
    profileSnapshot: { ...DEFAULT_PROFILE, allergies: [] },
    meals: [archivedMeal],
    estimatedCost: plannerRecipe.costPerPortion * 2,
    version: 1,
  };
  const replay = engine.inspectPlanReplay(archivedPlan, plannerRecipes, glutenProfile);
  assert.equal(replay.canReplay, false);
  assert.deepEqual(replay.blockedMeals.map((meal) => meal.recipeId), [plannerRecipe.id]);
  assert.ok(engine.plannedMealAllergens(plannerRecipe, archivedMeal).includes("gluten"), "les substitutions ne doivent pas masquer le gluten déclaré");
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
  assert.doesNotMatch(catalogueRecipeViewSource, /item\.action/);
  assert.match(catalogueRecipeViewSource, /ne garantit pas un bénéfice clinique individuel/);
  assert.match(catalogueRecipeViewSource, /ne prouve pas qu'un ingrédient isolé/);
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

  assert.equal(counts.plannable, 689, "les nouvelles recettes relues rejoignent le planificateur");
  assert.equal(counts.duplicate, 6);
  assert.equal(counts["side-dish"] + counts.editorial, 562);
  assert.ok(counts.editorial > 0, "des exclusions éditoriales subsistent");

  const sodiumExcluded = catalogue.recipes.find((recipe) => recipe.id === "r084");
  assert.deepEqual(plannerAvailabilityFor(sodiumExcluded), { plannable: false, kind: "editorial" });
  const drink = catalogue.recipes.find((recipe) => recipe.categorie === "boisson" && !recipe.app.planner.eligible);
  assert.deepEqual(plannerAvailabilityFor(drink), { plannable: false, kind: "side-dish" });
});

test("un catalogue invalide n'est pas mémorisé et le chargement peut être réessayé", { concurrency: false }, async (t) => {
  const invalid = singleRecipeCatalogue({});
  let fetchCount = 0;
  replaceGlobal(t, "fetch", async () => jsonResponse(fetchCount++ === 0 ? invalid : catalogue));
  const { loadCatalogue } = await importFreshCatalogueModule("load-retry");

  await assert.rejects(loadCatalogue(), /Catalogue invalide/);
  const recovered = await loadCatalogue();

  assert.equal(fetchCount, 2, "le second appel doit réellement relancer fetch");
  assert.equal(recovered.recipes.length, 1257);
});

test("un HTTP 200 corrompu se replie sur la dernière copie hors ligne validée", { concurrency: false }, async (t) => {
  let cacheName = "";
  let cacheDeletes = 0;
  replaceGlobal(t, "fetch", async () => jsonResponse(singleRecipeCatalogue({})));
  replaceGlobal(t, "caches", {
    open: async (name) => {
      cacheName = name;
      return {
        match: async () => jsonResponse(catalogue),
        keys: async () => [],
        delete: async () => { cacheDeletes += 1; return true; },
      };
    },
  });
  const { CATALOGUE_CACHE_NAME, loadCatalogue } = await importFreshCatalogueModule("invalid-network-cache-fallback");

  const recovered = await loadCatalogue();
  assert.equal(recovered.recipes.length, 1257);
  assert.equal(cacheName, CATALOGUE_CACHE_NAME);
  assert.equal(CATALOGUE_CACHE_NAME, "inflamm-menu-catalogue-v2");
  assert.equal(cacheDeletes, 0, "la copie validée ne doit pas être supprimée à cause du réseau corrompu");
});

test("un ancien payload corrompu n'est jamais annoncé comme catalogue hors ligne vérifié", { concurrency: false }, async (t) => {
  let entryDeletes = 0;
  let legacyCacheDeletes = 0;
  replaceGlobal(t, "caches", {
    open: async (name) => name === "inflamm-menu-catalogue-v2"
      ? {
          match: async () => jsonResponse(singleRecipeCatalogue({})),
          keys: async () => [],
          delete: async () => { entryDeletes += 1; return true; },
        }
      : { match: async () => null, keys: async () => [], delete: async () => true },
    delete: async (name) => {
      if (name === "inflamm-menu-catalogue-v1") legacyCacheDeletes += 1;
      return true;
    },
  });
  const { catalogueAvailableOffline } = await importFreshCatalogueModule("invalid-offline-status");

  assert.equal(await catalogueAvailableOffline(), false);
  assert.equal(entryDeletes, 0, "une édition inconnue n'est jamais exposée, mais reste disponible pour un onglet compatible");
  assert.equal(legacyCacheDeletes, 0, "aucun nettoyage avant l'enregistrement réussi d'une copie validée");
});

test("un catalogue v1 valide est vérifié puis migré sans perdre le hors-ligne", { concurrency: false }, async (t) => {
  replaceGlobal(t, "navigator", { locks: { request: async (_name, operation) => operation() } });
  let currentResponse = null;
  let legacyResponse = jsonResponse(catalogue);
  const deletedCaches = [];
  replaceGlobal(t, "fetch", async () => { throw new Error("réseau indisponible"); });
  replaceGlobal(t, "caches", {
    open: async (name) => name === "inflamm-menu-catalogue-v2"
      ? {
          match: async () => currentResponse?.clone() ?? null,
          keys: async () => [],
          put: async (_request, response) => { currentResponse = response.clone(); },
          delete: async () => { currentResponse = null; return true; },
        }
      : {
          match: async () => legacyResponse?.clone() ?? null,
          keys: async () => [],
          delete: async () => { legacyResponse = null; return true; },
        },
    delete: async (name) => {
      deletedCaches.push(name);
      if (name === "inflamm-menu-catalogue-v1") legacyResponse = null;
      return true;
    },
  });
  const { catalogueAvailableOffline, loadCatalogue } = await importFreshCatalogueModule("legacy-cache-migration");

  assert.equal(await catalogueAvailableOffline(), true);
  assert.ok(currentResponse, "la réponse v1 validée doit être recopiée dans v2");
  assert.equal(legacyResponse, null);
  assert.deepEqual(deletedCaches, ["inflamm-menu-catalogue-v1"]);
  assert.equal((await loadCatalogue()).recipes.length, 1257, "la copie migrée reste utilisable sans réseau");
});

test("le module de validation différé est mémorisé puis libéré après un échec de chunk", () => {
  const loader = catalogueSource.slice(
    catalogueSource.indexOf("let catalogueValidationPromise"),
    catalogueSource.indexOf("export function loadPlannerCaution"),
  );
  assert.match(loader, /catalogueValidationPromise \?\?= import\("\.\/catalog-validation\.ts"\)/);
  assert.match(loader, /\.catch\(/);
  assert.ok(
    loader.lastIndexOf("catalogueValidationPromise = null") > loader.indexOf(".catch("),
    "une panne de chargement du chunk ne doit pas empoisonner les réessais",
  );
});

for (const withLocks of [true, false]) {
  test(`le téléchargement hors ligne ne cache qu'un catalogue entièrement validé, ${withLocks ? "avec" : "sans"} verrou`, { concurrency: false }, async (t) => {
    const invalid = singleRecipeCatalogue({});
    let fetchCount = 0;
    let lockCount = 0;
    const openedCaches = [];
    const deletedCaches = [];
    const writes = [];
    // Do not inherit Node's navigator: Web Locks is present in Node 26, not 22.
    // Both browser capability paths must retain validation before any write.
    replaceGlobal(t, "navigator", withLocks ? { locks: { request: async (_name, operation) => {
      lockCount += 1;
      return operation();
    } } } : {});
    replaceGlobal(t, "fetch", async () => jsonResponse(fetchCount++ === 0 ? invalid : catalogue));
    replaceGlobal(t, "caches", {
      open: async (name) => {
        openedCaches.push(name);
        return { match: async () => null, keys: async () => [], put: async (key, response) => {
          writes.push({ key, payload: await response.json() });
        } };
      },
      delete: async (name) => {
        assert.equal(writes.length, 1, "la purge ne précède jamais l'écriture validée");
        deletedCaches.push(name);
        return true;
      },
    });
    const { CATALOGUE_CACHE_NAME, cacheCatalogueForOffline } = await importFreshCatalogueModule(`cache-atomic-${withLocks}`);

    await assert.rejects(cacheCatalogueForOffline(), /Catalogue invalide/);
    assert.deepEqual(openedCaches, [], "Cache Storage ne doit pas être ouvert pour un payload invalide");
    assert.deepEqual(writes, [], "aucune réponse invalide ne doit être écrite");
    assert.deepEqual(deletedCaches, []);
    assert.equal(lockCount, 0);

    const recovered = await cacheCatalogueForOffline();
    assert.equal(recovered.recipes.length, 1257);
    assert.equal(fetchCount, 2);
    assert.deepEqual(openedCaches, withLocks ? [CATALOGUE_CACHE_NAME, "inflamm-menu-catalogue-v1"] : [CATALOGUE_CACHE_NAME]);
    assert.equal(lockCount, withLocks ? 1 : 0);
    assert.deepEqual(deletedCaches, withLocks ? ["inflamm-menu-catalogue-v1"] : []);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].payload, catalogue);
    const editions = JSON.parse(await readFile(new URL("../src/data/catalogue-offline-editions.json", import.meta.url), "utf8"));
    assert.equal(writes[0].key, withLocks ? dataUrl.href : `${dataUrl.href}?edition=${editions.current.sha256}`);
  });
}

test("un payload de précautions invalide est rejeté puis retenté", { concurrency: false }, async (t) => {
  let fetchCount = 0;
  replaceGlobal(t, "fetch", async () => jsonResponse(fetchCount++ === 0
    ? { "catalog-r002": "valide", "catalog-r006": 42 }
    : plannerCautions));
  const { loadPlannerCaution } = await importFreshCatalogueModule("cautions-retry");

  await assert.rejects(loadPlannerCaution("catalog-r002"), /Précautions invalides/);
  assert.equal(await loadPlannerCaution("catalog-r002"), plannerCautions["catalog-r002"]);
  assert.equal(fetchCount, 2, "la promesse rejetée doit être oubliée avant le réessai");
});

function historicalCatalogue() {
  // Exact reviewed edition 7a11e85; all 1087 recipes are unchanged in this release.
  const previous = structuredClone(catalogue);
  previous.recipes = previous.recipes.slice(0, 1087);
  previous.meta.nombre_recettes = 1087;
  previous.meta.date_mise_a_jour = "2026-09-06";
  return previous;
}

function memoryCaches(t) {
  let queue = Promise.resolve();
  replaceGlobal(t, "navigator", { locks: { request: (_name, operation) => {
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  } } });
  const stores = new Map();
  const controls = { quotaFailure: false, cleanupFailure: false };
  const keyOf = (request) => typeof request === "string" ? request : request.url;
  const api = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        match: async (key) => entries.get(keyOf(key))?.clone() ?? null,
        keys: async () => [...entries.keys()].map((url) => new Request(url)),
        put: async (key, response) => {
          if (controls.quotaFailure) throw new Error("quota");
          entries.set(keyOf(key), response.clone());
        },
        delete: async (key) => {
          if (controls.cleanupFailure) throw new Error("cleanup");
          return entries.delete(keyOf(key));
        },
      };
    },
    delete: async (name) => {
      if (controls.cleanupFailure) throw new Error("cleanup");
      return stores.delete(name);
    },
  };
  replaceGlobal(t, "caches", api);
  return { api, stores, controls };
}

test("le changement d'URL retrouve l'édition historique approuvée sans l'écraser", { concurrency: false }, async (t) => {
  const { api, stores } = memoryCaches(t);
  const cache = await api.open("inflamm-menu-catalogue-v2");
  const previousUrl = new URL("recettes-anti-inflammatoires-ancien.json", dataUrl).href;
  await cache.put(previousUrl, jsonResponse(historicalCatalogue()));
  replaceGlobal(t, "fetch", async () => { throw new Error("offline"); });
  const module = await importFreshCatalogueModule("previous-edition");
  const data = await module.loadCatalogue();
  assert.equal(data.recipes.length, 1087);
  assert.deepEqual(module.catalogueEditionStatus(data), { outdated: true, recipeCount: 1087 });
  assert.deepEqual(await module.catalogueOfflineEdition(), { outdated: true, recipeCount: 1087 });
  assert.deepEqual([...stores.get(module.CATALOGUE_CACHE_NAME).keys()], [previousUrl]);
});

test("une mise à jour validée remplace la copie stable avant de purger et notifie l'interface", { concurrency: false }, async (t) => {
  const { api, stores } = memoryCaches(t);
  const cache = await api.open("inflamm-menu-catalogue-v2");
  const previousUrl = new URL("recettes-anti-inflammatoires-ancien.json", dataUrl).href;
  await cache.put(previousUrl, jsonResponse(historicalCatalogue()));
  const unrelatedUrl = new URL("autre-document.json", dataUrl).href;
  await cache.put(unrelatedUrl, jsonResponse({ unrelated: true }));
  replaceGlobal(t, "fetch", async () => jsonResponse(catalogue));
  const module = await importFreshCatalogueModule("replace-edition");
  let announced = null;
  const unsubscribe = module.subscribeCatalogueUpdates((data) => { announced = data; });
  const current = await module.cacheCatalogueForOffline();
  unsubscribe();
  assert.equal(announced, current);
  assert.equal(stores.get(module.CATALOGUE_CACHE_NAME).has(previousUrl), false);
  assert.equal(stores.get(module.CATALOGUE_CACHE_NAME).has(unrelatedUrl), true);
  assert.equal(stores.get(module.CATALOGUE_CACHE_NAME).size, 2);
  replaceGlobal(t, "fetch", async () => { throw new Error("offline"); });
  const freshModule = await importFreshCatalogueModule("reload-current-edition");
  assert.equal((await freshModule.loadCatalogue()).recipes.length, 1257);
  assert.deepEqual(await freshModule.catalogueOfflineEdition(), { outdated: false, recipeCount: 1257 });
});

test("une édition tronquée ou altérée ne peut se faire passer pour une ancienne édition", { concurrency: false }, async (t) => {
  const { api } = memoryCaches(t);
  const cache = await api.open("inflamm-menu-catalogue-v2");
  const altered = historicalCatalogue();
  altered.recipes[0].titre += " modifiée";
  const truncated = historicalCatalogue();
  truncated.recipes.pop();
  truncated.meta.nombre_recettes -= 1;
  await cache.put(new URL("recettes-anti-inflammatoires-fausse.json", dataUrl).href, jsonResponse(altered));
  await cache.put(new URL("recettes-anti-inflammatoires-tronquee.json", dataUrl).href, jsonResponse(truncated));
  replaceGlobal(t, "fetch", async () => { throw new Error("offline"); });
  const module = await importFreshCatalogueModule("unreviewed-edition");
  assert.equal(await module.catalogueAvailableOffline(), false);
  await assert.rejects(module.loadCatalogue(), /offline/);
});

test("échec réseau, contenu invalide ou quota préservent l'édition précédente", { concurrency: false }, async (t) => {
  const { api, stores, controls } = memoryCaches(t);
  const cache = await api.open("inflamm-menu-catalogue-v2");
  const previousUrl = new URL("recettes-anti-inflammatoires-ancien.json", dataUrl).href;
  await cache.put(previousUrl, jsonResponse(historicalCatalogue()));
  const module = await importFreshCatalogueModule("failed-edition-update");
  for (const response of [new Response("error", { status: 500 }), jsonResponse(singleRecipeCatalogue(catalogue.recipes[0]))]) {
    replaceGlobal(t, "fetch", async () => response.clone());
    await assert.rejects(module.cacheCatalogueForOffline());
    assert.equal(stores.get(module.CATALOGUE_CACHE_NAME).has(previousUrl), true);
  }
  controls.quotaFailure = true;
  replaceGlobal(t, "fetch", async () => jsonResponse(catalogue));
  await assert.rejects(module.cacheCatalogueForOffline(), /quota/);
  replaceGlobal(t, "fetch", async () => { throw new Error("offline"); });
  assert.equal((await module.loadCatalogue()).recipes.length, 1087);
  assert.equal(stores.get(module.CATALOGUE_CACHE_NAME).size, 1);
});

test("un nettoyage refusé après écriture ne masque pas la nouvelle édition", { concurrency: false }, async (t) => {
  const { api, controls } = memoryCaches(t);
  const cache = await api.open("inflamm-menu-catalogue-v2");
  await cache.put(new URL("recettes-anti-inflammatoires-ancien.json", dataUrl).href, jsonResponse(historicalCatalogue()));
  controls.cleanupFailure = true;
  replaceGlobal(t, "fetch", async () => jsonResponse(catalogue));
  const module = await importFreshCatalogueModule("cleanup-failure");
  assert.equal((await module.cacheCatalogueForOffline()).recipes.length, 1257);
  replaceGlobal(t, "fetch", async () => { throw new Error("offline"); });
  const reloaded = await importFreshCatalogueModule("cleanup-failure-reload");
  assert.equal((await reloaded.loadCatalogue()).recipes.length, 1257);
});

test("un ancien onglet ne rétrograde ni ne purge une édition inconnue plus récente", { concurrency: false }, async (t) => {
  const { api } = memoryCaches(t);
  const cache = await api.open("inflamm-menu-catalogue-v2");
  const stableUrl = dataUrl.href;
  const future = structuredClone(catalogue);
  future.recipes[0].titre += " — révision future";
  await cache.put(stableUrl, jsonResponse(future));
  const hashedCurrent = new URL("recettes-anti-inflammatoires-courante.json", dataUrl).href;
  const hashedFuture = new URL("recettes-anti-inflammatoires-future.json", dataUrl).href;
  await cache.put(hashedCurrent, jsonResponse(catalogue));
  await cache.put(hashedFuture, jsonResponse(future));
  replaceGlobal(t, "fetch", async () => jsonResponse(catalogue));
  const module = await importFreshCatalogueModule("newer-edition-open-tab");
  assert.deepEqual(await module.catalogueOfflineEdition(), { outdated: false, recipeCount: 1257 });
  assert.deepEqual(await (await cache.match(stableUrl)).json(), future, "l'inspection ne rétrograde pas la copie d'un autre build");
  await module.cacheCatalogueForOffline();
  assert.deepEqual(await (await cache.match(stableUrl)).json(), future, "le téléchargement de cet ancien onglet ne rétrograde pas non plus la copie récente");
  assert.deepEqual(await (await cache.match(hashedFuture)).json(), future, "la purge ne détruit pas les éditions inconnues");
});

test("sans verrou interonglets, les écritures restent par édition et ne suppriment rien", { concurrency: false }, async (t) => {
  const { api, stores } = memoryCaches(t);
  replaceGlobal(t, "navigator", {});
  const cache = await api.open("inflamm-menu-catalogue-v2");
  await cache.put(dataUrl.href, jsonResponse(historicalCatalogue()));
  replaceGlobal(t, "fetch", async () => jsonResponse(catalogue));
  const module = await importFreshCatalogueModule("no-cross-tab-lock");
  await Promise.all([module.cacheCatalogueForOffline(), module.cacheCatalogueForOffline()]);
  assert.equal(stores.get(module.CATALOGUE_CACHE_NAME).size, 2);
  assert.equal((await (await cache.match(dataUrl.href)).json()).recipes.length, 1087);
  replaceGlobal(t, "fetch", async () => { throw new Error("offline"); });
  assert.equal((await (await importFreshCatalogueModule("no-lock-reload")).loadCatalogue()).recipes.length, 1257);
});

test("les filtres et le tri du catalogue portent sur les vraies données", async () => {
  const { filterCatalogueRecipes, EMPTY_CATALOGUE_FILTERS, catalogueActiveMinutes, visibleCatalogueRecipes } = await import("../src/catalog.ts");
  const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
  const visible = visibleCatalogueRecipes(catalogue);

  assert.equal(filterCatalogueRecipes(visible, EMPTY_CATALOGUE_FILTERS).length, 1251, "sans filtre, tout le catalogue visible");

  const quick = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, maxActiveMinutes: 15 });
  assert.ok(quick.length > 0 && quick.length < visible.length);
  assert.ok(quick.every((recipe) => catalogueActiveMinutes(recipe) <= 15));

  const cheap = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, cost: "economique" });
  assert.ok(cheap.every((recipe) => recipe.cout === "economique"));

  const glutenFree = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, withoutAllergen: "gluten" });
  assert.ok(glutenFree.every((recipe) => !recipe.app.planner.allergens.includes("gluten")));

  const r169 = catalogue.recipes.find((recipe) => recipe.id === "r169");
  const r039 = catalogue.recipes.find((recipe) => recipe.id === "r039");
  assert.ok(r169 && r039);
  const lactoseFree = (recipes) => filterCatalogueRecipes(recipes, {
    ...EMPTY_CATALOGUE_FILTERS,
    diet: "sans-lactose",
  });
  assert.equal(
    lactoseFree([{ ...r169, regimes: [...r169.regimes, "sans-lactose"] }]).length,
    0,
    "le filtre se défend contre une recette sans-lactose qui impose du lait",
  );
  assert.deepEqual(
    lactoseFree([r039]).map((recipe) => recipe.id),
    ["r039"],
    "un produit laitier facultatif n'invalide pas la version sans lactose",
  );

  const plannable = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, plannableOnly: true });
  assert.equal(plannable.length, 689, "le filtre planifiable respecte la relecture éditoriale");

  const winter = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, season: "hiver" });
  assert.ok(winter.every((recipe) => recipe.saisons.includes("hiver") || recipe.saisons.includes("toute-annee")));

  const byTime = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, sort: "time" });
  const times = byTime.map(catalogueActiveMinutes);
  assert.deepEqual(times, [...times].sort((a, b) => a - b), "le tri par temps est croissant");

  const searched = filterCatalogueRecipes(visible, EMPTY_CATALOGUE_FILTERS, "wakame");
  assert.equal(searched.length, 1);
  assert.equal(filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, cost: "eleve" }, "wakame").length <= 1, true);
});

test("les saisons normalisées restent visibles dans les filtres et la projection", async () => {
  const { filterCatalogueRecipes, EMPTY_CATALOGUE_FILTERS } = await import("../src/catalog.ts");
  const affectedIds = [
    "r526", "r527", "r528", "r532", "r533", "r536", "r537", "r540", "r541", "r543", "r544", "r545", "r546", "r548", "r550",
  ];
  const affected = catalogue.recipes.filter((recipe) => affectedIds.includes(recipe.id));
  const summerAffected = filterCatalogueRecipes(affected, { ...EMPTY_CATALOGUE_FILTERS, season: "ete" });
  const winterAffected = filterCatalogueRecipes(affected, { ...EMPTY_CATALOGUE_FILTERS, season: "hiver" });

  assert.deepEqual(
    summerAffected.map((recipe) => recipe.id).sort(),
    ["r526", "r527", "r528", "r532", "r533", "r536", "r537", "r540", "r541", "r543", "r544", "r545", "r546", "r548", "r550"],
  );
  assert.deepEqual(winterAffected.map((recipe) => recipe.id).sort(), ["r536", "r543", "r544", "r545", "r546"]);

  for (const id of ["r526", "r527", "r537"]) {
    const projected = plannerRecipes.find((recipe) => recipe.id === `catalog-${id}`);
    assert.ok(projected?.seasons.includes("summer"), `${id}: la projection doit conserver la saison été`);
  }
});

test("les 80 desserts CREAMi sont trouvables sans entrer dans le planificateur", async () => {
  const { filterCatalogueRecipes, EMPTY_CATALOGUE_FILTERS, visibleCatalogueRecipes } = await import("../src/catalog.ts");
  const visible = visibleCatalogueRecipes(catalogue);
  const creami = filterCatalogueRecipes(visible, EMPTY_CATALOGUE_FILTERS, "ninja creami deluxe");
  assert.equal(creami.length, 80);
  assert.ok(creami.every((recipe) => recipe.categorie === "dessert"));
  assert.ok(creami.every((recipe) => recipe.app.planner.eligible === false));
  assert.ok(creami.every((recipe) => recipe.temps.repos >= 1_440));
  assert.ok(creami.every((recipe) => recipe.materiel?.includes("Ninja CREAMi Deluxe (NC501EU)")));
  assert.ok(creami.every((recipe) => recipe.creami?.zone === "FULL"));

  const desserts = filterCatalogueRecipes(visible, { ...EMPTY_CATALOGUE_FILTERS, category: "dessert" });
  assert.ok(desserts.length >= 108);
  assert.ok(creami.every((recipe) => desserts.some(({ id }) => id === recipe.id)));
  assert.ok(creami.every((recipe) => !plannerRecipes.some(({ id }) => id === `catalog-${recipe.id}`)));
});
