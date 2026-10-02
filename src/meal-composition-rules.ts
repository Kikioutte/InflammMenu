import type { CatalogueRecipe } from "./catalog.ts";
import { evaluateAssociations, evaluateAssociationMeal, isAssociationRecipe } from "./food-associations.ts";

export type MealBuilderGroupId = "starter" | "main" | "dessert";
export type MealSelection = Partial<Record<MealBuilderGroupId, CatalogueRecipe>>;

export const MEAL_BUILDER_GROUPS: ReadonlyArray<{ id: MealBuilderGroupId; label: string; singular: string; categories: readonly string[] }> = [
  { id: "starter", label: "Entrées", singular: "Entrée", categories: ["soupe", "salade"] },
  { id: "main", label: "Plats", singular: "Plat", categories: ["plat"] },
  { id: "dessert", label: "Desserts", singular: "Dessert", categories: ["dessert"] },
];

export function mealBuilderGroupFor(recipe: CatalogueRecipe): MealBuilderGroupId | null {
  return MEAL_BUILDER_GROUPS.find((group) => group.categories.includes(recipe.categorie))?.id ?? null;
}

/** Shared by suggestions, saving and final composition. The only eligibility
 * exception is a reviewed association dessert added to a complete meal. */
export function mealBuilderExclusionReason(recipe: CatalogueRecipe): string | null {
  const title = `« ${recipe.titre} »`;
  if (recipe.app.duplicate_of) return `${title} reste exclue de la planification : cette recette est un doublon.`;
  if (!isAssociationRecipe(recipe.id)) return `${title} reste exclue de la composition : ses associations n’ont pas été vérifiées.`;
  const group = mealBuilderGroupFor(recipe);
  if (!group) return `${title} ne correspond pas à une entrée, un plat ou un dessert.`;
  if (recipe.creami || (group !== "dessert" && !recipe.app.planner.eligible)) {
    return `${title} reste exclue de la planification : ${recipe.app.review.caution ?? recipe.app.review.summary}`;
  }
  if (!Number.isFinite(recipe.portions) || recipe.portions <= 0 || !recipe.ingredients.length || recipe.ingredients.some((item) => !item.id || !item.unite_normalisee || !Number.isFinite(item.quantite_normalisee) || Number(item.quantite_normalisee) <= 0)) {
    return `Les quantités de ${title} doivent être vérifiées avant composition.`;
  }
  const level = evaluateAssociations(recipe.ingredients).level;
  if (level !== "verte" && level !== "orange") return `Les associations de ${title} doivent être revues.`;
  return null;
}

export function mealBuilderEligible(recipe: CatalogueRecipe): boolean {
  return mealBuilderExclusionReason(recipe) === null;
}

export function compositionSelectionError(selection: MealSelection): string | null {
  const { starter, main, dessert } = selection;
  if (!starter || !main || !dessert) return "Complétez les trois catégories.";
  if (mealBuilderGroupFor(starter) !== "starter" || mealBuilderGroupFor(main) !== "main" || mealBuilderGroupFor(dessert) !== "dessert") return "Choisissez une entrée, un plat et un dessert.";
  const sources = [starter, main, dessert];
  for (const recipe of sources) {
    const error = mealBuilderExclusionReason(recipe);
    if (error) return error;
  }
  const level = evaluateAssociationMeal(sources).level;
  return level === "verte" || level === "orange" ? null : "Les associations de ce repas doivent être revues.";
}
