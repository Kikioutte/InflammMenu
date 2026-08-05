import { readFile, writeFile } from "node:fs/promises";

const [recipeFile, mappingFile, outputFile] = process.argv.slice(2);
if (!recipeFile || !mappingFile || !outputFile) {
  throw new Error("Usage: node scripts/calculate-pilot-nutrition.mjs <lot.json> <mapping.json> <sortie.json>");
}

const [catalogue, mappingData, ciqual] = await Promise.all([
  readFile(recipeFile, "utf8").then(JSON.parse),
  readFile(mappingFile, "utf8").then(JSON.parse),
  readFile(new URL("../research/ciqual-2025-core.json", import.meta.url), "utf8").then(JSON.parse),
]);

const mappings = new Map(mappingData.ingredients.map((entry) => [entry.ingredient_id, entry]));
const foods = new Map(ciqual.foods.map((food) => [food.code, food]));
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

  for (const ingredient of recipe.ingredients) {
    if (ingredient.facultatif) continue;
    const mapping = mappings.get(ingredient.id);
    if (!mapping || mapping.review_status !== "validated") {
      throw new Error(`${recipe.id}.${ingredient.id}: correspondance Ciqual non validée`);
    }
    if (!Number.isFinite(mapping.grams_per_normalized_unit) || mapping.grams_per_normalized_unit <= 0) {
      throw new Error(`${recipe.id}.${ingredient.id}: facteur de conversion en grammes invalide`);
    }
    const food = foods.get(mapping.selected_ciqual_code);
    if (!food) throw new Error(`${recipe.id}.${ingredient.id}: code Ciqual inconnu ${mapping.selected_ciqual_code}`);
    const grams = ingredient.quantite_normalisee * mapping.grams_per_normalized_unit;

    for (const [target, source] of Object.entries(nutrientFields)) {
      const nutrient = food.nutrients_per_100g[source];
      if (nutrient.value === null) throw new Error(`${recipe.id}.${ingredient.id}: ${source} manquant dans Ciqual`);
      totals[target] += nutrient.value * grams / 100;
    }

    calculation.push({
      ingredient_id: ingredient.id,
      ciqual_code: food.code,
      ciqual_name: food.name,
      grams: round(grams, 2),
    });
  }

  recipe.nutrition_par_portion = {
    ...Object.fromEntries(Object.entries(totals).map(([field, total]) => [field, round(total / recipe.portions, field === "calories" || field === "sodium_mg" ? 0 : 1)])),
    estimation: {
      statut: "calculated",
      methode: "Somme des ingrédients convertis en grammes, table Ciqual 2025, divisée par le nombre de portions",
      provenance: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025 (doi:10.57745/RDMHWY)",
      details: calculation,
    },
  };

  recipe.provenance.sources = recipe.provenance.sources.filter((source) => source.kind !== "nutrition");
  recipe.provenance.sources.push({
    kind: "nutrition",
    title: "Table de composition nutritionnelle des aliments Ciqual 2025",
    url: "https://doi.org/10.57745/RDMHWY",
    version: "2025-11-03",
    accessed_at: "2026-08-05",
  });
}

await writeFile(outputFile, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes calculées dans ${outputFile}.`);
