import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { type Recipe } from "../src/domain";
import { generateWeeklyPlan } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, migrateAppState, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
test.setTimeout(45_000);

const storageKey = "inflamm-menu:app-state";
const personalId = "perso-duration";
const title = "Ma recette longue";
const currentScreen = (page: Page) => page.getByTestId("flow-current");

function fixtureState(prepMinutes = 15): AppState {
  const recipe: Recipe = {
    id: personalId, title, prepMinutes, restMinutes: 2880,
    mealTypes: ["lunch"], diet: ["classic", "vegetarian", "no-pork"], costPerPortion: 2, seasons: ["all-year"], equipment: ["hob"], allergens: [], tags: [],
    ingredients: [{ id: "carrot", name: "carotte", quantity: 100, unit: "g", category: "fruit-vegetable" }],
    nutrition: { calories: 100, protein: 3, fiber: 2, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    nutritionRecalculated: true, costRecalculated: true,
    description: "Fixture de durée indépendante du planificateur.", steps: ["Préparer la recette.", "Prévoir le repos indiqué."],
    conservation: "À consommer rapidement.", image: "/assets/recipe-placeholder.svg",
  };
  const profile = { ...structuredClone(DEFAULT_APP_STATE.profile), firstName: "Données préservées", maxPrepMinutes: 90 };
  // A long personal recipe must not bypass the profile's planner limit. The
  // two plans therefore remain compatible and do not contain this fixture.
  const currentPlan = generateWeeklyPlan(RECIPES, profile, { seed: "duration-current", startsOn: "2026-09-28" });
  const upcomingPlan = generateWeeklyPlan(RECIPES, profile, { seed: "duration-upcoming", startsOn: "2026-10-05" });
  return migrateAppState({
    ...structuredClone(DEFAULT_APP_STATE), profile, currentPlan, upcomingPlan, onboardingCompleted: true,
    customRecipes: [recipe], favoriteRecipeIds: [personalId], recipeNotes: { [personalId]: "Note conservée" },
    recipeCollections: [{ id: "collection-duration", name: "Ma collection conservée", recipeIds: [personalId] }],
    shoppingItems: [{ id: "article-duration", name: "Papier cuisson", checked: true }],
    actualSpend: { [currentPlan.id]: 73.5 },
  })!;
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

async function fresh(page: Page, minutes = 15) {
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.goto("/tests/runtime-fixture.html");
  await page.evaluate(({ state, storageKey }) => localStorage.setItem(storageKey, JSON.stringify(state)), { state: fixtureState(minutes), storageKey });
  await page.goto("/");
  await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
  return readState(page);
}

async function openPersonal(page: Page, recipeTitle = title) {
  const current = currentScreen(page);
  await current.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Recette", exact: true }).click();
  await current.getByRole("tab", { name: "Favoris", exact: true }).click();
  await current.locator(".favorite-card").filter({ hasText: recipeTitle }).click();
  await expect(current.getByRole("heading", { name: recipeTitle, exact: true })).toBeVisible();
}

async function editPersonal(page: Page) {
  await openPersonal(page);
  await currentScreen(page).getByTestId("edit-custom-recipe").click();
  await expect(currentScreen(page).getByTestId("custom-recipe-view")).toBeVisible();
}

function expectOtherDataPreserved(actual: AppState, before: AppState) {
  for (const key of APP_STATE_DATA_KEYS.filter((key) => key !== "customRecipes")) {
    expect(actual[key], `donnée préservée : ${key}`).toEqual(before[key]);
  }
}

for (const minutes of [600, 601, 1440]) {
  test(`l’éditeur accepte ${minutes} minutes actives sans toucher au repos ni aux plans @webkit-smoke`, async ({ page }) => {
    const before = await fresh(page);
    await editPersonal(page);
    await currentScreen(page).getByTestId("custom-time").fill(String(minutes));
    await currentScreen(page).getByTestId("custom-save").click();
    await expect(currentScreen(page).getByTestId("edit-custom-recipe")).toBeVisible();
    await expect.poll(async () => (await readState(page)).customRecipes[0].prepMinutes).toBe(minutes);
    const after = await readState(page);
    expect(after.customRecipes).toEqual([{ ...before.customRecipes[0], prepMinutes: minutes }]);
    expectOtherDataPreserved(after, before);
    await page.reload();
    await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
    expect((await readState(page)).customRecipes).toEqual(after.customRecipes);
    expectOtherDataPreserved(await readState(page), before);
  });
}

test("l’éditeur refuse les durées hors borne, fractionnaires ou non finies sans écraser l’original @webkit-smoke", async ({ page }) => {
  const before = await fresh(page, 1440);
  await editPersonal(page);
  const current = currentScreen(page);
  for (const value of ["1441", "0", "-1", "1,5", "1.5", "NaN", "Infinity", ""]) {
    await current.getByTestId("custom-time").fill(value);
    await current.getByTestId("custom-save").click();
    await expect(current.getByRole("alert")).toContainText(/1 et 1[\s\u00a0\u202f]?440 minutes/);
    await expect(current.getByTestId("custom-time")).toHaveAttribute("aria-invalid", "true");
    await expect(current.getByTestId("custom-time")).toBeFocused();
    expect((await readState(page)).customRecipes).toEqual(before.customRecipes);
    expectOtherDataPreserved(await readState(page), before);
  }
});

test("une recette chargée à 1440 minutes reste éditable et survit à un export puis une restauration réels @webkit-smoke", async ({ page }, info) => {
  const before = await fresh(page, 1440);
  await editPersonal(page);
  const current = currentScreen(page);
  const renamed = "Ma recette longue renommée";
  await expect(current.getByTestId("custom-time")).toHaveValue("1440");
  await current.getByTestId("custom-title").fill(renamed);
  await current.getByTestId("custom-save").click();
  await expect(current.getByRole("heading", { name: renamed, exact: true })).toBeVisible();
  await expect(current.locator(".recipe-meta")).toContainText("1 j actives");
  await expect(current.getByTestId("advance-note")).toContainText("2 j de repos");
  const saved = await readState(page);
  expect(saved.customRecipes).toEqual([{ ...before.customRecipes[0], title: renamed }]);
  expectOtherDataPreserved(saved, before);
  await page.reload();
  await expect(current.getByTestId("home-view")).toBeVisible();
  await current.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  await current.getByRole("button", { name: /Informations et confidentialité/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await current.getByTestId("backup-export").click();
  const download = await downloadPromise;
  const contents = await readFile((await download.path())!, "utf8");
  const exported = JSON.parse(contents);
  expect(exported.version).toBe(before.version);
  expect(exported.state.customRecipes).toEqual(saved.customRecipes);
  expect(exported.state.currentPlan).toEqual(before.currentPlan);
  expect(exported.state.upcomingPlan).toEqual(before.upcomingPlan);
  await current.getByTestId("backup-import").setInputFiles({ name: "durees-preservees.json", mimeType: "application/json", buffer: Buffer.from(contents) });
  await expect(current.getByTestId("backup-confirmation")).toBeVisible();
  await current.getByTestId("backup-confirm").click();
  await expect(current.getByTestId("backup-feedback")).toContainText("Sauvegarde restaurée");
  expect((await readState(page)).customRecipes).toEqual(saved.customRecipes);
  expectOtherDataPreserved(await readState(page), before);
  await page.reload();
  await expect(current.getByTestId("home-view")).toBeVisible();
  expect((await readState(page)).customRecipes).toEqual(saved.customRecipes);
  expectOtherDataPreserved(await readState(page), before);
  await openPersonal(page, renamed);
  await current.getByTestId("edit-custom-recipe").click();
  await expect(current.getByTestId("custom-time")).toHaveValue("1440");
  await expect.poll(() => current.evaluate((element) => Math.round(element.getBoundingClientRect().left))).toBe(0);
  await page.screenshot({ path: info.outputPath("editeur-duree-1440-restauree.png"), fullPage: true });
});
