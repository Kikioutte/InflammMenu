import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [draft, previous] = await Promise.all([
  readFile(new URL("research/pilot-r076-r100.draft.json", root), "utf8").then(JSON.parse),
  readFile(new URL("research/ciqual-map-r051-r075.json", root), "utf8").then(JSON.parse),
]);

const requiredIds = [...new Set(
  draft.recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.id)),
)].sort();
const previousById = new Map(previous.ingredients.map((entry) => [entry.ingredient_id, entry]));
const ciqualNote = "Anses, Table Ciqual 2025, version 2025-11-03; conversion ménagère relue éditorialement, à confirmer au pesage lors d'un essai physique.";

function ciqual(ingredient_id, selected_ciqual_code, grams_per_normalized_unit, rationale, options = {}) {
  return {
    ingredient_id,
    selected_ciqual_code,
    grams_per_normalized_unit,
    review_status: options.review_status ?? "validated",
    rationale,
    source_note: options.source_note ?? ciqualNote,
    ...(options.grams_per_unit ? { grams_per_unit: options.grams_per_unit } : {}),
    ...(options.occurrence_overrides ? { occurrence_overrides: options.occurrence_overrides } : {}),
    ...(options.nutrient_overrides ? { nutrient_overrides: options.nutrient_overrides } : {}),
  };
}

const reviewedNewMappings = [
  ciqual("amarante-soufflee", "9345", 1, "Amarante crue utilisée comme équivalent sans ajout de l'amarante soufflée nature; la déshydratation liée au soufflage peut modifier la densité nutritionnelle.", { review_status: "caution" }),
  ciqual("banane", "13005", 110, "Banane jaune crue sans peau; 110 g de chair par fruit, conformément aux 220 g indiqués pour deux bananes."),
  ciqual("betterave-cuite", "20003", 1, "Betterave rouge cuite, sans vinaigre; quantité déjà exprimée en grammes."),
  ciqual("blette", "20301", 0.8, "Blette, côtes et feuilles, cuite à l'eau; conversion prudente de 250 g crus en environ 200 g cuits pour tenir compte de l'égouttage.", { review_status: "caution" }),
  ciqual("brocoli", "20057", 1, "Brocoli cru en fleurettes, pesé avant cuisson vapeur."),
  ciqual("champignon-paris", "20056", 1, "Champignon de Paris cru, pesé avant cuisson."),
  ciqual("ciboule", "11003", 15, "Ciboule fraîche; 15 g de fraction comestible par petite tige."),
  ciqual("citron-jaune", "13009", 35, "Citron jaune cru; 35 g de fraction comestible par pièce pour le jus et, selon la recette, le zeste."),
  ciqual("coing", "13010", 225, "Coing cru; le brouillon précise environ 500 g avant épluchage pour deux fruits, soit environ 450 g de chair utilisable."),
  ciqual("concombre", "20019", 300, "Concombre cru avec peau; 300 g par pièce moyenne, donc 150 g pour le demi-concombre de r087."),
  ciqual("courge-butternut", "20138", 1, "Courge butternut crue, chair sans peau; quantité exprimée en grammes avant cuisson."),
  ciqual("datte-sechee", "13011", 15, "Datte sèche dénoyautée; 15 g par pièce, conformément aux 90 g indiqués pour six dattes."),
  ciqual("epinard-frais", "20059", 1, "Épinard cru, pesé avant cuisson."),
  ciqual("farine-quinoa", "9340", 1, "Quinoa cru utilisé comme équivalent du même grain moulu sans ajout; la mouture ne modifie pas la masse mais Ciqual ne documente pas spécifiquement la farine.", {
    review_status: "caution",
    nutrient_overrides: {
      sugars_g: {
        value: 0.4,
        note: "Ciqual ne renseigne pas les sucres du quinoa cru; estimation dérivée du quinoa cuit Ciqual 9341 et ramenée à la matière sèche. Impact attendu faible.",
      },
    },
  }),
  ciqual("figue-fraiche", "13012", 50, "Figue crue; 50 g de fraction comestible par fruit moyen."),
  ciqual("flocons-seigle", "9390", 1, "Seigle complet cru utilisé comme équivalent des flocons de seigle nature; quantité sèche en grammes.", { review_status: "caution" }),
  ciqual("fraise", "13014", 1, "Fraise crue équeutée; quantité exprimée en grammes."),
  ciqual("framboise", "13015", 1, "Framboise crue; quantité exprimée en grammes."),
  ciqual("freekeh", "9060", 1, "Blé dur complet cru utilisé comme approximation du blé vert concassé et torréfié; la récolte précoce et la torréfaction du freekeh ne sont pas représentées dans Ciqual.", { review_status: "caution" }),
  ciqual("graines-pavot", "11061", 3, "Graines de pavot; 3 g par cuillère à café rase."),
  ciqual("grue-cacao", "18100", 1, "Cacao en poudre sans sucres ajoutés utilisé comme approximation disponible du grué de cacao; la teneur en lipides du grué peut être sous-estimée.", { review_status: "caution" }),
  ciqual("huile-olive-vierge-extra", "17270", 13.5, "Huile d'olive vierge extra; 13,5 g par cuillère à soupe et 4,5 g par cuillère à café.", { grams_per_unit: { c_cafe: 4.5, c_soupe: 13.5 } }),
  ciqual("kaki", "13066", 150, "Kaki cru; 150 g de chair et peau par fruit, conformément aux 300 g indiqués pour deux kakis."),
  ciqual("kefir-lait-nature", "19865", 1, "Kéfir de lait nature; densité arrondie à 1 g/ml faute de référence produit."),
  ciqual("miso-soja", "20916", 18, "Miso; 18 g par cuillère à soupe, conformément à la note du brouillon."),
  ciqual("noix-grenoble", "15005", 1, "Noix, cerneau séché non salé; quantité exprimée en grammes."),
  ciqual("oeuf-poule", "22000", 50, "Œuf de poule entier cru; 50 g sans coquille par œuf moyen."),
  ciqual("oignon-jaune", "20239", 150, "Oignon jaune cru; 150 g par pièce moyenne."),
  ciqual("oignon-rouge", "20238", 150, "Oignon rouge cru; 150 g par pièce moyenne."),
  ciqual("pain-complet", "7110", 40, "Pain complet ou intégral à la farine T150; 40 g par tranche, conformément aux 160 g indiqués pour quatre tranches."),
  ciqual("pain-levain-complet", "7110", 40, "Pain complet ou intégral à la farine T150; 40 g par tranche. Ciqual ne distingue pas ici la fermentation au levain.", { review_status: "caution" }),
  ciqual("papaye", "13035", 300, "Papaye mûre, chair sans peau; 300 g de chair pour la petite papaye de r098."),
  ciqual("peche", "13043", 112.5, "Pêche crue avec peau sans noyau; 112,5 g par fruit, conformément aux 450 g indiqués pour quatre pêches."),
  ciqual("persil-frais", "11014", 1, "Persil frais; quantité exprimée en grammes."),
  ciqual("petits-pois", "20084", 1, "Petits pois surgelés crus, pesés avant cuisson; les recettes autorisent aussi des petits pois frais, proches mais non identiques.", { review_status: "caution" }),
  ciqual("pistache", "15044", 1, "Pistache grillée sans sel ajouté; quantité exprimée en grammes."),
  ciqual("polenta-complete", "9545", 1, "Farine de maïs utilisée comme équivalent sec de la polenta complète; la granulométrie et la mention complète ne sont pas distinguées dans Ciqual.", { review_status: "caution" }),
  ciqual("raisin-noir", "13045", 1, "Raisin noir cru; quantité exprimée en grammes."),
  ciqual("rhubarbe", "13047", 1, "Rhubarbe crue, tiges parées; quantité exprimée en grammes avant rôtissage."),
  ciqual("sarrasin-decortique", "9540", 1, "Farine de sarrasin utilisée comme équivalent nutritionnel complet du grain décortiqué cru; même précédent validé pour r051-r075, avec mouture documentée comme limite."),
  ciqual("sauge-fraiche", "11069", 0.5, "Sauge fraîche; environ 0,5 g par feuille moyenne."),
  ciqual("tofu-ferme", "20904", 1, "Tofu nature préemballé utilisé comme référence du tofu ferme égoutté; quantité exprimée en grammes."),
  ciqual("truite-filet", "27008", 1, "Truite d'élevage crue; quantité de filet sans arêtes exprimée en grammes. L'espèce exacte n'étant pas précisée, la référence générique truite/fario est retenue.", { review_status: "caution" }),
];

const newById = new Map(reviewedNewMappings.map((entry) => [entry.ingredient_id, entry]));
const ingredients = requiredIds.map((id) => {
  const prior = previousById.get(id);
  if (prior) {
    const copied = structuredClone(prior);
    if (["aneth-frais", "coriandre-fraiche", "menthe-fraiche"].includes(id)) {
      copied.grams_per_unit = { g: 1, piece: 20 };
      copied.rationale = `${copied.rationale} Pour r076-r100, les quantités en grammes emploient un facteur 1 g/g.`;
    }
    if (id === "graines-lin-moulues") {
      copied.grams_per_unit = { g: 1, c_soupe: 7 };
      copied.rationale = `${copied.rationale} Pour r076-r100, les quantités en grammes emploient un facteur 1 g/g.`;
    }
    if (id === "pain-seigle-complet") {
      copied.occurrence_overrides = {
        ...(copied.occurrence_overrides ?? {}),
        r084: { grams_total: 160, source_note: "Quatre tranches indiquées à environ 160 g dans le brouillon r084." },
      };
    }
    if (id === "prune") {
      copied.occurrence_overrides = {
        ...(copied.occurrence_overrides ?? {}),
        r078: { grams_total: 260, source_note: "Quatre prunes indiquées à environ 260 g dans le brouillon r078." },
      };
    }
    return copied;
  }
  const reviewed = newById.get(id);
  if (!reviewed) throw new Error(`Correspondance manuelle absente pour ${id}`);
  return reviewed;
});

if (newById.size !== reviewedNewMappings.length) throw new Error("Identifiant dupliqué dans les nouvelles correspondances");
const unusedNew = [...newById.keys()].filter((id) => !requiredIds.includes(id));
if (unusedNew.length) throw new Error(`Nouvelles correspondances inutilisées : ${unusedNew.join(", ")}`);

const output = {
  meta: {
    schema_version: "1.0.0",
    lot: "r076-r100",
    status: "reviewed-with-cautions",
    ingredient_count: ingredients.length,
    reused_validated_mapping_count: requiredIds.filter((id) => previousById.has(id)).length,
    manually_reviewed_mapping_count: requiredIds.filter((id) => !previousById.has(id)).length,
    ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025",
    ciqual_version: "2025-11-03",
    ciqual_doi: "https://doi.org/10.57745/RDMHWY",
    fallback_source: "USDA FoodData Central, SR Legacy, final release April 2018",
    fallback_scope: ingredients.filter(({ source_dataset }) => source_dataset === "usda-sr").map(({ ingredient_id }) => ingredient_id),
    review_note: "Les 42 identifiants canoniques déjà présents reprennent les correspondances r051-r075. Les 43 nouvelles correspondances et toutes les conversions ménagères ont été relues; caution signale une approximation d'état, de transformation ou de variété.",
  },
  ingredients,
};

await writeFile(new URL("research/ciqual-map-r076-r100.json", root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${ingredients.length} correspondances écrites : ${output.meta.reused_validated_mapping_count} réutilisées, ${output.meta.manually_reviewed_mapping_count} relues manuellement.`);
