import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = JSON.parse(await readFile(new URL("research/pilot-r076-r100.nutrition.json", root), "utf8"));

const editorial = {
  r076: { score: 8.6, profile: "Pain complet, petits pois, radis, menthe et huile d'olive", caution: "Contient gluten. Réserves de calcul : le pain au levain complet est représenté par un pain complet Ciqual et les petits pois par la référence surgelée crue." },
  r077: { score: 8.0, profile: "Quinoa, banane, noix et soja", caution: "Contient œuf, soja et fruits à coque. Cuire les pancakes à cœur. Réserve de calcul : la farine est représentée par le quinoa cru et ses sucres ont été estimés à partir du quinoa cuit Ciqual." },
  r078: { score: 8.0, profile: "Seigle complet, prunes, kéfir et pavot", caution: "Contient gluten et lait. Maintenir le kéfir au froid. Réserve de calcul : les flocons de seigle sont représentés par du seigle complet cru." },
  r079: { score: 8.2, profile: "Polenta, champignons, épinards et œuf", caution: "Contient œuf; le cuire selon les besoins des publics sensibles. Réserve de calcul : la polenta complète sèche est représentée par une farine de maïs Ciqual." },
  r080: { score: 8.8, profile: "Pois chiches, courgette, tomate, basilic et huile d'olive", caution: "Vérifier la certification et les contaminations croisées si une garantie sans gluten est nécessaire." },
  r081: { score: 8.1, profile: "Amarante, figues, soja et sésame", caution: "Contient soja et sésame. Réserve de calcul : l'amarante soufflée est représentée par de l'amarante crue; le soufflage peut modifier sa densité nutritionnelle." },
  r082: { score: 8.4, profile: "Sarrasin, raisin, noix, graines de tournesol et soja", caution: "Contient soja et fruits à coque. Refroidir le sarrasin avant ajout du yaourt de soja." },
  r083: { score: 8.4, profile: "Œufs, brocoli, oignon, aneth et graines de courge", caution: "Contient œuf. Le centre des muffins doit être complètement pris, en particulier pour les publics fragiles." },
  r084: { score: 6.9, profile: "Seigle complet, haricots blancs, pomme, sauge et noix", eligible: false, caution: "Contient gluten et fruits à coque. Sodium estimé à environ 722 mg par portion, principalement lié au pain; conserver la recette hors du planificateur tant qu'une variante moins salée n'est pas validée." },
  r085: { score: 8.0, profile: "Avoine complète, mûres, œufs et amandes", caution: "Contient gluten, œuf et fruits à coque. Cuire jusqu'à prise complète du centre; adapter le temps si les mûres sont surgelées." },
  r086: { score: 8.4, profile: "Millet, coing, soja, amandes et cardamome", caution: "Contient soja et fruits à coque. Le coing cru est très ferme. Réserve de calcul : les sucres de la cardamome USDA restent techniquement fixés à 0 faute de donnée." },
  r087: { score: 8.0, profile: "Pain complet, truite, concombre, yaourt et aneth", caution: "Contient gluten, lait et poisson. Maintenir la truite au froid, retirer les arêtes et cuire jusqu'à chair opaque. Réserve de calcul : l'espèce de truite n'étant pas précisée, une truite d'élevage générique est utilisée." },
  r088: { score: 8.7, profile: "Tofu, carotte, oignon, coriandre et huile d'olive", caution: "Contient soja; vérifier l'étiquette du tofu et le maintenir au froid." },
  r089: { score: 7.9, profile: "Yaourt, rhubarbe, fraises, avoine et amandes", caution: "Contient lait, gluten et fruits à coque. La recette ne contient pas de sucre ajouté; son acidité dépend de la maturité des fruits." },
  r090: { score: 8.7, profile: "Pois chiches, blettes, poireau, persil et huile d'olive", caution: "Vérifier les contaminations croisées si une garantie sans gluten est nécessaire. Réserve de calcul : la blette crue est convertie en poids cuit estimé et représentée par la référence côtes et feuilles cuites." },
  r091: { score: 8.3, profile: "Avoine complète, pêche, soja, amandes et lin", caution: "Contient gluten, soja et fruits à coque. Le thym doit rester en quantité culinaire discrète." },
  r092: { score: 7.8, profile: "Quinoa, poire, avoine, noisettes et cacao non sucré", caution: "Contient gluten et fruits à coque. Réserve de calcul : le grué de cacao est représenté par du cacao en poudre non sucré, ce qui peut sous-estimer les lipides; les valeurs restent approximatives." },
  r093: { score: 7.2, profile: "Pain complet, courge, haricots blancs, sauge et huile d'olive", eligible: false, caution: "Contient gluten. Sodium estimé à environ 681 mg par portion, principalement lié au pain; conserver la recette hors du planificateur tant qu'une variante moins salée n'est pas validée." },
  r094: { score: 8.3, profile: "Maïs, framboises, boisson d'amande et chanvre", caution: "Contient fruits à coque. Réserve de calcul : la polenta complète sèche est représentée par une farine de maïs Ciqual." },
  r095: { score: 8.7, profile: "Épinards, petits pois, œufs, poireau et huile d'olive", caution: "Contient œuf. Pour les publics fragiles, cuire blancs et jaunes complètement. Réserve de calcul : les petits pois sont représentés par la référence surgelée crue." },
  r096: { score: 7.8, profile: "Blé complet, pomme, dattes, pistaches et cardamome", caution: "Contient gluten et fruits à coque. Les sucres proviennent principalement des fruits; ne pas ajouter de sucrant. Réserves de calcul : le freekeh est approximé par du blé dur complet cru et les sucres de la cardamome USDA restent fixés à 0 faute de donnée." },
  r097: { score: 8.0, profile: "Sarrasin, betterave, framboises, œufs et yaourt", caution: "Contient œuf et lait. Utiliser une betterave nature sans vinaigre et cuire les pancakes à cœur." },
  r098: { score: 8.6, profile: "Chia, papaye, soja, citron vert et graines de courge", caution: "Contient soja. Respecter le repos au froid et consommer avec une hydratation suffisante. Réserve de calcul : les sucres du chia USDA restent techniquement fixés à 0 faute de donnée." },
  r099: { score: 8.0, profile: "Avoine complète, courge, miso, sésame et huile d'olive", caution: "Contient gluten, soja et sésame. Sodium estimé à environ 352 mg par portion; ne pas ajouter de sel et vérifier la teneur variable du miso." },
  r100: { score: 7.8, profile: "Yaourt, kaki, noix, lin et cannelle", caution: "Contient lait et fruits à coque. Les sucres estimés proviennent des fruits et du lait; aucun sucre ajouté n'est prévu." },
};

source.meta = {
  ...source.meta,
  status: "editorial-validated",
  nutrition_notice: "Valeurs calculées principalement à partir de Ciqual 2025. La cardamome et le chia reprennent les données USDA SR Legacy 2018 déjà validées dans le lot précédent; les valeurs techniques de sucres manquants restent signalées.",
  medical_notice: "Ces recettes s'inscrivent dans un modèle alimentaire varié. Elles ne revendiquent aucun effet thérapeutique et ne remplacent pas un avis médical.",
  cost_notice: "Les coûts par portion restent des estimations éditoriales sans relevé tarifaire versionné.",
  culinary_notice: "Relecture éditoriale achevée; aucune de ces recettes n'est présentée comme testée physiquement.",
  reviewed_at: "2026-08-05",
};

for (const recipe of source.recipes) {
  const review = editorial[recipe.id];
  if (!review) throw new Error(`${recipe.id}: relecture éditoriale absente`);
  const hasCalculationCaution = recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions";
  if (hasCalculationCaution && !/Réserve/i.test(review.caution)) {
    throw new Error(`${recipe.id}: réserve nutritionnelle non rendue visible`);
  }

  recipe.score_anti_inflammatoire = review.score;
  recipe.score_note = `${review.profile} composent un petit-déjeuner cohérent avec un modèle méditerranéen global. Cet indice éditorial décrit le profil alimentaire global; il ne mesure aucun effet médical de la recette ou d'un ingrédient.`;
  recipe.app.review = {
    status: recipe.id === "r080" ? "validated" : "caution",
    stage: "editorial-validated",
    summary: review.eligible === false
      ? "Profil éditorial cohérent, mais la recette reste hors du planificateur; aucune validation par essai physique n'est revendiquée."
      : "Cohérence éditoriale validée comme véritable petit-déjeuner; recette non testée physiquement.",
    caution: review.caution,
  };
  recipe.app.planner.eligible = review.eligible !== false;
  recipe.provenance.reviewed_at = "2026-08-05";
}

await writeFile(new URL("research/pilot-r076-r100.final.json", root), `${JSON.stringify(source, null, 2)}\n`);
console.log(`${source.recipes.length} recettes finalisées dans research/pilot-r076-r100.final.json.`);
