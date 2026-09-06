# Démarrage et images d’accueil — 5 septembre 2026

## Référence et problèmes

Ce lot part de `6bbd0ebb6ecc91133044921a53799eb5072523b7`. Les sources et le build Pages de référence ont été conservés avant modification. Les mesures distinguent la première ouverture, avec onboarding, du retour d’un utilisateur ayant déjà une semaine enregistrée.

**P2 / MOYEN — démarrage.** Certaines allocations de validation, l’initialisation du formatage décimal et la reconstruction inutile du registre vide ajoutaient du travail avant interaction. La validation des recettes reste obligatoire.

**P2 / MOYEN — images d’accueil.** La photo principale pesait 332 807 octets. Les aperçus de repas affichaient des JPEG 900 × 900 dans des cadres de 52 × 52 pixels, en concurrence avec cette photo sur une connexion limitée.

## Modifications retenues

- `view-format.ts` initialise `Intl.NumberFormat` au premier usage d’une quantité décimale. Le format français et les règles d’arrondi restent identiques.
- `recipe-validation.ts` et `planner-validation.ts` évitent les tuples d’itération et les chemins de diagnostic inutiles lorsque les chaînes sont valides. Types, indices, premier message d’erreur, doublons, allergènes et précautions sont conservés.
- `Prototype.tsx` ne reconstruit plus le registre lorsqu’un deuxième tableau vide arrive à l’hydratation. Le passage depuis ou vers des recettes personnelles conserve son fonctionnement.
- `HomeHeroImage.tsx` utilise un WebP prioritaire, puis le JPEG original si le dérivé échoue. `RecipeThumbnail.tsx` utilise les petites images des aperçus, avec repli vers le JPEG puis l’illustration de remplacement. Les grandes fiches conservent leurs images originales.
- `generate-responsive-images.mjs` produit les dérivés avant développement et builds. Les JPEG originaux et leur manifeste éditorial sont inchangés. Le redimensionnement reste proportionnel, sans recadrage ni changement de composition.

`sharp` **0.35.4** est une dépendance de développement ; aucun encodeur n’est envoyé au navigateur. Les 631 fichiers dérivés sont ignorés par Git et reconstruits en CI. Un cache local évite les réencodages inutiles. Les URL changent avec les octets sources, les options ou les versions de l’encodeur ; le petit manifeste versionné permet au build de refuser des dérivés périmés.

## Poids des images mesurés

| Ressource | Original | Dérivé |
| --- | ---: | ---: |
| Photo d’accueil | JPEG 1 200 × 1 000 ; 332 807 octets | WebP 960 × 800 ; 96 352 octets |
| 630 vignettes | JPEG 900 × 900 conservés | WebP 192 × 192 |
| Poids des vignettes | — | Médiane 7 082 ; minimum 2 534 ; maximum 11 126 octets |
| Ensemble des dérivés | — | 4 537 214 octets, dont 4 440 862 pour les vignettes |

La photo est **71 % plus légère**. Le total des dérivés correspond à l’artefact publié, pas au téléchargement initial. Les vignettes restent hors du précache et se chargent lorsqu’elles sont affichées. Le WebP d’accueil ajoute **96 352 octets, environ 96 Ko**, au précache : le JPEG de secours reste disponible hors ligne. Ce compromis augmente légèrement l’installation PWA tout en réduisant le transfert de l’accueil.

## Expériences non retenues

Les variantes de bootstrap différé et de validation des recettes dans un worker sont **écartées**. Elles ne font pas partie du lot livré. Les essais exploratoires ne sont pas des médianes :

- Bootstrap : 85 au premier lancement, mais 50 au retour avec une semaine. Les premières actions, l’hydratation, les abonnements et la récupération réseau demanderaient une nouvelle frontière applicative sans gain suffisant sur les deux parcours.
- Worker avec repli local : 78 au premier lancement, 68 au retour. Le catalogue serait dupliqué entre le worker et le repli, et des téléchargements supplémentaires précéderaient le rendu. Ce compromis ne résout pas le TBT.
- Police variable : elle augmenterait le transfert de la première ouverture de 8 588 octets et modifierait légèrement les métriques des lettres. Les polices statiques restent en place.

La trace initiale identifie du travail dans la construction du formatteur, la validation et le rendu React. Elle ne permet pas d’imputer le coût inclusif de React au runtime mobile protégé. Aucune responsabilité précise ni nécessité de modifier ce runtime n’est affirmée sans profilage supplémentaire.

## Mesures finales

Chromium 149, Lighthouse 13.4.1, réglage mobile simulé par défaut, même conteneur. **Trois passages à froid alternés par version et par parcours**, soit douze audits. Aucun build ni test navigateur local ne tourne en parallèle. Le parcours de retour utilise une vraie semaine générée, injectée dans le stockage depuis un document JSON sans exécuter préalablement l’application ; son cache reste froid.

| Médiane | Premier lancement avant | Après | Retour avec semaine avant | Après |
| --- | ---: | ---: | ---: | ---: |
| Performance | 72 | 79 | 63 | 67 |
| FCP | 2 469 ms | 2 468 ms | 2 471 ms | 2 479 ms |
| LCP | 2 932 ms | 2 932 ms | 6 173 ms | 3 632 ms |
| TBT | 800 ms | 479 ms | 424 ms | 809 ms |
| CLS | 0,0046 | 0,0046 | 0,0020 | 0,0020 |
| Accessibilité / bonnes pratiques / SEO | 100 / 100 / 100 | 100 / 100 / 100 | 100 / 100 / 100 | 100 / 100 / 100 |

L’accueil avec semaine réduit son **LCP de 41 %**. Ses images effectivement demandées passent de **946 699 à 113 689 octets (−88 %)** pour cette semaine, illustration SVG comprise. Le premier lancement n’affiche pas ces photos : son LCP reste identique.

Le JavaScript initial passe de **1 316 192 à 1 317 365 octets bruts**, et de **296 060 à 296 645 gzip** (+585 octets compressés pour les petits composants et leur manifeste). Une seule requête JavaScript initiale demeure ; les budgets précédents restent inchangés. Le précache Pages comporte 24 ressources, empreinte `d16ed4f9718c`.

**L’objectif 95 n’est pas atteint.** La forte variabilité CPU interdit de revendiquer un gain stable du TBT : sa médiane augmente sur le retour avec semaine malgré la réduction du LCP. Les échantillons individuels et les variantes écartées sont conservés dans `performance-demarrage-2026-09-05.json`. Les mesures ne constituent ni un INP terrain, ni une validation sur smartphone physique, ni une conformité WCAG complète. Les scores automatiques de 100 dans les trois autres catégories ne sont pas une note globale du produit.

Pour reproduire : construire chaque révision avec `npm ci` puis `npm run build:pages`, servir son `dist/pages` sous `/InflammMenu/`, et lancer Lighthouse 13.4.1 avec Chromium 149, profil mobile simulé par défaut et navigateur neuf à chaque passage. Pour le retour, générer la semaine de la fixture décrite dans le JSON avec le moteur de cette révision, puis charger le stockage avant l’audit, sans précacher l’application. Alterner les révisions et conserver tous les passages. La semaine de la fixture était active le 5 septembre 2026 ; lors d’une campagne ultérieure, utiliser une semaine courante dans les deux versions pour éviter l’archivage automatique, et documenter cette nouvelle fixture.

## Tests et vérifications locales

Tests ajoutés ou renforcés :

- Trois tests catalogue protègent les rejets, les indices, les diagnostics et les contrôles alimentaires de la validation optimisée.
- Six tests d’images couvrent les chemins root/Pages, les chemins interdits, le versionnement, les proportions, la préservation des masters, la réutilisation du cache et la reconstruction d’un dérivé supprimé.
- Un parcours navigateur vérifie le chargement des dérivés puis les replis JPEG après panne, avec conservation des données.
- Les tests de précache et PWA vérifient le WebP d’accueil hors ligne et l’exclusion des vignettes. Le gate de build exige le fichier et sa présence dans le précache.

- `npm run test:release` : **216 tests Node réussis**, dont les 180 plans complets de référence ; validations du catalogue, des restrictions, de la nutrition et des 630 photos originales réussies.
- `npm run test:sites` : build Sites et **5 tests worker/confidentialité** réussis.
- `npm run build:pages` : TypeScript, budgets de poids, précache et 28 fichiers runtime protégés conformes.
- Suite PWA sur ce build Pages : **9 tests réussis**, dont le WebP d’accueil hors ligne, les mises à jour interrompues et la conservation des données.
- Vérification responsive : **12 vues** (onboarding et accueil avec semaine) à 320/375/390/430/768/1440 px, aucun débordement ni erreur console/réseau ; quatre analyses Axe sans violation automatique. Les captures mobile/desktop conservent la composition visuelle attendue.
- `npm run audit:production` et audit npm complet, dépendances de développement comprises : aucune vulnérabilité signalée.

La suite Chromium locale a subi une interruption avant son terme et trois délais de 20 s dépassés sur des parcours longs. Les parcours interrompus ont été repris ; suppression personnelle et récupération fatale réussissent avec le délai habituel. L’import/export à deux onglets réussit avec un délai de diagnostic local de 45 s, toutes ses assertions inchangées. **Aucun délai ni test du dépôt n’a été assoupli** : la CI reste la validation globale du commit, notamment sur WebKit. Le nouveau test de repli d’images réussit.

## Validation GitHub

La PR doit réexécuter sur le commit publié la suite complète, notamment Chromium/WebKit, les builds Sites/Pages et la PWA. Son dernier check indique le résultat exact du commit. Aucun déploiement ni fusion dans `main` dans ce lot.

## Suite par priorité

- **P2 / MOYEN** : profiler de nouveau le rendu et les effets du démarrage avec une semaine, puis réduire les longues tâches démontrées. Ne pas déplacer une attente sur le premier bouton ni supprimer la validation pour améliorer artificiellement le score.
- **P2 / MOYEN** : réévaluer une séparation entre accueil, moteur et données après ce profilage, avec contrôle des coûts réseau, du repli hors ligne et des données concurrentes. Les expériences de ce lot ne justifient pas une adoption.
- **P2 / MOYEN** : compléter les mesures sur smartphone physique et les interactions (INP terrain), puis vérifier l’origine réellement déployée après fusion/publication autorisée.
- **P3 / FAIBLE** : les autres images de cartes restent candidates à des tailles adaptées à leur affichage, une fois le coût de démarrage traité.

## Limites et sécurité

Le changement ne supprime pas le coût du JavaScript initial ni toutes les longues tâches. Les navigateurs ne décodant pas le WebP utilisent le JPEG ; les images personnelles hors du registre connu conservent aussi leur source. Les contrôles d’import, la CSP, les filtres alimentaires, le stockage et les données utilisateur restent inchangés. Une éventuelle nouvelle séparation du démarrage devra être évaluée sur les deux parcours et sur appareil réel avant adoption.
