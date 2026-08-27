import plannerRecipeSource from "./data/planner-recipes.json" with { type: "json" };
import type { Recipe } from "./domain.ts";

const { validatePlannerRecipes } = await import("./catalog-validation.ts");

export const IMPORTED_PLAN_RECIPES: readonly Recipe[] = validatePlannerRecipes(plannerRecipeSource);
