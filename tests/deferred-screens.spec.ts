import { expect, test, type Page } from "@playwright/test";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block" });

const storageKey = "inflamm-menu:app-state";
const secondaryModule = "**/src/screens/secondary-views.ts*";
const personalId = "perso-deferred-preserved";
const personalTitle = "Ma recette conservée";

function fixtureState(): AppState {
  const recipe = { ...structuredClone(RECIPES[0]), id: personalId, title: personalTitle };
  return {
    ...structuredClone(DEFAULT_APP_STATE),
    profile: { ...structuredClone(DEFAULT_APP_STATE.profile), firstName: "Camille", weeklyBudget: 95, maxPrepMinutes: 45 },
    onboardingCompleted: true,
    customRecipes: [recipe],
    favoriteRecipeIds: [recipe.id],
    recipeNotes: { [recipe.id]: "Une note à conserver 🥣" },
    recipeCollections: [{ id: "collection-deferred", name: "À conserver", recipeIds: [recipe.id] }],
    shoppingRecipes: [{ recipe: structuredClone(recipe), portions: 3 }],
    shoppingItems: [{ id: "article-deferred", name: "Papier cuisson", checked: true }],
  };
}

async function seed(page: Page) {
  // The runtime fixture has no live application store, so seeding cannot race
  // autosave. Use the complete current state, including the recent library data.
  await page.goto("/tests/runtime-fixture.html");
  await page.evaluate(({ state, storageKey }) => localStorage.setItem(storageKey, JSON.stringify(state)), { state: fixtureState(), storageKey });
  await page.goto("/");
  await expect(page.getByTestId("flow-current").getByTestId("home-view")).toBeVisible();
  await flushSavedState(page);
}

async function flushSavedState(page: Page) {
  await page.evaluate(async () => {
    const { loadAppState, saveAppState } = await import("/src/storage.ts");
    await saveAppState(await loadAppState());
  });
}

async function dataSnapshot(page: Page) {
  // Follow the persistence contract so new user-data fields join this check.
  return page.evaluate(({ storageKey, keys }) => {
    const state = JSON.parse(localStorage.getItem(storageKey)!);
    return Object.fromEntries(keys.map((key) => [key, state[key]]));
  }, { storageKey, keys: [...APP_STATE_DATA_KEYS] });
}

async function openPersonal(page: Page) {
  const current = page.getByTestId("flow-current");
  await current.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Recette", exact: true }).click();
  await current.getByRole("tab", { name: "Favoris", exact: true }).click();
  await current.locator(".favorite-card").filter({ hasText: personalTitle }).click();
  await expect(current.getByTestId("recipe-note-input")).toBeVisible();
}

async function changePeerProfile(peer: Page, firstName: string) {
  await peer.evaluate(async (firstName) => {
    const { loadAppState, saveAppState, stampAppStateChanges } = await import("/src/storage.ts");
    const current = await loadAppState();
    await saveAppState(stampAppStateChanges(current, { ...current, profile: { ...current.profile, firstName } }, current.stateRevision + 1));
  }, firstName);
}

async function holdNextIndexedOpen(page: Page) {
  // Delay a real IndexedDB operation. Keeping the real save queue and local
  // replica lets a second tab make a genuine concurrent update in these tests.
  await flushSavedState(page);
  await page.evaluate(() => {
    const control = { held: false, release: () => {} };
    (window as typeof window & { deferredSaveGate?: typeof control }).deferredSaveGate = control;
    const nativeOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name: string, version?: number) => {
      indexedDB.open = nativeOpen;
      const request = version === undefined ? nativeOpen(name) : nativeOpen(name, version);
      request.addEventListener("success", (event) => {
        event.stopImmediatePropagation();
        control.held = true;
        control.release = () => {
          control.held = false;
          request.dispatchEvent(new Event("success"));
        };
      }, { once: true });
      return request;
    };
  });
}

async function releaseIndexedOpen(page: Page) {
  await page.evaluate(() => {
    const control = (window as typeof window & { deferredSaveGate?: { held: boolean; release: () => void } }).deferredSaveGate;
    if (control?.held) control.release();
  });
}

test("le démarrage et la génération ne téléchargent aucun écran secondaire", async ({ page }) => {
  const errors: string[] = [];
  const secondaryRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\/src\/screens\/(?:secondary-views\.ts|ProfileView\.tsx|InformationView\.tsx|CustomRecipeView\.tsx)(?:\?.*)?$/, (route) => {
    secondaryRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto("/");
  await page.getByTestId("onboarding-skip").click();
  await page.getByRole("button", { name: "Générer ma semaine" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
  expect(secondaryRequests).toEqual([]);
  expect(errors).toEqual([]);
});

for (const screen of [
  { module: "ProfileView", title: "Mon profil alimentaire" },
  { module: "CustomRecipeView", title: "Adapter la recette" },
] as const) {
  test(`l’écran différé ${screen.module} se récupère après un échec ESM sans modifier les données`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let attempts = 0;
    await page.route(secondaryModule, (route) => {
      attempts += 1;
      return attempts === 1 ? route.abort("failed") : route.continue();
    });
    await seed(page);
    const before = await dataSnapshot(page);
    const current = page.getByTestId("flow-current");
    const openScreen = async () => {
      if (screen.module === "CustomRecipeView") {
        await openPersonal(page);
        await current.getByTestId("edit-custom-recipe").click();
      } else {
        await current.getByRole("button", { name: "Ajuster mon profil" }).click();
      }
    };
    await openScreen();
    await expect(current.getByTestId("deferred-screen").getByRole("alert")).toContainText("Vos données sont conservées");
    await expect(page.getByRole("button", { name: "Retour", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inflamm’Menu a rencontré une erreur" })).toHaveCount(0);
    expect(await dataSnapshot(page)).toEqual(before);
    const reloaded = page.waitForEvent("domcontentloaded");
    await current.getByRole("button", { name: "Recharger l’application", exact: true }).click();
    await reloaded;
    await expect(current.getByTestId("home-view")).toBeVisible();
    expect(await dataSnapshot(page)).toEqual(before);
    await openScreen();
    await expect(current.getByTestId("deferred-screen")).toHaveCount(0);
    await expect(current.getByRole("heading", { name: screen.title, exact: true })).toBeFocused();
    if (screen.module === "ProfileView") await expect(current.getByLabel("Votre prénom")).toHaveValue("Camille");
    else await expect(current.getByTestId("custom-title")).toHaveValue(personalTitle);
    expect(attempts).toBe(2);
    expect(await dataSnapshot(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test("un écran différé en panne garde une note en mémoire quand les deux stockages refusent la sauvegarde", async ({ page }) => {
  await page.route(secondaryModule, (route) => route.abort("failed"));
  await seed(page);
  const before = await dataSnapshot(page);
  const current = page.getByTestId("flow-current");
  await openPersonal(page);
  const storedBefore = await page.evaluate(() => ({ state: localStorage.getItem("inflamm-menu:app-state"), marker: localStorage.getItem("inflamm-menu:reset-marker") }));
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, "setItem", { configurable: true, value: () => { throw new DOMException("Quota au rechargement", "QuotaExceededError"); } });
    Object.defineProperty(indexedDB, "open", { configurable: true, value: () => { throw new Error("IndexedDB indisponible au rechargement"); } });
  });
  const unsavedNote = "Note nouvelle conservée uniquement en mémoire 🥣";
  await current.getByTestId("recipe-note-input").fill(unsavedNote);
  await expect(current.getByTestId("recipe-note-input")).toHaveValue(unsavedNote);
  await current.getByTestId("edit-custom-recipe").click();
  await expect(current.getByTestId("deferred-screen").getByRole("alert")).toContainText("Vos données sont conservées");
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  const reload = current.getByRole("button", { name: "Recharger l’application", exact: true });
  await reload.click();
  await expect(current.getByRole("alert").filter({ hasText: "La sauvegarde n’a pas pu être vérifiée" })).toBeVisible();
  await expect(reload).toBeEnabled();
  expect(navigations).toEqual([]);
  expect(await dataSnapshot(page)).toEqual(before);
  expect(await page.evaluate(() => ({ state: localStorage.getItem("inflamm-menu:app-state"), marker: localStorage.getItem("inflamm-menu:reset-marker") }))).toEqual(storedBefore);
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await expect(current.getByRole("tab", { name: "Favoris", selected: true })).toBeVisible();
  await current.locator(".favorite-card").filter({ hasText: personalTitle }).click();
  await expect(current.getByTestId("recipe-note-input")).toHaveValue(unsavedNote);
  expect(navigations).toEqual([]);
  expect(await dataSnapshot(page)).toEqual(before);
});

test("les informations réutilisent les écrans secondaires déjà chargés après une coupure réseau", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let requests = 0;
  await page.route(secondaryModule, (route) => { requests += 1; return route.continue(); });
  await seed(page);
  const before = await dataSnapshot(page);
  const current = page.getByTestId("flow-current");
  await current.getByRole("button", { name: "Ajuster mon profil" }).click();
  await expect(current.getByLabel("Votre prénom")).toHaveValue("Camille");
  expect(requests).toBe(1);
  await context.setOffline(true);
  await current.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await expect(current.getByTestId("backup-card")).toBeVisible();
  await expect(current.getByRole("heading", { name: "À propos de l’application" })).toBeFocused();
  await expect(current.getByTestId("deferred-screen")).toHaveCount(0);
  expect(requests).toBe(1);
  expect(await dataSnapshot(page)).toEqual(before);
  expect(errors).toEqual([]);
});

for (const focusTarget of ["loading", "back"] as const) {
  test(`un profil lent ${focusTarget === "loading" ? "transfère le focus vers son titre chargé @webkit-smoke" : "conserve le focus sur le bouton Retour"}`, async ({ page }) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    await page.route(secondaryModule, async (route) => { await released; await route.continue(); });
    try {
      await seed(page);
      const before = await dataSnapshot(page);
      const current = page.getByTestId("flow-current");
      await current.getByRole("button", { name: "Ajuster mon profil" }).click();
      const loading = current.getByTestId("deferred-screen");
      await expect(loading.getByRole("status")).toContainText("Chargement de l’écran");
      await expect(loading.getByRole("heading", { name: "Mon profil alimentaire" })).toBeFocused();
      const back = page.getByRole("button", { name: "Retour", exact: true });
      if (focusTarget === "back") await back.focus();
      release();
      await expect(loading).toHaveCount(0);
      await expect(current.getByLabel("Votre prénom")).toHaveValue("Camille");
      if (focusTarget === "loading") await expect(current.getByRole("heading", { name: "Mon profil alimentaire" })).toBeFocused();
      else await expect(back).toBeFocused();
      expect(await dataSnapshot(page)).toEqual(before);
    } finally { release(); }
  });
}

test("revenir pendant le chargement du profil empêche toute ouverture ou écriture tardive", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  await page.route(secondaryModule, async (route) => { await released; await route.continue(); });
  try {
    await seed(page);
    const before = await dataSnapshot(page);
    const current = page.getByTestId("flow-current");
    const profileTrigger = current.getByRole("button", { name: "Ajuster mon profil" });
    await profileTrigger.click();
    await expect(current.getByTestId("deferred-screen").getByRole("heading")).toBeFocused();
    await page.getByRole("button", { name: "Retour", exact: true }).click();
    await expect(current.getByTestId("home-view")).toBeVisible();
    await expect(profileTrigger).toBeFocused();
    release();
    // Await module evaluation instead of guessing a network delay.
    await page.evaluate(async () => { await import("/src/screens/secondary-views.ts"); });
    await expect(current.getByTestId("home-view")).toBeVisible();
    await expect(profileTrigger).toBeFocused();
    await expect(page.getByRole("button", { name: "Retour", exact: true })).toHaveCount(0);
    expect(await dataSnapshot(page)).toEqual(before);
    expect(errors).toEqual([]);
    await profileTrigger.click();
    await expect(current.getByLabel("Votre prénom")).toHaveValue("Camille");
    await expect(current.getByRole("heading", { name: "Mon profil alimentaire" })).toBeFocused();
  } finally { release(); }
});

test("le profil reçoit l’état actuel lorsqu’un autre onglet le modifie pendant le téléchargement", async ({ page, context }) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  await page.route(secondaryModule, async (route) => { await released; await route.continue(); });
  try {
    await seed(page);
    const peer = await context.newPage();
    await peer.goto("/");
    await expect(peer.getByTestId("home-view")).toBeVisible();
    const current = page.getByTestId("flow-current");
    await current.getByRole("button", { name: "Ajuster mon profil" }).click();
    await expect(current.getByTestId("deferred-screen").getByRole("heading")).toBeFocused();
    await changePeerProfile(peer, "Profil actualisé ailleurs");
    await expect.poll(async () => (await dataSnapshot(page)).profile.firstName).toBe("Profil actualisé ailleurs");
    release();
    await expect(current.getByLabel("Votre prénom")).toHaveValue("Profil actualisé ailleurs");
    await current.getByRole("button", { name: "Enregistrer mon profil", exact: true }).click();
    await expect(current.getByTestId("home-view")).toBeVisible();
    expect((await dataSnapshot(page)).profile.firstName).toBe("Profil actualisé ailleurs");
    await peer.close();
  } finally { release(); }
});

for (const outcome of ["changed", "left"] as const) {
  test(`un rechargement différé est annulé si ${outcome === "changed" ? "l’état change pendant la sauvegarde" : "l’utilisateur quitte l’écran pendant la sauvegarde"}`, async ({ page, context }) => {
    await page.route(secondaryModule, (route) => route.abort("failed"));
    await seed(page);
    const peer = outcome === "changed" ? await context.newPage() : null;
    if (peer) { await peer.goto("/"); await expect(peer.getByTestId("home-view")).toBeVisible(); }
    const current = page.getByTestId("flow-current");
    const profileTrigger = current.getByRole("button", { name: "Ajuster mon profil" });
    await profileTrigger.click();
    await expect(current.getByTestId("deferred-screen").getByRole("alert")).toBeVisible();
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    await holdNextIndexedOpen(page);
    try {
      await current.getByRole("button", { name: "Recharger l’application", exact: true }).click();
      await page.waitForFunction(() => (window as typeof window & { deferredSaveGate?: { held: boolean } }).deferredSaveGate?.held);
      await expect(current.getByRole("button", { name: "Sauvegarde…", exact: true })).toBeDisabled();
      if (peer) {
        // A profile edit remounts the form by design. Change an unrelated field
        // to exercise the final state guard on this same pending reload.
        await peer.evaluate(async () => {
          const { loadAppState, saveAppState, stampAppStateChanges } = await import("/src/storage.ts");
          const current = await loadAppState();
          await saveAppState(stampAppStateChanges(current, { ...current, textScale: "large" }, current.stateRevision + 1));
        });
        await expect(page.locator(".app-shell")).toHaveAttribute("data-text-scale", "large");
      } else {
        await page.getByRole("button", { name: "Retour", exact: true }).click();
        await expect(current.getByTestId("home-view")).toBeVisible();
      }
      await releaseIndexedOpen(page);
      if (peer) {
        await expect(current.getByRole("alert").filter({ hasText: "Des changements récents" })).toBeVisible();
        await expect(current.getByRole("button", { name: "Recharger l’application", exact: true })).toBeEnabled();
        expect((await dataSnapshot(page)).textScale).toBe("large");
      } else {
        await flushSavedState(page);
        await expect(current.getByTestId("home-view")).toBeVisible();
        await expect(profileTrigger).toBeFocused();
      }
      expect(navigations).toEqual([]);
    } finally {
      await releaseIndexedOpen(page);
      await peer?.close();
    }
  });
}
