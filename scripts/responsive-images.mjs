#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const recipeWidths = [160, 320, 640, 900];
export const heroWidths = [640, 960, 1200];
const settings = {
  schema: 1,
  recipeWidths,
  heroWidths,
  webp: { quality: 80, effort: 4, smartSubsample: true },
  resize: { withoutEnlargement: true, kernel: "lanczos3", fastShrinkOnLoad: false },
  encoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips, webp: sharp.versions.webp },
};
const digest = (contents) => createHash("sha256").update(contents).digest("hex");

async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

async function writeAtomic(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function sourcesIn(root) {
  const images = [];
  for (const folder of ["assets/recipes", "assets/recipes/generated"]) {
    const entries = await readdir(path.join(root, "public", folder), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jpg")) continue;
      if (!/^[a-z0-9-]+\.jpg$/.test(entry.name)) throw new Error(`Nom de photo non pris en charge : ${entry.name}`);
      images.push(`${folder}/${entry.name}`);
    }
  }
  images.push("assets/inflamm-hero-bowl.jpg");
  const result = [];
  for (const source of images.sort()) {
    const contents = await readFile(path.join(root, "public", source));
    const metadata = await sharp(contents).metadata();
    if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) throw new Error(`Photo JPEG invalide : ${source}`);
    // The browser honours EXIF orientation; derivatives must do the same.
    const rotated = [5, 6, 7, 8].includes(metadata.orientation);
    const width = rotated ? metadata.height : metadata.width;
    const height = rotated ? metadata.width : metadata.height;
    const hero = source === "assets/inflamm-hero-bowl.jpg";
    const widths = hero ? heroWidths : recipeWidths;
    if (width < Math.max(...widths)) throw new Error(`Photo trop petite pour ses variantes : ${source}`);
    result.push({
      source, sha256: digest(contents), bytes: contents.length, width, height,
      stem: hero ? "_hero/inflamm-hero-bowl" : source.slice("assets/recipes/".length, -4),
      widths,
    });
  }
  return result;
}

async function inspectVariant(file, expected, previous) {
  if (!previous || previous.path !== expected.path || previous.width !== expected.width || previous.height !== expected.height) return null;
  try {
    const contents = await readFile(file);
    if (contents.length !== previous.bytes || digest(contents) !== previous.sha256) return null;
    const metadata = await sharp(contents).metadata();
    return metadata.format === "webp" && metadata.width === expected.width && metadata.height === expected.height ? previous : null;
  } catch { return null; }
}

async function removeObsoleteDerivatives(root, version) {
  const directory = path.join(root, "public/assets/recipes/responsive");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // Only directories produced by this generator are disposable. Symlinks,
    // unexpected folders and every original photo stay untouched.
    if (!entry.isDirectory() || !/^[a-f0-9]{12}$/.test(entry.name) || entry.name === version) continue;
    const target = path.join(directory, entry.name);
    const manifest = await readJson(path.join(target, "manifest.json"));
    if (manifest?.generator === "InflammMenu-responsive-v1" && manifest.version === entry.name) {
      await rm(target, { recursive: true });
    }
  }
}

/** Generate only derivatives; the reviewed originals and catalogue URLs are never written. */
export async function responsiveImages({ root = projectRoot, check = false } = {}) {
  const sources = await sourcesIn(root);
  const version = digest(JSON.stringify({ settings, sources })).slice(0, 12);
  const versionPath = path.join(root, "src/data/responsive-images-version.json");
  const trackedVersion = await readJson(versionPath);
  const directory = `assets/recipes/responsive/${version}`;
  const manifestPath = path.join(root, "public", directory, "manifest.json");
  const previous = await readJson(manifestPath);
  const previousImages = new Map((Array.isArray(previous?.images) ? previous.images : []).filter((entry) => entry && typeof entry.source === "string").map((entry) => [entry.source, entry]));
  if (check && trackedVersion?.version !== version) throw new Error("Version des photos à régénérer : npm run generate:images:responsive");
  let cursor = 0;
  let generated = 0;
  const images = new Array(sources.length);
  // Two source images in flight limit native memory and CPU use on developer/CI hosts.
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < sources.length) {
      const index = cursor++;
      const source = sources[index];
      const oldImage = previousImages.get(source.source);
      const variants = [];
      for (const width of source.widths) {
        const expected = {
          path: `${directory}/${source.stem}.w${width}.webp`,
          width, height: Math.round(source.height * width / source.width),
        };
        const file = path.join(root, "public", expected.path);
        const oldVariant = oldImage?.sha256 === source.sha256 && oldImage?.source === source.source && Array.isArray(oldImage.variants)
          ? oldImage.variants.find((variant) => variant?.width === width) : null;
        let variant = await inspectVariant(file, expected, oldVariant);
        if (!variant) {
          if (check) throw new Error(`Variante absente ou altérée : ${expected.path}`);
          const contents = await sharp(path.join(root, "public", source.source))
            .autoOrient().resize({ width, ...settings.resize }).webp(settings.webp).toBuffer();
          const metadata = await sharp(contents).metadata();
          if (metadata.width !== expected.width || metadata.height !== expected.height) throw new Error(`Dimensions incorrectes : ${expected.path}`);
          variant = { ...expected, bytes: contents.length, sha256: digest(contents) };
          await writeAtomic(file, contents);
          generated++;
        }
        variants.push(variant);
      }
      // A source changed during generation must not publish a mixed-edition manifest.
      if (digest(await readFile(path.join(root, "public", source.source))) !== source.sha256) throw new Error(`Photo modifiée pendant la génération : ${source.source}`);
      const { stem, widths, ...original } = source;
      images[index] = { ...original, variants };
    }
  }));
  if (JSON.stringify(await sourcesIn(root)) !== JSON.stringify(sources)) {
    throw new Error("Photos modifiées pendant la génération : relancer sur des sources stables.");
  }
  const manifest = { generator: "InflammMenu-responsive-v1", version, settings, images };
  if (!check) {
    await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (trackedVersion?.version !== version) await writeAtomic(versionPath, `${JSON.stringify({ version }, null, 2)}\n`);
    await removeObsoleteDerivatives(root, version);
  }
  return { version, generated, images };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await responsiveImages({ check: process.argv.includes("--check") });
  const total = result.images.reduce((sum, image) => sum + image.variants.length, 0);
  console.log(`Photos adaptées ${result.version} : ${result.images.length} originaux inchangés, ${total} variantes vérifiées, ${result.generated} créées.`);
}
