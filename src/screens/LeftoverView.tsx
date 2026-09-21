import { type WeeklyPlan, type PlannedMeal, type Recipe } from "../domain";
import { leftoverCandidates } from "../engine";
import { useState } from "react";
import { MobileScroll } from "../mobile";
import { ClockIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { ACTIVE_RECIPES, recipeById } from "../app/recipe-registry";
import { DAY_LABELS, MEAL_LABELS } from "../components/constants";
import { dateAt } from "../components/format";

export function LeftoverView({ plan, source, recipe, onConfirm }: {
  plan: WeeklyPlan;
  source: PlannedMeal;
  recipe: Recipe;
  onConfirm: (targetSlotId: string) => string | null;
}) {
  const candidates = leftoverCandidates(plan, source.id, ACTIVE_RECIPES);
  const [error, setError] = useState("");
  return <MobileScroll className="app-screen"><main className="page-content pushed-page plan-slot-page" data-testid="leftover-view">
    <div className="page-heading"><span className="eyebrow">Cuisiner en double</span><h1>{recipe.title}</h1><p>Choisissez le repas qui sera servi avec les restes. Les courses et le coût couvrent déjà les deux repas.</p></div>
    <aside className="conservation-note"><ClockIcon /><span><strong>Conservation</strong>{recipe.conservation}</span></aside>
    {error ? <p className="notice-banner" role="alert">{error}</p> : null}
    {!candidates.length ? <p className="notice-banner" data-testid="leftover-empty">Aucun repas compatible dans les deux jours qui suivent. Les restes se replanifient sur un repas du même type, peu après la cuisson.</p> : null}
    {candidates.map((meal) => { const replaced = recipeById.get(meal.recipeId); return <button type="button" className="plan-slot" key={meal.id} data-testid={`leftover-slot-${meal.id}`} onClick={() => setError(onConfirm(meal.id) ?? "")}>
      <span><small>{DAY_LABELS[meal.dayIndex]} {dateAt(plan.startsOn, meal.dayIndex).getDate()} · {MEAL_LABELS[meal.mealType]}</small><strong>À la place de {replaced?.title ?? "ce repas"}</strong></span><ChevronRightIcon />
    </button>; })}
    <p className="privacy-note">Vérifiez toujours la conservation indiquée et refroidissez rapidement les plats cuisinés en avance.</p>
  </main></MobileScroll>;
}
