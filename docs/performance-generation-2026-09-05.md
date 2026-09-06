# Performance de la génération — 5 septembre 2026

## Référence et objectif

Ce lot part de `5d2df80c74a9eba82aab470fe28e0cc6dc95d73c`, après la suppression de l'attente réseau au démarrage. Sources et build Pages de cette version ont été figés avant modification. L'objectif est de réduire le calcul de la semaine sans changer les repas choisis, les filtres, les coûts, les portions, les préférences ni la persistance.

## Problèmes trouvés

**P2 / MOYEN, `src/engine.ts`.** Le profilage CPU a identifié des recalculs dans la sélection des recettes :

1. `selectSeededWeeklyCandidate` rappelait la fonction de score dans chaque comparaison du tri, puis à nouveau pour construire la sélection finale.
2. `hasTag` répétait les mêmes correspondances de catégories pour une recette inchangée, en recréant aussi des tableaux et des fonctions pendant la recherche.
3. La recherche d'économies recomptait la diversité d'un même jour pour chaque candidat, alors que son résultat ne dépend que de la forme du plat candidat.

Ces opérations répétées prolongeaient le travail sur le thread principal et immobilisaient l'interface pendant la génération, surtout avec un grand foyer ou un budget contraint.

## Corrections et limites des caches

- Le score est calculé **une fois par candidat et par sélection**. Ordre du tri, départage des égalités, tolérance et graine restent identiques. Aucun score n'est réutilisé pour un autre créneau.
- Les correspondances de catégories sont mémorisées avec une `WeakMap` attachée à l'objet recette. Une recette personnelle modifiée crée un nouvel objet, même si elle conserve son identifiant : son classement est recalculé. Les résultats ne contiennent aucune décision liée au profil utilisateur.
- Pendant une recherche d'économies, le nombre de conflits avant remplacement est calculé une fois par repas. Le résultat après remplacement est calculé une fois par forme de plat. Ces valeurs sont abandonnées avant l'itération suivante, dès que le menu peut avoir changé.

Les filtres de sécurité, coefficients du classement, menus verrouillés, substitutions et règles budgétaires n'ont pas été modifiés. Aucune dépendance ajoutée, aucun changement de stockage, aucune migration, aucun fichier du runtime protégé modifié.

## Mesure dans le navigateur

Chromium 149, viewport 390 × 844, ralentissement CPU ×4. Trois passages alternés par version et par profil, contexte neuf à chaque parcours, même date et mêmes profils, aucun autre test ni build simultané. Le délai est mesuré du clic « Créer ma semaine » à l'apparition du titre de succès ; il inclut le délai existant de 50 ms et le rendu React. Les plans complets obtenus avant et après ont la même empreinte.

| Médiane | Avant | Après | Réduction |
| --- | ---: | ---: | ---: |
| Création — profil standard, 2 personnes | 1 364 ms | 541 ms | 60 % |
| Création — 8 personnes, 3 repas/jour, budget 80 € | 2 371 ms | 1 047 ms | 56 % |
| Plus longue tâche pendant la création — standard | 1 318 ms | 494 ms | 63 % |
| Plus longue tâche pendant la création — grand foyer | 2 302 ms | 995 ms | 57 % |

Une première collecte utilisant l'horloge de test Playwright a été écartée : son horloge ne permettait pas de rapprocher correctement les horodatages des tâches longues de ceux de l'action. La campagne retenue fige uniquement `Date`, en conservant `performance`, les timers et les observateurs natifs du navigateur.

Il s'agit de mesures de laboratoire, **pas d'un INP terrain ni d'un test sur smartphone physique**. Les tâches restantes de 0,5 à 1 seconde sous ce ralentissement restent trop longues pour une fluidité idéale ; le problème est réduit, pas entièrement résolu.

## Mesure du moteur seul

Node 24.19, sans profiler CPU pendant la mesure. Trois séries alternées avant/après, trois appels de chauffe puis vingt graines par profil et par série, aucune autre suite simultanée. Médianes de soixante calculs par profil et version ; ces durées excluent le rendu et ne sont pas interchangeables avec les mesures navigateur.

| Profil | Avant | Après |
| --- | ---: | ---: |
| standard | 123,2 ms | 9,4 ms |
| budget-serre | 141,4 ms | 20,0 ms |
| trois-repas | 140,0 ms | 13,3 ms |
| grand-foyer | 297,9 ms | 54,0 ms |
| vegetarien | 82,0 ms | 9,7 ms |
| restrictions | 108,8 ms | 12,3 ms |
| jours-personnalises | 105,6 ms | 8,5 ms |
| repas-verrouilles | 95,1 ms | 8,8 ms |
| preferences | 118,4 ms | 8,9 ms |

## Non-régression et reproductibilité

- `tests/fixtures/planner-determinism.json` contient des empreintes de plans complets capturées avec le **moteur précédent**, pour neuf profils et vingt graines chacun : standard, budget serré, trois repas, grand foyer, végétarien, restrictions, jours personnalisés, repas verrouillés et préférences.
- Neuf nouveaux tests comparent les **180 semaines** et vérifient que le profil fourni n'est pas muté. Les empreintes doivent être mises à jour uniquement après un changement volontaire et relu du catalogue ou des règles ; elles ne sont pas recalculées automatiquement à partir du moteur modifié.
- Un dixième nouveau test vérifie le classement de plusieurs versions d'une recette conservant le même identifiant, y compris le passage d'un ingrédient requis à facultatif.
- Les **111 tests moteur/nutrition** passent, ainsi que le build Pages et le contrôle du runtime protégé.
- `npm run benchmark:planner` permet de reproduire le benchmark du moteur sans dépendance supplémentaire. Le script accepte aussi un chemin vers le dossier `src` d'une version figée. Il vérifie les empreintes hors de l'intervalle mesuré et n'impose aucun seuil de temps dépendant de la machine dans les tests.
- La CI de la PR exécute également les contrôles de catalogue et de stockage, les parcours Chromium/WebKit, les builds Sites/Pages et les tests PWA/hors ligne. Les checks du commit donnent leur résultat final.

## Démarrage et suite

Le JavaScript initial Pages passe de **1 348 023 à 1 348 294 octets** (+271), soit de **303 487 à 303 586 octets gzip** (+99). Le gain de ce lot concerne le calcul, pas le téléchargement. Les budgets de build restent respectés et le précache inclut les nouveaux fichiers versionnés.

Il n'y a pas de nouvelle note Lighthouse de démarrage revendiquée pour ce lot. L'objectif de 95/100 demeure ouvert. Les prochains sujets P2 sont le découpage des écrans secondaires et la réduction du code initial ; si les longues tâches restent bloquantes sur appareil réel, évaluer l'exécution du générateur dans un worker avec annulation et contrôle des changements de profil entre onglets.

Les mesures brutes et les résultats du benchmark sont disponibles dans `performance-generation-2026-09-05.json`. Aucun déploiement ni fusion dans `main` dans ce lot.
