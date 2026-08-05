import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(await readFile(new URL("research/pilot-r151-r175.nutrition.json", root), "utf8"));
const decisions = {
  r151:[7.8,"Courge et tofu soyeux composent un velouté varié, mais la portion reste trop légère pour un repas autonome."],
  r152:[8.8,"Poivrons, lentilles corail et tomate forment une soupe complète riche en légumineuses."],
  r153:[9.0,"Millet, haricots rouges, kale et légumes composent un repas végétal structuré."],
  r154:[8.4,"Pois chiches, épinards et tomate composent un repas, mais le sodium réel du citron confit reste inconnu."],
  r155:[8.8,"Haricots noirs et tomate donnent une soupe complète avec une quantité culinaire de cacao non sucré."],
  r156:[7.5,"Chou rouge et pomme offrent une soupe végétale, mais sans source protéique suffisante pour un repas autonome."],
  r157:[8.7,"Petits pois et graines de tournesol complètent la courgette dans un repas léger mais structuré."],
  r158:[7.8,"Soupe froide riche en végétaux et fruits, trop légère en protéines pour constituer seule un repas."],
  r159:[8.0,"Melon, concombre et chanvre forment une soupe froide variée, mais encore légère comme repas complet."],
  r160:[7.7,"Quinoa, tomates et courgette enrichissent le bouillon, dont la portion reste trop légère pour un repas autonome."],
  r161:[8.6,"Sarrasin, champignons et poireau constituent une soupe de céréale complète adaptée à un repas léger."],
  r162:[8.7,"Haricots blancs, fenouil et poire structurent un velouté riche en fibres."],
  r163:[8.4,"Brocoli, amande et poireau forment une crème végétale suffisamment structurée pour un repas léger."],
  r164:[8.8,"Pois chiches, aubergine et tomate composent une soupe-repas complète."],
  r165:[8.1,"Courge, poire et graines apportent de la variété, mais la portion reste faible en protéines."],
  r166:[8.7,"Haricots blancs, chou et pomme composent une soupe-repas riche en fibres."],
  r167:[8.7,"Chou-fleur et pois chiches donnent un velouté consistant avec safran en quantité culinaire."],
  r168:[8.6,"Asperges, épinards et graines de courge forment un repas végétal léger et structuré."],
  r169:[8.4,"Lentilles, betterave et yaourt composent une soupe-repas, avec lait et raifort clairement signalés."],
  r170:[8.1,"Courgette et pistache forment un velouté nourrissant mais encore léger en protéines comme repas autonome."],
  r171:[8.6,"Orge, tomate, carotte et céleri composent une soupe de céréale complète."],
  r172:[7.9,"Endive, poire, pomme de terre et noix donnent une soupe consistante mais peu protéinée."],
  r173:[8.0,"Lin et avoine complète composent des crackers à utiliser en accompagnement, pas comme repas."],
  r174:[8.5,"Carotte, pois chiches et tahini forment une tartinade à associer à d'autres aliments."],
  r175:[8.6,"Edamame et sésame composent une collation protéinée, mais pas un repas complet dans cette portion."],
};
const eligible = new Set(["r152","r153","r155","r157","r161","r162","r163","r164","r166","r167","r168","r169","r171"]);

catalogue.meta.status = "editorial-validated";
catalogue.meta.reviewed_at = "2026-08-05";
catalogue.meta.culinary_notice = "Aucune recette n'a été testée physiquement; rendements, textures et temps restent à observer en cuisine avant publication.";
catalogue.meta.cost_notice = "Les coûts par portion restent des estimations éditoriales non reliées à des relevés de prix datés.";
catalogue.meta.nutrition_notice = "Valeurs calculées avec les correspondances Ciqual 2025 contrôlées; approximations et nutriments manquants restent signalés.";

for (const recipe of catalogue.recipes) {
  const [score, decision] = decisions[recipe.id];
  const nutritionCautions = recipe.nutrition_par_portion.estimation.cautions ?? [];
  recipe.score_anti_inflammatoire = score;
  recipe.score_note = `${decision} Cet indice éditorial décrit le profil alimentaire global et ne mesure aucun effet médical.`;
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = "caution";
  recipe.app.review.summary = decision;
  recipe.app.review.caution = [
    recipe.app.review.caution,
    ...(nutritionCautions.length ? [`Réserve de calcul nutritionnel : ${nutritionCautions.join(" ")}`] : []),
    recipe.id === "r154" ? "Le sodium du citron confit au sel est probablement sous-estimé; recette exclue du planificateur jusqu'au recalcul avec un produit réel." : "",
    recipe.id === "r158" || recipe.id === "r159" ? "Soupe crue ou froide : hygiène stricte et chaîne du froid continue." : "",
    recipe.id === "r167" ? "Peser les 0,2 g de safran; usage culinaire uniquement." : "",
    recipe.id === "r169" ? "Maintenir le yaourt au froid et doser progressivement le raifort frais." : "",
    recipe.id === "r175" ? "La composition de l'edamame utilise un équivalent de soja sec; recalcul produit requis." : "",
    "Recette non testée physiquement; coût et rendement restent estimés.",
  ].filter(Boolean).join(" ");
  recipe.app.planner.eligible = eligible.has(recipe.id);
  recipe.provenance.reviewed_at = "2026-08-05";
}

await writeFile(new URL("research/pilot-r151-r175.final.json", root), `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`Lot r151-r175 finalisé : ${catalogue.recipes.length} recettes, ${eligible.size} repas éligibles.`);
