#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = "src/data/responsive-images.json";
const thumbnailRoot = "public/assets/recipes/thumbnails";
const heroRoot = "public/assets/responsive";
const encoder = { sharp: sharp.versions.sharp, vips: sharp.versions.vips, webp: sharp.versions.webp };
export const IMAGE_OPTIONS = Object.freeze({
  hero: { width: 960, quality: 78, effort: 5 },
  thumbnail: { width: 192, quality: 76, effort: 4 },
});

export function imageFingerprint(bytes, options) {
  return createHash("sha256").update(JSON.stringify({ version: 1, encoder, options })).update(bytes).digest("hex");
}

async function writeIfChanged(file, contents) {
  const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  try {
    if ((await readFile(file)).equals(bytes)) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, file);
  return true;
}

async function readInputs(projectRoot) {
  const names = JSON.parse(await readFile(path.join(projectRoot, "src/data/generated-recipe-images.json"), "utf8"));
  assert(Array.isArray(names) && names.length > 0, "Le manifeste JPEG est vide ou invalide.");
  assert.equal(new Set(names).size, names.length, "Le manifeste JPEG contient des doublons.");
  const inputs = [];
  for (const name of [...names].sort()) {
    assert(typeof name === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/.test(name) && !/\s/.test(name),
      "Le manifeste JPEG contient un chemin non autorisé.");
    const file = path.join(projectRoot, "public/assets/recipes/generated", name);
    assert((await lstat(file)).isFile(), `${name} doit être un fichier JPEG régulier.`);
    const bytes = await readFile(file);
    inputs.push({ name, bytes, fingerprint: imageFingerprint(bytes, IMAGE_OPTIONS.thumbnail) });
  }
  const hero = await readFile(path.join(projectRoot, "public/assets/inflamm-hero-bowl.jpg"));
  const heroFingerprint = imageFingerprint(hero, IMAGE_OPTIONS.hero);
  const sourceHash = createHash("sha256");
  for (const input of inputs) sourceHash.update(`${input.name}\0${input.fingerprint}\n`);
  const thumbnailVersion = sourceHash.digest("hex").slice(0, 16);
  const metadata = await sharp(hero).metadata();
  assert(metadata.width && metadata.height, "Les dimensions de la photo d’accueil sont absentes.");
  const heroWidth = Math.min(IMAGE_OPTIONS.hero.width, metadata.width);
  const manifest = {
    version: 1,
    encoder,
    hero: {
      path: `assets/responsive/${heroFingerprint.slice(0, 16)}/inflamm-hero-bowl.webp`,
      width: heroWidth,
      height: Math.round(metadata.height * heroWidth / metadata.width),
    },
    thumbnail: {
      directory: `assets/recipes/thumbnails/${thumbnailVersion}`,
      width: IMAGE_OPTIONS.thumbnail.width,
      height: IMAGE_OPTIONS.thumbnail.width,
      count: inputs.length,
    },
  };
  return { inputs, hero, heroFingerprint, manifest };
}

// All output is derived from the reviewed JPEGs. A source or encoder change
// changes the public URL; the originals and editorial image manifest stay intact.
export async function generateResponsiveImages({ projectRoot = root, updateManifest = false, check = false } = {}) {
  const { inputs, hero, heroFingerprint, manifest } = await readInputs(projectRoot);
  const manifestFile = path.join(projectRoot, manifestPath);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!updateManifest) {
    assert.equal(await readFile(manifestFile, "utf8"), serialized,
      "Les sources/options des images ont changé : lancer npm run images:responsive:update et inclure le manifeste mis à jour.");
  }
  const cacheRoot = path.join(projectRoot, "node_modules/.cache/inflamm-menu-images");
  let encoded = 0;
  let totalBytes = 0;
  const outputs = [];
  const items = [
    { bytes: hero, fingerprint: heroFingerprint, options: IMAGE_OPTIONS.hero, publicPath: manifest.hero.path, width: manifest.hero.width, height: manifest.hero.height },
    ...inputs.map((input) => ({ ...input, options: IMAGE_OPTIONS.thumbnail,
      publicPath: `${manifest.thumbnail.directory}/${input.name.replace(/\.jpg$/, ".webp")}`,
      width: manifest.thumbnail.width, height: manifest.thumbnail.height })),
  ];
  for (const item of items) {
    const destination = path.join(projectRoot, "public", item.publicPath);
    let bytes;
    if (check) {
      bytes = await readFile(destination);
    } else {
      const cacheFile = path.join(cacheRoot, `${item.fingerprint}.webp`);
      try {
        bytes = await readFile(cacheFile);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        // Width-only resizing preserves composition and aspect ratio. No crop,
        // rotation, colour adjustment or upscaling is applied to either image.
        bytes = await sharp(item.bytes).resize({ width: item.options.width, withoutEnlargement: true })
          .webp({ quality: item.options.quality, effort: item.options.effort }).toBuffer();
        await writeIfChanged(cacheFile, bytes);
        encoded += 1;
      }
      await writeIfChanged(destination, bytes);
    }
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp", `${item.publicPath}: format inattendu`);
    assert.equal(metadata.width, item.width, `${item.publicPath}: largeur inattendue`);
    assert.equal(metadata.height, item.height, `${item.publicPath}: hauteur inattendue`);
    assert(bytes.length < item.bytes.length, `${item.publicPath}: le dérivé doit être plus léger que le JPEG`);
    assert(bytes.length < (item.options === IMAGE_OPTIONS.hero ? 160_000 : 24_000), `${item.publicPath}: budget dépassé`);
    totalBytes += bytes.length;
    outputs.push({ path: item.publicPath, bytes: bytes.length, width: metadata.width, height: metadata.height });
  }
  if (!check) {
    // Only the current generation belongs in the public artifact. The reusable
    // encoder cache lives outside public/, and interrupted writes are atomic.
    for (const [directory, version] of [[thumbnailRoot, path.basename(manifest.thumbnail.directory)], [heroRoot, path.basename(path.dirname(manifest.hero.path))]]) {
      for (const entry of await readdir(path.join(projectRoot, directory))) {
        if (entry !== version) await rm(path.join(projectRoot, directory, entry), { recursive: true, force: true });
      }
    }
    if (updateManifest) await writeIfChanged(manifestFile, serialized);
  }
  return { manifest, encoded, count: outputs.length, totalBytes, outputs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateResponsiveImages({ updateManifest: process.argv.includes("--update-manifest"), check: process.argv.includes("--check") });
  console.log(`${result.count} images WebP validées (${result.totalBytes} octets), ${result.encoded} encodages nécessaires.`);
}
