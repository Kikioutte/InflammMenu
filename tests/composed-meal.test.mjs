import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeMeal } from '../src/composed-meal.ts';
import { DEFAULT_PROFILE } from '../src/domain.ts';
import { assignRecipeToSlot, buildShoppingList, generateWeeklyPlan, recipeIsAllowed, setMealPortions } from '../src/engine.ts';
import { migrateAppState, DEFAULT_APP_STATE, exportAppState, importAppState } from '../src/storage.ts';
import { IMPORTED_PLAN_RECIPES } from '../src/planner-catalog.ts';
const catalogue = JSON.parse(readFileSync(new URL('../src/data/recettes-anti-inflammatoires.json', import.meta.url))).recipes;
const get = id => catalogue.find(recipe => recipe.id === id);
const make = () => composeMeal(get('r1017'), get('r711'), get('r824'), '/assets/recipe-placeholder.svg');
const profile = { ...DEFAULT_PROFILE, maxPrepMinutes: 120, weeklyBudget: 500, equipment: ['hob','oven','blender','steamer','microwave','toaster'] };

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
