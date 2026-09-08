# Préparation de la V1 — 8 septembre 2026

Lot préparé sur `codex/repas-v1-2026-09-08`, pour intégration par pull request. Les validations ci-dessous portent sur la version locale ; le déploiement public reste une étape distincte.

## Fonctionnalités réalisées

- Enregistrer, retrouver, modifier et supprimer une composition Entrée–Plat–Dessert dans « Mes repas » ; références conservées dans l’état local, l’export et la restauration. Les associations sont recalculées à l’ouverture.
- Planifier le repas entier, choisir ses portions, générer une semaine si nécessaire et accéder au profil quand les critères bloquent la planification.
- Conserver un instantané du repas planifié pour la semaine, les courses, les étapes, l’historique et le fonctionnement hors connexion. Le catalogue source n’est pas modifié.
- Dérogation autorisée explicitement : les desserts de la collection d’associations sont admis comme compléments manuels d’une entrée et d’un plat. Aucun dessert seul n’est ajouté au générateur. Les doublons et les exclusions des plats/entrées restent refusés ; les recettes CREAMi restent hors de ce parcours.
- Le générateur ne tire jamais automatiquement une composition. Les portions et le coût couvrent les trois recettes ; le temps actif est cumulé. Les critères du profil et du jour restent appliqués.
- Une modification de la composition repasse par le constructeur ; les substitutions automatiques d’ingrédients restent désactivées pour cette collection et les compositions.
- Les cartes de semaine et de l’accueil détaillent les noms de l’entrée, du plat et du dessert, y compris hors connexion.
- Modifier une composition planifiée met directement à jour son créneau d’origine et conserve ses portions et son cadenas. Le profil et les associations sont revérifiés ; les courses suivent le nouveau repas. Un créneau modifié entre-temps ne peut pas être écrasé silencieusement. La carte se réaffiche immédiatement après enregistrement.
- Les repas enregistrés peuvent être nommés (80 caractères maximum), recherchés par nom ou recette, et leur dernière suppression peut être annulée. Le nom survit à la sauvegarde et au rechargement.
- Libellés explicites : « Tout vert selon votre tableau » / « Associations orange présentes ». Aucune nouvelle promesse médicale.
- Accès à la recherche et à la sauvegarde/hors-ligne sur l’accueil ; raccourcis « Tout vert » et « 20 min actives maximum » dans le catalogue.
- Préparation d’un signalement de recette par fichier texte téléchargé, sans envoi automatique.

## Vérifications

- 195 tests unitaires et contrôles de données : succès.
- 85 scénarios navigateur existants : succès ; planification habituelle revérifiée après le passage à l’état réactif.
- 15 scénarios du parcours d’associations sur ordinateur Chromium, mobile Chromium et WebKit : succès (12 au passage complet, puis les 3 scénarios de modification après correction de la réactivité et ciblage du bouton dans l’écran actif). Contrôle du nom, de la recherche, de l’annulation, des portions conservées, des courses et de l’affichage immédiat sans rechargement.
- 6 tests du service worker réel : succès, dont le repas composé et ses courses accessibles après rechargement sans connexion.
- Construction Pages : succès après les trois améliorations. Construction alternative Sites et ses 5 tests réussis lors du lot précédent, non relancés pour ces trois améliorations.
- TypeScript, intégrité des 28 fichiers du runtime et vérification du diff : succès.
- 1 087 fichiers photo présents : JPEG, 900 × 900, au plus 350 Ko. Il s’agit d’une vérification technique, pas d’une validation visuelle exhaustive.
- Aucun changement dans `src/data`, `public` ou `research` : recettes, photographies et règles d’associations conservées.
- Aperçus mobiles observés dans `../../design-v1-qa/` : accueil, récapitulatif et commandes du repas. Les captures prises pendant les animations des tests ne sont pas retenues comme preuves de mise en page.

## Avant l’annonce d’une V1 publique

1. Essai sur iPhone et Android physiques : installation, clavier, texte agrandi, lecteur d’écran, reprise après fermeture et hors connexion. Les tests mobiles réalisés ici utilisent des navigateurs sur ordinateur.
2. Essais culinaires d’un échantillon couvrant entrées, plats, desserts, cuissons et régimes : relever les portions réellement obtenues, la durée, la texture et les écarts entre plat et photographie. Ne pas présenter la relecture informatique comme une recette testée en cuisine.
3. Après retour sur l’aperçu local, intégrer par une PR vérifiée puis contrôler le déploiement et le parcours public. La version publique n’a pas été modifiée par ce lot.
