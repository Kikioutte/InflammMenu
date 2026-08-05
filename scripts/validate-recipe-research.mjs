import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const batchPaths = [
  "research/recipes-r051-r200.json",
  "research/recipes-r201-r350.json",
  "research/recipes-r351-r500.json",
];

const expectedCategories = new Map([
  ["petit-dejeuner", 52],
  ["boisson", 21],
  ["soupe", 49],
  ["salade", 78],
  ["plat", 162],
  ["accompagnement", 27],
  ["snack", 22],
  ["dessert", 22],
  ["sauce", 17],
]);
const allowedSeasons = new Set(["printemps", "ete", "automne", "hiver", "toute-annee"]);
const allowedProfiles = new Set(["vegetalien", "vegetarien", "pescetarien", "volaille"]);
const forbiddenClaims = /(\bgu[eé]rit\b|\btraite\b|combat l['’]inflammation|pr[eé]vient l['’]inflammation|\bd[eé]tox\b|br[uû]le[- ]graisse|booste l['’]immunit[eé]|remplace un traitement)/i;

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const batches = await Promise.all(batchPaths.map(async (path) => {
  const value = JSON.parse(await readFile(new URL(path, root), "utf8"));
  assert(Array.isArray(value), `${path}: un tableau JSON est requis`);
  assert(value.length === 150, `${path}: 150 concepts attendus, ${value.length} trouvés`);
  return value;
}));
const concepts = batches.flat();

assert(concepts.length === 450, `450 concepts attendus, ${concepts.length} trouvés`);

const catalogue = JSON.parse(await readFile(new URL("src/data/recettes-anti-inflammatoires.json", root), "utf8"));
const recipesSource = await readFile(new URL("src/recipes.ts", root), "utf8");
const existingTitles = new Set(catalogue.recipes.map((recipe) => normalize(recipe.titre)));
for (const match of recipesSource.matchAll(/^\s+title: "([^"]+)",$/gm)) existingTitles.add(normalize(match[1]));

const ids = new Set();
const titles = new Set();
const fingerprints = new Set();
const categoryCounts = new Map();

for (let index = 0; index < concepts.length; index += 1) {
  const concept = concepts[index];
  const expectedId = `r${String(index + 51).padStart(3, "0")}`;
  assert(concept.id === expectedId, `Position ${index + 1}: ${expectedId} attendu, ${concept.id} trouvé`);
  assert(!ids.has(concept.id), `${concept.id}: identifiant dupliqué`);
  ids.add(concept.id);

  const title = normalize(concept.titre ?? "");
  assert(title.length >= 8, `${concept.id}: titre trop court`);
  assert(!titles.has(title), `${concept.id}: titre dupliqué`);
  assert(!existingTitles.has(title), `${concept.id}: titre déjà présent dans l'application`);
  titles.add(title);

  assert(expectedCategories.has(concept.categorie), `${concept.id}: catégorie inconnue`);
  categoryCounts.set(concept.categorie, (categoryCounts.get(concept.categorie) ?? 0) + 1);
  assert(typeof concept.technique === "string" && concept.technique.trim().length > 2, `${concept.id}: technique requise`);
  assert(Array.isArray(concept.ingredients_principaux), `${concept.id}: ingrédients principaux requis`);
  assert(concept.ingredients_principaux.length >= 4 && concept.ingredients_principaux.length <= 6, `${concept.id}: 4 à 6 ingrédients principaux requis`);
  assert(new Set(concept.ingredients_principaux.map(normalize)).size === concept.ingredients_principaux.length, `${concept.id}: ingrédient principal répété`);
  assert(typeof concept.inspiration_culinaire === "string" && concept.inspiration_culinaire.trim().length > 2, `${concept.id}: inspiration culinaire requise`);
  assert(Array.isArray(concept.saisons) && concept.saisons.length > 0, `${concept.id}: saison requise`);
  for (const season of concept.saisons) assert(allowedSeasons.has(season), `${concept.id}: saison inconnue ${season}`);
  assert(allowedProfiles.has(concept.famille_regime), `${concept.id}: famille de régime inconnue`);
  assert(typeof concept.note_originalite === "string" && concept.note_originalite.trim().length > 12, `${concept.id}: note d'originalité requise`);
  assert(!forbiddenClaims.test(JSON.stringify(concept)), `${concept.id}: formulation thérapeutique interdite`);

  const fingerprint = [
    concept.categorie,
    normalize(concept.technique),
    ...concept.ingredients_principaux.map(normalize).sort(),
  ].join("|");
  assert(!fingerprints.has(fingerprint), `${concept.id}: empreinte culinaire dupliquée`);
  fingerprints.add(fingerprint);
}

for (const [category, expected] of expectedCategories) {
  assert(categoryCounts.get(category) === expected, `${category}: ${expected} concepts attendus, ${categoryCounts.get(category) ?? 0} trouvés`);
}

console.log(`Recherche valide : ${concepts.length} concepts, ${titles.size} titres et ${fingerprints.size} empreintes uniques.`);
