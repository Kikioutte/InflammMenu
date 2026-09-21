import { type ReactNode, useState, useEffect } from "react";
import { type Recipe, type PlannedMeal, type UserProfile } from "../domain";
import { MAX_MEAL_PORTIONS, MIN_MEAL_PORTIONS, ingredientsForPlannedMeal, ingredientSubstitutionsFor, advancePrepFor, plannedMealAllergens } from "../engine";
import { canonicalIngredientId } from "../shopping";
import { hasIngredientExclusionConflict, hasAllergyConflict } from "../food-restrictions";
import { recalculateCustomNutrition } from "../recipe-nutrition";
import { type CatalogueRecipe, loadPlannerCaution, loadCatalogue, reviewFor } from "../catalog";
import { MobileScroll, KeyboardTextarea } from "../mobile";
import { ClockIcon, PersonIcon, ReloadIcon, CalendarIcon, HeartFilledIcon, HeartIcon, CheckCircledIcon, MinusIcon, PlusIcon, MixerHorizontalIcon, CopyIcon } from "@radix-ui/react-icons";
import { isAssociationRecipe, evaluateAssociations } from "../food-associations";
import { formatIngredientQuantity as displayQuantity } from "../presentation";
import { scaleAssociationStep } from "../composed-meal";
import { type RecipeRating } from "../app/types";
import { ACTIVE_RECIPES } from "../app/recipe-registry";
import { catalogueDurationItems, formatRecipeDuration, advanceHeadline } from "../components/format";
import { handleRecipeImageError } from "../components/recipe-image";
import { MEAL_LABELS } from "../components/constants";
import { AllergenNotice, AssociationNotice } from "../components/recipe-facts";
import { RecipeFeedback } from "../components/RecipeFeedback";

export function RecipeView({ tools, recipe, planned, profile, initialPortions = 2, favorite, onFavorite, onReplace, onPlan, onPortionsChange, onSubstitutionChange, onCook, rating = "neutral", onRate, note = "", onNoteChange, onDuplicate, onEdit, onRecompose }: { tools?: (portions: number) => ReactNode; recipe: Recipe; planned?: PlannedMeal; profile: UserProfile; initialPortions?: number; favorite: boolean; onFavorite: () => void; onReplace?: () => void; onPlan?: () => void; onPortionsChange?: (portions: number) => void; onSubstitutionChange?: (ingredientId: string, substitutionId: string | null) => string | null; onCook?: (portions: number) => void; rating?: RecipeRating; onRate?: (rating: RecipeRating) => void; note?: string; onNoteChange?: (note: string) => void; onDuplicate?: () => void; onEdit?: () => void; onRecompose?: () => Promise<void> }) {
  const [compositionMessage, setCompositionMessage] = useState("");
  const [portions, setPortionsState] = useState(planned?.portions ?? initialPortions);
  const setPortions = (update: (value: number) => number) => {
    const next = Math.min(MAX_MEAL_PORTIONS, Math.max(MIN_MEAL_PORTIONS, update(portions)));
    if (next === portions) return;
    setPortionsState(next);
    onPortionsChange?.(next);
  };
  const [isFavorite, setIsFavorite] = useState(favorite);
  const [openSubstitutionFor, setOpenSubstitutionFor] = useState<string | null>(null);
  useEffect(() => { if (planned) setPortionsState(planned.portions); }, [planned?.portions]);
  useEffect(() => { setIsFavorite(favorite); }, [favorite]);
  const ingredients = ingredientsForPlannedMeal(recipe, planned, portions);
  const selectedSubstitutions = new Map((planned?.substitutions ?? []).map((selection) => [canonicalIngredientId(selection.ingredientId), selection.substitutionId]));
  const [substitutionError, setSubstitutionError] = useState("");
  const applySubstitution = (ingredientId: string, substitutionId: string | null) => {
    const error = onSubstitutionChange?.(ingredientId, substitutionId) ?? null;
    setSubstitutionError(error ?? "");
    if (!error) setOpenSubstitutionFor(null);
  };
  const knownIngredients = ACTIVE_RECIPES.flatMap((item) => item.ingredients);
  const allowedSubstitutions = (ingredient: Recipe["ingredients"][number]) => ingredientSubstitutionsFor(ingredient).filter((rule) =>
    !hasIngredientExclusionConflict(profile.excludedIngredientIds, [rule.replacement], knownIngredients)
    && !hasAllergyConflict(profile.allergies, rule.replacement.allergens ?? [], [rule.replacement], knownIngredients));
  const nutritionKey = JSON.stringify([recipe.id, recipe.ingredients, planned?.substitutions]);
  const hasSubstitutions = Boolean(planned?.substitutions?.length);
  const [variantNutrition, setVariantNutrition] = useState<{ key: string; value: Recipe["nutrition"] | null } | null>(null);
  useEffect(() => {
    if (!hasSubstitutions) return;
    let active = true;
    void recalculateCustomNutrition(recipe.id, ingredientsForPlannedMeal(recipe, planned, 1)).then((value) => {
      if (active) setVariantNutrition({ key: nutritionKey, value });
    });
    return () => { active = false; };
  }, [nutritionKey, hasSubstitutions]);
  const visibleNutrition = hasSubstitutions
    ? variantNutrition?.key === nutritionKey ? variantNutrition.value : null
    : recipe.nutritionRecalculated === false ? null : recipe.nutrition;
  const advance = advancePrepFor(recipe);
  const [catalogueRecipe, setCatalogueRecipe] = useState<CatalogueRecipe | undefined>();
  const [offlineCaution, setOfflineCaution] = useState<string | undefined>(recipe.caution);
  useEffect(() => {
    if (!recipe.id.startsWith("catalog-")) { setOfflineCaution(recipe.caution); return; }
    let active = true;
    void loadPlannerCaution(recipe.id).then((caution) => { if (active) setOfflineCaution(caution); }).catch(() => undefined);
    return () => { active = false; };
  }, [recipe.id, recipe.caution]);
  useEffect(() => {
    if (!recipe.id.startsWith("catalog-")) return;
    let active = true;
    void loadCatalogue()
      .then((catalogue) => {
        if (active) setCatalogueRecipe(catalogue.recipes.find((item) => item.id === recipe.id.slice("catalog-".length)));
      })
      // The recipe stays readable without its catalogue extras.
      .catch(() => undefined);
    return () => { active = false; };
  }, [recipe.id]);
  const catalogueReview = catalogueRecipe ? reviewFor(catalogueRecipe) : undefined;
  const displayedCaution = recipe.caution ?? offlineCaution ?? catalogueReview?.caution;
  const durationItems = catalogueRecipe ? catalogueDurationItems(catalogueRecipe) : [];
  const toggle = () => { setIsFavorite((value) => !value); onFavorite(); };
  return <MobileScroll className="app-screen"><main className="recipe-page pushed-page"><img className="recipe-hero" src={recipe.image} alt={recipe.title} width={900} height={900} decoding="async" onError={handleRecipeImageError} /><div className="recipe-content"><span className="eyebrow">{planned ? MEAL_LABELS[planned.mealType] : recipe.mealTypes.map((type) => MEAL_LABELS[type]).join(" · ")}</span><h1>{recipe.title}</h1><div className="recipe-meta"><span><ClockIcon /> {formatRecipeDuration(recipe.prepMinutes)} actives</span><span><PersonIcon /> {portions} portion{portions > 1 ? "s" : ""}</span><span>{recipe.diet.includes("vegetarian") ? "Végétarien" : "Classique"}</span></div><p className="recipe-intro">{recipe.description}</p>{durationItems.length ? <section className="catalogue-time-grid" aria-label="Durées de la recette">{durationItems.map((item) => <div key={item.label}><small>{item.label}</small><strong>{formatRecipeDuration(item.minutes)}</strong></div>)}</section> : null}<div className={`recipe-actions ${onReplace || onPlan ? "" : "recipe-actions--single"}`}>{onReplace ? <button type="button" className="secondary-button" onClick={onReplace}><ReloadIcon /> Remplacer</button> : null}{onPlan ? <button type="button" className="secondary-button" data-testid="plan-recipe" onClick={onPlan}><CalendarIcon /> Planifier</button> : null}<button type="button" className={`secondary-button ${isFavorite ? "is-favorite" : ""}`} onClick={toggle}>{isFavorite ? <HeartFilledIcon /> : <HeartIcon />}{isFavorite ? "Enregistrée" : "Ajouter"}</button></div>
    {tools?.(portions)}
    {advance ? <aside className="advance-note" data-testid="advance-note"><ClockIcon /><span><strong>{advanceHeadline(advance)}</strong>{formatRecipeDuration(advance.minutes)} de repos (trempage, prise au froid, marinade ou fermentation) en plus du temps actif.</span></aside> : null}
    <AllergenNotice allergens={plannedMealAllergens(recipe, planned)} />
    {isAssociationRecipe(recipe.id) || recipe.composition ? <AssociationNotice result={evaluateAssociations(ingredients)} /> : null}
    {planned?.substitutions?.length ? <p className="substitution-summary" data-testid="substitution-summary"><CheckCircledIcon /> {planned.substitutions.length} substitution{planned.substitutions.length > 1 ? "s" : ""} appliquée{planned.substitutions.length > 1 ? "s" : ""}. {recipe.costRecalculated === false ? "Allergènes et courses actualisés ; coût partiellement estimé." : "Allergènes, coût et courses ont été recalculés."}</p> : null}
    {substitutionError ? <p className="notice-banner" role="alert">{substitutionError}</p> : null}
    {displayedCaution ? <aside className="catalogue-caution"><strong>Repère important</strong><p>{displayedCaution}</p></aside> : null}
    <section className="recipe-section"><div className="section-heading"><h2>Ingrédients</h2><div className="stepper portions-stepper"><button type="button" aria-label="Retirer une portion" onClick={() => setPortions((value) => value - 1)}><MinusIcon /></button><b data-testid="recipe-portions">{portions}</b><button type="button" aria-label="Ajouter une portion" onClick={() => setPortions((value) => value + 1)}><PlusIcon /></button></div></div>{planned ? <p className="inline-help" data-testid="portions-help">Les portions, substitutions et la liste de courses suivent ce réglage.</p> : null}<ul className="ingredient-list">{ingredients.map((item, index) => {
      const source = recipe.ingredients[index];
      const sourceId = canonicalIngredientId(source.id);
      const options = planned && onSubstitutionChange && !isAssociationRecipe(recipe.id) && !recipe.composition ? allowedSubstitutions(source) : [];
      const selectedId = selectedSubstitutions.get(sourceId);
      const isOpen = openSubstitutionFor === sourceId;
      return <li className={`ingredient-row ${selectedId ? "is-substituted" : ""}`} key={`${source.id}-${source.unit}-${index}`}><CheckCircledIcon /><span className="ingredient-row__copy"><span><strong>{displayQuantity(item.quantity, item.unit)}</strong> {item.name}</span>{item.optional ? <small>Facultatif · non ajouté aux courses</small> : null}{selectedId ? <small>À la place de {source.name}</small> : null}</span>{options.length || selectedId ? <button type="button" className="ingredient-swap-button" aria-expanded={isOpen} data-testid={`ingredient-substitute-${sourceId}`} onClick={() => setOpenSubstitutionFor(isOpen ? null : sourceId)}>{selectedId ? "Modifier" : "Remplacer"}</button> : null}{isOpen ? <div className="ingredient-substitution-options" data-testid={`substitution-options-${sourceId}`}><button type="button" className={!selectedId ? "is-selected" : ""} aria-pressed={!selectedId} onClick={() => applySubstitution(sourceId, null)}><strong>Ingrédient d’origine</strong><small>{source.name}</small></button>{options.map((rule) => <button type="button" key={rule.id} className={selectedId === rule.id ? "is-selected" : ""} aria-pressed={selectedId === rule.id} data-testid={`apply-substitution-${rule.id}`} onClick={() => applySubstitution(sourceId, rule.id)}><strong>{rule.replacement.name}</strong><small>{rule.note}</small></button>)}</div> : null}</li>;
    })}</ul>{recipe.ingredients.some((ingredient) => ingredient.optional) ? <p className="inline-help">Les ingrédients facultatifs restent visibles mais ne sont pas ajoutés aux courses. Le coût affiché conserve l’estimation prudente de la recette complète.</p> : null}{planned ? <p className="catalogue-disclaimer">Les allergènes déclarés sont recalculés à partir des ingrédients choisis. Vérifiez toujours les étiquettes et les traces éventuelles.</p> : null}</section>
    {onRate ? <section className="recipe-section rating-section" data-testid="recipe-rating"><h2>Mon avis</h2>
      <div className="rating-row">
        {([["loved", "J’aime"], ["neutral", "Sans avis"], ["meh", "Bof"], ["avoided", "Ne plus proposer"]] as const).map(([value, label]) => (
          <button type="button" key={value} className={rating === value ? "is-selected" : ""} aria-pressed={rating === value} data-testid={`rating-${value}`} onClick={() => onRate(value)}>{label}</button>
        ))}
      </div>
      <p className="inline-help">« J’aime » remonte la recette dans vos semaines, « Bof » la fait passer après les autres, « Ne plus proposer » l’écarte complètement. Réversible à tout moment.</p>
    </section> : null}
    {onNoteChange ? <section className="recipe-section" data-testid="recipe-note"><h2>Ma note</h2>
      <label className="text-field"><span className="sr-only">Note personnelle sur cette recette</span>
        <KeyboardTextarea value={note} rows={3} placeholder="Ex. moitié moins de sel, cuisson 5 min de plus…" data-testid="recipe-note-input" onChange={(event) => onNoteChange(event.target.value)} />
      </label>
      <p className="inline-help">Enregistrée dans le stockage local de cette adresse web, jamais transmise.</p>
    </section> : null}
    <RecipeFeedback id={recipe.id} title={recipe.title} />
    <section className="recipe-section nutrition-section"><h2>Repères par portion</h2>{visibleNutrition ? <><div><span><strong>{visibleNutrition.calories}</strong> kcal</span><span><strong>{visibleNutrition.protein}</strong> g protéines</span><span><strong>{visibleNutrition.fiber}</strong> g fibres</span></div><small>{visibleNutrition.note}</small></> : <p>Valeurs nutritionnelles non disponibles : les données sont insuffisantes pour recalculer cette variante.</p>}{recipe.costRecalculated === false ? <p>Coût non recalculé pour cette variante : les totaux conservent une estimation partielle.</p> : null}</section>
    {onRecompose ? <><button type="button" className="secondary-button full-button" onClick={() => { setCompositionMessage("Chargement des recettes…"); void onRecompose().then(() => setCompositionMessage("")).catch(() => setCompositionMessage("Le catalogue n’est pas disponible. Connectez-vous ou téléchargez-le pour le hors-ligne, puis réessayez.")); }}><MixerHorizontalIcon /> Modifier l’entrée, le plat ou le dessert</button><p role="status">{compositionMessage}</p></> : null}
    {onEdit ? <button type="button" className="secondary-button full-button" data-testid="edit-custom-recipe" onClick={onEdit}><MixerHorizontalIcon /> Modifier ou supprimer cette recette</button> : null}
    {onDuplicate ? <button type="button" className="secondary-button full-button" data-testid="duplicate-recipe" onClick={onDuplicate}><CopyIcon /> Créer ma version de cette recette</button> : null}
    <section className="recipe-section"><div className="section-heading"><h2>Préparation</h2>{onCook ? <button type="button" className="secondary-button cooking-entry" data-testid="start-cooking" onClick={() => onCook(portions)}>Mode cuisine</button> : null}</div><ol className="steps">{recipe.steps.map((step, index) => <li key={`${index}-${step}`}><b>{index + 1}</b><span>{(isAssociationRecipe(recipe.id) || recipe.composition) ? scaleAssociationStep(step, portions / 2) : step}</span></li>)}</ol></section><aside className="conservation-note"><ClockIcon /><span><strong>Conservation</strong>{recipe.conservation}</span></aside>
  </div></main></MobileScroll>;
}
