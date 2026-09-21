# Écrans différés, cuisine et mesures — 21 septembre 2026

Le profil, les informations et l’éditeur personnel sont chargés à leur première
ouverture. Leur précache conserve cette première ouverture hors ligne après
installation. La récupération après un échec d’import exige une sauvegarde durable
vérifiée et s’annule si les données ou la navigation changent. Les étapes du mode
cuisine ont des clés uniques et leurs styles sont regroupés, avec les mêmes
commandes de 44 × 44 px.

## Référence et méthode

- Avant : `cfe5f46f319c854db80586cd3efe008bdbb2822b` ; après :
  `aa7bd697ef5e331be8be9888e32ac08d1e1d4139` pour le code applicatif.
- Deux builds Pages figés, serveur local identique, gzip niveau 6 précalculé,
  service worker réel. Le worker de référence correspond exactement à celui
  publié : version `8595bb76f0f4`, SHA256
  `e454af59e3af4366df5bcc6445b4d2604d3ee14ccd294f57f59e3a791b3ea0ae`.
  Une première campagne contenant un fichier de test résiduel a été écartée
  entièrement ; seuls les résultats de la nouvelle campagne propre sont retenus.
- Lighthouse 13.4.1, Chrome Headless Shell 149.0.7827.55 : trois passages par
  version et parcours, ordre alterné, soit douze audits. Chaque passage utilise
  un nouveau navigateur. Le « retour avec semaine » possède des données locales
  synthétiques, mais un **cache froid** : ce n’est pas une PWA déjà installée.
- Profil mobile Lighthouse : 412 × 823, DPR 1,75, réseau simulé 1638 kb/s et
  latence 150 ms, CPU ×4. Les interactions utilisent séparément 390 × 844,
  DPR 1 et CPU ×4, sans ralentissement réseau, après installation du shell.
- Aucun build ou test local concurrent. Même profil, mêmes recettes et mêmes
  plans vérifiés ; aucune erreur réseau, console ou image. Les images sont
  vérifiées après l’audit, sans modifier ses mesures.

L’outillage et les commandes sont dans [tools/lighthouse](../tools/lighthouse/README.md).
Les empreintes des builds et toutes les valeurs individuelles figurent dans
les [mesures Lighthouse](performance-2026-09-21/lighthouse-summary.json) et les
[mesures d’interactions](performance-2026-09-21/interactions-summary.json).

## Taille réellement nécessaire au démarrage

| JavaScript | Avant | Après | Écart |
| --- | ---: | ---: | ---: |
| Fichier d’entrée seul, octets bruts | 731 059 | 343 140 | −53,1 % |
| Tous les scripts du démarrage, octets bruts | 2 170 815 | 2 141 936 | **−1,3 %** |
| Transfert gzip de ces scripts, en-têtes locaux inclus | 402 469 | 398 386 | −1,0 % |

Le fichier principal a aussi été redistribué vers des modules partagés. Sa baisse
de 53 % ne représente donc pas la baisse totale. Le total inclut les modules
préchargés et les imports bloquants du planificateur et du validateur, observés
dans les douze audits ; [liste complète](performance-2026-09-21/startup-resources.json).
Le trafic de précache du service worker est distinct : les écrans secondaires
restent téléchargés en arrière-plan pour le hors-ligne.

## Résultats Lighthouse

Médianes ; les intervalles entre parenthèses couvrent les trois passages.

| Parcours à cache froid | Performance avant | Performance après | LCP avant → après | TBT avant → après |
| --- | ---: | ---: | ---: | ---: |
| Premier lancement | 76 (60–82) | 85 (83–85) | 3,66 → 3,48 s | 342 → 136 ms |
| Accueil avec semaine | 46 (42–67) | 55 (51–64) | 7,89 → 7,98 s | 1184 → 639 ms |

Accessibilité, bonnes pratiques et SEO obtiennent 100 dans les douze audits.
L’objectif de performance 95 **n’est pas atteint**. Ces notes automatiques ne
constituent pas une certification d’accessibilité.

La variabilité est forte : l’indice CPU va de 1309,5 à 2221. La troisième paire
sur l’accueil passe de 67 à 51, à l’inverse des deux premières. Les médianes sont
des observations, **pas la preuve d’un gain causal de neuf points**. Le LCP de
l’accueil ne s’améliore pas dans cette campagne.

## Catalogue et génération

Trois paires avant/après, soit six passages. Le catalogue est froid à sa première
ouverture ; le délai va du clic aux premières cartes et textes affichés, sans
attendre toutes les photos. Leur chargement se termine avant de mesurer la
génération. Celle-ci inclut son délai applicatif de 50 ms et le rendu visible.

| Mesure | Avant, médiane (min–max) | Après, médiane (min–max) |
| --- | ---: | ---: |
| Catalogue visible | 1928 ms (1150–3435) | 1510 ms (1364–1784) |
| Semaine prête | 671 ms (628–796) | 657 ms (643–685) |
| Plus longue tâche pendant la génération | 596 ms | 571 ms |

Le moteur et le catalogue sont inchangés. Les plages se recouvrent : aucune
accélération du moteur n’est démontrée. Les plans produits sont strictement
identiques, hormis leur horodatage de génération. Le catalogue pèse 9 729 446
octets décompressés et 730 110 octets gzip servis. ResourceTiming affiche un
transfert nul à travers la réponse du service worker ; les requêtes du serveur
confirment le téléchargement. Aucun JSON du catalogue complet n’est téléchargé
pendant les audits du démarrage.

## Coûts restant à traiter

Les photos représentent environ 968 ko sur 1,45 Mo transféré au retour avec
semaine. Deux images de 900 × 900 affichées en 52 × 52 représentent environ
635 ko. La grande photo d’accueil est l’élément LCP identifié par Lighthouse ;
elle est découverte après le JavaScript. Des images adaptées constituent donc
une piste prioritaire, à mesurer lors d’un changement séparé.

La projection du planificateur reste dans le chemin critique. Des longues tâches
persistent, dont environ 0,6 s pendant la génération sous CPU ×4. Le découpage
des écrans ne résout pas ces coûts. L’hébergement public, un téléphone physique,
l’INP réel et un retour avec cache chaud ne sont pas mesurés ici.

## Vérifications des changements

Localement : 245 tests unitaires/données, 5 tests worker/confidentialité,
11 nouveaux parcours Chromium, 10 scénarios PWA et 9 tests de l’outillage de
mesure réussis. Les compilations, le garde du découpage et l’intégrité des
28 fichiers protégés passent. Les recettes, images, moteur et stockage ne sont
pas modifiés. La suite complète Chromium/WebKit et la publication sont vérifiées
par la CI de la PR puis de `main`.
