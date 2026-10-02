import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PROFILE, type DietMode } from "../src/domain";
import { summarizePlan } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { DEFAULT_APP_STATE, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

const storageKey = "inflamm-menu:app-state";
const currentScreen = (page: Page) => page.getByTestId("flow-current");

function fixtureState(diet: DietMode): AppState {
  return {
    ...structuredClone(DEFAULT_APP_STATE),
    onboardingCompleted: true,
    profile: {
      ...structuredClone(DEFAULT_PROFILE),
      diet,
      weeklyBudget: 200,
      weeklyTargets: { legumeMeals: 2, fishMeals: 3 },
    },
  };
}

// Same pre-mount, two-replica seeding as audit-followup and recipe-detail:
// no init-script reset on reload and no race with the app's autosave.
async function seedAndOpen(page: Page, state: AppState) {
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
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
  await page.goto("/");
  await expect(currentScreen(page).getByTestId("home-view")).toBeVisible();
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

for (const { diet, label, permitsFish } of [
  { diet: "classic", label: "Classique", permitsFish: true },
  { diet: "no-pork", label: "Sans porc", permitsFish: true },
  { diet: "vegetarian", label: "Végétarien", permitsFish: false },
] as const) {
  test(`l’objectif poisson suit le régime ${label} dans le profil, la génération et le bilan @webkit-smoke`, async ({ page }) => {
    await seedAndOpen(page, fixtureState(diet));
    const current = currentScreen(page);
    await current.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
    await expect(current.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");

    const targets = current.getByTestId("targets-section");
    await expect(targets.getByTestId("target-legume")).toHaveText("2");
    if (permitsFish) {
      await expect(targets.getByText("Repas avec poisson", { exact: true })).toBeVisible();
      await expect(targets.getByTestId("target-fish")).toHaveText("3");
      await targets.getByRole("button", { name: "Plus de repas avec poisson", exact: true }).click();
      await expect(targets.getByTestId("target-fish")).toHaveText("4");
    } else {
      await expect(targets.getByTestId("target-fish")).toHaveCount(0);
      await expect(targets.getByRole("button", { name: /repas avec poisson/ })).toHaveCount(0);
      await expect(targets.getByText("L’objectif poisson ne s’applique pas au régime sélectionné.", { exact: true })).toBeVisible();
    }
    const expectedTarget = permitsFish ? 4 : 3;
    await current.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
    await expect(current.getByTestId("home-view")).toBeVisible();
    await expect.poll(async () => (await readState(page)).profile.weeklyTargets.fishMeals).toBe(expectedTarget);

    await current.getByRole("button", { name: "Générer ma semaine", exact: true }).click();
    await expect(current.getByRole("heading", { name: "Prête en quelques secondes", exact: true })).toBeVisible();
    const fishRule = current.locator(".rule-list p").filter({ hasText: /repas avec poisson visés/ });
    if (permitsFish) await expect(fishRule).toHaveText(`${expectedTarget} repas avec poisson visés`);
    else await expect(fishRule).toHaveCount(0);

    await current.getByTestId("target-current").click();
    await current.getByRole("button", { name: "Créer ma semaine", exact: true }).click();
    await expect(current.getByRole("heading", { name: "Votre semaine est prête", exact: true })).toBeVisible();
    await current.getByRole("button", { name: "Voir ma semaine", exact: true }).click();
    await expect(current.getByTestId("week-view")).toBeVisible();
    await expect.poll(async () => (await readState(page)).currentPlan?.meals.length).toBe(14);
    const stored = await readState(page);
    expect(stored.profile.diet).toBe(diet);
    expect(stored.currentPlan!.profileSnapshot.diet).toBe(diet);
    expect(stored.currentPlan!.profileSnapshot.weeklyTargets.fishMeals).toBe(expectedTarget);
    const summary = summarizePlan(stored.currentPlan!, RECIPES, stored.profile);

    const balance = current.getByTestId("week-balance");
    await expect(balance.getByRole("heading", { name: "Bilan de la semaine", exact: true })).toBeVisible();
    const fishRow = balance.locator("li").filter({ hasText: "Repas avec poisson" });
    if (permitsFish) {
      await expect(fishRow).toBeVisible();
      await expect(fishRow.locator("b")).toHaveText(`${summary.fishMeals} / ${expectedTarget} visés`);
      expect(summary.fishMeals).toBeGreaterThanOrEqual(expectedTarget);
    } else {
      await expect(fishRow).toHaveCount(0);
      expect(summary.fishMeals).toBe(0);
    }
  });
}

test("changer de régime masque seulement le réglage poisson et conserve sa valeur", async ({ page }) => {
  await seedAndOpen(page, fixtureState("classic"));
  const current = currentScreen(page);
  await current.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  const target = current.getByTestId("target-fish");
  await expect(target).toHaveText("3");
  await current.getByRole("button", { name: "Sans porc", exact: true }).click();
  await expect(target).toHaveText("3");
  await current.getByRole("button", { name: "Plus de repas avec poisson", exact: true }).click();
  await expect(target).toHaveText("4");
  await current.getByRole("button", { name: "Végétarien", exact: true }).click();
  await expect(target).toHaveCount(0);
  await current.getByRole("button", { name: "Classique", exact: true }).click();
  await expect(target).toHaveText("4");
  await current.getByRole("button", { name: "Sans porc", exact: true }).click();
  await current.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
  await expect(current.getByTestId("home-view")).toBeVisible();
  await expect.poll(async () => {
    const { profile } = await readState(page);
    return { diet: profile.diet, fishMeals: profile.weeklyTargets.fishMeals };
  }).toEqual({ diet: "no-pork", fishMeals: 4 });
  await page.reload();
  await expect(current.getByTestId("home-view")).toBeVisible();
  await current.getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  await expect(current.getByRole("button", { name: "Sans porc", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(target).toHaveText("4");
});
