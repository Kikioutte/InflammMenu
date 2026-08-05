import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(await readFile(new URL("research/pilot-r526-r550.nutrition.json", root), "utf8"));
const reviewedAt = "2026-08-05";
const eligibleIds = new Set(["r526", "r527", "r529", "r530", "r534", "r535", "r537", "r538"]);

const specialCautions = {
  r526: "Cuire complètement le mungo décortiqué et refroidir rapidement les restes; les épices restent à dose culinaire.",
  r527: "Cuire complètement lentilles et amarante et vérifier la tenue de la farce avant service.",
  r528: "Plat exclu du générateur car les protéines calculées restent modestes pour un repas principal; la coco et les épices restent des ingrédients culinaires.",
  r529: "Refroidir rapidement le riz et vérifier le sodium des haricots achetés avant assaisonnement.",
  r530: "Maintenir le tofu au froid pendant la marinade; contient soja et gluten, à confirmer sur les étiquettes.",
  r531: "Plat exclu du générateur en raison des graisses saturées calculées élevées; maintenir le paneer au froid et signaler le lait.",
  r532: "Plat exclu du générateur car l'apport énergétique calculé reste légèrement sous le seuil conservateur d'un repas principal.",
  r533: "Plat exclu du générateur car l'apport énergétique calculé reste faible; utiliser un tempeh alimentaire pasteurisé et respecter sa chaîne du froid.",
  r534: "Cuire complètement les lentilles, refroidir rapidement le riz et ne pas conserver les grains cuits à température ambiante.",
  r535: "Employer seulement des feuilles de curry vendues comme aliment, jamais un extrait ni un complément; cuire complètement et vérifier l'étiquette des adzuki.",
  r536: "Plat exclu car trop léger pour un repas principal; tremper quatre heures au réfrigérateur, jeter l'eau et cuire complètement sans revendiquer de fermentation.",
  r537: "Cuire complètement le riz, chauffer la farce à cœur et refroidir rapidement les restes.",
  r538: "Cuire complètement la farine de pois chiches jusqu'au centre de chaque galette.",
  r539: "Accompagnement exclu des repas principaux; limiter l'ajowan à la dose culinaire indiquée et ne jamais utiliser d'huile essentielle.",
  r540: "Accompagnement exclu des repas principaux; contient du sésame, à signaler et à confirmer sur l'étiquette.",
  r541: "Accompagnement exclu des repas principaux; contient du gluten et l'orge cuite doit être refroidie rapidement.",
  r542: "Accompagnement exclu des repas principaux; contient de la moutarde et les graines doivent être toastées à couvert.",
  r543: "Collation exclue des repas principaux; employer uniquement des makhana alimentaires nature et vérifier les traces indiquées sur l'étiquette.",
  r544: "Collation exclue des repas principaux; contient du sésame et la farine de pois chiches doit être cuite complètement à cœur.",
  r545: "Collation exclue des repas principaux; vérifier chaque datte dénoyautée et signaler gluten et fruits à coque.",
  r546: "Collation exclue des repas principaux; cuire complètement les lentilles et sécher les crackers avant conservation.",
  r547: "Dessert exclu des repas principaux; contient gluten et fruits à coque et n'est pas présenté comme un remède traditionnel.",
  r548: "Dessert exclu des repas principaux; contient du lait, refroidir la mangue avant assemblage et maintenir le yaourt au froid.",
  r549: "Dessert exclu des repas principaux; peser 0,1 g de safran à usage culinaire et refroidir rapidement le riz cuit.",
  r550: "Sauce exclue des repas principaux; contient de la moutarde, laver et essorer les herbes, conserver au froid et consommer sous 24 heures.",
};

for (const recipe of catalogue.recipes) {
  const nutrition = recipe.nutrition_par_portion;
  const calculationCautions = nutrition.estimation.cautions ?? [];
  const score = 7.2
    + Math.min(1.1, nutrition.fibres_g / 17)
    + Math.min(0.35, nutrition.proteines_g / 60)
    - Math.min(0.5, nutrition.sodium_mg / 1300)
    - Math.min(0.4, nutrition.acides_gras_satures_g / 15);
  recipe.score_anti_inflammatoire = Math.max(6.6, Math.min(8.8, Number(score.toFixed(1))));
  recipe.score_note = "Cet indice éditorial décrit uniquement la composition globale de la recette; il ne mesure ni ne prouve aucun effet médical.";
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = "caution";
  recipe.app.review.summary = "Création culinaire originale inspirée de traditions indiennes associées à l'Ayurveda, sans revendication d'authenticité, diagnostic de dosha, prévention ni effet thérapeutique; aucun essai culinaire physique n'est revendiqué.";
  const allergens = recipe.app.planner.allergens.length
    ? `Allergènes formulés : ${recipe.app.planner.allergens.join(", ")}.`
    : "Aucun des 14 allergènes réglementaires n'est formulé; vérifier néanmoins les traces sur les emballages.";
  recipe.app.review.caution = [
    specialCautions[recipe.id],
    allergens,
    calculationCautions.length ? `Réserve nutritionnelle : ${calculationCautions.join("; ")}.` : "",
    "Recette non testée physiquement; coût, rendement, texture et durée restent à observer.",
  ].filter(Boolean).join(" ");
  recipe.app.planner.eligible = eligibleIds.has(recipe.id);
  recipe.provenance.reviewed_at = reviewedAt;
}

catalogue.meta = {
  schema_version: "2.1.0",
  status: "editorial-validated",
  nombre_recettes: catalogue.recipes.length,
  collection_notice: "Créations culinaires originales inspirées de traditions indiennes associées à l'Ayurveda, sans revendication d'authenticité traditionnelle.",
  nutrition_notice: "Valeurs calculées à partir de Ciqual 2025 et de correspondances documentées; proxies et réserves sont signalés.",
  medical_notice: "Aucun diagnostic de dosha, complément, cure, prévention ou traitement n'est proposé. Ces recettes ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: reviewedAt,
};

await writeFile(new URL("research/pilot-r526-r550.final.json", root), `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes r526-r550 finalisées, ${eligibleIds.size} éligibles.`);
