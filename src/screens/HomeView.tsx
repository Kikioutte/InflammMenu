import { type PlannedMeal, type Recipe, type UserProfile, type WeeklyPlan } from "../domain";
import { MoonIcon, SunIcon, CheckCircledIcon, ChevronRightIcon, ClockIcon, ReaderIcon, DownloadIcon, CalendarIcon, PersonIcon } from "@radix-ui/react-icons";
import { handleRecipeImageError } from "../components/recipe-image";
import { CompositionSummary } from "../components/recipe-facts";
import { MEAL_LABELS, DAY_LABELS } from "../components/constants";
import { dateAt, currentDayIndex, isoDate, formatWeekRange } from "../components/format";
import { Wordmark } from "../components/Wordmark";
import { contextualRemindersForDate } from "../engine";
import { ACTIVE_RECIPES, recipeById } from "../app/recipe-registry";
import { WeekStrip } from "../components/WeekStrip";

function MealPreview({ planned, recipe, startsOn, onOpen }: { planned: PlannedMeal; recipe: Recipe; startsOn: string; onOpen: () => void }) {
  const MealIcon = planned.mealType === "dinner" ? MoonIcon : SunIcon;
  const cooked = planned.completed === true;
  return (
    <button type="button" className={`meal-preview ${cooked ? "is-cooked" : ""}`} data-completed={cooked ? "true" : "false"} onClick={onOpen}>
      <img src={recipe.image} alt="" width={900} height={900} loading="lazy" decoding="async" onError={handleRecipeImageError} /><span className="meal-preview__icon" aria-hidden="true">{cooked ? <CheckCircledIcon /> : <MealIcon />}</span>
      <span className="meal-preview__copy"><strong>{recipe.title}</strong><CompositionSummary recipe={recipe} /><small>{MEAL_LABELS[planned.mealType]} · {DAY_LABELS[planned.dayIndex]} {dateAt(startsOn, planned.dayIndex).getDate()}{cooked ? " · Cuisiné" : ""}</small></span>
      <ChevronRightIcon className="meal-preview__chevron" />
    </button>
  );
}

/** First run: the profile carries the allergies, so it comes before any menu. */
export function OnboardingView({ profile, onOpenProfile, onSkip }: { profile: UserProfile; onOpenProfile: () => void; onSkip: () => void }) {
  return (
    <main className="page-content onboarding-view" data-testid="onboarding-view">
      <div className="page-heading"><Wordmark /><span className="eyebrow">Bienvenue</span><h1>Deux minutes pour des menus qui vous correspondent</h1><p>Inflamm’Menu compose vos semaines localement, sans compte et sans envoyer vos données.</p></div>
      <ol className="onboarding-steps">
        <li><b>1</b><span><strong>Vos allergies et votre régime</strong><small>Ce sont des filtres stricts : une recette qui les enfreint n’est jamais proposée.</small></span></li>
        <li><b>2</b><span><strong>Votre foyer et votre budget</strong><small>Nombre de personnes, repas par jour, temps de cuisine et budget hebdomadaire.</small></span></li>
        <li><b>3</b><span><strong>Votre première semaine</strong><small>Générée en quelques secondes, modifiable repas par repas.</small></span></li>
      </ol>
      <p className="notice-banner">Renseigner vos allergies avant la première génération est important : sans cela, le menu ne peut pas les éviter.</p>
      <button type="button" className="primary-button full-button" data-testid="onboarding-profile" onClick={onOpenProfile}>Renseigner mon profil</button>
      <button type="button" className="secondary-button full-button" data-testid="onboarding-skip" onClick={onSkip}>Plus tard, aller à l’accueil</button>
      <p className="privacy-note">Inflamm’Menu est un outil d’organisation alimentaire et ne remplace pas l’avis d’un professionnel de santé.</p>
    </main>
  );
}

export function HomeView({ profile, plan, archivedWeek, upcomingPlan, onGenerate, onTonight, onProfile, onOpenMeal, onOpenWeek, onRecipes, onInformation }: {
  profile: UserProfile;
  plan: WeeklyPlan | null;
  archivedWeek?: WeeklyPlan | null;
  upcomingPlan?: WeeklyPlan | null;
  onGenerate: () => void;
  onTonight: () => void;
  onProfile: () => void;
  onOpenMeal: (planned: PlannedMeal, recipe: Recipe) => void;
  onOpenWeek: () => void;
  onRecipes: () => void;
  onInformation: () => void;
}) {
  const todayIndex = plan ? currentDayIndex(plan.startsOn) : 0;
  const todayMeals = plan?.meals.filter((meal) => meal.dayIndex === todayIndex) ?? [];
  const firstName = profile.firstName.trim();
  const contextualReminders = contextualRemindersForDate(plan, ACTIVE_RECIPES, isoDate(new Date()));
  return (
    <main className="home-view" data-testid="home-view">
      <section className="home-hero">
        <img className="home-hero__image" src="/assets/inflamm-hero-bowl.jpg" alt="Bowl de quinoa, pois chiches et légumes rôtis" />
        <div className="home-hero__content">
          <Wordmark /><p className="home-kicker">Bonjour{firstName ? ` ${firstName}` : ""}</p><h1>Une semaine<br />qui vous fait<br />du bien</h1>
          <button className="primary-button home-cta" type="button" onClick={onGenerate}>{plan ? "Créer une autre semaine" : "Générer ma semaine"}</button>
          <button className="secondary-button home-tonight" type="button" data-testid="tonight-open" onClick={onTonight}><ClockIcon /> Que cuisiner ce soir ?</button>
          <p className="home-meta">{profile.mealsPerDay * 7} repas · {profile.people} personne{profile.people > 1 ? "s" : ""} · {profile.weeklyBudget} € de budget cible</p>
        </div>
      </section>
      <section className="home-shortcuts" aria-label="Pour commencer"><button type="button" className="secondary-button" onClick={onRecipes}><ReaderIcon /> Trouver une recette</button><p>Pour composer un repas : ouvrez un plat qui vous plaît, puis « Composer un repas compatible ».</p><button type="button" className="text-button" onClick={onInformation}><DownloadIcon /> Sauvegarde et hors-ligne</button></section>
      <section className="week-preview" aria-labelledby="week-preview-title">
        <button className="week-preview__header" type="button" onClick={onOpenWeek}>
          <CalendarIcon /><h2 id="week-preview-title">{plan ? formatWeekRange(plan.startsOn) : "Votre semaine"}</h2><span>{plan ? "Voir tout" : "À créer"}</span>
        </button>
        {upcomingPlan ? <p className="locked-banner expired-banner" data-testid="upcoming-banner"><CalendarIcon /> Semaine du {formatWeekRange(upcomingPlan.startsOn)} déjà préparée : elle prendra le relais automatiquement.</p> : null}
        {archivedWeek && !plan ? <p className="notice-banner expired-banner" data-testid="expired-banner">Votre semaine du {formatWeekRange(archivedWeek.startsOn)} est terminée : elle a rejoint l’historique. Générez la suivante quand vous le souhaitez.</p> : null}
        {contextualReminders.length ? <section className="contextual-reminders" data-testid="contextual-reminders"><div className="section-heading"><div><span className="eyebrow">Aujourd’hui</span><h2>À ne pas oublier</h2></div></div>{contextualReminders.map((reminder) => { const recipe = recipeById.get(reminder.meal.recipeId); return <button type="button" key={reminder.id} disabled={!recipe} onClick={() => recipe && onOpenMeal(reminder.meal, recipe)}><ClockIcon /><span><strong>{reminder.title}</strong><small>{reminder.body}</small></span><ChevronRightIcon /></button>; })}</section> : null}
        {plan ? <><WeekStrip startsOn={plan.startsOn} selected={todayIndex} compact /><div className="meal-list">
          {todayMeals.map((planned) => { const recipe = recipeById.get(planned.recipeId); return recipe ? <MealPreview key={planned.id} planned={planned} recipe={recipe} startsOn={plan.startsOn} onOpen={() => onOpenMeal(planned, recipe)} /> : null; })}
        </div></> : <div className="empty-preview"><CalendarIcon /><p>Créez votre premier menu directement sur cet appareil.</p></div>}
        <button className="profile-link" type="button" onClick={onProfile}><PersonIcon /><span>Ajuster mon profil</span><ChevronRightIcon /></button>
      </section>
    </main>
  );
}
