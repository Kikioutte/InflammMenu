# Relecture du pilote r301–r325

## Statut

Ce lot contient 25 plats végétaux complets, fidèles aux concepts `r301` à `r325` de `recipes-r201-r350.json` et structurés au schéma `2.1.0`.

- ingrédients, unités, quantités, temps actifs, provenance et allergènes sont explicites ;
- les formes culinaires restent distinctes : cocotte, papillote, farces, roulés, boulettes, croquettes, gnocchis, pâtes et bouillon ;
- aucune recette ne formule de promesse médicale ;
- toutes restent `review.stage: draft`, `review.status: caution` et `planner.eligible: false`.

## Incertitudes transversales

- **Nutrition et coûts** : valeurs estimées sans rendement mesuré ni prix daté.
- **Sodium** : seitan, tofu fumé, miso, câpres, artichauts, feuilles de vigne, conserves et bouillons peuvent augmenter fortement le sodium réel.
- **Allergènes** : gluten, soja, céleri, fruits à coque, moutarde et sésame sont structurés. Les produits transformés doivent être vérifiés sur étiquette.
- **Fruits séchés** : `r310` et `r312` spécifient des produits non sulfurés et sans sucre ajouté, mais la référence commerciale doit être confirmée.
- **Cuissons complexes** : farces, roulés, boulettes, croquettes et gnocchis doivent être testés pour leur tenue et leur cuisson à cœur.
- **Trempage** : les fèves de `r322` trempent au réfrigérateur et les falafels doivent cuire à cœur.
- **Matériel et temps actif** : les estimations doivent être chronométrées sur un équipement domestique réel.

## Points particuliers

| Plage | Vérifications prioritaires |
|---|---|
| r301–r308 | Sodium du seitan, tofu, miso et câpres ; soja, gluten, moutarde et céleri |
| r304 | Safran normalisé à 0,1 g, à peser et tester |
| r309–r316 | Tenue des farces, calibre des légumes, cuisson des grains et roulage |
| r310–r312 | Fruits séchés concentrés et références non sulfurées |
| r313–r315 | Gluten ou fruits à coque selon farces, cuisson du freekeh et quinoa |
| r316 | Feuilles en saumure et sodium du plat fini |
| r317–r321 | Tenue des boulettes, croquettes, galettes et steaks ; absorption d'huile |
| r322 | Trempage réfrigéré, cuisson à cœur des fèves et allergène sésame |
| r323 | Quantité de farine nécessaire et texture des gnocchis |
| r324 | Fragilité des pâtes de pois chiches et allergène fruits à coque |
| r325 | Gluten des soba et cuisson séparée pour préserver le bouillon |

## Contrôles avant intégration

1. Réaliser chaque recette et mesurer rendement, cuisson à cœur et portion finale.
2. Chronométrer le temps actif, notamment pour les farces et façonnages.
3. Recalculer nutrition, sodium et coût avec des sources versionnées.
4. Vérifier les allergènes de chaque produit commercial et de toute substitution.
5. Conserver `planner.eligible: false` jusqu'à validation complète.
