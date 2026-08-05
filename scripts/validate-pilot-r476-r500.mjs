import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const pilot = JSON.parse(
  await readFile(new URL("research/pilot-r476-r500.draft.json", root), "utf8"),
);
const concepts = JSON.parse(
  await readFile(new URL("research/recipes-r351-r500.json", root), "utf8"),
).filter(({ id }) => Number(id.slice(1)) >= 476 && Number(id.slice(1)) <= 500);

const result = validateCatalogue(pilot);
assert.equal(result.schemaVersion, "2.1.0");
assert.equal(result.recipeCount, 25);
assert.deepEqual(
  pilot.recipes.map(({ id }) => id),
  concepts.map(({ id }) => id),
);

const conceptsById = new Map(concepts.map((concept) => [concept.id, concept]));
for (const recipe of pilot.recipes) {
  const concept = conceptsById.get(recipe.id);
  assert.equal(recipe.titre, concept.titre);
  assert.equal(recipe.categorie, concept.categorie);
  assert.deepEqual(recipe.saisons, concept.saisons);
  assert.ok(recipe.ingredients.length >= 4);
  assert.ok(recipe.etapes.length >= 4);
  assert.equal(recipe.app.review.stage, "draft");
  assert.equal(recipe.app.review.status, "caution");
  assert.equal(recipe.app.planner.eligible, false);
  assert.equal(recipe.nutrition_par_portion.estimation.statut, "estimated");
  assert.equal(recipe.score_anti_inflammatoire, 0);
  assert.ok(
    recipe.provenance.sources.some(
      ({ kind, title }) => kind === "inspiration" && title.length > 0,
    ),
  );
  assert.ok(
    recipe.provenance.sources.every(
      ({ kind }) => kind !== "nutrition" && kind !== "cost",
    ),
  );
  assert.equal(recipe.provenance.reviewed_at, undefined);
}

const recipesById = new Map(pilot.recipes.map((recipe) => [recipe.id, recipe]));
assert.deepEqual(
  [...recipesById.get("r483").app.planner.allergens].sort(),
  ["fruits-a-coque", "gluten", "oeuf"],
);
assert.deepEqual(
  [...recipesById.get("r495").app.planner.allergens].sort(),
  ["celeri", "fruits-a-coque"],
);
assert.match(
  recipesById.get("r482").conseils.join(" "),
  /médicament|traitement/i,
);
assert.ok(recipesById.get("r497").app.planner.allergens.includes("sulfites"));

console.log(
  `Lot r476-r500 v${result.schemaVersion} valide : ${result.recipeCount} recettes brouillon, toutes exclues du planificateur.`,
);
