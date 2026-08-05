# Relecture du lot r151–r175

## Statut

Le fichier `pilot-r151-r175.draft.json` contient 25 recettes originales conformes au schéma 2.1.0 : 22 soupes et 3 encas. Il reste séparé du catalogue principal. Les 25 entrées portent `app.review.status: caution`, `app.review.stage: draft` et `app.planner.eligible: false`.

Aucune recette ni aucun ingrédient n'est présenté comme un traitement. L'indice éditorial reste à `0` et explicitement « non évalué » ; il ne constitue pas une mesure scientifique.

## Contrôles réalisés

- identifiants consécutifs `r151` à `r175`, sans doublon d'identifiant ou de slug ;
- 25 recettes et `meta.nombre_recettes: 25` ;
- temps totaux égaux à préparation + cuisson + repos ;
- `active_minutes` entier et inférieur ou égal au temps total ;
- bloc normalisé v2.1 complet pour chaque ingrédient ;
- unités, catégories, équipements et allergènes limités aux vocabulaires contrôlés ;
- allergènes du planificateur strictement égaux à l'union des allergènes des ingrédients ;
- provenance originale renseignée avec repère Ciqual et coût explicitement éditorial ;
- nutrition et coûts signalés comme estimés ;
- validation isolée réussie avec `validateCatalogue`.

## Limites communes

- Réaliser chaque recette et mesurer poids final, rendement, texture, temps actif et nombre de portions.
- Relier chaque ingrédient à un code Ciqual précis avant de recalculer la nutrition.
- Recalculer les coûts avec une grille datée, localisée et versionnée.
- Vérifier les étiquettes, les mentions « peut contenir », les contaminations croisées et les substitutions.
- Vérifier le refroidissement et la conservation réels, surtout pour les soupes froides et les légumineuses.
- Ne rendre aucune recette éligible au générateur avant validation culinaire, nutritionnelle, allergénique et tarifaire.

## Points à vérifier par recette

| ID | Essai culinaire | Allergènes et sécurité | Estimations à reprendre |
|---|---|---|---|
| r151 | Texture avec 300 g de tofu soyeux et dilution finale. | Soja ; sodium très variable du miso. | Marque du miso et coût de la courge. |
| r152 | Temps de rôtissage et facilité de pelage des poivrons. | Vérifier les sulfites si des poivrons en bocal remplacent les frais. | Rendement des lentilles et prix saisonnier des poivrons. |
| r153 | Gonflement du millet et épaisseur après repos. | Aucun allergène majeur formulé ; étiquettes à contrôler. | Sodium des haricots et poids du kale paré. |
| r154 | Dosage du citron confit après rinçage. | Produit fermenté/salé ; contrôler additifs et sodium. | Sodium très dépendant du citron et des pois chiches. |
| r155 | Le cacao doit approfondir le goût sans dominer. | Aucun allergène majeur formulé. | Rendement des haricots et cacao exact. |
| r156 | Équilibre chou-pomme-carvi et mixage partiel. | Sulfites déclarés pour le vinaigre choisi. | Acidité, sucre des pommes et coût du chou. |
| r157 | Onctuosité réelle apportée par les graines. | Contrôler les traces éventuelles des graines conditionnées. | Poids cuit des légumes et coût du basilic. |
| r158 | Équilibre tomate-fraise-poivron à maturité égale. | Hygiène stricte et maintien au froid. | Poids comestible, saison et rendement au mixage. |
| r159 | Ajuster l'eau selon la maturité du melon. | Hygiène stricte et maintien au froid. | Poids réel de chair et coût du chanvre. |
| r160 | Quinoa tendre tout en gardant un bouillon clair. | Aucun allergène majeur formulé. | Absorption du quinoa et coût des tomates cerises. |
| r161 | Dorer les champignons sans excès d'eau. | Aucun allergène majeur formulé. | Pertes de cuisson des champignons et rendement du sarrasin. |
| r162 | Intensité du fenouil et douceur de la poire. | Aucun allergène majeur formulé. | Calibre des bulbes, sodium des haricots. |
| r163 | Texture de la purée d'amande et dosage de muscade. | Fruits à coque ; ne pas surdoser la muscade. | Référence de purée d'amande et brocoli après parage. |
| r164 | Aubergine bien rôtie sans absorption excessive d'huile. | Aucun allergène majeur formulé. | Huile retenue et sodium des pois chiches. |
| r165 | Contrôler le gingembre et la sucrosité de la poire. | Quantité culinaire modérée de gingembre, à ne pas concentrer. | Poids préparé de la courge et coût des graines. |
| r166 | Cuisson du chou et tenue des haricots. | Aucun allergène majeur formulé. | Sodium des conserves et poids du chou paré. |
| r167 | Infusion et intensité du safran. | Ne pas augmenter la quantité de safran avant essai. | Prix du safran et rendement du chou-fleur. |
| r168 | Cuisson courte des asperges et couleur finale. | Aucun allergène majeur formulé. | Poids après parage et coût très saisonnier. |
| r169 | Force du raifort frais et texture partiellement mixée. | Lait ; manipuler/râper le raifort dans un espace aéré. | Référence du yaourt et temps des lentilles. |
| r170 | Pistache assez fine sans rendre le velouté pâteux. | Fruits à coque. | Prix des pistaches et eau des courgettes. |
| r171 | Temps réel de l'orge mondé et absorption du bouillon. | Gluten et céleri. | Rendement de l'orge et sodium des tomates. |
| r172 | Équilibre entre amertume des endives et poire. | Fruits à coque. | Calibre des endives, prix des noix et poids final. |
| r173 | Épaisseur uniforme et dessiccation complète des crackers. | Gluten de l'avoine. | Huile retenue et nombre réel de crackers. |
| r174 | Texture tartinable et quantité d'eau nécessaire. | Sésame. | Huile absorbée par les carottes et coût du tahini. |
| r175 | Cuisson complète selon l'emballage et assaisonnement tiède. | Soja et sésame. | Marque d'edamame, poids après cuisson et prix du surgelé. |

## Conditions de validation

Pour chaque entrée : consigner un essai daté, corriger les quantités et temps observés, recalculer nutrition et coût avec des sources précises, effectuer une seconde relecture allergènes et renseigner `reviewed_at`. Le passage à un statut validé et l'éligibilité au planificateur restent deux décisions séparées.
