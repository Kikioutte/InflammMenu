import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const pilot = JSON.parse(await readFile(new URL("research/pilot-r176-r200.draft.json", root), "utf8"));
const concepts = JSON.parse(await readFile(new URL("research/recipes-r051-r200.json", root), "utf8"))
  .filter(({ id }) => Number(id.slice(1)) >= 176 && Number(id.slice(1)) <= 200);
const result = validateCatalogue(pilot, { taxonomy: "legacy" });

assert.equal(result.schemaVersion, "2.1.0");
assert.equal(result.recipeCount, 25);
assert.equal(pilot.meta.status, "draft");
assert.deepEqual(pilot.recipes.map(({ id }) => id), concepts.map(({ id }) => id));

const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
for (const recipe of pilot.recipes) {
  const concept = conceptById.get(recipe.id);
  assert.equal(recipe.titre, concept.titre, `${recipe.id}: titre différent du concept source`);
  assert.equal(recipe.categorie, concept.categorie, `${recipe.id}: catégorie différente du concept source`);
  assert.deepEqual(recipe.saisons, concept.saisons, `${recipe.id}: saisons différentes du concept source`);
  assert.ok(recipe.ingredients.length >= 5, `${recipe.id}: formulation insuffisamment détaillée`);
  assert.ok(recipe.etapes.length >= 4, `${recipe.id}: protocole insuffisamment détaillé`);
  assert.equal(recipe.app.review.stage, "draft", `${recipe.id}: stage final déclaré trop tôt`);
  assert.equal(recipe.app.review.status, "caution", `${recipe.id}: statut prudent requis`);
  assert.equal(recipe.app.planner.eligible, false, `${recipe.id}: recette brouillon activée`);
  assert.equal(recipe.nutrition_par_portion.estimation.statut, "estimated", `${recipe.id}: nutrition présentée comme validée`);
  assert.equal(recipe.score_anti_inflammatoire, 0, `${recipe.id}: indice éditorial attribué trop tôt`);
  assert.equal(recipe.provenance.reviewed_at, undefined, `${recipe.id}: date de relecture prématurée`);
  assert.ok(recipe.provenance.sources.every(({ kind }) => kind !== "nutrition" && kind !== "cost"), `${recipe.id}: source chiffrée revendiquée avant vérification`);
}

assert.deepEqual(pilot.recipes.find(({ id }) => id === "r185").app.planner.allergens.sort(), ["gluten", "sulfites"]);
assert.deepEqual(pilot.recipes.find(({ id }) => id === "r194").app.planner.allergens, ["sesame"]);
assert.match(pilot.recipes.find(({ id }) => id === "r194").app.review.caution, /coco|graisses saturées/i);

console.log(`Lot r176-r200 v${result.schemaVersion} valide : ${result.recipeCount} recettes brouillon, toutes exclues du planificateur.`);
