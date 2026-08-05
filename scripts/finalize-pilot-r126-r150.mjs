import { readFile, writeFile } from "node:fs/promises";

const input = JSON.parse(await readFile("research/pilot-r126-r150.nutrition.json", "utf8"));
const reviewedAt = "2026-08-05";
const eligibleIds = new Set(["r128", "r129", "r132", "r137", "r138", "r141", "r145", "r150"]);
const specialCautions = {
  r130: "Contient du lait. Refroidir rapidement, conserver au réfrigérateur et servir dans les 24 heures.",
  r132: "Contient des fruits à coque; le vinaigre de Xérès peut contenir des sulfites selon la marque, donc vérifier l'étiquette.",
  r137: "Contient des arachides. Cette soupe est incompatible avec une allergie à l'arachide, même à l'état de traces.",
  r142: "Le chou et les légumineuses peuvent être moins bien tolérés par certaines personnes; adapter la portion individuellement.",
};

for (const recipe of input.recipes) {
  const nutrition = recipe.nutrition_par_portion;
  const nutritionCautions = nutrition.estimation.cautions ?? [];
  const hasCalculationCaution = nutrition.estimation.statut === "calculated-with-cautions";
  const profileScore = 7.2
    + Math.min(1.1, nutrition.fibres_g / 14)
    + Math.min(0.35, nutrition.proteines_g / 50)
    - Math.min(0.45, nutrition.sodium_mg / 1400)
    - Math.min(0.35, nutrition.acides_gras_satures_g / 18);
  recipe.score_anti_inflammatoire = Math.max(6.8, Math.min(8.8, Number(profileScore.toFixed(1))));
  recipe.score_note = `Cette soupe associe des végétaux et ${nutrition.fibres_g >= 8 ? "une quantité notable de fibres" : "des ingrédients peu transformés"} dans un profil compatible avec un modèle alimentaire méditerranéen global. Cet indice éditorial décrit le profil de la recette; il ne mesure ni ne prouve aucun effet médical.`;
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = hasCalculationCaution || specialCautions[recipe.id] ? "caution" : "validated";
  recipe.app.review.summary = hasCalculationCaution
    ? "Cohérence éditoriale relue; une approximation nutritionnelle documentée reste visible et la recette n'a pas été testée physiquement."
    : "Cohérence éditoriale relue; quantités et préparation structurées, sans revendiquer d'essai culinaire physique.";
  const allergenText = recipe.app.planner.allergens.length
    ? `Allergènes formulés : ${recipe.app.planner.allergens.join(", ")}. Vérifier aussi les étiquettes et les traces éventuelles.`
    : "Aucun des 14 allergènes réglementaires n'est formulé; vérifier malgré tout les étiquettes et les traces éventuelles.";
  const calculationText = nutritionCautions.length
    ? ` Réserve nutritionnelle : ${nutritionCautions.join("; ")}.`
    : "";
  recipe.app.review.caution = `${specialCautions[recipe.id] ?? allergenText}${calculationText}`;
  recipe.app.planner.eligible = eligibleIds.has(recipe.id);
  recipe.provenance.reviewed_at = reviewedAt;
}

input.meta = {
  schema_version: "2.1.0",
  status: "editorial-validated",
  nombre_recettes: input.recipes.length,
  nutrition_notice: "Valeurs calculées à partir de Ciqual 2025; les correspondances approximatives et valeurs techniques sont signalées recette par recette.",
  medical_notice: "Ces recettes s'inscrivent dans un modèle alimentaire varié. Elles ne revendiquent aucun effet thérapeutique et ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: reviewedAt,
};

await writeFile("research/pilot-r126-r150.final.json", `${JSON.stringify(input, null, 2)}\n`);
console.log(`${input.recipes.length} recettes r126-r150 finalisées, ${[...eligibleIds].length} éligibles au planificateur.`);
