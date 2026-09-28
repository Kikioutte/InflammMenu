import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const catalogue = JSON.parse(await readFile(new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url), "utf8"));
const editions = JSON.parse(await readFile(new URL("../src/data/catalogue-offline-editions.json", import.meta.url), "utf8"));
// Hash the parsed JSON representation: transport whitespace is not editorial data.
const sha256 = createHash("sha256").update(JSON.stringify(catalogue)).digest("hex");
assert.deepEqual(editions.current, { sha256, recipeCount: catalogue.recipes.length },
  `Édition hors ligne à actualiser après relecture : ${sha256}, ${catalogue.recipes.length} recettes. Les éditions précédentes ne sont admises qu'après revue explicite.`);
const hashes = new Set();
for (const edition of [editions.current, ...editions.previous]) {
  assert.match(edition.sha256, /^[a-f0-9]{64}$/);
  assert(Number.isSafeInteger(edition.recipeCount) && edition.recipeCount > 0);
  assert(!hashes.has(edition.sha256), "édition dupliquée");
  hashes.add(edition.sha256);
}
console.log(`Édition hors ligne vérifiée : ${catalogue.recipes.length} recettes, ${editions.previous.length} édition(s) antérieure(s) explicitement admise(s).`);
