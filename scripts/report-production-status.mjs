import { readdir, readFile } from "node:fs/promises";

const researchUrl = new URL("../research/", import.meta.url);
const imageUrl = new URL("../public/assets/recipes/generated/", import.meta.url);
const catalogueUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const researchNames = await readdir(researchUrl);
const imageNames = await readdir(imageUrl).catch(() => []);
const catalogue = JSON.parse(await readFile(catalogueUrl, "utf8"));
const expectedImages = new Set(catalogue.recipes.map((recipe) => recipe.image.nom_fichier));

async function countRecipes(pattern) {
  let count = 0;
  const files = researchNames.filter((name) => pattern.test(name));
  for (const name of files) {
    const catalogue = JSON.parse(await readFile(new URL(name, researchUrl), "utf8"));
    count += catalogue.recipes.length;
  }
  return { files: files.length, recipes: count };
}

const drafts = await countRecipes(/^pilot-r\d{3}-r\d{3}\.draft\.json$/);
const nutrition = await countRecipes(/^pilot-r\d{3}-r\d{3}\.nutrition\.json$/);
const finals = await countRecipes(/^pilot-r\d{3}-r\d{3}\.final\.json$/);
const images = imageNames.filter((name) => expectedImages.has(name)).length;

console.log(JSON.stringify({
  target: 500,
  drafts,
  nutrition,
  finals,
  images: { target: expectedImages.size, files: images },
  remaining: {
    drafting: Math.max(0, 500 - drafts.recipes),
    nutrition: Math.max(0, 500 - nutrition.recipes),
    editorial: Math.max(0, 500 - finals.recipes),
    images: Math.max(0, expectedImages.size - images),
  },
}, null, 2));
