# Schéma du catalogue v2.1

Le fichier `src/data/recettes-anti-inflammatoires.json` reste la source unique des recettes publiées. Le lecteur accepte `2.0.0` et `2.1.0` : les 50 recettes existantes restent donc valides sans migration immédiate, tandis que tout nouveau lot peut utiliser le contrat v2.1 plus précis.

## Compatibilité

- `meta.schema_version: "2.0.0"` : les champs v2.1 sont facultatifs, mais leur bloc complet est validé dès que l'un d'eux apparaît.
- `meta.schema_version: "2.1.0"` : les identifiants et quantités normalisés, `facultatif`, `active_minutes`, `targets` et `provenance` sont obligatoires pour chaque recette.
- `meta.nombre_recettes` doit toujours correspondre à `recipes.length`.
- Le générateur préfère les valeurs v2.1 et conserve ses conversions historiques lorsque celles-ci sont absentes.

## Ingrédients normalisés

```json
{
  "id": "flocons-avoine-complets",
  "quantite": 90,
  "unite": "g",
  "quantite_normalisee": 90,
  "unite_normalisee": "g",
  "facultatif": false,
  "nom": "flocons d'avoine complets",
  "note": "Certifiés sans gluten si nécessaire",
  "categorie_courses": "grocery",
  "allergenes": ["gluten"]
}
```

- `id` est un identifiant canonique partagé entre recettes et listes de courses, au format kebab-case ASCII.
- `quantite_normalisee` est la quantité totale pour `recipe.portions`, comme `quantite`.
- `unite_normalisee` utilise exclusivement `g`, `ml`, `piece`, `c_soupe` ou `c_cafe`.
- `facultatif` est un booléen explicite. Une note contenant le mot « facultatif » ne suffit plus en v2.1.
- Les quatre champs de normalisation forment un bloc indivisible, y compris dans une recette v2.0.

## Bloc planificateur

```json
{
  "app": {
    "review": {
      "status": "validated",
      "summary": "Résumé éditorial affiché dans l'application"
    },
    "planner": {
      "eligible": true,
      "meal_types": ["lunch", "dinner"],
      "diets": ["classic", "vegetarian", "no-pork"],
      "cost_per_portion_eur": 3.4,
      "active_minutes": 20,
      "equipment": ["hob", "blender"],
      "allergens": ["sesame"],
      "targets": ["pulse"]
    }
  }
}
```

`active_minutes` mesure le temps réellement passé à préparer ou surveiller la recette. Il ne peut pas dépasser `temps.total`. Les équipements autorisés couvrent tout le domaine de l'application : `hob`, `oven`, `microwave`, `blender`, `toaster` et `steamer`.

Les allergènes du planificateur doivent être exactement l'union des allergènes portés par les ingrédients. Le vocabulaire contrôlé couvre les 14 familles : `gluten`, `crustaces`, `oeuf`, `poisson`, `arachides`, `soja`, `lait`, `fruits-a-coque`, `celeri`, `moutarde`, `sesame`, `sulfites`, `lupin` et `mollusques`.

`targets` utilise uniquement les marqueurs métier exacts `pulse`, `finfish` et `seafood`. `pulse` est attribué depuis une liste éditoriale fermée de légumes secs et dérivés de soja obligatoires. `finfish` exige un poisson à nageoires obligatoire ; `seafood` distingue mollusques et crustacés et ne satisfait jamais l'objectif poisson.

## Provenance

```json
{
  "provenance": {
    "type": "original",
    "author": "InflammMenu",
    "license": "CC BY-SA 4.0",
    "created_at": "2026-08-05",
    "reviewed_at": "2026-08-05",
    "sources": [
      {
        "kind": "nutrition",
        "title": "Table Ciqual 2025",
        "url": "https://ciqual.anses.fr/",
        "version": "2025",
        "accessed_at": "2026-08-05"
      }
    ]
  }
}
```

`type` vaut `original` ou `adapted`. Une recette adaptée doit conserver sa source d'inspiration dans `sources`. Les types de source autorisés sont `nutrition`, `cost`, `inspiration` et `safety`. Les dates suivent `YYYY-MM-DD`; les liens éventuels utilisent HTTPS.

## Ajout d'un lot

1. Rédiger et relire les recettes hors de la source de production.
2. Fournir tous les champs v2.1, notamment la provenance nutritionnelle et tarifaire.
3. Marquer un doublon avec `app.duplicate_of` et `app.planner.eligible: false`.
4. Mettre à jour `meta.nombre_recettes` une fois le lot intégré.
5. Exécuter `npm run test:catalogue`, puis les tests du moteur avant publication.

Le statut de relecture et l'indice éditorial décrivent la cohérence générale d'une recette avec le modèle alimentaire retenu. Ils ne constituent ni une preuve d'effet clinique ni une promesse thérapeutique.
