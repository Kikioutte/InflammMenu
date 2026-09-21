import { type UserProfile, type Recipe } from "../domain";
import { useState, useMemo, useEffect } from "react";
import { recommendTonight, seasonForIsoDate, diagnoseRecipeCompatibility, recipeForm } from "../engine";
import { MobileScroll } from "../mobile";
import { MinusIcon, PlusIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { ACTIVE_RECIPES } from "../app/recipe-registry";
import { isoDate, formatRecipeDuration, formatEuros } from "../components/format";
import { handleRecipeImageError } from "../components/recipe-image";
import { CompatibilityHelp } from "../components/CompatibilityHelp";

const TONIGHT_PAGE_SIZE = 6;

export function TonightView({ profile, pantryIds, favoriteIds, onOpenRecipe, onOpenProfile }: {
  profile: UserProfile;
  pantryIds: string[];
  favoriteIds: string[];
  onOpenRecipe: (recipe: Recipe, portions: number) => void;
  onOpenProfile: () => void;
}) {
  const [mealType, setMealType] = useState<"lunch" | "dinner">("dinner");
  const [maxMinutes, setMaxMinutes] = useState(Math.min(45, profile.maxPrepMinutes));
  const [portions, setPortions] = useState(Math.min(8, Math.max(1, profile.people)));
  const [visibleCount, setVisibleCount] = useState(TONIGHT_PAGE_SIZE);
  const recommendations = useMemo(() => recommendTonight(ACTIVE_RECIPES, profile, {
    mealType,
    maxPrepMinutes: maxMinutes,
    portions,
    pantryIngredientIds: pantryIds,
    favoriteRecipeIds: favoriteIds,
    season: seasonForIsoDate(isoDate(new Date())),
    limit: ACTIVE_RECIPES.length,
  }), [favoriteIds, maxMinutes, mealType, pantryIds, portions, profile]);
  const diagnostic = useMemo(() => diagnoseRecipeCompatibility(ACTIVE_RECIPES, profile, {
    mealType,
    maxPrepMinutes: maxMinutes,
  }), [maxMinutes, mealType, profile]);
  useEffect(() => setVisibleCount(TONIGHT_PAGE_SIZE), [favoriteIds, maxMinutes, mealType, pantryIds, portions, profile]);
  const visibleRecommendations = recommendations.slice(0, visibleCount);
  const nextCount = Math.min(TONIGHT_PAGE_SIZE, recommendations.length - visibleRecommendations.length);
  return <MobileScroll className="app-screen"><main className="page-content pushed-page tonight-page" data-testid="tonight-view">
    <div className="page-heading"><span className="eyebrow">Décision rapide</span><h1>Que cuisiner ce soir ?</h1><p>Des idées compatibles avec votre profil, classées selon le temps, le budget et ce que vous avez déjà.</p></div>
    <section className="tonight-controls">
      <fieldset><legend>Pour quel repas ?</legend><div className="choice-row"><button type="button" className={mealType === "lunch" ? "is-selected" : ""} aria-pressed={mealType === "lunch"} onClick={() => setMealType("lunch")}>Déjeuner</button><button type="button" className={mealType === "dinner" ? "is-selected" : ""} aria-pressed={mealType === "dinner"} onClick={() => setMealType("dinner")}>Dîner</button></div></fieldset>
      <fieldset><legend>Temps actif disponible</legend><div className="choice-row">{[15, 20, 30, 45, 60].map((minutes) => <button type="button" key={minutes} className={maxMinutes === minutes ? "is-selected" : ""} aria-pressed={maxMinutes === minutes} data-testid={`tonight-time-${minutes}`} onClick={() => setMaxMinutes(minutes)}>{minutes} min</button>)}</div></fieldset>
      <div className="setting-row"><span><strong>Nombre de portions</strong><small>Quantités de la recette adaptées</small></span><div className="stepper"><button type="button" aria-label="Retirer une portion" onClick={() => setPortions((value) => Math.max(1, value - 1))}><MinusIcon /></button><b data-testid="tonight-portions">{portions}</b><button type="button" aria-label="Ajouter une portion" onClick={() => setPortions((value) => Math.min(8, value + 1))}><PlusIcon /></button></div></div>
    </section>
    <section className="tonight-results" aria-live="polite"><div className="section-heading"><div><span className="eyebrow">Suggestions</span><h2>{recommendations.length ? "Prêtes à cuisiner" : "Aucune recette compatible"}</h2></div></div>
      {recommendations.length ? <p className="tonight-results__count" data-testid="tonight-results-count">{visibleRecommendations.length} recette{visibleRecommendations.length > 1 ? "s" : ""} sur {recommendations.length}</p> : null}
      {visibleRecommendations.map(({ recipe, pantryMatches, estimatedCost }) => <button type="button" className="tonight-card" key={recipe.id} data-testid={`tonight-result-${recipe.id}`} data-recipe-form={recipeForm(recipe)} onClick={() => onOpenRecipe(recipe, portions)}><img src={recipe.image} alt="" width={900} height={900} loading="lazy" onError={handleRecipeImageError} /><span><small>{formatRecipeDuration(recipe.prepMinutes)} actives · {formatEuros(estimatedCost)}</small><strong>{recipe.title}</strong><em>{pantryMatches ? `${pantryMatches} ingrédient${pantryMatches > 1 ? "s" : ""} déjà en réserve` : "Ingrédients à vérifier dans les courses"}</em></span><ChevronRightIcon /></button>)}
      {nextCount > 0 ? <button type="button" className="secondary-button full-button tonight-more" data-testid="tonight-more" onClick={() => setVisibleCount((count) => count + TONIGHT_PAGE_SIZE)}>Voir {nextCount} recette{nextCount > 1 ? "s" : ""} de plus</button> : null}
      {recommendations.length > 0 && recommendations.length < TONIGHT_PAGE_SIZE ? <p className="notice-banner">Seulement {recommendations.length} recette{recommendations.length > 1 ? "s correspondent" : " correspond"} à ces critères. Augmentez le temps disponible ou vérifiez vos équipements pour obtenir plus de choix.</p> : null}
      {!recommendations.length ? <CompatibilityHelp diagnostic={diagnostic} selectedMinutes={maxMinutes} onUseMinutes={setMaxMinutes} onOpenProfile={onOpenProfile} /> : null}
    </section>
    <p className="privacy-note">Les propositions respectent les allergies, aliments exclus, équipements et préférences enregistrés.</p>
  </main></MobileScroll>;
}
