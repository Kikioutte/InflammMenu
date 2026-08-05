import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const priorPaths = [
  "research/ciqual-map-r051-r075.json",
  "research/ciqual-map-r076-r100.json",
  "research/ciqual-map-r101-r125.json",
  "research/ciqual-map-r126-r150.json",
  "research/ciqual-map-r151-r175.json",
  "research/ciqual-map-r176-r200.json",
  "research/ciqual-map-r201-r225.json",
  "research/ciqual-map-r226-r250.json",
];
const [draft, ...priorMaps] = await Promise.all([
  readFile(new URL("research/pilot-r276-r300.draft.json", root), "utf8").then(JSON.parse),
  ...priorPaths.map((path) => readFile(new URL(path, root), "utf8").then(JSON.parse)),
]);
const requiredIds = [...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id)))].sort();
const priorById = new Map();
for (const map of priorMaps) for (const entry of map.ingredients) priorById.set(entry.ingredient_id, entry);

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
    ...(options.occurrence_overrides ? { occurrence_overrides: options.occurrence_overrides } : {}),
    ...(options.nutrient_overrides ? { nutrient_overrides: options.nutrient_overrides } : {}),
  };
}

const newMappings = [
  ciqual("artichaut", "20000", 50, "Artichaut cuit; environ 50 g de fond comestible par artichaut moyen après cuisson vapeur.", { review_status: "caution" }),
  ciqual("bouillon-legumes-celeri", "25948", 0.25, "Bouillon de légumes reconstitué utilisé à un quart de son profil standard pour approcher la mention peu salé; le céleri reste déclaré comme allergène.", { review_status: "caution" }),
  ciqual("chou-frise", "20218", 1, "Chou frisé cru, pesé avant rôtissage."),
  ciqual("citronnelle", "18066", 1, "Eau utilisée comme proxy énergétique quasi nul pour la citronnelle infusée puis entièrement retirée.", { review_status: "caution", occurrence_overrides: { r292: { grams_total: 1, source_note: "Les deux tiges sont retirées; seul un transfert aromatique non quantifié est retenu." } } }),
  ciqual("courge-spaghetti", "20145", 1000, "Chair crue de courge spaghetti; environ 1 kg de chair pour une courge moyenne après retrait peau et graines.", { review_status: "caution" }),
  ciqual("creme-avoine", "11214", 1, "Crème de soja Ciqual utilisée comme proxy de texture et de densité énergétique d'une crème d'avoine; protéines et composition exacte dépendent du produit.", { review_status: "caution", nutrient_overrides: { fiber_g: { value: 0, note: "Fibres absentes pour le proxy Ciqual; valeur technique à 0, susceptible de sous-estimer la crème d'avoine." } } }),
  ciqual("creme-soja", "11214", 1, "Préparation culinaire à base de soja, type crème de soja; densité arrondie à 1 g/ml.", { review_status: "caution", nutrient_overrides: { fiber_g: { value: 0, note: "Fibres non renseignées dans Ciqual 11214; valeur technique à 0 susceptible de les sous-estimer." } } }),
  ciqual("doliques-oeil-noir-cuits", "20700", 1, "Légume sec cuit moyen utilisé comme proxy du dolique à œil noir cuit, absent de Ciqual.", { review_status: "caution" }),
  ciqual("feuilles-moutarde", "20346", 1, "Chou kale cru utilisé comme proxy feuillu du même ordre de grandeur pour les feuilles de moutarde absentes de Ciqual.", { review_status: "caution" }),
  ciqual("gombo", "58100", 1, "Gombo cru, pesé avant mijotage."),
  ciqual("haricots-mungo-secs", "20530", 1, "Haricot mungo sec, pesé avant cuisson.", { review_status: "caution", nutrient_overrides: { sugars_g: { value: 0, note: "Sucres non renseignés dans Ciqual 20530; valeur technique à 0 susceptible de les sous-estimer." } } }),
  ciqual("haricots-tarbais-cuits", "20502", 1, "Haricot blanc bouilli utilisé comme équivalent du haricot tarbais cuit; variété non distinguée dans Ciqual.", { review_status: "caution" }),
  ciqual("mais-doux-cuit", "20066", 1, "Maïs doux appertisé égoutté utilisé comme référence du maïs doux cuit et égoutté; sodium dépend du produit.", { review_status: "caution" }),
  ciqual("marjolaine-fraiche", "11034", 0.33, "Marjolaine séchée utilisée comme équivalent de la marjolaine fraîche; conversion fraîche-sèche de 3 pour 1.", { review_status: "caution" }),
  ciqual("miso-rouge-soja-riz", "20916", 18, "Miso utilisé comme référence du miso rouge de soja et riz; 18 g par cuillère à soupe, sodium variable selon la marque.", { review_status: "caution" }),
  ciqual("oignon-nouveau", "20323", 30, "Oignon nouveau sauté sans matière grasse; 30 g de fraction comestible par pièce, cohérent avec la cuisson du plat."),
  ciqual("olive-verte", "13033", 1, "Olive verte en saumure égouttée; quantité exprimée en grammes et sodium variable selon le rinçage."),
  ciqual("oseille-fraiche", "20111", 1, "Oseille crue, pesée avant cuisson courte."),
  ciqual("pak-choi", "20340", 200, "Pak-choï cru; environ 200 g de tiges et feuilles par petite pièce."),
  ciqual("patate-douce-violette", "4101", 1, "Patate douce crue utilisée comme équivalent de la variété violette, non distinguée dans Ciqual.", { review_status: "caution" }),
  ciqual("pois-bambara-secs", "20525", 1, "Haricot rouge sec utilisé comme proxy de légumineuse sèche pour le pois bambara absent de Ciqual.", { review_status: "caution" }),
  ciqual("quinoa-rouge", "9341", 3, "Quinoa cuit sans sel utilisé comme référence du quinoa rouge; conversion estimée de 1 g sec en 3 g cuits.", { review_status: "caution" }),
  ciqual("raisin-blanc", "13044", 1, "Raisin blanc cru, pesé en grammes."),
  ciqual("riz-complet", "9102", 1, "Riz complet cru, pesé sec avant cuisson."),
  ciqual("riz-rouge", "9102", 1, "Riz complet cru utilisé comme équivalent du riz rouge sec, variété non distinguée dans Ciqual.", { review_status: "caution" }),
  ciqual("sarrasin-concasse", "9540", 1, "Farine de sarrasin utilisée comme équivalent du même grain concassé sec; la granulométrie est la limite documentaire.", { review_status: "caution" }),
  ciqual("shiitake-frais", "20212", 0.8, "Shiitaké cuit utilisé pour 300 g de champignons frais vapeur; rendement estimé à 80 % après cuisson.", { review_status: "caution" }),
  ciqual("tempeh-soja", "20917", 1, "Tempeh nature; quantité exprimée en grammes."),
  ciqual("tomates-sechees-sans-sulfites", "20189", 1, "Tomate séchée nature; l'absence de sulfites relève de l'étiquette.", { review_status: "caution", nutrient_overrides: { energy_kcal: { value: 258, note: "Énergie absente pour Ciqual 20189; valeur technique calculée par facteurs d'Atwater à partir des macronutriments de la même entrée." } } }),
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
  if (id === "cacao-non-sucre") copied.grams_per_unit = { g: 1, c_cafe: 3, c_soupe: 6 };
  if (id === "sauge-fraiche") copied.grams_per_unit = { g: 1, piece: 0.5 };
  if (id === "aneth-frais" || id === "coriandre-fraiche" || id === "persil-frais") copied.grams_per_unit = { g: 1, piece: 20 };
  if (id === "prune") copied.grams_per_unit = { g: 1, piece: 60 };
  if (id === "tomate") copied.grams_per_unit = { g: 1, piece: 120 };
  if (id === "coing") copied.grams_per_unit = { g: 1, piece: 225 };
  if (id === "graines-lupin-cuites") copied.grams_per_unit = { g: 0.38 };
  return copied;
});

if (newById.size !== newMappings.length) throw new Error("Identifiant dupliqué dans les nouvelles correspondances");
const unusedNew = [...newById.keys()].filter((id) => !requiredIds.includes(id));
if (unusedNew.length) throw new Error(`Nouvelles correspondances inutilisées : ${unusedNew.join(", ")}`);
const fallbackScope = ingredients.filter(({ source_dataset }) => source_dataset === "usda-sr").map(({ ingredient_id }) => ingredient_id).sort();
const output = {
  meta: {
    schema_version: "1.0.0",
    lot: "r276-r300",
    status: "reviewed-with-cautions",
    ingredient_count: ingredients.length,
    reused_validated_mapping_count: requiredIds.filter((id) => priorById.has(id)).length,
    manually_reviewed_mapping_count: requiredIds.filter((id) => !priorById.has(id)).length,
    ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025",
    ciqual_version: "2025-11-03",
    ciqual_doi: "https://doi.org/10.57745/RDMHWY",
    fallback_source: fallbackScope.length ? "USDA FoodData Central, SR Legacy, final release April 2018" : null,
    fallback_scope: fallbackScope,
    review_note: "Les codes validés antérieurs sont conservés pour les identifiants identiques. Les 29 nouvelles correspondances, facteurs et occurrences du lot ont été relus manuellement; chaque proxy reste au statut caution.",
  },
  ingredients,
};
await writeFile(new URL("research/ciqual-map-r276-r300.json", root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${ingredients.length} correspondances écrites : ${output.meta.reused_validated_mapping_count} réutilisées, ${output.meta.manually_reviewed_mapping_count} nouvelles.`);
