import assert from "node:assert/strict";
import { basename } from "node:path";
import { readdir, readFile } from "node:fs/promises";

const rootUrl = new URL("../", import.meta.url);
const researchUrl = new URL("research/", rootUrl);
const catalogue = JSON.parse(await readFile(new URL("src/data/recettes-anti-inflammatoires.json", rootUrl), "utf8"));
const recipes = new Map(
  catalogue.recipes
    .filter(({ id }) => {
      const numericId = Number.parseInt(id.slice(1), 10);
      return numericId >= 1 && numericId <= 550;
    })
    .map((recipe) => [recipe.id, recipe]),
);
const files = (await readdir(researchUrl))
  .filter((name) => /^image-prompts-r\d{3}-r\d{3}\.json$/.test(name))
  .sort();

assert.equal(recipes.size, 550, "550 recettes cibles sont requises");
assert.equal(files.length, 22, "22 lots de prompts image sont requis");

const ids = new Set();
const outputs = new Set();
const allowedStatuses = new Set(["generated_inspected_optimized", "waiting_image_generation"]);

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

for (const file of files) {
  const [, firstId, lastId] = file.match(/^image-prompts-r(\d{3})-r(\d{3})\.json$/) ?? [];
  const document = JSON.parse(await readFile(new URL(file, researchUrl), "utf8"));
  const prompts = document.prompts ?? document;
  assert.ok(Array.isArray(prompts), `${file}: liste de prompts absente`);
  assert.equal(prompts.length, 25, `${file}: 25 prompts sont requis`);

  for (const entry of prompts) {
    const recipe = recipes.get(entry.id);
    assert.ok(recipe, `${file}: recette ${entry.id} introuvable`);
    const numericId = Number.parseInt(entry.id.slice(1), 10);
    assert.ok(numericId >= Number(firstId) && numericId <= Number(lastId), `${entry.id}: rangé dans le mauvais lot`);
    assert.ok(!ids.has(entry.id), `${entry.id}: prompt dupliqué`);
    ids.add(entry.id);

    const title = entry.title ?? entry.titre;
    assert.equal(title, recipe.titre, `${entry.id}: titre différent de la recette finale`);
    assert.ok(entry.prompt.includes(recipe.titre), `${entry.id}: titre final absent du prompt`);
    assert.ok(entry.prompt.length >= 500, `${entry.id}: prompt insuffisamment détaillé`);
    assert.match(entry.prompt, /Ultra-photoréalisme/i, `${entry.id}: consigne photoréaliste absente`);

    const output = basename(entry.output_file ?? entry.slug_fichier ?? "");
    assert.equal(output, recipe.image.nom_fichier, `${entry.id}: nom de fichier différent de la recette finale`);
    assert.ok(!outputs.has(output), `${entry.id}: fichier de sortie dupliqué`);
    outputs.add(output);
    assert.ok(allowedStatuses.has(entry.status), `${entry.id}: statut image inconnu`);

    if (entry.status === "waiting_image_generation") {
      const normalizedPrompt = normalize(entry.prompt);
      for (const ingredient of recipe.ingredients.filter(({ facultatif }) => !facultatif).slice(0, 9)) {
        assert.ok(normalizedPrompt.includes(normalize(ingredient.nom)), `${entry.id}: ingrédient ${ingredient.nom} absent du prompt`);
      }
      assert.match(entry.prompt, /aucune garniture absente/i, `${entry.id}: garde-fou sur les garnitures absent`);
      assert.match(entry.prompt, /aucun texte/i, `${entry.id}: interdiction de texte absente`);
      assert.match(entry.prompt, /pas de cadre de téléphone/i, `${entry.id}: interdiction du cadre de téléphone absente`);
    }
  }
}

assert.equal(ids.size, 550, "550 prompts uniques sont requis");
assert.equal(outputs.size, 550, "550 fichiers de sortie uniques sont requis");
console.log("Prompts image valides : 550 recettes, titres et fichiers de sortie parfaitement alignés.");
