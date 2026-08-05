import { readFile, writeFile } from "node:fs/promises";

const [recipeFile, outputFile, ...existingFiles] = process.argv.slice(2);
if (!recipeFile || !outputFile) {
  throw new Error("Usage: node scripts/seed-nutrition-map.mjs <lot.json> <sortie.json> [mappings existants...]");
}

const catalogue = JSON.parse(await readFile(recipeFile, "utf8"));
const known = new Map();
for (const file of existingFiles) {
  const mapping = JSON.parse(await readFile(file, "utf8"));
  for (const entry of mapping.ingredients) {
    if (!known.has(entry.ingredient_id)) known.set(entry.ingredient_id, entry);
  }
}

const occurrences = new Map();
for (const recipe of catalogue.recipes) {
  for (const ingredient of recipe.ingredients) {
    const current = occurrences.get(ingredient.id) ?? { units: new Set(), recipes: [] };
    current.units.add(ingredient.unite_normalisee);
    current.recipes.push({
      recipe_id: recipe.id,
      label: ingredient.nom,
      quantity: ingredient.quantite_normalisee,
      unit: ingredient.unite_normalisee,
      note: ingredient.note,
    });
    occurrences.set(ingredient.id, current);
  }
}

let reused = 0;
const ingredients = [...occurrences.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ingredientId, occurrence]) => {
  const existing = known.get(ingredientId);
  if (existing) {
    reused += 1;
    return {
      ...structuredClone(existing),
      batch_occurrences: occurrence.recipes,
      batch_review_note: "Correspondance réutilisée; vérifier les nouvelles unités et formes culinaires avant validation du lot.",
    };
  }
  return {
    ingredient_id: ingredientId,
    selected_ciqual_code: null,
    source_dataset: "ciqual",
    selected_source_code: null,
    grams_per_unit: Object.fromEntries([...occurrence.units].map((unit) => [unit, unit === "g" ? 1 : null])),
    occurrence_overrides: {},
    nutrient_overrides: {},
    review_status: "pending",
    rationale: "",
    source_note: "",
    batch_occurrences: occurrence.recipes,
  };
});

const output = {
  meta: {
    recipe_file: recipeFile,
    ingredient_count: ingredients.length,
    reused_count: reused,
    generated_at: new Date().toISOString(),
    status: "draft",
  },
  ingredients,
};

await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(`${ingredients.length} ingrédients préparés, dont ${reused} correspondances réutilisées.`);
