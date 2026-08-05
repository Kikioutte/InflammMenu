import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const lots = [
  "r051-r075", "r076-r100", "r101-r125", "r126-r150", "r151-r175",
  "r176-r200", "r201-r225", "r226-r250", "r251-r275", "r276-r300",
  "r301-r325", "r326-r350", "r351-r375", "r376-r400", "r401-r425",
  "r426-r450", "r451-r475", "r476-r500", "r501-r525",
];
const [draft, ...previousMaps] = await Promise.all([
  readFile(new URL("research/pilot-r526-r550.draft.json", root), "utf8").then(JSON.parse),
  ...lots.map((lot) => readFile(new URL(`research/ciqual-map-${lot}.json`, root), "utf8").then(JSON.parse)),
]);

// Une correspondance plus récente remplace l'ancienne uniquement pour le même identifiant canonique.
const prior = new Map();
for (let index = 0; index < previousMaps.length; index += 1) {
  for (const entry of previousMaps[index].ingredients) prior.set(entry.ingredient_id, { lot: lots[index], entry });
}

const ciqual = (code, grams, rationale, reviewStatus = "validated", extra = {}) => ({
  source_dataset: "ciqual",
  selected_source_code: code,
  selected_ciqual_code: code,
  grams_per_normalized_unit: grams,
  review_status: reviewStatus,
  rationale,
  source_note: "Anses Ciqual 2025; correspondance et conversion relues pour le lot r526-r550.",
  ...extra,
});

const additions = {
  "boisson-riz-non-sucree": ciqual("18904", 1, "Boisson au riz nature préemballée; l'absence de sucres ajoutés doit être confirmée sur l'étiquette.", "caution", { grams_per_unit: { ml: 1 } }),
  "compote-pomme-sans-sucre": ciqual("13187", 1, "Purée de pommes type compote sans sucres ajoutés.", "validated", { grams_per_unit: { g: 1 } }),
  "coriandre-moulue": ciqual("11026", 2, "Graine de coriandre utilisée pour la coriandre moulue; 2 g par cuillère à café.", "caution", { grams_per_unit: { c_cafe: 2 }, nutrient_overrides: { sugars_g: { value: 0, note: "Sucres non renseignés dans Ciqual; valeur technique à zéro à cette dose culinaire." } } }),
  "dattes-denoyautees": ciqual("13011", 1, "Datte sèche sans noyau.", "validated", { grams_per_unit: { g: 1 } }),
  "farine-riz-complet": ciqual("9520", 1, "Farine de riz générique utilisée comme approximation de la farine de riz complet.", "caution", { grams_per_unit: { g: 1 } }),
  "feuilles-curry-fraiches": ciqual("11094", 0.5, "Coriandre fraîche utilisée comme proxy d'une feuille aromatique fraîche; feuilles de curry absentes de Ciqual.", "caution", { grams_per_unit: { piece: 0.5 } }),
  "graines-ajowan": ciqual("11064", 2, "Carvi graine utilisé comme proxy documenté de l'ajowan; 2 g par cuillère à café.", "caution", { grams_per_unit: { c_cafe: 2 } }),
  "haricots-adzuki-cuits": ciqual("20503", 1, "Haricot rouge cuit à l'eau utilisé comme proxy de l'adzuki cuit.", "caution", { grams_per_unit: { g: 1 } }),
  "haricots-mungo-cuits": ciqual("20531", 1, "Haricot mungo bouilli/cuit à l'eau.", "validated", { grams_per_unit: { g: 1 } }),
  "haricots-mungo-decortiques": ciqual("20530", 1, "Haricot mungo sec entier utilisé comme approximation du mungo décortiqué sec.", "caution", { grams_per_unit: { g: 1 }, nutrient_overrides: { sugars_g: { value: 0, note: "Sucres non renseignés dans Ciqual; valeur technique à zéro susceptible de sous-estimer le total." } } }),
  "haricots-urad-decortiques": ciqual("20530", 1, "Haricot mungo sec utilisé comme proxy de l'urid/urad décortiqué sec, absent de Ciqual.", "caution", { grams_per_unit: { g: 1 }, nutrient_overrides: { sugars_g: { value: 0, note: "Sucres non renseignés dans Ciqual; valeur technique à zéro susceptible de sous-estimer le total." } } }),
  "lentilles-noires-seches": ciqual("20359", 1, "Lentille sèche moyenne utilisée comme approximation de la lentille noire sèche.", "caution", { grams_per_unit: { g: 1 } }),
  "makhana-graines-lotus-soufflees": ciqual("32006", 1, "Riz soufflé nature utilisé comme proxy des graines de lotus soufflées; l'étiquette réelle doit remplacer cette estimation.", "caution", { grams_per_unit: { g: 1 } }),
  "noix-coco-rapee": ciqual("15007", 1, "Chair de noix de coco sèche utilisée pour la noix de coco râpée non sucrée.", "validated", { grams_per_unit: { g: 1 } }),
  "quinoa-blanc": ciqual("9340", 1, "Quinoa cru, utilisé pour le quinoa blanc sec.", "caution", { grams_per_unit: { g: 1 }, nutrient_overrides: { sugars_g: { value: 0, note: "Sucres non renseignés dans Ciqual; valeur technique à zéro susceptible de sous-estimer le total." } } }),
  "riz-basmati-complet": ciqual("9102", 1, "Riz complet cru utilisé comme approximation du basmati complet sec.", "caution", { grams_per_unit: { g: 1 } }),
  "riz-complet-sec": ciqual("9102", 1, "Riz complet cru.", "validated", { grams_per_unit: { g: 1 } }),
  "riz-rond-sec": ciqual("9100", 1, "Riz blanc cru utilisé comme approximation du riz rond sec.", "caution", { grams_per_unit: { g: 1 } }),
  "tomate-concassee-sans-sel": ciqual("20260", 1, "Coulis de tomate appertisé utilisé comme proxy de tomate concassée; absence de sel ajouté à vérifier sur l'étiquette.", "caution", { grams_per_unit: { g: 1 } }),
};

const patches = {
  "graines-chia": {
    grams_per_normalized_unit: 12,
    grams_per_unit: { c_soupe: 12 },
    review_status: "caution",
    rationale: "Graines de chia USDA SR; 12 g estimés par cuillère à soupe, à confirmer au pesage.",
  },
  "radis-rose": { grams_per_unit: { g: 1 } },
};

const ids = [...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.id)))].sort();
let reusedCount = 0;
const ingredients = ids.map((id) => {
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
  return entry;
});

await writeFile(new URL("research/ciqual-map-r526-r550.json", root), `${JSON.stringify({
  meta: {
    schema_version: "1.0.0",
    lot: "r526-r550",
    status: "reviewed-with-cautions",
    ingredient_count: ingredients.length,
    reused_count: reusedCount,
    ciqual_source: "Anses, Table Ciqual 2025",
    fallback_source: "USDA FoodData Central SR Legacy 2018",
    review_note: "Chaque code, proxy et conversion a été relu; l'inspiration ayurvédique reste strictement culinaire.",
  },
  ingredients,
}, null, 2)}\n`);

console.log(`${ingredients.length} correspondances r526-r550 relues, ${reusedCount} réutilisées.`);
