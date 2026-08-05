import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { validateCatalogue } from "../scripts/validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const cwd = root.pathname;
const productionPath = new URL("src/data/recettes-anti-inflammatoires.json", root).pathname;
const mergeScript = new URL("scripts/merge-final-batches.mjs", root).pathname;
const researchPath = new URL("research/", root).pathname;
const finalFiles = (await readdir(researchPath))
  .filter((name) => /^pilot-r\d{3}-r\d{3}\.final\.json$/.test(name))
  .sort()
  .map((name) => join(researchPath, name));

function runMerge(argumentsList) {
  return spawnSync(process.execPath, [mergeScript, ...argumentsList], {
    cwd,
    encoding: "utf8",
  });
}

test("the complete 20-batch merge passes as a non-writing simulation", async () => {
  assert.equal(finalFiles.length, 20, "20 lots finaux sont requis pour l'intégration complète");
  const before = await readFile(productionPath, "utf8");
  const result = runMerge(finalFiles);
  const after = await readFile(productionPath, "utf8");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Simulation valide : 550 recettes prêtes \(500 nouvelles\)/);
  assert.match(result.stdout, /Aucun fichier écrit/);
  assert.equal(after, before, "la simulation ne doit pas modifier le catalogue de production");
});

test("the merge refuses an incomplete final batch set", () => {
  const result = runMerge(finalFiles.slice(0, -1));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Ensemble final incomplet : 500 recettes attendues, 475 reçues/);
});

test("a preview output is a strict schema v2.1 catalogue with preserved historical behavior", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "inflamm-menu-merge-test-"));
  const outputPath = join(temporaryDirectory, "catalogue-v2.1.json");
  const result = runMerge(["--output", outputPath, ...finalFiles]);
  assert.equal(result.status, 0, result.stderr);

  const [historical, merged] = await Promise.all([
    readFile(productionPath, "utf8").then(JSON.parse),
    readFile(outputPath, "utf8").then(JSON.parse),
  ]);
  const historicalBase = historical.recipes.filter((recipe) => Number(recipe.id.slice(1)) <= 50);
  const validation = validateCatalogue(merged);
  assert.equal(validation.schemaVersion, "2.1.0");
  assert.equal(validation.recipeCount, 550);
  assert.deepEqual(
    merged.recipes.slice(0, 50).map(({ id, titre }) => ({ id, titre })),
    historicalBase.map(({ id, titre }) => ({ id, titre })),
  );
  assert.deepEqual(
    merged.recipes.slice(0, 50).map((recipe) =>
      recipe.ingredients.map(({ quantite, unite, nom }) => ({ quantite, unite, nom })),
    ),
    historicalBase.map((recipe) =>
      recipe.ingredients.map(({ quantite, unite, nom }) => ({ quantite, unite, nom })),
    ),
  );
  assert.ok(
    merged.recipes.slice(0, 50).every((recipe) =>
      recipe.provenance &&
      recipe.app.planner.active_minutes === recipe.temps.total &&
      recipe.ingredients.every((ingredient) =>
        ingredient.id &&
        ingredient.quantite_normalisee !== undefined &&
        ingredient.unite_normalisee &&
        ingredient.facultatif === false
      ),
    ),
  );
});
