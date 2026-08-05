# Production des images de recettes

## Moment de génération

Une image est générée seulement lorsqu'une recette a passé les contrôles de contenu, d'unicité, d'allergènes et de cohérence culinaire. Les concepts encore au stade `draft` ne reçoivent pas d'image afin d'éviter des générations inutiles.

## Organisation des agents

Trois agents d'images peuvent travailler en parallèle sur des lots distincts :

- agent A : petits-déjeuners, boissons, soupes, encas et desserts ;
- agent B : salades, bols et plats végétaux ;
- agent C : poissons, fruits de mer, volaille, accompagnements et sauces.

Chaque agent utilise un appel de génération séparé par recette, enregistre le résultat dans `public/assets/recipes/`, puis renseigne le nom du fichier dans la recette. Aucun agent ne remplace une image existante sans validation explicite.

Les sorties brutes de génération ne sont pas versées directement dans le site. Une image brute d'environ 2,5 Mo multipliée par 450 dépasserait 1 Go. La version de production est redimensionnée à 900 × 900 px, exportée en JPEG de qualité contrôlée et doit viser au plus 350 Ko. L'interface devra charger les images du catalogue à la demande.

## Direction visuelle commune

- photographie culinaire naturelle et éditoriale ;
- format carré, cadrage rapproché ou vue légèrement plongeante ;
- lumière douce provenant d'une fenêtre, ombres légères et crédibles ;
- vaisselle artisanale crème ou grège, linge sauge ou lin naturel ;
- arrière-plan minéral clair, palette chaleureuse et végétale ;
- aliments fidèles aux ingrédients et à la technique de la recette ;
- portions réalistes, textures naturelles, dressage simple et appétissant ;
- rendu ultra-photoréaliste : petites irrégularités naturelles, humidité et cuisson crédibles, profondeur de champ optique, aucun aspect plastique ou artificiellement parfait ;
- aucun texte, logo, filigrane, main, couvert déformé ou ingrédient absent de la recette.

## Gabarit de prompt

```text
Use case: photorealistic-natural
Asset type: square recipe card image for the InflammMenu web app
Primary request: photograph the finished dish "{titre}"
Subject: {description_visuelle_fidele_aux_ingredients_et_a_la_technique}
Style/medium: premium natural editorial food photography, realistic food texture
Composition/framing: square image, close three-quarter or slightly overhead view, dish clearly readable at thumbnail size
Lighting/mood: soft natural window light, warm and calm atmosphere, subtle realistic shadows
Color palette: cream ceramic, light mineral background, muted sage linen, colors driven by the actual food
Constraints: show only ingredients present in the validated recipe; realistic portion and cooking result; no misleading garnish
Avoid: text, logo, watermark, hands, people, plastic-looking food, excessive gloss, impossible geometry, repeated garnish, clutter
```

Le champ `description_visuelle_fidele_aux_ingredients_et_a_la_technique` est rédigé depuis la fiche validée, jamais depuis le seul titre.

## Contrôle de chaque image

1. Le plat et la cuisson correspondent à la recette.
2. Les ingrédients dominants sont visibles ou plausibles, sans ajout trompeur.
3. Le cadrage reste lisible dans une carte mobile.
4. Il n'y a ni texte ni filigrane.
5. Les mains, ustensiles et aliments ne présentent pas de déformation visible.
6. Le fichier est enregistré avec le slug stable de la recette.
7. L'image est chargée localement et inspectée avant d'être référencée dans le JSON.
8. La version optimisée respecte 900 × 900 px et le budget de 350 Ko, sans dégradation visuelle gênante.
9. La texture correspond à la technique réelle : rôti, mijoté, mixé, cru, vapeur ou grillé ne doivent pas être confondus.
10. Les quantités, découpes et proportions restent plausibles; aucun ingrédient ne se répète avec une géométrie artificielle.
11. Le rendu doit pouvoir être pris pour une vraie photographie culinaire : imperfections discrètes, lumière optique crédible et profondeur de champ naturelle.

Une image rejetée est régénérée avec une seule correction ciblée. Les images finales restent dans le dépôt afin que le site et la PWA ne dépendent pas d'un service externe.
