# Relecture du lot r101–r125

## Statut du lot

Le fichier `pilot-r101-r125.draft.json` contient 25 recettes complètes au schéma `2.1.0`, de `r101` à `r125` :

- 2 petits-déjeuners ;
- 21 boissons ;
- 2 soupes ;
- 25 identifiants et 25 slugs uniques ;
- 25 blocs d'ingrédients normalisés avec `id`, quantité et unité normalisées, ainsi que `facultatif` ;
- 25 blocs de provenance comprenant la référence nutritionnelle Ciqual 2025 et une provenance de coût explicitement éditoriale ;
- `app.review.stage: draft` et `app.planner.eligible: false` pour toutes les recettes.

Ce lot ne doit pas encore être intégré au catalogue publié. Les recettes sont des formulations éditoriales originales ou des adaptations culinaires identifiées. Elles ne revendiquent aucun effet médical et doivent être testées en cuisine, recalculées et relues avant validation.

## Contrôles automatiques effectués

- le JSON est syntaxiquement valide ;
- `meta.nombre_recettes` correspond à `recipes.length` ;
- les identifiants forment exactement la séquence `r101` à `r125` ;
- les temps totaux sont égaux à préparation + cuisson + repos ;
- `active_minutes` est un entier positif ou nul et ne dépasse jamais le temps total ;
- les équipements et types de repas utilisent uniquement les valeurs du schéma ;
- chaque ingrédient possède le bloc normalisé v2.1 complet ;
- toutes les unités normalisées appartiennent à `g`, `ml`, `piece`, `c_soupe` ou `c_cafe` ;
- les allergènes du planificateur sont exactement l'union de ceux des ingrédients ;
- toutes les recettes restent inéligibles au planificateur pendant la phase brouillon.

La validation a été exécutée avec le validateur du catalogue et retourne : 25 recettes, 25 identifiants uniques, schéma `2.1.0`.

## Risques transversaux avant publication

- **Nutrition** : toutes les valeurs sont des estimations obtenues à partir d'aliments génériques. Les boissons filtrées `r103`, `r104`, `r105`, `r109`, `r111`, `r113`, `r116`, `r119` et `r123` sont particulièrement incertaines, car la quantité réellement extraite dans l'eau n'a pas été mesurée.
- **Coûts** : les montants par portion n'ont ni enseigne, ni zone géographique, ni relevé tarifaire associé. Ils doivent être recalculés avec une grille versionnée.
- **Allergènes** : la taxonomie couvre les allergènes explicites de la formulation, mais les références commerciales et contaminations croisées restent à vérifier.
- **Hygiène** : les préparations macérées à froid et les boissons au kéfir doivent rester au réfrigérateur. Les fruits macérés ne sont pas destinés à être conservés.
- **Portions de boissons** : le volume fini doit être mesuré après filtration, mixage ou cuisson. Les boissons concentrées `r121` et les smoothies ne sont pas interchangeables avec de l'eau.
- **Promesses santé** : aucun mécanisme isolé ni effet thérapeutique ne doit être ajouté aux fiches. Les intitulés et textes restent culinaires.

## Relecture recette par recette

| ID | Point culinaire à tester | Allergènes explicites | Données à reprendre |
|---|---|---|---|
| r101 | Tenue des crêpes après 2 h de trempage, diamètre et rendement de quatre unités | poisson | Temps actif, poids cuit de la truite et absorption d'huile |
| r102 | Cuisson à cœur dans différents paniers vapeur et protection contre la condensation | œuf, fruits à coque | Jus réellement obtenu, sodium de la levure et taille des six parts |
| r103 | Intensité après 8 h et amertume du romarin | aucun | Extraction des fruits et volume après filtration |
| r104 | Équilibre entre acidité de l'hibiscus et douceur de la pomme | aucun | Extraction réelle dans l'eau |
| r105 | Torréfaction sans brûler et goût du liquide filtré | gluten | Transfert nutritionnel de l'orge et réemploi sûr des grains |
| r106 | Fluidité avec différentes poires et kéfirs | lait | Marque, matière grasse et sucres du kéfir |
| r107 | Finesse de la mûre et densité de l'avoine hydratée | gluten, soja | Calibre de betterave et référence de boisson végétale |
| r108 | Dispersion du cacao et stabilité du tahini | fruits à coque, sésame | Composition exacte de la boisson d'amande |
| r109 | Dosage anisé et herbacé après filtration | aucun | Extraction et jus réellement ajouté |
| r110 | Texture selon maturité de la mangue | lait | Yaourt utilisé, poids comestible et sucres naturels |
| r111 | Intensité après 2 h et clarté du liquide | aucun | Extraction des framboises et durée sûre de conservation |
| r112 | Solubilité de la chicorée et mousse sans appareil dédié | gluten | Références de chicorée et boisson d'avoine |
| r113 | Temps d'infusion du thé, force de la badiane | aucun | Caféine et extraction de la poire |
| r114 | Texture de la carotte crue dans plusieurs blenders | soja | Poids des mandarines et référence du yaourt |
| r115 | Rendement après étamine et stabilité au repos | fruits à coque | Volume filtré, valeur des résidus et hygiène du trempage |
| r116 | Puissance de la sauge et couleur finale | aucun | Extraction des mûres et dosage réel du zeste |
| r117 | Dilution, salinité et tenue du concombre | lait | Sodium du yaourt et poids final |
| r118 | Finesse des épinards et des graines de chanvre | soja | Référence de boisson végétale et taille des poires |
| r119 | Niveau de torréfaction avant apparition d'amertume | aucun | Transfert du sarrasin dans l'infusion |
| r120 | Texture avec toute la pulpe et taille du verre | céleri | Poids comestible des pommes et sodium du céleri |
| r121 | Concentration, douceur et homogénéité après réchauffage | gluten, sésame | Calibre des dattes et sucres par petite portion |
| r122 | Refroidissement complet de la rhubarbe avant ajout du kéfir | lait | Acidité, rendement de compotée et marque du kéfir |
| r123 | Équilibre prune-gingembre et limpidité après filtration | aucun | Extraction des prunes |
| r124 | Équilibre chou-fleur-poire et texture avec 800 ml d'eau | fruits à coque | Perte au rôtissage, poids des poires et rendement final |
| r125 | Texture après mixage partiel et pouvoir épaississant des lentilles | aucun | Absorption d'eau, poids final et taille de portion |

## Conditions de passage à la validation

1. Réaliser chaque recette au moins une fois en consignant durée réelle, poids final, volume, rendement et corrections nécessaires.
2. Relier chaque ingrédient à une référence nutritionnelle précise puis recalculer les valeurs par portion.
3. Relever les prix avec date, zone géographique et enseigne, puis recalculer le coût par portion.
4. Vérifier les allergènes sur les produits effectivement retenus, y compris les substitutions.
5. Faire une relecture culinaire et éditoriale indépendante.
6. Conserver `planner.eligible: false` jusqu'à la validation complète et à la vérification de non-duplication dans le catalogue global.
