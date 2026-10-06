import assert from 'node:assert/strict';
import test from 'node:test';
import { beforeInstructionsReview } from './helpers/recipe-instructions-review.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalIngredientId } from '../src/shopping.ts';
import { evaluateAssociations, evaluateAssociationMeal, associationMealIsCompatible, associationRecipeAllowed, isAssociationRecipe } from '../src/food-associations.ts';
import { generateWeeklyPlan, recipeIsAllowed, scaleIngredients, buildShoppingList, diagnoseRecipeCompatibility, getReplacementCandidates, setMealIngredientSubstitution } from '../src/engine.ts';
import { DEFAULT_PROFILE } from '../src/domain.ts';
import { migrateAppState, DEFAULT_APP_STATE } from '../src/storage.ts';
import { validateCatalogueData } from '../src/catalog-validation.ts';
import { catalogueShoppingRecipe } from '../src/personal-library.ts';
const read = async (file) => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
const catalogue = await read('../src/data/recettes-anti-inflammatoires.json');
const baseline = await read('../research/association-baseline-catalogue.json');
const collection = await read('../research/association-collection.json');
const planner = await read('../src/data/planner-recipes.json');
const authored = planner.filter((recipe) => isAssociationRecipe(recipe.id));
const culinarySnapshot = (recipes) => recipes.map(({ image, ...recipe }) => recipe);
const ingredient = (id) => ({ id });
const profile = { ...DEFAULT_PROFILE, associationMode: 'green-orange', maxPrepMinutes: 90, weeklyBudget: 500, equipment: ['hob','oven','blender','steamer'], weeklyTargets: { legumeMeals: 2, fishMeals: 2 } };

test('30 additions are strictly green, preserve the first 200 and differ from the previous catalogue', () => {
  const added=collection.slice(200,230);
  assert.equal(added.length,30);
  assert.equal(createHash('sha256').update(JSON.stringify(culinarySnapshot(collection.slice(0,200)))).digest('hex'),'3370838374336099398715c8834d11b84850828693b0bd88ce64bf15ebe52239');
  const signature=r=>new Set(r.ingredients.map(i=>canonicalIngredientId(i.id)).filter(id=>!['eau','huile-olive-vierge-extra'].includes(id)));
  for (const recipe of added) {
    assert.equal(evaluateAssociations(recipe.ingredients).level,'verte',recipe.titre);
    assert.deepEqual(recipe.associations.paires,[]);
    for (const previous of catalogue.recipes.slice(0,830)) {
      const a=signature(recipe),b=signature(previous);
      const overlap=[...a].filter(id=>b.has(id)).length/new Set([...a,...b]).size;
      assert.ok(overlap<.7,`${recipe.titre} trop proche de ${previous.titre}`);
    }
  }
});

test('strict green mode generates a complete week without orange additions', () => {
  for (const seed of [3,19,62]) {
    const strict={...profile,associationMode:'green'};
    const plan=generateWeeklyPlan(planner,strict,{seed,startsOn:'2026-09-07'});
    assert.equal(plan.meals.length,14);
    for (const meal of plan.meals) assert.equal(evaluateAssociations(planner.find(r=>r.id===meal.recipeId).ingredients).level,'verte');
  }
});

test('the next 20 ideas become strictly green cards and preserve the previous 230', async () => {
  const added=collection.slice(230,250);
  const ideas=await read('../research/green-next-ideas-validation.json');
  assert.equal(added.length,20);
  assert.equal(createHash('sha256').update(JSON.stringify(culinarySnapshot(collection.slice(0,230)))).digest('hex'),'33986f1da698e611825c1503c245f8eea2dd4e90826442391fa1df84fa33f97d');
  for (const recipe of added) {
    assert.equal(evaluateAssociations(recipe.ingredients).level,'verte',recipe.titre);
    const idea=ideas.find(idea=>idea.titre===recipe.titre);
    assert.ok(idea,recipe.titre);
    assert.deepEqual(recipe.ingredients.map(i=>i.id).sort(),[...idea.ids].sort());
    const signature=r=>new Set(r.ingredients.map(i=>canonicalIngredientId(i.id)).filter(id=>!['eau','huile-olive-vierge-extra'].includes(id)));
    const a=signature(recipe);
    for (const previous of catalogue.recipes.slice(0,860)) {
      const b=signature(previous);
      assert.ok([...a].filter(id=>b.has(id)).length/new Set([...a,...b]).size<.7,`${recipe.titre} trop proche de ${previous.titre}`);
    }
  }
});

test('the chart keeps explicit green, orange, gray and unknown outcomes', () => {
  assert.equal(evaluateAssociations(['brocoli','courgette'].map(ingredient)).level, 'verte');
  assert.equal(evaluateAssociations(['riz-complet','huile-olive-vierge-extra'].map(ingredient)).level, 'orange');
  assert.equal(evaluateAssociations(['riz-complet','tomate'].map(ingredient)).level, 'grise');
  assert.equal(evaluateAssociations(['huile-olive-vierge-extra','citron'].map(ingredient)).level, 'grise');
  assert.equal(evaluateAssociations(['amande','noisette'].map(ingredient)).level, 'orange');
  assert.equal(evaluateAssociations(['ingredient-inconnu','courgette'].map(ingredient)).level, 'non-classee');
  assert.equal(evaluateAssociations([]).level, 'non-classee');
});

test('the progressive meal builder keeps only complete compatible combinations', () => {
  const recipes = new Map(catalogue.recipes.map((recipe) => [recipe.id, recipe]));
  const main = recipes.get('r711');
  const dessert = recipes.get('r824');
  const compatibleStarter = recipes.get('r718');
  const starterRejectedAfterDessert = recipes.get('r672');
  assert.ok(main && dessert && compatibleStarter && starterRejectedAfterDessert);
  assert.equal(associationMealIsCompatible([main, starterRejectedAfterDessert]), true);
  assert.equal(associationMealIsCompatible([main, dessert, starterRejectedAfterDessert]), false);
  assert.equal(evaluateAssociationMeal([main, dessert, starterRejectedAfterDessert]).level, 'grise');
  assert.equal(associationMealIsCompatible([main, dessert, compatibleStarter]), true);
  assert.equal(evaluateAssociationMeal([main, dessert, compatibleStarter]).level, 'orange');
});

test('the 207 additions reach 300 green recipes without changing the previous 250 or counting herb-only variants', async () => {
  const added=collection.slice(250,457);
  assert.equal(added.length,207);
  assert.equal(collection.slice(0,457).filter(r=>r.associations.niveau==='verte').length,300);
  assert.equal(createHash('sha256').update(JSON.stringify(culinarySnapshot(collection.slice(0,250)))).digest('hex'),'52da34bbcc86989c71527a41d3264e9beeb28106e9fca37cbb8c92f4ff981817');
  const registry=await read('../src/data/association-ingredients.json');
  const ignored=new Set(['eau','huile-olive-vierge-extra',...Object.keys(registry).filter(id=>/basilic|persil|ciboulette/i.test(registry[id].name))].map(canonicalIngredientId));
  const signature=r=>new Set(r.ingredients.map(i=>canonicalIngredientId(i.id)).filter(id=>!ignored.has(id)));
  const seen=catalogue.recipes.slice(0,880).map(r=>({title:r.titre,ids:signature(r)}));
  for (const recipe of added) {
    const result=evaluateAssociations(recipe.ingredients);
    assert.equal(result.level,'verte',recipe.titre);
    assert.deepEqual(result.pairs,[]);
    assert.deepEqual(result.unknown,[]);
    const ids=signature(recipe);
    for (const previous of seen) assert.ok([...ids].filter(id=>previous.ids.has(id)).length/new Set([...ids,...previous.ids]).size<.7,`${recipe.titre} trop proche de ${previous.title}`);
    seen.push({title:recipe.titre,ids});
  }
});

test('whole meal catches incompatibility between two individually acceptable dishes', () => {
  const a = { ingredients: ['riz-complet','brocoli'].map(ingredient) };
  const b = { ingredients: ['tomate','concombre'].map(ingredient) };
  assert.equal(evaluateAssociations(a.ingredients).level, 'verte');
  assert.equal(evaluateAssociations(b.ingredients).level, 'orange');
  const result = evaluateAssociationMeal([a,b]);
  assert.equal(result.level, 'grise');
  assert.ok(result.pairs.some((pair) => pair.level === 'grise' && /riz/.test(pair.a)));
});

test('all authored recipes match the chart at runtime, preserving the original 630 except documented instruction-review changes', () => {
  assert.equal(collection.length, catalogue.recipes.length - 630);
  assert.deepEqual(catalogue.recipes.slice(0,630).map(beforeInstructionsReview),baseline.recipes);
  assert.equal(validateCatalogueData(catalogue).recipes.length,catalogue.recipes.length);
  const signatures = new Set();
  for (const recipe of collection) {
    const result = evaluateAssociations(recipe.ingredients);
    assert.equal(result.level, recipe.associations.niveau, recipe.titre);
    assert.ok(['verte','orange'].includes(result.level),recipe.titre);
    assert.deepEqual(result.unknown,[]);
    assert.ok(recipe.ingredients.every((i) => i.quantite > 0 && !i.facultatif));
    assert.ok(recipe.ingredients.every((i) => !i.allergenes.some((a) => ['lait','gluten'].includes(a))));
    assert.ok(recipe.etapes.length >= 4);
    assert.equal(recipe.score_anti_inflammatoire,null);
    assert.equal(recipe.temps.total,recipe.temps.preparation+recipe.temps.cuisson+recipe.temps.repos);
    const signature = recipe.ingredients.map((i) => i.id).filter((id) => !['eau','huile-olive-vierge-extra'].includes(id)).sort().join('|');
    assert.ok(!signatures.has(signature),recipe.titre);signatures.add(signature);
  }
});

test('generator respects the dedicated collection, allergies, exclusions and orange opt-in', () => {
  for (const seed of [1,17,94]) {
    const plan = generateWeeklyPlan(planner,profile,{ seed, startsOn: '2026-09-07' });
    assert.equal(plan.meals.length,14);
    for (const meal of plan.meals) {
      const recipe = planner.find((r) => r.id === meal.recipeId);
      assert.ok(isAssociationRecipe(recipe.id));
      assert.ok(recipeIsAllowed(recipe,profile));
    }
  }
  const orange=authored.find((r)=>evaluateAssociations(r.ingredients).level==='orange');
  assert.equal(associationRecipeAllowed(orange,'green'),false);
  assert.equal(associationRecipeAllowed(orange,'green-orange'),true);
  const fish=authored.find((r)=>r.allergens.includes('poisson'));
  assert.equal(recipeIsAllowed(fish,{...profile,allergies:['poisson']}),false);
  assert.equal(recipeIsAllowed(fish,{...profile,excludedIngredientIds:[fish.ingredients[0].id]}),false);
  assert.equal(recipeIsAllowed(planner.find((r)=>!isAssociationRecipe(r.id)),profile),false);
});

test('portion scaling and shopping quantities stay exact for the authored recipes', () => {
  const recipe=authored.find((r)=>r.ingredients.some((i)=>i.id==='riz-complet'));
  const original=recipe.ingredients.find((i)=>i.id==='riz-complet');
  const scaled=scaleIngredients(recipe,4).find((i)=>i.id==='riz-complet');
  assert.equal(scaled.quantity,original.quantity*4);
  const plan={id:'test',startsOn:'2026-09-07',generatedAt:'2026-09-06T12:00:00Z',version:1,profileSnapshot:profile,estimatedCost:0,meals:[{id:'m',dayIndex:0,mealType:'lunch',recipeId:recipe.id,portions:4,source:'manual'}]};
  const shopping=buildShoppingList(plan,[recipe]);
  assert.ok(shopping.some((item)=>item.amounts.some((a)=>a.unit==='g' && a.quantity===scaled.quantity)));
  assert.ok(!shopping.some((item)=>item.ingredientId==='eau'));
});

test('profile persistence retains the mode and rejects unknown modes', () => {
  assert.equal(migrateAppState({...DEFAULT_APP_STATE,profile}).profile.associationMode,'green-orange');
  assert.equal(migrateAppState({...DEFAULT_APP_STATE,profile:{...profile,associationMode:'relaxed'}}).profile.associationMode,'off');
});

test('diagnostic and replacements never silently bypass associations', () => {
  const strict={...profile,associationMode:'green',maxPrepMinutes:1};
  const diagnostic=diagnoseRecipeCompatibility(planner,strict,{mealType:'dinner'});
  assert.equal(diagnostic.compatibleCount,0);
  assert.ok(diagnostic.blockedBy.associations>0);
  const plan=generateWeeklyPlan(planner,profile,{seed:44,startsOn:'2026-09-07'});
  const candidates=getReplacementCandidates(plan,plan.meals[0].id,planner,profile,'Plus rapide');
  assert.ok(candidates.every((r)=>associationRecipeAllowed(r,profile.associationMode)));
  const recipe=planner.find((r)=>r.id===plan.meals[0].recipeId);
  assert.throws(()=>setMealIngredientSubstitution(plan,plan.meals[0].id,recipe.ingredients[0].id,'unreviewed',planner,profile),/substitutions culinaires/);
});

test('120 illustrated additions stay green, distinct and scalable', async () => {
  const added = catalogue.recipes.slice(1087,1207);
  assert.equal(added.length, 120);
  const images = await read('../research/generated-images-r1088-r1207-provenance.json');
  assert.equal(new Set(images.images.map(image => image.sha256)).size, 120);
  const seen = catalogue.recipes.slice(0,1087).map(r => new Set(r.ingredients.map(i => canonicalIngredientId(i.id)).filter(id => id !== 'eau')));
  for (const recipe of added) {
    assert.equal(evaluateAssociations(recipe.ingredients).level, 'verte', recipe.titre);
    assert.equal(recipe.image.statut, 'generated_inspected_optimized');
    const ids = new Set(recipe.ingredients.map(i => canonicalIngredientId(i.id)).filter(id => id !== 'eau'));
    for (const prior of seen) assert.ok([...ids].filter(id => prior.has(id)).length / new Set([...ids,...prior]).size < .7, recipe.titre);
    seen.push(ids);
    const projected = planner.find(r => r.id === `catalog-${recipe.id}`);
    if (projected) {
      for (const portions of [1,4,8]) {
        const scaled = scaleIngredients(projected, portions);
        for (const ingredient of scaled) {
          const original = projected.ingredients.find(i => i.id === ingredient.id);
          assert.equal(ingredient.quantity, original.quantity * portions);
        }
      }
    }
  }
});

test('50 September 30 cards preserve source mapping, green associations and original catalogue', async () => {
  const added = catalogue.recipes.slice(1207,1257);
  const source = (await read('../research/recipes-r1208-r1257-source.json')).recipes;
  const images = (await read('../research/generated-images-r1208-r1257-provenance.json')).images;
  assert.equal(added.length, 50);
  assert.equal(new Set(added.map(r => r.image.nom_fichier)).size, 50);
  const signature = r => [...new Set(r.ingredients.map(i => canonicalIngredientId(i.id)).filter(id => !['eau','huile-olive-vierge-extra','basil','persil-plat','ciboulette-fraiche'].includes(id)))].sort().join('|');
  const seen = new Set(catalogue.recipes.slice(0,1207).map(signature));
  for (const [index, recipe] of added.entries()) {
    assert.equal(recipe.id, `r${1208+index}`);
    assert.equal(recipe.source_image_id, source[index].image_id);
    assert.equal(recipe.titre, source[index].titre);
    assert.equal(images[index].file, recipe.image.nom_fichier);
    assert.ok(images[index].bytes <= 350*1024);
    assert.equal(evaluateAssociations(recipe.ingredients).level, 'verte', recipe.titre);
    assert.deepEqual(evaluateAssociations(recipe.ingredients).unknown, []);
    assert.ok(!seen.has(signature(recipe)), recipe.titre); seen.add(signature(recipe));
    assert.ok(!catalogue.recipes.slice(0,1207).some(r => r.titre === recipe.titre));
    assert.deepEqual(beforeInstructionsReview(recipe).etapes, source[index].etapes);
    assert.equal(recipe.app.planner.eligible, recipe.categorie === 'plat' && recipe.nutrition_par_portion.calories >= 220);
    assert.equal(planner.some(r => r.id === `catalog-${recipe.id}`), recipe.app.planner.eligible);
  }
});

test('the 64 October 5 additions are individually green, known, distinct and scalable from two to four portions', async () => {
  const added = catalogue.recipes.slice(1257,1321);
  const summary = await read('../src/data/catalogue-summary.json');
  assert.equal(catalogue.recipes.length,1321);
  assert.equal(summary.nombre_recettes,1321);
  assert.equal(summary.nombre_recettes_visibles,1315);
  assert.equal(summary.nombre_doublons_exclus,6);
  assert.equal(collection.filter((recipe) => recipe.associations.niveau === 'verte').length,534);
  assert.equal(added.length,64);
  assert.equal(added.filter((recipe) => recipe.app.planner.eligible).length,28);
  assert.deepEqual(added.map((recipe) => recipe.id),Array.from({length:64},(_,index) => `r${1258+index}`));
  assert.equal(new Set(added.map((recipe) => recipe.titre)).size,64);
  assert.equal(new Set(added.map((recipe) => recipe.slug)).size,64);
  const ignored = new Set(['eau','huile-olive-vierge-extra','basil','persil-plat','ciboulette-fraiche']);
  const signature = (recipe) => [...new Set(recipe.ingredients.map((ingredient) => canonicalIngredientId(ingredient.id)).filter((id) => !ignored.has(id)))].sort().join('|');
  const signatures = new Set(catalogue.recipes.slice(0,1257).map(signature));
  for (const recipe of added) {
    assert.equal(recipe.portions,2,recipe.id);
    assert.equal(recipe.app.duplicate_of,undefined,recipe.id);
    assert.ok(!catalogue.recipes.slice(0,1257).some((previous) => previous.titre === recipe.titre),recipe.id);
    const result = evaluateAssociations(recipe.ingredients);
    assert.equal(result.level,'verte',recipe.id);
    assert.deepEqual(result.unknown,[],recipe.id);
    assert.deepEqual(result.pairs,[],recipe.id);
    assert.equal(recipe.associations.niveau,'verte',recipe.id);
    assert.deepEqual(recipe.associations.paires,[],recipe.id);
    assert.ok(!signatures.has(signature(recipe)),`${recipe.id}: duplicate core ingredients`);
    signatures.add(signature(recipe));
    assert.ok(recipe.ingredients.every((ingredient) => Number.isFinite(ingredient.quantite_normalisee) && ingredient.quantite_normalisee > 0 && ingredient.facultatif === false),recipe.id);
    const projected = catalogueShoppingRecipe(recipe,'');
    assert.ok(projected,`${recipe.id}: manual recipe projection exists even when excluded from the planner`);
    const atTwo = scaleIngredients(projected,2);
    const atFour = scaleIngredients(projected,4);
    for (const [index,ingredient] of recipe.ingredients.entries()) {
      assert.equal(atTwo[index].quantity,ingredient.quantite_normalisee,`${recipe.id}: two portions of ${ingredient.id}`);
      assert.equal(atFour[index].quantity,ingredient.quantite_normalisee*2,`${recipe.id}: four portions of ${ingredient.id}`);
      assert.equal(atFour[index].unit,ingredient.unite_normalisee,recipe.id);
    }
    assert.equal(planner.some((item) => item.id === `catalog-${recipe.id}`),recipe.app.planner.eligible,recipe.id);
  }
});

test('filtered preparations never publish whole-ingredient nutrition or join the weekly generator', () => {
  const filtered = catalogue.recipes.slice(1257,1321).filter((recipe) => recipe.nutrition_par_portion.estimation.statut === 'unavailable-filtered-yield');
  assert.deepEqual(filtered.map((recipe) => recipe.id).sort(),['r1274','r1279','r1311','r1314']);
  for (const recipe of filtered) {
    assert.equal(recipe.app.planner.eligible,false,recipe.id);
    assert.ok(!planner.some((item) => item.id === `catalog-${recipe.id}`),recipe.id);
    for (const nutrient of ['calories','proteines_g','glucides_g','sucres_g','lipides_g','acides_gras_satures_g','fibres_g','sodium_mg']) {
      assert.equal(recipe.nutrition_par_portion[nutrient],null,`${recipe.id}: ${nutrient} cannot be inferred from the unfiltered ingredients`);
    }
  }
});
