import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const [nutrition, catalogue, mapping, ciqual, usda] = await Promise.all([
  "research/pilot-r526-r550.nutrition.json",
  "research/pilot-r526-r550.final.json",
  "research/ciqual-map-r526-r550.json",
  "research/ciqual-2025-core.json",
  "research/usda-sr-fallbacks.json",
].map((file) => readFile(new URL(file, root), "utf8").then(JSON.parse)));
const eligibleIds = new Set(["r526", "r527", "r529", "r530", "r534", "r535", "r537", "r538"]);

assert.equal(mapping.meta.ingredient_count, 72);
assert.equal(mapping.meta.reused_count, 53);
const ciqualCodes = new Set(ciqual.foods.map((food) => String(food.code)));
const usdaCodes = new Set(usda.foods.map((food) => String(food.fdc_id)));
for (const entry of mapping.ingredients) {
  const dataset = entry.source_dataset ?? "ciqual";
  const code = String(entry.selected_source_code ?? entry.selected_ciqual_code);
  assert.ok(dataset === "usda-sr" ? usdaCodes.has(code) : ciqualCodes.has(code), `${entry.ingredient_id}: code source absent`);
  assert.ok(["validated", "caution"].includes(entry.review_status));
}
const mapped = new Map(mapping.ingredients.map((entry) => [entry.ingredient_id, entry]));
assert.equal(mapped.get("quinoa-blanc").selected_ciqual_code, "9340");
assert.equal(mapped.get("riz-complet-sec").selected_ciqual_code, "9102");
assert.equal(mapped.get("haricots-mungo-cuits").selected_ciqual_code, "20531");
assert.equal(mapped.get("graines-ajowan").selected_ciqual_code, "11064");
assert.equal(mapped.get("graines-chia").grams_per_unit.c_soupe, 12);
for (const entry of mapping.ingredients.filter((item) => item.batch_reuse_source)) {
  const source = JSON.parse(await readFile(new URL(`research/ciqual-map-${entry.batch_reuse_source}.json`, root), "utf8"));
  assert.ok(source.ingredients.some((item) => item.ingredient_id === entry.ingredient_id), `${entry.ingredient_id}: réutilisation non canonique`);
}

assert.equal(validateCatalogue(catalogue, { taxonomy: "legacy" }).recipeCount, 25);
assert.equal(catalogue.meta.status, "editorial-validated");
assert.match(catalogue.meta.medical_notice, /aucun diagnostic de dosha.*prévention ou traitement/i);
assert.match(catalogue.meta.culinary_notice, /aucune.*testée physiquement/i);
assert.match(catalogue.meta.cost_notice, /estimations.*sans relevé.*versionné/i);
assert.equal(catalogue.recipes.filter((recipe) => recipe.app.planner.eligible).length, 8);
assert.equal(catalogue.recipes.filter((recipe) => recipe.categorie !== "plat" && recipe.app.planner.eligible).length, 0);
const sourceById = new Map(nutrition.recipes.map((recipe) => [recipe.id, recipe]));
for (const recipe of catalogue.recipes) {
  const source = sourceById.get(recipe.id);
  for (const key of ["titre", "categorie", "temps", "portions", "ingredients", "etapes", "nutrition_par_portion"]) assert.deepEqual(recipe[key], source[key]);
  assert.equal(recipe.app.planner.eligible, eligibleIds.has(recipe.id));
  assert.equal(recipe.provenance.reviewed_at, catalogue.meta.reviewed_at);
  assert.match(recipe.score_note, /ne mesure ni ne prouve aucun effet médical/i);
  assert.match(recipe.app.review.summary, /sans revendication d'authenticité.*diagnostic de dosha.*effet thérapeutique/i);
  assert.match(recipe.app.review.caution, /non testée physiquement/i);
  assert.ok(recipe.app.planner.cost_per_portion_eur > 0);
  assert.deepEqual(
    [...recipe.app.planner.allergens].sort(),
    [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort(),
    `${recipe.id}: allergènes incohérents`,
  );
  if (recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions") assert.match(recipe.app.review.caution, /réserve nutritionnelle/i);
  if (recipe.app.planner.eligible) {
    assert.equal(recipe.categorie, "plat");
    assert.ok(recipe.nutrition_par_portion.calories >= 300, `${recipe.id}: énergie insuffisante`);
    assert.ok(recipe.nutrition_par_portion.proteines_g >= 13, `${recipe.id}: protéines insuffisantes`);
    assert.ok(recipe.nutrition_par_portion.fibres_g >= 5, `${recipe.id}: fibres insuffisantes`);
    assert.ok(recipe.nutrition_par_portion.acides_gras_satures_g < 8, `${recipe.id}: saturés élevés`);
  }
}

for (const id of ["r528", "r531", "r532", "r533", "r536"]) assert.equal(catalogue.recipes.find((recipe) => recipe.id === id).app.planner.eligible, false);
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r531").app.review.caution, /graisses saturées.*élevées/i);
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r535").app.review.caution, /jamais un extrait ni un complément/i);
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r536").app.review.caution, /réfrigérateur.*jeter l'eau.*sans revendiquer de fermentation/i);
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r539").app.review.caution, /dose culinaire.*huile essentielle/i);
assert.match(catalogue.recipes.find((recipe) => recipe.id === "r549").app.review.caution, /0,1 g de safran.*usage culinaire/i);

const detailsById = new Map(catalogue.recipes.map((recipe) => [recipe.id, new Map(recipe.nutrition_par_portion.estimation.details.map((detail) => [detail.ingredient_id, detail]))]));
assert.equal(detailsById.get("r548").get("graines-chia").grams, 24);
assert.equal(detailsById.get("r535").get("feuilles-curry-fraiches").grams, 4);
assert.equal(detailsById.get("r539").get("graines-ajowan").grams, 0.5);

console.log("Lot final r526-r550 validé : 25 recettes relues, 8 repas éligibles.");
