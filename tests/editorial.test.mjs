import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { formatIngredientQuantity, formatIngredientUnit, formatDietLabel, DIET_LABELS, DIFFICULTY_LABELS, COST_LABELS } from "../src/presentation.ts";
import { formatShoppingAmount } from "../src/shopping.ts";
import { formatShoppingListText } from "../src/engine.ts";

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalogue = json("../src/data/recettes-anti-inflammatoires.json");
const before = json("./fixtures/cautions-before-editorial-cleanup.json");

test("culinary quantities use French labels without converting or changing their values", () => {
  for (const unit of ["piece", "pièce", "pièces"]) {
    assert.equal(formatIngredientQuantity(1, unit), "1 pièce");
    assert.equal(formatIngredientQuantity(2.5, unit), "2,5 pièces");
    assert.equal(formatIngredientQuantity(0.5, unit), "0,5 pièce");
  }
  for (const unit of ["c_soupe", "c. à s.", "c. à soupe"]) assert.equal(formatIngredientQuantity(2, unit), "2 c. à soupe");
  for (const unit of ["c_cafe", "c. à c.", "c. à café"]) assert.equal(formatIngredientQuantity(0.5, unit), "0,5 c. à café");
  for (const unit of ["g", "kg", "ml", "l", "cm"]) assert.equal(formatIngredientQuantity(10, unit), `10 ${unit}`);
  assert.equal(formatIngredientQuantity(10.01, "g"), "10 g");
  assert.equal(formatIngredientUnit("morceau", 2), "morceaux");
  assert.equal(formatIngredientUnit("gousse", 3), "gousses");
  assert.equal(formatIngredientUnit("unité future", 2), "unité future");
});

test("all catalogue units and classifications have their expected French presentation", () => {
  const units = new Set(["g", "ml", "c. à s.", "c. à c.", "pincée", "pièce", "cm", "l", "botte", "gousse", "poignée", "branche", "kg", "tranche", "boîte", "morceau", "tige", "piece", "c_soupe", "c_cafe", "bouquet", "feuille"]);
  for (const recipe of catalogue.recipes) {
    for (const ingredient of recipe.ingredients) {
      assert.ok(units.has(ingredient.unite), `${recipe.id}: review presentation for new unit ${ingredient.unite}`);
      assert.doesNotMatch(formatIngredientQuantity(ingredient.quantite, ingredient.unite), /piece|c_soupe|c_cafe|c\. à [sc]\./);
    }
    for (const diet of recipe.regimes) assert.ok(DIET_LABELS[diet], `${recipe.id}: diet label ${diet}`);
    assert.ok(DIFFICULTY_LABELS[recipe.difficulte]);
    assert.ok(COST_LABELS[recipe.cout]);
  }
  assert.equal(formatDietLabel("vegetarien"), "Végétarien");
  assert.equal(formatDietLabel("vegetalien"), "Végétalien");
  assert.equal(formatDietLabel("pescetarien"), "Pescétarien");
});

test("shopping display and all text exports share the same quantities and unit labels", () => {
  const amounts = [{ quantity: 2.5, unit: "piece" }, { quantity: 1, unit: "c_soupe" }, { quantity: 0.5, unit: "c_cafe" }];
  const snapshot = structuredClone(amounts);
  for (const amount of amounts) assert.equal(formatShoppingAmount(amount), formatIngredientQuantity(amount.quantity, amount.unit));
  const text = formatShoppingListText([{ ingredientId: "test", name: "Test", category: "grocery", amounts, checked: false, inPantry: false }]);
  assert.match(text, /2,5 pièces \+ 1 c\. à soupe \+ 0,5 c\. à café/);
  assert.match(text, /1 article à acheter/);
  assert.deepEqual(amounts, snapshot);
});

test("the twelve edited cautions retain every unique warning and one allergen introduction", () => {
  assert.equal(Object.keys(before).length, 12);
  const final = json("../research/pilot-r476-r500.final.json");
  for (const [id, original] of Object.entries(before)) {
    const intro = original.match(/^Contient [^.;]+/)[0];
    const second = original.indexOf(intro, intro.length);
    assert.ok(second > 0);
    const tail = original.slice(second + intro.length + 2);
    const expected = original.slice(0, second) + tail[0].toLocaleUpperCase("fr") + tail.slice(1);
    assert.equal(catalogue.recipes.find((recipe) => recipe.id === id).app.review.caution, expected, id);
    assert.equal(final.recipes.find((recipe) => recipe.id === id).app.review.caution, expected, `${id}: final authoring source`);
  }
});

test("editorial guard rejects repeated allergen introductions in catalogue and final sources", () => {
  function assertNoRepeatedIntro(caution, label) {
    const seen = new Set();
    for (const match of (caution ?? "").matchAll(/\bContient\s+[^.;]+/g)) {
      const intro = match[0].trim().toLocaleLowerCase("fr");
      assert.ok(!seen.has(intro), `${label}: repeated allergen introduction: ${intro}`);
      seen.add(intro);
    }
  }
  assert.throws(() => assertNoRepeatedIntro("Contient lait; au froid. Contient lait; étiquettes à vérifier.", "fixture"));
  assertNoRepeatedIntro("Contient lait. Contient soja; vérifier les étiquettes.", "distinct warnings");
  const finalFiles = readdirSync(new URL("../research/", import.meta.url)).filter((name) => /^pilot-r\d+-r\d+\.final\.json$/.test(name));
  for (const [name, data] of [["catalogue", catalogue], ...finalFiles.map((name) => [name, json(`../research/${name}`)])]) {
    for (const recipe of data.recipes) assertNoRepeatedIntro(recipe.app.review.caution, `${name}:${recipe.id}`);
  }
});
