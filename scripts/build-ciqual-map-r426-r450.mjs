import { readFile, writeFile } from "node:fs/promises";

const seed = JSON.parse(await readFile("/tmp/ciqual-map-r426-r450.seed.json", "utf8"));
const reviewed = {
  "blanc-poulet": ["36017", 1, "Filet de poulet sans peau cru, pesé avant cuisson."],
  "cafe-orge-soluble": ["18005", 2, "Café soluble Ciqual; proxy documenté du café d'orge soluble, 2 g par cuillère à café."],
  "caille-entiere": ["36100", 100, "Caille crue avec peau; 100 g de partie comestible par petite caille."],
  cebette: ["20323", 15, "Cébette cuite Ciqual; 15 g par petite cébette."],
  "escalope-dinde": ["36304", 1, "Escalope de dinde crue, pesée avant cuisson."],
  "fenugrec-moulu": ["11077", 3, "Fenugrec graine Ciqual; proxy de la poudre, 3 g par cuillère à café."],
  "filet-pintade": ["36702", 1, "Poitrine de pintade crue, pesée avant cuisson."],
  grenade: ["13018", 170, "Grenade crue; 170 g d'arilles par fruit moyen."],
  "riz-sauvage": ["9108", 1, "Riz sauvage cru, pesé sec."],
  "the-vert-feuilles": ["18066", 1, "Eau Ciqual utilisée car les feuilles de thé infusées sont entièrement retirées avant consommation."],
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
    entry.review_status = ["cafe-orge-soluble", "caille-entiere", "cebette", "fenugrec-moulu", "the-vert-feuilles"].includes(entry.ingredient_id) ? "caution" : "validated";
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
seed.meta = { schema_version: "1.0.0", lot: "r426-r450", status: "reviewed-with-cautions", ingredient_count: seed.ingredients.length, ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025", ciqual_version: "2025-11-03", ciqual_doi: "https://doi.org/10.57745/RDMHWY", review_note: "Chaque code, proxy et conversion a été relu; les approximations sont marquées caution." };
await writeFile("research/ciqual-map-r426-r450.json", `${JSON.stringify(seed, null, 2)}\n`);
console.log(`${seed.ingredients.length} correspondances r426-r450 relues.`);
