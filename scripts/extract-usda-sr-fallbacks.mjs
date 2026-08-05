import { readFile, writeFile } from "node:fs/promises";

const [sourceFile] = process.argv.slice(2);
if (!sourceFile) {
  throw new Error("Usage: node scripts/extract-usda-sr-fallbacks.mjs <FoodData_Central_sr_legacy_food_json_2018-04.json>");
}

const source = JSON.parse(await readFile(sourceFile, "utf8"));
const foods = source.SRLegacyFoods ?? source.srLegacyFoods ?? source.foods;
if (!Array.isArray(foods)) throw new Error("Tableau SR Legacy introuvable");

const targets = new Set([
  "Teff, uncooked",
  "Beans, black, mature seeds, cooked, boiled, without salt",
  "Spices, cardamom",
  "Seeds, chia seeds, dried",
  "Cheese, ricotta, whole milk",
  "Rosemary, fresh",
]);
const nutrientIds = {
  energy_kcal: 1008,
  protein_g: 1003,
  carbohydrate_g: 1005,
  fat_g: 1004,
  sugars_g: 2000,
  fiber_g: 1079,
  saturated_fat_g: 1258,
  sodium_mg: 1093,
};

const selected = foods.filter((food) => targets.has(food.description)).map((food) => {
  const byId = new Map(food.foodNutrients.map((entry) => [entry.nutrient.id, entry]));
  return {
    fdc_id: String(food.fdcId),
    ndb_number: String(food.ndbNumber),
    name: food.description,
    group: food.foodCategory?.description ?? null,
    nutrients_per_100g: Object.fromEntries(Object.entries(nutrientIds).map(([key, id]) => {
      const nutrient = byId.get(id);
      return [key, {
        value: nutrient?.amount ?? null,
        qualifier: nutrient?.foodNutrientDerivation?.code ?? "unknown",
      }];
    })),
    portions: food.foodPortions.map((portion) => ({
      amount: portion.amount,
      modifier: portion.modifier,
      grams: portion.gramWeight,
    })),
  };
});

if (selected.length !== targets.size) {
  const found = new Set(selected.map((food) => food.name));
  throw new Error(`Aliments manquants : ${[...targets].filter((name) => !found.has(name)).join(", ")}`);
}

const output = {
  meta: {
    source: "USDA FoodData Central, SR Legacy, final release April 2018",
    url: "https://fdc.nal.usda.gov/download-datasets/",
    archive: "FoodData_Central_sr_legacy_food_json_2018-04.zip",
    extracted_at: "2026-08-05",
    notice: "Repli limité aux aliments absents de Ciqual; valeurs pour 100 g.",
  },
  foods: selected,
};

await writeFile(new URL("../research/usda-sr-fallbacks.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${selected.length} aliments USDA SR Legacy extraits.`);
