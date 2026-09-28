import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEFAULT_APP_STATE, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
test.setTimeout(45_000);

const recipeTitle = "Cabillaud en papillote de chou et fenouil";
const currentScreen = (page: Page) => page.getByTestId("flow-current");

async function fresh(page: Page, overrides: Partial<AppState> = {}) {
  const state: AppState = { ...structuredClone(DEFAULT_APP_STATE), onboardingCompleted: true, profile: { ...structuredClone(DEFAULT_APP_STATE.profile), maxPrepMinutes: 90 }, ...overrides };
  await page.goto("/tests/runtime-fixture.html");
  await page.evaluate((state) => localStorage.setItem("inflamm-menu:app-state", JSON.stringify(state)), state);
  await page.goto("/");
  await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
}

async function nav(page: Page, name: string) {
  await currentScreen(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }).click();
}

async function library(page: Page) {
  await nav(page, "Recette");
  await expect(currentScreen(page).getByTestId("catalogue-filters-open")).toBeVisible();
}

async function openRecipe(page: Page) {
  await library(page);
  const current = currentScreen(page);
  await current.getByLabel("Rechercher une recette", { exact: true }).fill(recipeTitle);
  await expect(current.locator(".catalogue-card")).toHaveCount(1);
  await current.locator(".catalogue-card").click();
  await expect(current.getByRole("heading", { name: recipeTitle, exact: true })).toBeVisible();
}

async function openBuilder(page: Page) {
  await openRecipe(page);
  await currentScreen(page).getByTestId("compose-meal").click();
  await expect(currentScreen(page).getByTestId("meal-builder-view")).toBeVisible();
}

async function expectFocusInside(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
}

async function checkDismissals(page: Page, trigger: Locator, title: string) {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  for (const method of ["escape", "close", "backdrop"] as const) {
    // Use a real pointer activation too: WebKit does not automatically focus
    // clicked buttons, so capturing only document.activeElement is insufficient.
    await trigger.click();
    await expectFocusInside(dialog);
    const close = dialog.getByRole("button", { name: `Fermer « ${title} »`, exact: true });
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expectFocusInside(dialog);
    if (method === "escape") await page.keyboard.press("Escape");
    else if (method === "close") await close.click();
    else await page.locator(".web-sheet__overlay").click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
}

test("les filtres du catalogue rendent le focus après chaque fermeture @webkit-smoke", async ({ page }, info) => {
  await fresh(page);
  await library(page);
  const trigger = currentScreen(page).getByTestId("catalogue-filters-open");
  await checkDismissals(page, trigger, "Filtrer le catalogue");
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Filtrer le catalogue", exact: true });
  await expectFocusInside(dialog);
  await page.screenshot({ path: info.outputPath("catalogue-filtres-ouvert-mobile.png"), fullPage: true });
  await dialog.getByTestId("filter-time-30").click();
  await dialog.getByRole("button", { name: /^Voir \d+ recettes?$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("(1)");
  await page.screenshot({ path: info.outputPath("catalogue-focus-restaure-mobile.png"), fullPage: true });
});

test("les filtres et associations du constructeur restaurent leur propre déclencheur @webkit-smoke", async ({ page }) => {
  await fresh(page);
  await openBuilder(page);
  const current = currentScreen(page);
  const filters = current.getByRole("button", { name: "Filtres", exact: true });
  await checkDismissals(page, filters, "Affiner les propositions");
  await filters.click();
  const dialog = page.getByRole("dialog", { name: "Affiner les propositions", exact: true });
  await dialog.getByRole("button", { name: "Tout vert uniquement", exact: true }).click();
  await dialog.getByRole("button", { name: /^Voir \d+ propositions?$/ }).click();
  await expect(dialog).toHaveCount(0);
  const activeFilters = current.getByRole("button", { name: "Filtres · actifs", exact: true });
  await expect(activeFilters).toBeFocused();
  const associations = current.getByRole("button", { name: /Voir le détail/ });
  await checkDismissals(page, associations, "Les associations de votre repas");
});

test("classer et renommer une collection rendent le focus après enregistrement @webkit-smoke", async ({ page }) => {
  await fresh(page);
  await openRecipe(page);
  const current = currentScreen(page);
  await checkDismissals(page, current.getByRole("button", { name: "Signaler un problème sur cette recette", exact: true }), "Préparer un signalement");
  const classify = current.getByRole("button", { name: "Classer dans une collection", exact: true });
  await classify.click();
  const classification = page.getByRole("dialog", { name: "Classer cette recette", exact: true });
  await expectFocusInside(classification);
  await classification.getByLabel("Nom de la collection", { exact: true }).fill("À retrouver");
  await classification.getByRole("button", { name: "Enregistrer la collection", exact: true }).click();
  await expect(classification).toHaveCount(0);
  await expect(classify).toBeFocused();
  await expect(current.getByRole("status")).toContainText("Recette classée dans votre nouvelle collection.");
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await current.getByText("Mes collections · 1", { exact: true }).click();
  await current.getByLabel("Choisir une collection", { exact: true }).selectOption({ label: "À retrouver (1)" });
  const rename = current.getByRole("button", { name: "Renommer la collection", exact: true });
  await rename.click();
  const renaming = page.getByRole("dialog", { name: "Renommer la collection", exact: true });
  await expectFocusInside(renaming);
  await renaming.getByLabel("Nom de la collection", { exact: true }).fill("Mes soirées");
  await renaming.getByRole("button", { name: "Enregistrer la collection", exact: true }).click();
  await expect(renaming).toHaveCount(0);
  await expect(rename).toBeFocused();
  await expect(current.getByRole("heading", { name: "Mes soirées", exact: true })).toBeVisible();
  const create = current.getByRole("button", { name: "Nouvelle collection", exact: true });
  await checkDismissals(page, create, "Nouvelle collection");
  await create.click();
  const creating = page.getByRole("dialog", { name: "Nouvelle collection", exact: true });
  await creating.getByLabel("Nom de la collection", { exact: true }).fill("Les rapides");
  await creating.getByRole("button", { name: "Enregistrer la collection", exact: true }).click();
  await expect(creating).toHaveCount(0);
  await expect(create).toBeFocused();
  await expect(current.getByText("Mes collections · 2", { exact: true })).toBeVisible();
});

test("renommer un repas restaure le focus même si son bouton disparaît du filtre @webkit-smoke", async ({ page }) => {
  await fresh(page, { savedMeals: [{ id: "meal-focus-test", name: "Soirée légumes", recipeIds: { starter: "r1017", main: "r711", dessert: "r824" } }] });
  await library(page);
  const current = currentScreen(page);
  await current.getByText("Mes repas enregistrés · 1", { exact: true }).click();
  const rename = current.getByRole("button", { name: "Nommer", exact: true });
  await rename.click();
  const dialog = page.getByRole("dialog", { name: "Nommer mon repas", exact: true });
  await expectFocusInside(dialog);
  await dialog.getByLabel("Nom du repas", { exact: true }).fill("Soirée partagée");
  await dialog.getByRole("button", { name: "Enregistrer le nom", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rename).toBeFocused();
  await current.getByLabel("Rechercher dans mes repas", { exact: true }).fill("Soirée");
  await rename.click();
  await dialog.getByLabel("Nom du repas", { exact: true }).fill("Déjeuner du dimanche");
  await dialog.getByRole("button", { name: "Enregistrer le nom", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rename).toHaveCount(0);
  await expect(current.getByRole("heading", { level: 1, name: "Recette", exact: true })).toBeFocused();
});

test("le résumé garde le focus au succès puis respecte le changement de catégorie et la navigation @webkit-smoke", async ({ page }) => {
  await fresh(page);
  await openBuilder(page);
  const current = currentScreen(page);
  await current.getByTestId("meal-builder-candidate-r824").click();
  await current.getByTestId("meal-builder-candidate-r1017").click();
  const summary = page.getByRole("dialog", { name: "Votre repas", exact: true });
  await expectFocusInside(summary);
  const save = summary.getByRole("button", { name: "Enregistrer mon repas", exact: true });
  await save.focus();
  await save.press("Enter");
  await expect(summary).toContainText("Repas enregistré sur cet appareil dans Mes repas.");
  await expect(save).toBeFocused();
  await summary.getByRole("button", { name: "Fermer « Votre repas »", exact: true }).click();
  const trigger = current.getByRole("button", { name: "Voir mon repas, 3 recettes sur 3", exact: true });
  await expect(trigger).toBeFocused();
  await trigger.click();
  await summary.getByRole("button", { name: "Changer dessert", exact: true }).click();
  await expect(summary).toHaveCount(0);
  await expect(current.locator("#meal-tab-dessert")).toBeFocused();
  await trigger.click();
  await summary.getByRole("button", { name: "Planifier ce repas", exact: true }).click();
  await expect(summary).toHaveCount(0);
  await expect(current.getByRole("heading", { name: "Une semaine pour votre repas", exact: true })).toBeFocused();
  await expect(current.getByTestId("meal-builder-view")).toHaveCount(0);
});

test("les actions de semaine laissent le focus au nouvel écran de remplacement @webkit-smoke", async ({ page }) => {
  await fresh(page);
  const current = currentScreen(page);
  await current.getByRole("button", { name: "Générer ma semaine", exact: true }).click();
  await current.getByTestId("target-current").click();
  await current.getByRole("button", { name: "Créer ma semaine", exact: true }).click();
  await current.getByRole("button", { name: "Voir ma semaine", exact: true }).click();
  await expect(current.getByTestId("week-view")).toBeVisible();
  const trigger = current.locator(".meal-card__more").first();
  await trigger.click();
  const actions = page.getByRole("dialog");
  await expectFocusInside(actions);
  await page.keyboard.press("Escape");
  await expect(actions).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await actions.getByTestId("action-completed").click();
  await expect(actions).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state")!).currentPlan.meals.some((meal: { completed?: boolean }) => meal.completed))).toBe(true);
  await trigger.click();
  await actions.getByTestId("action-replace").click();
  await expect(actions).toHaveCount(0);
  const replacement = current.getByTestId("replace-view");
  await expect(replacement).toBeVisible();
  await expect(replacement.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(current.locator(".meal-card__more")).toHaveCount(0);
});
