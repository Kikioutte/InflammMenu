import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORMAT = "inflamm-menu-engine-benchmark-v1";
export const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function sampleStatistics(samples) {
  assert.ok(samples.length > 0 && samples.every((sample) => Number.isFinite(sample) && sample >= 0), "Échantillons invalides");
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    minMs: sorted[0],
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
  };
}

export function parseArguments(args) {
  const options = { root: repository, warmup: 3, repetitions: 20, output: null, compare: null, preflight: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--preflight") { options.preflight = true; continue; }
    if (flag === "--help") { options.help = true; continue; }
    const value = args[++index];
    assert.ok(value && !value.startsWith("--"), `Valeur manquante pour ${flag}`);
    if (["--root", "--output", "--compare"].includes(flag)) options[flag.slice(2)] = resolve(value);
    else if (flag === "--warmup" || flag === "--repetitions") {
      const number = Number(value);
      assert.ok(Number.isInteger(number) && number >= (flag === "--warmup" ? 0 : 1) && number <= 100, `Valeur invalide pour ${flag}`);
      options[flag.slice(2)] = number;
    } else throw new Error(`Option inconnue : ${flag}`);
  }
  assert.ok(!(options.preflight && options.compare), "Le pré-vol ne compare pas les temps");
  if (!options.help) assert.ok(options.output, "--output est obligatoire pour conserver les preuves");
  return options;
}

export function makeScenarios(defaultProfile) {
  const base = structuredClone(defaultProfile);
  const profiles = [
    ["default-14", base],
    ["large-21x8", { ...base, mealsPerDay: 3, people: 8, weeklyBudget: 500, maxPrepMinutes: 90 }],
    ["vegetarian", { ...base, diet: "vegetarian", weeklyTargets: { legumeMeals: 4, fishMeals: 0 } }],
    ["allergies-exclusion", { ...base, maxPrepMinutes: 45, allergies: ["gluten", "lait", "fruits-a-coque"], excludedIngredientIds: ["carrot"] }],
    ["daily-constraints", { ...base, associationMode: "green", people: 4, weeklyBudget: 160, dayConstraints: [
      { dayIndex: 0, maxPrepMinutes: 20, portions: 2, skippedMealTypes: ["dinner"] },
      { dayIndex: 2, maxPrepMinutes: 20, mealPortions: [{ mealType: "lunch", portions: 8 }, { mealType: "dinner", portions: 1 }], skippedMealTypes: [] },
      { dayIndex: 5, maxPrepMinutes: 45, portions: 3, skippedMealTypes: ["lunch"] },
    ] }],
    ["locked-favorites", base],
    ["tight-budget", { ...base, weeklyBudget: 20 }],
    ["mostly-skipped", { ...base, dayConstraints: Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, skippedMealTypes: dayIndex === 0 ? [] : ["lunch", "dinner"] })) }],
  ];
  const periods = [["autumn", "2026-09-28"], ["summer", "2026-08-10"], ["winter", "2026-01-05"]];
  const locked = [
    [0, "lunch", "curry-pois-chiches-epinards"],
    [0, "dinner", "cabillaud-tomate-olives"],
    [2, "lunch", "omelette-legumes-quinoa"],
    [4, "dinner", "boulettes-dinde-courgette-tomate"],
  ].map(([dayIndex, mealType, recipeId]) => ({ id: `day-${dayIndex}-${mealType}`, dayIndex, mealType, recipeId, portions: 2, source: "generated", locked: true }));
  return profiles.flatMap(([name, profile]) => periods.map(([season, startsOn]) => ({
    id: `${name}/${season}`, profile: structuredClone(profile), options: {
      seed: Date.parse(`${startsOn}T12:00:00.000Z`), startsOn, generatedAt: `${startsOn}T12:00:00.000Z`, season,
      ...(name === "locked-favorites" ? { lockedMeals: structuredClone(locked), favoriteRecipeIds: ["bowl-tofu-brocoli-sesame", "lasagnes-completes-legumes"] } : {}),
    },
  })));
}

export function compareReports(baseline, candidate) {
  assert.equal(baseline.format, FORMAT, "Format de baseline incompatible");
  assert.equal(candidate.format, FORMAT, "Format de candidat incompatible");
  assert.equal(baseline.settings.preflight, false, "Une baseline mesurée est nécessaire");
  assert.equal(candidate.settings.preflight, false, "Un candidat mesuré est nécessaire");
  assert.deepEqual(candidate.environment, baseline.environment, "Environnement Node/OS/CPU différent");
  assert.deepEqual(candidate.settings, baseline.settings, "Protocole de mesure différent");
  assert.deepEqual(candidate.catalogue, baseline.catalogue, "Recettes différentes : comparaison refusée");
  assert.deepEqual(candidate.scenarios.map(({ id, inputHash }) => ({ id, inputHash })), baseline.scenarios.map(({ id, inputHash }) => ({ id, inputHash })), "Profils, options ou ordre des scénarios différents");
  assert.equal(candidate.errorContractHash, baseline.errorContractHash, "Diagnostic d’échec différent");
  return candidate.scenarios.map((scenario, index) => {
    const previous = baseline.scenarios[index];
    for (const entry of [previous, scenario]) {
      assert.equal(entry.inputHash, fingerprint({ id: entry.id, profile: entry.profile, options: entry.options }), `Empreinte d’entrée invalide : ${entry.id}`);
      assert.equal(entry.outputHash, fingerprint(entry.plan), `Empreinte du plan invalide : ${entry.id}`);
    }
    assert.equal(scenario.outputHash, previous.outputHash, `Plan différent : ${scenario.id}`);
    return { id: scenario.id, outputIdentical: true,
      baselineMedianMs: previous.timing.medianMs, candidateMedianMs: scenario.timing.medianMs,
      medianChangePercent: previous.timing.medianMs === 0 ? null : (scenario.timing.medianMs / previous.timing.medianMs - 1) * 100,
      baselineP95Ms: previous.timing.p95Ms, candidateP95Ms: scenario.timing.p95Ms,
    };
  });
}

function codeRevision(root) {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); }
  catch { return null; }
}

export async function runBenchmark(options) {
  const enginePath = resolve(options.root, "src/engine.ts");
  const engineFileHash = createHash("sha256").update(await readFile(enginePath)).digest("hex");
  const revision = codeRevision(options.root);
  const [{ RECIPES }, { DEFAULT_PROFILE }, engine] = await Promise.all([
    import(pathToFileURL(resolve(options.root, "src/recipes.ts")).href),
    import(pathToFileURL(resolve(options.root, "src/domain.ts")).href),
    import(pathToFileURL(resolve(options.root, "src/engine.ts")).href),
  ]);
  const scenarios = makeScenarios(DEFAULT_PROFILE);
  const catalogueHash = fingerprint(RECIPES);
  const entries = scenarios.map((scenario) => ({ ...scenario, inputHash: fingerprint(scenario), samplesMs: [], outputHash: null, plan: null }));
  const byId = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
  const invoke = (entry, timed = false) => {
    const start = performance.now();
    const plan = engine.generateWeeklyPlan(RECIPES, entry.profile, entry.options);
    const elapsed = performance.now() - start;
    // All validation and hashing occur after stopping the timer.
    const outputHash = fingerprint(plan);
    if (entry.outputHash) assert.equal(outputHash, entry.outputHash, `Résultat non déterministe : ${entry.id}`);
    else {
      assert.equal(plan.meals.length, entry.profile.mealsPerDay * 7, entry.id);
      for (const meal of plan.meals) {
        const recipe = byId.get(meal.recipeId);
        assert.ok(recipe && recipe.mealTypes.includes(meal.mealType), `${entry.id}: créneau invalide`);
        assert.ok(engine.recipeIsAllowedForSlot(recipe, entry.profile, meal.dayIndex), `${entry.id}: filtre strict contourné`);
      }
      const active = plan.meals.filter((meal) => !meal.skipped);
      assert.equal(new Set(active.map((meal) => meal.recipeId)).size, active.length, `${entry.id}: doublon`);
      for (const locked of entry.options.lockedMeals ?? []) {
        const kept = plan.meals.find((meal) => meal.id === locked.id);
        assert.equal(kept?.recipeId, locked.recipeId, `${entry.id}: cadenas ignoré`);
        assert.equal(kept?.locked, true, `${entry.id}: cadenas perdu`);
      }
      entry.outputHash = outputHash;
      entry.plan = plan;
    }
    if (timed) entry.samplesMs.push(elapsed);
  };
  // Preflight also primes imports/validation. Their cost is not generation time.
  for (const entry of entries) {
    invoke(entry);
    console.log(`Pré-vol ${entry.id} : ${entry.plan.meals.length} repas, ${entry.plan.estimatedCost} €, ${entry.outputHash.slice(0, 12)}`);
  }
  const impossible = { ...structuredClone(DEFAULT_PROFILE), allergies: ["allergene-benchmark-inconnu"] };
  let errorContract;
  try { engine.generateWeeklyPlan(RECIPES, impossible, entries[0].options); }
  catch (error) { errorContract = { name: error.name, message: error.message, diagnostic: error.diagnostic, mealType: error.mealType, dayIndex: error.dayIndex }; }
  assert.ok(errorContract?.diagnostic, "Le profil invalide doit conserver son diagnostic d’échec");
  if (!options.preflight) {
    for (let round = 0; round < options.warmup; round += 1) for (let offset = 0; offset < entries.length; offset += 1) invoke(entries[(offset + round) % entries.length]);
    for (let round = 0; round < options.repetitions; round += 1) {
      for (let offset = 0; offset < entries.length; offset += 1) invoke(entries[(offset + round) % entries.length], true);
      console.log(`Mesure ${round + 1}/${options.repetitions} terminée`);
    }
  }
  assert.equal(fingerprint(RECIPES), catalogueHash, "Le moteur a modifié les recettes sources");
  assert.equal(createHash("sha256").update(await readFile(enginePath)).digest("hex"), engineFileHash, "Le fichier moteur a changé pendant la mesure");
  for (const entry of entries) assert.equal(fingerprint({ id: entry.id, profile: entry.profile, options: entry.options }), entry.inputHash, `${entry.id}: entrées modifiées`);
  const report = {
    format: FORMAT, measuredAt: new Date().toISOString(),
    scope: "Node local, moteur synchrone uniquement ; ni téléchargement, ni stockage, ni rendu, ni téléphone réel.",
    percentileMethod: "Nearest rank : ceil(0.95*n), descriptif seulement ; aucun seuil CI automatique.",
    environment: { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch, osRelease: release(), cpuModel: cpus()[0]?.model ?? null, cpuCount: cpus().length },
    source: { root: options.root, revision, engineFileHash },
    settings: { preflight: options.preflight, warmup: options.preflight ? 0 : options.warmup, repetitions: options.preflight ? 0 : options.repetitions, ordering: "round-robin, start index rotates by round" },
    catalogue: { count: RECIPES.length, hash: catalogueHash }, errorContract, errorContractHash: fingerprint(errorContract),
    scenarios: entries.map(({ id, profile, options, inputHash, outputHash, plan, samplesMs }) => ({ id, profile, options, inputHash, outputHash, plan, samplesMs, timing: samplesMs.length ? sampleStatistics(samplesMs) : null })),
    aggregate: options.preflight ? null : sampleStatistics(entries.flatMap((entry) => entry.samplesMs)),
  };
  if (options.compare) report.comparison = compareReports(JSON.parse(await readFile(options.compare, "utf8")), report);
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  if (!options.preflight) console.table(report.scenarios.map(({ id, timing }) => ({ scenario: id, medianMs: timing.medianMs.toFixed(3), p95Ms: timing.p95Ms.toFixed(3) })));
  console.log(`Preuve enregistrée : ${options.output}`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) console.log("node scripts/benchmark-engine.mjs --output /tmp/baseline.json [--preflight] [--warmup 3] [--repetitions 20] [--root /autre/checkout] [--compare /tmp/baseline.json]");
    else await runBenchmark(options);
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
