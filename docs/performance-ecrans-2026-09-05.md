# Chargement des écrans secondaires — 5 septembre 2026

## Référence et problème

Ce lot part de `84bfdad16f2bc25b44135597f8e2185005939fc5`, après l’optimisation du moteur de génération. Les sources et le build Pages ont été figés avant modification.

**P2 / MOYEN — `src/Prototype.tsx`.** Le profil, les informations et l’éditeur personnel étaient chargés et analysés avec l’accueil, même sans être ouverts. Le fichier concentrait aussi leurs formulaires, sauvegardes et confirmations. L’objectif est de retirer ce travail du démarrage en conservant leurs règles, leur navigation et leur fonctionnement hors ligne.

## Modification retenue

- `ProfileView.tsx`, `InformationView.tsx` et `CustomRecipeView.tsx` contiennent les écrans existants. Le corps des composants a été comparé au précédent : seules leurs frontières d’import/export et la transmission explicite de `recipeById` au profil changent.
- `secondary-views.ts` constitue **un seul point d’entrée différé**. Le premier écran ouvert charge ce groupe ; les suivants réutilisent le module. Cela conserve **une seule requête JavaScript initiale** et évite plusieurs fragments partagés bloquants.
- `view-format.ts` et `ConfirmActionDialog.tsx` regroupent les fonctions de présentation et la confirmation communes, sans import inverse des vues vers `Prototype.tsx`. Les mutations restent dans `AppShell`, via l’état courant et les mises à jour fonctionnelles. `LiveAppState`, la clé du profil, les validations, les garde-fous d’édition et le registre des recettes sont conservés.
- `deferred-screen.tsx` annonce le chargement, garde le bouton Retour accessible et transmet le focus du titre temporaire au vrai titre lorsque le téléchargement finit après la transition. Il ne prend pas le focus du bouton Retour ni d’un autre écran. Une résolution après démontage n’ouvre rien et n’écrit aucune donnée.
- Le précache contient le groupe différé. Le validateur de build exige sa présence hors ligne, interdit son préchargement initial et abaisse les budgets à **1 335 000 octets bruts / 302 000 gzip**, avec une marge sur la version courante.

Aucune modification du modèle de données, du moteur, du catalogue, de la stack, des dépendances, des styles ou des 28 fichiers protégés. Les contenus santé et leurs liens restent identiques. Aucune migration.

## Échecs détectés avant livraison

### Trop de fragments initiaux

Une première extraction avec trois entrées séparées faisait apparaître quatre modules partagés supplémentaires dans les préchargements initiaux. Sur trois mesures alternées par version, le FCP médian passait de 2 459 à 2 786 ms, et le LCP de 2 925 à 3 102 ms. Cette variante a été **écartée**, malgré sa baisse de poids. Le groupe unique conserve la séparation des fichiers sources sans cette multiplication des requêtes initiales.

### Réessai d’import inefficace

Deux nouveaux tests ont reproduit l’échec d’un bouton « Réessayer » : Chromium peut conserver un échec d’import ESM pendant toute la vie du document, même après suppression de la promesse applicative rejetée. Une nouvelle invocation ne suffit donc pas à garantir une seconde requête.

La version finale propose **« Recharger l’application »**, explicitement. Avant le rechargement, l’application vérifie qu’au moins une copie durable couvre l’état courant. Si un changement récent n’a pas été sauvegardé, si l’état a changé pendant l’attente, ou si l’utilisateur a quitté l’écran, elle ne recharge pas. Une panne des deux stockages avec une note encore non enregistrée est couverte par un test : la note reste accessible en mémoire. Une copie déjà durable et identique reste suffisante, même si une écriture supplémentaire échoue.

Le groupe commun implique qu’une panne de son premier téléchargement se produit avant l’ouverture du formulaire concerné. Les informations n’exigent plus de nouveau téléchargement après ouverture du profil. Aucun contournement de cache par URL construite, aucune duplication de bundle ni réinitialisation des données.

## Poids avant/après

Mesure des fichiers réellement produits, y compris tous les préchargements initiaux ; gzip Node avec les mêmes paramètres des deux côtés.

| Mesure Pages | Avant | Après |
| --- | ---: | ---: |
| JavaScript initial brut | 1 348 294 octets | 1 316 192 octets |
| JavaScript initial gzip | 303 586 octets | 296 060 octets |
| Fichiers JavaScript initiaux | 1 | 1 |
| Ensemble des modules JavaScript, gzip | 335 611 octets | 338 182 octets |
| Références dans le précache | 22 | 23 |

Le gain initial est de **32 102 octets bruts / 7 526 gzip**, soit environ **2,5 % du transfert JavaScript compressé**. Il reste modeste. Le téléchargement total de tous les modules augmente de 2 571 octets gzip : l’installation PWA garde les écrans disponibles hors ligne. Ce lot réduit le chemin initial, pas le volume total à installer. La répartition automatique réintègre aussi le petit export calendrier au bundle initial ; le bilan ci-dessus inclut cet effet et son export hors ligne reste testé.

## Lighthouse sur le build final

Chromium 149, Lighthouse 13.4.1, configuration mobile et ralentissement simulé par défaut, même conteneur. Trois chargements à froid **alternés** par version, sans autre build ni suite navigateur locale simultanée. La dernière campagne porte sur les sources finales, y compris la récupération par rechargement et ses gardes.

| Médiane | Avant | Après |
| --- | ---: | ---: |
| Performance | 74 | 78 |
| FCP | 2 457 ms | 2 460 ms |
| LCP | 2 917 ms | 2 924 ms |
| TBT | 745 ms | 530 ms |
| CLS | 0,0046 | 0,0046 |
| Accessibilité / bonnes pratiques / SEO automatiques | 100 / 100 / 100 | 100 / 100 / 100 |

**Variabilité importante** : les scores Performance sont 74/75/70 avant et 81/78/68 après ; le dernier passage après modification est moins bon que sa référence. Le poids téléchargé baisse de façon déterministe, mais ces six mesures ne démontrent pas une accélération CPU stable. L’affichage initial est pratiquement inchangé. Aucun INP terrain, aucune validation sur smartphone physique et aucune conformité WCAG complète ne sont déduits de ces scores automatiques. L’objectif 95 n’est pas atteint.

Les résultats complets des campagnes finale et intermédiaires, tailles et empreintes des modules sont conservés dans `performance-ecrans-2026-09-05.json`, y compris les variantes non retenues.

## Tests et vérifications

**Huit nouveaux tests** : sept dans `reliability.spec.ts` et un dans `pwa-state.spec.ts`. Le test initial de démarrage/génération est également étendu aux modules secondaires.

- Deux pannes de téléchargement, depuis le profil et l’éditeur : récupération explicite, données persistées identiques, réouverture correcte et focus.
- Note modifiée non enregistrée et double panne du stockage : rechargement refusé, absence de navigation et note retrouvée en mémoire.
- Profil puis informations après coupure réseau, sans seconde requête du groupe.
- Chargement lent : transfert du focus du titre temporaire, maintien du focus sur Retour et retour anticipé sans effet tardif.
- Première ouverture du profil et des informations après passage hors ligne : modification, sauvegarde, export et persistance après rechargement. Le test PWA existant vérifie aussi la première ouverture hors ligne de l’éditeur et le recalcul nutritionnel.

Localement : 23 parcours de fiabilité ont réussi dans la suite, puis le scénario de stockage a été précisé pour créer une modification réellement non sauvegardée et a réussi isolément. Les **9 tests PWA** et les **5 tests worker/confidentialité** réussissent. Les builds Sites et Pages, TypeScript, les données générées, les budgets de bundle et le contrôle des 28 fichiers protégés passent.

La CI de la PR réexécute sur le commit publié tous les tests catalogue/moteur/nutrition/stockage, les 180 plans de référence, Chromium/WebKit, les deux builds et les tests PWA. Ses checks donnent le résultat final du commit ; le déploiement reste exclu pour cette PR.

## Suite par priorité

- **P2** : réduire les longues tâches restantes de génération, en évaluant un worker avec annulation et vérification du profil courant avant validation du résultat.
- **P2** : poursuivre l’analyse du JavaScript initial, dont la base intégrée et le runtime restent les principaux postes. Éviter les extractions qui ajoutent davantage de requêtes bloquantes que de bénéfice réel.
- **P2** : compléter les contrôles sur appareils physiques et lecteurs d’écran ; tester séparément la récupération des autres imports optionnels après une panne ESM.
- **P3** : les finitions visuelles restent secondaires tant que ces coûts et validations persistent.

Ce lot ne revendique aucune nouvelle correction de vulnérabilité. Les contrôles d’import de données, les restrictions alimentaires, la CSP et les protections de stockage sont conservés. Aucune fusion dans `main` ni publication en production.
