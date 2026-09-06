export type MealType = "breakfast" | "lunch" | "dinner";

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DietMode = "classic" | "vegetarian" | "no-pork";

export type IngredientCategory =
  | "fruit-vegetable"
  | "grocery"
  | "fresh"
  | "meat-fish"
  | "frozen"
  | "bakery"
  | "beverage";

export type IngredientUnit = "g" | "ml" | "piece" | "c_soupe" | "c_cafe";

export type Season = "spring" | "summer" | "autumn" | "winter" | "all-year";

export type Equipment =
  | "hob"
  | "oven"
  | "microwave"
  | "blender"
  | "toaster"
  | "steamer";

export interface Ingredient {
  /** Stable normalized identifier shared by every recipe and shopping item. */
  id: string;
  name: string;
  /** Quantity for one adult portion. */
  quantity: number;
  unit: IngredientUnit;
  category: IngredientCategory;
  allergens?: readonly string[];
  /** Everyday cupboard ingredient explicitly excluded from shopping lists. */
  pantryStaple?: boolean;
  /** Garnish or adjustment the recipe can be made without; shown in recipes but not bought automatically. */
  optional?: boolean;
}

export interface Nutrition {
  calories: number;
  protein: number;
  fiber: number;
  /** Nutrition figures are approximate and must not be presented as medical advice. */
  estimated: true;
  note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif.";
}

export interface Recipe {
  id: string;
  title: string;
  mealTypes: readonly MealType[];
  /** Diets with which the recipe is compatible. */
  diet: readonly DietMode[];
  prepMinutes: number;
  /**
   * Hands-off time before the dish is ready: soaking, chilling, marinating or
   * fermenting. Never counted in prepMinutes, which is active cooking time.
   */
  restMinutes?: number;
  costPerPortion: number;
  seasons: readonly Season[];
  equipment: readonly Equipment[];
  allergens: readonly string[];
  tags: readonly string[];
  /** All quantities are stored per adult portion. */
  ingredients: readonly Ingredient[];
  nutrition: Nutrition;
  /** Personal variants only: calculated from the source's reviewed ingredient data. */
  nutritionRecalculated?: boolean;
  description: string;
  /** Reviewed safety or preparation caution, available even when the full catalogue is offline. */
  caution?: string;
  steps: readonly string[];
  conservation: string;
  image: string;
}

export interface UserProfile {
  /** Optional display name used only for the local welcome message. */
  firstName: string;
  people: number;
  mealsPerDay: 2 | 3;
  weeklyBudget: number;
  maxPrepMinutes: number;
  /** Optional overrides applied before a week is generated. */
  dayConstraints: readonly DayConstraint[];
  allergies: readonly string[];
  excludedIngredientIds: readonly string[];
  /** Recipes the user asked never to be offered again. */
  dislikedRecipeIds: readonly string[];
  /** Recipes kept available but pushed down: the « bof » of a three-level rating. */
  softDislikedRecipeIds: readonly string[];
  /**
   * Weekly frequencies the generator aims for. Editorial defaults follow the
   * Mediterranean dietary pattern; they are goals, not nutritional guarantees.
   */
  weeklyTargets: { legumeMeals: number; fishMeals: number };
  diet: DietMode;
  equipment: readonly Equipment[];
}

export interface DayConstraint {
  dayIndex: DayIndex;
  /** Active-time limit for this day. Omitted means the profile-wide limit. */
  maxPrepMinutes?: number;
  /** Legacy/default portions for every meal on this day. Omitted means people. */
  portions?: number;
  /** Per-meal attendance; it overrides the day-wide value without affecting other slots. */
  mealPortions?: readonly MealPortionConstraint[];
  /** Slots already known to be taken outside the household. */
  skippedMealTypes: readonly MealType[];
}

export interface MealPortionConstraint {
  mealType: MealType;
  portions: number;
}

export interface PlannedMeal {
  id: string;
  dayIndex: DayIndex;
  mealType: MealType;
  recipeId: string;
  portions: number;
  source: "generated" | "replacement" | "manual";
  completed?: boolean;
  /** Kept as-is when the week is generated again. */
  locked?: boolean;
  /**
   * Slot identifier of the meal cooked in a larger batch. A leftover meal
   * reuses that recipe and requires no additional cooking session.
   */
  leftoverOf?: string;
  /** Meal taken outside the household: no cooking, no shopping, no cost. */
  skipped?: boolean;
  /** Reviewed ingredient swaps applied to this meal and its linked leftovers. */
  substitutions?: readonly PlannedIngredientSubstitution[];
}

export interface PlannedIngredientSubstitution {
  /** Canonical identifier of the ingredient present in the original recipe. */
  ingredientId: string;
  /** Stable identifier of a reviewed substitution rule. */
  substitutionId: string;
}

export interface WeeklyPlan {
  id: string;
  /** ISO date (YYYY-MM-DD) for the Monday starting the plan. */
  startsOn: string;
  generatedAt: string;
  profileSnapshot: UserProfile;
  meals: readonly PlannedMeal[];
  estimatedCost: number;
  version: 1;
}

/** Quantity already at home, deducted from the shopping list. */
export interface PantryAmount {
  quantity: number;
  unit: IngredientUnit;
}

export interface ShoppingAmount {
  quantity: number;
  unit: IngredientUnit;
}

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  category: IngredientCategory;
  /** Exact culinary quantities, kept separate when no reviewed conversion exists. */
  amounts: readonly ShoppingAmount[];
  /** Practical packaging guidance that never overwrites the culinary quantities. */
  purchaseSuggestion?: string;
  checked: boolean;
  inPantry: boolean;
}

export const DEFAULT_PROFILE: UserProfile = {
  firstName: "",
  people: 2,
  mealsPerDay: 2,
  weeklyBudget: 80,
  maxPrepMinutes: 30,
  dayConstraints: [],
  allergies: [],
  excludedIngredientIds: [],
  dislikedRecipeIds: [],
  softDislikedRecipeIds: [],
  weeklyTargets: { legumeMeals: 2, fishMeals: 2 },
  diet: "classic",
  equipment: ["hob", "oven", "microwave", "blender", "toaster"],
};
