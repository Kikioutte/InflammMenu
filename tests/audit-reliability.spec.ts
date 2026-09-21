import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEFAULT_PROFILE, type PlannedMeal } from "../src/domain";
import { generateWeeklyPlan, leftoverCandidates, canSwapPlannedMeals, plannedMealCost } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { DEFAULT_APP_STATE, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block" });

const storageKey = "inflamm-menu:app-state";
const recipeById = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
type MealAction = "replace" | "leftover" | "swap";

function fixtureState(): AppState {
  const profile = { ...DEFAULT_PROFILE, firstName: "Avant correction" };
  const monday = new Date();
  monday.setUTCHours(12, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const plan = generateWeeklyPlan(RECIPES, profile, { seed: "audit-reliability", startsOn: monday.toISOString().slice(0, 10) });
  return {
    ...structuredClone(DEFAULT_APP_STATE),
    profile,
    currentPlan: plan,
    onboardingCompleted: true,
    favoriteRecipeIds: [plan.meals[0].recipeId],
    recipeCollections: [{ id: "collection-preserve", name: "À conserver", recipeIds: [plan.meals[0].recipeId] }],
    shoppingItems: [{ id: "article-preserve", name: "Papier cuisson", checked: true }],
    shoppingRecipes: [{ recipe: recipeById.get(plan.meals[0].recipeId)!, portions: 3 }],
    recipeNotes: { [plan.meals[0].recipeId]: "Note à conserver" },
  };
}

// The fixture has no live app store: raw seeding cannot race a startup save.
async function writeRawReplicas(page: Page, localRaw: string | null, indexedRaw: unknown = null) {
  await page.goto("/tests/error-boundary-fixture.html");
  await page.evaluate(async ({ localRaw, indexedRaw, storageKey }) => {
    localStorage.removeItem("inflamm-menu:reset-marker");
    if (localRaw === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, localRaw);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("app-state");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        const store = transaction.objectStore("app-state");
        store.delete("reset-marker");
        if (indexedRaw === null) store.delete("current");
        else store.put(indexedRaw, "current");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  }, { localRaw, indexedRaw, storageKey });
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

async function openSeededWeek(page: Page) {
  const state = fixtureState();
  await writeRawReplicas(page, JSON.stringify(state), state);
  await page.goto("/");
  await expect(page.getByTestId("home-view")).toBeVisible();
  const peer = await page.context().newPage();
  await peer.goto("/");
  await expect(peer.getByTestId("home-view")).toBeVisible();
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
  await page.locator(".day-card").first().click();
  return { state: await readState(page), peer };
}

async function openAction(page: Page, action: MealAction, meal: PlannedMeal) {
  const card = page.getByTestId(`meal-card-${meal.id}`);
  if (action === "replace") {
    await card.getByRole("button", { name: "Remplacer", exact: true }).click();
    await expect(page.locator(".replace-page")).toBeVisible();
  } else {
    await card.getByTestId(`meal-actions-${meal.id}`).click();
    await page.getByTestId(`action-${action}`).click();
    await expect(page.getByTestId(`${action}-view`)).toBeVisible();
  }
}

// A real second tab writes through the same public persistence API as the app.
// The first tab must react to actual storage/BroadcastChannel notifications.
async function updateFromPeer(peer: Page, patch: Partial<AppState>) {
  return peer.evaluate(async (patch) => {
    const { loadAppState, saveAppState, stampAppStateChanges } = await import("/src/storage.ts");
    const current = await loadAppState();
    return (await saveAppState(stampAppStateChanges(current, { ...current, ...patch }, current.stateRevision + 1))).state;
  }, patch);
}

function expectPersonalDataPreserved(actual: AppState, expected: AppState) {
  expect(actual.shoppingItems).toEqual(expected.shoppingItems);
  expect(actual.shoppingRecipes).toEqual(expected.shoppingRecipes);
  expect(actual.recipeCollections).toEqual(expected.recipeCollections);
  expect(actual.favoriteRecipeIds).toEqual(expected.favoriteRecipeIds);
  expect(actual.recipeNotes).toEqual(expected.recipeNotes);
}

for (const action of ["replace", "leftover", "swap"] as const) {
  for (const changed of ["week", "source", "generation"] as const) {
    test(`${action}: un changement de ${changed} dans un autre onglet impose de rouvrir le repas`, async ({ page }) => {
      const { state, peer } = await openSeededWeek(page);
      const source = state.currentPlan!.meals[0];
      await openAction(page, action, source);
      const nextPlan = structuredClone(state.currentPlan!);
      if (changed === "week") {
        // Same slot IDs and recipe IDs: comparing only the slot is insufficient.
        nextPlan.id = `${nextPlan.id}-regenerated`;
      } else if (changed === "source") {
        const alternative = state.currentPlan!.meals.find((meal) => meal.mealType === source.mealType && meal.recipeId !== source.recipeId)!;
        nextPlan.meals = nextPlan.meals.map((meal) => meal.id === source.id ? { ...meal, recipeId: alternative.recipeId } : meal);
      }
      const saved = changed === "generation"
        ? await peer.evaluate(async () => {
          const { loadAppState, replaceAppStateData, saveAppState } = await import("/src/storage.ts");
          const current = await loadAppState();
          // Restoring the same backup is still a new storage generation. Even
          // identical plan/slot/recipe IDs must not revive a pre-restore action.
          return (await saveAppState(replaceAppStateData(current, current))).state;
        })
        : await updateFromPeer(peer, { currentPlan: nextPlan });
      if (changed === "generation") {
        expect(saved.storageGeneration).not.toBe(state.storageGeneration);
        expect(saved.currentPlan).toEqual(state.currentPlan);
      }
      const stale = page.getByTestId("stale-meal-action");
      await expect(stale).toBeVisible();
      await expect(stale).toContainText("Ce repas a changé");
      await expect(stale).toContainText(/rouvr/i);
      await expect(page.getByRole("button", { name: "Choisir ce repas", exact: true })).toHaveCount(0);
      await expect(page.locator(`[data-testid^="${action}-slot-"]`)).toHaveCount(0);
      expect((await readState(page)).currentPlan).toEqual(saved.currentPlan);
      expectPersonalDataPreserved(await readState(page), saved);
      await peer.close();
    });
  }
}

for (const action of ["leftover", "swap"] as const) {
  test(`${action}: les cibles sont actualisées et une confirmation conserve les autres données`, async ({ page }) => {
    const errors: string[] = [];
    const { state, peer } = await openSeededWeek(page);
    page.on("pageerror", (error) => errors.push(error.message));
    const plan = state.currentPlan!;
    const source = plan.meals[0];
    const targets = action === "leftover"
      ? leftoverCandidates(plan, source.id, RECIPES)
      : plan.meals.filter((meal) => canSwapPlannedMeals(plan, source.id, meal.id, RECIPES, state.profile));
    const target = targets.find((meal) => meal.id !== source.id)!;
    expect(target).toBeDefined();
    await openAction(page, action, source);
    const targetButton = page.getByTestId(`${action}-slot-${target.id}`);
    await expect(targetButton).toContainText(recipeById.get(target.recipeId)!.title);
    const alternate = RECIPES.find((recipe) => recipe.id !== target.recipeId
      && recipe.id !== source.recipeId
      && recipe.mealTypes.includes(target.mealType)
      && recipe.prepMinutes <= state.profile.maxPrepMinutes
      && recipe.equipment.every((equipment) => state.profile.equipment.includes(equipment))
      && recipe.diet.includes(state.profile.diet)
      && !plan.meals.some((meal) => meal.recipeId === recipe.id))!;
    expect(alternate).toBeDefined();
    const changedPlan = {
      ...plan,
      meals: plan.meals.map((meal) => meal.id === target.id ? { ...meal, recipeId: alternate.id } : meal),
    };
    changedPlan.estimatedCost = changedPlan.meals.reduce((sum, meal) => sum + plannedMealCost(recipeById.get(meal.recipeId)!, meal), 0);
    const peerState = await updateFromPeer(peer, {
      currentPlan: changedPlan,
      recipeCollections: [...state.recipeCollections, { id: "collection-peer", name: "Ajout autre onglet", recipeIds: [alternate.id] }],
      shoppingItems: [...state.shoppingItems, { id: "article-peer", name: "Sacs congélation", checked: false }],
    });
    await expect(targetButton).toContainText(alternate.title);
    await expect(page.getByTestId("stale-meal-action")).toHaveCount(0);
    await targetButton.click();
    await expect(page.getByTestId("week-view")).toBeVisible();
    await expect.poll(async () => (await readState(page)).currentPlan!.meals.find((meal) => meal.id === target.id)?.recipeId).toBe(source.recipeId);
    const after = await readState(page);
    const afterSource = after.currentPlan!.meals.find((meal) => meal.id === source.id)!;
    const afterTarget = after.currentPlan!.meals.find((meal) => meal.id === target.id)!;
    expect(afterSource.recipeId).toBe(action === "swap" ? alternate.id : source.recipeId);
    expect(afterTarget.leftoverOf).toBe(action === "leftover" ? source.id : undefined);
    expect(after.currentPlan!.meals).toHaveLength(plan.meals.length);
    expectPersonalDataPreserved(after, peerState);
    expect(errors).toEqual([]);
    await peer.close();
  });
}

test("Remplacer respecte un profil durci dans un autre onglet", async ({ page }) => {
  const { state, peer } = await openSeededWeek(page);
  const source = state.currentPlan!.meals[0];
  await openAction(page, "replace", source);
  await expect(page.getByRole("button", { name: "Choisir ce repas", exact: true })).toBeVisible();
  const blockedTitle = await page.locator(".replacement-card[aria-pressed='true'] strong").innerText();
  const blockedRecipe = RECIPES.find((recipe) => recipe.title === blockedTitle)!;
  // Excluding an unused candidate changes the profile without invalidating the
  // existing week, so this specifically exercises the live replacement list.
  const saved = await updateFromPeer(peer, { profile: { ...state.profile, dislikedRecipeIds: [...state.profile.dislikedRecipeIds, blockedRecipe.id] } });
  await expect(page.locator(".replacement-card strong", { hasText: blockedTitle })).toHaveCount(0);
  await expect(page.getByTestId("stale-meal-action")).toHaveCount(0);
  expect((await readState(page)).currentPlan).toEqual(state.currentPlan);
  const allowedTitle = await page.locator(".replacement-card[aria-pressed='true'] strong").innerText();
  const allowedRecipe = RECIPES.find((recipe) => recipe.title === allowedTitle)!;
  expect(allowedRecipe.id).not.toBe(blockedRecipe.id);
  await page.getByRole("button", { name: "Choisir ce repas", exact: true }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
  await expect.poll(async () => (await readState(page)).currentPlan!.meals[0].recipeId).toBe(allowedRecipe.id);
  expect((await readState(page)).profile.dislikedRecipeIds).toContain(blockedRecipe.id);
  expectPersonalDataPreserved(await readState(page), saved);
  await peer.close();
});

test("Remplacer reste possible après une modification des courses et collections dans un autre onglet", async ({ page }) => {
  const { state, peer } = await openSeededWeek(page);
  const source = state.currentPlan!.meals[0];
  await openAction(page, "replace", source);
  const selectedTitle = await page.locator(".replacement-card[aria-pressed='true'] strong").innerText();
  const selectedRecipe = RECIPES.find((recipe) => recipe.title === selectedTitle)!;
  const saved = await updateFromPeer(peer, {
    shoppingItems: [...state.shoppingItems, { id: "article-peer", name: "Boîtes hermétiques", checked: false }],
    recipeCollections: [...state.recipeCollections, { id: "collection-peer", name: "Semaine prochaine", recipeIds: [selectedRecipe.id] }],
  });
  await expect(page.getByTestId("stale-meal-action")).toHaveCount(0);
  await page.getByRole("button", { name: "Choisir ce repas", exact: true }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
  await expect.poll(async () => (await readState(page)).currentPlan!.meals[0].recipeId).toBe(selectedRecipe.id);
  const after = await readState(page);
  expect(after.currentPlan!.meals[0].portions).toBe(source.portions);
  expect(after.currentPlan!.meals.slice(1)).toEqual(state.currentPlan!.meals.slice(1));
  expectPersonalDataPreserved(after, saved);
  await peer.close();
});

for (const kind of ["corrupt-local", "future-local", "future-indexed"] as const) {
  test(`démarrage ${kind}: données brutes conservées, récupérables et reset confirmé`, async ({ page }) => {
    const future = { ...fixtureState(), version: 999, futureOnlyData: { note: "Ne pas supprimer", values: [1, 2, 3] } };
    const localRaw = kind === "corrupt-local" ? '{"profile":{"firstName":"Données incomplètes"}'
      : kind === "future-local" ? JSON.stringify(future, null, 2) : null;
    const indexedRaw = kind === "future-indexed" ? future : null;
    await writeRawReplicas(page, localRaw, indexedRaw);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Inflamm’Menu a rencontré une erreur" })).toBeVisible();
    await expect(page.getByTestId("onboarding-view")).toHaveCount(0);
    await expect(page.getByTestId("home-view")).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localRaw);

    const download = page.waitForEvent("download");
    await page.getByTestId("fatal-recovery").click();
    const downloaded = await download;
    const file = await downloaded.path();
    expect(file).not.toBeNull();
    const recovery = JSON.parse(await readFile(file!, "utf8"));
    expect(recovery.format).toBe("inflamm-menu-raw-recovery");
    expect(recovery.replicas.localStorage.rawState).toBe(localRaw);
    expect(recovery.replicas.IndexedDB.rawState).toEqual(indexedRaw);

    await page.getByTestId("fatal-reset").click();
    const dialog = page.getByRole("alertdialog", { name: "Réinitialiser toutes les données ?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Annuler", exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localRaw);
    await page.reload();
    await expect(page.getByTestId("fatal-recovery")).toBeVisible();

    await page.getByTestId("fatal-reset").click();
    await page.getByTestId("fatal-reset-dialog-confirm").click();
    await expect(page.getByTestId("onboarding-view")).toBeVisible();
    await page.getByTestId("onboarding-skip").click();
    await expect(page.getByTestId("home-view")).toBeVisible();
    await expect.poll(async () => (await readState(page)).onboardingCompleted).toBe(true);
    await page.reload();
    await expect(page.getByTestId("home-view")).toBeVisible();
    const reset = await readState(page);
    expect(reset.currentPlan).toBeNull();
    expect(reset.shoppingItems).toEqual([]);
    expect(reset.recipeCollections).toEqual([]);
    expect(reset.version).toBe(DEFAULT_APP_STATE.version);
  });
}
