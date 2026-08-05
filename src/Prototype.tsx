import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  Cross2Icon,
  HeartFilledIcon,
  HeartIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PersonIcon,
  PlusIcon,
  ReloadIcon,
  SunIcon,
  MoonIcon,
} from "@radix-ui/react-icons";
import {
  Carousel,
  FlowStack,
  KeyboardInput,
  MobileScroll,
  useKeyboard,
  type FlowControls,
  type FlowScreen,
} from "./mobile";
import {
  buildShoppingList,
  generateWeeklyPlan,
  getReplacementCandidates,
  replacePlannedMeal,
  scaleIngredients,
  summarizePlan,
} from "./engine";
import {
  DEFAULT_PROFILE,
  type DietMode,
  type Equipment,
  type IngredientCategory,
  type IngredientUnit,
  type MealType,
  type PlannedMeal,
  type Recipe,
  type UserProfile,
  type WeeklyPlan,
} from "./domain";
import { RECIPES } from "./recipes";
import {
  CATALOGUE,
  CATALOGUE_CATEGORIES,
  CATALOGUE_RECIPES,
  DUPLICATE_CATALOGUE_RECIPES,
  catalogueImageFor,
  catalogueCategoryName,
  reviewFor,
  type CatalogueRecipe,
} from "./catalog";
import {
  DEFAULT_APP_STATE,
  loadAppState,
  registerOfflineSupport,
  saveAppState,
  type AppState,
} from "./storage";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";

type TabId = "home" | "week" | "courses" | "favorites";
type IconType = ComponentType<{ className?: string }>;

const DAY_LABELS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Petit-déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
};
const DIET_LABELS: Record<DietMode, string> = {
  classic: "Classique",
  vegetarian: "Végétarien",
  "no-pork": "Sans porc",
};
const EQUIPMENT_OPTIONS: Array<{ id: Equipment; label: string }> = [
  { id: "hob", label: "Plaques" },
  { id: "oven", label: "Four" },
  { id: "microwave", label: "Micro-ondes" },
  { id: "blender", label: "Blender" },
  { id: "toaster", label: "Grille-pain" },
  { id: "steamer", label: "Vapeur" },
];
const ALLERGEN_OPTIONS = [
  { id: "gluten", label: "Gluten" },
  { id: "crustaces", label: "Crustacés" },
  { id: "oeuf", label: "Œuf" },
  { id: "poisson", label: "Poisson" },
  { id: "arachides", label: "Arachides" },
  { id: "soja", label: "Soja" },
  { id: "lait", label: "Lait" },
  { id: "fruits-a-coque", label: "Fruits à coque" },
  { id: "celeri", label: "Céleri" },
  { id: "moutarde", label: "Moutarde" },
  { id: "sesame", label: "Sésame" },
  { id: "sulfites", label: "Sulfites" },
  { id: "lupin", label: "Lupin" },
  { id: "mollusques", label: "Mollusques" },
] as const;
const ALLERGEN_LABELS = Object.fromEntries(ALLERGEN_OPTIONS.map((item) => [item.id, item.label]));
const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  "fruit-vegetable": "Fruits et légumes",
  grocery: "Épicerie",
  fresh: "Produits frais",
  "meat-fish": "Viandes et poissons",
  frozen: "Surgelés",
  bakery: "Boulangerie",
  beverage: "Boissons",
};
const recipeById = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
const ingredientNameById = new Map(
  RECIPES.flatMap((recipe) => recipe.ingredients).map((ingredient) => [ingredient.id, ingredient.name]),
);

const navItems: Array<{ id: TabId; label: string; icon: IconType }> = [
  { id: "home", label: "Accueil", icon: HomeIcon },
  { id: "week", label: "Semaine", icon: CalendarIcon },
  { id: "courses", label: "Courses", icon: ArchiveIcon },
  { id: "favorites", label: "Favoris", icon: HeartIcon },
];

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mondayOf(date = new Date()): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function dateAt(startsOn: string, dayIndex: number): Date {
  const [year, month, day] = startsOn.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  result.setDate(result.getDate() + dayIndex);
  return result;
}

function formatWeekRange(startsOn: string): string {
  const start = dateAt(startsOn, 0);
  const end = dateAt(startsOn, 6);
  const startMonth = start.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  const endMonth = end.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${endMonth}`
    : `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
}

function currentDayIndex(startsOn: string): number {
  const start = dateAt(startsOn, 0).getTime();
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.min(6, Math.round((localToday - start) / 86_400_000)));
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae").trim().toLowerCase();
}

function parseList(value: string): string[] {
  return [...new Set(value.split(/[,;\n]/).map((item) => normalizeText(item)).filter(Boolean))];
}

function resolveExcludedIngredients(value: string): string[] {
  const terms = parseList(value);
  const entries = [...ingredientNameById.entries()];
  return terms.map((term) => {
    const exact = entries.find(([id, name]) => normalizeText(id) === term || normalizeText(name) === term);
    const partial = entries.find(([, name]) => normalizeText(name).includes(term));
    return exact?.[0] ?? partial?.[0] ?? term.replace(/\s+/g, "_");
  });
}

function displayQuantity(quantity: number, unit: IngredientUnit): string {
  const rounded = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1).replace(".0", "").replace(".", ",");
  const units: Record<IngredientUnit, string> = {
    g: "g",
    ml: "ml",
    piece: quantity > 1 ? "pièces" : "pièce",
    c_soupe: "c. à soupe",
    c_cafe: "c. à café",
  };
  return `${rounded} ${units[unit]}`;
}

function displayCatalogueQuantity(quantity: number, unit: string): string {
  const rounded = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(1).replace(".0", "").replace(".", ",");
  return `${rounded} ${unit}`.trim();
}

function makePlan(profile: UserProfile, seed: string | number = Date.now()): WeeklyPlan {
  const monday = mondayOf();
  return generateWeeklyPlan(RECIPES, profile, {
    seed,
    startsOn: isoDate(monday),
    generatedAt: new Date().toISOString(),
    season: [11, 0, 1].includes(monday.getMonth()) ? "winter" : [2, 3, 4].includes(monday.getMonth()) ? "spring" : [5, 6, 7].includes(monday.getMonth()) ? "summer" : "autumn",
  });
}

function BottomNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {navItems.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" className={`bottom-nav__item ${active === id ? "is-active" : ""}`} aria-current={active === id ? "page" : undefined} onClick={() => onChange(id)}>
          <Icon className="bottom-nav__icon" /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Wordmark() {
  return <div className="wordmark" aria-label="Inflamm’Menu"><span>Inflamm’Menu</span><img src="/assets/olive-sprig.png" alt="" /></div>;
}

function WeekStrip({ startsOn, selected, onSelect, compact = false }: { startsOn: string; selected: number; onSelect?: (index: number) => void; compact?: boolean }) {
  return (
    <div className={`week-strip ${compact ? "week-strip--compact" : ""}`} aria-label={`Semaine du ${formatWeekRange(startsOn)}`}>
      {DAY_LABELS.map((short, index) => (
        <button key={short} type="button" className={`week-day ${selected === index ? "is-today" : ""}`} aria-label={`${short} ${dateAt(startsOn, index).getDate()}`} onClick={() => onSelect?.(index)}>
          <span>{short}</span><strong>{dateAt(startsOn, index).getDate()}</strong><i aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function MealPreview({ planned, recipe, startsOn, onOpen }: { planned: PlannedMeal; recipe: Recipe; startsOn: string; onOpen: () => void }) {
  const MealIcon = planned.mealType === "dinner" ? MoonIcon : SunIcon;
  return (
    <button type="button" className="meal-preview" onClick={onOpen}>
      <img src={recipe.image} alt="" /><span className="meal-preview__icon" aria-hidden="true"><MealIcon /></span>
      <span className="meal-preview__copy"><strong>{recipe.title}</strong><small>{MEAL_LABELS[planned.mealType]} · {DAY_LABELS[planned.dayIndex]} {dateAt(startsOn, planned.dayIndex).getDate()}</small></span>
      <ChevronRightIcon className="meal-preview__chevron" />
    </button>
  );
}

function HomeView({ profile, plan, onGenerate, onProfile, onOpenMeal, onOpenWeek }: {
  profile: UserProfile;
  plan: WeeklyPlan | null;
  onGenerate: () => void;
  onProfile: () => void;
  onOpenMeal: (planned: PlannedMeal, recipe: Recipe) => void;
  onOpenWeek: () => void;
}) {
  const todayIndex = plan ? currentDayIndex(plan.startsOn) : 0;
  const todayMeals = plan?.meals.filter((meal) => meal.dayIndex === todayIndex).slice(0, 2) ?? [];
  const firstName = profile.firstName.trim();
  return (
    <main className="home-view" data-testid="home-view">
      <section className="home-hero">
        <img className="home-hero__image" src="/assets/inflamm-hero-bowl.png" alt="Bowl de quinoa, pois chiches et légumes rôtis" />
        <div className="home-hero__content">
          <Wordmark /><p className="home-kicker">Bonjour{firstName ? ` ${firstName}` : ""}</p><h1>Une semaine<br />qui vous fait<br />du bien</h1>
          <button className="primary-button home-cta" type="button" onClick={onGenerate}>{plan ? "Créer une autre semaine" : "Générer ma semaine"}</button>
          <p className="home-meta">{profile.mealsPerDay * 7} repas · {profile.people} personne{profile.people > 1 ? "s" : ""} · {profile.weeklyBudget} € maximum</p>
        </div>
      </section>
      <section className="week-preview" aria-labelledby="week-preview-title">
        <button className="week-preview__header" type="button" onClick={onOpenWeek}>
          <CalendarIcon /><h2 id="week-preview-title">{plan ? formatWeekRange(plan.startsOn) : "Votre semaine"}</h2><span>{plan ? "Voir tout" : "À créer"}</span>
        </button>
        {plan ? <><WeekStrip startsOn={plan.startsOn} selected={todayIndex} compact /><div className="meal-list">
          {todayMeals.map((planned) => { const recipe = recipeById.get(planned.recipeId); return recipe ? <MealPreview key={planned.id} planned={planned} recipe={recipe} startsOn={plan.startsOn} onOpen={() => onOpenMeal(planned, recipe)} /> : null; })}
        </div></> : <div className="empty-preview"><CalendarIcon /><p>Créez votre premier menu directement sur cet appareil.</p></div>}
        <button className="profile-link" type="button" onClick={onProfile}><PersonIcon /><span>Ajuster mon profil</span><ChevronRightIcon /></button>
      </section>
    </main>
  );
}

function WeekView({ plan, onOpenMeal, onReplace }: { plan: WeeklyPlan | null; onOpenMeal: (planned: PlannedMeal, recipe: Recipe) => void; onReplace: (planned: PlannedMeal, recipe: Recipe) => void }) {
  const [selectedDay, setSelectedDay] = useState(plan ? currentDayIndex(plan.startsOn) : 0);
  if (!plan) return <EmptyRoot icon={CalendarIcon} title="Aucune semaine pour le moment" body="Commencez depuis l’accueil pour générer vos repas." />;
  const summary = summarizePlan(plan, RECIPES);
  const visibleMeals = plan.meals.filter((meal) => meal.dayIndex === selectedDay);
  const selectedDate = dateAt(plan.startsOn, selectedDay);
  return (
    <main className="page-content week-page" data-testid="week-view">
      <div className="page-heading"><span className="eyebrow">{formatWeekRange(plan.startsOn)}</span><h1>Ma semaine</h1><p>Des repas variés, construits par des règles transparentes.</p></div>
      <div className="week-summary"><div><strong>{summary.mealCount}</strong><span>repas</span></div><div><strong>{summary.estimatedCost.toFixed(0)} €</strong><span>estimés</span></div><div><strong>{summary.averagePrepMinutes.toFixed(0)} min</strong><span>en moyenne</span></div></div>
      {!summary.withinBudget ? <p className="notice-banner">Budget estimé dépassé : les autres critères ont été conservés.</p> : null}
      <Carousel ariaLabel="Choisir un jour" className="day-carousel" contentClassName="day-carousel__track">
        {DAY_LABELS.map((day, index) => <button key={day} type="button" className={`day-card ${selectedDay === index ? "is-selected" : ""}`} onClick={() => setSelectedDay(index)}><span>{day}</span><strong>{dateAt(plan.startsOn, index).getDate()}</strong></button>)}
      </Carousel>
      <section className="day-plan">
        <div className="section-heading"><div><span className="eyebrow">Jour {selectedDay + 1}</span><h2>{selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h2></div><CheckCircledIcon /></div>
        {visibleMeals.map((planned) => { const recipe = recipeById.get(planned.recipeId); if (!recipe) return null; return (
          <article className="meal-card" key={planned.id}>
            <button type="button" className="meal-card__main" onClick={() => onOpenMeal(planned, recipe)}><img src={recipe.image} alt="" /><span><small>{MEAL_LABELS[planned.mealType]}</small><strong>{recipe.title}</strong><em><ClockIcon /> {recipe.prepMinutes} min · {planned.portions} portions</em></span></button>
            <button className="meal-card__replace" type="button" onClick={() => onReplace(planned, recipe)}><ReloadIcon /> Remplacer</button>
          </article>
        ); })}
      </section>
    </main>
  );
}

function EmptyRoot({ icon: Icon, title, body }: { icon: IconType; title: string; body: string }) {
  return <main className="page-content empty-root"><Icon /><h1>{title}</h1><p>{body}</p></main>;
}

function CoursesView({ plan, profile, checkedIds, pantryIds, onToggleChecked, onTogglePantry }: {
  plan: WeeklyPlan | null;
  profile: UserProfile;
  checkedIds: string[];
  pantryIds: string[];
  onToggleChecked: (id: string) => void;
  onTogglePantry: (id: string) => void;
}) {
  const [pantryMode, setPantryMode] = useState(false);
  if (!plan) return <EmptyRoot icon={ArchiveIcon} title="Liste encore vide" body="Les ingrédients apparaîtront après la génération de votre semaine." />;
  const items = buildShoppingList(plan, RECIPES, profile, pantryIds);
  const groups = Object.entries(CATEGORY_LABELS).map(([category, label]) => ({ category: category as IngredientCategory, label, items: items.filter((item) => item.category === category) })).filter((group) => group.items.length);
  const checkedCount = items.filter((item) => checkedIds.includes(`${item.ingredientId}:${item.unit}`) || item.inPantry).length;
  return (
    <main className="page-content courses-page" data-testid="courses-view">
      <div className="page-heading"><span className="eyebrow">Semaine du {formatWeekRange(plan.startsOn)}</span><h1>Liste de courses</h1><p>{checkedCount} sur {items.length} articles retirés ou cochés</p></div>
      <div className="shopping-progress"><span style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }} /></div>
      <button className={`secondary-button pantry-button ${pantryMode ? "is-active" : ""}`} type="button" onClick={() => setPantryMode((value) => !value)}><CheckIcon /> {pantryMode ? "Terminer l’inventaire" : "Retirer ce que j’ai déjà"}</button>
      {pantryMode ? <p className="inline-help">Touchez « J’ai déjà » pour retirer un ingrédient tout en le mémorisant.</p> : null}
      <div className="shopping-groups">{groups.map((group) => <section key={group.category} className="shopping-group"><h2>{group.label}<span>{group.items.length}</span></h2>{group.items.map((item) => {
        const key = `${item.ingredientId}:${item.unit}`;
        const isChecked = checkedIds.includes(key) || item.inPantry;
        return <div key={key} className={`shopping-item ${isChecked ? "is-checked" : ""}`}><button className="shopping-toggle" type="button" aria-label={`Cocher ${item.name}`} onClick={() => onToggleChecked(key)}><span className="shopping-check" aria-hidden="true">{isChecked ? <CheckIcon /> : null}</span><span><strong>{item.name}</strong><small>{displayQuantity(item.quantity, item.unit)}</small></span></button>{pantryMode ? <button type="button" className={`pantry-chip ${item.inPantry ? "is-selected" : ""}`} onClick={() => onTogglePantry(item.ingredientId)}>{item.inPantry ? "Retiré" : "J’ai déjà"}</button> : null}</div>;
      })}</section>)}</div>
    </main>
  );
}

function FavoritesView({ favoriteIds, history, onOpenRecipe, onOpenCatalogue }: { favoriteIds: string[]; history: WeeklyPlan[]; onOpenRecipe: (recipe: Recipe) => void; onOpenCatalogue: (recipe: CatalogueRecipe) => void }) {
  const [mode, setMode] = useState<"favorites" | "catalogue" | "history">("favorites");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const favoriteRecipes = favoriteIds.map((id) => recipeById.get(id)).filter((item): item is Recipe => Boolean(item));
  const normalizedQuery = normalizeText(query);
  const catalogueRecipes = CATALOGUE_RECIPES.filter((recipe) => {
    if (category !== "all" && recipe.categorie !== category) return false;
    if (!normalizedQuery) return true;
    const searchable = normalizeText(`${recipe.titre} ${recipe.ingredients.map((item) => item.nom).join(" ")} ${recipe.tags.join(" ")}`);
    return searchable.includes(normalizedQuery);
  });
  return (
    <main className="page-content favorites-page" data-testid="favorites-view">
      <div className="page-heading"><span className="eyebrow">Ma bibliothèque</span><h1>Recettes</h1><p>Un catalogue culinaire relu recette par recette, en complément de vos favoris.</p></div>
      <div className="segmented-control segmented-control--three" role="tablist" aria-label="Catalogue, favoris et historique"><button role="tab" aria-selected={mode === "favorites"} className={mode === "favorites" ? "is-selected" : ""} onClick={() => setMode("favorites")}>Favoris</button><button role="tab" aria-selected={mode === "catalogue"} className={mode === "catalogue" ? "is-selected" : ""} onClick={() => setMode("catalogue")}>Catalogue</button><button role="tab" aria-selected={mode === "history"} className={mode === "history" ? "is-selected" : ""} onClick={() => setMode("history")}>Historique</button></div>
      {mode === "favorites" ? <div className="favorite-list">{favoriteRecipes.length ? favoriteRecipes.map((recipe) => <button type="button" className="favorite-card" key={recipe.id} onClick={() => onOpenRecipe(recipe)}><img src={recipe.image} alt="" /><span><small>{recipe.mealTypes.map((type) => MEAL_LABELS[type]).join(" · ")}</small><strong>{recipe.title}</strong><em>{recipe.prepMinutes} min · {recipe.diet.includes("vegetarian") ? "Végétarien" : "Classique"}</em></span><HeartFilledIcon /></button>) : <div className="empty-day"><HeartIcon /><h3>Aucun favori</h3><p>Ajoutez une recette depuis sa fiche pour la retrouver ici.</p></div>}</div> : mode === "catalogue" ? <section className="catalogue-browser" aria-label="Catalogue vérifié">
        <div className="catalogue-method"><strong>{CATALOGUE_RECIPES.length} nouvelles recettes</strong><p>Les {CATALOGUE.recipes.length} propositions ont été comparées à la base existante : {Object.keys(DUPLICATE_CATALOGUE_RECIPES).length} doublons ont été écartés. Chaque recette conservée a aussi été relue individuellement.</p></div>
        <label className="catalogue-search"><MagnifyingGlassIcon /><span className="sr-only">Rechercher une recette</span><KeyboardInput value={query} placeholder="Recette ou ingrédient" onChange={(event) => setQuery(event.target.value)} /></label>
        <Carousel ariaLabel="Filtrer les catégories" className="catalogue-filters" contentClassName="catalogue-filters__track"><button className={category === "all" ? "is-selected" : ""} onClick={() => setCategory("all")}>Toutes</button>{CATALOGUE_CATEGORIES.map((item) => <button key={item.id} className={category === item.id ? "is-selected" : ""} onClick={() => setCategory(item.id)}>{item.nom}</button>)}</Carousel>
        <p className="catalogue-count">{catalogueRecipes.length} résultat{catalogueRecipes.length > 1 ? "s" : ""}</p>
        <div className="catalogue-list">{catalogueRecipes.map((recipe) => { const review = reviewFor(recipe); return <button type="button" className="catalogue-card" key={recipe.id} onClick={() => onOpenCatalogue(recipe)}><img className="catalogue-card__image" src={catalogueImageFor(recipe)} alt="" loading="lazy" decoding="async" /><span className={`catalogue-card__status is-${review.status}`}>{review.status === "validated" ? "Profil cohérent" : "Avec repères"}</span><small>{catalogueCategoryName(recipe.categorie)} · {recipe.temps.total} min</small><strong>{recipe.titre}</strong><p>{review.summary}</p><span className="catalogue-card__meta">{recipe.regimes.slice(0, 2).map((item) => item.replaceAll("-", " ")).join(" · ")}<ChevronRightIcon /></span></button>; })}</div>
      </section> : <div className="history-list">{history.length ? history.map((plan) => <article className="history-card" key={plan.id}><span><small>Générée le {new Date(plan.generatedAt).toLocaleDateString("fr-FR")}</small><strong>{formatWeekRange(plan.startsOn)}</strong></span><em>{plan.meals.length} repas · {plan.estimatedCost.toFixed(0)} € estimés</em></article>) : <div className="empty-day"><ArchiveIcon /><h3>Aucun historique</h3><p>Vos anciennes semaines seront conservées sur cet appareil.</p></div>}</div>}
    </main>
  );
}

function Header({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return <div className="app-header"><button type="button" className="icon-button" aria-label="Retour" onClick={onBack}><ArrowLeftIcon /></button><strong>{title}</strong><span className="app-header__action">{action}</span></div>;
}

function ProfileView({ initial, onSave, onOpenInformation }: { initial: UserProfile; onSave: (profile: UserProfile) => void; onOpenInformation: () => void }) {
  const keyboard = useKeyboard();
  const [profile, setProfile] = useState<UserProfile>({ ...initial });
  const [budget, setBudget] = useState(String(initial.weeklyBudget));
  const [maxPrep, setMaxPrep] = useState(String(initial.maxPrepMinutes));
  const [allergies, setAllergies] = useState(initial.allergies.join(", "));
  const [excluded, setExcluded] = useState(initial.excludedIngredientIds.map((id) => ingredientNameById.get(id) ?? id).join(", "));
  const toggleEquipment = (item: Equipment) => setProfile((current) => ({ ...current, equipment: current.equipment.includes(item) ? current.equipment.filter((entry) => entry !== item) : [...current.equipment, item] }));
  const selectedAllergies = new Set(parseList(allergies).map((item) => item.replace(/\s+/g, "-")));
  const toggleAllergy = (id: string) => setAllergies((current) => {
    const values = new Set(parseList(current).map((item) => item.replace(/\s+/g, "-")));
    if (values.has(id)) values.delete(id); else values.add(id);
    return [...values].join(", ");
  });
  const commit = () => {
    keyboard.hide();
    onSave({ ...profile, weeklyBudget: Math.max(20, Number(budget) || DEFAULT_PROFILE.weeklyBudget), maxPrepMinutes: Math.max(5, Number(maxPrep) || DEFAULT_PROFILE.maxPrepMinutes), allergies: parseList(allergies), excludedIngredientIds: resolveExcludedIngredients(excluded) });
  };
  return <MobileScroll className="app-screen"><main className="page-content pushed-page profile-page">
    <div className="page-heading"><span className="eyebrow">Personnalisation</span><h1>Mon profil alimentaire</h1><p>Ces choix guident chaque menu et restent uniquement sur cet appareil.</p></div>
    <section className="form-section"><h2>Votre foyer</h2>
      <label className="text-field"><span>Votre prénom</span><KeyboardInput autoComplete="given-name" maxLength={40} value={profile.firstName} placeholder="Ex. Camille" onChange={(event) => setProfile((current) => ({ ...current, firstName: event.target.value }))} onBlur={keyboard.hide} /><small>Utilisé uniquement pour personnaliser l’accueil.</small></label>
      <div className="setting-row"><span><strong>Nombre de personnes</strong><small>Quantités adaptées</small></span><div className="stepper"><button type="button" onClick={() => setProfile((current) => ({ ...current, people: Math.max(1, current.people - 1) }))} aria-label="Retirer une personne"><MinusIcon /></button><b>{profile.people}</b><button type="button" onClick={() => setProfile((current) => ({ ...current, people: Math.min(6, current.people + 1) }))} aria-label="Ajouter une personne"><PlusIcon /></button></div></div>
      <div className="setting-row setting-row--stack"><span><strong>Repas par jour</strong><small>Ajoutez le petit-déjeuner si vous le souhaitez</small></span><div className="choice-row">{([2, 3] as const).map((value) => <button type="button" className={profile.mealsPerDay === value ? "is-selected" : ""} key={value} onClick={() => setProfile((current) => ({ ...current, mealsPerDay: value }))}>{value} repas</button>)}</div></div>
    </section>
    <section className="form-section"><h2>Mes préférences</h2><div className="choice-grid">{(Object.keys(DIET_LABELS) as DietMode[]).map((item) => <button type="button" className={profile.diet === item ? "is-selected" : ""} key={item} onClick={() => setProfile((current) => ({ ...current, diet: item }))}>{DIET_LABELS[item]}</button>)}</div>
      <label className="text-field"><span>Budget hebdomadaire (€)</span><KeyboardInput inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value)} onBlur={keyboard.hide} /></label>
      <label className="text-field"><span>Temps maximum en cuisine (min)</span><KeyboardInput inputMode="numeric" value={maxPrep} onChange={(event) => setMaxPrep(event.target.value)} onBlur={keyboard.hide} /></label>
      <fieldset className="allergen-field"><legend>Allergies et intolérances à exclure</legend><div className="allergen-grid">{ALLERGEN_OPTIONS.map((item) => <button type="button" className={selectedAllergies.has(item.id) ? "is-selected" : ""} aria-pressed={selectedAllergies.has(item.id)} key={item.id} onClick={() => toggleAllergy(item.id)}>{selectedAllergies.has(item.id) ? <CheckIcon /> : null}{item.label}</button>)}</div></fieldset>
      <label className="text-field"><span>Autre allergie ou ingrédient à exclure</span><KeyboardInput value={allergies} placeholder="Sélectionnez ci-dessus ou saisissez un terme" onChange={(event) => setAllergies(event.target.value)} onBlur={keyboard.hide} /><small>Les 14 allergènes réglementaires sont normalisés automatiquement.</small></label>
      <label className="text-field"><span>Aliments refusés</span><KeyboardInput value={excluded} placeholder="Ex. brocoli, saumon" onChange={(event) => setExcluded(event.target.value)} onBlur={keyboard.hide} /></label>
    </section>
    <section className="form-section"><h2>Équipements</h2><div className="choice-grid">{EQUIPMENT_OPTIONS.map((item) => <button type="button" className={profile.equipment.includes(item.id) ? "is-selected" : ""} key={item.id} onClick={() => toggleEquipment(item.id)}>{profile.equipment.includes(item.id) ? <CheckIcon /> : null}{item.label}</button>)}</div></section>
    <button className="information-link" type="button" onClick={onOpenInformation}><span><strong>Informations et confidentialité</strong><small>Données, estimations et avertissement santé</small></span><ChevronRightIcon /></button>
    <p className="privacy-note">La génération repose sur des règles locales. Votre profil et vos menus restent sur cet appareil.</p>
    <button className="primary-button full-button" type="button" onClick={commit}>Enregistrer mon profil</button>
  </main></MobileScroll>;
}

function InformationView() {
  return <MobileScroll className="app-screen"><main className="page-content pushed-page information-page">
    <div className="page-heading"><span className="eyebrow">En toute transparence</span><h1>À propos de l’application</h1><p>Les repères essentiels sur le fonctionnement de cette V1 locale.</p></div>
    <section className="information-card"><h2>Génération locale</h2><p>Les semaines sont composées directement sur votre appareil à partir de règles déterministes, de filtres et d’une base de recettes intégrée.</p></section>
    <section className="information-card"><h2>Confidentialité</h2><p>Votre prénom, vos préférences, vos menus, vos favoris et votre liste de courses sont enregistrés localement sur cet appareil. Cette V1 ne crée pas de compte et ne transmet pas ces données à un serveur.</p><p>La suppression des données du site dans les réglages du navigateur efface ces informations locales.</p></section>
    <section className="information-card information-card--warning"><h2>Avertissement santé</h2><p>Inflamm’Menu est un outil d’organisation alimentaire et ne remplace pas l’avis d’un médecin, d’un diététicien ou d’un autre professionnel de santé. En cas d’allergie sévère, de pathologie, de grossesse ou de régime prescrit, demandez un avis professionnel.</p></section>
    <section className="information-card"><h2>{CATALOGUE.recipes.length} recettes comparées et relues</h2><p>{CATALOGUE_RECIPES.length} recettes absentes de la base ont été ajoutées; {Object.keys(DUPLICATE_CATALOGUE_RECIPES).length} recettes matériellement équivalentes ont été écartées. Chaque proposition a été contrôlée selon son profil alimentaire global : place des végétaux, fibres, céréales complètes, légumineuses, poissons, graisses insaturées, sucres ajoutés, sodium et graisses saturées.</p><p>Les recettes contenant notamment beaucoup de coco, des préparations concentrées au curcuma, des algues ou davantage de sucre sont conservées avec des repères explicites. L'indice numérique du fichier source reste éditorial et n'est pas présenté comme une mesure médicale.</p></section>
    <section className="information-card"><h2>Estimations</h2><p>Les prix, calories, protéines, fibres et quantités sont des estimations indicatives. Ils peuvent varier selon les produits, les marques, les saisons, les magasins et la préparation réelle.</p></section>
    <section className="information-card official-sources"><h2>Sources officielles de référence</h2><p>Ces liens permettent de consulter les repères publics qui orientent le contenu éditorial de l’application.</p>
      <a href="https://ciqual.anses.fr/cms/fr/la-table-ciqual-2025" target="_blank" rel="noreferrer"><span><strong>Table Ciqual 2025 — ANSES</strong><small>Composition nutritionnelle des aliments</small></span><ChevronRightIcon /></a>
      <a href="https://www.santepubliquefrance.fr/nutrition-et-activite-physique/rapportsynthese/recommandations-relatives-a-lalimentation-a-lactivite-physique-et-a-la-sedentarite-pour-les-adultes" target="_blank" rel="noreferrer"><span><strong>Santé publique France</strong><small>Recommandations pour les adultes</small></span><ChevronRightIcon /></a>
      <a href="https://nutritionsource.hsph.harvard.edu/healthy-weight/diet-reviews/anti-inflammatory-diet/" target="_blank" rel="noreferrer"><span><strong>Harvard — The Nutrition Source</strong><small>Alimentation anti-inflammatoire et limites des preuves</small></span><ChevronRightIcon /></a>
      <a href="https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/nutrition-basics/mediterranean-diet" target="_blank" rel="noreferrer"><span><strong>American Heart Association</strong><small>Repères du modèle méditerranéen</small></span><ChevronRightIcon /></a>
      <a href="https://www.anses.fr/fr/content/des-effets-indesirables-lies-la-consommation-de-complements-alimentaires-contenant-du" target="_blank" rel="noreferrer"><span><strong>ANSES — Curcuma</strong><small>Précautions et interactions</small></span><ChevronRightIcon /></a>
      <a href="https://www.anses.fr/fr/content/consommation-dalgues-rester-vigilant-sur-le-risque-dexces-dapport-en-iode" target="_blank" rel="noreferrer"><span><strong>ANSES — Algues et iode</strong><small>Populations à risque et consommation régulière</small></span><ChevronRightIcon /></a>
    </section>
    <p className="information-footer">Catalogue culinaire sous {CATALOGUE.meta.licence}</p>
  </main></MobileScroll>;
}

function AllergenNotice({ allergens }: { allergens: readonly string[] }) {
  if (!allergens.length) return <aside className="allergen-notice allergen-notice--clear"><strong>Allergènes déclarés</strong><p>Aucun des 14 allergènes réglementaires dans la formulation. Vérifiez toutefois les étiquettes et les traces éventuelles.</p></aside>;
  return <aside className="allergen-notice"><strong>Allergènes à vérifier</strong><div>{allergens.map((allergen) => <span key={allergen}>{ALLERGEN_LABELS[allergen] ?? allergen.replaceAll("-", " ")}</span>)}</div><p>Contrôlez les étiquettes et les traces éventuelles, surtout en cas d’allergie sévère.</p></aside>;
}

function GenerateView({ profile, onCreate, onComplete }: { profile: UserProfile; onCreate: () => WeeklyPlan; onComplete: () => void }) {
  const [phase, setPhase] = useState<"ready" | "loading" | "success" | "error">("ready");
  const [result, setResult] = useState<WeeklyPlan | null>(null);
  const [message, setMessage] = useState("");
  const start = () => {
    setPhase("loading");
    window.setTimeout(() => {
      try { const plan = onCreate(); setResult(plan); setPhase("success"); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de créer cette semaine."); setPhase("error"); }
    }, 650);
  };
  return <MobileScroll className="app-screen"><main className="page-content pushed-page generate-page"><div className="generate-mark"><CalendarIcon /></div>
    {phase === "ready" ? <><div className="page-heading page-heading--center"><span className="eyebrow">Votre prochaine semaine</span><h1>Prête en quelques secondes</h1><p>Le moteur vérifie vos préférences, la variété, le budget et la saison.</p></div><section className="generation-summary"><div><PersonIcon /><span><small>Pour</small><strong>{profile.people} personne{profile.people > 1 ? "s" : ""}</strong></span></div><div><ClockIcon /><span><small>Préparation</small><strong>{profile.maxPrepMinutes} min max.</strong></span></div><div><ArchiveIcon /><span><small>Budget</small><strong>{profile.weeklyBudget} € max.</strong></span></div></section><div className="rule-list"><p><CheckIcon /> {profile.mealsPerDay} repas par jour</p><p><CheckIcon /> Au moins 2 repas avec légumineuses</p>{profile.diet === "classic" ? <p><CheckIcon /> Au moins 2 repas avec poisson</p> : null}<p><CheckIcon /> Priorité à la saison et au réemploi</p></div><p className="privacy-note">Génération locale, sans compte. Vos données restent sur cet appareil.</p><button className="primary-button full-button" onClick={start}>Créer ma semaine</button></> : phase === "loading" ? <div className="generation-state" aria-live="polite"><ReloadIcon className="spin" /><h1>Nous composons votre semaine</h1><p>Budget, variété, saison et temps de cuisine sont vérifiés.</p><div className="loading-line"><span /></div></div> : phase === "success" && result ? <div className="generation-state success-state" aria-live="polite"><CheckCircledIcon /><h1>Votre semaine est prête</h1><p>{result.meals.length} repas uniques pour {profile.people} personne{profile.people > 1 ? "s" : ""}, estimés à {result.estimatedCost.toFixed(0)} €.</p><button className="primary-button full-button" onClick={onComplete}>Voir ma semaine</button></div> : <div className="generation-state error-state" role="alert"><Cross2Icon /><h1>Vos critères sont trop serrés</h1><p>{message}</p><button className="secondary-button full-button" onClick={() => setPhase("ready")}>Modifier et réessayer</button></div>}
  </main></MobileScroll>;
}

function RecipeView({ recipe, planned, favorite, onFavorite, onReplace }: { recipe: Recipe; planned?: PlannedMeal; favorite: boolean; onFavorite: () => void; onReplace?: () => void }) {
  const [portions, setPortions] = useState(planned?.portions ?? 2);
  const [isFavorite, setIsFavorite] = useState(favorite);
  const ingredients = scaleIngredients(recipe, portions);
  const catalogueRecipe = recipe.id.startsWith("catalog-") ? CATALOGUE_RECIPES.find((item) => item.id === recipe.id.slice("catalog-".length)) : undefined;
  const catalogueReview = catalogueRecipe ? reviewFor(catalogueRecipe) : undefined;
  const toggle = () => { setIsFavorite((value) => !value); onFavorite(); };
  return <MobileScroll className="app-screen"><main className="recipe-page pushed-page"><img className="recipe-hero" src={recipe.image} alt={recipe.title} /><div className="recipe-content"><span className="eyebrow">{planned ? MEAL_LABELS[planned.mealType] : recipe.mealTypes.map((type) => MEAL_LABELS[type]).join(" · ")}</span><h1>{recipe.title}</h1><div className="recipe-meta"><span><ClockIcon /> {recipe.prepMinutes} min</span><span><PersonIcon /> {portions} portions</span><span>{recipe.diet.includes("vegetarian") ? "Végétarien" : "Classique"}</span></div><p className="recipe-intro">{recipe.description}</p><div className={`recipe-actions ${onReplace ? "" : "recipe-actions--single"}`}>{onReplace ? <button className="secondary-button" onClick={onReplace}><ReloadIcon /> Remplacer</button> : null}<button className={`secondary-button ${isFavorite ? "is-favorite" : ""}`} onClick={toggle}>{isFavorite ? <HeartFilledIcon /> : <HeartIcon />}{isFavorite ? "Enregistrée" : "Ajouter"}</button></div>
    <AllergenNotice allergens={recipe.allergens} />
    {catalogueReview?.caution ? <aside className="catalogue-caution"><strong>Repère important</strong><p>{catalogueReview.caution}</p></aside> : null}
    <section className="recipe-section"><div className="section-heading"><h2>Ingrédients</h2><div className="stepper portions-stepper"><button type="button" onClick={() => setPortions((value) => Math.max(1, value - 1))}><MinusIcon /></button><b>{portions}</b><button type="button" onClick={() => setPortions((value) => Math.min(8, value + 1))}><PlusIcon /></button></div></div><ul className="ingredient-list">{ingredients.map((item) => <li key={`${item.id}-${item.unit}`}><CheckCircledIcon /><span><strong>{displayQuantity(item.quantity, item.unit)}</strong> {item.name}</span></li>)}</ul></section>
    <section className="recipe-section nutrition-section"><h2>Repères par portion</h2><div><span><strong>{recipe.nutrition.calories}</strong> kcal</span><span><strong>{recipe.nutrition.protein}</strong> g protéines</span><span><strong>{recipe.nutrition.fiber}</strong> g fibres</span></div><small>{recipe.nutrition.note}</small></section>
    <section className="recipe-section"><h2>Préparation</h2><ol className="steps">{recipe.steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol></section><aside className="conservation-note"><ClockIcon /><span><strong>Conservation</strong>{recipe.conservation}</span></aside>
  </div></main></MobileScroll>;
}

function CatalogueRecipeView({ recipe }: { recipe: CatalogueRecipe }) {
  const [portions, setPortions] = useState(recipe.portions);
  const review = reviewFor(recipe);
  const ratio = portions / Math.max(1, recipe.portions);
  return <MobileScroll className="app-screen"><main className="catalogue-detail pushed-page">
    <div className="catalogue-detail__hero"><img src={catalogueImageFor(recipe)} alt={recipe.image.alt || recipe.titre} /><div className="catalogue-detail__hero-copy"><span>{catalogueCategoryName(recipe.categorie)}</span><h1>{recipe.titre}</h1><small>{recipe.temps.total} min · {recipe.difficulte} · {recipe.cout}</small></div></div>
    <div className="recipe-content">
      <div className={`catalogue-verdict is-${review.status}`}><span>{review.status === "validated" ? "Profil cohérent" : "Validée avec repères"}</span><p>{review.summary}</p></div>
      {review.caution ? <aside className="catalogue-caution"><strong>À savoir</strong><p>{review.caution}</p></aside> : null}
      <AllergenNotice allergens={recipe.app.planner.allergens} />
      <p className="catalogue-disclaimer">Cette appréciation concerne la composition globale de la recette. Elle ne prouve pas qu'un ingrédient isolé prévient ou traite une inflammation.</p>
      <section className="recipe-section"><div className="section-heading"><h2>Ingrédients</h2><div className="stepper portions-stepper"><button type="button" aria-label="Retirer une portion" onClick={() => setPortions((value) => Math.max(1, value - 1))}><MinusIcon /></button><b>{portions}</b><button type="button" aria-label="Ajouter une portion" onClick={() => setPortions((value) => Math.min(8, value + 1))}><PlusIcon /></button></div></div><ul className="ingredient-list">{recipe.ingredients.map((item) => <li key={`${item.nom}-${item.unite}`}><CheckCircledIcon /><span><strong>{displayCatalogueQuantity(item.quantite * ratio, item.unite)}</strong> {item.nom}{item.note ? <small>{item.note}</small> : null}</span></li>)}</ul></section>
      <section className="recipe-section nutrition-section"><h2>Estimations par portion</h2><div><span><strong>{recipe.nutrition_par_portion.calories}</strong> kcal</span><span><strong>{recipe.nutrition_par_portion.proteines_g}</strong> g protéines</span><span><strong>{recipe.nutrition_par_portion.fibres_g}</strong> g fibres</span></div><small>Valeurs estimatives à titre indicatif; elles varient selon les produits et la préparation.</small></section>
      <section className="recipe-section"><h2>Repères présents</h2><div className="compound-list">{recipe.composes_actifs.map((item) => <span key={`${item.aliment}-${item.compose}`}><strong>{item.aliment}</strong><small>{item.compose}</small></span>)}</div><p className="catalogue-disclaimer">Ces composés sont documentés dans les aliments, mais leur présence ne garantit pas un bénéfice clinique individuel.</p></section>
      <section className="recipe-section"><h2>Préparation</h2><ol className="steps">{recipe.etapes.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol></section>
      {recipe.substitutions.length ? <section className="recipe-section"><h2>Substitutions</h2><div className="substitution-list">{recipe.substitutions.map((item) => <p key={`${item.remplacer}-${item.par}`}><strong>{item.remplacer}</strong><ChevronRightIcon /><span>{item.par}<small>{item.note}</small></span></p>)}</div></section> : null}
      <aside className="conservation-note"><ClockIcon /><span><strong>Conservation</strong>{recipe.conservation}</span></aside>
      <p className="catalogue-legal">{CATALOGUE.meta.avertissement}</p>
    </div>
  </main></MobileScroll>;
}

function ReplaceView({ plan, current, profile, onConfirm }: { plan: WeeklyPlan; current: PlannedMeal; profile: UserProfile; onConfirm: (recipe: Recipe) => void }) {
  const [reason, setReason] = useState("Plus rapide");
  const candidates = getReplacementCandidates(plan, current.id, RECIPES, profile, reason).slice(0, 5);
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null);
  useEffect(() => { setSelectedId(candidates[0]?.id ?? null); }, [reason]);
  const selected = candidates.find((recipe) => recipe.id === selectedId);
  const currentRecipe = recipeById.get(current.recipeId);
  return <MobileScroll className="app-screen"><main className="page-content pushed-page replace-page"><div className="page-heading"><span className="eyebrow">À la place de</span><h1>{currentRecipe?.title}</h1><p>Les allergies, le régime et le temps maximum restent strictement respectés.</p></div><Carousel ariaLabel="Motif du remplacement" className="reason-carousel" contentClassName="reason-carousel__track">{["Plus rapide", "Moins cher", "Végétarien", "Autres ingrédients"].map((item) => <button className={`reason-chip ${reason === item ? "is-selected" : ""}`} key={item} onClick={() => setReason(item)}>{item}</button>)}</Carousel><div className="replacement-list">{candidates.map((recipe) => <button key={recipe.id} className={`replacement-card ${selectedId === recipe.id ? "is-selected" : ""}`} onClick={() => setSelectedId(recipe.id)}><img src={recipe.image} alt="" /><span><small>{recipe.prepMinutes} min · {recipe.costPerPortion.toFixed(2).replace(".", ",")} €/portion</small><strong>{recipe.title}</strong><em>{recipe.description}</em></span><i>{selectedId === recipe.id ? <CheckIcon /> : null}</i></button>)}</div>{selected ? <button className="primary-button full-button" onClick={() => onConfirm(selected)}>Choisir ce repas</button> : <p className="notice-banner">Aucune alternative compatible avec ces critères.</p>}</main></MobileScroll>;
}

function AppShell({ flow }: { flow: FlowControls }) {
  const [tab, setTab] = useState<TabId>("home");
  const [appState, setAppState] = useState<AppState>(DEFAULT_APP_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void loadAppState().then((stored) => {
      if (!active) return;
      const validFavorites = stored.favoriteRecipeIds.filter((id) => recipeById.has(id));
      setAppState({ ...stored, favoriteRecipeIds: validFavorites });
      setHydrated(true);
    });
    void registerOfflineSupport();
    return () => { active = false; };
  }, []);

  useEffect(() => { if (hydrated) void saveAppState(appState); }, [appState, hydrated]);

  const toggleFavorite = (id: string) => setAppState((current) => ({ ...current, favoriteRecipeIds: current.favoriteRecipeIds.includes(id) ? current.favoriteRecipeIds.filter((entry) => entry !== id) : [...current.favoriteRecipeIds, id] }));
  const toggleChecked = (id: string) => setAppState((current) => ({ ...current, checkedShoppingItemIds: current.checkedShoppingItemIds.includes(id) ? current.checkedShoppingItemIds.filter((entry) => entry !== id) : [...current.checkedShoppingItemIds, id] }));
  const togglePantry = (id: string) => setAppState((current) => ({ ...current, pantryIngredientIds: current.pantryIngredientIds.includes(id) ? current.pantryIngredientIds.filter((entry) => entry !== id) : [...current.pantryIngredientIds, id] }));

  function createPlan(): WeeklyPlan {
    const plan = makePlan(appState.profile);
    setAppState((current) => ({ ...current, currentPlan: plan, history: current.currentPlan ? [current.currentPlan, ...current.history].slice(0, 12) : current.history, checkedShoppingItemIds: [] }));
    return plan;
  }

  function replacementScreen(planned: PlannedMeal, plan: WeeklyPlan): FlowScreen {
    return { id: `replace-${planned.id}`, title: "Remplacer le repas", headerHeight: 56, header: (route) => <Header title="Remplacer" onBack={route.pop} action={<Cross2Icon />} />, render: (route) => <ReplaceView plan={plan} current={planned} profile={appState.profile} onConfirm={(recipe) => {
      const updatedPlan = replacePlannedMeal(plan, planned.id, recipe, RECIPES);
      const updatedMeal = updatedPlan.meals.find((meal) => meal.id === planned.id) ?? planned;
      setAppState((current) => ({ ...current, currentPlan: updatedPlan, checkedShoppingItemIds: [] }));
      route.replace(recipeScreen(recipe, updatedMeal, updatedPlan));
    }} /> };
  }

  function recipeScreen(recipe: Recipe, planned?: PlannedMeal, planOverride?: WeeklyPlan): FlowScreen {
    const routePlan = planOverride ?? appState.currentPlan;
    return { id: `recipe-${planned?.id ?? recipe.id}`, title: recipe.title, headerHeight: 56, header: (route) => <Header title="Recette" onBack={route.pop} />, render: (route) => <RecipeView recipe={recipe} planned={planned} favorite={appState.favoriteRecipeIds.includes(recipe.id)} onFavorite={() => toggleFavorite(recipe.id)} onReplace={planned && routePlan ? () => route.replace(replacementScreen(planned, routePlan)) : undefined} /> };
  }

  function catalogueRecipeScreen(recipe: CatalogueRecipe): FlowScreen {
    return { id: `catalogue-${recipe.id}`, title: recipe.titre, headerHeight: 56, header: (route) => <Header title="Recette vérifiée" onBack={route.pop} />, render: () => <CatalogueRecipeView recipe={recipe} /> };
  }

  const informationScreen = (): FlowScreen => ({ id: "information", title: "Informations", headerHeight: 56, header: (route) => <Header title="Informations" onBack={route.pop} />, render: () => <InformationView /> });
  const openProfile = () => flow.push({ id: "profile", title: "Profil alimentaire", headerHeight: 56, header: (route) => <Header title="Mon profil" onBack={route.pop} />, render: (route) => <ProfileView initial={appState.profile} onOpenInformation={() => route.push(informationScreen())} onSave={(profile) => { setAppState((current) => ({ ...current, profile })); route.pop(); }} /> });
  const openGenerate = () => flow.push({ id: "generate", title: "Générer ma semaine", headerHeight: 56, header: (route) => <Header title="Nouvelle semaine" onBack={route.pop} />, render: (route) => <GenerateView profile={appState.profile} onCreate={createPlan} onComplete={() => { setTab("week"); route.pop(); }} /> });
  const openMeal = (planned: PlannedMeal, recipe: Recipe) => flow.push(recipeScreen(recipe, planned));
  const openReplace = (planned: PlannedMeal, recipe: Recipe) => appState.currentPlan && flow.push(replacementScreen(planned, appState.currentPlan));
  const currentView = useMemo(() => {
    if (tab === "week") return <WeekView plan={appState.currentPlan} onOpenMeal={openMeal} onReplace={openReplace} />;
    if (tab === "courses") return <CoursesView plan={appState.currentPlan} profile={appState.profile} checkedIds={appState.checkedShoppingItemIds} pantryIds={appState.pantryIngredientIds} onToggleChecked={toggleChecked} onTogglePantry={togglePantry} />;
    if (tab === "favorites") return <FavoritesView favoriteIds={appState.favoriteRecipeIds} history={appState.history} onOpenRecipe={(recipe) => flow.push(recipeScreen(recipe))} onOpenCatalogue={(recipe) => flow.push(catalogueRecipeScreen(recipe))} />;
    return <HomeView profile={appState.profile} plan={appState.currentPlan} onGenerate={openGenerate} onProfile={openProfile} onOpenMeal={openMeal} onOpenWeek={() => setTab("week")} />;
  }, [tab, appState]);

  return <div className="app-shell"><MobileScroll className="app-screen"><div className="root-scroll-content">{!hydrated ? <div className="app-loading"><ReloadIcon className="spin" /><span>Chargement local…</span></div> : currentView}</div></MobileScroll><BottomNav active={tab} onChange={setTab} /></div>;
}

export default function Prototype() {
  const initial = useMemo<FlowScreen>(() => ({ id: "root", render: (flow) => <AppShell flow={flow} /> }), []);
  return <FlowStack initial={initial} />;
}
