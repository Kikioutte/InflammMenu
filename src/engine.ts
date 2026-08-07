import type {
  Ingredient,
  MealType,
  PantryAmount,
  PlannedMeal,
  Recipe,
  ShoppingItem,
  UserProfile,
  WeeklyPlan,
} from "./domain.ts";
import {
  canonicalIngredientId,
  formatShoppingAmounts,
  legacyShoppingItemKeyToCanonical,
  purchaseSuggestionFor,
  shoppingRuleFor,
} from "./shopping.ts";

export interface GeneratePlanOptions {
  /** Stable input used to make otherwise equivalent choices reproducible. */
  seed?: string | number;
  /** Monday of the generated week, in YYYY-MM-DD format. */
  startsOn?: string;
  /** Mainly useful when importing a plan. Defaults to midnight on startsOn. */
  generatedAt?: string;
  season?: "spring" | "summer" | "autumn" | "winter";
  /**
   * Meals the user asked to keep. Their slot is not regenerated, their recipe
   * stays out of the candidate pool, and the budget pass never replaces them.
   */
  lockedMeals?: readonly PlannedMeal[];
  /**
   * Saved recipes. They get a preference bonus, never a pass: allergies, diet,
   * equipment, time and dislikes still decide what is eligible at all.
   */
  favoriteRecipeIds?: readonly string[];
}

export interface PlanSummary {
  mealCount: number;
  /** Meals actually cooked: total meals minus the ones served as leftovers. */
  cookingSessions: number;
  estimatedCost: number;
  averagePrepMinutes: number;
  legumeMeals: number;
  fishMeals: number;
  wholeGrainMeals: number;
  nutOrSeedMeals: number;
  seasonalMeals: number;
  withinBudget: boolean;
  /** Estimated averages per portion, never a nutritional assessment. */
  averageCalories: number;
  averageProtein: number;
  averageFiber: number;
}

const DEFAULT_START = "2026-08-03";
const TAGS = {
  legume: ["legume", "legumineuse", "legumineuses", "lentille", "pois-chiche", "haricot"],
  fish: ["fish", "poisson", "saumon", "sardine", "maquereau", "cabillaud", "thon"],
  wholeGrain: ["whole-grain", "cereale-complete", "cereales-completes", "complet"],
  nutSeed: ["nuts-seeds", "noix-graines", "noix", "graine", "graines"],
} as const;
const NUT_OR_SEED_INGREDIENTS = new Set([
  "almond",
  "almond-drink",
  "chia",
  "pumpkin-seed",
  "sesame",
  "walnut",
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .trim()
    .toLowerCase()
    .replace(/[ _]+/g, "-");
}

const ALLERGEN_ALIASES: Readonly<Record<string, string>> = {
  cacahuete: "arachides",
  cacahuetes: "arachides",
  crustace: "crustaces",
  crustaces: "crustaces",
  lactose: "lait",
  laitages: "lait",
  noix: "fruits-a-coque",
  noisette: "fruits-a-coque",
  noisettes: "fruits-a-coque",
  amande: "fruits-a-coque",
  amandes: "fruits-a-coque",
  oeufs: "oeuf",
};

function canonicalAllergen(value: string): string {
  const normalized = normalize(value);
  return ALLERGEN_ALIASES[normalized] ?? normalized;
}

function hasTag(recipe: Recipe, candidates: readonly string[]): boolean {
  const wanted = new Set(candidates.map(normalize));
  return recipe.tags.some((tag) => {
    const normalizedTag = normalize(tag);
    return [...wanted].some(
      (candidate) => normalizedTag === candidate || normalizedTag.startsWith(`${candidate}-`),
    );
  });
}

function hasNutOrSeed(recipe: Recipe): boolean {
  return (
    hasTag(recipe, TAGS.nutSeed) ||
    recipe.ingredients.some((ingredient) => NUT_OR_SEED_INGREDIENTS.has(normalize(ingredient.id)))
  );
}

function hashSeed(seed: string | number): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRank(seed: string | number, value: string): number {
  return hashSeed(`${String(seed)}:${value}`) / 0xffffffff;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function requiredMealTypes(mealsPerDay: UserProfile["mealsPerDay"]): readonly MealType[] {
  return mealsPerDay === 3 ? ["breakfast", "lunch", "dinner"] : ["lunch", "dinner"];
}

export const DEFAULT_WEEKLY_TARGETS = { legumeMeals: 2, fishMeals: 2 } as const;
export const MAX_WEEKLY_TARGET = 7;

/** Weekly frequencies aimed for, clamped and tolerant of profiles saved before they existed. */
export function weeklyTargetsOf(profile: UserProfile): { legumeMeals: number; fishMeals: number } {
  const clamp = (value: unknown, fallback: number): number => {
    const parsed = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.min(MAX_WEEKLY_TARGET, Math.max(0, parsed));
  };
  return {
    legumeMeals: clamp(profile.weeklyTargets?.legumeMeals, DEFAULT_WEEKLY_TARGETS.legumeMeals),
    fishMeals: clamp(profile.weeklyTargets?.fishMeals, DEFAULT_WEEKLY_TARGETS.fishMeals),
  };
}

/**
 * Every declared allergen of a recipe, from the recipe itself and from its
 * ingredients, normalized to the regulated identifiers and deduplicated.
 */
export function recipeAllergens(recipe: Recipe): string[] {
  return [
    ...new Set(
      [...recipe.allergens, ...recipe.ingredients.flatMap((ingredient) => ingredient.allergens ?? [])].map(
        canonicalAllergen,
      ),
    ),
  ].sort();
}

/** Rest times short enough to fit inside the cooking session are not signalled. */
const SAME_DAY_REST_MINUTES = 60;
const DAY_BEFORE_REST_MINUTES = 240;

export interface AdvancePrep {
  minutes: number;
  /** "day-before" when the rest time cannot realistically fit in one session. */
  level: "day-before" | "same-day";
}

/**
 * Soaking, chilling, marinating or fermenting time worth warning about before
 * the meal is due. Returns null when the rest fits inside the cooking session.
 */
export function advancePrepFor(recipe: Recipe): AdvancePrep | null {
  const minutes = recipe.restMinutes ?? 0;
  if (minutes >= DAY_BEFORE_REST_MINUTES) return { minutes, level: "day-before" };
  if (minutes >= SAME_DAY_REST_MINUTES) return { minutes, level: "same-day" };
  return null;
}

/** Estimated cost of one planned meal, rounded to the cent. */
export function mealCost(recipe: Recipe, portions: number): number {
  return round(recipe.costPerPortion * Math.max(0, portions));
}

function recipeIsAllowed(recipe: Recipe, profile: UserProfile): boolean {
  const allergies = new Set(profile.allergies.map(canonicalAllergen));
  const excluded = new Set(profile.excludedIngredientIds.map(canonicalIngredientId));

  return (
    !(profile.dislikedRecipeIds ?? []).includes(recipe.id) &&
    recipe.diet.includes(profile.diet) &&
    recipe.prepMinutes <= profile.maxPrepMinutes &&
    recipe.equipment.every((item) => profile.equipment.includes(item)) &&
    !recipeAllergens(recipe).some((allergen) => allergies.has(allergen)) &&
    !recipe.ingredients.some((ingredient) => excluded.has(canonicalIngredientId(ingredient.id)))
  );
}

function ingredientReuse(recipe: Recipe, selected: readonly Recipe[]): number {
  if (selected.length === 0) return 0;
  const used = new Set(selected.flatMap((item) => item.ingredients.map((ingredient) => canonicalIngredientId(ingredient.id))));
  return recipe.ingredients.reduce(
    (total, ingredient) => total + (used.has(canonicalIngredientId(ingredient.id)) ? 1 : 0),
    0,
  );
}

function tagCount(recipes: readonly Recipe[], candidates: readonly string[]): number {
  return recipes.reduce((total, recipe) => total + (hasTag(recipe, candidates) ? 1 : 0), 0);
}

function totalPlanCost(meals: readonly PlannedMeal[], byId: ReadonlyMap<string, Recipe>): number {
  return round(
    meals.reduce((total, meal) => {
      if (meal.skipped) return total;
      const recipe = byId.get(meal.recipeId);
      return total + (recipe ? recipe.costPerPortion * meal.portions : 0);
    }, 0),
  );
}

/**
 * Creates a menu using only local rule evaluation. A recipe is never repeated.
 * Throws when the filtered catalogue cannot fill every requested slot safely.
 */
export function generateWeeklyPlan(
  recipes: readonly Recipe[],
  profile: UserProfile,
  options: GeneratePlanOptions = {},
): WeeklyPlan {
  const seed = options.seed ?? "inflamm-menu-v1";
  const startsOn = options.startsOn ?? DEFAULT_START;
  const season = options.season ?? "summer";
  const mealTypes = requiredMealTypes(profile.mealsPerDay);
  const slots = Array.from({ length: 7 }, (_, dayIndex) =>
    mealTypes.map((mealType) => ({ dayIndex, mealType })),
  ).flat();
  const eligible = recipes.filter((recipe) => recipeIsAllowed(recipe, profile));
  const catalogue = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const people = Math.max(1, Math.round(profile.people));
  const favorites = new Set(options.favoriteRecipeIds ?? []);
  const softDisliked = new Set(profile.softDislikedRecipeIds ?? []);
  const targets = weeklyTargetsOf(profile);
  const keptSlots = new Map<string, PlannedMeal>();

  for (const meal of options.lockedMeals ?? []) {
    const slotKey = `${meal.dayIndex}-${meal.mealType}`;
    const lockedRecipe = catalogue.get(meal.recipeId);
    // A leftover only makes sense next to the batch it came from.
    if (meal.leftoverOf) continue;
    // A lock never overrides allergies, diet, equipment or the time limit.
    if (!lockedRecipe || !recipeIsAllowed(lockedRecipe, profile)) continue;
    if (!lockedRecipe.mealTypes.includes(meal.mealType)) continue;
    if (!mealTypes.includes(meal.mealType)) continue;
    if (meal.dayIndex < 0 || meal.dayIndex > 6) continue;
    if (keptSlots.has(slotKey)) continue;
    if ([...keptSlots.values()].some((kept) => kept.recipeId === meal.recipeId)) continue;
    keptSlots.set(slotKey, { ...meal, portions: people, locked: true });
  }

  const keptRecipeIds = new Set([...keptSlots.values()].map((meal) => meal.recipeId));

  for (const mealType of mealTypes) {
    const kept = [...keptSlots.values()].filter((meal) => meal.mealType === mealType).length;
    const needed = 7 - kept;
    const available = eligible.filter(
      (recipe) => recipe.mealTypes.includes(mealType) && !keptRecipeIds.has(recipe.id),
    ).length;
    if (available < needed) {
      throw new Error(
        `Catalogue insuffisant pour ${mealType}: ${available} recette(s) compatible(s), ${needed} requises.`,
      );
    }
  }

  const used = new Set<string>(keptRecipeIds);
  const selected: Recipe[] = [...keptSlots.values()]
    .map((meal) => catalogue.get(meal.recipeId))
    .filter((recipe): recipe is Recipe => Boolean(recipe));
  const meals: PlannedMeal[] = [];

  for (const slot of slots) {
    const kept = keptSlots.get(`${slot.dayIndex}-${slot.mealType}`);
    if (kept) {
      meals.push(kept);
      continue;
    }

    const legumeDeficit = Math.max(0, targets.legumeMeals - tagCount(selected, TAGS.legume));
    const fishDeficit = profile.diet === "classic" ? Math.max(0, targets.fishMeals - tagCount(selected, TAGS.fish)) : 0;
    const candidates = eligible.filter(
      (recipe) => !used.has(recipe.id) && recipe.mealTypes.includes(slot.mealType),
    );

    if (candidates.length === 0) {
      throw new Error(`Aucune recette unique disponible pour le créneau ${slot.dayIndex}-${slot.mealType}.`);
    }

    const selectedRecipe = [...candidates].sort((left, right) => {
      const score = (recipe: Recipe): number => {
        const seasonal = recipe.seasons.includes(season) || recipe.seasons.includes("all-year");
        const targetScore =
          (legumeDeficit > 0 && hasTag(recipe, TAGS.legume) ? 700 : 0) +
          (fishDeficit > 0 && hasTag(recipe, TAGS.fish) ? 700 : 0);
        const qualityScore =
          (hasTag(recipe, TAGS.wholeGrain) ? 18 : 0) +
          (hasNutOrSeed(recipe) ? 14 : 0) +
          (seasonal ? 12 : 0) +
          ingredientReuse(recipe, selected) * 5;
        // Saved recipes are a preference, weighted above quality nudges but
        // below the legume/fish targets, and never above the safety filters.
        const favoriteScore = favorites.has(recipe.id) ? 120 : 0;
        // « Bof » : la recette reste possible, mais passe après les autres.
        const softDislikeScore = softDisliked.has(recipe.id) ? -200 : 0;
        // Cost remains meaningful even when nutrition/season scores are tied.
        return targetScore + favoriteScore + softDislikeScore + qualityScore - recipe.costPerPortion * people * 7;
      };
      const difference = score(right) - score(left);
      if (difference !== 0) return difference;
      return seededRank(seed, left.id) - seededRank(seed, right.id) || left.id.localeCompare(right.id);
    })[0];

    used.add(selectedRecipe.id);
    selected.push(selectedRecipe);
    meals.push({
      id: `day-${slot.dayIndex}-${slot.mealType}`,
      dayIndex: slot.dayIndex as PlannedMeal["dayIndex"],
      mealType: slot.mealType,
      recipeId: selectedRecipe.id,
      portions: people,
      source: "generated",
    });
  }

  // When over budget, replace locally with cheaper unused recipes while keeping
  // the requested legume/fish frequencies intact. This is deliberately best-effort.
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  let currentCost = totalPlanCost(meals, byId);
  let changed = true;
  while (currentCost > profile.weeklyBudget && changed) {
    changed = false;
    const selectedNow = meals.map((meal) => byId.get(meal.recipeId)).filter((item): item is Recipe => Boolean(item));
    const currentLegumes = tagCount(selectedNow, TAGS.legume);
    const currentFish = tagCount(selectedNow, TAGS.fish);
    let best:
      | { mealIndex: number; recipe: Recipe; saving: number }
      | undefined;

    meals.forEach((meal, mealIndex) => {
      if (meal.locked) return;
      const previous = byId.get(meal.recipeId);
      if (!previous) return;
      for (const candidate of eligible) {
        if (used.has(candidate.id) || !candidate.mealTypes.includes(meal.mealType)) continue;
        const losesLegume = hasTag(previous, TAGS.legume) && !hasTag(candidate, TAGS.legume);
        const losesFish = hasTag(previous, TAGS.fish) && !hasTag(candidate, TAGS.fish);
        if (losesLegume && currentLegumes <= targets.legumeMeals) continue;
        if (profile.diet === "classic" && losesFish && currentFish <= targets.fishMeals) continue;
        const saving = (previous.costPerPortion - candidate.costPerPortion) * meal.portions;
        if (saving > 0 && (!best || saving > best.saving)) best = { mealIndex, recipe: candidate, saving };
      }
    });

    if (best) {
      used.delete(meals[best.mealIndex].recipeId);
      used.add(best.recipe.id);
      meals[best.mealIndex] = { ...meals[best.mealIndex], recipeId: best.recipe.id };
      currentCost = round(currentCost - best.saving);
      changed = true;
    }
  }

  const generatedAt = options.generatedAt ?? `${startsOn}T00:00:00.000Z`;
  return {
    id: `week-${startsOn}-${hashSeed(seed).toString(36)}`,
    startsOn,
    generatedAt,
    profileSnapshot: { ...profile },
    meals,
    estimatedCost: totalPlanCost(meals, byId),
    version: 1,
  };
}

export function getReplacementCandidates(
  plan: WeeklyPlan,
  slotId: string,
  recipes: readonly Recipe[],
  profile: UserProfile,
  reason = "different",
): Recipe[] {
  const meal = plan.meals.find((item) => item.id === slotId);
  if (!meal) return [];
  const current = recipes.find((recipe) => recipe.id === meal.recipeId);
  const usedIds = new Set(plan.meals.map((item) => item.recipeId));
  const normalizedReason = normalize(reason);

  return recipes
    .filter(
      (recipe) =>
        !usedIds.has(recipe.id) &&
        recipe.mealTypes.includes(meal.mealType) &&
        recipeIsAllowed(recipe, profile),
    )
    .sort((left, right) => {
      const softDisliked = new Set(profile.softDislikedRecipeIds ?? []);
      const score = (recipe: Recipe): number => {
        let value = softDisliked.has(recipe.id) ? -200 : 0;
        if (normalizedReason.includes("rapide") || normalizedReason.includes("time")) value -= recipe.prepMinutes * 5;
        if (normalizedReason.includes("budget") || normalizedReason.includes("cher")) value -= recipe.costPerPortion * 20;
        if (normalizedReason.includes("veget")) value += recipe.diet.includes("vegetarian") ? 100 : 0;
        // Two opposite intents used to share the same branch: reusing what is
        // already bought, and getting away from the current ingredients.
        if (current && (normalizedReason.includes("reutiliser") || normalizedReason.includes("reuse"))) {
          value += ingredientReuse(recipe, [current]) * 8;
        }
        if (current && (normalizedReason.includes("autre") || normalizedReason.includes("different"))) {
          value -= ingredientReuse(recipe, [current]) * 8;
        }
        value += (recipe.seasons.includes("summer") || recipe.seasons.includes("all-year")) ? 3 : 0;
        return value;
      };
      return score(right) - score(left) || left.title.localeCompare(right.title, "fr");
    });
}

export function replacePlannedMeal(
  plan: WeeklyPlan,
  slotId: string,
  replacement: Recipe | string,
  recipes: readonly Recipe[] = [],
): WeeklyPlan {
  const replacementId = typeof replacement === "string" ? replacement : replacement.id;
  const allRecipes = typeof replacement === "string" ? recipes : [...recipes, replacement];
  // Leftover slots repeat their source on purpose and never block a replacement.
  const recipeIds = new Set(plan.meals.filter((meal) => !meal.leftoverOf).map((meal) => meal.recipeId));
  const existing = plan.meals.find((meal) => meal.id === slotId);
  if (!existing) return plan;
  const replacementRecipe =
    typeof replacement === "string"
      ? recipes.find((recipe) => recipe.id === replacementId)
      : replacement;
  if (replacementRecipe && !replacementRecipe.mealTypes.includes(existing.mealType)) {
    throw new Error("Cette recette ne correspond pas au type du repas remplacé.");
  }
  if (recipeIds.has(replacementId) && existing.recipeId !== replacementId) {
    throw new Error("Cette recette est déjà utilisée dans la semaine.");
  }

  // Leftovers follow the meal they were cooked with, so the pair stays coherent.
  const meals = plan.meals.map((meal) =>
    meal.id === slotId
      ? { ...meal, recipeId: replacementId, source: "replacement" as const, completed: false }
      : meal.leftoverOf === slotId
        ? { ...meal, recipeId: replacementId, completed: false }
        : meal,
  );
  const lookup = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => lookup.has(meal.recipeId));

  return {
    ...plan,
    meals,
    estimatedCost: canRecalculate ? totalPlanCost(meals, lookup) : plan.estimatedCost,
  };
}

/** Swaps two planned meals, keeping every other mark attached to its dish. */
export function swapPlannedMeals(plan: WeeklyPlan, firstSlotId: string, secondSlotId: string): WeeklyPlan {
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
    source: "manual",
    completed: other.completed,
    locked: other.locked,
    skipped: other.skipped,
  });

  return {
    ...plan,
    meals: plan.meals.map((meal) => (meal.id === first.id
      ? carried(meal, second)
      : meal.id === second.id
        ? carried(meal, first)
        : meal)),
  };
}

/** Marks a meal as taken outside the household: no cooking, no shopping, no cost. */
export function setMealSkipped(
  plan: WeeklyPlan,
  slotId: string,
  skipped: boolean,
  recipes: readonly Recipe[],
): WeeklyPlan {
  if (!plan.meals.some((meal) => meal.id === slotId)) return plan;
  const meals = plan.meals.map((meal) => (meal.id === slotId
    ? { ...meal, skipped, ...(skipped ? { completed: false } : {}) }
    : meal));
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => byId.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, byId) : plan.estimatedCost };
}

export interface CookingSession {
  dayIndex: PlannedMeal["dayIndex"];
  meals: PlannedMeal[];
  activeMinutes: number;
  /** Meals eaten later thanks to what is cooked that day. */
  servesLater: number;
}

/**
 * What actually has to be cooked, day by day: leftovers and meals taken out are
 * excluded, and each day carries its cumulated hands-on time.
 */
export function cookingSessionsOf(plan: WeeklyPlan, recipes: readonly Recipe[]): CookingSession[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const days = new Map<number, CookingSession>();
  for (const meal of plan.meals) {
    if (meal.leftoverOf || meal.skipped) continue;
    const recipe = byId.get(meal.recipeId);
    const session = days.get(meal.dayIndex) ?? { dayIndex: meal.dayIndex, meals: [], activeMinutes: 0, servesLater: 0 };
    session.meals.push(meal);
    session.activeMinutes += recipe?.prepMinutes ?? 0;
    session.servesLater += plan.meals.filter((other) => other.leftoverOf === meal.id).length;
    days.set(meal.dayIndex, session);
  }
  return [...days.values()].sort((left, right) => left.dayIndex - right.dayIndex);
}

/** Locks or unlocks one slot so the next generation keeps or drops it. */
export function setPlannedMealLock(plan: WeeklyPlan, slotId: string, locked: boolean): WeeklyPlan {
  if (!plan.meals.some((meal) => meal.id === slotId)) return plan;
  return {
    ...plan,
    meals: plan.meals.map((meal) => (meal.id === slotId ? { ...meal, locked } : meal)),
  };
}

/** Smallest and largest number of portions a single meal can be planned for. */
export const MIN_MEAL_PORTIONS = 1;
export const MAX_MEAL_PORTIONS = 8;

/**
 * Adjusts one meal for guests or a smaller appetite. Shopping quantities and
 * the estimated cost follow immediately.
 */
export function setMealPortions(
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
  const meals = plan.meals.map((meal) => (meal.id === slotId ? { ...meal, portions: safePortions } : meal));
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => byId.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, byId) : plan.estimatedCost };
}

/** Records that a planned meal has been cooked, or undoes that record. */
export function setPlannedMealCompleted(plan: WeeklyPlan, slotId: string, completed: boolean): WeeklyPlan {
  if (!plan.meals.some((meal) => meal.id === slotId)) return plan;
  return {
    ...plan,
    meals: plan.meals.map((meal) => (meal.id === slotId ? { ...meal, completed } : meal)),
  };
}

export interface PlanProgress {
  completed: number;
  total: number;
  /** Share of cooked meals between 0 and 1, and 0 for an empty plan. */
  ratio: number;
}

export function planProgress(plan: WeeklyPlan | null | undefined): PlanProgress {
  const tracked = plan?.meals.filter((meal) => !meal.skipped) ?? [];
  const total = tracked.length;
  const completed = tracked.filter((meal) => meal.completed === true).length;
  return { completed, total, ratio: total ? completed / total : 0 };
}

/** Meals the next generation must preserve, in stable slot order. */
export function lockedMealsOf(plan: WeeklyPlan | null | undefined): PlannedMeal[] {
  if (!plan) return [];
  return plan.meals.filter((meal) => meal.locked === true);
}

/**
 * Locked meals the current profile can still accept. A lock is a convenience,
 * never a reason to serve a recipe that breaks an allergy or diet rule.
 */
export function preservableLockedMeals(
  plan: WeeklyPlan | null | undefined,
  recipes: readonly Recipe[],
  profile: UserProfile,
): PlannedMeal[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const mealTypes = requiredMealTypes(profile.mealsPerDay);
  return lockedMealsOf(plan).filter((meal) => {
    const recipe = byId.get(meal.recipeId);
    return Boolean(
      !meal.leftoverOf &&
        recipe &&
        recipeIsAllowed(recipe, profile) &&
        recipe.mealTypes.includes(meal.mealType) &&
        mealTypes.includes(meal.mealType) &&
        meal.dayIndex >= 0 &&
        meal.dayIndex <= 6,
    );
  });
}

/** Days a cooked dish is reused, kept short on purpose; conservation rules still apply. */
const MAX_LEFTOVER_DAYS = 2;

/** Later slots that can be served as leftovers of the given meal. */
export function leftoverCandidates(
  plan: WeeklyPlan,
  sourceSlotId: string,
  recipes: readonly Recipe[],
): PlannedMeal[] {
  const source = plan.meals.find((meal) => meal.id === sourceSlotId);
  if (!source || source.leftoverOf) return [];
  const recipe = recipes.find((item) => item.id === source.recipeId);
  if (!recipe) return [];

  return plan.meals.filter((meal) => {
    const gap = meal.dayIndex - source.dayIndex;
    return (
      meal.id !== source.id &&
      gap > 0 &&
      gap <= MAX_LEFTOVER_DAYS &&
      !meal.leftoverOf &&
      !plan.meals.some((other) => other.leftoverOf === meal.id) &&
      recipe.mealTypes.includes(meal.mealType)
    );
  });
}

/**
 * Serves an already planned dish again later in the week. Shopping quantities
 * and cost keep counting both meals, since the batch really is cooked bigger.
 */
export function planLeftover(
  plan: WeeklyPlan,
  sourceSlotId: string,
  targetSlotId: string,
  recipes: readonly Recipe[],
): WeeklyPlan {
  const source = plan.meals.find((meal) => meal.id === sourceSlotId);
  const target = plan.meals.find((meal) => meal.id === targetSlotId);
  if (!source || !target) throw new Error("Ce créneau n'existe pas dans la semaine.");
  if (!leftoverCandidates(plan, sourceSlotId, recipes).some((meal) => meal.id === targetSlotId)) {
    throw new Error(
      `Les restes se replanifient sur un repas compatible, dans les ${MAX_LEFTOVER_DAYS} jours qui suivent.`,
    );
  }

  const meals = plan.meals.map((meal) => (meal.id === targetSlotId
    ? { ...meal, recipeId: source.recipeId, source: "manual" as const, completed: false, locked: false, leftoverOf: sourceSlotId }
    : meal));
  const byId = new Map(recipes.map((item) => [item.id, item]));
  const canRecalculate = meals.every((meal) => byId.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, byId) : plan.estimatedCost };
}

export interface PlanSlot {
  dayIndex: PlannedMeal["dayIndex"];
  mealType: MealType;
}

/** Slots a recipe can take in a plan, with the reason when it cannot. */
export function assignableSlots(
  plan: WeeklyPlan,
  recipe: Recipe,
  profile: UserProfile,
): Array<PlanSlot & { taken: string }> {
  if (!recipeIsAllowed(recipe, profile)) return [];
  return plan.meals
    .filter((meal) => recipe.mealTypes.includes(meal.mealType))
    .map((meal) => ({ dayIndex: meal.dayIndex, mealType: meal.mealType, taken: meal.recipeId }));
}

/**
 * Puts a chosen recipe on a slot. The safety filters still apply, and a recipe
 * already used elsewhere in the week is refused to preserve variety.
 */
export function assignRecipeToSlot(
  plan: WeeklyPlan,
  slot: PlanSlot,
  recipe: Recipe,
  recipes: readonly Recipe[],
  profile: UserProfile,
): WeeklyPlan {
  const target = plan.meals.find(
    (meal) => meal.dayIndex === slot.dayIndex && meal.mealType === slot.mealType,
  );
  if (!target) throw new Error("Ce créneau n'existe pas dans la semaine.");
  if (!recipeIsAllowed(recipe, profile)) {
    throw new Error("Cette recette ne respecte pas votre profil (allergies, régime, équipement ou temps).");
  }
  if (!recipe.mealTypes.includes(slot.mealType)) {
    throw new Error("Cette recette ne correspond pas au type du repas choisi.");
  }
  const updated = replacePlannedMeal(plan, target.id, recipe, recipes);
  return {
    ...updated,
    meals: updated.meals.map((meal) => (meal.id === target.id ? { ...meal, source: "manual" as const } : meal)),
  };
}

export function scaleIngredients(recipe: Recipe, servings: number): Ingredient[] {
  const safeServings = Math.max(0, servings);
  return recipe.ingredients.map((ingredient) => ({
    ...ingredient,
    quantity: round(ingredient.quantity * safeServings, 2),
  }));
}

export function buildShoppingList(
  plan: WeeklyPlan,
  recipes: readonly Recipe[],
  options: {
    checkedShoppingItemIds?: readonly string[];
    pantryIngredientIds?: readonly string[];
    /** Quantities already at home, deducted before the list is shown. */
    pantryAmounts?: Readonly<Record<string, PantryAmount>>;
  } = {},
): ShoppingItem[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const pantry = new Set((options.pantryIngredientIds ?? []).map(canonicalIngredientId));
  const checked = new Set((options.checkedShoppingItemIds ?? []).map(legacyShoppingItemKeyToCanonical));
  const aggregated = new Map<string, {
    ingredientId: string;
    name: string;
    category: ShoppingItem["category"];
    amounts: Map<ShoppingItem["amounts"][number]["unit"], number>;
  }>();

  for (const meal of plan.meals) {
    if (meal.skipped) continue;
    const recipe = byId.get(meal.recipeId);
    if (!recipe) continue;
    for (const ingredient of scaleIngredients(recipe, meal.portions)) {
      const ingredientId = canonicalIngredientId(ingredient.id);
      if (ingredient.pantryStaple || shoppingRuleFor(ingredientId)?.pantry_staple) continue;
      const unit = ingredient.unit === "c_soupe" || ingredient.unit === "c_cafe" ? "ml" : ingredient.unit;
      const quantity = ingredient.unit === "c_soupe"
        ? ingredient.quantity * 15
        : ingredient.unit === "c_cafe"
          ? ingredient.quantity * 5
          : ingredient.quantity;
      const previous = aggregated.get(ingredientId);
      if (previous) {
        previous.amounts.set(unit, round((previous.amounts.get(unit) ?? 0) + quantity, 2));
      } else {
        aggregated.set(ingredientId, {
          ingredientId,
          name: ingredient.name,
          category: ingredient.category,
          amounts: new Map([[unit, round(quantity, 2)]]),
        });
      }
    }
  }

  const stock = new Map(
    Object.entries(options.pantryAmounts ?? {}).map(([id, amount]) => [canonicalIngredientId(id), amount]),
  );

  return [...aggregated.values()].map((item) => {
    const owned = stock.get(item.ingredientId);
    if (owned) {
      // Deduct what is already at home, in the matching unit only.
      const current = item.amounts.get(owned.unit);
      if (current !== undefined) item.amounts.set(owned.unit, round(Math.max(0, current - owned.quantity), 2));
    }
    const amounts = [...item.amounts.entries()]
      .filter(([, quantity]) => quantity > 0)
      .map(([unit, quantity]) => ({ unit, quantity }))
      .sort((left, right) => left.unit.localeCompare(right.unit));
    return {
      ingredientId: item.ingredientId,
      name: item.name,
      category: item.category,
      amounts,
      purchaseSuggestion: purchaseSuggestionFor(item.ingredientId, amounts),
      checked: checked.has(item.ingredientId),
      inPantry: pantry.has(item.ingredientId),
    };
  })
    // Fully covered by the pantry: nothing left to buy.
    .filter((item) => item.amounts.length > 0)
    .sort(
      (left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name, "fr"),
    );
}

/** Days between the Monday a plan starts and the given date, negative before. */
export function planDayOffset(plan: WeeklyPlan, today: string): number {
  const toUtc = (value: string): number => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(today) - toUtc(plan.startsOn)) / 86_400_000);
}

/** True once the plan's week is over and it should be archived, not shown as current. */
export function isPlanExpired(plan: WeeklyPlan | null | undefined, today: string): boolean {
  return Boolean(plan && planDayOffset(plan, today) > 6);
}

export interface PlanReplayReport {
  /** Archived meals the current profile can no longer accept. */
  blockedMeals: PlannedMeal[];
  /** Slots the archived week cannot fill, e.g. after switching to 3 meals a day. */
  missingSlots: number;
  canReplay: boolean;
}

/** Checks an archived week against the current profile before reusing it. */
export function inspectPlanReplay(
  plan: WeeklyPlan | null | undefined,
  recipes: readonly Recipe[],
  profile: UserProfile,
): PlanReplayReport {
  if (!plan) return { blockedMeals: [], missingSlots: 0, canReplay: false };
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const mealTypes = requiredMealTypes(profile.mealsPerDay);
  const usable = plan.meals.filter((meal) => mealTypes.includes(meal.mealType));
  const blockedMeals = usable.filter((meal) => {
    const recipe = byId.get(meal.recipeId);
    return !recipe || !recipeIsAllowed(recipe, profile);
  });
  const missingSlots = mealTypes.reduce(
    (total, mealType) => total + Math.max(0, 7 - usable.filter((meal) => meal.mealType === mealType).length),
    0,
  );

  return { blockedMeals, missingSlots, canReplay: blockedMeals.length === 0 && missingSlots === 0 };
}

/**
 * Rebuilds an archived week as a fresh plan for the requested dates. Portions
 * follow the current profile; cooked and locked marks start over.
 */
export function restorePlan(
  plan: WeeklyPlan,
  recipes: readonly Recipe[],
  profile: UserProfile,
  options: { startsOn: string; generatedAt?: string } = { startsOn: DEFAULT_START },
): WeeklyPlan {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const mealTypes = requiredMealTypes(profile.mealsPerDay);
  const people = Math.max(1, Math.round(profile.people));
  const meals = plan.meals
    .filter((meal) => mealTypes.includes(meal.mealType))
    .map((meal) => ({
      ...meal,
      id: `day-${meal.dayIndex}-${meal.mealType}`,
      portions: people,
      completed: false,
      locked: false,
    }));

  return {
    id: `week-${options.startsOn}-${hashSeed(`${plan.id}:${options.startsOn}`).toString(36)}`,
    startsOn: options.startsOn,
    generatedAt: options.generatedAt ?? `${options.startsOn}T00:00:00.000Z`,
    profileSnapshot: { ...profile },
    meals,
    estimatedCost: totalPlanCost(meals, byId),
    version: 1,
  };
}

/** Meals of the next day that must be started tonight. */
export function mealsToStartTonight(
  plan: WeeklyPlan | null | undefined,
  recipes: readonly Recipe[],
  today: string,
): Array<{ meal: PlannedMeal; recipe: Recipe; minutes: number }> {
  if (!plan) return [];
  const offset = planDayOffset(plan, today);
  if (offset < -1 || offset > 5) return [];
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return plan.meals
    .filter((meal) => meal.dayIndex === offset + 1 && !meal.skipped && !meal.leftoverOf)
    .flatMap((meal) => {
      const recipe = byId.get(meal.recipeId);
      const advance = recipe ? advancePrepFor(recipe) : null;
      return recipe && advance?.level === "day-before" ? [{ meal, recipe, minutes: advance.minutes }] : [];
    });
}

/** Minimal iCalendar export of a week, one event per meal. */
export function planToCalendar(plan: WeeklyPlan, recipes: readonly Recipe[]): string {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const times: Record<MealType, string> = { breakfast: "0800", lunch: "1230", dinner: "1930" };
  const labels: Record<MealType, string> = { breakfast: "Petit-déjeuner", lunch: "Déjeuner", dinner: "Dîner" };
  const escape = (value: string): string => value.replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
  const dayStamp = (dayIndex: number): string => {
    const [year, month, day] = plan.startsOn.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + dayIndex));
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  };

  const events = plan.meals.filter((meal) => !meal.skipped).map((meal) => {
    const recipe = byId.get(meal.recipeId);
    const start = `${dayStamp(meal.dayIndex)}T${times[meal.mealType]}00`;
    return [
      "BEGIN:VEVENT",
      `UID:${plan.id}-${meal.id}@inflamm-menu`,
      `DTSTAMP:${plan.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART;TZID=Europe/Paris:${start}`,
      `DURATION:PT45M`,
      `SUMMARY:${escape(`${labels[meal.mealType]} — ${recipe?.title ?? "Repas"}`)}`,
      `DESCRIPTION:${escape(`${meal.portions} portions · Inflamm’Menu${meal.leftoverOf ? " · restes" : ""}`)}`,
      "END:VEVENT",
    ].join("\r\n");
  });

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InflammMenu//FR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}

export interface ShoppingListTextOptions {
  /** Human readable week, e.g. "3–9 août". */
  week?: string;
  people?: number;
  /** UI labels for each aisle; the raw category id is used when absent. */
  categoryLabels?: Partial<Record<ShoppingItem["category"], string>>;
}

/**
 * Plain-text rendering of a shopping list, shared by copy, share and download.
 * Items already checked or marked as in-store are summarized rather than listed
 * so the shared text stays actionable.
 */
export function formatShoppingListText(
  items: readonly ShoppingItem[],
  options: ShoppingListTextOptions = {},
): string {
  const remaining = items.filter((item) => !item.checked && !item.inPantry);
  const removed = items.length - remaining.length;
  const header = ["Liste de courses — Inflamm’Menu"];
  const context = [
    options.week ? `Semaine du ${options.week}` : "",
    options.people ? `${options.people} personne${options.people > 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  if (context.length) header.push(context.join(" · "));

  const categories = [...new Set(remaining.map((item) => item.category))];
  const groups = categories.map((category) => {
    const label = options.categoryLabels?.[category] ?? category;
    const lines = remaining
      .filter((item) => item.category === category)
      .map((item) => {
        const amounts = formatShoppingAmounts(item.amounts);
        const suggestion = item.purchaseSuggestion && item.purchaseSuggestion !== amounts
          ? ` (${item.purchaseSuggestion})`
          : "";
        return `- ${item.name} — ${amounts}${suggestion}`;
      });
    return [label.toLocaleUpperCase("fr-FR"), ...lines].join("\n");
  });

  const footer = [
    remaining.length
      ? `${remaining.length} article${remaining.length > 1 ? "s" : ""} à acheter.`
      : "Rien à acheter : tout est coché ou déjà en réserve.",
    removed ? `${removed} article${removed > 1 ? "s" : ""} déjà coché${removed > 1 ? "s" : ""} ou en réserve.` : "",
    "Quantités et prix indicatifs, à ajuster selon les produits.",
  ].filter(Boolean);

  return [header.join("\n"), ...groups, footer.join("\n")].join("\n\n");
}

/**
 * Keeps the ticks that still make sense after the week changed. Anything the
 * new shopping list no longer contains is dropped; the rest survives, so a list
 * already ticked in the shop is not wiped by a single meal swap.
 */
export function reconcileCheckedItems(
  plan: WeeklyPlan | null | undefined,
  recipes: readonly Recipe[],
  checkedShoppingItemIds: readonly string[],
): string[] {
  if (!plan) return [];
  // Pantry items stay in the list, only flagged, so their tick stays valid too.
  const available = new Set(buildShoppingList(plan, recipes).map((item) => item.ingredientId));
  return [...new Set(checkedShoppingItemIds.map(legacyShoppingItemKeyToCanonical))].filter((id) =>
    available.has(id),
  );
}

export function summarizePlan(
  plan: WeeklyPlan,
  recipes: readonly Recipe[],
  profile: UserProfile = plan.profileSnapshot,
): PlanSummary {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const selected = plan.meals.map((meal) => byId.get(meal.recipeId)).filter((item): item is Recipe => Boolean(item));
  // Leftovers are eaten, not cooked: they must not lower the average session time.
  const cooked = plan.meals
    .filter((meal) => !meal.leftoverOf && !meal.skipped)
    .map((meal) => byId.get(meal.recipeId))
    .filter((item): item is Recipe => Boolean(item));
  const averagePrepMinutes = cooked.length
    ? round(cooked.reduce((total, recipe) => total + recipe.prepMinutes, 0) / cooked.length, 1)
    : 0;

  return {
    mealCount: plan.meals.length,
    cookingSessions: cooked.length,
    estimatedCost: plan.estimatedCost,
    averagePrepMinutes,
    legumeMeals: tagCount(selected, TAGS.legume),
    fishMeals: tagCount(selected, TAGS.fish),
    wholeGrainMeals: tagCount(selected, TAGS.wholeGrain),
    nutOrSeedMeals: selected.filter(hasNutOrSeed).length,
    seasonalMeals: selected.filter(
      (recipe) => recipe.seasons.includes("summer") || recipe.seasons.includes("all-year"),
    ).length,
    withinBudget: plan.estimatedCost <= profile.weeklyBudget,
    averageCalories: average(selected.map((recipe) => recipe.nutrition.calories)),
    averageProtein: average(selected.map((recipe) => recipe.nutrition.protein)),
    averageFiber: average(selected.map((recipe) => recipe.nutrition.fiber)),
  };
}

function average(values: readonly number[]): number {
  if (!values.length) return 0;
  return round(values.reduce((total, value) => total + value, 0) / values.length, 1);
}
