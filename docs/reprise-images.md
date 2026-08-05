# Reprise de la génération des images

Ce protocole permet de reprendre les images sans perdre l’avancement et sans associer une photo à la mauvaise recette.

## État de référence

- 500 recettes cibles : `r051` à `r550`.
- 154 images terminées, inspectées et optimisées.
- 346 images marquées `waiting_image_generation`.
- Format final obligatoire : JPEG, 900 × 900 px, 350 Ko maximum.
- Le site utilise automatiquement le visuel de remplacement tant que l’image finale n’est pas enregistrée.

La génération reste en pause tant que l’utilisateur ne demande pas explicitement de la reprendre.

## Obtenir le prochain lot

```sh
npm run images:next
```

Pour un lot plus petit :

```sh
npm run images:next -- --limit=10
```

Chaque ligne fournit l’identifiant, le titre exact, le fichier de sortie exact et le fichier contenant le prompt validé.

## Procédure obligatoire pour chaque image

1. Lire le prompt correspondant dans `research/image-prompts-rXXX-rYYY.json` sans le réécrire librement.
2. Générer une seule photographie du plat demandé.
3. Inspecter visuellement l’image avant toute intégration :
   - plat et technique culinaire reconnaissables ;
   - ingrédients visibles conformes à la recette ;
   - aucune garniture inventée ni ingrédient trompeur ;
   - textures, découpes, cuisson, proportions et ombres réalistes ;
   - aucune apparence plastique, duplication ou géométrie impossible ;
   - aucun texte, logo, emballage, personne, main ou cadre de téléphone.
4. Refuser et régénérer l’image si un seul de ces critères échoue.
5. Optimiser l’image validée vers le chemin exact annoncé par le prompt :

```sh
node scripts/optimize-recipe-image.mjs SOURCE CHEMIN_DE_SORTIE
```

6. Passer le statut du prompt à `generated_inspected_optimized` uniquement après inspection et optimisation.
7. Actualiser le manifeste puis contrôler le lot :

```sh
npm run update:image-manifest
npm run validate:image-prompts
npm run validate:images:present
```

8. Enregistrer ensemble les images, les statuts de prompts et `src/data/generated-recipe-images.json`.

## Contrôles de publication

L’aperçu partiel doit réussir :

```sh
npm run test:preview
```

La version finale ne peut être publiée comme terminée que lorsque cette commande réussit :

```sh
npm run test:release
```

`test:release` refuse automatiquement la version s’il manque une image, si un fichier est trop lourd, si ses dimensions sont incorrectes ou si son statut ne correspond pas au fichier présent.
