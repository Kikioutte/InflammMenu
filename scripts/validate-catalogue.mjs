import { readFile } from "node:fs/promises";

const dataUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));

const allowedReviewStatuses = new Set(["validated", "caution"]);
const allowedMealTypes = new Set(["breakfast", "lunch", "dinner"]);
const allowedDiets = new Set(["classic", "vegetarian", "no-pork"]);
const allowedEquipment = new Set(["oven", "hob", "blender"]);
const allowedShoppingCategories = new Set([
  "fruit-vegetable",
  "grocery",
  "fresh",
  "meat-fish",
  "bakery",
  "beverage",
  "frozen",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertArrayValues(values, allowed, label) {
  assert(Array.isArray(values), `${label}: tableau requis`);
  for (const value of values) assert(allowed.has(value), `${label}: valeur inconnue ${value}`);
}

assert(catalogue.meta?.schema_version === "2.0.0", "meta.schema_version doit valoir 2.0.0");
assert(Array.isArray(catalogue.recipes), "recipes doit être un tableau");
assert(catalogue.meta.nombre_recettes === catalogue.recipes.length, "meta.nombre_recettes doit correspondre au catalogue");

const ids = new Set();
const slugs = new Set();
for (const recipe of catalogue.recipes) {
  const label = recipe.id ?? "recette sans identifiant";
  assert(/^r\d{3,}$/.test(recipe.id), `${label}: identifiant invalide`);
  assert(!ids.has(recipe.id), `${label}: identifiant dupliqué`);
  assert(nonEmptyString(recipe.slug) && !slugs.has(recipe.slug), `${label}: slug absent ou dupliqué`);
  ids.add(recipe.id);
  slugs.add(recipe.slug);

  assert(nonEmptyString(recipe.titre), `${label}: titre requis`);
  assert(recipe.portions > 0, `${label}: portions invalides`);
  assert(
    recipe.temps.total === recipe.temps.preparation + recipe.temps.cuisson + recipe.temps.repos,
    `${label}: temps total incohérent`,
  );
  assert(Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0, `${label}: ingrédients requis`);
  assert(Array.isArray(recipe.etapes) && recipe.etapes.length > 0, `${label}: étapes requises`);
  assert(recipe.score_anti_inflammatoire >= 0 && recipe.score_anti_inflammatoire <= 10, `${label}: indice éditorial hors limites`);

  const review = recipe.app?.review;
  assert(allowedReviewStatuses.has(review?.status), `${label}: statut de relecture invalide`);
  assert(nonEmptyString(review?.summary), `${label}: résumé de relecture requis`);
  if (review.status === "caution") assert(nonEmptyString(review.caution), `${label}: précaution requise`);

  const planner = recipe.app?.planner;
  assert(typeof planner?.eligible === "boolean", `${label}: éligibilité planificateur requise`);
  assertArrayValues(planner.meal_types, allowedMealTypes, `${label}.app.planner.meal_types`);
  assertArrayValues(planner.diets, allowedDiets, `${label}.app.planner.diets`);
  assertArrayValues(planner.equipment, allowedEquipment, `${label}.app.planner.equipment`);
  assert(Array.isArray(planner.allergens), `${label}: allergènes planificateur requis`);
  assert(Number.isFinite(planner.cost_per_portion_eur) && planner.cost_per_portion_eur > 0, `${label}: coût par portion invalide`);
  if (recipe.app.duplicate_of) assert(planner.eligible === false, `${label}: un doublon ne peut pas alimenter le planificateur`);

  for (const ingredient of recipe.ingredients) {
    assert(nonEmptyString(ingredient.nom), `${label}: nom d'ingrédient requis`);
    assert(Number.isFinite(ingredient.quantite) && ingredient.quantite >= 0, `${label}: quantité d'ingrédient invalide`);
    assert(nonEmptyString(ingredient.unite), `${label}: unité d'ingrédient requise`);
    assert(allowedShoppingCategories.has(ingredient.categorie_courses), `${label}: catégorie de courses invalide`);
    assert(Array.isArray(ingredient.allergenes), `${label}: allergènes d'ingrédient requis`);
  }
}

console.log(`Catalogue v2 valide : ${catalogue.recipes.length} recettes, ${ids.size} identifiants uniques.`);
