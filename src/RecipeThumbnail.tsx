import { useState } from "react";
import { recipeThumbnailFor } from "./responsive-images";
import { RECIPES } from "./recipes";

// The planner already contains these reviewed image paths. Reuse them instead
// of downloading the full catalogue's image allowlist for two small previews.
const plannedImages = new Set(RECIPES
  .filter((recipe) => /\/assets\/recipes\/generated\//.test(recipe.image))
  .map((recipe) => recipe.image.slice(recipe.image.lastIndexOf("/") + 1)));

/** Small cards download a thumbnail; recipe detail keeps the original image. */
export function RecipeThumbnail({ source }: { source: string }) {
  const [failure, setFailure] = useState({ source: "", step: 0 });
  const step = failure.source === source ? failure.step : 0;
  const thumbnail = recipeThumbnailFor(source, plannedImages);
  const image = step === 2 ? `${import.meta.env.BASE_URL}assets/recipe-placeholder.svg`
    : step === 1 ? source : thumbnail ?? source;
  return <img src={image} alt="" width={192} height={192} loading="lazy" decoding="async" onError={() => {
    if (step < 2) setFailure({ source, step: step === 0 && thumbnail ? 1 : 2 });
  }} />;
}
