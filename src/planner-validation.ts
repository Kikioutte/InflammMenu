import type { Recipe } from "./domain.ts";
import {
  INGREDIENT_CATEGORIES, INGREDIENT_UNITS, MEAL_TYPES, DIET_MODES, EQUIPMENT, CATALOGUE_ALLERGENS, EXPECTED_PLANNER_CAUTION_IDS,
  invalidCatalogue, recordAt, arrayAt, stringAt, numberAt, booleanAt, enumAt, stringArrayAt, optionalStringAt,
} from "./recipe-validation.ts";

const PLANNER_SEASONS = new Set(["spring", "summer", "autumn", "winter", "all-year"]);

/** Validates the generated planner projection before the engine can consume it. */
export function validatePlannerRecipes(value: unknown): readonly Recipe[] {
  const recipes = arrayAt(value, "planner-recipes", true);
  const recipeIds = new Set<string>();

  for (const [recipeIndex, rawRecipe] of recipes.entries()) {
    const path = `planner-recipes[${recipeIndex}]`;
    const recipe = recordAt(rawRecipe, path);
    const id = stringAt(recipe.id, `${path}.id`);
    if (recipeIds.has(id)) invalidCatalogue(`${path}.id: doublon ${id}`);
    recipeIds.add(id);
    stringAt(recipe.title, `${path}.title`);
    stringArrayAt(recipe.mealTypes, `${path}.mealTypes`, MEAL_TYPES, true);
    stringArrayAt(recipe.diet, `${path}.diet`, DIET_MODES, true);
    numberAt(recipe.prepMinutes, `${path}.prepMinutes`);
    if (recipe.restMinutes !== undefined) numberAt(recipe.restMinutes, `${path}.restMinutes`);
    numberAt(recipe.costPerPortion, `${path}.costPerPortion`, Number.EPSILON);
    stringArrayAt(recipe.seasons, `${path}.seasons`, PLANNER_SEASONS, true);
    stringArrayAt(recipe.equipment, `${path}.equipment`, EQUIPMENT);
    stringArrayAt(recipe.allergens, `${path}.allergens`, CATALOGUE_ALLERGENS);
    stringArrayAt(recipe.tags, `${path}.tags`);

    const ingredientAllergens = new Set<string>();
    for (const [ingredientIndex, rawIngredient] of arrayAt(recipe.ingredients, `${path}.ingredients`, true).entries()) {
      const ingredientPath = `${path}.ingredients[${ingredientIndex}]`;
      const ingredient = recordAt(rawIngredient, ingredientPath);
      stringAt(ingredient.id, `${ingredientPath}.id`);
      stringAt(ingredient.name, `${ingredientPath}.name`);
      numberAt(ingredient.quantity, `${ingredientPath}.quantity`);
      enumAt(ingredient.unit, INGREDIENT_UNITS, `${ingredientPath}.unit`);
      enumAt(ingredient.category, INGREDIENT_CATEGORIES, `${ingredientPath}.category`);
      if (ingredient.allergens !== undefined) {
        stringArrayAt(ingredient.allergens, `${ingredientPath}.allergens`, CATALOGUE_ALLERGENS);
        for (const allergen of ingredient.allergens as string[]) ingredientAllergens.add(allergen);
      }
      if (ingredient.pantryStaple !== undefined) booleanAt(ingredient.pantryStaple, `${ingredientPath}.pantryStaple`);
      if (ingredient.optional !== undefined) booleanAt(ingredient.optional, `${ingredientPath}.optional`);
    }

    const declaredAllergens = [...new Set(recipe.allergens as string[])].sort();
    const derivedAllergens = [...ingredientAllergens].sort();
    if (declaredAllergens.length !== derivedAllergens.length
      || declaredAllergens.some((allergen, index) => allergen !== derivedAllergens[index])) {
      invalidCatalogue(`${path}.allergens: incohérents avec les ingrédients`);
    }

    const nutrition = recordAt(recipe.nutrition, `${path}.nutrition`);
    for (const field of ["calories", "protein", "fiber"] as const) numberAt(nutrition[field], `${path}.nutrition.${field}`);
    if (nutrition.estimated !== true) invalidCatalogue(`${path}.nutrition.estimated: true requis`);
    if (nutrition.note !== "Valeurs nutritionnelles estimatives par portion, à titre indicatif.") {
      invalidCatalogue(`${path}.nutrition.note: avertissement canonique requis`);
    }
    stringAt(recipe.description, `${path}.description`);
    optionalStringAt(recipe.caution, `${path}.caution`);
    stringArrayAt(recipe.steps, `${path}.steps`, undefined, true);
    stringAt(recipe.conservation, `${path}.conservation`);
    stringAt(recipe.image, `${path}.image`);
  }

  for (const cautionId of EXPECTED_PLANNER_CAUTION_IDS) {
    if (!recipeIds.has(cautionId)) invalidCatalogue(`planner-recipes: précaution orpheline ${cautionId}`);
  }

  return value as readonly Recipe[];
}
