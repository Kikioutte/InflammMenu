import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { type Recipe } from "../src/domain";
import { assignRecipeToSlot, generateWeeklyPlan, refreshPlanEstimate } from "../src/engine";
import { recalculateRecipeEstimates } from "../src/recipe-nutrition";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, migrateAppState, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
test.setTimeout(45_000);

const storageKey = "inflamm-menu:app-state";
const currentScreen = (page: Page) => page.getByTestId("flow-current");

function quantityRecipe(): Recipe {
  return {
    id: "perso-quantities", title: "Mes quantités précises", prepMinutes: 15, restMinutes: 60,
    mealTypes: ["lunch"], diet: ["classic", "vegetarian", "no-pork"], costPerPortion: 2, seasons: ["all-year"], equipment: ["hob"], allergens: ["fruits à coque"], tags: [],
    ingredients: [
      { id: "carrot", name: "carotte", quantity: 0.004, unit: "g", category: "fruit-vegetable" },
      { id: "milk", name: "lait", quantity: 0.125, unit: "ml", category: "fresh", allergens: ["lait"] },
      { id: "apple", name: "pomme", quantity: 0.125, unit: "piece", category: "fruit-vegetable" },
      { id: "chia", name: "graines de chia", quantity: 1, unit: "c_soupe", category: "grocery" },
      { id: "cinnamon", name: "cannelle", quantity: 0.004, unit: "c_cafe", category: "grocery" },
      { id: "almond", name: "amandes en poudre finement moulues conservées sans modification", quantity: 2.71828, unit: "g", category: "grocery", optional: true, pantryStaple: true, allergens: ["fruits à coque"] },
    ],
    nutrition: { calories: 100, protein: 3, fiber: 2, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    nutritionRecalculated: true, costRecalculated: true,
    description: "Fixture des cinq unités de l’éditeur.", steps: ["Préparer les ingrédients.", "Mélanger."],
    conservation: "À consommer rapidement.", image: "/assets/recipe-placeholder.svg",
  };
}

function fixtureState(recipe: Recipe, includeInPlans = false): AppState {
  const profile = { ...structuredClone(DEFAULT_APP_STATE.profile), firstName: "Données préservées", maxPrepMinutes: 90 };
  const recipes = [...RECIPES, recipe];
  const plan = (seed: string, startsOn: string) => {
    const generated = generateWeeklyPlan(RECIPES, profile, { seed, startsOn });
    return includeInPlans ? assignRecipeToSlot(generated, generated.meals[0], recipe, recipes, profile) : generated;
  };
  const currentPlan = plan("quantities-current", "2026-09-28");
  const upcomingPlan = plan("quantities-upcoming", "2026-10-05");
  return migrateAppState({
    ...structuredClone(DEFAULT_APP_STATE), profile, currentPlan, upcomingPlan, onboardingCompleted: true,
    customRecipes: [recipe], favoriteRecipeIds: [recipe.id], recipeNotes: { [recipe.id]: "Note conservée" },
    recipeCollections: [{ id: "collection-quantities", name: "Collection conservée", recipeIds: [recipe.id] }],
    shoppingItems: [{ id: "article-quantities", name: "Papier cuisson", checked: true }],
    actualSpend: { [currentPlan.id]: 73.5 },
  })!;
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

async function fresh(page: Page, recipe = quantityRecipe(), includeInPlans = false) {
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.goto("/tests/runtime-fixture.html");
  await page.evaluate(({ state, storageKey }) => localStorage.setItem(storageKey, JSON.stringify(state)), { state: fixtureState(recipe, includeInPlans), storageKey });
  await page.goto("/");
  await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
  return readState(page);
}

async function editPersonal(page: Page, title = "Mes quantités précises") {
  const current = currentScreen(page);
  await current.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Recette", exact: true }).click();
  await current.getByRole("tab", { name: "Favoris", exact: true }).click();
  await current.locator(".favorite-card").filter({ hasText: title }).click();
  await current.getByTestId("edit-custom-recipe").click();
  await expect(current.getByTestId("custom-recipe-view")).toBeVisible();
}

function rowFor(page: Page, name: string) {
  return currentScreen(page).locator(".custom-recipe-quantity-row").filter({ has: page.getByRole("button", { name: `Augmenter ${name}`, exact: true }) });
}

async function expectQuantity(row: Locator, label: string, unit: string) {
  await expect(row.locator("b")).toHaveText(label);
  await expect(row.locator("small")).toHaveText(`${label} ${unit} par portion`);
}

function expectData(actual: AppState, expected: AppState) {
  for (const key of APP_STATE_DATA_KEYS) expect(actual[key], `donnée préservée : ${key}`).toEqual(expected[key]);
}

async function save(page: Page) {
  await currentScreen(page).getByTestId("custom-save").click();
  await expect(currentScreen(page).getByTestId("edit-custom-recipe")).toBeVisible();
}

for (const width of [320, 390]) {
  test(`les cinq unités et fractions restent précises et réversibles à ${width} px @webkit-smoke`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const before = await fresh(page);
    await editPersonal(page);
    for (const [name, initial, increased, unit] of [
      ["carotte", "0,004", "5,004", "g"], ["lait", "0,125", "5,125", "ml"],
      ["pomme", "0,125", "0,375", "pièce"], ["graines de chia", "1", "1,25", "c. à soupe"],
      ["cannelle", "0,004", "0,254", "c. à café"],
    ]) {
      const row = rowFor(page, name);
      await expectQuantity(row, initial, unit);
      await row.getByRole("button", { name: `Augmenter ${name}`, exact: true }).click();
      await expectQuantity(row, increased, unit);
      await row.getByRole("button", { name: `Réduire ${name}`, exact: true }).click();
      await expectQuantity(row, initial, unit);
    }
    const almond = rowFor(page, before.customRecipes[0].ingredients[5].name);
    await expectQuantity(almond, "2,71828", "g");
    await rowFor(page, "graines de chia").getByRole("button", { name: "Augmenter graines de chia", exact: true }).click();
    await expectQuantity(rowFor(page, "graines de chia"), "1,25", "c. à soupe");
    await expect.poll(() => currentScreen(page).evaluate((element) => Math.round(element.getBoundingClientRect().left))).toBe(0);
    const measurements = await currentScreen(page).locator(".custom-recipe-quantity-row").evaluateAll((rows) => rows.map((row) => {
      const box = row.getBoundingClientRect();
      const buttons = [...row.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
      const counter = row.querySelector("b")!.getBoundingClientRect();
      return { rowFits: row.scrollWidth <= row.clientWidth + 1, inViewport: box.left >= 0 && box.right <= innerWidth + 1, targets: buttons.every((button) => button.width >= 44 && button.height >= 44), separated: counter.left >= buttons[0].right && counter.right <= buttons[1].left };
    }));
    for (const measurement of measurements) expect(measurement).toEqual({ rowFits: true, inViewport: true, targets: true, separated: true });
    await rowFor(page, "graines de chia").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`quantites-${width}px.png`), fullPage: true });
    await rowFor(page, "graines de chia").getByRole("button", { name: "Réduire graines de chia", exact: true }).click();
    await save(page);
    expectData(await readState(page), before);
    await page.reload();
    await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
    expectData(await readState(page), before);
  });
}

test("une baisse volontaire retire seulement l’ingrédient mis à zéro à la sauvegarde @webkit-smoke", async ({ page }) => {
  const before = await fresh(page);
  await editPersonal(page);
  await rowFor(page, "carotte").getByRole("button", { name: "Réduire carotte", exact: true }).click();
  await expectQuantity(rowFor(page, "carotte"), "0", "g");
  expectData(await readState(page), before);
  await save(page);
  const recipe = before.customRecipes[0];
  const expected = { ...before, customRecipes: [{ ...recipe, ingredients: recipe.ingredients.slice(1), nutritionRecalculated: false, costRecalculated: false }] };
  expectData(await readState(page), expected);
  await page.reload();
  await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
  expectData(await readState(page), expected);
});

test("le dernier ingrédient ne peut pas être supprimé en écrasant la recette @webkit-smoke", async ({ page }) => {
  const recipe = quantityRecipe();
  recipe.ingredients = [recipe.ingredients[0]];
  const before = await fresh(page, recipe);
  await editPersonal(page);
  await rowFor(page, "carotte").getByRole("button", { name: "Réduire carotte", exact: true }).click();
  await currentScreen(page).getByTestId("custom-save").click();
  await expect(currentScreen(page).getByRole("alert")).toHaveText("Conservez au moins un ingrédient avec une quantité positive. Votre recette précédente est conservée.");
  await expect(currentScreen(page).getByTestId("custom-recipe-view")).toBeVisible();
  expectData(await readState(page), before);
});

test("le plafond de quantité désactive l’augmentation sans tronquer ni perdre l’original @webkit-smoke", async ({ page }) => {
  const recipe = quantityRecipe();
  recipe.ingredients = [{ ...recipe.ingredients[0], quantity: 1_000_000 }];
  const before = await fresh(page, recipe);
  await editPersonal(page);
  const row = rowFor(page, "carotte");
  await expectQuantity(row, "1000000", "g");
  await expect(row.getByRole("button", { name: "Augmenter carotte", exact: true })).toBeDisabled();
  await row.getByRole("button", { name: "Réduire carotte", exact: true }).click();
  await expectQuantity(row, "999995", "g");
  await row.getByRole("button", { name: "Augmenter carotte", exact: true }).click();
  await expectQuantity(row, "1000000", "g");
  await save(page);
  expectData(await readState(page), before);
});

test("les quantités recalculent coût et nutrition sans altérer les deux plans ni la restauration @webkit-smoke", async ({ page }) => {
  const diagnostics: string[] = [];
  page.on("pageerror", (error) => diagnostics.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.push(message.text()); });
  page.on("requestfailed", (request) => diagnostics.push(`${request.url()} ${request.failure()?.errorText}`));
  const source = RECIPES.find((recipe) => recipe.id === "catalog-r631")!;
  const recipe = { ...structuredClone(source), id: "perso-catalog-r631-quantities", title: "Riz personnalisé précis" };
  const before = await fresh(page, recipe, true);
  expect(before.currentPlan!.meals.some((meal) => meal.recipeId === recipe.id)).toBe(true);
  expect(before.upcomingPlan!.meals.some((meal) => meal.recipeId === recipe.id)).toBe(true);
  await editPersonal(page, recipe.title);
  await rowFor(page, "riz complet cru").getByRole("button", { name: "Augmenter riz complet cru", exact: true }).click();
  await expectQuantity(rowFor(page, "riz complet cru"), "75", "g");
  await save(page);
  const ingredients = before.customRecipes[0].ingredients.map((ingredient) => ingredient.id === "riz-complet" ? { ...ingredient, quantity: 75 } : ingredient);
  const estimates = await recalculateRecipeEstimates(before.customRecipes[0], ingredients);
  expect(estimates.costPerPortion).toBe(1.36);
  expect(estimates.costRecalculated).toBe(true);
  expect(estimates.nutritionRecalculated).toBe(true);
  expect(estimates.nutrition).toEqual({ ...source.nutrition, calories: 378, protein: 10.1, fiber: 10.1 });
  const updated = { ...before.customRecipes[0], ingredients, ...estimates };
  const expected = { ...before, customRecipes: [updated], currentPlan: refreshPlanEstimate(before.currentPlan!, [...RECIPES, updated]), upcomingPlan: refreshPlanEstimate(before.upcomingPlan!, [...RECIPES, updated]) };
  expect(expected.currentPlan.estimatedCost).toBeGreaterThan(before.currentPlan!.estimatedCost);
  expect(expected.upcomingPlan.estimatedCost).toBeGreaterThan(before.upcomingPlan!.estimatedCost);
  // The editor can close before the persistence effect has flushed both plans.
  await expect.poll(async () => {
    const state = await readState(page);
    return [state.currentPlan?.estimatedCost, state.upcomingPlan?.estimatedCost];
  }, { message: `Coûts recalculés après chargement de la table nutritive. ${diagnostics.join("; ")}` }).toEqual([expected.currentPlan.estimatedCost, expected.upcomingPlan.estimatedCost]);
  expectData(await readState(page), expected);
  await page.reload();
  const current = currentScreen(page);
  await expect(current.getByTestId("home-view")).toBeVisible();
  expectData(await readState(page), expected);
  await current.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  await current.getByRole("button", { name: /Informations et confidentialité/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await current.getByTestId("backup-export").click();
  const download = await downloadPromise;
  const contents = await readFile((await download.path())!, "utf8");
  const exported = JSON.parse(contents);
  expect(exported.version).toBe(before.version);
  expectData(exported.state, expected);
  await current.getByTestId("backup-import").setInputFiles({ name: "quantites-preservees.json", mimeType: "application/json", buffer: Buffer.from(contents) });
  await current.getByTestId("backup-confirm").click();
  await expect(current.getByTestId("backup-feedback")).toContainText("Sauvegarde restaurée");
  expectData(await readState(page), expected);
  await page.reload();
  await expect(current.getByTestId("home-view")).toBeVisible();
  expectData(await readState(page), expected);
  await editPersonal(page, recipe.title);
  await expectQuantity(rowFor(page, "riz complet cru"), "75", "g");
});
