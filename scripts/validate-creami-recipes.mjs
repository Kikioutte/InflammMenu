import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalogue = JSON.parse(await readFile(new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url), "utf8"));
const planner = JSON.parse(await readFile(new URL("../src/data/planner-recipes.json", import.meta.url), "utf8"));
const recipes = catalogue.recipes.filter((recipe) => {
  const number = Number.parseInt(recipe.id.slice(1), 10);
  return number >= 551 && number <= 630;
});
const programs = new Set(["ICE CREAM", "LITE ICE CREAM", "SORBET", "GELATO", "FROZEN YOGURT"]);
const officialGuide = "https://support.ninjakitchen.fr/hc/fr/articles/12852726145820";

assert.equal(recipes.length, 80, "80 desserts CREAMi r551-r630 sont requis");
assert.equal(new Set(recipes.map(({ titre }) => titre)).size, 80, "Les titres CREAMi doivent être uniques");

const programCounts = Object.fromEntries([...programs].map((program) => [program, 0]));
for (const [index, recipe] of recipes.entries()) {
  const expectedId = `r${String(index + 551).padStart(3, "0")}`;
  assert.equal(recipe.id, expectedId, `${expectedId}: suite CREAMi interrompue`);
  assert.equal(recipe.categorie, "dessert", `${recipe.id}: catégorie dessert requise`);
  assert.equal(recipe.portions, 6, `${recipe.id}: six portions Deluxe requises`);
  for (const tag of ["dessert", "dessert-glace", "ninja-creami-deluxe"]) {
    assert.ok(recipe.tags.includes(tag), `${recipe.id}: tag ${tag} requis`);
  }
  assert.deepEqual(recipe.materiel, ["Ninja CREAMi Deluxe (NC501EU)", "Pot Deluxe avec couvercle"], `${recipe.id}: matériel CREAMi incomplet`);
  assert.ok(programs.has(recipe.creami?.programme), `${recipe.id}: programme CREAMi inconnu`);
  assert.equal(recipe.creami.modele, "Ninja CREAMi Deluxe (NC501EU)", `${recipe.id}: modèle CREAMi incorrect`);
  assert.equal(recipe.creami.zone, "FULL", `${recipe.id}: zone FULL requise`);
  programCounts[recipe.creami.programme] += 1;

  assert.ok(recipe.temps.repos >= 1_440, `${recipe.id}: congélation de 24 h absente`);
  assert.equal(recipe.temps.total, recipe.temps.preparation + recipe.temps.cuisson + recipe.temps.repos, `${recipe.id}: temps total incohérent`);
  assert.equal(recipe.app.planner.active_minutes, recipe.temps.preparation + recipe.temps.cuisson, `${recipe.id}: temps actif incohérent`);
  assert.equal(recipe.app.planner.eligible, false, `${recipe.id}: dessert interdit dans le générateur hebdomadaire`);
  assert.deepEqual(recipe.app.planner.equipment, [], `${recipe.id}: la CREAMi ne doit pas entrer dans le profil du générateur`);
  assert.equal(recipe.app.review.stage, "editorial-validated", `${recipe.id}: relecture éditoriale absente`);
  assert.equal(recipe.app.review.status, "caution", `${recipe.id}: texture non testée à signaler`);
  assert.match(recipe.app.review.caution, /non testée physiquement/i, `${recipe.id}: limite d'essai culinaire absente`);
  assert.doesNotMatch(recipe.app.review.summary, /non testée|brouillon/i, `${recipe.id}: note interne exposée sur la carte`);
  assert.match(recipe.score_note, /indice (éditorial|non évalué)/i, `${recipe.id}: nature éditoriale de l'indice absente`);
  assert.match(recipe.score_note, /ne (mesure|prouve)|aucun effet médical|sans portée médicale/i, `${recipe.id}: limite médicale absente`);

  const steps = recipe.etapes.join(" ");
  assert.match(steps, /MAX FILL/i, `${recipe.id}: ligne MAX FILL absente`);
  assert.match(steps, /24 heures/i, `${recipe.id}: congélation 24 h absente des étapes`);
  assert.ok(steps.includes(recipe.creami.programme), `${recipe.id}: programme absent des étapes`);
  assert.match(steps, /RE-SPIN/i, `${recipe.id}: conseil RE-SPIN absent`);
  const normalizedLoad = recipe.ingredients
    .filter(({ unite_normalisee }) => unite_normalisee === "g" || unite_normalisee === "ml")
    .reduce((sum, ingredient) => sum + ingredient.quantite_normalisee, 0);
  assert.ok(normalizedLoad <= 720, `${recipe.id}: base de ${normalizedLoad} g/ml potentiellement au-dessus de MAX FILL`);

  assert.ok(["calculated", "calculated-with-cautions"].includes(recipe.nutrition_par_portion.estimation?.statut), `${recipe.id}: méthode nutritionnelle absente`);
  if (recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions") {
    assert.ok(recipe.nutrition_par_portion.estimation.cautions?.length > 0, `${recipe.id}: réserve nutritionnelle absente`);
  }
  assert.ok(recipe.provenance.sources.some((source) => source.kind === "safety" && source.url?.startsWith(officialGuide)), `${recipe.id}: source officielle NC501EU absente`);
  assert.equal(planner.some(({ id }) => id === `catalog-${recipe.id}`), false, `${recipe.id}: projection planificateur interdite`);
}

for (const [program, count] of Object.entries(programCounts)) {
  assert.ok(count >= 4, `${program}: diversité insuffisante (${count})`);
}
assert.equal(planner.filter((recipe) => Number(recipe.id.replace("catalog-r", "")) <= 630).length, 327, "Les 327 recettes planifiables historiques doivent rester inchangées");

console.log(`Lot CREAMi valide : 80 desserts originaux, ${Object.entries(programCounts).map(([program, count]) => `${program} ${count}`).join(" · ")}.`);
