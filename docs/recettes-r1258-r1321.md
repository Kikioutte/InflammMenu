# Intégration des 64 recettes vertes du 5 octobre 2026

Les 64 fiches relues sont intégrées sous les identifiants `r1258` à `r1321`. Le catalogue contient 1 321 recettes, dont 1 315 visibles et 534 vertes. Les 1 257 fiches antérieures sont conservées à l’identique au sens du JSON analysé.

28 ajouts rejoignent le générateur ; la projection compte 713 recettes. Les autres restent des recettes d’appoint, des plats insuffisants comme repas autonome selon le seuil éditorial existant, ou nécessitent un équipement particulier absent du profil du générateur. Les régimes, allergènes, saisons et durées ont été relus individuellement. Le statut vert correspond exclusivement à la grille personnelle du projet.

Les quatre extractions `r1274`, `r1279`, `r1311` et `r1314` conservent des valeurs nutritionnelles nulles : le rendement consommé après filtration n’est pas mesuré. La fiche affiche cette indisponibilité ; les courses restent calculables, et une conversion ou un repas composé propage l’indisponibilité aux moyennes au lieu d’afficher zéro. Les 60 autres fiches utilisent le registre Ciqual déjà documenté. Les prix restent des hypothèses éditoriales, sans relevé actuel en magasin.

Les 64 photographies restent à produire. Les prompts sont individualisés et portent `waiting_image_generation`. Les fiches utilisent le visuel de remplacement local, sans requête vers un JPEG inexistant. `validate:images:present` et les contrôles CI conviennent à cet état ; le contrôle strict `validate:images` / `test:release` reste volontairement non satisfait tant que les 64 JPEG ne sont pas réalisés. Aucun contrôle n’a été assoupli pour les images.

Il n’y a eu aucun essai physique en cuisine. Les temps et textures sont des estimations relues. Les ajustements de préparation par rapport à l’inventaire sont consignés dans le fichier source : scission de certaines étapes composites, lavage explicite et adaptation de l’huile de `r1320` à 15 g pesés, répartis en 10 g et 5 g. Le journal historique du 1er octobre reste intact ; un nouveau journal contient les empreintes des 64 fiches et de leur inventaire d’origine.

## Fichiers de référence

- `research/recipes-r1258-r1321-inventory.json` : inventaire initial, avant intégration.
- `research/recipes-r1258-r1321-source.json` : métadonnées culinaires et relecture par fiche.
- `research/recipe-instructions-review-2026-10-05.json` : preuves et empreintes.
- `research/image-prompts-r1258-r1321.json` : photographies à produire.

## Régénération du lot

Depuis la racine du dépôt, avec Node et Python disponibles :

```sh
node research/build-recipes-r1258-r1321-source.mjs
python3 scripts/import-recipes-r1258-r1321.py
node scripts/generate-planner-recipes.mjs
node scripts/generate-recipe-nutrition.mjs
node scripts/generate-recipe-reference-ids.mjs
node scripts/finalize-recipes-r1258-r1321.mjs
```

Le script final vérifie que les anciennes fiches restent intactes. Les tests de référence du moteur conservent explicitement leur catalogue historique ; les autres tests et le parcours navigateur portent sur le catalogue actuel, dont les 64 ajouts.

## Recettes ajoutées

| ID | Recette | Générateur | Préparation / cuisson / repos (min) |
|---|---|---|---|
| r1258 | Salade de poulet cuit, chou fin, concombre, radis et mâche | Complément | 20 / 25 / 10 |
| r1259 | Effiloché de poulet en réduction de prune et figue, raisins éclatés | Oui | 15 / 45 / 0 |
| r1260 | Brandade de cabillaud au chou-fleur et aubergine, rubans de poivron rôti | Complément | 25 / 40 / 2 |
| r1261 | Chou-fleur façon risotto au saumon, crème de courgette et fenouil | Oui | 20 / 25 / 0 |
| r1262 | Tagliatelles de courgette, ragù de sardines au poivron rôti et champignons | Oui | 20 / 40 / 0 |
| r1263 | Rouleaux de chou tranchés au saumon cuit, semoule de chou-fleur et concombre | Oui | 25 / 30 / 2 |
| r1264 | Truite farcie en ramequin, courge et épinards, asperges vapeur | Oui | 25 / 50 / 0 |
| r1265 | Sauté de maquereau en gros cubes, brocoli fin, chou et courgette | Oui | 20 / 20 / 0 |
| r1266 | Cornets de laitue au cresson, céleri-rave et noix | Complément | 15 / 0 / 0 |
| r1267 | Rouleaux de courgette aux petits pois et amandes | Complément | 20 / 13 / 3 |
| r1268 | Concombres farcis aux carottes rôties et pignons | Complément | 15 / 40 / 10 |
| r1269 | Poivrons roulés, crème de chou-fleur et navet croquant | Complément | 20 / 25 / 5 |
| r1270 | Bouchées d’endive, purée d’artichaut et sésame | Complément | 15 / 30 / 5 |
| r1271 | Rouleaux de chou blanc au céleri branche, brocoli et avocat | Complément | 20 / 15 / 5 |
| r1272 | Rosaces de radis sur crème de haricots verts et amandes | Complément | 15 / 15 / 10 |
| r1273 | Soupe froide de petits pois, concombre et radis | Complément | 15 / 10 / 20 |
| r1274 | Bouillon filtré de chou rouge, fenouil et champignons | Complément | 15 / 45 / 0 |
| r1275 | Soupe tiède d’orange entière mixée, pêche pochée et groseilles | Complément | 15 / 10 / 15 |
| r1276 | Crème chaude de figues et d’abricots secs réhydratés | Complément | 10 / 25 / 25 |
| r1277 | Relish de tomate et pêche en cru-cuit, éclats de grenade | Complément | 10 / 15 / 10 |
| r1278 | Concentré de tomate à l’ananas rôti | Complément | 15 / 45 / 10 |
| r1279 | Jus court de champignon, chou blanc et fenouil | Complément | 15 / 90 / 0 |
| r1280 | Pâte de noix torréfiées à la duxelles de champignons et endive | Complément | 15 / 30 / 5 |
| r1281 | Sauce froide d’amande au concombre, céleri croquant | Complément | 15 / 0 / 0 |
| r1282 | Poivrons en cocotte farcis à la brunoise de fenouil, carotte, céleri-rave et champignons | Complément | 25 / 50 / 0 |
| r1283 | Courgettes doubles à la farce de noix, courge, épinards et champignons | Oui | 25 / 40 / 5 |
| r1284 | Roulés d’aubergine au brocoli, chou-fleur et céleri-rave liés à l’amande | Oui | 30 / 40 / 5 |
| r1285 | Chou blanc en ballotins de pomme de terre, rutabaga, endive et cresson | Oui | 25 / 70 / 0 |
| r1286 | Paupiettes de chou rouge aux pignons, navet, carotte, champignons et céleri branche | Oui | 30 / 45 / 0 |
| r1287 | Endives garnies d’un écrasé de courge et céleri-rave, carotte et radis, aux amandes | Complément | 25 / 45 / 0 |
| r1288 | Fenouils ouverts en éventail, garniture de poivron, épinards, champignons et céleri | Complément | 25 / 40 / 0 |
| r1289 | Fonds d’artichaut garnis de brocoli, courgette et petits pois au sésame | Complément | 20 / 45 / 0 |
| r1290 | Gros champignons de Paris farcis aux haricots verts, carotte, fenouil et noisettes | Complément | 25 / 40 / 0 |
| r1291 | Courge en quartiers creusés, brunoise de rutabaga et choux de Bruxelles, cresson et noix | Oui | 25 / 60 / 0 |
| r1292 | Millefeuille chaud de céleri-rave, courge et fenouil aux épinards et poivron | Complément | 25 / 45 / 5 |
| r1293 | Pressé de pomme de terre, carotte, courge, navet et chou-fleur | Oui | 30 / 75 / 20 |
| r1294 | Rösti au four, pomme de terre et panais, cœur de chou rouge, épinards et champignons | Oui | 25 / 70 / 5 |
| r1295 | Nids de pomme de terre aux asperges, petits pois, carotte et céleri-rave | Oui | 30 / 60 / 5 |
| r1296 | Hachis de champignons et endives, couverture de pomme de terre, rutabaga et courge | Oui | 25 / 50 / 5 |
| r1297 | Gratin lié par l’amidon, pomme de terre, fenouil, courgette, navet et chou-fleur | Oui | 30 / 65 / 0 |
| r1298 | Pommes de terre évidées, farce au brocoli, céleri-rave, épinards et petits pois | Oui | 25 / 90 / 5 |
| r1299 | Lasagnes de courgette aux champignons, carotte, épinards et poudre d’amande | Oui | 25 / 50 / 15 |
| r1300 | Pavés de chou-fleur en croûte de noix, brocoli, carotte et céleri-rave | Oui | 30 / 45 / 0 |
| r1301 | Quartiers de chou blanc au sésame, courge écrasée, poivron et choux de Bruxelles | Oui | 25 / 40 / 0 |
| r1302 | Crumble de légumes à la noisette, aubergine, courge, navet et haricots verts | Oui | 25 / 50 / 0 |
| r1303 | Tarte en croûte de pomme de terre aux endives, chou-fleur, Bruxelles et céleri branche | Oui | 30 / 70 / 15 |
| r1304 | Saumon poêlé, allumettes de pomme et raisin écrasé | Oui | 15 / 12 / 0 |
| r1305 | Paillard de dinde, semoule de brocoli au poivron rôti et concombre | Oui | 25 / 35 / 0 |
| r1306 | Poulet en sauce de chou-fleur au cresson, quartiers de champignons | Oui | 20 / 30 / 0 |
| r1307 | Lasagnes de courgette à la truite, courge liée et épinards | Oui | 25 / 60 / 0 |
| r1308 | Paupiettes de saumon au cœur de cabillaud, épinards et chou-fleur | Oui | 30 / 45 / 0 |
| r1309 | Dinde en poche de figue sèche et mangue, poire rôtie | Oui | 25 / 50 / 5 |
| r1310 | Petits rouleaux de feuille de poire et pêche, cerises compotées | Complément | 20 / 15 / 490 |
| r1311 | Pomme imprégnée de framboise sous vide à la cloche | Complément | 15 / 0 / 0 |
| r1312 | Neige de pêche râpée sur banane fraîche écrasée | Complément | 15 / 0 / 480 |
| r1313 | Condiment sec de champignons précuits et sésame torréfié | Complément | 15 / 14 / 740 |
| r1314 | Essence froide de tomate et poire égouttées | Complément | 10 / 0 / 720 |
| r1315 | Brochettes de légumes en rubans et quartiers, grillées à la plancha | Complément | 25 / 25 / 0 |
| r1316 | Brochettes de céleri en doubles entailles, panais, navet, carotte et Bruxelles | Complément | 30 / 65 / 0 |
| r1317 | Céleri-rave rôti entier en tranches, champignons dorés et trois légumes fondants | Complément | 25 / 160 / 10 |
| r1318 | Chips de carotte, panais, betterave, courge et céleri-rave au four | Complément | 20 / 40 / 20 |
| r1319 | Racines sous vide, betterave séparée et fenouil, finition en jus réduit | Complément | 20 / 100 / 0 |
| r1320 | Radis rôtis sur crème de chou-fleur au cresson | Complément | 15 / 20 / 0 |
| r1321 | Choux de Bruxelles en salade fine, carotte râpée et amandes | Complément | 20 / 0 / 10 |
