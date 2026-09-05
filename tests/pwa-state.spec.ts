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

test("les écrans secondaires s’ouvrent pour la première fois hors ligne", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openFreshApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    }
  });
  const openedScreens = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter(entry => /\/secondary-views-[^/]+\.js/.test(entry.name))
    .map(entry => entry.name));
  expect(openedScreens).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByLabel("Votre prénom").fill("Profil hors ligne");
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await openInformation(page);
  await page.getByTestId("text-scale-large").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("backup-export").click();
  const file = await (await download).path();
  expect(await readFile(file!, "utf8")).toContain("Profil hors ligne");
  await page.reload();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-text-scale", "large");
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await expect(page.getByLabel("Votre prénom")).toHaveValue("Profil hors ligne");
  expect(errors).toEqual([]);
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
  expect(cacheState.names).toContain("inflamm-menu-catalogue-v2");
  expect(cacheState.names).not.toContain("inflamm-menu-catalogue-v1");
  expect(cacheState.shellUrls.some((url) => /\/assets\/catalog-validation-[A-Za-z0-9_-]+\.js$/.test(url))).toBe(true);
  expect(cacheState.shellUrls.some((url) => /recettes-anti-inflammatoires(?:-[^/]+)?\.json$/.test(url))).toBe(false);
  expect(cacheState.catalogueUrls.some((url) => /recettes-anti-inflammatoires(?:-[^/]+)?\.json$/.test(url))).toBe(true);
  expect(cacheState.shellUrls.filter((url) => /cyrillic|vietnamese|latin-ext/i.test(url))).toEqual([]);
  expect(cacheState.shellUrls.some((url) => url.endsWith(".woff2"))).toBe(true);
  expect(cacheState.shellUrls.filter((url) => url.endsWith(".woff"))).toEqual([]);
  expect(cacheState.shellUrls.filter((url) => /\/assets\/responsive\/[a-f0-9]+\/inflamm-hero-bowl\.webp$/.test(url))).toHaveLength(1);
  expect(cacheState.shellUrls.some((url) => url.includes("/recipes/thumbnails/"))).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("home-view")).toBeVisible();
  const offlineHero = page.locator(".home-hero__image");
  await expect(offlineHero).toHaveAttribute("src", /\/InflammMenu\/assets\/responsive\/[a-f0-9]+\/inflamm-hero-bowl\.webp$/);
  await expect.poll(() => offlineHero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(960);
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();
  await expect(page.getByText("624 recettes uniques disponibles")).toBeVisible();
  await expect(page.getByText("624 résultats")).toBeVisible();
});

test("une navigation vers une ressource ne peut jamais remplacer le shell HTML hors ligne", async ({ page, context }) => {
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
  });

  const resourcePaths = await page.evaluate(async () => {
    const manifest = await fetch("manifest.webmanifest").then((response) => response.json());
    const icon = new URL(manifest.icons[0].src, window.location.href).pathname;
    return [
      "/InflammMenu/manifest.webmanifest",
      "/InflammMenu/robots.txt",
      icon,
      "/InflammMenu/ressource-inexistante-audit",
    ];
  });
  const shellFingerprint = () => page.evaluate(async () => {
    const cacheName = (await caches.keys()).find((name) => name.startsWith("inflamm-menu-shell-"));
    if (!cacheName) throw new Error("Cache shell absent");
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const indexRequest = keys.find((request) => new URL(request.url).pathname.endsWith("/index.html"));
    if (!indexRequest) throw new Error("Index du shell absent");
    const response = await cache.match(indexRequest, { ignoreVary: true });
    if (!response) throw new Error("Réponse index absente");
    const bytes = new TextEncoder().encode(await response.clone().text());
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const contentType = response.headers.get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() ?? null;
    return {
      digest,
      contentType,
      sentinel: response.headers.get("X-InflammMenu-Shell-Sentinel"),
    };
  });
  const markCachedShell = (sentinel: string) => page.evaluate(async (value) => {
    const cacheName = (await caches.keys()).find((name) => name.startsWith("inflamm-menu-shell-"));
    if (!cacheName) throw new Error("Cache shell absent");
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const indexRequest = keys.find((request) => new URL(request.url).pathname.endsWith("/index.html"));
    if (!indexRequest) throw new Error("Index du shell absent");
    const response = await cache.match(indexRequest, { ignoreVary: true });
    if (!response) throw new Error("Réponse index absente");
    const headers = new Headers(response.headers);
    headers.set("X-InflammMenu-Shell-Sentinel", value);
    await cache.put(indexRequest, new Response(await response.arrayBuffer(), {
      status: response.status,
      statusText: response.statusText,
      headers,
    }));
  }, sentinel);
  const initialShell = await shellFingerprint();
  expect(initialShell.contentType).toContain("text/html");
  expect(initialShell.sentinel).toBeNull();

  for (const [index, resourcePath] of resourcePaths.entries()) {
    const sentinel = `audit-shell-${index}`;
    await markCachedShell(sentinel);
    await page.goto(resourcePath);
    await expect.poll(shellFingerprint).toEqual({ ...initialShell, sentinel });
  }

  await page.goto("/InflammMenu/");
  await expect(page.getByTestId("home-view")).toBeVisible();
  // Even a canonical online navigation must preserve the installed snapshot.
  await expect.poll(shellFingerprint).toEqual({ ...initialShell, sentinel: `audit-shell-${resourcePaths.length - 1}` });

  await context.setOffline(true);
  await page.goto("/InflammMenu/");
  await expect(page.getByTestId("home-view")).toBeVisible();
  expect((await page.locator("html").evaluate((element) => element.ownerDocument.contentType))).toBe("text/html");
});

test("une mise à jour HTML interrompue conserve une application complète hors ligne", async ({ page, context }) => {
  const indexPath = resolve("dist/pages/index.html");
  const original = await readFile(indexPath, "utf8");
  try {
    await openFreshApp(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
      localStorage.setItem("inflamm-menu:update-interrupted", "conservé");
    });
    const incomplete = original.replace(/(<script[^>]+src=")[^"]+/, '$1/InflammMenu/assets/not-yet-uploaded.js');
    expect(incomplete).not.toBe(original);
    await writeFile(indexPath, incomplete);
    const response = await page.goto("/InflammMenu/");
    expect(await response!.text()).toContain("not-yet-uploaded.js");
    await context.setOffline(true);
    await page.goto("/InflammMenu/");
    await expect(page.getByTestId("home-view")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("inflamm-menu:update-interrupted"))).toBe("conservé");
  } finally {
    await writeFile(indexPath, original);
  }
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

test('le calendrier reste exportable hors ligne après découpage du JavaScript', async ({ page, context }) => {
  await openFreshApp(page);
  await generateWeek(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
  });
  await context.setOffline(true);
  const download=page.waitForEvent('download');
  await page.getByTestId('export-calendar').click();
  const file=await (await download).path();
  expect(await readFile(file!,'utf8')).toContain('BEGIN:VCALENDAR');
});

test('une recette personnelle recalcule sa nutrition hors ligne avec les données précachées', async ({ page, context }) => {
  const recipes=JSON.parse(await readFile(resolve('src/data/planner-recipes.json'),'utf8'));
  const original=recipes.find((recipe:{id:string})=>recipe.id==='catalog-r051');
  const recipe={...original,id:'perso-catalog-r051-offline',title:'Mes flocons hors ligne'};
  await page.addInitScript((personal) => {
    if (!localStorage.getItem('inflamm-menu:app-state')) localStorage.setItem('inflamm-menu:app-state',JSON.stringify({version:3,onboardingCompleted:true,customRecipes:[personal],favoriteRecipeIds:[personal.id]}));
  }, recipe);
  await openFreshApp(page);
  // A restored recipe may come from the root deployment. Its image must
  // follow the Pages base and load successfully before entering offline mode.
  await page.getByRole('button',{name:'Favoris',exact:true}).click();
  await page.getByRole('button',{name:/Mes flocons hors ligne/}).click();
  const hero = page.locator('.recipe-hero');
  await expect(hero).toHaveAttribute('src', `/InflammMenu${original.image}`);
  await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
  });
  await context.setOffline(true);
  await page.getByTestId('edit-custom-recipe').click();
  await page.getByRole('button',{name:`Augmenter ${recipe.ingredients[0].name}`,exact:true}).click();
  await page.getByTestId('custom-save').click();
  await expect(page.getByText(/Estimations recalculées pour les quantités/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('home-view')).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('inflamm-menu:app-state')!).customRecipes[0]);
  expect(saved.nutritionRecalculated).toBe(true);
  expect(saved.nutrition.calories).toBeGreaterThan(original.nutrition.calories);
  expect(saved.image).toBe(`/InflammMenu${original.image}`);
});
