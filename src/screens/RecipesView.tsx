import { Cross2Icon, ReloadIcon, MagnifyingGlassIcon, CopyIcon, HeartFilledIcon, HeartIcon, MixerHorizontalIcon, CheckIcon, ChevronRightIcon, ArchiveIcon } from "@radix-ui/react-icons";
import { type SavedMeal } from "../saved-meals";
import { type CatalogueData, type CatalogueRecipe, type CatalogueFilters, EMPTY_CATALOGUE_FILTERS, catalogueRecipeIdOf, filterCatalogueRecipes, visibleCatalogueRecipes, catalogueImageFor, catalogueCategoryName, CATALOGUE_CATEGORIES, plannerAvailabilityFor, DUPLICATE_CATALOGUE_RECIPES } from "../catalog";
import { useKeyboard, KeyboardInput, Carousel } from "../mobile";
import { useState, type ReactNode, useDeferredValue, useEffect } from "react";
import { normalizeText, formatRecipeDuration, formatCatalogueCardDuration, formatWeekRange } from "../components/format";
import { mealBuilderGroupFor, mealBuilderEligible } from "./MealBuilderView";
import { WebSheet } from "../components/WebSheet";
import { type Recipe, type WeeklyPlan } from "../domain";
import { matchesRecipeSearch } from "../recipe-search";
import { isAssociationRecipe, evaluateAssociations } from "../food-associations";
import { formatDietLabel } from "../presentation";
import { HISTORY_LIMIT } from "../storage";
import { recipeById } from "../app/recipe-registry";
import { handleRecipeImageError } from "../components/recipe-image";
import { MEAL_LABELS, ALLERGEN_OPTIONS, PLANNER_EXCLUSION_TEXT } from "../components/constants";
import { AssociationBadge } from "../components/recipe-facts";
import { ConfirmActionDialog } from "../components/ConfirmActionDialog";

function CatalogueError({ onRetry }: { onRetry: () => void }) {
  return <div className="catalogue-error" role="alert" data-testid="catalogue-error">
    <Cross2Icon /><h3>Catalogue indisponible</h3>
    <p>Le catalogue n’a pas pu être chargé. Vérifiez votre connexion : le reste de l’application continue de fonctionner hors ligne.</p>
    <button type="button" className="secondary-button" data-testid="catalogue-retry" onClick={onRetry}><ReloadIcon /> Réessayer</button>
  </div>;
}

function SavedMealsView({ meals, catalogue, onLoad, onOpen, onDelete, onRestore, onRename }: {
  meals: SavedMeal[]; catalogue: CatalogueData | null; onLoad: () => void;
  onOpen: (meal: SavedMeal) => void; onDelete: (meal: SavedMeal) => void;
  onRestore: (meal: SavedMeal, index: number) => string | null;
  onRename: (meal: SavedMeal, name: string) => string | null;
}) {
  const keyboard = useKeyboard();
  const [query, setQuery] = useState("");
  const [removed, setRemoved] = useState<{ meal: SavedMeal; index: number } | null>(null);
  const [editing, setEditing] = useState<SavedMeal | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const titlesFor = (meal: SavedMeal) => Object.values(meal.recipeIds).map((id) => catalogue?.recipes.find((recipe) => recipe.id === id)?.titre ?? "");
  const titleFor = (meal: SavedMeal) => meal.name || titlesFor(meal)[1] || "Repas enregistré";
  const results = meals.filter((meal) => normalizeText([meal.name ?? "", ...titlesFor(meal)].join(" ")).includes(normalizeText(query)));
  const close = () => { keyboard.hide(); setEditing(null); };
  return <details className="information-card saved-meals"><summary>Mes repas enregistrés · {meals.length}</summary>
    {removed ? <div className="saved-meals-undo"><p role="status">« {titleFor(removed.meal)} » supprimé.</p><button type="button" className="secondary-button" onClick={() => { const error = onRestore(removed.meal, removed.index); if (error) setMessage(error); else { setRemoved(null); setMessage("Repas restauré."); setQuery(""); } }}>Annuler la suppression</button></div> : null}
    <p role="status">{message}</p>
    {meals.length ? <label className="catalogue-search"><MagnifyingGlassIcon /><span className="sr-only">Rechercher dans mes repas</span><KeyboardInput value={query} placeholder="Nom du repas ou d’une recette" onChange={(event) => setQuery(event.target.value)} /></label> : <p>Composez une entrée, un plat et un dessert, puis choisissez « Enregistrer mon repas ».</p>}
    {!catalogue && meals.length ? <button type="button" className="secondary-button" onClick={onLoad}>Charger les recettes de mes repas</button> : null}
    {meals.length && !results.length ? <p>Aucun repas trouvé. <button type="button" className="text-button" onClick={() => setQuery("")}>Effacer la recherche</button></p> : null}
    {results.map((meal) => { const main = catalogue?.recipes.find((recipe) => recipe.id === meal.recipeIds.main && mealBuilderGroupFor(recipe) === "main" && mealBuilderEligible(recipe)); return <article className="saved-meal-card" key={meal.id} data-testid={`saved-meal-${meal.id}`}><h3>{titleFor(meal)}</h3><p>{titlesFor(meal).filter(Boolean).join(" · ") || "Les recettes seront affichées après chargement du catalogue."}</p><div><button type="button" className="secondary-button" disabled={!main} onClick={() => onOpen(meal)}>Ouvrir</button><button type="button" className="text-button" onClick={() => { keyboard.hide(); setName(meal.name ?? ""); setEditing(meal); setMessage(""); }}>Nommer</button><button type="button" className="icon-button" aria-label={`Supprimer le repas ${titleFor(meal)}`} onClick={() => { setRemoved({ meal, index: meals.findIndex((item) => item.id === meal.id) }); onDelete(meal); setMessage(""); }}><Cross2Icon /></button></div></article>; })}
    <WebSheet open={Boolean(editing)} onOpenChange={(open) => !open && close()} title="Nommer mon repas"><label className="text-field">Nom du repas<KeyboardInput value={name} maxLength={80} placeholder="Ex. Dîner du dimanche" onChange={(event) => setName(event.target.value)} /></label><p className="inline-help">Laissez vide pour utiliser le nom du plat.</p><button type="button" className="primary-button full-button" onClick={() => { if (!editing) return; const error = onRename(editing, name); setMessage(error ?? "Nom enregistré."); if (!error) close(); }}>Enregistrer le nom</button>{message ? <p role="status">{message}</p> : null}</WebSheet>
  </details>;
}

export function RecipesView({ libraryTools, savedMeals, onOpenSavedMeal, onDeleteSavedMeal, onRestoreSavedMeal, onRenameSavedMeal, favoriteIds, customRecipes, history, catalogue, catalogueError, onLoadCatalogue, onRetryCatalogue, onOpenRecipe, onOpenCatalogue, onOpenHistory, onDeleteHistory }: { libraryTools?: ReactNode; savedMeals: SavedMeal[]; onOpenSavedMeal: (meal: SavedMeal) => void; onDeleteSavedMeal: (meal: SavedMeal) => void; onRestoreSavedMeal: (meal: SavedMeal, index: number) => string | null; onRenameSavedMeal: (meal: SavedMeal, name: string) => string | null; favoriteIds: string[]; customRecipes: Recipe[]; history: WeeklyPlan[]; catalogue: CatalogueData | null; catalogueError: boolean; onLoadCatalogue: () => void; onRetryCatalogue: () => void; onOpenRecipe: (recipe: Recipe) => void; onOpenCatalogue: (recipe: CatalogueRecipe) => void; onOpenHistory: (plan: WeeklyPlan) => void; onDeleteHistory: (plan: WeeklyPlan) => void }) {
  const keyboard = useKeyboard();
  const [mode, setMode] = useState<"favorites" | "catalogue" | "history">("catalogue");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [filters, setFilters] = useState<CatalogueFilters>(EMPTY_CATALOGUE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCatalogueCount, setVisibleCatalogueCount] = useState(60);
  const [associationFilter, setAssociationFilter] = useState<"all" | "collection" | "verte" | "orange">("all");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeText(deferredQuery);
  const customRecipeIds = new Set(customRecipes.map((recipe) => recipe.id));
  const allFavoriteRecipes = [
    ...customRecipes,
    ...favoriteIds.filter((id) => !customRecipeIds.has(id)).map((id) => recipeById.get(id)).filter((item): item is Recipe => Boolean(item)),
  ];
  const favoriteRecipes = allFavoriteRecipes.filter((recipe) => !normalizedQuery
    || matchesRecipeSearch(`${recipe.title} ${recipe.ingredients.map((item) => item.name).join(" ")} ${recipe.tags.join(" ")}`, normalizedQuery));
  const unresolvedFavoriteIds = favoriteIds.filter((id) => !recipeById.has(id) && id.startsWith("catalog-"));
  const allCatalogueFavorites = catalogue
    ? unresolvedFavoriteIds
        .map((id) => catalogue.recipes.find((item) => item.id === catalogueRecipeIdOf(id)))
        .filter((item): item is CatalogueRecipe => Boolean(item))
    : [];
  const catalogueFavorites = allCatalogueFavorites.filter((recipe) => !normalizedQuery
    || matchesRecipeSearch(`${recipe.titre} ${recipe.ingredients.map((item) => item.nom).join(" ")} ${recipe.tags.join(" ")}`, normalizedQuery));
  const savedCount = allFavoriteRecipes.length + (catalogue ? allCatalogueFavorites.length : unresolvedFavoriteIds.length);
  const favoriteCount = favoriteRecipes.length + (catalogue ? catalogueFavorites.length : unresolvedFavoriteIds.length);
  // Catalogue-only favourites need the lazy catalogue chunk to be readable.
  useEffect(() => {
    if (!catalogue && (mode === "catalogue" || (mode === "favorites" && unresolvedFavoriteIds.length))) onLoadCatalogue();
  }, [catalogue, mode, onLoadCatalogue, unresolvedFavoriteIds.length]);
  const catalogueRecipes = filterCatalogueRecipes(
    catalogue ? visibleCatalogueRecipes(catalogue) : [],
    { ...filters, category },
    normalizedQuery,
  ).filter((recipe) => associationFilter === "all" || (isAssociationRecipe(recipe.id) && (associationFilter === "collection" || evaluateAssociations(recipe.ingredients).level === associationFilter)));
  const renderedCatalogueRecipes = catalogueRecipes.slice(0, visibleCatalogueCount);
  useEffect(() => { setVisibleCatalogueCount(60); }, [mode, normalizedQuery, category, filters, associationFilter]);
  const activeFilterCount = [
    filters.maxActiveMinutes > 0,
    Boolean(filters.cost),
    Boolean(filters.season),
    Boolean(filters.diet),
    Boolean(filters.withoutAllergen),
    filters.plannableOnly,
  ].filter(Boolean).length;
  return (
    <main className="page-content favorites-page" data-testid="recipes-view">
      <div className="page-heading"><span className="eyebrow">Le plaisir de choisir</span><h1>Recette</h1><p>{catalogue ? `${visibleCatalogueRecipes(catalogue).length.toLocaleString("fr-FR")} recettes à découvrir, à votre rythme.` : "Trouvez votre prochaine envie."}</p></div>
      {libraryTools}
      <SavedMealsView meals={savedMeals} catalogue={catalogue} onLoad={onRetryCatalogue} onOpen={onOpenSavedMeal} onDelete={onDeleteSavedMeal} onRestore={onRestoreSavedMeal} onRename={onRenameSavedMeal} />
      <div className="segmented-control segmented-control--three" role="tablist" aria-label="Catalogue, favoris et historique" onKeyDown={(event) => {
        const order: typeof mode[] = ["favorites", "catalogue", "history"];
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        const next = event.key === "Home"
          ? order[0]
          : event.key === "End"
            ? order[order.length - 1]
            : step
              ? order[(order.indexOf(mode) + step + order.length) % order.length]
              : null;
        if (!next) return;
        event.preventDefault();
        setQuery("");
        setMode(next);
        document.getElementById(`library-tab-${next}`)?.focus();
      }}>
        {([["favorites", "Favoris"], ["catalogue", "Catalogue"], ["history", "Historique"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`library-tab-${id}`} aria-selected={mode === id} aria-controls="library-panel" tabIndex={mode === id ? 0 : -1} className={mode === id ? "is-selected" : ""} onClick={() => { setQuery(""); setMode(id); }}>{label}</button>
        ))}
      </div>
      <div id="library-panel" role="tabpanel" tabIndex={0} aria-labelledby={`library-tab-${mode}`}>
      {mode === "favorites" ? <div className="favorite-list">
        {savedCount > 4 ? <label className="catalogue-search"><MagnifyingGlassIcon /><span className="sr-only">Rechercher dans mes recettes enregistrées</span><KeyboardInput value={query} placeholder="Recette ou ingrédient" data-testid="favorites-search" onChange={(event) => setQuery(event.target.value)} /></label> : null}
        {favoriteCount ? <>
        {favoriteRecipes.map((recipe) => <button type="button" className="favorite-card" key={recipe.id} onClick={() => onOpenRecipe(recipe)}><img src={recipe.image} alt="" width={900} height={900} loading="lazy" decoding="async" onError={handleRecipeImageError} /><span><small>{customRecipeIds.has(recipe.id) ? "Recette personnelle" : recipe.mealTypes.map((type) => MEAL_LABELS[type]).join(" · ")}</small><strong>{recipe.title}</strong><em>{formatRecipeDuration(recipe.prepMinutes)} actives · {recipe.diet.includes("vegetarian") ? "Végétarien" : "Classique"}</em></span>{customRecipeIds.has(recipe.id) && !favoriteIds.includes(recipe.id) ? <CopyIcon /> : <HeartFilledIcon />}</button>)}
        {catalogueFavorites.map((recipe) => <button type="button" className="favorite-card" key={recipe.id} data-testid={`favorite-catalogue-${recipe.id}`} onClick={() => onOpenCatalogue(recipe)}><img src={catalogueImageFor(recipe)} alt="" loading="lazy" onError={handleRecipeImageError} /><span><small>{catalogueCategoryName(recipe.categorie)}</small><strong>{recipe.titre}</strong><em>{formatCatalogueCardDuration(recipe)}</em></span><HeartFilledIcon /></button>)}
        {!catalogue && unresolvedFavoriteIds.length ? (catalogueError ? <CatalogueError onRetry={onRetryCatalogue} /> : <p className="inline-help" aria-live="polite">Chargement de vos recettes du catalogue…</p>) : null}
      </> : savedCount ? <div className="empty-day"><MagnifyingGlassIcon /><h3>Aucun résultat</h3><p>Aucune recette enregistrée ne correspond à « {query} ».</p></div> : <div className="empty-day"><HeartIcon /><h3>Aucune recette enregistrée</h3><p>Ajoutez un favori ou créez votre version d’une recette pour la retrouver ici.</p></div>}</div> : mode === "catalogue" ? !catalogue ? (catalogueError ? <CatalogueError onRetry={onRetryCatalogue} /> : <div className="app-loading" aria-live="polite"><ReloadIcon className="spin" /><span>Chargement du catalogue…</span></div>) : <section className="catalogue-browser" aria-label="Catalogue vérifié">

        <label className="catalogue-search"><MagnifyingGlassIcon /><span className="sr-only">Rechercher une recette</span><KeyboardInput value={query} placeholder="Recette ou ingrédient" onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="text-field association-filter"><span>Associations alimentaires</span><select aria-label="Filtrer les associations" value={associationFilter} onChange={(event) => setAssociationFilter(event.target.value as typeof associationFilter)}><option value="all">Tout le catalogue</option><option value="collection">Collection sans gluten, lait, alcool ni préparations industrielles</option><option value="verte">Associations vertes uniquement</option><option value="orange">Associations orange signalées</option></select></label>
        <Carousel ariaLabel="Filtrer les catégories" className="catalogue-filters" contentClassName="catalogue-filters__track"><button type="button" className={category === "all" ? "is-selected" : ""} aria-pressed={category === "all"} onClick={() => setCategory("all")}>Toutes</button>{CATALOGUE_CATEGORIES.map((item) => <button type="button" key={item.id} className={category === item.id ? "is-selected" : ""} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.nom}</button>)}</Carousel>
        <div className="catalogue-toolbar">
          <button type="button" className={`secondary-button ${activeFilterCount ? "is-active" : ""}`} data-testid="catalogue-filters-open" onClick={() => { keyboard.hide(); setFiltersOpen(true); }}><MixerHorizontalIcon /> Filtres{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
          <label className="catalogue-sort"><span className="sr-only">Trier les recettes</span>
            <select data-testid="catalogue-sort" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as CatalogueFilters["sort"] }))}>
              <option value="title">Ordre alphabétique</option>
              <option value="time">Temps actif croissant</option>
              <option value="cost">Coût croissant</option>
            </select>
          </label>
        </div>
        <p className="catalogue-count" role="status" aria-live="polite">{catalogueRecipes.length} résultat{catalogueRecipes.length > 1 ? "s" : ""}</p>
        <WebSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtrer le catalogue" description="Les filtres se cumulent et n’altèrent jamais les relectures éditoriales.">
          <div className="catalogue-filter-sheet" data-testid="catalogue-filter-sheet">
            <fieldset><legend>Temps actif maximum</legend><div className="choice-row">{[0, 15, 30, 45].map((minutes) => <button type="button" key={minutes} className={filters.maxActiveMinutes === minutes ? "is-selected" : ""} aria-pressed={filters.maxActiveMinutes === minutes} data-testid={`filter-time-${minutes}`} onClick={() => setFilters((current) => ({ ...current, maxActiveMinutes: minutes }))}>{minutes === 0 ? "Peu importe" : `${minutes} min`}</button>)}</div></fieldset>
            <fieldset><legend>Coût</legend><div className="choice-row">{([["", "Peu importe"], ["economique", "Économique"], ["moyen", "Moyen"], ["eleve", "Élevé"]] as const).map(([value, label]) => <button type="button" key={label} className={filters.cost === value ? "is-selected" : ""} aria-pressed={filters.cost === value} onClick={() => setFilters((current) => ({ ...current, cost: value }))}>{label}</button>)}</div></fieldset>
            <fieldset><legend>Saison</legend><div className="choice-row">{([["", "Toutes"], ["printemps", "Printemps"], ["ete", "Été"], ["automne", "Automne"], ["hiver", "Hiver"]] as const).map(([value, label]) => <button type="button" key={label} className={filters.season === value ? "is-selected" : ""} aria-pressed={filters.season === value} onClick={() => setFilters((current) => ({ ...current, season: value }))}>{label}</button>)}</div></fieldset>
            <fieldset><legend>Régime</legend><div className="choice-row">{([["", "Tous"], ["vegetalien", "Végétalien"], ["vegetarien", "Végétarien"], ["sans-gluten", "Sans gluten"], ["sans-lactose", "Sans lactose"], ["pescetarien", "Pescétarien"]] as const).map(([value, label]) => <button type="button" key={label} className={filters.diet === value ? "is-selected" : ""} aria-pressed={filters.diet === value} onClick={() => setFilters((current) => ({ ...current, diet: value }))}>{label}</button>)}</div></fieldset>
            <fieldset><legend>Sans allergène</legend><div className="choice-row">{[["", "Peu importe"] as const, ...ALLERGEN_OPTIONS.map((item) => [item.id, item.label] as const)].map(([value, label]) => <button type="button" key={label} className={filters.withoutAllergen === value ? "is-selected" : ""} aria-pressed={filters.withoutAllergen === value} data-testid={`filter-allergen-${value || "any"}`} onClick={() => setFilters((current) => ({ ...current, withoutAllergen: value }))}>{label}</button>)}</div></fieldset>
            <button type="button" className={`dislike-toggle ${filters.plannableOnly ? "is-selected" : ""}`} aria-pressed={filters.plannableOnly} data-testid="filter-plannable" onClick={() => setFilters((current) => ({ ...current, plannableOnly: !current.plannableOnly }))}><span className="dislike-toggle__box" aria-hidden="true">{filters.plannableOnly ? <CheckIcon /> : null}</span><span><strong>Seulement les recettes planifiables</strong><small>Masque les recettes d’appoint et celles écartées par la relecture.</small></span></button>
            <div className="filter-sheet-actions">
              <button type="button" className="secondary-button" data-testid="catalogue-filters-reset" onClick={() => setFilters(EMPTY_CATALOGUE_FILTERS)}>Tout effacer</button>
              <button type="button" className="primary-button" onClick={() => setFiltersOpen(false)}>Voir {catalogueRecipes.length} recette{catalogueRecipes.length > 1 ? "s" : ""}</button>
            </div>
          </div>
        </WebSheet>
        <div className="choice-row" aria-label="Raccourcis de recherche"><button type="button" aria-pressed={filters.maxActiveMinutes === 20} onClick={() => setFilters((current) => ({ ...current, maxActiveMinutes: current.maxActiveMinutes === 20 ? 0 : 20 }))}>20 min actives maximum</button><button type="button" aria-pressed={associationFilter === "verte"} onClick={() => setAssociationFilter((current) => current === "verte" ? "all" : "verte")}>Tout vert</button></div>
        <div className="catalogue-list">{renderedCatalogueRecipes.map((recipe) => { const availability = plannerAvailabilityFor(recipe); const exclusion = availability.kind ? PLANNER_EXCLUSION_TEXT[availability.kind] : undefined; return <button type="button" className="catalogue-card" key={recipe.id} onClick={() => onOpenCatalogue(recipe)}><img className="catalogue-card__image" src={catalogueImageFor(recipe)} alt="" width={900} height={900} loading="lazy" decoding="async" onError={handleRecipeImageError} /><strong>{recipe.titre}</strong><small>{catalogueCategoryName(recipe.categorie)} · {formatCatalogueCardDuration(recipe)}</small><AssociationBadge recipe={recipe} />{exclusion ? <span className="catalogue-card__planner">{exclusion.badge}</span> : null}<span className="catalogue-card__meta">{recipe.regimes.slice(0, 2).map(formatDietLabel).join(" · ")}<ChevronRightIcon /></span></button>; })}</div>
        {!catalogueRecipes.length ? <div className="empty-day" data-testid="catalogue-empty"><MagnifyingGlassIcon /><h3>Aucune recette trouvée</h3><p>Essayez un autre ingrédient ou effacez vos critères pour retrouver tout le catalogue.</p><button type="button" className="secondary-button" onClick={() => { setQuery(""); setCategory("all"); setFilters(EMPTY_CATALOGUE_FILTERS); setAssociationFilter("all"); }}>Effacer tous les critères</button></div> : null}
        <details className="catalogue-review-details"><summary>À propos de ce catalogue</summary><p>Les {catalogue.recipes.length} recettes ont été relues : {Object.keys(DUPLICATE_CATALOGUE_RECIPES).length} variantes trop proches sont écartées. Les repères et précautions restent disponibles dans chaque fiche.</p></details>
        {renderedCatalogueRecipes.length < catalogueRecipes.length ? <button type="button" className="secondary-button full-button catalogue-more" data-testid="catalogue-more" onClick={() => setVisibleCatalogueCount((count) => Math.min(catalogueRecipes.length, count + 60))}>Afficher 60 recettes de plus</button> : null}
      </section> : <div className="history-list">{history.length ? <>
        {history.map((plan) => <article className="history-card" key={plan.id} data-testid={`history-card-${plan.id}`}>
          <button type="button" className="history-card__open" onClick={() => onOpenHistory(plan)}><span><small>Générée le {new Date(plan.generatedAt).toLocaleDateString("fr-FR")}</small><strong>{formatWeekRange(plan.startsOn)}</strong><ChevronRightIcon /></span><em>{plan.meals.filter((meal) => !meal.skipped).length} repas · {plan.estimatedCost.toFixed(0)} € estimés</em></button>
          <ConfirmActionDialog
            title="Supprimer cette semaine ?"
            description={`La semaine du ${formatWeekRange(plan.startsOn)} sera retirée de l’historique de cet appareil. Cette action est définitive.`}
            confirmLabel="Supprimer la semaine"
            testId={`history-delete-dialog-${plan.id}`}
            onConfirm={() => onDeleteHistory(plan)}
            trigger={<button type="button" className="history-card__delete" data-testid={`history-delete-${plan.id}`} aria-label={`Supprimer la semaine du ${formatWeekRange(plan.startsOn)}`}><Cross2Icon /></button>}
          />
        </article>)}
        <p className="inline-help">{history.length} semaine{history.length > 1 ? "s" : ""} conservée{history.length > 1 ? "s" : ""} sur cet appareil, {HISTORY_LIMIT} au maximum : au-delà, la plus ancienne est retirée automatiquement.</p>
      </> : <div className="empty-day"><ArchiveIcon /><h3>Aucun historique</h3><p>Vos anciennes semaines seront conservées sur cet appareil.</p></div>}</div>}
      </div>
    </main>
  );
}
