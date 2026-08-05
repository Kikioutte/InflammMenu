import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";

const presentOnly = process.argv.includes("--present-only");
const researchUrl = new URL("../research/", import.meta.url);
const publicUrl = new URL("../public/assets/recipes/generated/", import.meta.url);
const manifestUrl = new URL("../src/data/generated-recipe-images.json", import.meta.url);
const names = await readdir(researchUrl);

const recipes = new Map();
for (const name of names.filter((entry) => /^pilot-r\d{3}-r\d{3}\.final\.json$/.test(entry))) {
  const catalogue = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
  for (const recipe of catalogue.recipes) {
    assert.ok(!recipes.has(recipe.id), `${recipe.id}: recette finale dupliquée`);
    recipes.set(recipe.id, recipe);
  }
}

const promptStatuses = new Map();
for (const name of names.filter((entry) => /^image-prompts-r\d{3}-r\d{3}\.json$/.test(entry))) {
  const document = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
  for (const prompt of document.prompts ?? document) {
    assert.ok(!promptStatuses.has(prompt.id), `${prompt.id}: prompt image dupliqué`);
    promptStatuses.set(prompt.id, prompt.status);
  }
}

assert.equal(recipes.size, 500, "500 recettes finales sont requises");
assert.equal(promptStatuses.size, 500, "500 prompts image sont requis");

const expectedByFilename = new Map(
  [...recipes.values()].map((recipe) => [recipe.image.nom_fichier, recipe]),
);
const imageNames = (await readdir(publicUrl)).filter((name) => /^r\d{3}-.+\.jpg$/.test(name));
const presentNames = new Set(imageNames);
const manifestNames = JSON.parse(await readFile(manifestUrl, "utf8"));
assert.deepEqual(manifestNames, [...imageNames].sort(), "Le manifeste des images disponibles doit être régénéré");

for (const recipe of recipes.values()) {
  const expectedStatus = presentNames.has(recipe.image.nom_fichier)
    ? "generated_inspected_optimized"
    : "waiting_image_generation";
  assert.equal(promptStatuses.get(recipe.id), expectedStatus, `${recipe.id}: statut image incohérent`);
}

function jpegDimensions(buffer, id) {
  assert.ok(buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8, `${id}: fichier non JPEG`);
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 8 < buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    assert.ok(offset + 1 < buffer.length, `${id}: segment JPEG tronqué`);
    const length = buffer.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= buffer.length, `${id}: segment JPEG invalide`);
    if (startOfFrame.has(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }

  throw new Error(`${id}: dimensions JPEG introuvables`);
}

for (const name of imageNames.sort()) {
  const recipe = expectedByFilename.get(name);
  assert.ok(recipe, `${name}: image orpheline sans recette finale`);
  const imageUrl = new URL(name, publicUrl);
  const details = await stat(imageUrl);
  assert.ok(details.size <= 350 * 1024, `${recipe.id}: image supérieure à 350 Ko`);
  const dimensions = jpegDimensions(await readFile(imageUrl), recipe.id);
  assert.deepEqual(dimensions, { width: 900, height: 900 }, `${recipe.id}: dimensions différentes de 900 × 900 px`);
}

const inspectedWithoutFile = [...promptStatuses]
  .filter(([, status]) => status === "generated_inspected_optimized")
  .map(([id]) => recipes.get(id))
  .filter((recipe) => recipe && !presentNames.has(recipe.image.nom_fichier));
assert.deepEqual(inspectedWithoutFile, [], "Une image marquée comme terminée est absente");

const missing = [...recipes.values()].filter((recipe) => !presentNames.has(recipe.image.nom_fichier));
console.log(`${imageNames.length} images présentes sont des JPEG 900 × 900 de 350 Ko maximum; ${missing.length} restent à générer.`);

if (!presentOnly) {
  assert.equal(missing.length, 0, `${missing.length} images finales manquantes (${missing.slice(0, 8).map(({ id }) => id).join(", ")}${missing.length > 8 ? ", …" : ""})`);
}
