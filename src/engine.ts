import type {
  Ingredient,
  MealType,
  PlannedMeal,
  Recipe,
  ShoppingItem,
  UserProfile,
  WeeklyPlan,
} from "./domain";

export interface GeneratePlanOptions {
  /** Stable input used to make otherwise equivalent choices reproducible. */
  seed?: string | number;
  /** Monday of the generated week, in YYYY-MM-DD format. */
  startsOn?: string;
  /** Mainly useful when importing a plan. Defaults to midnight on startsOn. */
  generatedAt?: string;
  season?: "spring" | "summer" | "autumn" | "winter";
}

export interface PlanSummary {
  mealCount: number;
  estimatedCost: number;
  averagePrepMinutes: number;
  legumeMeals: number;
  fishMeals: number;
  wholeGrainMeals: number;
  nutOrSeedMeals: number;
  seasonalMeals: number;
  withinBudget: boolean;
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
    .trim()
    .toLowerCase()
    .replace(/[ _]+/g, "-");
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

function recipeIsAllowed(recipe: Recipe, profile: UserProfile): boolean {
  const allergies = new Set(profile.allergies.map(normalize));
  const excluded = new Set(profile.excludedIngredientIds.map(normalize));
  const recipeAllergens = [
    ...recipe.allergens,
    ...recipe.ingredients.flatMap((ingredient) => ingredient.allergens ?? []),
  ];

  return (
    recipe.diet.includes(profile.diet) &&
    recipe.prepMinutes <= profile.maxPrepMinutes &&
    recipe.equipment.every((item) => profile.equipment.includes(item)) &&
    !recipeAllergens.some((allergen) => allergies.has(normalize(allergen))) &&
    !recipe.ingredients.some((ingredient) => excluded.has(normalize(ingredient.id)))
  );
}

function ingredientReuse(recipe: Recipe, selected: readonly Recipe[]): number {
  if (selected.length === 0) return 0;
  const used = new Set(selected.flatMap((item) => item.ingredients.map((ingredient) => ingredient.id)));
  return recipe.ingredients.reduce((total, ingredient) => total + (used.has(ingredient.id) ? 1 : 0), 0);
}

function tagCount(recipes: readonly Recipe[], candidates: readonly string[]): number {
  return recipes.reduce((total, recipe) => total + (hasTag(recipe, candidates) ? 1 : 0), 0);
}

function totalPlanCost(meals: readonly PlannedMeal[], byId: ReadonlyMap<string, Recipe>): number {
  return round(
    meals.reduce((total, meal) => {
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

  for (const mealType of mealTypes) {
    const needed = 7;
    const available = eligible.filter((recipe) => recipe.mealTypes.includes(mealType)).length;
    if (available < needed) {
      throw new Error(
        `Catalogue insuffisant pour ${mealType}: ${available} recette(s) compatible(s), ${needed} requises.`,
      );
    }
  }

  const used = new Set<string>();
  const selected: Recipe[] = [];
  const meals: PlannedMeal[] = [];
  const people = Math.max(1, Math.round(profile.people));

  for (const slot of slots) {
    const legumeDeficit = Math.max(0, 2 - tagCount(selected, TAGS.legume));
    const fishDeficit = profile.diet === "classic" ? Math.max(0, 2 - tagCount(selected, TAGS.fish)) : 0;
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
        // Cost remains meaningful even when nutrition/season scores are tied.
        return targetScore + qualityScore - recipe.costPerPortion * people * 7;
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
      const previous = byId.get(meal.recipeId);
      if (!previous) return;
      for (const candidate of eligible) {
        if (used.has(candidate.id) || !candidate.mealTypes.includes(meal.mealType)) continue;
        const losesLegume = hasTag(previous, TAGS.legume) && !hasTag(candidate, TAGS.legume);
        const losesFish = hasTag(previous, TAGS.fish) && !hasTag(candidate, TAGS.fish);
        if (losesLegume && currentLegumes <= 2) continue;
        if (profile.diet === "classic" && losesFish && currentFish <= 2) continue;
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
      const score = (recipe: Recipe): number => {
        let value = 0;
        if (normalizedReason.includes("rapide") || normalizedReason.includes("time")) value -= recipe.prepMinutes * 5;
        if (normalizedReason.includes("budget") || normalizedReason.includes("cher")) value -= recipe.costPerPortion * 20;
        if (normalizedReason.includes("veget")) value += recipe.diet.includes("vegetarian") ? 100 : 0;
        if (normalizedReason.includes("ingredient") && current) {
          value += ingredientReuse(recipe, [current]) * 4;
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
  const recipeIds = new Set(plan.meals.map((meal) => meal.recipeId));
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

  const meals = plan.meals.map((meal) =>
    meal.id === slotId
      ? { ...meal, recipeId: replacementId, source: "replacement" as const, completed: false }
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
  _profile: UserProfile,
  pantryIds: readonly string[] = [],
): ShoppingItem[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const pantry = new Set(pantryIds.map(normalize));
  const aggregated = new Map<string, ShoppingItem>();

  for (const meal of plan.meals) {
    const recipe = byId.get(meal.recipeId);
    if (!recipe) continue;
    for (const ingredient of scaleIngredients(recipe, meal.portions)) {
      const unit = ingredient.unit === "c_soupe" || ingredient.unit === "c_cafe" ? "ml" : ingredient.unit;
      const quantity = ingredient.unit === "c_soupe"
        ? ingredient.quantity * 15
        : ingredient.unit === "c_cafe"
          ? ingredient.quantity * 5
          : ingredient.quantity;
      const key = `${ingredient.id}:${unit}`;
      const previous = aggregated.get(key);
      if (previous) {
        previous.quantity = round(previous.quantity + quantity, 2);
      } else {
        const inPantry = pantry.has(normalize(ingredient.id));
        aggregated.set(key, {
          ingredientId: ingredient.id,
          name: ingredient.name,
          category: ingredient.category,
          quantity: round(quantity, 2),
          unit,
          checked: inPantry,
          inPantry,
        });
      }
    }
  }

  return [...aggregated.values()].sort(
    (left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name, "fr"),
  );
}

export function summarizePlan(
  plan: WeeklyPlan,
  recipes: readonly Recipe[],
  profile: UserProfile = plan.profileSnapshot,
): PlanSummary {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const selected = plan.meals.map((meal) => byId.get(meal.recipeId)).filter((item): item is Recipe => Boolean(item));
  const averagePrepMinutes = selected.length
    ? round(selected.reduce((total, recipe) => total + recipe.prepMinutes, 0) / selected.length, 1)
    : 0;

  return {
    mealCount: plan.meals.length,
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
  };
}
