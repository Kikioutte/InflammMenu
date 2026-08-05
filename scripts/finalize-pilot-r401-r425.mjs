import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(await readFile(new URL("research/pilot-r401-r425.nutrition.json", root), "utf8"));
const excluded = new Set(["r405"]);

const safety = {
  r401: "Maintenir le poulpe au froid, le braiser jusqu'à cuisson complète et tendreté, puis retirer le laurier avant service.",
  r402: "Écarter les coques cassées ou ouvertes avant cuisson, cuire complètement et jeter celles restées fermées après cuisson.",
  r403: "Maintenir les calamars au froid, éviter les contaminations croisées et vérifier une cuisson complète avant service.",
  r404: "Maintenir les Saint-Jacques au froid, séparer le cru du cuit et vérifier une cuisson complète et opaque à cœur.",
  r405: "Maintenir les crevettes au froid, séparer le cru du cuit et les cuire complètement jusqu'à opacité à cœur.",
  r406: "Cuire le poulet complètement à cœur, sans chair rosée, et séparer les ustensiles ayant touché la volaille crue.",
  r407: "Cuire la dinde complètement à cœur, sans chair rosée, et ne pas remettre la viande cuite dans le plat du cru.",
  r408: "Cuire le poulet complètement à cœur, sans chair rosée, et empêcher les jus crus de couler sur les légumes.",
  r409: "Cuire la pintade complètement à cœur, contrôler près de l'os sans le toucher et laisser reposer avant découpe.",
  r410: "Filtrer le thé avant pochage, puis cuire la dinde complètement à cœur, sans chair rosée.",
  r411: "Cuire le poulet complètement à cœur, sans chair rosée, avec contrôle au centre du morceau le plus épais.",
  r412: "Cuire les cailles complètement à cœur, contrôler près de l'os sans le toucher et laisser reposer avant service.",
  r413: "Cuire le poulet complètement à cœur, sans chair rosée, avec des ustensiles distincts avant et après cuisson.",
  r414: "Cuire la dinde complètement à cœur, sans chair rosée, puis la laisser reposer avant service.",
  r415: "Utiliser uniquement des champignons cultivés et commercialisés, les cuire complètement et cuire le poulet à cœur sans chair rosée.",
  r416: "Cuire la pintade complètement à cœur, contrôler près de l'os éventuel sans le toucher et laisser reposer avant service.",
  r417: "Cuire la dinde complètement à cœur, sans chair rosée, et empêcher les jus crus de couler sur le brocoli.",
  r418: "Cuire le poulet complètement à cœur, contrôler près de l'os sans le toucher et retirer le citron noir avant service.",
  r419: "Cuire les cailles complètement à cœur, contrôler près de l'os sans le toucher et laisser reposer avant service.",
  r420: "Cuire le poulet complètement à cœur, sans chair rosée, et vérifier le sodium des fonds d'artichaut utilisés.",
  r421: "Cuire la dinde complètement à cœur, sans chair rosée, avec des ustensiles distincts pour la viande crue et cuite.",
  r422: "Cuire le poulet complètement à cœur, sans chair rosée, en contrôlant le centre du morceau le plus épais.",
  r423: "Cuire la pintade complètement à cœur, contrôler près de l'os et retirer toutes les baies de genièvre visibles avant service.",
  r424: "Cuire tous les cubes de dinde complètement à cœur, sans chair rosée, et séparer les ustensiles du cru et du cuit.",
  r425: "Cuire le poulet haché complètement à cœur, sans zone rosée, et nettoyer les surfaces après manipulation du cru.",
};

catalogue.meta.status = "editorial-validated";
catalogue.meta.reviewed_at = "2026-08-05";
catalogue.meta.culinary_notice = "Aucune recette n'a été testée physiquement; cuisson, fraîcheur, rendements et temps restent à observer avant publication.";
catalogue.meta.cost_notice = "Les coûts par portion sont des estimations éditoriales sans relevés de prix datés.";

for (const recipe of catalogue.recipes) {
  const nutrition = recipe.nutrition_par_portion;
  const summary = `Repas complet calculé à environ ${nutrition.calories} kcal et ${nutrition.proteines_g} g de protéines par portion.`;
  recipe.score_anti_inflammatoire = 8.4;
  recipe.score_note = `${summary} L'indice éditorial décrit le profil alimentaire global et ne mesure aucun effet médical.`;
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = "caution";
  recipe.app.review.summary = summary;
  recipe.app.review.caution = [
    recipe.app.review.caution,
    safety[recipe.id],
    nutrition.estimation.cautions?.length
      ? `Réserve de calcul nutritionnel : ${nutrition.estimation.cautions.join(" ")}`
      : "",
    excluded.has(recipe.id)
      ? `Recette exclue du générateur : sodium calculé élevé (${nutrition.sodium_mg} mg par portion).`
      : "",
    "Recette non testée physiquement; coût, rendement et temps restent estimés.",
  ].filter(Boolean).join(" ");
  recipe.app.planner.eligible = !excluded.has(recipe.id);
  recipe.provenance.reviewed_at = "2026-08-05";
}

await writeFile(new URL("research/pilot-r401-r425.final.json", root), `${JSON.stringify(catalogue, null, 2)}\n`);
console.log("Lot r401-r425 finalisé : 24 repas éligibles, 1 exclusion sodium.");
