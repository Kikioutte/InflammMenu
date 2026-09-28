# Contrôles de qualité du code

`npm run check:quality` vérifie les types du site, des tests navigateur, des
fixtures TypeScript/TSX et des trois configurations Playwright, puis recherche
des erreurs logiques dans les scripts JavaScript. Il ne modifie aucun fichier.
`npm run test:quality` vérifie les contrôles eux-mêmes et leur câblage.

Ces commandes ouvrent `test:preview`, donc également `test:release` et l'étape
de validation de la CI. Un échec bloque la chaîne avant les parcours navigateur
et les builds. Les builds gardent leur contrôle TypeScript du site et la
vérification du runtime protégé reste obligatoire.

## Typage

Le projet `tsconfig.json` demeure strict et centré sur `src`. Le projet séparé
`tsconfig.tests.json` hérite de ses contraintes et inclut tous les tests `.ts` et
`.tsx`, ainsi que `playwright*.config.ts`. Les chemins `/src/*` correspondent aux
imports absolus servis par Vite dans les callbacks exécutés dans le navigateur ;
ils ne sont ni remplacés ni simulés à l'exécution.

`allowJs` permet l'inférence des exports des helpers `.mjs` importés par les tests,
sans déclaration de module globale en `any`. Ce n'est **pas** un contrôle strict
de tout le JavaScript : `checkJs` n'est pas activé. Les définitions Node 22,
épinglées en dépendance de développement, correspondent à la version majeure de
la CI. Playwright exécute les tests TypeScript sans vérifier leurs types ; le
contrôle séparé est donc nécessaire.
[Documentation Playwright](https://playwright.dev/docs/test-typescript).

Deux tests vérifient désormais explicitement l'existence de l'identifiant du
menu archivé et de la recette personnelle avant de l'utiliser. Les assertions
métier, les sélecteurs et les parcours restent conservés.

## Analyse JavaScript

ESLint 10.11.0 exige notamment Node 22.13 ou plus récent dans la branche 22 ;
la CI demande la dernière version 22 disponible. Il utilise uniquement ses
règles natives de détection de défauts, sur les
scripts, tests `.mjs`, outils de mesure, service worker et configuration du
contrôle. Les fichiers du runtime éventuellement analysés restent inchangés.
Pas de règles de style, de réécriture automatique, de seuil de longueur ou de
réorganisation des imports. Les répertoires de sortie et les dépendances ne
font pas partie du contrôle.

La liste exacte est dans `eslint.config.mjs`. Le TypeScript reste vérifié par
son compilateur : l'analyseur `typescript-eslint` 8.71.0 inspecté pendant cette
correction déclare une compatibilité TypeScript `<6.1.0`, contrairement à la
version 7.0.2 du projet. Aucun analyseur incompatible n'est installé.

Ces contrôles complètent les tests fonctionnels, hors ligne, d'accessibilité et
de livraison ; ils ne les remplacent pas et ne constituent pas une preuve
d'absence universelle de bugs. Aucun taux de couverture artificiel n'est imposé.
