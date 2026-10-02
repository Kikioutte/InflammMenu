import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_APP_STATE } from "../src/storage";

test.use({ serviceWorkers: "block" });
const storageKey = "inflamm-menu:app-state";
const current = (page: Page) => page.getByTestId("flow-current");

async function fresh(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.addInitScript(({ key, state }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
  }, { key: storageKey, state: { ...DEFAULT_APP_STATE, onboardingCompleted: true, favoriteRecipeIds: ["salade-thon-haricots-rouges"] } });
  await page.goto("/");
  await expect(current(page).getByTestId("home-view")).toBeVisible();
}

async function nav(page: Page, name: string) {
  await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }).click();
}

async function catalogueRecipe(page: Page, title: string) {
  await nav(page, "Recette");
  await current(page).getByLabel("Rechercher une recette", { exact: true }).fill(title);
  const card = current(page).locator(".catalogue-card").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await card.click();
}

for (const family of ["V1", "catalogue"] as const) {
  test(`${family} collection and standalone shopping keep the saved recipe after reload @webkit-smoke`, async ({ page }) => {
    await fresh(page);
    const recipeId = family === "V1" ? "salade-thon-haricots-rouges" : "catalog-r711";
    const title = family === "V1" ? "Salade de thon et haricots rouges" : "Cabillaud en papillote de chou et fenouil";
    if (family === "V1") {
      await current(page).getByTestId("tonight-open").click();
      await current(page).getByRole("button", { name: "Déjeuner", exact: true }).click();
      await current(page).getByTestId("tonight-time-15").click();
      const target = current(page).getByTestId(`tonight-result-${recipeId}`);
      while (!await target.count() && await current(page).getByTestId("tonight-more").count()) await current(page).getByTestId("tonight-more").click();
      await target.click();
    } else await catalogueRecipe(page, title);

    await current(page).getByRole("button", { name: "Classer dans une collection", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Classer cette recette", exact: true });
    await sheet.getByLabel("Nom de la collection", { exact: true }).fill(`Régression ${family}`);
    await sheet.getByRole("button", { name: "Enregistrer la collection", exact: true }).click();
    await expect(current(page).getByRole("status").filter({ hasText: "Recette classée" })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).recipeCollections[0]?.recipeIds, storageKey)).toEqual([recipeId]);
    await current(page).getByRole("button", { name: "Classer dans une collection", exact: true }).click();
    const choice = sheet.getByRole("checkbox", { name: `Régression ${family}`, exact: true });
    await expect(choice).toBeChecked();
    await choice.uncheck();
    await expect(choice).not.toBeChecked();
    await choice.check();
    await expect(choice).toBeChecked();
    await sheet.getByRole("button", { name: "Terminer", exact: true }).click();

    await current(page).getByRole("button", { name: "Ajouter aux courses", exact: true }).click();
    await expect(current(page).getByRole("status").filter({ hasText: "Courses mises à jour pour 2 personnes" })).toBeVisible();
    await expect(current(page).getByRole("button", { name: "Mettre à jour les courses", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).shoppingRecipes.map((entry: { recipe: { id: string }; portions: number }) => [entry.recipe.id, entry.portions]), storageKey)).toEqual([[recipeId, 2]]);

    await page.reload();
    await expect(current(page).getByTestId("home-view")).toBeVisible();
    await nav(page, "Courses");
    await expect(current(page).getByText("Recettes ajoutées aux courses · 1", { exact: true })).toBeVisible();
    await expect(current(page).getByRole("button", { name: family === "V1" ? /Cocher.*thon au naturel/i : /Cocher.*cabillaud/i }).first()).toBeVisible();
    const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
    expect(state.currentPlan).toBeNull();
    expect(state.recipeCollections[0].recipeIds).toEqual([recipeId]);
    expect(state.shoppingRecipes[0].recipe.id).toBe(recipeId);
  });
}

test("builder hides excluded r765 as an entry point and as a proposal @webkit-smoke", async ({ page }) => {
  await fresh(page);
  await catalogueRecipe(page, "Bouillon de chou-fleur, radis et laitue");
  await expect(current(page).getByTestId("compose-meal")).toHaveCount(0);
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await current(page).getByLabel("Rechercher une recette", { exact: true }).fill("Ballotins de laitue au poulet et champignons");
  await current(page).locator(".catalogue-card").click();
  await current(page).getByTestId("compose-meal").click();
  await current(page).getByLabel("Rechercher un dessert", { exact: true }).fill("Abricots rôtis sur purée de pêche");
  await current(page).getByTestId("meal-builder-candidate-r825").click();
  await current(page).getByLabel("Rechercher une entrée", { exact: true }).fill("Bouillon de chou-fleur, radis et laitue");
  await expect(current(page).getByTestId("meal-builder-candidate-r765")).toHaveCount(0);
  await expect(current(page).getByRole("heading", { name: /Aucun résultat|Aucune proposition/ })).toBeVisible();
});
