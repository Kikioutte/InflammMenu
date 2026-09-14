/** Presentation only: never changes stored units, quantities or food rules. */
const COUNT_UNITS: Record<string, readonly [string, string]> = {
  piece: ["pièce", "pièces"], pièce: ["pièce", "pièces"], pièces: ["pièce", "pièces"],
  pincée: ["pincée", "pincées"], botte: ["botte", "bottes"],
  gousse: ["gousse", "gousses"], poignée: ["poignée", "poignées"],
  branche: ["branche", "branches"], tranche: ["tranche", "tranches"],
  boîte: ["boîte", "boîtes"], morceau: ["morceau", "morceaux"],
  tige: ["tige", "tiges"], bouquet: ["bouquet", "bouquets"], feuille: ["feuille", "feuilles"],
};
const SPOON_UNITS: Record<string, string> = {
  c_soupe: "c. à soupe", "c. à s.": "c. à soupe", "c. à soupe": "c. à soupe",
  c_cafe: "c. à café", "c. à c.": "c. à café", "c. à café": "c. à café",
};

export function formatIngredientUnit(unit: string, quantity = 1): string {
  return COUNT_UNITS[unit]?.[quantity > 1 ? 1 : 0] ?? SPOON_UNITS[unit] ?? unit;
}

export function formatIngredientQuantity(quantity: number, unit: string): string {
  const number = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return `${number} ${formatIngredientUnit(unit, quantity)}`.trim();
}

export const DIET_LABELS: Record<string, string> = {
  vegetalien: "Végétalien", vegetarien: "Végétarien", pescetarien: "Pescétarien",
  "sans-lactose": "Sans lactose", "sans-gluten": "Sans gluten",
  "sans-fruits-a-coque": "Sans fruits à coque", "sans-porc": "Sans porc",
  "low-fodmap": "Pauvre en FODMAP", classique: "Classique",
};
export const DIFFICULTY_LABELS = { facile: "Facile", intermediaire: "Intermédiaire", avance: "Avancé" } as const;
export const COST_LABELS = { economique: "Économique", moyen: "Coût moyen", eleve: "Coût élevé" } as const;

export function formatDietLabel(diet: string): string {
  return DIET_LABELS[diet] ?? diet.replaceAll("-", " ");
}
