import type { Ingredient, IngredientCategory } from "./domain.ts";
import { canonicalIngredientId } from "./shopping.ts";

export interface IngredientSubstitutionRule {
  id: string;
  sourceIngredientIds: readonly string[];
  replacement: {
    id: string;
    name: string;
    category: IngredientCategory;
    allergens?: readonly string[];
  };
  /** Multiplies the original culinary quantity while keeping its unit. */
  quantityMultiplier: number;
  /** Approximate variation for one portion of the recipe. */
  costDeltaPerPortion: number;
  note: string;
}

/**
 * A deliberately small, reviewed set. Free-text catalogue suggestions are not
 * executable because they do not carry reliable quantities, allergens or cost.
 */
export const INGREDIENT_SUBSTITUTIONS: readonly IngredientSubstitutionRule[] = [
  {
    id: "nuts-to-pumpkin-seeds",
    sourceIngredientIds: ["walnut", "noix-grenoble", "noix-pecan", "catalog-noix-de-pecan-concassees", "almond", "amandes-effilees", "pistaches-non-salees", "catalog-pistaches-non-salees-concassees"],
    replacement: { id: "pumpkin-seed", name: "graines de courge", category: "grocery" },
    quantityMultiplier: 1,
    costDeltaPerPortion: -0.1,
    note: "Alternative sans fruits à coque ; vérifiez toujours les traces indiquées sur l’emballage.",
  },
  {
    id: "yogurt-to-soy-yogurt",
    sourceIngredientIds: ["yogurt"],
    replacement: { id: "yaourt-soja-nature", name: "yaourt de soja nature", category: "fresh", allergens: ["soja"] },
    quantityMultiplier: 1,
    costDeltaPerPortion: 0.15,
    note: "Même quantité ; choisissez une version nature non sucrée.",
  },
  {
    id: "feta-to-tofu",
    sourceIngredientIds: ["feta"],
    replacement: { id: "tofu", name: "tofu ferme nature", category: "fresh", allergens: ["soja"] },
    quantityMultiplier: 1,
    costDeltaPerPortion: -0.1,
    note: "Émiettez le tofu et assaisonnez-le avec un peu de citron.",
  },
  {
    id: "oats-to-buckwheat-flakes",
    sourceIngredientIds: ["oats"],
    replacement: { id: "flocons-sarrasin", name: "flocons de sarrasin", category: "grocery" },
    quantityMultiplier: 1,
    costDeltaPerPortion: 0.2,
    note: "Choisissez un produit explicitement garanti sans gluten si nécessaire.",
  },
  {
    id: "milk-to-soy-drink",
    sourceIngredientIds: ["lait-demi-ecreme"],
    replacement: { id: "boisson-soja-non-sucree", name: "boisson de soja non sucrée", category: "beverage", allergens: ["soja"] },
    quantityMultiplier: 1,
    costDeltaPerPortion: 0.1,
    note: "Même volume ; le goût et la texture peuvent légèrement varier.",
  },
  {
    id: "tofu-to-chickpeas",
    sourceIngredientIds: ["tofu", "tofu-fume", "catalog-tofu-soyeux-ou-ferme"],
    replacement: { id: "chickpea", name: "pois chiches cuits et égouttés", category: "grocery" },
    quantityMultiplier: 1.1,
    costDeltaPerPortion: -0.2,
    note: "La texture change : ajoutez les pois chiches en fin de préparation.",
  },
  {
    id: "tahini-to-sunflower-puree",
    sourceIngredientIds: ["tahini", "puree-sesame"],
    replacement: { id: "puree-tournesol", name: "purée de graines de tournesol", category: "grocery" },
    quantityMultiplier: 1,
    costDeltaPerPortion: 0.15,
    note: "Même quantité ; vérifiez les traces éventuelles sur l’étiquette.",
  },
] as const;

const RULE_BY_ID = new Map(INGREDIENT_SUBSTITUTIONS.map((rule) => [rule.id, rule]));

export function substitutionRuleById(id: string): IngredientSubstitutionRule | undefined {
  return RULE_BY_ID.get(id);
}

export function substitutionRuleAppliesToIngredientId(
  rule: IngredientSubstitutionRule,
  ingredientId: string,
): boolean {
  const sourceId = canonicalIngredientId(ingredientId);
  return rule.sourceIngredientIds.some((id) => canonicalIngredientId(id) === sourceId);
}

export function substitutionsForIngredient(ingredient: Ingredient): IngredientSubstitutionRule[] {
  return INGREDIENT_SUBSTITUTIONS.filter((rule) => substitutionRuleAppliesToIngredientId(rule, ingredient.id));
}

export function applySubstitutionToIngredient(ingredient: Ingredient, rule: IngredientSubstitutionRule): Ingredient {
  return {
    ...ingredient,
    ...rule.replacement,
    quantity: ingredient.quantity * rule.quantityMultiplier,
    allergens: rule.replacement.allergens,
    pantryStaple: false,
  };
}
