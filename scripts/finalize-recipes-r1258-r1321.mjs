import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const write = async (path, value) => writeFile(new URL(path, root), JSON.stringify(value, null, 2) + '\n');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const base = 'a07d108b2fa792f4ab11e88f82901fd6ac7448e1';
const catalogue = await read('src/data/recettes-anti-inflammatoires.json');
const original = JSON.parse(execFileSync('git', ['show', `${base}:src/data/recettes-anti-inflammatoires.json`], { cwd: root, maxBuffer: 24 * 1024 * 1024 }).toString());
assert.deepEqual(catalogue.recipes.slice(0, 1257), original.recipes, 'Les 1 257 fiches précédentes doivent rester intactes.');
const source = (await read('research/recipes-r1258-r1321-source.json')).recipes;
const inventory = (await read('research/recipes-r1258-r1321-inventory.json')).fiches;
const additions = catalogue.recipes.slice(1257);
assert.equal(additions.length, 64);
await write('research/recipe-instructions-review-2026-10-05.json', {
  baseCommit: base,
  reviewDate: '2026-10-05',
  scope: 'Relecture sur dossier des 64 ajouts r1258–r1321, indépendante du journal historique du 1er octobre.',
  culinaryTested: false,
  limitations: 'Durées, textures, coûts et composition nutritionnelle restent estimatifs. Quatre extractions filtrées ne reçoivent pas de valeurs nutritionnelles. Les 64 photographies ne sont pas encore produites.',
  recipes: additions.map((recipe, index) => ({
    id: recipe.id,
    sourceInventorySha256: hash(inventory[index]),
    afterSha256: hash(recipe),
    evidence: `${source[index].nouveaute} ${JSON.stringify(source[index].revue_culinaire)}`,
    culinaryTested: false,
  })),
});
const editions = await read('src/data/catalogue-offline-editions.json');
const previous = [{ sha256: hash(original), recipeCount: 1257 }, ...editions.previous];
editions.current = { sha256: hash(catalogue), recipeCount: catalogue.recipes.length };
editions.previous = previous.filter((edition, index) => edition.sha256 !== editions.current.sha256 && previous.findIndex(other => other.sha256 === edition.sha256) === index);
await write('src/data/catalogue-offline-editions.json', editions);
console.log('64 relectures enregistrées ; 1 257 fiches antérieures intactes ; édition hors ligne actualisée.');
