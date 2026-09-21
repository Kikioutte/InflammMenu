import { type WeeklyPlan, type PlannedMeal, type UserProfile, type Recipe } from "../domain";
import { useState, useEffect } from "react";
import { getReplacementCandidates, diagnoseRecipeCompatibility } from "../engine";
import { MobileScroll, Carousel } from "../mobile";
import { CheckIcon } from "@radix-ui/react-icons";
import { ACTIVE_RECIPES, recipeById } from "../app/recipe-registry";
import { normalizeText, formatRecipeDuration } from "../components/format";
import { handleRecipeImageError } from "../components/recipe-image";
import { CompatibilityHelp } from "../components/CompatibilityHelp";

export function ReplaceView({ plan, current, profile, onConfirm }: { plan: WeeklyPlan; current: PlannedMeal; profile: UserProfile; onConfirm: (recipe: Recipe, options: { dislikeCurrent: boolean }) => string | null }) {
  const [reason, setReason] = useState("Plus rapide");
  const [dislikeCurrent, setDislikeCurrent] = useState(false);
  const [error, setError] = useState("");
  const candidates = getReplacementCandidates(plan, current.id, ACTIVE_RECIPES, profile, reason).slice(0, 5);
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null);
  const candidateIds = candidates.map((recipe) => recipe.id).join("\n");
  useEffect(() => { setSelectedId(candidates[0]?.id ?? null); }, [reason]);
  useEffect(() => {
    setSelectedId((selected) => candidates.some((recipe) => recipe.id === selected) ? selected : candidates[0]?.id ?? null);
    setError("");
  }, [candidateIds]);
  const selected = candidates.find((recipe) => recipe.id === selectedId);
  const currentRecipe = recipeById.get(current.recipeId);
  const unusedRecipes = ACTIVE_RECIPES.filter((recipe) =>
    !plan.meals.some((meal) => !meal.skipped && meal.recipeId === recipe.id),
  );
  const selectedMinutes = profile.dayConstraints.find((item) => item.dayIndex === current.dayIndex)?.maxPrepMinutes ?? profile.maxPrepMinutes;
  const diagnostic = diagnoseRecipeCompatibility(unusedRecipes, profile, { mealType: current.mealType, maxPrepMinutes: selectedMinutes });
  const compatibleAlreadyPlanned = diagnoseRecipeCompatibility(ACTIVE_RECIPES, profile, { mealType: current.mealType, maxPrepMinutes: selectedMinutes }).compatibleCount > 0;
  return <MobileScroll className="app-screen"><main className="page-content pushed-page replace-page" data-testid="replace-view">{error ? <p className="notice-banner" role="alert">{error}</p> : null}<div className="page-heading"><span className="eyebrow">À la place de</span><h1>{currentRecipe?.title}</h1><p>Les allergies, le régime et le temps actif maximum restent strictement respectés.</p></div><Carousel ariaLabel="Motif du remplacement" className="reason-carousel" contentClassName="reason-carousel__track">{["Plus rapide", "Moins cher", "Végétarien", "Autres ingrédients", "Réutiliser mes ingrédients"].map((item) => <button type="button" className={`reason-chip ${reason === item ? "is-selected" : ""}`} aria-pressed={reason === item} key={item} data-testid={`reason-${normalizeText(item).replace(/\s+/g, "-")}`} onClick={() => setReason(item)}>{item}</button>)}</Carousel><div className="replacement-list">{candidates.map((recipe) => <button type="button" key={recipe.id} className={`replacement-card ${selectedId === recipe.id ? "is-selected" : ""}`} aria-pressed={selectedId === recipe.id} onClick={() => setSelectedId(recipe.id)}><img src={recipe.image} alt="" width={900} height={900} loading="lazy" decoding="async" onError={handleRecipeImageError} /><span><small>{formatRecipeDuration(recipe.prepMinutes)} actives · {recipe.costPerPortion.toFixed(2).replace(".", ",")} €/portion</small><strong>{recipe.title}</strong><em>{recipe.description}</em></span><i>{selectedId === recipe.id ? <CheckIcon /> : null}</i></button>)}</div>{currentRecipe ? <button type="button" className={`dislike-toggle ${dislikeCurrent ? "is-selected" : ""}`} aria-pressed={dislikeCurrent} data-testid="dislike-current" onClick={() => setDislikeCurrent((value) => !value)}><span className="dislike-toggle__box" aria-hidden="true">{dislikeCurrent ? <CheckIcon /> : null}</span><span><strong>Ne plus me proposer « {currentRecipe.title} »</strong><small>La recette est écartée des prochaines semaines. Réversible depuis votre profil.</small></span></button> : null}{selected ? <button type="button" className="primary-button full-button" onClick={() => setError(onConfirm(selected, { dislikeCurrent }) ?? "")}>Choisir ce repas</button> : <><h2 className="empty-guidance-title">Aucune alternative compatible</h2><CompatibilityHelp diagnostic={diagnostic} selectedMinutes={selectedMinutes} allCompatibleAlreadyUsed={compatibleAlreadyPlanned} /></>}</main></MobileScroll>;
}
