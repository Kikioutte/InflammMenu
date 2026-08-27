import assert from "node:assert/strict";
import test from "node:test";

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
  const { exportAppState, importAppState, BACKUP_FORMAT } = await import("../src/storage.ts");
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
  const { importAppState, BACKUP_FORMAT } = await import("../src/storage.ts");

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
    MAX_BACKUP_BYTES,
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
  const { importAppState, HISTORY_LIMIT } = await import("../src/storage.ts");
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
  const { importAppState, migrateAppState } = await import("../src/storage.ts");
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

test("personal recipes survive a Pages base path and an invalid image only falls back", () => {
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
    ingredients: [{ id: "carrot", name: "Carotte", quantity: 100, unit: "g", category: "fruit-vegetable" }],
    nutrition: { calories: 100, protein: 2, fiber: 3, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "Une version personnelle valide.",
    steps: ["Préparer les ingrédients."],
    conservation: "À consommer rapidement.",
    image: "/InflammMenu/assets/recipes/ma-recette.jpg",
  };

  const pagesState = migrateAppState(state({ customRecipes: [customRecipe] }));
  assert.equal(pagesState.customRecipes.length, 1);
  assert.equal(pagesState.customRecipes[0].image, "/InflammMenu/assets/recipes/ma-recette.jpg");

  const unsafeState = migrateAppState(state({
    customRecipes: [{ ...customRecipe, image: "javascript:alert(1)" }],
  }));
  assert.equal(unsafeState.customRecipes.length, 1, "une image invalide ne détruit jamais la recette");
  assert.equal(unsafeState.customRecipes[0].image, "/assets/recipe-placeholder.svg");
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
