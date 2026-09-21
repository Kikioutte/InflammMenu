# Organisation de l’interface

Le découpage du 21 septembre 2026 sépare les responsabilités de l’ancien
`src/Prototype.tsx`. Les fonctions, composants, JSX et effets ont été déplacés
sans modification de leur contenu. Une optimisation ultérieure charge le profil,
les informations et l’éditeur personnel à la première ouverture, via
`src/screens/secondary-views.ts`. Les autres écrans restent chargés statiquement.

## Où intervenir

| Emplacement | Responsabilité |
| --- | --- |
| `src/Prototype.tsx` | Point d’entrée, polices, création mémorisée du store et de l’écran initial, frontière d’erreur. Conserve ses exports publics. |
| `src/app/AppShell.tsx` | Navigation, routes, effets de l’application, mutations et confirmations. |
| `src/app/app-state-store.ts` | Store unique, abonnements, fusion, remplacement et persistance de l’état. |
| `src/app/recipe-registry.ts` | Registre unique des recettes et abonnements à ses changements. |
| `src/app/LiveAppState.tsx` | Abonnement des écrans empilés à l’état courant et au registre. |
| `src/app/meal-actions.ts` | Identité du repas ciblé et détection d’une action devenue périmée. |
| `src/app/custom-recipes.ts` | Copie pure d’une recette personnelle, sans importer l’interface de l’éditeur. |
| `src/components/deferred-screen.tsx` | Attente, focus et récupération après échec de chargement d’un écran secondaire. |
| `src/app/navigation.ts`, `planning.ts`, `useInstallAndConnectivity.ts` | Helpers de navigation, génération et suivi installation/connectivité. |
| `src/screens/` | Dix-neuf modules : accueil, semaine, courses, cuisine, catalogue, fiches, profil, informations, collections, recettes personnelles et actions sur les repas. |
| `src/components/` | Composants partagés, formats, constantes, fichiers exportables et écran de récupération. |
| `src/prototype.css` | Styles existants, inchangés par ce découpage. |

Les modules métier (`engine`, `storage`, `catalog`, associations, restrictions,
etc.) restent indépendants de cette organisation de l’interface.

## Règles à préserver

- `AppShell` importe les écrans, dont le groupe secondaire par import dynamique ; aucun écran n’importe `AppShell` ou `Prototype`.
  Les composants partagés n’importent aucun écran. Éviter les imports circulaires.
- `ACTIVE_RECIPES`, `recipeById` et `recipeRegistrySnapshot` sont des liaisons ES
  vivantes exportées par un seul module. Ne pas les copier dans des constantes
  de module. Les confirmations continuent à utiliser `recipesForState(current)`.
- Le store est créé une seule fois par instance de l’application. Son `setState`
  est synchrone ; ce n’est pas l’updater de `useState` de React.
- Les écrans de `FlowStack` peuvent rester montés et conserver leur fermeture
  initiale. Garder `LiveAppState` et les lectures de l’état courant pour les
  actions sensibles. Ne pas réécrire une semaine depuis un instantané périmé.
- L’éditeur personnel garde son `AbortSignal`, sa référence de montage et le
  contrôle de l’écran courant après chaque attente asynchrone.
- Les écrans différés conservent les props live et le bouton Retour pendant le
  téléchargement. Une erreur de chargement propose un rechargement explicite,
  autorisé seulement après sauvegarde durable vérifiée, sans changement d’état
  ni navigation pendant l’attente. Le service worker précache ce groupe pour
  permettre sa première ouverture hors ligne après installation : le découpage
  diffère l’évaluation de l’interface, pas tout son trafic d’installation.
- Ne pas déplacer les effets, changer les clés React, ajouter des wrappers ou
  introduire du chargement différé au cours d’une simple extraction.
- Les exports historiques de `Prototype` restent disponibles : fonctions de
  durée, `CataloguePassiveDurationLabel`, `RecipeRating`, `PrototypeErrorBoundary`
  et export par défaut.

## Vérification

La comparaison indépendante de l’extraction retrouve les 120 déclarations
originales, chacune une seule fois, avec un contenu identique hors modificateurs
d’export. Les tests éditoriaux lisent maintenant les deux fichiers propriétaires
des avertissements (`RecipeView` et `CatalogueRecipeView`) sans retirer leurs
assertions.

Avant intégration : compilation TypeScript, `check:runtime`, `test:preview`,
`test:browser` (Chromium et WebKit), `test:sites`, `build:pages`, puis
`test:pwa:built`. Les fichiers du runtime, les données, les images et les styles
ne font pas partie de cette extraction.
