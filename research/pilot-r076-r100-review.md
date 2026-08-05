# Relecture du lot r076–r100

## Statut du lot

Le fichier `pilot-r076-r100.draft.json` contient 25 recettes originales de petit-déjeuner au schéma **2.1.0 complet**. Il s'agit d'un lot de rédaction séparé de la source de production : aucune recette n'est publiée et toutes portent `app.planner.eligible: false` ainsi que `app.review.stage: draft`.

Les formulations décrivent des plats et leur préparation, sans attribuer d'effet médical à une recette ou à un ingrédient. L'indice éditorial reste à `0` avec la mention explicite « non évalué » : cette valeur ne qualifie pas la recette et ne doit pas être affichée comme une mesure scientifique.

## Contrôles structurels effectués

- 25 recettes présentes, avec les identifiants consécutifs et uniques `r076` à `r100` ;
- 25 slugs uniques ;
- `meta.nombre_recettes` égal à `recipes.length` ;
- chaque temps total égal à préparation + cuisson + repos ;
- `active_minutes` entier, positif ou nul, et jamais supérieur au temps total ;
- chaque ingrédient possède `id`, quantité et unité normalisées, ainsi que `facultatif` ;
- identifiants d'ingrédients en kebab-case ASCII et unités normalisées limitées au vocabulaire v2.1 ;
- équipements limités à `hob`, `oven`, `blender`, `toaster` et `steamer` ;
- allergènes du planificateur strictement égaux à l'union dédupliquée des allergènes des ingrédients ;
- provenance originale présente pour chaque recette, avec repère nutritionnel et origine clairement éditoriale du coût ;
- nutrition et coût explicitement marqués comme estimés ;
- validation réussie avec `scripts/validate-catalogue.mjs` sur ce fichier isolé.

## Limites transversales avant publication

- **Essais culinaires** : les 25 recettes doivent être réalisées au moins une fois. Mesurer le poids final, le nombre réel de portions, la tenue, la texture et les temps actifs.
- **Nutrition** : les chiffres sont des ordres de grandeur issus d'ingrédients génériques. Les relier à des codes Ciqual précis, tenir compte des marques et recalculer le rendement après cuisson.
- **Coût** : le coût par portion est une estimation interne non sourcée par enseigne, date ou zone géographique. Il faut produire une grille de prix versionnée avant validation.
- **Allergènes** : les 14 familles réglementaires sont codées lorsque présentes dans la formulation. Les mentions « peut contenir », les contaminations croisées et les substitutions nécessitent toujours une lecture d'étiquette.
- **Régimes** : une mention « sans gluten » suppose l'emploi de produits explicitement certifiés lorsque le risque de contamination existe.
- **Hygiène** : les durées de conservation sont prudentes mais restent à confronter au protocole réel, au refroidissement et aux produits utilisés.
- **Planificateur** : ne passer aucune recette à `eligible: true` avant validation culinaire, nutritionnelle, allergénique et tarifaire.

## Points de relecture par recette

| ID | Point culinaire et portions | Allergènes / sécurité | Nutrition et coût à confirmer |
|---|---|---|---|
| r076 | Vérifier que 240 g de petits pois donnent assez d'écrasé pour quatre tartines. | Gluten du pain ; certification requise pour la substitution. | Sodium très dépendant du pain au levain. |
| r077 | Tester la tenue de huit petits pancakes et l'humidité liée à deux bananes. | Œuf, soja et noix. | Portion énergétique généreuse ; chiffrer farine de quinoa et noix. |
| r078 | Confirmer que le seigle reste agréable après ajout du kéfir froid. | Gluten et lait ; maintenir le kéfir au froid. | Sucres variables selon le calibre des prunes et composition du kéfir. |
| r079 | Vérifier la simultanéité polenta, légumes et œufs ainsi que la texture au service. | Œuf ; certification de la polenta si nécessaire. | Huile absorbée et durée réelle de cuisson de la polenta à mesurer. |
| r080 | Tester la souplesse de la socca et le roulage sans rupture. | Pas d'allergène majeur formulé ; contrôler la farine certifiée. | Quantifier l'huile réellement retenue et le poids de la courgette cuite. |
| r081 | Confirmer le volume de 60 g d'amarante soufflée pour deux bols. | Soja et sésame. | Prix et disponibilité de l'amarante soufflée à documenter. |
| r082 | Tester le séchage du sarrasin rincé avant torréfaction et son croquant final. | Noix et soja. | Rendement après torréfaction et coût saisonnier du raisin. |
| r083 | Vérifier le rendement de huit muffins et la cuisson complète du centre. | Œuf. | Taille des œufs et poids du brocoli après vapeur à mesurer. |
| r084 | Confirmer l'équilibre pomme-sauge et le maintien de la tartine. | Gluten et noix. | Sodium du pain et des haricots en conserve à recalculer. |
| r085 | Tester la prise avec l'avoine mixée et des mûres surgelées. | Gluten, œuf et fruits à coque. | Boisson d'amande et absorption après cuisson à référencer. |
| r086 | Vérifier le temps de pochage du coing selon maturité et calibre. | Soja et amandes. | Poids comestible du coing et coût saisonnier à mesurer. |
| r087 | Valider le temps de cuisson de la truite selon l'épaisseur et contrôler les arêtes. | Gluten, poisson et lait. | Coût du poisson frais et sodium du pain à sourcer. |
| r088 | Tester l'égouttage du tofu et le degré de coloration sans dessécher le brouillé. | Soja. | Eau perdue par les carottes et tofu de référence à préciser. |
| r089 | Vérifier l'acidité sans sucre ajouté et la cuisson conjointe fruits-avoine. | Lait, gluten et amandes. | Prix très saisonnier de la rhubarbe, des fraises et des amandes. |
| r090 | Tester le retournement d'une omelette de 24 cm et sa tenue sans liant. | Aucun allergène majeur formulé ; vérifier la farine en cas de régime strict. | Quantifier l'huile absorbée et le poids des blettes après cuisson. |
| r091 | Confirmer la tenue après 10 minutes et le dosage très léger du thym. | Gluten, soja et amandes. | Poids comestible des pêches et boisson de soja à référencer. |
| r092 | Vérifier l'onctuosité du quinoa et maintenir le grué à une dose peu amère. | Gluten de la boisson d'avoine et noisettes. | Coût du grué et des noisettes ; absorption réelle du liquide. |
| r093 | Contrôler l'épaisseur des tranches de courge et la quantité de crème par tartine. | Gluten. | Sodium du pain et des haricots, huile retenue après rôtissage. |
| r094 | Tester l'acidité du citron et la texture après repos. | Fruits à coque via la boisson d'amande. | Marque de boisson végétale et coût du chanvre à documenter. |
| r095 | Définir le degré de cuisson des œufs ; cuisson complète pour les publics fragiles. | Œuf. | Calibre des œufs et eau résiduelle des épinards à mesurer. |
| r096 | Confirmer la cuisson du freekeh concassé et l'équilibre avec les dattes. | Gluten et pistaches. | Portion de fruits séchés concentrée ; coût des pistaches à vérifier. |
| r097 | Tester la tenue des pancakes avec 120 g de betterave et la matière grasse réelle. | Œuf et lait ; certification du sarrasin si nécessaire. | Poids et prix des framboises, matière grasse de cuisson non mesurée. |
| r098 | Contrôler l'hydratation complète du chia et la densité de la portion. | Soja. | Poids comestible et prix de la papaye, composition de la boisson de soja. |
| r099 | Délayer le miso hors du feu et goûter avant tout ajout de sel. | Gluten, soja et sésame. | Sodium très dépendant du miso ; coût et marque à documenter. |
| r100 | Utiliser un kaki très mûr et vérifier que la portion de coulis n'est pas excessive. | Lait et noix. | Sucres naturels variables selon le kaki ; type de yaourt à préciser. |

## Passage de brouillon à recette validée

Pour chaque recette, consigner un essai daté, corriger les quantités et temps observés, relier tous les ingrédients à une référence nutritionnelle, recalculer le coût sur une grille tarifaire documentée, puis effectuer une deuxième relecture des allergènes. La validation éditoriale peut ensuite renseigner `reviewed_at`, remplacer `stage: draft` et décider séparément de l'éligibilité au générateur.
