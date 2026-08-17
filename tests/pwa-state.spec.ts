import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function openFreshApp(page: Page) {
  await page.goto("/InflammMenu/");
  const onboarding = page.getByTestId("onboarding-view");
  const home = page.getByTestId("home-view");
  await expect(onboarding.or(home)).toBeVisible();
  if (await onboarding.isVisible()) await page.getByTestId("onboarding-skip").click();
  await expect(home).toBeVisible();
  await page.waitForFunction(() => Boolean(window.localStorage.getItem("inflamm-menu:app-state")));
}

async function openInformation(page: Page) {
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await expect(page.getByRole("heading", { name: "À propos de l’application" })).toBeVisible();
}

async function generateWeek(page: Page) {
  await page.getByRole("button", { name: "Générer ma semaine" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
}

test("une recette personnelle survit au rechargement sous la base GitHub Pages", async ({ page }) => {
  await openFreshApp(page);
  await generateWeek(page);
  await page.locator(".meal-card__main").first().click();
  await page.getByTestId("duplicate-recipe").click();
  await page.getByTestId("custom-title").fill("Ma recette personnelle Pages");
  await page.getByTestId("custom-save").click();
  await page.getByTestId("flow-current").getByRole("button", { name: "Ajouter", exact: true }).click();

  await expect.poll(() => page.evaluate(() => {
    const raw = window.localStorage.getItem("inflamm-menu:app-state");
    return raw ? JSON.parse(raw).customRecipes?.length : 0;
  })).toBe(1);

  await page.reload();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.getByText("Ma recette personnelle Pages", { exact: true })).toBeVisible();
});

test("deux onglets conservent des réglages différents et les synchronisent", async ({ page, context }) => {
  await openFreshApp(page);
  const secondPage = await context.newPage();
  await secondPage.goto("/InflammMenu/");
  await expect(secondPage.getByTestId("home-view")).toBeVisible();

  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByLabel("Votre prénom").fill("Synchronisé");
  await openInformation(secondPage);

  await Promise.all([
    page.getByRole("button", { name: "Enregistrer mon profil" }).click(),
    secondPage.getByTestId("text-scale-large").click(),
  ]);

  await expect(page.locator(".app-shell")).toHaveAttribute("data-text-scale", "large");
  await secondPage.getByRole("button", { name: "Retour" }).click();
  await expect(secondPage.getByLabel("Votre prénom")).toHaveValue("Synchronisé");

  await expect.poll(async () => secondPage.evaluate(() => {
    const raw = window.localStorage.getItem("inflamm-menu:app-state");
    if (!raw) return null;
    const state = JSON.parse(raw);
    return { firstName: state.profile?.firstName, textScale: state.textScale };
  })).toEqual({ firstName: "Synchronisé", textScale: "large" });
});

test("le vrai service worker conserve le catalogue et uniquement les polices latines", async ({ page, context }) => {
  await openFreshApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    }
  });

  await openInformation(page);
  await page.getByTestId("offline-catalogue-download").click();
  await expect(page.getByTestId("offline-catalogue-download")).toContainText("Catalogue vérifié hors ligne");

  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys();
    const shellName = names.find((name) => name.startsWith("inflamm-menu-shell-"));
    const catalogueName = names.find((name) => name.startsWith("inflamm-menu-catalogue-"));
    const shellUrls = shellName ? (await (await caches.open(shellName)).keys()).map((request) => request.url) : [];
    const catalogueUrls = catalogueName ? (await (await caches.open(catalogueName)).keys()).map((request) => request.url) : [];
    return { names, shellUrls, catalogueUrls };
  });
  expect(cacheState.names.some((name) => name.startsWith("inflamm-menu-shell-"))).toBe(true);
  expect(cacheState.catalogueUrls.some((url) => /recettes-anti-inflammatoires(?:-[^/]+)?\.json$/.test(url))).toBe(true);
  expect(cacheState.shellUrls.filter((url) => /cyrillic|vietnamese|latin-ext/i.test(url))).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();
  await expect(page.getByText("624 recettes uniques disponibles")).toBeVisible();
  await expect(page.getByText("624 résultats")).toBeVisible();
});

test("une version B est détectée puis rechargée sans effacer les données locales", async ({ page }) => {
  const workerPath = resolve("dist/pages/sw.js");
  const originalWorker = await readFile(workerPath, "utf8");
  const updatedWorker = `${originalWorker.replace(
    /(const SHELL_CACHE = `\$\{SHELL_CACHE_PREFIX\})[^`]+(`;)/,
    "$1e2e-update-b$2",
  )}\n// e2e-update-b\n`;
  expect(updatedWorker).not.toBe(originalWorker);

  try {
    await openFreshApp(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolveController) => navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolveController(),
          { once: true },
        ));
      }
      window.localStorage.setItem("inflamm-menu:pwa-update-sentinel", "conservé");
    });

    await writeFile(workerPath, updatedWorker);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("Service worker absent");
      const previousController = navigator.serviceWorker.controller;
      const controllerChanged = new Promise<void>((resolveController) => navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => resolveController(),
        { once: true },
      ));
      await registration.update();
      if (navigator.serviceWorker.controller === previousController) await controllerChanged;
    });

    await expect(page.getByTestId("update-banner")).toBeVisible();
    await page.getByTestId("update-reload").click();
    await expect(page.getByTestId("home-view")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("inflamm-menu:pwa-update-sentinel")))
      .toBe("conservé");
  } finally {
    await writeFile(workerPath, originalWorker);
  }
});
