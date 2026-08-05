import { readFile, writeFile } from "node:fs/promises";

const [recipeFile, mappingFile, outputFile] = process.argv.slice(2);
if (!recipeFile || !mappingFile || !outputFile) {
  throw new Error("Usage: node scripts/calculate-pilot-nutrition.mjs <lot.json> <mapping.json> <sortie.json>");
}

const [catalogue, mappingData, ciqual, usda] = await Promise.all([
  readFile(recipeFile, "utf8").then(JSON.parse),
  readFile(mappingFile, "utf8").then(JSON.parse),
  readFile(new URL("../research/ciqual-2025-core.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../research/usda-sr-fallbacks.json", import.meta.url), "utf8").then(JSON.parse),
]);

const mappings = new Map(mappingData.ingredients.map((entry) => [entry.ingredient_id, entry]));
if (mappings.size !== mappingData.ingredients.length) throw new Error("Le mapping nutritionnel contient des identifiants dupliqués");
const requiredIngredientIds = new Set(catalogue.recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.id)));
const missingMappings = [...requiredIngredientIds].filter((id) => !mappings.has(id));
const unusedMappings = [...mappings.keys()].filter((id) => !requiredIngredientIds.has(id));
if (missingMappings.length) throw new Error(`Mappings absents : ${missingMappings.join(", ")}`);
if (unusedMappings.length) throw new Error(`Mappings inutilisés : ${unusedMappings.join(", ")}`);
const foods = new Map(ciqual.foods.map((food) => [food.code, food]));
const usdaFoods = new Map(usda.foods.map((food) => [food.fdc_id, food]));
const nutrientFields = {
  calories: "energy_kcal",
  proteines_g: "protein_g",
  glucides_g: "carbohydrate_g",
  sucres_g: "sugars_g",
  lipides_g: "fat_g",
  acides_gras_satures_g: "saturated_fat_g",
  fibres_g: "fiber_g",
  sodium_mg: "sodium_mg",
};

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

for (const recipe of catalogue.recipes) {
  const totals = Object.fromEntries(Object.keys(nutrientFields).map((field) => [field, 0]));
  const calculation = [];
  const sourcesUsed = new Set();
  const calculationCautions = [];

  for (const ingredient of recipe.ingredients) {
    if (ingredient.facultatif) continue;
    const mapping = mappings.get(ingredient.id);
    if (!mapping || !["validated", "caution"].includes(mapping.review_status)) {
      throw new Error(`${recipe.id}.${ingredient.id}: correspondance Ciqual non validée`);
    }
    if (mapping.review_status === "caution") {
      calculationCautions.push(`${ingredient.id}: ${mapping.rationale ?? "correspondance utilisée avec réserve"}`);
    }
    const occurrence = mapping.occurrence_overrides?.[recipe.id];
    const unitFactor = occurrence?.grams_per_normalized_unit
      ?? mapping.grams_per_unit?.[ingredient.unite_normalisee]
      ?? mapping.grams_per_normalized_unit;
    const grams = occurrence?.grams_total
      ?? ingredient.quantite_normalisee * unitFactor;
    if (!Number.isFinite(grams) || grams <= 0) {
      throw new Error(`${recipe.id}.${ingredient.id}: conversion en grammes absente pour ${ingredient.unite_normalisee}`);
    }
    const sourceDataset = mapping.source_dataset ?? "ciqual";
    const selectedCode = String(mapping.selected_source_code ?? mapping.selected_ciqual_code ?? "");
    const food = sourceDataset === "usda-sr" ? usdaFoods.get(selectedCode) : foods.get(selectedCode);
    if (!food) throw new Error(`${recipe.id}.${ingredient.id}: code ${sourceDataset} inconnu ${selectedCode}`);
    sourcesUsed.add(sourceDataset);

    for (const [target, source] of Object.entries(nutrientFields)) {
      const nutrient = food.nutrients_per_100g[source];
      const override = mapping.nutrient_overrides?.[source];
      const nutrientValue = nutrient.value ?? (typeof override === "number" ? override : override?.value);
      if (!Number.isFinite(nutrientValue)) throw new Error(`${recipe.id}.${ingredient.id}: ${source} manquant dans ${sourceDataset}`);
      if (nutrient.value === null) {
        calculationCautions.push(`${ingredient.id}.${source}: ${override?.note ?? "valeur de remplacement documentée"}`);
      }
      totals[target] += nutrientValue * grams / 100;
    }

    calculation.push({
      ingredient_id: ingredient.id,
      source_dataset: sourceDataset,
      source_code: sourceDataset === "usda-sr" ? food.fdc_id : food.code,
      source_name: food.name,
      grams: round(grams, 2),
      conversion: occurrence?.grams_total !== undefined
        ? "occurrence_override"
        : `factor_${ingredient.unite_normalisee}`,
    });
  }

  recipe.nutrition_par_portion = {
    ...Object.fromEntries(Object.entries(totals).map(([field, total]) => [field, round(total / recipe.portions, field === "calories" || field === "sodium_mg" ? 0 : 1)])),
    estimation: {
      statut: calculationCautions.length ? "calculated-with-cautions" : "calculated",
      methode: "Somme des ingrédients convertis en grammes, tables de composition officielles, divisée par le nombre de portions",
      provenance: [...sourcesUsed].map((source) => source === "ciqual"
        ? "Anses Ciqual 2025 (doi:10.57745/RDMHWY)"
        : "USDA FoodData Central SR Legacy 2018").join("; "),
      details: calculation,
      ...(calculationCautions.length ? { cautions: [...new Set(calculationCautions)] } : {}),
    },
  };

  recipe.provenance.sources = recipe.provenance.sources.filter((source) => source.kind !== "nutrition");
  if (sourcesUsed.has("ciqual")) {
    recipe.provenance.sources.push({
      kind: "nutrition",
      title: "Table de composition nutritionnelle des aliments Ciqual 2025",
      url: "https://doi.org/10.57745/RDMHWY",
      version: "2025-11-03",
      accessed_at: "2026-08-05",
    });
  }
  if (sourcesUsed.has("usda-sr")) {
    recipe.provenance.sources.push({
      kind: "nutrition",
      title: "USDA FoodData Central — SR Legacy",
      url: "https://fdc.nal.usda.gov/download-datasets/",
      version: "final release 2018-04",
      accessed_at: "2026-08-05",
    });
  }
}

await writeFile(outputFile, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes calculées dans ${outputFile}.`);
