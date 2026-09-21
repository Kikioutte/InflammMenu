import { type WeeklyPlan, type PlannedMeal, type UserProfile } from "../domain";
import { useState } from "react";
import { canSwapPlannedMeals } from "../engine";
import { MobileScroll } from "../mobile";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { recipeById, ACTIVE_RECIPES } from "../app/recipe-registry";
import { DAY_LABELS, MEAL_LABELS } from "../components/constants";
import { dateAt } from "../components/format";

export function SwapView({ plan, source, profile, onConfirm }: {
  plan: WeeklyPlan;
  source: PlannedMeal;
  profile: UserProfile;
  onConfirm: (targetSlotId: string) => string | null;
}) {
  const [error, setError] = useState("");
  const sourceRecipe = recipeById.get(source.recipeId);
  const candidates = plan.meals.filter((meal) => meal.id !== source.id
    && !meal.leftoverOf
    && !plan.meals.some((other) => other.leftoverOf === meal.id)
    && canSwapPlannedMeals(plan, source.id, meal.id, ACTIVE_RECIPES, profile));
  return <MobileScroll className="app-screen"><main className="page-content pushed-page plan-slot-page" data-testid="swap-view">
    <div className="page-heading"><span className="eyebrow">Déplacer</span><h1>{sourceRecipe?.title ?? "Ce repas"}</h1><p>Choisissez le repas avec lequel l’échanger. Les deux plats gardent leurs repères, seuls les jours changent.</p></div>
    {error ? <p className="notice-banner" role="alert">{error}</p> : null}
    {DAY_LABELS.map((day, dayIndex) => {
      const dayMeals = candidates.filter((meal) => meal.dayIndex === dayIndex);
      if (!dayMeals.length) return null;
      return <section className="plan-slot-day" key={day}>
        <h2>{day} {dateAt(plan.startsOn, dayIndex).getDate()}</h2>
        {dayMeals.map((meal) => { const recipe = recipeById.get(meal.recipeId); return <button type="button" className="plan-slot" key={meal.id} data-testid={`swap-slot-${meal.id}`} onClick={() => setError(onConfirm(meal.id) ?? "")}>
          <span><small>{MEAL_LABELS[meal.mealType]}{meal.skipped ? " · Hors foyer" : ""}</small><strong>{recipe?.title ?? "Repas"}</strong></span><ChevronRightIcon />
        </button>; })}
      </section>;
    })}
  </main></MobileScroll>;
}
