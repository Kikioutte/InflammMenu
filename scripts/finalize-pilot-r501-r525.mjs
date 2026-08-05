import { readFile, writeFile } from "node:fs/promises";

const catalogue = JSON.parse(await readFile("research/pilot-r501-r525.nutrition.json", "utf8"));
const reviewedAt = "2026-08-05";
const eligibleIds = new Set([
  "r501", "r502", "r503", "r504", "r505", "r506", "r507", "r508",
  "r513", "r514", "r515", "r517", "r519", "r521", "r522", "r523", "r524", "r525",
]);
const specialCautions = {
  r509: "Cette boisson ne remplace ni l'eau ni un repas; servir sans sucre ajouté.",
  r510: "Cette boisson ne constitue pas un repas complet; vérifier l'étiquette de la boisson de soja.",
  r511: "Cette boisson contient du gluten via l'orge et ne convient pas à la maladie cœliaque.",
  r512: "Cette boisson ne constitue pas un repas complet; servir sans sucre ajouté.",
  r516: "Soupe légère conservée hors du planificateur de repas principal malgré sa teneur en légumineuses.",
  r518: "Soupe légère conservée hors du planificateur de repas principal; compléter si elle est servie seule.",
  r520: "Salade légère en protéines conservée hors du planificateur de repas principal.",
  r522: "Le curcuma est utilisé ici à dose culinaire; ne pas extrapoler vers des compléments ni augmenter la dose dans un but médical.",
  r525: "Le curcuma est utilisé ici à dose culinaire; ne pas extrapoler vers des compléments ni augmenter la dose dans un but médical.",
};

for (const recipe of catalogue.recipes) {
  const nutrition = recipe.nutrition_par_portion;
  const calculationCautions = nutrition.estimation.cautions ?? [];
  const withReserve = nutrition.estimation.statut === "calculated-with-cautions";
  const score = 7.2 + Math.min(1.1, nutrition.fibres_g / 17) + Math.min(0.35, nutrition.proteines_g / 60) - Math.min(0.5, nutrition.sodium_mg / 1300) - Math.min(0.4, nutrition.acides_gras_satures_g / 15);
  recipe.score_anti_inflammatoire = Math.max(6.6, Math.min(8.8, Number(score.toFixed(1))));
  recipe.score_note = "Cet indice éditorial décrit la composition globale de la recette, notamment les végétaux, fibres, matières grasses, sodium et graisses saturées; il ne mesure ni ne prouve aucun effet médical.";
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = withReserve || specialCautions[recipe.id] ? "caution" : "validated";
  recipe.app.review.summary = "Adaptation culinaire originale d'inspiration indienne relue pour sa cohérence, sans revendication d'authenticité ayurvédique, de diagnostic de dosha ni d'effet thérapeutique; aucun essai culinaire physique n'est revendiqué.";
  const allergens = recipe.app.planner.allergens.length
    ? `Allergènes formulés : ${recipe.app.planner.allergens.join(", ")}.`
    : "Aucun des 14 allergènes réglementaires n'est formulé.";
  recipe.app.review.caution = [
    specialCautions[recipe.id] ?? `${allergens} Vérifier les étiquettes et les traces éventuelles.`,
    calculationCautions.length ? `Réserve nutritionnelle : ${calculationCautions.join("; ")}.` : "",
    "Recette non testée physiquement; coût, rendement et texture restent à observer.",
  ].filter(Boolean).join(" ");
  recipe.app.planner.eligible = eligibleIds.has(recipe.id);
  recipe.provenance.reviewed_at = reviewedAt;
}

catalogue.meta = {
  schema_version: "2.1.0",
  status: "editorial-validated",
  nombre_recettes: catalogue.recipes.length,
  collection_notice: "Adaptations culinaires originales inspirées de traditions indiennes associées à l'Ayurveda, sans revendication d'authenticité traditionnelle.",
  nutrition_notice: "Valeurs calculées à partir de Ciqual 2025 et de correspondances documentées; proxies et réserves sont signalés.",
  medical_notice: "Aucun diagnostic de dosha, complément, cure, prévention ou traitement n'est proposé. Ces recettes ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: reviewedAt,
};

await writeFile("research/pilot-r501-r525.final.json", `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes r501-r525 finalisées, ${eligibleIds.size} éligibles.`);
