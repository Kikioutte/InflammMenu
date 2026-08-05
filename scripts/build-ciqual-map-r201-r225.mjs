import { readFile, writeFile } from "node:fs/promises";

const seed = JSON.parse(await readFile("/tmp/ciqual-map-r201-r225.seed.json", "utf8"));

const reviewed = {
  "abricot-frais": ["13000", 45, "Abricot cru dénoyauté; 45 g par fruit."],
  "amande-fraiche": ["15041", 1, "Amande émondée non salée; approximation de l'amande fraîche décortiquée."],
  "amarante-grain": ["9345", 1, "Amarante crue, pesée sèche."],
  "asperge-verte": ["20279", 1, "Asperge verte crue, pesée avant cuisson."],
  "basilic-thai": ["11033", 1, "Basilic frais; proxy prudent du basilic thaï."],
  "betterave-jaune": ["20091", 1, "Betterave rouge crue; proxy de la variété jaune."],
  cacahuete: ["15001", 1, "Cacahuète sans sel ajouté."],
  "canneberges-sechees-sans-sulfites": ["13178", 1, "Canneberge séchée sucrée Ciqual; proxy prudent d'un produit sans sulfites et idéalement sans sucre ajouté."],
  "carotte-multicolore": ["20009", 1, "Carotte crue; proxy des variétés multicolores."],
  "cerfeuil-frais": ["11002", 1, "Cerfeuil frais."],
  "chapelure-complete": ["7500", 1, "Chapelure Ciqual; proxy de la version complète."],
  "chou-pointu": ["20069", 1, "Chou vert cru; proxy du chou pointu."],
  "chou-rave": ["20065", 350, "Chou-rave cru; 350 g de chair par pièce moyenne."],
  "choux-bruxelles": ["20058", 1, "Chou de Bruxelles cru."],
  "ciboulette-fraiche": ["11003", 1, "Ciboule ou ciboulette fraîche."],
  "cornichons-moutarde-sulfites": ["11004", 1, "Cornichon au vinaigre; les allergènes moutarde et sulfites restent portés par la formulation commerciale choisie."],
  "courge-musquee": ["20128", 1, "Chair de courge musquée crue sans peau."],
  endive: ["20026", 100, "Endive crue; 100 g par pièce moyenne."],
  "epeautre-grain": ["9001", 1, "Épeautre cru, pesé sec."],
  "feves-decortiquees": ["20541", 1, "Fève pelée fraîche surgelée crue; pesée avant cuisson."],
  "fromage-bleu-doux": ["12521", 1, "Bleu d'Auvergne; proxy d'un fromage bleu doux."],
  "graines-lupin-cuites": ["20534", 0.38, "Lupin sec Ciqual corrigé par un facteur d'hydratation de 0,38 pour approcher des graines cuites égouttées."],
  "haricots-azuki-cuits": ["20503", 1, "Haricot rouge cuit; proxy de l'azuki cuit."],
  "haricots-borlotti-cuits": ["20503", 1, "Haricot rouge cuit; proxy du borlotti cuit."],
  "haricots-geants-cuits": ["20507", 1, "Pois chiche cuit; proxy prudent d'un haricot géant cuit faute de profil exact."],
  "huile-colza": ["17130", 13.5, "Huile de colza; 13,5 g par cuillère à soupe."],
  "laitue-romaine": ["20171", 300, "Laitue romaine crue; 300 g par tête."],
  "lentilles-beluga-seches": ["20585", 1, "Lentille verte sèche; proxy de la lentille beluga sèche."],
  mache: ["20099", 1, "Mâche crue."],
  "mangue-verte": ["13025", 250, "Mangue crue standard; proxy de la mangue verte, 250 g de chair par fruit."],
  "melon-charentais": ["13026", 700, "Melon charentais cru; 700 g de chair par fruit entier, donc 350 g pour le demi-melon formulé."],
  "miso-blanc-soja-riz": ["20916", 15, "Miso Ciqual; 15 g par cuillère à soupe."],
  "moutarde-dijon": ["11013", 15, "Moutarde Ciqual; 15 g par cuillère à soupe."],
  "navet-nouveau": ["20064", 50, "Navet pelé cru; 50 g par petit navet nouveau."],
  "noix-cajou": ["15054", 1, "Noix de cajou grillée sans sel ajouté."],
  "olive-noire": ["13032", 1, "Olive noire en saumure égouttée."],
  "orange-sanguine": ["13034", 150, "Orange crue; proxy de l'orange sanguine, 150 g de chair par fruit."],
  "petit-epeautre-concasse": ["9001", 1, "Épeautre cru; proxy du petit épeautre concassé, pesé sec."],
  "pois-casses-secs": ["20515", 1, "Pois cassé sec."],
  "pois-jaunes-secs": ["20515", 1, "Pois cassé sec; proxy du pois jaune sec."],
  "pomme-verte": ["13039", 150, "Pomme crue avec peau; 150 g par fruit."],
  "pruneau-seche": ["13042", 1, "Pruneau sec sans noyau."],
  "puree-amande-blanche": ["15041", 1, "Amande émondée; approximation de la purée d'amande blanche 100 %."],
  "radis-noir": ["20089", 250, "Radis noir cru; 250 g par pièce moyenne."],
  "raisin-muscat": ["13621", 1, "Raisin noir Muscat cru."],
  "ricotta-salee": ["19585", 1, "Ricotta Ciqual; proxy d'une ricotta salée, sodium possiblement sous-estimé."],
  "riz-noir": ["9102", 1, "Riz complet cru; proxy du riz noir cru."],
  "riz-souffle-nature": ["32006", 1, "Riz soufflé nature Ciqual."],
  roquette: ["20217", 1, "Roquette crue."],
  "sesame-noir": ["15010", 1, "Sésame graine; proxy du sésame noir."],
  "shiso-frais": ["11033", 0.5, "Basilic frais; proxy documenté du shiso frais, 0,5 g par feuille."],
  "sorgho-grain": ["9360", 1, "Sorgho complet cru, pesé sec."],
  "tofu-soyeux": ["20906", 1, "Tofu soyeux préemballé."],
  "tomate-ancienne": ["20385", 1, "Tomate crue moyenne; proxy des variétés anciennes."],
  "tomate-verte": ["20119", 1, "Tomate verte crue, variété mûre précisée dans la recette."],
  "verveine-citronnee": ["11069", 0.5, "Sauge fraîche; proxy documenté de la verveine citronnée, 0,5 g par feuille."],
  "vinaigre-balsamique-avec-sulfites": ["11091", 15, "Vinaigre balsamique; 15 g par cuillère à soupe, sulfites selon étiquette."],
  "vinaigre-riz": ["11018", 15, "Vinaigre générique; proxy du vinaigre de riz, 15 g par cuillère à soupe."],
};

const cautionIds = new Set([
  "amande-fraiche", "basilic-thai", "betterave-jaune", "canneberges-sechees-sans-sulfites", "carotte-multicolore",
  "chapelure-complete", "chou-pointu", "cornichons-moutarde-sulfites", "fromage-bleu-doux", "graines-lupin-cuites",
  "haricots-azuki-cuits", "haricots-borlotti-cuits", "haricots-geants-cuits", "lentilles-beluga-seches", "mangue-verte",
  "petit-epeautre-concasse", "pois-jaunes-secs", "puree-amande-blanche", "ricotta-salee", "riz-noir", "sesame-noir",
  "shiso-frais", "tomate-ancienne", "verveine-citronnee", "vinaigre-riz",
]);

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
    if (entry.ingredient_id === "graines-lupin-cuites") {
      entry.nutrient_overrides = { sugars_g: { value: 0, note: "Sucres absents de la fiche Ciqual du lupin sec; valeur technique à 0, avec facteur d'hydratation explicite." } };
    }
    if (entry.ingredient_id === "courge-musquee") {
      entry.review_status = "caution";
      entry.nutrient_overrides = {
        sugars_g: { value: 1.6, note: "Valeur absente de la courge musquée Ciqual; valeur de la courge crue générique Ciqual utilisée." },
        saturated_fat_g: { value: 0.027, note: "Valeur absente de la courge musquée Ciqual; valeur de la courge crue générique Ciqual utilisée." },
        sodium_mg: { value: 4, note: "Valeur absente de la courge musquée Ciqual; valeur de la courge crue générique Ciqual utilisée." },
      };
    }
    if (entry.ingredient_id === "ricotta-salee") {
      entry.source_dataset = "usda-sr";
      entry.selected_source_code = "170851";
      entry.selected_ciqual_code = null;
      entry.review_status = "caution";
      entry.rationale = "Ricotta USDA SR utilisée car l'énergie manque dans Ciqual; une ricotta salée peut contenir davantage de sodium.";
      entry.source_note = "USDA FoodData Central, SR Legacy 2018; sodium de la version salée potentiellement sous-estimé.";
    }
  }
  entry.grams_per_unit ??= {};
  for (const occurrence of entry.batch_occurrences ?? []) {
    if (occurrence.unit === "g" || occurrence.unit === "ml") entry.grams_per_unit[occurrence.unit] = 1;
  }
}

const pending = seed.ingredients.filter((entry) => !["validated", "caution"].includes(entry.review_status));
if (pending.length) throw new Error(`Correspondances non relues : ${pending.map((entry) => entry.ingredient_id).join(", ")}`);
seed.meta = {
  schema_version: "1.0.0",
  lot: "r201-r225",
  status: "reviewed-with-cautions",
  ingredient_count: seed.ingredients.length,
  ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025",
  ciqual_version: "2025-11-03",
  ciqual_doi: "https://doi.org/10.57745/RDMHWY",
  review_note: "Chaque code, proxy et conversion a été relu; les approximations restent explicitement marquées caution.",
};
await writeFile("research/ciqual-map-r201-r225.json", `${JSON.stringify(seed, null, 2)}\n`);
console.log(`${seed.ingredients.length} correspondances r201-r225 relues.`);
