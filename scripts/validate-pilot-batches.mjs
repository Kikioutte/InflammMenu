import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const researchUrl = new URL("../research/", import.meta.url);
const requestedNames = process.argv.slice(2).map((name) => name.replace(/^research\//, ""));
const names = (requestedNames.length > 0 ? requestedNames : await readdir(researchUrl))
  .filter((name) => /^pilot-r\d{3}-r\d{3}\.draft\.json$/.test(name))
  .sort();

assert.ok(names.length > 0, "Aucun lot pilote trouvé");

const conceptFiles = [
  "recipes-r051-r200.json",
  "recipes-r201-r350.json",
  "recipes-r351-r500.json",
];
const concepts = new Map();
for (const name of conceptFiles) {
  const entries = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
  for (const concept of entries) concepts.set(concept.id, concept);
}

const ids = new Set();
const slugs = new Set();
const titles = new Set();
const ingredientAllergens = new Map();
let recipeCount = 0;

function normalizedEditorialText(value) {
  return value.normalize("NFC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

for (const name of names) {
  const match = name.match(/^pilot-r(\d{3})-r(\d{3})\.draft\.json$/);
  const start = Number(match[1]);
  const end = Number(match[2]);
  const catalogue = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
  const result = validateCatalogue(catalogue);

  assert.equal(result.schemaVersion, "2.1.0", `${name}: schéma v2.1 requis`);
  assert.equal(result.recipeCount, end - start + 1, `${name}: taille de plage incohérente`);
  assert.equal(catalogue.meta.status, "draft", `${name}: le lot doit rester draft avant validation finale`);

  for (const [offset, recipe] of catalogue.recipes.entries()) {
    const expectedId = `r${String(start + offset).padStart(3, "0")}`;
    assert.equal(recipe.id, expectedId, `${name}: ordre ou identifiant incohérent`);
    assert.ok(!ids.has(recipe.id), `${recipe.id}: identifiant dupliqué entre lots`);
    assert.ok(!slugs.has(recipe.slug), `${recipe.id}: slug dupliqué entre lots`);
    assert.ok(!titles.has(recipe.titre.toLocaleLowerCase("fr")), `${recipe.id}: titre dupliqué entre lots`);
    ids.add(recipe.id);
    slugs.add(recipe.slug);
    titles.add(recipe.titre.toLocaleLowerCase("fr"));

    const concept = concepts.get(recipe.id);
    assert.ok(concept, `${recipe.id}: concept de recherche absent`);
    assert.ok(normalizedEditorialText(recipe.titre).length >= 8, `${recipe.id}: titre éditorial trop court`);
    assert.equal(recipe.categorie, concept.categorie, `${recipe.id}: la catégorie diverge du concept contrôlé`);
    assert.equal(recipe.app.review.stage, "draft", `${recipe.id}: relecture finale déclarée trop tôt`);
    assert.equal(recipe.app.review.status, "caution", `${recipe.id}: statut prudent requis`);
    assert.equal(recipe.app.planner.eligible, false, `${recipe.id}: recette brouillon activée`);
    assert.equal(recipe.nutrition_par_portion.estimation?.statut, "estimated", `${recipe.id}: nutrition non calculée présentée comme validée`);
    assert.equal(recipe.score_anti_inflammatoire, 0, `${recipe.id}: indice attribué avant relecture finale`);
    assert.equal(recipe.provenance.reviewed_at, undefined, `${recipe.id}: date de relecture prématurée`);

    const searchable = JSON.stringify(recipe).toLocaleLowerCase("fr");
    for (const [label, pattern] of [
      ["guérit", /(?:^|\W)gu[ée]rit(?:$|\W)/u],
      ["soigne", /(?:^|\W)soigne(?:$|\W)/u],
      ["prévient l'inflammation", /pr[ée]vient l['’]inflammation/u],
      ["traite l'inflammation", /traite l['’]inflammation/u],
    ]) {
      assert.ok(!pattern.test(searchable), `${recipe.id}: revendication médicale interdite (${label})`);
    }

    for (const ingredient of recipe.ingredients) {
      const key = JSON.stringify([...ingredient.allergenes].sort());
      const previous = ingredientAllergens.get(ingredient.id);
      if (previous !== undefined) {
        assert.equal(key, previous, `${ingredient.id}: allergènes incohérents entre lots`);
      } else {
        ingredientAllergens.set(ingredient.id, key);
      }
    }
    recipeCount += 1;
  }
}

console.log(`${names.length} lots pilotes valides : ${recipeCount} recettes uniques, toutes exclues du planificateur.`);
