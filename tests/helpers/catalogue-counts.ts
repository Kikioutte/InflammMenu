import { readFileSync } from "node:fs";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const summary = read("../../src/data/catalogue-summary.json") as { nombre_recettes_visibles: number };
const collection = read("../../research/association-collection.json") as { associations: { niveau: string } }[];

export const CATALOGUE_VISIBLE_COUNT = summary.nombre_recettes_visibles;
export const ASSOCIATION_RECIPE_COUNT = collection.length;
export const GREEN_RECIPE_COUNT = collection.filter((recipe) => recipe.associations.niveau === "verte").length;
export const ORANGE_RECIPE_COUNT = collection.filter((recipe) => recipe.associations.niveau === "orange").length;
