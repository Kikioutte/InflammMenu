import { readFile, writeFile } from "node:fs/promises";

const catalogue = JSON.parse(await readFile("research/pilot-r426-r450.nutrition.json", "utf8"));
const reviewedAt = "2026-08-05";
const eligibleIds = new Set(Array.from({ length: 15 }, (_, index) => `r${426 + index}`).filter((id) => id !== "r433"));
const specialCautions = {
  r433: "Le citron confit peut apporter nettement plus de sodium que le calcul. Cette recette reste hors du planificateur; rincer le citron et ne pas resaler.",
  r446: "Le miso apporte du sodium; ne pas resaler et vérifier l'étiquette pour le soja.",
  r447: "Le citron confit peut apporter davantage de sodium que le calcul; rincer et ne pas ajouter de sel.",
};

for (const recipe of catalogue.recipes) {
  const nutrition = recipe.nutrition_par_portion;
  const calculationCautions = nutrition.estimation.cautions ?? [];
  const withReserve = nutrition.estimation.statut === "calculated-with-cautions";
  const score = 7.3 + Math.min(1.05, nutrition.fibres_g / 18) + Math.min(0.35, nutrition.proteines_g / 65) - Math.min(0.5, nutrition.sodium_mg / 1300) - Math.min(0.45, nutrition.acides_gras_satures_g / 16);
  recipe.score_anti_inflammatoire = Math.max(6.7, Math.min(8.8, Number(score.toFixed(1))));
  recipe.score_note = `${recipe.categorie === "plat" ? "Ce plat" : "Cet accompagnement"} associe légumes, fibres et des matières grasses mesurées; la composition globale, le sodium et les graisses saturées sont pris en compte. Cet indice éditorial décrit le profil de la recette; il ne mesure ni ne prouve aucun effet médical.`;
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = withReserve || specialCautions[recipe.id] ? "caution" : "validated";
  recipe.app.review.summary = withReserve
    ? "Cohérence éditoriale relue; les approximations nutritionnelles sont documentées et aucun essai culinaire physique n'est revendiqué."
    : "Cohérence éditoriale relue; formulation structurée et aucun essai culinaire physique n'est revendiqué.";
  const allergens = recipe.app.planner.allergens.length ? `Allergènes formulés : ${recipe.app.planner.allergens.join(", ")}.` : "Aucun des 14 allergènes réglementaires n'est formulé.";
  const cooking = Number(recipe.id.slice(1)) <= 440 ? " Cuire la volaille à cœur, sans zone rosée, et éviter toute contamination croisée avec les aliments prêts à consommer." : "";
  recipe.app.review.caution = `${specialCautions[recipe.id] ?? `${allergens} Vérifier les étiquettes et les traces éventuelles.`}${cooking}${calculationCautions.length ? ` Réserve nutritionnelle : ${calculationCautions.join("; ")}.` : ""}`;
  recipe.app.planner.eligible = eligibleIds.has(recipe.id);
  recipe.provenance.reviewed_at = reviewedAt;
}

catalogue.meta = {
  schema_version: "2.1.0",
  status: "editorial-validated",
  nombre_recettes: catalogue.recipes.length,
  nutrition_notice: "Valeurs calculées à partir de Ciqual 2025 et des correspondances déjà validées; les proxies et réserves sont signalés.",
  medical_notice: "Ces recettes s'inscrivent dans un modèle alimentaire varié. Elles ne revendiquent aucun effet thérapeutique et ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: reviewedAt,
};
await writeFile("research/pilot-r426-r450.final.json", `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes r426-r450 finalisées, ${eligibleIds.size} éligibles.`);
