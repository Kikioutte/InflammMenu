import { type Recipe, type PlannedMeal } from "../domain";
import { compositionTitlesFor } from "../composed-meal";
import { plannedMealAllergens, plannedMealCost, advancePrepFor } from "../engine";
import { formatEuros, advanceHeadline, formatRecipeDuration, allergenLabel } from "./format";
import { type AssociationResult, type AssociationIngredient, isAssociationRecipe, evaluateAssociations } from "../food-associations";
import { ALLERGEN_LABELS } from "./constants";

export function CompositionSummary({ recipe }: { recipe: Recipe }) {
  const titles = compositionTitlesFor(recipe);
  if (!titles) return null;
  return <span className="meal-composition" aria-label="Composition du repas">{(["starter", "main", "dessert"] as const).map((key, index) => <span key={key}><b>{["Entrée", "Plat", "Dessert"][index]}</b><span>{titles[key]}</span></span>)}</span>;
}

/** Estimated cost and declared allergens, read before opening the recipe. */
export function MealFacts({ recipe, planned }: { recipe: Recipe; planned: PlannedMeal }) {
  const allergens = plannedMealAllergens(recipe, planned);
  const cost = plannedMealCost(recipe, planned);
  const advance = advancePrepFor(recipe);
  return (
    <span className="meal-facts" data-testid={`meal-facts-${recipe.id}`}>
      <CompositionSummary recipe={recipe} />
      <span className="meal-facts__cost">{formatEuros(cost)} estimés</span>
      {advance ? <span className="meal-facts__advance">{advanceHeadline(advance)} · {formatRecipeDuration(advance.minutes)}</span> : null}
      {allergens.length
        ? allergens.map((allergen) => <span className="meal-facts__allergen" key={allergen}>{allergenLabel(allergen)}</span>)
        : <span className="meal-facts__clear">Aucun allergène déclaré</span>}
    </span>
  );
}

export const ASSOCIATION_LABELS = { verte: "Associations vertes", orange: "Associations orange", grise: "Association à exclure", "non-classee": "Association non vérifiable" } as const;

export function AssociationNotice({ result, detailsOpen = true }: { result: AssociationResult; detailsOpen?: boolean }) {
  return <aside className={`association-notice is-${result.level}`} data-testid="association-notice">
    <strong>{ASSOCIATION_LABELS[result.level]}</strong>
    {result.level === "verte" ? <p>Toutes les associations de ces ingrédients sont vertes dans votre tableau.</p> : null}
    {result.pairs.length ? <details open={detailsOpen}><summary>{result.pairs.length} association{result.pairs.length > 1 ? "s" : ""} à connaître</summary><ul>{result.pairs.map((pair, i) => <li key={i}><b>{pair.level === "grise" ? "À exclure" : "Orange"}</b> : {pair.a} + {pair.b}</li>)}</ul></details> : null}
    {result.unknown.length ? <p>Classement absent du tableau : {result.unknown.join(", ")}. Compatibilité non confirmée.</p> : null}
    <small>Si vous changez les portions, gardez les tailles de coupe et cuisez en plusieurs fournées si nécessaire ; la durée totale peut augmenter.</small><small>Lecture de votre tableau personnel, distincte d’une évaluation médicale. Ne déduit aucune restriction de boisson. Les allergies et exclusions restent à respecter.</small>
  </aside>;
}

export function AssociationBadge({ recipe }: { recipe: { id: string; ingredients: readonly AssociationIngredient[] } }) {
  if (!isAssociationRecipe(recipe.id)) return null;
  const result = evaluateAssociations(recipe.ingredients);
  return <span className={`association-badge is-${result.level}`}>{ASSOCIATION_LABELS[result.level]}</span>;
}

export function AllergenNotice({ allergens }: { allergens: readonly string[] }) {
  if (!allergens.length) return <aside className="allergen-notice allergen-notice--clear"><strong>Allergènes déclarés</strong><p>Aucun des 14 allergènes réglementaires dans la formulation. Vérifiez toutefois les étiquettes et les traces éventuelles.</p></aside>;
  return <aside className="allergen-notice"><strong>Allergènes à vérifier</strong><div>{allergens.map((allergen) => <span key={allergen}>{ALLERGEN_LABELS[allergen] ?? allergen.replaceAll("-", " ")}</span>)}</div><p>Contrôlez les étiquettes et les traces éventuelles, surtout en cas d’allergie sévère.</p></aside>;
}
