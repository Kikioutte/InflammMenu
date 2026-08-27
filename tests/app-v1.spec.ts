import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Keep request interception deterministic. Service-worker update behaviour is
// covered independently in storage.test.mjs.
test.use({ serviceWorkers: "block" });

async function openFreshApp(page: Page) {
  await page.goto("/");
  const onboarding = page.getByTestId("onboarding-view");
  const home = page.getByTestId("home-view");
  await expect(onboarding.or(home)).toBeVisible();
  if (await onboarding.isVisible()) {
    await page.getByTestId("onboarding-skip").click();
  }
  await expect(home).toBeVisible();
}

async function expectNoHorizontalOverflow(locator: Locator) {
  const overflow = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function generateWeek(page: Page) {
  await page.getByRole("button", { name: "Générer ma semaine" }).click();
  await expect(page.getByRole("heading", { name: "Prête en quelques secondes" })).toBeVisible();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await expect(page.getByRole("heading", { name: "Votre semaine est prête" })).toBeVisible();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
}

test("l’écran fatal exporte les deux stockages et exige une confirmation avant le reset", async ({ page }) => {
  await page.goto("/tests/error-boundary-fixture.html");
  await expect(page.getByRole("heading", { name: "Inflamm’Menu a rencontré une erreur" })).toBeVisible();

  await page.evaluate(async () => {
    const storedState = {
      version: 2,
      profile: { firstName: "Récupération IndexedDB" },
      currentPlan: null,
      upcomingPlan: null,
      favoriteRecipeIds: [],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
      customRecipes: [],
      onboardingCompleted: true,
    };
    window.localStorage.removeItem("inflamm-menu:app-state");
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("app-state")) request.result.createObjectStore("app-state");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        transaction.objectStore("app-state").put(storedState, "current");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  });

  const recoveryDownload = page.waitForEvent("download");
  await page.getByTestId("fatal-recovery").click();
  const recoveryFile = await recoveryDownload;
  expect(recoveryFile.suggestedFilename()).toMatch(/^inflamm-menu-recuperation-\d{4}-\d{2}-\d{2}\.json$/);
  const recoveryPath = await recoveryFile.path();
  expect(recoveryPath).not.toBeNull();
  const recovery = JSON.parse(await readFile(recoveryPath!, "utf8"));
  expect(recovery.format).toBe("inflamm-menu-backup");
  expect(recovery.state.profile.firstName).toBe("Récupération IndexedDB");

  await page.evaluate(async (baseState) => {
    const localState = {
      ...baseState,
      profile: { ...baseState.profile, firstName: "Profil local fusionné" },
      favoriteRecipeIds: [],
      stateRevision: 40,
      fieldRevisions: { ...baseState.fieldRevisions, profile: 40 },
      fieldMutationIds: { ...baseState.fieldMutationIds, profile: "40:local-profile" },
    };
    const indexedState = {
      ...baseState,
      favoriteRecipeIds: ["salade-lentilles-noix"],
      stateRevision: 41,
      fieldRevisions: { ...baseState.fieldRevisions, favoriteRecipeIds: 41 },
      fieldMutationIds: { ...baseState.fieldMutationIds, favoriteRecipeIds: "41:indexed-favorite" },
    };
    window.localStorage.removeItem("inflamm-menu:reset-marker");
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify(localState));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        transaction.objectStore("app-state").put(indexedState, "current");
        transaction.objectStore("app-state").delete("reset-marker");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  }, recovery.state);
  const mergedDownload = page.waitForEvent("download");
  await page.getByTestId("fatal-recovery").click();
  const mergedPath = await (await mergedDownload).path();
  expect(mergedPath).not.toBeNull();
  const mergedRecovery = JSON.parse(await readFile(mergedPath!, "utf8"));
  expect(mergedRecovery.state.profile.firstName).toBe("Profil local fusionné");
  expect(mergedRecovery.state.favoriteRecipeIds).toContain("salade-lentilles-noix");

  await page.evaluate(() => {
    const testWindow = window as typeof window & { __recoveryGetItem?: Storage["getItem"] };
    testWindow.__recoveryGetItem = Storage.prototype.getItem;
    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value: () => { throw new Error("localStorage indisponible pour le test"); },
    });
  });
  const localPartialDownload = page.waitForEvent("download");
  await page.getByTestId("fatal-recovery").click();
  await localPartialDownload;
  await expect(page.getByTestId("fatal-recovery-error")).toContainText("localStorage reste inaccessible");
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __recoveryGetItem?: Storage["getItem"] };
    Object.defineProperty(Storage.prototype, "getItem", { configurable: true, value: testWindow.__recoveryGetItem });
    delete testWindow.__recoveryGetItem;
  });

  await page.evaluate((state) => {
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify(state));
    const factory = indexedDB as IDBFactory & { __openForRecoveryTest?: IDBFactory["open"] };
    factory.__openForRecoveryTest = factory.open.bind(factory);
    Object.defineProperty(factory, "open", { configurable: true, value: () => { throw new Error("IndexedDB indisponible pour le test"); } });
  }, recovery.state);
  const partialDownload = page.waitForEvent("download");
  await page.getByTestId("fatal-recovery").click();
  await partialDownload;
  await expect(page.getByTestId("fatal-recovery-error")).toContainText("IndexedDB reste inaccessible");
  await page.evaluate(() => {
    const factory = indexedDB as IDBFactory & { __openForRecoveryTest?: IDBFactory["open"] };
    Object.defineProperty(factory, "open", { configurable: true, value: factory.__openForRecoveryTest });
    delete factory.__openForRecoveryTest;
  });

  // The isolated tab starts at the largest safe field clock. Its next edit
  // must still lose to the reset barrier instead of creating a newer epoch
  // from wall time and resurrecting this snapshot.
  await page.evaluate(async () => {
    const { APP_STATE_DATA_KEYS } = await import("/src/storage.ts");
    const current = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "null");
    const saturated = {
      ...current,
      stateRevision: Number.MAX_SAFE_INTEGER,
      fieldRevisions: Object.fromEntries(APP_STATE_DATA_KEYS.map((key) => [key, Number.MAX_SAFE_INTEGER])),
      fieldMutationIds: Object.fromEntries(APP_STATE_DATA_KEYS.map((key) => [key, `max:${key}`])),
    };
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify(saturated));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        transaction.objectStore("app-state").put(saturated, "current");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  });

  const peerPage = await page.context().newPage();
  await peerPage.goto("/");
  await expect(peerPage.getByTestId("home-view")).toBeVisible();

  const stalePage = await page.context().newPage();
  await stalePage.addInitScript(() => {
    const nativeAddEventListener = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === "storage") return;
      nativeAddEventListener(type, listener, options);
    }) as typeof window.addEventListener;
    Object.defineProperty(window, "BroadcastChannel", { configurable: true, value: undefined });
  });
  await stalePage.goto("/");
  await expect(stalePage.getByTestId("home-view")).toBeVisible();

  const resetTrigger = page.getByTestId("fatal-reset");
  await resetTrigger.click();
  const resetDialog = page.getByRole("alertdialog", { name: "Réinitialiser toutes les données ?" });
  await expect(resetDialog).toBeVisible();
  await expect(resetDialog.getByRole("button", { name: "Annuler" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("inflamm-menu:app-state") !== null)).toBe(true);
  await resetDialog.getByRole("button", { name: "Annuler" }).click();
  await expect(resetTrigger).toBeFocused();

  await resetTrigger.click();
  await page.keyboard.press("Escape");
  await expect(resetDialog).toHaveCount(0);
  await expect(resetTrigger).toBeFocused();

  await resetTrigger.click();
  await Promise.all([
    page.waitForNavigation(),
    resetDialog.getByRole("button", { name: "Tout réinitialiser" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Inflamm’Menu a rencontré une erreur" })).toBeVisible();
  await expect(peerPage.getByTestId("onboarding-view")).toBeVisible();

  await stalePage.waitForTimeout(30);
  await stalePage.getByRole("button", { name: "Ajuster mon profil" }).click();
  await stalePage.getByLabel("Votre prénom").fill("Donnée obsolète");
  await stalePage.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await expect(stalePage.getByTestId("onboarding-view")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const raw = window.localStorage.getItem("inflamm-menu:app-state");
    const state = raw ? JSON.parse(raw) : null;
    return state ? {
      firstName: state.profile?.firstName,
      history: state.history?.length,
      favorites: state.favoriteRecipeIds?.length,
      customRecipes: state.customRecipes?.length,
      onboardingCompleted: state.onboardingCompleted,
    } : null;
  })).toEqual({ firstName: "", history: 0, favorites: 0, customRecipes: 0, onboardingCompleted: false });
  await expect.poll(() => page.evaluate(async () => new Promise<Record<string, unknown> | null>((resolve, reject) => {
    const request = indexedDB.open("inflamm-menu", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("app-state", "readonly");
      const get = transaction.objectStore("app-state").get("current");
      get.onsuccess = () => {
        database.close();
        const state = get.result;
        resolve(state ? {
          firstName: state.profile?.firstName,
          history: state.history?.length,
          favorites: state.favoriteRecipeIds?.length,
          customRecipes: state.customRecipes?.length,
          onboardingCompleted: state.onboardingCompleted,
        } : null);
      };
      get.onerror = () => { database.close(); reject(get.error); };
    };
  }))).toEqual({ firstName: "", history: 0, favorites: 0, customRecipes: 0, onboardingCompleted: false });

  await expect.poll(() => page.evaluate(async () => {
    const localState = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "null");
    const localMarker = window.localStorage.getItem("inflamm-menu:reset-marker");
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readonly");
        const stateRequest = transaction.objectStore("app-state").get("current");
        const markerRequest = transaction.objectStore("app-state").get("reset-marker");
        transaction.oncomplete = () => {
          database.close();
          resolve({
            localMarker,
            localGeneration: localState?.storageGeneration,
            indexedMarker: markerRequest.result,
            indexedGeneration: stateRequest.result?.storageGeneration,
            generationsMatch: Boolean(localMarker)
              && localMarker === localState?.storageGeneration
              && localMarker === markerRequest.result
              && localMarker === stateRequest.result?.storageGeneration,
          });
        };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  })).toEqual(expect.objectContaining({
    localMarker: expect.stringMatching(/^\d+:/),
    localGeneration: expect.stringMatching(/^\d+:/),
    indexedMarker: expect.stringMatching(/^\d+:/),
    indexedGeneration: expect.stringMatching(/^\d+:/),
    generationsMatch: true,
  }));

  await stalePage.getByTestId("onboarding-skip").click();
  await stalePage.getByRole("button", { name: "Ajuster mon profil" }).click();
  await stalePage.getByLabel("Votre prénom").fill("Après réinitialisation");
  await stalePage.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await expect.poll(() => stalePage.evaluate(() => JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").profile?.firstName)).toBe("Après réinitialisation");
  await stalePage.reload();
  await expect(stalePage.getByTestId("home-view")).toBeVisible();
  await stalePage.getByRole("button", { name: "Ajuster mon profil" }).click();
  await expect(stalePage.getByLabel("Votre prénom")).toHaveValue("Après réinitialisation");
  await stalePage.close();
  await peerPage.close();
});

test("le reset dépasse une génération devenue visible après sa première lecture", async ({ page }) => {
  await page.goto("/tests/error-boundary-fixture.html");
  await page.evaluate(async () => {
    const highGeneration = "9999999999999999:preexisting";
    const highState = {
      version: 3,
      profile: { firstName: "Donnée à effacer" },
      currentPlan: null,
      upcomingPlan: null,
      favoriteRecipeIds: ["salade-lentilles-noix"],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
      customRecipes: [],
      onboardingCompleted: true,
      storageGeneration: highGeneration,
    };
    window.localStorage.removeItem("inflamm-menu:reset-marker");
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify({ ...highState, storageGeneration: undefined }));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("app-state")) request.result.createObjectStore("app-state");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        transaction.objectStore("app-state").put(highState, "current");
        transaction.objectStore("app-state").put(highGeneration, "reset-marker");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
    const factory = indexedDB as IDBFactory & { __resetOpen?: IDBFactory["open"]; __failResetOpen?: boolean };
    factory.__resetOpen = factory.open.bind(factory);
    factory.__failResetOpen = true;
    Object.defineProperty(factory, "open", {
      configurable: true,
      value: (...args: Parameters<IDBFactory["open"]>) => {
        if (factory.__failResetOpen) {
          factory.__failResetOpen = false;
          throw new Error("Première lecture IndexedDB volontairement indisponible");
        }
        return factory.__resetOpen!(...args);
      },
    });
  });

  await page.getByTestId("fatal-reset").click();
  await Promise.all([
    page.waitForNavigation(),
    page.getByTestId("fatal-reset-dialog-confirm").click(),
  ]);
  const appPage = await page.context().newPage();
  await appPage.goto("/");
  await expect(appPage.getByTestId("onboarding-view")).toBeVisible();
  const generations = await appPage.evaluate(async () => {
    const localMarker = window.localStorage.getItem("inflamm-menu:reset-marker")!;
    const localState = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "null");
    return new Promise<{ localMarker: string; localState: string; indexedMarker: string; indexedState: string }>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readonly");
        const stateRequest = transaction.objectStore("app-state").get("current");
        const markerRequest = transaction.objectStore("app-state").get("reset-marker");
        transaction.oncomplete = () => {
          database.close();
          resolve({
            localMarker,
            localState: localState.storageGeneration,
            indexedMarker: markerRequest.result,
            indexedState: stateRequest.result.storageGeneration,
          });
        };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  });
  expect(BigInt(generations.localMarker.split(":")[0])).toBeGreaterThan(9999999999999999n);
  expect(new Set(Object.values(generations)).size).toBe(1);
  await appPage.close();
});

test("un marqueur de reset reste valable si l’écriture locale de l’état atteint le quota", async ({ page }) => {
  await page.goto("/tests/error-boundary-fixture.html");
  await page.evaluate(async () => {
    const oldState = {
      version: 2,
      profile: { firstName: "À supprimer" },
      currentPlan: null,
      upcomingPlan: null,
      favoriteRecipeIds: ["salade-lentilles-noix"],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
      customRecipes: [],
      onboardingCompleted: true,
    };
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify(oldState));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("app-state")) request.result.createObjectStore("app-state");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readwrite");
        transaction.objectStore("app-state").put(oldState, "current");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
    const testWindow = window as typeof window & { __quotaSetItem?: Storage["setItem"] };
    testWindow.__quotaSetItem = Storage.prototype.setItem;
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value(this: Storage, key: string, value: string) {
        if (key === "inflamm-menu:app-state") throw new DOMException("Quota volontairement atteint", "QuotaExceededError");
        return testWindow.__quotaSetItem!.call(this, key, value);
      },
    });
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => { throw new Error("IndexedDB indisponible pendant le reset"); },
    });
  });

  await page.getByTestId("fatal-reset").click();
  await Promise.all([
    page.waitForNavigation(),
    page.getByTestId("fatal-reset-dialog-confirm").click(),
  ]);
  const appPage = await page.context().newPage();
  await appPage.goto("/");
  await expect(appPage.getByTestId("onboarding-view")).toBeVisible();
  await expect.poll(() => appPage.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}");
    return { firstName: state.profile?.firstName, favorites: state.favoriteRecipeIds?.length };
  })).toEqual({ firstName: "", favorites: 0 });
  await appPage.close();
});

test("un quota ne transforme ni une restauration ni un rollover en reset vide", async ({ page }) => {
  await page.goto("/tests/error-boundary-fixture.html");
  const result = await page.evaluate(async () => {
    const storage = await import("/src/storage.ts");
    const base = storage.migrateAppState({
      version: 3,
      profile: { firstName: "Profil préservé" },
      currentPlan: null,
      upcomingPlan: null,
      favoriteRecipeIds: ["salade-lentilles-noix"],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
      pantryAmounts: {},
      recipeNotes: {},
      shoppingCategoryOrder: [],
      actualSpend: {},
      customRecipes: [],
      textScale: "normal",
      remindersEnabled: false,
      onboardingCompleted: true,
    })!;
    const nativeSetItem = Storage.prototype.setItem;
    const disableWrites = () => {
      Object.defineProperty(Storage.prototype, "setItem", {
        configurable: true,
        value(this: Storage, key: string, value: string) {
          if (key === "inflamm-menu:app-state") {
            throw new DOMException("Quota volontairement atteint", "QuotaExceededError");
          }
          return nativeSetItem.call(this, key, value);
        },
      });
      Object.defineProperty(indexedDB, "open", {
        configurable: true,
        value: () => { throw new Error("IndexedDB indisponible pendant le test"); },
      });
    };
    const attempt = async (candidate: Parameters<typeof storage.saveAppState>[0]) => {
      const beforeState = window.localStorage.getItem("inflamm-menu:app-state");
      const beforeMarker = window.localStorage.getItem("inflamm-menu:reset-marker");
      let rejected = false;
      try { await storage.saveAppState(candidate); } catch { rejected = true; }
      return {
        rejected,
        stateUnchanged: window.localStorage.getItem("inflamm-menu:app-state") === beforeState,
        markerUnchanged: window.localStorage.getItem("inflamm-menu:reset-marker") === beforeMarker,
      };
    };

    window.localStorage.clear();
    nativeSetItem.call(window.localStorage, "inflamm-menu:app-state", JSON.stringify(base));
    disableWrites();
    const imported = storage.replaceAppStateData(base, storage.migrateAppState({
      ...base,
      profile: { ...base.profile, firstName: "Camille importée" },
    })!);
    const restore = await attempt(imported);

    nativeSetItem.call(window.localStorage, "inflamm-menu:app-state", JSON.stringify(base));
    window.localStorage.removeItem("inflamm-menu:reset-marker");
    const ordinaryEdit = storage.stampAppStateChanges(base, {
      ...base,
      profile: { ...base.profile, firstName: "Édition non persistée" },
    }, 1);
    const sameGeneration = await attempt(ordinaryEdit);

    const maxRevisions = Object.fromEntries(storage.APP_STATE_DATA_KEYS.map((key) => [key, Number.MAX_SAFE_INTEGER]));
    const saturated = storage.migrateAppState({
      ...base,
      stateRevision: Number.MAX_SAFE_INTEGER,
      fieldRevisions: maxRevisions,
    })!;
    nativeSetItem.call(window.localStorage, "inflamm-menu:app-state", JSON.stringify(saturated));
    window.localStorage.removeItem("inflamm-menu:reset-marker");
    const rolled = storage.stampAppStateChanges(saturated, {
      ...saturated,
      profile: { ...saturated.profile, firstName: "Après rollover" },
    }, Number.MAX_SAFE_INTEGER);
    const rollover = await attempt(rolled);
    const persisted = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}");
    return {
      restore,
      sameGeneration,
      rollover,
      persistedName: persisted.profile?.firstName,
      persistedGeneration: persisted.storageGeneration,
      saturatedGeneration: saturated.storageGeneration,
    };
  });

  expect(result.restore).toEqual({ rejected: true, stateUnchanged: true, markerUnchanged: true });
  expect(result.sameGeneration).toEqual({ rejected: true, stateUnchanged: true, markerUnchanged: true });
  expect(result.rollover).toEqual({ rejected: true, stateUnchanged: true, markerUnchanged: true });
  expect(result.persistedName).toBe("Profil préservé");
  expect(result.persistedGeneration).toBe(result.saturatedGeneration);
});

test("seul un reset peut modifier le tombstone local", async ({ page }) => {
  await page.goto("/tests/error-boundary-fixture.html");
  const result = await page.evaluate(async () => {
    const storage = await import("/src/storage.ts");
    const base = storage.migrateAppState({
      version: 3,
      profile: { firstName: "Avant remplacement" },
      currentPlan: null,
      upcomingPlan: null,
      favoriteRecipeIds: [],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
      customRecipes: [],
      onboardingCompleted: true,
    })!;
    const priorReset = "1:reset:prior";
    window.localStorage.clear();
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify(base));
    window.localStorage.setItem("inflamm-menu:reset-marker", priorReset);
    const nativeSetItem = Storage.prototype.setItem;
    const writtenKeys: string[] = [];
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value(this: Storage, key: string, value: string) {
        writtenKeys.push(key);
        return nativeSetItem.call(this, key, value);
      },
    });
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => { throw new Error("IndexedDB volontairement indisponible"); },
    });
    const replacement = storage.replaceAppStateData(base, storage.migrateAppState({
      ...base,
      profile: { ...base.profile, firstName: "Après remplacement" },
    })!);
    const saved = await storage.saveAppState(replacement);
    const persisted = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "null");
    return {
      localSaved: saved.localSaved,
      marker: window.localStorage.getItem("inflamm-menu:reset-marker"),
      markerWrites: writtenKeys.filter((key) => key === "inflamm-menu:reset-marker").length,
      persistedGeneration: persisted.storageGeneration,
      replacementGeneration: replacement.storageGeneration,
      persistedName: persisted.profile?.firstName,
    };
  });

  expect(result).toEqual({
    localSaved: true,
    marker: "1:reset:prior",
    markerWrites: 0,
    persistedGeneration: result.replacementGeneration,
    replacementGeneration: result.replacementGeneration,
    persistedName: "Après remplacement",
  });
});

test("deux resets concurrents convergent puis acceptent de nouvelles données", async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByLabel("Votre prénom").fill("Avant double reset");
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").profile?.firstName)).toBe("Avant double reset");

  await page.goto("/tests/error-boundary-fixture.html");
  const secondReset = await page.context().newPage();
  await secondReset.goto("/tests/error-boundary-fixture.html");
  await page.getByTestId("fatal-reset").click();
  await secondReset.getByTestId("fatal-reset").click();
  await Promise.all([
    page.waitForNavigation(),
    secondReset.waitForNavigation(),
    page.getByTestId("fatal-reset-dialog-confirm").click(),
    secondReset.getByTestId("fatal-reset-dialog-confirm").click(),
  ]);

  const verifier = await page.context().newPage();
  await verifier.goto("/");
  await expect(verifier.getByTestId("onboarding-view")).toBeVisible();
  await expect.poll(() => verifier.evaluate(async () => {
    const localMarker = window.localStorage.getItem("inflamm-menu:reset-marker");
    const localState = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "null");
    return new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open("inflamm-menu", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("app-state", "readonly");
        const stateRequest = transaction.objectStore("app-state").get("current");
        const markerRequest = transaction.objectStore("app-state").get("reset-marker");
        transaction.oncomplete = () => {
          database.close();
          resolve(Boolean(localMarker)
            && localMarker === localState?.storageGeneration
            && localMarker === markerRequest.result
            && localMarker === stateRequest.result?.storageGeneration
            && stateRequest.result?.profile?.firstName === "");
        };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  })).toBe(true);

  await verifier.getByTestId("onboarding-skip").click();
  await verifier.getByRole("button", { name: "Ajuster mon profil" }).click();
  await verifier.getByLabel("Votre prénom").fill("Après double reset");
  await verifier.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await verifier.reload();
  await verifier.getByRole("button", { name: "Ajuster mon profil" }).click();
  await expect(verifier.getByLabel("Votre prénom")).toHaveValue("Après double reset");
  await verifier.close();
  await secondReset.close();
});

test("deux onglets isolés fusionnent leurs sauvegardes concurrentes", async ({ page }) => {
  await openFreshApp(page);
  const first = await page.context().newPage();
  const second = await page.context().newPage();
  for (const tab of [first, second]) {
    await tab.addInitScript(() => {
      const nativeAddEventListener = window.addEventListener.bind(window);
      window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === "storage") return;
        nativeAddEventListener(type, listener, options);
      }) as typeof window.addEventListener;
      Object.defineProperty(window, "BroadcastChannel", { configurable: true, value: undefined });
    });
    await tab.goto("/");
    await expect(tab.getByTestId("home-view")).toBeVisible();
  }

  await first.getByRole("button", { name: "Ajuster mon profil" }).click();
  await first.getByLabel("Votre prénom").fill("Deux onglets");
  await second.getByRole("button", { name: "Ajuster mon profil" }).click();
  await second.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await Promise.all([
    first.getByRole("button", { name: "Enregistrer mon profil" }).click(),
    second.getByTestId("text-scale-large").click(),
  ]);

  const verifier = await page.context().newPage();
  await verifier.goto("/");
  await expect(verifier.locator(".app-shell")).toHaveAttribute("data-text-scale", "large");
  await verifier.getByRole("button", { name: "Ajuster mon profil" }).click();
  await expect(verifier.getByLabel("Votre prénom")).toHaveValue("Deux onglets");
  await verifier.close();
  await first.close();
  await second.close();
});

test("l’accueil expose les repères et actions principales avec des noms accessibles", async ({ page }) => {
  await openFreshApp(page);

  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Une semaine/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Générer ma semaine" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajuster mon profil" })).toBeVisible();

  for (const name of ["Accueil", "Semaine", "Courses", "Favoris"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }

  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("le profil est modifiable et conserve ses libellés accessibles", async ({ page }) => {
  await openFreshApp(page);

  const profileTrigger = page.getByRole("button", { name: "Ajuster mon profil" });
  await profileTrigger.click();
  await expect(page.getByRole("heading", { name: "Mon profil alimentaire" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mon profil alimentaire" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();

  const budget = page.getByLabel("Budget hebdomadaire (€)");
  const prepTime = page.getByLabel("Temps actif maximum en cuisine (min)");
  const allergies = page.getByLabel("Autre allergie ou ingrédient à exclure");
  const excluded = page.getByLabel("Aliments refusés");

  await expect(budget).toHaveValue("80");
  await expect(prepTime).toHaveValue("30");
  await expect(page.getByRole("button", { name: "Gluten", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(allergies).toHaveAttribute("placeholder", "Sélectionnez ci-dessus ou saisissez un terme");
  await expect(excluded).toHaveAttribute("placeholder", "Ex. brocoli, saumon");
  await expect(page.getByRole("button", { name: "Retirer une personne" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter une personne" })).toBeVisible();

  await budget.fill("95");
  await page.getByRole("button", { name: "Végétarien" }).click();
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await expect(profileTrigger).toBeFocused();
  await expect(page.getByText("95 € de budget cible")).toBeVisible();

  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les contraintes quotidiennes pilotent la semaine générée", async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByTestId("constraint-day-0").click();
  await page.getByTestId("constraint-time").selectOption("15");
  await page.getByRole("button", { name: "Ajouter une portion pour ce jour" }).click();
  await page.getByRole("button", { name: "Retirer une portion pour déjeuner" }).click();
  await page.getByTestId("constraint-skip-dinner").click();
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();

  await generateWeek(page);
  await page.locator(".day-card").first().click();
  const mondayMeals = page.locator('[data-testid^="meal-card-day-0-"]');
  await expect(mondayMeals).toHaveCount(2);
  await expect(mondayMeals.filter({ hasText: "Dîner" })).toHaveAttribute("data-skipped", "true");
  await expect(mondayMeals.filter({ hasText: "Déjeuner" })).toContainText("2 portions");
});

test("le mode ce soir révèle les recettes par groupes de six et la semaine affiche sa diversité végétale", async ({ page }) => {
  await openFreshApp(page);
  await page.getByTestId("tonight-open").click();
  await expect(page.getByTestId("tonight-view")).toBeVisible();
  await expect(page.locator('[data-testid^="tonight-result-"]')).toHaveCount(6);
  await expect(page.getByTestId("tonight-results-count")).toContainText("6 recettes sur");
  const firstPageForms = await page.locator('[data-testid^="tonight-result-"]').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-recipe-form")),
  );
  const firstPageCounts = firstPageForms.reduce<Record<string, number>>((counts, form) => ({
    ...counts,
    [form ?? "missing"]: (counts[form ?? "missing"] ?? 0) + 1,
  }), {});
  expect(new Set(firstPageForms).size).toBeGreaterThanOrEqual(3);
  expect(firstPageCounts.soup ?? 0).toBeLessThanOrEqual(2);
  expect(firstPageCounts.salad ?? 0).toBeLessThanOrEqual(2);
  expect(firstPageCounts.bowl ?? 0).toBeLessThanOrEqual(2);
  await page.getByTestId("tonight-more").click();
  await expect(page.locator('[data-testid^="tonight-result-"]')).toHaveCount(12);
  const visibleIds = await page.locator('[data-testid^="tonight-result-"]').evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid")));
  expect(new Set(visibleIds).size).toBe(12);
  await page.getByRole("button", { name: "Déjeuner" }).click();
  await expect(page.locator('[data-testid^="tonight-result-"]')).toHaveCount(6);
  await page.getByTestId("tonight-more").click();
  await expect(page.locator('[data-testid^="tonight-result-"]')).toHaveCount(12);
  await page.getByRole("button", { name: "Ajouter une portion" }).click();
  await expect(page.locator('[data-testid^="tonight-result-"]')).toHaveCount(6);
  await page.getByRole("button", { name: "Dîner" }).click();
  await page.getByTestId("tonight-time-15").click();
  await expect(page.locator('[data-testid^="tonight-result-"]')).toHaveCount(1);
  await expect(page.getByTestId("tonight-results-count")).toHaveText("1 recette sur 1");
  await expect(page.getByTestId("tonight-more")).toHaveCount(0);
  await expect(page.getByText("Seulement 1 recette correspond à ces critères.")).toBeVisible();
  await page.getByTestId("tonight-time-30").click();
  await expect(page.locator('[data-testid^="tonight-result-"]')).toHaveCount(6);
  await expect(page.getByTestId("tonight-more")).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).click();

  await generateWeek(page);
  await expect(page.getByTestId("plant-diversity")).toBeVisible();
  await expect(page.getByTestId("plant-diversity").locator("summary")).toContainText("végétaux comptés");
});

test("un état sans recette explique le critère bloquant sans relâcher les exclusions", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify({
      version: 2,
      profile: {
        people: 2, mealsPerDay: 2, weeklyBudget: 80, maxPrepMinutes: 1,
        allergies: ["arachides"], excludedIngredientIds: [], dislikedRecipeIds: [], softDislikedRecipeIds: [],
        weeklyTargets: { legumeMeals: 2, fishMeals: 2 }, dayConstraints: [], diet: "classic", equipment: [],
      },
      currentPlan: null, upcomingPlan: null, favoriteRecipeIds: [], history: [],
      checkedShoppingItemIds: [], pantryIngredientIds: [], customRecipes: [], onboardingCompleted: true,
    }));
  });
  await openFreshApp(page);
  await page.getByTestId("tonight-open").click();
  await expect(page.getByRole("heading", { name: "Aucune recette compatible" })).toBeVisible();
  const help = page.getByTestId("compatibility-help");
  await expect(help).toContainText("Temps disponible");
  await expect(help).toContainText("Ces règles de sécurité n’ont pas été assouplies");
});

test("la génération construit une semaine navigable puis une liste de courses", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);

  await expect(page.getByRole("heading", { name: "Ma semaine" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ma semaine" })).toBeFocused();
  await expect(page.locator(".week-summary").getByText("14", { exact: true })).toBeVisible();
  await expect(page.getByText("repas", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Remplacer/ }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));

  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page.getByTestId("courses-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liste de courses" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirer ce que j’ai déjà" })).toBeVisible();

  await page.getByTestId("enter-store-mode").click();
  await expect(page.getByTestId("store-mode")).toBeVisible();
  await expect(page.getByText(/Rayon 1 sur/)).toBeVisible();
  const storeItem = page.locator('[data-testid^="store-item-"]').first();
  await expect(storeItem).toBeVisible();
  await expect(storeItem).toHaveAttribute("aria-pressed", "false");
  await storeItem.click();
  await expect(storeItem).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("store-next-aisle").click();
  await expect(page.getByText(/Rayon 2 sur/)).toBeVisible();
  await page.getByTestId("exit-store-mode").click();
  await expect(page.getByTestId("courses-view")).toBeVisible();

  const firstShoppingItem = page.getByRole("button", { name: /^Cocher / }).first();
  await expect(firstShoppingItem).toBeVisible();
  const itemName = (await firstShoppingItem.getAttribute("aria-label"))?.replace(/^Cocher /, "") ?? "";
  await firstShoppingItem.click();
  await expect(page.getByText(/\d+ sur \d+ articles/)).toBeVisible();
  await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page.getByRole("button", { name: `Décocher ${itemName}` })).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("créer une autre semaine renouvelle les recettes dans l’interface", async ({ page }) => {
  await openFreshApp(page);
  await page.evaluate(() => { Date.now = () => 1_700_000_000_001; });
  await generateWeek(page);

  await page.getByTestId("layout-week").click();
  const firstWeek = await page.locator('[data-testid^="overview-"] span').allInnerTexts();
  expect(firstWeek).toHaveLength(14);

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.evaluate(() => { Date.now = () => 1_700_000_000_002; });
  await page.getByRole("button", { name: "Créer une autre semaine" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();
  await page.getByTestId("layout-week").click();

  const secondWeek = await page.locator('[data-testid^="overview-"] span').allInnerTexts();
  expect(secondWeek).toHaveLength(14);
  expect(secondWeek).not.toEqual(firstWeek);
  expect(new Set(secondWeek).size).toBe(14);
});

test("une substitution appliquée met à jour la recette, les allergènes et les courses", async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const dayIndex = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayIndex);
    const startsOn = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    const recipeIds = [
      "salade-lentilles-noix", "bowl-quinoa-legumes-houmous", "pates-completes-ratatouille", "salade-sardines-pommes-terre-haricots",
      "bowl-saumon-riz-complet-avocat", "bowl-poulet-orge-legumes", "bowl-cabillaud-patate-douce", "mijote-aubergine-pois-chiches",
      "salade-maquereau-betterave-pomme-terre", "curry-pois-chiches-epinards", "omelette-legumes-quinoa", "bowl-tofu-brocoli-sesame",
      "poulet-curcuma-legumes-semoule", "dal-lentilles-corail-courge",
    ];
    [recipeIds[0], recipeIds[dayIndex * 2]] = [recipeIds[dayIndex * 2], recipeIds[0]];
    const meals = recipeIds.map((recipeId, index) => ({
      id: `day-${Math.floor(index / 2)}-${index % 2 ? "dinner" : "lunch"}`,
      dayIndex: Math.floor(index / 2), mealType: index % 2 ? "dinner" : "lunch", recipeId, portions: 2, source: "generated",
    }));
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify({
      version: 3,
      profile: { people: 2, mealsPerDay: 2, weeklyBudget: 80, maxPrepMinutes: 30, allergies: [], excludedIngredientIds: [], diet: "classic", equipment: ["hob", "oven", "microwave", "blender", "toaster", "steamer"] },
      currentPlan: {
        id: `week-${startsOn}-substitution`, startsOn, generatedAt: new Date().toISOString(), profileSnapshot: {},
        meals,
        estimatedCost: 4.7, version: 1,
      },
      favoriteRecipeIds: [], history: [], checkedShoppingItemIds: [], pantryIngredientIds: [], onboardingCompleted: true,
    }));
  });
  await openFreshApp(page);
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await page.locator(".meal-card__main").first().click();
  await page.getByTestId("ingredient-substitute-walnut").click();
  await page.getByTestId("apply-substitution-nuts-to-pumpkin-seeds").click();
  await expect(page.getByTestId("substitution-summary")).toContainText("courses ont été recalculés");
  await expect(page.locator(".ingredient-row.is-substituted")).toContainText("graines de courge");
  await expect(page.getByText("Fruits à coque", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page.getByRole("button", { name: /graines de courge/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cocher noix$/i })).toHaveCount(0);
});

test("la semaine permet d’ouvrir une recette et le remplacement d’un repas", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);

  const firstMeal = page.locator(".meal-card__main").first();
  await firstMeal.click();
  await expect(page.getByText("Repères par portion")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();
  await page.getByTestId("flow-current").locator(".recipe-actions").getByRole("button", { name: "Remplacer", exact: true }).click();

  await expect(page.locator(".replace-page h1")).toBeVisible();
  await expect(page.getByText(/Les allergies, le régime et le temps actif maximum/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Choisir ce repas" })).toBeVisible();
  await expect(page.getByTestId("flow-fixed-header").getByRole("button")).toHaveCount(1);
});

test("un repas conservé survit à une nouvelle génération", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);

  const firstCard = page.locator(".meal-card").first();
  const keptTitle = await firstCard.locator(".meal-card__main strong").innerText();
  await firstCard.getByTestId(/^meal-actions-/).click();
  await page.getByTestId("action-lock").click();
  await expect(firstCard).toHaveAttribute("data-locked", "true");
  await expect(page.getByTestId("locked-banner")).toContainText("1 repas conservé");

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Créer une autre semaine" }).click();
  await expect(page.getByTestId("generate-locked")).toContainText("1 repas conservé");
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();

  const regenerated = page.locator(".meal-card").first();
  await expect(regenerated.locator(".meal-card__main strong")).toHaveText(keptTitle);
  await expect(regenerated).toHaveAttribute("data-locked", "true");

  await regenerated.getByTestId(/^meal-actions-/).click();
  await page.getByTestId("action-lock").click();
  await expect(regenerated).toHaveAttribute("data-locked", "false");
  await expect(page.getByTestId("locked-banner")).toHaveCount(0);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("marquer un repas comme cuisiné met à jour la progression et survit au rechargement", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);

  const firstCard = page.locator(".meal-card").first();
  await expect(page.getByTestId("week-progress")).toContainText("0 sur 14 repas cuisinés");

  await firstCard.getByRole("button", { name: /^Marquer /, exact: false }).click();
  await expect(firstCard).toHaveAttribute("data-completed", "true");
  await expect(page.getByTestId("week-progress")).toContainText("1 sur 14 repas cuisinés");

  await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await expect(page.getByTestId("week-progress")).toContainText("1 sur 14 repas cuisinés");

  const reloadedCard = page.locator(".meal-card").first();
  await expect(reloadedCard).toHaveAttribute("data-completed", "true");
  await reloadedCard.getByRole("button", { name: /^Annuler « cuisiné »/ }).click();
  await expect(reloadedCard).toHaveAttribute("data-completed", "false");
  await expect(page.getByTestId("week-progress")).toContainText("0 sur 14 repas cuisinés");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("la liste de courses peut être copiée, partagée et téléchargée", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    (window as unknown as { sharedPayloads: unknown[] }).sharedPayloads = [];
    (window as unknown as { printCalls: number }).printCalls = 0;
    window.print = () => { (window as unknown as { printCalls: number }).printCalls += 1; };
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data: unknown) => {
        (window as unknown as { sharedPayloads: unknown[] }).sharedPayloads.push(data);
        return Promise.resolve();
      },
    });
  });

  await openFreshApp(page);
  await generateWeek(page);
  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page.getByTestId("courses-view")).toBeVisible();

  await page.getByTestId("copy-list").click();
  await expect(page.getByTestId("export-feedback")).toHaveText("Liste copiée dans le presse-papiers.");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("Liste de courses — Inflamm’Menu");
  expect(clipboard).toContain("FRUITS ET LÉGUMES");
  expect(clipboard).toMatch(/\d+ articles à acheter\./);

  await page.getByTestId("share-list").click();
  const shared = await page.evaluate(() => (window as unknown as { sharedPayloads: Array<{ text: string }> }).sharedPayloads);
  expect(shared).toHaveLength(1);
  expect(shared[0].text).toContain("Liste de courses — Inflamm’Menu");

  await page.getByTestId("print-list").click();
  expect(await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(1);

  const download = page.waitForEvent("download");
  await page.getByTestId("download-list").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^liste-courses-\d{4}-\d{2}-\d{2}\.txt$/);
  await expect(page.getByTestId("export-feedback")).toHaveText("Liste téléchargée.");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("chaque repas affiche son coût estimé et ses allergènes déclarés", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);

  const facts = page.locator(".meal-facts").first();
  await expect(facts).toBeVisible();
  await expect(facts.locator(".meal-facts__cost")).toHaveText(/^\d+,\d{2} € estimés$/);
  await expect(facts.locator(".meal-facts__allergen, .meal-facts__clear")).not.toHaveCount(0);

  const cardCount = await page.locator(".meal-card").count();
  await expect(page.locator(".meal-facts__cost")).toHaveCount(cardCount);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les repas à repos long sont annoncés à l’avance", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify({
      version: 2,
      profile: {},
      currentPlan: null,
      favoriteRecipeIds: ["overnight-oats-myrtilles-noix"],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
    }));
  });
  await openFreshApp(page);

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  const oats = page.getByRole("button", { name: /Overnight oats aux myrtilles et noix/ });
  await expect(oats).toBeVisible();
  await oats.click();

  const advance = page.getByTestId("advance-note");
  await expect(advance).toContainText("À lancer la veille");
  await expect(advance).toContainText("8 h de repos");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("une semaine dont la date est passée est archivée au lieu d’être présentée comme courante", async ({ page }) => {
  await page.addInitScript(() => {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 21);
    const startsOn = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify({
      version: 2,
      profile: {},
      currentPlan: {
        id: `week-${startsOn}-old`,
        startsOn,
        generatedAt: `${startsOn}T08:00:00.000Z`,
        profileSnapshot: {},
        meals: [
          { id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: "salade-lentilles-noix", portions: 2, source: "generated" },
          { id: "day-0-dinner", dayIndex: 0, mealType: "dinner", recipeId: "saumon-brocoli-riz-complet", portions: 2, source: "generated" },
        ],
        estimatedCost: 14,
        version: 1,
      },
      favoriteRecipeIds: [],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
    }));
  });
  await openFreshApp(page);

  await expect(page.getByTestId("expired-banner")).toContainText("est terminée");
  await expect(page.getByRole("button", { name: "Générer ma semaine" })).toBeVisible();

  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aucune semaine pour le moment" })).toBeVisible();

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Historique" }).click();
  await expect(page.locator(".history-card")).toHaveCount(1);
  await expect(page.locator(".history-card").first()).toContainText("2 repas");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("l’accueil montre tous les repas du jour, y compris en trois repas", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: "3 repas" }).click();
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await generateWeek(page);

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await expect(page.locator(".meal-preview")).toHaveCount(3);
  await expect(page.locator(".meal-preview").first()).toHaveAttribute("data-completed", "false");

  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await page.locator(".meal-card").first().getByRole("button", { name: /^Marquer / }).click();
  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await expect(page.locator(".meal-preview[data-completed='true']")).toHaveCount(1);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("ajouter le petit-déjeuner conserve la semaine courante et les courses cochées", async ({ page }) => {
  await openFreshApp(page);
  await generateWeek(page);

  const planId = await page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state") ?? "{}").currentPlan?.id);
  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await page.locator(".shopping-toggle").first().click();
  const checkedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state") ?? "{}").checkedShoppingItemIds ?? []);
  expect(checkedBefore.length).toBe(1);

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: "3 repas" }).click();
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("inflamm-menu:app-state") ?? "{}");
    return {
      planId: state.currentPlan?.id,
      meals: state.currentPlan?.meals?.length,
      checked: state.checkedShoppingItemIds,
    };
  })).toEqual({ planId, meals: 14, checked: checkedBefore });

  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
  await expect(page.locator(".meal-card")).toHaveCount(2);
});

test("une recette écartée disparaît des semaines suivantes et reste réversible", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);

  const firstCard = page.locator(".meal-card").first();
  const rejected = await firstCard.locator(".meal-card__main strong").innerText();
  await firstCard.getByRole("button", { name: "Remplacer" }).click();

  await page.getByTestId("dislike-current").click();
  await expect(page.getByTestId("dislike-current")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Choisir ce repas" }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await expect(page.getByTestId("disliked-section")).toContainText(rejected);
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();

  await page.getByRole("button", { name: "Créer une autre semaine" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();
  for (let day = 0; day < 7; day += 1) {
    await page.locator(".day-card").nth(day).click();
    await expect(page.locator(".meal-card__main strong", { hasText: rejected })).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.locator(".disliked-grid button").first().click();
  await expect(page.getByTestId("disliked-section")).toContainText("Aucune recette écartée");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("une recette du catalogue peut être placée sur un créneau précis", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();
  await page.getByPlaceholder("Recette ou ingrédient").fill("wakame");
  await page.getByRole("button", { name: /Soupe miso au wakame/ }).click();

  await page.getByTestId("catalogue-plan").click();
  await expect(page.getByTestId("plan-slot-view")).toBeVisible();
  await page.getByTestId("plan-slot-2-dinner").click();

  await expect(page.getByTestId("week-view")).toBeVisible();
  await page.locator(".day-card").nth(2).click();
  await expect(page.locator(".meal-card__main strong", { hasText: "Soupe miso au wakame" })).toHaveCount(1);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("un plat peut être cuisiné en double et servi en restes", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  await page.locator(".day-card").first().click();

  const firstCard = page.locator(".meal-card").first();
  const cooked = await firstCard.locator(".meal-card__main strong").innerText();
  await firstCard.getByTestId(/^meal-actions-/).click();
  await page.getByTestId("action-leftover").click();

  await expect(page.getByTestId("leftover-view")).toBeVisible();
  await expect(page.getByText("Conservation", { exact: true })).toBeVisible();
  await page.locator(".plan-slot").first().click();

  await expect(page.getByTestId("week-view")).toBeVisible();
  await expect(page.getByTestId("leftover-banner")).toContainText("13 sessions de cuisine");

  await page.locator(".day-card").nth(1).click();
  const leftoverCard = page.locator(".meal-card[data-leftover='true']").first();
  await expect(leftoverCard).toBeVisible();
  await expect(leftoverCard.locator(".meal-card__main strong")).toHaveText(cooked);
  await expect(leftoverCard).toContainText("rien à cuisiner");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("le bilan de la semaine expose les repères sans promesse médicale", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);

  const balance = page.getByTestId("week-balance");
  await expect(balance).toBeVisible();
  await expect(balance).toContainText("Repas avec légumineuses");
  await expect(balance).toContainText("/ 2 visés");
  await expect(balance).toContainText("Repas avec poisson");
  await expect(balance).toContainText("kcal");
  await expect(balance).toContainText("g fibres");
  await expect(balance).toContainText("ni une évaluation nutritionnelle ni un avis médical");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les portions d’un repas se règlent et se répercutent sur la semaine", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  await page.locator(".meal-card__main").first().click();

  await expect(page.getByTestId("portions-help")).toBeVisible();
  await expect(page.getByTestId("recipe-portions")).toHaveText("2");
  await page.getByRole("button", { name: "Ajouter une portion" }).click();
  await page.getByRole("button", { name: "Ajouter une portion" }).click();
  await expect(page.getByTestId("recipe-portions")).toHaveText("4");

  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.locator(".meal-card").first()).toContainText("4 portions");

  await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await expect(page.locator(".meal-card").first()).toContainText("4 portions");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les données locales s’exportent et se restaurent", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByLabel("Votre prénom").fill("Camille");
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await expect(page.getByText("Bonjour Camille")).toBeVisible();

  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await expect(page.getByTestId("backup-card")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByTestId("backup-export").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^inflamm-menu-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = await file.path();

  await page.evaluate(async () => {
    window.localStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("inflamm-menu");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("La base locale est encore ouverte."));
    });
  });
  await page.reload();
  await expect(page.getByTestId("onboarding-view")).toBeVisible();
  await page.getByTestId("onboarding-skip").click();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await expect(page.getByText("Bonjour Camille")).toHaveCount(0);

  const staleTab = await page.context().newPage();
  await staleTab.addInitScript(() => {
    const nativeAddEventListener = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === "storage") return;
      nativeAddEventListener(type, listener, options);
    }) as typeof window.addEventListener;
    Object.defineProperty(window, "BroadcastChannel", { configurable: true, value: undefined });
  });
  await staleTab.goto("/");
  await expect(staleTab.getByTestId("home-view")).toBeVisible();

  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await page.getByTestId("backup-import").setInputFiles(backupPath);
  await expect(page.getByTestId("backup-feedback")).toContainText("Sauvegarde vérifiée");
  await expect(page.getByText("Bonjour Camille")).toHaveCount(0);
  await page.getByTestId("backup-confirm").click();
  await expect(page.getByTestId("backup-feedback")).toContainText("Sauvegarde restaurée");

  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByText("Bonjour Camille")).toBeVisible();
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
  await expect(page.locator(".meal-card")).not.toHaveCount(0);

  await staleTab.getByRole("button", { name: "Ajuster mon profil" }).click();
  await staleTab.getByLabel("Votre prénom").fill("Donnée d’avant restauration");
  await staleTab.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").profile?.firstName)).toBe("Camille");
  await staleTab.reload();
  await expect(staleTab.getByText("Bonjour Camille")).toBeVisible();
  await staleTab.close();
});

test("une restauration n’annonce son succès qu’après une écriture durable", async ({ page }) => {
  await openFreshApp(page);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("inflamm-menu:app-state"))).not.toBeNull();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  const currentState = await page.evaluate(() => JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "null"));
  const backup = {
    format: "inflamm-menu-backup",
    version: 3,
    exportedAt: new Date().toISOString(),
    state: {
      ...currentState,
      profile: { ...currentState.profile, firstName: "Import non durable" },
    },
  };
  await page.getByTestId("backup-import").setInputFiles({
    name: "sauvegarde-valide.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByTestId("backup-feedback")).toContainText("Sauvegarde vérifiée");
  const before = await page.evaluate(() => ({
    state: window.localStorage.getItem("inflamm-menu:app-state"),
    marker: window.localStorage.getItem("inflamm-menu:reset-marker"),
  }));
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __restoreSetItem?: Storage["setItem"] };
    testWindow.__restoreSetItem = Storage.prototype.setItem;
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value(this: Storage, key: string, value: string) {
        if (key === "inflamm-menu:app-state") throw new DOMException("Quota restauration", "QuotaExceededError");
        return testWindow.__restoreSetItem!.call(this, key, value);
      },
    });
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => { throw new Error("IndexedDB indisponible pendant la restauration"); },
    });
  });

  await page.getByTestId("backup-confirm").click();
  await expect(page.getByTestId("backup-error")).toContainText("Vos données actuelles sont conservées");
  await expect(page.getByTestId("backup-feedback")).toHaveCount(0);
  await expect(page.getByTestId("backup-confirmation")).toBeVisible();
  expect(await page.evaluate(() => ({
    state: window.localStorage.getItem("inflamm-menu:app-state"),
    marker: window.localStorage.getItem("inflamm-menu:reset-marker"),
  }))).toEqual(before);
});

test("une sauvegarde étrangère est refusée avec un message clair", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await page.getByTestId("backup-import").setInputFiles({
    name: "autre.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "autre-app", state: {} })),
  });
  await expect(page.getByTestId("backup-error")).toContainText("ne provient pas d’Inflamm’Menu");
});

test("une sauvegarde tronquée est refusée et une restauration vérifiée peut être annulée", async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();

  await page.getByTestId("backup-import").setInputFiles({
    name: "tronquee.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 2 })),
  });
  await expect(page.getByTestId("backup-error")).toContainText("incomplète");
  await expect(page.getByTestId("backup-confirmation")).toHaveCount(0);

  const completeState = await page.evaluate(() => window.localStorage.getItem("inflamm-menu:app-state"));
  await page.getByTestId("backup-import").setInputFiles({
    name: "valide.json",
    mimeType: "application/json",
    buffer: Buffer.from(completeState ?? ""),
  });
  await expect(page.getByTestId("backup-confirmation")).toBeVisible();
  await page.getByTestId("backup-cancel").click();
  await expect(page.getByTestId("backup-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("backup-feedback")).toContainText("données actuelles sont conservées");
});

test("une sauvegarde active partielle ou incompatible ne peut pas remplacer les données courantes", async ({ page }) => {
  await openFreshApp(page);
  await generateWeek(page);
  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByLabel("Votre prénom").fill("Gardé");
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();

  await expect.poll(() => page.evaluate(() => {
    const raw = window.localStorage.getItem("inflamm-menu:app-state");
    return raw ? JSON.parse(raw).profile?.firstName : null;
  })).toBe("Gardé");
  const raw = await page.evaluate(() => window.localStorage.getItem("inflamm-menu:app-state"));
  expect(raw).not.toBeNull();
  const completeState = JSON.parse(raw ?? "{}");
  expect(completeState.currentPlan?.meals?.length).toBe(14);

  await page.getByTestId("backup-import").setInputFiles({
    name: "valide-avant-erreur.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(completeState)),
  });
  await expect(page.getByTestId("backup-confirmation")).toBeVisible();

  const incompatibleBackups = [
    {
      name: "semaine-partielle.json",
      state: {
        ...completeState,
        currentPlan: { ...completeState.currentPlan, meals: completeState.currentPlan.meals.slice(0, 1) },
      },
    },
    {
      name: "type-de-repas-incompatible.json",
      state: {
        ...completeState,
        currentPlan: {
          ...completeState.currentPlan,
          meals: completeState.currentPlan.meals.map((meal: { recipeId: string }, index: number) =>
            index === 0 ? { ...meal, recipeId: "overnight-oats-myrtilles-noix" } : meal,
          ),
        },
      },
    },
    {
      name: "recette-absente.json",
      state: {
        ...completeState,
        currentPlan: {
          ...completeState.currentPlan,
          meals: completeState.currentPlan.meals.map((meal: { recipeId: string }, index: number) =>
            index === 0 ? { ...meal, recipeId: "recette-absente-audit" } : meal,
          ),
        },
      },
    },
    {
      name: "creneau-en-trop.json",
      state: {
        ...completeState,
        currentPlan: {
          ...completeState.currentPlan,
          meals: [...completeState.currentPlan.meals, {
            ...completeState.currentPlan.meals[0],
            id: "day-0-breakfast",
            mealType: "breakfast",
            recipeId: "overnight-oats-myrtilles-noix",
          }],
        },
      },
    },
  ];

  for (const backup of incompatibleBackups) {
    await page.getByTestId("backup-import").setInputFiles({
      name: backup.name,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup.state)),
    });
    await expect(page.getByTestId("backup-error")).toContainText("incomplète ou incompatible");
    await expect(page.getByTestId("backup-error")).toContainText("données actuelles sont conservées");
    await expect(page.getByTestId("backup-confirmation")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const stored = window.localStorage.getItem("inflamm-menu:app-state");
      return stored ? JSON.parse(stored).profile?.firstName : null;
    })).toBe("Gardé");
  }
});

test("une sauvegarde active peut restaurer une recette personnalisée qu’elle contient", async ({ page }) => {
  await openFreshApp(page);
  await generateWeek(page);
  await page.locator(".meal-card__main").first().click();
  await page.getByTestId("duplicate-recipe").click();
  await page.getByTestId("custom-title").fill("Recette active restaurée");
  await page.getByTestId("custom-save").click();

  await expect.poll(() => page.evaluate(() => {
    const raw = window.localStorage.getItem("inflamm-menu:app-state");
    return raw ? JSON.parse(raw).customRecipes?.length : 0;
  })).toBe(1);
  const raw = await page.evaluate(() => window.localStorage.getItem("inflamm-menu:app-state"));
  expect(raw).not.toBeNull();
  const backup = JSON.parse(raw ?? "{}");
  const customRecipeId = backup.customRecipes?.[0]?.id;
  expect(customRecipeId).toMatch(/^perso-/);
  backup.currentPlan.profileSnapshot = { ...backup.profile, allergies: ["gluten"] };
  backup.currentPlan.meals[0] = {
    ...backup.currentPlan.meals[0],
    recipeId: customRecipeId,
  };

  await page.reload();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await page.getByTestId("backup-import").setInputFiles({
    name: "recette-personnalisee-active.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });

  await expect(page.getByTestId("backup-error")).toHaveCount(0);
  await expect(page.getByTestId("backup-confirmation")).toBeVisible();
  await expect(page.getByTestId("backup-feedback")).toContainText("Sauvegarde vérifiée");
  await page.getByTestId("backup-confirm").click();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}");
    return {
      recipeId: state.currentPlan?.meals?.[0]?.recipeId,
      snapshotAllergies: state.currentPlan?.profileSnapshot?.allergies,
      profileAllergies: state.profile?.allergies,
    };
  })).toEqual({ recipeId: customRecipeId, snapshotAllergies: [], profileAllergies: [] });

  await page.reload();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}");
    return state.currentPlan?.meals?.[0]?.recipeId;
  })).toBe(customRecipeId);
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await page.getByTestId("layout-week").click();
  await expect(page.getByTestId("overview-day-0-lunch")).toContainText("Recette active restaurée");
});

test("une sauvegarde légitime conserve un repas hors foyer après le passage à trois repas", async ({ page }) => {
  await openFreshApp(page);
  await generateWeek(page);
  const firstCard = page.locator(".meal-card").first();
  await firstCard.getByTestId(/^meal-actions-/).click();
  await page.getByTestId("action-skip").click();
  await expect(firstCard).toHaveAttribute("data-skipped", "true");

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: "3 repas" }).click();
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();

  const raw = await page.evaluate(() => window.localStorage.getItem("inflamm-menu:app-state"));
  expect(raw).not.toBeNull();
  const state = JSON.parse(raw ?? "{}");
  expect(state.profile.mealsPerDay).toBe(3);
  expect(state.currentPlan.profileSnapshot.mealsPerDay).toBe(2);
  expect(state.currentPlan.meals.some((meal: { skipped?: boolean }) => meal.skipped === true)).toBe(true);
  state.currentPlan.profileSnapshot.mealsPerDay = 3;

  await page.getByTestId("backup-import").setInputFiles({
    name: "semaine-legitime-apres-profil.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.getByTestId("backup-error")).toHaveCount(0);
  await expect(page.getByTestId("backup-confirmation")).toBeVisible();
  await page.getByTestId("backup-confirm").click();
  await expect.poll(() => page.evaluate(() => {
    const restored = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}");
    return {
      mealsPerDay: restored.currentPlan?.profileSnapshot?.mealsPerDay,
      skipped: restored.currentPlan?.meals?.some((meal: { skipped?: boolean }) => meal.skipped === true),
    };
  })).toEqual({ mealsPerDay: 2, skipped: true });
});

test("seule la dernière sauvegarde sélectionnée peut préparer une restauration", async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  const validState = await page.evaluate(() => window.localStorage.getItem("inflamm-menu:app-state"));
  expect(validState).not.toBeNull();

  await page.evaluate(() => {
    const originalText = File.prototype.text;
    File.prototype.text = function textWithControlledDelay() {
      const value = originalText.call(this);
      return this.name === "ancienne-lente.json"
        ? new Promise<string>((resolve) => window.setTimeout(() => { void value.then(resolve); }, 150))
        : value;
    };
  });

  await page.getByTestId("backup-import").setInputFiles({
    name: "ancienne-lente.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "autre-app", state: {} })),
  });
  await page.getByTestId("backup-import").setInputFiles({
    name: "derniere-valide.json",
    mimeType: "application/json",
    buffer: Buffer.from(validState ?? ""),
  });

  await expect(page.getByTestId("backup-confirmation")).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.getByTestId("backup-error")).toHaveCount(0);
  await expect(page.getByTestId("backup-confirmation")).toBeVisible();
});

test("l’installation et l’état hors ligne sont signalés sans être simulés", async ({ page, context }) => {
  await openFreshApp(page);

  await expect(page.getByTestId("install-banner")).toHaveCount(0);
  await expect(page.getByTestId("offline-strip")).toHaveCount(0);

  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt") as Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
    event.prompt = () => Promise.resolve();
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });
  await expect(page.getByTestId("install-banner")).toContainText("Installer Inflamm’Menu");
  await page.getByTestId("install-app").click();
  await expect(page.getByTestId("install-banner")).toHaveCount(0);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByTestId("offline-strip")).toContainText("Hors ligne");

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("offline-strip")).toHaveCount(0);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("un catalogue injoignable affiche une erreur et se recharge au réessai", async ({ page }) => {
  let blocked = true;
  await page.route(/recettes-anti-inflammatoires\.json$/, (route) => (blocked ? route.abort() : route.continue()));

  await openFreshApp(page);

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();
  await expect(page.getByTestId("catalogue-error")).toBeVisible();
  await expect(page.getByTestId("catalogue-error")).toContainText("Catalogue indisponible");

  blocked = false;
  await page.getByTestId("catalogue-retry").click();
  await expect(page.getByText("624 recettes uniques disponibles")).toBeVisible();
  await expect(page.getByTestId("catalogue-error")).toHaveCount(0);
});

test("changer un repas ne décoche pas toute la liste de courses", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  await page.getByRole("button", { name: "Courses", exact: true }).click();

  const firstItem = page.getByRole("button", { name: /^Cocher / }).first();
  const firstName = (await firstItem.getAttribute("aria-label"))?.replace(/^Cocher /, "") ?? "";
  await firstItem.click();
  const secondItem = page.getByRole("button", { name: /^Cocher / }).first();
  const secondName = (await secondItem.getAttribute("aria-label"))?.replace(/^Cocher /, "") ?? "";
  await secondItem.click();
  await expect(page.getByText(/2 sur \d+ articles/)).toBeVisible();

  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await page.locator(".meal-card").first().getByRole("button", { name: "Remplacer" }).click();
  await page.getByRole("button", { name: "Choisir ce repas" }).click();

  await page.getByRole("button", { name: "Courses", exact: true }).click();
  const stillChecked = await page.getByRole("button", { name: /^Décocher / }).count();
  expect(stillChecked).toBeGreaterThan(0);
  for (const name of [firstName, secondName]) {
    const stillListed = await page.getByRole("button", { name: new RegExp(`^(Cocher|Décocher) ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).count();
    if (stillListed) await expect(page.getByRole("button", { name: `Décocher ${name}` })).toBeVisible();
  }
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les objectifs hebdomadaires sont visibles, réglables et suivis", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  const targets = page.getByTestId("targets-section");
  await expect(targets).toBeVisible();
  await expect(page.getByTestId("target-legume")).toHaveText("2");
  await expect(page.getByTestId("target-fish")).toHaveText("2");

  await page.getByRole("button", { name: "Plus de repas avec légumineuses" }).click();
  await expect(page.getByTestId("target-legume")).toHaveText("3");
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();

  await generateWeek(page);
  await expect(page.getByTestId("week-balance")).toContainText("/ 3 visés");

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await expect(page.getByTestId("target-legume")).toHaveText("3");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les favoris et l’historique restent accessibles depuis la navigation principale", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.getByTestId("favorites-view")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Catalogue, favoris et historique" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Favoris", selected: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aucune recette enregistrée" })).toBeVisible();
  await expect(page.locator(".favorite-card")).toHaveCount(0);

  await page.getByRole("tab", { name: "Historique" }).click();
  await expect(page.getByRole("tab", { name: "Historique", selected: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aucun historique" })).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les favoris se recherchent une fois la liste garnie", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify({
      version: 2,
      profile: {},
      currentPlan: null,
      favoriteRecipeIds: [
        "salade-lentilles-noix",
        "saumon-brocoli-riz-complet",
        "bowl-quinoa-legumes-houmous",
        "overnight-oats-myrtilles-noix",
        "porridge-millet-pomme",
      ],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
    }));
  });
  await openFreshApp(page);
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.locator(".favorite-card")).toHaveCount(5);

  await page.getByTestId("favorites-search").fill("saumon");
  await expect(page.locator(".favorite-card")).toHaveCount(1);
  await expect(page.locator(".favorite-card").first()).toContainText("Saumon");

  await page.getByTestId("favorites-search").fill("brocoli");
  await expect(page.locator(".favorite-card")).toHaveCount(1);

  await page.getByTestId("favorites-search").fill("zzz");
  await expect(page.getByRole("heading", { name: "Aucun résultat" })).toBeVisible();

  await page.getByTestId("favorites-search").fill("");
  await expect(page.locator(".favorite-card")).toHaveCount(5);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("le mode cuisine déroule les étapes et tente de garder l’écran allumé", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { wakeLockRequests: string[] }).wakeLockRequests = [];
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: (type: string) => {
          (window as unknown as { wakeLockRequests: string[] }).wakeLockRequests.push(type);
          return Promise.resolve({ release: () => Promise.resolve(), addEventListener: () => undefined });
        },
      },
    });
  });
  await openFreshApp(page);
  await generateWeek(page);

  await page.locator(".meal-card__main").first().click();
  const steps = await page.locator(".steps li").count();
  await page.getByTestId("start-cooking").click();

  await expect(page.getByTestId("cooking-view")).toBeVisible();
  await expect(page.getByText(`Étape 1 sur ${steps}`)).toBeVisible();
  await expect(page.getByTestId("cooking-wake-lock")).toContainText("Écran maintenu allumé");
  const wakeLockRequests = await page.evaluate(() => (window as unknown as { wakeLockRequests: string[] }).wakeLockRequests);
  expect(wakeLockRequests.length).toBeGreaterThan(0);
  expect(wakeLockRequests.every((type) => type === "screen")).toBe(true);

  await expect(page.getByTestId("cooking-previous")).toBeDisabled();
  const firstStep = await page.getByTestId("cooking-step").innerText();
  await page.getByTestId("cooking-next").click();
  await expect(page.getByText(`Étape 2 sur ${steps}`)).toBeVisible();
  await expect(page.getByTestId("cooking-step")).not.toHaveText(firstStep);

  await page.getByTestId("cooking-done").click();
  await expect(page.getByTestId("cooking-done")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cooking-progress button.is-done")).toHaveCount(1);

  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByText("Repères par portion")).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("une semaine archivée peut être supprimée et le plafond est expliqué", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  const archivedPlanId = await page.evaluate(() => JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").currentPlan?.id as string | undefined);
  expect(archivedPlanId).toBeTruthy();
  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await page.getByTestId("spend-input").fill("61,25");
  await expect.poll(() => page.evaluate((planId) => JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").actualSpend?.[planId], archivedPlanId)).toBe(61.25);
  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Créer une autre semaine" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Historique" }).click();
  await expect(page.locator(".history-card")).toHaveCount(1);
  await expect(page.getByText(/1 semaine conservée sur cet appareil, 12 au maximum/)).toBeVisible();

  const deleteTrigger = page.locator(".history-card__delete").first();
  await deleteTrigger.click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Supprimer cette semaine ?" });
  await expect(deleteDialog).toBeVisible();
  await expect(page.locator(".history-card")).toHaveCount(1);
  await expect(deleteDialog.getByRole("button", { name: "Annuler" })).toBeFocused();
  await deleteDialog.getByRole("button", { name: "Annuler" }).click();
  await expect(deleteDialog).toHaveCount(0);
  await expect(deleteTrigger).toBeFocused();

  await deleteTrigger.click();
  await page.keyboard.press("Escape");
  await expect(deleteDialog).toHaveCount(0);
  await expect(deleteTrigger).toBeFocused();

  await deleteTrigger.click();
  await deleteDialog.getByRole("button", { name: "Supprimer la semaine" }).click();
  await expect(page.locator(".history-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Aucun historique" })).toBeVisible();
  await expect.poll(() => page.evaluate((planId) => Object.hasOwn(
    JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").actualSpend ?? {},
    planId,
  ), archivedPlanId)).toBe(false);

  await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Historique" }).click();
  await expect(page.getByRole("heading", { name: "Aucun historique" })).toBeVisible();
  expect(await page.evaluate((planId) => Object.hasOwn(
    JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").actualSpend ?? {},
    planId,
  ), archivedPlanId)).toBe(false);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("une semaine archivée s’ouvre et peut être reprise", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  const firstWeekTitle = await page.locator(".meal-card__main strong").first().innerText();

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Créer une autre semaine" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Historique" }).click();
  const archived = page.locator(".history-card").first();
  await expect(archived).toBeVisible();
  await archived.locator(".history-card__open").click();

  await expect(page.getByTestId("history-plan-view")).toBeVisible();
  await expect(page.getByText(firstWeekTitle).first()).toBeVisible();
  await expect(page.getByTestId("replay-plan")).toBeVisible();

  await page.getByTestId("replay-plan").click();
  await expect(page.getByTestId("week-view")).toBeVisible();
  await expect(page.getByTestId("week-progress")).toContainText("0 sur 14 repas cuisinés");
  await expect(page.locator(".meal-card__main strong").first()).toHaveText(firstWeekTitle);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("le catalogue expose les recettes uniques relues et leurs précautions", async ({ page }) => {
  await openFreshApp(page);

  // The production bundle split and absence of catalogue preload are checked
  // by validate-build-split.mjs. Vite may eagerly fetch dynamic modules in dev.
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();

  await expect(page.getByText("624 recettes uniques disponibles")).toBeVisible();
  await expect(page.getByText("624 résultats")).toBeVisible();

  await page.getByPlaceholder("Recette ou ingrédient").fill("wakame");
  await expect(page.getByText("1 résultat", { exact: true })).toBeVisible();
  const misoCard = page.getByRole("button", { name: /Soupe miso au wakame/ });
  await expect(misoCard.locator("img")).toHaveAttribute("src", /soupe-miso-wakame-shiitake\.jpg$/);
  await misoCard.click();

  await expect(page.getByRole("heading", { name: "Soupe miso au wakame, shiitakés et tofu" })).toBeVisible();
  await expect(page.getByText("Validée avec repères")).toBeVisible();
  await expect(page.getByText(/sodium et d'iode/)).toBeVisible();
  await expect(page.getByText(/ne garantit pas un bénéfice clinique individuel/)).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("le catalogue explique qu'un ingrédient facultatif reste hors des courses", async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();
  await page.getByPlaceholder("Recette ou ingrédient").fill("Pudding de chia à la grenade");
  await page.getByRole("button", { name: /Pudding de chia à la grenade/ }).click();

  const optionalIngredient = page.locator(".ingredient-list li", { hasText: "miel de thym ou sirop d'agave" });
  await expect(optionalIngredient).toContainText("Facultatif · non ajouté aux courses");
  await expect(page.getByText(/Le coût affiché conserve l’estimation prudente/)).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("une recette du catalogue peut être enregistrée en favori", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();
  await page.getByPlaceholder("Recette ou ingrédient").fill("wakame");
  await page.getByRole("button", { name: /Soupe miso au wakame/ }).click();

  const favoriteButton = page.getByTestId("catalogue-favorite");
  await expect(favoriteButton).toHaveAttribute("aria-pressed", "false");
  await favoriteButton.click();
  await expect(favoriteButton).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("tab", { name: "Favoris" }).click();
  const saved = page.getByRole("button", { name: /Soupe miso au wakame/ });
  await expect(saved).toBeVisible();

  await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.getByRole("button", { name: /Soupe miso au wakame/ })).toBeVisible();

  await page.getByRole("button", { name: /Soupe miso au wakame/ }).click();
  await expect(page.getByRole("heading", { name: "Soupe miso au wakame, shiitakés et tofu" })).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les desserts Ninja CREAMi affichent leur programme et leur congélation sans être planifiables", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();
  await page.getByPlaceholder("Recette ou ingrédient").fill("Ninja CREAMi Deluxe");
  await expect(page.getByText("80 résultats")).toBeVisible();

  await page.getByRole("button", { name: /Crème glacée cajou, lucuma et éclats de cacao/ }).click();
  await expect(page.getByRole("heading", { name: "Crème glacée cajou, lucuma et éclats de cacao" })).toBeVisible();
  await expect(page.getByTestId("catalogue-equipment")).toContainText("Ninja CREAMi Deluxe (NC501EU)");
  await expect(page.getByTestId("catalogue-equipment")).toContainText("Programme ICE CREAM · Zone FULL");
  await expect(page.getByText("Congélation", { exact: true })).toBeVisible();
  await expect(page.getByText("1 j", { exact: true })).toBeVisible();
  await expect(page.getByTestId("planner-exclusion")).toContainText("Hors menus hebdomadaires");
  await expect(page.getByTestId("catalogue-plan")).toHaveCount(0);
  await expect(page.getByText(/fruits à coque/i).first()).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("les temps passifs sont séparés du temps de préparation", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();

  const search = page.getByPlaceholder("Recette ou ingrédient");
  await search.fill("Infusion glacée thé vert");
  const infusionCard = page.getByRole("button", { name: /Infusion glacée thé vert, menthe et citron/ });
  await expect(infusionCard).toContainText("5 min de préparation · 8 h d’infusion");
  await infusionCard.click();

  const infusionDurations = page.getByRole("region", { name: "Durées de la recette" });
  await expect(infusionDurations).toContainText("Préparation5 min");
  await expect(infusionDurations).toContainText("Infusion8 h");
  await expect(infusionDurations).toContainText("Total8 h 5 min");

  await page.getByRole("button", { name: "Retour" }).click();
  await search.fill("Chou rouge lacto-fermenté");
  const fermentedCard = page.getByRole("button", { name: /Chou rouge lacto-fermenté au gingembre/ });
  await expect(fermentedCard).toContainText("30 min de préparation · 7 j de fermentation");
  await fermentedCard.click();

  const fermentedDurations = page.getByRole("region", { name: "Durées de la recette" });
  await expect(fermentedDurations).toContainText("Préparation30 min");
  await expect(fermentedDurations).toContainText("Fermentation7 j");
  await expect(fermentedDurations).toContainText("Total7 j 30 min");
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("la vue semaine entière et les sessions de cuisine résument le menu", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);

  await page.getByTestId("layout-week").click();
  await expect(page.getByTestId("week-overview")).toBeVisible();
  await expect(page.locator(".week-overview__day")).toHaveCount(7);
  await expect(page.locator(".week-overview__meal")).toHaveCount(14);

  await expect(page.getByTestId("cooking-plan")).toContainText("Ce qu’il y a à cuisiner");
  await page.locator(".week-overview__heading").nth(2).click();
  await expect(page.getByTestId("week-overview")).toHaveCount(0);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("un repas peut être échangé, sorti du foyer, puis remis au menu", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  await page.locator(".day-card").first().click();
  const firstCard = page.locator(".meal-card").first();
  const original = await firstCard.locator(".meal-card__main strong").innerText();

  await firstCard.getByTestId(/^meal-actions-/).click();
  await page.getByTestId("action-swap").click();
  await expect(page.getByTestId("swap-view")).toBeVisible();
  await page.locator(".plan-slot").first().click();
  await expect(page.locator(".meal-card").first().locator(".meal-card__main strong")).not.toHaveText(original);

  const cost = await page.locator(".week-summary div").nth(1).innerText();
  await page.locator(".meal-card").first().getByTestId(/^meal-actions-/).click();
  await page.getByTestId("action-skip").click();
  await expect(page.locator(".meal-card").first()).toHaveAttribute("data-skipped", "true");
  await expect(page.locator(".meal-card").first()).toContainText("Hors foyer");
  expect(await page.locator(".week-summary div").nth(1).innerText()).not.toBe(cost);

  await page.locator(".meal-card").first().getByTestId(/^meal-actions-/).click();
  await page.getByTestId("action-skip").click();
  await expect(page.locator(".meal-card").first()).toHaveAttribute("data-skipped", "false");
  expect(await page.locator(".week-summary div").nth(1).innerText()).toBe(cost);
});

test("la semaine prochaine se prépare sans toucher à la semaine en cours", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  const currentFirst = await page.locator(".meal-card__main strong").first().innerText();

  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Créer une autre semaine" }).click();
  await page.getByTestId("target-upcoming").click();
  await expect(page.getByTestId("upcoming-help")).toBeVisible();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await expect(page.getByRole("heading", { name: "Semaine prochaine prête" })).toBeVisible();
  await page.getByRole("button", { name: "Revenir à l’accueil" }).click();

  await expect(page.getByTestId("upcoming-banner")).toContainText("déjà préparée");
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await expect(page.locator(".meal-card__main strong").first()).toHaveText(currentFirst);
});

test("le catalogue se filtre et se trie", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();
  await expect(page.getByText("624 résultats")).toBeVisible();

  await page.getByTestId("catalogue-filters-open").click();
  await page.getByTestId("filter-time-15").click();
  await page.getByTestId("filter-plannable").click();
  await page.getByRole("button", { name: /^Voir \d+ recettes?$/ }).click();

  const filtered = await page.getByTestId("catalogue-filters-open").innerText();
  expect(filtered).toContain("(2)");
  await expect(page.getByText("624 résultats")).toHaveCount(0);

  await page.getByTestId("catalogue-sort").selectOption("time");
  await expect(page.locator(".catalogue-card").first()).toBeVisible();

  await page.getByTestId("catalogue-filters-open").click();
  await page.getByTestId("catalogue-filters-reset").click();
  await page.getByRole("button", { name: /^Voir \d+ recettes?$/ }).click();
  await expect(page.getByText("624 résultats")).toBeVisible();
});

test("une recette se note, s’annote et se duplique", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  await page.locator(".meal-card__main").first().click();
  const title = await page.locator(".recipe-content h1").innerText();

  await page.getByTestId("rating-meh").click();
  await expect(page.getByTestId("rating-meh")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("recipe-note-input").fill("Moitié moins de sel");

  await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  await page.locator(".meal-card__main").first().click();
  await expect(page.getByTestId("recipe-note-input")).toHaveValue("Moitié moins de sel");
  await expect(page.getByTestId("rating-meh")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("duplicate-recipe").click();
  await expect(page.getByTestId("custom-recipe-view")).toBeVisible();
  await page.getByTestId("custom-title").fill("Ma recette du dimanche");
  await page.getByTestId("custom-save").click();
  await expect(page.getByTestId("flow-current").locator(".recipe-content h1")).toHaveText("Ma recette du dimanche");
  expect(title.length).toBeGreaterThan(0);
});

test("une recette personnelle reste retrouvable, modifiable et ne se supprime qu’après confirmation", async ({ page }) => {
  await openFreshApp(page);
  await generateWeek(page);
  await page.locator(".meal-card__main").first().click();
  await page.getByTestId("duplicate-recipe").click();
  await page.getByTestId("custom-title").fill("Recette personnelle à supprimer");
  await page.getByTestId("custom-save").click();
  await expect(page.getByRole("heading", { name: "Recette personnelle à supprimer" })).toBeVisible();

  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  const personalCard = page.getByRole("button", { name: /Recette personnelle à supprimer/ });
  await expect(personalCard).toBeVisible();
  await personalCard.click();

  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByTestId("rating-meh").click();
  await page.getByTestId("recipe-note-input").fill("Note supprimée avec la recette");
  await page.getByTestId("edit-custom-recipe").click();
  await page.getByTestId("custom-title").fill("Recette personnelle modifiée");
  await page.getByTestId("custom-save").click();
  await expect(page.getByRole("heading", { name: "Recette personnelle modifiée" })).toBeVisible();

  const customRecipeId = await page.evaluate(() => {
    const raw = window.localStorage.getItem("inflamm-menu:app-state");
    return raw ? JSON.parse(raw).customRecipes?.[0]?.id as string | undefined : undefined;
  });
  expect(customRecipeId).toMatch(/^perso-/);

  await page.getByTestId("edit-custom-recipe").click();
  const deleteTrigger = page.getByTestId("custom-delete");
  await deleteTrigger.click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Supprimer cette recette ?" });
  await expect(deleteDialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").customRecipes?.length ?? 0)).toBe(1);
  await expect(deleteDialog.getByRole("button", { name: "Annuler" })).toBeFocused();
  await deleteDialog.getByRole("button", { name: "Annuler" }).click();
  await expect(deleteTrigger).toBeFocused();

  await deleteTrigger.click();
  await page.keyboard.press("Escape");
  await expect(deleteDialog).toHaveCount(0);
  await expect(deleteTrigger).toBeFocused();

  await deleteTrigger.click();
  await deleteDialog.getByRole("button", { name: "Supprimer la recette" }).click();
  await expect(page.getByTestId("favorites-view")).toBeVisible();
  await expect(page.getByRole("button", { name: /Recette personnelle modifiée/ })).toHaveCount(0);
  await expect.poll(() => page.evaluate((recipeId) => {
    const state = JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}");
    return {
      custom: state.customRecipes?.some((recipe: { id: string }) => recipe.id === recipeId),
      favorite: state.favoriteRecipeIds?.includes(recipeId),
      note: Boolean(state.recipeNotes?.[recipeId]),
      disliked: state.profile?.dislikedRecipeIds?.includes(recipeId),
      softDisliked: state.profile?.softDislikedRecipeIds?.includes(recipeId),
    };
  }, customRecipeId)).toEqual({ custom: false, favorite: false, note: false, disliked: false, softDisliked: false });
});

test("modifier une recette personnelle planifiée conserve le contexte du repas", async ({ page }) => {
  await openFreshApp(page);
  await generateWeek(page);
  await page.locator(".meal-card__main").first().click();
  await page.getByTestId("duplicate-recipe").click();
  await page.getByTestId("custom-title").fill("Recette personnelle planifiée");
  await page.getByTestId("custom-save").click();
  await page.getByTestId("plan-recipe").click();
  await expect(page.getByTestId("plan-slot-view")).toBeVisible();
  await page.locator('button[data-testid^="plan-slot-"]:not([disabled])').first().click();

  await expect(page.getByTestId("week-view")).toBeVisible();
  await page.getByTestId("layout-week").click();
  const plannedRecipe = page.locator(".week-overview__meal").filter({ hasText: "Recette personnelle planifiée" });
  await expect(plannedRecipe).toHaveCount(1);
  await plannedRecipe.click();
  const portionsBefore = await page.getByTestId("recipe-portions").innerText();
  await expect(page.locator(".recipe-actions").getByRole("button", { name: "Remplacer", exact: true })).toBeVisible();

  await page.getByTestId("edit-custom-recipe").click();
  await page.getByTestId("custom-title").fill("Recette personnelle planifiée modifiée");
  await page.getByTestId("custom-save").click();
  await expect(page.getByRole("heading", { name: "Recette personnelle planifiée modifiée" })).toBeVisible();
  await expect(page.getByTestId("recipe-portions")).toHaveText(portionsBefore);
  await expect(page.locator(".recipe-actions").getByRole("button", { name: "Remplacer", exact: true })).toBeVisible();

  await page.getByTestId("edit-custom-recipe").click();
  await page.getByTestId("custom-delete").click();
  await page.getByRole("alertdialog", { name: "Supprimer cette recette ?" }).getByRole("button", { name: "Supprimer la recette" }).click();
  await expect(page.getByRole("alert")).toContainText("Cette recette est encore utilisée dans une semaine");
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("inflamm-menu:app-state") ?? "{}").customRecipes?.length ?? 0)).toBe(1);
});

test("le garde-manger déduit les quantités et le budget réel se saisit", async ({ page }) => {
  // Keep this shopping-list fixture stable across seasons and CI timings.
  await page.clock.setFixedTime(new Date("2026-08-10T12:00:00Z"));
  await openFreshApp(page);

  await generateWeek(page);
  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await page.getByRole("button", { name: "Retirer ce que j’ai déjà" }).click();

  const firstItem = page.locator(".shopping-item").first();
  const itemCount = await page.locator(".shopping-item").count();
  const amountInput = firstItem.getByTestId(/^pantry-amount-/);
  // Cover the full requirement: a one-unit deduction can legitimately leave
  // the rounded purchase advice unchanged (for example, still "1 botte").
  await amountInput.fill("99999");
  await expect(page.locator(".shopping-item")).toHaveCount(itemCount - 1);

  await page.getByTestId("spend-input").fill("72,50");
  await expect(page.getByTestId("spend-tracker")).toContainText("72,50 € dépensés");
  await expect(page.locator(".spend-delta")).toBeVisible();

  const firstAisle = await page.locator(".shopping-group h2").first().innerText();
  await page.locator(".aisle-order button").nth(1).click();
  await expect(page.locator(".shopping-group h2").first()).not.toHaveText(firstAisle);
});

test("le premier lancement met le profil avant la première génération", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("onboarding-view")).toBeVisible();
  await expect(page.getByTestId("onboarding-view")).toContainText("allergies");

  await page.getByTestId("onboarding-profile").click();
  await expect(page.getByRole("heading", { name: "Mon profil alimentaire" })).toBeVisible();
  await page.getByRole("button", { name: "Gluten", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();

  await expect(page.getByTestId("home-view")).toBeVisible();
  await expect(page.getByTestId("onboarding-view")).toHaveCount(0);

  await page.waitForTimeout(100);
  await page.reload();
  await expect(page.getByTestId("home-view")).toBeVisible();
});

test("la taille du texte est réglable et persiste", async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await expect(page.getByTestId("comfort-card")).toBeVisible();
  const sample = page.getByTestId("comfort-card").locator("p").first();
  const normalSize = await sample.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(normalSize).toBeGreaterThanOrEqual(12);

  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const browserScaledSize = await sample.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(browserScaledSize).toBeGreaterThanOrEqual(normalSize * 2 - 0.1);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

  await page.getByTestId("text-scale-large").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-text-scale", "large");
  const largeSize = await sample.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(largeSize).toBeGreaterThanOrEqual(14);
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));

  await page.waitForTimeout(100);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-text-scale", "large");
});

test("la semaine s’exporte au format calendrier", async ({ page }) => {
  await openFreshApp(page);

  await generateWeek(page);
  const download = page.waitForEvent("download");
  await page.getByTestId("export-calendar").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^inflamm-menu-\d{4}-\d{2}-\d{2}\.ics$/);
});


test("une recette personnelle favorite conserve les allergènes de ses ingrédients après rechargement", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify({
      version: 2,
      profile: {},
      currentPlan: null,
      upcomingPlan: null,
      favoriteRecipeIds: ["perso-allergene"],
      history: [],
      checkedShoppingItemIds: [],
      pantryIngredientIds: [],
      customRecipes: [{
        id: "perso-allergene",
        title: "Recette test allergène",
        mealTypes: ["lunch"],
        diet: ["classic", "vegetarian", "no-pork"],
        prepMinutes: 10,
        costPerPortion: 2,
        seasons: ["all-year"],
        equipment: [],
        allergens: [],
        tags: ["test"],
        ingredients: [{ id: "milk", name: "Lait", quantity: 100, unit: "ml", category: "fresh", allergens: ["lait"] }],
        nutrition: { calories: 100, protein: 4, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
        description: "Une recette de test.",
        steps: Array.from({ length: 20 }, (_, index) => `Étape ${index + 1}`),
        conservation: "À consommer rapidement.",
        image: "/assets/recipe-placeholder.svg",
      }],
      onboardingCompleted: true,
    }));
  });

  await openFreshApp(page);
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("button", { name: /Recette test allergène/ }).click();
  await expect(page.getByText("Lait", { exact: true })).toBeVisible();
  await page.getByTestId("start-cooking").click();
  await expect(page.getByTestId("cooking-view")).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));

  await page.reload();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.getByRole("button", { name: /Recette test allergène/ })).toBeVisible();
});


test("un réglage de confort ne détruit pas le brouillon du profil", async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByLabel("Votre prénom").fill("Brouillon non enregistré");
  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();
  await page.getByTestId("text-scale-large").click();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByLabel("Votre prénom")).toHaveValue("Brouillon non enregistré");
});


test("la génération reprend les objectifs configurés sans promettre un plafond budgétaire", async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByRole("button", { name: "Plus de repas avec légumineuses" }).click();
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await page.getByRole("button", { name: "Générer ma semaine" }).click();
  await expect(page.getByText("3 repas avec légumineuses visés")).toBeVisible();
  await expect(page.getByText("80 € visés")).toBeVisible();
  await expect(page.getByText(/€ max\./)).toHaveCount(0);
});
