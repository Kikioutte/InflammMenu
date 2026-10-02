/** Lossless transport for the generated planner projection. Keeping each field
 * together lets ordinary HTTP gzip reuse repeated values across the catalogue.
 * Null is reserved for an absent optional field; recipe fields are non-nullable.
 * The expanded records still go through validatePlannerRecipes before use.
 */
export function packPlannerRecipeColumns(recipes: readonly Record<string, unknown>[]): Record<string, unknown[]> {
  if (!recipes.length) throw new Error("Projection planificateur vide");
  const fields = [...new Set(recipes.flatMap(Object.keys))];
  return Object.fromEntries(fields.map((field) => [field, recipes.map((recipe) => {
    if (recipe[field] === null) throw new Error(`Champ planificateur null interdit : ${field}`);
    return recipe[field] ?? null;
  })]));
}

export function expandPlannerRecipeColumns(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Colonnes planificateur invalides");
  }
  const columns = Object.entries(value);
  const count = Array.isArray(columns[0]?.[1]) ? columns[0][1].length : 0;
  if (!count || columns.some(([, values]) => !Array.isArray(values) || values.length !== count)) {
    throw new Error("Longueurs des colonnes planificateur incohérentes");
  }
  return Array.from({ length: count }, (_, index) => Object.fromEntries(
    columns.flatMap(([field, values]) => values[index] === null ? [] : [[field, values[index]]]),
  ));
}
