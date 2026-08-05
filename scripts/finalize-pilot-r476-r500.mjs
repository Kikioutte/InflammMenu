import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(
  await readFile(new URL("research/pilot-r476-r500.nutrition.json", root), "utf8"),
);

const extraCautions = {
  r476: "Le fruit absorbe une quantité variable de liquide; le rendement nutritionnel réel dépend du service du sirop.",
  r477: "Laisser échapper la vapeur et respecter les consignes du blender lors du mixage chaud; refroidir rapidement.",
  r478: "Contient lait et fruits à coque; conserver le yaourt au froid jusqu'au service.",
  r479: "Contient œuf et gluten; cuire le centre à cœur puis refroidir rapidement avant réfrigération.",
  r480: "Maintenir la chaîne du froid et ne jamais recongeler un granité décongelé.",
  r481: "Contient lait et fruits à coque; conserver le yaourt au froid et laisser la vapeur s'échapper au mixage.",
  r482: "Le pamplemousse peut interagir avec certains médicaments; vérifier la compatibilité avec un professionnel de santé si un traitement est concerné.",
  r483: "Contient œuf, gluten et fruits à coque; retirer tous les noyaux et cuire le centre à cœur.",
  r484: "Préparation crue : laver soigneusement le cresson, maintenir au froid et consommer sous 24 heures.",
  r485: "Le sodium du citron confit est sous-estimé par le proxy citron cru; contrôler l'étiquette des produits en conserve.",
  r486: "Préparation crue : laver les végétaux, employer des ustensiles propres et respecter la conservation très courte.",
  r487: "Contient fruits à coque; laisser la vapeur s'échapper avant tout mixage chaud.",
  r488: "Le sodium dépend fortement des olives; les rincer et vérifier l'étiquette.",
  r489: "Contient lait; refroidir la betterave avant ajout du yaourt et maintenir la sauce au froid.",
  r490: "Contient fruits à coque; refroidir le brocoli avant l'ajout des herbes et réfrigérer rapidement.",
  r491: "Contient sésame; ajuster le vinaigre selon l'acidité du fruit et conserver au froid.",
  r492: "Contient fruits à coque; réaliser le trempage au réfrigérateur et maintenir la préparation au froid.",
  r493: "Préparation crue : laver les herbes, utiliser un sumac alimentaire sans sel ajouté et maintenir au froid.",
  r494: "Peser précisément le safran et laisser la vapeur s'échapper lors du mixage chaud.",
  r495: "Contient céleri et fruits à coque; préparation crue à maintenir au froid et à consommer sous 24 heures.",
  r496: "Contient soja; le sodium du miso dépend du produit, vérifier l'étiquette et ne pas ajouter de sel avant dégustation.",
  r497: "Le vinaigre peut contenir des sulfites selon le produit; vérifier l'étiquette et maintenir la vinaigrette au froid.",
  r498: "Contient fruits à coque; le sodium des câpres dépend du produit, les rincer et vérifier l'étiquette.",
  r499: "Contient lait; ajouter le raifort progressivement, refroidir avant le yaourt et conserver au froid.",
  r500: "Préparation crue : retirer tous les noyaux, utiliser des fruits intacts et consommer sous 12 heures.",
};

catalogue.meta.status = "editorial-validated";
catalogue.meta.reviewed_at = "2026-08-05";
catalogue.meta.nutrition_notice =
  "Valeurs calculées avec Ciqual 2025 et, lorsque signalé, USDA SR Legacy; proxies, conversions et nutriments manquants restent sous réserve.";
catalogue.meta.culinary_notice =
  "Aucune recette n'a été testée physiquement; rendements, textures, prises, refroidissements et temps restent à observer avant publication.";
catalogue.meta.cost_notice =
  "Les coûts par portion restent des estimations éditoriales sans relevés de prix datés.";

for (const recipe of catalogue.recipes) {
  const nutrition = recipe.nutrition_par_portion;
  const kind = recipe.categorie === "dessert" ? "Dessert" : "Sauce ou condiment";
  const summary = `${kind} calculé à environ ${nutrition.calories} kcal et ${nutrition.proteines_g} g de protéines par portion.`;

  recipe.score_anti_inflammatoire = 8;
  recipe.score_note = `${summary} L'indice éditorial décrit uniquement le profil alimentaire global et ne mesure aucun effet médical.`;
  recipe.app.review.stage = "editorial-validated";
  recipe.app.review.status = "caution";
  recipe.app.review.summary = `${summary} Ne constitue pas seul un repas complet.`;
  recipe.app.review.caution = [
    recipe.app.review.caution,
    nutrition.estimation.cautions?.length
      ? `Réserve de calcul nutritionnel : ${nutrition.estimation.cautions.join(" ")}`
      : "",
    extraCautions[recipe.id],
    "Recette non testée physiquement; coût et rendement restent estimés.",
  ]
    .filter(Boolean)
    .join(" ");
  recipe.app.planner.eligible = false;
  recipe.provenance.reviewed_at = "2026-08-05";
}

await writeFile(
  new URL("research/pilot-r476-r500.final.json", root),
  `${JSON.stringify(catalogue, null, 2)}\n`,
);
console.log("Lot r476-r500 finalisé : 25 desserts/sauces, aucun repas autonome éligible.");
