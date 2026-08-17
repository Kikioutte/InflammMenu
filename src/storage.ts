import {
  DEFAULT_PROFILE,
  type DayConstraint,
  type IngredientCategory,
  type MealType,
  type PantryAmount,
  type PlannedMeal,
  type Recipe,
  type UserProfile,
  type WeeklyPlan,
} from "./domain.ts";
import { canonicalIngredientId, legacyShoppingItemKeyToCanonical, shoppingIdentityFor } from "./shopping.ts";
import { substitutionRuleAppliesToIngredientId, substitutionRuleById } from "./substitutions.ts";

export const APP_STATE_VERSION = 3 as const;

export const APP_STATE_DATA_KEYS = [
  "profile",
  "currentPlan",
  "upcomingPlan",
  "favoriteRecipeIds",
  "history",
  "checkedShoppingItemIds",
  "pantryIngredientIds",
  "pantryAmounts",
  "recipeNotes",
  "shoppingCategoryOrder",
  "actualSpend",
  "customRecipes",
  "textScale",
  "remindersEnabled",
  "onboardingCompleted",
] as const;

export type AppStateDataKey = typeof APP_STATE_DATA_KEYS[number];
export type AppStateFieldRevisions = Record<AppStateDataKey, number>;

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
  /** Monotonic local revision used to choose the newest replica and synchronise tabs. */
  stateRevision: number;
  /** Per-field clocks let concurrent tabs merge unrelated edits instead of overwriting them. */
  fieldRevisions: AppStateFieldRevisions;
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
  stateRevision: 0,
  fieldRevisions: Object.fromEntries(APP_STATE_DATA_KEYS.map((key) => [key, 0])) as AppStateFieldRevisions,
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
> & { stateRevision?: number; fieldRevisions?: Partial<AppStateFieldRevisions> };

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
    stateRevision: Math.max(0, Math.floor(input.stateRevision ?? 0)),
    fieldRevisions: normalizeFieldRevisions(input.fieldRevisions, input.stateRevision),
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

  const substitutions = Array.isArray(value.substitutions)
    ? [...new Map(value.substitutions.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.ingredientId !== "string" || typeof entry.substitutionId !== "string") return [];
      const ingredientId = canonicalIngredientId(entry.ingredientId);
      const rule = substitutionRuleById(entry.substitutionId);
      if (!rule || !substitutionRuleAppliesToIngredientId(rule, ingredientId)) return [];
      return ingredientId ? [[ingredientId, { ingredientId, substitutionId: entry.substitutionId }] as const] : [];
    })).values()]
    : [];

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
    ...(substitutions.length ? { substitutions } : {}),
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
  const [year, month, day] = value.startsOn.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.toISOString().slice(0, 10) !== value.startsOn || start.getUTCDay() !== 1) return null;
  if (!Array.isArray(value.meals)) return null;

  const meals: PlannedMeal[] = [];
  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const candidate of value.meals) {
    const meal = normalizeMeal(candidate);
    if (!meal) continue;
    const slot = `${meal.dayIndex}-${meal.mealType}`;
    if (ids.has(meal.id) || slots.has(slot)) continue;
    ids.add(meal.id);
    slots.add(slot);
    meals.push(meal);
  }
  if (!meals.length) return null;

  const byId = new Map(meals.map((meal) => [meal.id, meal]));
  const normalizedMeals = meals.map((meal) => {
    if (!meal.leftoverOf) return meal;
    const source = byId.get(meal.leftoverOf);
    const gap = source ? meal.dayIndex - source.dayIndex : 0;
    const valid = Boolean(
      source &&
      source.id !== meal.id &&
      !source.leftoverOf &&
      !source.skipped &&
      !meal.skipped &&
      source.recipeId === meal.recipeId &&
      source.mealType === meal.mealType &&
      gap > 0 && gap <= 2,
    );
    if (valid) return { ...meal, completed: false, locked: false, substitutions: source?.substitutions };
    const { leftoverOf: _discarded, ...withoutLeftover } = meal;
    return withoutLeftover;
  });

  return {
    id: (() => {
      const cleaned = typeof value.id === "string" ? value.id.replace(/[\r\n\u0000-\u001f\u007f]/g, "").trim().slice(0, 180) : "";
      return cleaned || `week-${value.startsOn}`;
    })(),
    startsOn: value.startsOn,
    generatedAt:
      typeof value.generatedAt === "string" && !Number.isNaN(new Date(value.generatedAt).getTime())
        ? new Date(value.generatedAt).toISOString()
        : `${value.startsOn}T00:00:00.000Z`,
    profileSnapshot: normalizeProfile(value.profileSnapshot),
    meals: normalizedMeals,
    estimatedCost: Math.min(100_000, Math.max(0, finiteNumber(value.estimatedCost, 0))),
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
  const amounts = new Map<string, PantryAmount>();
  for (const [rawId, rawAmount] of Object.entries(value)) {
    if (!isRecord(rawAmount)) continue;
    const quantity = finiteNumber(rawAmount.quantity, 0);
    if (quantity <= 0) continue;
    if (typeof rawAmount.unit !== "string" || !UNITS.has(rawAmount.unit)) continue;
    const unit = rawAmount.unit as PantryAmount["unit"];
    const shoppingId = legacyShoppingItemKeyToCanonical(rawId);
    const key = `${shoppingId}:${unit}`;
    const previous = amounts.get(key);
    amounts.set(key, { quantity: (previous?.quantity ?? 0) + quantity, unit });
  }
  return Object.fromEntries(amounts);
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

function cleanUserText(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, maximum)
    : "";
}

const CUSTOM_MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);
const CUSTOM_DIETS = new Set(["classic", "vegetarian", "no-pork"]);
const CUSTOM_SEASONS = new Set(["spring", "summer", "autumn", "winter", "all-year"]);
const CUSTOM_EQUIPMENT = new Set(["hob", "oven", "microwave", "blender", "toaster", "steamer"]);
const CUSTOM_CATEGORIES = new Set(DEFAULT_CATEGORY_ORDER);
const SAFE_RECIPE_IMAGE = /^\/assets\/[a-zA-Z0-9_./-]+$/;

function normalizedEnumArray(value: unknown, allowed: ReadonlySet<string>, maximum = 30): string[] {
  return stringArray(value)
    .map((item) => item.trim())
    .filter((item) => allowed.has(item))
    .slice(0, maximum);
}

function normalizeCustomRecipe(value: unknown): Recipe | null {
  if (!isRecord(value)) return null;
  const id = cleanUserText(value.id, 160);
  const title = cleanUserText(value.title, 90);
  if (!/^perso-[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) || !title) return null;

  const mealTypes = normalizedEnumArray(value.mealTypes, CUSTOM_MEAL_TYPES, 3) as Recipe["mealTypes"];
  const diet = normalizedEnumArray(value.diet, CUSTOM_DIETS, 3) as Recipe["diet"];
  const seasons = normalizedEnumArray(value.seasons, CUSTOM_SEASONS, 5) as Recipe["seasons"];
  const equipment = normalizedEnumArray(value.equipment, CUSTOM_EQUIPMENT, 6) as Recipe["equipment"];
  if (!mealTypes.length || !diet.length || !seasons.length) return null;

  const prepMinutes = finiteNumber(value.prepMinutes, Number.NaN);
  const costPerPortion = finiteNumber(value.costPerPortion, Number.NaN);
  if (!Number.isFinite(prepMinutes) || prepMinutes < 1 || prepMinutes > 1_440) return null;
  if (!Number.isFinite(costPerPortion) || costPerPortion < 0 || costPerPortion > 10_000) return null;
  const restMinutes = value.restMinutes === undefined ? undefined : finiteNumber(value.restMinutes, Number.NaN);
  if (restMinutes !== undefined && (!Number.isFinite(restMinutes) || restMinutes < 0 || restMinutes > 525_600)) return null;

  if (!Array.isArray(value.ingredients) || value.ingredients.length < 1 || value.ingredients.length > 100) return null;
  const ingredients = value.ingredients.flatMap((rawIngredient) => {
    if (!isRecord(rawIngredient)) return [];
    const rawId = cleanUserText(rawIngredient.id, 120);
    const name = cleanUserText(rawIngredient.name, 160);
    const quantity = finiteNumber(rawIngredient.quantity, Number.NaN);
    if (!rawId || !name || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return [];
    if (typeof rawIngredient.unit !== "string" || !UNITS.has(rawIngredient.unit)) return [];
    if (typeof rawIngredient.category !== "string" || !CUSTOM_CATEGORIES.has(rawIngredient.category as IngredientCategory)) return [];
    return [{
      id: canonicalIngredientId(rawId),
      name,
      quantity,
      unit: rawIngredient.unit as Recipe["ingredients"][number]["unit"],
      category: rawIngredient.category as IngredientCategory,
      ...(stringArray(rawIngredient.allergens).length ? { allergens: stringArray(rawIngredient.allergens).slice(0, 14) } : {}),
      ...(rawIngredient.pantryStaple === true ? { pantryStaple: true } : {}),
    }];
  });
  if (ingredients.length !== value.ingredients.length) return null;

  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 100) return null;
  const steps = value.steps.map((step) => cleanUserText(step, 2_000));
  if (steps.some((step) => !step)) return null;

  if (!isRecord(value.nutrition)) return null;
  const calories = finiteNumber(value.nutrition.calories, Number.NaN);
  const protein = finiteNumber(value.nutrition.protein, Number.NaN);
  const fiber = finiteNumber(value.nutrition.fiber, Number.NaN);
  if (![calories, protein, fiber].every((item) => Number.isFinite(item) && item >= 0 && item <= 100_000)) return null;

  const image = cleanUserText(value.image, 500);
  if (image && !SAFE_RECIPE_IMAGE.test(image)) return null;

  return {
    id,
    title,
    mealTypes,
    diet,
    prepMinutes: Math.round(prepMinutes),
    ...(restMinutes !== undefined ? { restMinutes: Math.round(restMinutes) } : {}),
    costPerPortion,
    seasons,
    equipment,
    allergens: stringArray(value.allergens).slice(0, 14),
    tags: stringArray(value.tags).map((tag) => cleanUserText(tag, 80)).filter(Boolean).slice(0, 100),
    ingredients,
    nutrition: {
      calories,
      protein,
      fiber,
      estimated: true,
      note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif.",
    },
    description: cleanUserText(value.description, 2_000),
    ...(cleanUserText(value.caution, 2_000) ? { caution: cleanUserText(value.caution, 2_000) } : {}),
    steps,
    conservation: cleanUserText(value.conservation, 1_000),
    image: image || "/assets/recipe-placeholder.svg",
  };
}

function normalizeCustomRecipes(value: unknown): Recipe[] {
  if (!Array.isArray(value)) return [];
  const recipes: Recipe[] = [];
  const ids = new Set<string>();
  for (const candidate of value.slice(0, 500)) {
    const recipe = normalizeCustomRecipe(candidate);
    if (!recipe || ids.has(recipe.id)) continue;
    ids.add(recipe.id);
    recipes.push(recipe);
    if (recipes.length === 200) break;
  }
  return recipes;
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

function normalizeDayConstraints(value: unknown): DayConstraint[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<number, DayConstraint>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const dayIndex = finiteNumber(item.dayIndex, -1);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) continue;
    const skippedMealTypes = stringArray(item.skippedMealTypes)
      .filter((entry): entry is MealType => MEAL_TYPES.has(entry));
    const maxPrepMinutes = typeof item.maxPrepMinutes === "number" && Number.isFinite(item.maxPrepMinutes)
      ? boundedNumber(item.maxPrepMinutes, DEFAULT_PROFILE.maxPrepMinutes, 1, 24 * 60)
      : undefined;
    const portions = typeof item.portions === "number" && Number.isFinite(item.portions)
      ? boundedNumber(item.portions, DEFAULT_PROFILE.people, 1, 8)
      : undefined;
    const mealPortions = Array.isArray(item.mealPortions)
      ? [...new Map(item.mealPortions.flatMap((entry) => {
          if (!isRecord(entry) || !MEAL_TYPES.has(entry.mealType as MealType)) return [];
          if (typeof entry.portions !== "number" || !Number.isFinite(entry.portions)) return [];
          const mealType = entry.mealType as MealType;
          return [[mealType, { mealType, portions: boundedNumber(entry.portions, DEFAULT_PROFILE.people, 1, 8) }] as const];
        })).values()]
      : [];
    if (maxPrepMinutes === undefined && portions === undefined && mealPortions.length === 0 && skippedMealTypes.length === 0) continue;
    result.set(dayIndex, {
      dayIndex: dayIndex as DayConstraint["dayIndex"],
      ...(maxPrepMinutes === undefined ? {} : { maxPrepMinutes }),
      ...(portions === undefined ? {} : { portions }),
      ...(mealPortions.length === 0 ? {} : { mealPortions }),
      skippedMealTypes,
    });
  }
  return [...result.values()].sort((left, right) => left.dayIndex - right.dayIndex);
}

function normalizeProfile(value: unknown): UserProfile {
  if (!isRecord(value)) return { ...DEFAULT_PROFILE };

  return {
    ...DEFAULT_PROFILE,
    firstName:
      typeof value.firstName === "string" ? value.firstName.trim().slice(0, 40) : DEFAULT_PROFILE.firstName,
    // typeof NaN and typeof Infinity are both "number": bound the values, do not
    // just check their type, or a hand-edited backup breaks the generator.
    people: boundedNumber(value.people, DEFAULT_PROFILE.people, 1, 8),
    mealsPerDay: value.mealsPerDay === 3 ? 3 : 2,
    weeklyBudget: boundedNumber(value.weeklyBudget, DEFAULT_PROFILE.weeklyBudget, 1, 10_000),
    maxPrepMinutes: boundedNumber(value.maxPrepMinutes, DEFAULT_PROFILE.maxPrepMinutes, 1, 24 * 60),
    dayConstraints: normalizeDayConstraints(value.dayConstraints),
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

function normalizeRevision(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizeFieldRevisions(value: unknown, fallbackValue: unknown): AppStateFieldRevisions {
  const fallback = normalizeRevision(fallbackValue);
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(APP_STATE_DATA_KEYS.map((key) => [
    key,
    Object.hasOwn(record, key) ? normalizeRevision(record[key]) : fallback,
  ])) as AppStateFieldRevisions;
}

/**
 * Migrates the early unversioned prototype shape and validates all collection
 * fields before they are exposed to React.
 */
export function migrateAppState(value: unknown): AppState | null {
  if (!isRecord(value)) return null;
  if (typeof value.version === "number" && value.version > APP_STATE_VERSION) return null;

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
  ).map((id) => shoppingIdentityFor(id).shoppingId))];
  const currentPlan = normalizePlan(value.currentPlan) ?? normalizePlan(value.plan);
  const upcomingCandidate = normalizePlan(value.upcomingPlan);
  const upcomingPlan = upcomingCandidate?.id === currentPlan?.id ? null : upcomingCandidate;
  const reserved = new Set([currentPlan?.id, upcomingPlan?.id].filter((id): id is string => Boolean(id)));
  const seenHistory = new Set<string>();
  const history = planArray(value.history).filter((plan) => {
    if (reserved.has(plan.id) || seenHistory.has(plan.id)) return false;
    seenHistory.add(plan.id);
    return true;
  }).slice(0, HISTORY_LIMIT);

  return createState({
    profile: normalizeProfile(value.profile),
    currentPlan,
    upcomingPlan,
    favoriteRecipeIds,
    history,
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
    stateRevision: normalizeRevision(value.stateRevision),
    fieldRevisions: normalizeFieldRevisions(value.fieldRevisions, value.stateRevision),
  });
}

/** Adds one revision to every top-level field changed by a local action. */
export function stampAppStateChanges(current: AppState, candidate: AppState, revision: number): AppState {
  const safeRevision = Math.max(current.stateRevision + 1, normalizeRevision(revision));
  const fieldRevisions = { ...current.fieldRevisions };
  for (const key of APP_STATE_DATA_KEYS) {
    if (!Object.is(candidate[key], current[key])) fieldRevisions[key] = safeRevision;
  }
  return migrateAppState({ ...candidate, stateRevision: safeRevision, fieldRevisions }) ?? cloneDefaultState();
}

/**
 * Merges two local replicas field by field. Unrelated changes made at nearly
 * the same time in two tabs are both kept; edits to the same field use the
 * newest field revision.
 */
export function mergeAppStateReplicas(left: AppState, right: AppState): AppState {
  const rightWins = (key: AppStateDataKey) => {
    const leftRevision = left.fieldRevisions[key];
    const rightRevision = right.fieldRevisions[key];
    if (rightRevision !== leftRevision) return rightRevision > leftRevision;
    const leftValue = JSON.stringify(left[key]) ?? "";
    const rightValue = JSON.stringify(right[key]) ?? "";
    return rightValue > leftValue;
  };
  const anyRightWins = APP_STATE_DATA_KEYS.some(rightWins);
  if (!anyRightWins && right.stateRevision <= left.stateRevision) return left;

  const merged: Record<string, unknown> = { ...left };
  const fieldRevisions = { ...left.fieldRevisions };
  for (const key of APP_STATE_DATA_KEYS) {
    const leftRevision = left.fieldRevisions[key];
    const rightRevision = right.fieldRevisions[key];
    if (rightWins(key)) merged[key] = right[key];
    fieldRevisions[key] = Math.max(leftRevision, rightRevision);
  }
  merged.stateRevision = Math.max(left.stateRevision, right.stateRevision);
  merged.fieldRevisions = fieldRevisions;
  return migrateAppState(merged) ?? left;
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

function freshestState(indexedState: AppState | null, localState: AppState | null): AppState | null {
  if (!indexedState) return localState;
  if (!localState) return indexedState;
  if (localState.stateRevision === indexedState.stateRevision) return localState;
  return mergeAppStateReplicas(indexedState, localState);
}

const STORAGE_CHANNEL = "inflamm-menu:app-state-sync";

function broadcastStoredState(state: AppState): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(STORAGE_CHANNEL);
    channel.postMessage(state);
    channel.close();
  } catch {
    // Storage events still cover browsers without a usable BroadcastChannel.
  }
}

export async function loadAppState(): Promise<AppState> {
  const localState = readLocalState();
  let indexedState: AppState | null = null;
  try {
    indexedState = await readIndexedState();
  } catch {
    // Safari private mode and embedded browsers can expose IndexedDB but reject operations.
  }

  const newest = freshestState(indexedState, localState);
  if (!newest) return cloneDefaultState();
  if (newest === indexedState) writeLocalState(newest);
  else {
    try { await writeIndexedState(newest); } catch { /* localStorage remains the valid replica */ }
  }
  return newest;
}

export interface SaveAppStateResult {
  localSaved: boolean;
  indexedSaved: boolean;
}

export async function saveAppState(state: AppState): Promise<SaveAppStateResult> {
  const normalized = migrateAppState(state) ?? cloneDefaultState();
  const localSaved = writeLocalState(normalized);
  let indexedSaved = false;
  try {
    await writeIndexedState(normalized);
    indexedSaved = true;
  } catch (error) {
    if (!localSaved) throw error;
  }
  if (localSaved || indexedSaved) broadcastStoredState(normalized);
  return { localSaved, indexedSaved };
}

/** Receives the newest state written by another tab without creating a save loop. */
export function watchForStoredState(onState: (state: AppState) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const deliver = (value: unknown) => {
    const state = migrateAppState(value);
    if (state) onState(state);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== LOCAL_STORAGE_KEY || !event.newValue) return;
    try { deliver(JSON.parse(event.newValue) as unknown); } catch { /* ignore malformed external writes */ }
  };
  window.addEventListener("storage", onStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(STORAGE_CHANNEL);
      channel.addEventListener("message", (event) => deliver(event.data));
    } catch {
      channel = null;
    }
  }
  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
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

const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const RECOGNIZED_STATE_KEYS = new Set([
  "version", "profile", "currentPlan", "plan", "upcomingPlan", "favoriteRecipeIds", "favorites",
  "history", "checkedShoppingItemIds", "checkedShoppingIds", "pantryIngredientIds", "pantryIds",
  "pantryAmounts", "recipeNotes", "shoppingCategoryOrder", "actualSpend", "customRecipes",
  "textScale", "remindersEnabled", "onboardingCompleted", "stateRevision", "fieldRevisions",
]);

const CURRENT_BACKUP_KEYS = [
  "profile", "currentPlan", "upcomingPlan", "favoriteRecipeIds", "history",
  "checkedShoppingItemIds", "pantryIngredientIds", "pantryAmounts", "recipeNotes",
  "shoppingCategoryOrder", "actualSpend", "customRecipes", "textScale",
  "remindersEnabled", "onboardingCompleted", "stateRevision",
] as const;

function hasUsableLegacyStateShape(value: Record<string, unknown>): boolean {
  const profile = value.profile;
  if (!isRecord(profile)) return false;
  const profileIsUsable = typeof profile.people === "number"
    && (profile.mealsPerDay === 2 || profile.mealsPerDay === 3)
    && typeof profile.weeklyBudget === "number"
    && typeof profile.maxPrepMinutes === "number"
    && Array.isArray(profile.allergies)
    && typeof profile.diet === "string"
    && Array.isArray(profile.equipment);
  const hasPlanSlot = Object.hasOwn(value, "currentPlan") || Object.hasOwn(value, "plan");
  const hasFavorites = Array.isArray(value.favoriteRecipeIds) || Array.isArray(value.favorites);
  const hasCheckedItems = Array.isArray(value.checkedShoppingItemIds) || Array.isArray(value.checkedShoppingIds);
  const hasPantry = Array.isArray(value.pantryIngredientIds) || Array.isArray(value.pantryIds);
  return profileIsUsable && hasPlanSlot && hasFavorites && Array.isArray(value.history) && hasCheckedItems && hasPantry;
}

function isStrictStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasCompleteCurrentProfileShape(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.weeklyTargets)) return false;
  return typeof value.firstName === "string"
    && typeof value.people === "number" && Number.isFinite(value.people)
    && (value.mealsPerDay === 2 || value.mealsPerDay === 3)
    && typeof value.weeklyBudget === "number" && Number.isFinite(value.weeklyBudget)
    && typeof value.maxPrepMinutes === "number" && Number.isFinite(value.maxPrepMinutes)
    && Array.isArray(value.dayConstraints)
    && isStrictStringArray(value.allergies)
    && isStrictStringArray(value.excludedIngredientIds)
    && isStrictStringArray(value.dislikedRecipeIds)
    && isStrictStringArray(value.softDislikedRecipeIds)
    && typeof value.weeklyTargets.legumeMeals === "number" && Number.isFinite(value.weeklyTargets.legumeMeals)
    && typeof value.weeklyTargets.fishMeals === "number" && Number.isFinite(value.weeklyTargets.fishMeals)
    && (value.diet === "classic" || value.diet === "vegetarian" || value.diet === "no-pork")
    && isStrictStringArray(value.equipment);
}

function hasCompleteCurrentStateShape(value: Record<string, unknown>): boolean {
  const requiredKeysArePresent = CURRENT_BACKUP_KEYS.every((key) => Object.hasOwn(value, key));
  const plansAreValid = (value.currentPlan === null || normalizePlan(value.currentPlan) !== null)
    && (value.upcomingPlan === null || normalizePlan(value.upcomingPlan) !== null)
    && Array.isArray(value.history)
    && value.history.every((plan) => normalizePlan(plan) !== null);
  const collectionsAreValid = isStrictStringArray(value.favoriteRecipeIds)
    && isStrictStringArray(value.checkedShoppingItemIds)
    && isStrictStringArray(value.pantryIngredientIds)
    && isRecord(value.pantryAmounts)
    && isRecord(value.recipeNotes)
    && Array.isArray(value.shoppingCategoryOrder)
    && isRecord(value.actualSpend)
    && Array.isArray(value.customRecipes);
  const preferencesAreValid = (value.textScale === "normal" || value.textScale === "large")
    && typeof value.remindersEnabled === "boolean"
    && typeof value.onboardingCompleted === "boolean"
    && Number.isSafeInteger(value.stateRevision)
    && Number(value.stateRevision) >= 0;
  return requiredKeysArePresent
    && hasCompleteCurrentProfileShape(value.profile)
    && plansAreValid
    && collectionsAreValid
    && preferencesAreValid;
}

function assertCompleteImport(candidate: Record<string, unknown>, backupVersion?: number): void {
  const candidateVersion = typeof candidate.version === "number" ? candidate.version : undefined;
  const mustUseCurrentShape = backupVersion === APP_STATE_VERSION || candidateVersion === APP_STATE_VERSION;
  const completeEnough = mustUseCurrentShape
    ? hasCompleteCurrentStateShape(candidate)
    : hasUsableLegacyStateShape(candidate);
  if (!completeEnough) {
    throw new Error("Sauvegarde incomplète : elle ne sera pas restaurée pour protéger vos données actuelles.");
  }
}

/**
 * Reads a backup file. Older exports and raw state dumps are accepted, but the
 * content always goes through the same migration and validation as stored data.
 */
export function importAppState(raw: string): AppState {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("Sauvegarde trop volumineuse : la limite est de 8 Mo.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Fichier illisible : ce n’est pas une sauvegarde Inflamm’Menu.");
  }

  if (!isRecord(parsed)) throw new Error("Fichier illisible : ce n’est pas une sauvegarde Inflamm’Menu.");
  let candidate: Record<string, unknown>;
  if (parsed.format !== undefined) {
    if (parsed.format !== BACKUP_FORMAT) throw new Error("Ce fichier ne provient pas d’Inflamm’Menu.");
    if (typeof parsed.version === "number" && parsed.version > APP_STATE_VERSION) {
      throw new Error("Cette sauvegarde provient d’une version plus récente d’Inflamm’Menu.");
    }
    if (typeof parsed.version !== "number") throw new Error("Sauvegarde incomplète : version absente ou invalide.");
    if (typeof parsed.exportedAt !== "string" || Number.isNaN(Date.parse(parsed.exportedAt))) {
      throw new Error("Sauvegarde incomplète : date d’export absente ou invalide.");
    }
    if (!isRecord(parsed.state)) throw new Error("Sauvegarde incomplète : aucune donnée exploitable.");
    if (!Object.keys(parsed.state).some((key) => RECOGNIZED_STATE_KEYS.has(key))) {
      throw new Error("Sauvegarde incomplète : aucune donnée Inflamm’Menu reconnue.");
    }
    candidate = parsed.state;
    assertCompleteImport(candidate, parsed.version);
  } else {
    const rawCandidate = isRecord(parsed.state) ? parsed.state : parsed;
    if (!Object.keys(rawCandidate).some((key) => RECOGNIZED_STATE_KEYS.has(key))) {
      throw new Error("Ce fichier ne contient aucune donnée Inflamm’Menu reconnue.");
    }
    candidate = rawCandidate;
    assertCompleteImport(candidate);
  }

  const migrated = migrateAppState(candidate);
  if (!migrated) throw new Error("Sauvegarde incomplète ou version incompatible.");
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
  const registrationCleanups: Array<() => void> = [];
  const trackedRegistrations = new WeakSet<ServiceWorkerRegistration>();
  const trackedWorkers = new WeakSet<ServiceWorker>();
  const notify = () => { if (!cancelled) onUpdateReady(); };
  const handleControllerChange = () => {
    // The first controller acquired after installation is the initial offline
    // worker, not an application update. Later controller changes are updates.
    if (pageWasControlled) notify();
    pageWasControlled = true;
  };
  const trackInstalling = (registration: ServiceWorkerRegistration) => {
    const installing = registration.installing;
    if (!installing || trackedWorkers.has(installing)) return;
    trackedWorkers.add(installing);
    const handleStateChange = () => {
      // Only a page already controlled by a worker can go stale.
      if (installing.state === "installed" && navigator.serviceWorker.controller) notify();
    };
    installing.addEventListener("statechange", handleStateChange);
    registrationCleanups.push(() => installing.removeEventListener("statechange", handleStateChange));
  };

  const trackRegistration = (registration: ServiceWorkerRegistration) => {
    if (trackedRegistrations.has(registration)) return;
    trackedRegistrations.add(registration);
    if (registration.waiting && navigator.serviceWorker.controller) notify();
    trackInstalling(registration);
    const handleUpdateFound = () => trackInstalling(registration);
    registration.addEventListener("updatefound", handleUpdateFound);
    registrationCleanups.push(() => registration.removeEventListener("updatefound", handleUpdateFound));
  };

  const inspectRegistration = async (requestUpdate: boolean) => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration || cancelled) return;
      trackRegistration(registration);
      if (requestUpdate) await registration.update();
    } catch {
      // Safari may reject an update check while the page is backgrounded or offline.
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") void inspectRegistration(true);
  };
  const handleOnline = () => { void inspectRegistration(true); };

  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibilityChange);
  if (typeof window !== "undefined") window.addEventListener("online", handleOnline);
  void inspectRegistration(false);

  return () => {
    cancelled = true;
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (typeof window !== "undefined") window.removeEventListener("online", handleOnline);
    registrationCleanups.splice(0).forEach((cleanup) => cleanup());
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
    const baseUrl = import.meta.env?.BASE_URL ?? "/";
    const registration = await navigator.serviceWorker.register(`${baseUrl}sw.js`, {
      scope: baseUrl,
      updateViaCache: "none",
    });
    // `register()` normally schedules a check, but WebKit may defer it for an
    // installed PWA. An explicit check makes the launch path deterministic.
    try { await registration.update(); } catch { /* Offline launch remains supported. */ }
    return registration;
  } catch {
    return null;
  }
}
