#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    first = text.find(start)
    if first < 0:
        raise RuntimeError(f"{label}: start marker not found")
    last = text.find(end, first)
    if last < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return text[:first] + replacement.rstrip() + "\n\n" + text[last:]


# ---------------------------------------------------------------------------
# Domain: keep reviewed safety cautions inside the offline planner projection.
# ---------------------------------------------------------------------------
domain = read("src/domain.ts")
domain = replace_once(
    domain,
    "  description: string;\n  steps: readonly string[];",
    "  description: string;\n  /** Reviewed safety or preparation caution, available even when the full catalogue is offline. */\n  caution?: string;\n  steps: readonly string[];",
    "Recipe.caution",
)
write("src/domain.ts", domain)


# ---------------------------------------------------------------------------
# Storage: strict validation, deterministic source arbitration and tab sync.
# ---------------------------------------------------------------------------
storage = read("src/storage.ts")
storage = replace_once(
    storage,
    "  onboardingCompleted: boolean;\n  /** @deprecated Use favoriteRecipeIds.",
    "  onboardingCompleted: boolean;\n  /** Monotonic local revision used to choose the newest replica and synchronise tabs. */\n  stateRevision: number;\n  /** @deprecated Use favoriteRecipeIds.",
    "AppState.stateRevision",
)
storage = replace_once(
    storage,
    "  onboardingCompleted: false,\n});",
    "  onboardingCompleted: false,\n  stateRevision: 0,\n});",
    "DEFAULT_APP_STATE stateRevision",
)
storage = replace_once(
    storage,
    ">;\n\nfunction createState(input: StateInput): AppState {",
    "> & { stateRevision?: number };\n\nfunction createState(input: StateInput): AppState {",
    "StateInput revision",
)
storage = replace_once(
    storage,
    "    onboardingCompleted: input.onboardingCompleted,\n    favorites:",
    "    onboardingCompleted: input.onboardingCompleted,\n    stateRevision: Math.max(0, Math.floor(input.stateRevision ?? 0)),\n    favorites:",
    "createState revision",
)
storage = replace_once(
    storage,
    "    ...DEFAULT_PROFILE,\n    ...value,\n    firstName:",
    "    ...DEFAULT_PROFILE,\n    firstName:",
    "profile unexpected keys",
)

new_normalize_plan = r'''export function normalizePlan(value: unknown): WeeklyPlan | null {
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
    if (valid) return meal;
    const { leftoverOf: _discarded, ...withoutLeftover } = meal;
    return withoutLeftover;
  });

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.replace(/[\r\n\u0000-\u001f\u007f]/g, "").slice(0, 180) : `week-${value.startsOn}`,
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
}'''
storage = replace_between(storage, "export function normalizePlan", "function planArray", new_normalize_plan, "normalizePlan")

new_custom = r'''function cleanUserText(value: unknown, maximum: number): string {
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
}'''
storage = replace_between(storage, "function normalizeCustomRecipes", "function normalizeWeeklyTargets", new_custom, "normalizeCustomRecipes")

new_migrate = r'''function normalizeRevision(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
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
  ).map(canonicalIngredientId))];
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
  });
}'''
storage = replace_between(storage, "/**\n * Migrates the early unversioned prototype shape", "function cloneDefaultState", new_migrate, "migrateAppState")

new_load_save = r'''function freshestState(indexedState: AppState | null, localState: AppState | null): AppState | null {
  if (!indexedState) return localState;
  if (!localState) return indexedState;
  return localState.stateRevision > indexedState.stateRevision ? localState : indexedState;
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
}'''
storage = replace_between(storage, "export async function loadAppState", "export const BACKUP_FORMAT", new_load_save, "load/save state")

new_import = r'''const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const RECOGNIZED_STATE_KEYS = new Set([
  "version", "profile", "currentPlan", "plan", "upcomingPlan", "favoriteRecipeIds", "favorites",
  "history", "checkedShoppingItemIds", "checkedShoppingIds", "pantryIngredientIds", "pantryIds",
  "pantryAmounts", "recipeNotes", "shoppingCategoryOrder", "actualSpend", "customRecipes",
  "textScale", "remindersEnabled", "onboardingCompleted", "stateRevision",
]);

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
    if (!isRecord(parsed.state)) throw new Error("Sauvegarde incomplète : aucune donnée exploitable.");
    candidate = parsed.state;
  } else {
    if (!Object.keys(parsed).some((key) => RECOGNIZED_STATE_KEYS.has(key))) {
      throw new Error("Ce fichier ne contient aucune donnée Inflamm’Menu reconnue.");
    }
    candidate = parsed;
  }

  const migrated = migrateAppState(candidate);
  if (!migrated) throw new Error("Sauvegarde incomplète ou version incompatible.");
  return migrated;
}'''
storage = replace_between(storage, "/**\n * Reads a backup file.", "/**\n * Watches for a newer service worker", new_import, "importAppState")
write("src/storage.ts", storage)


# ---------------------------------------------------------------------------
# Engine: preserve invariants for locks, skips, leftovers, swaps and exports.
# ---------------------------------------------------------------------------
engine = read("src/engine.ts")
engine = replace_once(engine, "function recipeIsAllowed(", "export function recipeIsAllowed(", "export recipeIsAllowed")
engine = replace_once(
    engine,
    "    keptSlots.set(slotKey, { ...meal, portions: people, locked: true });",
    "    if (meal.skipped) continue;\n    keptSlots.set(slotKey, {\n      ...meal,\n      portions: Math.min(MAX_MEAL_PORTIONS, Math.max(MIN_MEAL_PORTIONS, Math.round(meal.portions))),\n      completed: false,\n      skipped: false,\n      leftoverOf: undefined,\n      locked: true,\n    });",
    "locked meals",
)

new_replace = r'''export function replacePlannedMeal(
  plan: WeeklyPlan,
  slotId: string,
  replacement: Recipe | string,
  recipes: readonly Recipe[] = [],
): WeeklyPlan {
  const replacementId = typeof replacement === "string" ? replacement : replacement.id;
  const allRecipes = typeof replacement === "string" ? recipes : [...recipes, replacement];
  const recipeIds = new Set(plan.meals.filter((meal) => !meal.leftoverOf).map((meal) => meal.recipeId));
  const existing = plan.meals.find((meal) => meal.id === slotId);
  if (!existing) return plan;
  const replacementRecipe = typeof replacement === "string"
    ? recipes.find((recipe) => recipe.id === replacementId)
    : replacement;
  if (replacementRecipe && !replacementRecipe.mealTypes.includes(existing.mealType)) {
    throw new Error("Cette recette ne correspond pas au type du repas remplacé.");
  }
  if (recipeIds.has(replacementId) && existing.recipeId !== replacementId) {
    throw new Error("Cette recette est déjà utilisée dans la semaine.");
  }

  const meals = plan.meals.map((meal) => {
    if (meal.id === slotId) {
      return {
        ...meal,
        recipeId: replacementId,
        source: "replacement" as const,
        completed: false,
        locked: false,
        ...(existing.leftoverOf ? { leftoverOf: undefined } : {}),
      };
    }
    return meal.leftoverOf === slotId
      ? { ...meal, recipeId: replacementId, portions: existing.portions, completed: false }
      : meal;
  });
  const lookup = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => lookup.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, lookup) : plan.estimatedCost };
}'''
engine = replace_between(engine, "export function replacePlannedMeal", "/** Swaps two planned meals", new_replace, "replacePlannedMeal")

new_swap = r'''/** Swaps two planned meals, keeping every other mark attached to its dish. */
export function swapPlannedMeals(
  plan: WeeklyPlan,
  firstSlotId: string,
  secondSlotId: string,
  recipes: readonly Recipe[] = [],
): WeeklyPlan {
  const first = plan.meals.find((meal) => meal.id === firstSlotId);
  const second = plan.meals.find((meal) => meal.id === secondSlotId);
  if (!first || !second || first.id === second.id) return plan;
  if (first.leftoverOf || second.leftoverOf) {
    throw new Error("Un repas de restes reste attaché au plat cuisiné : déplacez plutôt le plat d'origine.");
  }
  if (plan.meals.some((meal) => meal.leftoverOf === first.id || meal.leftoverOf === second.id)) {
    throw new Error("Ce plat sert de base à des restes : retirez-les avant de le déplacer.");
  }

  const carried = (meal: PlannedMeal, other: PlannedMeal): PlannedMeal => ({
    ...meal,
    recipeId: other.recipeId,
    portions: other.portions,
    source: "manual",
    completed: other.completed,
    locked: other.locked,
    skipped: other.skipped,
  });
  const meals = plan.meals.map((meal) => (meal.id === first.id
    ? carried(meal, second)
    : meal.id === second.id
      ? carried(meal, first)
      : meal));
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => byId.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, byId) : plan.estimatedCost };
}'''
engine = replace_between(engine, "/** Swaps two planned meals", "/** Marks a meal as taken outside", new_swap, "swapPlannedMeals")

new_skip = r'''/** Marks a meal as taken outside the household: no cooking, no shopping, no cost. */
export function setMealSkipped(
  plan: WeeklyPlan,
  slotId: string,
  skipped: boolean,
  recipes: readonly Recipe[],
): WeeklyPlan {
  const target = plan.meals.find((meal) => meal.id === slotId);
  if (!target) return plan;
  if (skipped && plan.meals.some((meal) => meal.leftoverOf === slotId && !meal.skipped)) {
    throw new Error("Ce plat sert de base à des restes : retirez-les avant de le passer hors foyer.");
  }
  const meals = plan.meals.map((meal) => (meal.id === slotId
    ? { ...meal, skipped, ...(skipped ? { completed: false, locked: false } : {}) }
    : meal));
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => byId.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, byId) : plan.estimatedCost };
}'''
engine = replace_between(engine, "/** Marks a meal as taken outside", "export interface CookingSession", new_skip, "setMealSkipped")
engine = replace_once(
    engine,
    "    session.servesLater += plan.meals.filter((other) => other.leftoverOf === meal.id).length;",
    "    session.servesLater += plan.meals.filter((other) => other.leftoverOf === meal.id && !other.skipped).length;",
    "cooking session skipped leftovers",
)

new_portions_completed = r'''export function setMealPortions(
  plan: WeeklyPlan,
  slotId: string,
  portions: number,
  recipes: readonly Recipe[],
): WeeklyPlan {
  if (!plan.meals.some((meal) => meal.id === slotId)) return plan;
  const safePortions = Math.min(
    MAX_MEAL_PORTIONS,
    Math.max(MIN_MEAL_PORTIONS, Math.round(Number.isFinite(portions) ? portions : MIN_MEAL_PORTIONS)),
  );
  const meals = plan.meals.map((meal) => (
    meal.id === slotId || meal.leftoverOf === slotId ? { ...meal, portions: safePortions } : meal
  ));
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => byId.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, byId) : plan.estimatedCost };
}

/** Records that a planned meal has been cooked, or undoes that record. */
export function setPlannedMealCompleted(plan: WeeklyPlan, slotId: string, completed: boolean): WeeklyPlan {
  const target = plan.meals.find((meal) => meal.id === slotId);
  if (!target || (completed && (target.skipped || target.leftoverOf))) return plan;
  return {
    ...plan,
    meals: plan.meals.map((meal) => (meal.id === slotId ? { ...meal, completed } : meal)),
  };
}'''
engine = replace_between(engine, "export function setMealPortions", "export interface PlanProgress", new_portions_completed, "portions/completed")
engine = replace_once(
    engine,
    "  const tracked = plan?.meals.filter((meal) => !meal.skipped) ?? [];",
    "  const tracked = plan?.meals.filter((meal) => !meal.skipped && !meal.leftoverOf) ?? [];",
    "plan progress leftovers",
)

engine = replace_once(
    engine,
    "  if (!source || source.leftoverOf) return [];",
    "  if (!source || source.leftoverOf || source.skipped) return [];",
    "leftover source skipped",
)
engine = replace_once(
    engine,
    "      !meal.leftoverOf &&\n      !plan.meals.some((other) => other.leftoverOf === meal.id) &&\n      recipe.mealTypes.includes(meal.mealType)",
    "      !meal.leftoverOf &&\n      !meal.skipped &&\n      meal.mealType === source.mealType &&\n      !plan.meals.some((other) => other.leftoverOf === meal.id) &&\n      recipe.mealTypes.includes(meal.mealType)",
    "leftover candidates",
)
engine = replace_once(
    engine,
    "    ? { ...meal, recipeId: source.recipeId, source: \"manual\" as const, completed: false, locked: false, leftoverOf: sourceSlotId }",
    "    ? { ...meal, recipeId: source.recipeId, portions: source.portions, source: \"manual\" as const, completed: false, locked: false, skipped: false, leftoverOf: sourceSlotId }",
    "plan leftover target",
)

engine = replace_once(
    engine,
    "      completed: false,\n      locked: false,\n    }));",
    "      completed: false,\n      locked: false,\n      skipped: false,\n    }));",
    "restore plan reset skipped",
)

engine = replace_once(
    engine,
    "      checked: checked.has(item.ingredientId),\n      inPantry: pantry.has(item.ingredientId),",
    "      checked: checked.has(item.ingredientId),\n      // A numeric stock entry is partial unless it covers the whole requirement.\n      inPantry: pantry.has(item.ingredientId) && !owned,",
    "partial pantry",
)

new_calendar = r'''/** Minimal iCalendar export of a week, one event per meal. */
export function planToCalendar(plan: WeeklyPlan, recipes: readonly Recipe[]): string {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const times: Record<MealType, string> = { breakfast: "0800", lunch: "1230", dinner: "1930" };
  const labels: Record<MealType, string> = { breakfast: "Petit-déjeuner", lunch: "Déjeuner", dinner: "Dîner" };
  const escape = (value: string): string => value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
  const safeToken = (value: string): string => value.replace(/[\r\n\u0000-\u001f\u007f]/g, "-").slice(0, 220);
  const dayStamp = (dayIndex: number): string => {
    const [year, month, day] = plan.startsOn.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + dayIndex));
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const generated = new Date(plan.generatedAt);
  const stamp = (Number.isNaN(generated.getTime()) ? new Date(`${plan.startsOn}T00:00:00.000Z`) : generated)
    .toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const events = plan.meals.filter((meal) => !meal.skipped).map((meal) => {
    const recipe = byId.get(meal.recipeId);
    const start = `${dayStamp(meal.dayIndex)}T${times[meal.mealType]}00`;
    return [
      "BEGIN:VEVENT",
      `UID:${safeToken(`${plan.id}-${meal.id}`)}@inflamm-menu`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${start}`,
      "DURATION:PT45M",
      `SUMMARY:${escape(`${labels[meal.mealType]} — ${recipe?.title ?? "Repas"}`)}`,
      `DESCRIPTION:${escape(`${meal.portions} portions · Inflamm’Menu${meal.leftoverOf ? " · restes" : ""}`)}`,
      "END:VEVENT",
    ].join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InflammMenu//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Inflamm’Menu",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}'''
engine = replace_between(engine, "/** Minimal iCalendar export", "export interface ShoppingListTextOptions", new_calendar, "planToCalendar")
write("src/engine.ts", engine)


# ---------------------------------------------------------------------------
# Planner projection: carry reviewed cautions into the initial/offline bundle.
# ---------------------------------------------------------------------------
planner = read("scripts/generate-planner-recipes.mjs")
planner = replace_once(
    planner,
    "    description: recipe.description,\n    steps: recipe.etapes,",
    "    description: recipe.description,\n    ...(recipe.app.review.caution ? { caution: recipe.app.review.caution } : {}),\n    steps: recipe.etapes,",
    "planner caution",
)
write("scripts/generate-planner-recipes.mjs", planner)


# ---------------------------------------------------------------------------
# Regression tests appended without coupling to existing import lists.
# ---------------------------------------------------------------------------
storage_tests = read("tests/storage.test.mjs")
marker = "audit remediation: strict imports and nested custom recipes"
if marker not in storage_tests:
    storage_tests += r'''

test("audit remediation: strict imports and nested custom recipes", async () => {
  const { importAppState, migrateAppState } = await import("../src/storage.ts");
  assert.throws(() => importAppState("{}"), /aucune donnée Inflamm.Menu reconnue/i);
  assert.throws(() => importAppState(JSON.stringify({ hello: 1 })), /aucune donnée Inflamm.Menu reconnue/i);
  assert.throws(() => importAppState(JSON.stringify({ format: "inflamm-menu-backup", version: 999, state: {} })), /version plus récente/i);

  const malformed = migrateAppState({
    profile: {},
    customRecipes: [{
      id: "perso-danger",
      title: "Danger",
      mealTypes: ["lunch"],
      ingredients: [],
      steps: ["Étape"],
      prepMinutes: 10,
      costPerPortion: 2,
    }],
  });
  assert.equal(malformed.customRecipes.length, 0);
});

test("audit remediation: plan normalization removes duplicate slots and invalid leftovers", async () => {
  const { normalizePlan } = await import("../src/storage.ts");
  const normalized = normalizePlan({
    startsOn: "2026-08-03",
    meals: [
      { id: "a", dayIndex: 0, mealType: "lunch", recipeId: "r1", portions: 2, source: "generated", leftoverOf: "a" },
      { id: "b", dayIndex: 0, mealType: "lunch", recipeId: "r2", portions: 2, source: "generated" },
      { id: "c", dayIndex: 1, mealType: "lunch", recipeId: "r3", portions: 2, source: "generated", leftoverOf: "a" },
    ],
  });
  assert.equal(normalized.meals.length, 2);
  assert.equal(normalized.meals[0].leftoverOf, undefined);
  assert.equal(normalized.meals[1].leftoverOf, undefined);
  assert.equal(normalizePlan({ startsOn: "2026-08-04", meals: [{ id: "a", dayIndex: 0, mealType: "lunch", recipeId: "r", portions: 1, source: "generated" }] }), null);
});
'''
write("tests/storage.test.mjs", storage_tests)

engine_tests = read("tests/engine.test.mjs")
marker = "audit remediation: locked meals preserve portions"
if marker not in engine_tests:
    engine_tests += r'''

test("audit remediation: locked meals preserve portions and reset cooked state", async () => {
  const { generateWeeklyPlan } = await import("../src/engine.ts");
  const { DEFAULT_PROFILE } = await import("../src/domain.ts");
  const recipes = Array.from({ length: 14 }, (_, index) => ({
    id: `safe-${index}`,
    title: `Safe ${index}`,
    mealTypes: [index < 7 ? "lunch" : "dinner"],
    diet: ["classic"], prepMinutes: 5, costPerPortion: 1,
    seasons: ["all-year"], equipment: [], allergens: [], tags: [],
    ingredients: [{ id: `ingredient-${index}`, name: "Ingredient", quantity: 1, unit: "piece", category: "grocery" }],
    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",
  }));
  const locked = { id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: "safe-0", portions: 6, source: "generated", locked: true, completed: true };
  const plan = generateWeeklyPlan(recipes, { ...DEFAULT_PROFILE, people: 2, equipment: [] }, { seed: "locked", lockedMeals: [locked] });
  const kept = plan.meals.find((meal) => meal.id === locked.id);
  assert.equal(kept.portions, 6);
  assert.equal(kept.completed, false);
});

test("audit remediation: swaps recalculate cost and replacing a leftover clears its link", async () => {
  const { swapPlannedMeals, replacePlannedMeal } = await import("../src/engine.ts");
  const makeRecipe = (id, cost) => ({
    id, title: id, mealTypes: ["lunch"], diet: ["classic"], prepMinutes: 1,
    costPerPortion: cost, seasons: ["all-year"], equipment: [], allergens: [], tags: [],
    ingredients: [{ id, name: id, quantity: 1, unit: "piece", category: "grocery" }],
    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",
  });
  const recipes = [makeRecipe("cheap", 1), makeRecipe("expensive", 10), makeRecipe("new", 3)];
  const plan = { id: "week", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: {}, version: 1, estimatedCost: 12, meals: [
    { id: "a", dayIndex: 0, mealType: "lunch", recipeId: "cheap", portions: 2, source: "generated" },
    { id: "b", dayIndex: 1, mealType: "lunch", recipeId: "expensive", portions: 1, source: "generated" },
  ] };
  const swapped = swapPlannedMeals(plan, "a", "b", recipes);
  assert.equal(swapped.estimatedCost, 12);
  assert.equal(swapped.meals[0].portions, 1);
  assert.equal(swapped.meals[1].portions, 2);

  const leftoverPlan = { ...plan, meals: [plan.meals[0], { ...plan.meals[1], recipeId: "cheap", leftoverOf: "a" }] };
  const replaced = replacePlannedMeal(leftoverPlan, "b", recipes[2], recipes);
  assert.equal(replaced.meals[1].leftoverOf, undefined);
});

test("audit remediation: skipped meals cannot become leftover targets and partial pantry remains visible", async () => {
  const { leftoverCandidates, buildShoppingList } = await import("../src/engine.ts");
  const recipe = {
    id: "tofu", title: "Tofu", mealTypes: ["lunch"], diet: ["classic"], prepMinutes: 1,
    costPerPortion: 1, seasons: ["all-year"], equipment: [], allergens: [], tags: [],
    ingredients: [{ id: "tofu", name: "Tofu", quantity: 100, unit: "g", category: "fresh" }],
    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",
  };
  const plan = { id: "week", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: {}, version: 1, estimatedCost: 2, meals: [
    { id: "a", dayIndex: 0, mealType: "lunch", recipeId: "tofu", portions: 2, source: "generated" },
    { id: "b", dayIndex: 1, mealType: "lunch", recipeId: "tofu", portions: 2, source: "generated", skipped: true },
  ] };
  assert.equal(leftoverCandidates(plan, "a", [recipe]).length, 0);
  const list = buildShoppingList({ ...plan, meals: [plan.meals[0]] }, [recipe], {
    pantryIngredientIds: ["tofu"],
    pantryAmounts: { tofu: { quantity: 50, unit: "g" } },
  });
  assert.equal(list[0].amounts[0].quantity, 150);
  assert.equal(list[0].inPantry, false);
});

test("audit remediation: calendar tokens cannot inject new lines", async () => {
  const { planToCalendar } = await import("../src/engine.ts");
  const plan = { id: "week\r\nX-EVIL:1", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: {}, version: 1, estimatedCost: 0, meals: [
    { id: "slot\nBEGIN:EVIL", dayIndex: 0, mealType: "lunch", recipeId: "missing", portions: 1, source: "generated" },
  ] };
  const calendar = planToCalendar(plan, []);
  assert.doesNotMatch(calendar, /\r\nX-EVIL:/);
  assert.doesNotMatch(calendar, /\r\nBEGIN:EVIL/);
  assert.match(calendar, /\r\nMETHOD:PUBLISH\r\n/);
});
'''
write("tests/engine.test.mjs", engine_tests)

print("Core remediation applied successfully.")
