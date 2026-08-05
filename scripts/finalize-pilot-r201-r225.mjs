import { readFile, writeFile } from "node:fs/promises";

const catalogue = JSON.parse(await readFile("research/pilot-r201-r225.nutrition.json", "utf8"));
const reviewedAt = "2026-08-05";
const eligibleIds = new Set(["r201", "r202", "r203", "r204", "r205", "r206", "r207", "r208", "r209", "r210", "r212", "r218", "r220", "r221", "r222", "r223", "r224"]);
const specialCautions = {
  r207: "Contient des arachides; vérifier les traces sur tous les produits emballés.",
  r208: "Le vinaigre retenu peut contenir des sulfites selon la marque; vérifier l'étiquette.",
  r210: "Contient du lupin, allergène réglementaire pouvant aussi concerner certaines personnes allergiques à l'arachide.",
  r222: "Contient moutarde et sulfites selon les produits choisis; vérifier les étiquettes.",
  r225: "Contient du lait. Le sodium d'une ricotta salée peut être supérieur à celui du proxy nutritionnel utilisé.",
};

for (const recipe of catalogue.recipes) {
  const nutrition = recipe.nutrition_par_portion;
  const calculationCautions = nutrition.estimation.cautions ?? [];
  const withReserve = nutrition.estimation.statut === "calculated-with-cautions";
  const score = 7.3
    + Math.min(1.1, nutrition.fibres_g / 16)
    + Math.min(0.35, nutrition.proteines_g / 55)
    - Math.min(0.45, nutrition.sodium_mg / 1500)
    - Math.min(0.35, nutrition.acides_gras_satures_g / 18);
  recipe.score_anti_inflammatoire = Math.max(6.8, Math.min(8.8, Number(score.toFixed(1))));
  recipe.score_note = `Cette salade associe végétaux, ${nutrition.fibres_g >= 8 ? "fibres" : "ingrédients peu transformés"} et une source de matières grasses ou de protéines dans un profil alimentaire global. Cet indice éditorial décrit le profil de la recette; il ne mesure ni ne prouve aucun effet médical.`;
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = withReserve || specialCautions[recipe.id] ? "caution" : "validated";
  recipe.app.review.summary = withReserve
    ? "Cohérence éditoriale relue; les approximations nutritionnelles sont documentées et aucun essai culinaire physique n'est revendiqué."
    : "Cohérence éditoriale relue; formulation structurée et aucun essai culinaire physique n'est revendiqué.";
  const allergenText = recipe.app.planner.allergens.length
    ? `Allergènes formulés : ${recipe.app.planner.allergens.join(", ")}. Vérifier aussi les étiquettes et les traces éventuelles.`
    : "Aucun des 14 allergènes réglementaires n'est formulé; vérifier malgré tout les étiquettes et les traces éventuelles.";
  recipe.app.review.caution = `${specialCautions[recipe.id] ?? allergenText}${calculationCautions.length ? ` Réserve nutritionnelle : ${calculationCautions.join("; ")}.` : ""}`;
  recipe.app.planner.eligible = eligibleIds.has(recipe.id);
  recipe.provenance.reviewed_at = reviewedAt;
}

catalogue.meta = {
  schema_version: "2.1.0",
  status: "editorial-validated",
  nombre_recettes: catalogue.recipes.length,
  nutrition_notice: "Valeurs calculées à partir de Ciqual 2025 et de la ricotta USDA SR déjà validée; les proxies et facteurs d'hydratation sont signalés.",
  medical_notice: "Ces recettes s'inscrivent dans un modèle alimentaire varié. Elles ne revendiquent aucun effet thérapeutique et ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: reviewedAt,
};

await writeFile("research/pilot-r201-r225.final.json", `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes r201-r225 finalisées, ${eligibleIds.size} éligibles.`);
