import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const lots = [
  "r051-r075", "r076-r100", "r101-r125", "r126-r150", "r151-r175",
  "r176-r200", "r201-r225", "r226-r250", "r251-r275", "r276-r300",
  "r301-r325", "r326-r350", "r351-r375", "r376-r400",
];
const [draft, ...previousMaps] = await Promise.all([
  readFile(new URL("research/pilot-r401-r425.draft.json", root), "utf8").then(JSON.parse),
  ...lots.map((lot) => readFile(new URL(`research/ciqual-map-${lot}.json`, root), "utf8").then(JSON.parse)),
]);

const prior = new Map();
for (let index = 0; index < previousMaps.length; index += 1) {
  for (const entry of previousMaps[index].ingredients) {
    if (!prior.has(entry.ingredient_id)) prior.set(entry.ingredient_id, { lot: lots[index], entry });
  }
}

const ciqual = (code, grams, rationale, reviewStatus = "validated", extra = {}) => ({
  selected_ciqual_code: code,
  grams_per_normalized_unit: grams,
  review_status: reviewStatus,
  rationale,
  source_note: "Anses Ciqual 2025; correspondance et conversion contrôlées pour le lot r401-r425.",
  ...extra,
});

const additions = {
  "brocoli-chinois": ciqual("20057", 1, "Brocoli cru utilisé comme approximation du brocoli chinois gai lan.", "caution", { grams_per_unit: { g: 1 } }),
  "caille-entiere": ciqual("36100", 1, "Caille, viande et peau crues; rendement comestible estimé à 65 % du poids entier.", "caution", {
    occurrence_overrides: {
      r412: { grams_total: 520, source_note: "800 g de cailles entières × rendement comestible estimé à 65 %." },
      r419: { grams_total: 520, source_note: "800 g de cailles entières × rendement comestible estimé à 65 %." },
    },
  }),
  "champignons-sauvages-cultives": ciqual("20010", 1, "Champignon cru, aliment moyen; uniquement pour un mélange cultivé et commercialisé.", "caution", { grams_per_unit: { g: 1 } }),
  "citron-noir-seche": ciqual("18066", 1, "Équivalent aqueux minimal pour le citron noir entier infusé puis retiré; transfert nutritionnel non quantifié.", "caution", {
    occurrence_overrides: { r418: { grams_total: 1, source_note: "Proxy technique de 1 g pour un aromate entier retiré avant service." } },
  }),
  "coques-fraiches": ciqual("10034", 1, "Coque cuite; rendement comestible estimé à 20 % du poids acheté avec coquilles.", "caution", {
    occurrence_overrides: { r402: { grams_total: 240, source_note: "1 200 g de coques en coquille × rendement comestible estimé à 20 %." } },
  }),
  "curcuma-moulu": ciqual("11089", 1.5, "Curcuma en poudre; 1,5 g par cuillère à café rase.", "validated", { grams_per_unit: { c_cafe: 1.5 } }),
  "dinde-escalope": ciqual("36304", 1, "Escalope de dinde crue, poids comestible.", "validated", { grams_per_unit: { g: 1 } }),
  "epeautre-sec": ciqual("9001", 1, "Épeautre cru.", "validated", { grams_per_unit: { g: 1 } }),
  "genievre-baies": ciqual("18066", 1, "Équivalent aqueux minimal pour quatre baies aromatiques retirées après braisage; transfert non quantifié.", "caution", {
    occurrence_overrides: { r423: { grams_total: 1, source_note: "Proxy technique de 1 g pour quatre baies retirées avant service." } },
  }),
  laurier: ciqual("11053", 0.2, "Feuille de laurier; 0,2 g par feuille, retirée avant service.", "caution", {
    grams_per_unit: { piece: 0.2 },
    occurrence_overrides: { r401: { grams_total: 0.4, source_note: "Deux feuilles estimées à 0,4 g au total, retirées après braisage." } },
  }),
  "pintade-morceaux": ciqual("36700", 1, "Viande de pintade crue; rendement comestible estimé à 70 % pour des morceaux avec os.", "caution", {
    occurrence_overrides: {
      r409: { grams_total: 560, source_note: "800 g de morceaux × rendement comestible estimé à 70 %." },
      r423: { grams_total: 560, source_note: "800 g de morceaux × rendement comestible estimé à 70 %." },
    },
  }),
  "pintade-supreme": ciqual("36702", 1, "Poitrine de pintade crue; rendement comestible estimé à 85 % pour des suprêmes avec os éventuel.", "caution", {
    occurrence_overrides: { r416: { grams_total: 595, source_note: "700 g de suprêmes × rendement comestible estimé à 85 %." } },
  }),
  "poulet-blanc": ciqual("36017", 1, "Filet de poulet sans peau cru, poids comestible.", "validated", { grams_per_unit: { g: 1 } }),
  "poulet-hache": ciqual("36003", 1, "Viande de poulet crue utilisée pour du poulet haché; teneur en matières grasses variable.", "caution", { grams_per_unit: { g: 1 } }),
  "poulet-haut-cuisse-sans-peau": ciqual("36019", 1, "Viande de haut de cuisse crue; rendement comestible estimé à 75 % pour des morceaux avec os et sans peau.", "caution", {
    occurrence_overrides: {
      r406: { grams_total: 525, source_note: "700 g de hauts de cuisse × rendement comestible estimé à 75 %." },
      r418: { grams_total: 525, source_note: "700 g de hauts de cuisse × rendement comestible estimé à 75 %." },
      r420: { grams_total: 525, source_note: "700 g de hauts de cuisse × rendement comestible estimé à 75 %." },
    },
  }),
  "poulpe-nettoye": ciqual("10018", 1, "Poulpe cru nettoyé, poids comestible.", "validated", { grams_per_unit: { g: 1 } }),
  "saint-jacques-noix": ciqual("10045", 1, "Noix de Saint-Jacques crue, sans corail.", "validated", { grams_per_unit: { g: 1 } }),
  "the-fume": ciqual("18154", 1, "Thé noir infusé sans sucre utilisé comme approximation de l'infusion fumée filtrée.", "caution", {
    occurrence_overrides: { r410: { grams_total: 800, source_note: "Les 8 g de thé sec servent à préparer 800 ml d'infusion, ensuite filtrée." } },
  }),
};

const patches = {
  "chou-vert": {
    occurrence_overrides: { r425: { grams_total: 400, source_note: "Huit grandes feuilles estimées à 50 g chacune." } },
  },
  orange: {
    occurrence_overrides: {
      r401: { grams_total: 190, source_note: "Deux oranges utilisées en jus et zeste, équivalent comestible estimé à 190 g." },
      r414: { grams_total: 190, source_note: "Deux oranges utilisées en chair et jus, équivalent comestible estimé à 190 g." },
    },
  },
  "pak-choi": { grams_per_unit: { g: 1, piece: 250 } },
  quinoa: {
    grams_per_unit: { g: 3 },
    rationale: "Quinoa sec converti en quinoa cuit sans sel avec un facteur de rendement de 3.",
  },
  "quinoa-rouge": {
    selected_ciqual_code: "9341",
    grams_per_normalized_unit: 3,
    grams_per_unit: { g: 3 },
    review_status: "caution",
    rationale: "Quinoa rouge sec converti en quinoa générique cuit avec un facteur de rendement de 3.",
  },
  "riz-noir-sec": {
    review_status: "caution",
    rationale: "Riz complet cru utilisé comme approximation du riz noir sec; variété non disponible dans Ciqual.",
  },
};

const ingredientIds = [...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.id)))].sort();
let reusedCount = 0;
const ingredients = ingredientIds.map((id) => {
  let entry;
  if (prior.has(id)) {
    const source = prior.get(id);
    entry = structuredClone(source.entry);
    entry.batch_reuse_source = source.lot;
    reusedCount += 1;
  } else {
    if (!additions[id]) throw new Error(`Mapping absent pour ${id}`);
    entry = { ingredient_id: id, ...additions[id] };
  }
  if (patches[id]) entry = { ...entry, ...patches[id] };
  const units = new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.filter((ingredient) => ingredient.id === id).map((ingredient) => ingredient.unite_normalisee)));
  entry.grams_per_unit = {
    ...(entry.grams_per_unit ?? {}),
    ...(units.has("g") && !entry.grams_per_unit?.g ? { g: 1 } : {}),
    ...(units.has("ml") && !entry.grams_per_unit?.ml ? { ml: 1 } : {}),
  };
  return entry;
});

await writeFile(new URL("research/ciqual-map-r401-r425.json", root), `${JSON.stringify({
  meta: {
    schema_version: "1.0.0",
    lot: "r401-r425",
    status: "reviewed-with-cautions",
    ingredient_count: ingredients.length,
    reused_count: reusedCount,
    ciqual_source: "Anses Ciqual 2025",
    ciqual_version: "2025-11-03",
    ciqual_doi: "https://doi.org/10.57745/RDMHWY",
  },
  ingredients,
}, null, 2)}\n`);

console.log(`${ingredients.length} mappings, ${reusedCount} réutilisés.`);
