import type { Ingredient } from "./domain.ts";
import { canonicalAllergen } from "./allergens.ts";
import { RECIPES } from "./recipes.ts";
import { canonicalIngredientId, normalizeIngredientId } from "./shopping.ts";
import { INGREDIENT_SUBSTITUTIONS } from "./substitutions.ts";

type IngredientIdentity = Pick<Ingredient, "id" | "name">;
const regulatoryAllergens = new Set([
  "gluten", "crustaces", "oeuf", "poisson", "arachides", "soja", "lait",
  "fruits-a-coque", "celeri", "moutarde", "sesame", "sulfites", "lupin", "mollusques",
]);
let knownIdentities: Map<string, Set<string>> | undefined;
const extraIndexes = new WeakMap<readonly IngredientIdentity[], Map<string, Set<string>>>();

function indexIngredients(ingredients: readonly IngredientIdentity[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const ingredient of ingredients) {
    const id = canonicalIngredientId(ingredient.id);
    for (const key of [id, normalizeIngredientId(ingredient.name)]) {
      const matches = index.get(key) ?? new Set<string>();
      matches.add(id);
      index.set(key, matches);
    }
  }
  return index;
}

function ingredientIndex(): Map<string, Set<string>> {
  if (knownIdentities) return knownIdentities;
  knownIdentities = indexIngredients([...RECIPES.flatMap((recipe) => recipe.ingredients), ...INGREDIENT_SUBSTITUTIONS.map((rule) => rule.replacement)]);
  return knownIdentities;
}

/** Exact culinary IDs, reviewed aliases and complete names only. Search typo
 * tolerance, substrings and purchasing groups never define a restriction. */
function ingredientIdsFor(value: string, extraIngredients: readonly IngredientIdentity[] = []): Set<string> {
  const term = normalizeIngredientId(value);
  const canonical = canonicalIngredientId(value);
  const index = ingredientIndex();
  const ids = new Set([...(index.get(canonical) ?? []), ...(index.get(term) ?? [])]);
  if (extraIngredients.length) {
    let extra = extraIndexes.get(extraIngredients);
    if (!extra) {
      extra = indexIngredients(extraIngredients);
      extraIndexes.set(extraIngredients, extra);
    }
    for (const id of [...(extra.get(canonical) ?? []), ...(extra.get(term) ?? [])]) ids.add(id);
  }
  return ids;
}

export function resolveIngredientExclusions(terms: readonly string[], extraIngredients: readonly IngredientIdentity[] = []): { ids: string[]; unknown: string[] } {
  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const term of terms) {
    const matches = ingredientIdsFor(term, extraIngredients);
    if (!matches.size) unknown.push(term);
    matches.forEach((id) => ids.add(id));
  }
  return { ids: [...ids], unknown: [...new Set(unknown)] };
}

export function unsupportedAllergies(values: readonly string[], extraIngredients: readonly IngredientIdentity[] = []): string[] {
  return [...new Set(values.filter((value) => !regulatoryAllergens.has(canonicalAllergen(value)) && !ingredientIdsFor(value, extraIngredients).size))];
}

/** Unknown imported/legacy restrictions fail closed. Optional ingredients are
 * still checked for allergies because they remain visible in the recipe. */
export function hasAllergyConflict(
  values: readonly string[],
  declaredAllergens: readonly string[],
  ingredients: readonly IngredientIdentity[],
  knownIngredients: readonly IngredientIdentity[] = ingredients,
): boolean {
  return values.some((value) => {
    const allergen = canonicalAllergen(value);
    if (regulatoryAllergens.has(allergen)) return declaredAllergens.some((item) => canonicalAllergen(item) === allergen);
    const ids = ingredientIdsFor(value, knownIngredients);
    return !ids.size || ingredients.some((ingredient) => ids.has(canonicalIngredientId(ingredient.id)));
  });
}

/** Convenience exclusions retain the caller's treatment of optional garnish. */
export function hasIngredientExclusionConflict(
  values: readonly string[],
  ingredients: readonly IngredientIdentity[],
  knownIngredients: readonly IngredientIdentity[] = ingredients,
): boolean {
  const resolution = resolveIngredientExclusions(values, knownIngredients);
  if (resolution.unknown.length) return true;
  const excluded = new Set(resolution.ids);
  return ingredients.some((ingredient) => excluded.has(canonicalIngredientId(ingredient.id)));
}
