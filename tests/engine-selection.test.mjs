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

test("la référence déterministe utilise le même catalogue et les mêmes entrées", () => {
  assert.deepEqual({ count: RECIPES.length, hash: fingerprint(RECIPES) }, baseline.catalogue);
  assert.deepEqual(scenarios.map((scenario) => ({ id: scenario.id, inputHash: fingerprint(scenario) })),
    baseline.scenarios.map(({ id, inputHash }) => ({ id, inputHash })));
});

for (const scenario of scenarios) {
  test(`le plan entier reste identique à la référence : ${scenario.id}`, () => {
    const expected = baseline.scenarios.find((entry) => entry.id === scenario.id);
    assert.ok(expected, `Référence manquante : ${scenario.id}`);
    const inputHash = fingerprint(scenario);
    const plan = generateWeeklyPlan(RECIPES, scenario.profile, scenario.options);
    assert.equal(fingerprint(plan), expected.outputHash);
    assert.equal(fingerprint(scenario), inputHash, "Le moteur ne modifie pas ses entrées");
    assert.equal(fingerprint(RECIPES), baseline.catalogue.hash, "Les recettes restent intactes");
  });
}

test("un profil impossible conserve le diagnostic exact de la référence", () => {
  const profile = { ...structuredClone(DEFAULT_PROFILE), allergies: ["allergene-benchmark-inconnu"] };
  let diagnostic;
  try {
    generateWeeklyPlan(RECIPES, profile, scenarios[0].options);
  } catch (error) {
    diagnostic = { name: error.name, message: error.message, diagnostic: error.diagnostic,
      mealType: error.mealType, dayIndex: error.dayIndex };
  }
  assert.ok(diagnostic, "Le profil impossible doit être refusé");
  assert.equal(fingerprint(diagnostic), baseline.errorContractHash);
});
