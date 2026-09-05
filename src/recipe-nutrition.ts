import source from "./data/recipe-nutrition.json" with { type: "json" };
import type { Ingredient, Nutrition } from "./domain.ts";

type Coefficient = { id: string; unit: string; optional: boolean; calories: number; protein: number; fiber: number };
const recipes: Readonly<Record<string, readonly Coefficient[]>> = source;

/** Only a known source and its reviewed culinary units permit recalculation. */
export function recalculateCustomNutrition(recipeId: string, ingredients: readonly Ingredient[]): Nutrition | null {
  const sourceId = recipeId.replace(/^(?:perso-)+/, "").match(/^(catalog-r\d{3})(?:-|$)/)?.[1];
  const coefficients = sourceId ? recipes[sourceId] : undefined;
  if (!coefficients || !ingredients.length || ingredients.length > 100) return null;
  const totals = { calories: 0, protein: 0, fiber: 0 };
  const seen = new Set<string>();
  for (const ingredient of ingredients) {
    const key = `${ingredient.id}:${ingredient.unit}`;
    const coefficient = coefficients.find(item => item.id === ingredient.id && item.unit === ingredient.unit);
    if (!coefficient || seen.has(key) || coefficient.optional !== (ingredient.optional === true)
      || !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0 || ingredient.quantity > 1_000_000) return null;
    seen.add(key);
    for (const field of ["calories", "protein", "fiber"] as const) totals[field] += coefficient[field] * ingredient.quantity;
  }
  if (Object.values(totals).some(value => !Number.isFinite(value) || value > 100_000)) return null;
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    fiber: Math.round(totals.fiber * 10) / 10,
    estimated: true,
    note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif.",
  };
}
