# Vérification de la direction fusion — 7 septembre 2026

final result: passed

Ce résultat concerne la fidélité visuelle, les parcours manuels et les tests automatisés décrits ci-dessous. Les contrôles GitHub et le déploiement restent vérifiés séparément lors de l’intégration.

## Référence et preuves

- Vérité visuelle sélectionnée : `/Users/alexis/.codex/generated_images/01a07cb3-a6fe-7b93-a4ed-af8e808337a5/exec-bca2f506-b5bf-42a8-b132-913e4834f735.png`.
- Écran réalisé : `/Users/alexis/Documents/Codex/2026-09-06/reg/design-fusion-qa/07-builder-mobile-verified.png`.
- Comparaison simultanée référence/rendu : `../../design-fusion-qa/comparaison-mobile-finale.png`.
- Comparaisons de détail : `../../design-fusion-qa/comparaison-cartes.png` et `../../design-fusion-qa/comparaison-hero.png`.
- Catalogue compilé : `../../design-fusion-qa/10-catalogue-compile.png`.
- Récapitulatif réel : `../../design-fusion-qa/02-summary-mobile-safari.png`.
- Ordinateur : `../../design-fusion-qa/08-builder-desktop.png`.
- Petit mobile : `../../design-fusion-qa/09-builder-320.png`.

Les captures Safari sont dans le dossier `/Users/alexis/Documents/Codex/2026-09-06/reg/design-fusion-qa/`.

## Dimensions et méthode

Référence : 853 × 1844 pixels, ramenée à 390 × 844 pour la comparaison. Safari en conception adaptative : viewport CSS 390 × 844, proportions de pixels x2 affichées, zoom de présentation 78 %. Le service de capture fournit une fenêtre de 1329 × 768 pixels, pas une capture directe à la densité du viewport. La surface applicative est extraite aux coordonnées (530,165)-(799,747), puis normalisée à 390 × 844. Le léger flou du rendu comparatif vient de cette capture réduite, et n'est pas assimilé à une dégradation des photos sources.

État comparé : recette de départ « Cabillaud en papillote de chou et fenouil », aucun complément, onglet Dessert. Les recettes réelles sont conservées et triées par résultat d'association puis par titre : la crème glacée avocat-banane précède les figues. Le titre complet est conservé, contrairement au raccourci du visuel généré.

Autres tailles inspectées : 320 × 844 et 1440 × 900, dans Safari. Ce sont des viewports simulés, pas des essais sur iPhone physique.

## Constats corrigés

1. **P1 — Pied de page masqué.** Le conteneur MobileScroll est positionné en absolu par le runtime. Le placer dans un flex sans changer son positionnement masquait le récapitulatif. Correction dans le CSS applicatif : `.meal-builder-shell > .mobile-page` devient relatif et occupe l'espace restant ; footer et navigation restent hors du défilement. Vérifié par les captures 01 puis 07 et par un clic sur Courses depuis le constructeur.
2. **P2 — Densité supérieure à la maquette.** Le grand bloc sélectionné, le compteur et les marges repoussaient les titres et Ajouter sous le pied de page. Corrections successives : photographie du plat à hauteur contrôlée, compteur annoncé aux lecteurs d'écran, marges réduites, libellé d'association intégré dans le bouton d'ajout. Captures 04, 05, 06 puis 07 : les deux premiers titres et boutons sont maintenant visibles à 390 × 844.
3. **P2 — Hiérarchie des cartes du catalogue.** Les badges et durées repoussaient le nom de la recette. Le titre suit désormais immédiatement la photographie. Comparer les captures 03 et 10.
4. **P2 — Résultat vide trompeur.** Le nombre global dépendait du filtre. Le total du catalogue reste stable dans l'en-tête ; le nombre de résultats est séparé, annoncé et accompagné d'une récupération lorsque la recherche est vide.
5. **P2 — Cartes sans nom dans l'arbre Safari.** `content-visibility:auto` rendait les boutons hors champ anonymes dans l'arbre d'accessibilité observé. Désactivé pour les cartes paginées ; les noms sont désormais exposés.

Aucun P0/P1/P2 visuel restant observé dans les états contrôlés.

## Cinq surfaces de fidélité

- **Typographie :** Cormorant Garamond pour les titres et DM Sans pour les commandes, polices locales déjà présentes. Titres complets, sans ellipse. Quelques tailles sont plus grandes que le visuel généré pour améliorer la lecture ; les boutons d'ajout conservent 44 px de hauteur minimale. Ce compromis est intentionnel.
- **Disposition :** même ordre : identité, titre, plat choisi, trois onglets, recherche/filtres, propositions photographiques, récapitulatif fixe, navigation. Grille à deux colonnes sur mobile ; davantage de colonnes sur ordinateur. À 320 px, recherche et Filtres passent sur deux lignes et le contenu se parcourt par défilement.
- **Couleurs :** ivoire `#faf7f1`, olive `#4e5b32`, texte olive foncé `#29351f`, terre cuite `#a5451f`. Les états verts/orange sont aussi nommés textuellement et accompagnés d'une icône. Le focus existant reste visible.
- **Images et icônes :** photographies et logo végétal existants exclusivement ; aucun fichier de recette ou image n'a été remplacé. Icônes Radix existantes, sans nouvelle illustration simulée. Le logo de la maquette et son pictogramme d'assiette sont adaptés aux ressources déjà disponibles.
- **Texte :** « À votre table », « Complétez votre repas », « Voir mon repas ». Les associations renvoient au tableau personnel. Pas de nouveau bénéfice médical revendiqué. Le récapitulatif précise que la composition n'est ni enregistrée dans la semaine ni ajoutée aux courses.

## Parcours vérifiés manuellement dans Safari

- Catalogue : chargement des 1081 recettes visibles, recherche par nom, ouverture de fiche, accès au constructeur.
- Recherche inexistante : 0 résultat, total global conservé, bouton d'effacement restaurant 1081 résultats.
- Plat cabillaud : 105 entrées possibles ; ajout du dessert avocat-banane ; recalcul à 22 entrées ; ajout du bouillon chou-fleur/radis/laitue ; récapitulatif « Repas complet compatible », trois recettes, associations orange et détails consultables.
- Modification du plat après composition : propositions recalculées avec l'entrée et le dessert restants.
- Filtre Tout vert sur une sélection orange : 0 proposition, aucune dérogation ; remise à zéro : retour des trois desserts autorisés.
- Navigation Courses depuis le constructeur : retour effectif à l'écran principal des courses.
- Navigation des onglets au clavier : flèche gauche depuis Dessert sélectionne Plat et modifie le champ de recherche.
- Récapitulatif modal avec titre, bouton de fermeture et focus initial ; retour aux propositions.
- Version compilée locale : chargement et catalogue inspectés dans Safari.

## Console et limites

Safari signale une `SyntaxError: Unexpected token '{'` sans source exploitable. Elle a été reproduite après navigation et rechargement sur `/InflammMenu/icons/app-icon-192.png`, une simple image ne chargeant pas le code applicatif. Preuve : `../../design-fusion-qa/console-image-temoin.txt`. Cette observation exclut son attribution au seul code de cette refonte ; sa cause précise dans l'environnement Safari reste inconnue. Aucun blocage des interactions contrôlées n'a été constaté.

Le navigateur intégré n'était pas accessible lors de la première revue ; les comparaisons visuelles ont été réalisées dans Safari. La vérification avant intégration inclut maintenant Chromium et WebKit, ainsi que le vrai service worker sur la version compilée. Les tests de restauration hors connexion, de catalogue téléchargé, de synchronisation entre onglets et de mise à jour de version passent.

## Vérifications techniques

- `npx tsc --noEmit` : succès.
- `npm run check:runtime` : 28 fichiers protégés intacts.
- `npm run test:preview` : validations des recettes et 189 tests réussis, dont les 12 tests d'associations et les 12 tests du service worker.
- `npm run test:browser` : 83 tests réussis au premier passage ; deux assertions de libellé obsolètes corrigées, puis les deux parcours repassés avec succès (85 scénarios vérifiés au total).
- `npx playwright test --config=playwright.associations.config.ts` : 6 tests réussis, ordinateur, mobile Chromium et mobile WebKit.
- `PWA_TEST_PORT=4176 npm run test:pwa:built` : 5 tests réussis après compilation Pages dédiée. La sortie Pages doit être reconstruite après le build alternatif Sites, qui la nettoie.
- `npm run test:sites` : compilation alternative et 5 tests réussis.
- `npm run build:pages` : succès, projection de 631 recettes valide, précache et découpage validés. Avertissement de taille de certains chunks présent, sans erreur de build.
- `git diff --check` : succès.
- Aucune modification des données, photographies, règles alimentaires, stockage ou service worker. Les changements portent sur Prototype.tsx, prototype.css, AGENTS.md, ce rapport et les assertions des trois fichiers de tests navigateur concernés.

## Suivi

- [x] Comparer la référence et le rendu ensemble, avec agrandissement des cartes.
- [x] Corriger les commandes masquées et vérifier les états mobiles/ordinateur.
- [x] Vérifier le recalcul du repas et les récupérations depuis les états vides.
- [x] Conserver les ressources et le runtime existants.
- [x] Exécuter les scénarios navigateur automatisés et les parcours PWA hors connexion.
- [ ] Complément facultatif sur matériel réel : vérifier sur iPhone physique, notamment le clavier natif et les sélecteurs.

Prévisualisation compilée : http://127.0.0.1:4189/InflammMenu/
Branche d’intégration : `codex/design-fusion-local-2026-09-07`, basée sur `b1353eef3d128133b428e5260beeb30430c2c25a`. L’intégration demandée passe par une pull request et les contrôles GitHub, sans push direct sur main.
