import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { canonicalIngredientId } from '../src/shopping.ts';

// Reuse reviewed conversions. Never infer grams from a unit or replace a
// missing nutrient with zero. Prices have no corresponding ingredient data.
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path,root),'utf8'));
const [catalogue, planner, ciqual, usda] = await Promise.all([
  read('src/data/recettes-anti-inflammatoires.json'), read('src/data/planner-recipes.json'),
  read('research/ciqual-2025-core.json'), read('research/usda-sr-fallbacks.json'),
]);
const foods = {
  ciqual: new Map(ciqual.foods.map(food => [String(food.code), food])),
  'usda-sr': new Map(usda.foods.map(food => [String(food.fdc_id), food])),
};
const mappings = [];
for (const name of (await readdir(new URL('research/',root))).sort()) {
  const match=name.match(/^ciqual-map-r(\d+)-r(\d+)\.json$/);
  if(match) mappings.push({start:Number(match[1]),end:Number(match[2]),ingredients:(await read('research/'+name)).ingredients});
}
const fields = {
  calories: ['energy_kcal', 'calories', 0],
  protein: ['protein_g', 'proteines_g', 1],
  fiber: ['fiber_g', 'fibres_g', 1],
};
const result={available:{},unavailable:{}};
for(const projected of planner) {
  const recipe=catalogue.recipes.find(r=>'catalog-'+r.id===projected.id);
  const estimate=recipe.nutrition_par_portion.estimation;
  try {
    if(!estimate?.statut?.startsWith('calculated')) throw Error('no ingredient calculation');
    const ordinal=Number(recipe.id.slice(1));
    const mapping=mappings.find(m=>m.start<=ordinal&&m.end>=ordinal);
    if(!mapping)throw Error('no reviewed mapping');
    let detailIndex=0;
    const coefficients=[];
    for(let index=0;index<recipe.ingredients.length;index++) {
      const ingredient=recipe.ingredients[index];
      const projectedIngredient=projected.ingredients[index];
      const entry = {
        id: projectedIngredient.id, unit: projectedIngredient.unit,
        optional: projectedIngredient.optional === true, quantity: projectedIngredient.quantity,
        calories: 0, protein: 0, fiber: 0,
      };
      if(!ingredient.facultatif) {
        const detail=estimate.details[detailIndex++];
        if(!detail || canonicalIngredientId(detail.ingredient_id)!==entry.id) throw Error('ingredient/detail mismatch');
        const match=mapping.ingredients.find(i=>i.ingredient_id===detail.ingredient_id);
        if(!match || !['validated','caution'].includes(match.review_status))throw Error('mapping not reviewed');
        assert.equal(match.source_dataset ?? 'ciqual', detail.source_dataset, 'reviewed dataset changed');
        assert.equal(String(match.selected_source_code ?? match.selected_ciqual_code), String(detail.source_code), 'reviewed food changed');
        const override=match.occurrence_overrides?.[recipe.id];
        const grams = override?.grams_total ?? ingredient.quantite_normalisee * (
          override?.grams_per_normalized_unit ?? match.grams_per_unit?.[ingredient.unite_normalisee] ?? match.grams_per_normalized_unit
        );
        if(!Number.isFinite(grams)||grams<=0||Math.abs(grams-detail.grams)>0.02)throw Error('current quantity no longer matches reviewed conversion');
        const food=foods[detail.source_dataset]?.get(String(detail.source_code));
        if(!food)throw Error('missing official food');
        for(const [target,[source]] of Object.entries(fields)) {
          const replacement=match.nutrient_overrides?.[source];
          const nutrient=food.nutrients_per_100g[source].value ?? (typeof replacement==='number'?replacement:replacement?.value);
          if(!Number.isFinite(nutrient)||nutrient<0) throw Error('missing nutrient '+source);
          entry[target]=nutrient*grams/(100*recipe.portions*entry.quantity);
        }
      }
      if(coefficients.some(c=>c.id===entry.id&&c.unit===entry.unit))throw Error('ambiguous repeated ingredient');
      coefficients.push(entry);
    }
    for(const [target,[,published,digits]] of Object.entries(fields)) {
      const total=coefficients.reduce((sum,i)=>sum+i[target]*i.quantity,0);
      if(Math.abs(total-recipe.nutrition_par_portion[published])>0.51/(10**digits))throw Error('published total no longer matches '+target);
    }
    result.available[projected.id]=coefficients;
  } catch(error) {result.unavailable[projected.id]=error.message;}
}
const inconsistent = Object.fromEntries(Object.entries(result.unavailable).filter(([,reason]) => reason !== 'no ingredient calculation'));
assert.deepEqual(inconsistent, {}, 'Les ingrédients, conversions ou totaux publiés ne concordent plus avec les données relues.');
const serialized = JSON.stringify(result.available) + "\n";
const output = new URL('src/data/recipe-nutrition.json', root);
if (process.argv.includes('--check')) {
  assert.equal(await readFile(output, 'utf8'), serialized, 'recipe-nutrition.json doit être régénéré depuis les données relues');
} else {
  await writeFile(output, serialized);
}
console.log(`Nutrition des variantes vérifiée : ${Object.keys(result.available).length} recettes couvertes, ${Object.keys(result.unavailable).length} recettes projetées sans calcul par ingrédient. Les 36 recettes V1 restent hors de cette projection.`);
