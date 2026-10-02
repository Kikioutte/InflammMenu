import columns from "./data/planner-recipes-columns.json" with { type: "json" };
import { expandPlannerRecipeColumns } from "./planner-recipe-columns.ts";

export function plannerRecipesForBase(baseUrl: string): Record<string, unknown>[] {
  const recipes = expandPlannerRecipeColumns(columns);
  // Minifiers can join the image column into one string. Rebase each expanded
  // path explicitly; a textual build rewrite cannot see those array elements.
  for (const recipe of recipes) {
    if (typeof recipe.image === "string" && /^\/assets\//.test(recipe.image)) {
      recipe.image = `${baseUrl}${recipe.image.slice(1)}`;
    }
  }
  return recipes;
}

export default plannerRecipesForBase(import.meta.env?.BASE_URL ?? "/");
