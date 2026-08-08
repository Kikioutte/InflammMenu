#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Interface and state orchestration.
# ---------------------------------------------------------------------------
prototype_path = ROOT / "src/Prototype.tsx"
prototype = prototype_path.read_text(encoding="utf-8")

prototype = replace_once(
    prototype,
    "{profile.weeklyBudget} € maximum",
    "{profile.weeklyBudget} € de budget cible",
    "home budget wording",
)
prototype = replace_once(
    prototype,
    'onSave({ ...profile, weeklyBudget: Math.min(10_000, Math.max(1, Number(budget) || DEFAULT_PROFILE.weeklyBudget)), maxPrepMinutes: Math.min(1_440, Math.max(1, Number(maxPrep) || DEFAULT_PROFILE.maxPrepMinutes)), allergies: parseList(allergies), excludedIngredientIds: resolveExcludedIngredients(excluded) });',
    'onSave({ ...profile, weeklyBudget: Math.min(10_000, Math.max(1, Math.round(Number(budget) || DEFAULT_PROFILE.weeklyBudget))), maxPrepMinutes: Math.min(1_440, Math.max(1, Math.round(Number(maxPrep) || DEFAULT_PROFILE.maxPrepMinutes))), allergies: parseList(allergies), excludedIngredientIds: resolveExcludedIngredients(excluded) });',
    "profile numeric normalization",
)
prototype = replace_once(
    prototype,
    '<KeyboardInput inputMode="numeric" value={budget}',
    '<KeyboardInput type="number" inputMode="numeric" min={1} max={10_000} step={1} value={budget}',
    "budget input bounds",
)
prototype = replace_once(
    prototype,
    '<KeyboardInput inputMode="numeric" value={maxPrep}',
    '<KeyboardInput type="number" inputMode="numeric" min={1} max={1_440} step={1} value={maxPrep}',
    "active time input bounds",
)
prototype = replace_once(
    prototype,
    '  const [target, setTarget] = useState<"current" | "upcoming">("current");\n  const generationTimer = useRef<number | null>(null);',
    '  const [target, setTarget] = useState<"current" | "upcoming">("current");\n  const targets = weeklyTargetsOf(profile);\n  const generationTimer = useRef<number | null>(null);',
    "generation targets",
)
prototype = replace_once(prototype, "    }, 650);", "    }, 50);", "generation paint delay")
prototype = replace_once(
    prototype,
    '<ArchiveIcon /><span><small>Budget</small><strong>{profile.weeklyBudget} € max.</strong></span>',
    '<ArchiveIcon /><span><small>Budget cible</small><strong>{profile.weeklyBudget} € visés</strong></span>',
    "generation budget wording",
)
prototype = replace_once(
    prototype,
    '<p><CheckIcon /> Au moins 2 repas avec légumineuses</p>{profile.diet === "classic" ? <p><CheckIcon /> Au moins 2 repas avec poisson</p> : null}',
    '<p><CheckIcon /> {targets.legumeMeals} repas avec légumineuses visés</p>{profile.diet === "classic" ? <p><CheckIcon /> {targets.fishMeals} repas avec poisson visés</p> : null}',
    "configured generation targets",
)
prototype = replace_once(
    prototype,
    '<AllergenNotice allergens={recipe.allergens} />',
    '<AllergenNotice allergens={recipeAllergens(recipe)} />',
    "ingredient-level allergen notice",
)
prototype = replace_once(
    prototype,
    '<img className="recipe-hero" src={recipe.image} alt={recipe.title} onError={handleRecipeImageError}',
    '<img className="recipe-hero" src={recipe.image} alt={recipe.title} width={900} height={900} decoding="async" onError={handleRecipeImageError}',
    "recipe hero dimensions",
)
prototype = replace_once(
    prototype,
    '''  const deleteCustomRecipe = (recipeId: string) => setAppState((current) => ({
    ...current,
    customRecipes: current.customRecipes.filter((item) => item.id !== recipeId),
    favoriteRecipeIds: current.favoriteRecipeIds.filter((id) => id !== recipeId),
  }));''',
    '''  const deleteCustomRecipe = (recipeId: string) => setAppState((current) => {
    const recipeNotes = { ...current.recipeNotes };
    delete recipeNotes[recipeId];
    return {
      ...current,
      customRecipes: current.customRecipes.filter((item) => item.id !== recipeId),
      favoriteRecipeIds: current.favoriteRecipeIds.filter((id) => id !== recipeId),
      recipeNotes,
      profile: {
        ...current.profile,
        dislikedRecipeIds: current.profile.dislikedRecipeIds.filter((id) => id !== recipeId),
        softDislikedRecipeIds: current.profile.softDislikedRecipeIds.filter((id) => id !== recipeId),
      },
    };
  });''',
    "custom recipe preference cleanup",
)
prototype = replace_once(
    prototype,
    '''      // Catalogue-only favourites are kept: they are resolved once the lazy
      // catalogue chunk is loaded by the favourites tab.
      const validFavorites = stored.favoriteRecipeIds.filter((id) => recipeById.has(id) || id.startsWith("catalog-"));''',
    '''      // Catalogue-only favourites and restored personal recipes are kept even
      // before the lazy catalogue or live recipe registry has finished updating.
      const storedCustomRecipeIds = new Set(stored.customRecipes.map((recipe) => recipe.id));
      const validFavorites = stored.favoriteRecipeIds.filter((id) =>
        recipeById.has(id) || storedCustomRecipeIds.has(id) || id.startsWith("catalog-"),
      );''',
    "restored custom favourites",
)
prototype = replace_once(
    prototype,
    '''        replaceAppState({
          ...stored,
          favoriteRecipeIds: validFavorites,
          currentPlan: promoted,
          upcomingPlan: promoted ? null : stored.upcomingPlan,
          history: [expired, ...stored.history.filter((item) => item.id !== expired.id)].slice(0, HISTORY_LIMIT),
          checkedShoppingItemIds: [],
        });''',
    '''        setAppState({
          ...stored,
          favoriteRecipeIds: validFavorites,
          currentPlan: promoted,
          upcomingPlan: promoted ? null : stored.upcomingPlan,
          history: [expired, ...stored.history.filter((item) => item.id !== expired.id)].slice(0, HISTORY_LIMIT),
          checkedShoppingItemIds: [],
        });''',
    "revisioned expired-week rollover",
)
prototype = replace_once(
    prototype,
    '        replaceAppState({ ...stored, favoriteRecipeIds: validFavorites, currentPlan: stored.upcomingPlan, upcomingPlan: null });',
    '        setAppState({ ...stored, favoriteRecipeIds: validFavorites, currentPlan: stored.upcomingPlan, upcomingPlan: null });',
    "revisioned upcoming-week promotion",
)
prototype = replace_once(
    prototype,
    '''      } else {
        replaceAppState({ ...stored, favoriteRecipeIds: validFavorites });
      }
      setHydrated(true);''',
    '''      } else {
        const restored = { ...stored, favoriteRecipeIds: validFavorites };
        const favoritesUnchanged = validFavorites.length === stored.favoriteRecipeIds.length
          && validFavorites.every((id, index) => id === stored.favoriteRecipeIds[index]);
        if (favoritesUnchanged) replaceAppState(restored);
        else setAppState(restored);
      }
      setHydrated(true);''',
    "revisioned favourite cleanup",
)
prototype = replace_once(
    prototype,
    'key={`profile-${live.stateRevision}`} initial={live.profile}',
    'key={JSON.stringify(live.profile)} initial={live.profile}',
    "profile remount scope",
)
prototype = replace_once(
    prototype,
    '<KeyboardInput inputMode="decimal" placeholder="Montant réel" data-testid="spend-input"',
    '<KeyboardInput type="number" inputMode="decimal" min={0} max={100_000} step="any" placeholder="Montant réel" data-testid="spend-input"',
    "spend input bounds",
)
prototype = replace_once(
    prototype,
    'onSetSpent(event.target.value.trim() && Number.isFinite(amount) && amount >= 0 ? amount : null);',
    'onSetSpent(event.target.value.trim() && Number.isFinite(amount) && amount >= 0 ? Math.min(100_000, amount) : null);',
    "spend value clamp",
)
prototype_path.write_text(prototype, encoding="utf-8")


# ---------------------------------------------------------------------------
# Stored leftover marks are relational data, not trustworthy booleans.
# ---------------------------------------------------------------------------
storage_path = ROOT / "src/storage.ts"
storage = storage_path.read_text(encoding="utf-8")
storage = replace_once(
    storage,
    "    if (valid) return meal;",
    "    if (valid) return { ...meal, completed: false, locked: false };",
    "leftover mark normalization",
)
storage_path.write_text(storage, encoding="utf-8")


# ---------------------------------------------------------------------------
# Keep 44 px cooking targets without making a long recipe wider than the app.
# ---------------------------------------------------------------------------
css_path = ROOT / "src/prototype.css"
css = css_path.read_text(encoding="utf-8")
css = replace_once(
    css,
    '''.cooking-progress button { min-width: 44px; min-height: 44px; height: 44px; padding: 19px 0; }
.history-card__delete, .stepper button, .aisle-order button { min-width: 44px; min-height: 44px; }''',
    '''.cooking-progress { overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: none; }
.cooking-progress::-webkit-scrollbar { display: none; }
.cooking-progress li { flex: 0 0 44px; }
.cooking-progress button { min-height: 44px; height: 44px; padding: 19px 0; }''',
    "cooking progress target layout",
)
css_path.write_text(css, encoding="utf-8")


# ---------------------------------------------------------------------------
# Regression coverage for the final code-review findings.
# ---------------------------------------------------------------------------
storage_tests_path = ROOT / "tests/storage.test.mjs"
storage_tests = storage_tests_path.read_text(encoding="utf-8")
if "valid imported leftovers cannot remain locked or cooked" not in storage_tests:
    storage_tests += '''\n\ntest("valid imported leftovers cannot remain locked or cooked", async () => {\n  const { normalizePlan } = await import("../src/storage.ts");\n  const normalized = normalizePlan({\n    startsOn: "2026-08-03",\n    meals: [\n      { id: "source", dayIndex: 0, mealType: "lunch", recipeId: "r1", portions: 2, source: "generated" },\n      { id: "leftover", dayIndex: 1, mealType: "lunch", recipeId: "r1", portions: 2, source: "manual", leftoverOf: "source", completed: true, locked: true },\n    ],\n  });\n  assert.equal(normalized.meals[1].leftoverOf, "source");\n  assert.equal(normalized.meals[1].completed, false);\n  assert.equal(normalized.meals[1].locked, false);\n});\n'''
storage_tests_path.write_text(storage_tests, encoding="utf-8")

app_tests_path = ROOT / "tests/app-v1.spec.ts"
app_tests = app_tests_path.read_text(encoding="utf-8")
app_tests = app_tests.replace('await expect(page.getByText("95 € maximum")).toBeVisible();', 'await expect(page.getByText("95 € de budget cible")).toBeVisible();')
if "une recette personnelle favorite conserve les allergènes de ses ingrédients" not in app_tests:
    app_tests += '''\n\ntest("une recette personnelle favorite conserve les allergènes de ses ingrédients après rechargement", async ({ page }) => {\n  await page.addInitScript(() => {\n    window.localStorage.setItem("inflamm-menu:app-state", JSON.stringify({\n      version: 2,\n      profile: {},\n      currentPlan: null,\n      upcomingPlan: null,\n      favoriteRecipeIds: ["perso-allergene"],\n      history: [],\n      checkedShoppingItemIds: [],\n      pantryIngredientIds: [],\n      customRecipes: [{\n        id: "perso-allergene",\n        title: "Recette test allergène",\n        mealTypes: ["lunch"],\n        diet: ["classic", "vegetarian", "no-pork"],\n        prepMinutes: 10,\n        costPerPortion: 2,\n        seasons: ["all-year"],\n        equipment: [],\n        allergens: [],\n        tags: ["test"],\n        ingredients: [{ id: "milk", name: "Lait", quantity: 100, unit: "ml", category: "fresh", allergens: ["lait"] }],\n        nutrition: { calories: 100, protein: 4, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },\n        description: "Une recette de test.",\n        steps: Array.from({ length: 20 }, (_, index) => `Étape ${index + 1}`),\n        conservation: "À consommer rapidement.",\n        image: "/assets/recipe-placeholder.svg",\n      }],\n      onboardingCompleted: true,\n    }));\n  });\n\n  await openFreshApp(page);\n  await page.getByRole("button", { name: "Favoris", exact: true }).click();\n  await page.getByRole("button", { name: /Recette test allergène/ }).click();\n  await expect(page.getByText("Lait", { exact: true })).toBeVisible();\n  await page.getByTestId("start-cooking").click();\n  await expect(page.getByTestId("cooking-view")).toBeVisible();\n  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));\n\n  await page.reload();\n  await page.getByRole("button", { name: "Favoris", exact: true }).click();\n  await expect(page.getByRole("button", { name: /Recette test allergène/ })).toBeVisible();\n});\n'''
if "un réglage de confort ne détruit pas le brouillon du profil" not in app_tests:
    app_tests += '''\n\ntest("un réglage de confort ne détruit pas le brouillon du profil", async ({ page }) => {\n  await openFreshApp(page);\n  await page.getByRole("button", { name: "Ajuster mon profil" }).click();\n  await page.getByLabel("Votre prénom").fill("Brouillon non enregistré");\n  await page.getByRole("button", { name: /Informations et confidentialité/ }).click();\n  await page.getByTestId("text-scale-large").click();\n  await page.getByRole("button", { name: "Retour" }).click();\n  await expect(page.getByLabel("Votre prénom")).toHaveValue("Brouillon non enregistré");\n});\n'''
if "la génération reprend les objectifs configurés sans promettre un plafond budgétaire" not in app_tests:
    app_tests += '''\n\ntest("la génération reprend les objectifs configurés sans promettre un plafond budgétaire", async ({ page }) => {\n  await openFreshApp(page);\n  await page.getByRole("button", { name: "Ajuster mon profil" }).click();\n  await page.getByRole("button", { name: "Plus de repas avec légumineuses" }).click();\n  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();\n  await page.getByRole("button", { name: "Générer ma semaine" }).click();\n  await expect(page.getByText("3 repas avec légumineuses visés")).toBeVisible();\n  await expect(page.getByText("80 € visés")).toBeVisible();\n  await expect(page.getByText(/€ max\./)).toHaveCount(0);\n});\n'''
app_tests_path.write_text(app_tests, encoding="utf-8")

print("Final code-review fixes applied.")
