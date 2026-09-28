import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { generateWeeklyPlan } from "../src/engine";
import { RECIPES } from "../src/recipes";
import { APP_STATE_DATA_KEYS, DEFAULT_APP_STATE, migrateAppState, type AppState } from "../src/storage";

test.use({ serviceWorkers: "block" });
test.setTimeout(60_000);
const key = "inflamm-menu:app-state";
const current = (page: Page) => page.getByTestId("flow-current");
type Mode = "granted" | "denied" | "throw" | "pending" | "persisted" | "persisted-pending" | "absent" | "getter-throws";
type Probe = { checks: number; requests: number; failLocal: boolean; failIndexed: boolean; completedPlans: string[]; records: Array<{ local: AppState; completedPlans: string[] }> };

function fixture(withCurrent = false, withUpcoming = false): AppState {
  const personal = { ...structuredClone(RECIPES[0]), id: "perso-persistence", title: "Données à conserver", image: "/assets/recipes/generated/r1088-papillotes-de-poulet-fenouil-cotes-de-blette.jpg" };
  const profile = { ...structuredClone(DEFAULT_APP_STATE.profile), maxPrepMinutes: 90, weeklyBudget: 200 };
  const plan = (startsOn: string) => generateWeeklyPlan(RECIPES, profile, { seed: `persistence-${startsOn}`, startsOn });
  return migrateAppState({ ...structuredClone(DEFAULT_APP_STATE), profile, onboardingCompleted: true,
    customRecipes: [personal], favoriteRecipeIds: [personal.id], recipeNotes: { [personal.id]: "Note inchangée" },
    recipeCollections: [{ id: "persistence-collection", name: "À garder", recipeIds: [personal.id] }],
    shoppingItems: [{ id: "persistence-item", name: "Papier cuisson", checked: false }],
    currentPlan: withCurrent ? plan("2026-09-28") : null, upcomingPlan: withUpcoming ? plan("2026-10-05") : null,
  })!;
}

async function replicas(page: Page): Promise<{ local: AppState; indexed: AppState }> {
  return page.evaluate(async (key) => {
    const local = JSON.parse(localStorage.getItem(key)!);
    const indexed = await new Promise<AppState>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readonly");
        const read = transaction.objectStore("app-state").get("current");
        let value: AppState;
        read.onsuccess = () => { value = read.result; };
        transaction.oncomplete = () => { database.close(); resolve(value); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
    return { local, indexed };
  }, key);
}

async function open(page: Page, state: AppState, mode: Mode = "granted") {
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.goto("/tests/error-boundary-fixture.html");
  await page.evaluate(async ({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
    const request = indexedDB.open("inflamm-menu", 1);
    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () => request.result.createObjectStore("app-state");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        transaction.objectStore("app-state").put(state, "current");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  }, { key, state });
  // Only the permission API is doubled. Both storage replicas, generated plans
  // and native IndexedDB transaction completion events remain real.
  await page.addInitScript(({ mode, key }) => {
    const probe: Probe = { checks: 0, requests: 0, failLocal: false, failIndexed: false, completedPlans: [], records: [] };
    (window as any).__persistence = probe;
    const pendingPlans = new WeakMap<IDBTransaction, string[]>();
    const begin = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (storeNames, mode, options) {
      const transaction = begin.call(this, storeNames, mode, options);
      // Register before app code can assign oncomplete: some engines drain
      // promise microtasks between listeners of the same native commit event.
      transaction.addEventListener("complete", () => probe.completedPlans.push(...(pendingPlans.get(transaction) ?? [])), { once: true });
      return transaction;
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, entryKey) {
      if (this.name === "app-state" && entryKey === "current") {
        if (probe.failIndexed) throw new DOMException("Test: IndexedDB indisponible", "QuotaExceededError");
        const ids = [value.currentPlan?.id, value.upcomingPlan?.id].filter(Boolean);
        pendingPlans.set(this.transaction, [...(pendingPlans.get(this.transaction) ?? []), ...ids]);
      }
      return put.call(this, value, entryKey);
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (entryKey, value) {
      if (entryKey === key && probe.failLocal) throw new DOMException("Test: localStorage indisponible", "QuotaExceededError");
      return setItem.call(this, entryKey, value);
    };
    const manager = {
      persisted: async () => {
        probe.checks += 1;
        if (mode === "persisted-pending") return new Promise<boolean>((resolve) => { (window as any).__resolvePersisted = resolve; });
        return mode === "persisted";
      },
      persist: () => {
        probe.requests += 1;
        probe.records.push({ local: JSON.parse(localStorage.getItem(key)!), completedPlans: [...probe.completedPlans] });
        if (mode === "throw") throw new DOMException("Test: permission refusée", "SecurityError");
        if (mode === "pending") return new Promise<boolean>(() => {});
        return Promise.resolve(mode === "granted");
      },
    };
    Object.defineProperty(navigator, "storage", { configurable: true, get: () => {
      if (mode === "getter-throws") throw new DOMException("Test: API inaccessible", "SecurityError");
      return mode === "absent" ? undefined : manager;
    } });
  }, { mode, key });
  await page.goto("/");
  await expect(current(page).getByTestId("home-view")).toBeVisible();
  await expect.poll(async () => { const stored = await replicas(page); return JSON.stringify(stored.local) === JSON.stringify(stored.indexed); }).toBe(true);
  expect(await counters(page)).toEqual({ checks: 0, requests: 0 });
}

async function counters(page: Page) {
  return page.evaluate(() => { const value = (window as any).__persistence as Probe; return { checks: value.checks, requests: value.requests }; });
}
async function navigate(page: Page, name: string) {
  await current(page).getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }).click();
}
async function generate(page: Page, target: "current" | "upcoming") {
  await current(page).getByRole("button", { name: /^(Générer ma semaine|Créer une autre semaine)$/ }).click();
  await current(page).getByTestId(`target-${target}`).click();
  await current(page).getByRole("button", { name: "Créer ma semaine", exact: true }).click();
  await expect(current(page).getByRole("heading", { name: target === "current" ? "Votre semaine est prête" : "Semaine prochaine prête", exact: true })).toBeVisible();
}
async function complete(page: Page, target: "current" | "upcoming") {
  await current(page).getByRole("button", { name: target === "current" ? "Voir ma semaine" : "Revenir à l’accueil", exact: true }).click();
  await expect(current(page).getByTestId(target === "current" ? "week-view" : "home-view")).toBeVisible();
}
async function information(page: Page) {
  await navigate(page, "Accueil");
  await current(page).getByRole("button", { name: "Ajuster mon profil", exact: true }).click();
  await current(page).getByRole("button", { name: /Informations et confidentialité/ }).click();
  await expect(current(page).getByTestId("backup-export")).toBeVisible();
}

async function exportAndRestore(page: Page) {
  await information(page);
  const before = (await replicas(page)).local;
  const downloadPromise = page.waitForEvent("download");
  await current(page).getByTestId("backup-export").click();
  const path = await (await downloadPromise).path();
  const buffer = await readFile(path!);
  const exported = JSON.parse(buffer.toString());
  for (const field of APP_STATE_DATA_KEYS) expect(exported.state[field], field).toEqual(before[field]);
  expect(exported.state.customRecipes[0].image).toBe(fixture().customRecipes[0].image);
  await current(page).getByTestId("backup-import").setInputFiles({ name: "sauvegarde.json", mimeType: "application/json", buffer });
  await current(page).getByTestId("backup-confirm").click();
  await expect(current(page).getByTestId("backup-feedback")).toContainText("Sauvegarde restaurée");
  const after = await replicas(page);
  for (const field of APP_STATE_DATA_KEYS) {
    expect(after.local[field], field).toEqual(before[field]);
    expect(after.indexed[field], field).toEqual(before[field]);
  }
}

for (const [target, withCurrent] of [["current", false], ["upcoming", false], ["upcoming", true]] as const) {
  test(`double API : ${target}, menu existant ${withCurrent}, attend l’enregistrement réel avant une seule demande @webkit-smoke`, async ({ page }) => {
    await open(page, fixture(withCurrent));
    const before = (await replicas(page)).local;
    // Hold a genuine IDB write transaction. The app may update localStorage,
    // but its asynchronous save cannot settle until this lock is released.
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        const store = transaction.objectStore("app-state");
        let released = false;
        (window as any).__releasePersistenceLock = () => { released = true; };
        const keepAlive = () => { const read = store.get("current"); read.onsuccess = () => { if (!released) keepAlive(); }; };
        keepAlive();
        transaction.oncomplete = () => database.close();
        resolve();
      };
    }));
    try {
      await generate(page, target);
      expect(await counters(page)).toEqual({ checks: 0, requests: 0 });
      const storedDuringLock = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
      const planKey = target === "current" ? "currentPlan" : "upcomingPlan";
      expect(storedDuringLock[planKey]?.meals.length).toBeGreaterThan(0);
      await page.evaluate(() => (window as any).__releasePersistenceLock());
      await expect.poll(() => counters(page)).toEqual({ checks: 1, requests: 1 });
      const saved = await replicas(page);
      expect(saved.indexed[planKey]).toEqual(saved.local[planKey]);
      const record = await page.evaluate(() => ((window as any).__persistence as Probe).records[0]);
      expect(record.local[planKey]).toEqual(saved.local[planKey]);
      expect(record.completedPlans).toContain(saved.local[planKey]!.id);
      if (target === "upcoming") expect(saved.local.currentPlan).toEqual(before.currentPlan);
      for (const field of ["customRecipes", "favoriteRecipeIds", "recipeNotes", "recipeCollections", "shoppingItems"] as const) expect(saved.local[field]).toEqual(before[field]);
      await complete(page, target);
      if (target === "current") await navigate(page, "Accueil");
      await generate(page, target === "current" ? "upcoming" : "current");
      await complete(page, target === "current" ? "upcoming" : "current");
      await exportAndRestore(page);
      expect(await counters(page)).toEqual({ checks: 1, requests: 1 });
      await page.reload();
      await expect(current(page).getByTestId("home-view")).toBeVisible();
      expect(await counters(page)).toEqual({ checks: 0, requests: 0 });
      const restored = await replicas(page);
      expect(restored.local.currentPlan).not.toBeNull();
      expect(restored.local.upcomingPlan).not.toBeNull();
    } finally { await page.evaluate(() => (window as any).__releasePersistenceLock?.()).catch(() => undefined); }
  });
}

test("double API : menus déjà stockés et importés ne déclenchent aucune demande @webkit-smoke", async ({ page }) => {
  await open(page, fixture(true, true));
  await exportAndRestore(page);
  expect(await counters(page)).toEqual({ checks: 0, requests: 0 });
  await page.reload();
  await expect(current(page).getByTestId("home-view")).toBeVisible();
  const stored = await replicas(page);
  expect(stored.local.currentPlan).toEqual(fixture(true, true).currentPlan);
  expect(stored.local.upcomingPlan).toEqual(fixture(true, true).upcomingPlan);
  expect(await counters(page)).toEqual({ checks: 0, requests: 0 });
});

for (const mode of ["denied", "throw", "pending", "persisted", "absent", "getter-throws"] as const) {
  test(`double API ${mode} : navigation, courses, seconde semaine et sauvegarde restent disponibles @webkit-smoke`, async ({ page }) => {
    await open(page, fixture(), mode);
    await generate(page, "current");
    await complete(page, "current");
    await navigate(page, "Courses");
    await current(page).getByLabel("Ajouter un article", { exact: true }).fill("Sac de courses");
    await current(page).getByRole("button", { name: "Ajouter l’article", exact: true }).click();
    await expect.poll(async () => (await replicas(page)).indexed.shoppingItems.some((item) => item.name === "Sac de courses")).toBe(true);
    await navigate(page, "Accueil");
    await generate(page, "upcoming");
    await complete(page, "upcoming");
    await exportAndRestore(page);
    expect(await counters(page)).toEqual({ checks: mode === "absent" || mode === "getter-throws" ? 0 : 1, requests: ["persisted", "absent", "getter-throws"].includes(mode) ? 0 : 1 });
    const stored = await replicas(page);
    expect(stored.local.currentPlan?.meals.length).toBeGreaterThan(0);
    expect(stored.local.upcomingPlan?.meals.length).toBeGreaterThan(0);
    expect(stored.local.shoppingItems.some((item) => item.name === "Sac de courses")).toBe(true);
  });
}

test("un échec réel de génération ne demande pas de stockage persistant @webkit-smoke", async ({ page }) => {
  const state = fixture();
  state.profile.dislikedRecipeIds = [...RECIPES.map((recipe) => recipe.id), ...state.customRecipes.map((recipe) => recipe.id)];
  await open(page, state);
  await current(page).getByRole("button", { name: "Générer ma semaine", exact: true }).click();
  await current(page).getByRole("button", { name: "Créer ma semaine", exact: true }).click();
  await expect(current(page).getByRole("alert")).toContainText("Vos critères sont trop serrés");
  expect(await counters(page)).toEqual({ checks: 0, requests: 0 });
  const stored = await replicas(page);
  expect(stored.local.currentPlan).toBeNull(); expect(stored.indexed.currentPlan).toBeNull();
});

for (const replaceDuringProbe of [false, true]) test(`double API : restauration puis nouvelle semaine ${replaceDuringProbe ? "pendant" : "après"} la sonde périmée @webkit-smoke`, async ({ page }) => {
  await open(page, fixture(), "persisted-pending");
  await generate(page, "current");
  await expect.poll(() => counters(page)).toEqual({ checks: 1, requests: 0 });
  await complete(page, "current");
  await information(page);
  const replacement = fixture();
  await current(page).getByTestId("backup-import").setInputFiles({ name: "sans-semaine.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "inflamm-menu-backup", version: replacement.version, exportedAt: "2026-09-28T12:00:00Z", state: replacement })) });
  await current(page).getByTestId("backup-confirm").click();
  await expect(current(page).getByTestId("backup-feedback")).toContainText("Sauvegarde restaurée");
  if (!replaceDuringProbe) {
    await page.evaluate(async () => { (window as any).__resolvePersisted(false); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    expect(await counters(page)).toEqual({ checks: 1, requests: 0 });
  }
  const stored = await replicas(page);
  for (const field of APP_STATE_DATA_KEYS) {
    expect(stored.local[field], field).toEqual(replacement[field]);
    expect(stored.indexed[field], field).toEqual(replacement[field]);
  }
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await expect(current(page).getByRole("heading", { name: "Mon profil alimentaire", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await expect(current(page).getByTestId("home-view")).toBeVisible();
  await generate(page, "upcoming");
  await expect.poll(async () => Boolean((await replicas(page)).indexed.upcomingPlan)).toBe(true);
  await expect.poll(() => counters(page)).toEqual({ checks: replaceDuringProbe ? 1 : 2, requests: 0 });
  await page.evaluate(() => (window as any).__resolvePersisted(false));
  await expect.poll(() => counters(page)).toEqual({ checks: replaceDuringProbe ? 1 : 2, requests: 1 });
});

for (const failed of ["both", "local", "indexed"] as const) {
  test(`double panne ${failed} : aucune demande sans copie durable, une seule si une copie suffit @webkit-smoke`, async ({ page }) => {
    await open(page, fixture());
    await page.evaluate((failed) => { const probe = (window as any).__persistence as Probe; probe.failLocal = failed !== "indexed"; probe.failIndexed = failed !== "local"; }, failed);
    await generate(page, "current");
    if (failed === "both") {
      await expect(page.getByRole("alert")).toContainText("Impossible d’enregistrer");
      expect(await counters(page)).toEqual({ checks: 0, requests: 0 });
      const stored = await replicas(page);
      expect(stored.local.currentPlan).toBeNull(); expect(stored.indexed.currentPlan).toBeNull();
      await page.evaluate(() => { const probe = (window as any).__persistence as Probe; probe.failLocal = false; probe.failIndexed = false; });
      await complete(page, "current");
      await navigate(page, "Accueil");
      await generate(page, "upcoming");
    }
    await expect.poll(() => counters(page)).toEqual({ checks: 1, requests: 1 });
    const stored = await replicas(page);
    expect((failed === "local" ? stored.indexed : stored.local).currentPlan?.meals.length).toBeGreaterThan(0);
  });
}
