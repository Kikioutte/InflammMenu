import { chromium, webkit, expect, test, type Page } from "@playwright/test";
import { builtOrigin } from "./helpers/built-pages-origin";
import { assignRecipeToSlot, generateWeeklyPlan } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, migrateAppState, type AppState } from "../src/storage";

test.setTimeout(60_000);
const base = "/InflammMenu/";
const firstFile = "r1088-papillotes-de-poulet-fenouil-cotes-de-blette.jpg";
const secondFile = "r1207-salade-de-fruits-prunes-raisin-doux-abricots-secs.jpg";
const title = "Photo personnelle hors ligne";
const current = (page: Page) => page.getByTestId("flow-current");
const original = (file: string) => `${base}assets/recipes/generated/${file}`;

function fixtureState(withPlan: boolean): AppState {
  const source = RECIPES.find((recipe) => recipe.id === "catalog-r631")!;
  const first = { ...structuredClone(source), id: "perso-responsive-offline", title, image: original(firstFile) };
  const second = { ...structuredClone(source), id: "perso-responsive-unvisited", title: "Photo jamais téléchargée", image: original(secondFile) };
  const profile = { ...structuredClone(DEFAULT_APP_STATE.profile), maxPrepMinutes: 90 };
  const generated = generateWeeklyPlan(RECIPES, profile, { seed: "responsive-offline", startsOn: "2026-09-28" });
  const plan = assignRecipeToSlot(generated, generated.meals[0], first, [...RECIPES, first, second], profile);
  return migrateAppState({ ...structuredClone(DEFAULT_APP_STATE), profile, onboardingCompleted: true,
    customRecipes: [first, second], favoriteRecipeIds: [first.id, second.id], currentPlan: withPlan ? plan : null,
    recipeNotes: { [first.id]: "Note hors ligne conservée" },
  })!;
}

async function boot(page: Page, origin: string, withPlan: boolean) {
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.addInitScript((state) => { if (!localStorage.getItem("inflamm-menu:app-state")) localStorage.setItem("inflamm-menu:app-state", JSON.stringify(state)); }, fixtureState(withPlan));
  await page.goto(`${origin}${base}`);
  await expect(current(page).getByTestId("home-view")).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.reload();
  await expect(current(page).getByTestId("home-view")).toBeVisible();
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state")!));
}

async function familyCacheKeys(page: Page, filename = firstFile) {
  return page.evaluate(async (filename) => {
    const stem = filename.replace(/\.jpg$/, "");
    const names = (await caches.keys()).filter((name) => name.startsWith("inflamm-menu-runtime-"));
    return (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname))))
      .flat().filter((path) => path.endsWith(`/generated/${filename}`) || path.includes(`/generated/${stem}.w`));
  }, filename);
}

async function expectDecoded(image: ReturnType<Page["locator"]>) {
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
}

for (const [name, engine] of [["Chromium", chromium], ["WebKit", webkit]] as const) {
  test(`le héros précaché reste léger et visible sans serveur avec ${name}`, async () => {
    const origin = await builtOrigin();
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: "allow" });
      const page = await context.newPage();
      await boot(page, origin.url, false);
      const before = await readState(page);
      const hero = current(page).locator(".home-hero__image");
      await expectDecoded(hero);
      const shellPhotos = await page.evaluate(async () => {
        const names = (await caches.keys()).filter((name) => name.startsWith("inflamm-menu-shell-"));
        return (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname))))
          .flat().filter((path) => /\/assets\/(?:recipes\/|inflamm-hero-bowl\.jpg)/.test(path));
      });
      expect(shellPhotos).toHaveLength(1);
      expect(shellPhotos[0]).toMatch(/\/assets\/recipes\/responsive\/[a-f0-9]{12}\/_hero\/inflamm-hero-bowl\.w1200\.webp$/);
      expect(origin.requests).toContain(shellPhotos[0]);
      expect(origin.requests.filter((path) => path.endsWith("/assets/inflamm-hero-bowl.jpg"))).toEqual([]);
      // 1200 px was not previously displayed: after this origin is stopped,
      // the worker must make its shell image available for the larger slot.
      await origin.stop();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.currentSrc)).toMatch(/\.w1200\.webp$/);
      await expectDecoded(hero);
      await expect(hero).toHaveAttribute("src", `${base}assets/inflamm-hero-bowl.jpg`);
      await page.reload();
      await expect(current(page).getByTestId("home-view")).toBeVisible();
      await expectDecoded(current(page).locator(".home-hero__image"));
      await expect(current(page).locator(".home-hero__image")).toHaveAttribute("srcset", /responsive/);
      for (const key of APP_STATE_DATA_KEYS) expect((await readState(page))[key], key).toEqual(before[key]);
      await context.close();
    } finally { await browser.close(); await origin.stop(); }
  });

  test(`une petite photo reste visible en fiche et après agrandissement sans serveur avec ${name}`, async ({}, info) => {
    const origin = await builtOrigin();
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 320, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "allow" });
      const page = await context.newPage();
      await boot(page, origin.url, true);
      const before = await readState(page);
      const preview = current(page).locator(".meal-preview").filter({ hasText: title });
      await expectDecoded(preview.locator("img"));
      await expect.poll(() => preview.locator("img").evaluate((image: HTMLImageElement) => image.currentSrc)).toMatch(/\.w160\.webp$/);
      await expect.poll(() => familyCacheKeys(page)).toHaveLength(1);
      expect((await familyCacheKeys(page))[0]).toMatch(/\.w160\.webp$/);
      await origin.stop();
      await preview.click();
      const image = current(page).locator(".recipe-hero");
      await expectDecoded(image);
      await expect(image).toHaveAttribute("src", original(firstFile));
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.currentSrc)).toMatch(/\.w640\.webp$/);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.currentSrc)).toMatch(/\.w900\.webp$/);
      await expectDecoded(image);
      await expect.poll(() => familyCacheKeys(page)).toHaveLength(1);
      for (const key of APP_STATE_DATA_KEYS) expect((await readState(page))[key], key).toEqual(before[key]);
      await page.screenshot({ path: info.outputPath(`photo-hors-ligne-${name}.png`), fullPage: true });
      await page.reload();
      await expect(current(page).getByTestId("home-view")).toBeVisible();
      await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Recette", exact: true }).click();
      await current(page).getByRole("tab", { name: "Favoris", exact: true }).click();
      const unseen = current(page).locator(".favorite-card").filter({ hasText: "Photo jamais téléchargée" }).locator("img");
      await expectDecoded(unseen);
      await expect(unseen).toHaveAttribute("src", `${base}assets/recipe-placeholder.svg`);
      expect(await familyCacheKeys(page, secondFile)).toEqual([]);
      await context.close();
    } finally { await browser.close(); await origin.stop(); }
  });

  test(`une ancienne photo JPG en cache reste utilisable sans réseau avec ${name}`, async () => {
    const origin = await builtOrigin();
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, serviceWorkers: "allow" });
      const page = await context.newPage();
      await boot(page, origin.url, false);
      const before = await readState(page);
      // A real original-image request creates the legacy cache entry. No fake
      // bytes or successful route responses stand in for the built assets.
      await page.evaluate((url) => new Promise<void>((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error("JPG original manquant")); image.src = url;
      }), `${origin.url}${original(firstFile)}`);
      await expect.poll(() => familyCacheKeys(page)).toEqual([original(firstFile)]);
      await origin.stop();
      await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Recette", exact: true }).click();
      await current(page).getByRole("tab", { name: "Favoris", exact: true }).click();
      const card = current(page).locator(".favorite-card").filter({ hasText: title });
      await expectDecoded(card.locator("img"));
      await expect(card.locator("img")).toHaveAttribute("src", original(firstFile));
      await card.click();
      await expectDecoded(current(page).locator(".recipe-hero"));
      await expect(current(page).locator(".recipe-hero")).toHaveAttribute("src", original(firstFile));
      expect(await familyCacheKeys(page)).toEqual([original(firstFile)]);
      for (const key of APP_STATE_DATA_KEYS) expect((await readState(page))[key], key).toEqual(before[key]);
      await context.close();
    } finally { await browser.close(); await origin.stop(); }
  });
}
