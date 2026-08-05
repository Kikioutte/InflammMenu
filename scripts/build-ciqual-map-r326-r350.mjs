import { readFile, writeFile } from "node:fs/promises";

const seed = JSON.parse(await readFile("/tmp/ciqual-map-r326-r350.seed.json", "utf8"));
const reviewed = {
  "algue-dulse-sechee": ["20988", 1, "Dulse séchée Ciqual; quantité pesée en grammes."],
  cardon: ["20054", 1, "Cardon cru; proxy du cardon préparé avant cuisson."],
  "chataigne-cuite": ["15020", 1, "Châtaigne bouillie/cuite à l'eau."],
  feta: ["12066", 1, "Feta au lait de brebis et chèvre Ciqual."],
  "fromage-frais": ["12068", 1, "Fromage frais nature à tartiner Ciqual."],
  "lentilles-jaunes-seches": ["20586", 1, "Lentille blonde sèche; proxy de la lentille jaune sèche."],
  "moutarde-ancienne": ["11021", 15, "Moutarde à l'ancienne; 15 g par cuillère à soupe."],
  parmesan: ["12120", 1, "Parmesan Ciqual."],
  "tortilla-mais": ["7813", 25, "Tortilla souple de maïs; 25 g par petite tortilla."],
};

for (const entry of seed.ingredients) {
  const selected = reviewed[entry.ingredient_id];
  if (selected) {
    const [code, factor, rationale] = selected;
    entry.selected_ciqual_code = code;
    entry.source_dataset = "ciqual";
    entry.selected_source_code = code;
    entry.grams_per_normalized_unit = factor;
    entry.grams_per_unit = Object.fromEntries(Object.keys(entry.grams_per_unit ?? {}).map((unit) => [unit, factor]));
    entry.review_status = ["cardon", "lentilles-jaunes-seches"].includes(entry.ingredient_id) ? "caution" : "validated";
    entry.rationale = rationale;
    entry.source_note = "Anses, Table Ciqual 2025; conversion ménagère éditoriale à confirmer au pesage.";
  }
  entry.grams_per_unit ??= {};
  for (const occurrence of entry.batch_occurrences ?? []) {
    if (occurrence.unit === "g" || occurrence.unit === "ml") entry.grams_per_unit[occurrence.unit] = 1;
  }
}

const pending = seed.ingredients.filter((entry) => !["validated", "caution"].includes(entry.review_status));
if (pending.length) throw new Error(`Correspondances non relues : ${pending.map((entry) => entry.ingredient_id).join(", ")}`);
seed.meta = { schema_version: "1.0.0", lot: "r326-r350", status: "reviewed-with-cautions", ingredient_count: seed.ingredients.length, ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025", ciqual_version: "2025-11-03", ciqual_doi: "https://doi.org/10.57745/RDMHWY", review_note: "Chaque code et conversion a été relu; les proxies restent marqués caution." };
await writeFile("research/ciqual-map-r326-r350.json", `${JSON.stringify(seed, null, 2)}\n`);
console.log(`${seed.ingredients.length} correspondances r326-r350 relues.`);
