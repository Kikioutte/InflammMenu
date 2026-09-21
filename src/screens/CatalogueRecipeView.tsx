import { type ReactNode, useState } from "react";
import { type CatalogueRecipe, reviewFor, plannerAvailabilityFor, catalogueImageFor, catalogueCategoryName, CATALOGUE_SUMMARY } from "../catalog";
import { MobileScroll } from "../mobile";
import { DIFFICULTY_LABELS, COST_LABELS, formatIngredientQuantity as displayCatalogueQuantity } from "../presentation";
import { CalendarIcon, HeartFilledIcon, HeartIcon, PlusIcon, CheckCircledIcon, MinusIcon, ChevronRightIcon, ClockIcon } from "@radix-ui/react-icons";
import { isAssociationRecipe, evaluateAssociations } from "../food-associations";
import { scaleAssociationStep } from "../composed-meal";
import { PLANNER_EXCLUSION_TEXT } from "../components/constants";
import { catalogueDurationItems, formatRecipeDuration } from "../components/format";
import { handleRecipeImageError } from "../components/recipe-image";
import { AllergenNotice, AssociationNotice } from "../components/recipe-facts";
import { RecipeFeedback } from "../components/RecipeFeedback";

export function CatalogueRecipeView({ tools, recipe, favorite, onFavorite, onPlan, onComposeMeal }: { tools?: (portions: number) => ReactNode; recipe: CatalogueRecipe; favorite: boolean; onFavorite: () => void; onPlan?: () => void; onComposeMeal?: () => void }) {
  const [portions, setPortions] = useState(recipe.portions);
  const [isFavorite, setIsFavorite] = useState(favorite);
  const toggleFavorite = () => { setIsFavorite((value) => !value); onFavorite(); };
  const review = reviewFor(recipe);
  const availability = plannerAvailabilityFor(recipe);
  const exclusion = availability.kind ? PLANNER_EXCLUSION_TEXT[availability.kind] : undefined;
  const ratio = portions / Math.max(1, recipe.portions);
  const durationItems = catalogueDurationItems(recipe);
  return <MobileScroll className="app-screen"><main className="catalogue-detail pushed-page">
    <div className="catalogue-detail__hero"><img src={catalogueImageFor(recipe)} alt={recipe.image.alt || recipe.titre} width={900} height={900} onError={handleRecipeImageError} /><div className="catalogue-detail__hero-copy"><span>{catalogueCategoryName(recipe.categorie)}</span><h1>{recipe.titre}</h1><small>{formatRecipeDuration(recipe.temps.total)} au total · {DIFFICULTY_LABELS[recipe.difficulte]} · {COST_LABELS[recipe.cout]}</small></div></div>
    <div className="recipe-content">
      <div className={`catalogue-verdict is-${review.status}`}><span>{review.status === "validated" ? "Profil cohérent" : "Validée avec repères"}</span><p>{review.summary}</p></div>
      <div className={`recipe-actions ${onPlan ? "" : "recipe-actions--single"}`}>{onPlan ? <button type="button" className="secondary-button" data-testid="catalogue-plan" onClick={onPlan}><CalendarIcon /> Planifier</button> : null}<button type="button" className={`secondary-button ${isFavorite ? "is-favorite" : ""}`} data-testid="catalogue-favorite" aria-pressed={isFavorite} onClick={toggleFavorite}>{isFavorite ? <HeartFilledIcon /> : <HeartIcon />}{isFavorite ? "Enregistrée" : "Ajouter aux favoris"}</button></div>
      {tools?.(portions)}
      {onComposeMeal ? <button type="button" className="primary-button full-button meal-builder-entry" data-testid="compose-meal" onClick={onComposeMeal}><PlusIcon /> Composer un repas compatible</button> : null}
      {durationItems.length ? <section className="catalogue-time-grid" aria-label="Durées de la recette">{durationItems.map((item) => <div key={item.label}><small>{item.label}</small><strong>{formatRecipeDuration(item.minutes)}</strong></div>)}</section> : null}
      {recipe.materiel?.length ? <section className="recipe-section catalogue-equipment" data-testid="catalogue-equipment"><h2>Matériel</h2><ul>{recipe.materiel.map((item) => <li key={item}><CheckCircledIcon /><span>{item}</span></li>)}{recipe.creami ? <li><CheckCircledIcon /><span>Programme {recipe.creami.programme} · Zone {recipe.creami.zone}</span></li> : null}</ul></section> : null}
      {exclusion ? <aside className="planner-exclusion" data-testid="planner-exclusion"><strong>{exclusion.title}</strong><p>{exclusion.body}</p></aside> : null}
      {review.caution ? <aside className="catalogue-caution"><strong>À savoir</strong><p>{review.caution}</p></aside> : null}
      <AllergenNotice allergens={recipe.app.planner.allergens} />
      {isAssociationRecipe(recipe.id) ? <AssociationNotice result={evaluateAssociations(recipe.ingredients)} /> : null}
      <p className="catalogue-disclaimer">Cette appréciation concerne la composition globale de la recette. Elle ne prouve pas qu'un ingrédient isolé prévient ou traite une inflammation.</p>
      <section className="recipe-section"><div className="section-heading"><h2>Ingrédients</h2><div className="stepper portions-stepper"><button type="button" aria-label="Retirer une portion" onClick={() => setPortions((value) => Math.max(1, value - 1))}><MinusIcon /></button><b>{portions}</b><button type="button" aria-label="Ajouter une portion" onClick={() => setPortions((value) => Math.min(8, value + 1))}><PlusIcon /></button></div></div><ul className="ingredient-list">{recipe.ingredients.map((item, index) => <li key={`${item.nom}-${item.unite}-${index}`}><CheckCircledIcon /><span><strong>{displayCatalogueQuantity(item.quantite * ratio, item.unite)}</strong> {item.nom}{item.facultatif ? <small>{item.note || "Facultatif"} · non ajouté aux courses</small> : item.note ? <small>{item.note}</small> : null}</span></li>)}</ul>{recipe.ingredients.some((ingredient) => ingredient.facultatif) ? <p className="inline-help">Les ingrédients facultatifs restent visibles mais ne sont pas ajoutés aux courses. Le coût affiché conserve l’estimation prudente de la recette complète.</p> : null}</section>
      <section className="recipe-section nutrition-section"><h2>Estimations par portion</h2><div><span><strong>{recipe.nutrition_par_portion.calories}</strong> kcal</span><span><strong>{recipe.nutrition_par_portion.proteines_g}</strong> g protéines</span><span><strong>{recipe.nutrition_par_portion.fibres_g}</strong> g fibres</span></div><small>Valeurs estimatives à titre indicatif; elles varient selon les produits et la préparation.</small></section>
      {recipe.composes_actifs.length ? <section className="recipe-section"><h2>Repères présents</h2><div className="compound-list">{recipe.composes_actifs.map((item) => <span key={`${item.aliment}-${item.compose}`}><strong>{item.aliment}</strong><small>{item.compose}</small></span>)}</div><p className="catalogue-disclaimer">Ces composés sont documentés dans les aliments, mais leur présence ne garantit pas un bénéfice clinique individuel.</p></section> : null}
      <RecipeFeedback id={recipe.id} title={recipe.titre} />
      <section className="recipe-section"><h2>Préparation</h2><ol className="steps">{recipe.etapes.map((step, index) => <li key={`${index}-${step}`}><b>{index + 1}</b><span>{isAssociationRecipe(recipe.id) ? scaleAssociationStep(step, ratio) : step}</span></li>)}</ol></section>
      {recipe.substitutions.length ? <section className="recipe-section"><h2>Substitutions</h2><div className="substitution-list">{recipe.substitutions.map((item) => <p key={`${item.remplacer}-${item.par}`}><strong>{item.remplacer}</strong><ChevronRightIcon /><span>{item.par}<small>{item.note}</small></span></p>)}</div></section> : null}
      <aside className="conservation-note"><ClockIcon /><span><strong>Conservation</strong>{recipe.conservation}</span></aside>
      <p className="catalogue-legal">{CATALOGUE_SUMMARY.avertissement}</p>
    </div>
  </main></MobileScroll>;
}
