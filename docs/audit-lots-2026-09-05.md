# Inflamm’Menu — corrections par lots du 5 septembre 2026

Les corrections sont proposées dans la [PR n°15](https://github.com/Kikioutte/InflammMenu/pull/15). Elles conservent la stack, la navigation principale, l’identité visuelle et les données existantes. La branche principale n’a pas été fusionnée ni déployée.

La baseline initiale reste `6b58fdc9753f09243e7ed7a749acbf7c77834e16`. Les [constats avant modification](baseline-2026-09-05.md) et le [premier audit avec corrections](audit-2026-09-05.md) sont conservés comme historique. Le présent rapport les complète et remplace leurs valeurs « après » lorsqu’une nouvelle mesure est indiquée.

## État initial et périmètre

Application culinaire française locale : React 19, TypeScript strict, Vite 8, Radix, navigation FlowStack et PWA. Aucun compte, serveur de données personnelles ou appel à une IA pour générer les menus. Le profil, les semaines, les recettes personnelles, les favoris, les notes et les courses persistent dans localStorage et IndexedDB avec révisions, migrations et synchronisation entre onglets.

Le catalogue contient 630 recettes, dont 624 visibles après retrait de six doublons. Le générateur utilise 363 recettes : 36 historiques et 327 issues du catalogue. Les 80 recettes Creami restent consultables, sans être injectées dans les menus.

Les fonctions conservées comprennent l’onboarding, les contraintes alimentaires et quotidiennes, les semaines actuelle et suivante, les verrouillages, remplacements et déplacements, les repas extérieurs, les restes, les portions, le suivi « cuisiné », les courses et le mode magasin, la réserve quantitative, la recherche et les filtres, les préférences, les notes, l’historique, la personnalisation, les sauvegardes/restaurations, l’export calendrier, le texte agrandi, les rappels locaux et l’installation hors ligne.

L’architecture possède déjà de bons garde-fous : moteur déterministe, validation du catalogue, contrôle des imports, tests métier et de concurrence, verrouillage des dépendances, CI et budgets de build. Ses faiblesses principales restent le poids du JavaScript initial et la concentration de responsabilités dans `Prototype.tsx`, `engine.ts` et `storage.ts`.

## Problèmes trouvés, causes et conséquences

| Priorité / gravité | Fichier ou composant | Cause observée | Conséquence | État |
| --- | --- | --- | --- | --- |
| P0 / CRITIQUE | `storage.ts`, récupération | Une donnée illisible ou future pouvait être assimilée à une absence de données | Écrasement de données locales existantes | Corrigé dans le premier lot ; protections et tests conservés |
| P1 / ÉLEVÉ | `Prototype.tsx`, recette personnelle | Remplacement avant validation d’une recette vidée | Perte de la version précédente, incohérence avec notes/favoris | Corrigé ; nouvelles validations ajoutées |
| P1 / ÉLEVÉ | Moteur, profil, substitutions | Restrictions libres incomplètement résolues ; retrait d’une substitution insuffisamment revalidé | Aliment exclu ou allergène réintroduit dans les repas/restes | Corrigé dans le premier audit |
| P1 / ÉLEVÉ | `Prototype.tsx`, rappels | Lecture de la date du rappel hors du garde-fou de stockage | Exception au démarrage si cette lecture est refusée | Corrigé |
| P1 / ÉLEVÉ | `public/sw.js` | Le worker actif remplaçait son HTML hors ligne par celui d’une version dont les assets n’étaient pas encore installés | Application hors ligne cassée après mise à jour interrompue | Corrigé ; fallback ajouté pour erreur serveur sur la navigation canonique |
| P1 / ÉLEVÉ | Courses, montant réel | Conversion/réécriture à chaque caractère saisi | « 72,50 » pouvait devenir 7 250 au lieu de 72,50 ; une valeur invalide pouvait effacer le montant antérieur | Corrigé |
| P1 / ÉLEVÉ | Profil, édition personnelle | Champs vides convertis en zéro ou remplacés silencieusement par une valeur par défaut | Budget, durée ou recette modifiés involontairement | Corrigé avec erreurs liées aux champs |
| P2 / MOYEN | Édition personnelle, nutrition | Les calories/protéines/fibres restaient celles de la recette initiale malgré des quantités différentes | Repères inexacts pour la variante | Corrigé pour 299 recettes du générateur ; limite explicite pour les autres |
| P2 / MOYEN | Plans actifs, coût | Coût enregistré dans le plan non actualisé après changement de la recette personnelle | Budget actuel et prochain périmé | Corrigé ; historique et dépenses réelles préservés |
| P2 / MOYEN | Fiche d’un repas substitué | Valeurs de la recette avant substitution sans contexte suffisamment spécifique | Confusion sur les valeurs du remplacement | Atténué par un libellé explicite ; calcul spécifique restant |
| P2 / MOYEN | `prototype.css`, commandes +/− | Colonne centrale fixe de 28 px, boutons 34 px et réduction visuelle sur certaines fiches | Quantités « 0,25 », « 0,01 » et « 112,5 » coupées ; commandes peu confortables | Corrigé : largeur selon le contenu, cibles 44 × 44 px |
| P2 / MOYEN | `catalog.ts` | Import statique de la liste autorisée des images | Données du catalogue évaluées avant ouverture du catalogue | Corrigé par chargement différé ; liste de sécurité conservée |
| P2 / MOYEN | `public/sw.js` | Assets déjà précachés téléchargés une seconde fois à l’installation | Requêtes et transfert inutiles | Corrigé |
| P2 / MOYEN | Catalogue, profil, courses | Favori local périmé, recherche sans réinitialisation utile, état sélectionné insuffisamment exposé | Navigation et retour d’action incohérents | Corrections du premier audit conservées |
| P2 / MOYEN | `storage.ts`, images restaurées | Chemin d’image lié à l’ancienne adresse de déploiement | Photos remplacées par le visuel de repli après transfert d’une sauvegarde | Corrigé : asset validé résolu sous l’adresse actuelle |
| P2 / MOYEN | `tests/app-v1.spec.ts` | Le scénario choisissait une recette fixe après une génération dépendant de l’heure réelle | Échec aléatoire lorsque cette recette était déjà planifiée | Corrigé : horloge fixe et vérification supplémentaire du refus des doublons |
| P2 / MOYEN | Bundle initial | Nombreux écrans et données de planification évalués au démarrage | Travail bloquant ; objectif Performance 95 non atteint | Partiellement amélioré ; chantier restant |
| P2 / MOYEN | Hébergement GitHub Pages | Stockage partagé par origine, et non isolé par dossier de projet | Un autre projet compromis sur la même origine pourrait lire les données | Risque restant, documenté ; domaine dédié à décider |
| P2 / MOYEN | Organisation du code | Fichiers centraux volumineux et responsabilités imbriquées | Évolutions difficiles à relire et à isoler | Extractions ciblées uniquement ; dette restante |
| P3 / FAIBLE | Unités et quantités | Identifiants d’unités ou séparateurs peu adaptés au français | Lecture moins naturelle et précision affichée insuffisante | Corrigé sur les parcours concernés |

Aucune nouvelle injection XSS critique n’a été confirmée. Les problèmes de restrictions alimentaires relèvent de la sécurité fonctionnelle, pas d’une exécution de code.

## Modifications par lots

1. **Démarrage résilient.** La lecture du marqueur de rappel est protégée. Le refus de ce stockage ne bloque ni le démarrage ni les autres données. Le garde-fou quotidien en mémoire reste actif.
2. **Mises à jour PWA cohérentes.** Le document hors ligne reste associé aux assets installés avec sa version. Une navigation en ligne peut afficher le nouveau document sans corrompre l’ancienne copie hors ligne. Une réponse serveur 5xx sur l’entrée canonique utilise la copie disponible ; les autres routes conservent leur réponse. Le précache ne retélécharge plus ses propres entrées.
3. **Chargement du catalogue.** La liste autorisée des images passe dans un module différé. Les chemins restent strictement validés ; le placeholder existant sert tant que la liste n’est pas disponible. Aucun domaine d’images supplémentaire n’est autorisé.
4. **Saisie et quantités fiables.** Un montant conserve son brouillon pendant la saisie, accepte la virgule et n’écrase pas l’ancien montant si la valeur est invalide. Les données sauvegardées ne sont pas arrondies par le formatage d’affichage. Les petites unités évoluent par quarts, les grammes/millilitres par pas de cinq. Les champs obligatoires, les limites et les minutes entières sont validés avant sauvegarde. Les erreurs ont un libellé, un état invalide et un focus adapté.
5. **Nutrition et coûts des variantes.** Un générateur vérifie les correspondances nutritionnelles déjà relues du dépôt et produit une table chargée à la demande. Les quantités reconnues recalculent calories, protéines et fibres ; aucun prix d’ingrédient n’est inventé. Le coût par portion est ajustable dans l’éditeur. Les semaines actives sont réévaluées avec le registre courant, en conservant les repas, l’historique et les montants dépensés. Les données absentes ou dépassant les limites ne déclenchent pas de recalcul partiel ni de boucle d’écriture.
6. **Repères après substitution.** La fiche précise que les valeurs affichées concernent la recette avant substitution et ne sont pas recalculées pour les ingrédients de remplacement.
7. **Lisibilité et commandes tactiles.** Les steppers s’adaptent à la longueur des valeurs ; les libellés peuvent revenir à la ligne sans pousser les commandes hors écran. Les boutons mesurent 44 × 44 px, y compris sur les fiches auparavant réduites par une transformation CSS.

8. **Images après restauration.** Le chemin validé d’une image personnelle est résolu sous la base de l’application actuelle. Une sauvegarde issue d’une adresse à la racine ou d’un ancien sous-dossier conserve ainsi ses photos sur GitHub Pages. Les protocoles externes et traversées de chemin restent rejetés ; aucune recette n’est supprimée pour une image invalide.

Un commit de tests distinct rend reproductible le placement d’une recette du catalogue. Le test ne force pas le clic et ne contourne pas la protection métier : il vérifie successivement un placement autorisé, puis le refus du doublon.

## Nutrition : provenance, compatibilité et limites

La nouvelle table repose sur les fichiers Ciqual et les compléments USDA déjà présents dans le dépôt, avec correspondances validées et provenance conservée. Le générateur refuse les identifiants, unités, aliments, masses ou totaux incohérents avec les données relues. Les données publiées des **299 recettes couvertes** sont comparées aux résultats recalculés dans les tests. La [table Ciqual 2025 de l’Anses](https://ciqual.anses.fr/cms/fr/la-table-ciqual-2025) est la référence principale, sans nouvelle requête nutritionnelle envoyée depuis l’application.

Il reste **64 recettes sur les 363 du générateur** sans base suffisamment complète pour ce recalcul : 28 recettes projetées et 36 historiques. Leur sauvegarde reste possible, avec un message indiquant que les repères ne sont pas recalculés. Une impossibilité de charger le module conserve également la recette et affiche cette limite. Le recalcul fonctionne hors ligne une fois la PWA installée.

L’indicateur optionnel `nutritionRecalculated` est rétrocompatible avec les données v3. Les anciennes valeurs nutritionnelles ne sont pas migrées ni recalculées automatiquement. Seuls les chemins d’assets validés suivent l’adresse actuelle lors de la normalisation. Les sauvegardes conservent cet indicateur lorsqu’il existe. Les variantes d’une variante restent reconnues ; les ingrédients inconnus, unités modifiées, doublons et valeurs hors limites ne reçoivent pas de faux résultat.

Ces chiffres restent des estimations culinaires, pas un diagnostic ni une prescription. Les substitutions planifiées demanderaient leurs propres correspondances nutritionnelles. Le prix reste manuel, faute de source de prix par ingrédient fiable et représentative. Les avertissements sont placés près de l’information concernée.

## Commandes et tests exécutés

Installation : `npm ci`. Développement : `npm run dev`. Builds : `npm run build` et `npm run build:pages`. Contrôle statique : TypeScript strict via les builds ; aucun script de lint dédié n’existe. Les validateurs de données, images, génération et budget de bundle restent actifs.

La [CI complète du code avant le dernier correctif de chemin d’image](https://github.com/Kikioutte/InflammMenu/actions/runs/33956784051) a réussi sur `f0f7f5cadd1d4be5fdabc74bfb94d352806c10b2`. Le dernier correctif est ensuite vérifié par les 36 tests de stockage, le build Pages et le parcours PWA de restauration/recalcul hors ligne. La CI relance les mêmes gates sur le commit final ; son statut est accessible dans les [contrôles de la PR](https://github.com/Kikioutte/InflammMenu/pull/15/checks).

| Vérification | Résultat confirmé |
| --- | --- |
| Installation verrouillée en CI | Réussie ; aucune nouvelle dépendance produit, lockfile inchangé |
| `npm run test:release` | 197 tests Node réussis : 39 catalogue/schéma, 101 moteur/nutrition, 36 stockage, 3 fusion, 16 service worker, 2 workflows ; validateurs et 630 images réussis |
| `npm run test:browser` | 100 parcours réussis : 94 Chromium et 6 WebKit de contrôle |
| `npm run test:sites` | Build alternatif réussi, 5 tests worker/confidentialité réussis |
| `npm run build:pages` | TypeScript, validation nutritionnelle, assets et budget réussis ; 25 ressources dans le précache |
| `npm run test:pwa:built` | 8 parcours réussis sur le vrai build Pages |
| `npm run audit:production` | Aucune vulnérabilité signalée par npm |
| `npm run check:runtime` | 28 fichiers protégés conformes |
| Correctif final des images restaurées | 36 tests stockage, build Pages et parcours PWA ciblé réussis |
| Responsive final | 36 vues : accueil, profil, catalogue, fiche, édition personnelle et courses à 320, 375, 390, 430, 768 et 1 440 px |
| Axe final | 12 contrôles à 390 et 1 440 px, aucune violation automatique sur les tags WCAG A/AA utilisés |
| Réseau, console et géométrie | Aucun débordement, aucune quantité coupée, aucune cible de stepper sous 44 px ; aucune erreur JS/console, HTTP ≥ 400 ou requête échouée sur les 36 vues finales |
| Répétabilité du build | Un asset sentinelle obsolète a été supprimé par le build suivant |

Les tests ajoutés ou renforcés pendant cette suite de lots couvrent : refus du stockage du rappel ; mise à jour interrompue et fallback 5xx ; absence de double téléchargement ; maintien de la liste autorisée des images ; saisie caractère par caractère de « 72,50 » ; non-écrasement après saisie invalide ; budget/durée vides ; quarts de cuillère et valeurs affichées sans découpe ; taille tactile ; provenance nutritionnelle, correspondance des 299 recettes, changement de quantité, retrait, copies successives et valeurs malformées ; indisponibilité du module ; recalcul hors ligne ; coût courant/prochain contre historique/dépense réelle ; images restaurées entre bases et refus de chemins dangereux.

Les bugs importants ont d’abord été reproduits avec des données fictives. Les tests correspondants passent après correction. Le premier passage CI de cette suite a eu **99/100** parcours réussis : le seul échec provenait du scénario à génération aléatoire déjà décrit. L’horloge est désormais fixée uniquement dans ce scénario et la protection contre les doublons y est explicitement vérifiée. Aucun test n’a été désactivé, aucun clic forcé ni seuil de sécurité abaissé.

Les tests locaux emploient un Chromium 149 d’audit ; la CI installe les versions standard de Chromium et WebKit prévues par Playwright. Les builds Sites et Pages et les mesures lourdes sont exécutés séquentiellement. Les échecs d’instrumentation ou les captures prises sur un build antérieur ne sont pas comptés comme preuves finales.

Les parcours existants de clavier, texte à 200 %, imports, quotas, concurrence entre onglets, données anciennes/corrompues, reset confirmé, sauvegarde durable, échecs du catalogue, restrictions alimentaires, restes et mises à jour restent dans les suites. Cela ne remplace pas un essai sur de vrais appareils avec VoiceOver/TalkBack.

## Performance avant/après

Trois passages mobiles à froid par version, alternés, même conteneur et même Chromium, sans autre suite locale lourde en parallèle. Ce sont des mesures de laboratoire, pas des Core Web Vitals provenant d’utilisateurs.

| Mesure | Baseline initiale retestée | Après corrections | Interprétation |
| --- | ---: | ---: | --- |
| Lighthouse Performance, médiane | 75 | 72 | −3 points ; objectif ≥ 95 non atteint |
| Lighthouse Accessibilité | 100 | 100 | Mesure automatique, pas certification WCAG |
| Lighthouse Bonnes pratiques | 100 | 100 | Ne garantit pas l’absence de vulnérabilités |
| Lighthouse SEO | 100 | 100 | Ne mesure pas l’indexation réelle |
| FCP médian | 2,744 s | 2,753 s | Quasiment stable |
| LCP médian | 3,158 s | 3,193 s | +0,035 s |
| TBT médian | 562 ms | 642 ms | Travail bloquant encore trop important |
| CLS médian | 0,0520 | 0,0046 | Environ 91 % de décalages visuels en moins |
| JavaScript initial Pages, entrée + modules préchargés | 1 366 931 octets | 1 339 272 octets | −27 659 octets, environ −2 % |
| Même JavaScript, gzip Node/zlib | 309 265 octets | 301 195 octets | −8 070 octets |
| Polices précachées | 249 252 octets | 110 584 octets | −138 668 octets, gain du premier audit |

Les scores individuels sont **75, 71, 76 avant**, puis **72, 75, 70 après**. Les distributions se recouvrent ; on ne peut pas revendiquer une accélération du rendu initial. La précédente campagne du premier audit avait donné 77 puis 73 : elle reste documentée et n’est pas mélangée à cette nouvelle série.

La campagne Lighthouse porte sur `f0f7f5c`, avec les sept premiers lots applicatifs et la correction tactile. Le dernier correctif de chemin d’image ajoute seulement 76 octets initiaux, dont 35 gzip, à cette version chronométrée ; les poids du tableau portent bien sur le code final `2c92c665`.

La table nutritionnelle ajoute environ 201 ko bruts / 18 ko gzip dans un module différé et précaché, pour permettre le recalcul hors ligne. Elle n’est pas chargée comme JavaScript initial. La suppression des téléchargements en double évite sept requêtes lors de l’installation ; la mesure contrôlée avant le dernier lot correspondait à environ 1,56 Mo de corps de réponses non compressés. Ce chiffre n’est pas présenté comme un volume exact transféré sur un serveur utilisant gzip/Brotli.

Les gains certains concernent donc les polices, les requêtes de précache, les octets initiaux et la stabilité visuelle. Le prochain travail de performance doit cibler le coût d’évaluation/rendu et les données de planification du chemin initial. Aucun INP de terrain n’a été mesuré.

## Sécurité, données et PWA

| Sujet | État | Portée |
| --- | --- | --- |
| Écrasement de données illisibles/futures | Corrigé | Valeurs d’origine récupérables, reset explicite, schéma IndexedDB futur préservé |
| Restrictions alimentaires et retour d’allergène | Corrigé | Contrôles centralisés, ingrédients facultatifs inclus, retrait de substitution revalidé |
| URLs d’images externes ou traversée de chemin | Protection conservée et testée | Le changement de base intervient après validation |
| Données nutritionnelles/quantités malformées | Protection ajoutée | Identifiants/unités/correspondances bornés et vérifiés ; aucun calcul affirmé sans données reconnues |
| XSS, injection HTML, secrets client | Aucune faille confirmée par l’audit | Textes échappés par React, imports validés et bornés ; pas de nouveau service externe |
| Dépendances de production | Aucun avis de vulnérabilité remonté par npm au contrôle CI | Pas une preuve d’absence de toute vulnérabilité |
| CSP et protections de build | Conservées | Aucun élargissement de source de script ou retrait de protection |
| Origine GitHub Pages partagée | Restant | Le dossier du projet n’isole pas les stockages des autres applications de la même origine |
| Repères après substitution et 64 recettes non couvertes | Atténué | Limites visibles ; pas de valeur de remplacement inventée |

Le service worker conserve une copie hors ligne cohérente avec ses assets, versionne le précache et permet de charger une nouvelle version. Les tests portent sur une vraie installation, une coupure réseau, la mise à jour, l’export calendrier, le catalogue et la recette personnelle. Une erreur locale ou un module facultatif indisponible n’entraîne pas la suppression des données.

Les échanges externes de comptes utilisateurs et les règles d’authentification ne s’appliquent pas à cette architecture sans compte. Les protections CORS et les en-têtes restent ceux de l’hébergement existant. Le domaine dédié recommandé dans `docs/origin-migration.md` demande une décision et une restauration vérifiée avant tout retrait de l’ancienne adresse.

## Améliorations restantes, par priorité

| Priorité | Travail restant | Pourquoi il reste ouvert |
| --- | --- | --- |
| P1 | Essais physiques iOS/Android : clavier virtuel, installation/reprise, VoiceOver/TalkBack et usage au pouce | Les tests Chromium/WebKit et les dimensions émulées ne reproduisent pas entièrement les appareils |
| P2 | Réduire le coût du démarrage jusqu’à l’objectif Performance ≥ 95 | Le bundle et le TBT restent élevés ; découpage progressif à mesurer, sans réécriture générale |
| P2 | Choisir une origine dédiée et valider le transfert des sauvegardes | Décision d’hébergement et migration utilisateur, à ne pas imposer |
| P2 | Compléter les correspondances nutritionnelles des 64 recettes restantes et des substitutions | Exige des données relues et des conversions fiables |
| P2 | Évaluer un calcul de coût par ingrédient | Une source de prix adaptée est nécessaire ; le coût manuel actuel reste explicite |
| P2 | Extraire progressivement des écrans et responsabilités du composant principal | Dette réelle ; gros refactoring unique trop risqué pour cette livraison |
| P2 | Tests d’utilisabilité avec des personnes extérieures et revue nutritionnelle spécialisée | L’audit expert ne prouve pas la compréhension spontanée de tous les utilisateurs |
| P3 | Finitions éditoriales et états secondaires après retour utilisateur | L’identité actuelle est cohérente ; éviter une refonte esthétique sans bénéfice mesuré |

Aucun P0 reproductible identifié pendant cet audit ne reste sans correction. Cela ne signifie pas que l’application ne peut plus contenir de bug. Le rapport ne présente pas les chantiers restants comme terminés.

## Évaluation critique finale

Notes d’audit expert, distinctes des scores Lighthouse et sans certification.

| Dimension | Note /100 | Réserve principale |
| --- | ---: | --- |
| UX | 89 | Validation auprès de nouveaux utilisateurs encore nécessaire |
| UI | 90 | Identité cohérente et lisible ; tous les états rares ne sont pas revus manuellement |
| Mobile | 91 | Six largeurs contrôlées ; appareils physiques à tester |
| Accessibilité | 91 | Clavier et automatisation solides ; lecteurs d’écran réels non certifiés |
| Performances | 72 | Démarrage et travail bloquant sous l’objectif |
| Sécurité | 87 | Origine partagée et absence de pentest exhaustif |
| Qualité du code | 82 | Responsabilités encore concentrées |
| Fiabilité | 92 | Beaucoup de scénarios de non-régression ; stockage navigateur et appareils restent variables |
| Maintenabilité | 82 | Modules ciblés mieux séparés, composant principal encore dense |
| Qualité globale | 86 | Produit renforcé, mais performance et validation terrain encore ouvertes |

## Traçabilité des commits de cette suite

| Commit GitHub | Objet |
| --- | --- |
| `28021378` | Refus du stockage des rappels |
| `9df18fbc` | Cohérence de la copie hors ligne et précache sans doublons |
| `2cadcae0` | Liste autorisée des images différée |
| `a632bf66` | Montants, quantités, validations et unités |
| `9c7fe12b` | Recalcul nutritionnel et coûts des semaines actives |
| `b3ef35fa` | Repères avant substitution |
| `8988c655` | Test de placement déterministe et protection des doublons |
| `f0f7f5ca` | Valeurs entières et décimales lisibles, commandes tactiles |
| `2c92c665` | Images restaurées sous la base actuelle |

Les documents de baseline et du premier audit précèdent ces neuf commits. Les preuves supplémentaires regroupent les captures finales, relevés Axe/réseau, rapports Lighthouse et journaux de tests, en complément des logs CI accessibles depuis la PR.

