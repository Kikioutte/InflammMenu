import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { BLOCKING_STARTUP_SOURCES, STARTUP_BUDGET, loadStartupGraph, validateStartupGraph } from "../scripts/startup-graph.mjs";
import { prepareStartupPreloads } from "../scripts/prepare-startup-preloads.mjs";

async function fixture(t, { base = "/", mutateManifest = () => {}, mutateIndex = (index) => index, files = {} } = {}) {
  const output = await mkdtemp(path.join(os.tmpdir(), "inflamm-startup-graph-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const [planner, validator] = BLOCKING_STARTUP_SOURCES;
  const manifest = {
    "index.html": { file: "assets/index.js", isEntry: true, imports: ["shared"], dynamicImports: [planner, validator, "src/screens/secondary-views.ts", "catalogue"] },
    shared: { file: "assets/shared.js", imports: ["leaf"] },
    leaf: { file: "assets/leaf.js" },
    [planner]: { file: "assets/planner-source.js", src: planner, isDynamicEntry: true, imports: ["leaf"] },
    [validator]: { file: "assets/catalog-validation.js", src: validator, isDynamicEntry: true, imports: ["leaf"] },
    extra: { file: "assets/preload-only.js", imports: ["extra-child"] },
    "extra-child": { file: "assets/preload-child.js" },
    "src/screens/secondary-views.ts": { file: "assets/secondary-views-later.js", isDynamicEntry: true },
    catalogue: { file: "assets/catalogue-later.js", isDynamicEntry: true },
  };
  mutateManifest(manifest);
  await mkdir(path.join(output, "assets"), { recursive: true });
  await mkdir(path.join(output, ".vite"), { recursive: true });
  for (const item of Object.values(manifest)) {
    if (!item.file.startsWith("assets/")) continue;
    await writeFile(path.join(output, item.file), files[item.file] ?? `export const value = ${JSON.stringify(item.file)};`);
  }
  const index = mutateIndex(`<!doctype html><html><head>
<link href="${base}assets/planner-source.js" rel="modulepreload">
<link rel='modulepreload' href='${base}assets/catalog-validation.js'>
<link rel="modulepreload" href="${base}assets/leaf.js">
<script crossorigin type="module" src="${base}assets/index.js"></script>
<link rel="modulepreload" href="${base}assets/preload-only.js">
</head><body></body></html>`);
  await writeFile(path.join(output, "index.html"), index);
  await writeFile(path.join(output, ".vite/manifest.json"), JSON.stringify(manifest));
  return output;
}

for (const base of ["/", "/InflammMenu/"]) {
  test(`le graphe ${base} réunit entrée, preloads et imports transitifs sans compter deux fois`, async (t) => {
    const output = await fixture(t, { base });
    const graph = await loadStartupGraph(output);
    validateStartupGraph(graph);
    assert.equal(graph.basePath, base);
    assert.deepEqual(graph.initialFiles.map(({ file }) => file), [
      "assets/catalog-validation.js", "assets/index.js", "assets/leaf.js", "assets/planner-source.js", "assets/preload-child.js", "assets/preload-only.js", "assets/shared.js",
    ]);
    assert.deepEqual(graph.requiredPreloads, ["assets/catalog-validation.js", "assets/leaf.js", "assets/planner-source.js"]);
    const bytes = await Promise.all(graph.initialFiles.map(({ file }) => readFile(path.join(output, file))));
    assert.equal(graph.rawBytes, bytes.reduce((sum, value) => sum + value.length, 0));
    assert.equal(graph.gzipBytes, bytes.reduce((sum, value) => sum + gzipSync(value, { level: 6 }).length, 0));
    assert(!graph.initialFiles.some(({ file }) => /secondary-views|catalogue/.test(file)));
  });
}

test("une seconde entrée et ses dépendances ne peuvent pas échapper au budget", async (t) => {
  const output = await fixture(t, {
    mutateManifest: (manifest) => { manifest.other = { file: "assets/other.js", imports: ["extra-child"] }; },
    mutateIndex: (index) => index.replace("</head>", '<script src="/assets/other.js" type="module"></script></head>'),
  });
  const graph = await loadStartupGraph(output);
  assert.deepEqual(graph.entryFiles, ["assets/index.js", "assets/other.js"]);
  assert(graph.initialFiles.some(({ file }) => file === "assets/other.js"));
  validateStartupGraph(graph);
});

test("une racine bloquante oubliée reste comptée puis échoue sur son preload absent", async (t) => {
  const output = await fixture(t, { mutateIndex: (index) => index.replace(/<link[^>]*planner-source[^>]*>/, "") });
  const graph = await loadStartupGraph(output);
  assert(graph.initialFiles.some(({ file }) => file === "assets/planner-source.js"));
  assert.throws(() => validateStartupGraph(graph), /préchargement bloquant absent/);
});

test("précharger après le script ou en double est refusé", async (t) => {
  const duplicate = await fixture(t, { mutateIndex: (index) => index.replace("</head>", '<link rel="modulepreload" href="/assets/leaf.js"></head>') });
  const duplicateGraph = await loadStartupGraph(duplicate);
  assert.throws(() => validateStartupGraph(duplicateGraph), /préchargement bloquant absent ou dupliqué/);
  const late = await fixture(t, { mutateIndex: (index) => index.replace(/(<link[^>]*planner-source[^>]*>)/, "").replace("</head>", '<link rel="modulepreload" href="/assets/planner-source.js"></head>') });
  const lateGraph = await loadStartupGraph(late);
  assert.throws(() => validateStartupGraph(lateGraph), /après le script/);
});

test("le budget gzip porte aussi sur une dépendance transitive, pas seulement l'entrée", async (t) => {
  const output = await fixture(t, { files: { "assets/leaf.js": `export const entropy = "${randomBytes(500_000).toString("base64")}";` } });
  const graph = await loadStartupGraph(output);
  assert(graph.initialFiles.find(({ file }) => file === "assets/index.js").gzipBytes < 100);
  assert(graph.rawBytes < STARTUP_BUDGET.rawBytes);
  assert(graph.gzipBytes > STARTUP_BUDGET.gzipBytes);
  assert.throws(() => validateStartupGraph(graph), /initial total gzip trop lourd/);
});

test("le plafond brut reste fixe même pour du contenu très compressible", async (t) => {
  const output = await fixture(t, { files: { "assets/planner-source.js": "a".repeat(STARTUP_BUDGET.rawBytes + 1) } });
  const graph = await loadStartupGraph(output);
  assert.throws(() => validateStartupGraph(graph), /initial total trop lourd/);
});

for (const deferred of ["src/screens/secondary-views.ts", "catalogue"]) {
  test(`${deferred} ne devient pas critique via un import statique indirect`, async (t) => {
    const output = await fixture(t, { mutateManifest: (manifest) => { manifest.leaf.imports = [deferred]; } });
    const graph = await loadStartupGraph(output);
    assert.throws(() => validateStartupGraph(graph), /dans le graphe initial/);
  });
  test(`${deferred} est également refusé dans un preload as=script`, async (t) => {
    const file = deferred === "catalogue" ? "catalogue-later.js" : "secondary-views-later.js";
    const output = await fixture(t, { mutateIndex: (index) => index.replace("</head>", `<link as="script" href="/assets/${file}" rel="preload"></head>`) });
    const graph = await loadStartupGraph(output);
    assert.throws(() => validateStartupGraph(graph), /dans le graphe initial/);
  });
}

test("preload as=script est compté mais ne remplace pas modulepreload pour les racines", async (t) => {
  const output = await fixture(t, { mutateIndex: (index) => index.replace('href="/assets/planner-source.js" rel="modulepreload"', 'href="/assets/planner-source.js" rel="preload" as="script"') });
  const graph = await loadStartupGraph(output);
  assert.equal(graph.initialFiles.filter(({ file }) => file === "assets/planner-source.js").length, 1);
  assert.throws(() => validateStartupGraph(graph), /préchargement bloquant absent/);
});

test("les liens manquants, racines détachées, fichiers absents et chemins externes échouent explicitement", async (t) => {
  const missingLink = await fixture(t, { mutateManifest: (manifest) => { manifest.shared.imports = ["missing"]; } });
  await assert.rejects(loadStartupGraph(missingLink), /import statique absent/);
  const detached = await fixture(t, { mutateManifest: (manifest) => { manifest["index.html"].dynamicImports = []; } });
  await assert.rejects(loadStartupGraph(detached), /racine bloquante sans lien/);
  const absent = await fixture(t);
  await rm(path.join(absent, "assets/leaf.js"));
  await assert.rejects(loadStartupGraph(absent), /ENOENT/);
  const external = await fixture(t, { mutateIndex: (index) => index.replace('href="/assets/preload-only.js"', 'href="https://other.invalid/assets/preload-only.js"') });
  await assert.rejects(loadStartupGraph(external), /dépendance initiale externe/);
});

test("un cycle d'imports statiques est compté une seule fois", async (t) => {
  const output = await fixture(t, { mutateManifest: (manifest) => { manifest.leaf.imports = ["shared"]; } });
  await prepareStartupPreloads(output);
  const graph = await loadStartupGraph(output);
  assert.equal(graph.initialFiles.length, 7);
  validateStartupGraph(graph);
});

test("la préparation ajoute tous les preloads manquants et consolide les liens tardifs dupliqués", async (t) => {
  const empty = await fixture(t, { mutateIndex: (index) => index.replace(/<link[^>]*>/g, "") });
  await prepareStartupPreloads(empty);
  validateStartupGraph(await loadStartupGraph(empty));
  const output = await fixture(t, { mutateIndex: (index) => index.replace("</head>", '<link rel="modulepreload" href="/assets/planner-source.js"><link rel="modulepreload" href="/assets/leaf.js"></head>') });
  await prepareStartupPreloads(output);
  validateStartupGraph(await loadStartupGraph(output));
  const once = await readFile(path.join(output, "index.html"), "utf8");
  assert.equal((await prepareStartupPreloads(output)).changed, false);
  assert.equal(await readFile(path.join(output, "index.html"), "utf8"), once);
});

for (const compact of [false, true]) {
  test(`la préparation ${compact ? "compacte" : "multiligne"} déplace les preloads sans doublon et reste idempotente`, async (t) => {
    const output = await fixture(t, { base: "/InflammMenu/", mutateIndex: (index) => {
      const withoutPlanner = index.replace(/<link[^>]*planner-source[^>]*>/, "");
      const moved = withoutPlanner.replace(/(<link[^>]*catalog-validation[^>]*>)/, "").replace("</head>", '<link rel="modulepreload" href="/InflammMenu/assets/catalog-validation.js"></head>');
      return compact ? moved.replace(/\n/g, "") : moved;
    } });
    assert.equal((await prepareStartupPreloads(output)).changed, true);
    const once = await readFile(path.join(output, "index.html"), "utf8");
    validateStartupGraph(await loadStartupGraph(output));
    assert.equal((await prepareStartupPreloads(output)).changed, false);
    assert.equal(await readFile(path.join(output, "index.html"), "utf8"), once);
  });
}
