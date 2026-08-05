# Revue finale indépendante — lot r176-r200

## Décision

Le lot est validé sur le plan éditorial et nutritionnel, mais reste séparé du catalogue principal. Il contient 11 collations (`r176-r186`) et 14 desserts (`r187-r200`) : **aucune des 25 recettes n'est éligible au planificateur de repas**.

La validation est documentaire. Aucune recette n'est présentée comme testée physiquement. Les coûts par portion sont des estimations éditoriales sans relevé tarifaire versionné; rendement, texture, temps réel et facteurs ménagers devront être confirmés par essais culinaires avant publication.

## Données nutritionnelles

- 72 identifiants d'ingrédients contrôlés ;
- 61 correspondances déjà validées réutilisées sans changer leur code source ;
- 11 nouvelles correspondances Ciqual 2025 contrôlées manuellement ;
- aucun nouveau recours à USDA ;
- trois données USDA SR Legacy déjà validées réutilisées : cardamome, chia et romarin frais ;
- 11 recettes conservent une réserve de calcul visible.

Les conversions par unité ont été revues occurrence par occurrence. Les quantités saisies en grammes pour abricots, cacao, coing, lin, prunes et tahini utilisent 1 g/g. Les volumes de jus d'orange ont des conversions propres à chaque recette. La mangue de r194 correspond aux 300 g de chair annoncés. Le lait de coco léger reste une approximation prudente à partir du lait de coco Ciqual standard.

## Relecture recette par recette

| ID | Type | kcal | Sucres | Saturés | Sodium | Réserve principale |
|---|---|---:|---:|---:|---:|---|
| r176 | Collation | 101 | 0,7 g | 0,6 g | 216 mg | Sodium variable des haricots ; rinçage nécessaire. |
| r177 | Collation | 172 | 8,0 g | 0,9 g | 3 mg | Gluten, noix ; fruits secs concentrés, portion modérée. |
| r178 | Collation | 87 | 0,3 g | 1,1 g | 23 mg | Séchage dépendant du four ; éviter le brunissement. |
| r179 | Collation | 143 | 0,6 g | 1,8 g | 22 mg | Certification des galettes et assemblage minute. |
| r180 | Collation | 142 | 4,1 g | 1,1 g | 3 mg | Gluten, noix ; grué approché par cacao en poudre. |
| r181 | Collation | 167 | 0,5 g | 1,1 g | 3 mg | Noix ; refroidissement des lentilles et chaîne du froid. |
| r182 | Collation | 117 | 3,0 g | 0,7 g | 22 mg | Vérifier la farine si une garantie sans gluten est requise. |
| r183 | Collation | 173 | 0,6 g | 1,2 g | 13 mg | Sésame ; zaatar approché par sésame sans herbes séparées. |
| r184 | Collation | 180 | 10,1 g | 2,4 g | 95 mg | Lait, noix ; dip conservé au froid. |
| r185 | Collation | 178 | 2,8 g | 1,4 g | 18 mg | Gluten, sulfites ; énergie de tomate séchée calculée par Atwater. |
| r186 | Collation | 141 | 10,3 g | 0,6 g | 2 mg | Noix ; repos au froid, hydratation et sucres du chia manquants. |
| r187 | Dessert | 176 | 17,4 g | 0,9 g | 10 mg | Noix ; hibiscus en proxy aqueux, bâton de cannelle approché. |
| r188 | Dessert | 188 | 14,2 g | 1,5 g | 24 mg | Lait, noix ; cuisson adaptée à la maturité des pêches. |
| r189 | Dessert | 232 | 2,3 g | 1,7 g | 119 mg | Œuf, noix ; saturés de polenta imputés depuis farine de maïs. |
| r190 | Dessert | 217 | 3,1 g | 1,1 g | 32 mg | Noix ; chaîne du froid et sucres de cardamome manquants. |
| r191 | Dessert | 255 | 22,7 g | 2,9 g | 47 mg | Lait, noix ; sucres naturels du raisin et sucres du romarin manquants. |
| r192 | Dessert | 141 | 3,8 g | 1,6 g | 6 mg | Soja, noix ; maintien au froid du tofu soyeux. |
| r193 | Dessert | 237 | 17,3 g | 2,0 g | 28 mg | Lait, noix ; sucres naturellement apportés par les fruits. |
| r194 | Dessert | 257 | 8,2 g | 6,0 g | 17 mg | Sésame ; saturés élevés liés au coco, approximation du produit léger. |
| r195 | Dessert | 210 | 7,6 g | 1,6 g | 4 mg | Gluten, noix ; sucres de cardamome manquants. |
| r196 | Dessert | 186 | 3,4 g | 1,3 g | 112 mg | Gluten, œuf, noix ; levure et cuisson du centre. |
| r197 | Dessert | 146 | 7,3 g | 1,0 g | 38 mg | Œuf, noix ; sarrasin certifié, cuisson à cœur, muscade mesurée. |
| r198 | Dessert | 144 | 11,6 g | 1,2 g | 13 mg | Soja, sésame ; chaîne du froid et service immédiat. |
| r199 | Dessert | 177 | 7,6 g | 1,0 g | 3 mg | Gluten, noix ; sucres du romarin manquants. |
| r200 | Dessert | 286 | 6,5 g | 1,3 g | 29 mg | Soja, noix ; coing entièrement attendri et conservation au froid. |

## Contrôles éditoriaux

- allergènes réglementaires identiques entre ingrédients et planificateur ;
- sulfites de r185 explicitement affichés ;
- graisses saturées de r194 explicitement signalées ;
- aucune collation ni aucun dessert présenté comme repas complet ;
- aucune promesse de prévention, traitement, guérison ou réduction d'une inflammation ;
- scores décrits uniquement comme indices du profil alimentaire global ;
- coûts conservés comme estimations.

## Vérifications exécutées

- reconstruction reproductible du mapping ;
- calcul nutritionnel des 25 recettes ;
- validateur dédié des sources, conversions, valeurs, allergènes et décisions éditoriales ;
- validation globale de tous les lots finaux ;
- tests du catalogue et du moteur de menus ;
- contrôle du diff.

