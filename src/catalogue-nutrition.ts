import type { CatalogueRecipe } from "./catalog.ts";
import type { Recipe } from "./domain.ts";

/** A filtered extract has no reliable estimate without measuring what remains. */
export function hasCatalogueNutrition(recipe: CatalogueRecipe): boolean {
  const n = recipe.nutrition_par_portion;
  return [n.calories, n.proteines_g, n.fibres_g].every((value) => value !== null && Number.isFinite(value));
}

/** Keep the established Recipe persistence contract. Unknown estimates use the
 * existing false flag, which suppresses figures, averages and proportional edits. */
export function catalogueNutritionForRecipe(recipe: CatalogueRecipe): Pick<Recipe, "nutrition" | "nutritionRecalculated"> {
  const available = hasCatalogueNutrition(recipe);
  const n = recipe.nutrition_par_portion;
  return {
    nutrition: {
      calories: available ? n.calories! : 0,
      protein: available ? n.proteines_g! : 0,
      fiber: available ? n.fibres_g! : 0,
      estimated: true,
      note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif.",
    },
    ...(!available ? { nutritionRecalculated: false } : {}),
  };
}
