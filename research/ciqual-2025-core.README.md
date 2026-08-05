# Extrait nutritionnel Ciqual 2025

`ciqual-2025-core.json` est un extrait de travail non chargé par l'application. Il sert à recalculer de façon reproductible les valeurs nutritionnelles des nouveaux lots de recettes.

- Source : Anses, Table de composition nutritionnelle des aliments Ciqual 2025
- DOI du jeu de données : <https://doi.org/10.57745/RDMHWY>
- DOI du classeur source : <https://doi.org/10.57745/RPWYZD>
- Version du fichier : 3 novembre 2025
- Licence : Licence Ouverte 2.0
- MD5 du classeur contrôlé : `0d9758ce23f3f13dd63a005bc1bb4f2c`
- Nombre d'aliments extraits : 3 484

## Champs conservés

Pour 100 g : énergie (kcal), protéines, glucides, lipides, sucres, fibres, acides gras saturés et sodium. Le code aliment, le libellé et le groupe Ciqual sont également conservés.

Les cellules absentes restent `null`. Les valeurs indiquées comme traces sont conservées à `0` avec le qualificateur `trace`. Pour une valeur sous la limite de quantification, la valeur de calcul est la moitié de la limite et le qualificateur `below-limit` conserve cette information.

## Limites

La table donne une composition pour 100 g, pas le poids des portions culinaires. Chaque correspondance ingrédient-code et chaque conversion d'une pièce, d'une cuillère ou d'un millilitre en grammes doivent donc être documentées et relues séparément. Une suggestion automatique n'est jamais considérée comme une validation.
