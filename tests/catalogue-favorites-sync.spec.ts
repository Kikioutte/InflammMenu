import { expect, test, type Locator, type Page } from "@playwright/test";
import { generateWeeklyPlan } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, migrateAppState, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
test.setTimeout(45_000);

const storageKey = "inflamm-menu:app-state";
const recipeId = "catalog-r711";
const recipeTitle = "Cabillaud en papillote de chou et fenouil";
const currentScreen = (page: Page) => page.getByTestId("flow-current");

function fixtureState(favorite: boolean): AppState {
  const profile = { ...structuredClone(DEFAULT_APP_STATE.profile), firstName: "Mes données conservées", maxPrepMinutes: 90 };
  const currentPlan = generateWeeklyPlan(RECIPES, profile, { seed: "favorite-sync-current", startsOn: "2026-09-28" });
  const upcomingPlan = generateWeeklyPlan(RECIPES, profile, { seed: "favorite-sync-upcoming", startsOn: "2026-10-05" });
  return migrateAppState({
    ...structuredClone(DEFAULT_APP_STATE), profile, currentPlan, upcomingPlan, onboardingCompleted: true,
    favoriteRecipeIds: favorite ? ["catalog-r824", recipeId] : ["catalog-r824"],
    recipeNotes: { [recipeId]: "Préparer le fenouil à l’avance" },
    recipeCollections: [{ id: "collection-favorite-sync", name: "Recettes à conserver", recipeIds: [recipeId, "catalog-r824"] }],
    savedMeals: [{ id: "meal-favorite-sync", name: "Mon repas conservé", recipeIds: { starter: "r1017", main: "r711", dessert: "r824" } }],
    shoppingItems: [{ id: "article-favorite-sync", name: "Papier cuisson", checked: true }],
    shoppingRecipes: [{ recipe: structuredClone(RECIPES.find((recipe) => recipe.id === recipeId)!), portions: 3 }],
    pantryAmounts: { carrot: { quantity: 50, unit: "g" } },
    actualSpend: { [currentPlan.id]: 74.5 },
  })!;
}

async function openCatalogueRecipe(page: Page) {
  const current = currentScreen(page);
  await current.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Recette", exact: true }).click();
  await current.getByLabel("Rechercher une recette", { exact: true }).fill(recipeTitle);
  await expect(current.locator(".catalogue-card")).toHaveCount(1);
  await current.locator(".catalogue-card").click();
  await expect(current.getByRole("heading", { name: recipeTitle, exact: true })).toBeVisible();
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

async function openTwoPages(page: Page, favorite = false) {
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.goto("/tests/runtime-fixture.html");
  await page.evaluate(({ state, storageKey }) => localStorage.setItem(storageKey, JSON.stringify(state)), { state: fixtureState(favorite), storageKey });
  await page.goto("/");
  await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
  await openCatalogueRecipe(page);
  const peer = await page.context().newPage();
  await peer.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await peer.goto("/");
  await expect(currentScreen(peer).getByTestId("home-view")).toBeVisible();
  await openCatalogueRecipe(peer);
  return { peer, before: await readState(page) };
}

async function expectFavorite(button: Locator, favorite: boolean) {
  await expect(button).toHaveAttribute("aria-pressed", String(favorite));
  await expect(button).toHaveText(favorite ? "Enregistrée" : "Ajouter aux favoris");
  if (favorite) await expect(button).toHaveClass(/\bis-favorite\b/);
  else await expect(button).not.toHaveClass(/\bis-favorite\b/);
}

function expectOtherDataPreserved(actual: AppState, expected: AppState) {
  for (const key of APP_STATE_DATA_KEYS.filter((key) => key !== "favoriteRecipeIds")) {
    expect(actual[key], `donnée préservée : ${key}`).toEqual(expected[key]);
  }
}

test("la fiche ouverte suit les favoris d’un autre onglet et le clic suivant utilise l’état réel @webkit-smoke", async ({ page }, info) => {
  const { peer, before } = await openTwoPages(page);
  try {
    const favorite = currentScreen(page).getByTestId("catalogue-favorite");
    const peerFavorite = currentScreen(peer).getByTestId("catalogue-favorite");
    const portions = currentScreen(page).locator(".portions-stepper b");
    const initialPortions = Number(await portions.innerText());
    await currentScreen(page).getByRole("button", { name: "Ajouter une portion", exact: true }).click();
    await currentScreen(page).getByRole("button", { name: "Ajouter une portion", exact: true }).click();
    await expect(portions).toHaveText(String(initialPortions + 2));
    let navigations = 0;
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
    await expectFavorite(favorite, false);
    // Genuine UI changes in a second page exercise storage/BroadcastChannel,
    // not a synthetic event or a direct update of the first page's React store.
    await peerFavorite.click();
    await expectFavorite(peerFavorite, true);
    await expectFavorite(favorite, true);
    await expect(portions).toHaveText(String(initialPortions + 2));
    await favorite.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("favori-synchronise-fiche-ouverte.png"), fullPage: true });
    await favorite.click();
    await expectFavorite(favorite, false);
    await expectFavorite(peerFavorite, false);
    await expect.poll(async () => (await readState(page)).favoriteRecipeIds).toEqual(before.favoriteRecipeIds);
    await favorite.click();
    await expectFavorite(favorite, true);
    await expectFavorite(peerFavorite, true);
    await peerFavorite.click();
    await expectFavorite(favorite, false);
    await expectFavorite(peerFavorite, false);
    await favorite.dblclick();
    await expectFavorite(favorite, false);
    await expectFavorite(peerFavorite, false);
    await expect.poll(async () => (await readState(page)).favoriteRecipeIds).toEqual(before.favoriteRecipeIds);
    await expect(portions).toHaveText(String(initialPortions + 2));
    expect(navigations).toBe(0);
    const after = await readState(page);
    expect(after.favoriteRecipeIds).toEqual(before.favoriteRecipeIds);
    expectOtherDataPreserved(after, before);
    await page.reload();
    await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
    await openCatalogueRecipe(page);
    await expectFavorite(currentScreen(page).getByTestId("catalogue-favorite"), false);
    expectOtherDataPreserved(await readState(page), before);
  } finally { await peer.close(); }
});

test("une fiche empilée retrouve le favori distant sans réinitialiser ses portions @webkit-smoke", async ({ page }) => {
  const { peer, before } = await openTwoPages(page, true);
  try {
    const current = currentScreen(page);
    const peerFavorite = currentScreen(peer).getByTestId("catalogue-favorite");
    const initialPortions = Number(await current.locator(".portions-stepper b").innerText());
    await current.getByRole("button", { name: "Ajouter une portion", exact: true }).click();
    await expectFavorite(current.getByTestId("catalogue-favorite"), true);
    await current.getByTestId("compose-meal").click();
    await expect(current.getByTestId("meal-builder-view")).toBeVisible();
    await peerFavorite.click();
    await expectFavorite(peerFavorite, false);
    await page.getByRole("button", { name: "Retour", exact: true }).click();
    await expect(current.getByRole("heading", { name: recipeTitle, exact: true })).toBeVisible();
    await expectFavorite(current.getByTestId("catalogue-favorite"), false);
    await expect(current.locator(".portions-stepper b")).toHaveText(String(initialPortions + 1));
    await peerFavorite.click();
    await expectFavorite(current.getByTestId("catalogue-favorite"), true);
    await expect(current.locator(".portions-stepper b")).toHaveText(String(initialPortions + 1));
    expect((await readState(page)).favoriteRecipeIds).toEqual(before.favoriteRecipeIds);
    expectOtherDataPreserved(await readState(page), before);
    await page.reload();
    await expect(current.getByTestId("home-view")).toBeVisible();
    await openCatalogueRecipe(page);
    await expectFavorite(current.getByTestId("catalogue-favorite"), true);
    expect((await readState(page)).favoriteRecipeIds).toEqual(before.favoriteRecipeIds);
    expectOtherDataPreserved(await readState(page), before);
  } finally { await peer.close(); }
});
