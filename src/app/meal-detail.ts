import type { PlannedMeal, WeeklyPlan } from "../domain";

type MealDetailTarget = { slotId: string; signature: string };

/** Identity stays fixed while quantities, substitutions and flags refresh live. */
export function mealDetailTarget(plan: WeeklyPlan | null, meal: PlannedMeal, generation: string): MealDetailTarget | null {
  if (!plan) return null;
  return {
    slotId: meal.id,
    signature: JSON.stringify([
      generation, plan.id, plan.startsOn, plan.generatedAt,
      meal.id, meal.dayIndex, meal.mealType, meal.recipeId, meal.leftoverOf ?? null,
    ]),
  };
}

export function matchingDetailMeal(plan: WeeklyPlan | null, target: MealDetailTarget | null, generation: string): PlannedMeal | null {
  const meal = plan?.meals.find((item) => item.id === target?.slotId);
  return meal && target && mealDetailTarget(plan, meal, generation)?.signature === target.signature ? meal : null;
}

/** Presentation only: each served meal is already counted once in shopping. */
export function preparationPortions(plan: WeeklyPlan | null, meal: PlannedMeal): number {
  if (meal.leftoverOf || meal.skipped) return meal.portions;
  return meal.portions + (plan?.meals ?? [])
    .filter((item) => item.leftoverOf === meal.id && !item.skipped)
    .reduce((sum, item) => sum + item.portions, 0);
}
