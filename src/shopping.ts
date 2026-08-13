import aliasSource from "./data/ingredient-id-aliases.json" with { type: "json" };
import ruleSource from "./data/ingredient-shopping-rules.json" with { type: "json" };
import type { IngredientUnit, ShoppingAmount } from "./domain.ts";

type PurchaseRule =
  | { kind: "pieces" }
  | { kind: "bunches"; grams_per_bunch: number }
  | { kind: "jar" }
  | { kind: "pantry-check" };

export type IngredientShoppingRule = {
  pantry_staple?: boolean;
  piece_weight_g?: number;
  purchase?: PurchaseRule;
};

type AliasSource = {
  aliases: Record<string, string>;
  canonical_groups: Array<{ canonical_id: string; aliases: string[] }>;
};

type RuleSource = { rules: Record<string, IngredientShoppingRule> };

export function normalizeIngredientId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const reviewedAliases = new Map<string, string>();
const aliases = aliasSource as AliasSource;
for (const [alias, canonical] of Object.entries(aliases.aliases)) {
  reviewedAliases.set(normalizeIngredientId(alias), normalizeIngredientId(canonical));
}
for (const group of aliases.canonical_groups) {
  const canonical = normalizeIngredientId(group.canonical_id);
  for (const alias of group.aliases) {
    const normalizedAlias = normalizeIngredientId(alias);
    if (normalizedAlias !== canonical) reviewedAliases.set(normalizedAlias, canonical);
  }
}

export function canonicalIngredientId(rawId: string): string {
  let current = normalizeIngredientId(rawId);
  const visited = new Set<string>();
  while (reviewedAliases.has(current) && !visited.has(current)) {
    visited.add(current);
    current = reviewedAliases.get(current)!;
  }
  return current;
}

/**
 * Resolves a reviewed alias from a display name when catalogue sources use
 * unrelated identifiers for the same ingredient. Unknown names deliberately
 * return undefined so similarly worded but distinct ingredients stay apart.
 */
export function canonicalIngredientIdFromName(name: string): string | undefined {
  const normalized = normalizeIngredientId(name);
  const canonical = canonicalIngredientId(normalized);
  return canonical !== normalized ? canonical : undefined;
}

const rules = new Map(
  Object.entries((ruleSource as RuleSource).rules).map(([id, rule]) => [canonicalIngredientId(id), rule]),
);

export function shoppingRuleFor(rawId: string): IngredientShoppingRule | undefined {
  return rules.get(canonicalIngredientId(rawId));
}

const LEGACY_UNITS = new Set<IngredientUnit>(["g", "ml", "piece", "c_soupe", "c_cafe"]);

export function legacyShoppingItemKeyToCanonical(storedKey: string): string {
  const separator = storedKey.lastIndexOf(":");
  if (separator < 0) return canonicalIngredientId(storedKey);
  const possibleUnit = storedKey.slice(separator + 1) as IngredientUnit;
  return canonicalIngredientId(LEGACY_UNITS.has(possibleUnit) ? storedKey.slice(0, separator) : storedKey);
}

export function storedShoppingItemMatches(storedKey: string, ingredientId: string): boolean {
  return legacyShoppingItemKeyToCanonical(storedKey) === canonicalIngredientId(ingredientId);
}

function numberLabel(value: number): string {
  return (Number.isInteger(value) ? String(value) : value.toFixed(1))
    .replace(".0", "")
    .replace(".", ",");
}

export function formatShoppingAmount(amount: ShoppingAmount): string {
  const unitLabel = amount.unit === "piece"
    ? amount.quantity > 1 ? "pièces" : "pièce"
    : amount.unit === "c_soupe"
      ? "c. à soupe"
      : amount.unit === "c_cafe"
        ? "c. à café"
        : amount.unit;
  return `${numberLabel(amount.quantity)} ${unitLabel}`;
}

export function formatShoppingAmounts(amounts: readonly ShoppingAmount[]): string {
  return amounts.map(formatShoppingAmount).join(" + ");
}

export function purchaseSuggestionFor(ingredientId: string, amounts: readonly ShoppingAmount[]): string {
  const rule = shoppingRuleFor(ingredientId);
  const gramAmount = amounts.find((amount) => amount.unit === "g")?.quantity ?? 0;
  const pieceAmount = amounts.find((amount) => amount.unit === "piece")?.quantity ?? 0;

  if (amounts.length > 1 && !(rule?.piece_weight_g && rule.purchase?.kind === "pieces")) {
    return formatShoppingAmounts(amounts);
  }
  if (rule?.purchase?.kind === "pantry-check") return "À vérifier dans vos placards";
  if (rule?.purchase?.kind === "jar") return "1 pot · vérifiez vos placards";
  if (rule?.purchase?.kind === "bunches" && gramAmount > 0) {
    const count = Math.max(1, Math.ceil(gramAmount / rule.purchase.grams_per_bunch));
    return `${count} botte${count > 1 ? "s" : ""}`;
  }
  if (rule?.purchase?.kind === "pieces") {
    const estimatedPieces = pieceAmount + (rule.piece_weight_g ? gramAmount / rule.piece_weight_g : 0);
    if (estimatedPieces > 0) {
      const count = Math.ceil(estimatedPieces);
      return `${count} pièce${count > 1 ? "s" : ""}`;
    }
  }
  if (amounts.length === 1 && amounts[0].unit === "ml" && amounts[0].quantity < 50) {
    return "Petite quantité · à vérifier";
  }
  return formatShoppingAmounts(amounts);
}
