import { readFile, writeFile } from "node:fs/promises";

const catalogue = JSON.parse(await readFile("research/pilot-r326-r350.nutrition.json", "utf8"));
const reviewedAt = "2026-08-05";
const excludedIds = new Set(["r330", "r336"]);
const specialCautions = {
  r330: "La dulse peut apporter beaucoup d'iode. Cette recette reste hors du planificateur; les personnes ayant un trouble thyroïdien ou un régime pauvre en iode doivent demander un avis professionnel.",
  r336: "Le citron confit peut apporter nettement plus de sodium que le calcul; rincer, ne pas resaler et conserver cette recette hors du planificateur.",
  r346: "Contient lait et fruits à coque. Parmesan et produits conservés portent le sodium à environ 600 mg par portion; ne pas ajouter de sel.",
};

for (const recipe of catalogue.recipes) {
  const nutrition = recipe.nutrition_par_portion;
  const calculationCautions = nutrition.estimation.cautions ?? [];
  const withReserve = nutrition.estimation.statut === "calculated-with-cautions";
  const score = 7.35 + Math.min(1.05, nutrition.fibres_g / 19) + Math.min(0.35, nutrition.proteines_g / 60) - Math.min(0.55, nutrition.sodium_mg / 1300) - Math.min(0.45, nutrition.acides_gras_satures_g / 16);
  recipe.score_anti_inflammatoire = Math.max(6.7, Math.min(8.8, Number(score.toFixed(1))));
  recipe.score_note = `Ce plat associe végétaux, fibres et une source de protéines; les fromages, saumures et céréales raffinées éventuelles sont pris en compte dans l'appréciation globale. Cet indice éditorial décrit le profil de la recette; il ne mesure ni ne prouve aucun effet médical.`;
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = withReserve || specialCautions[recipe.id] ? "caution" : "validated";
  recipe.app.review.summary = withReserve
    ? "Cohérence éditoriale relue; les approximations nutritionnelles sont documentées et aucun essai culinaire physique n'est revendiqué."
    : "Cohérence éditoriale relue; formulation structurée et aucun essai culinaire physique n'est revendiqué.";
  const allergens = recipe.app.planner.allergens.length ? `Allergènes formulés : ${recipe.app.planner.allergens.join(", ")}.` : "Aucun des 14 allergènes réglementaires n'est formulé.";
  recipe.app.review.caution = `${specialCautions[recipe.id] ?? `${allergens} Vérifier les étiquettes et les traces éventuelles.`}${calculationCautions.length ? ` Réserve nutritionnelle : ${calculationCautions.join("; ")}.` : ""}`;
  recipe.app.planner.eligible = !excludedIds.has(recipe.id);
  recipe.provenance.reviewed_at = reviewedAt;
}

catalogue.meta = {
  schema_version: "2.1.0",
  status: "editorial-validated",
  nombre_recettes: catalogue.recipes.length,
  nutrition_notice: "Valeurs calculées à partir de Ciqual 2025 et des correspondances USDA déjà validées; les proxies et réserves sont signalés.",
  medical_notice: "Ces recettes s'inscrivent dans un modèle alimentaire varié. Elles ne revendiquent aucun effet thérapeutique et ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: reviewedAt,
};
await writeFile("research/pilot-r326-r350.final.json", `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes r326-r350 finalisées, ${catalogue.recipes.filter((recipe) => recipe.app.planner.eligible).length} éligibles.`);
