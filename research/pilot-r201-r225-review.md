# Relecture du lot r201–r225

## Statut

`pilot-r201-r225.draft.json` contient 25 salades originales au schéma 2.1.0 complet. Le lot reste séparé du catalogue principal. Toutes les recettes sont en `caution/draft`, ont `planner.eligible: false`, une nutrition et un coût explicitement estimés, et un indice éditorial non évalué.

Aucune formulation ne présente une recette ou un ingrédient comme un traitement ou comme la preuve d'un effet médical.

## Contrôles structurels

- 25 identifiants consécutifs `r201` à `r225`, slugs et titres uniques ;
- catégories conformes aux concepts contrôlés du fichier `recipes-r201-r350.json` ;
- temps totaux et temps actifs cohérents ;
- ingrédients munis du bloc normalisé v2.1 complet ;
- allergènes du planificateur strictement égaux à l'union des allergènes des ingrédients ;
- équipements, unités, catégories de courses et allergènes issus des vocabulaires autorisés ;
- provenance originale avec repère nutritionnel et coût éditorial ;
- validation isolée et validation multi-lots réussies.

## Limites avant publication

- Réaliser chaque salade et mesurer rendement, poids final, texture et temps réellement actif.
- Pour les céréales et légumineuses refroidies, documenter précisément le refroidissement rapide et la conservation.
- Relier chaque ingrédient à une référence Ciqual avant recalcul nutritionnel.
- Recalculer les coûts avec une grille tarifaire datée et localisée.
- Vérifier chaque étiquette, notamment saumures, vinaigres, misos, fromages, cornichons et fruits séchés.
- Ne passer aucune recette à `eligible: true` avant validation culinaire, nutritionnelle, allergénique et tarifaire.

## Relecture par recette

| ID | Point culinaire | Allergènes / sécurité | Estimations à reprendre |
|---|---|---|---|
| r201 | Cuisson du freekeh et peau des fèves. | Gluten et céleri. | Sodium des artichauts, rendement du freekeh. |
| r202 | Millet bien séparé après refroidissement. | Aucun allergène majeur formulé. | Poids d'asperges parées et coût printanier. |
| r203 | Pois cassés tendres mais encore entiers. | Gluten de l'orge. | Double cuisson, rendement et portion finale. |
| r204 | Grillade homogène des poireaux, équilibre pruneau-vinaigre. | Gluten et noisettes. | Sucres des pruneaux et absorption d'huile. |
| r205 | Fraîcheur et finesse des champignons crus. | Céleri. | Conservation limitée, pertes et coût du chanvre. |
| r206 | Tenue des abricots et cuisson du petit épeautre. | Gluten et amandes. | Prix très saisonnier des abricots. |
| r207 | Refroidissement rapide du riz noir. | Arachides. | Poids de mangue verte et rendement du riz. |
| r208 | Polenta assez ferme pour être grillée. | Sulfites du balsamique choisi. | Sodium des borlotti et huile retenue. |
| r209 | Temps réel du sorgho et texture de la courge. | Contrôler l'étiquette des canneberges. | Sucres et additifs des fruits séchés. |
| r210 | Texture de l'amarante et rinçage des lupins. | Lupin ; sodium des olives et de la saumure. | Référence exacte du lupin et coût. |
| r211 | Rubans réguliers et sécurité de la mandoline. | Aucun allergène majeur formulé. | Poids paré du chou-rave. |
| r212 | Amertume des endives et maturité de la poire. | Lait. | Sodium et matière grasse du bleu. |
| r213 | Chou suffisamment assoupli sans perdre son croquant. | Noix de cajou. | Calibre des pêches et coût saisonnier. |
| r214 | Épaisseur des rubans et dosage du cumin. | Pistaches. | Poids comestible des oranges. |
| r215 | Dosage du radis noir et texture de la sauce. | Soja. | Disponibilité du shiso et du riz soufflé. |
| r216 | Rémoulade non aqueuse après repos. | Céleri, lait, noix et moutarde. | Références yaourt/moutarde et sodium. |
| r217 | Fraises fermes et sauce d'amande nappante. | Fruits à coque. | Prix printanier et poids après parage. |
| r218 | Intensité mesurée du safran et fenouil très fin. | Aucun allergène majeur formulé. | Sodium des haricots, coût du safran. |
| r219 | Fèves tendres et sauce miso non trop salée. | Soja et sésame. | Marque du miso et sodium réel. |
| r220 | Employer une variété mûre de tomate verte, pas un fruit immature. | Amandes. | Disponibilité des amandes fraîches et poids du melon. |
| r221 | Lentilles entières et choux bien rôtis. | Noisettes. | Huile retenue et prix des choux. |
| r222 | Pois jaunes entiers et panais rôti sans dessèchement. | Moutarde et sulfites du cornichon choisi. | Sodium du bocal et rendement des pois. |
| r223 | Céleri-rave tendre et sauce tahini fluide. | Céleri et sésame. | Sodium des azuki et poids après rôtissage. |
| r224 | Chapelure ajoutée au dernier moment. | Gluten. | Sodium des haricots et huile de torréfaction. |
| r225 | Betteraves tendres, orange non détrempante. | Lait. | Sodium de la ricotta salée et prix saisonnier. |

## Passage à la validation

Consigner un essai daté pour chaque recette, corriger quantités et temps, documenter refroidissement et conservation, recalculer nutrition et coût, effectuer une seconde relecture allergènes puis renseigner `reviewed_at`. La validation éditoriale et l'activation dans le planificateur restent deux décisions distinctes.
