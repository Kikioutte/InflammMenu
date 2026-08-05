# Relecture du pilote r226–r250

## Statut

Ce lot comprend 25 salades distinctes dérivées des concepts `r226` à `r250` de `recipes-r201-r350.json`, toutes au schéma `2.1.0`.

- ingrédients, quantités, unités, temps actifs et provenance sont structurés ;
- l'union des allergènes des ingrédients est reproduite exactement dans le planificateur ;
- les avertissements couvrent les aliments fermentés, le sodium, les germes, les œufs mollets et le pomelo/pamplemousse ;
- aucune recette ne revendique un effet médical ;
- toutes restent `stage: draft`, `status: caution` et `planner.eligible: false`.

## Incertitudes transversales

- **Nutrition et coûts** : valeurs purement estimées, sans rendement mesuré ni prix daté.
- **Produits fermentés** : `r234`, `r241` à `r244` emploient uniquement des produits commerciaux réfrigérés. L'intégrité du contenant, la date et le maintien au froid doivent être vérifiés.
- **Germes** : les mungo de `r229` et lentilles de `r248` sont explicitement blanchis et ne doivent pas être consommés crus.
- **Sodium** : citron confit, olives, câpres, kimchi, choucroute, ferments, lupins, tofu fumé et conserves peuvent modifier fortement les estimations.
- **Interactions** : le pomelo de `r232` et le pamplemousse de `r247` conservent un avertissement visible en cas de traitement médicamenteux concerné.
- **Allergènes** : gluten, soja, sésame, arachides, œuf, lait, moutarde, lupin, sulfites et fruits à coque sont structurés lorsqu'ils sont présents. Les étiquettes commerciales restent obligatoires.
- **Matériel** : `r239` nécessite un spiraliseur, absent du vocabulaire matériel v2.1 ; la recette reste exclue du planificateur.

## Points particuliers

| Plage | Vérifications prioritaires |
|---|---|
| r226–r230 | Rôtissage, cuisson ferme des lentilles, sulfites, olives et citron confit |
| r231–r237 | Composition des nouilles, gluten, soja, sésame, arachides et refroidissement rapide |
| r232 | Interaction possible du pomelo et sodium du tofu fumé |
| r234 | Fermentation commerciale et sécurité de l'œuf mollet pour les publics fragiles |
| r238–r240 | Tenue des pâtes de légumineuses, outil de spiralisation, raifort et produits laitiers |
| r241–r244 | Chaîne du froid, intégrité des ferments, sodium et refroidissement du riz |
| r245–r246 | Fruits grillés ou rôtis, sulfites, fruits à coque et maturité |
| r247 | Lupin, saumure et interaction possible du pamplemousse |
| r248 | Blanchiment obligatoire des lentilles germées |
| r249 | Soja, olives et conservation très courte de la pastèque |
| r250 | Cuisson du coing, noix de pécan et amertume des endives |

## Contrôles avant intégration

1. Tester chaque protocole et mesurer temps actif, rendement et portion finale.
2. Recalculer nutrition, sodium et coût avec les produits réellement choisis.
3. Vérifier toutes les étiquettes, notamment nouilles, vinaigres, ferments et conserves.
4. Valider les étapes de refroidissement et de conservation avec une chaîne du froid continue.
5. Ne rendre aucune recette éligible avant validation éditoriale complète.
