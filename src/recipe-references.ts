import referenceIds from "./data/recipe-reference-ids.json" with { type: "json" };

const baseIds = new Set(referenceIds.base);
const catalogueIds = new Set(referenceIds.catalogue);

/** Catalogue references survive deferred/offline loading. The compact registry
 * is checked against the real sources by the personal-library tests. Personal
 * IDs are user-created, so their namespace remains valid independently of a
 * source recipe (shopping snapshots can outlive the original personal edit). */
export function isRecipeReferenceId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 160) return false;
  return baseIds.has(value)
    || catalogueIds.has(value.startsWith("catalog-") ? value.slice("catalog-".length) : value)
    || /^perso-[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}
