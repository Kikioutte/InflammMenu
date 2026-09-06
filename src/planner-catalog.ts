import type { Recipe } from "./domain.ts";

const [{ default: plannerRecipeSource }, { validatePlannerRecipes }] = await Promise.all([
  import("./planner-source.ts"),
  import("./catalog-validation.ts"),
]);

export const IMPORTED_PLAN_RECIPES: readonly Recipe[] = validatePlannerRecipes(plannerRecipeSource);
