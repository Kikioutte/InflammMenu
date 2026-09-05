import type { Equipment, IngredientUnit, MealType } from "./domain";

export const DAY_LABELS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Petit-déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
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
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae").trim().toLowerCase();
}

// Initializing ICU can be costly on a cold browser. The welcome and home
// screens do not display decimal quantities, so create this only when needed.
let decimalFormat: Intl.NumberFormat | undefined;
export function formatDecimal(value: number): string {
  decimalFormat ??= new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, useGrouping: false });
  return decimalFormat.format(value);
}

export function parseDecimal(raw: string, minimum: number, maximum: number): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

export function displayQuantity(quantity: number, unit: IngredientUnit): string {
  const rounded = formatDecimal(quantity);
  const units: Record<IngredientUnit, string> = {
    g: "g",
    ml: "ml",
    piece: quantity > 1 ? "pièces" : "pièce",
    c_soupe: "c. à soupe",
    c_cafe: "c. à café",
  };
  return `${rounded} ${units[unit]}`;
}

export function downloadTextFile(fileName: string, text: string, type = "text/plain;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
