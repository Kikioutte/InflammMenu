# Ajout des 120 recettes illustrées

Ajout du 27 septembre 2026 : r1088 à r1207, à partir des fiches validées localement le 26 septembre. Le catalogue passe de 1087 à 1207 fiches (1201 visibles après les six doublons éditoriaux historiques). Les 1087 fiches antérieures sont inchangées.

Les 120 compositions sont vertes selon la grille personnelle existante, sans ingrédient non classé, gluten, produit laitier ou alcool ajouté. Les quantités de référence sont pour deux portions et restent ajustables dans l’interface. Les valeurs nutritionnelles utilisent la même extraction Ciqual et les mêmes hypothèses de prix que la collection existante ; ce sont des estimations, sans essai en cuisine ni validation médicale.

38 plats rejoignent le planificateur selon les critères existants. Les 82 autres fiches restent consultables comme compléments ou recettes non planifiables. Les catégories et barrières éditoriales existantes sont conservées.

Les 120 JPEG uniques ont été générés avec ImageGen, inspectés puis optimisés en 900 × 900, sous 350 Kio. Le fichier de provenance conserve l’identifiant de génération et le SHA-256 du JPEG retenu. Les six corrections visuelles ont été sélectionnées avant l’import.

L’import initial est documenté dans `scripts/import-recipes-r1088-r1207.py` et nécessite le catalogue initial de 1087 fiches. La reconstruction de la collection inclut désormais `research/recipes-r1088-r1207.json`. Après modification des données, régénérer les projections avec `npm run generate:planner`, `node scripts/generate-recipe-nutrition.mjs` et `npm run update:image-manifest`.

Validation : test:release, build:pages, contrôles navigateur des filtres et du constructeur, chargement photo et portions 2 → 4 sur Chromium/WebKit, contrôle PWA du catalogue hors ligne. Les attentes de compte ont été actualisées ; une assertion d’un ancien test nutritionnel est limitée à l’écran actif durant les transitions.
