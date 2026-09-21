import { type WeeklyPlan, type PlannedMeal, type Recipe, type UserProfile } from "../domain";
import { useState } from "react";
import { CalendarIcon, ArchiveIcon, CopyIcon, CheckCircledIcon, LockClosedIcon, ClockIcon, CheckIcon, ReloadIcon, DotsHorizontalIcon, LockOpen1Icon, Cross2Icon } from "@radix-ui/react-icons";
import { summarizePlan, planProgress, planToCalendar, cookingSessionsOf, type PlanSummary, weeklyTargetsOf } from "../engine";
import { Carousel } from "../mobile";
import { currentDayIndex, dateAt, formatWeekRange, formatRecipeDuration } from "../components/format";
import { EmptyRoot } from "../components/EmptyRoot";
import { ACTIVE_RECIPES, recipeById } from "../app/recipe-registry";
import { downloadTextFile } from "../components/browser-files";
import { DAY_LABELS, MEAL_LABELS } from "../components/constants";
import { handleRecipeImageError } from "../components/recipe-image";
import { MealFacts, CompositionSummary } from "../components/recipe-facts";
import { WebSheet } from "../components/WebSheet";

export function WeekView({ plan, onOpenMeal, onReplace, onToggleLock, onToggleCompleted, onPlanLeftover, onToggleSkipped, onSwap }: { plan: WeeklyPlan | null; onOpenMeal: (planned: PlannedMeal, recipe: Recipe) => void; onReplace: (planned: PlannedMeal, recipe: Recipe) => void; onToggleLock: (planned: PlannedMeal) => void; onToggleCompleted: (planned: PlannedMeal) => void; onPlanLeftover: (planned: PlannedMeal, recipe: Recipe) => void; onToggleSkipped: (planned: PlannedMeal) => void; onSwap: (planned: PlannedMeal) => void }) {
  const [selectedDay, setSelectedDay] = useState(plan ? currentDayIndex(plan.startsOn) : 0);
  const [layout, setLayout] = useState<"day" | "week">("day");
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  if (!plan) return <EmptyRoot icon={CalendarIcon} title="Aucune semaine pour le moment" body="Commencez depuis l’accueil pour générer vos repas." />;
  const summary = summarizePlan(plan, ACTIVE_RECIPES);
  const visibleMeals = plan.meals.filter((meal) => meal.dayIndex === selectedDay);
  const selectedDate = dateAt(plan.startsOn, selectedDay);
  const lockedCount = plan.meals.filter((meal) => meal.locked).length;
  const progress = planProgress(plan);
  return (
    <main className="page-content week-page" data-testid="week-view">
      <div className="page-heading"><span className="eyebrow">{formatWeekRange(plan.startsOn)}</span><h1>Ma semaine</h1><p>Des repas variés, construits par des règles transparentes.</p></div>
      <div className="week-summary"><div><strong>{summary.mealCount}</strong><span>repas</span></div><div><strong>{summary.estimatedCost.toFixed(0)} €</strong><span>estimés</span></div><div><strong>{summary.averagePrepMinutes.toFixed(0)} min</strong><span>actives en moyenne</span></div></div>
      {summary.cookingSessions < summary.mealCount ? <p className="locked-banner" data-testid="leftover-banner"><ArchiveIcon /> {summary.mealCount - summary.cookingSessions} repas servi{summary.mealCount - summary.cookingSessions > 1 ? "s" : ""} avec des restes : {summary.cookingSessions} sessions de cuisine.</p> : null}
      <div className="week-exports">
        <button type="button" className="secondary-button" data-testid="export-calendar" onClick={() => downloadTextFile(`inflamm-menu-${plan.startsOn}.ics`, planToCalendar(plan, ACTIVE_RECIPES), "text/calendar;charset=utf-8")}><CalendarIcon /> Calendrier</button>
        <button type="button" className="secondary-button" data-testid="print-week" onClick={() => window.print()}><CopyIcon /> Imprimer</button>
      </div>
      <div className="week-progress" data-testid="week-progress"><p><CheckCircledIcon /> {progress.completed} sur {progress.total} repas cuisinés</p><span className="week-progress__track"><i style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></span></div>
      {!summary.withinBudget ? <p className="notice-banner">Budget estimé dépassé : les autres critères ont été conservés.</p> : null}
      {lockedCount ? <p className="locked-banner" data-testid="locked-banner"><LockClosedIcon /> {lockedCount} repas conservé{lockedCount > 1 ? "s" : ""} lors de la prochaine génération.</p> : null}
      <div className="segmented-control layout-switch" role="group" aria-label="Affichage de la semaine">
        <button type="button" className={layout === "day" ? "is-selected" : ""} aria-pressed={layout === "day"} data-testid="layout-day" onClick={() => setLayout("day")}>Jour par jour</button>
        <button type="button" className={layout === "week" ? "is-selected" : ""} aria-pressed={layout === "week"} data-testid="layout-week" onClick={() => setLayout("week")}>Semaine entière</button>
      </div>
      {layout === "week" ? <WeekOverview plan={plan} onOpenMeal={onOpenMeal} onFocusDay={(index) => { setSelectedDay(index); setLayout("day"); }} /> : <>
      <Carousel ariaLabel="Choisir un jour" className="day-carousel" contentClassName="day-carousel__track">
        {DAY_LABELS.map((day, index) => <button key={day} type="button" className={`day-card ${selectedDay === index ? "is-selected" : ""}`} aria-pressed={selectedDay === index} onClick={() => setSelectedDay(index)}><span>{day}</span><strong>{dateAt(plan.startsOn, index).getDate()}</strong></button>)}
      </Carousel>
      <section className="day-plan">
        <div className="section-heading"><div><span className="eyebrow">Jour {selectedDay + 1}</span><h2>{selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h2></div><CheckCircledIcon /></div>
        {visibleMeals.map((planned) => { const recipe = recipeById.get(planned.recipeId); if (!recipe) return null; const locked = planned.locked === true; const cooked = planned.completed === true; const skipped = planned.skipped === true; const leftoverSource = planned.leftoverOf ? plan.meals.find((meal) => meal.id === planned.leftoverOf) : undefined; const isLeftover = Boolean(planned.leftoverOf); return (
          <article className={`meal-card ${locked ? "is-locked" : ""} ${cooked ? "is-cooked" : ""} ${isLeftover ? "is-leftover" : ""} ${skipped ? "is-skipped" : ""}`} key={planned.id} data-testid={`meal-card-${planned.id}`} data-locked={locked ? "true" : "false"} data-completed={cooked ? "true" : "false"} data-leftover={isLeftover ? "true" : "false"} data-skipped={skipped ? "true" : "false"}>
            <button type="button" className="meal-card__main" onClick={() => onOpenMeal(planned, recipe)}><img src={recipe.image} alt="" width={900} height={900} loading="lazy" decoding="async" onError={handleRecipeImageError} /><span><small>{MEAL_LABELS[planned.mealType]}{skipped ? " · Hors foyer" : cooked ? " · Cuisiné" : ""}</small><strong>{recipe.title}</strong><em><ClockIcon /> {skipped ? "Repas pris à l’extérieur" : isLeftover ? `Restes${leftoverSource ? ` de ${DAY_LABELS[leftoverSource.dayIndex].toLocaleLowerCase("fr-FR")}` : ""} · rien à cuisiner` : `${formatRecipeDuration(recipe.prepMinutes)} actives`}{skipped ? "" : ` · ${planned.portions} portion${planned.portions > 1 ? "s" : ""}`}</em>{skipped ? null : <MealFacts recipe={recipe} planned={planned} />}</span></button>
            {skipped || isLeftover ? null : <button type="button" className={`meal-card__done ${cooked ? "is-active" : ""}`} aria-pressed={cooked} data-testid={`meal-done-${planned.id}`} aria-label={cooked ? `Annuler « cuisiné » pour ${recipe.title}` : `Marquer ${recipe.title} comme cuisiné`} onClick={() => onToggleCompleted(planned)}><CheckIcon /></button>}
            <div className="meal-card__actions meal-card__actions--pair">
              <button className="meal-card__replace" type="button" disabled={skipped} onClick={() => onReplace(planned, recipe)}><ReloadIcon /> Remplacer</button>
              <button className="meal-card__more" type="button" data-testid={`meal-actions-${planned.id}`} aria-label={`Autres actions pour ${recipe.title}`} onClick={() => setActionsFor(planned.id)}><DotsHorizontalIcon /> Actions</button>
            </div>
          </article>
        ); })}
      </section>
      </>}
      <CookingPlanSection plan={plan} />
      <WeekBalance summary={summary} profile={plan.profileSnapshot} />
      <MealActionsSheet plan={plan} slotId={actionsFor} onClose={() => setActionsFor(null)} onReplace={onReplace} onToggleLock={onToggleLock} onToggleCompleted={onToggleCompleted} onPlanLeftover={onPlanLeftover} onToggleSkipped={onToggleSkipped} onSwap={onSwap} />
    </main>
  );
}

/** Seven days at a glance, to plan the week rather than browse it day by day. */
function WeekOverview({ plan, onOpenMeal, onFocusDay }: { plan: WeeklyPlan; onOpenMeal: (planned: PlannedMeal, recipe: Recipe) => void; onFocusDay: (dayIndex: number) => void }) {
  const today = currentDayIndex(plan.startsOn);
  return (
    <section className="week-overview" data-testid="week-overview" aria-label="Vue de la semaine entière">
      {DAY_LABELS.map((day, dayIndex) => {
        const meals = plan.meals.filter((meal) => meal.dayIndex === dayIndex);
        return (
          <article className={`week-overview__day ${dayIndex === today ? "is-today" : ""}`} key={day}>
            <button type="button" className="week-overview__heading" onClick={() => onFocusDay(dayIndex)}>
              <strong>{day}</strong><span>{dateAt(plan.startsOn, dayIndex).getDate()}</span>
            </button>
            <div className="week-overview__meals">
              {meals.map((meal) => { const recipe = recipeById.get(meal.recipeId); return (
                <button type="button" key={meal.id} className={`week-overview__meal ${meal.completed ? "is-cooked" : ""} ${meal.skipped ? "is-skipped" : ""}`} data-testid={`overview-${meal.id}`} disabled={!recipe} onClick={() => recipe && onOpenMeal(meal, recipe)}>
                  <small>{MEAL_LABELS[meal.mealType].slice(0, 4)}.</small>
                  <span>{meal.skipped ? "Hors foyer" : recipe?.title ?? "Indisponible"}</span>{recipe && !meal.skipped ? <CompositionSummary recipe={recipe} /> : null}
                  {meal.leftoverOf ? <i aria-label="Restes"><ArchiveIcon /></i> : null}
                  {meal.locked ? <i aria-label="Conservé"><LockClosedIcon /></i> : null}
                </button>
              ); })}
            </div>
          </article>
        );
      })}
    </section>
  );
}

/** What has to be cooked, grouped by day, so a batch session can be planned. */
function CookingPlanSection({ plan }: { plan: WeeklyPlan }) {
  const sessions = cookingSessionsOf(plan, ACTIVE_RECIPES);
  if (!sessions.length) return null;
  return (
    <section className="cooking-plan" data-testid="cooking-plan" aria-label="Sessions de cuisine">
      <div className="section-heading"><div><span className="eyebrow">Préparation</span><h2>Ce qu’il y a à cuisiner</h2></div></div>
      <ul>
        {sessions.map((session) => (
          <li key={session.dayIndex}>
            <span><strong>{DAY_LABELS[session.dayIndex]} {dateAt(plan.startsOn, session.dayIndex).getDate()}</strong><small>{session.meals.length} plat{session.meals.length > 1 ? "s" : ""}{session.servesLater ? ` · nourrit ${session.servesLater} repas de plus` : ""}</small></span>
            <b>{formatRecipeDuration(session.activeMinutes)}</b>
          </li>
        ))}
      </ul>
      <p className="catalogue-disclaimer">Temps actifs cumulés, hors repos et cuisson non surveillée. Les repas de restes et les repas hors foyer n’y figurent pas.</p>
    </section>
  );
}

function MealActionsSheet({ plan, slotId, onClose, onReplace, onToggleLock, onToggleCompleted, onPlanLeftover, onToggleSkipped, onSwap }: {
  plan: WeeklyPlan;
  slotId: string | null;
  onClose: () => void;
  onReplace: (planned: PlannedMeal, recipe: Recipe) => void;
  onToggleLock: (planned: PlannedMeal) => void;
  onToggleCompleted: (planned: PlannedMeal) => void;
  onPlanLeftover: (planned: PlannedMeal, recipe: Recipe) => void;
  onToggleSkipped: (planned: PlannedMeal) => void;
  onSwap: (planned: PlannedMeal) => void;
}) {
  const planned = plan.meals.find((meal) => meal.id === slotId);
  const recipe = planned ? recipeById.get(planned.recipeId) : undefined;
  const isLeftover = Boolean(planned?.leftoverOf);
  const hasLeftover = Boolean(planned && plan.meals.some((meal) => meal.leftoverOf === planned.id));
  const skipped = planned?.skipped === true;
  const run = (action: () => void) => { onClose(); action(); };
  return (
    <WebSheet open={Boolean(planned && recipe)} onOpenChange={(open) => { if (!open) onClose(); }} title={recipe?.title ?? "Repas"} description={planned ? `${DAY_LABELS[planned.dayIndex]} · ${MEAL_LABELS[planned.mealType]}` : undefined}>
      {planned && recipe ? <div className="meal-actions" data-testid="meal-actions-sheet">
        <button type="button" data-testid="action-completed" disabled={skipped || isLeftover} onClick={() => run(() => onToggleCompleted(planned))}><CheckCircledIcon /> {planned.completed ? "Ne plus marquer comme cuisiné" : "Marquer comme cuisiné"}</button>
        <button type="button" data-testid="action-swap" disabled={skipped || isLeftover || hasLeftover} onClick={() => run(() => onSwap(planned))}><ReloadIcon /> Échanger avec un autre repas</button>
        <button type="button" data-testid="action-leftover" disabled={skipped || isLeftover || hasLeftover} onClick={() => run(() => onPlanLeftover(planned, recipe))}><ArchiveIcon /> {hasLeftover ? "Restes déjà prévus" : "Cuisiner en double"}</button>
        <button type="button" data-testid="action-lock" disabled={skipped || isLeftover} onClick={() => run(() => onToggleLock(planned))}>{planned.locked ? <LockClosedIcon /> : <LockOpen1Icon />} {planned.locked ? "Ne plus conserver" : "Conserver à la prochaine génération"}</button>
        <button type="button" data-testid="action-skip" disabled={hasLeftover} onClick={() => run(() => onToggleSkipped(planned))}><Cross2Icon /> {skipped ? "Remettre ce repas au menu" : "Repas hors foyer"}</button>
        <button type="button" data-testid="action-replace" disabled={skipped} onClick={() => run(() => onReplace(planned, recipe))}><ReloadIcon /> Remplacer par une autre recette</button>
      </div> : null}
    </WebSheet>
  );
}

/**
 * Weekly organisation markers. Deliberately framed as dietary-pattern habits
 * rather than a nutritional or medical assessment of the week.
 */
function WeekBalance({ summary, profile }: { summary: PlanSummary; profile: UserProfile }) {
  const targets = weeklyTargetsOf(profile);
  const rows: Array<{ label: string; value: number; target?: number; hint: string }> = [
    { label: "Repas avec légumes secs ou soja", value: summary.legumeMeals, target: targets.legumeMeals, hint: "Lentilles, pois chiches, haricots, fèves, tofu ou tempeh" },
    ...(profile.diet === "classic" ? [{ label: "Repas avec poisson", value: summary.fishMeals, target: targets.fishMeals, hint: "Dont poissons gras si possible" }] : []),
    { label: "Repas avec céréales complètes", value: summary.wholeGrainMeals, hint: "Riz complet, épeautre, sarrasin" },
    { label: "Repas avec noix ou graines", value: summary.nutOrSeedMeals, hint: "Sources de graisses insaturées" },
    { label: "Repas de saison", value: summary.seasonalMeals, hint: "Saison en cours ou toute l’année" },
    { label: "Végétaux différents", value: summary.plantDiversity, hint: "Légumes, fruits, légumineuses, céréales, herbes et épices" },
  ];
  return (
    <section className="week-balance" data-testid="week-balance" aria-label="Bilan de la semaine">
      <div className="section-heading"><div><span className="eyebrow">Repères</span><h2>Bilan de la semaine</h2></div></div>
      <ul>
        {rows.map((row) => (
          <li key={row.label} className={row.target !== undefined ? (row.value >= row.target ? "is-met" : "is-below") : ""}>
            <span><strong>{row.label}</strong><small>{row.hint}</small></span>
            <b>{row.value}{row.target !== undefined ? <i> / {row.target} visés</i> : null}</b>
          </li>
        ))}
      </ul>
      {summary.plantIngredients.length ? <details className="plant-diversity-details" data-testid="plant-diversity"><summary>Voir les {summary.plantDiversity} végétaux comptés</summary><p>{summary.plantIngredients.join(" · ")}</p></details> : null}
      {summary.nutritionComplete ? <div className="week-balance__nutrition"><span><strong>{summary.averageCalories.toFixed(0)}</strong> kcal</span><span><strong>{summary.averageProtein.toFixed(0)}</strong> g protéines</span><span><strong>{summary.averageFiber.toFixed(0)}</strong> g fibres</span></div> : <p className="inline-help" data-testid="nutrition-incomplete">Moyennes nutritionnelles non disponibles : certaines recettes modifiées ou substitutions ne disposent pas d’une estimation recalculée.</p>}
      {!summary.costComplete ? <p className="inline-help">Certains coûts n’ont pas pu être recalculés après modification des ingrédients ; le total conserve ces estimations antérieures.</p> : null}
      <p className="catalogue-disclaimer">Moyennes estimatives par portion, à titre indicatif. Ces repères décrivent l’organisation de vos repas selon un modèle méditerranéen ; ils ne constituent ni une évaluation nutritionnelle ni un avis médical.</p>
    </section>
  );
}
