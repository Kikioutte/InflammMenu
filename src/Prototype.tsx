import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type SyntheticEvent } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  DotsHorizontalIcon,
  Cross2Icon,
  DownloadIcon,
  HeartFilledIcon,
  HeartIcon,
  HomeIcon,
  LockClosedIcon,
  LockOpen1Icon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  MinusIcon,
  PersonIcon,
  PlusIcon,
  ReloadIcon,
  Share2Icon,
  SunIcon,
  MoonIcon,
} from "@radix-ui/react-icons";
import {
  BottomSheet,
  Carousel,
  FlowStack,
  KeyboardInput,
  KeyboardTextarea,
  MobileScroll,
  useKeyboard,
  type FlowControls,
  type FlowScreen,
} from "./mobile";
import {
  buildShoppingList,
  formatShoppingListText,
  generateWeeklyPlan,
  getReplacementCandidates,
  advancePrepFor,
  assignRecipeToSlot,
  assignableSlots,
  leftoverCandidates,
  planLeftover,
  reconcileCheckedItems,
  setMealPortions,
  setMealSkipped,
  swapPlannedMeals,
  weeklyTargetsOf,
  MAX_WEEKLY_TARGET,
  MAX_MEAL_PORTIONS,
  MIN_MEAL_PORTIONS,
  cookingSessionsOf,
  inspectPlanReplay,
  isPlanExpired,
  planDayOffset,
  mealCost,
  mealsToStartTonight,
  planToCalendar,
  planProgress,
  recipeAllergens,
  preservableLockedMeals,
  replacePlannedMeal,
  restorePlan,
  scaleIngredients,
  setPlannedMealCompleted,
  setPlannedMealLock,
  summarizePlan,
  type AdvancePrep,
  type PlanSlot,
  type PlanSummary,
} from "./engine";
import {
  DEFAULT_PROFILE,
  type DietMode,
  type Equipment,
  type IngredientCategory,
  type IngredientUnit,
  type MealType,
  type PantryAmount,
  type PlannedMeal,
  type Recipe,
  type UserProfile,
  type WeeklyPlan,
} from "./domain";
import { RECIPES } from "./recipes";
import { canonicalIngredientId, storedShoppingItemMatches } from "./shopping.ts";
import {
  CATALOGUE_CATEGORIES,
  CATALOGUE_SUMMARY,
  DUPLICATE_CATALOGUE_RECIPES,
  catalogueImageFor,
  catalogueCategoryName,
  catalogueFavoriteId,
  catalogueRecipeIdOf,
  filterCatalogueRecipes,
  loadCatalogue,
  plannerAvailabilityFor,
  reviewFor,
  visibleCatalogueRecipes,
  EMPTY_CATALOGUE_FILTERS,
  type CatalogueData,
  type CatalogueFilters,
  type CatalogueRecipe,
} from "./catalog";
import {
  DEFAULT_APP_STATE,
  HISTORY_LIMIT,
  exportAppState,
  importAppState,
  loadAppState,
  registerOfflineSupport,
  saveAppState,
  watchForAppUpdate,
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
const RECIPE_IMAGE_PLACEHOLDER = "/assets/recipe-placeholder.svg";

function handleRecipeImageError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = RECIPE_IMAGE_PLACEHOLDER;
}
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
/**
 * Recipes the app plans with: the reviewed catalogue plus the user's own
 * variants. AppShell refreshes this registry whenever custom recipes change, so
 * every screen and every engine call sees the same set.
 */
let ACTIVE_RECIPES: readonly Recipe[] = RECIPES;
const recipeById = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

function useRecipeRegistry(customRecipes: readonly Recipe[]): readonly Recipe[] {
  return useMemo(() => {
    ACTIVE_RECIPES = customRecipes.length ? [...RECIPES, ...customRecipes] : RECIPES;
    recipeById.clear();
    for (const recipe of ACTIVE_RECIPES) recipeById.set(recipe.id, recipe);
    return ACTIVE_RECIPES;
  }, [customRecipes]);
}
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

/**
 * Format a duration for people rather than machines.
 * Long catalogue durations can include soaking, chilling or fermentation;
 * displaying them as raw minutes (e.g. 10 110 min) is difficult to scan.
 */
export function formatRecipeDuration(minutes: number): string {
  const value = Math.max(0, Math.round(minutes));
  if (value < 60) return `${value} min`;

  const days = Math.floor(value / 1_440);
  const remainderAfterDays = value % 1_440;
  const hours = Math.floor(remainderAfterDays / 60);
  const remainderMinutes = remainderAfterDays % 60;

  if (days > 0) {
    return `${days} j${hours ? ` ${hours} h` : ""}${remainderMinutes ? ` ${remainderMinutes} min` : ""}`;
  }
  return `${hours} h${remainderMinutes ? ` ${remainderMinutes} min` : ""}`;
}

export type CataloguePassiveDurationLabel = "Fermentation" | "Infusion" | "Marinade" | "Repos";

function positiveDuration(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Selects the most useful name for a catalogue recipe's passive time. */
export function cataloguePassiveDurationLabel(recipe: CatalogueRecipe): CataloguePassiveDurationLabel {
  const context = normalizeText(`${recipe.titre} ${recipe.tags.join(" ")} ${recipe.etapes.join(" ")}`);
  if (context.includes("ferment")) return "Fermentation";
  if (context.includes("infus")) return "Infusion";
  if (context.includes("marin")) return "Marinade";
  return "Repos";
}

function cataloguePreparationMinutes(recipe: CatalogueRecipe): number | null {
  return positiveDuration(recipe.temps.preparation) ?? positiveDuration(recipe.app.planner.active_minutes);
}

export function formatCatalogueCardDuration(recipe: CatalogueRecipe): string {
  const preparation = cataloguePreparationMinutes(recipe);
  const cooking = positiveDuration(recipe.temps.cuisson);
  const passive = positiveDuration(recipe.temps.repos);
  const total = positiveDuration(recipe.temps.total);
  const parts: string[] = [];

  if (preparation) parts.push(`${formatRecipeDuration(preparation)} de préparation`);
  else if (cooking) parts.push(`${formatRecipeDuration(cooking)} de cuisson`);

  if (passive) {
    const label = cataloguePassiveDurationLabel(recipe).toLocaleLowerCase("fr-FR");
    const preposition = label === "infusion" ? "d’" : "de ";
    parts.push(`${formatRecipeDuration(passive)} ${preposition}${label}`);
  }

  return parts.join(" · ") || (total ? `${formatRecipeDuration(total)} au total` : "Durée non renseignée");
}

export function catalogueDurationItems(recipe: CatalogueRecipe): Array<{ label: string; minutes: number }> {
  const items: Array<{ label: string; minutes: number }> = [];
  const preparation = cataloguePreparationMinutes(recipe);
  const cooking = positiveDuration(recipe.temps.cuisson);
  const passive = positiveDuration(recipe.temps.repos);
  const total = positiveDuration(recipe.temps.total);

  if (preparation) items.push({ label: "Préparation", minutes: preparation });
  if (cooking) items.push({ label: "Cuisson", minutes: cooking });
  if (passive) items.push({ label: cataloguePassiveDurationLabel(recipe), minutes: passive });
  if (total) items.push({ label: "Total", minutes: total });
  return items;
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

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Offline banner and install invitation. The service worker already precaches
 * the app; this only surfaces what the browser exposes, never fakes it.
 */
function useInstallAndConnectivity() {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => watchForAppUpdate(() => setUpdateReady(true)), []);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => { setInstalled(true); setInstallPrompt(null); };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  return {
    offline,
    canInstall: Boolean(installPrompt) && !installed,
    install,
    updateReady,
    reload: () => window.location.reload(),
  };
}

/** Clipboard API first, then the legacy selection copy used by older WebKit. */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback below.
  }

  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function downloadTextFile(fileName: string, text: string, type = "text/plain;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makePlan(profile: UserProfile, lockedMeals: readonly PlannedMeal[] = [], favoriteRecipeIds: readonly string[] = [], seed: string | number = Date.now(), startsOn?: string): WeeklyPlan {
  const monday = startsOn ? dateAt(startsOn, 0) : mondayOf();
  return generateWeeklyPlan(ACTIVE_RECIPES, profile, {
    seed,
    startsOn: startsOn ?? isoDate(monday),
    generatedAt: new Date().toISOString(),
    season: [11, 0, 1].includes(monday.getMonth()) ? "winter" : [2, 3, 4].includes(monday.getMonth()) ? "spring" : [5, 6, 7].includes(monday.getMonth()) ? "summer" : "autumn",
    lockedMeals,
    favoriteRecipeIds,
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
  return <div className="wordmark" aria-label="Inflamm’Menu"><span>Inflamm’Menu</span><img src="/assets/olive-sprig.svg" alt="" /></div>;
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
  const cooked = planned.completed === true;
  return (
    <button type="button" className={`meal-preview ${cooked ? "is-cooked" : ""}`} data-completed={cooked ? "true" : "false"} onClick={onOpen}>
      <img src={recipe.image} alt="" onError={handleRecipeImageError} /><span className="meal-preview__icon" aria-hidden="true">{cooked ? <CheckCircledIcon /> : <MealIcon />}</span>
      <span className="meal-preview__copy"><strong>{recipe.title}</strong><small>{MEAL_LABELS[planned.mealType]} · {DAY_LABELS[planned.dayIndex]} {dateAt(startsOn, planned.dayIndex).getDate()}{cooked ? " · Cuisiné" : ""}</small></span>
      <ChevronRightIcon className="meal-preview__chevron" />
    </button>
  );
}

/** First run: the profile carries the allergies, so it comes before any menu. */
function OnboardingView({ profile, onOpenProfile, onSkip }: { profile: UserProfile; onOpenProfile: () => void; onSkip: () => void }) {
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

function HomeView({ profile, plan, archivedWeek, upcomingPlan, onGenerate, onProfile, onOpenMeal, onOpenWeek }: {
  profile: UserProfile;
  plan: WeeklyPlan | null;
  archivedWeek?: WeeklyPlan | null;
  upcomingPlan?: WeeklyPlan | null;
  onGenerate: () => void;
  onProfile: () => void;
  onOpenMeal: (planned: PlannedMeal, recipe: Recipe) => void;
  onOpenWeek: () => void;
}) {
  const todayIndex = plan ? currentDayIndex(plan.startsOn) : 0;
  const todayMeals = plan?.meals.filter((meal) => meal.dayIndex === todayIndex) ?? [];
  const tomorrowStarters = (plan && todayIndex < 6 ? plan.meals.filter((meal) => meal.dayIndex === todayIndex + 1) : [])
    .map((meal) => ({ meal, recipe: recipeById.get(meal.recipeId) }))
    .filter((entry): entry is { meal: PlannedMeal; recipe: Recipe } => Boolean(entry.recipe))
    .filter((entry) => advancePrepFor(entry.recipe)?.level === "day-before");
  const firstName = profile.firstName.trim();
  return (
    <main className="home-view" data-testid="home-view">
      <section className="home-hero">
        <img className="home-hero__image" src="/assets/inflamm-hero-bowl.jpg" alt="Bowl de quinoa, pois chiches et légumes rôtis" />
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
        {upcomingPlan ? <p className="locked-banner expired-banner" data-testid="upcoming-banner"><CalendarIcon /> Semaine du {formatWeekRange(upcomingPlan.startsOn)} déjà préparée : elle prendra le relais automatiquement.</p> : null}
        {archivedWeek && !plan ? <p className="notice-banner expired-banner" data-testid="expired-banner">Votre semaine du {formatWeekRange(archivedWeek.startsOn)} est terminée : elle a rejoint l’historique. Générez la suivante quand vous le souhaitez.</p> : null}
        {tomorrowStarters.length ? <div className="tonight-note" data-testid="tonight-note"><ClockIcon /><span><strong>À lancer ce soir pour demain</strong>{tomorrowStarters.map(({ meal, recipe }) => `${recipe.title} (${formatRecipeDuration(recipe.restMinutes ?? 0)} de repos, ${MEAL_LABELS[meal.mealType].toLocaleLowerCase("fr-FR")})`).join(" · ")}</span></div> : null}
        {plan ? <><WeekStrip startsOn={plan.startsOn} selected={todayIndex} compact /><div className="meal-list">
          {todayMeals.map((planned) => { const recipe = recipeById.get(planned.recipeId); return recipe ? <MealPreview key={planned.id} planned={planned} recipe={recipe} startsOn={plan.startsOn} onOpen={() => onOpenMeal(planned, recipe)} /> : null; })}
        </div></> : <div className="empty-preview"><CalendarIcon /><p>Créez votre premier menu directement sur cet appareil.</p></div>}
        <button className="profile-link" type="button" onClick={onProfile}><PersonIcon /><span>Ajuster mon profil</span><ChevronRightIcon /></button>
      </section>
    </main>
  );
}

function formatEuros(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function allergenLabel(allergen: string): string {
  return ALLERGEN_LABELS[allergen] ?? allergen.replaceAll("-", " ");
}

const PLANNER_EXCLUSION_TEXT: Record<string, { badge: string; title: string; body: string }> = {
  "side-dish": {
    badge: "Recette d’appoint",
    title: "Hors menus hebdomadaires",
    body: "Accompagnements, boissons, desserts, snacks et sauces complètent un repas sans en constituer un. Ils restent consultables et cuisinables à la demande, mais n’entrent pas dans la génération de la semaine.",
  },
  editorial: {
    badge: "Hors planificateur",
    title: "Écartée du planificateur par la relecture",
    body: "La relecture éditoriale a maintenu cette recette hors des menus générés, par exemple pour un sodium élevé, une interaction connue ou une précaution à vérifier. Elle reste consultable avec ses repères.",
  },
};

function advanceHeadline(prep: AdvancePrep): string {
  return prep.level === "day-before" ? "À lancer la veille" : "Repos à prévoir";
}

/** Estimated cost and declared allergens, read before opening the recipe. */
function MealFacts({ recipe, portions }: { recipe: Recipe; portions: number }) {
  const allergens = recipeAllergens(recipe);
  const cost = mealCost(recipe, portions);
  const advance = advancePrepFor(recipe);
  return (
    <span className="meal-facts" data-testid={`meal-facts-${recipe.id}`}>
      <span className="meal-facts__cost">{formatEuros(cost)} estimés</span>
      {advance ? <span className="meal-facts__advance">{advanceHeadline(advance)} · {formatRecipeDuration(advance.minutes)}</span> : null}
      {allergens.length
        ? allergens.map((allergen) => <span className="meal-facts__allergen" key={allergen}>{allergenLabel(allergen)}</span>)
        : <span className="meal-facts__clear">Aucun allergène déclaré</span>}
    </span>
  );
}

function WeekView({ plan, onOpenMeal, onReplace, onToggleLock, onToggleCompleted, onPlanLeftover, onToggleSkipped, onSwap }: { plan: WeeklyPlan | null; onOpenMeal: (planned: PlannedMeal, recipe: Recipe) => void; onReplace: (planned: PlannedMeal, recipe: Recipe) => void; onToggleLock: (planned: PlannedMeal) => void; onToggleCompleted: (planned: PlannedMeal) => void; onPlanLeftover: (planned: PlannedMeal, recipe: Recipe) => void; onToggleSkipped: (planned: PlannedMeal) => void; onSwap: (planned: PlannedMeal) => void }) {
  const [selectedDay, setSelectedDay] = useState(plan ? currentDayIndex(plan.startsOn) : 0);
  const [layout, setLayout] = useState<"day" | "week">("day");
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  if (!plan) return <EmptyRoot icon={CalendarIcon} title="Aucune semaine pour le moment" body="Commencez depuis l’accueil pour générer vos repas." />;
  const summary = summarizePlan(plan, ACTIVE_RECIPES);
  const visibleMeals = plan.meals.filter((meal) => meal.dayIndex === selectedDay);
  const selectedDate = dateAt(plan.startsOn, selectedDay);
  const lockedCount = plan.meals.filter((meal) => meal.locked).length;
  const progress = planProgress(plan);
  return (
    <main className="page-content week-page" data-testid="week-view">
      <div className="page-heading"><span className="eyebrow">{formatWeekRange(plan.startsOn)}</span><h1>Ma semaine</h1><p>Des repas variés, construits par des règles transparentes.</p></div>
      <div className="week-summary"><div><strong>{summary.mealCount}</strong><span>repas</span></div><div><strong>{summary.estimatedCost.toFixed(0)} €</strong><span>estimés</span></div><div><strong>{summary.averagePrepMinutes.toFixed(0)} min</strong><span>actives en moyenne</span></div></div>
      {summary.cookingSessions < summary.mealCount ? <p className="locked-banner" data-testid="leftover-banner"><ArchiveIcon /> {summary.mealCount - summary.cookingSessions} repas servi{summary.mealCount - summary.cookingSessions > 1 ? "s" : ""} avec des restes : {summary.cookingSessions} sessions de cuisine.</p> : null}
      <div className="week-exports">
        <button type="button" className="secondary-button" data-testid="export-calendar" onClick={() => downloadTextFile(`inflamm-menu-${plan.startsOn}.ics`, planToCalendar(plan, ACTIVE_RECIPES), "text/calendar;charset=utf-8")}><CalendarIcon /> Calendrier</button>
        <button type="button" className="secondary-button" data-testid="print-week" onClick={() => window.print()}><CopyIcon /> Imprimer</button>
      </div>
      <div className="week-progress" data-testid="week-progress"><p><CheckCircledIcon /> {progress.completed} sur {progress.total} repas cuisinés</p><span className="week-progress__track"><i style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></span></div>
      {!summary.withinBudget ? <p className="notice-banner">Budget estimé dépassé : les autres critères ont été conservés.</p> : null}
      {lockedCount ? <p className="locked-banner" data-testid="locked-banner"><LockClosedIcon /> {lockedCount} repas conservé{lockedCount > 1 ? "s" : ""} lors de la prochaine génération.</p> : null}
      <div className="segmented-control layout-switch" role="group" aria-label="Affichage de la semaine">
        <button type="button" className={layout === "day" ? "is-selected" : ""} aria-pressed={layout === "day"} data-testid="layout-day" onClick={() => setLayout("day")}>Jour par jour</button>
        <button type="button" className={layout === "week" ? "is-selected" : ""} aria-pressed={layout === "week"} data-testid="layout-week" onClick={() => setLayout("week")}>Semaine entière</button>
      </div>
      {layout === "week" ? <WeekOverview plan={plan} onOpenMeal={onOpenMeal} onFocusDay={(index) => { setSelectedDay(index); setLayout("day"); }} /> : <>
      <Carousel ariaLabel="Choisir un jour" className="day-carousel" contentClassName="day-carousel__track">
        {DAY_LABELS.map((day, index) => <button key={day} type="button" className={`day-card ${selectedDay === index ? "is-selected" : ""}`} onClick={() => setSelectedDay(index)}><span>{day}</span><strong>{dateAt(plan.startsOn, index).getDate()}</strong></button>)}
      </Carousel>
      <section className="day-plan">
        <div className="section-heading"><div><span className="eyebrow">Jour {selectedDay + 1}</span><h2>{selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h2></div><CheckCircledIcon /></div>
        {visibleMeals.map((planned) => { const recipe = recipeById.get(planned.recipeId); if (!recipe) return null; const locked = planned.locked === true; const cooked = planned.completed === true; const skipped = planned.skipped === true; const leftoverSource = planned.leftoverOf ? plan.meals.find((meal) => meal.id === planned.leftoverOf) : undefined; const isLeftover = Boolean(planned.leftoverOf); return (
          <article className={`meal-card ${locked ? "is-locked" : ""} ${cooked ? "is-cooked" : ""} ${isLeftover ? "is-leftover" : ""} ${skipped ? "is-skipped" : ""}`} key={planned.id} data-testid={`meal-card-${planned.id}`} data-locked={locked ? "true" : "false"} data-completed={cooked ? "true" : "false"} data-leftover={isLeftover ? "true" : "false"} data-skipped={skipped ? "true" : "false"}>
            <button type="button" className="meal-card__main" onClick={() => onOpenMeal(planned, recipe)}><img src={recipe.image} alt="" onError={handleRecipeImageError} /><span><small>{MEAL_LABELS[planned.mealType]}{skipped ? " · Hors foyer" : cooked ? " · Cuisiné" : ""}</small><strong>{recipe.title}</strong><em><ClockIcon /> {skipped ? "Repas pris à l’extérieur" : isLeftover ? `Restes${leftoverSource ? ` de ${DAY_LABELS[leftoverSource.dayIndex].toLocaleLowerCase("fr-FR")}` : ""} · rien à cuisiner` : `${formatRecipeDuration(recipe.prepMinutes)} actives`}{skipped ? "" : ` · ${planned.portions} portions`}</em>{skipped ? null : <MealFacts recipe={recipe} portions={planned.portions} />}</span></button>
            {skipped ? null : <button type="button" className={`meal-card__done ${cooked ? "is-active" : ""}`} aria-pressed={cooked} data-testid={`meal-done-${planned.id}`} aria-label={cooked ? `Annuler « cuisiné » pour ${recipe.title}` : `Marquer ${recipe.title} comme cuisiné`} onClick={() => onToggleCompleted(planned)}><CheckIcon /></button>}
            <div className="meal-card__actions meal-card__actions--pair">
              <button className="meal-card__replace" type="button" disabled={skipped} onClick={() => onReplace(planned, recipe)}><ReloadIcon /> Remplacer</button>
              <button className="meal-card__more" type="button" data-testid={`meal-actions-${planned.id}`} aria-label={`Autres actions pour ${recipe.title}`} onClick={() => setActionsFor(planned.id)}><DotsHorizontalIcon /> Actions</button>
            </div>
          </article>
        ); })}
      </section>
      </>}
      <CookingPlanSection plan={plan} />
      <WeekBalance summary={summary} profile={plan.profileSnapshot} />
      <MealActionsSheet plan={plan} slotId={actionsFor} onClose={() => setActionsFor(null)} onReplace={onReplace} onToggleLock={onToggleLock} onToggleCompleted={onToggleCompleted} onPlanLeftover={onPlanLeftover} onToggleSkipped={onToggleSkipped} onSwap={onSwap} />
    </main>
  );
}

/** Seven days at a glance, to plan the week rather than browse it day by day. */
function WeekOverview({ plan, onOpenMeal, onFocusDay }: { plan: WeeklyPlan; onOpenMeal: (planned: PlannedMeal, recipe: Recipe) => void; onFocusDay: (dayIndex: number) => void }) {
  const today = currentDayIndex(plan.startsOn);
  return (
    <section className="week-overview" data-testid="week-overview" aria-label="Vue de la semaine entière">
      {DAY_LABELS.map((day, dayIndex) => {
        const meals = plan.meals.filter((meal) => meal.dayIndex === dayIndex);
        return (
          <article className={`week-overview__day ${dayIndex === today ? "is-today" : ""}`} key={day}>
            <button type="button" className="week-overview__heading" onClick={() => onFocusDay(dayIndex)}>
              <strong>{day}</strong><span>{dateAt(plan.startsOn, dayIndex).getDate()}</span>
            </button>
            <div className="week-overview__meals">
              {meals.map((meal) => { const recipe = recipeById.get(meal.recipeId); return (
                <button type="button" key={meal.id} className={`week-overview__meal ${meal.completed ? "is-cooked" : ""} ${meal.skipped ? "is-skipped" : ""}`} data-testid={`overview-${meal.id}`} disabled={!recipe} onClick={() => recipe && onOpenMeal(meal, recipe)}>
                  <small>{MEAL_LABELS[meal.mealType].slice(0, 4)}.</small>
                  <span>{meal.skipped ? "Hors foyer" : recipe?.title ?? "Indisponible"}</span>
                  {meal.leftoverOf ? <i aria-label="Restes"><ArchiveIcon /></i> : null}
                  {meal.locked ? <i aria-label="Conservé"><LockClosedIcon /></i> : null}
                </button>
              ); })}
            </div>
          </article>
        );
      })}
    </section>
  );
}

/** What has to be cooked, grouped by day, so a batch session can be planned. */
function CookingPlanSection({ plan }: { plan: WeeklyPlan }) {
  const sessions = cookingSessionsOf(plan, ACTIVE_RECIPES);
  if (!sessions.length) return null;
  return (
    <section className="cooking-plan" data-testid="cooking-plan" aria-label="Sessions de cuisine">
      <div className="section-heading"><div><span className="eyebrow">Préparation</span><h2>Ce qu’il y a à cuisiner</h2></div></div>
      <ul>
        {sessions.map((session) => (
          <li key={session.dayIndex}>
            <span><strong>{DAY_LABELS[session.dayIndex]} {dateAt(plan.startsOn, session.dayIndex).getDate()}</strong><small>{session.meals.length} plat{session.meals.length > 1 ? "s" : ""}{session.servesLater ? ` · nourrit ${session.servesLater} repas de plus` : ""}</small></span>
            <b>{formatRecipeDuration(session.activeMinutes)}</b>
          </li>
        ))}
      </ul>
      <p className="catalogue-disclaimer">Temps actifs cumulés, hors repos et cuisson non surveillée. Les repas de restes et les repas hors foyer n’y figurent pas.</p>
    </section>
  );
}

function MealActionsSheet({ plan, slotId, onClose, onReplace, onToggleLock, onToggleCompleted, onPlanLeftover, onToggleSkipped, onSwap }: {
  plan: WeeklyPlan;
  slotId: string | null;
  onClose: () => void;
  onReplace: (planned: PlannedMeal, recipe: Recipe) => void;
  onToggleLock: (planned: PlannedMeal) => void;
  onToggleCompleted: (planned: PlannedMeal) => void;
  onPlanLeftover: (planned: PlannedMeal, recipe: Recipe) => void;
  onToggleSkipped: (planned: PlannedMeal) => void;
  onSwap: (planned: PlannedMeal) => void;
}) {
  const planned = plan.meals.find((meal) => meal.id === slotId);
  const recipe = planned ? recipeById.get(planned.recipeId) : undefined;
  const isLeftover = Boolean(planned?.leftoverOf);
  const hasLeftover = Boolean(planned && plan.meals.some((meal) => meal.leftoverOf === planned.id));
  const skipped = planned?.skipped === true;
  const run = (action: () => void) => { onClose(); action(); };
  return (
    <BottomSheet open={Boolean(planned && recipe)} onOpenChange={(open) => { if (!open) onClose(); }} title={recipe?.title ?? "Repas"} description={planned ? `${DAY_LABELS[planned.dayIndex]} · ${MEAL_LABELS[planned.mealType]}` : undefined}>
      {planned && recipe ? <div className="meal-actions" data-testid="meal-actions-sheet">
        <button type="button" data-testid="action-completed" disabled={skipped} onClick={() => run(() => onToggleCompleted(planned))}><CheckCircledIcon /> {planned.completed ? "Ne plus marquer comme cuisiné" : "Marquer comme cuisiné"}</button>
        <button type="button" data-testid="action-swap" disabled={skipped || isLeftover || hasLeftover} onClick={() => run(() => onSwap(planned))}><ReloadIcon /> Échanger avec un autre repas</button>
        <button type="button" data-testid="action-leftover" disabled={skipped || isLeftover || hasLeftover} onClick={() => run(() => onPlanLeftover(planned, recipe))}><ArchiveIcon /> {hasLeftover ? "Restes déjà prévus" : "Cuisiner en double"}</button>
        <button type="button" data-testid="action-lock" disabled={skipped || isLeftover} onClick={() => run(() => onToggleLock(planned))}>{planned.locked ? <LockClosedIcon /> : <LockOpen1Icon />} {planned.locked ? "Ne plus conserver" : "Conserver à la prochaine génération"}</button>
        <button type="button" data-testid="action-skip" onClick={() => run(() => onToggleSkipped(planned))}><Cross2Icon /> {skipped ? "Remettre ce repas au menu" : "Repas hors foyer"}</button>
        <button type="button" data-testid="action-replace" disabled={skipped} onClick={() => run(() => onReplace(planned, recipe))}><ReloadIcon /> Remplacer par une autre recette</button>
      </div> : null}
    </BottomSheet>
  );
}

/**
 * Weekly organisation markers. Deliberately framed as dietary-pattern habits
 * rather than a nutritional or medical assessment of the week.
 */
function WeekBalance({ summary, profile }: { summary: PlanSummary; profile: UserProfile }) {
  const targets = weeklyTargetsOf(profile);
  const rows: Array<{ label: string; value: number; target?: number; hint: string }> = [
    { label: "Repas avec légumineuses", value: summary.legumeMeals, target: targets.legumeMeals, hint: "Lentilles, pois chiches, haricots" },
    ...(profile.diet === "classic" ? [{ label: "Repas avec poisson", value: summary.fishMeals, target: targets.fishMeals, hint: "Dont poissons gras si possible" }] : []),
    { label: "Repas avec céréales complètes", value: summary.wholeGrainMeals, hint: "Riz complet, épeautre, sarrasin" },
    { label: "Repas avec noix ou graines", value: summary.nutOrSeedMeals, hint: "Sources de graisses insaturées" },
    { label: "Repas de saison", value: summary.seasonalMeals, hint: "Saison en cours ou toute l’année" },
  ];
  return (
    <section className="week-balance" data-testid="week-balance" aria-label="Bilan de la semaine">
      <div className="section-heading"><div><span className="eyebrow">Repères</span><h2>Bilan de la semaine</h2></div></div>
      <ul>
        {rows.map((row) => (
          <li key={row.label} className={row.target !== undefined ? (row.value >= row.target ? "is-met" : "is-below") : ""}>
            <span><strong>{row.label}</strong><small>{row.hint}</small></span>
            <b>{row.value}{row.target !== undefined ? <i> / {row.target} visés</i> : null}</b>
          </li>
        ))}
      </ul>
      <div className="week-balance__nutrition"><span><strong>{summary.averageCalories.toFixed(0)}</strong> kcal</span><span><strong>{summary.averageProtein.toFixed(0)}</strong> g protéines</span><span><strong>{summary.averageFiber.toFixed(0)}</strong> g fibres</span></div>
      <p className="catalogue-disclaimer">Moyennes estimatives par portion, à titre indicatif. Ces repères décrivent l’organisation de vos repas selon un modèle méditerranéen ; ils ne constituent ni une évaluation nutritionnelle ni un avis médical.</p>
    </section>
  );
}

function EmptyRoot({ icon: Icon, title, body }: { icon: IconType; title: string; body: string }) {
  return <main className="page-content empty-root"><Icon /><h1>{title}</h1><p>{body}</p></main>;
}

function CoursesView({ plan, profile, checkedIds, pantryIds, pantryAmounts, categoryOrder, spent, onToggleChecked, onTogglePantry, onSetPantryAmount, onMoveCategory, onSetSpent }: {
  plan: WeeklyPlan | null;
  profile: UserProfile;
  checkedIds: string[];
  pantryIds: string[];
  pantryAmounts: Record<string, PantryAmount>;
  categoryOrder: IngredientCategory[];
  spent?: number;
  onToggleChecked: (id: string) => void;
  onTogglePantry: (id: string) => void;
  onSetPantryAmount: (id: string, amount: PantryAmount | null) => void;
  onMoveCategory: (category: IngredientCategory, direction: -1 | 1) => void;
  onSetSpent: (amount: number | null) => void;
}) {
  const [pantryMode, setPantryMode] = useState(false);
  const [exportFeedback, setExportFeedback] = useState("");
  const feedbackTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  if (!plan) return <EmptyRoot icon={ArchiveIcon} title="Liste encore vide" body="Les ingrédients apparaîtront après la génération de votre semaine." />;
  const items = buildShoppingList(plan, ACTIVE_RECIPES, {
    checkedShoppingItemIds: checkedIds,
    pantryIngredientIds: pantryIds,
    pantryAmounts,
  });
  const listText = formatShoppingListText(items, {
    week: formatWeekRange(plan.startsOn),
    people: profile.people,
    categoryLabels: CATEGORY_LABELS,
  });
  const listFileName = `liste-courses-${plan.startsOn}.txt`;
  const announce = (message: string) => {
    setExportFeedback(message);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setExportFeedback(""), 4000);
  };
  const share = async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: "Liste de courses", text: listText });
        return;
      }
      await copy();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      announce("Partage indisponible sur cet appareil.");
    }
  };
  const copy = async () => {
    if (await copyTextToClipboard(listText)) announce("Liste copiée dans le presse-papiers.");
    else announce("Copie impossible : utilisez le téléchargement.");
  };
  const download = () => {
    try {
      downloadTextFile(listFileName, listText);
      announce("Liste téléchargée.");
    } catch {
      announce("Téléchargement impossible sur cet appareil.");
    }
  };
  const groups = categoryOrder
    .map((category) => ({ category, label: CATEGORY_LABELS[category], items: items.filter((item) => item.category === category) }))
    .filter((group) => group.items.length);
  const checkedCount = items.filter((item) => item.checked || item.inPantry).length;
  return (
    <main className="page-content courses-page" data-testid="courses-view">
      <div className="page-heading"><span className="eyebrow">Semaine du {formatWeekRange(plan.startsOn)}</span><h1>Liste de courses</h1><p>{checkedCount} sur {items.length} articles retirés ou cochés</p></div>
      <div className="shopping-progress"><span style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }} /></div>
      <div className="courses-actions">
        <button className="secondary-button" type="button" data-testid="share-list" onClick={() => void share()}><Share2Icon /> Partager</button>
        <button className="secondary-button" type="button" data-testid="copy-list" onClick={() => void copy()}><CopyIcon /> Copier</button>
        <button className="secondary-button" type="button" data-testid="download-list" onClick={download}><DownloadIcon /> Fichier</button>
      </div>
      <p className="export-feedback" role="status" aria-live="polite" data-testid="export-feedback">{exportFeedback}</p>
      <button className={`secondary-button pantry-button ${pantryMode ? "is-active" : ""}`} type="button" onClick={() => setPantryMode((value) => !value)}><CheckIcon /> {pantryMode ? "Terminer l’inventaire" : "Retirer ce que j’ai déjà"}</button>
      {pantryMode ? <p className="inline-help">Touchez « J’ai déjà » pour retirer un ingrédient, ou saisissez la quantité en stock pour ne racheter que le complément. Les flèches réordonnent les rayons selon votre magasin.</p> : null}
      <section className="spend-tracker" data-testid="spend-tracker">
        <div><strong>Budget de la semaine</strong><small>{plan.estimatedCost.toFixed(0)} € estimés{typeof spent === "number" ? ` · ${spent.toFixed(2).replace(".", ",")} € dépensés` : ""}</small></div>
        <label className="text-field"><span className="sr-only">Montant réellement dépensé</span><KeyboardInput inputMode="decimal" placeholder="Montant réel" data-testid="spend-input" value={typeof spent === "number" ? String(spent) : ""} onChange={(event) => {
          const amount = Number(event.target.value.replace(",", "."));
          onSetSpent(event.target.value.trim() && Number.isFinite(amount) && amount >= 0 ? amount : null);
        }} /></label>
        {typeof spent === "number" ? <p className={`spend-delta ${spent > plan.estimatedCost ? "is-over" : "is-under"}`}>{spent > plan.estimatedCost ? `${(spent - plan.estimatedCost).toFixed(2).replace(".", ",")} € au-dessus de l’estimation` : `${(plan.estimatedCost - spent).toFixed(2).replace(".", ",")} € sous l’estimation`}</p> : null}
        <p className="catalogue-disclaimer">Les prix affichés restent des estimations ; ce montant vous permet de mesurer l’écart réel.</p>
      </section>
      <div className="shopping-groups">{groups.map((group, groupIndex) => <section key={group.category} className="shopping-group"><h2>{group.label}<span>{group.items.length}</span>{pantryMode ? <span className="aisle-order"><button type="button" aria-label={`Monter le rayon ${group.label}`} disabled={groupIndex === 0} data-testid={`aisle-up-${group.category}`} onClick={() => onMoveCategory(group.category, -1)}>↑</button><button type="button" aria-label={`Descendre le rayon ${group.label}`} disabled={groupIndex === groups.length - 1} data-testid={`aisle-down-${group.category}`} onClick={() => onMoveCategory(group.category, 1)}>↓</button></span> : null}</h2>{group.items.map((item) => {
        const isRemoved = item.checked || item.inPantry;
        return <div key={item.ingredientId} className={`shopping-item ${isRemoved ? "is-checked" : ""}`}><button className="shopping-toggle" type="button" aria-label={`${item.checked ? "Décocher" : "Cocher"} ${item.name}`} onClick={() => onToggleChecked(item.ingredientId)}><span className="shopping-check" aria-hidden="true">{isRemoved ? <CheckIcon /> : null}</span><span><strong>{item.name}</strong><small>{item.purchaseSuggestion}</small></span></button>{pantryMode ? <div className="pantry-controls"><button type="button" className={`pantry-chip ${item.inPantry ? "is-selected" : ""}`} onClick={() => onTogglePantry(item.ingredientId)}>{item.inPantry ? "Retiré" : "J’ai déjà"}</button><label className="pantry-amount"><span className="sr-only">Quantité déjà en stock pour {item.name}</span><KeyboardInput inputMode="numeric" placeholder="0" data-testid={`pantry-amount-${item.ingredientId}`} value={pantryAmounts[item.ingredientId]?.quantity ? String(pantryAmounts[item.ingredientId].quantity) : ""} onChange={(event) => {
          const quantity = Number(event.target.value.replace(",", "."));
          onSetPantryAmount(item.ingredientId, Number.isFinite(quantity) && quantity > 0 ? { quantity, unit: item.amounts[0].unit } : null);
        }} /><small>{item.amounts[0].unit === "piece" ? "pcs" : item.amounts[0].unit}</small></label></div> : null}</div>;
      })}</section>)}</div>
    </main>
  );
}

interface WakeLock { release: () => Promise<void>; addEventListener: (type: string, handler: () => void) => void }

/**
 * Keeps the screen awake while cooking, when the browser allows it. Failure is
 * silent and never blocks the mode: the steps stay readable either way.
 */
function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } }).wakeLock;
    if (!active || !api) { setHeld(false); return; }

    let released = false;
    let lock: WakeLock | null = null;
    const request = () => {
      void api.request("screen").then((sentinel) => {
        if (released) { void sentinel.release(); return; }
        lock = sentinel;
        setHeld(true);
        sentinel.addEventListener("release", () => setHeld(false));
      }).catch(() => setHeld(false));
    };
    // Browsers drop the lock when the tab goes to the background.
    const onVisible = () => { if (document.visibilityState === "visible" && !released) request(); };

    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      setHeld(false);
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);

  return held;
}

function CookingView({ recipe, portions }: { recipe: Recipe; portions: number }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const screenHeld = useWakeLock(true);
  const ingredients = scaleIngredients(recipe, portions);
  const total = recipe.steps.length;
  const isDone = done.includes(step);
  return <MobileScroll className="app-screen"><main className="cooking-page" data-testid="cooking-view">
    <div className="cooking-head">
      <span className="eyebrow">Étape {step + 1} sur {total}</span>
      <h1>{recipe.title}</h1>
      <p className="cooking-screen-state" data-testid="cooking-wake-lock">{screenHeld ? "Écran maintenu allumé pendant la préparation." : "Votre appareil peut mettre l’écran en veille : gardez-le à portée."}</p>
    </div>
    <ol className="cooking-progress" aria-label="Progression des étapes">
      {recipe.steps.map((item, index) => <li key={item}><button type="button" className={`${index === step ? "is-current" : ""} ${done.includes(index) ? "is-done" : ""}`} aria-current={index === step ? "step" : undefined} aria-label={`Étape ${index + 1}`} onClick={() => setStep(index)} /></li>)}
    </ol>
    <p className="cooking-step" data-testid="cooking-step">{recipe.steps[step]}</p>
    <button type="button" className={`cooking-done ${isDone ? "is-active" : ""}`} aria-pressed={isDone} data-testid="cooking-done" onClick={() => setDone((current) => (current.includes(step) ? current.filter((entry) => entry !== step) : [...current, step]))}>
      <CheckIcon /> {isDone ? "Étape faite" : "Marquer cette étape"}
    </button>
    <div className="cooking-nav">
      <button type="button" className="secondary-button" disabled={step === 0} data-testid="cooking-previous" onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeftIcon /> Précédente</button>
      <button type="button" className="primary-button" disabled={step >= total - 1} data-testid="cooking-next" onClick={() => setStep((value) => Math.min(total - 1, value + 1))}>Suivante <ChevronRightIcon /></button>
    </div>
    <section className="cooking-ingredients"><h2>Ingrédients pour {portions} portion{portions > 1 ? "s" : ""}</h2>
      <ul>{ingredients.map((item, index) => <li key={`${item.id}-${item.unit}-${index}`}><strong>{displayQuantity(item.quantity, item.unit)}</strong> {item.name}</li>)}</ul>
    </section>
  </main></MobileScroll>;
}

function CatalogueError({ onRetry }: { onRetry: () => void }) {
  return <div className="catalogue-error" role="alert" data-testid="catalogue-error">
    <Cross2Icon /><h3>Catalogue indisponible</h3>
    <p>Le catalogue n’a pas pu être chargé. Vérifiez votre connexion : le reste de l’application continue de fonctionner hors ligne.</p>
    <button type="button" className="secondary-button" data-testid="catalogue-retry" onClick={onRetry}><ReloadIcon /> Réessayer</button>
  </div>;
}

function FavoritesView({ favoriteIds, history, catalogue, catalogueError, onLoadCatalogue, onRetryCatalogue, onOpenRecipe, onOpenCatalogue, onOpenHistory, onDeleteHistory }: { favoriteIds: string[]; history: WeeklyPlan[]; catalogue: CatalogueData | null; catalogueError: boolean; onLoadCatalogue: () => void; onRetryCatalogue: () => void; onOpenRecipe: (recipe: Recipe) => void; onOpenCatalogue: (recipe: CatalogueRecipe) => void; onOpenHistory: (plan: WeeklyPlan) => void; onDeleteHistory: (plan: WeeklyPlan) => void }) {
  const [mode, setMode] = useState<"favorites" | "catalogue" | "history">("favorites");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [filters, setFilters] = useState<CatalogueFilters>(EMPTY_CATALOGUE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const normalizedQuery = normalizeText(query);
  const allFavoriteRecipes = favoriteIds.map((id) => recipeById.get(id)).filter((item): item is Recipe => Boolean(item));
  const favoriteRecipes = allFavoriteRecipes.filter((recipe) => !normalizedQuery
    || normalizeText(`${recipe.title} ${recipe.ingredients.map((item) => item.name).join(" ")} ${recipe.tags.join(" ")}`).includes(normalizedQuery));
  const unresolvedFavoriteIds = favoriteIds.filter((id) => !recipeById.has(id) && id.startsWith("catalog-"));
  const allCatalogueFavorites = catalogue
    ? unresolvedFavoriteIds
        .map((id) => catalogue.recipes.find((item) => item.id === catalogueRecipeIdOf(id)))
        .filter((item): item is CatalogueRecipe => Boolean(item))
    : [];
  const catalogueFavorites = allCatalogueFavorites.filter((recipe) => !normalizedQuery
    || normalizeText(`${recipe.titre} ${recipe.ingredients.map((item) => item.nom).join(" ")} ${recipe.tags.join(" ")}`).includes(normalizedQuery));
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
  );
  const activeFilterCount = [
    filters.maxActiveMinutes > 0,
    Boolean(filters.cost),
    Boolean(filters.season),
    Boolean(filters.diet),
    Boolean(filters.withoutAllergen),
    filters.plannableOnly,
  ].filter(Boolean).length;
  return (
    <main className="page-content favorites-page" data-testid="favorites-view">
      <div className="page-heading"><span className="eyebrow">Ma bibliothèque</span><h1>Recettes</h1><p>Un catalogue culinaire relu recette par recette, en complément de vos favoris.</p></div>
      <div className="segmented-control segmented-control--three" role="tablist" aria-label="Catalogue, favoris et historique" onKeyDown={(event) => {
        const order: typeof mode[] = ["favorites", "catalogue", "history"];
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = order[(order.indexOf(mode) + step + order.length) % order.length];
        setQuery("");
        setMode(next);
        document.getElementById(`library-tab-${next}`)?.focus();
      }}>
        {([["favorites", "Favoris"], ["catalogue", "Catalogue"], ["history", "Historique"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`library-tab-${id}`} aria-selected={mode === id} aria-controls="library-panel" tabIndex={mode === id ? 0 : -1} className={mode === id ? "is-selected" : ""} onClick={() => { setQuery(""); setMode(id); }}>{label}</button>
        ))}
      </div>
      <div id="library-panel" role="tabpanel" aria-labelledby={`library-tab-${mode}`}>
      {mode === "favorites" ? <div className="favorite-list">
        {savedCount > 4 ? <label className="catalogue-search"><MagnifyingGlassIcon /><span className="sr-only">Rechercher dans mes favoris</span><KeyboardInput value={query} placeholder="Recette ou ingrédient" data-testid="favorites-search" onChange={(event) => setQuery(event.target.value)} /></label> : null}
        {favoriteCount ? <>
        {favoriteRecipes.map((recipe) => <button type="button" className="favorite-card" key={recipe.id} onClick={() => onOpenRecipe(recipe)}><img src={recipe.image} alt="" onError={handleRecipeImageError} /><span><small>{recipe.mealTypes.map((type) => MEAL_LABELS[type]).join(" · ")}</small><strong>{recipe.title}</strong><em>{formatRecipeDuration(recipe.prepMinutes)} actives · {recipe.diet.includes("vegetarian") ? "Végétarien" : "Classique"}</em></span><HeartFilledIcon /></button>)}
        {catalogueFavorites.map((recipe) => <button type="button" className="favorite-card" key={recipe.id} data-testid={`favorite-catalogue-${recipe.id}`} onClick={() => onOpenCatalogue(recipe)}><img src={catalogueImageFor(recipe)} alt="" loading="lazy" onError={handleRecipeImageError} /><span><small>{catalogueCategoryName(recipe.categorie)}</small><strong>{recipe.titre}</strong><em>{formatCatalogueCardDuration(recipe)}</em></span><HeartFilledIcon /></button>)}
        {!catalogue && unresolvedFavoriteIds.length ? (catalogueError ? <CatalogueError onRetry={onRetryCatalogue} /> : <p className="inline-help" aria-live="polite">Chargement de vos recettes du catalogue…</p>) : null}
      </> : savedCount ? <div className="empty-day"><MagnifyingGlassIcon /><h3>Aucun résultat</h3><p>Aucun de vos {savedCount} favoris ne correspond à « {query} ».</p></div> : <div className="empty-day"><HeartIcon /><h3>Aucun favori</h3><p>Ajoutez une recette depuis sa fiche pour la retrouver ici.</p></div>}</div> : mode === "catalogue" ? !catalogue ? (catalogueError ? <CatalogueError onRetry={onRetryCatalogue} /> : <div className="app-loading" aria-live="polite"><ReloadIcon className="spin" /><span>Chargement du catalogue…</span></div>) : <section className="catalogue-browser" aria-label="Catalogue vérifié">
        <div className="catalogue-method"><strong>{catalogueRecipes.length} recettes uniques disponibles</strong><p>Les {catalogue.recipes.length} recettes ont été relues : {Object.keys(DUPLICATE_CATALOGUE_RECIPES).length} variantes trop proches ont été écartées du catalogue affiché.</p></div>
        <label className="catalogue-search"><MagnifyingGlassIcon /><span className="sr-only">Rechercher une recette</span><KeyboardInput value={query} placeholder="Recette ou ingrédient" onChange={(event) => setQuery(event.target.value)} /></label>
        <Carousel ariaLabel="Filtrer les catégories" className="catalogue-filters" contentClassName="catalogue-filters__track"><button type="button" className={category === "all" ? "is-selected" : ""} onClick={() => setCategory("all")}>Toutes</button>{CATALOGUE_CATEGORIES.map((item) => <button type="button" key={item.id} className={category === item.id ? "is-selected" : ""} onClick={() => setCategory(item.id)}>{item.nom}</button>)}</Carousel>
        <div className="catalogue-toolbar">
          <button type="button" className={`secondary-button ${activeFilterCount ? "is-active" : ""}`} data-testid="catalogue-filters-open" onClick={() => setFiltersOpen(true)}><MixerHorizontalIcon /> Filtres{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
          <label className="catalogue-sort"><span className="sr-only">Trier les recettes</span>
            <select data-testid="catalogue-sort" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as CatalogueFilters["sort"] }))}>
              <option value="title">Ordre alphabétique</option>
              <option value="time">Temps actif croissant</option>
              <option value="cost">Coût croissant</option>
            </select>
          </label>
        </div>
        <p className="catalogue-count">{catalogueRecipes.length} résultat{catalogueRecipes.length > 1 ? "s" : ""}</p>
        <BottomSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtrer le catalogue" description="Les filtres se cumulent et n’altèrent jamais les relectures éditoriales.">
          <div className="catalogue-filter-sheet" data-testid="catalogue-filter-sheet">
            <fieldset><legend>Temps actif maximum</legend><div className="choice-row">{[0, 15, 30, 45].map((minutes) => <button type="button" key={minutes} className={filters.maxActiveMinutes === minutes ? "is-selected" : ""} data-testid={`filter-time-${minutes}`} onClick={() => setFilters((current) => ({ ...current, maxActiveMinutes: minutes }))}>{minutes === 0 ? "Peu importe" : `${minutes} min`}</button>)}</div></fieldset>
            <fieldset><legend>Coût</legend><div className="choice-row">{([["", "Peu importe"], ["economique", "Économique"], ["moyen", "Moyen"], ["eleve", "Élevé"]] as const).map(([value, label]) => <button type="button" key={label} className={filters.cost === value ? "is-selected" : ""} onClick={() => setFilters((current) => ({ ...current, cost: value }))}>{label}</button>)}</div></fieldset>
            <fieldset><legend>Saison</legend><div className="choice-row">{([["", "Toutes"], ["printemps", "Printemps"], ["ete", "Été"], ["automne", "Automne"], ["hiver", "Hiver"]] as const).map(([value, label]) => <button type="button" key={label} className={filters.season === value ? "is-selected" : ""} onClick={() => setFilters((current) => ({ ...current, season: value }))}>{label}</button>)}</div></fieldset>
            <fieldset><legend>Régime</legend><div className="choice-row">{([["", "Tous"], ["vegetalien", "Végétalien"], ["vegetarien", "Végétarien"], ["sans-gluten", "Sans gluten"], ["sans-lactose", "Sans lactose"], ["pescetarien", "Pescétarien"]] as const).map(([value, label]) => <button type="button" key={label} className={filters.diet === value ? "is-selected" : ""} onClick={() => setFilters((current) => ({ ...current, diet: value }))}>{label}</button>)}</div></fieldset>
            <fieldset><legend>Sans allergène</legend><div className="choice-row">{[["", "Peu importe"] as const, ...ALLERGEN_OPTIONS.map((item) => [item.id, item.label] as const)].map(([value, label]) => <button type="button" key={label} className={filters.withoutAllergen === value ? "is-selected" : ""} data-testid={`filter-allergen-${value || "any"}`} onClick={() => setFilters((current) => ({ ...current, withoutAllergen: value }))}>{label}</button>)}</div></fieldset>
            <button type="button" className={`dislike-toggle ${filters.plannableOnly ? "is-selected" : ""}`} aria-pressed={filters.plannableOnly} data-testid="filter-plannable" onClick={() => setFilters((current) => ({ ...current, plannableOnly: !current.plannableOnly }))}><span className="dislike-toggle__box" aria-hidden="true">{filters.plannableOnly ? <CheckIcon /> : null}</span><span><strong>Seulement les recettes planifiables</strong><small>Masque les recettes d’appoint et celles écartées par la relecture.</small></span></button>
            <div className="filter-sheet-actions">
              <button type="button" className="secondary-button" data-testid="catalogue-filters-reset" onClick={() => setFilters(EMPTY_CATALOGUE_FILTERS)}>Tout effacer</button>
              <button type="button" className="primary-button" onClick={() => setFiltersOpen(false)}>Voir {catalogueRecipes.length} recette{catalogueRecipes.length > 1 ? "s" : ""}</button>
            </div>
          </div>
        </BottomSheet>
        <div className="catalogue-list">{catalogueRecipes.map((recipe) => { const review = reviewFor(recipe); const availability = plannerAvailabilityFor(recipe); const exclusion = availability.kind ? PLANNER_EXCLUSION_TEXT[availability.kind] : undefined; return <button type="button" className="catalogue-card" key={recipe.id} onClick={() => onOpenCatalogue(recipe)}><img className="catalogue-card__image" src={catalogueImageFor(recipe)} alt="" loading="lazy" decoding="async" onError={handleRecipeImageError} /><span className={`catalogue-card__status is-${review.status}`}>{review.status === "validated" ? "Profil cohérent" : "Avec repères"}</span>{exclusion ? <span className="catalogue-card__planner">{exclusion.badge}</span> : null}<small>{catalogueCategoryName(recipe.categorie)} · {formatCatalogueCardDuration(recipe)}</small><strong>{recipe.titre}</strong><p>{review.summary}</p><span className="catalogue-card__meta">{recipe.regimes.slice(0, 2).map((item) => item.replaceAll("-", " ")).join(" · ")}<ChevronRightIcon /></span></button>; })}</div>
      </section> : <div className="history-list">{history.length ? <>
        {history.map((plan) => <article className="history-card" key={plan.id} data-testid={`history-card-${plan.id}`}>
          <button type="button" className="history-card__open" onClick={() => onOpenHistory(plan)}><span><small>Générée le {new Date(plan.generatedAt).toLocaleDateString("fr-FR")}</small><strong>{formatWeekRange(plan.startsOn)}</strong><ChevronRightIcon /></span><em>{plan.meals.length} repas · {plan.estimatedCost.toFixed(0)} € estimés</em></button>
          <button type="button" className="history-card__delete" data-testid={`history-delete-${plan.id}`} aria-label={`Supprimer la semaine du ${formatWeekRange(plan.startsOn)}`} onClick={() => onDeleteHistory(plan)}><Cross2Icon /></button>
        </article>)}
        <p className="inline-help">{history.length} semaine{history.length > 1 ? "s" : ""} conservée{history.length > 1 ? "s" : ""} sur cet appareil, {HISTORY_LIMIT} au maximum : au-delà, la plus ancienne est retirée automatiquement.</p>
      </> : <div className="empty-day"><ArchiveIcon /><h3>Aucun historique</h3><p>Vos anciennes semaines seront conservées sur cet appareil.</p></div>}</div>}
      </div>
    </main>
  );
}

function HistoryPlanView({ plan, profile, onOpenRecipe, onReplay }: {
  plan: WeeklyPlan;
  profile: UserProfile;
  onOpenRecipe: (recipe: Recipe) => void;
  onReplay: () => void;
}) {
  const report = inspectPlanReplay(plan, ACTIVE_RECIPES, profile);
  const summary = summarizePlan(plan, ACTIVE_RECIPES, profile);
  const cookedCount = planProgress(plan).completed;
  return <MobileScroll className="app-screen"><main className="page-content pushed-page history-page" data-testid="history-plan-view">
    <div className="page-heading"><span className="eyebrow">Générée le {new Date(plan.generatedAt).toLocaleDateString("fr-FR")}</span><h1>{formatWeekRange(plan.startsOn)}</h1><p>{plan.meals.length} repas archivés{cookedCount ? `, dont ${cookedCount} cuisiné${cookedCount > 1 ? "s" : ""}` : ""}.</p></div>
    <div className="week-summary"><div><strong>{summary.mealCount}</strong><span>repas</span></div><div><strong>{plan.estimatedCost.toFixed(0)} €</strong><span>estimés</span></div><div><strong>{summary.averagePrepMinutes.toFixed(0)} min</strong><span>actives en moyenne</span></div></div>
    {report.canReplay
      ? <button className="primary-button full-button" type="button" data-testid="replay-plan" onClick={onReplay}>Reprendre cette semaine</button>
      : <p className="notice-banner" data-testid="replay-blocked">{report.blockedMeals.length ? `${report.blockedMeals.length} repas ne correspond${report.blockedMeals.length > 1 ? "ent" : ""} plus à votre profil actuel (allergies, régime, équipement ou temps).` : "Cette semaine ne couvre pas tous les repas demandés par votre profil actuel."} Générez une nouvelle semaine pour rester dans vos critères.</p>}
    {DAY_LABELS.map((day, dayIndex) => {
      const dayMeals = plan.meals.filter((meal) => meal.dayIndex === dayIndex);
      if (!dayMeals.length) return null;
      return <section className="history-day" key={day}>
        <h2>{day} {dateAt(plan.startsOn, dayIndex).getDate()}</h2>
        {dayMeals.map((meal) => { const recipe = recipeById.get(meal.recipeId); return <button type="button" className="history-meal" key={meal.id} disabled={!recipe} onClick={() => recipe && onOpenRecipe(recipe)}>
          <span><small>{MEAL_LABELS[meal.mealType]}{meal.completed ? " · Cuisiné" : ""}</small><strong>{recipe?.title ?? "Recette indisponible"}</strong></span>{recipe ? <ChevronRightIcon /> : null}
        </button>; })}
      </section>;
    })}
    <p className="privacy-note">Reprendre une semaine crée un nouveau menu pour la semaine en cours : les portions suivent votre profil actuel et les repères « cuisiné » repartent de zéro.</p>
  </main></MobileScroll>;
}

function LeftoverView({ plan, source, recipe, onConfirm }: {
  plan: WeeklyPlan;
  source: PlannedMeal;
  recipe: Recipe;
  onConfirm: (targetSlotId: string) => string | null;
}) {
  const candidates = leftoverCandidates(plan, source.id, ACTIVE_RECIPES);
  const [error, setError] = useState("");
  return <MobileScroll className="app-screen"><main className="page-content pushed-page plan-slot-page" data-testid="leftover-view">
    <div className="page-heading"><span className="eyebrow">Cuisiner en double</span><h1>{recipe.title}</h1><p>Choisissez le repas qui sera servi avec les restes. Les courses et le coût couvrent déjà les deux repas.</p></div>
    <aside className="conservation-note"><ClockIcon /><span><strong>Conservation</strong>{recipe.conservation}</span></aside>
    {error ? <p className="notice-banner" role="alert">{error}</p> : null}
    {!candidates.length ? <p className="notice-banner" data-testid="leftover-empty">Aucun repas compatible dans les deux jours qui suivent. Les restes se replanifient sur un repas du même type, peu après la cuisson.</p> : null}
    {candidates.map((meal) => { const replaced = recipeById.get(meal.recipeId); return <button type="button" className="plan-slot" key={meal.id} data-testid={`leftover-slot-${meal.id}`} onClick={() => setError(onConfirm(meal.id) ?? "")}>
      <span><small>{DAY_LABELS[meal.dayIndex]} {dateAt(plan.startsOn, meal.dayIndex).getDate()} · {MEAL_LABELS[meal.mealType]}</small><strong>À la place de {replaced?.title ?? "ce repas"}</strong></span><ChevronRightIcon />
    </button>; })}
    <p className="privacy-note">Vérifiez toujours la conservation indiquée et refroidissez rapidement les plats cuisinés en avance.</p>
  </main></MobileScroll>;
}

/** A personal variant of an existing recipe: same canonical ingredients, own wording. */
function customRecipeFrom(recipe: Recipe): Recipe {
  return {
    ...recipe,
    id: `perso-${recipe.id}-${Date.now().toString(36)}`,
    title: `${recipe.title} (ma version)`,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
    steps: [...recipe.steps],
  };
}

function CustomRecipeView({ draft, onSave, onDelete }: { draft: Recipe; onSave: (recipe: Recipe) => void; onDelete?: () => void }) {
  const keyboard = useKeyboard();
  const [title, setTitle] = useState(draft.title);
  const [prepMinutes, setPrepMinutes] = useState(String(draft.prepMinutes));
  const [steps, setSteps] = useState(draft.steps.join("\n"));
  const [ingredients, setIngredients] = useState(draft.ingredients.map((item) => ({ ...item })));
  const setQuantity = (index: number, delta: number) => setIngredients((current) => current.map((item, position) => (position === index
    ? { ...item, quantity: Math.max(0, Math.round((item.quantity + delta) * 100) / 100) }
    : item)));
  const commit = () => {
    keyboard.hide();
    const cleanedSteps = steps.split("\n").map((step) => step.trim()).filter(Boolean);
    onSave({
      ...draft,
      title: title.trim().slice(0, 90) || draft.title,
      prepMinutes: Math.min(600, Math.max(1, Math.round(Number(prepMinutes) || draft.prepMinutes))),
      ingredients: ingredients.filter((item) => item.quantity > 0),
      steps: cleanedSteps.length ? cleanedSteps : draft.steps,
    });
  };
  return <MobileScroll className="app-screen"><main className="page-content pushed-page" data-testid="custom-recipe-view">
    <div className="page-heading"><span className="eyebrow">Ma version</span><h1>Adapter la recette</h1><p>Ajustez le titre, le temps actif, les quantités et les étapes. Les ingrédients gardent leurs identifiants pour rester justes dans la liste de courses.</p></div>
    <section className="form-section"><h2>Intitulé</h2>
      <label className="text-field"><span>Titre</span><KeyboardInput value={title} maxLength={90} data-testid="custom-title" onChange={(event) => setTitle(event.target.value)} onBlur={keyboard.hide} /></label>
      <label className="text-field"><span>Temps actif (min)</span><KeyboardInput inputMode="numeric" value={prepMinutes} data-testid="custom-time" onChange={(event) => setPrepMinutes(event.target.value)} onBlur={keyboard.hide} /></label>
    </section>
    <section className="form-section"><h2>Ingrédients</h2>
      <p className="inline-help">Mettez une quantité à zéro pour retirer un ingrédient.</p>
      {ingredients.map((item, index) => <div className="setting-row" key={`${item.id}-${index}`}>
        <span><strong>{item.name}</strong><small>{displayQuantity(item.quantity, item.unit)} par portion</small></span>
        <div className="stepper"><button type="button" aria-label={`Réduire ${item.name}`} onClick={() => setQuantity(index, item.unit === "piece" ? -0.5 : -5)}><MinusIcon /></button><b>{item.quantity}</b><button type="button" aria-label={`Augmenter ${item.name}`} onClick={() => setQuantity(index, item.unit === "piece" ? 0.5 : 5)}><PlusIcon /></button></div>
      </div>)}
    </section>
    <section className="form-section"><h2>Préparation</h2>
      <label className="text-field"><span>Une étape par ligne</span><KeyboardTextarea value={steps} rows={8} data-testid="custom-steps" onChange={(event) => setSteps(event.target.value)} /></label>
    </section>
    <button type="button" className="primary-button full-button" data-testid="custom-save" onClick={commit}>Enregistrer ma version</button>
    {onDelete ? <button type="button" className="secondary-button full-button" data-testid="custom-delete" onClick={onDelete}>Supprimer cette recette</button> : null}
    <p className="privacy-note">Vos recettes personnelles restent sur cet appareil et entrent dans vos semaines comme les autres, filtres de sécurité compris.</p>
  </main></MobileScroll>;
}

function SwapView({ plan, source, onConfirm }: {
  plan: WeeklyPlan;
  source: PlannedMeal;
  onConfirm: (targetSlotId: string) => string | null;
}) {
  const [error, setError] = useState("");
  const sourceRecipe = recipeById.get(source.recipeId);
  const candidates = plan.meals.filter((meal) => meal.id !== source.id
    && !meal.leftoverOf
    && !plan.meals.some((other) => other.leftoverOf === meal.id));
  return <MobileScroll className="app-screen"><main className="page-content pushed-page plan-slot-page" data-testid="swap-view">
    <div className="page-heading"><span className="eyebrow">Déplacer</span><h1>{sourceRecipe?.title ?? "Ce repas"}</h1><p>Choisissez le repas avec lequel l’échanger. Les deux plats gardent leurs repères, seuls les jours changent.</p></div>
    {error ? <p className="notice-banner" role="alert">{error}</p> : null}
    {DAY_LABELS.map((day, dayIndex) => {
      const dayMeals = candidates.filter((meal) => meal.dayIndex === dayIndex);
      if (!dayMeals.length) return null;
      return <section className="plan-slot-day" key={day}>
        <h2>{day} {dateAt(plan.startsOn, dayIndex).getDate()}</h2>
        {dayMeals.map((meal) => { const recipe = recipeById.get(meal.recipeId); return <button type="button" className="plan-slot" key={meal.id} data-testid={`swap-slot-${meal.id}`} onClick={() => setError(onConfirm(meal.id) ?? "")}>
          <span><small>{MEAL_LABELS[meal.mealType]}{meal.skipped ? " · Hors foyer" : ""}</small><strong>{recipe?.title ?? "Repas"}</strong></span><ChevronRightIcon />
        </button>; })}
      </section>;
    })}
  </main></MobileScroll>;
}

function PlanSlotView({ plan, recipe, profile, onConfirm }: {
  plan: WeeklyPlan;
  recipe: Recipe;
  profile: UserProfile;
  onConfirm: (slot: PlanSlot) => string | null;
}) {
  const slots = assignableSlots(plan, recipe, profile);
  const [error, setError] = useState("");
  const alreadyPlanned = plan.meals.find((meal) => meal.recipeId === recipe.id);
  return <MobileScroll className="app-screen"><main className="page-content pushed-page plan-slot-page" data-testid="plan-slot-view">
    <div className="page-heading"><span className="eyebrow">Planifier</span><h1>{recipe.title}</h1><p>Choisissez le repas à remplacer. Les allergies, le régime, l’équipement et le temps actif restent respectés.</p></div>
    {alreadyPlanned ? <p className="notice-banner" data-testid="already-planned">Cette recette est déjà au menu ({DAY_LABELS[alreadyPlanned.dayIndex]}, {MEAL_LABELS[alreadyPlanned.mealType].toLocaleLowerCase("fr-FR")}). Une même recette n’est pas répétée dans la semaine.</p> : null}
    {error ? <p className="notice-banner" role="alert">{error}</p> : null}
    {!slots.length ? <p className="notice-banner">Aucun créneau compatible : cette recette ne correspond pas à vos critères ou aux repas générés.</p> : null}
    {DAY_LABELS.map((day, dayIndex) => {
      const daySlots = slots.filter((slot) => slot.dayIndex === dayIndex);
      if (!daySlots.length) return null;
      return <section className="plan-slot-day" key={day}>
        <h2>{day} {dateAt(plan.startsOn, dayIndex).getDate()}</h2>
        {daySlots.map((slot) => { const replaced = recipeById.get(slot.taken); return <button type="button" className="plan-slot" key={`${slot.dayIndex}-${slot.mealType}`} disabled={Boolean(alreadyPlanned)} data-testid={`plan-slot-${slot.dayIndex}-${slot.mealType}`} onClick={() => setError(onConfirm({ dayIndex: slot.dayIndex, mealType: slot.mealType }) ?? "")}>
          <span><small>{MEAL_LABELS[slot.mealType]}</small><strong>À la place de {replaced?.title ?? "ce repas"}</strong></span><ChevronRightIcon />
        </button>; })}
      </section>;
    })}
  </main></MobileScroll>;
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
  const targets = weeklyTargetsOf(profile);
  const setTarget = (key: "legumeMeals" | "fishMeals", delta: number) => setProfile((current) => {
    const currentTargets = weeklyTargetsOf(current);
    return { ...current, weeklyTargets: { ...currentTargets, [key]: Math.min(MAX_WEEKLY_TARGET, Math.max(0, currentTargets[key] + delta)) } };
  });
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
      <label className="text-field"><span>Temps actif maximum en cuisine (min)</span><KeyboardInput inputMode="numeric" value={maxPrep} onChange={(event) => setMaxPrep(event.target.value)} onBlur={keyboard.hide} /></label>
      <fieldset className="allergen-field"><legend>Allergies et intolérances à exclure</legend><div className="allergen-grid">{ALLERGEN_OPTIONS.map((item) => <button type="button" className={selectedAllergies.has(item.id) ? "is-selected" : ""} aria-pressed={selectedAllergies.has(item.id)} key={item.id} onClick={() => toggleAllergy(item.id)}>{selectedAllergies.has(item.id) ? <CheckIcon /> : null}{item.label}</button>)}</div></fieldset>
      <label className="text-field"><span>Autre allergie ou ingrédient à exclure</span><KeyboardInput value={allergies} placeholder="Sélectionnez ci-dessus ou saisissez un terme" onChange={(event) => setAllergies(event.target.value)} onBlur={keyboard.hide} /><small>Les 14 allergènes réglementaires sont normalisés automatiquement.</small></label>
      <label className="text-field"><span>Aliments refusés</span><KeyboardInput value={excluded} placeholder="Ex. brocoli, saumon" onChange={(event) => setExcluded(event.target.value)} onBlur={keyboard.hide} /></label>
    </section>
    <section className="form-section"><h2>Équipements</h2><div className="choice-grid">{EQUIPMENT_OPTIONS.map((item) => <button type="button" className={profile.equipment.includes(item.id) ? "is-selected" : ""} key={item.id} onClick={() => toggleEquipment(item.id)}>{profile.equipment.includes(item.id) ? <CheckIcon /> : null}{item.label}</button>)}</div>
      {profile.equipment.length === 0 ? <p className="notice-banner" role="alert" data-testid="no-equipment-warning">Sans aucun équipement, presque aucune recette ne reste réalisable et la génération échouera. Cochez au moins les plaques.</p> : null}
      {profile.equipment.length > 0 && profile.equipment.length <= 1 ? <p className="inline-help" data-testid="few-equipment-warning">Avec un seul équipement, le choix de recettes devient très restreint.</p> : null}
    </section>
    <section className="form-section" data-testid="targets-section"><h2>Objectifs de la semaine</h2>
      <p className="inline-help">Le générateur vise ces fréquences avant d’optimiser le budget, la saison et le réemploi. Repères issus du modèle méditerranéen, pas une prescription.</p>
      <div className="setting-row"><span><strong>Repas avec légumineuses</strong><small>Lentilles, pois chiches, haricots</small></span><div className="stepper"><button type="button" aria-label="Moins de repas avec légumineuses" onClick={() => setTarget("legumeMeals", -1)}><MinusIcon /></button><b data-testid="target-legume">{targets.legumeMeals}</b><button type="button" aria-label="Plus de repas avec légumineuses" onClick={() => setTarget("legumeMeals", 1)}><PlusIcon /></button></div></div>
      {profile.diet === "classic" ? <div className="setting-row"><span><strong>Repas avec poisson</strong><small>Dont poissons gras si possible</small></span><div className="stepper"><button type="button" aria-label="Moins de repas avec poisson" onClick={() => setTarget("fishMeals", -1)}><MinusIcon /></button><b data-testid="target-fish">{targets.fishMeals}</b><button type="button" aria-label="Plus de repas avec poisson" onClick={() => setTarget("fishMeals", 1)}><PlusIcon /></button></div></div> : <p className="inline-help">L’objectif poisson ne s’applique pas au régime sélectionné.</p>}
    </section>
    <section className="form-section" data-testid="disliked-section"><h2>Recettes écartées</h2>
      {profile.dislikedRecipeIds.length
        ? <><p className="inline-help">Ces recettes ne sont plus proposées dans vos semaines. Touchez-en une pour la réintégrer.</p>
            <div className="disliked-grid">{profile.dislikedRecipeIds.map((id) => <button type="button" key={id} data-testid={`disliked-${id}`} onClick={() => setProfile((current) => ({ ...current, dislikedRecipeIds: current.dislikedRecipeIds.filter((entry) => entry !== id) }))}>{recipeById.get(id)?.title ?? id}<Cross2Icon /></button>)}</div></>
        : <p className="inline-help">Aucune recette écartée. Depuis l’écran « Remplacer », vous pouvez demander à ne plus voir une recette.</p>}
    </section>
    <button className="information-link" type="button" onClick={onOpenInformation}><span><strong>Informations et confidentialité</strong><small>Données, estimations et avertissement santé</small></span><ChevronRightIcon /></button>
    <p className="privacy-note">La génération repose sur des règles locales. Votre profil et vos menus restent sur cet appareil.</p>
    <button className="primary-button full-button" type="button" onClick={commit}>Enregistrer mon profil</button>
  </main></MobileScroll>;
}

function BackupSection({ state, onRestore }: { state: AppState; onRestore: (restored: AppState) => void }) {
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const inputId = "backup-file-input";
  const download = () => {
    try {
      downloadTextFile(`inflamm-menu-sauvegarde-${isoDate(new Date())}.json`, exportAppState(state));
      setError("");
      setFeedback("Sauvegarde téléchargée.");
    } catch {
      setFeedback("");
      setError("Téléchargement impossible sur cet appareil.");
    }
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const restored = importAppState(await file.text());
      onRestore(restored);
      setError("");
      setFeedback(`Sauvegarde restaurée : ${restored.history.length} semaine(s) archivée(s), ${restored.favoriteRecipeIds.length} favori(s).`);
    } catch (importError) {
      setFeedback("");
      setError(importError instanceof Error ? importError.message : "Restauration impossible.");
    }
  };
  return (
    <section className="information-card" data-testid="backup-card">
      <h2>Sauvegarder mes données</h2>
      <p>Vos données vivent uniquement sur cet appareil : vider les données du site les efface. Exportez un fichier pour les conserver ou les transférer, puis restaurez-le quand vous le souhaitez.</p>
      <div className="backup-actions">
        <button type="button" className="secondary-button" data-testid="backup-export" onClick={download}><DownloadIcon /> Exporter</button>
        <label className="secondary-button backup-import" htmlFor={inputId}><ArchiveIcon /> Restaurer
          <input id={inputId} type="file" accept="application/json,.json" data-testid="backup-import" onChange={(event) => { void restore(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>
      {feedback ? <p className="export-feedback" role="status" aria-live="polite" data-testid="backup-feedback">{feedback}</p> : null}
      {error ? <p className="notice-banner" role="alert" data-testid="backup-error">{error}</p> : null}
      <p className="privacy-note">La restauration remplace le profil, la semaine en cours, l’historique, les favoris et la liste de courses de cet appareil.</p>
    </section>
  );
}

function OfflineCatalogueSection() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  return (
    <section className="information-card" data-testid="offline-catalogue">
      <h2>Catalogue hors ligne</h2>
      <p>La semaine, les recettes planifiées et la liste de courses fonctionnent déjà sans connexion. Le catalogue complet (550 recettes) est téléchargé à la demande pour ne pas consommer vos données sans raison.</p>
      <button type="button" className="secondary-button full-button" data-testid="offline-catalogue-download" disabled={status === "loading" || status === "ready"} onClick={() => {
        setStatus("loading");
        void loadCatalogue().then(() => setStatus("ready")).catch(() => setStatus("error"));
      }}>
        {status === "ready" ? <><CheckIcon /> Catalogue disponible hors ligne</> : status === "loading" ? <><ReloadIcon className="spin" /> Téléchargement…</> : <><DownloadIcon /> Télécharger le catalogue</>}
      </button>
      {status === "error" ? <p className="notice-banner" role="alert">Téléchargement impossible. Réessayez une fois connecté.</p> : null}
    </section>
  );
}

function ComfortSection({ state, onTextScale, onReminders }: { state: AppState; onTextScale: (scale: "normal" | "large") => void; onReminders: (enabled: boolean) => void }) {
  const [permission, setPermission] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const enableReminders = async () => {
    if (typeof Notification === "undefined") { setPermission("unsupported"); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
    onReminders(result === "granted");
  };
  return (
    <section className="information-card" data-testid="comfort-card">
      <h2>Confort de lecture et rappels</h2>
      <p>Taille du texte de l’application. Les repères et avertissements suivent le même réglage.</p>
      <div className="choice-row" role="group" aria-label="Taille du texte">
        {([["normal", "Taille normale"], ["large", "Texte agrandi"]] as const).map(([value, label]) => (
          <button type="button" key={value} className={state.textScale === value ? "is-selected" : ""} aria-pressed={state.textScale === value} data-testid={`text-scale-${value}`} onClick={() => onTextScale(value)}>{label}</button>
        ))}
      </div>
      <p style={{ marginTop: 18 }}>Un rappel peut s’afficher à l’ouverture de l’application quand un plat du lendemain doit être lancé la veille (trempage, marinade, fermentation).</p>
      {state.remindersEnabled && permission === "granted"
        ? <button type="button" className="secondary-button full-button" data-testid="reminders-off" onClick={() => onReminders(false)}><CheckIcon /> Rappels activés — désactiver</button>
        : <button type="button" className="secondary-button full-button" disabled={permission === "denied" || permission === "unsupported"} data-testid="reminders-on" onClick={() => void enableReminders()}><ClockIcon /> Activer les rappels</button>}
      {permission === "denied" ? <p className="inline-help">Les notifications sont bloquées pour ce site dans les réglages de votre navigateur.</p> : null}
      {permission === "unsupported" ? <p className="inline-help">Cet appareil ne propose pas de notifications web.</p> : null}
      <p className="privacy-note">Les rappels sont produits localement pendant que l’application est ouverte : aucun serveur, aucune donnée transmise.</p>
    </section>
  );
}

function InformationView({ state, onRestore, onTextScale, onReminders }: { state: AppState; onRestore: (restored: AppState) => void; onTextScale: (scale: "normal" | "large") => void; onReminders: (enabled: boolean) => void }) {
  return <MobileScroll className="app-screen"><main className="page-content pushed-page information-page">
    <div className="page-heading"><span className="eyebrow">En toute transparence</span><h1>À propos de l’application</h1><p>Les repères essentiels sur le fonctionnement de cette V1 locale.</p></div>
    <section className="information-card"><h2>Génération locale</h2><p>Les semaines sont composées directement sur votre appareil à partir de règles déterministes, de filtres et d’une base de recettes intégrée.</p></section>
    <section className="information-card"><h2>Confidentialité</h2><p>Votre prénom, vos préférences, vos menus, vos favoris et votre liste de courses sont enregistrés localement sur cet appareil. Cette V1 ne crée pas de compte et ne transmet pas ces données à un serveur.</p><p>La suppression des données du site dans les réglages du navigateur efface ces informations locales.</p></section>
    <BackupSection state={state} onRestore={onRestore} />
    <OfflineCatalogueSection />
    <ComfortSection state={state} onTextScale={onTextScale} onReminders={onReminders} />
    <section className="information-card information-card--warning"><h2>Avertissement santé</h2><p>Inflamm’Menu est un outil d’organisation alimentaire et ne remplace pas l’avis d’un médecin, d’un diététicien ou d’un autre professionnel de santé. En cas d’allergie sévère, de pathologie, de grossesse ou de régime prescrit, demandez un avis professionnel.</p></section>
    <section className="information-card"><h2>{CATALOGUE_SUMMARY.nombre_recettes} recettes comparées et relues</h2><p>{CATALOGUE_SUMMARY.nombre_recettes_visibles} recettes absentes de la base ont été ajoutées; {CATALOGUE_SUMMARY.nombre_doublons_exclus} recettes matériellement équivalentes ont été écartées. Chaque proposition a été contrôlée selon son profil alimentaire global : place des végétaux, fibres, céréales complètes, légumineuses, poissons, graisses insaturées, sucres ajoutés, sodium et graisses saturées.</p><p>Les recettes contenant notamment beaucoup de coco, des préparations concentrées au curcuma, des algues ou davantage de sucre sont conservées avec des repères explicites. L'indice numérique du fichier source reste éditorial et n'est pas présenté comme une mesure médicale.</p></section>
    <section className="information-card"><h2>Inspirations historiques et culturelles</h2><p>Jean Seignalet nourrit la réflexion historique sur les liens entre alimentation et mode de vie; ses hypothèses ne sont pas utilisées comme preuves médicales et n'entraînent aucune exclusion automatique du gluten ou des produits laitiers.</p><p>Yuval Noah Harari inspire une lecture culturelle de l'évolution des pratiques alimentaires et l'ouverture aux cuisines du monde. Ses ouvrages ne servent pas de source nutritionnelle.</p><p>Les données officielles, la sécurité alimentaire et les recommandations actuelles restent toujours prioritaires.</p></section>
    <section className="information-card"><h2>Estimations</h2><p>Les prix, calories, protéines, fibres et quantités sont des estimations indicatives. Ils peuvent varier selon les produits, les marques, les saisons, les magasins et la préparation réelle.</p></section>
    <section className="information-card official-sources"><h2>Sources officielles de référence</h2><p>Ces liens permettent de consulter les repères publics qui orientent le contenu éditorial de l’application.</p>
      <a href="https://ciqual.anses.fr/cms/fr/la-table-ciqual-2025" target="_blank" rel="noreferrer"><span><strong>Table Ciqual 2025 — ANSES</strong><small>Composition nutritionnelle des aliments</small></span><ChevronRightIcon /></a>
      <a href="https://www.santepubliquefrance.fr/nutrition-et-activite-physique/rapportsynthese/recommandations-relatives-a-lalimentation-a-lactivite-physique-et-a-la-sedentarite-pour-les-adultes" target="_blank" rel="noreferrer"><span><strong>Santé publique France</strong><small>Recommandations pour les adultes</small></span><ChevronRightIcon /></a>
      <a href="https://nutritionsource.hsph.harvard.edu/healthy-weight/diet-reviews/anti-inflammatory-diet/" target="_blank" rel="noreferrer"><span><strong>Harvard — The Nutrition Source</strong><small>Alimentation anti-inflammatoire et limites des preuves</small></span><ChevronRightIcon /></a>
      <a href="https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/nutrition-basics/mediterranean-diet" target="_blank" rel="noreferrer"><span><strong>American Heart Association</strong><small>Repères du modèle méditerranéen</small></span><ChevronRightIcon /></a>
      <a href="https://www.anses.fr/fr/content/des-effets-indesirables-lies-la-consommation-de-complements-alimentaires-contenant-du" target="_blank" rel="noreferrer"><span><strong>ANSES — Curcuma</strong><small>Précautions et interactions</small></span><ChevronRightIcon /></a>
      <a href="https://www.anses.fr/fr/content/consommation-dalgues-rester-vigilant-sur-le-risque-dexces-dapport-en-iode" target="_blank" rel="noreferrer"><span><strong>ANSES — Algues et iode</strong><small>Populations à risque et consommation régulière</small></span><ChevronRightIcon /></a>
    </section>
    <p className="information-footer">Catalogue culinaire sous {CATALOGUE_SUMMARY.licence}</p>
  </main></MobileScroll>;
}

function AllergenNotice({ allergens }: { allergens: readonly string[] }) {
  if (!allergens.length) return <aside className="allergen-notice allergen-notice--clear"><strong>Allergènes déclarés</strong><p>Aucun des 14 allergènes réglementaires dans la formulation. Vérifiez toutefois les étiquettes et les traces éventuelles.</p></aside>;
  return <aside className="allergen-notice"><strong>Allergènes à vérifier</strong><div>{allergens.map((allergen) => <span key={allergen}>{ALLERGEN_LABELS[allergen] ?? allergen.replaceAll("-", " ")}</span>)}</div><p>Contrôlez les étiquettes et les traces éventuelles, surtout en cas d’allergie sévère.</p></aside>;
}

function GenerateView({ profile, lockedCount = 0, canPrepareNext = false, onCreate, onComplete }: { profile: UserProfile; lockedCount?: number; canPrepareNext?: boolean; onCreate: (target: "current" | "upcoming") => WeeklyPlan; onComplete: (target: "current" | "upcoming") => void }) {
  const [phase, setPhase] = useState<"ready" | "loading" | "success" | "error">("ready");
  const [result, setResult] = useState<WeeklyPlan | null>(null);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<"current" | "upcoming">("current");
  const start = () => {
    setPhase("loading");
    window.setTimeout(() => {
      try { const plan = onCreate(target); setResult(plan); setPhase("success"); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de créer cette semaine."); setPhase("error"); }
    }, 650);
  };
  return <MobileScroll className="app-screen"><main className="page-content pushed-page generate-page"><div className="generate-mark"><CalendarIcon /></div>
    {phase === "ready" ? <><div className="page-heading page-heading--center"><span className="eyebrow">Votre prochaine semaine</span><h1>Prête en quelques secondes</h1><p>Le moteur vérifie vos préférences, la variété, le budget et la saison.</p></div><section className="generation-summary"><div><PersonIcon /><span><small>Pour</small><strong>{profile.people} personne{profile.people > 1 ? "s" : ""}</strong></span></div><div><ClockIcon /><span><small>Temps actif</small><strong>{profile.maxPrepMinutes} min max.</strong></span></div><div><ArchiveIcon /><span><small>Budget</small><strong>{profile.weeklyBudget} € max.</strong></span></div></section>{canPrepareNext ? <div className="segmented-control target-switch" role="group" aria-label="Semaine à générer"><button type="button" className={target === "current" ? "is-selected" : ""} aria-pressed={target === "current"} data-testid="target-current" onClick={() => setTarget("current")}>Cette semaine</button><button type="button" className={target === "upcoming" ? "is-selected" : ""} aria-pressed={target === "upcoming"} data-testid="target-upcoming" onClick={() => setTarget("upcoming")}>La semaine prochaine</button></div> : null}
    {target === "upcoming" ? <p className="inline-help" data-testid="upcoming-help">La semaine en cours, ses repères et sa liste de courses ne bougent pas. Le nouveau menu prendra le relais lundi prochain.</p> : null}
    <div className="rule-list"><p><CheckIcon /> {profile.mealsPerDay} repas par jour</p><p><CheckIcon /> Au moins 2 repas avec légumineuses</p>{profile.diet === "classic" ? <p><CheckIcon /> Au moins 2 repas avec poisson</p> : null}<p><CheckIcon /> Priorité à la saison et au réemploi</p>{lockedCount ? <p data-testid="generate-locked"><LockClosedIcon /> {lockedCount} repas conservé{lockedCount > 1 ? "s" : ""} à l’identique</p> : null}</div><p className="privacy-note">Génération locale, sans compte. Vos données restent sur cet appareil.</p><button type="button" className="primary-button full-button" onClick={start}>Créer ma semaine</button></> : phase === "loading" ? <div className="generation-state" aria-live="polite"><ReloadIcon className="spin" /><h1>Nous composons votre semaine</h1><p>Budget, variété, saison et temps actif sont vérifiés.</p><div className="loading-line"><span /></div></div> : phase === "success" && result ? <div className="generation-state success-state" aria-live="polite"><CheckCircledIcon /><h1>{target === "upcoming" ? "Semaine prochaine prête" : "Votre semaine est prête"}</h1><p>{result.meals.length} repas uniques pour {profile.people} personne{profile.people > 1 ? "s" : ""}, estimés à {result.estimatedCost.toFixed(0)} € · {formatWeekRange(result.startsOn)}.</p><button type="button" className="primary-button full-button" onClick={() => onComplete(target)}>{target === "upcoming" ? "Revenir à l’accueil" : "Voir ma semaine"}</button></div> : <div className="generation-state error-state" role="alert"><Cross2Icon /><h1>Vos critères sont trop serrés</h1><p>{message}</p><button type="button" className="secondary-button full-button" onClick={() => setPhase("ready")}>Modifier et réessayer</button></div>}
  </main></MobileScroll>;
}

export type RecipeRating = "loved" | "neutral" | "meh" | "avoided";

function RecipeView({ recipe, planned, favorite, onFavorite, onReplace, onPlan, onPortionsChange, onCook, rating = "neutral", onRate, note = "", onNoteChange, onDuplicate }: { recipe: Recipe; planned?: PlannedMeal; favorite: boolean; onFavorite: () => void; onReplace?: () => void; onPlan?: () => void; onPortionsChange?: (portions: number) => void; onCook?: (portions: number) => void; rating?: RecipeRating; onRate?: (rating: RecipeRating) => void; note?: string; onNoteChange?: (note: string) => void; onDuplicate?: () => void }) {
  const [portions, setPortionsState] = useState(planned?.portions ?? 2);
  const setPortions = (update: (value: number) => number) => setPortionsState((value) => {
    const next = Math.min(MAX_MEAL_PORTIONS, Math.max(MIN_MEAL_PORTIONS, update(value)));
    if (next !== value) onPortionsChange?.(next);
    return next;
  });
  const [isFavorite, setIsFavorite] = useState(favorite);
  const ingredients = scaleIngredients(recipe, portions);
  const advance = advancePrepFor(recipe);
  const [catalogueRecipe, setCatalogueRecipe] = useState<CatalogueRecipe | undefined>();
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
  const durationItems = catalogueRecipe ? catalogueDurationItems(catalogueRecipe) : [];
  const toggle = () => { setIsFavorite((value) => !value); onFavorite(); };
  return <MobileScroll className="app-screen"><main className="recipe-page pushed-page"><img className="recipe-hero" src={recipe.image} alt={recipe.title} onError={handleRecipeImageError} /><div className="recipe-content"><span className="eyebrow">{planned ? MEAL_LABELS[planned.mealType] : recipe.mealTypes.map((type) => MEAL_LABELS[type]).join(" · ")}</span><h1>{recipe.title}</h1><div className="recipe-meta"><span><ClockIcon /> {formatRecipeDuration(recipe.prepMinutes)} actives</span><span><PersonIcon /> {portions} portions</span><span>{recipe.diet.includes("vegetarian") ? "Végétarien" : "Classique"}</span></div><p className="recipe-intro">{recipe.description}</p>{durationItems.length ? <section className="catalogue-time-grid" aria-label="Durées de la recette">{durationItems.map((item) => <div key={item.label}><small>{item.label}</small><strong>{formatRecipeDuration(item.minutes)}</strong></div>)}</section> : null}<div className={`recipe-actions ${onReplace || onPlan ? "" : "recipe-actions--single"}`}>{onReplace ? <button type="button" className="secondary-button" onClick={onReplace}><ReloadIcon /> Remplacer</button> : null}{onPlan ? <button type="button" className="secondary-button" data-testid="plan-recipe" onClick={onPlan}><CalendarIcon /> Planifier</button> : null}<button type="button" className={`secondary-button ${isFavorite ? "is-favorite" : ""}`} onClick={toggle}>{isFavorite ? <HeartFilledIcon /> : <HeartIcon />}{isFavorite ? "Enregistrée" : "Ajouter"}</button></div>
    {advance ? <aside className="advance-note" data-testid="advance-note"><ClockIcon /><span><strong>{advanceHeadline(advance)}</strong>{formatRecipeDuration(advance.minutes)} de repos (trempage, prise au froid, marinade ou fermentation) en plus du temps actif.</span></aside> : null}
    <AllergenNotice allergens={recipe.allergens} />
    {catalogueReview?.caution ? <aside className="catalogue-caution"><strong>Repère important</strong><p>{catalogueReview.caution}</p></aside> : null}
    <section className="recipe-section"><div className="section-heading"><h2>Ingrédients</h2><div className="stepper portions-stepper"><button type="button" aria-label="Retirer une portion" onClick={() => setPortions((value) => value - 1)}><MinusIcon /></button><b data-testid="recipe-portions">{portions}</b><button type="button" aria-label="Ajouter une portion" onClick={() => setPortions((value) => value + 1)}><PlusIcon /></button></div></div>{planned ? <p className="inline-help" data-testid="portions-help">Les portions de ce repas et la liste de courses suivent ce réglage.</p> : null}<ul className="ingredient-list">{ingredients.map((item, index) => <li key={`${item.id}-${item.unit}-${index}`}><CheckCircledIcon /><span><strong>{displayQuantity(item.quantity, item.unit)}</strong> {item.name}</span></li>)}</ul></section>
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
      <p className="inline-help">Enregistrée sur cet appareil, jamais transmise.</p>
    </section> : null}
    <section className="recipe-section nutrition-section"><h2>Repères par portion</h2><div><span><strong>{recipe.nutrition.calories}</strong> kcal</span><span><strong>{recipe.nutrition.protein}</strong> g protéines</span><span><strong>{recipe.nutrition.fiber}</strong> g fibres</span></div><small>{recipe.nutrition.note}</small></section>
    {onDuplicate ? <button type="button" className="secondary-button full-button" data-testid="duplicate-recipe" onClick={onDuplicate}><CopyIcon /> Créer ma version de cette recette</button> : null}
    <section className="recipe-section"><div className="section-heading"><h2>Préparation</h2>{onCook ? <button type="button" className="secondary-button cooking-entry" data-testid="start-cooking" onClick={() => onCook(portions)}>Mode cuisine</button> : null}</div><ol className="steps">{recipe.steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol></section><aside className="conservation-note"><ClockIcon /><span><strong>Conservation</strong>{recipe.conservation}</span></aside>
  </div></main></MobileScroll>;
}

function CatalogueRecipeView({ recipe, favorite, onFavorite, onPlan }: { recipe: CatalogueRecipe; favorite: boolean; onFavorite: () => void; onPlan?: () => void }) {
  const [portions, setPortions] = useState(recipe.portions);
  const [isFavorite, setIsFavorite] = useState(favorite);
  const toggleFavorite = () => { setIsFavorite((value) => !value); onFavorite(); };
  const review = reviewFor(recipe);
  const availability = plannerAvailabilityFor(recipe);
  const exclusion = availability.kind ? PLANNER_EXCLUSION_TEXT[availability.kind] : undefined;
  const ratio = portions / Math.max(1, recipe.portions);
  const durationItems = catalogueDurationItems(recipe);
  return <MobileScroll className="app-screen"><main className="catalogue-detail pushed-page">
    <div className="catalogue-detail__hero"><img src={catalogueImageFor(recipe)} alt={recipe.image.alt || recipe.titre} onError={handleRecipeImageError} /><div className="catalogue-detail__hero-copy"><span>{catalogueCategoryName(recipe.categorie)}</span><h1>{recipe.titre}</h1><small>{formatRecipeDuration(recipe.temps.total)} au total · {recipe.difficulte} · {recipe.cout}</small></div></div>
    <div className="recipe-content">
      <div className={`catalogue-verdict is-${review.status}`}><span>{review.status === "validated" ? "Profil cohérent" : "Validée avec repères"}</span><p>{review.summary}</p></div>
      <div className={`recipe-actions ${onPlan ? "" : "recipe-actions--single"}`}>{onPlan ? <button type="button" className="secondary-button" data-testid="catalogue-plan" onClick={onPlan}><CalendarIcon /> Planifier</button> : null}<button type="button" className={`secondary-button ${isFavorite ? "is-favorite" : ""}`} data-testid="catalogue-favorite" aria-pressed={isFavorite} onClick={toggleFavorite}>{isFavorite ? <HeartFilledIcon /> : <HeartIcon />}{isFavorite ? "Enregistrée" : "Ajouter aux favoris"}</button></div>
      {durationItems.length ? <section className="catalogue-time-grid" aria-label="Durées de la recette">{durationItems.map((item) => <div key={item.label}><small>{item.label}</small><strong>{formatRecipeDuration(item.minutes)}</strong></div>)}</section> : null}
      {exclusion ? <aside className="planner-exclusion" data-testid="planner-exclusion"><strong>{exclusion.title}</strong><p>{exclusion.body}</p></aside> : null}
      {review.caution ? <aside className="catalogue-caution"><strong>À savoir</strong><p>{review.caution}</p></aside> : null}
      <AllergenNotice allergens={recipe.app.planner.allergens} />
      <p className="catalogue-disclaimer">Cette appréciation concerne la composition globale de la recette. Elle ne prouve pas qu'un ingrédient isolé prévient ou traite une inflammation.</p>
      <section className="recipe-section"><div className="section-heading"><h2>Ingrédients</h2><div className="stepper portions-stepper"><button type="button" aria-label="Retirer une portion" onClick={() => setPortions((value) => Math.max(1, value - 1))}><MinusIcon /></button><b>{portions}</b><button type="button" aria-label="Ajouter une portion" onClick={() => setPortions((value) => Math.min(8, value + 1))}><PlusIcon /></button></div></div><ul className="ingredient-list">{recipe.ingredients.map((item, index) => <li key={`${item.nom}-${item.unite}-${index}`}><CheckCircledIcon /><span><strong>{displayCatalogueQuantity(item.quantite * ratio, item.unite)}</strong> {item.nom}{item.note ? <small>{item.note}</small> : null}</span></li>)}</ul></section>
      <section className="recipe-section nutrition-section"><h2>Estimations par portion</h2><div><span><strong>{recipe.nutrition_par_portion.calories}</strong> kcal</span><span><strong>{recipe.nutrition_par_portion.proteines_g}</strong> g protéines</span><span><strong>{recipe.nutrition_par_portion.fibres_g}</strong> g fibres</span></div><small>Valeurs estimatives à titre indicatif; elles varient selon les produits et la préparation.</small></section>
      <section className="recipe-section"><h2>Repères présents</h2><div className="compound-list">{recipe.composes_actifs.map((item) => <span key={`${item.aliment}-${item.compose}`}><strong>{item.aliment}</strong><small>{item.compose}</small></span>)}</div><p className="catalogue-disclaimer">Ces composés sont documentés dans les aliments, mais leur présence ne garantit pas un bénéfice clinique individuel.</p></section>
      <section className="recipe-section"><h2>Préparation</h2><ol className="steps">{recipe.etapes.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol></section>
      {recipe.substitutions.length ? <section className="recipe-section"><h2>Substitutions</h2><div className="substitution-list">{recipe.substitutions.map((item) => <p key={`${item.remplacer}-${item.par}`}><strong>{item.remplacer}</strong><ChevronRightIcon /><span>{item.par}<small>{item.note}</small></span></p>)}</div></section> : null}
      <aside className="conservation-note"><ClockIcon /><span><strong>Conservation</strong>{recipe.conservation}</span></aside>
      <p className="catalogue-legal">{CATALOGUE_SUMMARY.avertissement}</p>
    </div>
  </main></MobileScroll>;
}

function ReplaceView({ plan, current, profile, onConfirm }: { plan: WeeklyPlan; current: PlannedMeal; profile: UserProfile; onConfirm: (recipe: Recipe, options: { dislikeCurrent: boolean }) => void }) {
  const [reason, setReason] = useState("Plus rapide");
  const [dislikeCurrent, setDislikeCurrent] = useState(false);
  const candidates = getReplacementCandidates(plan, current.id, ACTIVE_RECIPES, profile, reason).slice(0, 5);
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null);
  useEffect(() => { setSelectedId(candidates[0]?.id ?? null); }, [reason]);
  const selected = candidates.find((recipe) => recipe.id === selectedId);
  const currentRecipe = recipeById.get(current.recipeId);
  return <MobileScroll className="app-screen"><main className="page-content pushed-page replace-page"><div className="page-heading"><span className="eyebrow">À la place de</span><h1>{currentRecipe?.title}</h1><p>Les allergies, le régime et le temps actif maximum restent strictement respectés.</p></div><Carousel ariaLabel="Motif du remplacement" className="reason-carousel" contentClassName="reason-carousel__track">{["Plus rapide", "Moins cher", "Végétarien", "Autres ingrédients", "Réutiliser mes ingrédients"].map((item) => <button type="button" className={`reason-chip ${reason === item ? "is-selected" : ""}`} key={item} data-testid={`reason-${normalizeText(item).replace(/\s+/g, "-")}`} onClick={() => setReason(item)}>{item}</button>)}</Carousel><div className="replacement-list">{candidates.map((recipe) => <button type="button" key={recipe.id} className={`replacement-card ${selectedId === recipe.id ? "is-selected" : ""}`} onClick={() => setSelectedId(recipe.id)}><img src={recipe.image} alt="" onError={handleRecipeImageError} /><span><small>{formatRecipeDuration(recipe.prepMinutes)} actives · {recipe.costPerPortion.toFixed(2).replace(".", ",")} €/portion</small><strong>{recipe.title}</strong><em>{recipe.description}</em></span><i>{selectedId === recipe.id ? <CheckIcon /> : null}</i></button>)}</div>{currentRecipe ? <button type="button" className={`dislike-toggle ${dislikeCurrent ? "is-selected" : ""}`} aria-pressed={dislikeCurrent} data-testid="dislike-current" onClick={() => setDislikeCurrent((value) => !value)}><span className="dislike-toggle__box" aria-hidden="true">{dislikeCurrent ? <CheckIcon /> : null}</span><span><strong>Ne plus me proposer « {currentRecipe.title} »</strong><small>La recette est écartée des prochaines semaines. Réversible depuis votre profil.</small></span></button> : null}{selected ? <button type="button" className="primary-button full-button" onClick={() => onConfirm(selected, { dislikeCurrent })}>Choisir ce repas</button> : <p className="notice-banner">Aucune alternative compatible avec ces critères.</p>}</main></MobileScroll>;
}

function AppShell({ flow }: { flow: FlowControls }) {
  const [tab, setTab] = useState<TabId>("home");
  const [appState, setAppState] = useState<AppState>(DEFAULT_APP_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [archivedWeek, setArchivedWeek] = useState<WeeklyPlan | null>(null);
  const { offline, canInstall, install, updateReady, reload } = useInstallAndConnectivity();
  /**
   * FlowStack renders pushed screens from the closure they were created in, and
   * AppShell state changes do not re-render them. Their handlers must therefore
   * read the live state here instead of a plan captured at push time.
   */
  const stateRef = useRef(appState);
  stateRef.current = appState;
  useRecipeRegistry(appState.customRecipes);

  const rateRecipe = (recipeId: string, rating: RecipeRating) => setAppState((current) => {
    const favorites = current.favoriteRecipeIds.filter((id) => id !== recipeId);
    const disliked = current.profile.dislikedRecipeIds.filter((id) => id !== recipeId);
    const softDisliked = current.profile.softDislikedRecipeIds.filter((id) => id !== recipeId);
    return {
      ...current,
      favoriteRecipeIds: rating === "loved" ? [...favorites, recipeId] : favorites,
      profile: {
        ...current.profile,
        dislikedRecipeIds: rating === "avoided" ? [...disliked, recipeId] : disliked,
        softDislikedRecipeIds: rating === "meh" ? [...softDisliked, recipeId] : softDisliked,
      },
    };
  });
  const ratingOf = (recipeId: string): RecipeRating => {
    const live = stateRef.current;
    if (live.profile.dislikedRecipeIds.includes(recipeId)) return "avoided";
    if (live.profile.softDislikedRecipeIds.includes(recipeId)) return "meh";
    if (live.favoriteRecipeIds.includes(recipeId)) return "loved";
    return "neutral";
  };
  const setRecipeNote = (recipeId: string, note: string) => setAppState((current) => {
    const notes = { ...current.recipeNotes };
    if (note.trim()) notes[recipeId] = note.slice(0, 2000); else delete notes[recipeId];
    return { ...current, recipeNotes: notes };
  });
  const saveCustomRecipe = (recipe: Recipe) => setAppState((current) => ({
    ...current,
    customRecipes: [...current.customRecipes.filter((item) => item.id !== recipe.id), recipe],
  }));
  const deleteCustomRecipe = (recipeId: string) => setAppState((current) => ({
    ...current,
    customRecipes: current.customRecipes.filter((item) => item.id !== recipeId),
    favoriteRecipeIds: current.favoriteRecipeIds.filter((id) => id !== recipeId),
  }));
  const [catalogue, setCatalogue] = useState<CatalogueData | null>(null);
  const [catalogueError, setCatalogueError] = useState(false);
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  const ensureCatalogue = useCallback(() => {
    if (catalogue) return;
    setCatalogueError(false);
    void loadCatalogue().then(setCatalogue).catch(() => setCatalogueError(true));
  }, [catalogue, catalogueAttempt]);
  const retryCatalogue = useCallback(() => {
    setCatalogueError(false);
    setCatalogueAttempt((value) => value + 1);
    void loadCatalogue().then(setCatalogue).catch(() => setCatalogueError(true));
  }, []);

  useEffect(() => {
    let active = true;
    void loadAppState().then((stored) => {
      if (!active) return;
      // Catalogue-only favourites are kept: they are resolved once the lazy
      // catalogue chunk is loaded by the favourites tab.
      const validFavorites = stored.favoriteRecipeIds.filter((id) => recipeById.has(id) || id.startsWith("catalog-"));
      const today = isoDate(new Date());
      const expired = stored.currentPlan;
      // A finished week must not keep posing as the current one: archive it, and
      // promote the week prepared in advance if it covers the days ahead.
      if (expired && isPlanExpired(expired, today)) {
        const promoted = stored.upcomingPlan && !isPlanExpired(stored.upcomingPlan, today) ? stored.upcomingPlan : null;
        setArchivedWeek(expired);
        setAppState({
          ...stored,
          favoriteRecipeIds: validFavorites,
          currentPlan: promoted,
          upcomingPlan: null,
          history: [expired, ...stored.history.filter((item) => item.id !== expired.id)].slice(0, HISTORY_LIMIT),
          checkedShoppingItemIds: [],
        });
      } else if (!expired && stored.upcomingPlan && !isPlanExpired(stored.upcomingPlan, today) && planDayOffset(stored.upcomingPlan, today) >= 0) {
        setAppState({ ...stored, favoriteRecipeIds: validFavorites, currentPlan: stored.upcomingPlan, upcomingPlan: null });
      } else {
        setAppState({ ...stored, favoriteRecipeIds: validFavorites });
      }
      setHydrated(true);
    });
    void registerOfflineSupport();
    return () => { active = false; };
  }, []);

  useEffect(() => { if (hydrated) void saveAppState(appState); }, [appState, hydrated]);

  // Local reminder for dishes that must be started the day before. Fires once
  // per day, only while the app is open: nothing is scheduled on a server.
  const remindedOn = useRef<string>("");
  useEffect(() => {
    if (!hydrated || !appState.remindersEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const today = isoDate(new Date());
    if (remindedOn.current === today) return;
    const due = mealsToStartTonight(appState.currentPlan, ACTIVE_RECIPES, today);
    if (!due.length) return;
    remindedOn.current = today;
    new Notification("À lancer ce soir", {
      body: due.map((item) => `${item.recipe.title} — ${formatRecipeDuration(item.minutes)} de repos`).join("\n"),
      tag: `inflamm-menu-${today}`,
    });
  }, [hydrated, appState.remindersEnabled, appState.currentPlan]);

  const toggleFavorite = (id: string) => setAppState((current) => ({ ...current, favoriteRecipeIds: current.favoriteRecipeIds.includes(id) ? current.favoriteRecipeIds.filter((entry) => entry !== id) : [...current.favoriteRecipeIds, id] }));
  const toggleChecked = (id: string) => setAppState((current) => {
    const checked = current.checkedShoppingItemIds.some((entry) => storedShoppingItemMatches(entry, id));
    const withoutIngredient = current.checkedShoppingItemIds.filter((entry) => !storedShoppingItemMatches(entry, id));
    return { ...current, checkedShoppingItemIds: checked ? withoutIngredient : [...withoutIngredient, canonicalIngredientId(id)] };
  });
  const togglePantry = (id: string) => setAppState((current) => {
    const canonical = canonicalIngredientId(id);
    const inPantry = current.pantryIngredientIds.some((entry) => canonicalIngredientId(entry) === canonical);
    const withoutIngredient = current.pantryIngredientIds.filter((entry) => canonicalIngredientId(entry) !== canonical);
    return { ...current, pantryIngredientIds: inPantry ? withoutIngredient : [...withoutIngredient, canonical] };
  });

  function createPlan(target: "current" | "upcoming" = "current"): WeeklyPlan {
    const live = stateRef.current;
    const monday = mondayOf();
    if (target === "upcoming") monday.setDate(monday.getDate() + 7);
    const plan = makePlan(
      live.profile,
      // Preparing next week never disturbs the running one.
      target === "upcoming" ? [] : preservableLockedMeals(live.currentPlan, ACTIVE_RECIPES, live.profile),
      live.favoriteRecipeIds,
      Date.now(),
      isoDate(monday),
    );
    setAppState((current) => (target === "upcoming"
      ? { ...current, upcomingPlan: plan }
      : {
          ...current,
          currentPlan: plan,
          history: current.currentPlan ? [current.currentPlan, ...current.history].slice(0, HISTORY_LIMIT) : current.history,
          checkedShoppingItemIds: [],
        }));
    return plan;
  }

  /**
   * Applies a change to the running week. Ticked shopping items are kept when
   * they still belong to the list, so editing a meal in the shop is harmless.
   */
  const withUpdatedPlan = (current: AppState, plan: WeeklyPlan): AppState => ({
    ...current,
    currentPlan: plan,
    checkedShoppingItemIds: reconcileCheckedItems(plan, ACTIVE_RECIPES, current.checkedShoppingItemIds),
  });

  const toggleMealLock = (planned: PlannedMeal) => setAppState((current) => (current.currentPlan
    ? { ...current, currentPlan: setPlannedMealLock(current.currentPlan, planned.id, planned.locked !== true) }
    : current));
  const setPantryAmount = (id: string, amount: PantryAmount | null) => setAppState((current) => {
    const amounts = { ...current.pantryAmounts };
    if (amount) amounts[id] = amount; else delete amounts[id];
    return { ...current, pantryAmounts: amounts };
  });
  const moveCategory = (category: IngredientCategory, direction: -1 | 1) => setAppState((current) => {
    const order = [...current.shoppingCategoryOrder];
    const index = order.indexOf(category);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return current;
    [order[index], order[target]] = [order[target], order[index]];
    return { ...current, shoppingCategoryOrder: order };
  });
  const setSpent = (amount: number | null) => setAppState((current) => {
    if (!current.currentPlan) return current;
    const spend = { ...current.actualSpend };
    if (amount === null) delete spend[current.currentPlan.id]; else spend[current.currentPlan.id] = amount;
    return { ...current, actualSpend: spend };
  });
  const toggleMealSkipped = (planned: PlannedMeal) => setAppState((current) => (current.currentPlan
    ? withUpdatedPlan(current, setMealSkipped(current.currentPlan, planned.id, planned.skipped !== true, ACTIVE_RECIPES))
    : current));
  const toggleMealCompleted = (planned: PlannedMeal) => setAppState((current) => (current.currentPlan
    ? { ...current, currentPlan: setPlannedMealCompleted(current.currentPlan, planned.id, planned.completed !== true) }
    : current));

  function replacementScreen(planned: PlannedMeal): FlowScreen {
    return { id: `replace-${planned.id}`, title: "Remplacer le repas", headerHeight: 56, header: (route) => <Header title="Remplacer" onBack={route.pop} />, render: (route) => {
      const plan = stateRef.current.currentPlan;
      if (!plan) return <EmptyRoot icon={CalendarIcon} title="Semaine indisponible" body="Cette semaine n’est plus au menu." />;
      return <ReplaceView plan={plan} current={planned} profile={stateRef.current.profile} onConfirm={(recipe, options) => {
        let updatedMeal = planned;
        setAppState((current) => {
          if (!current.currentPlan) return current;
          const updatedPlan = replacePlannedMeal(current.currentPlan, planned.id, recipe, ACTIVE_RECIPES);
          updatedMeal = updatedPlan.meals.find((meal) => meal.id === planned.id) ?? planned;
          return {
            ...withUpdatedPlan(current, updatedPlan),
            profile: options.dislikeCurrent && !current.profile.dislikedRecipeIds.includes(planned.recipeId)
              ? { ...current.profile, dislikedRecipeIds: [...current.profile.dislikedRecipeIds, planned.recipeId] }
              : current.profile,
          };
        });
        route.replace(recipeScreen(recipe, updatedMeal));
      }} />;
    } };
  }

  function planSlotScreen(recipe: Recipe): FlowScreen {
    return { id: `plan-${recipe.id}`, title: "Planifier", headerHeight: 56, header: (route) => <Header title="Planifier" onBack={route.pop} />, render: (route) => {
      const plan = stateRef.current.currentPlan;
      if (!plan) return <EmptyRoot icon={CalendarIcon} title="Aucune semaine" body="Générez une semaine avant d’y placer une recette." />;
      return <PlanSlotView plan={plan} recipe={recipe} profile={stateRef.current.profile} onConfirm={(slot) => {
        const live = stateRef.current;
        if (!live.currentPlan) return "Cette semaine n’est plus disponible.";
        try {
          const updated = assignRecipeToSlot(live.currentPlan, slot, recipe, ACTIVE_RECIPES, live.profile);
          setAppState((current) => withUpdatedPlan(current, updated));
          setTab("week");
          route.pop();
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Impossible de planifier cette recette.";
        }
      }} />;
    } };
  }

  function customRecipeScreen(draft: Recipe, existing = false): FlowScreen {
    return { id: `custom-${draft.id}`, title: "Ma version", headerHeight: 56, header: (route) => <Header title="Ma version" onBack={route.pop} />, render: (route) => <CustomRecipeView draft={draft} onSave={(recipe) => { saveCustomRecipe(recipe); route.replace(recipeScreen(recipe)); }} onDelete={existing ? () => { deleteCustomRecipe(draft.id); route.pop(); } : undefined} /> };
  }

  function cookingScreen(recipe: Recipe, portions: number): FlowScreen {
    return { id: `cooking-${recipe.id}`, title: "Mode cuisine", headerHeight: 56, header: (route) => <Header title="Mode cuisine" onBack={route.pop} />, render: () => <CookingView recipe={recipe} portions={portions} /> };
  }

  function recipeScreen(recipe: Recipe, planned?: PlannedMeal): FlowScreen {
    return { id: `recipe-${planned?.id ?? recipe.id}`, title: recipe.title, headerHeight: 56, header: (route) => <Header title="Recette" onBack={route.pop} />, render: (route) => <RecipeView recipe={recipe} planned={planned} favorite={stateRef.current.favoriteRecipeIds.includes(recipe.id)} onFavorite={() => toggleFavorite(recipe.id)} rating={ratingOf(recipe.id)} onRate={(rating) => rateRecipe(recipe.id, rating)} note={stateRef.current.recipeNotes[recipe.id] ?? ""} onNoteChange={(note) => setRecipeNote(recipe.id, note)} onDuplicate={() => route.push(customRecipeScreen(customRecipeFrom(recipe)))} onReplace={planned ? () => route.replace(replacementScreen(planned)) : undefined} onPlan={!planned ? () => route.push(planSlotScreen(recipe)) : undefined} onPortionsChange={planned ? (portions) => setAppState((current) => (current.currentPlan ? withUpdatedPlan(current, setMealPortions(current.currentPlan, planned.id, portions, ACTIVE_RECIPES)) : current)) : undefined} onCook={(portions) => route.push(cookingScreen(recipe, portions))} /> };
  }

  function replayPlan(plan: WeeklyPlan): void {
    setAppState((current) => {
      const restored = restorePlan(plan, ACTIVE_RECIPES, current.profile, {
        startsOn: isoDate(mondayOf()),
        generatedAt: new Date().toISOString(),
      });
      return {
        ...current,
        currentPlan: restored,
        history: current.currentPlan
          ? [current.currentPlan, ...current.history.filter((item) => item.id !== current.currentPlan?.id)].slice(0, HISTORY_LIMIT)
          : current.history,
        checkedShoppingItemIds: [],
      };
    });
  }

  function historyPlanScreen(plan: WeeklyPlan): FlowScreen {
    return { id: `history-${plan.id}`, title: formatWeekRange(plan.startsOn), headerHeight: 56, header: (route) => <Header title="Semaine archivée" onBack={route.pop} />, render: (route) => <HistoryPlanView plan={plan} profile={stateRef.current.profile} onOpenRecipe={(recipe) => route.push(recipeScreen(recipe))} onReplay={() => { replayPlan(plan); setTab("week"); route.pop(); }} /> };
  }

  function catalogueRecipeScreen(recipe: CatalogueRecipe): FlowScreen {
    const favoriteId = catalogueFavoriteId(recipe);
    const projected = recipeById.get(favoriteId);
    return { id: `catalogue-${recipe.id}`, title: recipe.titre, headerHeight: 56, header: (route) => <Header title="Recette vérifiée" onBack={route.pop} />, render: (route) => <CatalogueRecipeView recipe={recipe} favorite={stateRef.current.favoriteRecipeIds.includes(favoriteId)} onFavorite={() => toggleFavorite(favoriteId)} onPlan={projected ? () => route.push(planSlotScreen(projected)) : undefined} /> };
  }

  const informationScreen = (): FlowScreen => ({ id: "information", title: "Informations", headerHeight: 56, header: (route) => <Header title="Informations" onBack={route.pop} />, render: () => <InformationView state={stateRef.current} onRestore={(restored) => { setArchivedWeek(null); setAppState(restored); }} onTextScale={(textScale) => setAppState((current) => ({ ...current, textScale }))} onReminders={(remindersEnabled) => setAppState((current) => ({ ...current, remindersEnabled }))} /> });
  const openProfile = () => flow.push({ id: "profile", title: "Profil alimentaire", headerHeight: 56, header: (route) => <Header title="Mon profil" onBack={route.pop} />, render: (route) => <ProfileView initial={appState.profile} onOpenInformation={() => route.push(informationScreen())} onSave={(profile) => { setAppState((current) => ({ ...current, profile, onboardingCompleted: true })); route.pop(); }} /> });
  const openGenerate = () => flow.push({ id: "generate", title: "Générer ma semaine", headerHeight: 56, header: (route) => <Header title="Nouvelle semaine" onBack={route.pop} />, render: (route) => <GenerateView profile={stateRef.current.profile} lockedCount={preservableLockedMeals(stateRef.current.currentPlan, ACTIVE_RECIPES, stateRef.current.profile).length} canPrepareNext={Boolean(stateRef.current.currentPlan)} onCreate={createPlan} onComplete={(target) => { if (target === "current") setTab("week"); route.pop(); }} /> });
  function leftoverScreen(planned: PlannedMeal, recipe: Recipe): FlowScreen {
    return { id: `leftover-${planned.id}`, title: "Restes", headerHeight: 56, header: (route) => <Header title="Cuisiner en double" onBack={route.pop} />, render: (route) => {
      const plan = stateRef.current.currentPlan;
      if (!plan) return <EmptyRoot icon={ArchiveIcon} title="Aucune semaine" body="Générez une semaine avant de prévoir des restes." />;
      return <LeftoverView plan={plan} source={planned} recipe={recipe} onConfirm={(targetSlotId) => {
        const live = stateRef.current.currentPlan;
        if (!live) return "Cette semaine n’est plus disponible.";
        try {
          const updated = planLeftover(live, planned.id, targetSlotId, ACTIVE_RECIPES);
          setAppState((current) => withUpdatedPlan(current, updated));
          route.pop();
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Impossible de replanifier ces restes.";
        }
      }} />;
    } };
  }

  function swapScreen(planned: PlannedMeal): FlowScreen {
    return { id: `swap-${planned.id}`, title: "Échanger", headerHeight: 56, header: (route) => <Header title="Échanger" onBack={route.pop} />, render: (route) => {
      const plan = stateRef.current.currentPlan;
      if (!plan) return <EmptyRoot icon={CalendarIcon} title="Aucune semaine" body="Générez une semaine avant de déplacer un repas." />;
      return <SwapView plan={plan} source={planned} onConfirm={(targetSlotId) => {
        const live = stateRef.current.currentPlan;
        if (!live) return "Cette semaine n’est plus disponible.";
        try {
          const updated = swapPlannedMeals(live, planned.id, targetSlotId);
          setAppState((current) => withUpdatedPlan(current, updated));
          route.pop();
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Échange impossible.";
        }
      }} />;
    } };
  }

  const openSwap = (planned: PlannedMeal) => flow.push(swapScreen(planned));
  const openMeal = (planned: PlannedMeal, recipe: Recipe) => flow.push(recipeScreen(recipe, planned));
  const openLeftover = (planned: PlannedMeal) => flow.push(leftoverScreen(planned, recipeById.get(planned.recipeId) as Recipe));
  const openReplace = (planned: PlannedMeal) => flow.push(replacementScreen(planned));
  const currentView = useMemo(() => {
    if (tab === "week") return <WeekView plan={appState.currentPlan} onOpenMeal={openMeal} onReplace={openReplace} onToggleLock={toggleMealLock} onToggleCompleted={toggleMealCompleted} onPlanLeftover={openLeftover} onToggleSkipped={toggleMealSkipped} onSwap={openSwap} />;
    if (tab === "courses") return <CoursesView plan={appState.currentPlan} profile={appState.profile} checkedIds={appState.checkedShoppingItemIds} pantryIds={appState.pantryIngredientIds} pantryAmounts={appState.pantryAmounts} categoryOrder={appState.shoppingCategoryOrder} spent={appState.currentPlan ? appState.actualSpend[appState.currentPlan.id] : undefined} onToggleChecked={toggleChecked} onTogglePantry={togglePantry} onSetPantryAmount={setPantryAmount} onMoveCategory={moveCategory} onSetSpent={setSpent} />;
    if (tab === "favorites") return <FavoritesView favoriteIds={appState.favoriteRecipeIds} history={appState.history} catalogue={catalogue} catalogueError={catalogueError} onLoadCatalogue={ensureCatalogue} onRetryCatalogue={retryCatalogue} onOpenRecipe={(recipe) => flow.push(recipeScreen(recipe))} onOpenCatalogue={(recipe) => flow.push(catalogueRecipeScreen(recipe))} onOpenHistory={(plan) => flow.push(historyPlanScreen(plan))} onDeleteHistory={(plan) => setAppState((current) => ({ ...current, history: current.history.filter((item) => item.id !== plan.id) }))} />;
    if (!appState.onboardingCompleted) return <OnboardingView profile={appState.profile} onOpenProfile={openProfile} onSkip={() => setAppState((current) => ({ ...current, onboardingCompleted: true }))} />;
    return <HomeView profile={appState.profile} plan={appState.currentPlan} archivedWeek={archivedWeek} upcomingPlan={appState.upcomingPlan} onGenerate={openGenerate} onProfile={openProfile} onOpenMeal={openMeal} onOpenWeek={() => setTab("week")} />;
  }, [tab, appState, archivedWeek, catalogue, catalogueError, ensureCatalogue, retryCatalogue]);

  return <div className={`app-shell ${appState.textScale === "large" ? "is-large-text" : ""}`} data-text-scale={appState.textScale}>
    {offline ? <p className="offline-strip" role="status" data-testid="offline-strip">Hors ligne : votre semaine, vos recettes planifiées et vos courses restent disponibles. Le catalogue complet demande une connexion s’il n’a pas été téléchargé.</p> : null}
    <MobileScroll className="app-screen"><div className="root-scroll-content">
      {!hydrated ? <div className="app-loading"><ReloadIcon className="spin" /><span>Chargement local…</span></div> : <>
        {updateReady ? <div className="install-banner update-banner" data-testid="update-banner"><span><strong>Nouvelle version disponible</strong><small>Rechargez pour éviter les erreurs d’affichage ; vos données locales sont conservées.</small></span><button type="button" className="primary-button" data-testid="update-reload" onClick={reload}>Recharger</button></div> : null}
        {canInstall ? <div className="install-banner" data-testid="install-banner"><span><strong>Installer Inflamm’Menu</strong><small>Accès plein écran et hors connexion, sans compte ni magasin d’applications.</small></span><button type="button" className="primary-button" data-testid="install-app" onClick={() => void install()}>Installer</button></div> : null}
        {currentView}
      </>}
    </div></MobileScroll>
    <BottomNav active={tab} onChange={setTab} />
  </div>;
}

export default function Prototype() {
  const initial = useMemo<FlowScreen>(() => ({ id: "root", render: (flow) => <AppShell flow={flow} /> }), []);
  return <FlowStack initial={initial} />;
}
