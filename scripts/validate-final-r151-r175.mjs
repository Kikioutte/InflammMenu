import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";

const root = new URL("../", import.meta.url);
const [draft,nutrition,final,mapping,ciqual] = await Promise.all([
  "research/pilot-r151-r175.draft.json","research/pilot-r151-r175.nutrition.json","research/pilot-r151-r175.final.json","research/ciqual-map-r151-r175.json","research/ciqual-2025-core.json",
].map((path)=>readFile(new URL(path,root),"utf8").then(JSON.parse)));

assert.equal(mapping.meta.ingredient_count,78);
assert.equal(mapping.meta.reused_count,60);
const required=[...new Set(draft.recipes.flatMap((r)=>r.ingredients.map((i)=>i.id)))].sort();
assert.deepEqual(mapping.ingredients.map((x)=>x.ingredient_id),required);
const codes=new Set(ciqual.foods.map((f)=>f.code));
for(const entry of mapping.ingredients){
  if((entry.source_dataset??"ciqual")==="ciqual")assert.ok(codes.has(String(entry.selected_ciqual_code)),`${entry.ingredient_id}: code Ciqual absent`);
  assert.ok(["validated","caution"].includes(entry.review_status));
}

const result=validateCatalogue(final, { taxonomy: "legacy" });
assert.equal(result.schemaVersion,"2.1.0");assert.equal(result.recipeCount,25);
assert.equal(final.meta.status,"editorial-validated");assert.equal(final.meta.reviewed_at,"2026-08-05");
assert.match(final.meta.culinary_notice,/aucune.*testée physiquement/i);assert.match(final.meta.cost_notice,/estimations/i);
assert.deepEqual(final.recipes.map((r)=>r.id),Array.from({length:25},(_,i)=>`r${151+i}`));

const sourceById=new Map(nutrition.recipes.map((r)=>[r.id,r]));
const eligible=new Set(["r152","r153","r155","r157","r161","r162","r163","r164","r166","r167","r168","r169","r171"]);
for(const recipe of final.recipes){
  const source=sourceById.get(recipe.id);assert.ok(source);
  for(const field of ["titre","categorie","temps","portions","ingredients","etapes","substitutions","nutrition_par_portion"])assert.deepEqual(recipe[field],source[field],`${recipe.id}: ${field} modifié`);
  assert.equal(recipe.app.review.stage,"editorial-validated");assert.equal(recipe.app.review.status,"caution");
  assert.match(recipe.app.review.caution,/non testée physiquement/i);assert.equal(recipe.provenance.reviewed_at,"2026-08-05");
  assert.match(recipe.score_note,/profil alimentaire global/i);assert.match(recipe.score_note,/ne mesure aucun effet médical/i);
  assert.equal(recipe.app.planner.eligible,eligible.has(recipe.id));
  if(recipe.app.planner.eligible){
    assert.equal(recipe.categorie,"soupe");assert.ok(recipe.nutrition_par_portion.calories>=200);assert.ok(recipe.nutrition_par_portion.proteines_g>=8);
  }
  if(recipe.categorie==="snack")assert.equal(recipe.app.planner.eligible,false);
  const allergens=[...new Set(recipe.ingredients.flatMap((i)=>i.allergenes))].sort();assert.deepEqual([...recipe.app.planner.allergens].sort(),allergens);
  const text=JSON.stringify(recipe).toLocaleLowerCase("fr");assert.ok(!/(?:^|\W)(?:gu[ée]rit|soigne)(?:$|\W)|pr[ée]vient une maladie|traite une maladie|r[ée]duit l'inflammation|combat l'inflammation/i.test(text),`${recipe.id}: allégation médicale`);
  if(recipe.nutrition_par_portion.estimation.statut==="calculated-with-cautions")assert.match(recipe.app.review.caution,/réserve de calcul nutritionnel/i);
}
const r154=final.recipes.find((r)=>r.id==="r154");assert.equal(r154.app.planner.eligible,false);assert.match(r154.app.review.caution,/sodium.*sous-estimé/i);
assert.match(final.recipes.find((r)=>r.id==="r158").app.review.caution,/chaîne du froid/i);
assert.match(final.recipes.find((r)=>r.id==="r167").app.review.caution,/0,2 g de safran/i);
assert.match(final.recipes.find((r)=>r.id==="r175").app.review.caution,/équivalent de soja sec/i);
assert.equal(final.recipes.filter((r)=>r.app.planner.eligible).length,13);
console.log("Lot final r151-r175 valide : 25 recettes relues, 13 soupes-repas éligibles et 12 éléments volontairement exclus.");
