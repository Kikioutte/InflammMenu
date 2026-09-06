import filenames from "./data/generated-recipe-images.json" with { type: "json" };

/** Bundled allowlist, loaded only when the full catalogue is requested. */
export const generatedRecipeImages: ReadonlySet<string> = new Set(filenames);
