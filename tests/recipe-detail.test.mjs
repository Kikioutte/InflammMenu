import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROFILE } from "../src/domain.ts";
import { DEFAULT_APP_STATE } from "../src/storage.ts";
import { RECIPES } from "../src/recipes.ts";
import { generateWeeklyPlan, planLeftover, ingredientsForPlannedMeal, buildShoppingList, setMealPortions } from "../src/engine.ts";
import { mealDetailTarget, matchingDetailMeal, preparationPortions } from "../src/app/meal-detail.ts";
import { recipeRating, withRecipeRating, withToggledFavorite } from "../src/app/recipe-preferences.ts";

const profile = { ...DEFAULT_PROFILE, weeklyBudget: 200 };
const plan = generateWeeklyPlan(RECIPES, profile, { seed: "detail-regression", startsOn: "2026-09-28" });
const source = plan.meals[0];
const target = mealDetailTarget(plan, source, "generation-1");

test("une fiche garde la cible exacte de la semaine et de la génération ouvertes", () => {
  assert.equal(matchingDetailMeal(plan, target, "generation-1"), source);
  for (const changedPlan of [null, { ...plan, id: `${plan.id}-new` }, { ...plan, startsOn: "2026-10-05" }, { ...plan, generatedAt: "2026-10-02T12:00:00Z" }, { ...plan, meals: plan.meals.filter((meal) => meal.id !== source.id) }]) {
    assert.equal(matchingDetailMeal(changedPlan, target, "generation-1"), null);
  }
  assert.equal(matchingDetailMeal(plan, target, "generation-2"), null);
});

test("un créneau réutilisé pour une autre recette ou des restes ne réactive pas une ancienne fiche", () => {
  for (const change of [{ recipeId: RECIPES.find((recipe) => recipe.id !== source.recipeId).id }, { dayIndex: source.dayIndex + 1 }, { mealType: "breakfast" }, { leftoverOf: "another-slot" }]) {
    const changed = { ...plan, meals: plan.meals.map((meal) => meal.id === source.id ? { ...meal, ...change } : meal) };
    assert.equal(matchingDetailMeal(changed, target, "generation-1"), null);
  }
});

test("les quantités et substitutions de la même recette peuvent s’actualiser sans perdre la cible", () => {
  const changed = { ...source, portions: 5, completed: true, locked: true, substitutions: [{ ingredientId: "cream", substitutionId: "cream-yogurt" }] };
  const updated = { ...plan, meals: plan.meals.map((meal) => meal.id === source.id ? changed : meal) };
  assert.equal(matchingDetailMeal(updated, target, "generation-1"), changed);
});

test("les ingrédients de préparation couvrent tous les restes, sans deuxième ajout aux courses", () => {
  const targets = plan.meals.filter((meal) => meal.mealType === source.mealType && meal.dayIndex > source.dayIndex && meal.dayIndex <= source.dayIndex + 2);
  let doubled = planLeftover(plan, source.id, targets[0].id, RECIPES);
  doubled = planLeftover(doubled, source.id, targets[1].id, RECIPES);
  doubled = setMealPortions(doubled, targets[0].id, 3, RECIPES);
  doubled = setMealPortions(doubled, targets[1].id, 4, RECIPES);
  const snapshot = structuredClone(doubled);
  const shoppingBefore = buildShoppingList(doubled, RECIPES);
  const total = preparationPortions(doubled, source);
  assert.equal(total, source.portions + 3 + 4);
  assert.ok(total > 8, "le plafond des portions par repas ne réduit pas le lot complet");
  const recipe = RECIPES.find((item) => item.id === source.recipeId);
  const prepared = ingredientsForPlannedMeal(recipe, source, total);
  const batches = doubled.meals.filter((meal) => meal.id === source.id || meal.leftoverOf === source.id).map((meal) => ingredientsForPlannedMeal(recipe, meal));
  for (let index = 0; index < prepared.length; index++) {
    assert.ok(Math.abs(prepared[index].quantity - batches.reduce((sum, batch) => sum + batch[index].quantity, 0)) < 0.02);
  }
  assert.deepEqual(doubled, snapshot);
  assert.deepEqual(buildShoppingList(doubled, RECIPES), shoppingBefore);
  assert.equal(preparationPortions(doubled, doubled.meals.find((meal) => meal.id === targets[0].id)), 3);
  const skipped = { ...doubled, meals: doubled.meals.map((meal) => meal.id === targets[1].id ? { ...meal, skipped: true } : meal) };
  assert.equal(preparationPortions(skipped, source), source.portions + 3);
});

for (const from of ["loved", "neutral", "meh", "avoided"]) {
  for (const to of ["loved", "neutral", "meh", "avoided"]) {
    test(`la préférence ${from} → ${to} reste exclusive et préserve les autres recettes`, () => {
      const initial = withRecipeRating(withRecipeRating(structuredClone(DEFAULT_APP_STATE), "another-recipe", "avoided"), source.recipeId, from);
      const updated = withRecipeRating(initial, source.recipeId, to);
      assert.equal(recipeRating(updated, source.recipeId), to);
      assert.equal(recipeRating(updated, "another-recipe"), "avoided");
      const membership = [updated.favoriteRecipeIds, updated.profile.dislikedRecipeIds, updated.profile.softDislikedRecipeIds].filter((ids) => ids.includes(source.recipeId));
      assert.equal(membership.length, to === "neutral" ? 0 : 1);
      assert.equal(recipeRating(initial, source.recipeId), from);
    });
  }
  test(`le cœur depuis ${from} applique la même transition exclusive`, () => {
    const initial = withRecipeRating(structuredClone(DEFAULT_APP_STATE), source.recipeId, from);
    const updated = withToggledFavorite(initial, source.recipeId);
    assert.equal(recipeRating(updated, source.recipeId), from === "loved" ? "neutral" : "loved");
    assert.ok(!updated.profile.dislikedRecipeIds.includes(source.recipeId));
    assert.ok(!updated.profile.softDislikedRecipeIds.includes(source.recipeId));
  });
}

test("le cœur corrige aussi un ancien état contradictoire", () => {
  const conflicting = structuredClone(DEFAULT_APP_STATE);
  conflicting.favoriteRecipeIds = [source.recipeId];
  conflicting.profile.dislikedRecipeIds = [source.recipeId];
  conflicting.profile.softDislikedRecipeIds = [source.recipeId];
  const fixed = withToggledFavorite(conflicting, source.recipeId);
  assert.equal(recipeRating(fixed, source.recipeId), "loved");
  assert.deepEqual(fixed.profile.dislikedRecipeIds, []);
  assert.deepEqual(fixed.profile.softDislikedRecipeIds, []);
});
