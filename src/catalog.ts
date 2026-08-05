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
}

interface CatalogueData {
  meta: { avertissement: string; licence: string; nombre_recettes: number };
  categories: Array<{ id: string; nom: string; description: string }>;
  recipes: CatalogueRecipe[];
}

export const CATALOGUE = catalogueSource as unknown as CatalogueData;
export const CATALOGUE_CATEGORIES = CATALOGUE.categories;

/** Source entries already covered by a materially equivalent V1 recipe. */
export const DUPLICATE_CATALOGUE_RECIPES = {
  r001: "overnight-oats-myrtilles-noix",
  r009: "bowl-quinoa-legumes-houmous",
  r017: "bowl-tofu-brocoli-sesame",
  r018: "cabillaud-tomate-olives",
  r019: "risotto-orge-champignons-epinards",
  r039: "salade-betterave-chevre-lentilles",
} as const;

export const CATALOGUE_RECIPES = CATALOGUE.recipes.filter(
  (recipe) => !(recipe.id in DUPLICATE_CATALOGUE_RECIPES),
);

/**
 * Relecture éditoriale recette par recette. Une validation décrit la cohérence
 * avec un modèle méditerranéen riche en végétaux; elle ne promet aucun effet
 * thérapeutique d'un aliment isolé.
 */
export const CATALOGUE_REVIEWS = {
  r001: { status: "validated", summary: "Avoine complète, myrtilles, lin et noix : un profil riche en fibres, fruits et graisses insaturées. Le sirop reste facultatif." },
  r002: { status: "caution", summary: "Chia, grenade et pistaches apportent fibres et graisses insaturées.", caution: "Privilégier un lait de coco léger et garder le miel ou le sirop comme ajout facultatif." },
  r003: { status: "validated", summary: "Épinards, fruit entier, avocat, gingembre et graines composent une boisson riche en végétaux, sans sucre ajouté." },
  r004: { status: "caution", summary: "Boisson épicée intéressante lorsqu'elle reste occasionnelle et peu sucrée.", caution: "Employer peu de lait de coco entier et de miel. Le mélange curcuma-poivre n'est pas un traitement et demande de la prudence avec certains médicaments." },
  r005: { status: "validated", summary: "Infusion non sucrée à base de thé, menthe et citron, cohérente avec un modèle alimentaire peu transformé." },
  r006: { status: "caution", summary: "Velouté majoritairement végétal, avec carotte, aromates, épices et graines.", caution: "Choisir un bouillon peu salé et limiter le lait de coco entier, riche en graisses saturées." },
  r007: { status: "validated", summary: "Lentilles, légumes, épinards et huile d'olive en font un plat riche en fibres et en protéines végétales." },
  r008: { status: "validated", summary: "Poisson gras, légumes, avocat, graines et huile d'olive : profil méditerranéen très cohérent." },
  r009: { status: "validated", summary: "Bol complet réunissant céréale, légumineuse, crucifère, légumes variés et tahini." },
  r010: { status: "validated", summary: "Kale, grenade, pomme, noix, graines et huile d'olive offrent une forte densité végétale. Le sirop est utilisé en petite quantité.", caution: "Le kale est riche en vitamine K : avec un traitement anticoagulant AVK, maintenir des apports stables et suivre l'avis du professionnel de santé." },
  r011: { status: "caution", summary: "Lentilles, épinards, tomate et épices forment une bonne base végétale.", caution: "Préférer le lait de coco léger et l'huile d'olive afin de réduire les graisses saturées." },
  r012: { status: "validated", summary: "Maquereau, herbes, légumes et huile d'olive correspondent à un repas méditerranéen riche en poisson gras." },
  r013: { status: "validated", summary: "Sardines, persil, ail, citron et huile d'olive donnent une préparation simple et peu transformée." },
  r014: { status: "validated", summary: "Poulet accompagné d'une grande quantité de légumes racines, d'aromates et d'huile d'olive. Retirer la peau au service reste pertinent." },
  r015: { status: "validated", summary: "Pâtes complètes, brocoli, ail, pignons et anchois associent céréale complète, légume et poisson." },
  r016: { status: "validated", summary: "Haricots noirs, patate douce, légumes et cacao non sucré composent un plat végétal riche en fibres." },
  r017: { status: "caution", summary: "Tofu et légumes variés composent une assiette végétale équilibrée.", caution: "Utiliser un tamari réduit en sel et très peu de sirop; l'huile de sésame s'emploie en finition." },
  r018: { status: "validated", summary: "Cabillaud, fenouil, tomate, olives et huile d'olive forment un plat méditerranéen peu transformé. Le vin peut être remplacé par du bouillon.", caution: "Les olives apportent du sodium : les rincer et ne pas ajouter de sel si le bouillon est déjà salé." },
  r019: { status: "validated", summary: "Orge, champignons, aromates, noisettes et huile d'olive apportent céréale complète, végétaux et graisses insaturées." },
  r020: { status: "validated", summary: "Aubergine, tahini, grenade, herbes et graines donnent un plat végétal dense et peu transformé." },
  r021: { status: "validated", summary: "Brocoli, ail, amandes, citron et huile d'olive constituent un accompagnement végétal simple." },
  r022: { status: "validated", summary: "Patate douce, épices, huile d'olive et herbes composent un accompagnement riche en végétaux." },
  r023: { status: "caution", summary: "Le chou fermenté apporte variété végétale et acidité sans sucre ajouté.", caution: "Respecter strictement l'hygiène de fermentation et de conservation; la recette reste salée et se consomme en petite portion." },
  r024: { status: "validated", summary: "Betterave, pois chiches, tahini, citron et huile d'olive offrent fibres et protéines végétales." },
  r025: { status: "caution", summary: "Noix, amandes, lin et cacao non sucré ont un profil intéressant.", caution: "Les dattes et les fruits à coque rendent l'encas très énergétique : conserver la portion proposée d'une à deux bouchées." },
  r026: { status: "validated", summary: "Pois chiches, huile d'olive et épices donnent une collation riche en fibres, sans friture." },
  r027: { status: "caution", summary: "Avocat, cacao non sucré, framboises et pistaches remplacent crème et beurre.", caution: "Dattes et sirop s'additionnent : supprimer le sirop ou réduire les dattes pour limiter les sucres." },
  r028: { status: "validated", summary: "Dessert de fruits entiers sans sucre ajouté, parfumé d'épices et de citron." },
  r029: { status: "caution", summary: "Fruits rouges, avoine, noix et lin apportent fruits, fibres et graisses insaturées.", caution: "Réduire le sirop ajouté et remplacer de préférence l'huile de coco par une huile riche en graisses insaturées." },
  r030: { status: "validated", summary: "Sauce à base de tahini, citron, huile d'olive, ail et épices; le sucrant reste minoritaire." },
  r031: { status: "validated", summary: "Roquette, basilic, noix et huile d'olive donnent une sauce riche en végétaux et graisses insaturées." },
  r032: { status: "caution", summary: "Condiment culinaire concentré, à utiliser en petite quantité dans un plat.", caution: "Ne pas suivre la suggestion de prise quotidienne comme un complément. Curcuma concentré et pipérine peuvent interagir avec des traitements; demander un avis professionnel en cas de traitement ou de pathologie biliaire." },
  r033: { status: "validated", summary: "Œufs, épinards, avocat, herbes et huile d'olive forment un petit-déjeuner complet et peu transformé." },
  r034: { status: "validated", summary: "Pain complet au levain, sardines, avocat et aromates associent céréale complète, poisson gras et végétaux.", caution: "Sardines et câpres sont déjà salées : égoutter les conserves et omettre la fleur de sel." },
  r035: { status: "caution", summary: "Avoine, noix et graines constituent une base riche en fibres et graisses insaturées.", caution: "Respecter une petite portion, réduire le sirop et choisir l'huile d'olive plutôt que l'huile de coco." },
  r036: { status: "caution", summary: "Tofu, champignons et légumes donnent une soupe variée et légère.", caution: "Miso et algues peuvent apporter beaucoup de sodium et d'iode. À éviter ou adapter en cas de trouble thyroïdien, maladie rénale ou traitement concerné." },
  r037: { status: "validated", summary: "Tomate, pastèque, concombre, poivron, basilic et huile d'olive composent une soupe froide riche en végétaux." },
  r038: { status: "validated", summary: "Quinoa, grande quantité d'herbes, tomate, concombre, grenade et huile d'olive offrent un profil végétal complet." },
  r039: { status: "validated", summary: "Lentilles, betterave, noix, roquette et huile d'olive forment une salade riche en fibres; la feta reste optionnelle." },
  r040: { status: "caution", summary: "Poisson, haricots verts, aromates et épices composent une base intéressante.", caution: "Choisir du lait de coco léger, limiter l'huile de coco et doser la sauce de poisson pour contenir graisses saturées et sodium." },
  r041: { status: "validated", summary: "Haricots blancs, champignons, verdure, noisettes et huile d'olive forment un plat végétal riche en fibres." },
  r042: { status: "caution", summary: "Petite boisson concentrée en gingembre et agrumes, à considérer comme une préparation culinaire ponctuelle.", caution: "Elle ne traite pas l'inflammation. Prudence en cas de reflux, calculs biliaires ou traitement; l'acidité impose aussi de protéger l'émail dentaire." },
} as const satisfies Record<string, CatalogueRecipeReview>;

export function reviewFor(recipe: CatalogueRecipe): CatalogueRecipeReview {
  return CATALOGUE_REVIEWS[recipe.id as keyof typeof CATALOGUE_REVIEWS];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function categoryForIngredient(name: string): IngredientCategory {
  const normalized = normalize(name);
  if (/(saumon|maquereau|sardine|anchois|cabillaud|poisson|poulet)/.test(normalized)) return "meat-fish";
  if (/(pain|levain)/.test(normalized)) return "bakery";
  if (/(boisson-vegetale|eau-de-coco|the-vert)/.test(normalized)) return "beverage";
  if (/(oeuf|tofu|feta|fromage|yaourt)/.test(normalized)) return "fresh";
  if (/(carotte|epinard|myrtille|grenade|ananas|avocat|citron|menthe|oignon|ail|gingembre|brocoli|patate|chou|roquette|tomate|fenouil|persil|aneth|poivron|aubergine|betterave|pomme|champignon|coriandre|basilic|haricot-vert|pois-gourmand|panais|celeri)/.test(normalized)) return "fruit-vegetable";
  return "grocery";
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

function allergensFor(recipe: CatalogueRecipe): string[] {
  const names = normalize(recipe.ingredients.map((item) => item.nom).join(" "));
  const allergens = new Set<string>();
  if (!recipe.regimes.includes("sans-gluten") && /(avoine|orge|pates|pain|ble|seigle)/.test(names)) allergens.add("gluten");
  if (/(oeuf)/.test(names)) allergens.add("oeuf");
  if (/(tofu|soja|tamari|miso)/.test(names)) allergens.add("soja");
  if (/(tahini|sesame)/.test(names)) allergens.add("sesame");
  if (/(moutarde)/.test(names)) allergens.add("moutarde");
  if (/(celeri)/.test(names)) allergens.add("celeri");
  if (/(saumon|maquereau|sardine|anchois|cabillaud|poisson)/.test(names)) allergens.add("poisson");
  if (/(amande|noix(?!-de-coco)|pistache|noisette|pignon)/.test(names)) allergens.add("fruits-a-coque");
  if (/(feta|fromage|yaourt|lait(?!-de-coco)|beurre)/.test(names)) allergens.add("lait");
  return [...allergens];
}

function equipmentFor(recipe: CatalogueRecipe): Equipment[] {
  const instructions = normalize(recipe.etapes.join(" "));
  const equipment = new Set<Equipment>();
  if (/(four|rotir|gril)/.test(instructions)) equipment.add("oven");
  if (/(casserole|poele|wok|cuire|fremissement|ebullition|mijoter)/.test(instructions)) equipment.add("hob");
  if (/(mixer|mixeur|blender)/.test(instructions)) equipment.add("blender");
  return [...equipment];
}

function mealTypesFor(recipe: CatalogueRecipe): readonly MealType[] {
  return recipe.categorie === "petit-dejeuner" ? ["breakfast"] : ["lunch", "dinner"];
}

function dietFor(recipe: CatalogueRecipe): readonly DietMode[] {
  return recipe.regimes.includes("vegetarien") || recipe.regimes.includes("vegetalien")
    ? ["classic", "vegetarian", "no-pork"]
    : ["classic", "no-pork"];
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
  return "/assets/inflamm-hero-bowl.png";
}

function plannerIngredient(raw: CatalogueIngredient, portions: number): Ingredient {
  const normalized = normalizedUnit(raw);
  const allergens = allergensFor({
    ...CATALOGUE_RECIPES[0],
    ingredients: [raw],
    regimes: [],
  });
  return {
    id: `catalog-${normalize(raw.nom)}`,
    name: raw.nom,
    quantity: Math.max(0.01, normalized.quantity / Math.max(1, portions)),
    unit: normalized.unit,
    category: categoryForIngredient(raw.nom),
    ...(allergens.length ? { allergens } : {}),
  };
}

const PLANNER_CATEGORIES = new Set(["petit-dejeuner", "soupe", "salade", "plat"]);

export const IMPORTED_PLAN_RECIPES: readonly Recipe[] = CATALOGUE_RECIPES
  .filter((recipe) => PLANNER_CATEGORIES.has(recipe.categorie))
  .map((recipe) => ({
    id: `catalog-${recipe.id}`,
    title: recipe.titre,
    mealTypes: mealTypesFor(recipe),
    diet: dietFor(recipe),
    prepMinutes: recipe.temps.total,
    costPerPortion: recipe.cout === "economique" ? 2.1 : recipe.cout === "moyen" ? 3.4 : 5.2,
    seasons: seasonsFor(recipe),
    equipment: equipmentFor(recipe),
    allergens: allergensFor(recipe),
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
