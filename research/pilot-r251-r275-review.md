# Relecture du lot r251–r275

## Statut

Le fichier `pilot-r251-r275.draft.json` contient 25 salades originales au schéma 2.1.0. Toutes restent en `caution/draft`, avec `planner.eligible: false`, nutrition et coûts estimés, provenance explicite et indice éditorial non évalué. Le catalogue principal n'est pas modifié.

Aucune recette ou aucun ingrédient n'est présenté comme un traitement ni comme la preuve d'un effet médical.

## Contrôles réalisés

- identifiants consécutifs `r251` à `r275`, slugs et titres uniques ;
- concepts et catégories conformes à `recipes-r201-r350.json` ;
- temps totaux, temps actifs et portions cohérents ;
- blocs ingrédients normalisés v2.1 complets ;
- unions d'allergènes exactes entre ingrédients et planificateur ;
- provenance nutritionnelle et tarifaire explicite ;
- validation isolée et multi-lots réussie.

## Points à vérifier avant validation

| ID | Essai culinaire | Allergènes / sécurité | Estimations à reprendre |
|---|---|---|---|
| r251 | Asperges, lentilles et cuisson des œufs. | Œuf et noix ; œufs cuits à cœur pour publics fragiles. | Calibre des œufs, huile et portion finale. |
| r252 | Grillade du halloumi et des abricots. | Lait et gluten. | Sodium du fromage et rendement de l'épeautre. |
| r253 | Concombre rôti non aqueux et pois entiers. | Lait et gluten. | Sodium du labneh et du pain. |
| r254 | Haricots bien séchés, poires fermes. | Lait et noisettes. | Eau de la mozzarella et calibre des poires. |
| r255 | Frittata prise à cœur et cubes stables. | Œuf. | Taille des œufs et huile absorbée. |
| r256 | Chou-fleur cru frais et paneer bien grillé. | Lait. | Sodium/matière grasse du paneer. |
| r257 | Fraises rôties fermes et burrata froide. | Lait et pistaches. | Prix saisonnier et poids égoutté. |
| r258 | Melon rôti sans excès de jus. | Lait. | Sodium du brebis et poids du melon. |
| r259 | Polenta ferme et cuisson sûre de l'œuf. | Œuf. | Tomates séchées, sodium et rendement. |
| r260 | Raisin rôti sans éclatement excessif. | Lait et noix. | Sodium du chèvre, poids du raisin. |
| r261 | Potiron tendre mais en cubes. | Sésame. | Sodium des azuki et rendement vapeur. |
| r262 | Cuisson longue des bambara et gombo grillé. | Aucun allergène majeur formulé. | Temps réel et disponibilité des produits. |
| r263 | Dosage mesuré de la salsa de dattes. | Amandes. | Sucres concentrés et huile retenue. |
| r264 | Cuisson complète après germination. | Contrôle strict de la chaîne du froid. | Rendement, refroidissement et durée de conservation. |
| r265 | Mungo entiers et pak-choï grillé. | Arachides. | Calibre des clémentines et rendement. |
| r266 | Artichauts grillés et salsa peu salée. | Vérifier saumures et produits séchés. | Sodium des olives/artichauts. |
| r267 | Pois cassés entiers et marinade équilibrée. | Moutarde. | Huile et poids des courgettes. |
| r268 | Nopal préparé sans épines et blanchi. | Aucun allergène majeur formulé. | Disponibilité, référence du maïs violet. |
| r269 | Artichauts tournés et citron bien rincé. | Fermentation et sodium du citron/olives. | Rendement après parage. |
| r270 | Aubergine confite sans excès d'huile. | Lupin et sulfites. | Sodium des lupins, huile absorbée. |
| r271 | Topinambours rôtis et portion tolérable. | Noisettes. | Pertes au four et rendement des lentilles. |
| r272 | Laitue grillée minute, crème nappante. | Noix de cajou. | Trempage, coût et rendement de sauce. |
| r273 | Asperges vapeur et raifort dosé doucement. | Lait. | Yaourt, parage et coût printanier. |
| r274 | Nectarines fermes, lentilles entières. | Amandes. | Fruits saisonniers et rendement. |
| r275 | Cuisson complète des cocos frais. | Aucun allergène majeur formulé. | Poids écossé et temps selon maturité. |

## Conditions de passage en validation

Réaliser et dater chaque essai, mesurer rendement et temps, documenter refroidissement et conservation, recalculer nutrition/coût avec des références précises, puis effectuer une seconde relecture allergènes. Renseigner `reviewed_at` seulement après cette étape ; l'activation dans le planificateur reste une décision distincte.
