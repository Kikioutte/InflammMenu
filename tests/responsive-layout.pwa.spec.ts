import { chromium, webkit, expect, test, type Page } from "@playwright/test";
import { APP_STATE_DATA_KEYS, type AppState } from "../src/storage";
import { builtOrigin } from "./helpers/built-pages-origin";

const current = (page: Page) => page.getByTestId("flow-current");
const readState = (page: Page): Promise<AppState> => page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state")!));

async function expectWindowWidth(page: Page, width: number) {
  await expect.poll(() => current(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: Math.round(box.left), width: Math.round(box.width) };
  })).toEqual({ left: 0, width });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  const content = current(page).locator("main").first();
  expect(await content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}

const sizes = [
  { name: "paysage téléphone", width: 844, height: 390 },
  { name: "petit paysage", width: 568, height: 320 },
  { name: "ordinateur portable", width: 1440, height: 900 },
  { name: "grand écran", width: 1920, height: 1080 },
];

for (const [browserName, engine] of [["Chromium", chromium], ["WebKit", webkit]] as const) {
  for (const size of sizes) {
    test(`${browserName} : ${size.name}, navigation et données conservées après rotation`, async ({}, info) => {
      const origin = await builtOrigin();
      const browser = await engine.launch();
      try {
        const context = await browser.newContext({ baseURL: origin.url, viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
        const page = await context.newPage();
        page.setDefaultTimeout(5_000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
        await page.goto("/InflammMenu/");
        await expect(page.getByTestId("onboarding-skip")).toBeVisible();
        await page.getByTestId("onboarding-skip").click();
        await expect(current(page).getByTestId("home-view")).toBeVisible();
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        const manifest = await page.evaluate(async () => {
          const response = await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href);
          if (!response.ok) throw new Error(`Manifest ${response.status}`);
          return response.json();
        });
        expect(manifest.orientation).toBe("any");
        expect(manifest.start_url).toBe("/InflammMenu/");
        expect(manifest.scope).toBe("/InflammMenu/");

        await page.setViewportSize({ width: size.width, height: size.height });
        await expectWindowWidth(page, size.width);
        await page.screenshot({ path: info.outputPath("accueil.png"), fullPage: true });
        await current(page).getByRole("button", { name: "Générer ma semaine", exact: true }).click();
        await current(page).getByTestId("target-current").click();
        await current(page).getByRole("button", { name: "Créer ma semaine", exact: true }).click();
        await current(page).getByRole("button", { name: "Voir ma semaine", exact: true }).click();
        await expect(current(page).getByTestId("week-view")).toBeVisible();
        await expectWindowWidth(page, size.width);
        await page.screenshot({ path: info.outputPath("semaine.png"), fullPage: true });

        await current(page).locator(".meal-card__more").first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect.poll(() => dialog.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
        })).toBe(true);
        await page.screenshot({ path: info.outputPath("actions-repas.png"), fullPage: true });
        await dialog.getByRole("button", { name: /^Fermer «/ }).click();
        await current(page).locator(".meal-card__main").first().click();
        await expect(current(page).getByTestId("recipe-portions")).toBeVisible();
        await expectWindowWidth(page, size.width);
        await page.screenshot({ path: info.outputPath("recette.png"), fullPage: true });
        await current(page).getByTestId("start-cooking").click();
        await expect(current(page).getByTestId("cooking-view")).toBeVisible();
        await expectWindowWidth(page, size.width);
        await page.getByTestId("flow-fixed-header").getByRole("button", { name: "Retour", exact: true }).click();
        await expect(current(page).getByTestId("recipe-portions")).toBeVisible();
        await page.getByTestId("flow-fixed-header").getByRole("button", { name: "Retour", exact: true }).click();
        await expect(current(page).getByTestId("week-view")).toBeVisible();

        await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Courses", exact: true }).click();
        await expectWindowWidth(page, size.width);
        await current(page).getByLabel("Ajouter un article", { exact: true }).fill("Papier cuisson paysage");
        await current(page).getByRole("button", { name: "Ajouter l’article", exact: true }).click();
        await current(page).getByRole("button", { name: "Cocher Papier cuisson paysage", exact: true }).click();
        await expect(current(page).getByRole("button", { name: "Décocher Papier cuisson paysage", exact: true })).toBeVisible();
        await page.screenshot({ path: info.outputPath("courses.png"), fullPage: true });
        const saved = await readState(page);
        expect(saved.currentPlan?.meals.length).toBeGreaterThan(0);

        await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Recette", exact: true }).click();
        await current(page).getByRole("tab", { name: "Catalogue", exact: true }).click();
        await expect(current(page).locator(".catalogue-card").first()).toBeVisible();
        await expectWindowWidth(page, size.width);
        const catalogueColumns = size.width >= 1920 ? 6 : size.width >= 1600 ? 5 : size.width >= 1200 ? 4 : size.width >= 760 ? 3 : 2;
        await expect.poll(() => current(page).locator(".catalogue-list").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(catalogueColumns);
        await page.screenshot({ path: info.outputPath("catalogue.png"), fullPage: true });
        await current(page).getByLabel("Rechercher une recette", { exact: true }).fill("Cabillaud en papillote de chou et fenouil");
        await expect(current(page).locator(".catalogue-card")).toHaveCount(1);
        await current(page).locator(".catalogue-card").first().click();
        await current(page).getByTestId("compose-meal").click();
        await expect(current(page).getByTestId("meal-builder-view")).toBeVisible();
        await expectWindowWidth(page, size.width);
        const builderColumns = size.width >= 1920 ? 6 : size.width >= 1600 ? 5 : size.width >= 760 ? 4 : 2;
        await expect.poll(() => current(page).locator(".meal-builder-grid").first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(builderColumns);
        await page.screenshot({ path: info.outputPath("composition.png"), fullPage: true });
        // In a short landscape window, cards must still scroll into reach
        // above the fixed footer, and the summary must remain actionable.
        await current(page).locator(".meal-builder-candidate > button").first().click();
        await current(page).getByRole("button", { name: "Voir mon repas, 2 recettes sur 3", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Votre repas", exact: true })).toBeVisible();
        await page.screenshot({ path: info.outputPath("composition-selection.png"), fullPage: true });
        await page.getByRole("dialog").getByRole("button", { name: "Continuer mon repas", exact: true }).click();

        // The real precache must retain the unrestricted manifest and menu.
        await origin.stop();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await expect(current(page).getByTestId("home-view")).toBeVisible();
        await expectWindowWidth(page, 390);
        const offlineManifest = await page.evaluate(async () => {
          const manifestUrl = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
          const cached = await caches.match(manifestUrl);
          if (!cached?.ok) throw new Error("Manifest absent du précache installé");
          return cached.json();
        });
        expect(offlineManifest.orientation).toBe("any");
        for (const key of APP_STATE_DATA_KEYS) expect((await readState(page))[key], key).toEqual(saved[key]);
        await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Courses", exact: true }).click();
        await expect(current(page).getByRole("button", { name: "Décocher Papier cuisson paysage", exact: true })).toBeVisible();
        expect(errors).toEqual([]);
        await context.close();
      } finally { await browser.close(); await origin.stop(); }
    });
  }
}
