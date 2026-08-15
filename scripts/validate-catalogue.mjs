import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const dataUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);

const allowedSchemaVersions = new Set(["2.0.0", "2.1.0"]);
const allowedReviewStatuses = new Set(["validated", "caution"]);
const allowedMealTypes = new Set(["breakfast", "lunch", "dinner"]);
const allowedDiets = new Set(["classic", "vegetarian", "no-pork"]);
const allowedEquipment = new Set(["hob", "oven", "microwave", "blender", "toaster", "steamer"]);
const allowedNormalizedUnits = new Set(["g", "ml", "piece", "c_soupe", "c_cafe"]);
const allowedShoppingCategories = new Set([
  "fruit-vegetable",
  "grocery",
  "fresh",
  "meat-fish",
  "bakery",
  "beverage",
  "frozen",
]);
const allowedAllergens = new Set([
  "gluten",
  "crustaces",
  "oeuf",
  "poisson",
  "arachides",
  "soja",
  "lait",
  "fruits-a-coque",
  "celeri",
  "moutarde",
  "sesame",
  "sulfites",
  "lupin",
  "mollusques",
]);
const allowedProvenanceKinds = new Set(["nutrition", "cost", "inspiration", "safety"]);
const allowedCreamiPrograms = new Set(["ICE CREAM", "LITE ICE CREAM", "SORBET", "GELATO", "FROZEN YOGURT"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function assertArrayValues(values, allowed, label) {
  assert(Array.isArray(values), `${label}: tableau requis`);
  for (const value of values) assert(allowed.has(value), `${label}: valeur inconnue ${value}`);
}

function assertProvenance(provenance, label) {
  assert(provenance && typeof provenance === "object", `${label}: provenance requise en v2.1`);
  assert(["original", "adapted"].includes(provenance.type), `${label}.type: valeur invalide`);
  assert(nonEmptyString(provenance.author), `${label}.author: valeur requise`);
  assert(nonEmptyString(provenance.license), `${label}.license: valeur requise`);
  assert(isoDate(provenance.created_at), `${label}.created_at: date ISO requise`);
  if (provenance.reviewed_at !== undefined) {
    assert(isoDate(provenance.reviewed_at), `${label}.reviewed_at: date ISO invalide`);
  }
  assert(Array.isArray(provenance.sources) && provenance.sources.length > 0, `${label}.sources: au moins une source requise`);
  for (const [index, source] of provenance.sources.entries()) {
    const sourceLabel = `${label}.sources[${index}]`;
    assert(allowedProvenanceKinds.has(source?.kind), `${sourceLabel}.kind: valeur invalide`);
    assert(nonEmptyString(source?.title), `${sourceLabel}.title: valeur requise`);
    assert(isoDate(source?.accessed_at), `${sourceLabel}.accessed_at: date ISO requise`);
    if (source.url !== undefined) {
      assert(/^https:\/\//.test(source.url), `${sourceLabel}.url: URL HTTPS requise`);
    }
    if (source.version !== undefined) {
      assert(nonEmptyString(source.version), `${sourceLabel}.version: valeur invalide`);
    }
  }
}

export function validateCatalogue(catalogue) {
  assert(allowedSchemaVersions.has(catalogue.meta?.schema_version), "meta.schema_version doit valoir 2.0.0 ou 2.1.0");
  const isV21 = catalogue.meta.schema_version === "2.1.0";
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
    if (recipe.materiel !== undefined) {
      assert(Array.isArray(recipe.materiel) && recipe.materiel.length > 0, `${label}: matériel invalide`);
      for (const item of recipe.materiel) assert(nonEmptyString(item), `${label}: libellé de matériel invalide`);
    }
    if (recipe.tags.includes("ninja-creami-deluxe")) {
      assert(recipe.creami?.modele === "Ninja CREAMi Deluxe (NC501EU)", `${label}: modèle CREAMi Deluxe requis`);
      assert(allowedCreamiPrograms.has(recipe.creami?.programme), `${label}: programme CREAMi inconnu`);
      assert(recipe.creami?.zone === "FULL", `${label}: zone CREAMi FULL requise`);
      assert(recipe.materiel?.includes("Ninja CREAMi Deluxe (NC501EU)"), `${label}: machine absente du matériel`);
    }
    assert(recipe.score_anti_inflammatoire >= 0 && recipe.score_anti_inflammatoire <= 10, `${label}: indice éditorial hors limites`);

    if (isV21 || recipe.provenance !== undefined) assertProvenance(recipe.provenance, `${label}.provenance`);

    const review = recipe.app?.review;
    assert(allowedReviewStatuses.has(review?.status), `${label}: statut de relecture invalide`);
    assert(nonEmptyString(review?.summary), `${label}: résumé de relecture requis`);
    if (review.status === "caution") assert(nonEmptyString(review.caution), `${label}: précaution requise`);

    const planner = recipe.app?.planner;
    assert(typeof planner?.eligible === "boolean", `${label}: éligibilité planificateur requise`);
    assertArrayValues(planner.meal_types, allowedMealTypes, `${label}.app.planner.meal_types`);
    assertArrayValues(planner.diets, allowedDiets, `${label}.app.planner.diets`);
    assertArrayValues(planner.equipment, allowedEquipment, `${label}.app.planner.equipment`);
    assertArrayValues(planner.allergens, allowedAllergens, `${label}.app.planner.allergens`);
    assert(Number.isFinite(planner.cost_per_portion_eur) && planner.cost_per_portion_eur > 0, `${label}: coût par portion invalide`);
    if (isV21) assert(planner.active_minutes !== undefined, `${label}.app.planner.active_minutes: valeur requise en v2.1`);
    if (planner.active_minutes !== undefined) {
      assert(Number.isInteger(planner.active_minutes) && planner.active_minutes >= 0, `${label}: temps actif invalide`);
      assert(planner.active_minutes <= recipe.temps.total, `${label}: temps actif supérieur au temps total`);
      assert(
        planner.active_minutes <= recipe.temps.preparation + recipe.temps.cuisson,
        `${label}: le temps actif inclut du repos passif`,
      );
    }
    if (recipe.app.duplicate_of) assert(planner.eligible === false, `${label}: un doublon ne peut pas alimenter le planificateur`);

    for (const ingredient of recipe.ingredients) {
      const ingredientLabel = `${label}.${ingredient.id ?? ingredient.nom ?? "ingrédient"}`;
      assert(nonEmptyString(ingredient.nom), `${label}: nom d'ingrédient requis`);
      assert(Number.isFinite(ingredient.quantite) && ingredient.quantite >= 0, `${label}: quantité d'ingrédient invalide`);
      assert(nonEmptyString(ingredient.unite), `${label}: unité d'ingrédient requise`);
      assert(allowedShoppingCategories.has(ingredient.categorie_courses), `${label}: catégorie de courses invalide`);
      assertArrayValues(ingredient.allergenes, allowedAllergens, `${ingredientLabel}.allergenes`);
      if (ingredient.pantry_staple !== undefined) {
        assert(typeof ingredient.pantry_staple === "boolean", `${ingredientLabel}.pantry_staple doit être booléen`);
      }

      const normalizedFields = [ingredient.id, ingredient.quantite_normalisee, ingredient.unite_normalisee, ingredient.facultatif];
      const normalizedFieldCount = normalizedFields.filter((value) => value !== undefined).length;
      if (isV21) assert(normalizedFieldCount === normalizedFields.length, `${ingredientLabel}: champs normalisés requis en v2.1`);
      if (normalizedFieldCount > 0) {
        assert(normalizedFieldCount === normalizedFields.length, `${ingredientLabel}: bloc de normalisation incomplet`);
        assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ingredient.id), `${ingredientLabel}: id canonique invalide`);
        assert(Number.isFinite(ingredient.quantite_normalisee) && ingredient.quantite_normalisee >= 0, `${ingredientLabel}: quantité normalisée invalide`);
        assert(allowedNormalizedUnits.has(ingredient.unite_normalisee), `${ingredientLabel}: unité normalisée invalide`);
        assert(typeof ingredient.facultatif === "boolean", `${ingredientLabel}: facultatif doit être booléen`);
      }
    }

    const ingredientAllergens = [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort();
    const plannerAllergens = [...new Set(planner.allergens)].sort();
    assert(
      JSON.stringify(ingredientAllergens) === JSON.stringify(plannerAllergens),
      `${label}: les allergènes du planificateur doivent correspondre aux ingrédients`,
    );
  }

  return { recipeCount: catalogue.recipes.length, uniqueIdCount: ids.size, schemaVersion: catalogue.meta.schema_version };
}

async function run() {
  const catalogue = JSON.parse(await readFile(dataUrl, "utf8"));
  const result = validateCatalogue(catalogue);
  console.log(`Catalogue v${result.schemaVersion} valide : ${result.recipeCount} recettes, ${result.uniqueIdCount} identifiants uniques.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await run();
