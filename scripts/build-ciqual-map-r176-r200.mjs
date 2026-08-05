import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const mappingFiles = [
  "research/ciqual-map-r051-r075.json",
  "research/ciqual-map-r076-r100.json",
  "research/ciqual-map-r101-r125.json",
  "research/ciqual-map-r126-r150.json",
];
const [draft, ...priorMappings] = await Promise.all([
  readFile(new URL("research/pilot-r176-r200.draft.json", root), "utf8").then(JSON.parse),
  ...mappingFiles.map((path) => readFile(new URL(path, root), "utf8").then(JSON.parse)),
]);

const requiredIds = [...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id)))].sort();
const priorById = new Map();
for (const mapping of priorMappings) {
  for (const entry of mapping.ingredients) priorById.set(entry.ingredient_id, entry);
}

const ciqualNote = "Anses, Table Ciqual 2025, version 2025-11-03; conversion ménagère relue éditorialement, à confirmer au pesage lors d'un essai physique.";
function ciqual(ingredient_id, selected_ciqual_code, grams_per_normalized_unit, rationale, options = {}) {
  return {
    ingredient_id,
    selected_ciqual_code,
    grams_per_normalized_unit,
    review_status: options.review_status ?? "validated",
    rationale,
    source_note: ciqualNote,
    ...(options.grams_per_unit ? { grams_per_unit: options.grams_per_unit } : {}),
    ...(options.nutrient_overrides ? { nutrient_overrides: options.nutrient_overrides } : {}),
  };
}

const newMappings = [
  ciqual("abricots-secs-non-sulfures", "13001", 1, "Abricot dénoyauté sec; l'absence de sulfites relève de l'étiquette et ne modifie pas la correspondance nutritionnelle."),
  ciqual("farine-ble-complete", "9415", 1, "Farine de blé tendre T150, correspondant à une farine complète pesée en grammes."),
  ciqual("feves-cuites", "20500", 1, "Fèves bouillies/cuites à l'eau, égouttées; quantité exprimée en grammes."),
  ciqual("galettes-riz-complet", "7352", 8, "Galette de riz complet soufflé; 8 g par galette, valeur ménagère moyenne à confirmer sur l'emballage."),
  ciqual("lait-coco-leger", "18041", 0.5, "Lait de coco Ciqual utilisé à demi-masse équivalente pour approcher un produit léger dilué, soit environ la moitié du profil du lait de coco standard.", { review_status: "caution" }),
  ciqual("levure-chimique", "11046", 4, "Levure chimique; 4 g par cuillère à café rase."),
  ciqual("paprika-doux", "11049", 2.3, "Paprika en poudre; 2,3 g par cuillère à café rase."),
  ciqual("polenta-fine", "9614", 1, "Polenta ou semoule de maïs précuite à cuire; la granulométrie fine ne change pas la masse.", {
    review_status: "caution",
    nutrient_overrides: {
      saturated_fat_g: {
        value: 0.17,
        note: "Graisses saturées absentes pour Ciqual 9614; valeur de la farine de maïs Ciqual 9545 utilisée comme approximation du même grain sec.",
      },
    },
  }),
  ciqual("tofu-soyeux", "20906", 1, "Tofu soyeux préemballé, égoutté; quantité exprimée en grammes."),
  ciqual("tomates-sechees", "20189", 1, "Tomate séchée nature; la présence de sulfites doit être vérifiée sur l'étiquette.", {
    review_status: "caution",
    nutrient_overrides: {
      energy_kcal: {
        value: 258,
        note: "Énergie absente pour Ciqual 20189; valeur technique calculée par facteurs d'Atwater à partir des macronutriments Ciqual de la même entrée.",
      },
    },
  }),
  ciqual("zaatar-sesame", "15010", 2.5, "Sésame utilisé comme approximation prudente d'un zaatar sans sel contenant du sésame; herbes et sumac ne sont pas représentés séparément.", { review_status: "caution" }),
];
const newById = new Map(newMappings.map((entry) => [entry.ingredient_id, entry]));

const ingredients = requiredIds.map((id) => {
  const prior = priorById.get(id);
  if (!prior) {
    const reviewed = newById.get(id);
    if (!reviewed) throw new Error(`Correspondance manuelle absente pour ${id}`);
    return reviewed;
  }
  const copied = structuredClone(prior);

  // Le code nutritionnel validé est conservé; seuls les facteurs sont adaptés aux unités de ce lot.
  if (id === "abricot") copied.grams_per_unit = { g: 1, piece: 45 };
  if (id === "cacao-non-sucre") copied.grams_per_unit = { g: 1, c_soupe: 6 };
  if (id === "coing") copied.grams_per_unit = { g: 1, piece: 225 };
  if (id === "graines-lin-moulues") copied.grams_per_unit = { g: 1, c_soupe: 7 };
  if (id === "prune") copied.grams_per_unit = { g: 1, piece: 60 };
  if (id === "tahini") copied.grams_per_unit = { g: 1, c_soupe: 15 };
  if (id === "aneth-frais") copied.grams_per_unit = { g: 1, piece: 20 };

  if (id === "orange") {
    copied.occurrence_overrides = {
      ...(copied.occurrence_overrides ?? {}),
      r177: { grams_total: 35, source_note: "Deux cuillères à soupe de jus et zeste fin estimés à 35 g." },
      r187: { grams_total: 95, source_note: "Jus et zeste d'une orange estimés à 95 g." },
      r189: { grams_total: 185, source_note: "180 ml de jus et zeste fin estimés à 185 g." },
      r193: { grams_total: 65, source_note: "60 ml de jus et zeste fin estimés à 65 g." },
      r196: { grams_total: 150, source_note: "140 ml de jus et zestes de deux oranges estimés à 150 g." },
    };
  }
  if (id === "mangue") {
    copied.occurrence_overrides = {
      ...(copied.occurrence_overrides ?? {}),
      r194: { grams_total: 300, source_note: "La recette indique environ 300 g de chair." },
    };
  }
  return copied;
});

if (newById.size !== newMappings.length) throw new Error("Identifiant dupliqué dans les nouvelles correspondances");
const unusedNew = [...newById.keys()].filter((id) => !requiredIds.includes(id));
if (unusedNew.length) throw new Error(`Nouvelles correspondances inutilisées : ${unusedNew.join(", ")}`);

const fallbackScope = ingredients
  .filter(({ source_dataset }) => source_dataset === "usda-sr")
  .map(({ ingredient_id }) => ingredient_id)
  .sort();
const output = {
  meta: {
    schema_version: "1.0.0",
    lot: "r176-r200",
    status: "reviewed-with-cautions",
    ingredient_count: ingredients.length,
    reused_validated_mapping_count: requiredIds.filter((id) => priorById.has(id)).length,
    manually_reviewed_mapping_count: requiredIds.filter((id) => !priorById.has(id)).length,
    ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025",
    ciqual_version: "2025-11-03",
    ciqual_doi: "https://doi.org/10.57745/RDMHWY",
    fallback_source: fallbackScope.length ? "USDA FoodData Central, SR Legacy, final release April 2018" : null,
    fallback_scope: fallbackScope,
    review_note: "Les correspondances existantes conservent leur source et leur code validés. Toutes les nouvelles correspondances, unités et occurrences r176-r200 ont été relues; les approximations restent au statut caution.",
  },
  ingredients,
};

await writeFile(new URL("research/ciqual-map-r176-r200.json", root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${ingredients.length} correspondances écrites : ${output.meta.reused_validated_mapping_count} réutilisées, ${output.meta.manually_reviewed_mapping_count} nouvelles.`);
