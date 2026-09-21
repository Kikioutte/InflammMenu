import { type Recipe } from "../domain";
import { RECIPES } from "../recipes";
import { useSyncExternalStore, useEffect } from "react";
import { type AppState } from "../storage";

/**
 * Recipes the app plans with: the reviewed catalogue plus the user's own
 * variants. AppShell refreshes this registry whenever custom recipes change, so
 * every screen and every engine call sees the same set.
 */
type RecipeRegistrySnapshot = {
  customRecipes: readonly Recipe[];
  recipes: readonly Recipe[];
  byId: ReadonlyMap<string, Recipe>;
};

export let ACTIVE_RECIPES: readonly Recipe[] = RECIPES;

export let recipeById: ReadonlyMap<string, Recipe> = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

export let recipeRegistrySnapshot: RecipeRegistrySnapshot = {
  customRecipes: [],
  recipes: ACTIVE_RECIPES,
  byId: recipeById,
};

const recipeRegistryListeners = new Set<() => void>();

export function subscribeRecipeRegistry(listener: () => void) {
  recipeRegistryListeners.add(listener);
  return () => recipeRegistryListeners.delete(listener);
}

function replaceRecipeRegistry(customRecipes: readonly Recipe[]) {
  if (recipeRegistrySnapshot.customRecipes === customRecipes) return;
  const recipes = customRecipes.length ? [...RECIPES, ...customRecipes] : RECIPES;
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  ACTIVE_RECIPES = recipes;
  recipeById = byId;
  recipeRegistrySnapshot = { customRecipes, recipes, byId };
  recipeRegistryListeners.forEach((listener) => listener());
}

export function useRecipeRegistry(customRecipes: readonly Recipe[]): readonly Recipe[] {
  const snapshot = useSyncExternalStore(
    subscribeRecipeRegistry,
    () => recipeRegistrySnapshot,
    () => recipeRegistrySnapshot,
  );
  useEffect(() => replaceRecipeRegistry(customRecipes), [customRecipes]);
  return snapshot.recipes;
}

export function recipesForState(state: AppState): readonly Recipe[] {
  return state.customRecipes.length || state.composedRecipes.length
    ? [...RECIPES, ...state.customRecipes, ...state.composedRecipes]
    : RECIPES;
}

export const ingredientNameById = new Map(
  RECIPES.flatMap((recipe) => recipe.ingredients).map((ingredient) => [ingredient.id, ingredient.name]),
);
