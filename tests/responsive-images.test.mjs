import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { responsiveImages, recipeWidths, heroWidths } from "../scripts/responsive-images.mjs";
import { recipeImageSrcSet } from "../src/components/recipe-image.ts";

const hash = (contents) => createHash("sha256").update(contents).digest("hex");

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "inflamm-responsive-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "public/assets/recipes/generated"), { recursive: true });
  const definitions = [
    ["assets/recipes/rectangle.jpg", 900, 720, "#897532"],
    ["assets/recipes/generated/square.jpg", 900, 900, "#c65441"],
    ["assets/inflamm-hero-bowl.jpg", 1200, 1000, "#345642"],
  ];
  const originals = new Map();
  for (const [source, width, height, background] of definitions) {
    const contents = await sharp({ create: { width, height, channels: 3, background } }).jpeg().toBuffer();
    await writeFile(path.join(root, "public", source), contents);
    originals.set(source, contents);
  }
  return { root, originals };
}

test("les variantes couvrent les tailles prévues sans recadrage et sans modifier les JPEG", async (t) => {
  const { root, originals } = await fixture(t);
  const generated = await responsiveImages({ root });
  assert.match(generated.version, /^[a-f0-9]{12}$/);
  assert.equal(generated.generated, 11);
  for (const original of generated.images) {
    assert.deepEqual(await readFile(path.join(root, "public", original.source)), originals.get(original.source));
    assert.equal(original.sha256, hash(originals.get(original.source)));
    const widths = original.source.includes("recipes/") ? recipeWidths : heroWidths;
    assert.deepEqual(original.variants.map((variant) => variant.width), widths);
    for (const variant of original.variants) {
      const contents = await readFile(path.join(root, "public", variant.path));
      const metadata = await sharp(contents).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, variant.width);
      assert.equal(metadata.height, Math.round(original.height * variant.width / original.width));
      assert.equal(hash(contents), variant.sha256);
      assert.ok(contents.length < original.bytes);
    }
  }
  assert.equal((await responsiveImages({ root, check: true })).generated, 0);
  assert.deepEqual(await responsiveImages({ root }), { ...generated, generated: 0 });
});

test("une copie propre reconstruit exactement les mêmes photos sans artefact préexistant", async (t) => {
  const { root } = await fixture(t);
  const initial = await responsiveImages({ root });
  const output = path.join(root, "public/assets/recipes/responsive", initial.version);
  await rm(output, { recursive: true });
  await assert.rejects(responsiveImages({ root, check: true }), /Variante absente ou altérée/);
  assert.deepEqual(await responsiveImages({ root }), initial);
});

test("une variante absente, corrompue ou échangée est détectée puis réparée", async (t) => {
  const { root } = await fixture(t);
  const initial = await responsiveImages({ root });
  const hero = initial.images.find((image) => image.source === "assets/inflamm-hero-bowl.jpg");
  const rectangle = initial.images.find((image) => image.source.endsWith("/rectangle.jpg"));
  const square = initial.images.find((image) => image.source.endsWith("/square.jpg"));
  const target = path.join(root, "public", square.variants[1].path);
  await writeFile(target, await readFile(path.join(root, "public", rectangle.variants[1].path)));
  await assert.rejects(responsiveImages({ root, check: true }), /altérée/);
  assert.equal((await responsiveImages({ root })).generated, 1);
  await writeFile(target, "not an image");
  await rm(path.join(root, "public", hero.variants[0].path));
  await assert.rejects(responsiveImages({ root, check: true }), /altérée/);
  assert.equal((await responsiveImages({ root })).generated, 2);
  assert.deepEqual((await responsiveImages({ root, check: true })).images, initial.images);
  await writeFile(path.join(root, "public/assets/recipes/responsive", initial.version, "manifest.json"), JSON.stringify({ images: {} }));
  assert.equal((await responsiveImages({ root })).generated, 11, "un manifeste local altéré peut aussi être reconstruit");
});

test("modifier un original change l'empreinte ; un agrandissement serait refusé", async (t) => {
  const { root } = await fixture(t);
  const initial = await responsiveImages({ root });
  const unknown = path.join(root, "public/assets/recipes/responsive/user-files");
  await mkdir(unknown);
  await writeFile(path.join(unknown, "keep.txt"), "user-owned");
  const source = path.join(root, "public/assets/recipes/generated/square.jpg");
  await writeFile(source, await sharp({ create: { width: 900, height: 900, channels: 3, background: "#fcd134" } }).jpeg().toBuffer());
  await assert.rejects(responsiveImages({ root, check: true }), /Version des photos/);
  const updated = await responsiveImages({ root });
  assert.notEqual(updated.version, initial.version);
  assert.equal(updated.generated, 11);
  await assert.rejects(readFile(path.join(root, "public/assets/recipes/responsive", initial.version, "manifest.json")), { code: "ENOENT" });
  assert.equal(await readFile(path.join(unknown, "keep.txt"), "utf8"), "user-owned");
  await writeFile(source, await sharp({ create: { width: 100, height: 100, channels: 3, background: "#fcd134" } }).jpeg().toBuffer());
  await assert.rejects(responsiveImages({ root }), /Photo trop petite/);
});

test("les chemins responsive gardent leur base et ne transforment aucun contenu extérieur", () => {
  for (const prefix of ["/", "/InflammMenu/"]) {
    const original = `${prefix}assets/recipes/generated/plat-1.jpg`;
    assert.equal(recipeImageSrcSet(original, "0123456789ab"), recipeWidths.map((width) => `${prefix}assets/recipes/responsive/0123456789ab/generated/plat-1.w${width}.webp ${width}w`).join(", "));
    assert.match(recipeImageSrcSet(`${prefix}assets/inflamm-hero-bowl.jpg`, "0123456789ab"), /_hero\/inflamm-hero-bowl\.w1200\.webp 1200w$/);
  }
  for (const src of ["https://example.org/assets/recipes/plat.jpg", "//example.org/assets/recipes/plat.jpg", "/../assets/recipes/plat.jpg", "/assets/recipe-placeholder.svg", "/assets/recipes/perso/photo.jpg", "data:image/png;base64,hello", "/assets/recipes/plat.jpg?query=1"]) {
    assert.equal(recipeImageSrcSet(src, "0123456789ab"), undefined, src);
  }
});
