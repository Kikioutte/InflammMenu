import {
  DEFAULT_PROFILE,
  type IngredientCategory,
  type PantryAmount,
  type PlannedMeal,
  type Recipe,
  type UserProfile,
  type WeeklyPlan,
} from "./domain.ts";
import { canonicalIngredientId, legacyShoppingItemKeyToCanonical } from "./shopping.ts";

export const APP_STATE_VERSION = 2 as const;

export interface AppState {
  version: typeof APP_STATE_VERSION;
  profile: UserProfile;
  currentPlan: WeeklyPlan | null;
  /** Week prepared in advance; it becomes current once its Monday arrives. */
  upcomingPlan: WeeklyPlan | null;
  favoriteRecipeIds: string[];
  history: WeeklyPlan[];
  checkedShoppingItemIds: string[];
  pantryIngredientIds: string[];
  /** Quantities already at home, deducted from the shopping list. */
  pantryAmounts: Record<string, PantryAmount>;
  /** Free-form notes written by the user, per recipe. */
  recipeNotes: Record<string, string>;
  /** Aisle order matching the user's own shop. */
  shoppingCategoryOrder: IngredientCategory[];
  /** What each archived or current week actually cost, keyed by plan id. */
  actualSpend: Record<string, number>;
  /** Recipes created or adapted by the user. */
  customRecipes: Recipe[];
  textScale: "normal" | "large";
  remindersEnabled: boolean;
  onboardingCompleted: boolean;
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
/** Archived weeks kept on the device; the oldest are dropped beyond this. */
export const HISTORY_LIMIT = 12;

/**
 * No recipe is favourited on the user's behalf: a favourite must be a choice,
 * not a preset. It also feeds the generator, so presets would bias the menus.
 */
const DEFAULT_FAVORITES: string[] = [];

export const DEFAULT_CATEGORY_ORDER: IngredientCategory[] = [
  "fruit-vegetable",
  "grocery",
  "fresh",
  "meat-fish",
  "frozen",
  "bakery",
  "beverage",
];

export const DEFAULT_APP_STATE: AppState = createState({
  profile: DEFAULT_PROFILE,
  currentPlan: null,
  upcomingPlan: null,
  favoriteRecipeIds: DEFAULT_FAVORITES,
  history: [],
  checkedShoppingItemIds: [],
  pantryIngredientIds: [],
  pantryAmounts: {},
  recipeNotes: {},
  shoppingCategoryOrder: DEFAULT_CATEGORY_ORDER,
  actualSpend: {},
  customRecipes: [],
  textScale: "normal",
  remindersEnabled: false,
  onboardingCompleted: false,
});

type StateInput = Pick<
  AppState,
  | "profile"
  | "currentPlan"
  | "upcomingPlan"
  | "favoriteRecipeIds"
  | "history"
  | "checkedShoppingItemIds"
  | "pantryIngredientIds"
  | "pantryAmounts"
  | "recipeNotes"
  | "shoppingCategoryOrder"
  | "actualSpend"
  | "customRecipes"
  | "textScale"
  | "remindersEnabled"
  | "onboardingCompleted"
>;

function createState(input: StateInput): AppState {
  const favoriteRecipeIds = [...input.favoriteRecipeIds];
  const checkedShoppingItemIds = [...input.checkedShoppingItemIds];
  const pantryIngredientIds = [...input.pantryIngredientIds];

  return {
    version: APP_STATE_VERSION,
    profile: { ...input.profile },
    currentPlan: input.currentPlan,
    upcomingPlan: input.upcomingPlan,
    favoriteRecipeIds,
    history: [...input.history],
    checkedShoppingItemIds,
    pantryIngredientIds,
    pantryAmounts: { ...input.pantryAmounts },
    recipeNotes: { ...input.recipeNotes },
    shoppingCategoryOrder: [...input.shoppingCategoryOrder],
    actualSpend: { ...input.actualSpend },
    customRecipes: [...input.customRecipes],
    textScale: input.textScale,
    remindersEnabled: input.remindersEnabled,
    onboardingCompleted: input.onboardingCompleted,
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

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);
const MEAL_SOURCES = new Set(["generated", "replacement", "manual"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(finiteNumber(value, fallback))));
}

function normalizeMeal(value: unknown): PlannedMeal | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.recipeId !== "string" || !value.recipeId) return null;
  if (typeof value.mealType !== "string" || !MEAL_TYPES.has(value.mealType)) return null;
  const dayIndex = finiteNumber(value.dayIndex, -1);
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;

  return {
    id: value.id,
    dayIndex: dayIndex as PlannedMeal["dayIndex"],
    mealType: value.mealType as PlannedMeal["mealType"],
    recipeId: value.recipeId,
    portions: Math.min(8, Math.max(1, Math.round(finiteNumber(value.portions, 1)))),
    source: (typeof value.source === "string" && MEAL_SOURCES.has(value.source)
      ? value.source
      : "generated") as PlannedMeal["source"],
    ...(value.completed === true ? { completed: true } : {}),
    ...(value.locked === true ? { locked: true } : {}),
    ...(typeof value.leftoverOf === "string" && value.leftoverOf ? { leftoverOf: value.leftoverOf } : {}),
    ...(value.skipped === true ? { skipped: true } : {}),
  };
}

/**
 * A stored plan is untrusted input: it can come from a hand-edited backup file
 * or from an interrupted write. Anything that would make the app throw while
 * rendering is rejected here rather than crashing the whole screen.
 */
export function normalizePlan(value: unknown): WeeklyPlan | null {
  if (!isRecord(value)) return null;
  if (typeof value.startsOn !== "string" || !ISO_DATE.test(value.startsOn)) return null;
  if (Number.isNaN(new Date(`${value.startsOn}T00:00:00`).getTime())) return null;
  if (!Array.isArray(value.meals)) return null;

  const meals = value.meals.map(normalizeMeal).filter((meal): meal is PlannedMeal => Boolean(meal));
  // A plan whose meals were all rejected is not a plan any more.
  if (!meals.length) return null;
  const known = new Set(meals.map((meal) => meal.id));

  return {
    id: typeof value.id === "string" && value.id ? value.id : `week-${value.startsOn}`,
    startsOn: value.startsOn,
    generatedAt:
      typeof value.generatedAt === "string" && !Number.isNaN(new Date(value.generatedAt).getTime())
        ? value.generatedAt
        : `${value.startsOn}T00:00:00.000Z`,
    profileSnapshot: normalizeProfile(value.profileSnapshot),
    // A leftover pointing at a dropped slot would be an orphan.
    meals: meals.map((meal) => (meal.leftoverOf && !known.has(meal.leftoverOf)
      ? { ...meal, leftoverOf: undefined }
      : meal)),
    estimatedCost: Math.max(0, finiteNumber(value.estimatedCost, 0)),
    version: 1,
  };
}

function planArray(value: unknown): WeeklyPlan[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizePlan).filter((plan): plan is WeeklyPlan => Boolean(plan));
}

const UNITS = new Set(["g", "ml", "piece", "c_soupe", "c_cafe"]);

function normalizePantryAmounts(value: unknown): Record<string, PantryAmount> {
  if (!isRecord(value)) return {};
  const entries: Array<[string, PantryAmount]> = [];
  for (const [rawId, rawAmount] of Object.entries(value)) {
    if (!isRecord(rawAmount)) continue;
    const quantity = finiteNumber(rawAmount.quantity, 0);
    if (quantity <= 0) continue;
    if (typeof rawAmount.unit !== "string" || !UNITS.has(rawAmount.unit)) continue;
    entries.push([canonicalIngredientId(rawId), { quantity, unit: rawAmount.unit as PantryAmount["unit"] }]);
  }
  return Object.fromEntries(entries);
}

function normalizeNotes(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, note]) => typeof note === "string" && note.trim().length > 0)
      .map(([id, note]) => [id, (note as string).slice(0, 2000)]),
  );
}

function normalizeCategoryOrder(value: unknown): IngredientCategory[] {
  const known = new Set(DEFAULT_CATEGORY_ORDER);
  const ordered = Array.isArray(value)
    ? [...new Set(value.filter((item): item is IngredientCategory => typeof item === "string" && known.has(item as IngredientCategory)))]
    : [];
  return [...ordered, ...DEFAULT_CATEGORY_ORDER.filter((category) => !ordered.includes(category))];
}

function normalizeSpend(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      // Reject anything that is not a usable amount before clamping, otherwise
      // a string or a negative value would silently become zero.
      .filter(([, amount]) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0)
      .map(([id, amount]) => [id, Math.min(100_000, amount as number)] as const),
  );
}

function normalizeCustomRecipes(value: unknown): Recipe[] {
  if (!Array.isArray(value)) return [];
  return value.filter((recipe): recipe is Recipe => {
    if (!isRecord(recipe)) return false;
    return (
      typeof recipe.id === "string" && recipe.id.startsWith("perso-") &&
      typeof recipe.title === "string" && recipe.title.trim().length > 0 &&
      Array.isArray(recipe.mealTypes) && recipe.mealTypes.length > 0 &&
      Array.isArray(recipe.ingredients) && Array.isArray(recipe.steps) &&
      typeof recipe.prepMinutes === "number" && Number.isFinite(recipe.prepMinutes) &&
      typeof recipe.costPerPortion === "number" && Number.isFinite(recipe.costPerPortion)
    );
  }).slice(0, 200);
}

function normalizeWeeklyTargets(value: unknown): UserProfile["weeklyTargets"] {
  const source = isRecord(value) ? value : {};
  const clamp = (raw: unknown, fallback: number): number => {
    const parsed = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : fallback;
    return Math.min(7, Math.max(0, parsed));
  };
  return {
    legumeMeals: clamp(source.legumeMeals, DEFAULT_PROFILE.weeklyTargets.legumeMeals),
    fishMeals: clamp(source.fishMeals, DEFAULT_PROFILE.weeklyTargets.fishMeals),
  };
}

function normalizeProfile(value: unknown): UserProfile {
  if (!isRecord(value)) return { ...DEFAULT_PROFILE };

  return {
    ...DEFAULT_PROFILE,
    ...value,
    firstName:
      typeof value.firstName === "string" ? value.firstName.trim().slice(0, 40) : DEFAULT_PROFILE.firstName,
    // typeof NaN and typeof Infinity are both "number": bound the values, do not
    // just check their type, or a hand-edited backup breaks the generator.
    people: boundedNumber(value.people, DEFAULT_PROFILE.people, 1, 12),
    mealsPerDay: value.mealsPerDay === 3 ? 3 : 2,
    weeklyBudget: boundedNumber(value.weeklyBudget, DEFAULT_PROFILE.weeklyBudget, 1, 10_000),
    maxPrepMinutes: boundedNumber(value.maxPrepMinutes, DEFAULT_PROFILE.maxPrepMinutes, 1, 24 * 60),
    allergies: stringArray(value.allergies),
    excludedIngredientIds: [...new Set(stringArray(value.excludedIngredientIds).map(canonicalIngredientId))],
    dislikedRecipeIds: stringArray(value.dislikedRecipeIds),
    softDislikedRecipeIds: stringArray(value.softDislikedRecipeIds),
    weeklyTargets: normalizeWeeklyTargets(value.weeklyTargets),
    equipment: stringArray(value.equipment, DEFAULT_PROFILE.equipment) as UserProfile["equipment"],
    diet:
      value.diet === "vegetarian" || value.diet === "no-pork" ? value.diet : "classic",
  } as UserProfile;
}

/**
 * Migrates the early unversioned prototype shape and validates all collection
 * fields before they are exposed to React.
 */
export function migrateAppState(value: unknown): AppState | null {
  if (!isRecord(value)) return null;

  const favoriteRecipeIds = stringArray(
    Array.isArray(value.favoriteRecipeIds) ? value.favoriteRecipeIds : value.favorites,
    DEFAULT_FAVORITES,
  );
  const checkedShoppingItemIds = [...new Set(stringArray(
    Array.isArray(value.checkedShoppingItemIds)
      ? value.checkedShoppingItemIds
      : value.checkedShoppingIds,
  ).map(legacyShoppingItemKeyToCanonical))];
  const pantryIngredientIds = [...new Set(stringArray(
    Array.isArray(value.pantryIngredientIds) ? value.pantryIngredientIds : value.pantryIds,
  ).map(canonicalIngredientId))];
  const plan = normalizePlan(value.currentPlan) ?? normalizePlan(value.plan);

  return createState({
    profile: normalizeProfile(value.profile),
    currentPlan: plan,
    upcomingPlan: normalizePlan(value.upcomingPlan),
    favoriteRecipeIds,
    history: planArray(value.history).slice(0, HISTORY_LIMIT),
    checkedShoppingItemIds,
    pantryIngredientIds,
    pantryAmounts: normalizePantryAmounts(value.pantryAmounts),
    recipeNotes: normalizeNotes(value.recipeNotes),
    shoppingCategoryOrder: normalizeCategoryOrder(value.shoppingCategoryOrder),
    actualSpend: normalizeSpend(value.actualSpend),
    customRecipes: normalizeCustomRecipes(value.customRecipes),
    textScale: value.textScale === "large" ? "large" : "normal",
    remindersEnabled: value.remindersEnabled === true,
    onboardingCompleted: value.onboardingCompleted === true,
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

export const BACKUP_FORMAT = "inflamm-menu-backup" as const;

export interface AppStateBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof APP_STATE_VERSION;
  exportedAt: string;
  state: AppState;
}

/** Serializes everything the app keeps locally, so it survives a cleared browser. */
export function exportAppState(state: AppState, exportedAt = new Date().toISOString()): string {
  const backup: AppStateBackup = {
    format: BACKUP_FORMAT,
    version: APP_STATE_VERSION,
    exportedAt,
    state: migrateAppState(state) ?? cloneDefaultState(),
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/**
 * Reads a backup file. Older exports and raw state dumps are accepted, but the
 * content always goes through the same migration and validation as stored data.
 */
export function importAppState(raw: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Fichier illisible : ce n’est pas une sauvegarde Inflamm’Menu.");
  }

  if (!isRecord(parsed)) throw new Error("Fichier illisible : ce n’est pas une sauvegarde Inflamm’Menu.");
  const candidate = isRecord(parsed.state) ? parsed.state : parsed;
  if (parsed.format !== undefined && parsed.format !== BACKUP_FORMAT) {
    throw new Error("Ce fichier ne provient pas d’Inflamm’Menu.");
  }

  const migrated = migrateAppState(candidate);
  if (!migrated) throw new Error("Sauvegarde incomplète : aucune donnée exploitable.");
  return migrated;
}

/**
 * Watches for a newer service worker taking over. The worker calls skipWaiting
 * and claims clients, so an open page can end up running code whose chunks the
 * new cache no longer serves: the user must be offered a reload.
 */
export function watchForAppUpdate(onUpdateReady: () => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => undefined;

  let cancelled = false;
  let pageWasControlled = Boolean(navigator.serviceWorker.controller);
  const notify = () => { if (!cancelled) onUpdateReady(); };
  const handleControllerChange = () => {
    // The first controller acquired after installation is the initial offline
    // worker, not an application update. Later controller changes are updates.
    if (pageWasControlled) notify();
    pageWasControlled = true;
  };
  const trackInstalling = (registration: ServiceWorkerRegistration) => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      // Only a page already controlled by a worker can go stale.
      if (installing.state === "installed" && navigator.serviceWorker.controller) notify();
    });
  };

  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  void navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration || cancelled) return;
    if (registration.waiting && navigator.serviceWorker.controller) notify();
    trackInstalling(registration);
    registration.addEventListener("updatefound", () => trackInstalling(registration));
  }).catch(() => undefined);

  return () => {
    cancelled = true;
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  };
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
