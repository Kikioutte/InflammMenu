import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const workflowPath = new URL("../.github/workflows/deploy-pages.yml", import.meta.url);
const legacyWorkflowPath = new URL("../.github/workflows/validate-pr.yml", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);
const npmrcPath = new URL("../.npmrc", import.meta.url);

const deploymentCondition = "github.ref == 'refs/heads/main' && github.event_name != 'pull_request'";

function extractStep(block, name) {
  const start = block.indexOf(`      - name: ${name}`);
  assert.ok(start >= 0, `L'étape « ${name} » est requise`);
  const next = block.indexOf("\n      - name:", start + 1);
  return block.slice(start, next < 0 ? block.length : next);
}

test("la validation et le déploiement partagent un pipeline unique", async () => {
  await assert.rejects(access(legacyWorkflowPath), { code: "ENOENT" });

  const workflow = await readFile(workflowPath, "utf8");
  const jobsStart = workflow.indexOf("\njobs:\n");
  const validateStart = workflow.indexOf("  validate-build:", jobsStart);
  const deployStart = workflow.indexOf("  deploy:", validateStart);

  assert.ok(jobsStart > 0, "La section jobs est requise");
  assert.ok(validateStart > jobsStart, "Le job validate-build est requis");
  assert.ok(deployStart > validateStart, "Le job deploy doit suivre validate-build");

  const globalBlock = workflow.slice(0, jobsStart);
  const validateBlock = workflow.slice(validateStart, deployStart);
  const deployBlock = workflow.slice(deployStart);

  assert.match(globalBlock, /on:\n\s+pull_request:\n\s+push:\n\s+branches: \[main\]\n\s+workflow_dispatch:/);
  assert.match(globalBlock, /\npermissions:\n  contents: read\n\nconcurrency:/);

  assert.match(validateBlock, /\n    permissions:\n      contents: read\n    steps:/);
  assert.match(deployBlock, /needs: validate-build/);
  assert.match(deployBlock, /\n    permissions:\n      contents: read\n      pages: write\n      id-token: write\n    steps:/);
  assert.match(deployBlock, new RegExp(deploymentCondition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const auditStep = extractStep(validateBlock, "Audit production dependencies");
  const uploadStep = extractStep(validateBlock, "Upload site artifact");
  assert.match(auditStep, /run: npm run audit:production/);
  assert.doesNotMatch(auditStep, /continue-on-error:/);
  assert.match(uploadStep, new RegExp(deploymentCondition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(uploadStep, /actions\/upload-pages-artifact@[0-9a-f]{40}[\s\S]*path: dist\/pages/);
  assert.doesNotMatch(workflow, /actions\/configure-pages@/);
  assert.doesNotMatch(workflow, /npm run test:(?:app|runtime)\b/);

  const requiredSteps = [
    "npm run audit:production",
    "npm run test:preview",
    "npm run test:browser",
    "npm run test:sites",
    "npm run build:pages",
    "npm run test:pwa:built",
    "actions/upload-pages-artifact@",
  ];
  let previousIndex = -1;
  for (const step of requiredSteps) {
    const currentIndex = validateBlock.indexOf(step);
    assert.ok(currentIndex > previousIndex, `${step} est absent ou mal ordonné`);
    previousIndex = currentIndex;
  }

  assert.match(deployBlock, /actions\/deploy-pages@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /uses:\s+[^\s@]+@(?![0-9a-f]{40}(?:\s|$))/);
});

test("l'audit de production est explicite malgré la configuration npm locale", async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const npmrc = await readFile(npmrcPath, "utf8");

  assert.equal(packageJson.scripts["audit:production"], "npm audit --omit=dev --audit-level=high");
  assert.match(packageJson.scripts["test:preview"], /npm run test:workflows/);
  assert.match(npmrc, /CI exécute explicitement audit:production/);
  assert.match(npmrc, /^audit=false$/m);
});
