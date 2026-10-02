import type { AppState } from "../storage";
import type { RecipeRating } from "./types";

export function recipeRating(state: AppState, recipeId: string): RecipeRating {
  if (state.profile.dislikedRecipeIds.includes(recipeId)) return "avoided";
  if (state.profile.softDislikedRecipeIds.includes(recipeId)) return "meh";
  if (state.favoriteRecipeIds.includes(recipeId)) return "loved";
  return "neutral";
}

/** Every entry point uses the same exclusive four-state preference. */
export function withRecipeRating(state: AppState, recipeId: string, rating: RecipeRating): AppState {
  const favorites = state.favoriteRecipeIds.filter((id) => id !== recipeId);
  const disliked = state.profile.dislikedRecipeIds.filter((id) => id !== recipeId);
  const softDisliked = state.profile.softDislikedRecipeIds.filter((id) => id !== recipeId);
  return {
    ...state,
    favoriteRecipeIds: rating === "loved" ? [...favorites, recipeId] : favorites,
    profile: {
      ...state.profile,
      dislikedRecipeIds: rating === "avoided" ? [...disliked, recipeId] : disliked,
      softDislikedRecipeIds: rating === "meh" ? [...softDisliked, recipeId] : softDisliked,
    },
  };
}

export function withToggledFavorite(state: AppState, recipeId: string): AppState {
  return withRecipeRating(state, recipeId, recipeRating(state, recipeId) === "loved" ? "neutral" : "loved");
}
