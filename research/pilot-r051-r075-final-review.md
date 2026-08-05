# Relecture éditoriale finale du lot r051–r075

## Décision

Les 25 recettes ont achevé leur relecture éditoriale au regard du modèle alimentaire global décrit dans `research/README.md`. Cette validation porte sur la cohérence des formulations, des données structurées, des précautions et de l'usage par le planificateur.

Elle ne constitue pas un essai culinaire : aucune recette n'est présentée comme ayant été testée physiquement. Les coûts restent estimatifs et les rendements, textures et temps doivent encore être observés en cuisine avant publication dans le catalogue principal.

L'indice sur 10 est strictement éditorial. Il décrit la place donnée aux légumes, fruits, légumineuses, céréales complètes, noix, graines et huiles insaturées, ainsi que la modération du sodium, des graisses saturées et des produits très transformés. Il ne mesure pas un effet médical et n'attribue aucun effet thérapeutique à un ingrédient.

## Résultat synthétique

- 25 recettes avec `review.stage: editorial-validated` ;
- 25 indices éditoriaux accompagnés d'une justification explicite ;
- 25 dates de relecture fixées au `2026-08-05` ;
- 22 recettes éligibles au planificateur ;
- 3 recettes volontairement inéligibles : `r054`, `r066` et `r071` ;
- 4 réserves nutritionnelles conservées dans les calculs et dans les précautions visibles : `r051`, `r052`, `r059` et `r072` ;
- allergènes du planificateur identiques à l'union des allergènes des ingrédients ;
- aucun ingrédient, aucune quantité et aucune étape modifiés pendant cette relecture.

## Scores et décisions par recette

| ID | Score | Éligible | Décision éditoriale |
|---|---:|:---:|---|
| r051 | 8,5 | oui | Profil avoine, poire et noisettes cohérent; réserve technique sur les sucres du romarin conservée. |
| r052 | 8,8 | oui | Quinoa, fruit, soja et sésame variés; réserve technique sur les sucres de la cardamome conservée. |
| r053 | 8,7 | oui | Millet, fruit, soja et graines forment un petit-déjeuner complet. |
| r054 | 7,2 | non | Seigle complet, haricots et crudités intéressants, mais sodium estimé à environ 731 mg par portion. |
| r055 | 8,8 | oui | Petit-déjeuner salé à base de légumineuse, poireau et huile d'olive. |
| r056 | 8,3 | oui | Amarante, cerises et amandes; allergène fruits à coque visible. |
| r057 | 8,6 | oui | Sarrasin, prunes et sésame; protocole de trempage au froid maintenu. |
| r058 | 8,5 | oui | Avoine, courgette et œuf; avertissement pour l'œuf peu cuit maintenu. |
| r059 | 8,6 | oui | Fruit entier, chia, chanvre et soja; réserve technique sur les sucres du chia conservée. |
| r060 | 8,2 | oui | Orge, poire et noix; gluten, fruits à coque et dosage de muscade visibles. |
| r061 | 8,0 | oui | Teff, mûres et yaourt; allergènes œuf et lait visibles, données teff issues du repli USDA. |
| r062 | 8,3 | oui | Tofu et légumes variés; teneur en sel variable des olives signalée. |
| r063 | 7,8 | oui | Seigle, poire et noix; sodium et graisses saturées modèrent le score. |
| r064 | 8,5 | oui | Quinoa, carotte, agrume et graines; dosage du gingembre reste culinaire. |
| r065 | 8,5 | oui | Millet, pomme, soja et sésame; option de préparation anticipée. |
| r066 | 8,7 | non | Profil alimentaire cohérent, mais gaufrier absent du vocabulaire matériel. |
| r067 | 8,2 | oui | Riz complet, soja, poire et pistaches; précaution sur le dosage du safran conservée. |
| r068 | 8,2 | oui | Avoine, abricot, carotte et tournesol; gluten et lait visibles. |
| r069 | 8,3 | oui | Sarrasin, pomme et noix; allergènes œuf et fruits à coque visibles. |
| r070 | 8,5 | oui | Patate douce, yaourt, grenade, graines et huile d'olive; lait visible. |
| r071 | 7,8 | non | Salade légère seule; interaction pamplemousse–médicaments maintenue très visible. |
| r072 | 8,2 | oui | Chia, cerises, noisettes et cacao non sucré; réserve technique sur les sucres du chia conservée. |
| r073 | 8,7 | oui | Maïs, haricots noirs, avocat et tomate forment un petit-déjeuner complet et généreux. |
| r074 | 8,8 | oui | Avoine, champignons, chou kale et huile d'olive; gluten visible selon l'avoine. |
| r075 | 8,1 | oui | Yaourt, nectarine, lin et amandes; lait et fruits à coque visibles. |

## Réserves nutritionnelles maintenues

Trois aliments possèdent un profil officiel utilisable, mais sans valeur de sucres totaux dans Ciqual 2025 et USDA SR Legacy. Une valeur technique à `0` est donc utilisée uniquement pour permettre le calcul, avec la mention qu'elle peut sous-estimer légèrement les sucres :

- romarin frais dans `r051` ;
- cardamome moulue dans `r052` ;
- graines de chia dans `r059` et `r072`.

Les quatre recettes portent le statut nutritionnel `calculated-with-cautions`. La réserve figure dans `nutrition_par_portion.estimation.cautions` et dans `app.review.caution`; elle n'est pas masquée par la validation éditoriale.

## Exclusions du planificateur

### r054 — sodium

La tartine apporte environ 731 mg de sodium par portion selon les références actuelles. Elle reste un concept éditorial cohérent, mais n'entre pas dans le générateur tant qu'une variante moins salée n'a pas été formulée et recalculée.

### r066 — matériel

La recette exige un gaufrier. Cet équipement n'existe pas dans le vocabulaire actuellement reconnu par l'application; elle reste donc inéligible même si son profil alimentaire est cohérent.

### r071 — pamplemousse et composition du repas

Le pamplemousse peut interagir avec de nombreux médicaments. Comme le profil utilisateur ne gère pas ce type de traitement et que la salade est légère comme petit-déjeuner autonome, la recette reste hors du planificateur. La substitution doit rester clairement proposée aux personnes concernées.

## Vérifications exécutées

- validateur final dédié : 25 recettes, 22 éligibles et 4 réserves nutritionnelles conservées ;
- validation du catalogue publié : 50 recettes et 50 identifiants uniques ;
- tests du catalogue et du schéma : 12 réussites sur 12 ;
- tests du moteur de menus et de la liste de courses : 5 réussites sur 5 ;
- comparaison automatique avec le fichier nutritionnel : titres, temps, portions, ingrédients, étapes et substitutions inchangés.

Le lot final reste dans `research/` et n'est pas intégré à `src/data/recettes-anti-inflammatoires.json`.
