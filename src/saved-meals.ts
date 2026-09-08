/** Recipe references only: associations are recomputed from the current catalogue. */
export interface SavedMeal {
  id: string;
  name?: string;
  recipeIds: { starter: string; main: string; dessert: string };
}

export function normalizeSavedMeals(value: unknown): SavedMeal[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item): SavedMeal[] => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^meal-[a-zA-Z0-9-]{1,100}$/.test(item.id) || seen.has(item.id)) return [];
    const ids = item.recipeIds;
    if (!ids || typeof ids !== "object" || ![ids.starter, ids.main, ids.dessert].every((id) => typeof id === "string" && /^r\d{1,6}$/.test(id)) || new Set([ids.starter, ids.main, ids.dessert]).size !== 3) return [];
    seen.add(item.id);
    const name = typeof item.name === "string" ? item.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) : "";
    return [{ id: item.id, ...(name ? { name } : {}), recipeIds: { starter: ids.starter, main: ids.main, dessert: ids.dessert } }];
  }).slice(0, 200);
}
