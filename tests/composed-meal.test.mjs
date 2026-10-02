import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeMeal } from '../src/composed-meal.ts';
import { DEFAULT_PROFILE } from '../src/domain.ts';
import { assignRecipeToSlot, buildShoppingList, generateWeeklyPlan, recipeIsAllowed, setMealPortions } from '../src/engine.ts';
import { migrateAppState, DEFAULT_APP_STATE, exportAppState, importAppState } from '../src/storage.ts';
import { IMPORTED_PLAN_RECIPES } from '../src/planner-catalog.ts';
import { mealBuilderEligible, mealBuilderGroupFor, compositionSelectionError } from '../src/meal-composition-rules.ts';
import { isAssociationRecipe, evaluateAssociations } from '../src/food-associations.ts';
const catalogue = JSON.parse(readFileSync(new URL('../src/data/recettes-anti-inflammatoires.json', import.meta.url))).recipes;
const get = id => catalogue.find(recipe => recipe.id === id);
const make = () => composeMeal(get('r1017'), get('r711'), get('r824'), '/assets/recipe-placeholder.svg');
const profile = { ...DEFAULT_PROFILE, maxPrepMinutes: 120, weeklyBudget: 500, equipment: ['hob','oven','blender','steamer','microwave','toaster'] };

test('meal builder excludes every nonplannable starter or main and preserves complementary desserts', () => {
  const previouslyOffered = catalogue.filter(recipe => isAssociationRecipe(recipe.id)
    && ['soupe', 'salade', 'plat'].includes(recipe.categorie)
    && !recipe.app.planner.eligible
    && ['verte', 'orange'].includes(evaluateAssociations(recipe.ingredients).level));
  assert.equal(previouslyOffered.length, 106);
  for (const recipe of previouslyOffered) assert.equal(mealBuilderEligible(recipe), false, recipe.id);
  for (const recipe of catalogue.filter(mealBuilderEligible)) {
    assert.equal(Boolean(recipe.app.duplicate_of), false, recipe.id);
    assert.equal(Boolean(recipe.creami), false, recipe.id);
    if (mealBuilderGroupFor(recipe) !== 'dessert') assert.equal(recipe.app.planner.eligible, true, recipe.id);
  }
  const dessert = get('r824');
  assert.equal(dessert.app.planner.eligible, false);
  assert.equal(mealBuilderEligible(dessert), true);
  assert.equal(compositionSelectionError({ starter: get('r1017'), main: get('r711'), dessert }), null);
  assert.doesNotThrow(make);
});

test('saving and final composition share the same named exclusion for the audited r765 meal', () => {
  const selection = { starter: get('r765'), main: get('r838'), dessert: get('r825') };
  const error = compositionSelectionError(selection);
  assert.ok(error.includes(selection.starter.titre));
  assert.match(error, /exclue de la planification/);
  assert.equal(mealBuilderEligible(selection.starter), false);
  assert.throws(() => composeMeal(selection.starter, selection.main, selection.dessert, ''), { message: error });
});

test('final validation rejects duplicates, CREAMi, missing categories and invalid quantities before save or plan', () => {
  const selection = { starter: get('r1017'), main: get('r711'), dessert: get('r824') };
  for (const bad of [
    { ...selection.starter, app: { ...selection.starter.app, duplicate_of: 'r1' } },
    { ...selection.starter, app: { ...selection.starter.app, planner: { ...selection.starter.app.planner, eligible: false } } },
    { ...selection.starter, ingredients: selection.starter.ingredients.map((item, index) => index ? item : { ...item, quantite_normalisee: Number.NaN }) },
  ]) {
    const candidate = { ...selection, starter: bad };
    const error = compositionSelectionError(candidate);
    assert.equal(mealBuilderEligible(bad), false);
    assert.ok(error);
    assert.throws(() => composeMeal(candidate.starter, candidate.main, candidate.dessert, ''), { message: error });
  }
  const creami = { ...selection.dessert, creami: { modele: 'Ninja CREAMi Deluxe (NC501EU)', programme: 'SORBET', zone: 'FULL' } };
  assert.equal(mealBuilderEligible(creami), false);
  assert.ok(compositionSelectionError({ ...selection, dessert: creami }));
  assert.match(compositionSelectionError({ main: selection.main }), /Complétez/);
  assert.match(compositionSelectionError({ ...selection, starter: selection.main }), /entrée/);
});

test('complete meal preserves sources, quantities, cost and associations', () => {
 const meal = make();
 assert.equal(meal.prepMinutes, 65);
 assert.equal(meal.composition.dessert, 'r824');
 assert.equal(recipeIsAllowed(meal, profile), true);
 assert.equal(recipeIsAllowed(meal, {...profile, associationMode:'green'}), false);
 assert.equal(recipeIsAllowed(meal, {...profile, allergies:['poisson']}), false);
 assert.equal(recipeIsAllowed(meal, {...profile, equipment:['hob','oven']}), false);
 assert.equal(recipeIsAllowed(meal, {...profile, maxPrepMinutes:30}), false);
 assert.equal(recipeIsAllowed(meal, {...profile, dislikedRecipeIds:['catalog-r824']}), false);
 assert.throws(() => composeMeal(get('r875'), get('r711'), get('r824'), ''), /associations/);
 assert.throws(() => composeMeal(get('r1017'), get('r711'), {...get('r824'), app:{...get('r824').app, duplicate_of:'r1'}}, ''), /exclue/);
});

test('planning includes all courses in shopping and preserves them through backup', () => {
 const meal = make(), recipes = [...IMPORTED_PLAN_RECIPES, meal];
 const base = generateWeeklyPlan(IMPORTED_PLAN_RECIPES, profile, {startsOn:'2026-09-07'});
 const plan = assignRecipeToSlot(base, {dayIndex:0,mealType:'lunch'}, meal, recipes, profile);
 const slot = plan.meals.find(item=>item.dayIndex===0&&item.mealType==='lunch');
 const four = setMealPortions(plan, slot.id, 4, recipes);
 const only = {...four, meals:four.meals.filter(item=>item.id===slot.id)};
 const list = buildShoppingList(only, recipes);
 const banana = meal.ingredients.find(item=>item.name.includes('banane'));
 assert.ok(list.some(item=>item.ingredientId===banana.id && item.amounts.some(amount=>amount.quantity===banana.quantity*4)));
 const restored = importAppState(exportAppState(migrateAppState({...DEFAULT_APP_STATE, profile, currentPlan:four, composedRecipes:[meal]})));
 assert.equal(restored.composedRecipes.length, 1);
 assert.deepEqual(restored.composedRecipes[0].composition,meal.composition);
 assert.deepEqual(buildShoppingList(restored.currentPlan, [...IMPORTED_PLAN_RECIPES,...restored.composedRecipes]),buildShoppingList(four,recipes));
});

test('complete meals are never automatically drawn', () => {
 const meal = make();
 const result = generateWeeklyPlan([...IMPORTED_PLAN_RECIPES,meal], profile,{startsOn:'2026-09-07',favoriteRecipeIds:[meal.id]});
 assert.equal(result.meals.some(item=>item.recipeId===meal.id),false);
});

test('editing a composition retains its live slot and portions and refuses stale targets', async () => {
 const { updatePlannedComposition, compositionTitlesFor } = await import('../src/composed-meal.ts');
 const first = make();
 const next = composeMeal(get('r1017'), get('r711'), get('r830'), '/assets/recipe-placeholder.svg');
 const recipes = [...IMPORTED_PLAN_RECIPES,first,next];
 const base = generateWeeklyPlan(IMPORTED_PLAN_RECIPES, profile, {startsOn:'2026-09-07'});
 let plan = assignRecipeToSlot(base,{dayIndex:0,mealType:'lunch'},first,recipes,profile);
 const slot = plan.meals.find(item=>item.dayIndex===0&&item.mealType==='lunch');
 plan = {...setMealPortions(plan,slot.id,4,recipes),meals:plan.meals.map(item=>item.id===slot.id?{...item,portions:4,locked:true}:item)};
 const target={planId:plan.id,slotId:slot.id,recipeId:first.id,dayIndex:0,mealType:'lunch'};
 const changed=updatePlannedComposition(plan,target,next,recipes,profile);
 const updated=changed.meals.find(item=>item.id===slot.id);
 assert.equal(updated.recipeId,next.id);assert.equal(updated.portions,4);assert.equal(updated.locked,true);
 assert.deepEqual(changed.meals.filter(item=>item.id!==slot.id),plan.meals.filter(item=>item.id!==slot.id));
 assert.throws(()=>updatePlannedComposition({...plan,id:'other-week'},target,next,recipes,profile),/changé/);
 assert.throws(()=>updatePlannedComposition(changed,target,first,recipes,profile),/changé/);
 assert.throws(()=>updatePlannedComposition(plan,target,next,recipes,{...profile,allergies:['poisson']}),/critères/);
 assert.deepEqual(compositionTitlesFor({...first,compositionTitles:undefined}),first.compositionTitles);
});
