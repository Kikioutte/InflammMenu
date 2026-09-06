import type { CatalogueData } from "./catalog.ts";
import {
  INGREDIENT_CATEGORIES, INGREDIENT_UNITS, MEAL_TYPES, DIET_MODES, EQUIPMENT, CATALOGUE_ALLERGENS, EXPECTED_PLANNER_CAUTION_IDS,
  invalidCatalogue, recordAt, arrayAt, stringAt, numberAt, booleanAt, enumAt, stringArrayAt, optionalStringAt,
} from "./recipe-validation.ts";
// Preserve the existing public validator API for consumers and Node checks.
export { validatePlannerRecipes } from "./planner-validation.ts";

const CATALOGUE_SCHEMA_VERSIONS = new Set(["2.0.0", "2.1.0"]);
const CATALOGUE_SEASONS = new Set(["printemps", "ete", "automne", "hiver", "toute-annee"]);
const CATALOGUE_DIFFICULTIES = new Set(["facile", "intermediaire", "avance"]);
const CATALOGUE_COSTS = new Set(["economique", "moyen", "eleve"]);

const WEEKLY_TARGETS = new Set(["pulse", "finfish", "seafood"]);
const REVIEW_STATUSES = new Set(["validated", "caution"]);
const CREAMI_PROGRAMS = new Set(["ICE CREAM", "LITE ICE CREAM", "SORBET", "GELATO", "FROZEN YOGURT"]);
const PROVENANCE_TYPES = new Set(["original", "adapted"]);
const PROVENANCE_KINDS = new Set(["nutrition", "cost", "inspiration", "safety"]);

const EXPECTED_CATALOGUE_RECIPE_COUNT = 630;

function validateIngredient(value: unknown, path: string, schemaVersion: string): void {
  const ingredient = recordAt(value, path);
  numberAt(ingredient.quantite, `${path}.quantite`);
  stringAt(ingredient.unite, `${path}.unite`);
  stringAt(ingredient.nom, `${path}.nom`);
  stringAt(ingredient.note, `${path}.note`, true);
  enumAt(ingredient.categorie_courses, INGREDIENT_CATEGORIES, `${path}.categorie_courses`);
  stringArrayAt(ingredient.allergenes, `${path}.allergenes`, CATALOGUE_ALLERGENS);

  const normalizedFields = [ingredient.id, ingredient.quantite_normalisee, ingredient.unite_normalisee, ingredient.facultatif];
  const hasNormalizedFields = normalizedFields.some((field) => field !== undefined);
  if (schemaVersion === "2.1.0" || hasNormalizedFields) {
    stringAt(ingredient.id, `${path}.id`);
    numberAt(ingredient.quantite_normalisee, `${path}.quantite_normalisee`);
    enumAt(ingredient.unite_normalisee, INGREDIENT_UNITS, `${path}.unite_normalisee`);
    booleanAt(ingredient.facultatif, `${path}.facultatif`);
  }
  if (ingredient.pantry_staple !== undefined) booleanAt(ingredient.pantry_staple, `${path}.pantry_staple`);
}

function validateProvenance(value: unknown, path: string): void {
  const provenance = recordAt(value, path);
  enumAt(provenance.type, PROVENANCE_TYPES, `${path}.type`);
  stringAt(provenance.author, `${path}.author`);
  stringAt(provenance.license, `${path}.license`);
  stringAt(provenance.created_at, `${path}.created_at`);
  optionalStringAt(provenance.reviewed_at, `${path}.reviewed_at`);
  for (const [index, rawSource] of arrayAt(provenance.sources, `${path}.sources`, true).entries()) {
    const source = recordAt(rawSource, `${path}.sources[${index}]`);
    enumAt(source.kind, PROVENANCE_KINDS, `${path}.sources[${index}].kind`);
    stringAt(source.title, `${path}.sources[${index}].title`);
    optionalStringAt(source.url, `${path}.sources[${index}].url`);
    optionalStringAt(source.version, `${path}.sources[${index}].version`);
    stringAt(source.accessed_at, `${path}.sources[${index}].accessed_at`);
  }
}

function validateRecipe(value: unknown, path: string, schemaVersion: string): { id: string; slug: string } {
  const recipe = recordAt(value, path);
  const id = stringAt(recipe.id, `${path}.id`);
  const slug = stringAt(recipe.slug, `${path}.slug`);
  stringAt(recipe.titre, `${path}.titre`);
  stringAt(recipe.categorie, `${path}.categorie`);
  stringAt(recipe.description, `${path}.description`);

  const times = recordAt(recipe.temps, `${path}.temps`);
  numberAt(times.preparation, `${path}.temps.preparation`);
  numberAt(times.cuisson, `${path}.temps.cuisson`);
  numberAt(times.repos, `${path}.temps.repos`);
  numberAt(times.total, `${path}.temps.total`);
  numberAt(recipe.portions, `${path}.portions`, Number.EPSILON);
  enumAt(recipe.difficulte, CATALOGUE_DIFFICULTIES, `${path}.difficulte`);
  enumAt(recipe.cout, CATALOGUE_COSTS, `${path}.cout`);
  stringArrayAt(recipe.regimes, `${path}.regimes`);
  stringArrayAt(recipe.saisons, `${path}.saisons`, CATALOGUE_SEASONS, true);
  stringArrayAt(recipe.tags, `${path}.tags`);
  if (recipe.materiel !== undefined) stringArrayAt(recipe.materiel, `${path}.materiel`, undefined, true);

  if (recipe.creami !== undefined) {
    const creami = recordAt(recipe.creami, `${path}.creami`);
    if (stringAt(creami.modele, `${path}.creami.modele`) !== "Ninja CREAMi Deluxe (NC501EU)") invalidCatalogue(`${path}.creami.modele: valeur inconnue`);
    enumAt(creami.programme, CREAMI_PROGRAMS, `${path}.creami.programme`);
    if (stringAt(creami.zone, `${path}.creami.zone`) !== "FULL") invalidCatalogue(`${path}.creami.zone: valeur inconnue`);
  }

  for (const [index, rawCompound] of arrayAt(recipe.composes_actifs, `${path}.composes_actifs`).entries()) {
    const compound = recordAt(rawCompound, `${path}.composes_actifs[${index}]`);
    stringAt(compound.aliment, `${path}.composes_actifs[${index}].aliment`);
    stringAt(compound.compose, `${path}.composes_actifs[${index}].compose`);
    stringAt(compound.action, `${path}.composes_actifs[${index}].action`);
  }
  const ingredients = arrayAt(recipe.ingredients, `${path}.ingredients`, true);
  for (const [index, ingredient] of ingredients.entries()) {
    validateIngredient(ingredient, `${path}.ingredients[${index}]`, schemaVersion);
  }
  stringArrayAt(recipe.etapes, `${path}.etapes`, undefined, true);
  stringArrayAt(recipe.conseils, `${path}.conseils`);
  for (const [index, rawSubstitution] of arrayAt(recipe.substitutions, `${path}.substitutions`).entries()) {
    const substitution = recordAt(rawSubstitution, `${path}.substitutions[${index}]`);
    stringAt(substitution.remplacer, `${path}.substitutions[${index}].remplacer`);
    stringAt(substitution.par, `${path}.substitutions[${index}].par`);
    stringAt(substitution.note, `${path}.substitutions[${index}].note`, true);
  }
  stringAt(recipe.conservation, `${path}.conservation`);

  const nutrition = recordAt(recipe.nutrition_par_portion, `${path}.nutrition_par_portion`);
  for (const field of ["calories", "proteines_g", "glucides_g", "sucres_g", "lipides_g", "acides_gras_satures_g", "fibres_g", "sodium_mg"] as const) {
    numberAt(nutrition[field], `${path}.nutrition_par_portion.${field}`);
  }
  numberAt(recipe.score_anti_inflammatoire, `${path}.score_anti_inflammatoire`);

  const image = recordAt(recipe.image, `${path}.image`);
  stringAt(image.nom_fichier, `${path}.image.nom_fichier`, true);
  stringAt(image.alt, `${path}.image.alt`, true);

  if (schemaVersion === "2.1.0" || recipe.provenance !== undefined) validateProvenance(recipe.provenance, `${path}.provenance`);

  const app = recordAt(recipe.app, `${path}.app`);
  const review = recordAt(app.review, `${path}.app.review`);
  const reviewStatus = enumAt(review.status, REVIEW_STATUSES, `${path}.app.review.status`);
  stringAt(review.summary, `${path}.app.review.summary`);
  if (review.caution !== undefined) stringAt(review.caution, `${path}.app.review.caution`);
  if (reviewStatus === "caution" && review.caution === undefined) invalidCatalogue(`${path}.app.review.caution: chaîne non vide requise`);
  optionalStringAt(app.duplicate_of, `${path}.app.duplicate_of`);

  const planner = recordAt(app.planner, `${path}.app.planner`);
  booleanAt(planner.eligible, `${path}.app.planner.eligible`);
  stringArrayAt(planner.meal_types, `${path}.app.planner.meal_types`, MEAL_TYPES);
  stringArrayAt(planner.diets, `${path}.app.planner.diets`, DIET_MODES);
  numberAt(planner.cost_per_portion_eur, `${path}.app.planner.cost_per_portion_eur`, Number.EPSILON);
  stringArrayAt(planner.equipment, `${path}.app.planner.equipment`, EQUIPMENT);
  stringArrayAt(planner.allergens, `${path}.app.planner.allergens`, CATALOGUE_ALLERGENS);
  if (schemaVersion === "2.1.0" || planner.targets !== undefined) stringArrayAt(planner.targets, `${path}.app.planner.targets`, WEEKLY_TARGETS);
  if (schemaVersion === "2.1.0" || planner.active_minutes !== undefined) numberAt(planner.active_minutes, `${path}.app.planner.active_minutes`);

  const ingredientAllergens = [...new Set(ingredients.flatMap((rawIngredient) => (
    recordAt(rawIngredient, `${path}.ingredients`).allergenes as string[]
  )))].sort();
  const plannerAllergens = [...new Set(planner.allergens as string[])].sort();
  if (ingredientAllergens.length !== plannerAllergens.length
    || ingredientAllergens.some((allergen, index) => allergen !== plannerAllergens[index])) {
    invalidCatalogue(`${path}.app.planner.allergens: incohérents avec les ingrédients`);
  }

  return { id, slug };
}

/** Validates untrusted catalogue JSON before it is exposed or stored offline. */
export function validateCatalogueData(
  value: unknown,
  { expectedRecipeCount = EXPECTED_CATALOGUE_RECIPE_COUNT }: { expectedRecipeCount?: number } = {},
): CatalogueData {
  const catalogue = recordAt(value, "racine");
  const meta = recordAt(catalogue.meta, "meta");
  const schemaVersion = enumAt(meta.schema_version, CATALOGUE_SCHEMA_VERSIONS, "meta.schema_version");
  stringAt(meta.avertissement, "meta.avertissement");
  stringAt(meta.licence, "meta.licence");
  const declaredRecipeCount = numberAt(meta.nombre_recettes, "meta.nombre_recettes");
  if (!Number.isInteger(declaredRecipeCount)) invalidCatalogue("meta.nombre_recettes: entier requis");

  const categoryIds = new Set<string>();
  for (const [index, rawCategory] of arrayAt(catalogue.categories, "categories", true).entries()) {
    const category = recordAt(rawCategory, `categories[${index}]`);
    const id = stringAt(category.id, `categories[${index}].id`);
    if (categoryIds.has(id)) invalidCatalogue(`categories[${index}].id: doublon ${id}`);
    categoryIds.add(id);
    stringAt(category.nom, `categories[${index}].nom`);
    stringAt(category.description, `categories[${index}].description`);
  }

  const recipes = arrayAt(catalogue.recipes, "recipes", true);
  if (declaredRecipeCount !== recipes.length) invalidCatalogue("meta.nombre_recettes: incohérent avec recipes");
  if (recipes.length !== expectedRecipeCount) {
    invalidCatalogue(`recipes: ${expectedRecipeCount} recettes attendues, ${recipes.length} reçues`);
  }
  const recipeIds = new Set<string>();
  const recipeSlugs = new Set<string>();
  for (const [index, rawRecipe] of recipes.entries()) {
    const { id, slug } = validateRecipe(rawRecipe, `recipes[${index}]`, schemaVersion);
    if (recipeIds.has(id)) invalidCatalogue(`recipes[${index}].id: doublon ${id}`);
    if (recipeSlugs.has(slug)) invalidCatalogue(`recipes[${index}].slug: doublon ${slug}`);
    recipeIds.add(id);
    recipeSlugs.add(slug);
  }

  return value as CatalogueData;
}

/** Validates and copies untrusted caution JSON to an id-to-string dictionary. */
export function validatePlannerCautions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Précautions invalides (objet requis)");
  const cautions = Object.create(null) as Record<string, string>;
  const entries = Object.entries(value);
  if (entries.length !== EXPECTED_PLANNER_CAUTION_IDS.size) {
    throw new Error(`Précautions invalides (${EXPECTED_PLANNER_CAUTION_IDS.size} entrées attendues, ${entries.length} reçues)`);
  }
  for (const [recipeId, caution] of entries) {
    if (recipeId.trim() === "" || typeof caution !== "string" || caution.trim() === "") {
      throw new Error(`Précautions invalides (${recipeId || "identifiant vide"})`);
    }
    cautions[recipeId] = caution;
  }
  if (entries.some(([recipeId]) => !EXPECTED_PLANNER_CAUTION_IDS.has(recipeId))) {
    throw new Error("Précautions invalides (identifiants incohérents avec la projection planificateur)");
  }
  return cautions;
}
