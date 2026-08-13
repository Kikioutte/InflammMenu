#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [catalogue, aliasSource, ruleSource, recipesSource] = await Promise.all([
  "src/data/recettes-anti-inflammatoires.json",
  "src/data/ingredient-id-aliases.json",
  "src/data/ingredient-shopping-rules.json",
  "src/recipes.ts",
].map(async (file) => file.endsWith(".json")
  ? JSON.parse(await readFile(new URL(file, root), "utf8"))
  : readFile(new URL(file, root), "utf8")));

const normalize = (value) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/œ/g, "oe")
  .replace(/æ/g, "ae")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const directAliases = new Map(Object.entries(aliasSource.aliases).map(([alias, canonical]) => [normalize(alias), normalize(canonical)]));
const reviewedEntries = Object.entries(aliasSource.aliases);
for (const group of aliasSource.canonical_groups) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(group.canonical_id), `${group.canonical_id}: identifiant canonique invalide`);
  for (const alias of group.aliases) {
    reviewedEntries.push([alias, group.canonical_id]);
    const normalizedAlias = normalize(alias);
    const canonical = normalize(group.canonical_id);
    if (normalizedAlias !== canonical) directAliases.set(normalizedAlias, canonical);
  }
}

function canonicalId(rawId) {
  let current = normalize(rawId);
  const visited = new Set();
  while (directAliases.has(current)) {
    assert(!visited.has(current), `boucle d'alias détectée depuis ${rawId}`);
    visited.add(current);
    current = directAliases.get(current);
  }
  return current;
}

for (const [alias, target] of reviewedEntries) {
  assert.equal(canonicalId(alias), canonicalId(target), `${alias}: correspondance contradictoire`);
}

const ingredients = catalogue.recipes.flatMap((recipe) => recipe.ingredients);
for (const ingredient of ingredients) {
  assert.equal(ingredient.id, canonicalId(ingredient.id), `${ingredient.id}: ancien alias encore présent dans le catalogue`);
}

const groupsByName = new Map();
for (const ingredient of ingredients) {
  const key = normalize(ingredient.nom);
  const ids = groupsByName.get(key) ?? new Set();
  ids.add(ingredient.id);
  groupsByName.set(key, ids);
}
const exceptionSets = aliasSource.exceptions.map((exception) => new Set(exception.ids.map(canonicalId)));
for (const [name, ids] of groupsByName) {
  if (ids.size <= 1) continue;
  const reviewed = exceptionSets.some((exceptionIds) =>
    ids.size === exceptionIds.size && [...ids].every((id) => exceptionIds.has(id)));
  assert(reviewed, `${name}: plusieurs identifiants sans exception relue (${[...ids].join(", ")})`);
}

const v1Ids = new Set([...recipesSource.matchAll(/^\s{2}([a-z][a-z0-9_]+): \{ name:/gm)].map((match) => canonicalId(match[1])));
const knownIds = new Set([...ingredients.map((ingredient) => ingredient.id), ...v1Ids]);
for (const [rawId, rule] of Object.entries(ruleSource.rules)) {
  const id = canonicalId(rawId);
  assert(knownIds.has(id), `${rawId}: règle d'achat sans ingrédient connu`);
  if (rule.piece_weight_g !== undefined) assert(rule.piece_weight_g > 0, `${rawId}: poids par pièce invalide`);
  if (rule.purchase?.kind === "bunches") assert(rule.purchase.grams_per_bunch > 0, `${rawId}: poids de botte invalide`);
}

const shoppingIds = new Set();
const shoppingMembers = new Set();
const categories = new Set(["fruit-vegetable", "grocery", "fresh", "meat-fish", "frozen", "bakery", "beverage"]);
for (const [index, group] of (ruleSource.shopping_groups ?? []).entries()) {
  assert(group && typeof group === "object" && !Array.isArray(group), `groupe d'achat ${index + 1}: définition invalide`);
  const shoppingId = normalize(group.shopping_id ?? "");
  assert(shoppingId && shoppingId === group.shopping_id, `groupe d'achat ${index + 1}: identifiant invalide`);
  assert(!shoppingIds.has(shoppingId), `${shoppingId}: identifiant d'achat dupliqué`);
  assert(typeof group.display_name === "string" && group.display_name.trim(), `${shoppingId}: libellé d'achat manquant`);
  assert(categories.has(group.category), `${shoppingId}: rayon d'achat invalide`);
  assert(Array.isArray(group.member_ids) && group.member_ids.length >= 2, `${shoppingId}: membres insuffisants`);
  const members = group.member_ids.map(canonicalId);
  assert(!knownIds.has(shoppingId) || members.includes(shoppingId), `${shoppingId}: collision avec un ingrédient hors du groupe`);
  for (const member of members) {
    assert(knownIds.has(member), `${shoppingId}: membre inconnu ${member}`);
    assert(!shoppingMembers.has(member), `${member}: présent dans plusieurs groupes d'achat`);
    shoppingMembers.add(member);
  }
  if (group.purchase?.kind === "bunches") assert(group.purchase.grams_per_bunch > 0, `${shoppingId}: poids de botte invalide`);
  shoppingIds.add(shoppingId);
}

console.log(`Identifiants ingrédients valides : ${knownIds.size} canoniques, ${reviewedEntries.length} décisions relues, ${aliasSource.exceptions.length} exceptions et ${shoppingIds.size} groupes d’achat.`);
