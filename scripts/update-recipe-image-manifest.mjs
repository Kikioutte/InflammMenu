#!/usr/bin/env node
import { readdir, writeFile } from "node:fs/promises";

const imagesUrl = new URL("../public/assets/recipes/generated/", import.meta.url);
const manifestUrl = new URL("../src/data/generated-recipe-images.json", import.meta.url);
const imageNames = (await readdir(imagesUrl))
  .filter((name) => /^r\d{3}-.+\.jpg$/.test(name))
  .sort();

await writeFile(manifestUrl, `${JSON.stringify(imageNames, null, 2)}\n`);
console.log(`Manifeste mis à jour : ${imageNames.length} images disponibles.`);
