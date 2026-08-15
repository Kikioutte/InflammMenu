import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "../src/domain.ts";
import {
  generateWeeklyPlan,
  recipeForm,
  recipeIsAllowedForSlot,
  summarizePlan,
} from "../src/engine.ts";
import recipes from "../src/data/planner-recipes.json" with { type: "json" };

const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const startsOn = "2026-08-10";
const season = "summer";

function assertSafePlan(plan, profile, label) {
  assert.equal(plan.meals.length, profile.mealsPerDay === 3 ? 21 : 14, `${label}: nombre de repas incorrect`);
  assert.equal(new Set(plan.meals.map((meal) => meal.recipeId)).size, plan.meals.length, `${label}: recette répétée`);
  for (const meal of plan.meals) {
    const recipe = byId.get(meal.recipeId);
    assert.ok(recipe, `${label}: recette ${meal.recipeId} introuvable`);
    assert.ok(recipe.mealTypes.includes(meal.mealType), `${label}: type de repas incompatible`);
    assert.ok(recipeIsAllowedForSlot(recipe, profile, meal.dayIndex), `${label}: filtre strict contourné par ${recipe.id}`);
  }
}

function repeatedDailyFormCount(plan) {
  return Array.from({ length: 7 }, (_, dayIndex) => {
    const forms = plan.meals
      .filter((meal) => meal.dayIndex === dayIndex && !meal.skipped)
      .map((meal) => recipeForm(byId.get(meal.recipeId)))
      .filter((form) => form !== "other");
    return new Set(forms).size < forms.length ? 1 : 0;
  }).reduce((dayTotal, repeated) => dayTotal + repeated, 0);
}

const plans = Array.from({ length: 100 }, (_, index) => generateWeeklyPlan(recipes, DEFAULT_PROFILE, {
  seed: `diversite-${index}`,
  startsOn,
  season,
}));
const signatures = new Set(plans.map((plan) => plan.meals.map((meal) => meal.recipeId).join(",")));
const touchedRecipes = new Set(plans.flatMap((plan) => plan.meals.map((meal) => meal.recipeId)));
const repeatedDailyForms = plans.reduce((total, plan) => total + repeatedDailyFormCount(plan), 0);

assert.ok(signatures.size >= 60, `Diversité insuffisante : ${signatures.size} semaines distinctes sur 100`);
assert.ok(touchedRecipes.size >= 120, `Catalogue trop peu exploré : ${touchedRecipes.size} recettes touchées sur 100 semaines`);
assert.equal(repeatedDailyForms, 0, `Journées monotones évitables : ${repeatedDailyForms} répétitions de forme sur 700 journées`);
for (const [index, plan] of plans.entries()) {
  assertSafePlan(plan, DEFAULT_PROFILE, `profil classique, graine ${index}`);
  assert.ok(plan.estimatedCost <= DEFAULT_PROFILE.weeklyBudget, `profil classique, graine ${index}: budget dépassé`);
  const summary = summarizePlan(plan, recipes, DEFAULT_PROFILE);
  assert.ok(summary.legumeMeals >= DEFAULT_PROFILE.weeklyTargets.legumeMeals, `profil classique, graine ${index}: objectif légumineuses manqué`);
  assert.ok(summary.fishMeals >= DEFAULT_PROFILE.weeklyTargets.fishMeals, `profil classique, graine ${index}: objectif poisson manqué`);
}

const stableOptions = { seed: "graine-stable", startsOn, season };
assert.deepEqual(
  generateWeeklyPlan(recipes, DEFAULT_PROFILE, stableOptions),
  generateWeeklyPlan(recipes, DEFAULT_PROFILE, stableOptions),
  "Une même graine doit produire exactement la même semaine",
);

const safetyProfiles = {
  vegetarien: {
    ...DEFAULT_PROFILE,
    diet: "vegetarian",
    weeklyTargets: { legumeMeals: 2, fishMeals: 0 },
  },
  sansGluten: {
    ...DEFAULT_PROFILE,
    allergies: ["gluten"],
  },
  fortementRestreint: {
    ...DEFAULT_PROFILE,
    diet: "vegetarian",
    allergies: ["gluten", "lait", "fruits-a-coque"],
    equipment: ["hob", "oven", "microwave", "blender"],
    weeklyTargets: { legumeMeals: 1, fishMeals: 0 },
  },
};

for (const [label, profile] of Object.entries(safetyProfiles)) {
  for (let index = 0; index < 10; index += 1) {
    const plan = generateWeeklyPlan(recipes, profile, {
      seed: `${label}-${index}`,
      startsOn,
      season,
    });
    assertSafePlan(plan, profile, `${label}, graine ${index}`);
    assert.equal(repeatedDailyFormCount(plan), 0, `${label}, graine ${index}: forme quotidienne répétée`);
    assert.ok(plan.estimatedCost <= profile.weeklyBudget, `${label}, graine ${index}: budget dépassé`);
  }
}

console.log(
  `Générateur diversifié : ${signatures.size} semaines distinctes, ${touchedRecipes.size} recettes touchées et ${repeatedDailyForms} journées monotones sur 700, filtres stricts vérifiés.`,
);
