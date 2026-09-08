import type { CatalogueRecipe } from "./catalog.ts";
import { assignRecipeToSlot, assignableSlots } from "./engine.ts";
import type { PlannedMeal, WeeklyPlan, UserProfile } from "./domain.ts";
import type { Ingredient, Recipe, Season } from "./domain.ts";
import { evaluateAssociationMeal, isAssociationRecipe } from "./food-associations.ts";
import { canonicalIngredientId, shoppingRuleFor } from "./shopping.ts";

export function scaleAssociationStep(step: string, ratio: number): string {
  return step.replace(/(\d+(?:[\u00a0\u202f]\d{3})*(?:[.,]\d+)?)\s*(ml|g)\b/g, (_match, amount: string, unit: string) => `${(Number(amount.replace(/[\u00a0\u202f]/g, "").replace(",", ".")) * ratio).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${unit}`);
}

/** Immutable snapshot for the planned week: portions, shopping and offline use
 * share the existing Recipe contract. Source catalogue records are not changed. */
export function composeMeal(starter: CatalogueRecipe, main: CatalogueRecipe, dessert: CatalogueRecipe, image: string): Recipe {
  const sources = [starter, main, dessert];
  if (!["soupe", "salade"].includes(starter.categorie) || main.categorie !== "plat" || dessert.categorie !== "dessert") throw new Error("Choisissez une entrée, un plat et un dessert.");
  if (sources.some((recipe) => recipe.app.duplicate_of || !isAssociationRecipe(recipe.id)) || !starter.app.planner.eligible || !main.app.planner.eligible || dessert.creami) throw new Error("Une recette de ce repas reste exclue de la planification.");
  const association = evaluateAssociationMeal(sources);
  if (association.level !== "verte" && association.level !== "orange") throw new Error("Les associations de ce repas doivent être revues.");
  const ingredients: Ingredient[] = sources.flatMap((recipe) => recipe.ingredients.map((item) => {
    if (!item.id || item.quantite_normalisee === undefined || !item.unite_normalisee) throw new Error("Une quantité de ce repas doit être vérifiée avant planification.");
    const id = canonicalIngredientId(item.id);
    return { id, name: item.nom, quantity: item.quantite_normalisee / recipe.portions, unit: item.unite_normalisee, category: item.categorie_courses, allergens: item.allergenes, optional: item.facultatif, pantryStaple: item.pantry_staple || shoppingRuleFor(id)?.pantry_staple };
  }));
  const seasons: Record<string, Season> = { printemps: "spring", ete: "summer", automne: "autumn", hiver: "winter", "toute-annee": "all-year" };
  return {
    id: `perso-repas-${starter.id}-${main.id}-${dessert.id}`,
    composition: { starter: starter.id, main: main.id, dessert: dessert.id },
    compositionTitles: { starter: starter.titre, main: main.titre, dessert: dessert.titre },
    title: main.titre,
    mealTypes: ["lunch", "dinner"],
    diet: main.app.planner.diets.filter((diet) => sources.every((recipe) => recipe.app.planner.diets.includes(diet))),
    prepMinutes: sources.reduce((sum, recipe) => sum + (recipe.app.planner.active_minutes ?? recipe.temps.preparation + recipe.temps.cuisson), 0),
    restMinutes: Math.max(...sources.map((recipe) => recipe.temps.repos)),
    costPerPortion: sources.reduce((sum, recipe) => sum + recipe.app.planner.cost_per_portion_eur, 0),
    seasons: main.saisons.map((season) => seasons[season]),
    equipment: [...new Set(sources.flatMap((recipe) => recipe.app.planner.equipment))],
    allergens: [...new Set(sources.flatMap((recipe) => recipe.app.planner.allergens))],
    tags: [...new Set(sources.flatMap((recipe) => [...(recipe.app.planner.targets ?? []), ...recipe.tags]))],
    ingredients,
    nutrition: { calories: sources.reduce((sum, r) => sum + r.nutrition_par_portion.calories, 0), protein: sources.reduce((sum, r) => sum + r.nutrition_par_portion.proteines_g, 0), fiber: sources.reduce((sum, r) => sum + r.nutrition_par_portion.fibres_g, 0), estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: `Entrée : ${starter.titre}. Plat : ${main.titre}. Dessert : ${dessert.titre}.`,
    caution: sources.map((recipe) => `${recipe.titre} : ${recipe.app.review.caution ?? recipe.app.review.summary}`).join("\n"),
    // RecipeView scales association quantities from a two-person reference.
    steps: sources.flatMap((recipe, index) => recipe.etapes.map((step) => `${["Entrée", "Plat", "Dessert"][index]} — ${scaleAssociationStep(step, 2 / recipe.portions)}`)),
    conservation: sources.map((recipe, index) => `${["Entrée", "Plat", "Dessert"][index]} : ${recipe.conservation}`).join("\n"),
    image,
  };
}


export function compositionTitlesFor(recipe: Recipe): { starter: string; main: string; dessert: string } | null {
  if (!recipe.composition) return null;
  if (recipe.compositionTitles) return recipe.compositionTitles;
  const legacy = /^Entrée : (.*?)\. Plat : (.*?)\. Dessert : (.*?)\.$/s.exec(recipe.description);
  return legacy ? { starter: legacy[1], main: legacy[2], dessert: legacy[3] } : { starter: "Entrée sélectionnée", main: recipe.title, dessert: "Dessert sélectionné" };
}

export interface CompositionTarget {
  planId: string;
  slotId: string;
  recipeId: string;
  dayIndex: PlannedMeal["dayIndex"];
  mealType: PlannedMeal["mealType"];
}

/** Check the live slot before saving: never overwrite a moved or replaced meal. */
export function updatePlannedComposition(plan: WeeklyPlan, target: CompositionTarget, recipe: Recipe, recipes: readonly Recipe[], profile: UserProfile): WeeklyPlan {
  const current = plan.meals.find((meal) => meal.id === target.slotId);
  if (plan.id !== target.planId || !current || current.recipeId !== target.recipeId || current.dayIndex !== target.dayIndex || current.mealType !== target.mealType || current.skipped || current.leftoverOf) throw new Error("Ce repas a changé depuis son ouverture. Revenez à la semaine pour le rouvrir.");
  if (!assignableSlots(plan, recipe, profile).some((slot) => slot.dayIndex === target.dayIndex && slot.mealType === target.mealType)) throw new Error("Ce repas ne respecte plus les critères de votre profil pour ce jour.");
  if (recipe.id === current.recipeId) return plan;
  const next = assignRecipeToSlot(plan, target, recipe, recipes, profile);
  return { ...next, meals: next.meals.map((meal) => meal.id === current.id ? { ...meal, locked: current.locked, portions: current.portions } : meal) };
}
