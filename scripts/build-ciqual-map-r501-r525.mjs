import { readFile, writeFile } from "node:fs/promises";

const seed = JSON.parse(await readFile("/tmp/ciqual-map-r501-r525.seed.json", "utf8"));
const reviewed = {
  "ajwain-graines": ["ciqual", "11064", 2, "Carvi graine Ciqual; proxy documenté de l'ajwain, 2 g par cuillère à café."],
  "cardamome-gousse": ["usda-sr", "170919", 0.2, "Cardamome USDA SR; 0,2 g de graines par gousse."],
  "cumin-graines": ["ciqual", "11042", 2.1, "Cumin graine Ciqual; 2,1 g par cuillère à café."],
  "curcuma-moulu": ["ciqual", "11089", 3, "Curcuma en poudre Ciqual; 3 g par cuillère à café, uniquement à dose culinaire."],
  "eau-rose-culinaire": ["ciqual", "18066", 5, "Eau Ciqual; approximation de l'eau de rose alimentaire, 5 g par cuillère à café."],
  "millet-souffle": ["ciqual", "9555", 1, "Farine de millet Ciqual; proxy du millet soufflé nature à poids égal."],
  "orge-torrefie": ["ciqual", "9320", 1, "Orge complète crue Ciqual; proxy de l'orge alimentaire torréfiée à poids égal."],
};

for (const entry of seed.ingredients) {
  const selected = reviewed[entry.ingredient_id];
  if (selected) {
    const [dataset, code, factor, rationale] = selected;
    entry.source_dataset = dataset;
    entry.selected_source_code = code;
    entry.selected_ciqual_code = dataset === "ciqual" ? code : null;
    entry.grams_per_normalized_unit = factor;
    entry.grams_per_unit = Object.fromEntries(Object.keys(entry.grams_per_unit ?? {}).map((unit) => [unit, factor]));
    entry.review_status = ["cumin-graines", "curcuma-moulu"].includes(entry.ingredient_id) ? "validated" : "caution";
    entry.rationale = rationale;
    entry.source_note = dataset === "ciqual" ? "Anses, Table Ciqual 2025; conversion ménagère éditoriale à confirmer au pesage." : "USDA FoodData Central, SR Legacy 2018; conversion ménagère éditoriale à confirmer au pesage.";
    if (entry.ingredient_id === "cardamome-gousse") {
      entry.nutrient_overrides = { sugars_g: { value: 0, note: "Sucres absents de USDA SR pour la cardamome; valeur technique à 0 à la dose culinaire utilisée." } };
    }
  }
  entry.grams_per_unit ??= {};
  for (const occurrence of entry.batch_occurrences ?? []) {
    if (occurrence.unit === "g" || occurrence.unit === "ml") entry.grams_per_unit[occurrence.unit] = 1;
  }
}

const pending = seed.ingredients.filter((entry) => !["validated", "caution"].includes(entry.review_status));
if (pending.length) throw new Error(`Correspondances non relues : ${pending.map((entry) => entry.ingredient_id).join(", ")}`);
seed.meta = { schema_version: "1.0.0", lot: "r501-r525", status: "reviewed-with-cautions", ingredient_count: seed.ingredients.length, ciqual_source: "Anses, Table Ciqual 2025", fallback_source: "USDA FoodData Central SR Legacy 2018", review_note: "Chaque code, proxy et conversion a été relu; l'inspiration ayurvédique reste strictement culinaire." };
await writeFile("research/ciqual-map-r501-r525.json", `${JSON.stringify(seed, null, 2)}\n`);
console.log(`${seed.ingredients.length} correspondances r501-r525 relues.`);
