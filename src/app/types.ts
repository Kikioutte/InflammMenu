import { type ComponentType } from "react";

export type TabId = "home" | "week" | "recipes" | "courses";

export type IconType = ComponentType<{ className?: string }>;

export type RecipeRating = "loved" | "neutral" | "meh" | "avoided";
