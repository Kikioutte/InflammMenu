#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import { normalizeCatalogueTaxonomy } from "./catalogue-taxonomy.mjs";

const catalogueUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const source = await readFile(catalogueUrl, "utf8");
const normalized = `${JSON.stringify(normalizeCatalogueTaxonomy(JSON.parse(source)), null, 2)}\n`;

if (process.argv.includes("--check")) {
  assert.equal(source, normalized, "le catalogue doit être normalisé avec npm run normalize:catalogue");
  console.log("Taxonomie catalogue normalisée.");
} else {
  await writeFile(catalogueUrl, normalized);
  console.log("Taxonomie catalogue normalisée et enregistrée.");
}
