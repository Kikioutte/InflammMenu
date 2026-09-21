import assert from "node:assert/strict";
import test from "node:test";
import { resolveIngredientExclusions, unsupportedAllergies, hasAllergyConflict, hasIngredientExclusionConflict } from "../src/food-restrictions.ts";
import { recipeIsAllowed, diagnoseRecipeCompatibility, generateWeeklyPlan } from "../src/engine.ts";
import { shoppingConflict } from "../src/personal-library.ts";
import { DEFAULT_PROFILE } from "../src/domain.ts";
import { RECIPES } from "../src/recipes.ts";

const pear = { id: "pear", name: "Poire", quantity: 100, unit: "g", category: "fruit-vegetable" };
const leek = { ...pear, id: "leek", name: "Poireau" };
const recipe = { ...RECIPES[0], id: "perso-restrictions", ingredients: [pear], allergens: [], mealTypes: ["lunch", "dinner"], diet: ["classic", "vegetarian", "no-pork"], equipment: [], prepMinutes: 10 };

test("restriction matching uses exact culinary names and aliases, never typo tolerance or substrings", () => {
  assert.deepEqual(resolveIngredientExclusions([" POIRE ", "pear", "Courgette"]), { ids: ["pear", "zucchini"], unknown: [] });
  assert.deepEqual(resolveIngredientExclusions(["courgete", "po", "de"]), { ids: [], unknown: ["courgete", "po", "de"] });
  assert.equal(hasAllergyConflict(["poire"], [], [pear]), true);
  assert.equal(hasAllergyConflict(["poire"], [], [leek]), false);
  assert.equal(hasIngredientExclusionConflict(["poire"], [leek]), false);
  assert.deepEqual(unsupportedAllergies(["Lactose", "œufs", "ŒUFS", "Poire", "courgete"]), ["courgete"]);
});

test("unknown imported restrictions block planner, manual recipe eligibility and structured shopping", () => {
  for (const field of ["allergies", "excludedIngredientIds"]) {
    const profile = { ...DEFAULT_PROFILE, [field]: ["aliment-inconnu-audit"] };
    assert.equal(recipeIsAllowed(recipe, profile), false, field);
    assert.equal(shoppingConflict(recipe, profile), true, field);
    const report = diagnoseRecipeCompatibility([recipe], profile, { mealType: "lunch" });
    assert.equal(report.compatibleCount, 0);
    assert.deepEqual(report.unresolvedRestrictions, ["aliment-inconnu-audit"]);
    assert.throws(() => generateWeeklyPlan([recipe], profile), (error) => error.diagnostic?.unresolvedRestrictions?.includes("aliment-inconnu-audit"));
  }
});

test("ingredient allergies apply to optional ingredients and free shopping", () => {
  const profile = { ...DEFAULT_PROFILE, allergies: ["poire"] };
  const optional = { ...recipe, ingredients: [{ ...pear, optional: true }] };
  assert.equal(recipeIsAllowed(optional, profile), false);
  assert.equal(shoppingConflict(optional, profile), true);
  const safe = { ...recipe, ingredients: [leek] };
  assert.equal(recipeIsAllowed(safe, profile), true);
  assert.equal(shoppingConflict(safe, profile), false);
});

test("an explicit custom registry resolves custom ingredients consistently throughout generation", () => {
  const customIngredient = { ...pear, id: "ingredient-audit-exact", name: "Ingrédient audit exact" };
  const customRecipe = { ...recipe, id: "perso-custom-identity", ingredients: [customIngredient] };
  const safeRecipes = Array.from({ length: 18 }, (_, index) => ({ ...recipe, id: `perso-safe-${index}`, ingredients: [leek] }));
  const profile = { ...DEFAULT_PROFILE, allergies: [customIngredient.name], excludedIngredientIds: [customIngredient.id] };
  assert.deepEqual(resolveIngredientExclusions([customIngredient.name], [customIngredient]), { ids: [customIngredient.id], unknown: [] });
  const plan = generateWeeklyPlan([customRecipe, ...safeRecipes], profile, { seed: "custom-restriction" });
  assert.equal(plan.meals.some((meal) => meal.recipeId === customRecipe.id), false);
});
