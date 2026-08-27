import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const [sourceFile = "research/pilot-r051-r075.nutrition.json", finalFile = "research/pilot-r051-r075.final.json"] = process.argv.slice(2);
const [source, final] = await Promise.all([sourceFile, finalFile].map((file) => readFile(file, "utf8").then(JSON.parse)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expectedIds = Array.from({ length: 25 }, (_, index) => `r${String(index + 51).padStart(3, "0")}`);
assert(final.meta?.status === "editorial-validated", "meta.status doit valoir editorial-validated");
assert(final.meta?.reviewed_at === "2026-08-05", "meta.reviewed_at invalide");
assert(final.meta?.nombre_recettes === 25, "Le lot final doit contenir 25 recettes");
assert(JSON.stringify(final.recipes.map((recipe) => recipe.id)) === JSON.stringify(expectedIds), "La séquence r051-r075 est incomplète");

const sourceById = new Map(source.recipes.map((recipe) => [recipe.id, recipe]));
const allowedEquipment = new Set(["hob", "oven", "microwave", "blender", "toaster", "steamer"]);
const nutritionCautions = new Set(["r051", "r052", "r059", "r072"]);

for (const recipe of final.recipes) {
  const original = sourceById.get(recipe.id);
  assert(original, `${recipe.id}: recette source absente`);
  for (const field of ["titre", "categorie", "temps", "portions", "ingredients", "etapes", "substitutions"]) {
    assert(JSON.stringify(recipe[field]) === JSON.stringify(original[field]), `${recipe.id}: ${field} modifié pendant la relecture éditoriale`);
  }

  assert(Number.isFinite(recipe.score_anti_inflammatoire) && recipe.score_anti_inflammatoire >= 0 && recipe.score_anti_inflammatoire <= 10, `${recipe.id}: indice éditorial invalide`);
  assert(/modèle méditerranéen global/i.test(recipe.score_note), `${recipe.id}: justification du modèle alimentaire absente`);
  assert(/ne mesure aucun effet médical/i.test(recipe.score_note), `${recipe.id}: portée non médicale absente`);
  assert(recipe.app?.review?.stage === "editorial-validated", `${recipe.id}: étape éditoriale invalide`);
  assert(["validated", "caution"].includes(recipe.app.review.status), `${recipe.id}: statut éditorial invalide`);
  if (recipe.app.review.status === "caution") assert(recipe.app.review.caution?.trim(), `${recipe.id}: précaution éditoriale absente`);
  assert(recipe.provenance?.reviewed_at === "2026-08-05", `${recipe.id}: date de relecture absente`);

  const ingredientAllergens = [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.allergenes))].sort();
  const plannerAllergens = [...new Set(recipe.app.planner.allergens)].sort();
  assert(JSON.stringify(ingredientAllergens) === JSON.stringify(plannerAllergens), `${recipe.id}: allergènes du planificateur incohérents`);

  if (recipe.app.planner.eligible) {
    assert(recipe.categorie === "petit-dejeuner", `${recipe.id}: recette éligible qui n'est pas un petit-déjeuner`);
    assert(recipe.app.planner.meal_types.includes("breakfast"), `${recipe.id}: type breakfast absent`);
    assert(recipe.app.planner.equipment.every((equipment) => allowedEquipment.has(equipment)), `${recipe.id}: matériel non représenté`);
  }

  if (nutritionCautions.has(recipe.id)) {
    assert(recipe.nutrition_par_portion.estimation.statut === "calculated-with-cautions", `${recipe.id}: réserve nutritionnelle perdue`);
    assert(recipe.nutrition_par_portion.estimation.cautions?.length > 0, `${recipe.id}: détail de réserve nutritionnelle absent`);
    assert(/Réserve de calcul/i.test(recipe.app.review.caution), `${recipe.id}: réserve non visible dans la relecture`);
  }

  const editorialText = [recipe.description, recipe.app.review.summary, recipe.app.review.caution, recipe.score_note].filter(Boolean).join(" ");
  assert(!/(guérit|guérison|prévient une maladie|traite une maladie|réduit l'inflammation|combat l'inflammation)/i.test(editorialText), `${recipe.id}: allégation médicale interdite`);
}

const r054 = final.recipes.find((recipe) => recipe.id === "r054");
assert(r054.nutrition_par_portion.sodium_mg >= 700 && r054.nutrition_par_portion.sodium_mg <= 760, "r054: estimation de sodium inattendue");
assert(r054.app.planner.eligible === false && /731 mg|sodium élevé/i.test(r054.app.review.caution), "r054: réserve sodium ou inéligibilité absente");

const r066 = final.recipes.find((recipe) => recipe.id === "r066");
assert(r066.app.planner.eligible === false && /gaufrier/i.test(r066.app.review.caution), "r066: contrainte gaufrier absente");

const r071 = final.recipes.find((recipe) => recipe.id === "r071");
assert(r071.app.planner.eligible === false, "r071: doit rester hors du planificateur");
assert(/pamplemousse/i.test(r071.app.review.caution) && /médicaments/i.test(r071.app.review.caution), "r071: interaction pamplemousse-médicaments absente");

const eligibleCount = final.recipes.filter((recipe) => recipe.app.planner.eligible).length;
assert(eligibleCount === 22, `Nombre de recettes éligibles inattendu: ${eligibleCount}`);
validateCatalogue(final, { taxonomy: "legacy" });
console.log(`Lot éditorial final valide : ${final.recipes.length} recettes, ${eligibleCount} éligibles, ${nutritionCautions.size} réserves nutritionnelles conservées.`);
