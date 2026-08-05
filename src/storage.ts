import { DEFAULT_PROFILE, type UserProfile, type WeeklyPlan } from "./domain";

export const APP_STATE_VERSION = 1 as const;

export interface AppState {
  version: typeof APP_STATE_VERSION;
  profile: UserProfile;
  currentPlan: WeeklyPlan | null;
  favoriteRecipeIds: string[];
  history: WeeklyPlan[];
  checkedShoppingItemIds: string[];
  pantryIngredientIds: string[];
  /** @deprecated Use favoriteRecipeIds. Kept for version-0 data compatibility. */
  favorites: string[];
  /** @deprecated Use checkedShoppingItemIds. Kept for version-0 data compatibility. */
  checkedShoppingIds: string[];
  /** @deprecated Use pantryIngredientIds. Kept for version-0 data compatibility. */
  pantryIds: string[];
}

const DATABASE_NAME = "inflamm-menu";
const DATABASE_VERSION = 1;
const STORE_NAME = "app-state";
const STATE_KEY = "current";
const LOCAL_STORAGE_KEY = "inflamm-menu:app-state";

const DEFAULT_FAVORITES = [
  "salade-lentilles-noix",
  "saumon-brocoli-riz-complet",
  "bowl-quinoa-legumes-houmous",
];

export const DEFAULT_APP_STATE: AppState = createState({
  profile: DEFAULT_PROFILE,
  currentPlan: null,
  favoriteRecipeIds: DEFAULT_FAVORITES,
  history: [],
  checkedShoppingItemIds: [],
  pantryIngredientIds: [],
});

type StateInput = Pick<
  AppState,
  | "profile"
  | "currentPlan"
  | "favoriteRecipeIds"
  | "history"
  | "checkedShoppingItemIds"
  | "pantryIngredientIds"
>;

function createState(input: StateInput): AppState {
  const favoriteRecipeIds = [...input.favoriteRecipeIds];
  const checkedShoppingItemIds = [...input.checkedShoppingItemIds];
  const pantryIngredientIds = [...input.pantryIngredientIds];

  return {
    version: APP_STATE_VERSION,
    profile: { ...input.profile },
    currentPlan: input.currentPlan,
    favoriteRecipeIds,
    history: [...input.history],
    checkedShoppingItemIds,
    pantryIngredientIds,
    favorites: [...favoriteRecipeIds],
    checkedShoppingIds: [...checkedShoppingItemIds],
    pantryIds: [...pantryIngredientIds],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, fallback: readonly string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function planArray(value: unknown): WeeklyPlan[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as unknown as WeeklyPlan[];
}

function normalizeProfile(value: unknown): UserProfile {
  if (!isRecord(value)) return { ...DEFAULT_PROFILE };

  return {
    ...DEFAULT_PROFILE,
    ...value,
    firstName:
      typeof value.firstName === "string" ? value.firstName.trim().slice(0, 40) : DEFAULT_PROFILE.firstName,
    people: typeof value.people === "number" ? value.people : DEFAULT_PROFILE.people,
    mealsPerDay: value.mealsPerDay === 3 ? 3 : 2,
    weeklyBudget:
      typeof value.weeklyBudget === "number" ? value.weeklyBudget : DEFAULT_PROFILE.weeklyBudget,
    maxPrepMinutes:
      typeof value.maxPrepMinutes === "number"
        ? value.maxPrepMinutes
        : DEFAULT_PROFILE.maxPrepMinutes,
    allergies: stringArray(value.allergies),
    excludedIngredientIds: stringArray(value.excludedIngredientIds),
    equipment: stringArray(value.equipment, DEFAULT_PROFILE.equipment) as UserProfile["equipment"],
    diet:
      value.diet === "vegetarian" || value.diet === "no-pork" ? value.diet : "classic",
  } as UserProfile;
}

/**
 * Migrates the early unversioned prototype shape and validates all collection
 * fields before they are exposed to React.
 */
function migrateAppState(value: unknown): AppState | null {
  if (!isRecord(value)) return null;

  const favoriteRecipeIds = stringArray(
    Array.isArray(value.favoriteRecipeIds) ? value.favoriteRecipeIds : value.favorites,
    DEFAULT_FAVORITES,
  );
  const checkedShoppingItemIds = stringArray(
    Array.isArray(value.checkedShoppingItemIds)
      ? value.checkedShoppingItemIds
      : value.checkedShoppingIds,
  );
  const pantryIngredientIds = stringArray(
    Array.isArray(value.pantryIngredientIds) ? value.pantryIngredientIds : value.pantryIds,
  );
  const plan = isRecord(value.currentPlan)
    ? (value.currentPlan as unknown as WeeklyPlan)
    : isRecord(value.plan)
      ? (value.plan as unknown as WeeklyPlan)
      : null;

  return createState({
    profile: normalizeProfile(value.profile),
    currentPlan: plan,
    favoriteRecipeIds,
    history: planArray(value.history),
    checkedShoppingItemIds,
    pantryIngredientIds,
  });
}

function cloneDefaultState(): AppState {
  return createState(DEFAULT_APP_STATE);
}

function localStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readLocalState(): AppState | null {
  if (!localStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? migrateAppState(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeLocalState(state: AppState): boolean {
  if (!localStorageAvailable()) return false;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function removeLocalState(): boolean {
  if (!localStorageAvailable()) return false;
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked"));
  });
}

async function readIndexedState(): Promise<AppState | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(migrateAppState(request.result));
      request.onerror = () => reject(request.error ?? new Error("Unable to read IndexedDB"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB read aborted"));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedState(state: AppState): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save IndexedDB"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
    });
  } finally {
    database.close();
  }
}

async function removeIndexedState(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to reset IndexedDB"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB reset aborted"));
    });
  } finally {
    database.close();
  }
}

export async function loadAppState(): Promise<AppState> {
  try {
    const indexedState = await readIndexedState();
    if (indexedState) {
      writeLocalState(indexedState);
      return indexedState;
    }
  } catch {
    // Safari private mode and embedded browsers can expose IndexedDB but reject operations.
  }

  const localState = readLocalState();
  if (localState) return localState;
  return cloneDefaultState();
}

export async function saveAppState(state: AppState): Promise<void> {
  const normalized = migrateAppState(state) ?? cloneDefaultState();
  const localSaved = writeLocalState(normalized);
  try {
    await writeIndexedState(normalized);
  } catch (error) {
    if (!localSaved) throw error;
  }
}

export async function resetAppState(): Promise<void> {
  const localReset = removeLocalState();
  try {
    await removeIndexedState();
  } catch (error) {
    if (!localReset) throw error;
  }
}

export async function registerOfflineSupport(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!window.isSecureContext && !isLocalhost) return null;

  try {
    if (document.readyState === "loading") {
      await new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
    }
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: "none",
    });
  } catch {
    return null;
  }
}
