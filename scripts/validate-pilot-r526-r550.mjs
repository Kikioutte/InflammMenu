import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const concepts = JSON.parse(
  await readFile(new URL("research/recipes-r526-r550.json", root), "utf8"),
);
const pilot = JSON.parse(
  await readFile(new URL("research/pilot-r526-r550.draft.json", root), "utf8"),
);
const result = validateCatalogue(pilot, { taxonomy: "legacy" });

assert.equal(result.schemaVersion, "2.1.0");
assert.equal(result.recipeCount, 25);
assert.deepEqual(
  pilot.recipes.map(({ id }) => id),
  Array.from({ length: 25 }, (_, index) => `r${526 + index}`),
);
assert.deepEqual(
  pilot.recipes.map(({ id }) => id),
  concepts.map(({ id }) => id),
);

const expectedCategories = {
  plat: 13,
  accompagnement: 4,
  snack: 4,
  dessert: 3,
  sauce: 1,
};
const actualCategories = Object.fromEntries(
  Object.entries(Object.groupBy(pilot.recipes, ({ categorie }) => categorie))
    .map(([category, recipes]) => [category, recipes.length]),
);
assert.deepEqual(actualCategories, expectedCategories);

const veganConcepts = concepts.filter(({ famille_regime }) => famille_regime === "vegetalien");
assert.ok(veganConcepts.length >= 20, "Au moins 20 concepts végétaliens sont requis");
for (const concept of veganConcepts) {
  const recipe = pilot.recipes.find(({ id }) => id === concept.id);
  assert.ok(recipe.regimes.includes("vegetalien"), `${concept.id}: régime végétalien absent`);
}

const forbiddenIngredients = /ashwagandha|bacopa|triphala|guggul|shilajit|bhasma|huile essentielle|extrait concentr|complément|mercure|arsenic|plomb/i;
const forbiddenClaims = /(?:gu[ée]rit|soigne|pr[ée]vient|traite).{0,40}(?:inflammation|maladie)|diagnosti(?:que|quer).{0,20}dosha|d[ée]tox/i;
const conceptsById = new Map(concepts.map((concept) => [concept.id, concept]));
for (const recipe of pilot.recipes) {
  const concept = conceptsById.get(recipe.id);
  assert.equal(recipe.titre, concept.titre);
  assert.equal(recipe.categorie, concept.categorie);
  assert.deepEqual(recipe.saisons, concept.saisons);
  assert.ok(recipe.ingredients.length >= 4, `${recipe.id}: au moins quatre ingrédients requis`);
  assert.ok(recipe.etapes.length >= 4, `${recipe.id}: au moins quatre étapes requises`);
  assert.equal(recipe.app.review.stage, "draft");
  assert.equal(recipe.app.review.status, "caution");
  assert.equal(recipe.app.planner.eligible, false);
  assert.equal(recipe.nutrition_par_portion.estimation.statut, "estimated");
  assert.equal(recipe.score_anti_inflammatoire, 0);
  assert.equal(recipe.provenance.reviewed_at, undefined);
  assert.ok(recipe.provenance.sources.some(({ kind }) => kind === "inspiration"));
  assert.ok(recipe.provenance.sources.every(({ kind }) => kind !== "nutrition" && kind !== "cost"));
  assert.ok(!forbiddenIngredients.test(recipe.ingredients.map(({ id, nom }) => `${id} ${nom}`).join(" ")), `${recipe.id}: ingrédient exclu`);
  assert.ok(!forbiddenClaims.test(JSON.stringify(recipe)), `${recipe.id}: allégation médicale interdite`);
}

const byId = new Map(pilot.recipes.map((recipe) => [recipe.id, recipe]));
const allergens = (id) => [...byId.get(id).app.planner.allergens].sort();
assert.deepEqual(allergens("r530"), ["gluten", "soja"]);
assert.deepEqual(allergens("r531"), ["lait"]);
assert.deepEqual(allergens("r540"), ["sesame"]);
assert.deepEqual(allergens("r541"), ["gluten"]);
assert.deepEqual(allergens("r542"), ["moutarde"]);
assert.deepEqual(allergens("r545"), ["fruits-a-coque", "gluten"]);
assert.deepEqual(allergens("r547"), ["fruits-a-coque", "gluten"]);
assert.deepEqual(allergens("r548"), ["lait"]);
assert.deepEqual(allergens("r550"), ["moutarde"]);

console.log(
  `Lot r526-r550 v${result.schemaVersion} valide : ${result.recipeCount} recettes, ${veganConcepts.length} végétaliennes, toutes exclues du planificateur.`,
);
