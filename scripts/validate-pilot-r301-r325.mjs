import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const pilot = JSON.parse(await readFile(new URL("research/pilot-r301-r325.draft.json", root), "utf8"));
const concepts = JSON.parse(await readFile(new URL("research/recipes-r201-r350.json", root), "utf8")).filter(({ id }) => Number(id.slice(1)) >= 301 && Number(id.slice(1)) <= 325);
const result = validateCatalogue(pilot);
assert.equal(result.schemaVersion, "2.1.0"); assert.equal(result.recipeCount, 25);
assert.deepEqual(pilot.recipes.map(({ id }) => id), concepts.map(({ id }) => id));
const byId = new Map(concepts.map((c) => [c.id, c]));
for (const recipe of pilot.recipes) {
  const concept = byId.get(recipe.id);
  assert.equal(recipe.titre, concept.titre); assert.equal(recipe.categorie, "plat"); assert.deepEqual(recipe.saisons, concept.saisons);
  assert.ok(recipe.ingredients.length >= 6); assert.ok(recipe.etapes.length >= 4);
  assert.equal(recipe.app.review.stage, "draft"); assert.equal(recipe.app.review.status, "caution"); assert.equal(recipe.app.planner.eligible, false);
  assert.equal(recipe.nutrition_par_portion.estimation.statut, "estimated"); assert.equal(recipe.score_anti_inflammatoire, 0); assert.equal(recipe.provenance.reviewed_at, undefined);
  assert.ok(recipe.provenance.sources.every(({ kind }) => kind !== "nutrition" && kind !== "cost"));
}
assert.match(pilot.recipes.find(({ id }) => id === "r322").conseils.join(" "), /cuire|cuisson|trempage/i);
console.log(`Lot r301-r325 v${result.schemaVersion} valide : ${result.recipeCount} plats brouillon, tous exclus du planificateur.`);
