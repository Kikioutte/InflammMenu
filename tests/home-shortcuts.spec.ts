import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { generateWeeklyPlan } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, migrateAppState, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block" });
test.setTimeout(30_000);
const key = "inflamm-menu:app-state";
const current = (page: Page) => page.getByTestId("flow-current");

function fixture(large: boolean, withMenu: boolean): AppState {
  const profile = { ...structuredClone(DEFAULT_APP_STATE.profile), maxPrepMinutes: 90 };
  const personal = { ...structuredClone(RECIPES[0]), id: "perso-home-shortcuts", title: "Recette préservée", image: "/assets/recipes/generated/r1088-papillotes-de-poulet-fenouil-cotes-de-blette.jpg" };
  const plan = (startsOn: string) => generateWeeklyPlan(RECIPES, profile, { seed: `home-shortcuts-${startsOn}`, startsOn });
  return migrateAppState({ ...structuredClone(DEFAULT_APP_STATE), profile, onboardingCompleted: true,
    textScale: large ? "large" : "normal", customRecipes: [personal], favoriteRecipeIds: [personal.id],
    recipeNotes: { [personal.id]: "Note préservée" }, shoppingItems: [{ id: "shortcuts-item", name: "Papier cuisson", checked: true }],
    recipeCollections: [{ id: "shortcuts-collection", name: "À garder", recipeIds: [personal.id] }],
    currentPlan: withMenu ? plan("2026-09-28") : null, upcomingPlan: withMenu ? plan("2026-10-05") : null,
  })!;
}

const cases = [
  { width: 1440, large: false, withMenu: true },
  { width: 1440, large: true, withMenu: false },
  { width: 768, large: false, withMenu: false },
  { width: 768, large: true, withMenu: true },
  { width: 390, large: false, withMenu: true },
  { width: 390, large: true, withMenu: false },
  { width: 320, large: false, withMenu: false },
  { width: 320, large: true, withMenu: true },
];

for (const { width, large, withMenu } of cases) {
  test(`raccourcis accueil ${width}px, texte ${large ? "agrandi" : "normal"}, menu ${withMenu ? "présent" : "absent"} @webkit-smoke`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
    await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state: fixture(large, withMenu) });
    await page.goto("/");
    await expect(current(page).getByTestId("home-view")).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    const before: AppState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
    const shortcuts = current(page).getByRole("region", { name: "Pour commencer", exact: true });
    const backup = shortcuts.getByRole("button", { name: "Sauvegarde et hors-ligne", exact: true });
    await backup.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await shortcuts.evaluate((element) => {
      const rect = (node: Element) => { const value = node.getBoundingClientRect(); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height }; };
      const week = element.nextElementSibling!;
      const bounds = rect(element);
      return {
        shortcuts: bounds, week: rect(week), viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        buttons: [...element.querySelectorAll("button")].map((button) => {
          const box = rect(button);
          // Test the entire usable target, including its lower edge; rounded
          // outside corners are excluded because they are not painted buttons.
          const points = [[0.5, 2], [0.5, box.height / 2], [0.5, box.height - 2], [0.1, box.height / 2], [0.9, box.height / 2]];
          return { label: button.textContent?.trim(), ...box, hits: points.map(([x, y]) => {
            const hit = document.elementFromPoint(box.left + box.width * x, box.top + y);
            return { owned: Boolean(hit && (hit === button || button.contains(hit))), covering: hit?.tagName + "." + (hit?.className ?? "") };
          }) };
        }),
      };
    });
    const geometryPath = info.outputPath("geometrie-raccourcis.json");
    await writeFile(geometryPath, JSON.stringify(geometry, null, 2));
    await info.attach("geometrie-raccourcis.json", { path: geometryPath, contentType: "application/json" });
    await page.screenshot({ path: info.outputPath(`accueil-${width}-${large ? "agrandi" : "normal"}.png`), fullPage: true });
    // No forced click: a neighbouring section intercepting this target must
    // fail the real user action, independently of the geometric assertions.
    await backup.click({ timeout: 3_000 });
    await expect(current(page).getByTestId("backup-export")).toBeVisible();
    expect(geometry.week.top).toBeGreaterThanOrEqual(geometry.shortcuts.bottom);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1);
    for (const button of geometry.buttons) {
      expect(button.bottom, button.label).toBeLessThanOrEqual(geometry.week.top);
      expect(button.left, button.label).toBeGreaterThanOrEqual(0);
      expect(button.right, button.label).toBeLessThanOrEqual(width);
      expect(button.hits.every((point) => point.owned), JSON.stringify(button)).toBe(true);
    }
    const downloadPromise = page.waitForEvent("download");
    await current(page).getByTestId("backup-export").click();
    const path = await (await downloadPromise).path();
    const exported = JSON.parse(await readFile(path!, "utf8"));
    for (const field of APP_STATE_DATA_KEYS) expect(exported.state[field], field).toEqual(before[field]);
    await page.getByRole("button", { name: "Retour", exact: true }).click();
    await expect(current(page).getByTestId("home-view")).toBeVisible();
    await current(page).getByRole("region", { name: "Pour commencer", exact: true }).getByRole("button", { name: "Trouver une recette", exact: true }).click();
    await expect(current(page).getByRole("heading", { name: "Recette", exact: true })).toBeVisible();
    await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Accueil", exact: true }).click();
    await expect(current(page).getByTestId("home-view")).toBeVisible();
    await current(page).locator(".week-preview__header").click();
    await expect(current(page).getByRole("heading", { name: withMenu ? "Ma semaine" : "Aucune semaine pour le moment", exact: true })).toBeVisible();
    await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Accueil", exact: true }).click();
    await expect(current(page).getByTestId("home-view")).toBeVisible();
    const after: AppState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
    for (const field of APP_STATE_DATA_KEYS) expect(after[field], field).toEqual(before[field]);
  });
}
