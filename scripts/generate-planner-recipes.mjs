#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { canonicalIngredientId, shoppingRuleFor } from "../src/shopping.ts";

const root = new URL("../", import.meta.url);
const catalogueUrl = new URL("src/data/recettes-anti-inflammatoires.json", root);
const imagesUrl = new URL("src/data/generated-recipe-images.json", root);
const outputUrl = new URL("src/data/planner-recipes.json", root);
const [catalogue, imageNames] = await Promise.all(
  [catalogueUrl, imagesUrl].map(async (url) => JSON.parse(await readFile(url, "utf8"))),
);
const generatedImages = new Set(imageNames);

const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const seasons = { printemps: "spring", ete: "summer", automne: "autumn", hiver: "winter", "toute-annee": "all-year" };

function normalizedAmount(ingredient) {
  if (ingredient.quantite_normalisee !== undefined && ingredient.unite_normalisee !== undefined) {
    return { quantity: ingredient.quantite_normalisee, unit: ingredient.unite_normalisee };
  }
  if (ingredient.unite === "kg") return { quantity: ingredient.quantite * 1000, unit: "g" };
  if (ingredient.unite === "l") return { quantity: ingredient.quantite * 1000, unit: "ml" };
  if (["g", "ml"].includes(ingredient.unite)) return { quantity: ingredient.quantite, unit: ingredient.unite };
  if (ingredient.unite === "c. à s.") return { quantity: ingredient.quantite, unit: "c_soupe" };
  if (ingredient.unite === "c. à c.") return { quantity: ingredient.quantite, unit: "c_cafe" };
  if (ingredient.unite === "cm") return { quantity: ingredient.quantite * 5, unit: "g" };
  return { quantity: ingredient.quantite, unit: "piece" };
}

const recipes = catalogue.recipes
  .filter((recipe) => !recipe.app.duplicate_of && recipe.app.planner.eligible)
  .map((recipe) => ({
    id: `catalog-${recipe.id}`,
    title: recipe.titre,
    mealTypes: recipe.app.planner.meal_types,
    diet: recipe.app.planner.diets,
    prepMinutes: recipe.app.planner.active_minutes ?? recipe.temps.preparation + recipe.temps.cuisson,
    // Soaking, chilling, marinating and fermenting stay separate from active time
    // so the app can warn that a meal must be started in advance.
    ...(recipe.temps.repos > 0 ? { restMinutes: recipe.temps.repos } : {}),
    costPerPortion: recipe.app.planner.cost_per_portion_eur,
    seasons: [...new Set(recipe.saisons.map((season) => seasons[season]).filter(Boolean))],
    equipment: recipe.app.planner.equipment,
    allergens: recipe.app.planner.allergens,
    tags: [...recipe.tags, recipe.categorie, ...recipe.ingredients.map((ingredient) => normalize(ingredient.nom))],
    ingredients: recipe.ingredients.map((ingredient) => {
      const amount = normalizedAmount(ingredient);
      const id = canonicalIngredientId(ingredient.id ?? `catalog-${normalize(ingredient.nom)}`);
      return {
        id,
        name: ingredient.nom,
        quantity: Math.max(0.01, amount.quantity / Math.max(1, recipe.portions)),
        unit: amount.unit,
        category: ingredient.categorie_courses,
        ...(ingredient.allergenes.length ? { allergens: ingredient.allergenes } : {}),
        ...(ingredient.pantry_staple === true || shoppingRuleFor(id)?.pantry_staple === true ? { pantryStaple: true } : {}),
      };
    }),
    nutrition: {
      calories: recipe.nutrition_par_portion.calories,
      protein: recipe.nutrition_par_portion.proteines_g,
      fiber: recipe.nutrition_par_portion.fibres_g,
      estimated: true,
      note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif.",
    },
    description: recipe.description,
    steps: recipe.etapes,
    conservation: recipe.conservation,
    image: generatedImages.has(recipe.image.nom_fichier)
      ? `/assets/recipes/generated/${recipe.image.nom_fichier}`
      : "/assets/recipe-placeholder.svg",
  }));

assert(recipes.length > 0, "projection planificateur vide");
const serialized = `${JSON.stringify(recipes)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  assert.equal(current, serialized, "planner-recipes.json n'est pas synchronisé avec le catalogue");
  console.log(`Projection planificateur valide : ${recipes.length} recettes, ${Buffer.byteLength(serialized)} octets.`);
} else {
  await writeFile(outputUrl, serialized);
  console.log(`Projection planificateur générée : ${recipes.length} recettes, ${Buffer.byteLength(serialized)} octets.`);
}
