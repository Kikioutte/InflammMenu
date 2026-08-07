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

test("common French allergy aliases map to the canonical regulated families", () => {
  const aliasCatalogue = Array.from({ length: 17 }, (_, index) => recipe(index + 200, {
    allergens: index === 0 ? ["fruits-a-coque"] : index === 1 ? ["lait"] : index === 2 ? ["oeuf"] : [],
  }));
  const plan = engine.generateWeeklyPlan(aliasCatalogue, {
    ...profile,
    allergies: ["noix", "lactose", "œufs"],
  }, { seed: "allergen-aliases" });
  const ids = new Set(plan.meals.map((meal) => meal.recipeId));
  assert.equal(ids.has("recipe-200"), false);
  assert.equal(ids.has("recipe-201"), false);
  assert.equal(ids.has("recipe-202"), false);
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

test("shopping list scales and aggregates ingredients, keeping pantry distinct from checked", () => {
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
  const list = engine.buildShoppingList(plan, [oneRecipe], {
    checkedShoppingItemIds: ["ingredient-50:g"],
    pantryIngredientIds: ["huile-olive"],
  });
  const main = list.find((item) => item.ingredientId === "ingredient-50");
  const oil = list.find((item) => item.ingredientId === "olive-oil");

  assert.deepEqual(main.amounts, [{ quantity: 300, unit: "g" }]);
  assert.deepEqual(oil.amounts, [{ quantity: 15, unit: "ml" }]);
  assert.equal(main.checked, true);
  assert.equal(main.inPantry, false);
  assert.equal(oil.checked, false);
  assert.equal(oil.inPantry, true);
  assert.equal(engine.scaleIngredients(oneRecipe, 2)[0].quantity, 200);
});

test("reviewed aliases and spoon units merge into one canonical shopping item", () => {
  const first = recipe(60, { ingredients: [{ id: "catalog-carotte", name: "carotte", quantity: 1, unit: "c_soupe", category: "fruit-vegetable" }] });
  const second = recipe(61, { ingredients: [{ id: "carotte", name: "carottes", quantity: 3, unit: "c_cafe", category: "fruit-vegetable" }] });
  const plan = {
    id: "aliases", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile,
    meals: [
      { id: "a", dayIndex: 0, mealType: "lunch", recipeId: first.id, portions: 1, source: "manual" },
      { id: "b", dayIndex: 1, mealType: "dinner", recipeId: second.id, portions: 1, source: "manual" },
    ],
    estimatedCost: 4, version: 1,
  };
  const list = engine.buildShoppingList(plan, [first, second]);
  assert.equal(list.length, 1);
  assert.equal(list[0].ingredientId, "carrot");
  assert.deepEqual(list[0].amounts, [{ quantity: 30, unit: "ml" }]);
});

test("mixed units remain grouped when no reviewed conversion exists", () => {
  const first = recipe(70, { ingredients: [{ id: "ingredient-mixte", name: "Légume test", quantity: 500, unit: "g", category: "fruit-vegetable" }] });
  const second = recipe(71, { ingredients: [{ id: "ingredient-mixte", name: "Légume test", quantity: 2, unit: "piece", category: "fruit-vegetable" }] });
  const plan = {
    id: "mixed", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile,
    meals: [
      { id: "a", dayIndex: 0, mealType: "lunch", recipeId: first.id, portions: 1, source: "manual" },
      { id: "b", dayIndex: 1, mealType: "dinner", recipeId: second.id, portions: 1, source: "manual" },
    ],
    estimatedCost: 4, version: 1,
  };
  const [item] = engine.buildShoppingList(plan, [first, second]);
  assert.deepEqual(item.amounts, [{ quantity: 500, unit: "g" }, { quantity: 2, unit: "piece" }]);
  assert.equal(item.purchaseSuggestion, "500 g + 2 pièces");
});

test("reviewed piece weights produce practical rounded purchase guidance without losing exact amounts", () => {
  const carrots = recipe(72, { ingredients: [
    { id: "carotte", name: "carottes", quantity: 220, unit: "g", category: "fruit-vegetable" },
    { id: "catalog-carotte", name: "carotte", quantity: 1.2, unit: "piece", category: "fruit-vegetable" },
  ] });
  const plan = {
    id: "pieces", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile,
    meals: [{ id: "a", dayIndex: 0, mealType: "lunch", recipeId: carrots.id, portions: 1, source: "manual" }],
    estimatedCost: 2, version: 1,
  };
  const [item] = engine.buildShoppingList(plan, [carrots]);
  assert.deepEqual(item.amounts, [{ quantity: 220, unit: "g" }, { quantity: 1.2, unit: "piece" }]);
  assert.equal(item.purchaseSuggestion, "4 pièces");
});

test("only explicitly flagged pantry staples disappear from shopping", () => {
  const drinks = recipe(73, { ingredients: [
    { id: "eau", name: "eau", quantity: 250, unit: "ml", category: "beverage", pantryStaple: true },
    { id: "catalog-eau-de-coco", name: "eau de coco", quantity: 200, unit: "ml", category: "beverage" },
    { id: "eau-rose-culinaire", name: "eau de rose alimentaire", quantity: 10, unit: "ml", category: "grocery" },
  ] });
  const plan = {
    id: "water", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile,
    meals: [{ id: "a", dayIndex: 0, mealType: "lunch", recipeId: drinks.id, portions: 1, source: "manual" }],
    estimatedCost: 2, version: 1,
  };
  const ids = engine.buildShoppingList(plan, [drinks]).map((item) => item.ingredientId);
  assert.deepEqual(ids.sort(), ["catalog-eau-de-coco", "eau-rose-culinaire"]);
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

test("locked meals keep their slot, recipe and portions when the week is generated again", () => {
  const first = engine.generateWeeklyPlan(catalogue, profile, { seed: "lock-a" });
  const locked = engine.setPlannedMealLock(
    engine.setPlannedMealLock(first, first.meals[0].id, true),
    first.meals[3].id,
    true,
  );

  assert.deepEqual(
    engine.lockedMealsOf(locked).map((meal) => meal.id),
    [first.meals[0].id, first.meals[3].id],
  );

  const next = engine.generateWeeklyPlan(catalogue, profile, {
    seed: "lock-b",
    lockedMeals: engine.lockedMealsOf(locked),
  });

  assert.equal(next.meals.length, first.meals.length);
  for (const index of [0, 3]) {
    assert.equal(next.meals[index].id, first.meals[index].id);
    assert.equal(next.meals[index].recipeId, first.meals[index].recipeId);
    assert.equal(next.meals[index].mealType, first.meals[index].mealType);
    assert.equal(next.meals[index].dayIndex, first.meals[index].dayIndex);
    assert.equal(next.meals[index].portions, profile.people);
    assert.equal(next.meals[index].locked, true);
  }
  assert.equal(next.meals.filter((meal) => meal.locked).length, 2);

  const recipeIds = next.meals.map((meal) => meal.recipeId);
  assert.equal(new Set(recipeIds).size, recipeIds.length, "aucune recette ne doit être dupliquée");
});

test("locking every slot reproduces the same week", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "lock-all" });
  const lockedMeals = plan.meals.map((meal) => ({ ...meal, locked: true }));
  const next = engine.generateWeeklyPlan(catalogue, profile, { seed: "other", lockedMeals });

  assert.deepEqual(
    next.meals.map((meal) => meal.recipeId),
    plan.meals.map((meal) => meal.recipeId),
  );
  assert.equal(next.estimatedCost, plan.estimatedCost);
});

test("locked meals are ignored when they no longer fit the requested slots", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "lock-filter" });
  const lockedMeals = [
    { ...plan.meals[0], mealType: "breakfast" },
    { ...plan.meals[1], recipeId: "recipe-unknown" },
    { ...plan.meals[2], dayIndex: 9 },
  ];
  const next = engine.generateWeeklyPlan(catalogue, profile, { seed: "lock-filter-2", lockedMeals });

  assert.equal(next.meals.filter((meal) => meal.locked).length, 0);
  assert.equal(next.meals.length, plan.meals.length);
});

test("the budget pass never swaps a locked meal", () => {
  const expensive = recipe(80, { costPerPortion: 40, tags: ["poisson"], mealTypes: ["lunch", "dinner"] });
  const pool = [...catalogue, expensive];
  const tightProfile = { ...profile, weeklyBudget: 1 };
  const base = engine.generateWeeklyPlan(pool, tightProfile, { seed: "budget-lock" });
  const withExpensive = engine.replacePlannedMeal(base, base.meals[0].id, expensive, pool);
  const lockedMeals = [{ ...withExpensive.meals[0], locked: true }];

  const next = engine.generateWeeklyPlan(pool, tightProfile, { seed: "budget-lock-2", lockedMeals });

  assert.equal(next.meals[0].recipeId, expensive.id);
  assert.ok(next.estimatedCost > tightProfile.weeklyBudget);
});

test("setPlannedMealLock leaves the source plan untouched and ignores unknown slots", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "lock-immutable" });
  const locked = engine.setPlannedMealLock(plan, plan.meals[2].id, true);

  assert.notEqual(locked, plan);
  assert.equal(plan.meals[2].locked, undefined);
  assert.equal(locked.meals[2].locked, true);
  assert.equal(engine.setPlannedMealLock(plan, "slot-inconnu", true), plan);
  assert.deepEqual(engine.lockedMealsOf(null), []);
});

test("a lock never overrides an allergy, a diet or the time limit", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "lock-safety" });
  const lockedPlan = engine.setPlannedMealLock(plan, plan.meals[0].id, true);
  const lockedRecipe = catalogue.find((item) => item.id === plan.meals[0].recipeId);
  const strictProfile = { ...profile, excludedIngredientIds: [lockedRecipe.ingredients[0].id] };

  assert.deepEqual(engine.preservableLockedMeals(lockedPlan, catalogue, strictProfile), []);
  assert.equal(engine.preservableLockedMeals(lockedPlan, catalogue, profile).length, 1);

  const next = engine.generateWeeklyPlan(catalogue, strictProfile, {
    seed: "lock-safety-2",
    lockedMeals: engine.lockedMealsOf(lockedPlan),
  });
  assert.ok(
    next.meals.every((meal) => {
      const recipe = catalogue.find((item) => item.id === meal.recipeId);
      return recipe.ingredients.every((ingredient) => ingredient.id !== lockedRecipe.ingredients[0].id);
    }),
    "aucune recette ne doit contenir l'ingrédient exclu",
  );
});

test("cooked meals are tracked per slot without touching the rest of the plan", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "cooked" });
  assert.deepEqual(engine.planProgress(plan), { completed: 0, total: 14, ratio: 0 });

  const cooked = engine.setPlannedMealCompleted(plan, plan.meals[1].id, true);
  assert.equal(plan.meals[1].completed, undefined, "le plan source reste inchangé");
  assert.equal(cooked.meals[1].completed, true);
  assert.deepEqual(cooked.meals[0], plan.meals[0]);
  assert.equal(engine.planProgress(cooked).completed, 1);
  assert.equal(engine.planProgress(cooked).ratio, 1 / 14);

  const undone = engine.setPlannedMealCompleted(cooked, plan.meals[1].id, false);
  assert.equal(undone.meals[1].completed, false);
  assert.equal(engine.planProgress(undone).completed, 0);

  assert.equal(engine.setPlannedMealCompleted(plan, "slot-inconnu", true), plan);
  assert.deepEqual(engine.planProgress(null), { completed: 0, total: 0, ratio: 0 });
});

test("replacing a cooked meal clears its cooked mark but keeps the rest", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "cooked-replace" });
  const cooked = engine.setPlannedMealCompleted(
    engine.setPlannedMealCompleted(plan, plan.meals[0].id, true),
    plan.meals[1].id,
    true,
  );
  const candidate = engine.getReplacementCandidates(cooked, cooked.meals[0].id, catalogue, profile)[0];
  const updated = engine.replacePlannedMeal(cooked, cooked.meals[0].id, candidate, catalogue);

  assert.equal(updated.meals[0].completed, false);
  assert.equal(updated.meals[1].completed, true);
  assert.equal(engine.planProgress(updated).completed, 1);
});

test("the shopping list renders as shareable text grouped by aisle", () => {
  const items = [
    { ingredientId: "carrot", name: "Carottes", category: "fruit-vegetable", amounts: [{ quantity: 500, unit: "g" }], purchaseSuggestion: "4 pièces", checked: false, inPantry: false },
    { ingredientId: "spinach", name: "Épinards", category: "fruit-vegetable", amounts: [{ quantity: 200, unit: "g" }], purchaseSuggestion: "200 g", checked: false, inPantry: false },
    { ingredientId: "lentils", name: "Lentilles", category: "grocery", amounts: [{ quantity: 300, unit: "g" }], purchaseSuggestion: "300 g", checked: false, inPantry: false },
    { ingredientId: "olive-oil", name: "Huile d’olive", category: "grocery", amounts: [{ quantity: 40, unit: "ml" }], purchaseSuggestion: "Petite quantité · à vérifier", checked: true, inPantry: false },
    { ingredientId: "salt", name: "Sel", category: "grocery", amounts: [{ quantity: 5, unit: "g" }], purchaseSuggestion: "5 g", checked: false, inPantry: true },
  ];
  const text = engine.formatShoppingListText(items, {
    week: "3–9 août",
    people: 2,
    categoryLabels: { "fruit-vegetable": "Fruits et légumes", grocery: "Épicerie" },
  });

  assert.match(text, /^Liste de courses — Inflamm’Menu\nSemaine du 3–9 août · 2 personnes/);
  assert.match(text, /FRUITS ET LÉGUMES\n- Carottes — 500 g \(4 pièces\)\n- Épinards — 200 g\n/);
  assert.match(text, /ÉPICERIE\n- Lentilles — 300 g\n/);
  assert.doesNotMatch(text, /Huile d’olive/, "les articles cochés ne sont pas listés");
  assert.doesNotMatch(text, /Sel/, "les articles en réserve ne sont pas listés");
  assert.match(text, /3 articles à acheter\./);
  assert.match(text, /2 articles déjà cochés ou en réserve\./);
  assert.match(text, /Quantités et prix indicatifs/);
});

test("an entirely checked shopping list still produces a readable text", () => {
  const text = engine.formatShoppingListText(
    [{ ingredientId: "carrot", name: "Carottes", category: "fruit-vegetable", amounts: [{ quantity: 500, unit: "g" }], purchaseSuggestion: "4 pièces", checked: true, inPantry: false }],
    {},
  );
  assert.match(text, /Rien à acheter : tout est coché ou déjà en réserve\./);
  assert.doesNotMatch(text, /Semaine du/);
  assert.equal(engine.formatShoppingListText([], {}).includes("Rien à acheter"), true);
});

test("the exported text mirrors the list built for the current plan", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "export" });
  const items = engine.buildShoppingList(plan, catalogue);
  const text = engine.formatShoppingListText(items, { week: "3–9 août", people: profile.people });

  for (const item of items) assert.ok(text.includes(item.name), `${item.name} doit apparaître`);
  assert.match(text, new RegExp(`${items.length} articles à acheter`));
});

test("an archived week can be replayed for another date without stale marks", () => {
  const archived = engine.generateWeeklyPlan(catalogue, profile, { seed: "archive", startsOn: "2026-07-06" });
  const marked = engine.setPlannedMealLock(
    engine.setPlannedMealCompleted(archived, archived.meals[0].id, true),
    archived.meals[1].id,
    true,
  );

  const report = engine.inspectPlanReplay(marked, catalogue, profile);
  assert.deepEqual(report, { blockedMeals: [], missingSlots: 0, canReplay: true });

  const restored = engine.restorePlan(marked, catalogue, profile, {
    startsOn: "2026-08-03",
    generatedAt: "2026-08-03T09:00:00.000Z",
  });

  assert.equal(restored.startsOn, "2026-08-03");
  assert.equal(restored.generatedAt, "2026-08-03T09:00:00.000Z");
  assert.notEqual(restored.id, archived.id);
  assert.deepEqual(
    restored.meals.map((meal) => meal.recipeId),
    archived.meals.map((meal) => meal.recipeId),
  );
  assert.ok(restored.meals.every((meal) => meal.completed === false && meal.locked === false));
  assert.ok(restored.meals.every((meal) => meal.portions === profile.people));
  assert.equal(restored.estimatedCost, archived.estimatedCost);
  assert.equal(engine.planProgress(restored).completed, 0);
  assert.equal(marked.meals[0].completed, true, "la semaine archivée reste intacte");
});

test("replaying is refused when the profile no longer accepts the archived meals", () => {
  const archived = engine.generateWeeklyPlan(catalogue, profile, { seed: "archive-blocked" });
  const blockedRecipe = catalogue.find((item) => item.id === archived.meals[0].recipeId);
  const strictProfile = { ...profile, excludedIngredientIds: [blockedRecipe.ingredients[0].id] };

  const report = engine.inspectPlanReplay(archived, catalogue, strictProfile);
  assert.equal(report.canReplay, false);
  assert.ok(report.blockedMeals.length >= 1);
  assert.equal(report.missingSlots, 0);
  assert.deepEqual(engine.inspectPlanReplay(null, catalogue, profile), { blockedMeals: [], missingSlots: 0, canReplay: false });
});

test("replaying is refused when the archived week misses the newly requested meals", () => {
  const archived = engine.generateWeeklyPlan(catalogue, profile, { seed: "archive-missing" });
  const threeMeals = { ...profile, mealsPerDay: 3 };

  const report = engine.inspectPlanReplay(archived, catalogue, threeMeals);
  assert.equal(report.canReplay, false);
  assert.equal(report.missingSlots, 7, "les 7 petits-déjeuners manquent");

  const twoMealsAgain = engine.inspectPlanReplay(archived, catalogue, profile);
  assert.equal(twoMealsAgain.canReplay, true);
});

test("declared allergens are merged, normalized and deduplicated per recipe", () => {
  const dish = recipe(90, {
    allergens: ["Gluten", "poisson"],
    ingredients: [
      { id: "pain-complet", name: "Pain complet", quantity: 80, unit: "g", category: "bakery", allergens: ["gluten"] },
      { id: "noix", name: "Noix", quantity: 20, unit: "g", category: "grocery", allergens: ["Noix", "amandes"] },
      { id: "courgette", name: "Courgette", quantity: 100, unit: "g", category: "fruit-vegetable" },
    ],
  });

  assert.deepEqual(engine.recipeAllergens(dish), ["fruits-a-coque", "gluten", "poisson"]);
  assert.deepEqual(engine.recipeAllergens(recipe(91, { allergens: [], ingredients: [{ id: "riz", name: "Riz", quantity: 60, unit: "g", category: "grocery" }] })), []);
});

test("ingredient-level allergens still exclude a recipe from a generated week", () => {
  const hidden = recipe(92, {
    allergens: [],
    ingredients: [{ id: "beurre-cacahuete", name: "Beurre de cacahuète", quantity: 20, unit: "g", category: "grocery", allergens: ["cacahuetes"] }],
  });
  const allergicProfile = { ...profile, allergies: ["arachides"] };
  const plan = engine.generateWeeklyPlan([...catalogue, hidden], allergicProfile, { seed: "allergen" });

  assert.ok(plan.meals.every((meal) => meal.recipeId !== hidden.id));
});

test("meal cost follows the number of portions", () => {
  const dish = recipe(93, { costPerPortion: 3.25 });
  assert.equal(engine.mealCost(dish, 2), 6.5);
  assert.equal(engine.mealCost(dish, 1), 3.25);
  assert.equal(engine.mealCost(dish, 0), 0);
  assert.equal(engine.mealCost(dish, -3), 0);

  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "cost" });
  const total = plan.meals.reduce((sum, meal) => {
    const item = catalogue.find((entry) => entry.id === meal.recipeId);
    return sum + engine.mealCost(item, meal.portions);
  }, 0);
  assert.equal(Math.round(total * 100) / 100, plan.estimatedCost);
});

test("only rest times worth planning ahead are signalled", () => {
  assert.equal(engine.advancePrepFor(recipe(100)), null);
  assert.equal(engine.advancePrepFor(recipe(101, { restMinutes: 0 })), null);
  assert.equal(engine.advancePrepFor(recipe(102, { restMinutes: 15 })), null, "un repos court reste dans la session");
  assert.deepEqual(engine.advancePrepFor(recipe(103, { restMinutes: 60 })), { minutes: 60, level: "same-day" });
  assert.deepEqual(engine.advancePrepFor(recipe(104, { restMinutes: 239 })), { minutes: 239, level: "same-day" });
  assert.deepEqual(engine.advancePrepFor(recipe(105, { restMinutes: 240 })), { minutes: 240, level: "day-before" });
  assert.deepEqual(engine.advancePrepFor(recipe(106, { restMinutes: 10_080 })), { minutes: 10_080, level: "day-before" });
});

test("rest time never counts against the active time budget", () => {
  const slow = recipe(107, { prepMinutes: 10, restMinutes: 480 });
  const pool = [...catalogue, slow];
  const strictProfile = { ...profile, maxPrepMinutes: 12 };

  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "rest" });
  const candidates = engine.getReplacementCandidates(plan, plan.meals[0].id, pool, strictProfile);

  assert.deepEqual(
    candidates.map((item) => item.id),
    [slow.id],
    "seule la recette au temps actif court est proposée, malgré ses 8 h de repos",
  );
  assert.equal(candidates[0].restMinutes, 480);
});

test("a plan stops being current once its week is over", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "expiry", startsOn: "2026-08-03" });

  assert.equal(engine.planDayOffset(plan, "2026-08-03"), 0);
  assert.equal(engine.planDayOffset(plan, "2026-08-09"), 6);
  assert.equal(engine.planDayOffset(plan, "2026-08-10"), 7);
  assert.equal(engine.planDayOffset(plan, "2026-08-01"), -2);

  assert.equal(engine.isPlanExpired(plan, "2026-08-03"), false);
  assert.equal(engine.isPlanExpired(plan, "2026-08-09"), false, "le dimanche appartient encore à la semaine");
  assert.equal(engine.isPlanExpired(plan, "2026-08-10"), true, "le lundi suivant, la semaine est terminée");
  assert.equal(engine.isPlanExpired(plan, "2026-09-15"), true);
  assert.equal(engine.isPlanExpired(null, "2026-08-10"), false);
});

test("plan day offsets ignore daylight saving shifts", () => {
  const spring = { ...engine.generateWeeklyPlan(catalogue, profile, { seed: "dst" }), startsOn: "2026-03-23" };
  assert.equal(engine.planDayOffset(spring, "2026-03-30"), 7);
  assert.equal(engine.isPlanExpired(spring, "2026-03-29"), false);
  assert.equal(engine.isPlanExpired(spring, "2026-03-30"), true);

  const autumn = { ...spring, startsOn: "2026-10-19" };
  assert.equal(engine.planDayOffset(autumn, "2026-10-26"), 7);
  assert.equal(engine.isPlanExpired(autumn, "2026-10-25"), false);
  assert.equal(engine.isPlanExpired(autumn, "2026-10-26"), true);
});

test("a disliked recipe is never generated, suggested or preserved again", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "dislike" });
  const unwanted = plan.meals[0].recipeId;
  const pickyProfile = { ...profile, dislikedRecipeIds: [unwanted] };

  const next = engine.generateWeeklyPlan(catalogue, pickyProfile, { seed: "dislike-2" });
  assert.ok(next.meals.every((meal) => meal.recipeId !== unwanted));

  const candidates = engine.getReplacementCandidates(next, next.meals[0].id, catalogue, pickyProfile);
  assert.ok(candidates.every((item) => item.id !== unwanted));

  const locked = engine.setPlannedMealLock(plan, plan.meals[0].id, true);
  assert.deepEqual(engine.preservableLockedMeals(locked, catalogue, pickyProfile), []);
  assert.equal(engine.inspectPlanReplay(plan, catalogue, pickyProfile).canReplay, false);
});

test("an absent dislike list keeps older profiles working", () => {
  const legacyProfile = { ...profile };
  delete legacyProfile.dislikedRecipeIds;
  const plan = engine.generateWeeklyPlan(catalogue, legacyProfile, { seed: "legacy-profile" });
  assert.equal(plan.meals.length, 14);
});

test("a recipe can be assigned to a compatible slot, safety filters included", () => {
  const plan = engine.generateWeeklyPlan(catalogue.slice(0, 20), profile, { seed: "assign" });
  const spare = catalogue.find((item) => !plan.meals.some((meal) => meal.recipeId === item.id));
  const slots = engine.assignableSlots(plan, spare, profile);

  assert.equal(slots.length, 14, "toutes les places lunch/dinner sont proposées");
  assert.deepEqual(slots[0], { dayIndex: 0, mealType: "lunch", taken: plan.meals[0].recipeId });

  const updated = engine.assignRecipeToSlot(plan, { dayIndex: 2, mealType: "dinner" }, spare, catalogue, profile);
  const target = updated.meals.find((meal) => meal.dayIndex === 2 && meal.mealType === "dinner");
  assert.equal(target.recipeId, spare.id);
  assert.equal(target.source, "manual");
  assert.equal(target.completed, false);
  assert.equal(new Set(updated.meals.map((meal) => meal.recipeId)).size, 14, "aucun doublon");
  assert.notEqual(updated.estimatedCost, undefined);
  assert.equal(plan.meals.find((meal) => meal.dayIndex === 2 && meal.mealType === "dinner").recipeId !== spare.id, true);
});

test("assigning refuses unsafe, mismatched, duplicated or unknown slots", () => {
  const plan = engine.generateWeeklyPlan(catalogue.slice(0, 20), profile, { seed: "assign-refuse" });
  const spare = catalogue.find((item) => !plan.meals.some((meal) => meal.recipeId === item.id));
  const breakfastOnly = recipe(120, { mealTypes: ["breakfast"] });
  const forbidden = recipe(121, { allergens: ["arachides"] });
  const allergicProfile = { ...profile, allergies: ["arachides"] };

  assert.throws(
    () => engine.assignRecipeToSlot(plan, { dayIndex: 0, mealType: "lunch" }, breakfastOnly, catalogue, profile),
    /ne correspond pas au type du repas/,
  );
  assert.throws(
    () => engine.assignRecipeToSlot(plan, { dayIndex: 0, mealType: "lunch" }, forbidden, catalogue, allergicProfile),
    /ne respecte pas votre profil/,
  );
  assert.throws(
    () => engine.assignRecipeToSlot(plan, { dayIndex: 9, mealType: "lunch" }, spare, catalogue, profile),
    /Ce créneau n'existe pas/,
  );
  assert.throws(
    () => engine.assignRecipeToSlot(plan, { dayIndex: 1, mealType: "lunch" }, catalogue.find((item) => item.id === plan.meals[0].recipeId), catalogue, profile),
    /déjà utilisée dans la semaine/,
  );
  assert.deepEqual(engine.assignableSlots(plan, forbidden, allergicProfile), []);
  assert.deepEqual(engine.assignableSlots(plan, breakfastOnly, profile), [], "aucun créneau petit-déjeuner en profil deux repas");
});

test("cooking in batch reuses a dish later without breaking the plan", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "leftover" });
  const source = plan.meals[0];
  const candidates = engine.leftoverCandidates(plan, source.id, catalogue);

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((meal) => meal.dayIndex - source.dayIndex > 0 && meal.dayIndex - source.dayIndex <= 2));

  const target = candidates[candidates.length - 1];
  const updated = engine.planLeftover(plan, source.id, target.id, catalogue);
  const leftover = updated.meals.find((meal) => meal.id === target.id);

  assert.equal(leftover.recipeId, source.recipeId);
  assert.equal(leftover.leftoverOf, source.id);
  assert.equal(leftover.source, "manual");
  assert.equal(leftover.locked, false);

  const summary = engine.summarizePlan(updated, catalogue, profile);
  assert.equal(summary.mealCount, 14);
  assert.equal(summary.cookingSessions, 13, "un repas de moins à cuisiner");

  const before = engine.buildShoppingList(plan, catalogue);
  const after = engine.buildShoppingList(updated, catalogue);
  const sourceIngredient = catalogue.find((item) => item.id === source.recipeId).ingredients[0].id;
  const quantityOf = (list) => list.find((item) => item.ingredientId === sourceIngredient)?.amounts[0].quantity ?? 0;
  assert.ok(quantityOf(after) > quantityOf(before), "les courses couvrent bien les deux repas");
});

test("leftovers refuse impossible slots and stay attached to their batch", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "leftover-refuse" });
  const source = plan.meals[0];
  const tooLate = plan.meals.find((meal) => meal.dayIndex - source.dayIndex > 2);

  assert.throws(() => engine.planLeftover(plan, source.id, tooLate.id, catalogue), /dans les 2 jours/);
  assert.throws(() => engine.planLeftover(plan, source.id, source.id, catalogue), /dans les 2 jours/);
  assert.throws(() => engine.planLeftover(plan, source.id, "slot-inconnu", catalogue), /n'existe pas/);

  const target = engine.leftoverCandidates(plan, source.id, catalogue)[0];
  const withLeftover = engine.planLeftover(plan, source.id, target.id, catalogue);
  assert.deepEqual(engine.leftoverCandidates(withLeftover, target.id, catalogue), [], "un reste ne se re-cuisine pas");
  assert.equal(engine.preservableLockedMeals(engine.setPlannedMealLock(withLeftover, target.id, true), catalogue, profile).length, 0);
});

test("replacing a batched meal keeps its leftover in sync", () => {
  const plan = engine.generateWeeklyPlan(catalogue.slice(0, 20), profile, { seed: "leftover-replace" });
  const source = plan.meals[0];
  const target = engine.leftoverCandidates(plan, source.id, catalogue)[0];
  const withLeftover = engine.planLeftover(plan, source.id, target.id, catalogue);
  const spare = catalogue.find((item) => !withLeftover.meals.some((meal) => meal.recipeId === item.id));

  const updated = engine.replacePlannedMeal(withLeftover, source.id, spare, catalogue);
  assert.equal(updated.meals.find((meal) => meal.id === source.id).recipeId, spare.id);
  assert.equal(updated.meals.find((meal) => meal.id === target.id).recipeId, spare.id, "le reste suit la nouvelle recette");
  assert.equal(updated.meals.find((meal) => meal.id === target.id).leftoverOf, source.id);
});

test("the weekly summary reports habits and estimated averages", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "balance" });
  const summary = engine.summarizePlan(plan, catalogue, profile);

  assert.equal(summary.mealCount, 14);
  assert.equal(summary.cookingSessions, 14);
  assert.ok(summary.legumeMeals >= 2);
  assert.ok(summary.fishMeals >= 2);
  assert.equal(summary.averageCalories, 400, "moyenne des valeurs estimatives du catalogue de test");
  assert.equal(summary.averageProtein, 18);
  assert.equal(summary.averageFiber, 8);

  const mixed = [
    ...catalogue.slice(0, 13).map((item) => ({ ...item, nutrition: { ...nutrition, calories: 300, fiber: 6 } })),
    ...catalogue.slice(13).map((item) => ({ ...item, nutrition: { ...nutrition, calories: 600, fiber: 12 } })),
  ];
  const mixedSummary = engine.summarizePlan(engine.generateWeeklyPlan(mixed, profile, { seed: "balance" }), mixed, profile);
  assert.ok(mixedSummary.averageCalories > 300 && mixedSummary.averageCalories < 600);
  assert.ok(mixedSummary.averageFiber > 6 && mixedSummary.averageFiber < 12);
});

test("meal portions can be adjusted for guests and drive shopping and cost", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "portions" });
  const slot = plan.meals[0];
  const updated = engine.setMealPortions(plan, slot.id, 4, catalogue);

  assert.equal(updated.meals[0].portions, 4);
  assert.equal(plan.meals[0].portions, profile.people, "le plan source reste intact");
  assert.deepEqual(updated.meals.slice(1), plan.meals.slice(1));
  assert.ok(updated.estimatedCost > plan.estimatedCost);

  const ingredientId = catalogue.find((item) => item.id === slot.recipeId).ingredients[0].id;
  const quantityOf = (weekly) => engine.buildShoppingList(weekly, catalogue).find((item) => item.ingredientId === ingredientId).amounts[0].quantity;
  assert.equal(quantityOf(updated) - quantityOf(plan), 300, "3 portions de plus à 100 g");

  assert.equal(engine.setMealPortions(plan, slot.id, 0, catalogue).meals[0].portions, engine.MIN_MEAL_PORTIONS);
  assert.equal(engine.setMealPortions(plan, slot.id, 99, catalogue).meals[0].portions, engine.MAX_MEAL_PORTIONS);
  assert.equal(engine.setMealPortions(plan, slot.id, 2.4, catalogue).meals[0].portions, 2);
  assert.equal(engine.setMealPortions(plan, slot.id, Number.NaN, catalogue).meals[0].portions, engine.MIN_MEAL_PORTIONS);
  assert.equal(engine.setMealPortions(plan, "slot-inconnu", 4, catalogue), plan);
});

test("ticked shopping items survive a meal change and only drop what disappeared", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "reconcile" });
  const items = engine.buildShoppingList(plan, catalogue).map((item) => item.ingredientId);
  const slot = plan.meals[0];
  const removedIngredient = catalogue.find((item) => item.id === slot.recipeId).ingredients[0].id;

  const candidate = engine.getReplacementCandidates(plan, slot.id, catalogue, profile)[0];
  const updated = engine.replacePlannedMeal(plan, slot.id, candidate, catalogue);
  const kept = engine.reconcileCheckedItems(updated, catalogue, items);

  assert.ok(kept.length > 0, "les articles encore nécessaires restent cochés");
  assert.equal(kept.includes(removedIngredient), false, "l'ingrédient devenu inutile est décoché");
  assert.ok(kept.includes("olive-oil"), "un ingrédient commun reste coché");
  assert.ok(kept.every((id) => items.includes(id)));
});

test("reconciling ignores pantry items, legacy keys, duplicates and missing plans", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "reconcile-edge" });

  assert.deepEqual(engine.reconcileCheckedItems(null, catalogue, ["olive-oil"]), []);
  assert.deepEqual(engine.reconcileCheckedItems(plan, catalogue, ["ingredient-inconnu"]), []);
  assert.deepEqual(
    engine.reconcileCheckedItems(plan, catalogue, ["huile-olive:ml", "huile-olive", "olive-oil"]),
    ["olive-oil"],
    "les clés héritées sont canonisées et dédupliquées",
  );
  assert.deepEqual(
    engine.reconcileCheckedItems(plan, catalogue, ["olive-oil"]),
    ["olive-oil"],
    "un ingrédient encore nécessaire reste coché",
  );
});

test("replacement reasons no longer contradict their label", () => {
  const shared = recipe(130, { ingredients: [
    { id: "ingredient-0", name: "Ingrédient partagé", quantity: 100, unit: "g", category: "grocery" },
    { id: "huile-olive", name: "Huile d’olive", quantity: 5, unit: "ml", category: "grocery" },
  ] });
  const distinct = recipe(131, { ingredients: [
    { id: "ingredient-neuf", name: "Ingrédient neuf", quantity: 100, unit: "g", category: "grocery" },
  ] });
  const pool = [...catalogue, shared, distinct];
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "reasons" });
  const slot = plan.meals.find((meal) => meal.recipeId === "recipe-0") ?? plan.meals[0];

  const different = engine.getReplacementCandidates(plan, slot.id, pool, profile, "Autres ingrédients");
  const reuse = engine.getReplacementCandidates(plan, slot.id, pool, profile, "Réutiliser mes ingrédients");

  assert.ok(
    different.indexOf(distinct) < different.indexOf(shared),
    "« Autres ingrédients » doit éloigner les recettes qui partagent les ingrédients actuels",
  );
  assert.ok(
    reuse.indexOf(shared) < reuse.indexOf(distinct),
    "« Réutiliser mes ingrédients » doit rapprocher les recettes qui les partagent",
  );

  const quick = engine.getReplacementCandidates(plan, slot.id, [...pool, recipe(132, { prepMinutes: 5 })], profile, "Plus rapide");
  assert.equal(quick[0].prepMinutes, 5, "le motif rapide reste piloté par le temps actif");
});

test("favourite recipes are preferred but never override the safety filters", () => {
  // Uniform tags so the legume/fish targets do not decide the order.
  const uniform = Array.from({ length: 20 }, (_, index) => recipe(index + 300, { tags: ["poisson", "légumineuses"] }));
  const plain = engine.generateWeeklyPlan(uniform, profile, { seed: "favourites" });
  const ignored = plain.meals.slice(-4).map((meal) => meal.recipeId);

  const favoured = engine.generateWeeklyPlan(uniform, profile, {
    seed: "favourites",
    favoriteRecipeIds: ignored,
  });
  assert.deepEqual(
    favoured.meals.slice(0, 4).map((meal) => meal.recipeId).sort(),
    [...ignored].sort(),
    "les favoris sont servis en premier à qualité égale",
  );
  assert.equal(new Set(favoured.meals.map((meal) => meal.recipeId)).size, 14);

  const forbidden = recipe(140, { allergens: ["arachides"] });
  const disliked = recipe(141);
  const strictProfile = { ...profile, allergies: ["arachides"], dislikedRecipeIds: [disliked.id] };
  const guarded = engine.generateWeeklyPlan([...catalogue, forbidden, disliked], strictProfile, {
    seed: "favourites-guarded",
    favoriteRecipeIds: [forbidden.id, disliked.id],
  });

  assert.ok(guarded.meals.every((meal) => meal.recipeId !== forbidden.id), "un favori allergène reste exclu");
  assert.ok(guarded.meals.every((meal) => meal.recipeId !== disliked.id), "un favori écarté reste exclu");
});

test("favourites bow to the legume and fish targets", () => {
  const favouriteIds = catalogue.filter((item) => item.tags.includes("céréales-complètes")).map((item) => item.id);
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "favourites-targets", favoriteRecipeIds: favouriteIds });
  const summary = engine.summarizePlan(plan, catalogue, profile);

  assert.ok(summary.legumeMeals >= 2, "les légumineuses passent avant les préférences");
  assert.ok(summary.fishMeals >= 2, "le poisson passe avant les préférences");
});

test("weekly targets are configurable, clamped and honoured by the generator", () => {
  assert.deepEqual(engine.weeklyTargetsOf(profile), { legumeMeals: 2, fishMeals: 2 }, "valeurs par défaut pour un profil ancien");
  assert.deepEqual(engine.weeklyTargetsOf({ ...profile, weeklyTargets: { legumeMeals: 99, fishMeals: -4 } }), { legumeMeals: 7, fishMeals: 0 });
  assert.deepEqual(engine.weeklyTargetsOf({ ...profile, weeklyTargets: { legumeMeals: 3.4, fishMeals: Number.NaN } }), { legumeMeals: 3, fishMeals: 2 });

  // Le catalogue de test ne compte que deux recettes par famille : on en ajoute.
  const rich = [
    ...catalogue,
    ...Array.from({ length: 4 }, (_, index) => recipe(400 + index, { tags: ["légumineuses"] })),
    ...Array.from({ length: 3 }, (_, index) => recipe(410 + index, { tags: ["poisson"] })),
  ];
  const demanding = { ...profile, weeklyTargets: { legumeMeals: 4, fishMeals: 3 } };
  const summary = engine.summarizePlan(engine.generateWeeklyPlan(rich, demanding, { seed: "targets" }), rich, demanding);
  assert.ok(summary.legumeMeals >= 4, `légumineuses attendues >= 4, obtenu ${summary.legumeMeals}`);
  assert.ok(summary.fishMeals >= 3, `poissons attendus >= 3, obtenu ${summary.fishMeals}`);

  const relaxed = { ...profile, weeklyTargets: { legumeMeals: 0, fishMeals: 0 } };
  const cheap = catalogue.map((item, index) => ({ ...item, costPerPortion: index < 4 ? 9 : 1 }));
  const relaxedPlan = engine.generateWeeklyPlan(cheap, { ...relaxed, weeklyBudget: 20 }, { seed: "targets-relaxed" });
  assert.ok(relaxedPlan.estimatedCost <= 20, "sans objectif, le budget peut être pleinement optimisé");
});

test("two meals can be swapped, marks included", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "swap" });
  const marked = engine.setPlannedMealCompleted(engine.setPlannedMealLock(plan, plan.meals[0].id, true), plan.meals[3].id, true);
  const swapped = engine.swapPlannedMeals(marked, marked.meals[0].id, marked.meals[3].id);

  assert.equal(swapped.meals[0].recipeId, marked.meals[3].recipeId);
  assert.equal(swapped.meals[3].recipeId, marked.meals[0].recipeId);
  assert.equal(swapped.meals[0].completed, true, "le repère « cuisiné » suit le plat");
  assert.equal(swapped.meals[3].locked, true, "le cadenas suit le plat");
  assert.equal(swapped.meals[0].dayIndex, marked.meals[0].dayIndex, "les créneaux ne bougent pas");
  assert.equal(engine.swapPlannedMeals(plan, plan.meals[0].id, plan.meals[0].id), plan);
  assert.equal(engine.swapPlannedMeals(plan, "inconnu", plan.meals[1].id), plan);
});

test("swapping refuses to break a batch and its leftovers", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "swap-leftover" });
  const target = engine.leftoverCandidates(plan, plan.meals[0].id, catalogue)[0];
  const withLeftover = engine.planLeftover(plan, plan.meals[0].id, target.id, catalogue);

  assert.throws(() => engine.swapPlannedMeals(withLeftover, plan.meals[0].id, plan.meals[5].id), /base à des restes/);
  assert.throws(() => engine.swapPlannedMeals(withLeftover, target.id, plan.meals[5].id), /attaché au plat/);
});

test("a meal taken outside costs nothing and buys nothing", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "skip" });
  const slot = plan.meals[0];
  const skipped = engine.setMealSkipped(plan, slot.id, true, catalogue);

  assert.equal(skipped.meals[0].skipped, true);
  assert.ok(skipped.estimatedCost < plan.estimatedCost, "le coût baisse");
  assert.equal(engine.planProgress(skipped).total, 13, "le repas sorti ne compte plus dans la progression");
  assert.equal(engine.summarizePlan(skipped, catalogue, profile).cookingSessions, 13);

  const ingredient = catalogue.find((item) => item.id === slot.recipeId).ingredients[0].id;
  const before = engine.buildShoppingList(plan, catalogue).find((item) => item.ingredientId === ingredient);
  const after = engine.buildShoppingList(skipped, catalogue).find((item) => item.ingredientId === ingredient);
  assert.ok(!after || after.amounts[0].quantity < before.amounts[0].quantity, "les courses baissent");

  const restored = engine.setMealSkipped(skipped, slot.id, false, catalogue);
  assert.equal(restored.estimatedCost, plan.estimatedCost);
});

test("cooking sessions group what really has to be cooked", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "sessions" });
  const target = engine.leftoverCandidates(plan, plan.meals[0].id, catalogue)[0];
  const prepared = engine.setMealSkipped(
    engine.planLeftover(plan, plan.meals[0].id, target.id, catalogue),
    plan.meals[13].id,
    true,
    catalogue,
  );
  const sessions = engine.cookingSessionsOf(prepared, catalogue);

  assert.equal(sessions.reduce((total, session) => total + session.meals.length, 0), 12, "14 repas moins un reste et un repas dehors");
  assert.ok(sessions.every((session) => session.activeMinutes > 0));
  assert.equal(sessions[0].servesLater, 1, "le premier jour nourrit aussi un repas plus tard");
  assert.deepEqual(sessions.map((session) => session.dayIndex), [...sessions].sort((a, b) => a.dayIndex - b.dayIndex).map((s) => s.dayIndex));
});

test("a « meh » recipe is pushed down without being excluded", () => {
  const uniform = Array.from({ length: 20 }, (_, index) => recipe(index + 500, { tags: ["poisson", "légumineuses"] }));
  const plain = engine.generateWeeklyPlan(uniform, profile, { seed: "meh" });
  const demoted = plain.meals.slice(0, 3).map((meal) => meal.recipeId);
  const pickyProfile = { ...profile, softDislikedRecipeIds: demoted };

  const next = engine.generateWeeklyPlan(uniform, pickyProfile, { seed: "meh" });
  const positions = demoted.map((id) => next.meals.findIndex((meal) => meal.recipeId === id));
  assert.ok(positions.every((position) => position === -1 || position > 6), "les recettes « bof » passent après");

  const candidates = engine.getReplacementCandidates(next, next.meals[0].id, uniform, pickyProfile);
  const first = candidates.slice(0, 3).map((item) => item.id);
  assert.ok(first.every((id) => !demoted.includes(id)), "elles ne sont plus proposées en tête");
});

test("pantry quantities are deducted from the shopping list", () => {
  const dish = recipe(600, { ingredients: [{ id: "riz-complet", name: "Riz complet", quantity: 100, unit: "g", category: "grocery" }] });
  const plan = {
    id: "pantry", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile,
    meals: [{ id: "a", dayIndex: 0, mealType: "lunch", recipeId: dish.id, portions: 4, source: "manual" }],
    estimatedCost: 8, version: 1,
  };

  const full = engine.buildShoppingList(plan, [dish]);
  assert.equal(full[0].amounts[0].quantity, 400);

  const partial = engine.buildShoppingList(plan, [dish], { pantryAmounts: { "riz-complet": { quantity: 150, unit: "g" } } });
  assert.equal(partial[0].amounts[0].quantity, 250, "seul le reste à acheter est listé");

  const covered = engine.buildShoppingList(plan, [dish], { pantryAmounts: { "riz-complet": { quantity: 900, unit: "g" } } });
  assert.equal(covered.length, 0, "un ingrédient entièrement en stock quitte la liste");

  const wrongUnit = engine.buildShoppingList(plan, [dish], { pantryAmounts: { "riz-complet": { quantity: 900, unit: "ml" } } });
  assert.equal(wrongUnit[0].amounts[0].quantity, 400, "aucune conversion hasardeuse entre unités");
});

test("tonight's reminders only cover tomorrow's long-rest dishes", () => {
  const slow = recipe(700, { restMinutes: 480 });
  const quick = recipe(701, { restMinutes: 30 });
  const pool = [slow, quick, ...catalogue];
  const plan = {
    id: "reminders", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile,
    meals: [
      { id: "a", dayIndex: 1, mealType: "lunch", recipeId: slow.id, portions: 2, source: "generated" },
      { id: "b", dayIndex: 1, mealType: "dinner", recipeId: quick.id, portions: 2, source: "generated" },
      { id: "c", dayIndex: 3, mealType: "lunch", recipeId: catalogue[0].id, portions: 2, source: "generated" },
    ],
    estimatedCost: 12, version: 1,
  };

  const due = engine.mealsToStartTonight(plan, pool, "2026-08-03");
  assert.deepEqual(due.map((item) => item.recipe.id), [slow.id], "seul le plat à long repos est rappelé");
  assert.equal(due[0].minutes, 480);
  assert.deepEqual(engine.mealsToStartTonight(plan, pool, "2026-08-04"), [], "rien à lancer pour le surlendemain");
  assert.deepEqual(engine.mealsToStartTonight(null, pool, "2026-08-03"), []);

  const skipped = engine.setMealSkipped(plan, "a", true, pool);
  assert.deepEqual(engine.mealsToStartTonight(skipped, pool, "2026-08-03"), [], "un repas hors foyer ne se prépare pas");
});

test("the week exports as a valid calendar file", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "ics", startsOn: "2026-08-03" });
  const skipped = engine.setMealSkipped(plan, plan.meals[0].id, true, catalogue);
  const ics = engine.planToCalendar(skipped, catalogue);

  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 13, "le repas hors foyer n'est pas exporté");
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, (ics.match(/END:VEVENT/g) ?? []).length);
  assert.doesNotMatch(ics, /DTSTART;TZID=Europe\/Paris:20260803T123000/, "le déjeuner hors foyer du lundi est absent");
  assert.match(ics, /DTSTART;TZID=Europe\/Paris:20260803T193000/, "le dîner du lundi est bien exporté");
  assert.match(engine.planToCalendar(plan, catalogue), /DTSTART;TZID=Europe\/Paris:20260803T123000/);
  assert.match(ics, /SUMMARY:(Déjeuner|Dîner) — /);
  assert.ok(ics.split("\r\n").every((line) => line.length <= 400));
});
