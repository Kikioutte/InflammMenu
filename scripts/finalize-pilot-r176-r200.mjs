import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(await readFile(new URL("research/pilot-r176-r200.nutrition.json", root), "utf8"));

const editorial = {
  r176: { score: 8.5, profile: "Haricots blancs, paprika, origan et huile d'olive", caution: "Portion de collation estimée à 101 kcal; ce snack ne remplace pas un repas complet. Sodium variable selon les haricots en conserve; les rincer soigneusement." },
  r177: { score: 7.7, profile: "Avoine complète, abricots secs, pistaches et lin", caution: "Contient gluten et fruits à coque. Les fruits secs concentrent les sucres; respecter la portion de collation et ne pas ajouter de sucrant. Ce snack ne remplace pas un repas complet." },
  r178: { score: 8.8, profile: "Chou kale, graines de courge, paprika et huile d'olive", caution: "Le temps de séchage dépend fortement du four; éviter le brunissement. Portion de collation estimée à 87 kcal, insuffisante comme repas complet." },
  r179: { score: 8.0, profile: "Galettes de riz complet, avocat, radis et aneth", caution: "Vérifier la certification des galettes si le sans gluten est requis et assembler au dernier moment. Cette collation reste trop légère pour remplacer un repas complet." },
  r180: { score: 8.0, profile: "Poire, noix, avoine complète et cacao non sucré", caution: "Contient gluten et fruits à coque. Ce snack ne remplace pas un repas complet. Réserve de calcul : le grué de cacao est représenté par du cacao en poudre, ce qui peut sous-estimer ses lipides." },
  r181: { score: 8.6, profile: "Lentilles vertes, noix, sauge et huile d'olive", caution: "Contient fruits à coque. Respecter la chaîne du froid après cuisson des lentilles. La portion indiquée est une portion de tartinade, pas un repas complet." },
  r182: { score: 8.5, profile: "Pois chiches, fenouil, cumin, persil et huile d'olive", caution: "Vérifier la certification de la farine si le sans gluten est requis. Les bâtonnets constituent une collation et ne remplacent pas un repas complet." },
  r183: { score: 8.5, profile: "Fèves, sésame, zaatar, citron et huile d'olive", caution: "Contient sésame. Vérifier que le zaatar est sans sel ajouté. Ce snack ne remplace pas un repas complet. Réserve de calcul : le zaatar est représenté par le sésame, sans modélisation séparée des herbes et du sumac." },
  r184: { score: 8.0, profile: "Yaourt, betterave, aneth et noix", caution: "Contient lait et fruits à coque. Maintenir le dip au froid; la portion est une portion de tartinade et non un repas complet." },
  r185: { score: 8.2, profile: "Avoine complète, tournesol, tomate séchée et huile d'olive", caution: "Contient gluten et sulfites selon le produit déclaré. Ce snack ne remplace pas un repas complet. Réserve de calcul : l'énergie de la tomate séchée a été estimée par facteurs d'Atwater à partir de ses macronutriments Ciqual." },
  r186: { score: 8.2, profile: "Prunes, chia, amandes, citron et cannelle", caution: "Contient fruits à coque. Respecter le repos au froid et une hydratation suffisante; il s'agit d'une collation. Réserve de calcul : les sucres du chia USDA restent techniquement fixés à 0 faute de donnée." },
  r187: { score: 8.3, profile: "Poire, hibiscus, pistaches, orange et cannelle", caution: "Contient fruits à coque. Ce dessert ne remplace pas un repas complet. Réserve de calcul : l'infusion d'hibiscus est représentée par un proxy aqueux et le bâton de cannelle par la composition de cannelle moulue." },
  r188: { score: 8.0, profile: "Pêche, amandes, thym, citron et yaourt", caution: "Contient lait et fruits à coque. Adapter la cuisson à la maturité des fruits; ce dessert reste hors du planificateur de repas." },
  r189: { score: 7.7, profile: "Polenta, orange, amandes, œufs et huile d'olive", caution: "Contient œuf et fruits à coque. Cuire jusqu'à prise complète. Ce dessert ne remplace pas un repas. Réserve de calcul : les graisses saturées manquantes de la polenta ont été approchées par la farine de maïs du même jeu Ciqual." },
  r190: { score: 8.3, profile: "Riz complet, boisson d'amande, mûres, cardamome et pistaches", caution: "Contient fruits à coque. Refroidir rapidement après cuisson et conserver au froid. Ce dessert ne remplace pas un repas. Réserve de calcul : les sucres de la cardamome USDA restent fixés à 0 faute de donnée." },
  r191: { score: 7.8, profile: "Yaourt, raisin, noix, romarin et citron", caution: "Contient lait et fruits à coque. Les sucres proviennent principalement du raisin; aucun sucre ajouté n'est prévu. Ce dessert reste hors du planificateur. Réserve de calcul : les sucres du romarin USDA restent fixés à 0 faute de donnée." },
  r192: { score: 8.5, profile: "Tofu soyeux, cacao non sucré, framboises et noisettes", caution: "Contient soja et fruits à coque. Maintenir la crème au froid; cette portion de dessert ne remplace pas un repas complet." },
  r193: { score: 7.8, profile: "Figues, noix, orange, cannelle et yaourt", caution: "Contient lait et fruits à coque. Les sucres proviennent principalement des fruits; aucun sucre ajouté n'est prévu. Ce dessert reste hors du planificateur." },
  r194: { score: 7.0, profile: "Quinoa, mangue, coco léger, citron vert et sésame", caution: "Contient sésame. Graisses saturées estimées à environ 6 g par portion, principalement liées au coco; servir en portion de dessert modérée. Réserve de calcul : le lait de coco léger est approché par une demi-masse équivalente du lait de coco standard Ciqual. Recette hors planificateur de repas." },
  r195: { score: 8.1, profile: "Abricots, avoine complète, pistaches et huile d'olive", caution: "Contient gluten et fruits à coque. Aucun sucre ajouté n'est prévu; ce dessert reste hors du planificateur. Réserve de calcul : les sucres de la cardamome USDA restent fixés à 0 faute de donnée." },
  r196: { score: 7.8, profile: "Carotte, orange, amandes, farine complète et huile d'olive", caution: "Contient gluten, œuf et fruits à coque. Vérifier la levure et cuire le centre complètement. Ce dessert ne remplace pas un repas complet." },
  r197: { score: 7.8, profile: "Poire, sarrasin, œufs, boisson d'amande et muscade", caution: "Contient œuf et fruits à coque. Vérifier le sarrasin si une garantie sans gluten est requise, cuire à cœur et ne pas augmenter la muscade. Dessert hors planificateur de repas." },
  r198: { score: 8.0, profile: "Banane, cacao non sucré, sésame et soja", caution: "Contient soja et sésame. Conserver les fruits congelés et servir immédiatement; les sucres viennent de la banane. Ce dessert ne remplace pas un repas complet." },
  r199: { score: 8.0, profile: "Prunes, farine complète, amandes, romarin et huile d'olive", caution: "Contient gluten et fruits à coque. Ce dessert ne remplace pas un repas. Réserve de calcul : les sucres du romarin USDA restent techniquement fixés à 0 faute de donnée." },
  r200: { score: 8.3, profile: "Millet, coing, soja, amandes et huile d'olive", caution: "Contient soja et fruits à coque. Le coing doit être entièrement attendri et le flan conservé au froid. Ce dessert reste hors du planificateur de repas." },
};

catalogue.meta = {
  ...catalogue.meta,
  status: "editorial-validated",
  nutrition_notice: "Valeurs calculées principalement avec Ciqual 2025. Cardamome, chia et romarin reprennent les données USDA SR Legacy déjà validées; les proxies et valeurs techniques restent signalés recette par recette.",
  medical_notice: "Ces collations et desserts s'inscrivent dans un modèle alimentaire varié. Ils ne revendiquent aucun effet thérapeutique et ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: "2026-08-05",
};

for (const recipe of catalogue.recipes) {
  const review = editorial[recipe.id];
  if (!review) throw new Error(`${recipe.id}: relecture éditoriale absente`);
  const calculationCaution = recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions";
  if (calculationCaution && !/Réserve de calcul/i.test(review.caution)) {
    throw new Error(`${recipe.id}: réserve nutritionnelle non rendue visible`);
  }
  recipe.score_anti_inflammatoire = review.score;
  recipe.score_note = `${review.profile} composent une ${recipe.categorie === "snack" ? "collation" : "portion de dessert"} cohérente avec un modèle méditerranéen global. Cet indice éditorial décrit le profil alimentaire global; il ne mesure aucun effet médical de la recette ou d'un ingrédient.`;
  recipe.app.review = {
    status: "caution",
    stage: "editorial-validated",
    summary: `Cohérence éditoriale validée comme ${recipe.categorie === "snack" ? "collation" : "dessert"}; recette non testée physiquement et hors planificateur de repas.`,
    caution: review.caution,
  };
  recipe.app.planner.eligible = false;
  recipe.provenance.reviewed_at = "2026-08-05";
}

await writeFile(new URL("research/pilot-r176-r200.final.json", root), `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`${catalogue.recipes.length} recettes finalisées dans research/pilot-r176-r200.final.json.`);
