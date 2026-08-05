import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const load = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const [concepts, pilot, published, ...priorConceptGroups] = await Promise.all([
  load("research/recipes-r501-r525.json"),
  load("research/pilot-r501-r525.draft.json"),
  load("src/data/recettes-anti-inflammatoires.json"),
  load("research/recipes-r051-r200.json"),
  load("research/recipes-r201-r350.json"),
  load("research/recipes-r351-r500.json"),
]);

const result = validateCatalogue(pilot);
assert.equal(result.schemaVersion, "2.1.0");
assert.equal(result.recipeCount, 25);
assert.equal(concepts.length, 25);

const expectedIds = Array.from({ length: 25 }, (_, index) => `r${501 + index}`);
assert.deepEqual(concepts.map(({ id }) => id), expectedIds, "Concepts r501-r525 incomplets ou désordonnés");
assert.deepEqual(pilot.recipes.map(({ id }) => id), expectedIds, "Pilote r501-r525 incomplet ou désordonné");

const expectedDistribution = new Map([
  ["petit-dejeuner", 8],
  ["boisson", 4],
  ["soupe", 6],
  ["salade", 6],
  ["plat", 1],
]);
const actualDistribution = new Map();
for (const concept of concepts) {
  actualDistribution.set(concept.categorie, (actualDistribution.get(concept.categorie) ?? 0) + 1);
}
assert.deepEqual(actualDistribution, expectedDistribution, "Répartition culinaire r501-r525 incorrecte");
assert.ok(
  concepts.filter(({ famille_regime }) => famille_regime === "vegetalien").length >= 20,
  "Au moins 20 concepts doivent être végétaliens",
);

const priorConcepts = priorConceptGroups.flat();
const priorTitles = new Set(
  [...priorConcepts, ...published.recipes].map(({ titre }) => normalize(titre)),
);
const currentTitles = new Set();
for (const concept of concepts) {
  const title = normalize(concept.titre);
  assert.ok(!priorTitles.has(title), `${concept.id}: titre déjà utilisé avant r501`);
  assert.ok(!currentTitles.has(title), `${concept.id}: titre dupliqué dans le lot`);
  currentTitles.add(title);
  assert.match(concept.inspiration_culinaire, /adaptation originale/i, `${concept.id}: adaptation originale non signalée`);
  assert.match(concept.inspiration_culinaire, /sans revendication d'authenticit[ée]/i, `${concept.id}: authenticité non cadrée`);
  assert.match(concept.inspiration_culinaire, /(?:sans|ni) finalit[ée] th[ée]rapeutique/i, `${concept.id}: finalité non cadrée`);
}

const conceptIngredientSet = (concept) =>
  new Set((concept.ingredients_principaux ?? []).map(normalize).filter(Boolean));
const recipeIngredientSet = (recipe) =>
  new Set((recipe.ingredients ?? []).slice(0, 6).map(({ id, nom }) => normalize(id ?? nom)).filter(Boolean));
const overlap = (left, right) => {
  const intersection = [...left].filter((entry) => right.has(entry)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};

const priorFingerprints = [
  ...priorConcepts.map((entry) => ({
    id: entry.id,
    categorie: entry.categorie,
    technique: normalize(entry.technique ?? ""),
    ingredients: conceptIngredientSet(entry),
  })),
  ...published.recipes.map((entry) => ({
    id: entry.id,
    categorie: entry.categorie,
    technique: "",
    ingredients: recipeIngredientSet(entry),
  })),
];
const currentFingerprints = [];
let nearestOverlap = { score: 0, current: "", prior: "" };
for (const concept of concepts) {
  const fingerprint = {
    id: concept.id,
    categorie: concept.categorie,
    technique: normalize(concept.technique),
    ingredients: conceptIngredientSet(concept),
  };
  for (const previous of [...priorFingerprints, ...currentFingerprints]) {
    if (previous.categorie !== fingerprint.categorie) continue;
    const score = overlap(fingerprint.ingredients, previous.ingredients);
    if (score > nearestOverlap.score) {
      nearestOverlap = { score, current: fingerprint.id, prior: previous.id };
    }
    const sameTechnique = previous.technique && previous.technique === fingerprint.technique;
    assert.ok(
      score < 0.8 || !sameTechnique,
      `${fingerprint.id}: concept trop proche de ${previous.id} (ingrédients et technique)`,
    );
  }
  currentFingerprints.push(fingerprint);
}

const allowedAllergens = new Set([
  "gluten",
  "crustaces",
  "oeuf",
  "poisson",
  "arachides",
  "soja",
  "lait",
  "fruits-a-coque",
  "celeri",
  "moutarde",
  "sesame",
  "sulfites",
  "lupin",
  "mollusques",
]);
const bannedIngredient = /(?:ashwagandha|bacopa|triphala|guggul|huile essentielle|plomb|mercure|arsenic|compl[ée]ment|extrait concentr[ée]|m[ée]tal m[ée]dicinal)/i;
const addedSugar = /^(?:sucre|sirop|miel|melasse)(?:\b|-)/;
const saturatedFatSources = /(?:ghee|beurre|cr[eè]me|huile de coco|lait de coco|noix de coco)/i;
const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));

for (const recipe of pilot.recipes) {
  const concept = conceptById.get(recipe.id);
  assert.equal(recipe.titre, concept.titre);
  assert.equal(recipe.categorie, concept.categorie);
  assert.equal(recipe.app.review.stage, "draft");
  assert.equal(recipe.app.review.status, "caution");
  assert.equal(recipe.app.planner.eligible, false);
  assert.equal(recipe.nutrition_par_portion.estimation.statut, "estimated");
  assert.ok(recipe.app.planner.active_minutes <= recipe.temps.total);
  assert.ok(recipe.nutrition_par_portion.sodium_mg <= 250, `${recipe.id}: sodium trop élevé pour le cadrage`);
  assert.ok(recipe.nutrition_par_portion.acides_gras_satures_g <= 3, `${recipe.id}: graisses saturées trop élevées`);
  assert.ok(recipe.ingredients.length >= 5, `${recipe.id}: formulation trop courte`);
  assert.ok(recipe.etapes.length >= 4, `${recipe.id}: protocole trop court`);

  const sourceUrls = new Set(recipe.provenance.sources.map(({ url }) => url).filter(Boolean));
  const sourceTitles = recipe.provenance.sources.map(({ title }) => title).join(" ");
  assert.ok([...sourceUrls].some((url) => url.includes("nccih.nih.gov/health/ayurvedic-medicine")), `${recipe.id}: source NCCIH absente`);
  assert.ok([...sourceUrls].some((url) => url.includes("anses.fr")) && /curcuma/i.test(sourceTitles), `${recipe.id}: source Anses curcuma absente`);
  assert.ok([...sourceUrls].some((url) => url.includes("who.int") && url.includes("healthy-diet")), `${recipe.id}: source OMS absente`);
  assert.ok([...sourceUrls].some((url) => url.includes("ciqual.anses.fr")), `${recipe.id}: repère Ciqual absent`);

  for (const ingredient of recipe.ingredients) {
    const ingredientLabel = `${ingredient.id} ${ingredient.nom}`;
    assert.ok(!bannedIngredient.test(ingredientLabel), `${recipe.id}: produit exclu (${ingredient.nom})`);
    assert.ok(!addedSugar.test(normalize(ingredient.id)), `${recipe.id}: sucre ajouté exclu (${ingredient.nom})`);
    assert.ok(!saturatedFatSources.test(ingredientLabel), `${recipe.id}: ghee, coco ou matière grasse saturée non nécessaire (${ingredient.nom})`);
    for (const allergen of ingredient.allergenes) {
      assert.ok(allowedAllergens.has(allergen), `${recipe.id}: allergène hors liste réglementaire (${allergen})`);
    }
  }

  const turmeric = recipe.ingredients.filter(({ id, nom }) => /curcuma/i.test(`${id} ${nom}`));
  if (turmeric.length > 0) {
    assert.ok(
      turmeric.every(({ quantite, unite }) => unite === "c_cafe" && quantite <= 0.5),
      `${recipe.id}: curcuma au-delà de la quantité culinaire fixée`,
    );
    assert.ok(
      !recipe.ingredients.some(({ id, nom }) => /poivre|pip[ée]rine/i.test(`${id} ${nom}`)),
      `${recipe.id}: association conçue pour la biodisponibilité du curcuma`,
    );
    assert.match(recipe.conseils.join(" "), /sans promesse|ne pas.*(?:extrait|pip[ée]rine)|ne pas ajouter.*(?:extrait|pip[ée]rine)/i);
  }

  const claimsText = normalize([
    recipe.titre,
    recipe.description,
    ...recipe.etapes,
    recipe.seo.meta_description,
  ].join(" "));
  for (const forbiddenClaim of [
    /(?:^|\s)guerit(?:\s|$)/,
    /(?:^|\s)soigne(?:\s|$)/,
    /previent l inflammation/,
    /traite l inflammation/,
    /detox/,
  ]) {
    assert.ok(!forbiddenClaim.test(claimsText), `${recipe.id}: revendication médicale interdite`);
  }
}

console.log(
  `Lot Ayurveda r501-r525 valide : 25 recettes brouillon, ${concepts.filter(({ famille_regime }) => famille_regime === "vegetalien").length} végétaliennes, chevauchement maximal ${(nearestOverlap.score * 100).toFixed(0)} % (${nearestOverlap.current}/${nearestOverlap.prior}).`,
);
