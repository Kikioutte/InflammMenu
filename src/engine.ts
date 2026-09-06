import { associationRecipeAllowed, isAssociationRecipe } from "./food-associations.ts";
import type {
  DayConstraint,
  Ingredient,
  MealType,
  PantryAmount,
  PlannedMeal,
  Recipe,
  Season,
  ShoppingItem,
  UserProfile,
  WeeklyPlan,
} from "./domain.ts";
import {
  canonicalIngredientId,
  formatShoppingAmounts,
  legacyShoppingItemKeyToCanonical,
  purchaseSuggestionFor,
  shoppingIdentityFor,
  shoppingRuleFor,
} from "./shopping.ts";
import {
  applySubstitutionToIngredient,
  substitutionRuleById,
  substitutionsForIngredient,
  type IngredientSubstitutionRule,
} from "./substitutions.ts";
import { canonicalAllergen } from "./allergens.ts";

type PlanningSeason = Exclude<Season, "all-year">;

export interface GeneratePlanOptions {
  /** Stable input used to make otherwise equivalent choices reproducible. */
  seed?: string | number;
  /** Monday of the generated week, in YYYY-MM-DD format. */
  startsOn?: string;
  /** Mainly useful when importing a plan. Defaults to midnight on startsOn. */
  generatedAt?: string;
  season?: PlanningSeason;
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
  /** Distinct whole plant ingredients, herbs and spices used during the week. */
  plantDiversity: number;
  plantIngredients: string[];
  withinBudget: boolean;
  /** Estimated averages per portion, never a nutritional assessment. */
  averageCalories: number;
  averageProtein: number;
  averageFiber: number;
}

const DEFAULT_START = "2026-08-03";

/** Meteorological season of the plan's Monday, read without timezone conversion. */
export function seasonForIsoDate(startsOn: string): PlanningSeason {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(startsOn);
  const parsedMonth = match ? Number(match[1]) : Number.NaN;
  const month = parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : 8;
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

const TONIGHT_FORM_REPEAT_PENALTY = 24;
const TONIGHT_RECOMMENDATION_PAGE_SIZE = 6;
const TAGS = {
  wholeGrain: ["whole-grain", "cereale-complete", "cereales-completes", "complet"],
  nutSeed: ["nuts-seeds", "noix-graines", "noix", "graine", "graines"],
} as const;
const WEEKLY_TARGET_TAGS = { legume: "pulse", fish: "finfish" } as const;
const NUT_OR_SEED_INGREDIENTS = new Set([
  "almond",
  "almond-drink",
  "chia",
  "pumpkin-seed",
  "sesame",
  "walnut",
]);

export type RecipeForm = "soup" | "salad" | "bowl" | "other";

const RECIPE_FORM_CACHE = new WeakMap<Recipe, RecipeForm>();
const RECIPE_FORM_TAGS = {
  soup: ["soupe", "veloute", "potage", "gaspacho", "salmorejo", "minestrone"],
  salad: ["salade", "taboule"],
  bowl: ["bowl", "bol"],
} as const;

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

const NORMALIZED_TAGS = new WeakMap<Recipe, readonly string[]>();
const CLASSIFICATION_TAGS = new WeakMap<Recipe, readonly string[]>();
const NORMALIZED_TAG_CANDIDATES = new Map<string, ReadonlySet<string>>();
const REQUIRED_INGREDIENT_IDS = new WeakMap<Recipe, readonly string[]>();
const NUT_OR_SEED_CACHE = new WeakMap<Recipe, boolean>();
const RECIPE_ALLERGEN_CACHE = new WeakMap<Recipe, string[]>();

function normalizedTagsOf(recipe: Recipe): readonly string[] {
  const cached = NORMALIZED_TAGS.get(recipe);
  if (cached) return cached;
  const tags = recipe.tags.map(normalize);
  NORMALIZED_TAGS.set(recipe, tags);
  return tags;
}

/** Recipe-level tags with mechanically generated tags from optional ingredients removed. */
function classificationTagsOf(recipe: Recipe): readonly string[] {
  const cached = CLASSIFICATION_TAGS.get(recipe);
  if (cached) return cached;
  const optionalIngredientTags = new Set(recipe.ingredients
    .filter((ingredient) => ingredient.optional)
    .map((ingredient) => normalize(ingredient.name)));
  const tags = normalizedTagsOf(recipe).filter((tag) => !optionalIngredientTags.has(tag));
  CLASSIFICATION_TAGS.set(recipe, tags);
  return tags;
}

function requiredIngredientIdsOf(recipe: Recipe): readonly string[] {
  const cached = REQUIRED_INGREDIENT_IDS.get(recipe);
  if (cached) return cached;
  const ids = recipe.ingredients
    .filter((ingredient) => !ingredient.optional)
    .map((ingredient) => canonicalIngredientId(ingredient.id));
  REQUIRED_INGREDIENT_IDS.set(recipe, ids);
  return ids;
}

function hasTag(recipe: Recipe, candidates: readonly string[]): boolean {
  const key = candidates.join("\u0000");
  let wanted = NORMALIZED_TAG_CANDIDATES.get(key);
  if (!wanted) {
    wanted = new Set(candidates.map(normalize));
    NORMALIZED_TAG_CANDIDATES.set(key, wanted);
  }
  return classificationTagsOf(recipe).some((tag) =>
    [...wanted].some((candidate) => tag === candidate || tag.startsWith(`${candidate}-`)),
  );
}

function hasWeeklyTarget(recipe: Recipe, target: (typeof WEEKLY_TARGET_TAGS)[keyof typeof WEEKLY_TARGET_TAGS]): boolean {
  return classificationTagsOf(recipe).includes(target);
}

/** Broad serving form used only to avoid a visibly monotonous day. */
export function recipeForm(recipe: Recipe): RecipeForm {
  const cached = RECIPE_FORM_CACHE.get(recipe);
  if (cached) return cached;
  const title = normalize(recipe.title);
  const exactTags = new Set(normalizedTagsOf(recipe));
  const titleStartsWith = (words: readonly string[]) => words.some((word) =>
    title === word || title.startsWith(`${word}-`),
  );
  const taggedAs = (words: readonly string[]) => words.some((word) => exactTags.has(word));
  // A bowl can legitimately be catalogued as a salad, so its explicit title
  // takes precedence over the broader catalogue category.
  const result: RecipeForm = titleStartsWith(RECIPE_FORM_TAGS.bowl) || taggedAs(RECIPE_FORM_TAGS.bowl)
    ? "bowl"
    : titleStartsWith(RECIPE_FORM_TAGS.soup) || taggedAs(RECIPE_FORM_TAGS.soup)
      ? "soup"
      : titleStartsWith(RECIPE_FORM_TAGS.salad) || taggedAs(RECIPE_FORM_TAGS.salad)
        ? "salad"
        : "other";
  RECIPE_FORM_CACHE.set(recipe, result);
  return result;
}

function hasNutOrSeed(recipe: Recipe): boolean {
  const cached = NUT_OR_SEED_CACHE.get(recipe);
  if (cached !== undefined) return cached;
  const result = hasTag(recipe, TAGS.nutSeed)
    || requiredIngredientIdsOf(recipe).some((id) => NUT_OR_SEED_INGREDIENTS.has(normalize(id)));
  NUT_OR_SEED_CACHE.set(recipe, result);
  return result;
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

/**
 * A generated week should favour the strongest compatible recipes without
 * turning a tiny score difference into a permanent winner. Recipes inside
 * this score window remain eligible for the seeded, reproducible choice.
 */
const WEEKLY_SELECTION_TOLERANCE = 50;
const MAX_WEEKLY_COST_PENALTY = 40;
const REPEATED_DAILY_FORM_PENALTY = 180;

function cappedWeeklyCostPenalty(recipe: Recipe, portions: number): number {
  return Math.min(MAX_WEEKLY_COST_PENALTY, recipe.costPerPortion * portions * 7);
}

function selectSeededWeeklyCandidate(
  candidates: readonly Recipe[],
  score: (recipe: Recipe) => number,
  seed: string | number,
  slotKey: string,
): Recipe {
  const ranked = [...candidates].sort((left, right) =>
    score(right) - score(left) || left.id.localeCompare(right.id),
  );
  const bestScore = score(ranked[0]);
  const pool = ranked.filter((recipe) => score(recipe) >= bestScore - WEEKLY_SELECTION_TOLERANCE);
  const index = Math.min(pool.length - 1, Math.floor(seededRank(seed, slotKey) * pool.length));
  return pool[index];
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
  const cached = RECIPE_ALLERGEN_CACHE.get(recipe);
  if (cached) return cached;
  const allergens = [
    ...new Set(
      [...recipe.allergens, ...recipe.ingredients.flatMap((ingredient) => ingredient.allergens ?? [])].map(
        canonicalAllergen,
      ),
    ),
  ].sort();
  RECIPE_ALLERGEN_CACHE.set(recipe, allergens);
  return allergens;
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

function substitutionSelections(meal?: PlannedMeal): Map<string, string> {
  return new Map((meal?.substitutions ?? []).map((selection) => [canonicalIngredientId(selection.ingredientId), selection.substitutionId]));
}

/** Reviewed alternatives available for one source ingredient. */
export function ingredientSubstitutionsFor(ingredient: Ingredient): IngredientSubstitutionRule[] {
  return substitutionsForIngredient(ingredient);
}

/** Ingredients actually used by a planned meal, including its reviewed swaps. */
export function ingredientsForPlannedMeal(recipe: Recipe, meal?: PlannedMeal, servings = meal?.portions ?? 1): Ingredient[] {
  const selections = substitutionSelections(meal);
  return recipe.ingredients.map((ingredient) => {
    const selectedId = selections.get(canonicalIngredientId(ingredient.id));
    const rule = selectedId ? substitutionRuleById(selectedId) : undefined;
    const applicable = rule && substitutionsForIngredient(ingredient).some((candidate) => candidate.id === rule.id);
    const effective = applicable ? applySubstitutionToIngredient(ingredient, rule) : ingredient;
    return { ...effective, quantity: round(effective.quantity * Math.max(0, servings), 2) };
  });
}

/** Declared allergens after applying a meal's substitutions. */
export function plannedMealAllergens(recipe: Recipe, meal?: PlannedMeal): string[] {
  if (!meal?.substitutions?.length) return recipeAllergens(recipe);
  const originalIngredientAllergens = new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergens ?? []).map(canonicalAllergen));
  const recipeOnlyAllergens = recipe.allergens.map(canonicalAllergen).filter((allergen) => !originalIngredientAllergens.has(allergen));
  const effectiveIngredientAllergens = ingredientsForPlannedMeal(recipe, meal, 1)
    .flatMap((ingredient) => ingredient.allergens ?? [])
    .map(canonicalAllergen);
  return [...new Set([...recipeOnlyAllergens, ...effectiveIngredientAllergens])].sort();
}

/** Estimated meal cost after applying reviewed price deltas. */
export function plannedMealCost(recipe: Recipe, meal: Pick<PlannedMeal, "portions" | "substitutions">): number {
  const delta = (meal.substitutions ?? []).reduce((total, selection) => {
    const ingredient = recipe.ingredients.find((item) => canonicalIngredientId(item.id) === canonicalIngredientId(selection.ingredientId));
    if (!ingredient) return total;
    const rule = substitutionsForIngredient(ingredient).find((candidate) => candidate.id === selection.substitutionId);
    return total + (rule?.costDeltaPerPortion ?? 0);
  }, 0);
  return round(Math.max(0, (recipe.costPerPortion + delta) * Math.max(0, meal.portions)));
}

export function recipeIsAllowed(recipe: Recipe, profile: UserProfile): boolean {
  const allergies = new Set(profile.allergies.map(canonicalAllergen));
  const excluded = new Set(profile.excludedIngredientIds.map(canonicalIngredientId));

  return (
    associationRecipeAllowed(recipe, profile.associationMode) &&
    !(profile.dislikedRecipeIds ?? []).includes(recipe.id) &&
    recipe.diet.includes(profile.diet) &&
    recipe.prepMinutes <= profile.maxPrepMinutes &&
    recipe.equipment.every((item) => profile.equipment.includes(item)) &&
    !recipeAllergens(recipe).some((allergen) => allergies.has(allergen)) &&
    !recipe.ingredients.some((ingredient) => !ingredient.optional && excluded.has(canonicalIngredientId(ingredient.id)))
  );
}

export function dayConstraintOf(profile: UserProfile, dayIndex: number): DayConstraint | undefined {
  return profile.dayConstraints?.find((constraint) => constraint.dayIndex === dayIndex);
}

/** Applies the global safety rules plus the active-time override for one slot. */
export function recipeIsAllowedForSlot(
  recipe: Recipe,
  profile: UserProfile,
  dayIndex: number,
): boolean {
  const constraint = dayConstraintOf(profile, dayIndex);
  const maxPrepMinutes = constraint?.maxPrepMinutes ?? profile.maxPrepMinutes;
  if (recipe.prepMinutes > maxPrepMinutes) return false;
  // Let recipeIsAllowed validate every global rule while substituting only the
  // time limit; daily overrides never weaken allergies, diet or equipment.
  return recipeIsAllowed(recipe, { ...profile, maxPrepMinutes });
}

/** Safety check for an already planned meal, after its reviewed substitutions. */
function plannedMealIsAllowedForSlot(meal: PlannedMeal, recipe: Recipe, profile: UserProfile): boolean {
  const constraint = dayConstraintOf(profile, meal.dayIndex);
  const maxPrepMinutes = constraint?.maxPrepMinutes ?? profile.maxPrepMinutes;
  const allergies = new Set(profile.allergies.map(canonicalAllergen));
  const excluded = new Set(profile.excludedIngredientIds.map(canonicalIngredientId));
  return (
    associationRecipeAllowed({ id: recipe.id, ingredients: ingredientsForPlannedMeal(recipe, meal, 1) }, profile.associationMode) &&
    !(profile.dislikedRecipeIds ?? []).includes(recipe.id) &&
    recipe.mealTypes.includes(meal.mealType) &&
    recipe.diet.includes(profile.diet) &&
    recipe.prepMinutes <= maxPrepMinutes &&
    recipe.equipment.every((item) => profile.equipment.includes(item)) &&
    !plannedMealAllergens(recipe, meal).some((allergen) => allergies.has(allergen)) &&
    !ingredientsForPlannedMeal(recipe, meal, 1)
      .some((ingredient) => !ingredient.optional && excluded.has(canonicalIngredientId(ingredient.id)))
  );
}

/** Portions for one precise slot, with the day-wide legacy override as fallback. */
export function portionsForSlot(profile: UserProfile, dayIndex: number, mealType: MealType): number {
  const constraint = dayConstraintOf(profile, dayIndex);
  const perMeal = constraint?.mealPortions?.find((item) => item.mealType === mealType)?.portions;
  const raw = perMeal ?? constraint?.portions ?? profile.people;
  return Math.min(MAX_MEAL_PORTIONS, Math.max(MIN_MEAL_PORTIONS, Math.round(raw)));
}

function slotIsSkipped(profile: UserProfile, dayIndex: number, mealType: MealType): boolean {
  return dayConstraintOf(profile, dayIndex)?.skippedMealTypes.includes(mealType) ?? false;
}

export interface TonightOptions {
  mealType: "lunch" | "dinner";
  maxPrepMinutes: number;
  portions: number;
  pantryIngredientIds?: readonly string[];
  favoriteRecipeIds?: readonly string[];
  season?: PlanningSeason;
  limit?: number;
}

export interface TonightRecommendation {
  recipe: Recipe;
  pantryMatches: number;
  estimatedCost: number;
}

export interface RecipeCompatibilityDiagnostic {
  compatibleCount: number;
  mealTypeCount: number;
  blockedBy: {
    associations?: number;
    allergies: number;
    disliked: number;
    diet: number;
    equipment: number;
    excludedIngredients: number;
    time: number;
  };
  /** Smallest active time among recipes that pass every rule except time. */
  minimumCompatibleMinutes?: number;
  /** Equipment needed by otherwise compatible recipes within the selected time. */
  missingEquipment: string[];
}

/**
 * Explains an empty candidate set without ever weakening a safety rule. Counts
 * are independent: a recipe may be blocked by more than one criterion.
 */
export function diagnoseRecipeCompatibility(
  recipes: readonly Recipe[],
  profile: UserProfile,
  options: { mealType: MealType; maxPrepMinutes?: number },
): RecipeCompatibilityDiagnostic {
  const candidates = recipes.filter((recipe) => recipe.mealTypes.includes(options.mealType));
  const maxPrepMinutes = options.maxPrepMinutes ?? profile.maxPrepMinutes;
  const allergies = new Set(profile.allergies.map(canonicalAllergen));
  const excluded = new Set(profile.excludedIngredientIds.map(canonicalIngredientId));
  const disliked = new Set(profile.dislikedRecipeIds ?? []);
  const checks = (recipe: Recipe) => ({
    associations: !associationRecipeAllowed(recipe, profile.associationMode),
    allergies: recipeAllergens(recipe).some((allergen) => allergies.has(allergen)),
    disliked: disliked.has(recipe.id),
    diet: !recipe.diet.includes(profile.diet),
    equipment: recipe.equipment.some((item) => !profile.equipment.includes(item)),
    excludedIngredients: recipe.ingredients.some((ingredient) => !ingredient.optional
      && excluded.has(canonicalIngredientId(ingredient.id))),
    time: recipe.prepMinutes > maxPrepMinutes,
  });
  const evaluated = candidates.map((recipe) => ({ recipe, checks: checks(recipe) }));
  const isClearExcept = (entry: typeof evaluated[number], ignored: keyof ReturnType<typeof checks>) =>
    (Object.entries(entry.checks) as Array<[keyof ReturnType<typeof checks>, boolean]>)
      .every(([key, blocked]) => key === ignored || !blocked);
  const timeOnly = evaluated.filter((entry) => isClearExcept(entry, "time"));
  const equipmentOnly = evaluated.filter((entry) => isClearExcept(entry, "equipment") && !entry.checks.time);

  return {
    compatibleCount: evaluated.filter((entry) => Object.values(entry.checks).every((blocked) => !blocked)).length,
    mealTypeCount: candidates.length,
    blockedBy: {
      ...(profile.associationMode && profile.associationMode !== "off" ? { associations: evaluated.filter((entry) => entry.checks.associations).length } : {}),
      allergies: evaluated.filter((entry) => entry.checks.allergies).length,
      disliked: evaluated.filter((entry) => entry.checks.disliked).length,
      diet: evaluated.filter((entry) => entry.checks.diet).length,
      equipment: evaluated.filter((entry) => entry.checks.equipment).length,
      excludedIngredients: evaluated.filter((entry) => entry.checks.excludedIngredients).length,
      time: evaluated.filter((entry) => entry.checks.time).length,
    },
    ...(timeOnly.length ? { minimumCompatibleMinutes: Math.min(...timeOnly.map((entry) => entry.recipe.prepMinutes)) } : {}),
    missingEquipment: [...new Set(equipmentOnly.flatMap((entry) =>
      entry.recipe.equipment.filter((item) => !profile.equipment.includes(item)),
    ))].sort(),
  };
}

export class RecipeCompatibilityError extends Error {
  diagnostic: RecipeCompatibilityDiagnostic;
  dayIndex?: number;
  mealType: MealType;

  constructor(message: string, diagnostic: RecipeCompatibilityDiagnostic, mealType: MealType, dayIndex?: number) {
    super(message);
    this.name = "RecipeCompatibilityError";
    this.diagnostic = diagnostic;
    this.dayIndex = dayIndex;
    this.mealType = mealType;
  }
}

/** Safe, explainable ideas for an immediate meal, ranked before limiting. */
export function recommendTonight(
  recipes: readonly Recipe[],
  profile: UserProfile,
  options: TonightOptions,
): TonightRecommendation[] {
  const maxPrepMinutes = Math.min(180, Math.max(5, Math.round(options.maxPrepMinutes)));
  const portions = Math.min(MAX_MEAL_PORTIONS, Math.max(MIN_MEAL_PORTIONS, Math.round(options.portions)));
  const requestedLimit = Number.isFinite(options.limit) ? Math.max(1, Math.round(options.limit as number)) : 3;
  const limit = Math.min(recipes.length, requestedLimit);
  const pantry = new Set((options.pantryIngredientIds ?? []).map(legacyShoppingItemKeyToCanonical));
  const favorites = new Set(options.favoriteRecipeIds ?? []);
  const softDisliked = new Set(profile.softDislikedRecipeIds ?? []);
  const seed = `${options.mealType}:${maxPrepMinutes}:${[...pantry].sort().join(",")}`;
  const ranked = recipes
    .filter((recipe) => recipe.mealTypes.includes(options.mealType)
      && recipeIsAllowed(recipe, { ...profile, maxPrepMinutes }))
    .map((recipe) => {
      const pantryMatches = requiredIngredientIdsOf(recipe).filter((id) => pantry.has(shoppingIdentityFor(id).shoppingId)).length;
      const seasonal = !options.season || recipe.seasons.includes(options.season) || recipe.seasons.includes("all-year");
      const score = pantryMatches * 120
        + (favorites.has(recipe.id) ? 80 : 0)
        + (seasonal ? 18 : 0)
        - (softDisliked.has(recipe.id) ? 200 : 0)
        - recipe.prepMinutes * 2
        - recipe.costPerPortion * portions * 4;
      return { recipe, pantryMatches, estimatedCost: mealCost(recipe, portions), score };
    })
    .sort((left, right) => right.score - left.score
      || seededRank(seed, left.recipe.id) - seededRank(seed, right.recipe.id)
      || left.recipe.title.localeCompare(right.recipe.title, "fr"));
  const remaining = [...ranked];
  const diversified: typeof ranked = [];

  // Preserve the score as the source of truth, then gently spread explicit
  // serving forms within each visible group. This never removes a compatible
  // recipe: when only one form is available, every result is still returned.
  while (remaining.length > 0) {
    const pageForms = new Map<Exclude<RecipeForm, "other">, number>();
    const pageLength = Math.min(TONIGHT_RECOMMENDATION_PAGE_SIZE, remaining.length);
    for (let pageIndex = 0; pageIndex < pageLength; pageIndex += 1) {
      let bestIndex = 0;
      let bestAdjustedScore = Number.NEGATIVE_INFINITY;
      remaining.forEach((candidate, index) => {
        const form = recipeForm(candidate.recipe);
        const repeatPenalty = form === "other"
          ? 0
          : (pageForms.get(form) ?? 0) * TONIGHT_FORM_REPEAT_PENALTY;
        const adjustedScore = candidate.score - repeatPenalty;
        if (adjustedScore > bestAdjustedScore) {
          bestIndex = index;
          bestAdjustedScore = adjustedScore;
        }
      });
      const [selected] = remaining.splice(bestIndex, 1);
      diversified.push(selected);
      const form = recipeForm(selected.recipe);
      if (form !== "other") pageForms.set(form, (pageForms.get(form) ?? 0) + 1);
    }
  }

  return diversified
    .slice(0, limit)
    .map(({ score: _score, ...recommendation }) => recommendation);
}

function ingredientReuseFromSet(recipe: Recipe, used: ReadonlySet<string>): number {
  return requiredIngredientIdsOf(recipe).reduce((total, id) => total + (used.has(id) ? 1 : 0), 0);
}

function ingredientReuse(recipe: Recipe, selected: readonly Recipe[]): number {
  if (selected.length === 0) return 0;
  return ingredientReuseFromSet(recipe, new Set(selected.flatMap(requiredIngredientIdsOf)));
}

function tagCount(recipes: readonly Recipe[], candidates: readonly string[]): number {
  return recipes.reduce((total, recipe) => total + (hasTag(recipe, candidates) ? 1 : 0), 0);
}

function weeklyTargetCount(
  recipes: readonly Recipe[],
  target: (typeof WEEKLY_TARGET_TAGS)[keyof typeof WEEKLY_TARGET_TAGS],
): number {
  return recipes.reduce((total, recipe) => total + (hasWeeklyTarget(recipe, target) ? 1 : 0), 0);
}

function totalPlanCost(meals: readonly PlannedMeal[], byId: ReadonlyMap<string, Recipe>): number {
  return round(
    meals.reduce((total, meal) => {
      if (meal.skipped) return total;
      const recipe = byId.get(meal.recipeId);
      return total + (recipe ? plannedMealCost(recipe, meal) : 0);
    }, 0),
  );
}

function dailyFormConflictCount(
  meals: readonly PlannedMeal[],
  dayIndex: number,
  byId: ReadonlyMap<string, Recipe>,
  replacement?: { mealIndex: number; recipe: Recipe },
): number {
  const counts = new Map<Exclude<RecipeForm, "other">, number>();
  meals.forEach((meal, mealIndex) => {
    if (meal.dayIndex !== dayIndex || meal.skipped) return;
    const recipe = replacement?.mealIndex === mealIndex ? replacement.recipe : byId.get(meal.recipeId);
    if (!recipe) return;
    const form = recipeForm(recipe);
    if (form === "other") return;
    counts.set(form, (counts.get(form) ?? 0) + 1);
  });
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
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
  const season = options.season ?? seasonForIsoDate(startsOn);
  const mealTypes = requiredMealTypes(profile.mealsPerDay);
  const slots = Array.from({ length: 7 }, (_, dayIndex) =>
    mealTypes.map((mealType) => ({ dayIndex, mealType })),
  ).flat();
  // Time is evaluated per slot below; all other profile safeguards are shared.
  const eligible = recipes.filter((recipe) => recipeIsAllowed(recipe, { ...profile, maxPrepMinutes: 24 * 60 }));
  const eligibleBySlot = new Map(slots.map((slot) => {
    const maxPrepMinutes = dayConstraintOf(profile, slot.dayIndex)?.maxPrepMinutes ?? profile.maxPrepMinutes;
    return [
      `${slot.dayIndex}-${slot.mealType}`,
      eligible.filter((recipe) => recipe.mealTypes.includes(slot.mealType) && recipe.prepMinutes <= maxPrepMinutes),
    ] as const;
  }));
  const catalogue = new Map(recipes.map((recipe) => [recipe.id, recipe]));
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
    if (!lockedRecipe || !recipeIsAllowedForSlot(lockedRecipe, profile, meal.dayIndex)) continue;
    if (!lockedRecipe.mealTypes.includes(meal.mealType)) continue;
    if (!mealTypes.includes(meal.mealType)) continue;
    if (meal.dayIndex < 0 || meal.dayIndex > 6) continue;
    if (keptSlots.has(slotKey)) continue;
    if ([...keptSlots.values()].some((kept) => kept.recipeId === meal.recipeId)) continue;
    if (meal.skipped || slotIsSkipped(profile, meal.dayIndex, meal.mealType)) continue;
    keptSlots.set(slotKey, {
      ...meal,
      portions: Math.min(MAX_MEAL_PORTIONS, Math.max(MIN_MEAL_PORTIONS, Math.round(meal.portions))),
      completed: false,
      skipped: false,
      leftoverOf: undefined,
      locked: true,
    });
  }

  const keptRecipeIds = new Set([...keptSlots.values()].map((meal) => meal.recipeId));

  for (const slot of slots) {
    if (keptSlots.has(`${slot.dayIndex}-${slot.mealType}`)) continue;
    const available = (eligibleBySlot.get(`${slot.dayIndex}-${slot.mealType}`) ?? [])
      .filter((recipe) => !keptRecipeIds.has(recipe.id)).length;
    if (available === 0) {
      const diagnostic = diagnoseRecipeCompatibility(recipes, profile, {
        mealType: slot.mealType,
        maxPrepMinutes: dayConstraintOf(profile, slot.dayIndex)?.maxPrepMinutes ?? profile.maxPrepMinutes,
      });
      throw new RecipeCompatibilityError(
        `Aucune recette compatible pour le jour ${slot.dayIndex + 1}.`,
        diagnostic,
        slot.mealType,
        slot.dayIndex,
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

    const slotKey = `${slot.dayIndex}-${slot.mealType}` as const;
    const slotCandidates = eligibleBySlot.get(slotKey) ?? [];
    const portions = portionsForSlot(profile, slot.dayIndex, slot.mealType);
    if (slotIsSkipped(profile, slot.dayIndex, slot.mealType)) {
      if (slotCandidates.length === 0) {
        const diagnostic = diagnoseRecipeCompatibility(recipes, profile, {
          mealType: slot.mealType,
          maxPrepMinutes: dayConstraintOf(profile, slot.dayIndex)?.maxPrepMinutes ?? profile.maxPrepMinutes,
        });
        throw new RecipeCompatibilityError(
          `Aucune recette compatible pour le jour ${slot.dayIndex + 1}.`,
          diagnostic,
          slot.mealType,
          slot.dayIndex,
        );
      }
      const displayRecipe = selectSeededWeeklyCandidate(
        slotCandidates,
        () => 0,
        seed,
        `${slotKey}-skipped`,
      );
      meals.push({
        id: `day-${slot.dayIndex}-${slot.mealType}`,
        dayIndex: slot.dayIndex as PlannedMeal["dayIndex"],
        mealType: slot.mealType,
        recipeId: displayRecipe.id,
        portions,
        source: "generated",
        skipped: true,
      });
      continue;
    }

    const legumeDeficit = Math.max(0, targets.legumeMeals - weeklyTargetCount(selected, WEEKLY_TARGET_TAGS.legume));
    const fishDeficit = profile.diet === "classic" ? Math.max(0, targets.fishMeals - weeklyTargetCount(selected, WEEKLY_TARGET_TAGS.fish)) : 0;
    const candidates = slotCandidates
      .filter((recipe) => !used.has(recipe.id));
    const selectedIngredientIds = new Set(selected.flatMap(requiredIngredientIdsOf));
    const formsAlreadyServedToday = new Set(
      [
        ...meals.filter((meal) => meal.dayIndex === slot.dayIndex && !meal.skipped),
        ...[...keptSlots.values()].filter((meal) => meal.dayIndex === slot.dayIndex && !meal.skipped),
      ]
        .map((meal) => catalogue.get(meal.recipeId))
        .filter((recipe): recipe is Recipe => Boolean(recipe))
        .map(recipeForm)
        .filter((form): form is Exclude<RecipeForm, "other"> => form !== "other"),
    );

    if (candidates.length === 0) {
      const diagnostic = diagnoseRecipeCompatibility(recipes, profile, {
        mealType: slot.mealType,
        maxPrepMinutes: dayConstraintOf(profile, slot.dayIndex)?.maxPrepMinutes ?? profile.maxPrepMinutes,
      });
      throw new RecipeCompatibilityError(
        `Les ${diagnostic.compatibleCount} recettes compatibles pour ce créneau sont déjà utilisées dans la semaine.`,
        diagnostic,
        slot.mealType,
        slot.dayIndex,
      );
    }

    const score = (recipe: Recipe): number => {
      const seasonal = recipe.seasons.includes(season) || recipe.seasons.includes("all-year");
      const targetScore =
        (legumeDeficit > 0 && hasWeeklyTarget(recipe, WEEKLY_TARGET_TAGS.legume) ? 700 : 0) +
        (fishDeficit > 0 && hasWeeklyTarget(recipe, WEEKLY_TARGET_TAGS.fish) ? 700 : 0);
      const qualityScore =
        (hasTag(recipe, TAGS.wholeGrain) ? 18 : 0) +
        (hasNutOrSeed(recipe) ? 14 : 0) +
        (seasonal ? 12 : 0) +
        ingredientReuseFromSet(recipe, selectedIngredientIds) * 5;
      // Saved recipes are a preference, weighted above quality nudges but
      // below the legume/fish targets, and never above the safety filters.
      const favoriteScore = favorites.has(recipe.id) ? 120 : 0;
      // « Bof » : la recette reste possible, mais passe après les autres.
      const softDislikeScore = softDisliked.has(recipe.id) ? -200 : 0;
      const form = recipeForm(recipe);
      const dailyFormScore = form !== "other" && formsAlreadyServedToday.has(form)
        ? -REPEATED_DAILY_FORM_PENALTY
        : 0;
      // Cost remains meaningful without erasing season, quality and variety.
      return targetScore + favoriteScore + softDislikeScore + qualityScore + dailyFormScore
        - cappedWeeklyCostPenalty(recipe, portions);
    };
    const selectedRecipe = selectSeededWeeklyCandidate(
      candidates,
      score,
      seed,
      `${slot.dayIndex}-${slot.mealType}`,
    );

    used.add(selectedRecipe.id);
    selected.push(selectedRecipe);
    meals.push({
      id: `day-${slot.dayIndex}-${slot.mealType}`,
      dayIndex: slot.dayIndex as PlannedMeal["dayIndex"],
      mealType: slot.mealType,
      recipeId: selectedRecipe.id,
      portions,
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
    const selectedNow = meals
      .filter((meal) => !meal.skipped)
      .map((meal) => byId.get(meal.recipeId))
      .filter((item): item is Recipe => Boolean(item));
    const currentLegumes = weeklyTargetCount(selectedNow, WEEKLY_TARGET_TAGS.legume);
    const currentFish = weeklyTargetCount(selectedNow, WEEKLY_TARGET_TAGS.fish);
    let best:
      | { mealIndex: number; recipe: Recipe; saving: number }
      | undefined;
    let bestWorseningForm:
      | { mealIndex: number; recipe: Recipe; saving: number }
      | undefined;

    meals.forEach((meal, mealIndex) => {
      if (meal.locked || meal.skipped) return;
      const previous = byId.get(meal.recipeId);
      if (!previous) return;
      for (const candidate of eligibleBySlot.get(`${meal.dayIndex}-${meal.mealType}`) ?? []) {
        if (used.has(candidate.id)) continue;
        const losesLegume = hasWeeklyTarget(previous, WEEKLY_TARGET_TAGS.legume) && !hasWeeklyTarget(candidate, WEEKLY_TARGET_TAGS.legume);
        const losesFish = hasWeeklyTarget(previous, WEEKLY_TARGET_TAGS.fish) && !hasWeeklyTarget(candidate, WEEKLY_TARGET_TAGS.fish);
        if (losesLegume && currentLegumes <= targets.legumeMeals) continue;
        if (profile.diet === "classic" && losesFish && currentFish <= targets.fishMeals) continue;
        const saving = (previous.costPerPortion - candidate.costPerPortion) * meal.portions;
        if (saving <= 0) continue;
        const beforeConflicts = dailyFormConflictCount(meals, meal.dayIndex, byId);
        const afterConflicts = dailyFormConflictCount(meals, meal.dayIndex, byId, { mealIndex, recipe: candidate });
        const option = { mealIndex, recipe: candidate, saving };
        if (afterConflicts <= beforeConflicts) {
          if (!best || saving > best.saving) best = option;
        } else if (!bestWorseningForm || saving > bestWorseningForm.saving) {
          bestWorseningForm = option;
        }
      }
    });

    // Respect the budget as a best-effort constraint, but exhaust every
    // non-monotonous saving before introducing a repeated daily form.
    best ??= bestWorseningForm;

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
  const usedIds = new Set(plan.meals.filter((item) => !item.skipped).map((item) => item.recipeId));
  const normalizedReason = normalize(reason);
  const season = seasonForIsoDate(plan.startsOn);

  return recipes
    .filter(
      (recipe) =>
        !usedIds.has(recipe.id) &&
        recipe.mealTypes.includes(meal.mealType) &&
        recipeIsAllowedForSlot(recipe, profile, meal.dayIndex),
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
        value += (recipe.seasons.includes(season) || recipe.seasons.includes("all-year")) ? 3 : 0;
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
  const existing = plan.meals.find((meal) => meal.id === slotId);
  if (!existing) return plan;
  const replacementRecipe = typeof replacement === "string"
    ? recipes.find((recipe) => recipe.id === replacementId)
    : replacement;
  if (replacementRecipe && !replacementRecipe.mealTypes.includes(existing.mealType)) {
    throw new Error("Cette recette ne correspond pas au type du repas remplacé.");
  }
  const usedByAnotherActiveMeal = plan.meals.some((meal) =>
    meal.id !== existing.id && !meal.leftoverOf && !meal.skipped && meal.recipeId === replacementId,
  );
  if (usedByAnotherActiveMeal) {
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
        substitutions: undefined,
        ...(existing.leftoverOf ? { leftoverOf: undefined } : {}),
      };
    }
    return meal.leftoverOf === slotId
      ? { ...meal, recipeId: replacementId, portions: existing.portions, completed: false, substitutions: undefined }
      : meal;
  });
  const lookup = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => lookup.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, lookup) : plan.estimatedCost };
}

/** Returns whether two slots can be exchanged without breaking meal or day constraints. */
export function canSwapPlannedMeals(
  plan: WeeklyPlan,
  firstSlotId: string,
  secondSlotId: string,
  recipes: readonly Recipe[] = [],
  profile?: UserProfile,
): boolean {
  const first = plan.meals.find((meal) => meal.id === firstSlotId);
  const second = plan.meals.find((meal) => meal.id === secondSlotId);
  if (!first || !second || first.id === second.id || first.leftoverOf || second.leftoverOf) return false;
  if (plan.meals.some((meal) => meal.leftoverOf === first.id || meal.leftoverOf === second.id)) return false;
  if (!profile) return true;

  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const firstRecipe = byId.get(first.recipeId);
  const secondRecipe = byId.get(second.recipeId);
  const firstAtSecondSlot = { ...first, dayIndex: second.dayIndex, mealType: second.mealType };
  const secondAtFirstSlot = { ...second, dayIndex: first.dayIndex, mealType: first.mealType };
  return Boolean(firstRecipe && secondRecipe
    && firstRecipe.mealTypes.includes(second.mealType)
    && secondRecipe.mealTypes.includes(first.mealType)
    && plannedMealIsAllowedForSlot(firstAtSecondSlot, firstRecipe, profile)
    && plannedMealIsAllowedForSlot(secondAtFirstSlot, secondRecipe, profile));
}

/** Swaps two planned meals, keeping every other mark attached to its dish. */
export function swapPlannedMeals(
  plan: WeeklyPlan,
  firstSlotId: string,
  secondSlotId: string,
  recipes: readonly Recipe[] = [],
  profile?: UserProfile,
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
  if (profile && !canSwapPlannedMeals(plan, firstSlotId, secondSlotId, recipes, profile)) {
      throw new Error("Cet échange ne respecte pas le temps ou le type de repas prévu pour ces jours.");
  }

  const carried = (meal: PlannedMeal, other: PlannedMeal): PlannedMeal => ({
    ...meal,
    recipeId: other.recipeId,
    portions: other.portions,
    source: "manual",
    completed: other.completed,
    locked: other.locked,
    skipped: other.skipped,
    substitutions: other.substitutions,
  });
  const meals = plan.meals.map((meal) => (meal.id === first.id
    ? carried(meal, second)
    : meal.id === second.id
      ? carried(meal, first)
      : meal));
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => byId.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, byId) : plan.estimatedCost };
}

/** Marks a meal as taken outside the household: no cooking, no shopping, no cost. */
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
  const duplicateActiveRecipe = !skipped && plan.meals.some((meal) =>
    meal.id !== target.id && !meal.leftoverOf && !meal.skipped && meal.recipeId === target.recipeId,
  );
  const replacement = duplicateActiveRecipe
    ? getReplacementCandidates(plan, slotId, recipes, plan.profileSnapshot, "different")[0]
    : undefined;
  if (duplicateActiveRecipe && !replacement) {
    throw new Error("Aucune recette inutilisée et compatible ne permet de remettre ce repas au menu.");
  }
  const meals = plan.meals.map((meal) => (meal.id === slotId
    ? {
        ...meal,
        recipeId: replacement?.id ?? meal.recipeId,
        skipped,
        ...(replacement ? { source: "replacement" as const, substitutions: undefined } : {}),
        ...(skipped ? { completed: false, locked: false } : {}),
      }
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
    session.servesLater += plan.meals.filter((other) => other.leftoverOf === meal.id && !other.skipped).length;
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
  const meals = plan.meals.map((meal) => (
    meal.id === slotId || meal.leftoverOf === slotId ? { ...meal, portions: safePortions } : meal
  ));
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const canRecalculate = meals.every((meal) => byId.has(meal.recipeId));
  return { ...plan, meals, estimatedCost: canRecalculate ? totalPlanCost(meals, byId) : plan.estimatedCost };
}

/** Applies or removes one reviewed ingredient replacement on a meal. */
export function setMealIngredientSubstitution(
  plan: WeeklyPlan,
  slotId: string,
  ingredientId: string,
  substitutionId: string | null,
  recipes: readonly Recipe[],
  profile: UserProfile = plan.profileSnapshot,
): WeeklyPlan {
  const target = plan.meals.find((meal) => meal.id === slotId);
  const recipe = target ? recipes.find((item) => item.id === target.recipeId) : undefined;
  if (!target || !recipe) return plan;
  const sourceIngredient = recipe.ingredients.find((item) => canonicalIngredientId(item.id) === canonicalIngredientId(ingredientId));
  if (!sourceIngredient) return plan;

  if (substitutionId && isAssociationRecipe(recipe.id)) throw new Error("Cette collection utilise des substitutions culinaires indiquées dans la fiche ; les remplacements automatiques ne sont pas encore relus pour ces recettes.");

  if (substitutionId) {
    const rule = substitutionsForIngredient(sourceIngredient).find((candidate) => candidate.id === substitutionId);
    if (!rule) throw new Error("Cette substitution n’est pas disponible pour cet ingrédient.");
    const replacementId = canonicalIngredientId(rule.replacement.id);
    const blockedAllergens = new Set(profile.allergies.map(canonicalAllergen));
    if ((rule.replacement.allergens ?? []).map(canonicalAllergen).some((allergen) => blockedAllergens.has(allergen))) {
      throw new Error("Cette substitution contient un allergène exclu par votre profil.");
    }
    if (profile.excludedIngredientIds.map(canonicalIngredientId).includes(replacementId)) {
      throw new Error("Cet ingrédient de remplacement est exclu par votre profil.");
    }
  }

  const rootId = target.leftoverOf ?? target.id;
  const nextSelections = (meal: PlannedMeal) => {
    const kept = (meal.substitutions ?? []).filter((selection) => canonicalIngredientId(selection.ingredientId) !== canonicalIngredientId(ingredientId));
    return substitutionId ? [...kept, { ingredientId: canonicalIngredientId(ingredientId), substitutionId }] : kept;
  };
  const meals = plan.meals.map((meal) => (meal.id === rootId || meal.leftoverOf === rootId
    ? { ...meal, substitutions: nextSelections(meal) }
    : meal));
  const byId = new Map(recipes.map((item) => [item.id, item]));
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
}

export interface PlanProgress {
  completed: number;
  total: number;
  /** Share of cooked meals between 0 and 1, and 0 for an empty plan. */
  ratio: number;
}

export function planProgress(plan: WeeklyPlan | null | undefined): PlanProgress {
  const tracked = plan?.meals.filter((meal) => !meal.skipped && !meal.leftoverOf) ?? [];
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
        plannedMealIsAllowedForSlot(meal, recipe, profile) &&
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
  if (!source || source.leftoverOf || source.skipped) return [];
  const recipe = recipes.find((item) => item.id === source.recipeId);
  if (!recipe) return [];

  return plan.meals.filter((meal) => {
    const gap = meal.dayIndex - source.dayIndex;
    return (
      meal.id !== source.id &&
      gap > 0 &&
      gap <= MAX_LEFTOVER_DAYS &&
      !meal.leftoverOf &&
      !meal.skipped &&
      meal.mealType === source.mealType &&
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
    ? { ...meal, recipeId: source.recipeId, portions: source.portions, source: "manual" as const, completed: false, locked: false, skipped: false, leftoverOf: sourceSlotId, substitutions: source.substitutions }
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
  if (!recipeIsAllowed(recipe, { ...profile, maxPrepMinutes: 24 * 60 })) return [];
  return plan.meals
    .filter((meal) => recipe.mealTypes.includes(meal.mealType) && recipeIsAllowedForSlot(recipe, profile, meal.dayIndex))
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
  if (!recipeIsAllowedForSlot(recipe, profile, slot.dayIndex)) {
    throw new Error("Cette recette ne respecte pas votre profil (allergies, régime, équipement ou temps).");
  }
  if (!recipe.mealTypes.includes(slot.mealType)) {
    throw new Error("Cette recette ne correspond pas au type du repas choisi.");
  }
  const updated = replacePlannedMeal(plan, target.id, recipe, recipes);
  const meals = updated.meals.map((meal) => (meal.id === target.id
    ? { ...meal, source: "manual" as const, skipped: false }
    : meal));
  const lookup = new Map([...recipes, recipe].map((item) => [item.id, item]));
  const canRecalculate = meals.every((meal) => lookup.has(meal.recipeId));
  return {
    ...updated,
    meals,
    estimatedCost: canRecalculate ? totalPlanCost(meals, lookup) : updated.estimatedCost,
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
  const pantry = new Set((options.pantryIngredientIds ?? []).map(legacyShoppingItemKeyToCanonical));
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
    for (const ingredient of ingredientsForPlannedMeal(recipe, meal)) {
      const culinaryId = canonicalIngredientId(ingredient.id);
      const identity = shoppingIdentityFor(culinaryId);
      const ingredientId = identity.shoppingId;
      if (ingredient.optional || ingredient.pantryStaple || shoppingRuleFor(culinaryId)?.pantry_staple) continue;
      const unit = ingredient.unit === "c_soupe" || ingredient.unit === "c_cafe" ? "ml" : ingredient.unit;
      const quantity = ingredient.unit === "c_soupe"
        ? ingredient.quantity * 15
        : ingredient.unit === "c_cafe"
          ? ingredient.quantity * 5
          : ingredient.quantity;
      const previous = aggregated.get(ingredientId);
      if (previous) {
        previous.amounts.set(unit, round((previous.amounts.get(unit) ?? 0) + quantity, 2));
        if (!identity.displayName && ingredient.name.localeCompare(previous.name, "fr") < 0) previous.name = ingredient.name;
      } else {
        aggregated.set(ingredientId, {
          ingredientId,
          name: identity.displayName ?? ingredient.name,
          category: identity.category ?? ingredient.category,
          amounts: new Map([[unit, round(quantity, 2)]]),
        });
      }
    }
  }

  const stock = new Map<string, Map<PantryAmount["unit"], number>>();
  for (const [id, amount] of Object.entries(options.pantryAmounts ?? {})) {
    const shoppingId = legacyShoppingItemKeyToCanonical(id);
    const amounts = stock.get(shoppingId) ?? new Map<PantryAmount["unit"], number>();
    amounts.set(amount.unit, round((amounts.get(amount.unit) ?? 0) + amount.quantity, 2));
    stock.set(shoppingId, amounts);
  }

  return [...aggregated.values()].map((item) => {
    const ownedByUnit = stock.get(item.ingredientId);
    if (ownedByUnit) {
      // Deduct what is already at home, in each matching unit only.
      for (const [unit, quantity] of ownedByUnit) {
        const current = item.amounts.get(unit);
        if (current !== undefined) item.amounts.set(unit, round(Math.max(0, current - quantity), 2));
      }
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
      // A numeric stock entry is partial unless it covers the whole requirement.
      inPantry: pantry.has(item.ingredientId) && !ownedByUnit,
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

export interface ActivePlanReport {
  /** Meals whose recipe or substitutions no longer satisfy the active profile. */
  blockedMeals: PlannedMeal[];
  /** Required day/type slots absent from the active week. */
  missingSlots: number;
  /** Slots outside the complete two- or three-meal grid inferred from the plan. */
  unexpectedSlots: number;
  /** Grid inferred from the complete persisted slots, independent of a stale snapshot. */
  inferredMealsPerDay: UserProfile["mealsPerDay"] | null;
  canActivate: boolean;
}

/**
 * Validates a plan that will become active without rebuilding it. Unlike an
 * archived replay, an imported active week must already match one exact grid:
 * seven lunches and dinners, plus either zero or seven breakfasts. The grid is
 * inferred from the slots because older profile edits could update the stored
 * snapshot without regenerating the week. Current profile safety stays strict.
 */
export function inspectActivePlan(
  plan: WeeklyPlan | null | undefined,
  recipes: readonly Recipe[],
  profile: UserProfile,
): ActivePlanReport {
  if (!plan) {
    return { blockedMeals: [], missingSlots: 0, unexpectedSlots: 0, inferredMealsPerDay: null, canActivate: false };
  }
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const breakfastCount = plan.meals.filter((meal) => meal.mealType === "breakfast").length;
  const inferredMealsPerDay: UserProfile["mealsPerDay"] | null = breakfastCount === 0
    ? 2
    : breakfastCount === 7
      ? 3
      : null;
  const requiredSlots = new Set(
    Array.from({ length: 7 }, (_, dayIndex) =>
      requiredMealTypes(inferredMealsPerDay ?? 2).map((mealType) => `${dayIndex}-${mealType}`),
    ).flat(),
  );
  const seenSlots = new Set<string>();
  const blockedMeals: PlannedMeal[] = [];
  let unexpectedSlots = 0;

  for (const meal of plan.meals) {
    const slot = `${meal.dayIndex}-${meal.mealType}`;
    if (!requiredSlots.has(slot) || seenSlots.has(slot)) {
      unexpectedSlots += 1;
      continue;
    }
    seenSlots.add(slot);
    const recipe = byId.get(meal.recipeId);
    if (!recipe || !plannedMealIsAllowedForSlot(meal, recipe, profile)) blockedMeals.push(meal);
  }

  const missingSlots = [...requiredSlots].filter((slot) => !seenSlots.has(slot)).length;
  return {
    blockedMeals,
    missingSlots,
    unexpectedSlots,
    inferredMealsPerDay,
    canActivate:
      blockedMeals.length === 0 &&
      missingSlots === 0 &&
      unexpectedSlots === 0 &&
      inferredMealsPerDay !== null,
  };
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
    return !recipe || !plannedMealIsAllowedForSlot(meal, recipe, profile);
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
  const meals = plan.meals
    .filter((meal) => mealTypes.includes(meal.mealType))
    .map((meal) => ({
      ...meal,
      id: `day-${meal.dayIndex}-${meal.mealType}`,
      portions: portionsForSlot(profile, meal.dayIndex, meal.mealType),
      completed: false,
      locked: false,
      skipped: slotIsSkipped(profile, meal.dayIndex, meal.mealType),
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

export interface ContextualReminder {
  id: string;
  kind: "start-tonight" | "rest-today" | "leftovers-today";
  title: string;
  body: string;
  meal: PlannedMeal;
}

/** Local reminders derived from the plan whenever the application is opened. */
export function contextualRemindersForDate(
  plan: WeeklyPlan | null | undefined,
  recipes: readonly Recipe[],
  today: string,
): ContextualReminder[] {
  if (!plan) return [];
  const offset = planDayOffset(plan, today);
  if (offset < -1 || offset > 6) return [];
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const reminders: ContextualReminder[] = [];

  for (const meal of plan.meals) {
    if (meal.skipped || meal.completed) continue;
    const recipe = byId.get(meal.recipeId);
    if (!recipe) continue;
    if (meal.dayIndex === offset && meal.leftoverOf) {
      reminders.push({
        id: `leftovers-${meal.id}`,
        kind: "leftovers-today",
        title: "Restes prévus aujourd’hui",
        body: `${recipe.title} est déjà prêt : vérifiez sa conservation avant de servir.`,
        meal,
      });
      continue;
    }
    const advance = advancePrepFor(recipe);
    if (meal.dayIndex === offset && !meal.leftoverOf && advance?.level === "same-day") {
      reminders.push({
        id: `rest-${meal.id}`,
        kind: "rest-today",
        title: "Repos à lancer aujourd’hui",
        body: `${recipe.title} demande ${formatDurationLabel(advance.minutes)} de repos.`,
        meal,
      });
    }
    if (meal.dayIndex === offset + 1 && !meal.leftoverOf && advance?.level === "day-before") {
      reminders.push({
        id: `tonight-${meal.id}`,
        kind: "start-tonight",
        title: "À lancer ce soir",
        body: `${recipe.title} demande ${formatDurationLabel(advance.minutes)} de repos.`,
        meal,
      });
    }
  }
  return reminders;
}

function formatDurationLabel(minutes: number): string {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} j`;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  return `${minutes} min`;
}

/** Minimal iCalendar export of a week, one event per meal. */
export function planToCalendar(plan: WeeklyPlan, recipes: readonly Recipe[]): string {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const times: Record<MealType, string> = { breakfast: "0800", lunch: "1230", dinner: "1930" };
  const labels: Record<MealType, string> = { breakfast: "Petit-déjeuner", lunch: "Déjeuner", dinner: "Dîner" };
  const escape = (value: string): string => value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
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

  const foldLine = (line: string): string[] => {
    const folded: string[] = [];
    let current = "";
    let currentBytes = 0;
    let limit = 75;
    for (const character of line) {
      const characterBytes = new TextEncoder().encode(character).byteLength;
      if (current && currentBytes + characterBytes > limit) {
        folded.push(folded.length ? ` ${current}` : current);
        current = character;
        currentBytes = characterBytes;
        limit = 74;
      } else {
        current += character;
        currentBytes += characterBytes;
      }
    }
    folded.push(folded.length ? ` ${current}` : current);
    return folded;
  };

  const calendarLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InflammMenu//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Inflamm’Menu",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Paris",
    "X-LIC-LOCATION:Europe/Paris",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events.flatMap((event) => event.split("\r\n")),
    "END:VCALENDAR",
  ];
  return [...calendarLines.flatMap(foldLine), ""].join("\r\n");
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
      : items.length
        ? "Rien à acheter : tout est coché ou déjà en réserve."
        : "Aucun achat requis dans la liste générée.",
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

const NON_PLANT_WORDS = /(^|-)(eau|water|sel|salt|huile|oil|bouillon|stock|miel|honey|sirop|syrup|lait|milk|yaourt|yogurt|fromage|cheese|oeuf|egg|poulet|chicken|boeuf|beef|porc|pork|dinde|turkey|saumon|sardine|maquereau|thon|cabillaud|poisson|fish|crevette|shrimp|moule|beurre|butter)(-|$)/;

export interface PlantDiversity {
  count: number;
  ingredients: string[];
}

/**
 * Counts distinct identifiable plants used in the week. Water, salt, oils,
 * sweeteners, stocks and animal products are excluded; herbs and spices count.
 * This is a transparent variety marker, not a health score.
 */
export function plantDiversityOf(plan: WeeklyPlan, recipes: readonly Recipe[]): PlantDiversity {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const plants = new Map<string, string>();
  for (const meal of plan.meals) {
    if (meal.skipped) continue;
    const recipe = byId.get(meal.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      if (ingredient.optional) continue;
      if (ingredient.category === "meat-fish") continue;
      const id = normalize(canonicalIngredientId(ingredient.id));
      const name = normalize(ingredient.name);
      if (!id || NON_PLANT_WORDS.test(id) || NON_PLANT_WORDS.test(name)) continue;
      plants.set(id, ingredient.name.trim());
    }
  }
  const ingredients = [...plants.values()].sort((left, right) => left.localeCompare(right, "fr"));
  return { count: ingredients.length, ingredients };
}

export function summarizePlan(
  plan: WeeklyPlan,
  recipes: readonly Recipe[],
  profile: UserProfile = plan.profileSnapshot,
): PlanSummary {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const activeMeals = plan.meals.filter((meal) => !meal.skipped);
  const selected = activeMeals
    .map((meal) => byId.get(meal.recipeId))
    .filter((item): item is Recipe => Boolean(item));
  // Leftovers are eaten, not cooked: they must not lower the average session time.
  const cooked = plan.meals
    .filter((meal) => !meal.leftoverOf && !meal.skipped)
    .map((meal) => byId.get(meal.recipeId))
    .filter((item): item is Recipe => Boolean(item));
  const averagePrepMinutes = cooked.length
    ? round(cooked.reduce((total, recipe) => total + recipe.prepMinutes, 0) / cooked.length, 1)
    : 0;
  const plantDiversity = plantDiversityOf(plan, recipes);
  const season = seasonForIsoDate(plan.startsOn);

  return {
    mealCount: activeMeals.length,
    cookingSessions: cooked.length,
    estimatedCost: plan.estimatedCost,
    averagePrepMinutes,
    legumeMeals: weeklyTargetCount(selected, WEEKLY_TARGET_TAGS.legume),
    fishMeals: weeklyTargetCount(selected, WEEKLY_TARGET_TAGS.fish),
    wholeGrainMeals: tagCount(selected, TAGS.wholeGrain),
    nutOrSeedMeals: selected.filter(hasNutOrSeed).length,
    seasonalMeals: selected.filter(
      (recipe) => recipe.seasons.includes(season) || recipe.seasons.includes("all-year"),
    ).length,
    plantDiversity: plantDiversity.count,
    plantIngredients: plantDiversity.ingredients,
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
