import { type SyntheticEvent } from "react";

export const RECIPE_IMAGE_PLACEHOLDER = `${import.meta.env?.BASE_URL ?? "/"}assets/recipe-placeholder.svg`;

/** Keep these slot widths aligned with the responsive rules in prototype.css. */
export const RECIPE_IMAGE_SIZES = {
  fullWidth: "(min-width: 860px) 860px, 100vw",
  catalogueCard: "(min-width: 860px) 238.67px, (min-width: 760px) calc((100vw - 144px) / 3), (min-width: 380px) calc((100vw - 52px) / 2), calc(100vw - 36px)",
  builderCandidate: "(min-width: 860px) 177px, (min-width: 760px) calc(25vw - 38px), (min-width: 360px) calc(50vw - 28px), calc(50vw - 22px)",
  builderHero: "(min-width: 860px) 389px, (min-width: 760px) calc(50vw - 41px), (min-width: 360px) calc((100vw - 42px) / 2.1), calc((100vw - 30px) / 2.1)",
} as const;

/** Derive only local, supported photo paths; recipe and backup URLs stay intact. */
export function recipeImageSrcSet(src: string, version: string): string | undefined {
  if (!/^[a-f0-9]{12}$/.test(version)) return undefined;
  const match = /^(\/(?:[a-zA-Z0-9_.-]+\/)*)assets\/(?:recipes\/((?:generated\/)?[a-zA-Z0-9_-]+)\.jpg|(inflamm-hero-bowl)\.jpg)$/.exec(src);
  if (!match || match[1].split("/").some((part) => part === "." || part === "..")) return undefined;
  const [, prefix, recipe, hero] = match;
  const stem = recipe ?? `_hero/${hero}`;
  const widths = recipe ? [160, 320, 640, 900] : [640, 960, 1200];
  return widths.map((width) => `${prefix}assets/recipes/responsive/${version}/${stem}.w${width}.webp ${width}w`).join(", ");
}

export function handleRecipeImageError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = RECIPE_IMAGE_PLACEHOLDER;
}
