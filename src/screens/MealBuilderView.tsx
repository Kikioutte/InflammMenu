import { type CatalogueRecipe, catalogueImageFor } from "../catalog";
import { isAssociationRecipe, evaluateAssociations, evaluateAssociationMeal } from "../food-associations";
import { useKeyboard, MobileScroll, KeyboardInput } from "../mobile";
import { useState, useMemo, useDeferredValue, useEffect } from "react";
import { matchesRecipeSearch } from "../recipe-search";
import { ClockIcon, CheckIcon, MagnifyingGlassIcon, MixerHorizontalIcon, InfoCircledIcon, CheckCircledIcon, ReaderIcon, ChevronRightIcon, Cross2Icon, HeartIcon, CalendarIcon } from "@radix-ui/react-icons";
import { type TabId } from "../app/types";
import { normalizeText, formatRecipeDuration } from "../components/format";
import { handleRecipeImageError } from "../components/recipe-image";
import { ASSOCIATION_LABELS, AssociationNotice } from "../components/recipe-facts";
import { BottomNav } from "../components/BottomNav";
import { WebSheet } from "../components/WebSheet";

type MealBuilderGroupId = "starter" | "main" | "dessert";

export const MEAL_BUILDER_GROUPS: ReadonlyArray<{ id: MealBuilderGroupId; label: string; singular: string; categories: readonly string[] }> = [
  { id: "starter", label: "Entrées", singular: "Entrée", categories: ["soupe", "salade"] },
  { id: "main", label: "Plats", singular: "Plat", categories: ["plat"] },
  { id: "dessert", label: "Desserts", singular: "Dessert", categories: ["dessert"] },
];

export function mealBuilderGroupFor(recipe: CatalogueRecipe): MealBuilderGroupId | null {
  return MEAL_BUILDER_GROUPS.find((group) => group.categories.includes(recipe.categorie))?.id ?? null;
}

export function mealBuilderEligible(recipe: CatalogueRecipe): boolean {
  if (!isAssociationRecipe(recipe.id) || !mealBuilderGroupFor(recipe)) return false;
  const level = evaluateAssociations(recipe.ingredients).level;
  return level === "verte" || level === "orange";
}

export function MealBuilderView({ initialRecipe, initialSelection, initialName = "", planLabel = "Planifier ce repas", planningContext, recipes, onSave, onPlan, onNavigate }: { initialRecipe: CatalogueRecipe; initialSelection?: Partial<Record<MealBuilderGroupId, CatalogueRecipe>>; initialName?: string; planLabel?: string; planningContext?: string; recipes: CatalogueRecipe[]; onSave: (selection: Partial<Record<MealBuilderGroupId, CatalogueRecipe>>, name: string) => string; onPlan: (selection: Partial<Record<MealBuilderGroupId, CatalogueRecipe>>) => string | null; onNavigate: (tab: TabId) => void }) {
  const keyboard = useKeyboard();
  const initialGroup = mealBuilderGroupFor(initialRecipe) as MealBuilderGroupId;
  const [selection, setSelection] = useState<Partial<Record<MealBuilderGroupId, CatalogueRecipe>>>(initialSelection ?? { [initialGroup]: initialRecipe });
  const [activeGroup, setActiveGroup] = useState<MealBuilderGroupId>(initialGroup === "main" ? "dessert" : "main");
  const [query, setQuery] = useState("");
  const [maxMinutes, setMaxMinutes] = useState(0);
  const [greenOnly, setGreenOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [sheet, setSheet] = useState<"filters" | "summary" | "associations" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [feedback, setFeedback] = useState("");
  const [mealName, setMealName] = useState(initialName);
  const selectedRecipes = useMemo(() => MEAL_BUILDER_GROUPS.map((group) => selection[group.id]).filter((recipe): recipe is CatalogueRecipe => Boolean(recipe)), [selection]);
  const mealResult = useMemo(() => evaluateAssociationMeal(selectedRecipes), [selectedRecipes]);
  const complete = selectedRecipes.length === MEAL_BUILDER_GROUPS.length;
  const reviewed = useMemo(() => recipes.filter(mealBuilderEligible), [recipes]);
  const candidates = useMemo(() => {
    const context = selectedRecipes.filter((recipe) => mealBuilderGroupFor(recipe) !== activeGroup);
    return reviewed.filter((recipe) => mealBuilderGroupFor(recipe) === activeGroup)
      .map((recipe) => ({ recipe, result: evaluateAssociationMeal([...context, recipe]) }))
      .filter(({ result }) => result.level === "verte" || result.level === "orange")
      .sort((a, b) => (a.result.level === b.result.level ? a.recipe.titre.localeCompare(b.recipe.titre, "fr") : a.result.level === "verte" ? -1 : 1));
  }, [reviewed, selectedRecipes, activeGroup]);
  const normalizedQuery = normalizeText(useDeferredValue(query));
  const filtered = candidates.filter(({ recipe, result }) => (!greenOnly || result.level === "verte")
    && (!maxMinutes || (recipe.app.planner.active_minutes ?? recipe.temps.preparation + recipe.temps.cuisson) <= maxMinutes)
    && (!normalizedQuery || matchesRecipeSearch(`${recipe.titre} ${recipe.ingredients.map((item) => item.nom).join(" ")}`, normalizedQuery)));
  useEffect(() => { setVisibleCount(12); }, [activeGroup, normalizedQuery, maxMinutes, greenOnly, selection]);
  const group = MEAL_BUILDER_GROUPS.find((item) => item.id === activeGroup)!;
  const anchor = selection[initialGroup] ?? initialRecipe;
  const openSheet = (next: typeof sheet) => { keyboard.hide(); setSheet(next); };
  const changeGroup = (id: MealBuilderGroupId) => { setActiveGroup(id); setQuery(""); };
  const choose = (recipe: CatalogueRecipe) => {
    const next = { ...selection, [activeGroup]: recipe };
    setSelection(next);
    setFeedback("");
    setQuery("");
    const missing = MEAL_BUILDER_GROUPS.find((item) => !next[item.id]);
    setAnnouncement(`${group.singular} ajouté${activeGroup === "starter" ? "e" : ""} : ${recipe.titre}. ${missing ? `Choisissez maintenant votre ${missing.singular.toLocaleLowerCase("fr")}.` : "Votre repas complet a été vérifié."}`);
    if (missing) {
      setActiveGroup(missing.id);
      document.getElementById(`meal-tab-${missing.id}`)?.focus();
    } else openSheet("summary");
  };
  return <div className="meal-builder-shell">
    <MobileScroll className="app-screen"><main className="page-content pushed-page meal-builder" data-testid="meal-builder-view">
      <div className="page-heading"><h1>À votre table</h1><p>{planningContext ?? "Complétez votre repas"}</p></div>
      <article className="meal-builder-hero" data-testid="meal-builder-anchor">
        <div><span className="eyebrow">{MEAL_BUILDER_GROUPS.find((item) => item.id === initialGroup)!.singular} {initialGroup === "starter" ? "choisie" : "choisi"}</span><h2>{anchor.titre}</h2><small><ClockIcon />{formatRecipeDuration(anchor.temps.total)} au total</small></div>
        <img src={catalogueImageFor(anchor)} alt="" width={900} height={900} onError={handleRecipeImageError} />
      </article>
      <div className="meal-builder-tabs" role="tablist" aria-label="Composer par catégorie" onKeyDown={(event) => {
        const index = MEAL_BUILDER_GROUPS.findIndex((item) => item.id === activeGroup);
        const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : -1;
        if (next < 0) return;
        event.preventDefault(); changeGroup(MEAL_BUILDER_GROUPS[next].id); document.getElementById(`meal-tab-${MEAL_BUILDER_GROUPS[next].id}`)?.focus();
      }}>{MEAL_BUILDER_GROUPS.map((item) => <button type="button" key={item.id} role="tab" id={`meal-tab-${item.id}`} aria-selected={activeGroup === item.id} aria-controls="meal-candidates" tabIndex={activeGroup === item.id ? 0 : -1} onClick={() => changeGroup(item.id)}>{item.singular}{selection[item.id] ? <CheckIcon aria-label={item.id === "starter" ? "choisie" : "choisi"} /> : null}</button>)}</div>
      <div className="meal-builder-search-row"><label className="catalogue-search"><MagnifyingGlassIcon /><span className="sr-only">Rechercher {activeGroup === "starter" ? "une entrée" : `un ${group.singular.toLocaleLowerCase("fr")}`}</span><KeyboardInput value={query} placeholder={`Rechercher ${activeGroup === "starter" ? "une entrée" : `un ${group.singular.toLocaleLowerCase("fr")}`}`} onChange={(event) => setQuery(event.target.value)} /></label><button type="button" className="secondary-button" onClick={() => openSheet("filters")}><MixerHorizontalIcon />Filtres{maxMinutes || greenOnly ? " · actifs" : ""}</button></div>
      <section id="meal-candidates" role="tabpanel" aria-labelledby={`meal-tab-${activeGroup}`} className="meal-builder-category" data-testid={`meal-builder-category-${activeGroup}`}>
        <h2>{selection[activeGroup] ? `Changer ${activeGroup === "starter" ? "votre entrée" : `votre ${group.singular.toLocaleLowerCase("fr")}`}` : "Pour compléter votre repas"}</h2>
        <button type="button" className={`meal-builder-associations is-${mealResult.level}`} onClick={() => openSheet("associations")}><InfoCircledIcon />{ASSOCIATION_LABELS[mealResult.level]} · <span>Voir le détail</span></button>
        <p className="meal-builder-result-count" role="status">{filtered.length} choix compatible{filtered.length > 1 ? "s" : ""} avec {selectedRecipes.length > 1 ? "vos recettes choisies" : "votre recette"}{greenOnly ? " · tout vert" : ""}</p>
        {filtered.length ? <div className="meal-builder-grid">{filtered.slice(0, visibleCount).map(({ recipe, result }) => <article className="meal-builder-candidate" key={recipe.id}>
          <img src={catalogueImageFor(recipe)} alt="" width={900} height={900} loading="lazy" decoding="async" onError={handleRecipeImageError} />
          <h3>{recipe.titre}</h3>
          <button type="button" data-testid={`meal-builder-candidate-${recipe.id}`} aria-label={`${selection[activeGroup]?.id === recipe.id ? "Conserver" : selection[activeGroup] ? "Remplacer par" : "Ajouter"} ${recipe.titre}, ${result.level === "verte" ? "tout vert" : "orange signalé"}`} onClick={() => choose(recipe)}>{selection[activeGroup]?.id === recipe.id ? "Conserver" : selection[activeGroup] ? "Remplacer" : "Ajouter"}<small className={`meal-builder-candidate-level is-${result.level}`}>{result.level === "verte" ? <CheckCircledIcon /> : <InfoCircledIcon />}{result.level === "verte" ? "Tout vert" : "Orange signalé"}</small></button>
        </article>)}</div> : <div className="empty-day"><MagnifyingGlassIcon /><h3>{candidates.length ? "Aucun résultat avec ces filtres" : "Aucune proposition compatible"}</h3><p>{candidates.length ? "Essayez un autre ingrédient ou effacez vos filtres." : "Changez une recette de votre repas pour ouvrir d’autres possibilités."}</p><button type="button" className="secondary-button" onClick={() => candidates.length ? (setQuery(""), setMaxMinutes(0), setGreenOnly(false)) : openSheet("summary")}>{candidates.length ? "Effacer la recherche et les filtres" : "Modifier mon repas"}</button></div>}
        {filtered.length > visibleCount ? <button type="button" className="secondary-button full-button" onClick={() => setVisibleCount((count) => count + 12)}>Afficher 12 {group.label.toLocaleLowerCase("fr")} de plus</button> : null}
      </section>
      <p className="catalogue-disclaimer">Toutes les propositions tiennent compte des ingrédients, sauces et accompagnements déjà choisis. Vérifiez aussi vos allergies et exclusions. Votre tableau personnel ne mesure ni les quantités ni l’équilibre nutritionnel.</p>
    </main></MobileScroll>
    <footer className="meal-builder-footer"><button type="button" className="meal-builder-progress" onClick={() => openSheet("summary")} aria-label={`Voir mon repas, ${selectedRecipes.length} recette${selectedRecipes.length > 1 ? "s" : ""} sur 3`}><ReaderIcon /><span><strong>{selectedRecipes.length} recette{selectedRecipes.length > 1 ? "s" : ""} sur 3</strong><span className="meal-builder-progress-marks" aria-hidden="true">{MEAL_BUILDER_GROUPS.map((item) => <CheckCircledIcon key={item.id} className={selection[item.id] ? "is-filled" : ""} />)}</span></span><span>Voir mon repas</span><ChevronRightIcon /></button><BottomNav active="recipes" onChange={onNavigate} /></footer>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    <WebSheet open={sheet === "filters"} onOpenChange={(open) => !open && openSheet(null)} title="Affiner les propositions" description="Chaque résultat reste vérifié avec votre repas."><div className="catalogue-filter-sheet"><fieldset><legend>Temps actif maximum</legend><div className="choice-row">{[0, 15, 30, 45].map((minutes) => <button type="button" key={minutes} aria-pressed={maxMinutes === minutes} className={maxMinutes === minutes ? "is-selected" : ""} onClick={() => setMaxMinutes(minutes)}>{minutes ? `${minutes} min` : "Peu importe"}</button>)}</div></fieldset><fieldset><legend>Associations du repas</legend><div className="choice-row"><button type="button" aria-pressed={!greenOnly} className={!greenOnly ? "is-selected" : ""} onClick={() => setGreenOnly(false)}>Vertes et orange signalées</button><button type="button" aria-pressed={greenOnly} className={greenOnly ? "is-selected" : ""} onClick={() => setGreenOnly(true)}>Tout vert uniquement</button></div></fieldset><button type="button" className="primary-button full-button" onClick={() => openSheet(null)}>Voir {filtered.length} proposition{filtered.length > 1 ? "s" : ""}</button></div></WebSheet>
    <WebSheet open={sheet === "associations"} onOpenChange={(open) => !open && openSheet(null)} title="Les associations de votre repas" description="Lecture du tableau personnel pour les recettes déjà choisies."><AssociationNotice result={mealResult} /><p className="inline-help">Le repère sur chaque proposition indique le résultat si vous l’ajoutez à votre sélection.</p></WebSheet>
    <WebSheet open={sheet === "summary"} onOpenChange={(open) => !open && openSheet(null)} title="Votre repas" description={complete ? "Entrée, plat et dessert vérifiés ensemble." : "Choisissez une recette dans chaque catégorie pour compléter votre repas."}>
      <div className={`meal-builder-status is-${mealResult.level}`} data-testid="meal-builder-status"><CheckCircledIcon /><span><strong>{complete ? mealResult.level === "verte" ? "Tout vert selon votre tableau" : mealResult.level === "orange" ? "Associations orange présentes" : "Repas à revoir" : "Repas à compléter"}</strong><small>{ASSOCIATION_LABELS[mealResult.level]}{!complete ? " pour la sélection actuelle" : ""}</small></span></div>
      <section className="meal-builder-selection" aria-label="Recettes choisies">{MEAL_BUILDER_GROUPS.map((item) => { const recipe = selection[item.id]; return <article className={`meal-builder-slot ${recipe ? "is-filled" : ""}`} key={item.id} data-testid={`meal-builder-slot-${item.id}`}>{recipe ? <img src={catalogueImageFor(recipe)} alt="" width={900} height={900} onError={handleRecipeImageError} /> : null}<span><small>{item.singular}</small><strong>{recipe?.titre ?? "À choisir"}</strong></span><button type="button" aria-label={`${recipe ? "Changer" : "Choisir"} ${item.singular.toLocaleLowerCase("fr")}`} onClick={() => { changeGroup(item.id); openSheet(null); }}>{recipe ? "Changer" : "Choisir"}</button>{recipe && item.id !== initialGroup ? <button type="button" aria-label={`Retirer ${recipe.titre}`} onClick={() => { setSelection((current) => ({ ...current, [item.id]: undefined })); setAnnouncement(`${item.singular} retiré.`); setFeedback(""); }}><Cross2Icon /></button> : null}</article>; })}</section>
      {complete ? <label className="text-field">Nom du repas (facultatif)<KeyboardInput value={mealName} maxLength={80} placeholder="Ex. Mon dîner du dimanche" onChange={(event) => setMealName(event.target.value)} /></label> : null}
      <AssociationNotice result={mealResult} detailsOpen={false} /><p className="inline-help">Enregistrez cette composition pour la retrouver dans « Mes repas ». Cet enregistrement ne modifie ni la semaine ni les courses.</p>{complete && (mealResult.level === "verte" || mealResult.level === "orange") ? <button type="button" className="secondary-button full-button" onClick={() => setFeedback(onSave(selection, mealName))}><HeartIcon /> Enregistrer mon repas</button> : null}<p role="status">{feedback}</p>{complete ? <button type="button" className="primary-button full-button" onClick={() => { const error = onPlan(selection); if (error) setFeedback(error); else openSheet(null); }}><CalendarIcon /> {planLabel}</button> : null}<button type="button" className="secondary-button full-button" onClick={() => openSheet(null)}>{complete ? "Revenir aux recettes compatibles" : "Continuer mon repas"}</button>
    </WebSheet>
  </div>;
}
