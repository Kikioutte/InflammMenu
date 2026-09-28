import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/generate-precache.mjs", import.meta.url));
const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const { version } = JSON.parse(await readFile(new URL("../src/data/responsive-images-version.json", import.meta.url), "utf8"));

async function fixture(t, base, includeHero = true) {
  const output = await mkdtemp(path.join(tmpdir(), "inflamm-responsive-precache-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const files = {
    "sw.js": worker,
    "index.html": `<script src="${base}assets/index.js"></script><link rel="stylesheet" href="${base}assets/style.css">`,
    "manifest.webmanifest": JSON.stringify({ icons: [{ src: `${base}icons/icon.png` }] }),
    "assets/index.js": `const hero="${base}assets/inflamm-hero-bowl.jpg"; const recipe="${base}assets/recipes/photo.jpg";`,
    "assets/style.css": `@font-face { src:url("${base}assets/font.woff2") }`,
    "assets/font.woff2": "unchanged font",
    "icons/icon.png": "unchanged icon",
    "assets/inflamm-hero-bowl.jpg": "original hero remains in artifact",
    "assets/recipes/photo.jpg": "deferred recipe",
    [`assets/recipes/responsive/${version}/photo.w160.webp`]: "deferred derivative",
  };
  if (includeHero) files[`assets/recipes/responsive/${version}/_hero/inflamm-hero-bowl.w1200.webp`] = "offline hero";
  for (const [relative, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
    await writeFile(path.join(output, relative), contents);
  }
  return output;
}

for (const base of ["/", "/InflammMenu/"]) test(`le précache ${base} remplace seulement le héros, sans photos de recettes ni suppression de polices/icônes`, async (t) => {
  const output = await fixture(t, base);
  await run(process.execPath, [script, output, base]);
  const code = await readFile(path.join(output, "sw.js"), "utf8");
  const shell = JSON.parse(code.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1]);
  const hero = `${base}assets/recipes/responsive/${version}/_hero/inflamm-hero-bowl.w1200.webp`;
  assert.ok(shell.includes(hero));
  assert.ok(!shell.includes(`${base}assets/inflamm-hero-bowl.jpg`));
  assert.deepEqual(shell.filter((entry) => entry.includes("/recipes/")), [hero]);
  assert.ok(shell.includes(`${base}assets/font.woff2`));
  assert.ok(shell.includes(`${base}icons/icon.png`));
  assert.equal(await readFile(path.join(output, "assets/inflamm-hero-bowl.jpg"), "utf8"), "original hero remains in artifact");
});

test("un build incomplet ne publie pas de service worker sans sa photo d'accueil", async (t) => {
  const output = await fixture(t, "/", false);
  await assert.rejects(run(process.execPath, [script, output, "/"]), /Photo d’accueil adaptée absente du build/);
});
