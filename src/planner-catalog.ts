import plannerRecipeSource from "./data/planner-recipes.json" with { type: "json" };
import type { Recipe } from "./domain.ts";
import { validatePlannerRecipes } from "./planner-validation.ts";

// Validate synchronously: the first screen must not await the full catalogue validator.
export const IMPORTED_PLAN_RECIPES: readonly Recipe[] = validatePlannerRecipes(plannerRecipeSource);
