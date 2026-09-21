import { type MealType, type DietMode, type Equipment, type IngredientCategory } from "../domain";

export const DAY_LABELS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Petit-déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
};

export const DIET_LABELS: Record<DietMode, string> = {
  classic: "Classique",
  vegetarian: "Végétarien",
  "no-pork": "Sans porc",
};

export const EQUIPMENT_OPTIONS: Array<{ id: Equipment; label: string }> = [
  { id: "hob", label: "Plaques" },
  { id: "oven", label: "Four" },
  { id: "microwave", label: "Micro-ondes" },
  { id: "blender", label: "Blender" },
  { id: "toaster", label: "Grille-pain" },
  { id: "steamer", label: "Vapeur" },
];

export const ALLERGEN_OPTIONS = [
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

export const ALLERGEN_LABELS = Object.fromEntries(ALLERGEN_OPTIONS.map((item) => [item.id, item.label]));

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  "fruit-vegetable": "Fruits et légumes",
  grocery: "Épicerie",
  fresh: "Produits frais",
  "meat-fish": "Viandes et poissons",
  frozen: "Surgelés",
  bakery: "Boulangerie",
  beverage: "Boissons",
};

export const PLANNER_EXCLUSION_TEXT: Record<string, { badge: string; title: string; body: string }> = {
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
