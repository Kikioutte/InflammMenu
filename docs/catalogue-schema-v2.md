# Schéma du catalogue v2

Le fichier `src/data/recettes-anti-inflammatoires.json` est la source unique des recettes importées. Le schéma `2.0.0` conserve tous les champs culinaires de la version précédente et ajoute les métadonnées nécessaires à l'application.

## Champs racine

- `meta.schema_version` : version du contrat de données, actuellement `2.0.0`.
- `meta.nombre_recettes` : doit toujours correspondre à `recipes.length`.
- `categories` et `taxonomie_tags` : référentiels éditoriaux existants.
- `recipes` : collection extensible; aucun nombre maximal n'est codé dans l'application.

## Bloc `app` d'une recette

```json
{
  "app": {
    "review": {
      "status": "validated",
      "summary": "Résumé éditorial affiché dans l'application",
      "caution": "Précaution facultative"
    },
    "duplicate_of": "identifiant-recette-v1-facultatif",
    "planner": {
      "eligible": true,
      "meal_types": ["lunch", "dinner"],
      "diets": ["classic", "vegetarian", "no-pork"],
      "cost_per_portion_eur": 3.4,
      "equipment": ["hob"],
      "allergens": ["sesame"]
    }
  }
}
```

- `review` remplace la table manuelle auparavant maintenue dans `catalog.ts`.
- `duplicate_of` exclut une recette matériellement équivalente du catalogue visible et du générateur, tout en conservant sa donnée source.
- `planner.eligible` autorise explicitement l'utilisation dans les menus.
- `meal_types`, `diets`, `cost_per_portion_eur`, `equipment` et `allergens` sont lus directement par le générateur. Ils ne sont plus déduits du titre ou des étapes.

## Ingrédients

Chaque ingrédient conserve `quantite`, `unite`, `nom` et `note`, puis ajoute :

- `categorie_courses` : rayon de la liste de courses (`fruit-vegetable`, `grocery`, `fresh`, `meat-fish`, `bakery`, `beverage` ou `frozen`);
- `allergenes` : allergènes attachés à cet ingrédient, même si le tableau est vide.

## Ajout d'une recette

1. Utiliser un identifiant inédit au format `r051`, `r052`, etc. et un slug unique.
2. Renseigner tous les champs culinaires, nutritionnels et le bloc `app`.
3. Marquer les doublons avec `duplicate_of` et `planner.eligible: false`.
4. Mettre à jour `meta.nombre_recettes`.
5. Exécuter `npm run validate:catalogue`, puis les tests du catalogue, du moteur et de l'interface.

Le statut de relecture décrit la cohérence générale de la recette et ses précautions. Il ne constitue ni une preuve d'effet clinique, ni une promesse thérapeutique.
