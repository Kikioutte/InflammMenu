import rules from "./data/association-rules.json" with { type: "json" };
import source from "./data/association-ingredients.json" with { type: "json" };
import reviewedIds from "./data/association-recipe-ids.json" with { type: "json" };
import { canonicalIngredientId } from "./shopping.ts";

export type AssociationLevel = "verte" | "orange" | "grise" | "non-classee";
export type AssociationMode = "off" | "green" | "green-orange";
export interface AssociationIngredient { id?: string; name?: string; nom?: string }
export interface AssociationPair { a: string; b: string; groupA: string; groupB: string; level: "orange" | "grise" }
export interface AssociationResult { level: AssociationLevel; pairs: AssociationPair[]; unknown: string[] }
const registry = new Map(Object.entries(source).map(([id, item]) => [canonicalIngredientId(id), item]));
const ids = new Set(reviewedIds);
const matrix = rules.rows.map((row) => row.split(" "));

export function isAssociationRecipe(id: string): boolean {
  return ids.has(id.startsWith("catalog-") ? id : `catalog-${id}`);
}

/** A dish and a full meal use exactly the same pairwise check. A missing
 * classification never becomes an implicit green association. */
export function evaluateAssociations(ingredients: readonly AssociationIngredient[]): AssociationResult {
  const unique = new Map(ingredients.map((item, index) => [item.id ? canonicalIngredientId(item.id) : `unknown-${index}`, item]));
  const unknown: string[] = [];
  const classified: Array<{ name: string; group: string }> = [];
  for (const [id, item] of unique) {
    const known = registry.get(id);
    const name = item.name ?? item.nom ?? known?.name ?? id;
    if (!known) unknown.push(name);
    else classified.push({ name, group: known.group });
  }
  const pairs: AssociationPair[] = [];
  for (let i = 0; i < classified.length; i++) {
    for (let j = i + 1; j < classified.length; j++) {
      const a = classified[i], b = classified[j];
      const value = matrix[rules.groups.indexOf(a.group)]?.[rules.groups.indexOf(b.group)];
      if (value === "o" || value === "x") pairs.push({ a: a.name, b: b.name, groupA: a.group, groupB: b.group, level: value === "o" ? "orange" : "grise" });
      else if (value !== "g") unknown.push(`${a.name} + ${b.name}`);
    }
  }
  return { level: pairs.some((pair) => pair.level === "grise") ? "grise" : unknown.length || unique.size === 0 ? "non-classee" : pairs.length ? "orange" : "verte", pairs, unknown };
}

export function associationRecipeAllowed(recipe: { id: string; ingredients: readonly AssociationIngredient[] }, mode?: AssociationMode): boolean {
  if (!mode || mode === "off") return true;
  if (!isAssociationRecipe(recipe.id)) return false;
  const result = evaluateAssociations(recipe.ingredients);
  return result.level === "verte" || (mode === "green-orange" && result.level === "orange");
}

export function evaluateAssociationMeal(recipes: readonly { ingredients: readonly AssociationIngredient[] }[]): AssociationResult {
  return evaluateAssociations(recipes.flatMap((recipe) => recipe.ingredients));
}

/** Green and orange combinations remain usable under the reviewed chart;
 * gray or unclassified combinations must never be offered by the meal builder. */
export function associationMealIsCompatible(recipes: readonly { ingredients: readonly AssociationIngredient[] }[]): boolean {
  const level = evaluateAssociationMeal(recipes).level;
  return level === "verte" || level === "orange";
}
