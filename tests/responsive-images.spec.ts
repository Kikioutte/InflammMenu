import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assignRecipeToSlot, generateWeeklyPlan } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, migrateAppState, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block" });
test.setTimeout(60_000);

const storageKey = "inflamm-menu:app-state";
const firstFile = "r1088-papillotes-de-poulet-fenouil-cotes-de-blette.jpg";
const secondFile = "r1207-salade-de-fruits-prunes-raisin-doux-abricots-secs.jpg";
const photoPath = (file: string) => `/assets/recipes/generated/${file}`;
const personalTitle = "Ma photo personnelle conservée";
const catalogueTitle = "Papillotes de poulet — fenouil, côtes de blette";
const current = (page: Page) => page.getByTestId("flow-current");

function fixtureState(): AppState {
  const source = RECIPES.find((recipe) => recipe.id === "catalog-r631")!;
  const recipe = { ...structuredClone(source), id: "perso-responsive-photo", title: personalTitle, image: photoPath(firstFile) };
  const profile = { ...structuredClone(DEFAULT_APP_STATE.profile), maxPrepMinutes: 90 };
  const plan = (seed: string, startsOn: string) => {
    const generated = generateWeeklyPlan(RECIPES, profile, { seed, startsOn });
    return assignRecipeToSlot(generated, generated.meals[0], recipe, [...RECIPES, recipe], profile);
  };
  return migrateAppState({ ...structuredClone(DEFAULT_APP_STATE), profile, onboardingCompleted: true,
    customRecipes: [recipe], favoriteRecipeIds: [recipe.id], recipeNotes: { [recipe.id]: "Note préservée" },
    currentPlan: plan("responsive-current", "2026-09-28"), upcomingPlan: plan("responsive-upcoming", "2026-10-05"),
    recipeCollections: [{ id: "responsive-collection", name: "Photos conservées", recipeIds: [recipe.id] }],
  })!;
}

async function fresh(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.addInitScript(({ key, state }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { key: storageKey, state: fixtureState() });
  await page.goto("/");
  await expect(current(page).getByTestId("home-view")).toBeVisible();
  return readState(page);
}

async function readState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}

const personalPreview = (page: Page) => current(page).locator(".meal-preview").filter({ hasText: personalTitle });
const nav = (page: Page, name: string) => current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }).click();

async function decoded(image: Locator) {
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
}

async function selectedImage(image: Locator, width: number, original: string) {
  await decoded(image);
  await expect(image).toHaveAttribute("src", original);
  await expect(image).toHaveAttribute("srcset", /\/responsive\/[a-f0-9]{12}\//);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.currentSrc)).toMatch(new RegExp(`\\.w${width}\\.webp$`));
  return image.evaluate((element: HTMLImageElement) => ({ url: element.currentSrc, cssWidth: element.getBoundingClientRect().width, naturalWidth: element.naturalWidth, dpr: devicePixelRatio }));
}

const profiles = [
  { name: "mobile320-DPR2", viewport: { width: 320, height: 844 }, dpr: 2, hero: 640, card: 640, detail: 640 },
  { name: "mobile390-DPR3", viewport: { width: 390, height: 844 }, dpr: 3, hero: 1200, card: 640, detail: 900 },
  { name: "desktop1440-DPR1", viewport: { width: 1440, height: 1000 }, dpr: 1, hero: 1200, card: 320, detail: 900 },
  { name: "desktop1440-DPR2", viewport: { width: 1440, height: 1000 }, dpr: 2, hero: 1200, card: 640, detail: 900 },
];

for (const profile of profiles) test.describe(profile.name, () => {
  test.use({ viewport: profile.viewport, deviceScaleFactor: profile.dpr });
  test("les photos choisies et les octets reçus correspondent aux tailles affichées @webkit-smoke", async ({ page }, info) => {
    const responses = new Map<string, Response>();
    const requested = new Set<string>();
    page.on("request", (request) => { if (request.resourceType() === "image") requested.add(new URL(request.url()).pathname); });
    page.on("response", (response) => { if (response.request().resourceType() === "image") responses.set(response.url(), response); });
    const before = await fresh(page);
    const measurements: Array<Record<string, unknown>> = [];
    const measure = async (image: Locator, width: number, original: string, slot: string) => {
      const selected = await selectedImage(image, width, original);
      expect(selected.dpr).toBe(profile.dpr);
      const response = responses.get(selected.url);
      expect(response, selected.url).toBeDefined();
      expect(response!.ok()).toBe(true);
      await response!.finished();
      expect(response!.headers()["content-type"]).toContain("image/webp");
      const bytes = (await response!.body()).byteLength;
      const sizes = await response!.request().sizes();
      const originalBytes = (await stat(resolve("public", original.slice(1)))).size;
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThan(originalBytes);
      if (width <= 320) expect(bytes).toBeLessThan(originalBytes / 2);
      expect(requested.has(original), "le JPG de secours n’est pas téléchargé lorsque le WebP réussit").toBe(false);
      measurements.push({ slot, ...selected, payloadBytes: bytes, networkBodyBytes: sizes.responseBodySize, originalBytes });
    };
    const hero = current(page).locator(".home-hero__image");
    await measure(hero, profile.hero, "/assets/inflamm-hero-bowl.jpg", "accueil");
    await expect(hero).toHaveAttribute("width", "1200");
    await expect(hero).toHaveAttribute("height", "1000");
    await expect(hero).not.toHaveAttribute("loading", "lazy");
    await page.screenshot({ path: info.outputPath(`${profile.name}-accueil.png`), fullPage: true });
    const small = personalPreview(page).locator("img");
    await measure(small, 160, photoPath(firstFile), "aperçu52px");
    await expect(small).toHaveAttribute("loading", "lazy");
    await expect(small).toHaveAttribute("alt", "");
    await nav(page, "Recette");
    await current(page).getByRole("tab", { name: "Catalogue", exact: true }).click();
    await current(page).getByLabel("Rechercher une recette", { exact: true }).fill(catalogueTitle);
    const card = current(page).locator(".catalogue-card");
    await expect(card).toHaveCount(1);
    await measure(card.locator("img"), profile.card, photoPath(firstFile), "catalogue");
    await expect(card.locator("img")).toHaveAttribute("loading", "lazy");
    await expect(card.locator("img")).toHaveAttribute("width", "900");
    await expect(card.locator("img")).toHaveAttribute("height", "900");
    await current(page).getByLabel("Rechercher une recette", { exact: true }).evaluate((element: HTMLInputElement) => element.blur());
    await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: info.outputPath(`${profile.name}-catalogue.png`), fullPage: true });
    await card.click();
    const detail = current(page).locator(".catalogue-detail__hero > img");
    await measure(detail, profile.detail, photoPath(firstFile), "fiche");
    await expect(detail).toHaveAttribute("alt", `Illustration générée par IA : ${catalogueTitle}`);
    await expect(detail).not.toHaveAttribute("loading", "lazy");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect.poll(() => current(page).evaluate((element) => Math.round(element.getBoundingClientRect().left))).toBe(0);
    await expect.poll(() => current(page).evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(profile.viewport.width);
    await page.screenshot({ path: info.outputPath(`${profile.name}.png`), fullPage: true });
    const after = await readState(page);
    for (const key of APP_STATE_DATA_KEYS) expect(after[key], key).toEqual(before[key]);
    expect(after.customRecipes[0].image).toBe(photoPath(firstFile));
    const metricsPath = info.outputPath("photos-reseau.json");
    await writeFile(metricsPath, JSON.stringify(measurements, null, 2));
    await info.attach("photos-reseau.json", { path: metricsPath, contentType: "application/json" });
  });
});

test.describe("replis et sauvegardes", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test("un WebP absent reprend le JPG original sans candidat en boucle @webkit-smoke", async ({ page }) => {
    let failed = 0;
    await page.route(/\/responsive\/[^/]+\/generated\/r1088-.*\.webp$/, (route) => { failed += 1; return route.abort(); });
    const before = await fresh(page);
    const image = personalPreview(page).locator("img");
    await decoded(image);
    await expect(image).not.toHaveAttribute("srcset");
    await expect(image).not.toHaveAttribute("sizes");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => new URL(element.currentSrc).pathname)).toBe(photoPath(firstFile));
    expect(failed).toBe(1);
    expect((await readState(page)).customRecipes).toEqual(before.customRecipes);
  });

  for (const placeholderFails of [false, true]) test(`WebP et JPG absents donnent un repli borné, placeholder ${placeholderFails ? "absent" : "présent"} @webkit-smoke`, async ({ page }) => {
    const failed: string[] = [];
    await page.addInitScript(() => {
      const writes = new WeakMap<HTMLImageElement, Array<string | null>>();
      (window as any).__responsiveImageSrcWrites = writes;
      new MutationObserver((records) => {
        for (const record of records) {
          if (!(record.target instanceof HTMLImageElement)) continue;
          const previous = writes.get(record.target) ?? [];
          previous.push(record.oldValue);
          writes.set(record.target, previous);
        }
      }).observe(document, { attributes: true, attributeFilter: ["src"], attributeOldValue: true, subtree: true });
    });
    await page.route(/\/responsive\/[^/]+\/generated\/r1088-.*\.webp$|\/generated\/r1088-.*\.jpg$/, (route) => { failed.push(route.request().url()); return route.abort(); });
    if (placeholderFails) await page.route("**/assets/recipe-placeholder.svg", (route) => { failed.push(route.request().url()); return route.abort(); });
    const before = await fresh(page);
    const image = personalPreview(page).locator("img");
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("src", "/assets/recipe-placeholder.svg");
    await expect(image).not.toHaveAttribute("srcset");
    await expect(image).not.toHaveAttribute("sizes");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete)).toBe(true);
    if (!placeholderFails) await decoded(image);
    await expect.poll(() => failed.length).toBe(placeholderFails ? 3 : 2);
    // React must be the only writer of the placeholder, even when it fails.
    expect(await image.evaluate((element) => (window as any).__responsiveImageSrcWrites.get(element) ?? [])).not.toContain("/assets/recipe-placeholder.svg");
    // Repeated errors and layout/selection cycles must not restart the chain.
    for (const width of [430, 320, 390]) {
      if (placeholderFails) await image.dispatchEvent("error");
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(failed).toHaveLength(placeholderFails ? 3 : 2);
      await expect(image).toHaveAttribute("src", "/assets/recipe-placeholder.svg");
      await expect(image).not.toHaveAttribute("srcset");
      await expect(image).not.toHaveAttribute("sizes");
      if (!placeholderFails) await decoded(image);
    }
    const after = await readState(page);
    for (const key of APP_STATE_DATA_KEYS) expect(after[key], key).toEqual(before[key]);
  });

  test("un changement distant de photo réinitialise le repli et conserve les URLs de sauvegarde @webkit-smoke", async ({ page }) => {
    await page.route(/\/responsive\/[^/]+\/generated\/r1088-.*\.webp$|\/generated\/r1088-.*\.jpg$/, (route) => route.abort());
    const before = await fresh(page);
    const preview = personalPreview(page);
    await expect(preview.locator("img")).toHaveAttribute("src", "/assets/recipe-placeholder.svg");
    await preview.evaluate((element) => { (window as any).__responsivePreview = element; });
    let navigations = 0;
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
    const peer = await page.context().newPage();
    try {
      await peer.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
      await peer.goto("/");
      await expect(current(peer).getByTestId("home-view")).toBeVisible();
      await current(peer).getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
      await current(peer).getByRole("button", { name: /Informations et confidentialité/ }).click();
      const replacement = structuredClone(before);
      replacement.customRecipes[0].image = `/AncienneApplication${photoPath(secondFile)}`;
      await current(peer).getByTestId("backup-import").setInputFiles({ name: "photo-originale.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "inflamm-menu-backup", version: before.version, exportedAt: "2026-09-28T12:00:00Z", state: replacement })) });
      await current(peer).getByTestId("backup-confirm").click();
      await expect(current(peer).getByTestId("backup-feedback")).toContainText("Sauvegarde restaurée");
      await selectedImage(preview.locator("img"), 160, photoPath(secondFile));
      expect(await preview.evaluate((element) => element === (window as any).__responsivePreview)).toBe(true);
      expect(navigations).toBe(0);
      const expected = { ...before, customRecipes: [{ ...before.customRecipes[0], image: photoPath(secondFile) }] };
      for (const key of APP_STATE_DATA_KEYS) expect((await readState(page))[key], key).toEqual(expected[key]);
      const downloadPromise = peer.waitForEvent("download");
      await current(peer).getByTestId("backup-export").click();
      const download = await downloadPromise;
      const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
      expect(exported.state.customRecipes[0].image).toBe(photoPath(secondFile));
      expect(exported.state.customRecipes[0].image).not.toContain("/responsive/");
      await page.reload();
      await expect(current(page).getByTestId("home-view")).toBeVisible();
      await selectedImage(personalPreview(page).locator("img"), 160, photoPath(secondFile));
      expect((await readState(page)).customRecipes).toEqual(expected.customRecipes);
    } finally { await peer.close(); }
  });
});
