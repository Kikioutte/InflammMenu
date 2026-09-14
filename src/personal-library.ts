import type { Recipe, WeeklyPlan, UserProfile } from "./domain.ts";
import type { CatalogueRecipe } from "./catalog.ts";
import { canonicalIngredientId } from "./shopping.ts";
import { canonicalAllergen } from "./allergens.ts";

export interface RecipeCollection { id: string; name: string; recipeIds: string[] }
export interface ShoppingRecipe { recipe: Recipe; portions: number }
export interface ManualShoppingItem { id: string; name: string; checked: boolean }

export function shoppingConflict(recipe: Recipe, profile: UserProfile): boolean {
  const allergens = new Set([...recipe.allergens, ...recipe.ingredients.flatMap((item) => item.allergens ?? [])].map(canonicalAllergen));
  return profile.allergies.some((item) => allergens.has(canonicalAllergen(item)))
    || profile.excludedIngredientIds.some((id) => recipe.ingredients.some((item) => canonicalIngredientId(item.id) === canonicalIngredientId(id)))
    || !recipe.diet.includes(profile.diet);
}

export function catalogueShoppingRecipe(source: CatalogueRecipe, image: string): Recipe | null {
  if (source.ingredients.some((item) => !item.id || !item.unite_normalisee || !Number.isFinite(item.quantite_normalisee) || Number(item.quantite_normalisee) <= 0)) return null;
  return {
    id: `catalog-${source.id}`, title: source.titre, mealTypes: ["lunch", "dinner"],
    diet: source.app.planner.diets, prepMinutes: Math.max(1, source.temps.preparation), costPerPortion: source.app.planner.cost_per_portion_eur,
    seasons: ["all-year"], equipment: source.app.planner.equipment, allergens: source.app.planner.allergens, tags: [],
    ingredients: source.ingredients.map((item) => ({ id: item.id!, name: item.nom, quantity: item.quantite_normalisee! / source.portions, unit: item.unite_normalisee!, category: item.categorie_courses, allergens: item.allergenes, optional: item.facultatif, pantryStaple: item.pantry_staple })),
    nutrition: { calories: source.nutrition_par_portion.calories, protein: source.nutrition_par_portion.proteines_g, fiber: source.nutrition_par_portion.fibres_g, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: source.titre, steps: source.etapes, conservation: source.conservation, image,
  };
}

export function cleanLabel(value: unknown, limit = 80): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit) : "";
}
export function normalizeCollections(value: unknown): RecipeCollection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item.id !== "string" || !/^collection-[a-zA-Z0-9-]{1,100}$/.test(item.id) || seen.has(item.id) || !cleanLabel(item.name)) return [];
    seen.add(item.id);
    const recipeIds = Array.isArray(item.recipeIds) ? [...new Set<string>(item.recipeIds.filter((id: unknown): id is string => typeof id === "string" && id.length <= 160 && /^(catalog-r\d+|r\d+|perso-[a-zA-Z0-9._-]+)$/.test(id)))].slice(0, 1500) : [];
    return [{ id: item.id, name: cleanLabel(item.name), recipeIds }];
  }).slice(0, 100);
}
export function normalizeManualItems(value: unknown): ManualShoppingItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item.id !== "string" || !/^article-[a-zA-Z0-9-]{1,100}$/.test(item.id) || seen.has(item.id) || !cleanLabel(item.name, 160)) return [];
    seen.add(item.id);
    return [{ id: item.id, name: cleanLabel(item.name, 160), checked: item.checked === true }];
  }).slice(0, 200);
}

/** Temporary shopping aggregation only: never persisted as a weekly plan or
 * passed to the planner. Existing culinary shopping identities stay in charge. */
export function shoppingContext(plan: WeeklyPlan | null, recipes: readonly Recipe[], extras: readonly ShoppingRecipe[], profile: UserProfile) {
  const additional = extras.map(({ recipe }, index) => ({ ...recipe, id: `shopping-${index}` }));
  const effectivePlan: WeeklyPlan = {
    ...(plan ?? { id: "shopping-only", startsOn: "2000-01-03", generatedAt: "2000-01-03T00:00:00Z", profileSnapshot: profile, estimatedCost: 0, version: 1 as const }),
    meals: [...(plan?.meals ?? []), ...extras.map((entry, index) => ({ id: `shopping-${index}`, recipeId: `shopping-${index}`, dayIndex: 0 as const, mealType: "lunch" as const, portions: entry.portions, source: "manual" as const }))],
  };
  return { plan: effectivePlan, recipes: [...recipes, ...additional] };
}
