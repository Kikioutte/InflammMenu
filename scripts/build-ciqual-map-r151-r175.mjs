import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const mapFiles = ["r051-r075", "r076-r100", "r101-r125", "r126-r150"];
const [draft, ...priorMaps] = await Promise.all([
  readFile(new URL("research/pilot-r151-r175.draft.json", root), "utf8").then(JSON.parse),
  ...mapFiles.map((lot) => readFile(new URL(`research/ciqual-map-${lot}.json`, root), "utf8").then(JSON.parse)),
]);

const knownById = new Map();
for (const [index, map] of priorMaps.entries()) {
  for (const entry of map.ingredients) {
    const entries = knownById.get(entry.ingredient_id) ?? [];
    entries.push({ lot: mapFiles[index], entry });
    knownById.set(entry.ingredient_id, entries);
  }
}
const preferredLot = { "oignon-jaune": "r076-r100", "sarrasin-decortique": "r101-r125" };

const ciqual = (code, grams, rationale, status = "validated", extras = {}) => ({
  selected_ciqual_code: code,
  grams_per_normalized_unit: grams,
  review_status: status,
  rationale,
  source_note: "Anses, Table Ciqual 2025, version 2025-11-03; correspondance et conversion contrôlées manuellement pour ce lot.",
  ...extras,
});

const manual = {
  "asperge-verte": ciqual("20299", 1, "Asperge verte cuite à l'eau, proche de l'état consommé dans la soupe; pesée crue en grammes, limite mineure documentée."),
  aubergine: ciqual("20053", 300, "Aubergine crue; 300 g de partie comestible par pièce moyenne avant rôtissage."),
  "chou-blanc": ciqual("20116", 1, "Chou blanc cru pesé en grammes avant cuisson."),
  "chou-rouge": ciqual("20014", 1, "Chou rouge cru pesé en grammes avant cuisson."),
  "citron-confit-sel": ciqual("13009", 45, "Citron cru utilisé comme approximation de la chair et de l'écorce; le sodium du citron confit au sel n'est pas représenté.", "caution", { occurrence_overrides:{r154:{grams_total:22.5,source_note:"Demi-citron estimé à 22,5 g; sodium probablement sous-estimé faute d'entrée officielle exacte."}} }),
  "edamame-decortique": ciqual("20901", 1, "Soja entier sec utilisé comme approximation; 180 g équivalent sec retenus pour 500 g d'edamame décortiqué cuit.", "caution", { occurrence_overrides:{r175:{grams_total:180,source_note:"Conversion prudente vers un équivalent sec; produit edamame exact absent de Ciqual."}} }),
  endive: ciqual("20026", 100, "Endive crue; 100 g de partie comestible par pièce moyenne."),
  "farine-avoine-complete": ciqual("32140", 1, "Flocons d'avoine utilisés comme équivalent du même grain complet moulu en farine."),
  "graines-carvi": ciqual("11064", 2.1, "Graines de carvi; 2,1 g par cuillère à café rase."),
  "haricots-rouges-cuits": ciqual("20503", 1, "Haricots rouges bouillis, pesés cuits et égouttés."),
  "melon-charentais": ciqual("13026", 700, "Melon cantaloup ou Charentais cru; la recette fixe environ 700 g de chair par pièce.", "validated", { occurrence_overrides:{r159:{grams_total:700,source_note:"Masse de chair explicitement donnée dans l'étape de préparation."}} }),
  "miso-soja-riz": ciqual("20916", 18, "Miso générique utilisé pour le miso soja-riz; 18 g par cuillère à soupe.", "caution", { grams_per_unit:{c_soupe:18} }),
  "paprika-fume": ciqual("11049", 2.3, "Paprika en poudre utilisé pour le paprika fumé; 2,3 g par cuillère à café."),
  "puree-amande-blanche": ciqual("15041", 1, "Amande émondée non salée utilisée comme équivalent d'une purée 100 % amande sans ajout; étiquette à vérifier."),
  "raifort-racine-frais": ciqual("11016", 1, "Raifort frais, pesé en grammes.", "caution", { nutrient_overrides:{sugars_g:{value:0,note:"Sucres totaux non renseignés dans Ciqual 2025; valeur technique à 0 susceptible de sous-estimer légèrement les sucres."}} }),
  "tofu-soyeux": ciqual("20906", 1, "Tofu soyeux préemballé, pesé en grammes."),
  "tomate-cerise": ciqual("20172", 1, "Tomate cerise crue, pesée en grammes avant rôtissage."),
  "vinaigre-cidre-avec-sulfites": ciqual("11090", 15, "Vinaigre de cidre; 15 g par cuillère à soupe. Les sulfites dépendent de l'étiquette.", "caution", { grams_per_unit:{c_soupe:15}, nutrient_overrides:{energy_kcal:{value:0,note:"Énergie non renseignée dans Ciqual 2025; valeur technique à 0 pour 15 g, susceptible de sous-estimer de quelques kcal."}} }),
};

const ids = [...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id)))].sort();
let reusedCount = 0;
const ingredients = ids.map((id) => {
  const candidates = knownById.get(id) ?? [];
  let entry;
  if (candidates.length) {
    const selected = candidates.find(({ lot }) => lot === preferredLot[id]) ?? candidates[0];
    entry = structuredClone(selected.entry);
    entry.batch_reuse_source = selected.lot;
    entry.batch_reuse_note = candidates.length > 1
      ? "Identifiant canonique identique contrôlé dans plusieurs lots; la correspondance la plus exacte pour la forme a été retenue."
      : "Correspondance réutilisée uniquement à identifiant canonique strictement identique.";
    const units = new Set(draft.recipes.flatMap((recipe) => recipe.ingredients
      .filter((item) => item.id === id).map((item) => item.unite_normalisee)));
    entry.grams_per_unit = {
      ...(entry.grams_per_unit ?? {}),
      ...(units.has("g") ? { g: 1 } : {}),
      ...(units.has("ml") ? { ml: 1 } : {}),
    };
    reusedCount += 1;
  } else {
    if (!manual[id]) throw new Error(`${id}: correspondance manuelle absente`);
    entry = { ingredient_id: id, ...manual[id] };
  }
  return entry;
});

const output = {
  meta: {
    schema_version: "1.0.0", lot: "r151-r175", status: "reviewed-with-cautions",
    ingredient_count: ingredients.length, reused_count: reusedCount,
    ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025",
    ciqual_version: "2025-11-03", ciqual_doi: "https://doi.org/10.57745/RDMHWY",
    review_note: "Réutilisation limitée aux identifiants canoniques identiques; unités g/ml sécurisées. Les approximations citron confit, edamame, miso, raifort et vinaigre restent visibles.",
  },
  ingredients,
};

await writeFile(new URL("research/ciqual-map-r151-r175.json", root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${ingredients.length} correspondances écrites : ${reusedCount} réutilisées à identifiant identique, ${ingredients.length - reusedCount} relues pour ce lot.`);
