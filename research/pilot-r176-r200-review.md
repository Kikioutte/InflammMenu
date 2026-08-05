# Relecture du pilote r176–r200

## Statut

Ce lot transforme les concepts contrôlés `r176` à `r200` en 11 collations et 14 desserts complets au schéma `2.1.0`.

- ingrédients, quantités, unités et identifiants canoniques sont structurés ;
- l'union des allergènes des ingrédients est reprise exactement dans le planificateur ;
- provenance, temps actif, conservation et substitutions sont explicites ;
- aucune recette ne formule de promesse médicale ;
- toutes restent `review.stage: draft`, `review.status: caution` et `planner.eligible: false`.

## Incertitudes transversales

- **Nutrition et coûts** : tous les chiffres sont estimés à partir d'ingrédients génériques. Ils doivent être recalculés avec les produits, rendements et portions réellement testés.
- **Portions** : les bouchées, crackers et desserts utilisent de petites portions éditoriales. Le nombre réellement obtenu doit être mesuré.
- **Fruits secs et fruits rôtis** : plusieurs recettes concentrent naturellement les sucres ; les avertissements restent visibles et les portions doivent rester modestes.
- **Allergènes** : avoine et blé portent le gluten ; œufs, lait, soja, sésame, fruits à coque et sulfites sont structurés lorsque présents. Les produits commerciaux et substitutions doivent être relus sur étiquette.
- **Coco** : `r194` utilise un lait de coco léger, mais les graisses saturées doivent être recalculées selon la marque.
- **Cacao** : `r180`, `r192` et `r198` demandent un dosage et une taille de portion testés, sans allégation liée au cacao.
- **Conservation** : dips, compotées, fruits cuits et desserts au yaourt ou tofu exigent une chaîne du froid stricte.

## Points particuliers

| ID | Vérification avant validation |
|---|---|
| r176 | Croustillance réelle et sodium des haricots |
| r177 | Gluten, pistaches, fruits secs concentrés et rendement des bouchées |
| r178 | Dessiccation variable selon le four et risque d'amertume |
| r179 | Certification des galettes et assemblage au dernier moment |
| r180 | Gluten, noix, humidité de la poire et portion de cacao |
| r181 | Noix, rendement des lentilles et portion de tartinade |
| r182 | Hydratation de la socca et absorption d'huile |
| r183 | Sésame, sodium du zaatar et texture des fèves |
| r184 | Lait, noix, poids égoutté et chaîne du froid |
| r185 | Gluten, sulfites, sodium et croustillance au stockage |
| r186 | Fruits à coque et pouvoir gélifiant du chia |
| r187 | Pistaches, calibre des poires et quantité réellement absorbée |
| r188 | Lait, amandes et maturité des pêches |
| r189 | Œufs, amandes, prise du gâteau et certification de la polenta |
| r190 | Fruits à coque, cuisson du riz complet et boisson d'amande |
| r191 | Lait, noix et concentration des raisins rôtis |
| r192 | Soja, noisettes, amertume du cacao et texture du tofu |
| r193 | Lait, noix, fruits concentrés et coût saisonnier |
| r194 | Sésame, coco, graisses saturées et portion modérée |
| r195 | Gluten, pistaches, acidité des abricots et huile absorbée |
| r196 | Gluten, œufs, amandes, humidité et levure commerciale |
| r197 | Œufs, amande, certification du sarrasin et prise à cœur |
| r198 | Soja, sésame, quantité de banane et capacité du blender |
| r199 | Gluten, amandes, hydratation de pâte et jus des prunes |
| r200 | Soja, amandes, cuisson du coing et prise du flan |

## Contrôles avant intégration

1. Réaliser chaque recette et peser le rendement final par portion.
2. Chronométrer le travail actif et vérifier les températures ou textures de fin de cuisson.
3. Recalculer nutrition et coût avec des sources versionnées.
4. Vérifier chaque allergène sur les références commerciales retenues et recalculer l'union après substitution.
5. Maintenir ces recettes hors du planificateur tant que ces contrôles ne sont pas terminés.
