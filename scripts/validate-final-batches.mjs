import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const researchUrl = new URL("../research/", import.meta.url);
const names = (await readdir(researchUrl))
  .filter((name) => /^pilot-r\d{3}-r\d{3}\.final\.json$/.test(name))
  .sort();
assert.ok(names.length > 0, "Aucun lot final trouvé");

const ids = new Set();
const slugs = new Set();
let recipeCount = 0;
let eligibleCount = 0;
let cautionCount = 0;

for (const name of names) {
  const catalogue = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
  validateCatalogue(catalogue, { taxonomy: "legacy" });
  assert.equal(catalogue.meta.status, "editorial-validated", `${name}: statut éditorial final requis`);
  assert.match(catalogue.meta.culinary_notice, /aucune.*testée physiquement/i, `${name}: limite d'essai culinaire absente`);
  assert.match(catalogue.meta.cost_notice, /estimations/i, `${name}: limite tarifaire absente`);

  for (const recipe of catalogue.recipes) {
    assert.ok(!ids.has(recipe.id), `${recipe.id}: identifiant dupliqué entre lots finaux`);
    assert.ok(!slugs.has(recipe.slug), `${recipe.id}: slug dupliqué entre lots finaux`);
    ids.add(recipe.id);
    slugs.add(recipe.slug);
    assert.equal(recipe.app.review.stage, "editorial-validated", `${recipe.id}: relecture éditoriale finale absente`);
    assert.ok(["validated", "caution"].includes(recipe.app.review.status), `${recipe.id}: statut de relecture invalide`);
    assert.ok(recipe.score_anti_inflammatoire >= 1 && recipe.score_anti_inflammatoire <= 10, `${recipe.id}: indice éditorial non attribué`);
    assert.match(recipe.score_note, /profil|modèle|indice éditorial/i, `${recipe.id}: justification d'indice absente`);
    assert.match(recipe.score_note, /ne (mesure|prouve)|aucun effet médical|sans portée médicale/i, `${recipe.id}: limite médicale de l'indice absente`);
    assert.equal(recipe.provenance.reviewed_at, catalogue.meta.reviewed_at, `${recipe.id}: date de relecture incohérente`);
    assert.ok(["calculated", "calculated-with-cautions"].includes(recipe.nutrition_par_portion.estimation?.statut), `${recipe.id}: nutrition finale non calculée`);
    if (recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions") {
      assert.ok(recipe.nutrition_par_portion.estimation.cautions?.length > 0, `${recipe.id}: réserve nutritionnelle non détaillée`);
      assert.equal(recipe.app.review.status, "caution", `${recipe.id}: réserve nutritionnelle masquée dans la relecture`);
      cautionCount += 1;
    }
    if (recipe.app.planner.eligible) eligibleCount += 1;
    recipeCount += 1;
  }
}

console.log(`${names.length} lots finaux valides : ${recipeCount} recettes relues, ${eligibleCount} éligibles, ${cautionCount} réserves nutritionnelles.`);
