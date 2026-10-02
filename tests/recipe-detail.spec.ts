import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PROFILE, type WeeklyPlan } from "../src/domain";
import { buildShoppingList, generateWeeklyPlan, planLeftover, refreshPlanEstimate, setMealPortions } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { DEFAULT_APP_STATE, type AppState } from "../src/storage";
import { formatIngredientQuantity } from "../src/presentation";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
const storageKey = "inflamm-menu:app-state";
const today = "2026-09-28T12:00:00Z";

function fixtureState(): AppState {
  const profile = { ...structuredClone(DEFAULT_PROFILE), weeklyBudget: 200 };
  return { ...structuredClone(DEFAULT_APP_STATE), profile, onboardingCompleted: true, currentPlan: generateWeeklyPlan(RECIPES, profile, { seed: "detail-regression", startsOn: "2026-09-28" }) };
}

async function seedAndOpen(page: Page, state: AppState, openPlanned = true) {
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
        const db = request.result;
        const tx = db.transaction("app-state", "readwrite");
        tx.objectStore("app-state").delete("reset-marker");
        tx.objectStore("app-state").put(state, "current");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, { state, storageKey });
  await page.goto("/");
  await expect(page.getByTestId("home-view")).toBeVisible();
  if (openPlanned) {
    await page.getByRole("button", { name: "Semaine", exact: true }).click();
    await page.locator(".day-card").first().click();
    await page.getByTestId(`meal-card-${state.currentPlan!.meals[0].id}`).locator(".meal-card__main").click();
  } else {
    await page.getByRole("button", { name: "Recette", exact: true }).click();
    await page.getByRole("tab", { name: "Favoris", exact: true }).click();
    await page.locator(".favorite-card").first().click();
  }
  await expect(page.getByTestId("recipe-portions")).toBeVisible();
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

async function peerTab(page: Page): Promise<Page> {
  const peer = await page.context().newPage();
  await peer.clock.setFixedTime(new Date(today));
  await peer.goto("/");
  await expect(peer.getByTestId("home-view")).toBeVisible();
  return peer;
}

async function updateFromPeer(peer: Page, currentPlan: WeeklyPlan | null, restore = false): Promise<AppState> {
  return peer.evaluate(async ({ currentPlan, restore }) => {
    const { loadAppState, saveAppState, stampAppStateChanges, replaceAppStateData } = await import("/src/storage.ts");
    const current = await loadAppState();
    const next = restore ? replaceAppStateData(current, current) : stampAppStateChanges(current, { ...current, currentPlan }, current.stateRevision + 1);
    return (await saveAppState(next)).state;
  }, { currentPlan, restore });
}

for (const screen of ["recipe", "cooking"] as const) {
  for (const changed of ["replacement", "week", "generation", "removed"] as const) {
    test(`${screen}: une fiche devenue périmée dans un autre onglet ne propose plus aucune action (${changed}) @webkit-smoke`, async ({ page }) => {
      const state = fixtureState();
      await seedAndOpen(page, state);
      if (screen === "cooking") await page.getByTestId("start-cooking").click();
      const peer = await peerTab(page);
      let plan: WeeklyPlan | null = structuredClone(state.currentPlan!);
      if (changed === "replacement") {
        const source = plan.meals[0];
        const replacement = RECIPES.find((recipe) => recipe.id !== source.recipeId && recipe.mealTypes.includes(source.mealType))!;
        plan = refreshPlanEstimate({ ...plan, meals: plan.meals.map((meal) => meal.id === source.id ? { ...meal, recipeId: replacement.id } : meal) }, RECIPES);
      } else if (changed === "week") plan.id = `${plan.id}-new`;
      else if (changed === "removed") plan = null;
      const saved = await updateFromPeer(peer, plan, changed === "generation");
      const current = page.getByTestId("flow-current");
      await expect(current.getByTestId("stale-meal-action")).toBeVisible();
      await expect(current.getByRole("alert")).toContainText("rouvrez le repas");
      await expect(current.getByTestId("recipe-portions")).toHaveCount(0);
      await expect(current.getByTestId("start-cooking")).toHaveCount(0);
      await expect(current.getByTestId("cooking-view")).toHaveCount(0);
      await expect(current.getByRole("button", { name: "Ajouter", exact: true })).toHaveCount(0);
      await expect(current.getByRole("button", { name: "Ajouter aux courses", exact: true })).toHaveCount(0);
      expect((await readState(page)).currentPlan).toEqual(saved.currentPlan);
      await peer.close();
    });
  }
}

test("les portions de la même fiche restent réglables, synchronisées et cohérentes dans le mode cuisine @webkit-smoke", async ({ page }) => {
  const state = fixtureState();
  await seedAndOpen(page, state);
  await page.getByRole("button", { name: "Ajouter une portion", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une portion", exact: true }).click();
  await expect(page.getByTestId("recipe-portions")).toHaveText("4");
  const peer = await peerTab(page);
  const updated = setMealPortions((await readState(page)).currentPlan!, state.currentPlan!.meals[0].id, 5, RECIPES);
  await updateFromPeer(peer, updated);
  await expect(page.getByTestId("recipe-portions")).toHaveText("5");
  await page.getByTestId("start-cooking").click();
  await expect(page.getByTestId("cooking-view").getByRole("heading", { name: "Ingrédients pour 5 portions" })).toBeVisible();
  await updateFromPeer(peer, setMealPortions(updated, state.currentPlan!.meals[0].id, 6, RECIPES));
  await expect(page.getByTestId("cooking-view").getByRole("heading", { name: "Ingrédients pour 6 portions" })).toBeVisible();
  await peer.close();
});

test("le lot de cuisine inclut deux repas de restes et ne modifie pas les courses @webkit-smoke", async ({ page }) => {
  const state = fixtureState();
  const source = state.currentPlan!.meals[0];
  const targets = state.currentPlan!.meals.filter((meal) => meal.mealType === source.mealType && meal.dayIndex > source.dayIndex && meal.dayIndex <= source.dayIndex + 2);
  state.currentPlan = planLeftover(state.currentPlan!, source.id, targets[0].id, RECIPES);
  state.currentPlan = planLeftover(state.currentPlan, source.id, targets[1].id, RECIPES);
  state.currentPlan = setMealPortions(state.currentPlan, targets[0].id, 3, RECIPES);
  state.currentPlan = setMealPortions(state.currentPlan, targets[1].id, 4, RECIPES);
  const before = buildShoppingList(state.currentPlan, RECIPES);
  await seedAndOpen(page, state);
  await expect(page.getByTestId("recipe-portions")).toHaveText("2");
  await expect(page.getByTestId("preparation-portions")).toContainText("Préparer 9 portions au total : 2 à servir à ce repas et 7 à réserver");
  const recipe = RECIPES.find((entry) => entry.id === source.recipeId)!;
  const firstIngredient = recipe.ingredients[0];
  const expectedQuantity = formatIngredientQuantity(firstIngredient.quantity * 9, firstIngredient.unit);
  await expect(page.locator(".ingredient-list")).toContainText(expectedQuantity);
  await page.getByTestId("start-cooking").click();
  await expect(page.getByTestId("cooking-view").getByRole("heading", { name: "Ingrédients pour 9 portions" })).toBeVisible();
  await expect(page.getByTestId("cooking-batch-portions")).toContainText("2 portions à servir à ce repas et 7 à réserver");
  await expect(page.locator(".cooking-ingredients")).toContainText(expectedQuantity);
  expect(buildShoppingList((await readState(page)).currentPlan!, RECIPES)).toEqual(before);
  expect((await readState(page)).shoppingRecipes).toEqual([]);
});

for (const rating of ["avoided", "meh"] as const) {
  test(`le cœur remplace ${rating} par J’aime et retrouve Sans avis quand on le retire @webkit-smoke`, async ({ page }) => {
    const state = fixtureState();
    state.favoriteRecipeIds = [state.currentPlan!.meals[0].recipeId];
    // Open the recipe independently of the plan: choosing "avoided" correctly
    // archives an incompatible week, which must invalidate a planned detail.
    await seedAndOpen(page, state, false);
    await page.getByTestId(`rating-${rating}`).click();
    await expect(page.getByTestId(`rating-${rating}`)).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByTestId("rating-loved")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(`rating-${rating}`)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Enregistrée", exact: true })).toBeVisible();
    const saved = await readState(page);
    expect(saved.favoriteRecipeIds).toContain(state.currentPlan!.meals[0].recipeId);
    expect(saved.profile.dislikedRecipeIds).not.toContain(state.currentPlan!.meals[0].recipeId);
    expect(saved.profile.softDislikedRecipeIds).not.toContain(state.currentPlan!.meals[0].recipeId);
    await page.getByRole("button", { name: "Enregistrée", exact: true }).click();
    await expect(page.getByTestId("rating-neutral")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Ajouter", exact: true })).toBeVisible();
  });
}
