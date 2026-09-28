import { MAX_CUSTOM_RECIPE_INGREDIENT_QUANTITY, type IngredientUnit } from "./domain.ts";

/** Decimal representation of the stored Number, including very small imports. */
function decimalParts(quantity: number): { coefficient: bigint; scale: number } {
  const [mantissa, exponent = "0"] = String(quantity).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  const coefficient = BigInt(whole + fraction);
  return scale < 0
    ? { coefficient: coefficient * 10n ** BigInt(-scale), scale: 0 }
    : { coefficient, scale };
}

export function customRecipeQuantityStep(unit: IngredientUnit): number {
  return unit === "g" || unit === "ml" ? 5 : 0.25;
}

/** No fixed rounding: adjust only the chosen ingredient, in its original unit. */
export function adjustCustomRecipeQuantity(quantity: number, unit: IngredientUnit, direction: 1 | -1): number | null {
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > MAX_CUSTOM_RECIPE_INGREDIENT_QUANTITY) return null;
  const current = decimalParts(quantity);
  const step = decimalParts(customRecipeQuantityStep(unit));
  const scale = Math.max(current.scale, step.scale);
  const coefficient = current.coefficient * 10n ** BigInt(scale - current.scale)
    + BigInt(direction) * step.coefficient * 10n ** BigInt(scale - step.scale);
  if (coefficient <= 0n) return 0;
  if (coefficient > BigInt(MAX_CUSTOM_RECIPE_INGREDIENT_QUANTITY) * 10n ** BigInt(scale)) return null;
  // Storage remains a Number; no schema or precision change is applied to untouched values.
  const next = Number(`${coefficient}e-${scale}`);
  return Number.isFinite(next) ? next : null;
}

/** Exact local editor display, without the serving-display formatter's rounding. */
export function formatCustomRecipeQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity < 0) return String(quantity).replace(".", ",");
  const { coefficient, scale } = decimalParts(quantity);
  const digits = String(coefficient).padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)},${digits.slice(-scale)}` : digits;
}
