import plannerRecipeSource from "./data/planner-recipes.json" with { type: "json" };
import type { Recipe } from "./domain.ts";

export const IMPORTED_PLAN_RECIPES = plannerRecipeSource as unknown as readonly Recipe[];
