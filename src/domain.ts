export type MealType = "breakfast" | "lunch" | "dinner";

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
  costPerPortion: number;
  seasons: readonly Season[];
  equipment: readonly Equipment[];
  allergens: readonly string[];
  tags: readonly string[];
  /** All quantities are stored per adult portion. */
  ingredients: readonly Ingredient[];
  nutrition: Nutrition;
  description: string;
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
  allergies: readonly string[];
  excludedIngredientIds: readonly string[];
  diet: DietMode;
  equipment: readonly Equipment[];
  calorieTarget?: number;
}

export interface PlannedMeal {
  id: string;
  dayIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  mealType: MealType;
  recipeId: string;
  portions: number;
  source: "generated" | "replacement" | "manual";
  completed?: boolean;
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

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: IngredientUnit;
  checked: boolean;
  inPantry: boolean;
}

export const DEFAULT_PROFILE: UserProfile = {
  firstName: "",
  people: 2,
  mealsPerDay: 2,
  weeklyBudget: 80,
  maxPrepMinutes: 30,
  allergies: [],
  excludedIngredientIds: [],
  diet: "classic",
  equipment: ["hob", "oven", "microwave", "blender", "toaster"],
};
