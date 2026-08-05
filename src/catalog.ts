import catalogueSource from "./data/recettes-anti-inflammatoires.json";
import type {
  DietMode,
  Equipment,
  Ingredient,
  IngredientCategory,
  IngredientUnit,
  MealType,
  Recipe,
  Season,
} from "./domain";

export type CatalogueReviewStatus = "validated" | "caution";

export interface CatalogueRecipeReview {
  status: CatalogueReviewStatus;
  summary: string;
  caution?: string;
}

export interface CatalogueIngredient {
  quantite: number;
  unite: string;
  nom: string;
  note: string;
  categorie_courses: IngredientCategory;
  allergenes: string[];
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
  saisons: string[];
  tags: string[];
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
    sucres_g: number;
    lipides_g: number;
    acides_gras_satures_g: number;
    fibres_g: number;
    sodium_mg: number;
  };
  score_anti_inflammatoire: number;
  image: { nom_fichier: string; alt: string };
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
    };
  };
}

interface CatalogueData {
  meta: { schema_version: "2.0.0"; avertissement: string; licence: string; nombre_recettes: number };
  categories: Array<{ id: string; nom: string; description: string }>;
  recipes: CatalogueRecipe[];
}

export const CATALOGUE = catalogueSource as unknown as CatalogueData;
export const CATALOGUE_CATEGORIES = CATALOGUE.categories;

/** Source entries already covered by a materially equivalent V1 recipe. */
export const DUPLICATE_CATALOGUE_RECIPES: Readonly<Record<string, string>> = Object.fromEntries(
  CATALOGUE.recipes.flatMap((recipe) => recipe.app.duplicate_of
    ? [[recipe.id, recipe.app.duplicate_of] as const]
    : []),
);

export const CATALOGUE_RECIPES = CATALOGUE.recipes.filter(
  (recipe) => !recipe.app.duplicate_of,
);

export function reviewFor(recipe: CatalogueRecipe): CatalogueRecipeReview {
  return recipe.app.review;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizedUnit(ingredient: CatalogueIngredient): { quantity: number; unit: IngredientUnit } {
  if (ingredient.unite === "kg") return { quantity: ingredient.quantite * 1000, unit: "g" };
  if (ingredient.unite === "l") return { quantity: ingredient.quantite * 1000, unit: "ml" };
  if (ingredient.unite === "g" || ingredient.unite === "ml") return { quantity: ingredient.quantite, unit: ingredient.unite };
  if (ingredient.unite === "c. à s.") return { quantity: ingredient.quantite, unit: "c_soupe" };
  if (ingredient.unite === "c. à c.") return { quantity: ingredient.quantite, unit: "c_cafe" };
  if (ingredient.unite === "cm") return { quantity: ingredient.quantite * 5, unit: "g" };
  return { quantity: ingredient.quantite, unit: "piece" };
}

function seasonsFor(recipe: CatalogueRecipe): readonly Season[] {
  const mapping: Record<string, Season> = {
    printemps: "spring",
    ete: "summer",
    automne: "autumn",
    hiver: "winter",
    "toute-annee": "all-year",
  };
  return [...new Set(recipe.saisons.map((season) => mapping[season]).filter(Boolean))];
}

function imageFor(recipe: CatalogueRecipe): string {
  const title = normalize(recipe.titre);
  if (title.includes("crevette")) return "/assets/inflamm-hero-bowl.png";
  if (title.includes("saumon")) return "/assets/recipes/saumon-brocoli-riz-complet.png";
  if (title.includes("maquereau")) return "/assets/recipes/salade-maquereau-betterave-pomme-terre.png";
  if (title.includes("sardine")) return "/assets/recipes/salade-sardines-pommes-terre-haricots.png";
  if (title.includes("cabillaud") || title.includes("poisson")) return "/assets/recipes/cabillaud-tomate-olives.png";
  if (title.includes("tofu")) return "/assets/recipes/bowl-tofu-brocoli-sesame.png";
  if (title.includes("orge") || title.includes("champignon")) return "/assets/recipes/risotto-orge-champignons-epinards.png";
  if (title.includes("lentille")) return "/assets/recipes/salade-lentilles-noix.png";
  if (title.includes("quinoa")) return "/assets/recipes/bowl-quinoa-legumes-houmous.png";
  if (title.includes("omelette")) return "/assets/recipes/omelette-legumes-quinoa.png";
  if (title.includes("avoine") || title.includes("chia")) return "/assets/recipes/overnight-oats-myrtilles-noix.png";
  if (title.includes("porridge")) return "/assets/recipes/porridge-millet-pomme.png";
  if (title.includes("skyr") || title.includes("figue")) return "/assets/recipes/yaourt-pomme-amandes.png";
  return "/assets/inflamm-hero-bowl.png";
}

function plannerIngredient(raw: CatalogueIngredient, portions: number): Ingredient {
  const normalized = normalizedUnit(raw);
  return {
    id: `catalog-${normalize(raw.nom)}`,
    name: raw.nom,
    quantity: Math.max(0.01, normalized.quantity / Math.max(1, portions)),
    unit: normalized.unit,
    category: raw.categorie_courses,
    ...(raw.allergenes.length ? { allergens: raw.allergenes } : {}),
  };
}

export const IMPORTED_PLAN_RECIPES: readonly Recipe[] = CATALOGUE_RECIPES
  .filter((recipe) => recipe.app.planner.eligible)
  .map((recipe) => ({
    id: `catalog-${recipe.id}`,
    title: recipe.titre,
    mealTypes: recipe.app.planner.meal_types,
    diet: recipe.app.planner.diets,
    prepMinutes: recipe.temps.total,
    costPerPortion: recipe.app.planner.cost_per_portion_eur,
    seasons: seasonsFor(recipe),
    equipment: recipe.app.planner.equipment,
    allergens: recipe.app.planner.allergens,
    tags: [...recipe.tags, recipe.categorie, ...recipe.ingredients.map((item) => normalize(item.nom))],
    ingredients: recipe.ingredients.map((ingredient) => plannerIngredient(ingredient, recipe.portions)),
    nutrition: {
      calories: recipe.nutrition_par_portion.calories,
      protein: recipe.nutrition_par_portion.proteines_g,
      fiber: recipe.nutrition_par_portion.fibres_g,
      estimated: true,
      note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif.",
    },
    description: reviewFor(recipe).summary,
    steps: recipe.etapes,
    conservation: recipe.conservation,
    image: imageFor(recipe),
  }));

export function catalogueCategoryName(id: string): string {
  return CATALOGUE_CATEGORIES.find((category) => category.id === id)?.nom ?? id;
}
