import { type SyntheticEvent } from "react";

const RECIPE_IMAGE_PLACEHOLDER = `${import.meta.env.BASE_URL}assets/recipe-placeholder.svg`;

export function handleRecipeImageError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = RECIPE_IMAGE_PLACEHOLDER;
}
