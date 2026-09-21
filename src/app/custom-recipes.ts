import type { Recipe } from "../domain";

/** A personal variant of an existing recipe: same canonical ingredients, own wording. */
export function customRecipeFrom(recipe: Recipe): Recipe {
  return {
    ...recipe,
    id: `perso-${recipe.id}-${Date.now().toString(36)}`,
    title: `${recipe.title} (ma version)`,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
    steps: [...recipe.steps],
  };
}
