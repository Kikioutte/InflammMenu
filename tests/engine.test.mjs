import assert from "node:assert/strict";
import test from "node:test";
const engine = await import("../src/engine.ts");

const nutrition = {
  calories: 400,
  protein: 18,
  fiber: 8,
  estimated: true,
  note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif.",
};

function recipe(index, overrides = {}) {
  const tags = index < 2 ? ["poisson"] : index < 4 ? ["légumineuses"] : ["céréales-complètes"];
  const fish = index < 2;
  return {
    id: `recipe-${index}`,
    title: `Recette ${index}`,
    mealTypes: ["lunch", "dinner"],
    diet: fish ? ["classic", "no-pork"] : ["classic", "vegetarian", "no-pork"],
    prepMinutes: 20,
    costPerPortion: 2,
    seasons: ["summer"],
    equipment: ["hob"],
    allergens: [],
    tags,
    ingredients: [
      {
        id: `ingredient-${index}`,
        name: `Ingrédient ${index}`,
        quantity: 100,
        unit: "g",
        category: fish ? "meat-fish" : "grocery",
      },
      {
        id: "huile-olive",
        name: "Huile d’olive",
        quantity: 5,
        unit: "ml",
        category: "grocery",
      },
    ],
    nutrition,
    description: "Recette de test.",
    steps: ["Préparer."],
    conservation: "À consommer rapidement.",
    image: "/test.png",
    ...overrides,
  };
}

const catalogue = Array.from({ length: 22 }, (_, index) => recipe(index));
const profile = {
  people: 1,
  mealsPerDay: 2,
  weeklyBudget: 40,
  maxPrepMinutes: 30,
  allergies: [],
  excludedIngredientIds: [],
  diet: "classic",
  equipment: ["hob"],
};

test("generation is deterministic, creates 14 unique slots, and meets available targets", () => {
  const first = engine.generateWeeklyPlan(catalogue, profile, { seed: "stable", startsOn: "2026-08-03" });
  const second = engine.generateWeeklyPlan(catalogue, profile, { seed: "stable", startsOn: "2026-08-03" });

  assert.deepEqual(first, second);
  assert.equal(first.meals.length, 14);
  assert.equal(new Set(first.meals.map((meal) => meal.recipeId)).size, 14);
  assert.deepEqual(
    first.meals.reduce((counts, meal) => ({ ...counts, [meal.dayIndex]: (counts[meal.dayIndex] ?? 0) + 1 }), {}),
    { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
  );

  const summary = engine.summarizePlan(first, catalogue, profile);
  assert.ok(summary.legumeMeals >= 2);
  assert.ok(summary.fishMeals >= 2);
  assert.ok(summary.withinBudget);
});

test("allergies, exclusions, diet, time, and equipment are strict filters", () => {
  const special = [
    recipe(100, { allergens: ["arachides"] }),
    recipe(101, { ingredients: [{ id: "céleri", name: "Céleri", quantity: 50, unit: "g", category: "fruit-vegetable" }] }),
    recipe(102, { prepMinutes: 50 }),
    recipe(103, { equipment: ["oven"] }),
    recipe(104, { diet: ["classic"] }),
  ];
  const vegetarianCatalogue = catalogue.slice(2).concat(special);
  const vegetarianProfile = {
    ...profile,
    diet: "vegetarian",
    allergies: ["ARACHIDES"],
    excludedIngredientIds: ["céleri"],
  };
  const plan = engine.generateWeeklyPlan(vegetarianCatalogue, vegetarianProfile, { seed: 7 });
  const ids = new Set(plan.meals.map((meal) => meal.recipeId));

  for (const forbidden of ["recipe-100", "recipe-101", "recipe-102", "recipe-103", "recipe-104"]) {
    assert.equal(ids.has(forbidden), false);
  }
  for (const meal of plan.meals) {
    assert.ok(vegetarianCatalogue.find((item) => item.id === meal.recipeId).diet.includes("vegetarian"));
  }
});

test("budget is best-effort and chooses a feasible inexpensive menu", () => {
  const mixedPrices = catalogue.map((item, index) => ({
    ...item,
    costPerPortion: index < 8 ? 8 : 1,
  }));
  // Keep two affordable target recipes available as well.
  mixedPrices[0] = { ...mixedPrices[0], costPerPortion: 1 };
  mixedPrices[1] = { ...mixedPrices[1], costPerPortion: 1 };
  mixedPrices[2] = { ...mixedPrices[2], costPerPortion: 1 };
  mixedPrices[3] = { ...mixedPrices[3], costPerPortion: 1 };
  const plan = engine.generateWeeklyPlan(mixedPrices, { ...profile, weeklyBudget: 20 }, { seed: "budget" });
  assert.ok(plan.estimatedCost <= 20);
});

test("shopping list scales and aggregates ingredients, including pantry state", () => {
  const oneRecipe = recipe(50);
  const plan = {
    id: "manual",
    startsOn: "2026-08-03",
    generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: profile,
    meals: [
      { id: "a", dayIndex: 0, mealType: "lunch", recipeId: oneRecipe.id, portions: 2, source: "manual" },
      { id: "b", dayIndex: 1, mealType: "dinner", recipeId: oneRecipe.id, portions: 1, source: "manual" },
    ],
    estimatedCost: 6,
    version: 1,
  };
  const list = engine.buildShoppingList(plan, [oneRecipe], profile, ["huile-olive"]);
  const main = list.find((item) => item.ingredientId === "ingredient-50");
  const oil = list.find((item) => item.ingredientId === "huile-olive");

  assert.equal(main.quantity, 300);
  assert.equal(oil.quantity, 15);
  assert.equal(oil.inPantry, true);
  assert.equal(oil.checked, true);
  assert.equal(engine.scaleIngredients(oneRecipe, 2)[0].quantity, 200);
});

test("replacement candidates are safe and replacing updates only the requested meal", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "replace" });
  const slot = plan.meals[0];
  const candidates = engine.getReplacementCandidates(plan, slot.id, catalogue, profile, "moins cher");
  assert.ok(candidates.length > 0);
  const replacement = candidates[0];
  const updated = engine.replacePlannedMeal(plan, slot.id, replacement, catalogue);

  assert.notEqual(updated, plan);
  assert.equal(plan.meals[0].recipeId, slot.recipeId);
  assert.equal(updated.meals[0].recipeId, replacement.id);
  assert.equal(updated.meals[0].source, "replacement");
  assert.deepEqual(updated.meals.slice(1), plan.meals.slice(1));
});
