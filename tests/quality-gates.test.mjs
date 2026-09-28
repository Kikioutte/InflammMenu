import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ESLint } from "eslint";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: root, overrideConfigFile: resolve(root, "eslint.config.mjs") });

test("le gate détecte les erreurs JavaScript ciblées avec la vraie configuration", async () => {
  const cases = [
    ["no-dupe-keys", "const object = { value: 1, value: 2 };"],
    ["no-duplicate-case", "switch (value) { case 1: break; case 1: break; }"],
    ["no-dupe-else-if", "if (value === 1) action(); else if (value === 1) other();"],
    ["no-unreachable", "function example() { return 1; action(); }"],
    ["no-unsafe-finally", "function example() { try { return 1; } finally { return 2; } }"],
    ["no-unsafe-negation", "if (!key in object) action();"],
    ["no-async-promise-executor", "new Promise(async (resolve) => { resolve(1); });"],
    ["valid-typeof", "if (typeof value === 'strnig') action();"],
    ["use-isnan", "if (value === NaN) action();"],
    ["for-direction", "for (let index = 0; index < 10; index--) action();"],
    ["no-debugger", "debugger;"],
    ["no-cond-assign", "if (value = next()) action();"],
  ];
  for (const [ruleId, code] of cases) {
    const [result] = await eslint.lintText(code, { filePath: "scripts/quality-gate-probe.mjs" });
    assert.ok(result.messages.some((message) => message.ruleId === ruleId && message.severity === 2), `${ruleId}: ${JSON.stringify(result.messages)}`);
    assert.ok(result.errorCount > 0);
  }
  // ES modules are strict: duplicate parameter names are rejected by the
  // native parser before no-dupe-args can run. Both paths reject this defect.
  const [duplicates] = await eslint.lintText("function example(value, value) {}", { filePath: "scripts/quality-gate-probe.mjs" });
  assert.ok(duplicates.messages.some((message) => message.ruleId === "no-dupe-args" || (message.fatal && /Argument name clash/.test(message.message))));
});

test("les scripts, tests, outils et workers restent tous réellement couverts", async () => {
  for (const filePath of ["eslint.config.mjs", "scripts/nested/probe.mjs", "tests/probe.test.mjs", "tools/lighthouse/probe.mjs", "public/sw.js", "worker/index.js"]) {
    const [result] = await eslint.lintText("debugger;", { filePath });
    assert.equal(result.errorCount, 1, filePath);
    assert.equal(result.messages[0].ruleId, "no-debugger", filePath);
    assert.equal(await eslint.isPathIgnored(filePath), false, filePath);
  }
});

test("la configuration ne transforme pas ce contrôle en gate de style ou de globals", async () => {
  const [result] = await eslint.lintText("const unused = self.cache; if ((value = next())) { unknownGlobal(value) }", { filePath: "public/sw.js" });
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
  assert.equal(result.output, undefined, "aucun autofix n’est appliqué");
  const configuration = await eslint.calculateConfigForFile("scripts/probe.mjs");
  assert.equal(configuration.rules["no-cond-assign"][1], "except-parens");
  for (const rule of ["no-unused-vars", "no-undef", "semi", "quotes", "indent"]) assert.ok(!configuration.rules[rule] || configuration.rules[rule][0] === 0, rule);
});

test("seuls les artefacts générés sont exclus ; TS reste du ressort du compilateur", async () => {
  for (const filePath of ["dist/pages/assets/probe.js", "test-results/probe.js", "playwright-report/probe.js"]) assert.equal(await eslint.isPathIgnored(filePath), true, filePath);
  for (const filePath of ["src/engine.ts", "src/screens/HomeView.tsx", "tests/home-shortcuts.spec.ts", "playwright.config.ts"]) {
    assert.equal(await eslint.calculateConfigForFile(filePath), undefined, filePath);
    assert.equal(await eslint.isPathIgnored(filePath), true, filePath);
  }
});

function compilerConfiguration(project) {
  // Invoke the installed compiler entry point, not a separate TypeScript API
  // version. This works with the same Node 22/26 used by CI and local checks.
  return JSON.parse(execFileSync(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "--showConfig", "--project", project], { cwd: root, encoding: "utf8" }));
}

test("tous les fichiers TS/TSX source et navigateur sont inclus dans des projets stricts sans émission", async () => {
  const application = compilerConfiguration("tsconfig.json");
  const browserTests = compilerConfiguration("tsconfig.tests.json");
  for (const configuration of [application, browserTests]) {
    assert.equal(configuration.compilerOptions.strict, true);
    assert.equal(configuration.compilerOptions.noEmit, true);
  }
  for (const [directory, configuration] of [["src", application], ["tests", browserTests]]) {
    const included = new Set(configuration.files.map((file) => resolve(root, file)));
    const sources = (await readdir(resolve(root, directory), { recursive: true })).filter((file) => /\.tsx?$/.test(file));
    assert.ok(sources.length > 0, directory);
    for (const file of sources) assert.ok(included.has(resolve(root, directory, file)), `${directory}/${file} échappe à la vérification TypeScript`);
  }
  for (const file of (await readdir(root)).filter((file) => /^playwright.*\.config\.ts$/.test(file))) assert.ok(browserTests.files.some((included) => resolve(root, included) === resolve(root, file)), file);
});

test("les contrôles restent bloquants dans la validation locale, release et CI", async () => {
  const { scripts } = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  assert.equal(scripts["check:types"], "tsc --noEmit && tsc -p tsconfig.tests.json");
  assert.equal(scripts.lint, "eslint . --max-warnings=0");
  assert.equal(scripts["check:quality"], "npm run check:types && npm run lint");
  assert.equal(scripts["test:quality"], "node --test tests/quality-gates.test.mjs");
  assert.deepEqual(scripts["test:preview"].split(" && ").slice(0, 2), ["npm run check:quality", "npm run test:quality"]);
  assert.equal(scripts["test:release"].split(" && ")[0], "npm run test:preview");
  for (const script of ["test:preview", "test:release"]) {
    assert.doesNotMatch(scripts[script], /\|\||[;\n]|\s&(?:\s|$)/, `${script} ne doit pas ignorer un échec`);
  }

  // Check the existing workflow's simple job/step structure without adding a
  // YAML dependency or a duplicate CI invocation of these same quality gates.
  const workflow = await readFile(resolve(root, ".github/workflows/deploy-pages.yml"), "utf8");
  const validateJob = workflow.match(/^  validate-build:\n([\s\S]*?)(?=^  [\w-]+:\n|(?![\s\S]))/m)?.[1];
  assert.ok(validateJob, "le job validate-build est requis");
  assert.doesNotMatch(validateJob, /^    (?:if|continue-on-error):/m, "le job de validation ne doit pas être facultatif");
  const gateSteps = validateJob.split(/^      - /m).filter((step) => /^        run: npm run test:preview\s*$/m.test(step));
  assert.equal(gateSteps.length, 1, "la CI doit exécuter une seule fois la chaîne complète test:preview");
  assert.doesNotMatch(gateSteps[0], /^        (?:if|continue-on-error):/m, "les contrôles de qualité doivent bloquer la CI en cas d’échec");
  assert.match(workflow, /^  pull_request:\s*$/m, "la validation doit aussi couvrir les PR");
});
