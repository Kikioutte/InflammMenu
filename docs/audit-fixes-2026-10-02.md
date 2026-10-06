# InflammMenu — correctifs de l’audit et des instructions

Date : 2 octobre 2026. Base : `9a3801827e20d8542a273b94aa013fcdc73c7533`, confirmée sur `origin/main` avant et après intégration. Branche locale : `fix/audit-and-instructions-20261002`.

## État de livraison

Les huit défauts confirmés ont un correctif et des tests de régression. Les corrections d’instructions préparées le 1er octobre sont intégrées, avec une reprise explicite des réserves culinaires prioritaires. Le correctif est enregistré localement pour revue ; aucun push, aucune PR, aucune fusion ni aucun déploiement n’a été effectué. La PR 30 est inchangée.

Les vérifications de code, données et builds passent. Les parcours navigateur ont été écrits et recensés, mais n’ont pas pu être exécutés dans cet environnement. Une validation mobile/multi-onglets/PWA réelle reste nécessaire avant publication.

## Huit défauts corrigés

| Audit | Correction | Régression |
| --- | --- | --- |
| B01 Collections V1 | Validation commune des 36 IDs V1 et des IDs réels du catalogue ; index compact compatible avec le chargement différé ; résultat enregistré vérifié avant succès | Toutes les V1, export/import, fusion d’état, IDs inconnus et parcours navigateur préparés |
| B02 Courses V1 | Même validation partagée ; instantanés conservés ; résultat stocké vérifié avant succès | Toutes les V1, portions, sauvegarde/restauration et parcours V1/catalogue préparés |
| B03 Semaine faisable refusée | Test d’affectation distincte des créneaux restants avant de consommer une recette rare ; filtres stricts, déterminisme, cadenas et budget conservés | 100 graines avec dimanche ≤15 min, oracle exhaustif sur 36 petits graphes, pools rares chevauchants, verrous et impossibilités réelles |
| B04 Fiche périmée multi-onglets | Signature de semaine/génération/créneau/recette ; fiche et cuisine bloquées si cible changée ; gardes synchronisés avant mutations ; portions/substitutions actualisées pour une cible inchangée | Tests Node d’identité et parcours multi-onglets préparés, notamment remplacement, archivage, restauration et portions |
| B05 Cuisiner en double | Portions servies séparées du total à préparer ; tous les repas de restes liés sont additionnés ; fiche et cuisine affichent les quantités du lot | Lot de 9 portions sur trois repas, correspondance exacte des ingrédients, courses inchangées, parcours navigateur préparé |
| B06 Composition non planifiable | Règle commune aux propositions, à la sauvegarde et à la composition finale ; entrées/plats exclus écartés ; exception des desserts complémentaires relus conservée | 106 entrées/plats auparavant proposés exclus ; combinaison refusée nommant la recette ; dessert complémentaire accepté |
| B07 Sans porc/poisson | Objectif poisson commun à Classique et Sans porc dans moteur, profil, génération et bilan ; masqué pour Végétarien | Cibles 0/7, budget, 12 graines réelles et parcours navigateur préparés |
| B08 Favori/exclusion contradictoires | Transition exclusive commune aux cœurs, à la notation et au remplacement avec exclusion | Toutes les transitions entre quatre états, anciennes sauvegardes contradictoires et parcours navigateur préparés |

## Instructions et prudence culinaire

- 1 293 recettes relues : 1 257 importées et 36 V1
- 917 recettes avec étapes modifiées ; 930 modifiées au total ; 127 avec correction hors étapes ; 363 intactes
- Ingrédients complets, quantités, nutrition, identifiants et objets image préservés, avec comparaison des empreintes avant/après de chaque recette
- Quatre retraits supplémentaires du planificateur : r036, r041, r248, r264. Il reste 685 recettes importées planifiables, plus 36 V1
- r023 : ancien protocole de fermentation retiré ; suspension explicite et lien vers une recette externe testée sans transposition des ingrédients/proportions
- r036/r041 : protocole shiitakés non validé, instructions retirées et fiches suspendues
- r229/r248/r264 : produit germé identifié et protocole de cuisson complète requis ; pas de délai universel inventé
- r026/r031/r032 : longues conservations non étayées retirées, consignes prudentes de réfrigération et durée courte
- r042 : consommation immédiate, précautions pour jus non pasteurisé et rendement de dix portions sans volume fixe garanti
- r481/r487/r496 : température de four manquante explicitement signalée avant préparation, sans réglage présenté comme testé
- r606 : sarrasin grillé explicitement prêt à consommer ; temps cohérents avec poires déjà rôties

Les réserves initiales sont conservées dans le journal. Les neuf fiches de protocole suspendu/incomplet ne sont pas présentées comme des recettes utilisables validées. Aucun essai physique, rendement, texture ni validation microbiologique n’est revendiqué. Les durées et données nutritionnelles demeurent estimatives.

Sources et changements exacts par ID : `research/recipe-instructions-review-2026-10-01.json`, notamment `followupReview` et `followupSummary`.

## Intégration et poids de démarrage

Les noms de cinq prompts image sont alignés sur les titres corrigés, sans changer les fichiers image. Les projections et l’empreinte du catalogue hors ligne sont régénérées ; aucune ancienne édition supplémentaire n’est automatiquement admise.

Les instructions enrichies dépassaient initialement le plafond JavaScript. La projection runtime est maintenant sérialisée par colonnes puis reconstruite avant le même validateur. Le JSON canonique demeure disponible, et l’égalité profonde ainsi que l’ordre exact de sérialisation sont testés. Aucune donnée ni fonctionnalité n’a été retirée.

Build Pages final : **406 131 octets gzip** au démarrage, pour un plafond inchangé de **425 000** ; 7 scripts critiques comptés, 32 ressources précachées. Les images, le catalogue complet et les écrans secondaires conservent leur stratégie de chargement.

## Vérifications réussies

- `npm run test:preview` : 422 tests Node réussis, aucun échec ; types, lint, intégrité des 28 fichiers runtime protégés et contrôles de données inclus
- `npm run test:sites` : build et 5 tests supplémentaires réussis
- `npm run build:pages` : compilation, préchargements, précache et budget de démarrage réussis
- `npm run validate:images` : 1 257 images présentes, JPEG 900 × 900, ≤350 Ko
- `npm run audit:production` : aucune vulnérabilité signalée
- Empreintes des 1 293 fiches vérifiées ; correspondance runtime/canonique des 685 recettes importées vérifiée
- 24 références déterministes revues : à données finales identiques, ancien et nouveau moteurs produisent exactement les mêmes sorties. Les 21 changements par rapport à l’ancienne référence proviennent des quatre exclusions culinaires documentées
- `git diff --check` : réussi

La revue détaillée de chaque référence moteur est dans `research/audit-engine-baseline-review-2026-10-02.json`. Les mesures de performance sous charge concurrente sont descriptives, pas une promesse de gain.

## Vérifications restantes avant publication

Exécuter `npm run test:browser`, puis `npm run test:pwa:built` sur le build Pages avec Chromium et WebKit installés. Les 37 exécutions navigateur ajoutées (19 scénarios, Chromium et WebKit smoke) sont recensées dans trois fichiers. Les tests ajoutés couvrent les correctifs sur viewport mobile, les onglets et le stockage ; les suites PWA historiques couvrent également le catalogue hors ligne, le démarrage et la synchronisation.

Dans cet environnement, Chromium système n’a pas pu démarrer à cause de l’interdiction des sockets Unix, y compris après la tentative d’exécution élargie autorisée. L’archive Chromium dédiée était invalide ; WebKit a été téléchargé mais manque de bibliothèques système. La prévisualisation via le navigateur cloud n’atteint pas le serveur isolé. Aucun résultat navigateur/PWA, rendu visuel ou CI distant n’est donc revendiqué.

## Application locale

Le paquet de livraison contient un patch applicable à la base indiquée, les fichiers modifiés et les sorties des vérifications. Vérifier d’abord `git apply --check correctif.patch` sur une branche issue de cette base. Si `main` a évolué, réconcilier les changements et relancer les validations avant toute publication.

Après ajout de recettes, régénérer les références (`npm run generate:recipe-references`) et les deux projections (`npm run generate:planner`) ; leurs contrôles sont intégrés à la validation.
