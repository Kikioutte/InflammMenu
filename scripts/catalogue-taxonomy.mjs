export const CANONICAL_CATALOGUE_REGIMES = Object.freeze([
  "classique",
  "vegetalien",
  "vegetarien",
  "pescetarien",
  "sans-porc",
  "sans-gluten",
  "sans-lactose",
  "sans-fruits-a-coque",
  "low-fodmap",
]);

export const CATALOGUE_WEEKLY_TARGETS = Object.freeze(["pulse", "finfish", "seafood"]);

/**
 * Closed editorial list for a meaningful legume/soy portion. Fresh green beans,
 * soy drinks, creams, yogurts and condiments are deliberately excluded: merely
 * containing a botanical legume must not satisfy the user's weekly meal target.
 * Whole edamame and fava beans are included when they are a required ingredient,
 * because the catalogue uses them as the substantial protein component of a meal.
 */
export const PULSE_INGREDIENT_IDS = Object.freeze([
  "pois-chiches-secs",
  "haricots-blancs-secs",
  "catalog-lentilles-corail",
  "catalog-lentilles-vertes-du-puy",
  "catalog-edamame-ecosses",
  "catalog-tofu-soyeux-ou-ferme",
  "chickpea",
  "edamame-decortique",
  "farine-pois-chiches",
  "feves-cuites",
  "feves-decortiquees",
  "feves-seches-decortiquees",
  "graines-lupin-cuites",
  "haricots-adzuki-cuits",
  "haricots-borlotti-cuits",
  "haricots-coco-cuits",
  "haricots-geants-cuits",
  "haricots-mungo-cuits",
  "haricots-mungo-decortiques",
  "haricots-mungo-secs",
  "haricots-noirs-cuits",
  "haricots-tarbais-cuits",
  "haricots-urad-decortiques",
  "kidney-bean",
  "lentilles-beluga-seches",
  "lentilles-blondes-seches",
  "lentilles-brunes-seches",
  "lentilles-corail-seches",
  "lentilles-germees",
  "lentilles-jaunes-seches",
  "lentilles-noires-seches",
  "lentilles-vertes-seches",
  "lupins-saumuure",
  "pates-pois-chiches",
  "pois-bambara-secs",
  "pois-casses-secs",
  "pois-chiches-germes",
  "pois-chiches-noirs-cuits",
  "pois-jaunes-secs",
  "tempeh-nature",
  "tempeh-soja",
  "tofu",
  "tofu-fume",
  "tofu-soyeux",
  "white-bean",
]);
const pulseIngredientIds = new Set(PULSE_INGREDIENT_IDS);

const NON_PORTION_FISH_INGREDIENT_IDS = new Set(["catalog-sauce-de-poisson-nuoc-mam"]);

export function normalizeCatalogueTag(value) {
  if (typeof value !== "string") throw new TypeError("un tag catalogue doit être une chaîne");
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function weeklyTargetsForCatalogueRecipe(recipe) {
  const requiredIngredients = (recipe.ingredients ?? []).filter((ingredient) => ingredient.facultatif !== true);
  const targets = [];
  if (requiredIngredients.some((ingredient) => pulseIngredientIds.has(ingredient.id))) targets.push("pulse");
  if (requiredIngredients.some((ingredient) =>
    !NON_PORTION_FISH_INGREDIENT_IDS.has(ingredient.id)
    && ingredient.allergenes?.includes("poisson")
  )) targets.push("finfish");
  if (requiredIngredients.some((ingredient) =>
    ingredient.allergenes?.includes("mollusques") || ingredient.allergenes?.includes("crustaces")
  )) targets.push("seafood");
  return targets;
}

export function normalizeCatalogueRecipeTaxonomy(recipe) {
  const regimes = [...new Set((recipe.regimes ?? []).flatMap((regime) =>
    regime === "volaille" ? ["classique", "sans-porc"] : [regime]
  ))];
  const tags = [...new Set((recipe.tags ?? [])
    .map(normalizeCatalogueTag)
    .filter((tag) => tag && tag !== "brouillon"))];
  return {
    ...recipe,
    regimes,
    tags,
    app: {
      ...recipe.app,
      planner: {
        ...recipe.app.planner,
        targets: weeklyTargetsForCatalogueRecipe(recipe),
      },
    },
  };
}

export function normalizeCatalogueTaxonomy(catalogue) {
  return {
    ...catalogue,
    taxonomie_tags: {
      ...catalogue.taxonomie_tags,
      regimes: [...CANONICAL_CATALOGUE_REGIMES],
    },
    recipes: (catalogue.recipes ?? []).map(normalizeCatalogueRecipeTaxonomy),
  };
}
