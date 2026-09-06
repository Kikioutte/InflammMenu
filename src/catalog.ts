import catalogueSummarySource from "./data/catalogue-summary.json" with { type: "json" };
import generatedRecipeImages from "./data/generated-recipe-images.json" with { type: "json" };
import type { DietMode, Equipment, IngredientCategory, IngredientUnit, MealType } from "./domain.ts";

export type CatalogueReviewStatus = "validated" | "caution";
export type CreamiProgram = "ICE CREAM" | "LITE ICE CREAM" | "SORBET" | "GELATO" | "FROZEN YOGURT";
export type CatalogueSeason = "printemps" | "ete" | "automne" | "hiver" | "toute-annee";
export type CatalogueWeeklyTarget = "pulse" | "finfish" | "seafood";

export interface CatalogueRecipeReview {
  status: CatalogueReviewStatus;
  summary: string;
  caution?: string;
}

export interface CatalogueIngredient {
  /** Canonical shopping-list identifier introduced by catalogue schema v2.1. */
  id?: string;
  quantite: number;
  unite: string;
  /** Normalized quantity/unit pair introduced by schema v2.1. */
  quantite_normalisee?: number;
  unite_normalisee?: IngredientUnit;
  facultatif?: boolean;
  nom: string;
  note: string;
  categorie_courses: IngredientCategory;
  allergenes: string[];
  pantry_staple?: boolean;
}

export interface CatalogueProvenanceSource {
  kind: "nutrition" | "cost" | "inspiration" | "safety";
  title: string;
  url?: string;
  version?: string;
  accessed_at: string;
}

export interface CatalogueProvenance {
  type: "original" | "adapted";
  author: string;
  license: string;
  created_at: string;
  reviewed_at?: string;
  sources: CatalogueProvenanceSource[];
}

export interface CatalogueRecipe {
  id: string;
  slug: string;
  titre: string;
  categorie: string;
  description: string;
  temps: { preparation: number; cuisson: number; repos: number; total: number };
  portions: number;
  difficulte: "facile" | "intermediaire" | "avance";
  cout: "economique" | "moyen" | "eleve";
  regimes: string[];
  saisons: CatalogueSeason[];
  tags: string[];
  /** Dedicated culinary tools required by the recipe, including appliances that
   * are not part of the weekly planner profile. */
  materiel?: string[];
  creami?: {
    modele: "Ninja CREAMi Deluxe (NC501EU)";
    programme: CreamiProgram;
    zone: "FULL";
  };
  composes_actifs: Array<{ aliment: string; compose: string; action: string }>;
  ingredients: CatalogueIngredient[];
  etapes: string[];
  conseils: string[];
  substitutions: Array<{ remplacer: string; par: string; note: string }>;
  conservation: string;
  nutrition_par_portion: {
    calories: number;
    proteines_g: number;
    glucides_g: number;
    sucres_g: number | null;
    lipides_g: number;
    acides_gras_satures_g: number | null;
    fibres_g: number;
    sodium_mg: number | null;
  };
  score_anti_inflammatoire: number | null;
  image: { nom_fichier: string; alt: string };
  /** Required for schema v2.1 recipes; optional while reading the v2 catalogue. */
  provenance?: CatalogueProvenance;
  app: {
    review: CatalogueRecipeReview;
    duplicate_of?: string;
    planner: {
      eligible: boolean;
      meal_types: MealType[];
      diets: DietMode[];
      cost_per_portion_eur: number;
      equipment: Equipment[];
      allergens: string[];
      /** Exact editorial classifications used by the weekly objectives;
       * required in schema v2.1 and optional while reading schema v2.0. */
      targets?: CatalogueWeeklyTarget[];
      /** Hands-on preparation time; required by schema v2.1. */
      active_minutes?: number;
    };
  };
}

export interface CatalogueData {
  meta: { schema_version: "2.0.0" | "2.1.0"; avertissement: string; licence: string; nombre_recettes: number };
  categories: Array<{ id: string; nom: string; description: string }>;
  recipes: CatalogueRecipe[];
}

export const CATALOGUE_SUMMARY = catalogueSummarySource;
export const CATALOGUE_CATEGORIES = CATALOGUE_SUMMARY.categories;
export const DUPLICATE_CATALOGUE_RECIPES = {
  r001: "overnight-oats-myrtilles-noix",
  r009: "bowl-quinoa-legumes-houmous",
  r017: "bowl-tofu-brocoli-sesame",
  r018: "cabillaud-tomate-olives",
  r019: "risotto-orge-champignons-epinards",
  r039: "salade-betterave-chevre-lentilles",
} as const;
let cataloguePromise: Promise<CatalogueData> | null = null;
const catalogueUrl = new URL("./data/recettes-anti-inflammatoires.json", import.meta.url).href;
export const CATALOGUE_CACHE_NAME = "inflamm-menu-catalogue-v2";
const LEGACY_CATALOGUE_CACHE_NAME = "inflamm-menu-catalogue-v1";
const plannerCautionsUrl = typeof window === "undefined"
  ? "/data/planner-cautions.json"
  : `${import.meta.env.BASE_URL}data/planner-cautions.json`;
let plannerCautionsPromise: Promise<Record<string, string>> | null = null;
let catalogueValidationPromise: Promise<typeof import("./catalog-validation.ts")> | null = null;

function loadCatalogueValidation(): Promise<typeof import("./catalog-validation.ts")> {
  catalogueValidationPromise ??= import("./catalog-validation.ts").catch((error: unknown) => {
    catalogueValidationPromise = null;
    throw error;
  });
  return catalogueValidationPromise;
}

export function loadPlannerCaution(recipeId: string): Promise<string | undefined> {
  plannerCautionsPromise ??= fetch(plannerCautionsUrl, { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error(`Précautions indisponibles (${response.status})`);
      return response.json().then(async (value: unknown) => (await loadCatalogueValidation()).validatePlannerCautions(value));
    })
    .catch((error) => { plannerCautionsPromise = null; throw error; });
  return plannerCautionsPromise.then((cautions) => cautions[recipeId]);
}

function parseCatalogueResponse(response: Response): Promise<CatalogueData> {
  if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
  return response.json().then(async (value: unknown) => (await loadCatalogueValidation()).validateCatalogueData(value));
}

async function readValidatedCatalogueCacheEntry(cache: Cache): Promise<{ data: CatalogueData; response: Response } | null> {
  const response = await cache.match(catalogueUrl);
  if (!response) return null;

  // Load failures for the validator chunk are transient and must never delete
  // an otherwise healthy offline copy. Only parsing/schema failures invalidate
  // the cached catalogue.
  const { validateCatalogueData } = await loadCatalogueValidation();
  const migratable = response.clone();
  try {
    if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
    return { data: validateCatalogueData(await response.json() as unknown), response: migratable };
  } catch {
    try { await cache.delete(catalogueUrl); } catch { /* The invalid entry still cannot be exposed. */ }
    return null;
  }
}

async function loadValidatedCachedCatalogue(): Promise<CatalogueData | null> {
  if (typeof caches === "undefined") return null;
  const currentCache = await caches.open(CATALOGUE_CACHE_NAME);
  const current = await readValidatedCatalogueCacheEntry(currentCache);
  if (current) return current.data;

  // v1 could contain either an explicitly downloaded catalogue or an
  // unchecked network response from the previous worker. Validate it first,
  // then migrate only the healthy case so updates preserve offline access.
  const legacyCache = await caches.open(LEGACY_CATALOGUE_CACHE_NAME);
  const legacy = await readValidatedCatalogueCacheEntry(legacyCache);
  if (!legacy) {
    try { await caches.delete(LEGACY_CATALOGUE_CACHE_NAME); } catch { /* Best-effort cleanup. */ }
    return null;
  }
  try {
    await currentCache.put(catalogueUrl, legacy.response);
    await caches.delete(LEGACY_CATALOGUE_CACHE_NAME);
  } catch {
    // The validated legacy entry remains readable if quota blocks migration.
  }
  return legacy.data;
}

async function fetchCatalogueWithValidatedFallback(): Promise<CatalogueData> {
  try {
    const response = await fetch(catalogueUrl, { headers: { Accept: "application/json" } });
    return await parseCatalogueResponse(response);
  } catch (error) {
    const cached = await loadValidatedCachedCatalogue();
    if (cached) return cached;
    throw error;
  }
}

export function loadCatalogue(): Promise<CatalogueData> {
  cataloguePromise ??= fetchCatalogueWithValidatedFallback()
    .catch((error: unknown) => {
      cataloguePromise = null;
      throw error instanceof Error ? error : new Error("Catalogue indisponible");
    });
  return cataloguePromise;
}

/** Downloads and verifies the full catalogue, then stores the exact response in Cache Storage. */
export async function cacheCatalogueForOffline(): Promise<CatalogueData> {
  const response = await fetch(catalogueUrl, {
    cache: "reload",
    headers: { Accept: "application/json" },
  });
  const cacheable = response.clone();
  const data = await parseCatalogueResponse(response);
  if (typeof caches === "undefined") throw new Error("Le cache hors ligne n’est pas disponible sur cet appareil.");
  const cache = await caches.open(CATALOGUE_CACHE_NAME);
  await cache.put(catalogueUrl, cacheable);
  try { await caches.delete(LEGACY_CATALOGUE_CACHE_NAME); } catch { /* v2 is already durable. */ }
  cataloguePromise = Promise.resolve(data);
  return data;
}

export async function catalogueAvailableOffline(): Promise<boolean> {
  try {
    return Boolean(await loadValidatedCachedCatalogue());
  } catch {
    return false;
  }
}

export function duplicateCatalogueRecipes(catalogue: CatalogueData): Readonly<Record<string, string>> {
  return Object.fromEntries(catalogue.recipes.flatMap((recipe) => recipe.app.duplicate_of
    ? [[recipe.id, recipe.app.duplicate_of] as const]
    : []));
}

export function visibleCatalogueRecipes(catalogue: CatalogueData): CatalogueRecipe[] {
  return catalogue.recipes.filter((recipe) => !recipe.app.duplicate_of);
}
const GENERATED_RECIPE_IMAGES = new Set<string>(generatedRecipeImages);
const RECIPE_IMAGE_PLACEHOLDER = "/assets/recipe-placeholder.svg";

export function reviewFor(recipe: CatalogueRecipe): CatalogueRecipeReview {
  return recipe.app.review;
}

/**
 * Favourite identifier of a catalogue recipe. It matches the identifier used by
 * the planner projection, so a recipe saved from either surface is the same one.
 */
export function catalogueFavoriteId(recipe: CatalogueRecipe | string): string {
  const id = typeof recipe === "string" ? recipe : recipe.id;
  return id.startsWith("catalog-") ? id : `catalog-${id}`;
}

export function catalogueRecipeIdOf(favoriteId: string): string {
  return favoriteId.startsWith("catalog-") ? favoriteId.slice("catalog-".length) : favoriteId;
}

export function catalogueImageFor(recipe: CatalogueRecipe): string {
  const filename = recipe.image.nom_fichier;
  return filename && GENERATED_RECIPE_IMAGES.has(filename)
    ? `/assets/recipes/generated/${filename}`
    : RECIPE_IMAGE_PLACEHOLDER;
}

/** Categories that complete a meal rather than make one. */
const SIDE_DISH_CATEGORIES = new Set(["accompagnement", "boisson", "dessert", "snack", "sauce"]);

export type PlannerExclusionKind = "duplicate" | "side-dish" | "editorial";

export interface PlannerAvailability {
  plannable: boolean;
  kind?: PlannerExclusionKind;
}

/**
 * Explains whether a catalogue recipe can enter a weekly menu. Ineligibility is
 * an explicit editorial decision recorded per recipe; it is reported, never
 * overridden.
 */
export function plannerAvailabilityFor(recipe: CatalogueRecipe): PlannerAvailability {
  if (recipe.app.duplicate_of) return { plannable: false, kind: "duplicate" };
  if (recipe.app.planner.eligible) return { plannable: true };
  return { plannable: false, kind: SIDE_DISH_CATEGORIES.has(recipe.categorie) ? "side-dish" : "editorial" };
}

export interface CatalogueFilters {
  category: string;
  /** Maximum hands-on minutes, or 0 for no limit. */
  maxActiveMinutes: number;
  cost: "" | "economique" | "moyen" | "eleve";
  season: "" | Exclude<CatalogueSeason, "toute-annee">;
  diet: string;
  withoutAllergen: string;
  plannableOnly: boolean;
  sort: "title" | "time" | "cost";
}

export const EMPTY_CATALOGUE_FILTERS: CatalogueFilters = {
  category: "all",
  maxActiveMinutes: 0,
  cost: "",
  season: "",
  diet: "",
  withoutAllergen: "",
  plannableOnly: false,
  sort: "title",
};

export function catalogueActiveMinutes(recipe: CatalogueRecipe): number {
  return recipe.app.planner.active_minutes ?? recipe.temps.preparation + recipe.temps.cuisson;
}

function hasRequiredAllergen(recipe: CatalogueRecipe, allergen: string): boolean {
  return recipe.ingredients.some((ingredient) => ingredient.facultatif !== true && ingredient.allergenes.includes(allergen));
}

/** Applies the browsing filters, then the requested order. Data only, no UI. */
const SEARCHABLE_CATALOGUE_TEXT = new WeakMap<CatalogueRecipe, string>();

function searchableCatalogueText(recipe: CatalogueRecipe): string {
  const cached = SEARCHABLE_CATALOGUE_TEXT.get(recipe);
  if (cached) return cached;
  const value = `${recipe.titre} ${recipe.ingredients.map((item) => item.nom).join(" ")} ${recipe.tags.join(" ")} ${(recipe.materiel ?? []).join(" ")}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae").toLowerCase();
  SEARCHABLE_CATALOGUE_TEXT.set(recipe, value);
  return value;
}

export function filterCatalogueRecipes(
  recipes: readonly CatalogueRecipe[],
  filters: CatalogueFilters,
  normalizedQuery = "",
): CatalogueRecipe[] {
  const matches = recipes.filter((recipe) => {
    if (filters.category !== "all" && recipe.categorie !== filters.category) return false;
    if (filters.maxActiveMinutes > 0 && catalogueActiveMinutes(recipe) > filters.maxActiveMinutes) return false;
    if (filters.cost && recipe.cout !== filters.cost) return false;
    if (filters.season && !recipe.saisons.includes(filters.season) && !recipe.saisons.includes("toute-annee")) return false;
    if (filters.diet && !recipe.regimes.includes(filters.diet)) return false;
    if (filters.diet === "sans-lactose" && hasRequiredAllergen(recipe, "lait")) return false;
    if (filters.withoutAllergen && recipe.app.planner.allergens.includes(filters.withoutAllergen)) return false;
    if (filters.plannableOnly && !plannerAvailabilityFor(recipe).plannable) return false;
    if (!normalizedQuery) return true;
    return searchableCatalogueText(recipe).includes(normalizedQuery);
  });

  const costRank = { economique: 0, moyen: 1, eleve: 2 } as const;
  return matches.sort((left, right) => {
    if (filters.sort === "time") return catalogueActiveMinutes(left) - catalogueActiveMinutes(right) || left.titre.localeCompare(right.titre, "fr");
    if (filters.sort === "cost") return costRank[left.cout] - costRank[right.cout] || left.titre.localeCompare(right.titre, "fr");
    return left.titre.localeCompare(right.titre, "fr");
  });
}

export function catalogueCategoryName(id: string): string {
  return CATALOGUE_CATEGORIES.find((category) => category.id === id)?.nom ?? id;
}
