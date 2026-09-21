import { type WeeklyPlan, type UserProfile, type Recipe } from "../domain";
import { inspectPlanReplay, summarizePlan, planProgress } from "../engine";
import { MobileScroll } from "../mobile";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { ACTIVE_RECIPES, recipeById } from "../app/recipe-registry";
import { formatWeekRange, dateAt } from "../components/format";
import { DAY_LABELS, MEAL_LABELS } from "../components/constants";

export function HistoryPlanView({ plan, profile, onOpenRecipe, onReplay }: {
  plan: WeeklyPlan;
  profile: UserProfile;
  onOpenRecipe: (recipe: Recipe) => void;
  onReplay: () => void;
}) {
  const report = inspectPlanReplay(plan, ACTIVE_RECIPES, profile);
  const summary = summarizePlan(plan, ACTIVE_RECIPES, profile);
  const cookedCount = planProgress(plan).completed;
  return <MobileScroll className="app-screen"><main className="page-content pushed-page history-page" data-testid="history-plan-view">
    <div className="page-heading"><span className="eyebrow">Générée le {new Date(plan.generatedAt).toLocaleDateString("fr-FR")}</span><h1>{formatWeekRange(plan.startsOn)}</h1><p>{summary.mealCount} repas archivés{cookedCount ? `, dont ${cookedCount} cuisiné${cookedCount > 1 ? "s" : ""}` : ""}.</p></div>
    <div className="week-summary"><div><strong>{summary.mealCount}</strong><span>repas</span></div><div><strong>{plan.estimatedCost.toFixed(0)} €</strong><span>estimés</span></div><div><strong>{summary.averagePrepMinutes.toFixed(0)} min</strong><span>actives en moyenne</span></div></div>
    {report.canReplay
      ? <button className="primary-button full-button" type="button" data-testid="replay-plan" onClick={onReplay}>Reprendre cette semaine</button>
      : <p className="notice-banner" data-testid="replay-blocked">{report.blockedMeals.length ? `${report.blockedMeals.length} repas ne correspond${report.blockedMeals.length > 1 ? "ent" : ""} plus à votre profil actuel (allergies, régime, équipement ou temps).` : "Cette semaine ne couvre pas tous les repas demandés par votre profil actuel."} Générez une nouvelle semaine pour rester dans vos critères.</p>}
    {DAY_LABELS.map((day, dayIndex) => {
      const dayMeals = plan.meals.filter((meal) => meal.dayIndex === dayIndex);
      if (!dayMeals.length) return null;
      return <section className="history-day" key={day}>
        <h2>{day} {dateAt(plan.startsOn, dayIndex).getDate()}</h2>
        {dayMeals.map((meal) => { const recipe = recipeById.get(meal.recipeId); return <button type="button" className="history-meal" key={meal.id} disabled={!recipe} onClick={() => recipe && onOpenRecipe(recipe)}>
          <span><small>{MEAL_LABELS[meal.mealType]}{meal.completed ? " · Cuisiné" : ""}</small><strong>{recipe?.title ?? "Recette indisponible"}</strong></span>{recipe ? <ChevronRightIcon /> : null}
        </button>; })}
      </section>;
    })}
    <p className="privacy-note">Reprendre une semaine crée un nouveau menu pour la semaine en cours : les portions suivent votre profil actuel et les repères « cuisiné » repartent de zéro.</p>
  </main></MobileScroll>;
}
