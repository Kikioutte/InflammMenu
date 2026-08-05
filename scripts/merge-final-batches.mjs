import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateCatalogue } from "./validate-catalogue.mjs";

const DEFAULT_EXPECTED_FINAL_COUNT = 500;
const ORIGINAL_RECIPE_COUNT = 50;

function parseArguments(argv) {
  const files = [];
  let outputFile;
  let expectedCount = DEFAULT_EXPECTED_FINAL_COUNT;
  let writeProduction = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      outputFile = argv[index + 1];
      if (!outputFile) throw new Error("--output requiert un chemin");
      index += 1;
    } else if (argument === "--expected-count") {
      expectedCount = Number(argv[index + 1]);
      if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
        throw new Error("--expected-count requiert un entier positif");
      }
      index += 1;
    } else if (argument === "--write-production") {
      writeProduction = true;
    } else if (argument.startsWith("--")) {
      throw new Error(`Option inconnue : ${argument}`);
    } else {
      files.push(argument);
    }
  }

  if (files.length === 0) {
    throw new Error(
      "Usage: node scripts/merge-final-batches.mjs [--expected-count 500] [--output fichier | --write-production] <lot.final.json> [...]",
    );
  }
  if (outputFile && writeProduction) {
    throw new Error("--output et --write-production sont incompatibles");
  }
  if (expectedCount % 25 !== 0) {
    throw new Error("Le nombre attendu doit correspondre à des lots complets de 25 recettes");
  }

  return { files, outputFile, expectedCount, writeProduction };
}

function expectedRecipeId(number) {
  return `r${String(number).padStart(3, "0")}`;
}

function legacyIngredientId(name) {
  return `catalog-${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function normalizeLegacyQuantity(ingredient) {
  if (ingredient.unite === "kg") {
    return { quantite_normalisee: ingredient.quantite * 1000, unite_normalisee: "g" };
  }
  if (ingredient.unite === "l") {
    return { quantite_normalisee: ingredient.quantite * 1000, unite_normalisee: "ml" };
  }
  if (ingredient.unite === "g" || ingredient.unite === "ml") {
    return { quantite_normalisee: ingredient.quantite, unite_normalisee: ingredient.unite };
  }
  if (ingredient.unite === "c. à s.") {
    return { quantite_normalisee: ingredient.quantite, unite_normalisee: "c_soupe" };
  }
  if (ingredient.unite === "c. à c.") {
    return { quantite_normalisee: ingredient.quantite, unite_normalisee: "c_cafe" };
  }
  if (ingredient.unite === "cm") {
    return { quantite_normalisee: ingredient.quantite * 5, unite_normalisee: "g" };
  }
  return { quantite_normalisee: ingredient.quantite, unite_normalisee: "piece" };
}

function upgradeHistoricalRecipe(recipe, licence) {
  const upgraded = structuredClone(recipe);
  upgraded.ingredients = upgraded.ingredients.map((ingredient) => {
    if (
      ingredient.id !== undefined &&
      ingredient.quantite_normalisee !== undefined &&
      ingredient.unite_normalisee !== undefined &&
      ingredient.facultatif !== undefined
    ) {
      return ingredient;
    }
    return {
      ...ingredient,
      id: legacyIngredientId(ingredient.nom),
      ...normalizeLegacyQuantity(ingredient),
      facultatif: false,
    };
  });
  upgraded.app.planner.active_minutes ??= upgraded.temps.total;
  upgraded.provenance ??= {
    type: "original",
    author: "InflammMenu",
    license: licence,
    created_at: "2026-08-05",
    reviewed_at: "2026-08-05",
    sources: [
      {
        kind: "inspiration",
        title: "Catalogue historique InflammMenu — version éditoriale relue",
        version: "2.0.0",
        accessed_at: "2026-08-05",
      },
    ],
  };
  return upgraded;
}

const options = parseArguments(process.argv.slice(2));
const productionUrl = new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url);
const production = JSON.parse(await readFile(productionUrl, "utf8"));
validateCatalogue(production);

const originalRecipes = production.recipes
  .filter((recipe) => Number(recipe.id.slice(1)) <= ORIGINAL_RECIPE_COUNT)
  .sort((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)));
if (originalRecipes.length !== ORIGINAL_RECIPE_COUNT) {
  throw new Error(`Catalogue source incomplet : ${ORIGINAL_RECIPE_COUNT} recettes historiques requises`);
}
for (const [index, recipe] of originalRecipes.entries()) {
  const expected = expectedRecipeId(index + 1);
  if (recipe.id !== expected) throw new Error(`Suite historique interrompue : ${expected} attendu, ${recipe.id} reçu`);
}

const finalRecipes = [];
for (const file of options.files) {
  const catalogue = JSON.parse(await readFile(file, "utf8"));
  validateCatalogue(catalogue);
  if (catalogue.meta.status !== "editorial-validated") {
    throw new Error(`${file}: lot non validé éditorialement`);
  }
  finalRecipes.push(...catalogue.recipes);
}

if (finalRecipes.length !== options.expectedCount) {
  throw new Error(
    `Ensemble final incomplet : ${options.expectedCount} recettes attendues, ${finalRecipes.length} reçues`,
  );
}

finalRecipes.sort((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)));
const finalIds = new Set();
for (const [index, recipe] of finalRecipes.entries()) {
  if (finalIds.has(recipe.id)) throw new Error(`${recipe.id}: doublon entre lots finaux`);
  finalIds.add(recipe.id);
  const expected = expectedRecipeId(index + ORIGINAL_RECIPE_COUNT + 1);
  if (recipe.id !== expected) {
    throw new Error(`Suite finale interrompue : ${expected} attendu, ${recipe.id} reçu`);
  }
  if (recipe.app.review.stage !== "editorial-validated") {
    throw new Error(`${recipe.id}: relecture finale absente`);
  }
}

const upgradedOriginalRecipes = originalRecipes.map((recipe) =>
  upgradeHistoricalRecipe(recipe, production.meta.licence),
);
const allRecipes = [...upgradedOriginalRecipes, ...finalRecipes];
const allSlugs = new Set();
for (const recipe of allRecipes) {
  if (allSlugs.has(recipe.slug)) throw new Error(`${recipe.id}: slug dupliqué dans le catalogue fusionné`);
  allSlugs.add(recipe.slug);
}

const merged = structuredClone(production);
merged.recipes = allRecipes;
merged.meta.nombre_recettes = merged.recipes.length;
merged.meta.schema_version = "2.1.0";
merged.meta.version = "2.1.0";
merged.meta.date_mise_a_jour = "2026-08-05";
merged.meta.description =
  "Catalogue culinaire structuré et relu. Les valeurs nutritionnelles indiquent leur méthode et leurs réserves; l'appréciation porte sur le profil alimentaire global et ne constitue pas une promesse médicale.";

// Validate the exact merged shape before any possible write. This also applies
// the stricter normalized-ingredient and provenance checks from schema v2.1.
validateCatalogue(merged);

if (options.outputFile) {
  const destination = pathToFileURL(resolve(options.outputFile));
  await writeFile(destination, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `${merged.recipes.length} recettes vérifiées et écrites dans ${destination.pathname} (${finalRecipes.length} nouvelles).`,
  );
} else if (options.writeProduction) {
  await writeFile(productionUrl, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `${merged.recipes.length} recettes fusionnées dans le catalogue de production (${finalRecipes.length} nouvelles).`,
  );
} else {
  console.log(
    `Simulation valide : ${merged.recipes.length} recettes prêtes (${finalRecipes.length} nouvelles). Aucun fichier écrit; utiliser --write-production pour confirmer la fusion.`,
  );
}
