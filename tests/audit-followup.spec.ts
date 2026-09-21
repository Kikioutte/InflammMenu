import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PROFILE, type Recipe, type WeeklyPlan } from "../src/domain";
import { generateWeeklyPlan, plannedMealCost } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { canonicalIngredientId } from "../src/shopping";
import { DEFAULT_APP_STATE, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block" });

const storageKey = "inflamm-menu:app-state";
const today = "2026-09-21T12:00:00Z";
const personalId = "perso-audit-followup";

function personalRecipe(): Recipe {
  return {
    ...structuredClone(RECIPES.find((recipe) => recipe.mealTypes.includes("lunch"))!),
    id: personalId,
    title: "Ma recette préservée",
    mealTypes: ["lunch", "dinner"],
    prepMinutes: 15,
    costPerPortion: 2,
    costRecalculated: true,
    seasons: ["all-year"],
    equipment: ["hob"],
    allergens: [],
    tags: [],
    ingredients: [{ id: "brown-rice", name: "riz complet", quantity: 5, unit: "g", category: "grocery" }],
    nutrition: { calories: 100, protein: 3, fiber: 2, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    nutritionRecalculated: true,
    steps: ["Cuire le riz et servir."],
  };
}

function fixtureState({ withPlans = false, recipe = personalRecipe() }: { withPlans?: boolean; recipe?: Recipe } = {}): AppState {
  const profile = { ...structuredClone(DEFAULT_PROFILE), firstName: "Données préservées", maxPrepMinutes: 90, weeklyBudget: 200 };
  const recipes = [...RECIPES, recipe];
  const withPersonal = (startsOn: string): WeeklyPlan => {
    const original = generateWeeklyPlan(RECIPES, profile, { seed: `followup-${startsOn}`, startsOn });
    const meals = original.meals.map((meal, index) => index === 0 ? { ...meal, recipeId: recipe.id, source: "manual" as const } : meal);
    const byId = new Map(recipes.map((entry) => [entry.id, entry]));
    return { ...original, meals, estimatedCost: Math.round(meals.reduce((sum, meal) => sum + plannedMealCost(byId.get(meal.recipeId)!, meal), 0) * 100) / 100 };
  };
  const currentPlan = withPlans ? withPersonal("2026-09-21") : null;
  return {
    ...structuredClone(DEFAULT_APP_STATE),
    profile,
    customRecipes: [recipe],
    onboardingCompleted: true,
    favoriteRecipeIds: [recipe.id],
    recipeNotes: { [recipe.id]: "Cette note doit rester" },
    recipeCollections: [{ id: "collection-followup", name: "Recettes à garder", recipeIds: [recipe.id] }],
    shoppingItems: [{ id: "article-followup", name: "Papier cuisson", checked: true }],
    shoppingRecipes: [{ recipe: structuredClone(recipe), portions: 3 }],
    currentPlan,
    upcomingPlan: withPlans ? withPersonal("2026-09-28") : null,
    history: withPlans ? [withPersonal("2026-09-14")] : [],
    actualSpend: currentPlan ? { [currentPlan.id]: 72.5 } : {},
  };
}

// Seed both replicas before the app is mounted; this does not race autosave.
async function seed(page: Page, state: AppState) {
  await page.clock.setFixedTime(new Date(today));
  await page.goto("/tests/error-boundary-fixture.html");
  await page.evaluate(async ({ state, storageKey }) => {
    localStorage.removeItem("inflamm-menu:reset-marker");
    localStorage.setItem(storageKey, JSON.stringify(state));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("app-state");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        transaction.objectStore("app-state").delete("reset-marker");
        transaction.objectStore("app-state").put(state, "current");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  }, { state, storageKey });
}

async function open(page: Page, state: AppState) {
  await seed(page, state);
  await page.goto("/");
  await expect(page.getByTestId("home-view")).toBeVisible();
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

async function nav(page: Page, name: string) {
  await page.getByTestId("flow-current").getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }).click();
}

async function openPersonal(page: Page) {
  await nav(page, "Recette");
  await page.getByRole("tab", { name: "Favoris", exact: true }).click();
  await page.locator(".favorite-card").filter({ hasText: "Ma recette préservée" }).click();
  await expect(page.getByRole("heading", { name: "Ma recette préservée", exact: true })).toBeVisible();
}

function expectPreserved(actual: AppState, expected: AppState) {
  expect(actual.favoriteRecipeIds).toEqual(expected.favoriteRecipeIds);
  expect(actual.recipeNotes).toEqual(expected.recipeNotes);
  expect(actual.recipeCollections).toEqual(expected.recipeCollections);
  expect(actual.shoppingItems).toEqual(expected.shoppingItems);
  expect(actual.shoppingRecipes).toEqual(expected.shoppingRecipes);
  expect(actual.actualSpend).toEqual(expected.actualSpend);
}

test("une restriction inconnue reste visible et ne devient pas une fausse protection @webkit-smoke", async ({ page }) => {
  await open(page, fixtureState());
  const before = await readState(page);
  await page.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  const allergy = page.getByLabel(/^Autre allergie ou ingrédient à exclure/);
  await allergy.fill("ingredientauditinconnu");
  await page.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/reconnu|inconnu|identifi/i);
  await expect(allergy).toHaveValue("ingredientauditinconnu");
  expect((await readState(page)).profile).toEqual(before.profile);
  await allergy.fill("");
  await page.getByLabel(/^Aliments refusés/).fill("alimentauditinconnu");
  await page.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/reconnu|inconnu|identifi/i);
  expect((await readState(page)).profile).toEqual(before.profile);
  expectPreserved(await readState(page), before);
});

test("une allergie saisie comme ingrédient exact exclut cet ingrédient du menu", async ({ page }) => {
  const state = fixtureState({ withPlans: true });
  state.upcomingPlan = null;
  const salmon = RECIPES.find((recipe) => recipe.id === "bowl-saumon-riz-complet-avocat")!;
  const firstMeal = state.currentPlan!.meals[0];
  state.currentPlan!.meals = state.currentPlan!.meals.map((meal) => meal.id === firstMeal.id ? { ...meal, recipeId: salmon.id } : meal);
  state.currentPlan!.estimatedCost = Math.round((state.currentPlan!.estimatedCost + (salmon.costPerPortion - state.customRecipes[0].costPerPortion) * firstMeal.portions) * 100) / 100;
  await open(page, state);
  const before = await readState(page);
  expect(before.currentPlan!.meals[0].recipeId).toBe(salmon.id);
  await page.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  await page.getByLabel(/^Autre allergie ou ingrédient à exclure/).fill("saumon");
  await page.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await expect.poll(async () => (await readState(page)).currentPlan).toBeNull();
  expect((await readState(page)).history.some((plan) => plan.id === before.currentPlan!.id)).toBe(true);
  await page.getByRole("button", { name: "Générer ma semaine", exact: true }).click();
  await page.getByRole("button", { name: "Créer ma semaine", exact: true }).click();
  await page.getByRole("button", { name: "Voir ma semaine", exact: true }).click();
  await expect.poll(async () => (await readState(page)).currentPlan?.meals.length).toBe(14);
  const stored = await readState(page);
  expect(stored.profile.allergies).toContain("saumon");
  const recipes = new Map([...RECIPES, ...stored.customRecipes].map((recipe) => [recipe.id, recipe]));
  for (const meal of stored.currentPlan!.meals) {
    expect(recipes.get(meal.recipeId)!.ingredients.some((ingredient) => canonicalIngredientId(ingredient.id) === canonicalIngredientId("salmon"))).toBe(false);
  }
});

test("le profil refuse les nombres vides ou hors limites et accepte un budget à virgule @webkit-smoke", async ({ page }) => {
  await open(page, fixtureState());
  const before = await readState(page);
  await page.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  const budget = page.getByLabel(/^Budget hebdomadaire/);
  const minutes = page.getByLabel(/^Temps actif maximum en cuisine/);
  await budget.fill("");
  await page.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/budget/i);
  expect((await readState(page)).profile).toEqual(before.profile);
  await budget.fill("120,50");
  await minutes.fill("0");
  await page.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/temps|minute/i);
  expect((await readState(page)).profile).toEqual(before.profile);
  await minutes.fill("90");
  await page.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await expect.poll(async () => (await readState(page)).profile.weeklyBudget).toBe(120.5);
});

test("une modification personnelle invalide ne supprime ni la recette ni ses données @webkit-smoke", async ({ page }) => {
  await open(page, fixtureState());
  const before = await readState(page);
  await openPersonal(page);
  await page.getByTestId("edit-custom-recipe").click();
  await page.getByTestId("custom-time").fill("");
  await page.getByTestId("custom-save").click();
  await expect(page.getByRole("alert")).toContainText(/temps|minute/i);
  await page.getByTestId("custom-time").fill("15");
  await page.getByTestId("custom-steps").fill("");
  await page.getByTestId("custom-save").click();
  await expect(page.getByRole("alert")).toContainText(/étape|préparation/i);
  await page.getByTestId("custom-steps").fill("Cuire le riz et servir.");
  await page.getByRole("button", { name: "Réduire riz complet", exact: true }).click();
  await page.getByTestId("custom-save").click();
  await expect(page.getByRole("alert")).toContainText(/ingrédient/i);
  expect((await readState(page)).customRecipes).toEqual(before.customRecipes);
  expectPreserved(await readState(page), before);
  await page.reload();
  await openPersonal(page);
  await expect(page.getByTestId("recipe-note-input")).toHaveValue("Cette note doit rester");
  await expect(page.getByRole("button", { name: "Enregistrée", exact: true })).toBeVisible();
});

test("quitter une version pendant son recalcul annule la sauvegarde en attente", async ({ page }) => {
  const recipe = personalRecipe();
  recipe.id = "perso-catalog-r001-audit";
  await open(page, fixtureState({ recipe }));
  const before = await readState(page);
  let release!: () => void;
  let requested!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { requested = resolve; });
  await page.route("**/src/data/recipe-nutrition.json*", async (route) => {
    requested();
    await held;
    await route.continue();
  });
  await openPersonal(page);
  await page.getByTestId("duplicate-recipe").click();
  await page.getByTestId("custom-title").fill("Version annulée pendant le calcul");
  await page.getByTestId("custom-save").click();
  await started;
  await expect(page.getByTestId("custom-save")).toBeDisabled();
  await expect(page.getByTestId("custom-title")).toBeDisabled();
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await expect(page.getByTestId("custom-recipe-view")).toHaveCount(0);
  const responsePromise = page.waitForResponse((response) => response.url().includes("/src/data/recipe-nutrition.json"));
  release();
  const response = await responsePromise;
  // Await the actual module evaluation, not an arbitrary timeout: any pending
  // save continuation has now had the opportunity to commit or cancel.
  await page.evaluate(async (url) => { await import(url); }, response.url());
  expect((await readState(page)).customRecipes).toEqual(before.customRecipes);
  expectPreserved(await readState(page), before);
  await page.reload();
  expect((await readState(page)).customRecipes).toEqual(before.customRecipes);
});

test("modifier les quantités actualise les deux semaines sans réécrire historique ou dépenses", async ({ page }) => {
  await open(page, fixtureState({ withPlans: true }));
  const before = await readState(page);
  expect(before.currentPlan).not.toBeNull();
  expect(before.upcomingPlan).not.toBeNull();
  await openPersonal(page);
  await page.getByTestId("edit-custom-recipe").click();
  await page.getByRole("button", { name: "Augmenter riz complet", exact: true }).click();
  await page.getByTestId("custom-save").click();
  await expect(page.getByRole("heading", { name: "Ma recette préservée", exact: true })).toBeVisible();
  await expect.poll(async () => (await readState(page)).customRecipes[0].costPerPortion).toBe(4);
  const after = await readState(page);
  for (const field of ["currentPlan", "upcomingPlan"] as const) {
    const previous = before[field]!;
    const portionCount = previous.meals.filter((meal) => meal.recipeId === personalId && !meal.skipped).reduce((total, meal) => total + meal.portions, 0);
    expect(after[field]!.estimatedCost).toBeCloseTo(previous.estimatedCost + 2 * portionCount, 2);
    expect(after[field]!.meals).toEqual(previous.meals);
  }
  expect(after.history).toEqual(before.history);
  expect(after.customRecipes[0].nutrition.calories).toBe(200);
  await expect(page.locator(".nutrition-section")).toContainText("200");
  expectPreserved(after, before);
  await page.reload();
  const persisted = await readState(page);
  expect(persisted.currentPlan!.estimatedCost).toBe(after.currentPlan!.estimatedCost);
  expect(persisted.upcomingPlan!.estimatedCost).toBe(after.upcomingPlan!.estimatedCost);
  expectPreserved(persisted, before);
});

test("une estimation impossible est annoncée et les anciennes valeurs nutritionnelles sont masquées", async ({ page }) => {
  const recipe = personalRecipe();
  recipe.ingredients = [...recipe.ingredients, { id: "ingredient-personnel-sans-correspondance", name: "Ingrédient personnel sans correspondance", quantity: 5, unit: "g", category: "grocery" }];
  await open(page, fixtureState({ recipe }));
  await openPersonal(page);
  await page.getByTestId("edit-custom-recipe").click();
  await page.getByRole("button", { name: "Augmenter riz complet", exact: true }).click();
  await page.getByTestId("custom-save").click();
  await expect(page.getByRole("heading", { name: "Ma recette préservée", exact: true })).toBeVisible();
  await expect(page.locator(".nutrition-section")).toContainText(/indisponibl|non recalcul|pas.*recalcul/i);
  await expect(page.locator(".nutrition-section")).not.toContainText(/100\s*kcal/);
  await expect(page.getByTestId("flow-current")).toContainText(/coût.*non recalcul|coût.*pas.*recalcul|ancienne estimation/i);
  await page.reload();
  await openPersonal(page);
  await expect(page.locator(".nutrition-section")).toContainText(/indisponibl|non recalcul|pas.*recalcul/i);
});

test("une dépense avec virgule se conserve lorsqu’une saisie suivante est invalide @webkit-smoke", async ({ page }) => {
  await open(page, fixtureState({ withPlans: true }));
  const planId = (await readState(page)).currentPlan!.id;
  await nav(page, "Courses");
  const input = page.getByTestId("spend-input");
  await input.fill("81,25");
  await expect.poll(async () => (await readState(page)).actualSpend[planId]).toBe(81.25);
  await expect(input).toHaveValue("81,25");
  await input.fill("12,3,4");
  await input.blur();
  await expect(page.getByRole("alert")).toContainText(/montant|nombre|dépens/i);
  expect((await readState(page)).actualSpend[planId]).toBe(81.25);
  await page.reload();
  await nav(page, "Courses");
  await expect(page.getByTestId("spend-tracker")).toContainText("81,25 € dépensés");
});

test("un accès interdit au marqueur des rappels ne bloque pas l’application", async ({ page }) => {
  const state = fixtureState({ withPlans: true });
  state.remindersEnabled = true;
  await seed(page, state);
  await page.addInitScript(() => {
    Object.defineProperty(window, "Notification", { configurable: true, value: class { static permission = "granted"; } });
    const originalGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === "inflamm-menu:reminded-on") throw new DOMException("Storage blocked by browser policy", "SecurityError");
      return originalGet.call(this, key);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("home-view")).toBeVisible();
  await nav(page, "Semaine");
  await expect(page.getByTestId("week-view")).toBeVisible();
  expect((await readState(page)).remindersEnabled).toBe(true);
  expect(errors).toEqual([]);
});

test("rétablir un ingrédient allergène est refusé sans modifier le plat et ses restes", async ({ page }) => {
  const recipe = personalRecipe();
  recipe.ingredients = [{ id: "walnut", name: "noix", quantity: 5, unit: "g", category: "grocery", allergens: ["fruits-a-coque"] }];
  recipe.allergens = ["fruits-a-coque"];
  const state = fixtureState({ recipe });
  state.profile.allergies = ["fruits-a-coque"];
  const plan = generateWeeklyPlan(RECIPES, state.profile, { seed: "allergy-removal-followup", startsOn: "2026-09-21" });
  const source = plan.meals[0];
  const target = plan.meals.find((meal) => meal.dayIndex === 1 && meal.mealType === source.mealType)!;
  const substitutions = [{ ingredientId: "walnut", substitutionId: "nuts-to-pumpkin-seeds" }];
  plan.meals = plan.meals.map((meal) => meal.id === source.id || meal.id === target.id
    ? { ...meal, recipeId: recipe.id, substitutions, ...(meal.id === target.id ? { leftoverOf: source.id } : {}) }
    : meal);
  const byId = new Map([...RECIPES, recipe].map((item) => [item.id, item]));
  plan.estimatedCost = Math.round(plan.meals.reduce((sum, meal) => sum + plannedMealCost(byId.get(meal.recipeId)!, meal), 0) * 100) / 100;
  state.currentPlan = plan;
  await open(page, state);
  const before = await readState(page);
  await nav(page, "Semaine");
  await page.locator(".day-card").first().click();
  await page.getByTestId(`meal-card-${source.id}`).locator(".meal-card__main").click();
  await page.getByTestId("ingredient-substitute-walnut").click();
  await page.getByRole("button", { name: /Ingrédient d’origine/ }).click();
  await expect(page.getByRole("alert")).toContainText(/allerg|incompatib|profil/i);
  expect((await readState(page)).currentPlan).toEqual(before.currentPlan);
  await expect(page.getByTestId("substitution-summary")).toBeVisible();
  expectPreserved(await readState(page), before);
});

test("une sauvegarde avec équipement inconnu est refusée avant confirmation", async ({ page }) => {
  await open(page, fixtureState());
  const before = await readState(page);
  await page.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  const imported = structuredClone(before);
  imported.profile.equipment = ["foo"] as never;
  await page.getByTestId("backup-import").setInputFiles({
    name: "equipement-inconnu.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "inflamm-menu-backup", version: before.version, exportedAt: today, state: imported })),
  });
  await expect(page.getByTestId("backup-card").getByRole("alert")).toContainText(/équipement/i);
  await expect(page.getByTestId("backup-confirmation")).toHaveCount(0);
  expect((await readState(page)).profile).toEqual(before.profile);
  expectPreserved(await readState(page), before);
});

test("une sauvegarde provenant d’un autre chemin garde ses images et son grille-pain", async ({ page }) => {
  await open(page, fixtureState());
  const before = await readState(page);
  await page.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  const imported = structuredClone(before);
  imported.profile.equipment = ["hob", "toaster"];
  imported.customRecipes[0].image = "/AncienneApplication/assets/recipes/tartine-avocat-tomate-oeuf.jpg";
  await page.getByTestId("backup-import").setInputFiles({
    name: "sauvegarde-autre-chemin.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "inflamm-menu-backup", version: before.version, exportedAt: today, state: imported })),
  });
  await expect(page.getByTestId("backup-confirmation")).toBeVisible();
  await page.getByTestId("backup-confirm").click();
  await expect.poll(async () => (await readState(page)).profile.equipment).toEqual(["hob", "toaster"]);
  const restored = await readState(page);
  expect(restored.customRecipes[0].image).toBe("/assets/recipes/tartine-avocat-tomate-oeuf.jpg");
  expectPreserved(restored, before);
  await page.reload();
  await openPersonal(page);
  await expect(page.locator(".recipe-hero")).toHaveAttribute("src", "/assets/recipes/tartine-avocat-tomate-oeuf.jpg");
});
