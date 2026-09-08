# Recherche, courses libres et collections — 8 septembre 2026

## Fonctionnalités

- Recherche par mots dans un ordre différent, insensible aux accents et tolérant une insertion, suppression, substitution ou inversion adjacente pour les mots d’au moins cinq caractères. Les filtres du catalogue restent appliqués ; cette recherche n’intervient jamais dans les règles alimentaires ou les identités d’ingrédients.
- Courses sans semaine : articles libres, suppression annulable, recettes ajoutées depuis leur fiche avec portions réglables, instantanés persistants et regroupement avec les achats de la semaine. Les ajouts survivent à la création d’une semaine. Le mode magasin, l’export, le partage et le garde-manger réutilisent la liste. Ajouter une recette déjà présente met à jour ses portions, sans créer une deuxième entrée libre.
- Collections nommées, renommage, classement depuis une fiche, retrait d’une recette, recherche, suppression annulable. Les favoris et le générateur sont indépendants de ce classement.
- Les nouveaux champs participent à la migration, à l’export/import et aux horloges de synchronisation locale entre onglets.

## Vérifications

- 200 tests unitaires et contrôles de données passent : recherche, calculs des quantités, ancien format de sauvegarde, export/import et fusion de changements de deux onglets inclus.
- 85 scénarios navigateur existants passent.
- Le premier passage GitHub a révélé un ciblage ambigu du test des durées pendant une transition entre deux fiches (84 autres scénarios réussis). Le test cible désormais la fiche active, avec les mêmes assertions. Le scénario corrigé et les trois nouveaux parcours Chromium passent ensemble. Les nouveaux parcours sont ajoutés à `test:browser`, soit 88 scénarios dans cette commande.
- 24 scénarios d’associations et des nouvelles fonctions passent sur Chromium ordinateur, Chromium mobile et WebKit. Les 9 nouveaux scénarios ont aussi été relancés après ajustement des cibles tactiles ; ils couvrent désormais la création d’une semaine après des courses libres et l’absence de débordement à 320 px.
- 7 scénarios PWA avec service worker réel passent, dont courses libres et collection après rechargement sans connexion.
- TypeScript, construction Pages et intégrité des 28 fichiers du runtime passent.
- Les 939 recettes admissibles aux ajouts structurés de courses produisent un instantané accepté par la validation du stockage.
- Aucun changement dans les recettes, photographies et règles sources (`src/data`, `public`, `research`).
- Captures des courses et collections inspectées, dont une collection sur largeur 320 px. Il s’agit de navigateurs sur ordinateur, pas d’une certification sur tous les téléphones physiques.

## Limites conservées

Une liste de courses n’est pas un repas : aucune compatibilité globale entre ses recettes n’est annoncée. Les ajouts structurés ne contournent pas les exclusions éditoriales ni les allergies, ingrédients exclus et régime du profil. Les articles libres sont du texte saisi par l’utilisateur, sans validation alimentaire. Une collection conserve ses références hors ligne ; ouvrir une fiche du catalogue non disponible localement nécessite le téléchargement du catalogue, comme pour les favoris.

La publication sur une branche GitHub et le déploiement public sont deux étapes distinctes. Ce rapport décrit les vérifications locales du lot.
