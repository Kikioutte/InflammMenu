import { APP_STATE_VERSION, BACKUP_FORMAT, isRecord, migrateAppState, normalizePlan, parseStorageGeneration, type AppState } from "./storage.ts";

export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const RECOGNIZED_STATE_KEYS = new Set([
  "version", "profile", "currentPlan", "plan", "upcomingPlan", "favoriteRecipeIds", "favorites",
  "history", "checkedShoppingItemIds", "checkedShoppingIds", "pantryIngredientIds", "pantryIds",
  "pantryAmounts", "recipeNotes", "shoppingCategoryOrder", "actualSpend", "customRecipes",
  "textScale", "remindersEnabled", "onboardingCompleted", "storageGeneration", "stateRevision", "fieldRevisions", "fieldMutationIds",
]);

const CURRENT_BACKUP_KEYS = [
  "profile", "currentPlan", "upcomingPlan", "favoriteRecipeIds", "history",
  "checkedShoppingItemIds", "pantryIngredientIds", "pantryAmounts", "recipeNotes",
  "shoppingCategoryOrder", "actualSpend", "customRecipes", "textScale",
  "remindersEnabled", "onboardingCompleted", "stateRevision",
] as const;

function hasUsableLegacyStateShape(value: Record<string, unknown>): boolean {
  const profile = value.profile;
  if (!isRecord(profile)) return false;
  const profileIsUsable = typeof profile.people === "number"
    && (profile.mealsPerDay === 2 || profile.mealsPerDay === 3)
    && typeof profile.weeklyBudget === "number"
    && typeof profile.maxPrepMinutes === "number"
    && Array.isArray(profile.allergies)
    && typeof profile.diet === "string"
    && Array.isArray(profile.equipment);
  const hasPlanSlot = Object.hasOwn(value, "currentPlan") || Object.hasOwn(value, "plan");
  const hasFavorites = Array.isArray(value.favoriteRecipeIds) || Array.isArray(value.favorites);
  const hasCheckedItems = Array.isArray(value.checkedShoppingItemIds) || Array.isArray(value.checkedShoppingIds);
  const hasPantry = Array.isArray(value.pantryIngredientIds) || Array.isArray(value.pantryIds);
  return profileIsUsable && hasPlanSlot && hasFavorites && Array.isArray(value.history) && hasCheckedItems && hasPantry;
}

function isStrictStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasCompleteCurrentProfileShape(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.weeklyTargets)) return false;
  return typeof value.firstName === "string"
    && typeof value.people === "number" && Number.isFinite(value.people)
    && (value.mealsPerDay === 2 || value.mealsPerDay === 3)
    && typeof value.weeklyBudget === "number" && Number.isFinite(value.weeklyBudget)
    && typeof value.maxPrepMinutes === "number" && Number.isFinite(value.maxPrepMinutes)
    && Array.isArray(value.dayConstraints)
    && isStrictStringArray(value.allergies)
    && isStrictStringArray(value.excludedIngredientIds)
    && isStrictStringArray(value.dislikedRecipeIds)
    && isStrictStringArray(value.softDislikedRecipeIds)
    && typeof value.weeklyTargets.legumeMeals === "number" && Number.isFinite(value.weeklyTargets.legumeMeals)
    && typeof value.weeklyTargets.fishMeals === "number" && Number.isFinite(value.weeklyTargets.fishMeals)
    && (value.diet === "classic" || value.diet === "vegetarian" || value.diet === "no-pork")
    && isStrictStringArray(value.equipment);
}

function hasCompleteCurrentStateShape(value: Record<string, unknown>): boolean {
  const requiredKeysArePresent = CURRENT_BACKUP_KEYS.every((key) => Object.hasOwn(value, key));
  const plansAreValid = (value.currentPlan === null || normalizePlan(value.currentPlan) !== null)
    && (value.upcomingPlan === null || normalizePlan(value.upcomingPlan) !== null)
    && Array.isArray(value.history)
    && value.history.every((plan) => normalizePlan(plan) !== null);
  const collectionsAreValid = isStrictStringArray(value.favoriteRecipeIds)
    && isStrictStringArray(value.checkedShoppingItemIds)
    && isStrictStringArray(value.pantryIngredientIds)
    && isRecord(value.pantryAmounts)
    && isRecord(value.recipeNotes)
    && Array.isArray(value.shoppingCategoryOrder)
    && isRecord(value.actualSpend)
    && Array.isArray(value.customRecipes);
  const preferencesAreValid = (value.textScale === "normal" || value.textScale === "large")
    && typeof value.remindersEnabled === "boolean"
    && typeof value.onboardingCompleted === "boolean"
    && (value.storageGeneration === undefined || parseStorageGeneration(value.storageGeneration) !== null)
    && Number.isSafeInteger(value.stateRevision)
    && Number(value.stateRevision) >= 0;
  return requiredKeysArePresent
    && hasCompleteCurrentProfileShape(value.profile)
    && plansAreValid
    && collectionsAreValid
    && preferencesAreValid;
}

function assertCompleteImport(candidate: Record<string, unknown>, backupVersion?: number): void {
  const candidateVersion = typeof candidate.version === "number" ? candidate.version : undefined;
  const mustUseCurrentShape = backupVersion === APP_STATE_VERSION || candidateVersion === APP_STATE_VERSION;
  const completeEnough = mustUseCurrentShape
    ? hasCompleteCurrentStateShape(candidate)
    : hasUsableLegacyStateShape(candidate);
  if (!completeEnough) {
    throw new Error("Sauvegarde incomplète : elle ne sera pas restaurée pour protéger vos données actuelles.");
  }
}

/**
 * Reads a backup file. Older exports and raw state dumps are accepted, but the
 * content always goes through the same migration and validation as stored data.
 */
export function importAppState(raw: string): AppState {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("Sauvegarde trop volumineuse : la limite est de 8 Mo.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Fichier illisible : ce n’est pas une sauvegarde Inflamm’Menu.");
  }

  if (!isRecord(parsed)) throw new Error("Fichier illisible : ce n’est pas une sauvegarde Inflamm’Menu.");
  let candidate: Record<string, unknown>;
  if (parsed.format !== undefined) {
    if (parsed.format !== BACKUP_FORMAT) throw new Error("Ce fichier ne provient pas d’Inflamm’Menu.");
    if (typeof parsed.version === "number" && parsed.version > APP_STATE_VERSION) {
      throw new Error("Cette sauvegarde provient d’une version plus récente d’Inflamm’Menu.");
    }
    if (typeof parsed.version !== "number") throw new Error("Sauvegarde incomplète : version absente ou invalide.");
    if (typeof parsed.exportedAt !== "string" || Number.isNaN(Date.parse(parsed.exportedAt))) {
      throw new Error("Sauvegarde incomplète : date d’export absente ou invalide.");
    }
    if (!isRecord(parsed.state)) throw new Error("Sauvegarde incomplète : aucune donnée exploitable.");
    if (!Object.keys(parsed.state).some((key) => RECOGNIZED_STATE_KEYS.has(key))) {
      throw new Error("Sauvegarde incomplète : aucune donnée Inflamm’Menu reconnue.");
    }
    candidate = parsed.state;
    assertCompleteImport(candidate, parsed.version);
  } else {
    const rawCandidate = isRecord(parsed.state) ? parsed.state : parsed;
    if (!Object.keys(rawCandidate).some((key) => RECOGNIZED_STATE_KEYS.has(key))) {
      throw new Error("Ce fichier ne contient aucune donnée Inflamm’Menu reconnue.");
    }
    candidate = rawCandidate;
    assertCompleteImport(candidate);
  }

  const migrated = migrateAppState(candidate);
  if (!migrated) throw new Error("Sauvegarde incomplète ou version incompatible.");
  return migrated;
}

/** Rejects oversized files before allocating and decoding their full contents. */
export async function importAppStateFile(file: Pick<File, "size" | "text">): Promise<AppState> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error("Sauvegarde trop volumineuse : la limite est de 8 Mo.");
  }
  return importAppState(await file.text());
}

