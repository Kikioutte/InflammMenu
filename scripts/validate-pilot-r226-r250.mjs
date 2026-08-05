import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const pilot = JSON.parse(await readFile(new URL("research/pilot-r226-r250.draft.json", root), "utf8"));
const concepts = JSON.parse(await readFile(new URL("research/recipes-r201-r350.json", root), "utf8"))
  .filter(({ id }) => Number(id.slice(1)) >= 226 && Number(id.slice(1)) <= 250);
const result = validateCatalogue(pilot);

assert.equal(result.schemaVersion, "2.1.0");
assert.equal(result.recipeCount, 25);
assert.deepEqual(pilot.recipes.map(({ id }) => id), concepts.map(({ id }) => id));
const source = new Map(concepts.map((concept) => [concept.id, concept]));

for (const recipe of pilot.recipes) {
  const concept = source.get(recipe.id);
  assert.equal(recipe.titre, concept.titre, `${recipe.id}: titre différent du concept`);
  assert.equal(recipe.categorie, "salade", `${recipe.id}: catégorie inattendue`);
  assert.deepEqual(recipe.saisons, concept.saisons, `${recipe.id}: saisons différentes du concept`);
  assert.ok(recipe.ingredients.length >= 6, `${recipe.id}: ingrédients insuffisants`);
  assert.ok(recipe.etapes.length >= 4, `${recipe.id}: protocole insuffisant`);
  assert.equal(recipe.app.review.stage, "draft");
  assert.equal(recipe.app.review.status, "caution");
  assert.equal(recipe.app.planner.eligible, false);
  assert.equal(recipe.nutrition_par_portion.estimation.statut, "estimated");
  assert.equal(recipe.score_anti_inflammatoire, 0);
  assert.equal(recipe.provenance.reviewed_at, undefined);
  assert.ok(recipe.provenance.sources.every(({ kind }) => kind !== "nutrition" && kind !== "cost"));
}

for (const id of ["r229", "r248"]) {
  assert.match(pilot.recipes.find((recipe) => recipe.id === id).app.review.caution, /germ|cuire|hygiène/i);
}
for (const id of ["r232", "r247"]) {
  assert.match(pilot.recipes.find((recipe) => recipe.id === id).conseils.join(" "), /médicament|traitement/i);
}
for (const id of ["r234", "r241", "r242", "r243", "r244"]) {
  assert.match(pilot.recipes.find((recipe) => recipe.id === id).app.review.caution, /ferment|kimchi|froid|sécurité/i);
}

console.log(`Lot r226-r250 v${result.schemaVersion} valide : ${result.recipeCount} salades brouillon, toutes exclues du planificateur.`);
