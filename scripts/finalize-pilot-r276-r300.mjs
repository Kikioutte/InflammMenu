import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(await readFile(new URL("research/pilot-r276-r300.nutrition.json", root), "utf8"));

const editorial = {
  r276: { score: 8.8, profile: "Courge spaghetti, pois chiches, roquette, tournesol et huile d'olive", caution: "Ne pas trop cuire la courge. Réserve de calcul : une courge moyenne est estimée à 1 kg de chair comestible; le rendement réel doit être pesé." },
  r277: { score: 8.8, profile: "Chou frisé, pomme, haricots blancs, tournesol et huile d'olive", caution: "Rincer les haricots et ne pas augmenter la très petite dose de muscade. Sodium estimé à 388 mg par portion, variable selon les conserves." },
  r278: { score: 8.6, profile: "Quinoa rouge, artichaut, fraise, roquette et huile d'olive", caution: "Vérifier la tendreté des artichauts. Réserve de calcul : quinoa rouge représenté par du quinoa cuit générique, fonds d'artichaut estimés à 50 g par pièce et marjolaine fraîche convertie en équivalent sec." },
  r279: { score: 8.7, profile: "Haricots blancs, fenouil, tomate, carotte et chapelure complète", caution: "Contient gluten. Réserve de calcul : haricots tarbais représentés par haricots blancs cuits, tomate concassée par tomate appertisée au jus et chapelure complète par chapelure générique." },
  r280: { score: 8.8, profile: "Pois bambara, patate douce violette, gombo, tomate et coriandre", caution: "Cuire les pois jusqu'à complète tendreté. Réserve de calcul : pois bambara représenté par haricot rouge sec, variété violette par patate douce générique et tomate concassée par tomate appertisée." },
  r281: { score: 8.2, profile: "Azuki, potimarron, poireau, miso et sésame", caution: "Contient soja et sésame. Sodium estimé à 422 mg par portion; ne pas ajouter de sel. Réserve de calcul : azuki représenté par haricot rouge cuit et miso rouge par miso générique, dont le sodium varie selon la marque." },
  r282: { score: 8.6, profile: "Pois cassés, blettes, tomate, cumin et persil", caution: "Rincer le citron confit et goûter avant de saler. Réserve de calcul : conversion crue-cuite de la blette estimée, sodium du citron confit non représenté et tomate concassée approchée par tomate appertisée." },
  r283: { score: 8.2, profile: "Lentilles blondes, poireaux, champignons, carotte et estragon", caution: "Contient gluten via la crème d'avoine formulée. Réserve de calcul : crème d'avoine approchée par une crème végétale Ciqual à base de soja, fibres fixées à 0, et plusieurs nutriments de l'estragon estimés faute de données complètes." },
  r284: { score: 8.7, profile: "Haricots géants, épinards, tomate, aneth et huile d'olive", caution: "Contient gluten. Réserve de calcul : haricots géants représentés par une légumineuse cuite proche, tomate concassée par tomate appertisée et chapelure complète par chapelure générique." },
  r285: { score: 8.7, profile: "Doliques, aubergine, feuilles de moutarde, tomate et coriandre", caution: "Contient moutarde; éviter les contaminations croisées. Réserve de calcul : doliques représentés par un légume sec cuit moyen, feuilles de moutarde par chou kale et tomate concassée par tomate appertisée." },
  r286: { score: 8.2, profile: "Lupin, artichaut, tomate séchée, fenouil et olives", caution: "Contient lupin, avec réaction croisée possible chez certaines personnes allergiques à l'arachide. Rincer lupin et olives. Réserve de calcul : lupin cuit converti depuis le sec avec facteur 0,38 et énergie de tomate séchée estimée par Atwater." },
  r287: { score: 8.8, profile: "Fèves, petits pois, laitue, pomme de terre et menthe", caution: "Cuire brièvement la laitue et refroidir rapidement les restes. Réserve de calcul : les petits pois frais ou surgelés sont représentés par la référence surgelée crue." },
  r288: { score: 8.8, profile: "Lentilles beluga, céleri-rave, champignons, cacao et carotte", caution: "Contient céleri. Respecter la petite dose de cacao. Réserve de calcul : les lentilles beluga sont représentées par des lentilles vertes sèches." },
  r289: { score: 8.2, profile: "Pois chiches, raisin, fenouil, tomate, amandes et huile d'olive", caution: "Contient fruits à coque. Respecter la faible dose de safran. Réserve de calcul : tomate concassée sans sel représentée par tomate appertisée au jus." },
  r290: { score: 8.6, profile: "Haricots rouges, maïs, courge, tomate et coriandre", caution: "Rincer les conserves et ne pas saler avant dégustation. Réserve de calcul : maïs cuit représenté par maïs appertisé égoutté et tomate concassée par tomate appertisée; sodium variable selon les produits." },
  r291: { score: 8.8, profile: "Pois jaunes, tomate rôtie, fenouil, épinards et persil", caution: "Remuer en fin de cuisson car les pois épaississent rapidement. Réserve de calcul : les pois jaunes sont représentés par des pois cassés secs." },
  r292: { score: 8.8, profile: "Haricots mungo, chou pointu, carotte, gingembre et coriandre", caution: "Retirer toutes les tiges de citronnelle avant le service. Réserve de calcul : sucres du mungo fixés à 0 faute de donnée, chou pointu représenté par chou vert et citronnelle retirée représentée par un proxy aqueux." },
  r293: { score: 8.7, profile: "Lentilles vertes, coing, panais, carotte et huile d'olive", caution: "Le coing est très ferme; stabiliser la planche. Réserve de calcul : sucres du romarin USDA fixés à 0 et énergie du vinaigre de cidre complétée par la valeur du vinaigre générique Ciqual." },
  r294: { score: 8.5, profile: "Pois chiches, artichaut, poireau, citron et aneth", caution: "Contient céleri via le bouillon. Vérifier l'étiquette et le sodium. Réserve de calcul : le bouillon peu salé est approché par un quart du profil du bouillon standard Ciqual." },
  r295: { score: 8.5, profile: "Tempeh, prune, chou rouge, sarrasin et sésame", caution: "Contient soja et sésame. Réduire le coulis de prune sans le brûler et maintenir le tempeh au froid avant cuisson." },
  r296: { score: 8.1, profile: "Tofu, sarrasin, poireaux, oseille et crème de soja", caution: "Contient soja. Ajouter le citron progressivement. Réserve de calcul : sarrasin concassé représenté par farine du même grain et fibres de la crème de soja fixées à 0 faute de donnée." },
  r297: { score: 8.5, profile: "Tempeh, aubergine, basilic thaï, poivron et riz complet", caution: "Contient soja. Cuire entièrement l'aubergine. Réserve de calcul : basilic thaï représenté par basilic frais générique." },
  r298: { score: 8.2, profile: "Tofu soyeux, shiitaké, pak-choï, riz rouge et sésame", caution: "Contient soja et sésame. Cuire complètement les shiitakés. Réserve de calcul : rendement vapeur des shiitakés estimé à 80 % et riz rouge représenté par riz complet cru." },
  r299: { score: 8.2, profile: "Tempeh, fenouil, orange, olives et orge", caution: "Contient soja et gluten. Rincer les olives et ne pas ajouter de sel; sodium estimé à 326 mg par portion, variable selon la saumure." },
  r300: { score: 8.8, profile: "Tofu, pois cassés, poireaux, persil et huile d'olive", caution: "Contient soja. Rechercher une coloration brune des poireaux, jamais une carbonisation noire, et cuire les pois jusqu'à tendreté complète." },
};

catalogue.meta = {
  ...catalogue.meta,
  status: "editorial-validated",
  nutrition_notice: "Valeurs calculées principalement avec Ciqual 2025. Les quelques données USDA déjà validées, proxies de variété ou de transformation et valeurs techniques restent signalés recette par recette.",
  medical_notice: "Ces recettes s'inscrivent dans un modèle alimentaire varié. Elles ne revendiquent aucun effet thérapeutique et ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: "2026-08-05",
};

for (const recipe of catalogue.recipes) {
  const review = editorial[recipe.id];
  if (!review) throw new Error(`${recipe.id}: relecture éditoriale absente`);
  if (recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions" && !/Réserve de calcul/i.test(review.caution)) {
    throw new Error(`${recipe.id}: réserve nutritionnelle non rendue visible`);
  }
  recipe.score_anti_inflammatoire = review.score;
  recipe.score_note = `${review.profile} composent un repas riche en végétaux et cohérent avec un modèle méditerranéen global. Cet indice éditorial décrit le profil alimentaire global; il ne mesure aucun effet médical de la recette ou d'un ingrédient.`;
  recipe.app.review = {
    status: "caution",
    stage: "editorial-validated",
    summary: "Cohérence éditoriale validée comme repas complet; recette non testée physiquement.",
    caution: review.caution,
  };
  recipe.app.planner.eligible = true;
  recipe.provenance.reviewed_at = "2026-08-05";
}

await writeFile(new URL("research/pilot-r276-r300.final.json", root), `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes finalisées dans research/pilot-r276-r300.final.json.`);
