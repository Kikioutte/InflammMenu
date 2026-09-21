import { useState } from "react";
import { MobileScroll } from "../mobile";
import { type WeeklyPlan, type Recipe, type UserProfile } from "../domain";
import { type PlanSlot, assignableSlots } from "../engine";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { ACTIVE_RECIPES, recipeById } from "../app/recipe-registry";
import { DAY_LABELS, MEAL_LABELS } from "../components/constants";
import { dateAt } from "../components/format";

export function PrepareWeekForMeal({ onCreate, onProfile }: { onCreate: () => void; onProfile: () => void }) {
  const [error, setError] = useState("");
  return <MobileScroll className="app-screen"><main className="page-content pushed-page"><h1>Une semaine pour votre repas</h1><p>Préparez les autres repas de la semaine selon votre profil, puis choisissez le jour où placer votre entrée, votre plat et votre dessert.</p><button type="button" className="primary-button full-button" onClick={() => { try { onCreate(); } catch (failure) { setError(failure instanceof Error ? failure.message : "La semaine n’a pas pu être créée."); } }}>Créer la semaine et choisir le jour</button>{error ? <p role="alert">{error}</p> : null}<button type="button" className="text-button" onClick={onProfile}>Ajuster mon profil</button></main></MobileScroll>;
}

export function PlanSlotView({ plan, recipe, profile, onConfirm, onProfile }: {
  plan: WeeklyPlan;
  recipe: Recipe;
  profile: UserProfile;
  onConfirm: (slot: PlanSlot, portions: number) => string | null;
  onProfile: () => void;
}) {
  const slots = assignableSlots(plan, recipe, profile, ACTIVE_RECIPES.flatMap((item) => item.ingredients));
  const [portions, setPortions] = useState(profile.people);
  const [error, setError] = useState("");
  const alreadyPlanned = plan.meals.find((meal) => !meal.skipped && meal.recipeId === recipe.id);
  return <MobileScroll className="app-screen"><main className="page-content pushed-page plan-slot-page" data-testid="plan-slot-view">
    <div className="page-heading"><span className="eyebrow">Planifier</span><h1>{recipe.title}</h1><p>Choisissez le repas à remplacer. Les allergies, le régime, l’équipement et le temps actif restent respectés.</p></div>
    {recipe.composition ? <><p>{recipe.description}</p><p className="inline-help">{recipe.prepMinutes} min de préparation active cumulée. Le temps maximum de votre profil s’applique au repas entier.</p><label>Personnes pour ce repas<select aria-label="Personnes pour ce repas" value={portions} onChange={(event) => setPortions(Number(event.target.value))}>{[1,2,3,4,5,6,7,8].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><p>Les courses comprendront l’entrée, le plat et le dessert pour {portions} personne{portions > 1 ? "s" : ""}.</p></> : null}
    {alreadyPlanned ? <p className="notice-banner" data-testid="already-planned">Cette recette est déjà au menu ({DAY_LABELS[alreadyPlanned.dayIndex]}, {MEAL_LABELS[alreadyPlanned.mealType].toLocaleLowerCase("fr-FR")}). Une même recette n’est pas répétée dans la semaine.</p> : null}
    {error ? <p className="notice-banner" role="alert">{error}</p> : null}
    {!slots.length ? <><p className="notice-banner">Aucun créneau compatible : cette recette ne correspond pas à vos critères ou aux repas générés.</p><button type="button" className="secondary-button" onClick={onProfile}>Vérifier les critères de mon profil</button></> : null}
    {DAY_LABELS.map((day, dayIndex) => {
      const daySlots = slots.filter((slot) => slot.dayIndex === dayIndex);
      if (!daySlots.length) return null;
      return <section className="plan-slot-day" key={day}>
        <h2>{day} {dateAt(plan.startsOn, dayIndex).getDate()}</h2>
        {daySlots.map((slot) => { const replaced = recipeById.get(slot.taken); return <button type="button" className="plan-slot" key={`${slot.dayIndex}-${slot.mealType}`} disabled={Boolean(alreadyPlanned)} data-testid={`plan-slot-${slot.dayIndex}-${slot.mealType}`} onClick={() => setError(onConfirm({ dayIndex: slot.dayIndex, mealType: slot.mealType }, portions) ?? "")}>
          <span><small>{MEAL_LABELS[slot.mealType]}</small><strong>À la place de {replaced?.title ?? "ce repas"}</strong></span><ChevronRightIcon />
        </button>; })}
      </section>;
    })}
  </main></MobileScroll>;
}
