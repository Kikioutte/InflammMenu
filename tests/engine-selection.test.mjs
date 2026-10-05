import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fingerprint, makeScenarios } from "../scripts/benchmark-engine.mjs";
import { DEFAULT_PROFILE } from "../src/domain.ts";
import { generateWeeklyPlan } from "../src/engine.ts";
import { RECIPES } from "../src/recipes.ts";

// Captured before the scoring optimization, on the recorded reference commit.
// This is an output contract, never a timing threshold. Catalogue or intended
// planning-rule changes require an explicit review of these reference outputs.
const baseline = JSON.parse(await readFile(new URL("./fixtures/engine-selection-baseline.json", import.meta.url), "utf8"));
const scenarios = makeScenarios(DEFAULT_PROFILE);
// The stored 721-recipe output contract covers r001-r1257 plus the V1 cards.
// Keep that exact reviewed input stable as content grows. The current full
// catalogue is exercised by engine, diversity and individual batch tests.
const historicalRecipes = RECIPES.filter((recipe) => {
  const catalogueId = /^catalog-r(\d+)$/.exec(recipe.id);
  return !catalogueId || Number(catalogueId[1]) <= 1257;
});

test("la référence déterministe conserve le catalogue historique et les mêmes entrées", () => {
  assert.deepEqual({ count: historicalRecipes.length, hash: fingerprint(historicalRecipes) }, baseline.catalogue);
  assert.deepEqual(scenarios.map((scenario) => ({ id: scenario.id, inputHash: fingerprint(scenario) })),
    baseline.scenarios.map(({ id, inputHash }) => ({ id, inputHash })));
});

for (const scenario of scenarios) {
  test(`le plan entier reste identique à la référence : ${scenario.id}`, () => {
    const expected = baseline.scenarios.find((entry) => entry.id === scenario.id);
    assert.ok(expected, `Référence manquante : ${scenario.id}`);
    const inputHash = fingerprint(scenario);
    const plan = generateWeeklyPlan(historicalRecipes, scenario.profile, scenario.options);
    assert.equal(fingerprint(plan), expected.outputHash);
    assert.equal(fingerprint(scenario), inputHash, "Le moteur ne modifie pas ses entrées");
    assert.equal(fingerprint(historicalRecipes), baseline.catalogue.hash, "Les recettes historiques restent intactes");
  });
}

test("un profil impossible conserve le diagnostic exact de la référence", () => {
  const profile = { ...structuredClone(DEFAULT_PROFILE), allergies: ["allergene-benchmark-inconnu"] };
  let diagnostic;
  try {
    generateWeeklyPlan(historicalRecipes, profile, scenarios[0].options);
  } catch (error) {
    diagnostic = { name: error.name, message: error.message, diagnostic: error.diagnostic,
      mealType: error.mealType, dayIndex: error.dayIndex };
  }
  assert.ok(diagnostic, "Le profil impossible doit être refusé");
  assert.equal(fingerprint(diagnostic), baseline.errorContractHash);
});
