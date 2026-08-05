import { readFile, writeFile } from "node:fs/promises";

const seed = JSON.parse(await readFile("/tmp/ciqual-map-r251-r275.seed.json", "utf8"));
const reviewed = {
  "artichaut-poivrade": ["20052", 100, "Artichaut cru; 100 g de partie comestible par petit artichaut poivrade."],
  "asperge-blanche": ["20277", 1, "Asperge blanche cuite Ciqual; proxy de l'asperge blanche pesée crue."],
  "basilic-citron": ["11033", 1, "Basilic frais; proxy du basilic citron."],
  burrata: ["12072", 1, "Burrata Ciqual."],
  "chou-chinois": ["20167", 1, "Chou chinois pé-tsaï cru."],
  clementine: ["13024", 75, "Clémentine crue; 75 g de chair par fruit."],
  "courgette-jaune": ["20020", 250, "Courgette crue; proxy de la variété jaune, 250 g par pièce."],
  echalote: ["20097", 30, "Échalote crue; 30 g par pièce."],
  "fromage-brebis": ["12747", 1, "Tomme de brebis Ciqual; proxy du fromage de brebis."],
  "fromage-chevre-frais": ["12805", 1, "Fromage de chèvre frais Ciqual."],
  gombo: ["58100", 1, "Gombo cru, pesé avant cuisson."],
  "graines-moutarde": ["11013", 2, "Moutarde préparée Ciqual; proxy documenté de la graine de moutarde, 2 g par cuillère à café."],
  halloumi: ["12060", 1, "Feta de vache Ciqual; proxy documenté du halloumi."],
  "haricots-coco-frais": ["20517", 1, "Fève fraîche crue; proxy prudent du haricot coco frais écossé."],
  "haricots-mungo-secs": ["20530", 1, "Haricot mungo sec Ciqual."],
  "haricots-verts": ["20061", 1, "Haricot vert cru, pesé avant cuisson."],
  labneh: ["19550", 1, "Yaourt grec de brebis Ciqual; proxy du labneh nature."],
  "lentilles-blondes-seches": ["20586", 1, "Lentille blonde sèche Ciqual."],
  "lentilles-brunes-seches": ["20359", 1, "Lentille sèche moyenne; proxy de la lentille brune sèche."],
  "mais-violet-cuit": ["20049", 1, "Maïs doux cuit; proxy documenté du maïs violet cuit."],
  mozzarella: ["19590", 1, "Mozzarella au lait de vache Ciqual."],
  "nopal-frais": ["20061", 1, "Haricot vert cru; proxy végétal prudent du nopal préparé faute d'entrée exacte."],
  "olive-verte": ["13033", 1, "Olive verte en saumure égouttée."],
  "oseille-fraiche": ["20111", 1, "Oseille crue Ciqual."],
  "pak-choi": ["20340", 250, "Pak-choï cru; 250 g par pièce moyenne."],
  paneer: ["19590", 1, "Mozzarella de vache Ciqual; proxy documenté du paneer."],
  "pois-bambara-secs": ["20516", 1, "Pois chiche sec; proxy du pois bambara sec."],
  "pois-chiches-germes": ["20507", 1, "Pois chiche cuit; proxy prudent du pois chiche germé."],
  "poivron-jaune": ["20168", 160, "Poivron jaune cru; 160 g de chair par pièce."],
  potiron: ["20044", 1, "Potiron cru, pesé avant cuisson."],
  "tomates-concassees-fumees": ["20137", 1, "Tomate pelée appertisée au jus; proxy des tomates concassées aromatisées au paprika fumé."],
  "tomates-sechees-sans-sulfites": ["20189", 1, "Tomate séchée Ciqual; produit sans sulfites à confirmer sur l'étiquette."],
  topinambour: ["20196", 1, "Topinambour cru, pesé avant cuisson."],
};
const cautionIds = new Set(["asperge-blanche", "basilic-citron", "courgette-jaune", "fromage-brebis", "graines-moutarde", "halloumi", "haricots-coco-frais", "labneh", "lentilles-brunes-seches", "mais-violet-cuit", "nopal-frais", "paneer", "pois-bambara-secs", "pois-chiches-germes", "tomates-concassees-fumees", "tomates-sechees-sans-sulfites"]);

for (const entry of seed.ingredients) {
  const selected = reviewed[entry.ingredient_id];
  if (selected) {
    const [code, factor, rationale] = selected;
    entry.selected_ciqual_code = code;
    entry.source_dataset = "ciqual";
    entry.selected_source_code = code;
    entry.grams_per_normalized_unit = factor;
    entry.grams_per_unit = Object.fromEntries(Object.keys(entry.grams_per_unit ?? {}).map((unit) => [unit, factor]));
    entry.review_status = cautionIds.has(entry.ingredient_id) ? "caution" : "validated";
    entry.rationale = rationale;
    entry.source_note = "Anses, Table Ciqual 2025; conversion ménagère éditoriale à confirmer au pesage.";
    if (entry.ingredient_id === "haricots-mungo-secs") {
      entry.review_status = "caution";
      entry.nutrient_overrides = { sugars_g: { value: 0, note: "Sucres absents de la fiche Ciqual du haricot mungo sec; valeur technique à 0 susceptible de sous-estimer légèrement le total." } };
    }
    if (entry.ingredient_id === "tomates-sechees-sans-sulfites") {
      entry.nutrient_overrides = { energy_kcal: { value: 258, note: "Énergie absente de la fiche Ciqual; valeur calculée et arrondie à partir des macronutriments Ciqual disponibles." } };
    }
  }
  entry.grams_per_unit ??= {};
  for (const occurrence of entry.batch_occurrences ?? []) {
    if (occurrence.unit === "g" || occurrence.unit === "ml") entry.grams_per_unit[occurrence.unit] = 1;
  }
}

const pending = seed.ingredients.filter((entry) => !["validated", "caution"].includes(entry.review_status));
if (pending.length) throw new Error(`Correspondances non relues : ${pending.map((entry) => entry.ingredient_id).join(", ")}`);
seed.meta = { schema_version: "1.0.0", lot: "r251-r275", status: "reviewed-with-cautions", ingredient_count: seed.ingredients.length, ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025", ciqual_version: "2025-11-03", ciqual_doi: "https://doi.org/10.57745/RDMHWY", review_note: "Chaque code, proxy et conversion a été relu; les approximations sont marquées caution." };
await writeFile("research/ciqual-map-r251-r275.json", `${JSON.stringify(seed, null, 2)}\n`);
console.log(`${seed.ingredients.length} correspondances r251-r275 relues.`);
