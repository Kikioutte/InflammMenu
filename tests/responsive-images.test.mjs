import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { generateResponsiveImages, imageFingerprint, IMAGE_OPTIONS } from "../scripts/generate-responsive-images.mjs";
import { recipeThumbnailFor } from "../src/responsive-images.ts";
import { HOME_HERO_WEBP_PATH, HOME_HERO_WIDTH, HOME_HERO_HEIGHT } from "../src/home-hero-image.ts";

const root = new URL("../", import.meta.url);
const filenames = JSON.parse(await readFile(new URL("src/data/generated-recipe-images.json", root), "utf8"));
const generatedImages = new Set(filenames);
const manifest = JSON.parse(await readFile(new URL("src/data/responsive-images.json", root), "utf8"));

test("thumbnails cover the reviewed JPEG allowlist and preserve root or Pages base paths", () => {
  assert.equal(filenames.length, 630);
  assert.equal(manifest.thumbnail.count, filenames.length);
  for (const base of ["/", "/InflammMenu/"]) {
    for (const name of filenames) {
      assert.equal(recipeThumbnailFor(`${base}assets/recipes/generated/${name}`, generatedImages),
        `${base}${manifest.thumbnail.directory}/${name.replace(/\.jpg$/, ".webp")}`);
    }
  }
});

test("unknown, external, encoded and traversing image paths keep their original fallback", () => {
  const name = filenames[0];
  for (const image of ["", "/assets/inflamm-hero-bowl.jpg", "/assets/recipes/generated/unknown.jpg",
    "javascript:alert(1)", "data:image/jpeg;base64,AA", "blob:https://example.test/image",
    `https://example.test/assets/recipes/generated/${name}`, `//example.test/assets/recipes/generated/${name}`,
    `assets/recipes/generated/${name}`, `/OtherApp/assets/recipes/generated/${name}`,
    `/assets/recipes/generated/../${name}`, `/assets/recipes/generated/%2e%2e/${name}`,
    `/assets/recipes/generated/${name}?redirect=https://example.test`, `/assets/recipes/generated/${name}#fragment`,
    `/assets/recipes/generated/${name.replace(".jpg", ".svg")}`, `/assets/recipes/generated/${name}\n`,
    `/assets\\recipes\\generated\\${name}`]) {
    assert.equal(recipeThumbnailFor(image, generatedImages), undefined, image);
  }
});

test("source bytes and output options determine immutable image versions", () => {
  const bytes = Buffer.from("source A");
  const fingerprint = imageFingerprint(bytes, IMAGE_OPTIONS.thumbnail);
  assert.equal(imageFingerprint(Buffer.from(bytes), { ...IMAGE_OPTIONS.thumbnail }), fingerprint);
  assert.notEqual(imageFingerprint(Buffer.from("source B"), IMAGE_OPTIONS.thumbnail), fingerprint);
  assert.notEqual(imageFingerprint(bytes, { ...IMAGE_OPTIONS.thumbnail, width: 160 }), fingerprint);
  assert.notEqual(imageFingerprint(bytes, { ...IMAGE_OPTIONS.thumbnail, quality: 70 }), fingerprint);
  assert.match(manifest.thumbnail.directory, /^assets\/recipes\/thumbnails\/[a-f0-9]{16}$/);
  assert.match(HOME_HERO_WEBP_PATH, /^assets\/responsive\/[a-f0-9]{16}\/inflamm-hero-bowl\.webp$/);
});

test("the home image retains its composition and the original JPEG remains available", async () => {
  const original = await sharp(new URL("public/assets/inflamm-hero-bowl.jpg", root).pathname).metadata();
  assert.equal(HOME_HERO_WIDTH, 960);
  assert.equal(HOME_HERO_WIDTH / HOME_HERO_HEIGHT, original.width / original.height);
});

test("the image pipeline preserves masters, reuses its cache and repairs deleted derivatives", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "inflamm-responsive-"));
  try {
    const name = filenames[0];
    const sourceDirectory = path.join(projectRoot, "public/assets/recipes/generated");
    await mkdir(sourceDirectory, { recursive: true });
    await mkdir(path.join(projectRoot, "src/data"), { recursive: true });
    await copyFile(new URL(`public/assets/recipes/generated/${name}`, root), path.join(sourceDirectory, name));
    await copyFile(new URL("public/assets/inflamm-hero-bowl.jpg", root), path.join(projectRoot, "public/assets/inflamm-hero-bowl.jpg"));
    await writeFile(path.join(projectRoot, "src/data/generated-recipe-images.json"), JSON.stringify([name]));
    const original = await readFile(path.join(sourceDirectory, name));
    const first = await generateResponsiveImages({ projectRoot, updateManifest: true });
    assert.equal(first.encoded, 2);
    assert.equal(first.count, 2);
    assert.deepEqual(first.outputs.map(({ width, height }) => [width, height]), [[960, 800], [192, 192]]);
    const thumbnail = path.join(projectRoot, "public", first.outputs[1].path);
    const modified = (await stat(thumbnail)).mtimeMs;
    const second = await generateResponsiveImages({ projectRoot });
    assert.equal(second.encoded, 0);
    assert.deepEqual(second.outputs, first.outputs);
    assert.equal((await stat(thumbnail)).mtimeMs, modified);
    await rm(thumbnail);
    const repaired = await generateResponsiveImages({ projectRoot });
    assert.equal(repaired.encoded, 0);
    assert.deepEqual(repaired.outputs, first.outputs);
    await generateResponsiveImages({ projectRoot, check: true });
    assert.deepEqual(await readFile(path.join(sourceDirectory, name)), original);
    assert.deepEqual(await readFile(path.join(projectRoot, "public/assets/inflamm-hero-bowl.jpg")),
      await readFile(new URL("public/assets/inflamm-hero-bowl.jpg", root)));
    await writeFile(path.join(projectRoot, "src/data/responsive-images.json"), "{}\n");
    await assert.rejects(generateResponsiveImages({ projectRoot }), /sources\/options des images ont changé/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("untrusted manifest entries cannot read or write outside the generated image directory", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "inflamm-responsive-invalid-"));
  try {
    await mkdir(path.join(projectRoot, "src/data"), { recursive: true });
    for (const name of ["../secret.jpg", "../../hero.jpg", "/tmp/file.jpg", "file:///tmp/file.jpg", "__proto__", "image.svg", "image.jpg?x=1"]) {
      await writeFile(path.join(projectRoot, "src/data/generated-recipe-images.json"), JSON.stringify([name]));
      await assert.rejects(generateResponsiveImages({ projectRoot, updateManifest: true }), /chemin non autorisé/);
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
