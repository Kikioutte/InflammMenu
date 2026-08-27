export const CATALOGUE_SEASONS = Object.freeze([
  "printemps",
  "ete",
  "automne",
  "hiver",
  "toute-annee",
]);

const PLANNER_SEASONS = Object.freeze({
  printemps: "spring",
  ete: "summer",
  automne: "autumn",
  hiver: "winter",
  "toute-annee": "all-year",
});

/** Project catalogue seasons without silently dropping an unknown value. */
export function projectCatalogueSeasons(values, label = "recette") {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label}: au moins une saison requise`);
  }
  return [...new Set(values.map((value) => {
    const projected = PLANNER_SEASONS[value];
    if (!projected) throw new Error(`${label}: saison inconnue ${value}`);
    return projected;
  }))];
}
