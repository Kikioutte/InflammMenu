import type { Ingredient, Nutrition, Recipe } from "./domain.ts";

type Coefficient = {
  id: string;
  unit: string;
  optional: boolean;
  quantity: number;
  calories: number;
  protein: number;
  fiber: number;
  /** Editorial price per reviewed culinary unit, not a current shop price. */
  cost?: number;
};
type Coefficients = Readonly<Record<string, readonly Coefficient[]>>;
type RecipeEstimates = Pick<Recipe, "nutrition" | "nutritionRecalculated" | "costPerPortion" | "costRecalculated">;
const NOTE: Nutrition["note"] = "Valeurs nutritionnelles estimatives par portion, à titre indicatif.";
let coefficientPromise: Promise<Coefficients | null> | null = null;

async function loadCoefficients(): Promise<Coefficients | null> {
  if (!coefficientPromise) {
    // A failed offline request must not poison later retries. The table is not
    // part of the first-render bundle; editing still works without its download.
    coefficientPromise = import("./data/recipe-nutrition.json", { with: { type: "json" } })
      .then(module => module.default as Coefficients)
      .catch(() => { coefficientPromise = null; return null; });
  }
  return coefficientPromise;
}

function sourceIdFor(recipeId: string): string | undefined {
  return recipeId.replace(/^(?:perso-)+/, "").match(/^(catalog-r\d{3,4})(?:-|$)/)?.[1];
}

function validIngredients(ingredients: readonly Ingredient[]): boolean {
  return ingredients.length > 0 && ingredients.length <= 100
    && ingredients.every(item => Number.isFinite(item.quantity) && item.quantity > 0 && item.quantity <= 1_000_000);
}

function matchedCoefficients(table: Coefficients | null, recipeId: string, ingredients: readonly Ingredient[]): readonly Coefficient[] | null {
  const sourceId = sourceIdFor(recipeId);
  const coefficients = sourceId && table?.[sourceId];
  if (!coefficients || !validIngredients(ingredients)) return null;
  const selected: Coefficient[] = [];
  const seen = new Set<string>();
  for (const ingredient of ingredients) {
    const key = `${ingredient.id}:${ingredient.unit}`;
    const coefficient = coefficients.find(item => item.id === ingredient.id && item.unit === ingredient.unit);
    if (!coefficient || seen.has(key) || coefficient.optional !== (ingredient.optional === true)) return null;
    seen.add(key);
    selected.push(coefficient);
  }
  return selected;
}

function nutritionFromCoefficients(coefficients: readonly Coefficient[], ingredients: readonly Ingredient[]): Nutrition | null {
  const total = { calories: 0, protein: 0, fiber: 0 };
  for (let index = 0; index < ingredients.length; index += 1) {
    for (const field of ["calories", "protein", "fiber"] as const) total[field] += coefficients[index][field] * ingredients[index].quantity;
  }
  if (Object.values(total).some(value => !Number.isFinite(value) || value < 0 || value > 100_000)) return null;
  return { calories: Math.round(total.calories), protein: Math.round(total.protein * 10) / 10, fiber: Math.round(total.fiber * 10) / 10, estimated: true, note: NOTE };
}

/** Recalculate only ingredients and culinary units backed by reviewed data. */
export async function recalculateCustomNutrition(recipeId: string, ingredients: readonly Ingredient[]): Promise<Nutrition | null> {
  if (!sourceIdFor(recipeId) || !validIngredients(ingredients)) return null;
  const coefficients = matchedCoefficients(await loadCoefficients(), recipeId, ingredients);
  return coefficients ? nutritionFromCoefficients(coefficients, ingredients) : null;
}

/** Proportional changes are meaningful only when every ingredient is retained. */
function uniformScale(source: readonly Ingredient[], next: readonly Ingredient[]): number | null {
  if (source.length !== next.length || !validIngredients(source) || !validIngredients(next)) return null;
  let ratio: number | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const old = source[index];
    const item = next[index];
    if (old.id !== item.id || old.unit !== item.unit || Boolean(old.optional) !== Boolean(item.optional)) return null;
    const currentRatio = item.quantity / old.quantity;
    if (ratio !== null && Math.abs(currentRatio - ratio) > 1e-9 * Math.max(1, ratio)) return null;
    ratio = currentRatio;
  }
  return ratio;
}

/**
 * Keep the last numbers for backup compatibility when no reliable recalculation
 * exists, and mark them unusable for display/averages. Never revive an already
 * uncalculated source merely because the next edit is proportional.
 */
export async function recalculateRecipeEstimates(source: Recipe, ingredients: readonly Ingredient[]): Promise<RecipeEstimates> {
  const coefficients = sourceIdFor(source.id) && validIngredients(ingredients)
    ? matchedCoefficients(await loadCoefficients(), source.id, ingredients)
    : null;
  const ratio = uniformScale(source.ingredients, ingredients);
  let nutrition = coefficients ? nutritionFromCoefficients(coefficients, ingredients) : null;
  if (!nutrition && ratio !== null && source.nutritionRecalculated !== false) {
    const total = { calories: source.nutrition.calories * ratio, protein: source.nutrition.protein * ratio, fiber: source.nutrition.fiber * ratio };
    if (Object.values(total).every(value => Number.isFinite(value) && value >= 0 && value <= 100_000)) {
      nutrition = { calories: Math.round(total.calories), protein: Math.round(total.protein * 10) / 10, fiber: Math.round(total.fiber * 10) / 10, estimated: true, note: NOTE };
    }
  }
  let cost: number | null = null;
  if (coefficients?.every(item => Number.isFinite(item.cost) && item.cost! >= 0)) {
    cost = Math.max(0.1, ingredients.reduce((sum, ingredient, index) => sum + ingredient.quantity * coefficients[index].cost!, 0));
  } else if (ratio !== null && source.costRecalculated !== false) {
    cost = source.costPerPortion * ratio;
  }
  if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 10_000)) cost = null;
  return {
    nutrition: nutrition ?? source.nutrition,
    nutritionRecalculated: nutrition !== null,
    costPerPortion: cost === null ? source.costPerPortion : Math.round(cost * 100) / 100,
    costRecalculated: cost !== null,
  };
}
