import assert from "node:assert/strict";
import test from "node:test";
import { compareReports, fingerprint, makeScenarios, parseArguments, sampleStatistics } from "../scripts/benchmark-engine.mjs";
import { DEFAULT_PROFILE } from "../src/domain.ts";

test("les statistiques gardent les échantillons intacts et définissent le p95 empirique", () => {
  const samples = [4, 1, 3, 2];
  assert.deepEqual(sampleStatistics(samples), { count: 4, minMs: 1, medianMs: 2.5, p95Ms: 4, maxMs: 4 });
  assert.deepEqual(samples, [4, 1, 3, 2]);
  assert.equal(sampleStatistics([5, 1, 3]).medianMs, 3);
  assert.equal(sampleStatistics(Array.from({ length: 20 }, (_, index) => index + 1)).p95Ms, 19);
  for (const invalid of [[], [NaN], [Infinity], [-1], ["1"]]) assert.throws(() => sampleStatistics(invalid));
});

test("le protocole refuse les compteurs invalides et exige un fichier de preuve", () => {
  assert.equal(parseArguments(["--output", "/tmp/benchmark.json"]).repetitions, 20);
  assert.equal(parseArguments(["--output", "/tmp/benchmark.json", "--warmup", "0"]).warmup, 0);
  assert.equal(parseArguments(["--help"]).help, true);
  for (const args of [[], ["--output"], ["--output", "/tmp/test.json", "--repetitions", "0"], ["--output", "/tmp/test.json", "--warmup", "-1"], ["--output", "/tmp/test.json", "--repetitions", "1.5"], ["--output", "/tmp/test.json", "--warmup", "Infinity"], ["--unknown", "1"], ["--output", "/tmp/test.json", "--preflight", "--compare", "/tmp/base.json"]]) assert.throws(() => parseArguments(args));
});

test("les 24 entrées couvrent les huit profils, sans dépendance à la date courante", () => {
  const before = structuredClone(DEFAULT_PROFILE);
  const scenarios = makeScenarios(DEFAULT_PROFILE);
  assert.equal(scenarios.length, 24);
  assert.equal(new Set(scenarios.map((entry) => entry.id)).size, 24);
  assert.deepEqual(scenarios, makeScenarios(DEFAULT_PROFILE));
  assert.deepEqual(DEFAULT_PROFILE, before);
  for (const scenario of scenarios) assert.equal(scenario.options.generatedAt, `${scenario.options.startsOn}T12:00:00.000Z`);
  const large = scenarios.find((entry) => entry.id === "large-21x8/autumn");
  assert.equal(large.profile.mealsPerDay * large.profile.people, 24);
  assert.equal(scenarios.find((entry) => entry.id === "locked-favorites/autumn").options.lockedMeals.length, 4);
  assert.equal(scenarios.find((entry) => entry.id === "mostly-skipped/autumn").profile.dayConstraints.reduce((sum, day) => sum + day.skippedMealTypes.length, 0), 12);
  scenarios[0].profile.allergies.push("test");
  assert.deepEqual(scenarios[1].profile.allergies, []);
  assert.deepEqual(DEFAULT_PROFILE, before);
});

function report() {
  const input = { id: "case", profile: { people: 2 }, options: { seed: 17, startsOn: "2026-09-28", generatedAt: "2026-09-28T12:00:00.000Z" } };
  const plan = { meals: [{ id: "day-0-lunch", recipeId: "example", portions: 2 }], estimatedCost: 5 };
  return { format: "inflamm-menu-engine-benchmark-v1", environment: { node: "test", cpuModel: "fixture" },
    settings: { preflight: false, warmup: 3, repetitions: 20 }, catalogue: { count: 2, hash: "recipes" }, errorContractHash: "error",
    scenarios: [{ ...input, inputHash: fingerprint(input), plan, outputHash: fingerprint(plan), timing: { medianMs: 10, p95Ms: 12 } }],
  };
}

test("la comparaison accepte uniquement les sorties entières identiques et calcule l’écart", () => {
  const baseline = report(); const candidate = structuredClone(baseline);
  candidate.scenarios[0].timing = { medianMs: 5, p95Ms: 6 };
  const before = structuredClone(baseline);
  assert.deepEqual(compareReports(baseline, candidate), [{ id: "case", outputIdentical: true, baselineMedianMs: 10, candidateMedianMs: 5, medianChangePercent: -50, baselineP95Ms: 12, candidateP95Ms: 6 }]);
  assert.deepEqual(baseline, before);
});

test("une différence de contexte, données, profil ou protocole invalide la comparaison", () => {
  for (const change of [
    (value) => { value.format = "other"; },
    (value) => { value.environment.node = "different"; },
    (value) => { value.catalogue.hash = "different"; },
    (value) => { value.catalogue.count = 3; },
    (value) => { value.settings.warmup = 2; },
    (value) => { value.settings.repetitions = 10; },
    (value) => { value.settings.preflight = true; },
    (value) => { value.scenarios[0].inputHash = "different"; },
    (value) => { value.scenarios[0].profile.people = 8; },
    (value) => { value.scenarios[0].options.seed = 18; },
    (value) => { value.errorContractHash = "different"; },
  ]) {
    const baseline = report(); const candidate = structuredClone(baseline); change(candidate);
    assert.throws(() => compareReports(baseline, candidate));
  }
});

test("une empreinte divergente, un plan altéré ou une empreinte recalculée différente échouent", () => {
  for (const change of [
    (entry) => { entry.outputHash = "different"; },
    (entry) => { entry.plan.estimatedCost = 6; },
    (entry) => { entry.plan.meals[0].recipeId = "other"; entry.outputHash = fingerprint(entry.plan); },
  ]) {
    const baseline = report(); const candidate = structuredClone(baseline); change(candidate.scenarios[0]);
    assert.throws(() => compareReports(baseline, candidate));
  }
});
