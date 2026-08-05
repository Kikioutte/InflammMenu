import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const [draft, nutrition, final, mapping, ciqual] = await Promise.all([
  "research/pilot-r101-r125.draft.json",
  "research/pilot-r101-r125.nutrition.json",
  "research/pilot-r101-r125.final.json",
  "research/ciqual-map-r101-r125.json",
  "research/ciqual-2025-core.json",
].map((path) => readFile(new URL(path, root), "utf8").then(JSON.parse)));

assert.equal(mapping.meta.ingredient_count, 65);
assert.equal(mapping.meta.reused_count, 30);
const requiredIngredientIds = [...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id)))].sort();
assert.deepEqual(mapping.ingredients.map(({ ingredient_id }) => ingredient_id), requiredIngredientIds);
const ciqualCodes = new Set(ciqual.foods.map(({ code }) => code));
for (const entry of mapping.ingredients) {
  if ((entry.source_dataset ?? "ciqual") === "ciqual") {
    assert.ok(ciqualCodes.has(String(entry.selected_ciqual_code)), `${entry.ingredient_id}: code Ciqual absent`);
  }
  assert.ok(["validated", "caution"].includes(entry.review_status), `${entry.ingredient_id}: mapping non relu`);
}

const result = validateCatalogue(final);
assert.equal(result.schemaVersion, "2.1.0");
assert.equal(result.recipeCount, 25);
assert.equal(final.meta.status, "editorial-validated");
assert.equal(final.meta.reviewed_at, "2026-08-05");
assert.match(final.meta.culinary_notice, /aucune.*testée physiquement/i);
assert.match(final.meta.cost_notice, /estimations/i);

const expectedIds = Array.from({ length: 25 }, (_, index) => `r${101 + index}`);
assert.deepEqual(final.recipes.map(({ id }) => id), expectedIds);
const nutritionById = new Map(nutrition.recipes.map((recipe) => [recipe.id, recipe]));
const eligibleIds = new Set(["r101", "r102", "r124", "r125"]);
const filteredIds = new Set(["r103", "r104", "r105", "r109", "r111", "r113", "r116", "r119", "r123"]);

for (const recipe of final.recipes) {
  const source = nutritionById.get(recipe.id);
  assert.ok(source, `${recipe.id}: source nutritionnelle absente`);
  for (const field of ["titre", "categorie", "temps", "portions", "ingredients", "etapes", "substitutions", "nutrition_par_portion"]) {
    assert.deepEqual(recipe[field], source[field], `${recipe.id}: ${field} modifié pendant la relecture`);
  }
  assert.equal(recipe.app.review.stage, "editorial-validated");
  assert.equal(recipe.app.review.status, "caution");
  assert.match(recipe.app.review.caution, /non testée physiquement/i);
  assert.equal(recipe.provenance.reviewed_at, "2026-08-05");
  assert.match(recipe.score_note, /profil alimentaire global/i);
  assert.match(recipe.score_note, /ne mesure aucun effet médical/i);
  assert.ok(recipe.score_anti_inflammatoire >= 1 && recipe.score_anti_inflammatoire <= 10);
  assert.equal(recipe.app.planner.eligible, eligibleIds.has(recipe.id));
  if (recipe.categorie === "boisson") assert.equal(recipe.app.planner.eligible, false, `${recipe.id}: boisson activée comme repas`);
  const ingredientAllergens = [...new Set(recipe.ingredients.flatMap(({ allergenes }) => allergenes))].sort();
  assert.deepEqual([...recipe.app.planner.allergens].sort(), ingredientAllergens);
  const text = JSON.stringify(recipe).toLocaleLowerCase("fr");
  assert.ok(!/(?:^|\W)(?:gu[ée]rit|soigne)(?:$|\W)|pr[ée]vient une maladie|traite une maladie|r[ée]duit l'inflammation|combat l'inflammation/i.test(text), `${recipe.id}: allégation médicale`);
  if (filteredIds.has(recipe.id)) {
    assert.ok(recipe.nutrition_par_portion.calories <= 15, `${recipe.id}: calories peu plausibles pour une infusion filtrée`);
    assert.equal(recipe.nutrition_par_portion.estimation.statut, "calculated-with-cautions");
  }
}

assert.equal(final.recipes.filter((recipe) => recipe.app.planner.eligible).length, 4);
assert.ok(final.recipes.find(({ id }) => id === "r101").nutrition_par_portion.proteines_g >= 30);
assert.ok(final.recipes.find(({ id }) => id === "r124").nutrition_par_portion.calories >= 200);
assert.ok(final.recipes.find(({ id }) => id === "r125").nutrition_par_portion.fibres_g >= 8);
assert.match(final.recipes.find(({ id }) => id === "r113").app.review.caution, /caféine/i);
assert.match(final.recipes.find(({ id }) => id === "r117").app.review.caution, /lait/i);

console.log("Lot final r101-r125 valide : 25 recettes relues, 4 vrais repas éligibles et 9 infusions filtrées sous réserve explicite.");
