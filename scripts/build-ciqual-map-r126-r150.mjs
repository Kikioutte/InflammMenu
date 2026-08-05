import { readFile, writeFile } from "node:fs/promises";

const seed = JSON.parse(await readFile("/tmp/ciqual-map-r126-r150.seed.json", "utf8"));

const reviewed = {
  ail: ["11000", 5, "Ail cru; 5 g de chair par gousse."],
  "asperges-vertes": ["20279", 1, "Asperge verte crue, pesée avant cuisson."],
  "betterave-crue": ["20091", 1, "Betterave rouge crue, pesée épluchée."],
  blettes: ["20301", 1, "Blette entière côte et feuille; valeur cuite utilisée avec réserve faute de profil cru entier."],
  brocoli: ["20057", 1, "Brocoli cru, pesé avant cuisson."],
  "carvi-graines": ["11064", 2, "Carvi graine; 2 g par cuillère à café."],
  "celeri-branche": ["20023", 40, "Céleri branche cru; 40 g par branche moyenne."],
  "celeri-rave": ["20055", 1, "Céleri-rave cru, pesé épluché."],
  "chataignes-cuites": ["15020", 1, "Châtaigne bouillie/cuite à l'eau, pesée cuite."],
  "chou-fleur": ["20016", 1, "Chou-fleur cru, pesé avant cuisson."],
  "chou-vert": ["20069", 1, "Chou vert cru, pesé avant cuisson."],
  concombre: ["20019", 300, "Concombre cru avec peau; 300 g par pièce selon la recette."],
  cresson: ["20022", 1, "Cresson de fontaine cru."],
  "estragon-frais": ["11092", 1, "Estragon frais, pesé en grammes."],
  "fonds-artichaut": ["20232", 1, "Fond d'artichaut surgelé cru, pesé avant cuisson."],
  framboise: ["13015", 1, "Framboise crue; le frais sert de référence aux usages frais ou surgelés."],
  "huile-noix": ["17220", 13.5, "Huile de noix; 13,5 g par cuillère à soupe."],
  "huile-olive-vierge-extra": ["17270", 13.5, "Huile d'olive vierge extra; 13,5 g par cuillère à soupe."],
  laitue: ["20031", 300, "Laitue crue; 300 g par tête selon la recette."],
  "lentilles-vertes-seches": ["20585", 1, "Lentille verte sèche, pesée avant cuisson."],
  "mais-grains": ["20233", 1, "Maïs doux surgelé cru, pesé avant cuisson; référence prudente pour le frais ou surgelé."],
  navet: ["20064", 1, "Navet pelé cru, pesé avant cuisson."],
  "oignon-jaune": ["20034", 120, "Oignon cru; 120 g par pièce moyenne."],
  panais: ["20181", 1, "Panais cru, pesé avant cuisson."],
  "persil-plat": ["11014", 1, "Persil frais, pesé en grammes."],
  "petits-pois": ["20084", 1, "Petits pois surgelés crus, pesés avant cuisson; référence prudente pour le frais ou surgelé."],
  "pois-chiches-cuits": ["20507", 1, "Pois chiche bouilli, pesé cuit et égoutté."],
  "poivron-rouge": ["20087", 160, "Poivron rouge cru; 160 g de chair par pièce moyenne."],
  "pomme-terre": ["4008", 1, "Pomme de terre crue sans peau, pesée avant cuisson."],
  potimarron: ["20132", 1, "Chair de potimarron crue sans peau, pesée avant cuisson."],
  "puree-arachide": ["15202", 1, "Pâte d'arachide 100 %, pesée en grammes."],
  "sauge-fraiche": ["11069", 0.5, "Sauge fraîche; 0,5 g par feuille, estimation ménagère."],
  "sumac-moulu": ["11056", 2, "Quatre-épices Ciqual utilisé comme approximation documentée pour 2 g de sumac par cuillère à café."],
  "tomates-concassees-sans-sel": ["20137", 1, "Tomate pelée appertisée au jus non égouttée; approximation des tomates concassées sans sel."],
  "vinaigre-cidre": ["11090", 15, "Vinaigre de cidre; 15 g par cuillère à soupe."],
  "vinaigre-xeres": ["11018", 15, "Vinaigre générique; approximation du vinaigre de Xérès, 15 g par cuillère à soupe."],
};

for (const entry of seed.ingredients) {
  const selected = reviewed[entry.ingredient_id];
  if (!selected) continue;
  const [code, factor, rationale] = selected;
  entry.selected_ciqual_code = code;
  entry.source_dataset = "ciqual";
  entry.selected_source_code = code;
  entry.grams_per_normalized_unit = factor;
  entry.grams_per_unit = Object.fromEntries(Object.keys(entry.grams_per_unit ?? {}).map((unit) => [unit, factor]));
  entry.review_status = ["blettes", "estragon-frais", "sumac-moulu", "tomates-concassees-sans-sel", "vinaigre-cidre", "vinaigre-xeres"].includes(entry.ingredient_id) ? "caution" : "validated";
  entry.rationale = rationale;
  entry.source_note = "Anses, Table Ciqual 2025; conversion ménagère éditoriale à confirmer au pesage.";
  if (entry.ingredient_id === "sumac-moulu") {
    entry.nutrient_overrides = { sugars_g: { value: 0, note: "Sucres du proxy quatre-épices absents de Ciqual; valeur technique à 0, incidence très faible à la dose utilisée." } };
  }
  if (entry.ingredient_id === "vinaigre-cidre") {
    entry.nutrient_overrides = { energy_kcal: { value: 22.5, note: "Énergie absente de la fiche Ciqual du vinaigre de cidre; valeur du vinaigre générique Ciqual utilisée." } };
  }
  if (entry.ingredient_id === "estragon-frais") {
    entry.nutrient_overrides = {
      energy_kcal: { value: 36, note: "Énergie calculée prudemment à partir des macronutriments Ciqual disponibles." },
      fat_g: { value: 0.5, note: "Lipides absents de la fiche Ciqual; estimation éditoriale prudente pour une herbe fraîche." },
      sodium_mg: { value: 4, note: "Sodium absent de la fiche Ciqual; valeur technique prudente pour une herbe fraîche non salée." },
    };
  }
}

// A reused household factor (for example one courgette = 250 g) must never be
// applied to a later quantity already expressed in grams or millilitres.
for (const entry of seed.ingredients) {
  entry.grams_per_unit ??= {};
  for (const occurrence of entry.batch_occurrences ?? []) {
    if (occurrence.unit === "g" || occurrence.unit === "ml") entry.grams_per_unit[occurrence.unit] = 1;
  }
}

const pending = seed.ingredients.filter((entry) => !["validated", "caution"].includes(entry.review_status));
if (pending.length) throw new Error(`Correspondances non relues : ${pending.map((entry) => entry.ingredient_id).join(", ")}`);

seed.meta = {
  schema_version: "1.0.0",
  lot: "r126-r150",
  status: "reviewed-with-cautions",
  ingredient_count: seed.ingredients.length,
  ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025",
  ciqual_version: "2025-11-03",
  ciqual_doi: "https://doi.org/10.57745/RDMHWY",
  review_note: "Chaque code et conversion a été relu; les approximations sont explicitement marquées caution.",
};

await writeFile("research/ciqual-map-r126-r150.json", `${JSON.stringify(seed, null, 2)}\n`);
console.log(`${seed.ingredients.length} correspondances r126-r150 relues.`);
