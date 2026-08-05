import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = JSON.parse(
  await readFile(new URL("research/pilot-r101-r125.nutrition.json", root), "utf8"),
);

const decisions = {
  r101:[8.6,"Lentilles corail, truite et épinards composent un petit-déjeuner salé complet."],
  r102:[7.9,"Teff, amande, œuf et orange forment une portion de petit-déjeuner consistante."],
  r103:[6.5,"Boisson non sucrée et fruitée, mais les solides sont filtrés et ne constituent pas un repas."],
  r104:[6.6,"Infusion non sucrée à base de fruit et d'épices, avec extraction nutritionnelle non mesurée."],
  r105:[6.4,"Boisson filtrée sans sucre ajouté; l'orge utilisée n'est pas entièrement consommée."],
  r106:[7.3,"Kéfir, poire et lin apportent de la variété, mais la boisson seule n'est pas retenue comme repas."],
  r107:[8.1,"Smoothie associant betterave, mûres, avoine complète et soja, conservé hors du planificateur en tant que boisson."],
  r108:[7.4,"Boisson sans sucre ajouté associant amande, cacao et sésame, avec allergènes visibles."],
  r109:[6.4,"Infusion non sucrée dont les ingrédients solides sont filtrés."],
  r110:[7.2,"Lassi à base de yaourt et mangue entière, à consommer comme boisson et non comme repas autonome."],
  r111:[6.5,"Eau aromatisée sans sucre ajouté, filtrée après macération."],
  r112:[6.8,"Boisson chaude d'avoine et chicorée, non retenue comme repas autonome."],
  r113:[6.2,"Thé non sucré avec fruit filtré; présence de caféine et conservation courte."],
  r114:[7.8,"Smoothie de fruits, carotte et soja, gardé hors du planificateur comme boisson."],
  r115:[7.2,"Boisson maison de sarrasin et noisette avec rendement de filtration encore estimé."],
  r116:[6.4,"Infusion filtrée, non sucrée, avec dosage culinaire modéré de sauge."],
  r117:[7.1,"Boisson lactée salée avec concombre et aneth, à maintenir strictement au froid."],
  r118:[8.1,"Smoothie de poire, épinards, chanvre et soja, exclu du menu automatique comme boisson."],
  r119:[6.3,"Infusion de sarrasin grillé dont l'extraction réelle reste à mesurer."],
  r120:[7.5,"Boisson épaisse non filtrée à base de pomme, betterave et céleri, avec sucres naturellement présents."],
  r121:[6.8,"Boisson d'avoine avec dattes et tahini, à servir en petite portion."],
  r122:[7.5,"Kéfir avec fraise et rhubarbe cuite, soumis à une chaîne du froid stricte."],
  r123:[6.4,"Rooibos non sucré avec fruits filtrés et extraction nutritionnelle non mesurée."],
  r124:[8.5,"Velouté de chou-fleur, poire, poireau et noisette suffisamment structuré pour un repas léger."],
  r125:[8.8,"Courge et lentilles corail donnent une soupe riche en végétaux et légumineuses."],
};
const eligible = new Set(["r101", "r102", "r124", "r125"]);

source.meta.status = "editorial-validated";
source.meta.reviewed_at = "2026-08-05";
source.meta.culinary_notice = "Aucune recette n'a été testée physiquement; rendements, textures et temps restent à observer en cuisine avant publication.";
source.meta.cost_notice = "Les coûts par portion restent des estimations éditoriales non reliées à des prix datés.";
source.meta.nutrition_notice = "Valeurs calculées à partir de Ciqual 2025 et, uniquement pour les correspondances déjà validées à identifiant identique, de replis USDA SR Legacy. Les infusions filtrées utilisent des facteurs prudents documentés.";

for (const recipe of source.recipes) {
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
    "Recette non testée physiquement; coût et rendement restent estimés.",
  ].filter(Boolean).join(" ");
  recipe.app.planner.eligible = eligible.has(recipe.id);
  recipe.provenance.reviewed_at = "2026-08-05";
}

await writeFile(
  new URL("research/pilot-r101-r125.final.json", root),
  `${JSON.stringify(source, null, 2)}\n`,
);
console.log(`Lot r101-r125 finalisé : ${source.recipes.length} recettes, ${eligible.size} repas éligibles.`);
