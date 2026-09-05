import plannerCautionIdsSource from "./data/planner-caution-ids.json" with { type: "json" };

type RuntimeRecord = Record<string, unknown>;

export const INGREDIENT_CATEGORIES = new Set(["fruit-vegetable", "grocery", "fresh", "meat-fish", "frozen", "bakery", "beverage"]);
export const INGREDIENT_UNITS = new Set(["g", "ml", "piece", "c_soupe", "c_cafe"]);
export const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);
export const DIET_MODES = new Set(["classic", "vegetarian", "no-pork"]);
export const EQUIPMENT = new Set(["hob", "oven", "microwave", "blender", "toaster", "steamer"]);
export const CATALOGUE_ALLERGENS = new Set([
  "gluten", "crustaces", "oeuf", "poisson", "arachides", "soja", "lait",
  "fruits-a-coque", "celeri", "moutarde", "sesame", "sulfites", "lupin", "mollusques",
]);
export const EXPECTED_PLANNER_CAUTION_IDS = new Set<string>(plannerCautionIdsSource);

export function invalidCatalogue(path: string): never {
  throw new Error(`Catalogue invalide (${path})`);
}

export function recordAt(value: unknown, path: string): RuntimeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidCatalogue(`${path}: objet requis`);
  return value as RuntimeRecord;
}

export function arrayAt(value: unknown, path: string, nonEmpty = false): unknown[] {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) invalidCatalogue(`${path}: tableau${nonEmpty ? " non vide" : ""} requis`);
  return value;
}

export function stringAt(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) invalidCatalogue(`${path}: chaîne${allowEmpty ? "" : " non vide"} requise`);
  return value;
}

export function numberAt(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) invalidCatalogue(`${path}: nombre invalide`);
  return value;
}

export function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalidCatalogue(`${path}: booléen requis`);
  return value;
}

export function enumAt(value: unknown, allowed: ReadonlySet<string>, path: string): string {
  const item = stringAt(value, path);
  if (!allowed.has(item)) invalidCatalogue(`${path}: valeur inconnue ${item}`);
  return item;
}

export function stringArrayAt(value: unknown, path: string, allowed?: ReadonlySet<string>, nonEmpty = false): void {
  for (const [index, item] of arrayAt(value, path, nonEmpty).entries()) {
    const text = stringAt(item, `${path}[${index}]`);
    if (allowed && !allowed.has(text)) invalidCatalogue(`${path}[${index}]: valeur inconnue ${text}`);
  }
}

export function optionalStringAt(value: unknown, path: string): void {
  if (value !== undefined) stringAt(value, path);
}

