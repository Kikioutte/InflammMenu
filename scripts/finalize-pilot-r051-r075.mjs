import { readFile, writeFile } from "node:fs/promises";

const draftUrl = new URL("../research/pilot-r051-r075.draft.json", import.meta.url);

const activeMinutes = {
  r051: 12,
  r052: 18,
  r053: 10,
  r054: 15,
  r055: 33,
  r056: 20,
  r057: 12,
  r058: 24,
  r059: 10,
  r060: 20,
  r061: 27,
  r062: 25,
  r063: 12,
  r064: 12,
  r065: 25,
  r066: 31,
  r067: 25,
  r068: 12,
  r069: 28,
  r070: 10,
  r071: 18,
  r072: 10,
  r073: 38,
  r074: 28,
  r075: 12,
};

const canonicalIngredientIds = {
  "flocons d'avoine complets": "flocons-avoine-complets",
  poires: "poire",
  "boisson d'avoine non sucrée": "boisson-avoine-non-sucree",
  noisettes: "noisette",
  "romarin frais haché": "romarin-frais",
  "huile d'olive": "huile-olive",
  quinoa: "quinoa",
  "boisson de soja non sucrée": "boisson-soja-non-sucree",
  "abricots frais": "abricot",
  tahini: "tahini",
  "cardamome moulue": "cardamome-moulue",
  "millet décortiqué": "millet-decortique",
  eau: "eau",
  "yaourt de soja nature": "yaourt-soja-nature",
  kiwis: "kiwi",
  "graines de courge": "graines-courge",
  "citron vert": "citron-vert",
  "pain de seigle complet": "pain-seigle-complet",
  "haricots blancs cuits": "haricots-blancs-cuits",
  "radis roses": "radis-rose",
  "aneth frais": "aneth-frais",
  citron: "citron",
  "farine de pois chiches": "farine-pois-chiches",
  poireau: "poireau",
  cerfeuil: "cerfeuil",
  "amarante en grains": "amarante-grains",
  "boisson d'amande non sucrée": "boisson-amande-non-sucree",
  cerises: "cerise",
  "amandes effilées": "amandes-effilees",
  "extrait de vanille": "extrait-vanille",
  "sarrasin décortiqué cru": "sarrasin-decortique-cru",
  prunes: "prune",
  "graines de sésame": "graines-sesame",
  courgette: "courgette",
  "œufs": "oeuf",
  basilic: "basilic-frais",
  "graines de chia": "graines-chia",
  mangue: "mangue",
  "graines de chanvre décortiquées": "graines-chanvre-decortiquees",
  "orge mondé": "orge-monde",
  noix: "noix",
  "muscade moulue": "muscade-moulue",
  "farine de teff": "farine-teff",
  "lait demi-écrémé": "lait-demi-ecreme",
  "yaourt nature": "yaourt-nature",
  mûres: "mure",
  "tofu ferme nature": "tofu-ferme-nature",
  "bulbe de fenouil": "fenouil-bulbe",
  tomates: "tomate",
  "olives noires": "olives-noires",
  "origan séché": "origan-seche",
  ricotta: "ricotta",
  poire: "poire",
  "thym frais": "thym-frais",
  carotte: "carotte",
  orange: "orange",
  "gingembre frais": "gingembre-frais",
  "graines de tournesol": "graines-tournesol",
  pommes: "pomme",
  cannelle: "cannelle-moulue",
  "épinards frais": "epinards-frais",
  "cumin moulu": "cumin-moulu",
  "riz rond complet": "riz-rond-complet",
  "filaments de safran": "safran-filaments",
  "pistaches non salées": "pistaches-non-salees",
  "flocons d'avoine": "flocons-avoine",
  abricots: "abricot",
  "farine de sarrasin": "farine-sarrasin",
  pomme: "pomme",
  "patates douces": "patate-douce",
  "graines de grenade": "graines-grenade",
  oranges: "orange",
  "pamplemousse rose": "pamplemousse-rose",
  "menthe fraîche": "menthe-fraiche",
  "cacao non sucré": "cacao-non-sucre",
  "farine de maïs précuite pour arepas": "farine-mais-precuite-arepas",
  "eau tiède": "eau",
  "haricots noirs cuits": "haricots-noirs-cuits",
  avocat: "avocat",
  tomate: "tomate",
  coriandre: "coriandre-fraiche",
  "champignons de Paris": "champignons-paris",
  "chou kale": "chou-kale",
  nectarines: "nectarine",
  "graines de lin moulues": "graines-lin-moulues",
  amandes: "amande",
  "basilic frais": "basilic-frais",
};

const normalizedUnitByDisplayUnit = {
  g: "g",
  ml: "ml",
  piece: "piece",
  tranche: "piece",
  bouquet: "piece",
  "c. à s.": "c_soupe",
  "c. à c.": "c_cafe",
  feuille: "piece",
};

function normalizeIngredient(recipeId, ingredient) {
  const id = canonicalIngredientIds[ingredient.nom];
  if (!id) throw new Error(`${recipeId}: identifiant canonique absent pour ${ingredient.nom}`);

  let quantiteNormalisee = ingredient.quantite;
  let uniteNormalisee = normalizedUnitByDisplayUnit[ingredient.unite];

  if (ingredient.nom === "pain de seigle complet") {
    quantiteNormalisee = 160;
    uniteNormalisee = "g";
  } else if (ingredient.nom === "filaments de safran") {
    quantiteNormalisee = 0.1;
    uniteNormalisee = "g";
  }

  if (!uniteNormalisee) throw new Error(`${recipeId}: unité non normalisée ${ingredient.unite}`);

  return {
    id,
    ...ingredient,
    allergenes: ingredient.allergenes.map((allergen) => allergen === "oeufs" ? "oeuf" : allergen),
    quantite_normalisee: quantiteNormalisee,
    unite_normalisee: uniteNormalisee,
    facultatif: false,
  };
}

const catalogue = JSON.parse(await readFile(draftUrl, "utf8"));
catalogue.meta.schema_version = "2.1.0";
delete catalogue.meta.base_schema;

for (const recipe of catalogue.recipes) {
  recipe.ingredients = recipe.ingredients.map((ingredient) => normalizeIngredient(recipe.id, ingredient));
  recipe.app.review.status = "caution";
  recipe.app.review.stage = "draft";
  recipe.app.planner.eligible = false;
  recipe.app.planner.active_minutes = activeMinutes[recipe.id];
  recipe.app.planner.allergens = [
    ...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes)),
  ];
  recipe.provenance = {
    type: "original",
    author: "InflammMenu",
    license: "CC BY-SA 4.0",
    created_at: "2026-08-05",
    sources: [{
      kind: "inspiration",
      title: "Conception éditoriale originale InflammMenu — lot r051-r075",
      version: "brouillon 1",
      accessed_at: "2026-08-05",
    }],
  };
}

await writeFile(draftUrl, `${JSON.stringify(catalogue, null, 2)}\n`);
