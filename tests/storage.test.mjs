import assert from "node:assert/strict";
import test from "node:test";

const { importAppState, MAX_BACKUP_BYTES } = await import("../src/backup-import.ts");
const { APP_STATE_VERSION, migrateAppState } = await import("../src/storage.ts");

function state(overrides = {}) {
  return {
    version: 1,
    profile: {
      firstName: "Camille",
      people: 2,
      mealsPerDay: 2,
      weeklyBudget: 80,
      maxPrepMinutes: 30,
      allergies: [],
      excludedIngredientIds: ["catalog-carotte", "carotte"],
      diet: "classic",
      equipment: ["hob"],
    },
    currentPlan: null,
    favoriteRecipeIds: [],
    history: [],
    checkedShoppingItemIds: ["catalog-carotte:g", "carotte:piece", "olive_oil:ml"],
    pantryIngredientIds: ["catalog-carotte", "carotte", "olive_oil"],
    ...overrides,
  };
}

test("v1 shopping keys and profile exclusions migrate to canonical v2 identifiers", () => {
  const migrated = migrateAppState(state());
  assert.equal(migrated?.version, APP_STATE_VERSION);
  assert.deepEqual(migrated?.profile.excludedIngredientIds, ["carrot"]);
  assert.deepEqual(migrated?.checkedShoppingItemIds, ["carrot", "olive-oil"]);
  assert.deepEqual(migrated?.pantryIngredientIds, ["carrot", "olive-oil"]);
});

test("unversioned legacy collection names remain supported", () => {
  const input = state({
    version: undefined,
    checkedShoppingItemIds: undefined,
    pantryIngredientIds: undefined,
    checkedShoppingIds: ["catalog-carottes:g"],
    pantryIds: ["catalog-huile-d-olive-vierge-extra"],
  });
  const migrated = migrateAppState(input);
  assert.deepEqual(migrated?.checkedShoppingItemIds, ["carrot"]);
  assert.deepEqual(migrated?.pantryIngredientIds, ["olive-oil"]);
});

test("an already migrated state remains stable", () => {
  const once = migrateAppState(state());
  const twice = migrateAppState(once);
  assert.deepEqual(twice, once);
});

test("locked and cooked marks survive a save/load round trip", () => {
  const currentPlan = {
    id: "week-2026-08-03-test",
    startsOn: "2026-08-03",
    generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: state().profile,
    meals: [
      { id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: "r1", portions: 2, source: "generated", locked: true },
      { id: "day-0-dinner", dayIndex: 0, mealType: "dinner", recipeId: "r2", portions: 2, source: "generated", completed: true },
    ],
    estimatedCost: 12,
    version: 1,
  };
  const archivedPlan = {
    ...currentPlan,
    id: "week-2026-07-27-archive",
    startsOn: "2026-07-27",
    generatedAt: "2026-07-27T00:00:00.000Z",
  };
  const migrated = migrateAppState(state({ currentPlan, history: [archivedPlan] }));

  assert.equal(migrated?.currentPlan?.meals[0].locked, true);
  assert.equal(migrated?.currentPlan?.meals[1].completed, true);
  assert.equal(migrated?.history[0].meals[0].locked, true);
  assert.deepEqual(migrateAppState(migrated), migrated);
});

test("disliked recipes are persisted and legacy profiles default to an empty list", () => {
  const withDislikes = migrateAppState(state({ profile: { ...state().profile, dislikedRecipeIds: ["catalog-r002", "catalog-r002", "salade-lentilles-noix"] } }));
  assert.deepEqual(withDislikes?.profile.dislikedRecipeIds, ["catalog-r002", "salade-lentilles-noix"]);

  const legacy = migrateAppState(state());
  assert.deepEqual(legacy?.profile.dislikedRecipeIds, []);
  assert.equal("calorieTarget" in (legacy?.profile ?? {}), false, "le champ mort n'est pas réintroduit");
  assert.deepEqual(migrateAppState(withDislikes), withDislikes);
});

test("allergen aliases are canonicalized when the profile is persisted", () => {
  const migrated = migrateAppState(state({
    profile: { ...state().profile, allergies: ["Fruits à coque", "noix", "soya", "œufs", "lactose"] },
  }));
  assert.deepEqual(migrated.profile.allergies, ["fruits-a-coque", "soja", "oeuf", "lait"]);
});

test("a backup round trip preserves every local decision", async () => {
  const { exportAppState, BACKUP_FORMAT } = await import("../src/storage.ts");
  const source = migrateAppState(state({
    favoriteRecipeIds: ["catalog-r036", "salade-lentilles-noix"],
    profile: { ...state().profile, dislikedRecipeIds: ["catalog-r002"], firstName: "Camille" },
    currentPlan: {
      id: "week-2026-08-03-x", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: state().profile,
      meals: [
        { id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: "r1", portions: 4, source: "manual", locked: true, completed: true, substitutions: [{ ingredientId: "walnut", substitutionId: "nuts-to-pumpkin-seeds" }] },
        { id: "day-1-lunch", dayIndex: 1, mealType: "lunch", recipeId: "r1", portions: 4, source: "manual", leftoverOf: "day-0-lunch" },
      ],
      estimatedCost: 12, version: 1,
    },
  }));

  const raw = exportAppState(source, "2026-08-06T10:00:00.000Z");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.format, BACKUP_FORMAT);
  assert.equal(parsed.exportedAt, "2026-08-06T10:00:00.000Z");
  assert.equal(parsed.version, APP_STATE_VERSION);

  const restored = importAppState(raw);
  assert.deepEqual(restored, source);
  assert.equal(restored.currentPlan.meals[0].portions, 4);
  assert.equal(restored.currentPlan.meals[0].locked, true);
  assert.deepEqual(restored.currentPlan.meals[0].substitutions, [{ ingredientId: "walnut", substitutionId: "nuts-to-pumpkin-seeds" }]);
  assert.deepEqual(restored.profile.dislikedRecipeIds, ["catalog-r002"]);
  assert.equal(restored.currentPlan.meals[1].leftoverOf, "day-0-lunch");
});

test("stored substitutions are kept only for an ingredient supported by the reviewed rule", () => {
  const currentPlan = {
    id: "week-2026-08-03-substitutions",
    startsOn: "2026-08-03",
    generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: state().profile,
    meals: [{
      id: "day-0-lunch",
      dayIndex: 0,
      mealType: "lunch",
      recipeId: "r1",
      portions: 2,
      source: "manual",
      substitutions: [
        { ingredientId: "walnut", substitutionId: "nuts-to-pumpkin-seeds" },
        { ingredientId: "walnut", substitutionId: "yogurt-to-soy-yogurt" },
      ],
    }],
    estimatedCost: 12,
    version: 1,
  };
  const migrated = migrateAppState(state({ currentPlan }));
  assert.deepEqual(migrated?.currentPlan?.meals[0].substitutions, [
    { ingredientId: "walnut", substitutionId: "nuts-to-pumpkin-seeds" },
  ]);
});

test("restoring rejects foreign or broken files and accepts a raw state dump", async () => {
  const { BACKUP_FORMAT } = await import("../src/storage.ts");

  assert.throws(() => importAppState("{pas du json"), /Fichier illisible/);
  assert.throws(() => importAppState("[]"), /Fichier illisible/);
  assert.throws(() => importAppState(JSON.stringify({ format: "autre-app", state: {} })), /ne provient pas/);
  assert.throws(() => importAppState(JSON.stringify({ format: BACKUP_FORMAT, version: APP_STATE_VERSION, state: {} })), /incomplète/);
  assert.throws(() => importAppState(JSON.stringify({ format: BACKUP_FORMAT, version: APP_STATE_VERSION, state: { hello: "world" } })), /incomplète/);
  assert.throws(() => importAppState(JSON.stringify({ version: APP_STATE_VERSION })), /incomplète/);
  assert.throws(() => importAppState(JSON.stringify({ profile: {} })), /incomplète/);
  assert.throws(() => importAppState(JSON.stringify({
    format: BACKUP_FORMAT,
    version: APP_STATE_VERSION,
    exportedAt: "2026-08-08T10:00:00.000Z",
    state: { version: APP_STATE_VERSION },
  })), /incomplète/);
  const corruptedCompleteState = Object.fromEntries([
    "profile", "currentPlan", "upcomingPlan", "favoriteRecipeIds", "history",
    "checkedShoppingItemIds", "pantryIngredientIds", "pantryAmounts", "recipeNotes",
    "shoppingCategoryOrder", "actualSpend", "customRecipes", "textScale",
    "remindersEnabled", "onboardingCompleted", "stateRevision",
  ].map((key) => [key, null]));
  assert.throws(() => importAppState(JSON.stringify({
    format: BACKUP_FORMAT,
    version: APP_STATE_VERSION,
    exportedAt: "2026-08-08T10:00:00.000Z",
    state: corruptedCompleteState,
  })), /incomplète/);

  const rawState = importAppState(JSON.stringify(state()));
  assert.equal(rawState.version, APP_STATE_VERSION);
  assert.deepEqual(rawState.profile.dislikedRecipeIds, []);
});

test("an oversized backup file is rejected before its contents are read", async () => {
  const {
    exportAppState,
    importAppStateFile,
  } = await import("../src/storage.ts");
  let reads = 0;
  await assert.rejects(
    () => importAppStateFile({
      size: MAX_BACKUP_BYTES + 1,
      text: async () => {
        reads += 1;
        return "{}";
      },
    }),
    /8 Mo/,
  );
  assert.equal(reads, 0);

  const source = migrateAppState(state({ profile: { ...state().profile, firstName: "Petit fichier" } }));
  const raw = exportAppState(source);
  const restored = await importAppStateFile({
    size: Buffer.byteLength(raw),
    text: async () => {
      reads += 1;
      return raw;
    },
  });
  assert.equal(reads, 1);
  assert.equal(restored.profile.firstName, "Petit fichier");
});

test("app updates are watched without touching a page that has no worker yet", async () => {
  const { watchForAppUpdate } = await import("../src/storage.ts");

  const originalNavigator = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    assert.equal(typeof watchForAppUpdate(() => assert.fail("aucune notification sans service worker")), "function");

    const listeners = new Map();
    let notified = 0;
    const installing = {
      state: "installing",
      addEventListener: (type, handler) => listeners.set(`installing:${type}`, handler),
      removeEventListener: (type) => listeners.delete(`installing:${type}`),
    };
    const registration = {
      installing,
      waiting: null,
      addEventListener: (type, handler) => listeners.set(`registration:${type}`, handler),
      removeEventListener: (type) => listeners.delete(`registration:${type}`),
    };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          controller: {},
          addEventListener: (type, handler) => listeners.set(`sw:${type}`, handler),
          removeEventListener: () => listeners.delete("sw:controllerchange"),
          getRegistration: () => Promise.resolve(registration),
        },
      },
    });

    const stop = watchForAppUpdate(() => { notified += 1; });
    await Promise.resolve();
    await Promise.resolve();

    installing.state = "installed";
    listeners.get("installing:statechange")?.();
    assert.equal(notified, 1, "une version installée déclenche l'invitation à recharger");

    stop();
    listeners.get("installing:statechange")?.();
    assert.equal(notified, 1, "plus aucune notification après nettoyage");
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  }
});

test("app update checks run when the PWA becomes visible or returns online", async () => {
  const { watchForAppUpdate } = await import("../src/storage.ts");
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const listeners = new Map();
  let updateChecks = 0;
  const registration = {
    installing: null,
    waiting: null,
    update: async () => { updateChecks += 1; },
    addEventListener: (type, handler) => listeners.set(`registration:${type}`, handler),
    removeEventListener: (type) => listeners.delete(`registration:${type}`),
  };
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          controller: {},
          addEventListener: (type, handler) => listeners.set(`sw:${type}`, handler),
          removeEventListener: (type) => listeners.delete(`sw:${type}`),
          getRegistration: async () => registration,
        },
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        visibilityState: "hidden",
        addEventListener: (type, handler) => listeners.set(`document:${type}`, handler),
        removeEventListener: (type) => listeners.delete(`document:${type}`),
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: (type, handler) => listeners.set(`window:${type}`, handler),
        removeEventListener: (type) => listeners.delete(`window:${type}`),
      },
    });

    const stop = watchForAppUpdate(() => undefined);
    await Promise.resolve();
    assert.equal(updateChecks, 0, "observer la version courante ne force pas encore de requête");

    listeners.get("document:visibilitychange")?.();
    await Promise.resolve();
    assert.equal(updateChecks, 0, "un passage en arrière-plan ne déclenche rien");

    globalThis.document.visibilityState = "visible";
    listeners.get("document:visibilitychange")?.();
    await Promise.resolve();
    assert.equal(updateChecks, 1);

    listeners.get("window:online")?.();
    await Promise.resolve();
    assert.equal(updateChecks, 2);

    stop();
    assert.equal(listeners.has("document:visibilitychange"), false);
    assert.equal(listeners.has("window:online"), false);
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
    if (originalDocument === undefined) delete globalThis.document;
    else Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
    if (originalWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  }
});

test("offline support explicitly checks for a newer worker after registration", async () => {
  const { registerOfflineSupport } = await import("../src/storage.ts");
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  let updateChecks = 0;
  let registeredOptions;
  const registration = {
    update: async () => { updateChecks += 1; },
  };
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          register: async (_url, options) => {
            registeredOptions = options;
            return registration;
          },
        },
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { hostname: "localhost" }, isSecureContext: true },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { readyState: "complete" },
    });

    assert.equal(await registerOfflineSupport(), registration);
    assert.equal(updateChecks, 1);
    assert.equal(registeredOptions.updateViaCache, "none");
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
    if (originalDocument === undefined) delete globalThis.document;
    else Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
    if (originalWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  }
});

test("the first service-worker controller is not mistaken for an update", async () => {
  const { watchForAppUpdate } = await import("../src/storage.ts");
  const originalNavigator = globalThis.navigator;
  const listeners = new Map();
  let notified = 0;
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          controller: null,
          addEventListener: (type, handler) => listeners.set(`sw:${type}`, handler),
          removeEventListener: (type) => listeners.delete(`sw:${type}`),
          getRegistration: () => Promise.resolve(null),
        },
      },
    });

    const stop = watchForAppUpdate(() => { notified += 1; });
    await Promise.resolve();
    listeners.get("sw:controllerchange")?.();
    assert.equal(notified, 0, "la première prise de contrôle correspond à l’installation initiale");

    listeners.get("sw:controllerchange")?.();
    assert.equal(notified, 1, "un remplacement ultérieur du contrôleur signale une mise à jour");
    stop();
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  }
});

test("weekly targets are persisted and clamped, with defaults for older profiles", () => {
  assert.deepEqual(migrateAppState(state())?.profile.weeklyTargets, { legumeMeals: 2, fishMeals: 2 });
  assert.deepEqual(
    migrateAppState(state({ profile: { ...state().profile, weeklyTargets: { legumeMeals: 5, fishMeals: 12 } } }))?.profile.weeklyTargets,
    { legumeMeals: 5, fishMeals: 7 },
  );
  assert.deepEqual(
    migrateAppState(state({ profile: { ...state().profile, weeklyTargets: "n'importe quoi" } }))?.profile.weeklyTargets,
    { legumeMeals: 2, fishMeals: 2 },
  );
});

test("no favourite is preset on the user's behalf", async () => {
  const { DEFAULT_APP_STATE } = await import("../src/storage.ts");
  assert.deepEqual(DEFAULT_APP_STATE.favoriteRecipeIds, []);
  assert.deepEqual(DEFAULT_APP_STATE.favorites, []);

  const withoutField = migrateAppState({ ...state(), favoriteRecipeIds: undefined, favorites: undefined });
  assert.deepEqual(withoutField?.favoriteRecipeIds, [], "un état ancien sans favoris n'en invente pas");

  const chosen = migrateAppState(state({ favoriteRecipeIds: ["salade-lentilles-noix"] }));
  assert.deepEqual(chosen?.favoriteRecipeIds, ["salade-lentilles-noix"], "les choix existants sont conservés");
});

test("a malformed stored plan is rejected instead of crashing the app", async () => {
  const { normalizePlan } = await import("../src/storage.ts");

  assert.equal(normalizePlan({ id: "x", startsOn: "2026-08-03" }), null, "sans repas");
  assert.equal(normalizePlan({ id: "x", startsOn: "2026-08-03", meals: "beaucoup" }), null, "repas non tableau");
  assert.equal(normalizePlan({ id: "x", startsOn: "2026-08-03", meals: [null] }), null, "repas nul");
  assert.equal(normalizePlan({ id: "x", meals: [] }), null, "sans date");
  assert.equal(normalizePlan({ id: "x", startsOn: "pas-une-date", meals: [] }), null, "date invalide");
  assert.equal(normalizePlan(null), null);

  const meal = { id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: "r1", portions: 2, source: "generated" };
  const cleaned = normalizePlan({
    startsOn: "2026-08-03",
    meals: [
      meal,
      { ...meal, id: "day-9", dayIndex: 42 },
      { ...meal, id: "day-x", mealType: "brunch" },
      { ...meal, id: "day-1-lunch", dayIndex: 1, portions: 99, leftoverOf: "créneau-fantôme" },
    ],
    estimatedCost: "cher",
  });

  assert.equal(cleaned.meals.length, 2, "les repas invalides sont écartés");
  assert.equal(cleaned.meals[1].portions, 8, "les portions sont bornées");
  assert.equal(cleaned.meals[1].leftoverOf, undefined, "un reste orphelin est délié");
  assert.equal(cleaned.estimatedCost, 0, "un coût illisible retombe à zéro");
  assert.equal(cleaned.id, "week-2026-08-03", "un identifiant manquant est reconstruit");
  assert.equal(cleaned.version, 1);
});

test("absurd profile numbers are bounded rather than trusted", () => {
  const bounded = (patch) => migrateAppState(state({ profile: { ...state().profile, ...patch } }))?.profile;

  assert.equal(bounded({ maxPrepMinutes: Number.NaN }).maxPrepMinutes, 30);
  assert.equal(bounded({ weeklyBudget: Number.NaN }).weeklyBudget, 80);
  assert.equal(bounded({ weeklyBudget: Number.POSITIVE_INFINITY }).weeklyBudget, 80, "l'infini retombe sur la valeur par défaut");
  assert.equal(bounded({ maxPrepMinutes: -30 }).maxPrepMinutes, 1);
  assert.equal(bounded({ people: 0 }).people, 1);
  assert.equal(bounded({ people: -3 }).people, 1);
  assert.equal(bounded({ people: 10_000 }).people, 8);
  assert.equal(bounded({ people: 2.6 }).people, 3, "les valeurs décimales sont arrondies");
});

test("an imported history cannot exceed the on-device limit", async () => {
  const { HISTORY_LIMIT } = await import("../src/storage.ts");
  const week = (index) => ({
    id: `w${index}`, startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: state().profile,
    meals: [{ id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: "r1", portions: 2, source: "generated" }],
    estimatedCost: 10, version: 1,
  });
  const restored = importAppState(JSON.stringify({ state: { ...state(), history: Array.from({ length: 500 }, (_, i) => week(i)) } }));
  assert.equal(restored.history.length, HISTORY_LIMIT);
});

test("the new local settings are validated like everything else", async () => {
  const { DEFAULT_CATEGORY_ORDER } = await import("../src/storage.ts");
  const fresh = migrateAppState(state());
  assert.deepEqual(fresh?.pantryAmounts, {});
  assert.deepEqual(fresh?.recipeNotes, {});
  assert.deepEqual(fresh?.shoppingCategoryOrder, DEFAULT_CATEGORY_ORDER);
  assert.deepEqual(fresh?.customRecipes, []);
  assert.equal(fresh?.textScale, "normal");
  assert.equal(fresh?.remindersEnabled, false);
  assert.equal(fresh?.onboardingCompleted, false);
  assert.equal(fresh?.upcomingPlan, null);

  const messy = migrateAppState(state({
    pantryAmounts: { "olive_oil": { quantity: 500, unit: "ml" }, mauvais: { quantity: -1, unit: "ml" }, unite: { quantity: 5, unit: "litres" } },
    recipeNotes: { r1: "  ", r2: "moins de sel", r3: 42 },
    shoppingCategoryOrder: ["grocery", "inconnu", "grocery"],
    actualSpend: { w1: 42.5, w2: "beaucoup", w3: -5 },
    customRecipes: [
      { id: "sans-prefixe", title: "x" },
      {
        id: "perso-1",
        title: "Ma version",
        mealTypes: ["lunch"],
        diet: ["classic", "vegetarian", "no-pork"],
        prepMinutes: 10,
        costPerPortion: 2,
        seasons: ["all-year"],
        equipment: [],
        allergens: [],
        tags: ["maison"],
        ingredients: [{ id: "carrot", name: "Carotte", quantity: 100, unit: "g", category: "fruit-vegetable" }],
        nutrition: { calories: 100, protein: 2, fiber: 3, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
        description: "Une version personnelle valide.",
        steps: ["Préparer les ingrédients."],
        conservation: "À consommer rapidement.",
        image: "/assets/recipe-placeholder.svg",
      },
    ],
    textScale: "gigantesque",
    remindersEnabled: "oui",
  }));

  assert.deepEqual(messy?.pantryAmounts, { "olive-oil:ml": { quantity: 500, unit: "ml" } }, "identifiants d’achat canonisés, entrées invalides écartées");
  assert.deepEqual(messy?.recipeNotes, { r2: "moins de sel" });
  assert.equal(messy?.shoppingCategoryOrder[0], "grocery");
  assert.equal(messy?.shoppingCategoryOrder.length, DEFAULT_CATEGORY_ORDER.length, "tous les rayons restent présents");
  assert.deepEqual(messy?.actualSpend, { w1: 42.5 });
  assert.equal(messy?.customRecipes.length, 1, "une recette personnelle doit porter le préfixe perso-");
  assert.equal(messy?.textScale, "normal");
  assert.equal(messy?.remindersEnabled, false, "seule la valeur booléenne vraie active les rappels");
  assert.deepEqual(migrateAppState(messy), messy, "l'état reste stable après un second passage");
});

test("historical shopping state migrates to groups without losing quantities", () => {
  const migrated = migrateAppState(state({
    checkedShoppingItemIds: ["olive-oil:ml", "huile-olive-vierge-extra:ml", "moutarde-ancienne:ml"],
    pantryIngredientIds: ["persil-plat", "catalog-persil-plat-cisele", "oignon-rouge"],
    pantryAmounts: {
      "olive-oil": { quantity: 100, unit: "ml" },
      "huile-olive-vierge-extra": { quantity: 250, unit: "ml" },
      "parsley": { quantity: 10, unit: "g" },
      "catalog-persil-plat-cisele": { quantity: 5, unit: "g" },
      "catalog-feuilles-de-menthe-fraiche": { quantity: 2, unit: "piece" },
      "mint": { quantity: 8, unit: "g" },
    },
  }));
  assert.deepEqual(migrated?.checkedShoppingItemIds, ["olive-oil", "moutarde-ancienne"]);
  assert.deepEqual(migrated?.pantryIngredientIds, ["parsley", "oignon-rouge"]);
  assert.deepEqual(migrated?.pantryAmounts, {
    "olive-oil:ml": { quantity: 350, unit: "ml" },
    "parsley:g": { quantity: 15, unit: "g" },
    "mint:piece": { quantity: 2, unit: "piece" },
    "mint:g": { quantity: 8, unit: "g" },
  });
  assert.deepEqual(migrateAppState(migrated), migrated);
});


test("audit remediation: strict imports and nested custom recipes", async () => {
  const { migrateAppState } = await import("../src/storage.ts");
  assert.throws(() => importAppState("{}"), /aucune donnée Inflamm.Menu reconnue/i);
  assert.throws(() => importAppState(JSON.stringify({ hello: 1 })), /aucune donnée Inflamm.Menu reconnue/i);
  assert.throws(() => importAppState(JSON.stringify({ format: "inflamm-menu-backup", version: 999, state: {} })), /version plus récente/i);

  const malformed = migrateAppState({
    profile: {},
    customRecipes: [{
      id: "perso-danger",
      title: "Danger",
      mealTypes: ["lunch"],
      ingredients: [],
      steps: ["Étape"],
      prepMinutes: 10,
      costPerPortion: 2,
    }],
  });
  assert.equal(malformed.customRecipes.length, 0);
});

test("personal recipe images follow the current base after restore and unsafe paths only fall back", () => {
  const customRecipe = {
    id: "perso-pages",
    title: "Ma recette Pages",
    mealTypes: ["lunch"],
    diet: ["classic"],
    prepMinutes: 10,
    costPerPortion: 2,
    seasons: ["all-year"],
    equipment: [],
    allergens: [],
    tags: ["maison"],
    ingredients: [
      { id: "carrot", name: "Carotte", quantity: 100, unit: "g", category: "fruit-vegetable" },
      { id: "walnut", name: "Noix", quantity: 10, unit: "g", category: "grocery", optional: true },
    ],
    nutrition: { calories: 100, protein: 2, fiber: 3, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "Une version personnelle valide.",
    steps: ["Préparer les ingrédients."],
    conservation: "À consommer rapidement.",
    image: "/InflammMenu/assets/recipes/ma-recette.jpg",
  };

  const pagesState = migrateAppState(state({ customRecipes: [customRecipe] }));
  assert.equal(pagesState.customRecipes.length, 1);
  assert.equal(pagesState.customRecipes[0].image, "/assets/recipes/ma-recette.jpg");
  assert.equal(pagesState.customRecipes[0].ingredients[1].optional, true);

  for (const image of ["/assets/recipes/ma-recette.jpg", "/old/site/assets/recipes/ma-recette.jpg"]) {
    const restored = migrateAppState(state({ customRecipes: [{ ...customRecipe, image }] }));
    assert.equal(restored.customRecipes[0].image, "/assets/recipes/ma-recette.jpg");
  }

  const unsafeState = migrateAppState(state({
    customRecipes: [{ ...customRecipe, image: "javascript:alert(1)" }],
  }));
  assert.equal(unsafeState.customRecipes.length, 1, "une image invalide ne détruit jamais la recette");
  assert.equal(unsafeState.customRecipes[0].image, "/assets/recipe-placeholder.svg");
  for (const image of ["//example.com/assets/a.jpg", "/assets/../secret", "/old/../assets/a.jpg", "https://example.com/assets/a.jpg"]) {
    const rejected = migrateAppState(state({ customRecipes: [{ ...customRecipe, image }] }));
    assert.equal(rejected.customRecipes[0].image, "/assets/recipe-placeholder.svg");
  }
});

test("audit remediation: plan normalization removes duplicate slots and invalid leftovers", async () => {
  const { normalizePlan } = await import("../src/storage.ts");
  const normalized = normalizePlan({
    startsOn: "2026-08-03",
    meals: [
      { id: "a", dayIndex: 0, mealType: "lunch", recipeId: "r1", portions: 2, source: "generated", leftoverOf: "a" },
      { id: "b", dayIndex: 0, mealType: "lunch", recipeId: "r2", portions: 2, source: "generated" },
      { id: "c", dayIndex: 1, mealType: "lunch", recipeId: "r3", portions: 2, source: "generated", leftoverOf: "a" },
    ],
  });
  assert.equal(normalized.meals.length, 2);
  assert.equal(normalized.meals[0].leftoverOf, undefined);
  assert.equal(normalized.meals[1].leftoverOf, undefined);
  assert.equal(normalizePlan({ startsOn: "2026-08-04", meals: [{ id: "a", dayIndex: 0, mealType: "lunch", recipeId: "r", portions: 1, source: "generated" }] }), null);
});


test("concurrent tab edits to different fields are merged without data loss", async () => {
  const { mergeAppStateReplicas, reconcileStoredStates, stampAppStateChanges } = await import("../src/storage.ts");
  const base = migrateAppState({ ...state(), stateRevision: 10 });
  const profileEdit = stampAppStateChanges(base, {
    ...base,
    profile: { ...base.profile, firstName: "Synchronisé" },
  }, 100);
  const comfortEdit = stampAppStateChanges(base, {
    ...base,
    textScale: "large",
  }, 101);

  const merged = mergeAppStateReplicas(comfortEdit, profileEdit);
  assert.equal(merged.profile.firstName, "Synchronisé");
  assert.equal(merged.textScale, "large");
  assert.equal(merged.fieldRevisions.profile, 100);
  assert.equal(merged.fieldRevisions.textScale, 101);
  assert.deepEqual(mergeAppStateReplicas(merged, comfortEdit), merged, "une ancienne réplique ne recrée pas une boucle de sauvegarde");

  const tiedProfileEdit = stampAppStateChanges(base, {
    ...base,
    profile: { ...base.profile, firstName: "Même révision" },
  }, 300);
  const tiedComfortEdit = stampAppStateChanges(base, { ...base, textScale: "large" }, 300);
  const reconciledTie = reconcileStoredStates(tiedProfileEdit, tiedComfortEdit);
  assert.equal(reconciledTie.profile.firstName, "Même révision");
  assert.equal(reconciledTie.textScale, "large");

  const collisionA = stampAppStateChanges(base, { ...base, profile: { ...base.profile, firstName: "zzz" } }, 200, "200:mutation-a");
  const collisionB = stampAppStateChanges(base, { ...base, profile: { ...base.profile, firstName: "aaa" } }, 200, "200:mutation-z");
  assert.equal(
    mergeAppStateReplicas(collisionA, collisionB).profile.firstName,
    mergeAppStateReplicas(collisionB, collisionA).profile.firstName,
    "une collision d’horloge converge vers la même valeur dans les deux onglets",
  );
  assert.equal(mergeAppStateReplicas(collisionA, collisionB).profile.firstName, "aaa", "le contenu lexical ne choisit plus le gagnant");
});

test("a durable storage generation makes resets outrank stale clocks without overflow", async () => {
  const { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, mergeAppStateReplicas, stampAppStateChanges } = await import("../src/storage.ts");
  const maxRevisions = Object.fromEntries(APP_STATE_DATA_KEYS.map((key) => [key, Number.MAX_SAFE_INTEGER]));
  const old = migrateAppState({
    ...state({ favoriteRecipeIds: ["ancienne-recette"] }),
    storageGeneration: "0:legacy:legacy",
    stateRevision: Number.MAX_SAFE_INTEGER,
    fieldRevisions: maxRevisions,
  });
  const staleEdit = stampAppStateChanges(old, {
    ...old,
    profile: { ...old.profile, firstName: "Ressuscité" },
  }, Number.MAX_SAFE_INTEGER);
  assert.notEqual(staleEdit.storageGeneration, old.storageGeneration, "une horloge saturée bascule dans une nouvelle génération");
  assert.equal(staleEdit.stateRevision, 0);
  for (const merged of [mergeAppStateReplicas(old, staleEdit), mergeAppStateReplicas(staleEdit, old)]) {
    assert.equal(merged.profile.firstName, "Ressuscité", "la mutation post-saturation gagne dans les deux ordres");
  }
  assert.match(staleEdit.storageGeneration, /^1:rollover:/);
  const tiedResetGeneration = "1:reset:tombstone";
  const tiedResetMutationId = `reset:${tiedResetGeneration}`;
  const tiedReset = migrateAppState({
    ...DEFAULT_APP_STATE,
    storageGeneration: tiedResetGeneration,
    stateRevision: 0,
    fieldRevisions: Object.fromEntries(APP_STATE_DATA_KEYS.map((key) => [key, 0])),
    fieldMutationIds: Object.fromEntries(APP_STATE_DATA_KEYS.map((key) => [key, tiedResetMutationId])),
  });
  for (const merged of [mergeAppStateReplicas(staleEdit, tiedReset), mergeAppStateReplicas(tiedReset, staleEdit)]) {
    assert.equal(merged.storageGeneration, tiedResetGeneration, "à compteur égal, le reset bat le rollover d’un onglet obsolète");
    assert.equal(merged.profile.firstName, "");
  }
  const secondEdit = stampAppStateChanges(staleEdit, { ...staleEdit, textScale: "large" }, 1);
  assert.equal(secondEdit.stateRevision, 1);
  assert.equal(secondEdit.profile.firstName, "Ressuscité");
  assert.equal(secondEdit.textScale, "large");

  const zeroRevisions = Object.fromEntries(APP_STATE_DATA_KEYS.map((key) => [key, 0]));
  const reset = migrateAppState({
    ...state({
      profile: { ...state().profile, firstName: "" },
      favoriteRecipeIds: [],
      history: [],
      actualSpend: {},
      customRecipes: [],
    }),
    storageGeneration: "9007199254740993:reset:reset-a",
    stateRevision: 0,
    fieldRevisions: zeroRevisions,
  });
  for (const merged of [mergeAppStateReplicas(staleEdit, reset), mergeAppStateReplicas(reset, staleEdit)]) {
    assert.equal(merged.storageGeneration, "9007199254740993:reset:reset-a");
    assert.equal(merged.profile.firstName, "");
    assert.deepEqual(merged.favoriteRecipeIds, []);
    assert.equal(Number.isSafeInteger(merged.stateRevision), true);
  }

  const concurrentReset = migrateAppState({ ...reset, storageGeneration: "9007199254740993:reset:reset-z" });
  const converged = mergeAppStateReplicas(reset, concurrentReset);
  assert.equal(converged.storageGeneration, "9007199254740993:reset:reset-z", "deux resets concurrents convergent de façon déterministe");
  assert.equal(converged.profile.firstName, "");
});


test("valid imported leftovers cannot remain locked or cooked", async () => {
  const { normalizePlan } = await import("../src/storage.ts");
  const normalized = normalizePlan({
    startsOn: "2026-08-03",
    meals: [
      { id: "source", dayIndex: 0, mealType: "lunch", recipeId: "r1", portions: 2, source: "generated" },
      { id: "leftover", dayIndex: 1, mealType: "lunch", recipeId: "r1", portions: 2, source: "manual", leftoverOf: "source", completed: true, locked: true },
    ],
  });
  assert.equal(normalized.meals[1].leftoverOf, "source");
  assert.equal(normalized.meals[1].completed, false);
  assert.equal(normalized.meals[1].locked, false);
});

test("daily constraints migrate safely and discard malformed entries", () => {
  const migrated = migrateAppState(state({ profile: {
    ...state().profile,
    dayConstraints: [
      { dayIndex: 0, maxPrepMinutes: 15, portions: 4, mealPortions: [{ mealType: "lunch", portions: 1 }, { mealType: "dinner", portions: 20 }, { mealType: "unknown", portions: 3 }], skippedMealTypes: ["dinner", "unknown"] },
      { dayIndex: 8, maxPrepMinutes: 20, skippedMealTypes: ["lunch"] },
      { dayIndex: 2, maxPrepMinutes: Infinity, portions: -8, skippedMealTypes: [] },
    ],
  } }));
  assert.deepEqual(migrated?.profile.dayConstraints, [
    { dayIndex: 0, maxPrepMinutes: 15, portions: 4, mealPortions: [{ mealType: "lunch", portions: 1 }, { mealType: "dinner", portions: 8 }], skippedMealTypes: ["dinner"] },
    { dayIndex: 2, portions: 1, skippedMealTypes: [] },
  ]);
  assert.deepEqual(migrateAppState(state())?.profile.dayConstraints, []);
});

function controlledIndexedDb() {
  const records = new Map();
  const pendingWrites = [];
  const writeWaiters = [];
  let activeWriters = 0;
  let maxActiveWriters = 0;
  let writesStarted = 0;

  const clone = (value) => value === undefined ? undefined : structuredClone(value);
  const notifyWriteWaiters = () => {
    for (let index = writeWaiters.length - 1; index >= 0; index -= 1) {
      if (writesStarted < writeWaiters[index].count) continue;
      writeWaiters.splice(index, 1)[0].resolve();
    }
  };

  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    close: () => undefined,
    transaction: (_storeName, mode) => {
      const staged = new Map();
      const requests = [];
      let announced = false;
      let finished = false;
      const transaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort: () => {
          if (finished) return;
          finished = true;
          if (mode === "readwrite") activeWriters -= 1;
          queueMicrotask(() => transaction.onabort?.());
        },
        objectStore: () => ({
          get: (key) => {
            const request = { result: clone(records.get(key)), onsuccess: null };
            requests.push(request);
            if (requests.length === 2) {
              queueMicrotask(() => {
                if (finished) return;
                if (mode === "readonly") {
                  finished = true;
                  transaction.oncomplete?.();
                  return;
                }
                request.onsuccess?.();
                if (!announced) {
                  finished = true;
                  activeWriters -= 1;
                  transaction.oncomplete?.();
                }
              });
            }
            return request;
          },
          put: (value, key) => {
            staged.set(key, clone(value));
            if (mode !== "readwrite" || key !== "current" || announced) return {};
            announced = true;
            writesStarted += 1;
            pendingWrites.push({
              release: () => {
                for (const [recordKey, recordValue] of staged) records.set(recordKey, clone(recordValue));
                finished = true;
                activeWriters -= 1;
                queueMicrotask(() => transaction.oncomplete?.());
              },
              reject: () => {
                transaction.error = new Error("Échec IndexedDB contrôlé");
                finished = true;
                activeWriters -= 1;
                queueMicrotask(() => transaction.onerror?.());
              },
            });
            notifyWriteWaiters();
            return {};
          },
        }),
      };
      if (mode === "readwrite") {
        activeWriters += 1;
        maxActiveWriters = Math.max(maxActiveWriters, activeWriters);
      }
      return transaction;
    },
  };

  return {
    factory: {
      open: () => {
        const request = { result: database, error: null, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    },
    waitForWrites: (count) => writesStarted >= count
      ? Promise.resolve()
      : new Promise((resolve) => writeWaiters.push({ count, resolve })),
    releaseNextWrite: () => {
      const pending = pendingWrites.shift();
      assert.ok(pending, "une écriture contrôlée doit être en attente");
      pending.release();
    },
    rejectNextWrite: () => {
      const pending = pendingWrites.shift();
      assert.ok(pending, "une écriture contrôlée doit être en attente");
      pending.reject();
    },
    seed: (key, value) => records.set(key, clone(value)),
    read: (key) => clone(records.get(key)),
    metrics: () => ({ activeWriters, maxActiveWriters, writesStarted, pendingWrites: pendingWrites.length }),
  };
}

function memoryLocalStorage() {
  const records = new Map();
  return {
    getItem: (key) => records.has(key) ? records.get(key) : null,
    setItem: (key, value) => records.set(key, String(value)),
    removeItem: (key) => records.delete(key),
    clear: () => records.clear(),
  };
}

test("rapid saves keep one slow IndexedDB writer and persist the newest exact snapshot", async () => {
  const { saveAppState, stampAppStateChanges } = await import("../src/storage.ts");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const originalBroadcastChannel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  const localStorage = memoryLocalStorage();
  const indexedDb = controlledIndexedDb();

  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDb.factory });
    Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });

    const snapshots = [];
    let current = migrateAppState(state());
    for (let revision = 1; revision <= 100; revision += 1) {
      current = stampAppStateChanges(current, {
        ...current,
        profile: { ...current.profile, firstName: `Mutation ${revision}` },
      }, revision, `${revision}:burst`);
      snapshots.push(current);
    }

    const initialSaves = snapshots.slice(0, 50).map((snapshot) => saveAppState(snapshot));
    await indexedDb.waitForWrites(1);
    assert.deepEqual(indexedDb.metrics(), { activeWriters: 1, maxActiveWriters: 1, writesStarted: 1, pendingWrites: 1 });

    let burstResolved = 0;
    const burstSaves = snapshots.slice(50).map((snapshot) => {
      const operation = saveAppState(snapshot);
      void operation.then(() => { burstResolved += 1; });
      return operation;
    });
    const staleSave = saveAppState(snapshots[9]);
    void staleSave.then(() => { burstResolved += 1; });

    assert.deepEqual(
      JSON.parse(localStorage.getItem("inflamm-menu:app-state")),
      snapshots[99],
      "chaque appel conserve immédiatement le dernier état dans le secours synchrone",
    );
    assert.equal(burstResolved, 0, "aucune Promise récente ne dépend de l’écriture ancienne encore en vol");
    assert.equal(indexedDb.metrics().writesStarted, 1, "la rafale ne démarre pas un second writer en parallèle");

    indexedDb.releaseNextWrite();
    const initialResults = await Promise.all(initialSaves);
    assert.equal(initialResults.every((result) => result.state.stateRevision === snapshots[49].stateRevision), true);
    await indexedDb.waitForWrites(2);
    assert.equal(burstResolved, 0, "même l’appel stale attend la réplique locale plus récente capturée dans sa cible");
    assert.deepEqual(indexedDb.metrics(), { activeWriters: 1, maxActiveWriters: 1, writesStarted: 2, pendingWrites: 1 });

    indexedDb.releaseNextWrite();
    const results = await Promise.all([...burstSaves, staleSave]);
    assert.equal(burstResolved, 51);
    assert.equal(results.every((result) => result.state.stateRevision === snapshots[99].stateRevision), true);
    assert.deepEqual(indexedDb.read("current"), snapshots[99], "IndexedDB termine sur le snapshot exact le plus récent");
    assert.deepEqual(JSON.parse(localStorage.getItem("inflamm-menu:app-state")), snapshots[99]);
    assert.deepEqual(indexedDb.metrics(), { activeWriters: 0, maxActiveWriters: 1, writesStarted: 2, pendingWrites: 0 });
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window;
    if (originalIndexedDb) Object.defineProperty(globalThis, "indexedDB", originalIndexedDb); else delete globalThis.indexedDB;
    if (originalBroadcastChannel) Object.defineProperty(globalThis, "BroadcastChannel", originalBroadcastChannel); else delete globalThis.BroadcastChannel;
  }
});

test("a failed slow writer never resolves from a superseded local snapshot", async () => {
  const { saveAppState, stampAppStateChanges } = await import("../src/storage.ts");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const originalBroadcastChannel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  const localStorage = memoryLocalStorage();
  const indexedDb = controlledIndexedDb();

  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDb.factory });
    Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });

    const base = migrateAppState(state());
    const requested = stampAppStateChanges(base, {
      ...base,
      profile: { ...base.profile, firstName: "Écriture A" },
    }, 1, "1:writer-a");
    const concurrent = stampAppStateChanges(base, { ...base, textScale: "large" }, 2, "2:writer-d");
    const operation = saveAppState(requested);
    await indexedDb.waitForWrites(1);

    const nativeSetItem = localStorage.setItem;
    nativeSetItem("inflamm-menu:app-state", JSON.stringify(concurrent));
    localStorage.setItem = (key, value) => {
      if (key === "inflamm-menu:app-state") throw new Error("localStorage indisponible après la course");
      nativeSetItem(key, value);
    };
    indexedDb.rejectNextWrite();

    await assert.rejects(operation, /Échec IndexedDB contrôlé/);
    assert.deepEqual(JSON.parse(localStorage.getItem("inflamm-menu:app-state")), concurrent);
    assert.deepEqual(indexedDb.metrics(), { activeWriters: 0, maxActiveWriters: 1, writesStarted: 1, pendingWrites: 0 });
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window;
    if (originalIndexedDb) Object.defineProperty(globalThis, "indexedDB", originalIndexedDb); else delete globalThis.indexedDB;
    if (originalBroadcastChannel) Object.defineProperty(globalThis, "BroadcastChannel", originalBroadcastChannel); else delete globalThis.BroadcastChannel;
  }
});

test("a newer reset marker wins a race with the final local snapshot proof", async () => {
  const { saveAppState, stampAppStateChanges } = await import("../src/storage.ts");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const originalBroadcastChannel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  const localStorage = memoryLocalStorage();
  const newerReset = "1:reset:concurrent";

  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: { open: () => { throw new Error("IndexedDB indisponible pour la course reset"); } },
    });
    Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });

    const base = migrateAppState(state());
    const requested = stampAppStateChanges(base, {
      ...base,
      profile: { ...base.profile, firstName: "Ne doit pas franchir le reset" },
    }, 1, "1:before-reset");
    const nativeSetItem = localStorage.setItem;
    let injectReset = true;
    localStorage.setItem = (key, value) => {
      nativeSetItem(key, value);
      if (injectReset && key === "inflamm-menu:app-state") {
        injectReset = false;
        nativeSetItem("inflamm-menu:reset-marker", newerReset);
      }
    };

    const result = await saveAppState(requested);
    const persisted = JSON.parse(localStorage.getItem("inflamm-menu:app-state"));
    assert.equal(result.state.storageGeneration, newerReset);
    assert.equal(persisted.storageGeneration, newerReset);
    assert.equal(persisted.profile.firstName, "");
    assert.equal(localStorage.getItem("inflamm-menu:reset-marker"), newerReset);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window;
    if (originalIndexedDb) Object.defineProperty(globalThis, "indexedDB", originalIndexedDb); else delete globalThis.indexedDB;
    if (originalBroadcastChannel) Object.defineProperty(globalThis, "BroadcastChannel", originalBroadcastChannel); else delete globalThis.BroadcastChannel;
  }
});

test("an IndexedDB snapshot newer than its missing marker cannot be overwritten by a stale save", async () => {
  const { replaceAppStateData, saveAppState, stampAppStateChanges } = await import("../src/storage.ts");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const originalBroadcastChannel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  const localStorage = memoryLocalStorage();
  const indexedDb = controlledIndexedDb();

  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDb.factory });
    Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });

    const base = migrateAppState(state());
    const stale = stampAppStateChanges(base, {
      ...base,
      profile: { ...base.profile, firstName: "Écriture obsolète" },
    }, 1, "1:stale");
    const newer = replaceAppStateData(base, migrateAppState(state({
      profile: { ...state().profile, firstName: "Réplique IndexedDB plus récente" },
    })));
    indexedDb.seed("current", newer);

    const operation = saveAppState(stale);
    await indexedDb.waitForWrites(1);
    indexedDb.releaseNextWrite();
    const result = await operation;

    assert.deepEqual(result.state, newer);
    assert.deepEqual(indexedDb.read("current"), newer);
    assert.deepEqual(JSON.parse(localStorage.getItem("inflamm-menu:app-state")), newer);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window;
    if (originalIndexedDb) Object.defineProperty(globalThis, "indexedDB", originalIndexedDb); else delete globalThis.indexedDB;
    if (originalBroadcastChannel) Object.defineProperty(globalThis, "BroadcastChannel", originalBroadcastChannel); else delete globalThis.BroadcastChannel;
  }
});

const { loadAppState, saveAppState, DEFAULT_APP_STATE } = await import('../src/storage.ts');
for (const [name, raw] of [
 ['JSON tronqué', '{"version":3,"profile":{"firstName":"À récupérer"}'],
 ['version future', JSON.stringify({version:999, profile:{firstName:'À récupérer'},favoriteRecipeIds:['sentinel']})],
 ['valeur invalide', 'null'],
]) {
 test(`préserve ${name} au démarrage et à l’écriture`, async () => {
  const originalWindow = globalThis.window;
  const originalIndexedDB = globalThis.indexedDB;
  const data = new Map([['inflamm-menu:app-state',raw]]);
  globalThis.window = {localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}};
  delete globalThis.indexedDB;
  try {
   await assert.rejects(loadAppState());
   assert.equal(data.get('inflamm-menu:app-state'),raw);
   await assert.rejects(saveAppState(DEFAULT_APP_STATE));
   assert.equal(data.get('inflamm-menu:app-state'),raw);
  } finally {
   if(originalWindow===undefined)delete globalThis.window; else globalThis.window=originalWindow;
   if(originalIndexedDB===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=originalIndexedDB;
  }
 });
}

test('un reset explicitement demandé peut remplacer une sauvegarde illisible', async () => {
  const { resetAppState } = await import('../src/storage.ts');
  const originalWindow = globalThis.window;
  const storage = memoryLocalStorage();
  storage.setItem('inflamm-menu:app-state', '{"version":999');
  globalThis.window = { localStorage: storage };
  try {
    await resetAppState();
    assert.equal(JSON.parse(storage.getItem('inflamm-menu:app-state')).version, APP_STATE_VERSION);
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  }
});
