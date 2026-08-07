#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const catalogue = JSON.parse(await readFile(new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url), "utf8"));
const groups = new Map();
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const recipe of catalogue.recipes) {
  for (const ingredient of recipe.ingredients) {
    const key = normalize(ingredient.nom);
    const group = groups.get(key) ?? new Map();
    group.set(ingredient.id, (group.get(ingredient.id) ?? 0) + 1);
    groups.set(key, group);
  }
}

const candidates = [...groups.entries()]
  .filter(([, ids]) => ids.size > 1)
  .map(([normalized_name, ids]) => ({ normalized_name, ids: Object.fromEntries(ids) }))
  .sort((left, right) => left.normalized_name.localeCompare(right.normalized_name, "fr"));
console.log(JSON.stringify({ generated_at: new Date().toISOString(), candidates }, null, 2));
