#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// An optional source directory allows the same benchmark to run against a
// frozen checkout. No dependency, UI change or machine-dependent test threshold.
const source = process.argv[2] ? pathToFileURL(`${resolve(process.argv[2])}/`) : new URL("../src/", import.meta.url);
const { generateWeeklyPlan } = await import(new URL("engine.ts", source));
const { RECIPES } = await import(new URL("recipes.ts", source));
const reference = JSON.parse(await readFile(new URL("../tests/fixtures/planner-determinism.json", import.meta.url), "utf8"));
const results = [];

for (const scenario of reference.scenarios) {
  const create = (seed) => generateWeeklyPlan(RECIPES, scenario.profile, { ...scenario.options, seed });
  for (const sample of scenario.cases.slice(0, 3)) create(sample.seed);
  const samplesMs = [];
  for (const sample of scenario.cases) {
    const start = performance.now();
    const plan = create(sample.seed);
    samplesMs.push(performance.now() - start);
    // Hashing is outside the measured interval. Speed must not change a menu.
    assert.equal(createHash("sha256").update(JSON.stringify(plan)).digest("hex"), sample.sha256, `${scenario.name}: ${sample.seed}`);
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  results.push({
    scenario: scenario.name,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    samplesMs,
  });
}

console.log(JSON.stringify({ node: process.version, recipes: RECIPES.length, referenceCommit: reference.referenceCommit, results }, null, 2));
