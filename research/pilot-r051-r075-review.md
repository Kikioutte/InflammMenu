# Relecture du pilote r051–r075

## Statut

Ce lot contient 25 brouillons complets conformes au socle du catalogue v2 et enrichis de propositions v2.1 non encore intégrées au code :

- `meta.schema_version: 2.1.0-draft` avec référence explicite au schéma `2.0.0` ;
- `app.review.stage: draft`, tout en conservant `status: caution` compris par le modèle v2 actuel ;
- `nutrition_par_portion.estimation` avec statut, méthode et provenance ;
- `score_note` pour signaler que l'indice éditorial n'a pas encore été attribué.

Toutes les recettes ont `app.planner.eligible: false`. Aucune ne doit entrer dans la génération de menus avant test culinaire, recalcul nutritionnel, vérification des allergènes, contrôle du coût et validation éditoriale.

## Incertitudes transversales

- **Nutrition** : les valeurs sont des ordres de grandeur calculés à partir d'ingrédients génériques. Elles ne proviennent pas d'un calcul Ciqual automatisé et ne tiennent pas toujours compte du rendement, de l'absorption d'huile ou des pertes de cuisson.
- **Allergènes** : la liste couvre les allergènes évidents de la formulation. Une validation finale doit vérifier chaque référence commerciale, les mentions « peut contenir » et les contaminations croisées.
- **Coûts** : les estimations sont indicatives, sans date, enseigne, zone géographique ni prix source. Elles doivent être recalculées avec une grille tarifaire versionnée.
- **Portions** : 2 à 4 portions ont été utilisées. Le poids final par portion doit être mesuré lors des essais.
- **Score éditorial** : `score_anti_inflammatoire` vaut provisoirement `0` pour rester compatible avec le type v2. Cela signifie « non évalué », pas « mauvais profil » ; la v2.1 devrait permettre `null` ou un état séparé.
- **Matériel** : le vocabulaire v2 ne prévoit que `oven`, `hob` et `blender`. `r066` nécessite un gaufrier mais conserve provisoirement `hob` comme catégorie de cuisson ; ajouter `waffle-maker` au schéma avant validation.

## Points à vérifier par recette

| ID | Nutrition / portions | Allergènes | Coût / protocole |
|---|---|---|---|
| r051 | Poids réel des poires et absorption de la boisson | Gluten selon avoine/boisson, noisettes | Tester la tenue après 5 min et chiffrer les noisettes |
| r052 | Rendement du quinoa et marque de boisson soja | Soja, sésame | Prix saisonnier des abricots ; vérifier l'onctuosité |
| r053 | Calibre des kiwis et composition du yaourt | Soja ; sensibilité individuelle au kiwi à rappeler sans l'ajouter à la taxonomie UE | Prix du kiwi ; tester millet froid |
| r054 | Sodium du pain et des haricots en conserve | Gluten | Chiffrer pain artisanal vs industriel ; tester l'écrasé |
| r055 | Absorption d'huile et rendement de quatre crêpes | Contamination croisée possible de la farine | Vérifier diamètre, tenue et quantité d'eau |
| r056 | Rendement de l'amarante et boisson utilisée | Fruits à coque | Cerises et amandes très saisonnières ; tester 28 min |
| r057 | Effet du rinçage/trempage sur les valeurs | Soja, sésame | Valider hygiène, texture et durée réelle de trempage |
| r058 | Taille des œufs et huile absorbée | Œufs, gluten | Contrôler cuisson mollet et prévoir consigne publics fragiles |
| r059 | Poids comestible de la mangue | Soja | Chia/chanvre coûteux ; tester densité et hydratation |
| r060 | Rendement et cuisson de l'orge mondé | Gluten, noix | 45 min à confirmer selon origine de l'orge |
| r061 | Matière grasse de cuisson non comptée | Œufs, lait ; certification teff | Mûres fraîches coûteuses ; tester la tenue des crêpes |
| r062 | Sodium du tofu et surtout des olives | Soja | Rincer/peser les olives ; confirmer évaporation de la tomate |
| r063 | Référence du pain et matière grasse de la ricotta | Gluten, lait, noix | Sodium et coût de la ricotta à documenter |
| r064 | Poids comestible de l'orange | Aucun allergène majeur explicite | Dosage du gingembre à tester ; prix du quinoa |
| r065 | Humidité et rendement après cuisson | Soja, sésame | La tenue des carrés après refroidissement est incertaine |
| r066 | Huile absorbée et nombre de gaufres | Contamination croisée possible | Ajouter le gaufrier au vocabulaire matériel ; tester chaque appareil |
| r067 | Rendement du riz complet et boisson soja | Soja, pistaches | Safran très variable en coût ; protocole de refroidissement à confirmer |
| r068 | Références lait/yaourt et poids des fruits | Gluten, lait | Conservation limitée ; tester la carotte après 4 h |
| r069 | Matière grasse de cuisson non comptée | Œufs, noix ; certification sarrasin | Tester la tenue sans liant supplémentaire |
| r070 | Calibre des patates et composition du yaourt | Lait | Temps de four très dépendant de la taille ; grenade saisonnière |
| r071 | Poids comestible des agrumes | Pistaches | Interaction pamplemousse-médicaments à garder très visible ; repas possiblement incomplet seul |
| r072 | Boisson d'avoine et poids des cerises | Gluten selon boisson, noisettes | Chia/noisettes coûteux ; tester la texture après 4 h |
| r073 | Hydratation de la farine et sodium des conserves | Certification maïs nécessaire pour garantie sans gluten | Deux arepas peuvent former une grosse portion ; tester poids final |
| r074 | Eau perdue par les champignons et huile absorbée | Gluten selon avoine | Confirmer l'assaisonnement sans excès de sel |
| r075 | Type de yaourt et calibre des nectarines | Lait, amandes | Prix très saisonnier ; confirmer que le basilic reste discret |

## Contrôles avant intégration

1. Réaliser chaque recette au moins une fois et consigner poids final, rendement, texture et durée réelle.
2. Recalculer les nutriments à partir d'ingrédients reliés à une table de composition identifiée et versionnée.
3. Recalculer les coûts avec une date, une zone et une source de prix.
4. Faire relire les allergènes ingrédient par ingrédient, y compris les substitutions.
5. Remplacer `stage: draft` par un état validé, attribuer éventuellement un indice éditorial documenté, puis seulement passer `planner.eligible` à `true`.
