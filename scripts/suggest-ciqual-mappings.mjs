import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const recipeFiles = process.argv.slice(2);
if (recipeFiles.length === 0) {
  throw new Error("Usage: node scripts/suggest-ciqual-mappings.mjs <lot.json> [...]");
}

const ciqualUrl = new URL("../research/ciqual-2025-core.json", import.meta.url);
const ciqual = JSON.parse(await readFile(ciqualUrl, "utf8"));

const stopWords = new Set([
  "a", "au", "aux", "avec", "cru", "crue", "cuits", "cuite", "cuites", "cuit",
  "de", "des", "du", "en", "et", "fraiche", "fraiches", "frais", "nature", "non",
  "haché", "hache", "mure", "mures", "pour", "sans", "seche", "seches", "sechees", "sec",
  "sucres", "sucre", "un", "une",
]);

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token))
    .map((token) => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token));
}

function score(query, candidate) {
  const queryTokens = tokens(query);
  const candidateTokens = tokens(candidate);
  const common = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  const union = new Set([...queryTokens, ...candidateTokens]).size || 1;
  const tokenScore = common / union;
  const queryText = normalize(query);
  const candidateText = normalize(candidate);
  const phraseBonus = candidateText.includes(queryText) || queryText.includes(candidateText) ? 0.2 : 0;
  const firstToken = [...queryTokens][0];
  const firstTokenBonus = firstToken && candidateTokens.has(firstToken) ? 0.25 : 0;
  const simplicityBonus = candidateTokens.size <= queryTokens.size + 2 ? 0.25 : 0;
  return tokenScore + phraseBonus + firstTokenBonus + simplicityBonus;
}

const ingredients = new Map();
for (const file of recipeFiles) {
  const catalogue = JSON.parse(await readFile(file, "utf8"));
  for (const recipe of catalogue.recipes) {
    for (const ingredient of recipe.ingredients) {
      const current = ingredients.get(ingredient.id) ?? {
        ingredient_id: ingredient.id,
        labels: new Set(),
        units: new Set(),
        notes: new Set(),
        recipes: new Set(),
      };
      current.labels.add(ingredient.nom);
      current.units.add(ingredient.unite_normalisee);
      if (ingredient.note) current.notes.add(ingredient.note);
      current.recipes.add(recipe.id);
      ingredients.set(ingredient.id, current);
    }
  }
}

const result = {
  meta: {
    generated_at: new Date().toISOString(),
    source: ciqual.meta,
    recipe_files: recipeFiles.map((file) => basename(file)),
    notice: "Suggestions automatiques uniquement : le code Ciqual et le facteur de conversion doivent être contrôlés avant calcul.",
  },
  ingredients: [...ingredients.values()].sort((a, b) => a.ingredient_id.localeCompare(b.ingredient_id)).map((ingredient) => {
    const query = [...ingredient.labels][0];
    const candidates = ciqual.foods
      .map((food) => ({
        code: food.code,
        name: food.name,
        group: food.group,
        score: Number(score(query, food.name).toFixed(4)),
        complete: Object.values(food.nutrients_per_100g).every((nutrient) => nutrient.value !== null),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.complete) - Number(a.complete))
      .slice(0, 10);

    return {
      ingredient_id: ingredient.ingredient_id,
      labels: [...ingredient.labels],
      units: [...ingredient.units],
      notes: [...ingredient.notes],
      recipes: [...ingredient.recipes],
      selected_ciqual_code: null,
      grams_per_unit: Object.fromEntries([...ingredient.units].map((unit) => [unit, unit === "g" ? 1 : null])),
      occurrence_overrides: {},
      review_status: "pending",
      candidates,
    };
  }),
};

const outputUrl = new URL("../research/ciqual-mapping-candidates.json", import.meta.url);
await writeFile(outputUrl, `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.ingredients.length} ingrédients uniques préparés dans ${outputUrl.pathname}.`);
