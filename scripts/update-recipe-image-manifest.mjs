#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";

const imagesUrl = new URL("../public/assets/recipes/generated/", import.meta.url);
const manifestUrl = new URL("../src/data/generated-recipe-images.json", import.meta.url);
const catalogueUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const catalogue = JSON.parse(await readFile(catalogueUrl, "utf8"));
const catalogueImageNames = new Set(
  catalogue.recipes.map((recipe) => recipe.image.nom_fichier),
);
const imageNames = (await readdir(imagesUrl))
  .filter((name) => catalogueImageNames.has(name))
  .sort();

await writeFile(manifestUrl, `${JSON.stringify(imageNames, null, 2)}\n`);
console.log(`Manifeste mis à jour : ${imageNames.length} images disponibles.`);
