import type { Ingredient } from './domain.ts';
import { canonicalAllergen } from './allergens.ts';
import { RECIPES } from './recipes.ts';
import { canonicalIngredientId, normalizeIngredientId } from './shopping.ts';

const regulatoryAllergens = new Set([
  'gluten', 'crustaces', 'oeuf', 'poisson', 'arachides', 'soja', 'lait',
  'fruits-a-coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques',
]);
const meaninglessTerms = new Set(['de', 'du', 'des', 'd', 'a', 'au', 'aux', 'en', 'et']);
const resolvedTerms = new Map<string, ReadonlySet<string>>();
let knownIngredients: readonly Ingredient[] | undefined;

/** Exclusion matching never merges culinary identities or purchase groups. */
function ingredientIdsFor(value: string): ReadonlySet<string> {
  const term = normalizeIngredientId(value);
  const cached = resolvedTerms.get(term);
  if (cached) return cached;
  const ids = new Set<string>();
  if (term && !meaninglessTerms.has(term)) {
    knownIngredients ??= RECIPES.flatMap(recipe => recipe.ingredients);
    const canonical = canonicalIngredientId(term);
    for (const ingredient of knownIngredients) {
      const id = canonicalIngredientId(ingredient.id);
      const name = normalizeIngredientId(ingredient.name);
      // Match a whole phrase, never e.g. "poire" inside "poireau". Keep ALL
      // matching ingredient variants rather than silently selecting the first.
      if (id === canonical || `-${name}-`.includes(`-${term}-`)) ids.add(id);
    }
  }
  if (resolvedTerms.size >= 256) resolvedTerms.clear();
  resolvedTerms.set(term, ids);
  return ids;
}

export function resolveIngredientExclusions(terms: readonly string[]): { ids: string[]; unknown: string[] } {
  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const term of terms) {
    const matches = ingredientIdsFor(term);
    if (!matches.size) unknown.push(term);
    matches.forEach(id => ids.add(id));
  }
  return { ids: [...ids], unknown };
}

export function unsupportedAllergies(values: readonly string[]): string[] {
  return values.filter(value => !regulatoryAllergens.has(canonicalAllergen(value)) && !ingredientIdsFor(value).size);
}

/** Unknown restrictions fail closed, including in an old/imported profile. */
export function hasAllergyConflict(
  values: readonly string[],
  declaredAllergens: readonly string[],
  ingredients: readonly Pick<Ingredient, 'id'>[],
): boolean {
  return values.some(value => {
    const allergen = canonicalAllergen(value);
    if (regulatoryAllergens.has(allergen)) return declaredAllergens.some(item => canonicalAllergen(item) === allergen);
    const ids = ingredientIdsFor(value);
    return !ids.size || ingredients.some(ingredient => ids.has(canonicalIngredientId(ingredient.id)));
  });
}
