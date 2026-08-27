import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalogue } from "./validate-catalogue.mjs";
const root=new URL("../",import.meta.url); const pilot=JSON.parse(await readFile(new URL("research/pilot-r351-r375.draft.json",root),"utf8"));
const concepts=JSON.parse(await readFile(new URL("research/recipes-r351-r500.json",root),"utf8")).filter(({id})=>+id.slice(1)>=351&&+id.slice(1)<=375); const result=validateCatalogue(pilot, { taxonomy: "legacy" });
assert.equal(result.schemaVersion,"2.1.0"); assert.equal(result.recipeCount,25); assert.deepEqual(pilot.recipes.map(r=>r.id),concepts.map(c=>c.id));
const byId=new Map(concepts.map(c=>[c.id,c])); for(const recipe of pilot.recipes){const c=byId.get(recipe.id);assert.equal(recipe.titre,c.titre);assert.equal(recipe.categorie,"plat");assert.deepEqual(recipe.saisons,c.saisons);assert.ok(recipe.ingredients.length>=5);assert.ok(recipe.etapes.length>=4);assert.equal(recipe.app.review.stage,"draft");assert.equal(recipe.app.review.status,"caution");assert.equal(recipe.app.planner.eligible,false);assert.equal(recipe.nutrition_par_portion.estimation.statut,"estimated");assert.equal(recipe.score_anti_inflammatoire,0);assert.ok(recipe.app.planner.allergens.includes("poisson"),`${recipe.id}: allergène poisson absent`);assert.match(`${recipe.conseils.join(" ")} ${recipe.app.review.caution}`,/arête|poisson|cuisson/i);}
for(const id of ["r356","r366","r373"])assert.match(pilot.recipes.find(r=>r.id===id).app.review.caution,/salé|sodium/i);
console.log(`Lot r351-r375 v${result.schemaVersion} valide : ${result.recipeCount} plats poisson brouillon, tous exclus du planificateur.`);
