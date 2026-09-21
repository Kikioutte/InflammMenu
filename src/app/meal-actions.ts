import { type WeeklyPlan, type PlannedMeal } from "../domain";

type MealActionTarget = { slotId: string; signature: string };

export function mealActionTarget(plan: WeeklyPlan | null, meal: PlannedMeal, storageGeneration: string): MealActionTarget | null {
  if (!plan) return null;
  return {
    slotId: meal.id,
    signature: JSON.stringify([
      storageGeneration, plan.id, plan.startsOn, plan.generatedAt, meal.id, meal.dayIndex,
      meal.mealType, meal.recipeId, meal.portions, meal.source,
      meal.locked === true, meal.completed === true, meal.skipped === true,
      meal.leftoverOf ?? null,
      (meal.substitutions ?? []).map((item) => [item.ingredientId, item.substitutionId]).sort(),
    ]),
  };
}

export function matchingActionMeal(plan: WeeklyPlan | null, target: MealActionTarget | null, storageGeneration: string): PlannedMeal | null {
  const meal = plan?.meals.find((item) => item.id === target?.slotId);
  return meal && target && mealActionTarget(plan, meal, storageGeneration)?.signature === target.signature ? meal : null;
}

export const STALE_MEAL_ACTION = "Le menu ou ce repas a changé. Revenez à la semaine et rouvrez le repas avant de continuer.";
