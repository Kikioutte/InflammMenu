import { expect, test, type Page } from "@playwright/test";
import { type Recipe } from "../src/domain";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, exportAppState, importAppState, migrateAppState, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
test.setTimeout(45_000);

const storageKey = "inflamm-menu:app-state";
const currentScreen = (page: Page) => page.getByTestId("flow-current");
const storeView = (page: Page) => currentScreen(page).getByTestId("store-mode");

function fixtureState(overrides: Partial<AppState> = {}): AppState {
  const makeRecipe = (id: string, title: string, ingredients: Recipe["ingredients"]): Recipe => ({
    ...structuredClone(RECIPES[0]), id, title, ingredients,
    mealTypes: ["lunch", "dinner"], diet: ["classic", "vegetarian", "no-pork"],
    prepMinutes: 15, costPerPortion: 2, seasons: ["all-year"], equipment: ["hob"],
    allergens: ingredients.flatMap((item) => item.allergens ?? []), tags: [],
    steps: ["Préparer les ingrédients et servir."],
  });
  const vegetables = makeRecipe("perso-store-vegetables", "Légumes pour les courses", [
    { id: "carrot", name: "carotte", quantity: 100, unit: "g", category: "fruit-vegetable" },
    { id: "leek", name: "poireau", quantity: 100, unit: "g", category: "fruit-vegetable" },
  ]);
  const fresh = makeRecipe("perso-store-fresh", "Yaourt pour les courses", [
    { id: "yogurt", name: "yaourt nature", quantity: 125, unit: "g", category: "fresh", allergens: ["lait"] },
  ]);
  return migrateAppState({
    ...structuredClone(DEFAULT_APP_STATE), onboardingCompleted: true,
    customRecipes: [vegetables, fresh],
    shoppingRecipes: [{ recipe: vegetables, portions: 2 }, { recipe: fresh, portions: 2 }],
    shoppingItems: [{ id: "article-store-paper", name: "Papier cuisson", checked: false }],
    favoriteRecipeIds: [vegetables.id],
    recipeNotes: { [vegetables.id]: "Garder cette note" },
    recipeCollections: [{ id: "collection-store", name: "À conserver", recipeIds: [vegetables.id] }],
    ...overrides,
  })!;
}

async function openCourses(page: Page, state = fixtureState()) {
  await page.goto("/tests/runtime-fixture.html");
  await page.evaluate(({ state, storageKey }) => localStorage.setItem(storageKey, JSON.stringify(state)), { state, storageKey });
  await page.goto("/");
  await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
  await navCourses(page);
  return readState(page);
}

async function navCourses(page: Page) {
  await currentScreen(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Courses", exact: true }).click();
  await expect(currentScreen(page).getByTestId("courses-view")).toBeVisible();
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

function expectDataPreserved(actual: AppState, expected: AppState, except: readonly string[] = []) {
  for (const key of APP_STATE_DATA_KEYS.filter((key) => !except.includes(key))) {
    expect(actual[key], `donnée préservée : ${key}`).toEqual(expected[key]);
  }
}

// A real second tab uses production persistence, including mutation stamps and
// storage/BroadcastChannel delivery; no synthetic event updates the first tab.
async function updateFromPeer(peer: Page, patch: Partial<AppState>) {
  return peer.evaluate(async (patch) => {
    const { loadAppState, saveAppState, stampAppStateChanges } = await import("/src/storage.ts");
    const current = await loadAppState();
    return (await saveAppState(stampAppStateChanges(current, { ...current, ...patch }, current.stateRevision + 1))).state;
  }, patch);
}

test("le mode magasin reçoit puis restitue le focus au clavier et au pointeur @webkit-smoke", async ({ page }, info) => {
  const before = await openCourses(page);
  const trigger = currentScreen(page).getByTestId("enter-store-mode");
  for (const [interaction, width] of [["pointer", 390], ["keyboard", 1280]] as const) {
    await page.setViewportSize({ width, height: 844 });
    if (interaction === "keyboard") { await trigger.focus(); await trigger.press("Enter"); }
    else await trigger.click(); // Safari pointer activation does not focus buttons by default.
    const heading = storeView(page).getByTestId("store-mode-heading");
    await expect(heading).toBeFocused();
    await expect(heading).toHaveAttribute("tabindex", "-1");
    await expect(heading).toHaveAccessibleName(/Mode magasin.*Rayon 1 sur 3.*Fruits et légumes.*2 articles restants.*4 articles restants/);
    await expect(storeView(page).getByTestId("store-mode-status")).toBeEmpty();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`magasin-ouvert-${interaction === "pointer" ? "mobile" : "desktop"}.png`), fullPage: true });
    const exit = storeView(page).getByTestId("exit-store-mode");
    if (interaction === "keyboard") { await exit.focus(); await exit.press("Enter"); }
    else await exit.click();
    await expect(trigger).toBeFocused();
    await expect(currentScreen(page).getByTestId("store-mode")).toHaveCount(0);
    expectDataPreserved(await readState(page), before);
  }
  await page.screenshot({ path: info.outputPath("magasin-focus-restitue-desktop.png"), fullPage: true });
});

test("les changements de rayon sont annoncés sans perdre le focus aux bornes @webkit-smoke", async ({ page }) => {
  const before = await openCourses(page);
  await currentScreen(page).getByTestId("enter-store-mode").click();
  const next = storeView(page).getByTestId("store-next-aisle");
  const previous = storeView(page).getByTestId("store-previous-aisle");
  const heading = storeView(page).getByTestId("store-mode-heading");
  const status = storeView(page).getByTestId("store-mode-status");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(previous).toBeDisabled();
  await next.focus(); await next.press("Enter");
  await expect(next).toBeFocused();
  await expect(heading).toHaveText("Épicerie");
  await expect(status).toContainText(/Rayon 2 sur 3.*Épicerie.*1 article restant.*4 articles restants/);
  await next.press("Enter");
  await expect(next).toBeDisabled();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveAccessibleName(/Rayon 3 sur 3.*Produits frais/);
  await expect(status).toBeEmpty(); // The focused title already announces this destination.
  await previous.click();
  await expect(previous).toBeFocused();
  await expect(status).toContainText(/Rayon 2 sur 3.*Épicerie/);
  await previous.click();
  await expect(previous).toBeDisabled();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText("Fruits et légumes");
  expectDataPreserved(await readState(page), before);
});

test("cocher le dernier article ne change pas de rayon et les données se sauvegardent @webkit-smoke", async ({ page }, info) => {
  const before = await openCourses(page);
  await currentScreen(page).getByTestId("enter-store-mode").click();
  const heading = storeView(page).getByTestId("store-mode-heading");
  const status = storeView(page).getByTestId("store-mode-status");
  const carrot = storeView(page).getByTestId("store-item-carrot");
  const leek = storeView(page).getByTestId("store-item-leek");
  await carrot.click();
  await expect(carrot).toHaveAttribute("aria-pressed", "true");
  await expect(carrot).toBeFocused();
  await expect(status).toContainText(/1 article restant dans ce rayon.*3 articles restants au total/);
  await leek.focus(); await leek.press("Space");
  await expect(leek).toHaveAttribute("aria-pressed", "true");
  await expect(leek).toBeFocused();
  await expect(heading).toHaveText("Fruits et légumes");
  await expect(status).toContainText(/0 article restant dans ce rayon.*2 articles restants au total/);
  await leek.press("Space");
  await expect(leek).toHaveAttribute("aria-pressed", "false");
  await expect(leek).toBeFocused();
  await expect(status).toContainText(/1 article restant dans ce rayon.*3 articles restants au total/);
  await leek.press("Space");
  await storeView(page).getByTestId("store-next-aisle").click();
  const paper = storeView(page).getByTestId("store-item-article-store-paper");
  await paper.click();
  await expect(paper).toBeFocused();
  await expect(heading).toHaveText("Épicerie");
  await storeView(page).getByTestId("store-next-aisle").click();
  const yogurt = storeView(page).getByTestId("store-item-yogurt");
  await yogurt.click();
  await expect(yogurt).toBeFocused();
  await expect(yogurt).toHaveAttribute("aria-pressed", "true");
  await expect(heading).toHaveText("Produits frais");
  await expect(status).toContainText(/0 article restant dans ce rayon.*0 article restant au total/);
  await expect(storeView(page)).toContainText("4 / 4 articles faits");
  await page.screenshot({ path: info.outputPath("magasin-liste-cochee-mobile.png"), fullPage: true });
  await expect.poll(async () => (await readState(page)).extraShoppingCheckedIds.slice().sort()).toEqual(["carrot", "leek", "yogurt"]);
  const after = await readState(page);
  expect(after.shoppingItems).toEqual([{ ...before.shoppingItems[0], checked: true }]);
  expect(after.checkedShoppingItemIds.slice().sort()).toEqual(["carrot", "leek", "yogurt"]);
  expectDataPreserved(after, before, ["checkedShoppingItemIds", "extraShoppingCheckedIds", "shoppingItems"]);
  const restored = importAppState(exportAppState(after));
  expectDataPreserved(restored, after);
  await page.reload(); await navCourses(page);
  expectDataPreserved(await readState(page), after);
  await currentScreen(page).getByTestId("enter-store-mode").click();
  await expect(storeView(page).getByTestId("store-item-carrot")).toHaveAttribute("aria-pressed", "true");
  await expect(storeView(page).getByTestId("store-mode-heading")).toHaveAccessibleName(/0 article restant au total/);
});

test("la suppression externe du dernier rayon recale la navigation puis la liste vide @webkit-smoke", async ({ page }) => {
  const before = await openCourses(page);
  await currentScreen(page).getByTestId("enter-store-mode").click();
  await storeView(page).getByTestId("store-next-aisle").click();
  await storeView(page).getByTestId("store-next-aisle").click();
  await storeView(page).getByTestId("store-item-yogurt").focus();
  const peer = await page.context().newPage();
  try {
    await peer.goto("/tests/runtime-fixture.html");
    await updateFromPeer(peer, { shoppingRecipes: before.shoppingRecipes.slice(0, 1) });
    await expect(storeView(page).getByTestId("store-mode-heading")).toHaveText("Épicerie");
    await expect(storeView(page).getByTestId("store-mode-heading")).toBeFocused();
    await expect(storeView(page).getByTestId("store-next-aisle")).toBeDisabled();
    await storeView(page).getByTestId("store-previous-aisle").click();
    await expect(storeView(page).getByTestId("store-mode-heading")).toHaveText("Fruits et légumes");
    await expect(storeView(page).getByTestId("store-previous-aisle")).toBeDisabled();
    await updateFromPeer(peer, { shoppingRecipes: [], shoppingItems: [] });
    await expect(currentScreen(page).getByTestId("store-mode")).toHaveCount(0);
    await expect(currentScreen(page).getByTestId("courses-heading")).toBeFocused();
    await expect(currentScreen(page).getByTestId("enter-store-mode")).toBeDisabled();
    await updateFromPeer(peer, { shoppingItems: before.shoppingItems });
    await expect(currentScreen(page).getByTestId("enter-store-mode")).toBeEnabled();
    await expect(currentScreen(page).getByTestId("store-mode")).toHaveCount(0);
    expectDataPreserved(await readState(page), before, ["shoppingRecipes"]);
  } finally { await peer.close(); }
});

test("un inventaire entièrement couvert ne laisse pas le mode magasin actif en arrière-plan @webkit-smoke", async ({ page }) => {
  const before = await openCourses(page, fixtureState({
    shoppingItems: [],
    pantryAmounts: {
      carrot: { quantity: 200, unit: "g" }, leek: { quantity: 200, unit: "g" }, yogurt: { quantity: 250, unit: "g" },
    },
  }));
  const current = currentScreen(page);
  await expect(current.getByTestId("enter-store-mode")).toBeDisabled();
  await current.getByRole("button", { name: "Retirer ce que j’ai déjà", exact: true }).click();
  await expect(current.locator(".shopping-item")).toHaveCount(3);
  await current.getByTestId("enter-store-mode").click();
  await expect(current.getByTestId("courses-heading")).toBeFocused();
  await expect(current.getByTestId("enter-store-mode")).toBeDisabled();
  await expect(current.getByTestId("store-mode")).toHaveCount(0);
  expectDataPreserved(await readState(page), before);
  await current.getByLabel("Ajouter un article", { exact: true }).fill("Sacs de courses");
  await current.getByRole("button", { name: "Ajouter l’article", exact: true }).click();
  await expect(current.getByTestId("enter-store-mode")).toBeEnabled();
  await expect(current.getByTestId("store-mode")).toHaveCount(0);
  await expect(current.getByRole("button", { name: "Cocher Sacs de courses", exact: true })).toBeVisible();
  expectDataPreserved(await readState(page), before, ["shoppingItems"]);
});
