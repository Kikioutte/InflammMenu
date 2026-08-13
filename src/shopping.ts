import aliasSource from "./data/ingredient-id-aliases.json" with { type: "json" };
import ruleSource from "./data/ingredient-shopping-rules.json" with { type: "json" };
import type { IngredientCategory, IngredientUnit, ShoppingAmount } from "./domain.ts";

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

export type ShoppingGroup = {
  shopping_id: string;
  display_name: string;
  category: IngredientCategory;
  member_ids: string[];
  purchase?: PurchaseRule;
};

type RuleSource = {
  rules: Record<string, IngredientShoppingRule>;
  shopping_groups?: unknown;
};

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

const INGREDIENT_CATEGORIES = new Set<IngredientCategory>([
  "fruit-vegetable", "grocery", "fresh", "meat-fish", "frozen", "bakery", "beverage",
]);
const PURCHASE_KINDS = new Set(["pieces", "bunches", "jar", "pantry-check"]);

/** Validates the reviewed shopping layer independently from culinary aliases. */
export function validateShoppingGroups(
  value: unknown,
  knownCulinaryIds?: ReadonlySet<string>,
): ShoppingGroup[] {
  if (!Array.isArray(value)) throw new Error("Les groupes d’achat doivent former une liste.");
  const shoppingIds = new Set<string>();
  const members = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`Groupe d’achat ${index + 1} invalide.`);
    }
    const source = candidate as Record<string, unknown>;
    const shoppingId = typeof source.shopping_id === "string" ? normalizeIngredientId(source.shopping_id) : "";
    const displayName = typeof source.display_name === "string" ? source.display_name.trim() : "";
    const category = source.category as IngredientCategory;
    if (!shoppingId || shoppingIds.has(shoppingId)) throw new Error(`Identifiant d’achat absent ou dupliqué : ${shoppingId || index + 1}.`);
    if (!displayName) throw new Error(`${shoppingId}: libellé d’achat manquant.`);
    if (!INGREDIENT_CATEGORIES.has(category)) throw new Error(`${shoppingId}: rayon d’achat invalide.`);
    if (!Array.isArray(source.member_ids) || source.member_ids.length < 2) throw new Error(`${shoppingId}: au moins deux ingrédients sont requis.`);
    const memberIds = source.member_ids.map((member) => {
      if (typeof member !== "string" || !member.trim()) throw new Error(`${shoppingId}: membre invalide.`);
      const canonical = canonicalIngredientId(member);
      if (members.has(canonical)) throw new Error(`${canonical}: appartient à plusieurs groupes d’achat.`);
      if (knownCulinaryIds && !knownCulinaryIds.has(canonical)) throw new Error(`${canonical}: ingrédient culinaire inconnu.`);
      members.add(canonical);
      return canonical;
    });
    if (knownCulinaryIds?.has(shoppingId) && !memberIds.includes(shoppingId)) {
      throw new Error(`${shoppingId}: collision avec un ingrédient culinaire hors du groupe.`);
    }
    const purchase = source.purchase as PurchaseRule | undefined;
    if (purchase) {
      if (!purchase.kind || !PURCHASE_KINDS.has(purchase.kind)) throw new Error(`${shoppingId}: règle d’achat invalide.`);
      if (purchase.kind === "bunches" && (!(purchase.grams_per_bunch > 0) || !Number.isFinite(purchase.grams_per_bunch))) {
        throw new Error(`${shoppingId}: poids de botte invalide.`);
      }
    }
    shoppingIds.add(shoppingId);
    return { shopping_id: shoppingId, display_name: displayName, category, member_ids: memberIds, ...(purchase ? { purchase } : {}) };
  });
}

const shoppingGroups = validateShoppingGroups((ruleSource as RuleSource).shopping_groups ?? []);
const shoppingGroupByMember = new Map<string, ShoppingGroup>();
const shoppingGroupById = new Map<string, ShoppingGroup>();
for (const group of shoppingGroups) {
  shoppingGroupById.set(group.shopping_id, group);
  for (const member of group.member_ids) shoppingGroupByMember.set(member, group);
}

export interface ShoppingIdentity {
  shoppingId: string;
  displayName?: string;
  category?: IngredientCategory;
}

/** Maps a culinary ingredient to its stable, explicitly reviewed purchase identity. */
export function shoppingIdentityFor(rawId: string): ShoppingIdentity {
  const culinaryId = canonicalIngredientId(rawId);
  const group = shoppingGroupByMember.get(culinaryId);
  return group
    ? { shoppingId: group.shopping_id, displayName: group.display_name, category: group.category }
    : { shoppingId: culinaryId };
}

export function shoppingRuleFor(rawId: string): IngredientShoppingRule | undefined {
  const identity = shoppingIdentityFor(rawId);
  const base = rules.get(identity.shoppingId) ?? rules.get(canonicalIngredientId(rawId));
  const group = shoppingGroupById.get(identity.shoppingId);
  if (!group?.purchase) return base;
  return { ...base, purchase: group.purchase };
}

const LEGACY_UNITS = new Set<IngredientUnit>(["g", "ml", "piece", "c_soupe", "c_cafe"]);

export function legacyShoppingItemKeyToCanonical(storedKey: string): string {
  const separator = storedKey.lastIndexOf(":");
  if (separator < 0) return shoppingIdentityFor(storedKey).shoppingId;
  const possibleUnit = storedKey.slice(separator + 1) as IngredientUnit;
  const culinaryId = LEGACY_UNITS.has(possibleUnit) ? storedKey.slice(0, separator) : storedKey;
  return shoppingIdentityFor(culinaryId).shoppingId;
}

export function storedShoppingItemMatches(storedKey: string, ingredientId: string): boolean {
  return legacyShoppingItemKeyToCanonical(storedKey) === shoppingIdentityFor(ingredientId).shoppingId;
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
