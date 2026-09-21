import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { canonicalIngredientId } from "../src/shopping.ts";

// Derive coefficients only from the already reviewed ingredient mappings and
// conversions. This does not change the authored catalogue or fetch new data.
const root = new URL("../", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const [catalogue, ciqual, usda, association] = await Promise.all([
  read("src/data/recettes-anti-inflammatoires.json"), read("research/ciqual-2025-core.json"),
  read("research/usda-sr-fallbacks.json"), read("research/association-ciqual-source.json"),
]);
const foods = {
  ciqual: new Map(ciqual.foods.map(food => [String(food.code), food])),
  "usda-sr": new Map(usda.foods.map(food => [String(food.fdc_id), food])),
};
const associationFoods = new Map(association.foods.map(food => [String(food.code), food]));
const [columns, ...rows] = (await readFile(new URL("research/association-ingredients.tsv", root), "utf8")).trim().split(/\r?\n/).map(line => line.split("\t"));
const associationIngredients = rows.map(row => Object.fromEntries(columns.map((key, index) => [key, row[index]])));
const mappings = [];
for (const name of (await readdir(new URL("research/", root))).sort()) {
  const match = name.match(/^ciqual-map-r(\d+)-r(\d+)\.json$/);
  if (match) mappings.push({ start: Number(match[1]), end: Number(match[2]), ingredients: (await read(`research/${name}`)).ingredients });
}
const fields = { calories: ["energy_kcal", "calories"], protein: ["protein_g", "proteines_g"], fiber: ["fiber_g", "fibres_g"] };
const available = {};
let unavailable = 0;
for (const recipe of catalogue.recipes) {
  const estimate = recipe.nutrition_par_portion.estimation;
  if (!estimate?.statut?.startsWith("calculated")) { unavailable += 1; continue; }
  const isAssociation = recipe.tags.includes("associations-personnelles");
  const ordinal = Number(recipe.id.slice(1));
  const mapping = mappings.find(item => item.start <= ordinal && item.end >= ordinal);
  // Older estimates and CREAMi use other calculation paths. Their published
  // numbers remain available, but cannot justify arbitrary quantity edits here.
  if (!mapping && !isAssociation) { unavailable += 1; continue; }
  const coefficients = [];
  let detailIndex = 0;
  for (const ingredient of recipe.ingredients) {
    const entry = { id: canonicalIngredientId(ingredient.id), unit: ingredient.unite_normalisee, optional: ingredient.facultatif === true, quantity: ingredient.quantite_normalisee / recipe.portions, calories: 0, protein: 0, fiber: 0 };
    assert.ok(Number.isFinite(entry.quantity) && entry.quantity > 0, `${recipe.id}: invalid culinary quantity`);
    if (!ingredient.facultatif) {
      const detail = estimate.details[detailIndex++];
      assert.equal(canonicalIngredientId(detail?.ingredient_id ?? ""), entry.id, `${recipe.id}: ingredient/detail mismatch`);
      let food, overrides = {}, grams;
      if (isAssociation) {
        // This collection uses grams (or ml of water) and an explicit TSV food
        // mapping. Never generalise its ml conversion to other ingredients.
        const reviewed = associationIngredients.find(item => item.nom === ingredient.nom && item.ciqual === String(detail.source_code));
        assert.ok(reviewed && detail.source_dataset === "ciqual", `${recipe.id}: unreviewed association ingredient`);
        assert.ok(entry.unit === "g" || (reviewed.key === "eau" && entry.unit === "ml"), `${recipe.id}: unreviewed unit`);
        grams = ingredient.quantite_normalisee;
        food = associationFoods.get(String(detail.source_code));
        const price = Number(reviewed.price_per_kg);
        assert.ok(Number.isFinite(price) && price >= 0, `${recipe.id}: missing editorial ingredient price`);
        entry.cost = price / 1_000;
      } else {
        const reviewed = mapping.ingredients.find(item => item.ingredient_id === detail.ingredient_id);
        assert.ok(reviewed && ["validated", "caution"].includes(reviewed.review_status), `${recipe.id}: mapping not reviewed`);
        assert.equal(reviewed.source_dataset ?? "ciqual", detail.source_dataset, `${recipe.id}: reviewed dataset changed`);
        assert.equal(String(reviewed.selected_source_code ?? reviewed.selected_ciqual_code), String(detail.source_code), `${recipe.id}: reviewed food changed`);
        const occurrence = reviewed.occurrence_overrides?.[recipe.id];
        grams = occurrence?.grams_total ?? ingredient.quantite_normalisee * (occurrence?.grams_per_normalized_unit ?? reviewed.grams_per_unit?.[ingredient.unite_normalisee] ?? reviewed.grams_per_normalized_unit);
        food = foods[detail.source_dataset]?.get(String(detail.source_code));
        overrides = reviewed.nutrient_overrides ?? {};
      }
      assert.ok(Number.isFinite(grams) && grams > 0 && Math.abs(grams - detail.grams) <= 0.02, `${recipe.id}: quantity/conversion mismatch`);
      assert.ok(food, `${recipe.id}: missing official food`);
      for (const [target, [source]] of Object.entries(fields)) {
        const replacement = overrides[source];
        const nutrient = food.nutrients_per_100g[source]?.value ?? (typeof replacement === "number" ? replacement : replacement?.value);
        assert.ok(Number.isFinite(nutrient) && nutrient >= 0, `${recipe.id}: missing nutrient ${source}`);
        entry[target] = nutrient * grams / (100 * recipe.portions * entry.quantity);
      }
    }
    assert.ok(!coefficients.some(item => item.id === entry.id && item.unit === entry.unit), `${recipe.id}: ambiguous repeated ingredient`);
    coefficients.push(entry);
  }
  assert.equal(detailIndex, estimate.details.length, `${recipe.id}: unused nutrition detail`);
  for (const [target, [, published]] of Object.entries(fields)) {
    const digits = target === "calories" && !isAssociation ? 0 : 1;
    const total = coefficients.reduce((sum, item) => sum + item[target] * item.quantity, 0);
    assert.ok(Math.abs(total - recipe.nutrition_par_portion[published]) <= 0.51 / 10 ** digits, `${recipe.id}: published total changed for ${target}`);
  }
  if (isAssociation) {
    const cost = Math.max(0.1, coefficients.reduce((sum, item) => sum + item.cost * item.quantity, 0));
    assert.ok(Math.abs(cost - recipe.app.planner.cost_per_portion_eur) <= 0.0051, `${recipe.id}: published editorial cost changed`);
  }
  available[`catalog-${recipe.id}`] = coefficients;
}
const serialized = JSON.stringify(available) + "\n";
const output = new URL("src/data/recipe-nutrition.json", root);
if (process.argv.includes("--check")) assert.equal(await readFile(output, "utf8"), serialized, "recipe-nutrition.json doit être régénéré depuis les données relues");
else await writeFile(output, serialized);
console.log(`Estimations des variantes vérifiées : ${Object.keys(available).length} recettes couvertes, ${unavailable} recettes du catalogue sans calcul par ingrédient. Les recettes V1 conservent uniquement leur estimation publiée.`);
