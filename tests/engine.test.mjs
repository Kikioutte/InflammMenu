import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const engine = await import("../src/engine.ts");
const shopping = await import("../src/shopping.ts");
const { IMPORTED_PLAN_RECIPES } = await import("../src/planner-catalog.ts");

// Captured from the previous engine, before optimizing. These complete-plan
// fingerprints protect seeded ordering, costs, locks, skips and profile data.
const reference = JSON.parse(await readFile(new URL("./fixtures/planner-determinism.json", import.meta.url), "utf8"));
for (const scenario of reference.scenarios) {
  test(`les 20 menus de référence restent identiques : ${scenario.name}`, async () => {
    const { RECIPES } = await import("../src/recipes.ts");
    const before = structuredClone(scenario.profile);
    for (const sample of scenario.cases) {
      const plan = engine.generateWeeklyPlan(RECIPES, scenario.profile, { ...scenario.options, seed: sample.seed });
      const actual = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
      assert.equal(actual, sample.sha256, `${scenario.name}, ${sample.seed} diffère du moteur ${reference.referenceCommit}`);
    }
    assert.deepEqual(scenario.profile, before, "le calcul ne modifie pas le profil fourni");
  });
}

const nutrition = {
  calories: 400,
  protein: 18,
  fiber: 8,
  estimated: true,
  note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif.",
};

function recipe(index, overrides = {}) {
  const tags = index < 2 ? ["finfish"] : index < 4 ? ["pulse"] : ["céréales-complètes"];
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

test("refreshing a recipe price updates active estimates without mutating meal state or incomplete plans", () => {
  const original = engine.generateWeeklyPlan(catalogue, profile, { seed: "price-change", startsOn: "2026-08-03" });
  const changedId = original.meals[0].recipeId;
  const changedRecipes = catalogue.map(item => item.id === changedId ? { ...item, costPerPortion: item.costPerPortion + 1 } : item);
  const updated = engine.refreshPlanEstimate(original, changedRecipes);
  assert.equal(updated.estimatedCost, original.estimatedCost + original.meals[0].portions);
  assert.equal(updated.meals, original.meals, "cooked markers, locks and quantities are preserved");
  assert.equal(engine.refreshPlanEstimate(updated, changedRecipes), updated, "unchanged totals do not trigger repeated writes");
  assert.equal(engine.refreshPlanEstimate(original, []), original, "a missing recipe cannot silently lower the estimate");
  const extreme = catalogue.map(item => ({ ...item, costPerPortion: 10_000 }));
  const bounded = engine.refreshPlanEstimate(original, extreme);
  assert.equal(bounded.estimatedCost, 100_000, "the existing persistence ceiling remains stable");
  assert.equal(engine.refreshPlanEstimate(bounded, extreme), bounded);
});

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

test("weekly targets use exact business tags instead of lexical food prefixes", () => {
  const summaryFor = (recipeId) => {
    const selected = IMPORTED_PLAN_RECIPES.find((item) => item.id === `catalog-${recipeId}`);
    assert.ok(selected, `${recipeId} absente de la projection planificateur`);
    const plan = {
      id: `week-${recipeId}`,
      startsOn: "2026-08-03",
      generatedAt: "2026-08-03T00:00:00.000Z",
      profileSnapshot: profile,
      version: 1,
      estimatedCost: selected.costPerPortion,
      meals: [{ id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: selected.id, portions: 1, source: "manual" }],
    };
    return { recipe: selected, summary: engine.summarizePlan(plan, IMPORTED_PLAN_RECIPES, profile) };
  };

  const greenBeans = summaryFor("r254");
  assert.equal(greenBeans.summary.legumeMeals, 0, "les haricots verts ne sont pas une portion de légumes secs");

  const mussels = summaryFor("r392");
  assert.equal(mussels.summary.fishMeals, 0, "les mollusques ne satisfont pas l’objectif poisson");
  assert.ok(mussels.recipe.tags.includes("seafood"));
  assert.ok(!mussels.recipe.tags.includes("finfish"));

  const pulses = summaryFor("r007");
  assert.equal(pulses.summary.legumeMeals, 1);
  assert.ok(pulses.recipe.tags.includes("pulse"));

  const finfish = summaryFor("r355");
  assert.equal(finfish.summary.fishMeals, 1);
  assert.ok(finfish.recipe.tags.includes("finfish"));

  const pulseSeafood = summaryFor("r399");
  assert.equal(pulseSeafood.summary.legumeMeals, 1);
  assert.equal(pulseSeafood.summary.fishMeals, 0);
  assert.ok(pulseSeafood.recipe.tags.includes("seafood"));

  const seafood = summaryFor("r049");
  assert.equal(seafood.summary.fishMeals, 0);
  assert.ok(seafood.recipe.tags.includes("seafood"));
});

test("the plan season is derived from its Monday across generation, summary and replacements", () => {
  const calendar = [
    ["2026-01-05", "winter"], ["2026-02-02", "winter"],
    ["2026-03-02", "spring"], ["2026-04-06", "spring"], ["2026-05-04", "spring"],
    ["2026-06-01", "summer"], ["2026-07-06", "summer"], ["2026-08-03", "summer"],
    ["2026-09-07", "autumn"], ["2026-10-05", "autumn"], ["2026-11-02", "autumn"],
    ["2026-12-07", "winter"],
  ];
  assert.deepEqual(calendar.map(([date]) => engine.seasonForIsoDate(date)), calendar.map(([, season]) => season));

  for (const [startsOn, season] of calendar.filter(([, value], index) => index === 0 || value !== calendar[index - 1][1])) {
    const matching = recipe(700 + startsOn.charCodeAt(5), { id: `matching-${season}`, seasons: [season] });
    const opposite = recipe(710 + startsOn.charCodeAt(6), { id: `opposite-${season}`, seasons: [season === "winter" ? "summer" : "winter"] });
    const allYear = recipe(720 + startsOn.charCodeAt(8), { id: `all-year-${season}`, seasons: ["all-year"] });
    const plan = {
      id: `week-${season}`,
      startsOn,
      generatedAt: `${startsOn}T00:00:00.000Z`,
      profileSnapshot: profile,
      version: 1,
      estimatedCost: 6,
      meals: [matching, opposite, allYear].map((item, dayIndex) => ({
        id: `day-${dayIndex}-dinner`, dayIndex, mealType: "dinner", recipeId: item.id, portions: 1, source: "manual",
      })),
    };
    assert.equal(engine.summarizePlan(plan, [matching, opposite, allYear], profile).seasonalMeals, 2, startsOn);
  }

  const winterCandidate = recipe(790, { id: "winter-candidate", title: "Z hiver", seasons: ["winter"], tags: [] });
  const summerCandidate = recipe(791, { id: "summer-candidate", title: "A été", seasons: ["summer"], tags: [] });
  const current = recipe(792, { id: "current-season", seasons: ["all-year"], tags: [] });
  const replacementPlan = {
    id: "week-replacement-season",
    startsOn: "2026-01-05",
    generatedAt: "2026-01-05T00:00:00.000Z",
    profileSnapshot: profile,
    version: 1,
    estimatedCost: 2,
    meals: [{ id: "day-0-dinner", dayIndex: 0, mealType: "dinner", recipeId: current.id, portions: 1, source: "manual" }],
  };
  assert.equal(
    engine.getReplacementCandidates(replacementPlan, "day-0-dinner", [current, summerCandidate, winterCandidate], profile)[0].id,
    winterCandidate.id,
  );

  const slots = Array.from({ length: 7 }, (_, dayIndex) => ["lunch", "dinner"].map((mealType) => ({ dayIndex, mealType }))).flat();
  const lockedRecipes = slots.slice(0, 13).map((_, index) => recipe(800 + index, { tags: [], seasons: ["all-year"] }));
  const lockedMeals = slots.slice(0, 13).map((slot, index) => ({
    id: `day-${slot.dayIndex}-${slot.mealType}`,
    ...slot,
    recipeId: lockedRecipes[index].id,
    portions: 1,
    source: "generated",
    locked: true,
  }));
  const generationRecipes = [...lockedRecipes, winterCandidate, summerCandidate];
  const generationProfile = { ...profile, weeklyBudget: 1_000, weeklyTargets: { legumeMeals: 0, fishMeals: 0 } };
  const options = { seed: "derived-winter", startsOn: "2026-01-05", lockedMeals };
  const derived = engine.generateWeeklyPlan(generationRecipes, generationProfile, options);
  const explicit = engine.generateWeeklyPlan(generationRecipes, generationProfile, { ...options, season: "winter" });
  assert.deepEqual(derived, explicit, "sans option explicite, janvier doit utiliser winter");
});

test("different seeds explore the best compatible candidates reproducibly", () => {
  const uniform = Array.from({ length: 80 }, (_, index) => recipe(index + 1_000, {
    tags: ["finfish", "pulse", "céréales-complètes"],
    costPerPortion: 2 + (index % 5) * 0.15,
  }));
  const plans = Array.from({ length: 30 }, (_, index) => engine.generateWeeklyPlan(uniform, {
    ...profile,
    weeklyBudget: 100,
  }, { seed: `exploration-${index}`, startsOn: "2026-08-03" }));

  assert.ok(new Set(plans.map((plan) => plan.meals.map((meal) => meal.recipeId).join(","))).size >= 25);
  assert.ok(new Set(plans.flatMap((plan) => plan.meals.map((meal) => meal.recipeId))).size >= 65);
  assert.deepEqual(
    engine.generateWeeklyPlan(uniform, profile, { seed: "reproductible" }),
    engine.generateWeeklyPlan(uniform, profile, { seed: "reproductible" }),
  );
});

test("the weekly generator avoids two soups, salads or bowls on the same day when alternatives exist", () => {
  const forms = ["soupe", "salade", "bowl", "plat"];
  const varied = Array.from({ length: 48 }, (_, index) => recipe(index + 3_000, {
    title: forms[index % forms.length] === "bowl"
      ? `Bol de test ${index}`
      : `Recette ${forms[index % forms.length]} ${index}`,
    tags: [forms[index % forms.length]],
    costPerPortion: 2,
  }));
  const noTargets = {
    ...profile,
    weeklyBudget: 100,
    weeklyTargets: { legumeMeals: 0, fishMeals: 0 },
  };

  for (let seed = 0; seed < 30; seed += 1) {
    const plan = engine.generateWeeklyPlan(varied, noTargets, { seed: `daily-form-${seed}` });
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const dayForms = plan.meals
        .filter((meal) => meal.dayIndex === dayIndex && !meal.skipped)
        .map((meal) => engine.recipeForm(varied.find((item) => item.id === meal.recipeId)));
      assert.equal(
        dayForms[0] !== "other" && dayForms[0] === dayForms[1],
        false,
        `forme ${dayForms[0]} répétée au jour ${dayIndex + 1}, graine ${seed}`,
      );
    }
  }
});

test("a future locked meal guides the earlier slot toward a different serving form", () => {
  const soups = Array.from({ length: 20 }, (_, index) => recipe(index + 3_100, {
    title: `Soupe verrouillée ${index}`,
    tags: ["soupe"],
  }));
  const salads = Array.from({ length: 20 }, (_, index) => recipe(index + 3_200, {
    title: `Salade alternative ${index}`,
    tags: ["salade"],
  }));
  const locked = {
    id: "day-0-dinner",
    dayIndex: 0,
    mealType: "dinner",
    recipeId: soups[0].id,
    portions: 1,
    source: "generated",
    locked: true,
  };
  const all = [...soups, ...salads];
  const plan = engine.generateWeeklyPlan(all, {
    ...profile,
    weeklyBudget: 100,
    weeklyTargets: { legumeMeals: 0, fishMeals: 0 },
  }, { seed: "locked-form", lockedMeals: [locked] });
  const lunch = plan.meals.find((meal) => meal.dayIndex === 0 && meal.mealType === "lunch");
  const lunchRecipe = all.find((item) => item.id === lunch.recipeId);

  assert.equal(engine.recipeForm(lunchRecipe), "salad");
  assert.equal(plan.meals.find((meal) => meal.id === locked.id)?.recipeId, locked.recipeId);
});

test("daily form variety stays soft when the safe catalogue only contains soups", () => {
  const soupsOnly = Array.from({ length: 20 }, (_, index) => recipe(index + 3_250, {
    title: `Soupe sûre ${index}`,
    tags: ["soupe"],
  }));
  const plan = engine.generateWeeklyPlan(soupsOnly, {
    ...profile,
    weeklyBudget: 100,
    weeklyTargets: { legumeMeals: 0, fishMeals: 0 },
  }, { seed: "soups-only" });

  assert.equal(plan.meals.length, 14);
  assert.ok(plan.meals.every((meal) => engine.recipeForm(soupsOnly.find((item) => item.id === meal.recipeId)) === "soup"));
});

test("recipe forms prioritize explicit bowls and ignore ingredient-like tags", () => {
  assert.equal(engine.recipeForm(recipe(3_300, { title: "Bol de quinoa", tags: ["salade"] })), "bowl");
  assert.equal(engine.recipeForm(recipe(3_301, { title: "Velouté de carottes", tags: ["plat"] })), "soup");
  assert.equal(engine.recipeForm(recipe(3_302, { title: "Assiette de lentilles", tags: ["salade"] })), "salad");
  assert.equal(engine.recipeForm(recipe(3_303, { title: "Curry de lentilles", tags: ["salade-romaine"] })), "other");
});

test("an applied substitution recalculates ingredients, allergens, cost and shopping", () => {
  const walnutRecipe = recipe(30, {
    id: "walnut-bowl",
    costPerPortion: 2,
    allergens: ["fruits-a-coque"],
    ingredients: [{ id: "walnut", name: "Noix", quantity: 20, unit: "g", category: "grocery", allergens: ["fruits-a-coque"] }],
  });
  const plan = {
    id: "week-substitution", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: { ...profile, allergies: [], excludedIngredientIds: [] },
    meals: [{ id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: walnutRecipe.id, portions: 2, source: "generated" }],
    estimatedCost: 4, version: 1,
  };

  const updated = engine.setMealIngredientSubstitution(plan, "day-0-lunch", "walnut", "nuts-to-pumpkin-seeds", [walnutRecipe]);
  assert.deepEqual(updated.meals[0].substitutions, [{ ingredientId: "walnut", substitutionId: "nuts-to-pumpkin-seeds" }]);
  assert.deepEqual(engine.plannedMealAllergens(walnutRecipe, updated.meals[0]), []);
  assert.equal(updated.estimatedCost, 3.8);
  assert.equal(engine.plannedMealCost(walnutRecipe, updated.meals[0]), 3.8);
  const shopping = engine.buildShoppingList(updated, [walnutRecipe]);
  assert.equal(shopping.some((item) => item.ingredientId === "walnut"), false);
  assert.equal(shopping.find((item) => item.ingredientId === "pumpkin-seed")?.amounts[0].quantity, 40);

  const restored = engine.setMealIngredientSubstitution(updated, "day-0-lunch", "walnut", null, [walnutRecipe]);
  assert.deepEqual(restored.meals[0].substitutions, []);
  assert.deepEqual(engine.plannedMealAllergens(walnutRecipe, restored.meals[0]), ["fruits-a-coque"]);
});

test("optional ingredients stay visible and allergenic but never enter shopping", () => {
  const dish = recipe(306, {
    id: "optional-garnish",
    allergens: ["fruits-a-coque"],
    tags: ["soupe", "noix-concassees"],
    ingredients: [
      { id: "carrot", name: "Carotte", quantity: 100, unit: "g", category: "fruit-vegetable" },
      { id: "walnut", name: "Noix concassées", quantity: 15, unit: "g", category: "grocery", allergens: ["fruits-a-coque"], optional: true },
    ],
  });
  const plan = {
    id: "week-optional", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: { ...profile, allergies: [], excludedIngredientIds: [] },
    meals: [{ id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: dish.id, portions: 4, source: "generated" }],
    estimatedCost: 8, version: 1,
  };

  const scaled = engine.scaleIngredients(dish, 4);
  assert.equal(scaled.find((ingredient) => ingredient.id === "walnut")?.quantity, 60);
  assert.equal(scaled.find((ingredient) => ingredient.id === "walnut")?.optional, true);
  assert.equal(engine.ingredientsForPlannedMeal(dish, plan.meals[0])
    .find((ingredient) => ingredient.id === "walnut")?.optional, true);
  assert.equal(engine.recipeIsAllowed(dish, { ...profile, allergies: ["fruits-a-coque"] }), false);
  assert.equal(engine.recipeIsAllowed(dish, { ...profile, excludedIngredientIds: ["walnut"] }), true,
    "un aliment refusé mais facultatif est omis par défaut au lieu d'écarter toute la recette");
  const optionalDiagnostic = engine.diagnoseRecipeCompatibility([dish], {
    ...profile, excludedIngredientIds: ["walnut"],
  }, { mealType: "lunch" });
  assert.equal(optionalDiagnostic.compatibleCount, 1);
  assert.equal(optionalDiagnostic.blockedBy.excludedIngredients, 0);
  assert.equal(engine.mealCost(dish, 4), 8, "le budget garde volontairement l'estimation prudente de la recette complète");
  assert.equal(engine.recommendTonight([dish], profile, {
    mealType: "lunch", maxPrepMinutes: 30, portions: 1, pantryIngredientIds: ["walnut"],
  })[0].pantryMatches, 0, "un ingrédient facultatif n'améliore pas artificiellement le score du garde-manger");
  assert.deepEqual(engine.plantDiversityOf(plan, [dish]), { count: 1, ingredients: ["Carotte"] });
  assert.equal(engine.summarizePlan(plan, [dish], profile).nutOrSeedMeals, 0);
  const optionalFish = recipe(307, {
    id: "optional-fish", tags: ["poisson"],
    ingredients: [{ id: "poisson", name: "Poisson", quantity: 100, unit: "g", category: "meat-fish", optional: true }],
  });
  const optionalFishPlan = { ...plan, meals: [{ ...plan.meals[0], recipeId: optionalFish.id }] };
  assert.equal(engine.summarizePlan(optionalFishPlan, [optionalFish], profile).fishMeals, 0,
    "le tag généré d'un ingrédient facultatif ne satisfait pas un objectif hebdomadaire");

  const list = engine.buildShoppingList(plan, [dish]);
  assert.deepEqual(list.map((item) => item.ingredientId), ["carrot"]);
  assert.deepEqual(list[0].amounts, [{ unit: "g", quantity: 400 }]);
  const exported = engine.formatShoppingListText(list);
  assert.match(exported, /Carotte/);
  assert.doesNotMatch(exported, /Noix concassées/);
  const optionalOnly = { ...dish, ingredients: dish.ingredients.filter((ingredient) => ingredient.optional) };
  const optionalOnlyList = engine.buildShoppingList(plan, [optionalOnly]);
  assert.deepEqual(optionalOnlyList, []);
  assert.match(engine.formatShoppingListText(optionalOnlyList), /Aucun achat requis dans la liste générée\./);
});

test("a substitution cannot introduce an allergen excluded by the profile", () => {
  const yogurtRecipe = recipe(31, {
    id: "yogurt-bowl",
    allergens: ["lait"],
    ingredients: [{ id: "yogurt", name: "Yaourt nature", quantity: 120, unit: "g", category: "fresh", allergens: ["lait"] }],
  });
  const plan = {
    id: "week-allergen", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: { ...profile, allergies: ["soja"], excludedIngredientIds: [] },
    meals: [{ id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: yogurtRecipe.id, portions: 1, source: "generated" }],
    estimatedCost: 2, version: 1,
  };
  assert.throws(
    () => engine.setMealIngredientSubstitution(plan, "day-0-lunch", "yogurt", "yogurt-to-soy-yogurt", [yogurtRecipe]),
    /allergène exclu/,
  );
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
  const expensive = recipe(80, { costPerPortion: 40, tags: ["finfish"], mealTypes: ["lunch", "dinner"] });
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
  assert.match(engine.formatShoppingListText([], {}), /Aucun achat requis dans la liste générée\./);
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

test("replaying is refused when a recipe does not support its stored meal type", () => {
  const archived = engine.generateWeeklyPlan(catalogue, profile, { seed: "archive-meal-type" });
  const breakfastOnly = recipe(89, { mealTypes: ["breakfast"] });
  const mismatched = {
    ...archived,
    meals: archived.meals.map((meal, index) => (index === 0 ? { ...meal, recipeId: breakfastOnly.id } : meal)),
  };

  const report = engine.inspectPlanReplay(mismatched, [...catalogue, breakfastOnly], profile);
  assert.equal(report.missingSlots, 0);
  assert.deepEqual(report.blockedMeals.map((meal) => meal.id), [mismatched.meals[0].id]);
  assert.equal(report.canReplay, false);
});

test("an imported active plan requires its exact grid while preserving legitimate live changes", () => {
  const active = engine.generateWeeklyPlan(catalogue, profile, { seed: "active-import" });
  assert.deepEqual(
    engine.inspectActivePlan(active, catalogue, profile),
    { blockedMeals: [], missingSlots: 0, unexpectedSlots: 0, inferredMealsPerDay: 2, canActivate: true },
  );

  const missing = { ...active, meals: active.meals.slice(1) };
  const missingReport = engine.inspectActivePlan(missing, catalogue, profile);
  assert.equal(missingReport.missingSlots, 1);
  assert.equal(missingReport.canActivate, false);

  const breakfast = recipe(92, { mealTypes: ["breakfast"] });
  const extra = {
    ...active,
    meals: [...active.meals, {
      ...active.meals[0],
      id: "day-0-breakfast",
      mealType: "breakfast",
      recipeId: breakfast.id,
    }],
  };
  const extraReport = engine.inspectActivePlan(extra, [...catalogue, breakfast], profile);
  assert.equal(extraReport.unexpectedSlots, 1);
  assert.equal(extraReport.inferredMealsPerDay, null);
  assert.equal(extraReport.canActivate, false);

  const outside = engine.setMealSkipped(active, active.meals[0].id, true, catalogue);
  assert.equal(engine.inspectActivePlan(outside, catalogue, profile).canActivate, true);

  const expandedProfile = { ...profile, mealsPerDay: 3 };
  const staleSnapshot = { ...active, profileSnapshot: expandedProfile };
  const expandedReport = engine.inspectActivePlan(staleSnapshot, catalogue, expandedProfile);
  assert.equal(expandedReport.canActivate, true);
  assert.equal(expandedReport.inferredMealsPerDay, 2, "la grille réelle prime sur un snapshot legacy périmé");
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

  const slotToRestore = plan.meals.find((meal) => meal.dayIndex === 3 && meal.mealType === "dinner");
  const skipped = engine.setMealSkipped(plan, slotToRestore.id, true, catalogue);
  const restored = engine.assignRecipeToSlot(skipped, { dayIndex: 3, mealType: "dinner" }, spare, catalogue, profile);
  const restoredMeal = restored.meals.find((meal) => meal.id === slotToRestore.id);
  assert.equal(restoredMeal.skipped, false, "planifier un plat remet le créneau au foyer");
  assert.ok(restored.estimatedCost > skipped.estimatedCost, "le coût du repas réactivé est recalculé");
  assert.ok(engine.buildShoppingList(restored, catalogue).length >= engine.buildShoppingList(skipped, catalogue).length);
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
  const uniform = Array.from({ length: 20 }, (_, index) => recipe(index + 300, { tags: ["finfish", "pulse"] }));
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
    ...Array.from({ length: 4 }, (_, index) => recipe(400 + index, { tags: ["pulse"] })),
    ...Array.from({ length: 3 }, (_, index) => recipe(410 + index, { tags: ["finfish"] })),
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

test("a swap validates the substitutions carried by each planned meal", () => {
  const yogurtDish = recipe(850, {
    mealTypes: ["lunch"],
    ingredients: [{ id: "yogurt", name: "Yaourt", quantity: 100, unit: "g", category: "fresh", allergens: ["lait"] }],
    allergens: ["lait"],
  });
  const otherDish = recipe(851, { mealTypes: ["lunch"] });
  const plan = {
    id: "week-swap-substitutions",
    startsOn: "2026-08-03",
    generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: {},
    meals: [
      { id: "a", dayIndex: 0, mealType: "lunch", recipeId: yogurtDish.id, portions: 2, source: "manual", substitutions: [{ ingredientId: "yogurt", substitutionId: "yogurt-to-soy-yogurt" }] },
      { id: "b", dayIndex: 1, mealType: "lunch", recipeId: otherDish.id, portions: 2, source: "manual" },
    ],
    estimatedCost: 10,
    version: 1,
  };
  assert.equal(engine.canSwapPlannedMeals(plan, "a", "b", [yogurtDish, otherDish], { ...profile, allergies: ["soja"] }), false);
});

test("generation explains when every compatible recipe is already used", () => {
  const tinyCatalogue = [recipe(860), recipe(861)];
  assert.throws(
    () => engine.generateWeeklyPlan(tinyCatalogue, profile, { seed: "unique-empty" }),
    (error) => error instanceof engine.RecipeCompatibilityError
      && error.diagnostic.compatibleCount === 2
      && /déjà utilisées/.test(error.message),
  );
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

test("a meal planned outside consumes no recipe capacity or weekly target", () => {
  const minimalCatalogue = Array.from({ length: 13 }, (_, index) => recipe(5_000 + index, {
    tags: index === 0 ? ["finfish"] : ["céréales-complètes"],
  }));
  const outsideProfile = {
    ...profile,
    weeklyBudget: 100,
    weeklyTargets: { legumeMeals: 0, fishMeals: 1 },
    dayConstraints: [{ dayIndex: 0, skippedMealTypes: ["lunch"] }],
  };

  const plan = engine.generateWeeklyPlan(minimalCatalogue, outsideProfile, { seed: "outside-capacity" });
  const activeMeals = plan.meals.filter((meal) => !meal.skipped);
  const summary = engine.summarizePlan(plan, minimalCatalogue, outsideProfile);

  assert.equal(plan.meals.length, 14, "le créneau hors foyer reste visible dans la semaine");
  assert.equal(activeMeals.length, 13);
  assert.equal(new Set(activeMeals.map((meal) => meal.recipeId)).size, 13, "les repas actifs restent uniques");
  assert.ok(activeMeals.some((meal) => meal.recipeId === minimalCatalogue[0].id), "le poisson doit être servi à un repas actif");
  assert.equal(summary.mealCount, 13);
  assert.equal(summary.fishMeals, 1, "le repas hors foyer ne doit jamais satisfaire l’objectif poisson");
});

test("weekly aggregates ignore every value carried by a meal outside", () => {
  const outsideFish = recipe(5_100, {
    tags: ["finfish", "pulse"],
    nutrition: { ...nutrition, calories: 999, protein: 99, fiber: 99 },
  });
  const activeGrain = recipe(5_101, {
    tags: ["céréales-complètes"],
    nutrition: { ...nutrition, calories: 321, protein: 12, fiber: 5 },
  });
  const plan = {
    id: "week-outside-summary",
    startsOn: "2026-08-03",
    generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: profile,
    version: 1,
    estimatedCost: 2,
    meals: [
      { id: "outside", dayIndex: 0, mealType: "lunch", recipeId: outsideFish.id, portions: 1, source: "generated", skipped: true },
      { id: "active", dayIndex: 0, mealType: "dinner", recipeId: activeGrain.id, portions: 1, source: "generated" },
    ],
  };

  const summary = engine.summarizePlan(plan, [outsideFish, activeGrain], profile);
  assert.equal(summary.mealCount, 1);
  assert.equal(summary.fishMeals, 0);
  assert.equal(summary.legumeMeals, 0);
  assert.equal(summary.wholeGrainMeals, 1);
  assert.equal(summary.averageCalories, 321);
  assert.equal(summary.averageProtein, 12);
  assert.equal(summary.averageFiber, 5);
});

test("a dormant outside recipe remains reusable and cannot create an active duplicate", () => {
  const plan = engine.generateWeeklyPlan(catalogue, profile, { seed: "outside-reuse" });
  const dormant = plan.meals[0];
  const outside = engine.setMealSkipped(plan, dormant.id, true, catalogue);
  const replacementTarget = outside.meals[1];
  assert.ok(
    engine.getReplacementCandidates(outside, replacementTarget.id, catalogue, profile)
      .some((candidate) => candidate.id === dormant.recipeId),
    "une recette uniquement liée à un créneau extérieur ne doit pas rester réservée",
  );

  const duplicated = {
    ...outside,
    meals: outside.meals.slice(0, 2).map((meal, index) => ({
      ...meal,
      id: index === 0 ? "outside-duplicate" : "active-duplicate",
      recipeId: dormant.recipeId,
      skipped: index === 0,
    })),
  };
  const reactivated = engine.setMealSkipped(duplicated, "outside-duplicate", false, catalogue);
  assert.equal(reactivated.meals.every((meal) => !meal.skipped), true);
  assert.equal(new Set(reactivated.meals.map((meal) => meal.recipeId)).size, 2);

  assert.throws(
    () => engine.setMealSkipped(duplicated, "outside-duplicate", false, [catalogue.find((item) => item.id === dormant.recipeId)]),
    /Aucune recette inutilisée et compatible/,
  );
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
  const uniform = Array.from({ length: 20 }, (_, index) => recipe(index + 500, { tags: ["finfish", "pulse"] }));
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


test("audit remediation: locked meals preserve portions and reset cooked state", async () => {
  const { generateWeeklyPlan } = await import("../src/engine.ts");
  const { DEFAULT_PROFILE } = await import("../src/domain.ts");
  const recipes = Array.from({ length: 14 }, (_, index) => ({
    id: `safe-${index}`,
    title: `Safe ${index}`,
    mealTypes: [index < 7 ? "lunch" : "dinner"],
    diet: ["classic"], prepMinutes: 5, costPerPortion: 1,
    seasons: ["all-year"], equipment: [], allergens: [], tags: [],
    ingredients: [{ id: `ingredient-${index}`, name: "Ingredient", quantity: 1, unit: "piece", category: "grocery" }],
    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",
  }));
  const locked = { id: "day-0-lunch", dayIndex: 0, mealType: "lunch", recipeId: "safe-0", portions: 6, source: "generated", locked: true, completed: true };
  const plan = generateWeeklyPlan(recipes, { ...DEFAULT_PROFILE, people: 2, equipment: [] }, { seed: "locked", lockedMeals: [locked] });
  const kept = plan.meals.find((meal) => meal.id === locked.id);
  assert.equal(kept.portions, 6);
  assert.equal(kept.completed, false);
});

test("audit remediation: swaps recalculate cost and replacing a leftover clears its link", async () => {
  const { swapPlannedMeals, replacePlannedMeal } = await import("../src/engine.ts");
  const makeRecipe = (id, cost) => ({
    id, title: id, mealTypes: ["lunch"], diet: ["classic"], prepMinutes: 1,
    costPerPortion: cost, seasons: ["all-year"], equipment: [], allergens: [], tags: [],
    ingredients: [{ id, name: id, quantity: 1, unit: "piece", category: "grocery" }],
    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",
  });
  const recipes = [makeRecipe("cheap", 1), makeRecipe("expensive", 10), makeRecipe("new", 3)];
  const plan = { id: "week", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: {}, version: 1, estimatedCost: 12, meals: [
    { id: "a", dayIndex: 0, mealType: "lunch", recipeId: "cheap", portions: 2, source: "generated" },
    { id: "b", dayIndex: 1, mealType: "lunch", recipeId: "expensive", portions: 1, source: "generated" },
  ] };
  const swapped = swapPlannedMeals(plan, "a", "b", recipes);
  assert.equal(swapped.estimatedCost, 12);
  assert.equal(swapped.meals[0].portions, 1);
  assert.equal(swapped.meals[1].portions, 2);

  const leftoverPlan = { ...plan, meals: [plan.meals[0], { ...plan.meals[1], recipeId: "cheap", leftoverOf: "a" }] };
  const replaced = replacePlannedMeal(leftoverPlan, "b", recipes[2], recipes);
  assert.equal(replaced.meals[1].leftoverOf, undefined);
});

test("audit remediation: skipped meals cannot become leftover targets and partial pantry remains visible", async () => {
  const { leftoverCandidates, buildShoppingList } = await import("../src/engine.ts");
  const recipe = {
    id: "tofu", title: "Tofu", mealTypes: ["lunch"], diet: ["classic"], prepMinutes: 1,
    costPerPortion: 1, seasons: ["all-year"], equipment: [], allergens: [], tags: [],
    ingredients: [{ id: "tofu", name: "Tofu", quantity: 100, unit: "g", category: "fresh" }],
    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",
  };
  const plan = { id: "week", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: {}, version: 1, estimatedCost: 2, meals: [
    { id: "a", dayIndex: 0, mealType: "lunch", recipeId: "tofu", portions: 2, source: "generated" },
    { id: "b", dayIndex: 1, mealType: "lunch", recipeId: "tofu", portions: 2, source: "generated", skipped: true },
  ] };
  assert.equal(leftoverCandidates(plan, "a", [recipe]).length, 0);
  const list = buildShoppingList({ ...plan, meals: [plan.meals[0]] }, [recipe], {
    pantryIngredientIds: ["tofu"],
    pantryAmounts: { tofu: { quantity: 50, unit: "g" } },
  });
  assert.equal(list[0].amounts[0].quantity, 150);
  assert.equal(list[0].inPantry, false);
});

test("audit remediation: calendar tokens cannot inject new lines", async () => {
  const { planToCalendar } = await import("../src/engine.ts");
  const plan = { id: "week\r\nX-EVIL:1", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: {}, version: 1, estimatedCost: 0, meals: [
    { id: "slot\nBEGIN:EVIL", dayIndex: 0, mealType: "lunch", recipeId: "missing", portions: 1, source: "generated" },
  ] };
  const calendar = planToCalendar(plan, []);
  assert.doesNotMatch(calendar, /\r\nX-EVIL:/);
  assert.doesNotMatch(calendar, /\r\nBEGIN:EVIL/);
  assert.match(calendar, /\r\nMETHOD:PUBLISH\r\n/);
});

test("calendar export escapes isolated carriage returns, folds long lines and declares its timezone", async () => {
  const { planToCalendar } = await import("../src/engine.ts");
  const recipe = {
    id: "calendar-recipe", title: `Plat${String.fromCharCode(13)}X-EVIL:1 ${"é".repeat(90)}`, mealTypes: ["lunch"], diet: ["classic"],
    prepMinutes: 1, costPerPortion: 1, seasons: ["all-year"], equipment: [], allergens: [], tags: [],
    ingredients: [{ id: "ingredient", name: "Ingredient", quantity: 1, unit: "piece", category: "grocery" }],
    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",
  };
  const plan = {
    id: "week", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: {}, version: 1, estimatedCost: 1,
    meals: [{ id: "slot", dayIndex: 0, mealType: "lunch", recipeId: recipe.id, portions: 1, source: "generated" }],
  };
  const calendar = planToCalendar(plan, [recipe]);
  assert.equal(calendar.includes("\r\nX-EVIL:"), false);
  assert.ok(calendar.includes("Plat\\nX-EVIL:1"));
  assert.ok(calendar.includes("BEGIN:VTIMEZONE\r\nTZID:Europe/Paris"));
  for (const line of calendar.split("\r\n")) {
    assert.ok(Buffer.byteLength(line) <= 75, `calendar line exceeds 75 octets: ${Buffer.byteLength(line)}`);
  }
});

test("daily constraints drive time, portions and meals outside before generation", () => {
  const varied = Array.from({ length: 34 }, (_, index) => recipe(index + 700, {
    prepMinutes: index < 18 ? 10 : 40,
  }));
  const constrainedProfile = {
    ...profile,
    dayConstraints: [{ dayIndex: 0, maxPrepMinutes: 10, portions: 4, skippedMealTypes: ["dinner"] }],
  };
  const plan = engine.generateWeeklyPlan(varied, constrainedProfile, { seed: "daily-constraints" });
  const monday = plan.meals.filter((meal) => meal.dayIndex === 0);
  assert.equal(monday.length, 2);
  assert.ok(monday.every((meal) => varied.find((item) => item.id === meal.recipeId).prepMinutes <= 10));
  assert.ok(monday.every((meal) => meal.portions === 4));
  assert.equal(monday.find((meal) => meal.mealType === "dinner").skipped, true);
  assert.ok(plan.meals.filter((meal) => meal.dayIndex > 0).every((meal) => meal.portions === 1));
});

test("meal attendance overrides only the selected slot and flows into shopping quantities", () => {
  const varied = Array.from({ length: 24 }, (_, index) => recipe(index + 760));
  const attendanceProfile = {
    ...profile,
    people: 2,
    dayConstraints: [{
      dayIndex: 6,
      portions: 4,
      mealPortions: [{ mealType: "lunch", portions: 1 }],
      skippedMealTypes: [],
    }],
  };
  const plan = engine.generateWeeklyPlan(varied, attendanceProfile, { seed: "meal-attendance" });
  assert.equal(plan.meals.find((meal) => meal.dayIndex === 6 && meal.mealType === "lunch").portions, 1);
  assert.equal(plan.meals.find((meal) => meal.dayIndex === 6 && meal.mealType === "dinner").portions, 4);
  assert.ok(plan.meals.filter((meal) => meal.dayIndex !== 6).every((meal) => meal.portions === 2));

  const lunch = plan.meals.find((meal) => meal.dayIndex === 6 && meal.mealType === "lunch");
  const lunchRecipe = varied.find((item) => item.id === lunch.recipeId);
  const list = engine.buildShoppingList({ ...plan, meals: [lunch] }, varied);
  assert.equal(list.find((item) => item.ingredientId === lunchRecipe.ingredients[0].id).amounts[0].quantity, 100);
});

test("shopping never merges unknown ingredients from their display name alone", () => {
  const first = recipe(780, {
    ingredients: [{ id: "source-a", name: "Huile d’olive", quantity: 1, unit: "c_soupe", category: "grocery" }],
  });
  const second = recipe(781, {
    ingredients: [{ id: "source-b", name: "huile d'olive", quantity: 2, unit: "c_soupe", category: "grocery" }],
  });
  const plan = {
    id: "week-aliases", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: profile, version: 1, estimatedCost: 1,
    meals: [
      { id: "a", dayIndex: 0, mealType: "lunch", recipeId: first.id, portions: 1, source: "generated" },
      { id: "b", dayIndex: 0, mealType: "dinner", recipeId: second.id, portions: 1, source: "generated" },
    ],
  };
  const list = engine.buildShoppingList(plan, [first, second]);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((item) => item.ingredientId).sort(), ["source-a", "source-b"]);
});

test("culinary identities remain distinct while reviewed shopping identities merge", () => {
  assert.notEqual(shopping.canonicalIngredientId("olive-oil"), shopping.canonicalIngredientId("huile-olive-vierge-extra"));
  assert.equal(shopping.shoppingIdentityFor("olive-oil").shoppingId, "olive-oil");
  assert.equal(shopping.shoppingIdentityFor("huile-olive-vierge-extra").shoppingId, "olive-oil");
});

test("reviewed shopping groups are stable regardless of meal order", () => {
  const oil = recipe(782, { ingredients: [{ id: "olive-oil", name: "Huile d’olive", quantity: 15, unit: "ml", category: "grocery" }] });
  const extraVirgin = recipe(783, { ingredients: [{ id: "huile-olive-vierge-extra", name: "huile d'olive vierge extra", quantity: 30, unit: "ml", category: "grocery" }] });
  const planFor = (meals) => ({
    id: "week-shopping-order", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: profile, version: 1, estimatedCost: 1, meals,
  });
  const firstOrder = planFor([
    { id: "a", dayIndex: 0, mealType: "lunch", recipeId: oil.id, portions: 1, source: "manual" },
    { id: "b", dayIndex: 0, mealType: "dinner", recipeId: extraVirgin.id, portions: 1, source: "manual" },
  ]);
  const reverseOrder = planFor([...firstOrder.meals].reverse());
  const expected = [{
    ingredientId: "olive-oil", name: "huile d’olive vierge extra", category: "grocery",
    amounts: [{ unit: "ml", quantity: 45 }], purchaseSuggestion: "À vérifier dans vos placards", checked: false, inPantry: false,
  }];
  assert.deepEqual(engine.buildShoppingList(firstOrder, [oil, extraVirgin]), expected);
  assert.deepEqual(engine.buildShoppingList(reverseOrder, [oil, extraVirgin]), expected);
});

test("legacy pantry quantities from two group members add up only in matching units", () => {
  const dish = recipe(786, { ingredients: [
    { id: "olive-oil", name: "huile d’olive", quantity: 500, unit: "ml", category: "grocery" },
    { id: "parsley", name: "persil", quantity: 40, unit: "g", category: "fruit-vegetable" },
    { id: "catalog-persil-plat-cisele", name: "persil ciselé", quantity: 2, unit: "piece", category: "fruit-vegetable" },
  ] });
  const plan = { id: "week-pantry-groups", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile, version: 1, estimatedCost: 1, meals: [{ id: "a", dayIndex: 0, mealType: "dinner", recipeId: dish.id, portions: 1, source: "manual" }] };
  const list = engine.buildShoppingList(plan, [dish], { pantryAmounts: {
    "olive-oil": { quantity: 100, unit: "ml" },
    "huile-olive-vierge-extra": { quantity: 250, unit: "ml" },
    "persil-plat": { quantity: 10, unit: "g" },
    "catalog-persil-plat-cisele": { quantity: 1, unit: "piece" },
  } });
  assert.deepEqual(list.find((item) => item.ingredientId === "olive-oil").amounts, [{ unit: "ml", quantity: 150 }]);
  assert.deepEqual(list.find((item) => item.ingredientId === "parsley").amounts, [{ unit: "g", quantity: 30 }, { unit: "piece", quantity: 1 }]);
});

test("only explicitly reviewed fresh herbs, onions, lemons and mustards share a shopping line", () => {
  const ingredients = [
    { id: "parsley", name: "persil", quantity: 10, unit: "g", category: "fruit-vegetable" },
    { id: "catalog-persil-plat-cisele", name: "persil ciselé", quantity: 5, unit: "g", category: "grocery" },
    { id: "mint", name: "menthe", quantity: 4, unit: "g", category: "fruit-vegetable" },
    { id: "catalog-feuilles-de-menthe-fraiche", name: "feuilles de menthe", quantity: 1, unit: "piece", category: "fruit-vegetable" },
    { id: "onion", name: "oignon", quantity: 100, unit: "g", category: "fruit-vegetable" },
    { id: "oignon-jaune", name: "oignon jaune", quantity: 1, unit: "piece", category: "fruit-vegetable" },
    { id: "oignon-rouge", name: "oignon rouge", quantity: 1, unit: "piece", category: "fruit-vegetable" },
    { id: "lemon", name: "citron", quantity: 1, unit: "piece", category: "fruit-vegetable" },
    { id: "catalog-citrons", name: "citrons", quantity: 2, unit: "piece", category: "fruit-vegetable" },
    { id: "catalog-citron-non-traite", name: "citron non traité", quantity: 1, unit: "piece", category: "fruit-vegetable" },
    { id: "mustard", name: "moutarde", quantity: 5, unit: "ml", category: "grocery" },
    { id: "moutarde-dijon", name: "moutarde de Dijon", quantity: 10, unit: "ml", category: "grocery" },
    { id: "moutarde-ancienne", name: "moutarde ancienne", quantity: 5, unit: "ml", category: "grocery" },
    { id: "moutarde-douce", name: "moutarde douce", quantity: 5, unit: "ml", category: "grocery" },
  ];
  const dish = recipe(784, { ingredients });
  const plan = {
    id: "week-reviewed-groups", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: profile, version: 1, estimatedCost: 1,
    meals: [{ id: "a", dayIndex: 0, mealType: "dinner", recipeId: dish.id, portions: 1, source: "manual" }],
  };
  const list = engine.buildShoppingList(plan, [dish]);
  const byId = new Map(list.map((item) => [item.ingredientId, item]));
  assert.deepEqual(byId.get("parsley").amounts, [{ unit: "g", quantity: 15 }]);
  assert.deepEqual(byId.get("mint").amounts, [{ unit: "g", quantity: 4 }, { unit: "piece", quantity: 1 }]);
  assert.deepEqual(byId.get("onion").amounts, [{ unit: "g", quantity: 100 }, { unit: "piece", quantity: 1 }]);
  assert.ok(byId.has("oignon-rouge"));
  assert.deepEqual(byId.get("lemon").amounts, [{ unit: "piece", quantity: 3 }]);
  assert.ok(byId.has("catalog-citron-non-traite"));
  assert.deepEqual(byId.get("mustard").amounts, [{ unit: "ml", quantity: 15 }]);
  assert.ok(byId.has("moutarde-ancienne"));
  assert.ok(byId.has("moutarde-douce"));
});

test("reviewed allergen and variety exceptions never merge in shopping", () => {
  const dish = recipe(785, { ingredients: [
    { id: "catalog-vinaigre-de-xeres", name: "vinaigre de Xérès", quantity: 15, unit: "ml", category: "grocery" },
    { id: "vinaigre-xeres", name: "vinaigre de Xérès", quantity: 15, unit: "ml", category: "grocery", allergens: ["sulfites"] },
    { id: "courge-musquee", name: "courge", quantity: 100, unit: "g", category: "fruit-vegetable" },
    { id: "courge-butternut", name: "courge", quantity: 100, unit: "g", category: "fruit-vegetable" },
  ] });
  const plan = { id: "week-exceptions", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile, version: 1, estimatedCost: 1, meals: [{ id: "a", dayIndex: 0, mealType: "dinner", recipeId: dish.id, portions: 1, source: "manual" }] };
  const ids = engine.buildShoppingList(plan, [dish]).map((item) => item.ingredientId);
  assert.ok(ids.includes("catalog-vinaigre-de-xeres") && ids.includes("vinaigre-xeres"));
  assert.ok(ids.includes("courge-musquee") && ids.includes("courge-butternut"));
});

test("shopping group validation rejects incomplete, overlapping and colliding definitions", () => {
  const known = new Set(["known-a", "known-b", "known-c"]);
  const valid = { shopping_id: "known-a", display_name: "Produit", category: "grocery", member_ids: ["known-a", "known-b"] };
  assert.equal(shopping.validateShoppingGroups([valid], known).length, 1);
  assert.throws(() => shopping.validateShoppingGroups([{ ...valid, display_name: "" }], known), /libellé/);
  assert.throws(() => shopping.validateShoppingGroups([{ ...valid, category: "ailleurs" }], known), /rayon/);
  assert.throws(() => shopping.validateShoppingGroups([{ ...valid, member_ids: ["known-a", "unknown"] }], known), /inconnu/);
  assert.throws(() => shopping.validateShoppingGroups([valid, { ...valid, shopping_id: "other", member_ids: ["known-b", "known-c"] }], known), /plusieurs groupes/);
  assert.throws(() => shopping.validateShoppingGroups([{ ...valid, shopping_id: "known-c" }], known), /collision/);
});

test("empty recipe diagnostics identify time, equipment and protected exclusions", () => {
  const recipes = [
    recipe(790, { prepMinutes: 35, equipment: ["hob"] }),
    recipe(791, { prepMinutes: 15, equipment: ["oven"] }),
    recipe(792, { prepMinutes: 15, equipment: ["hob"], allergens: ["arachides"] }),
  ];
  const diagnostic = engine.diagnoseRecipeCompatibility(recipes, { ...profile, allergies: ["arachides"] }, {
    mealType: "dinner",
    maxPrepMinutes: 15,
  });
  assert.equal(diagnostic.compatibleCount, 0);
  assert.equal(diagnostic.minimumCompatibleMinutes, 35);
  assert.deepEqual(diagnostic.missingEquipment, ["oven"]);
  assert.equal(diagnostic.blockedBy.allergies, 1);
});

test("tonight recommendations stay safe and favour ingredients already in reserve", () => {
  const options = [
    recipe(801, { ingredients: [{ id: "carrot", name: "Carotte", quantity: 1, unit: "piece", category: "fruit-vegetable" }] }),
    recipe(802, { ingredients: [{ id: "lentil", name: "Lentilles", quantity: 80, unit: "g", category: "grocery" }] }),
    recipe(803, { prepMinutes: 50 }),
    recipe(804, { allergens: ["arachides"] }),
  ];
  const recommendations = engine.recommendTonight(options, { ...profile, allergies: ["arachides"] }, {
    mealType: "dinner",
    maxPrepMinutes: 30,
    portions: 2,
    pantryIngredientIds: ["carrot"],
    limit: 3,
  });
  assert.equal(recommendations[0].recipe.id, "recipe-801");
  assert.equal(recommendations.some((item) => item.recipe.id === "recipe-803"), false);
  assert.equal(recommendations.some((item) => item.recipe.id === "recipe-804"), false);
  assert.equal(recommendations[0].estimatedCost, 4);

  const largerSet = Array.from({ length: 12 }, (_, index) => recipe(820 + index));
  assert.equal(engine.recommendTonight(largerSet, profile, {
    mealType: "dinner",
    maxPrepMinutes: 30,
    portions: 2,
    limit: 12,
  }).length, 12);
  assert.equal(engine.recommendTonight(largerSet, profile, {
    mealType: "dinner",
    maxPrepMinutes: 30,
    portions: 2,
  }).length, 3);
});

test("tonight recommendations spread serving forms without hiding compatible recipes", () => {
  const soups = Array.from({ length: 8 }, (_, index) => recipe(850 + index, {
    title: `Soupe test ${index + 1}`,
    tags: ["soupe"],
    prepMinutes: 10,
    costPerPortion: 1,
  }));
  const salads = Array.from({ length: 5 }, (_, index) => recipe(860 + index, {
    title: `Salade test ${index + 1}`,
    tags: ["salade"],
    prepMinutes: 15,
    costPerPortion: 1.5,
  }));
  const bowls = Array.from({ length: 5 }, (_, index) => recipe(870 + index, {
    title: `Bowl test ${index + 1}`,
    tags: ["bowl"],
    prepMinutes: 15,
    costPerPortion: 1.5,
  }));
  const varied = recipe(880, {
    title: "Poêlée test",
    tags: ["plat"],
    prepMinutes: 15,
    costPerPortion: 1.5,
  });
  const options = {
    mealType: "dinner",
    maxPrepMinutes: 30,
    portions: 2,
    limit: 19,
  };
  const first = engine.recommendTonight([...soups, ...salads, ...bowls, varied], profile, options);
  const second = engine.recommendTonight([...soups, ...salads, ...bowls, varied], profile, options);
  const firstPageForms = first.slice(0, 6).map(({ recipe: item }) => engine.recipeForm(item));
  const explicitCounts = firstPageForms.reduce((counts, form) => ({
    ...counts,
    [form]: (counts[form] ?? 0) + 1,
  }), {});

  assert.deepEqual(first, second);
  assert.equal(first.length, 19);
  assert.equal(new Set(first.map(({ recipe: item }) => item.id)).size, 19);
  assert.equal(new Set(firstPageForms).size, 4);
  assert.ok((explicitCounts.soup ?? 0) <= 2);
  assert.ok((explicitCounts.salad ?? 0) <= 2);
  assert.ok((explicitCounts.bowl ?? 0) <= 2);
  for (const pageStart of [0, 6]) {
    const forms = first.slice(pageStart, pageStart + 6).map(({ recipe: item }) => engine.recipeForm(item));
    const counts = forms.reduce((byForm, form) => ({
      ...byForm,
      [form]: (byForm[form] ?? 0) + 1,
    }), {});
    assert.ok(new Set(forms).size >= 3);
    assert.ok((counts.soup ?? 0) <= 2);
    assert.ok((counts.salad ?? 0) <= 2);
    assert.ok((counts.bowl ?? 0) <= 2);
  }

  const soupOnly = engine.recommendTonight(soups, profile, { ...options, limit: soups.length });
  assert.equal(soupOnly.length, soups.length);
  assert.equal(new Set(soupOnly.map(({ recipe: item }) => item.id)).size, soups.length);
});

test("contextual reminders cover same-day rest, next-day preparation and today's leftovers", () => {
  const recipes = [
    recipe(901, { restMinutes: 90 }),
    recipe(902, { restMinutes: 300 }),
    recipe(903),
  ];
  const plan = {
    id: "week-reminders", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: profile, estimatedCost: 1, version: 1,
    meals: [
      { id: "same-day", dayIndex: 0, mealType: "lunch", recipeId: "recipe-901", portions: 1, source: "generated" },
      { id: "tomorrow", dayIndex: 1, mealType: "dinner", recipeId: "recipe-902", portions: 1, source: "generated" },
      { id: "leftover", dayIndex: 0, mealType: "dinner", recipeId: "recipe-903", portions: 1, source: "manual", leftoverOf: "source" },
    ],
  };
  const reminders = engine.contextualRemindersForDate(plan, recipes, "2026-08-03");
  assert.deepEqual(new Set(reminders.map((item) => item.kind)), new Set(["rest-today", "start-tonight", "leftovers-today"]));
});

test("plant diversity counts distinct plants without water, oil or animal products", () => {
  const plants = recipe(950, { ingredients: [
    { id: "carrot", name: "Carotte", quantity: 1, unit: "piece", category: "fruit-vegetable" },
    { id: "cumin", name: "Cumin", quantity: 1, unit: "c_cafe", category: "grocery" },
    { id: "water", name: "Eau", quantity: 100, unit: "ml", category: "beverage" },
    { id: "olive-oil", name: "Huile d'olive", quantity: 1, unit: "c_soupe", category: "grocery" },
    { id: "salmon", name: "Saumon", quantity: 100, unit: "g", category: "meat-fish" },
  ] });
  const plan = { id: "week-plants", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z", profileSnapshot: profile, estimatedCost: 1, version: 1, meals: [
    { id: "meal", dayIndex: 0, mealType: "dinner", recipeId: plants.id, portions: 1, source: "generated" },
  ] };
  assert.deepEqual(engine.plantDiversityOf(plan, [plants]), { count: 2, ingredients: ["Carotte", "Cumin"] });
  assert.equal(engine.summarizePlan(plan, [plants], profile).plantDiversity, 2);
});

test('les allergies à un ingrédient excluent toutes ses variantes, même facultatives', async () => {
  const { RECIPES } = await import('../src/recipes.ts');
  const { DEFAULT_PROFILE } = await import('../src/domain.ts');
  const safeProfile = { ...DEFAULT_PROFILE, maxPrepMinutes:90, equipment:['hob','oven','microwave','blender','toaster','steamer'] };
  const salmon = RECIPES.find(item => item.id === 'saumon-brocoli-riz-complet');
  assert.equal(engine.recipeIsAllowed(salmon, safeProfile), true);
  const blockedProfile = {...safeProfile, allergies:['brocoli']};
  assert.equal(engine.recipeIsAllowed(salmon, blockedProfile), false);
  assert.equal(engine.recipeIsAllowed({...salmon, ingredients:salmon.ingredients.map(item=>({...item,optional:true}))}, blockedProfile), false);
  const plan=engine.generateWeeklyPlan(RECIPES,blockedProfile,{seed:'ingredient-allergy-regression',startsOn:'2026-09-07'});
  const byId=new Map(RECIPES.map(item=>[item.id,item]));
  for(const meal of plan.meals) assert.ok(!byId.get(meal.recipeId).ingredients.some(item=>['broccoli','brocoli-chinois'].includes(shopping.canonicalIngredientId(item.id))));
  assert.equal(engine.diagnoseRecipeCompatibility([salmon],blockedProfile,{mealType:salmon.mealTypes[0]}).blockedBy.allergies,1);
  assert.throws(()=>engine.assignRecipeToSlot(plan,plan.meals.find(meal=>meal.mealType===salmon.mealTypes[0]),salmon,RECIPES,blockedProfile),/profil/);
});

test('une restriction allergique inconnue issue d’un ancien profil ne devient jamais permissive', () => {
  const restricted={...profile,allergies:['brocolii']};
  assert.equal(engine.recipeIsAllowed(catalogue[0],restricted),false);
  assert.throws(()=>engine.generateWeeklyPlan(catalogue,restricted),/Restriction non reconnue/);
});

test('la résolution des exclusions conserve toutes les variantes sans confondre poire et poireau', async () => {
  const {resolveIngredientExclusions}=await import('../src/food-restrictions.ts');
  const pears=resolveIngredientExclusions(['poire']);
  assert.ok(pears.ids.includes('pear'));
  assert.ok(pears.ids.includes('poire-nashi'));
  assert.ok(!pears.ids.includes('leek'));
  assert.deepEqual(resolveIngredientExclusions(['brocoli']).ids.sort(),['broccoli','brocoli-chinois'].sort());
  assert.deepEqual(resolveIngredientExclusions(['brocolii']).unknown,['brocolii']);
  assert.deepEqual(resolveIngredientExclusions(['de']).ids,[]);
});

test('retirer une substitution ne peut pas réintroduire un allergène ou un ingrédient refusé', () => {
  const feta=recipe(5,{allergens:['lait'],ingredients:[{id:'feta',name:'feta',quantity:20,unit:'g',category:'fresh',allergens:['lait']}]});
  const plan=engine.generateWeeklyPlan(catalogue,profile,{seed:3});
  const meal={...plan.meals[0],recipeId:feta.id,substitutions:[{ingredientId:'feta',substitutionId:'feta-to-tofu'}]};
  const substituted={...plan,meals:[meal]};
  const before=structuredClone(substituted);
  assert.throws(()=>engine.setMealIngredientSubstitution(substituted,meal.id,'feta',null,[feta],{...profile,allergies:['lait']}),/profil alimentaire/);
  assert.throws(()=>engine.setMealIngredientSubstitution(substituted,meal.id,'feta',null,[feta],{...profile,excludedIngredientIds:['feta']}),/profil alimentaire/);
  assert.deepEqual(substituted,before);
  assert.deepEqual(engine.setMealIngredientSubstitution(substituted,meal.id,'feta',null,[feta],profile).meals[0].substitutions,[]);
});

test('le cache de classement suit une recette modifiée même si son identifiant ne change pas', () => {
  const original = recipe(0, { tags: [] });
  const withGrain = { ...original, tags: ['céréales-complètes'] };
  const optionalGrain = { ...withGrain, ingredients: [{ ...original.ingredients[0], name: 'Céréales complètes', optional: true }] };
  const plan = {
    startsOn: '2026-09-07', profileSnapshot: profile, estimatedCost: 2,
    meals: [{ id: 'day-0-lunch', dayIndex: 0, mealType: 'lunch', recipeId: original.id, portions: 1 }],
  };
  for (const [version, expected] of [[original, 0], [withGrain, 1], [optionalGrain, 0], [withGrain, 1], [original, 0]]) {
    assert.equal(engine.summarizePlan(plan, [version]).wholeGrainMeals, expected);
  }
});
