# Relecture du pilote r126–r150

## Statut

Ce lot contient 25 recettes de soupe réellement distinctes, dérivées des concepts `r126` à `r150` de `recipes-r051-r200.json` et structurées au schéma `2.1.0`.

- chaque ingrédient possède un identifiant canonique, une quantité et une unité normalisées, et un booléen `facultatif` ;
- `active_minutes` distingue le travail actif du temps total ;
- les allergènes du planificateur sont exactement l'union des allergènes des ingrédients principaux ;
- la provenance racine renvoie à la recherche éditoriale d'origine, sans présenter les chiffres comme validés ;
- les 25 recettes restent `stage: draft`, `status: caution` et `planner.eligible: false`.

## Incertitudes transversales

- **Nutrition** : toutes les valeurs sont des estimations par ingrédients génériques. Elles doivent être recalculées avec des références de composition identifiées et le rendement réel après cuisson.
- **Coût** : les montants par portion ne sont liés à aucune enseigne, date ou zone. Ils servent uniquement à tester le schéma.
- **Temps actif** : les durées sont estimées d'après les étapes et doivent être chronométrées pendant les essais.
- **Allergènes** : les allergènes intrinsèques sont structurés, mais les étiquettes des conserves, vinaigres et produits transformés restent à contrôler. Les substitutions exigent une nouvelle union d'allergènes.
- **Sodium** : les haricots, tomates et châtaignes conditionnés peuvent modifier fortement les valeurs annoncées.
- **Hygiène** : les soupes froides `r130` et `r132` doivent être refroidies rapidement et maintenues à 4 °C maximum.

## Points particuliers

| ID | Point à vérifier avant validation |
|---|---|
| r126 | Sodium des haricots et tomates, intensité du romarin |
| r127 | Allergènes céleri et noix, texture du céleri-rave mixé |
| r128 | Absorption d'huile et rendement du panais rôti |
| r129 | Fruits à coque, couleur après cuisson et coût saisonnier |
| r130 | Lait, acidité framboise-betterave et chaîne du froid |
| r131 | Sodium des haricots et ajout tardif du basilic |
| r132 | Fruits à coque, sulfites du vinaigre et refroidissement |
| r133 | Gluten de l'orge et durée de cuisson selon le grain |
| r134 | Fruits à coque, poids égoutté et prix des châtaignes |
| r135 | Prix des asperges et cuisson très courte des légumes |
| r136 | Rendement vapeur et dilution progressive |
| r137 | Arachides, épaisseur au repos et homogénéité du liant |
| r138 | Temps de cuisson des lentilles et tolérance digestive |
| r139 | Sodium variable des fonds d'artichaut préparés |
| r140 | Poids comestible du potimarron et puissance de la sauge |
| r141 | Sodium des conserves et proportion réellement mixée |
| r142 | Tolérance chou-légumineuses et intensité du carvi |
| r143 | Fruits à coque et amertume variable du cresson |
| r144 | Acidité selon la tomate et dosage progressif de l'orange |
| r145 | Céleri, cuisson des lentilles et poids des châtaignes |
| r146 | Calibre et maturité des abricots, équilibre acide |
| r147 | Céleri, fruits à coque et surveillance du rôtissage |
| r148 | Sésame, dosage du sumac et texture après refroidissement |
| r149 | Couleur et texture de la laitue après mixage |
| r150 | Sodium des haricots et épaississement au stockage |

## Contrôles avant intégration

1. Réaliser chaque recette, mesurer rendement, poids final, texture et temps actif.
2. Recalculer nutrition et prix avec des sources versionnées.
3. Vérifier les étiquettes et les allergènes des produits réellement retenus.
4. Relire les étapes de refroidissement, conservation et réchauffage.
5. Garder `eligible: false` jusqu'à validation éditoriale complète.
