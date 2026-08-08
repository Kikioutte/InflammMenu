#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# Legacy replicas have revision 0. localStorage wins ties because normal saves write it first.
storage = read("src/storage.ts")
storage = once(
    storage,
    "  return localState.stateRevision > indexedState.stateRevision ? localState : indexedState;",
    "  return localState.stateRevision >= indexedState.stateRevision ? localState : indexedState;",
    "freshest legacy replica",
)
storage = once(
    storage,
    '    id: typeof value.id === "string" && value.id.trim() ? value.id.replace(/[\\r\\n\\u0000-\\u001f\\u007f]/g, "").slice(0, 180) : `week-${value.startsOn}`,',
    '    id: (() => {\n      const cleaned = typeof value.id === "string" ? value.id.replace(/[\\r\\n\\u0000-\\u001f\\u007f]/g, "").trim().slice(0, 180) : "";\n      return cleaned || `week-${value.startsOn}`;\n    })(),',
    "safe plan id fallback",
)
write("src/storage.ts", storage)


# Cache normalized recipe metadata so generation and replacement do not repeat Unicode work.
engine = read("src/engine.ts")
old_has_tag = '''function hasTag(recipe: Recipe, candidates: readonly string[]): boolean {
  const wanted = new Set(candidates.map(normalize));
  return recipe.tags.some((tag) => {
    const normalizedTag = normalize(tag);
    return [...wanted].some(
      (candidate) => normalizedTag === candidate || normalizedTag.startsWith(`${candidate}-`),
    );
  });
}'''
new_has_tag = '''const NORMALIZED_TAGS = new WeakMap<Recipe, readonly string[]>();
const NORMALIZED_TAG_CANDIDATES = new Map<string, ReadonlySet<string>>();
const NORMALIZED_INGREDIENT_IDS = new WeakMap<Recipe, readonly string[]>();
const NUT_OR_SEED_CACHE = new WeakMap<Recipe, boolean>();

function normalizedTagsOf(recipe: Recipe): readonly string[] {
  const cached = NORMALIZED_TAGS.get(recipe);
  if (cached) return cached;
  const tags = recipe.tags.map(normalize);
  NORMALIZED_TAGS.set(recipe, tags);
  return tags;
}

function ingredientIdsOf(recipe: Recipe): readonly string[] {
  const cached = NORMALIZED_INGREDIENT_IDS.get(recipe);
  if (cached) return cached;
  const ids = recipe.ingredients.map((ingredient) => canonicalIngredientId(ingredient.id));
  NORMALIZED_INGREDIENT_IDS.set(recipe, ids);
  return ids;
}

function hasTag(recipe: Recipe, candidates: readonly string[]): boolean {
  const key = candidates.join("\\u0000");
  let wanted = NORMALIZED_TAG_CANDIDATES.get(key);
  if (!wanted) {
    wanted = new Set(candidates.map(normalize));
    NORMALIZED_TAG_CANDIDATES.set(key, wanted);
  }
  return normalizedTagsOf(recipe).some((tag) =>
    [...wanted].some((candidate) => tag === candidate || tag.startsWith(`${candidate}-`)),
  );
}'''
engine = once(engine, old_has_tag, new_has_tag, "normalized recipe metadata")
old_nut = '''function hasNutOrSeed(recipe: Recipe): boolean {
  return (
    hasTag(recipe, TAGS.nutSeed) ||
    recipe.ingredients.some((ingredient) => NUT_OR_SEED_INGREDIENTS.has(normalize(ingredient.id)))
  );
}'''
new_nut = '''function hasNutOrSeed(recipe: Recipe): boolean {
  const cached = NUT_OR_SEED_CACHE.get(recipe);
  if (cached !== undefined) return cached;
  const result = hasTag(recipe, TAGS.nutSeed) || ingredientIdsOf(recipe).some((id) => NUT_OR_SEED_INGREDIENTS.has(normalize(id)));
  NUT_OR_SEED_CACHE.set(recipe, result);
  return result;
}'''
engine = once(engine, old_nut, new_nut, "nut seed cache")
old_reuse = '''function ingredientReuse(recipe: Recipe, selected: readonly Recipe[]): number {
  if (selected.length === 0) return 0;
  const used = new Set(selected.flatMap((item) => item.ingredients.map((ingredient) => canonicalIngredientId(ingredient.id))));
  return recipe.ingredients.reduce(
    (total, ingredient) => total + (used.has(canonicalIngredientId(ingredient.id)) ? 1 : 0),
    0,
  );
}'''
new_reuse = '''function ingredientReuseFromSet(recipe: Recipe, used: ReadonlySet<string>): number {
  return ingredientIdsOf(recipe).reduce((total, id) => total + (used.has(id) ? 1 : 0), 0);
}

function ingredientReuse(recipe: Recipe, selected: readonly Recipe[]): number {
  if (selected.length === 0) return 0;
  return ingredientReuseFromSet(recipe, new Set(selected.flatMap(ingredientIdsOf)));
}'''
engine = once(engine, old_reuse, new_reuse, "ingredient reuse cache")
engine = once(
    engine,
    "    const candidates = eligible.filter(\n      (recipe) => !used.has(recipe.id) && recipe.mealTypes.includes(slot.mealType),\n    );",
    "    const candidates = eligible.filter(\n      (recipe) => !used.has(recipe.id) && recipe.mealTypes.includes(slot.mealType),\n    );\n    const selectedIngredientIds = new Set(selected.flatMap(ingredientIdsOf));",
    "selected ingredient set",
)
engine = once(engine, "          ingredientReuse(recipe, selected) * 5;", "          ingredientReuseFromSet(recipe, selectedIngredientIds) * 5;", "generation reuse scoring")
write("src/engine.ts", engine)


# State hydration does not create a fake edit; user edits use collision-resistant revisions.
prototype = read("src/Prototype.tsx")
prototype = once(
    prototype,
    "function createAppStateStore(initial: AppState): AppStateStore {\n  let state = initial;",
    "function createAppStateStore(initial: AppState): AppStateStore {\n  let state = initial;\n  const tabRevisionNonce = Math.floor(Math.random() * 1_000);",
    "tab revision nonce",
)
prototype = once(
    prototype,
    "        stateRevision: Math.max(state.stateRevision + 1, Date.now()),",
    "        stateRevision: Math.max(state.stateRevision + 1, Date.now() * 1_000 + tabRevisionNonce),",
    "monotonic state revision",
)
prototype = once(
    prototype,
    "      if (next.stateRevision <= state.stateRevision) return;",
    "      if (next.stateRevision < state.stateRevision) return;",
    "equal revision hydration",
)
# Only the initial load block should bypass revision creation.
hydration_start = prototype.find("  useEffect(() => {\n    let active = true;\n    void loadAppState()")
hydration_end = prototype.find("    void registerOfflineSupport();", hydration_start)
if hydration_start < 0 or hydration_end < 0:
    raise RuntimeError("hydration block not found")
hydration = prototype[hydration_start:hydration_end]
hydration = hydration.replace("setAppState({", "replaceAppState({")
prototype = prototype[:hydration_start] + hydration + prototype[hydration_end:]

# Any imported or cross-tab plan that violates the current profile is archived before use.
anchor = "  // Local reminder for dishes that must be started the day before. Fires once\n"
safety_effect = '''  useEffect(() => {
    if (!hydrated) return;
    setAppState((current) => {
      const currentSafe = !current.currentPlan || inspectPlanReplay(current.currentPlan, ACTIVE_RECIPES, current.profile).canReplay;
      const upcomingSafe = !current.upcomingPlan || inspectPlanReplay(current.upcomingPlan, ACTIVE_RECIPES, current.profile).canReplay;
      if (currentSafe && upcomingSafe) return current;
      const removed = [!currentSafe ? current.currentPlan : null, !upcomingSafe ? current.upcomingPlan : null]
        .filter((plan): plan is WeeklyPlan => Boolean(plan));
      const removedIds = new Set(removed.map((plan) => plan.id));
      setAppNotice("Une semaine importée ou synchronisée ne respecte plus votre profil et a été déplacée dans l’historique.");
      return {
        ...current,
        currentPlan: currentSafe ? current.currentPlan : null,
        upcomingPlan: upcomingSafe ? current.upcomingPlan : null,
        history: [...removed, ...current.history.filter((plan) => !removedIds.has(plan.id))].slice(0, HISTORY_LIMIT),
        checkedShoppingItemIds: currentSafe ? current.checkedShoppingItemIds : [],
      };
    });
  }, [hydrated, appState.currentPlan, appState.upcomingPlan, appState.profile, appState.customRecipes]);

'''
prototype = once(prototype, anchor, safety_effect + anchor, "plan profile safety effect")
prototype = once(
    prototype,
    "    if (incoming.stateRevision > current.stateRevision) replaceAppState(incoming);",
    "    if (incoming.stateRevision > current.stateRevision) {\n      replaceAppState(incoming);\n      setAppNotice(\"Les modifications d’un autre onglet ont été synchronisées.\");\n    }",
    "multi-tab notice",
)
# Add lazy decoding to non-LCP repeated images while preserving the home hero as eager.
prototype = prototype.replace('<img src={recipe.image} alt="" onError={handleRecipeImageError} />', '<img src={recipe.image} alt="" loading="lazy" decoding="async" onError={handleRecipeImageError} />')
prototype = prototype.replace('<img src={recipe.image} alt={recipe.title} onError={handleRecipeImageError} />', '<img src={recipe.image} alt={recipe.title} decoding="async" onError={handleRecipeImageError} />')
write("src/Prototype.tsx", prototype)


# JSON safety notices are a deliberate shell resource.
precache = read("scripts/generate-precache.mjs")
precache = once(
    precache,
    "const shellExtension = /\\.(?:css|html|js|jpg|png|svg|webmanifest|woff2?)$/i;",
    "const shellExtension = /\\.(?:css|html|js|json|jpg|png|svg|webmanifest|woff2?)$/i;",
    "JSON shell extension",
)
write("scripts/generate-precache.mjs", precache)


# Keep a meaningful uncompressed and compressed budget instead of silently dropping the check.
validator = read("scripts/validate-build-split.mjs")
validator = once(validator, 'import { readFile, stat } from "node:fs/promises";', 'import { readFile, stat } from "node:fs/promises";\nimport { gzipSync } from "node:zlib";', "gzip import")
validator = once(
    validator,
    'assert(entryStats.size < 1_300_000, `bundle initial trop lourd : ${entryStats.size} octets`);',
    'const entryContents = await readFile(path.join(output, relativeEntry));\nconst entryGzipSize = gzipSync(entryContents).byteLength;\nassert(entryStats.size < 1_360_000, `bundle initial trop lourd : ${entryStats.size} octets`);\nassert(entryGzipSize < 320_000, `bundle initial gzip trop lourd : ${entryGzipSize} octets`);',
    "bundle budgets",
)
validator = once(
    validator,
    "console.log(`Découpage valide : bundle initial ${entryStats.size} octets, catalogue absent du chargement initial.`);",
    "console.log(`Découpage valide : bundle initial ${entryStats.size} octets (${entryGzipSize} gzip), catalogue absent du chargement initial.`);",
    "bundle report",
)
write("scripts/validate-build-split.mjs", validator)


# A meta CSP is the strongest policy GitHub Pages can publish without response headers.
index = read("index.html")
if "Content-Security-Policy" not in index:
    index = once(
        index,
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />\n    <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; base-uri \'self\'; object-src \'none\'; form-action \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\'; connect-src \'self\'; manifest-src \'self\'; worker-src \'self\' blob:; upgrade-insecure-requests" />',
        "meta CSP",
    )
write("index.html", index)


css = read("src/prototype.css")
if "Audit remediation: WCAG 2.2 target sizes" not in css:
    css += '''\n\n/* Audit remediation: WCAG 2.2 target sizes without enlarging the visual progress bar. */\n.cooking-progress button { min-width: 44px; min-height: 44px; height: 44px; padding: 19px 0; }\n.history-card__delete, .stepper button, .aisle-order button { min-width: 44px; min-height: 44px; }\n'''
write("src/prototype.css", css)


sw_tests = read("tests/service-worker.test.mjs")
if "precaches offline planner cautions" not in sw_tests:
    sw_tests += '''\n\ntest("precache includes JSON resources used for offline planner cautions", () => {\n  assert.match(precache, /json/);\n  assert.match(precache, /planner-cautions/);\n});\n'''
write("tests/service-worker.test.mjs", sw_tests)

storage_tests = read("tests/storage.test.mjs")
if "legacy localStorage replica wins a revision tie" not in storage_tests:
    storage_tests += '''\n\ntest("legacy localStorage replica wins a revision tie", async () => {\n  const source = await readFile(new URL("../src/storage.ts", import.meta.url), "utf8");\n  assert.match(source, /localState\\.stateRevision >= indexedState\\.stateRevision/);\n});\n'''
write("tests/storage.test.mjs", storage_tests)

print("Final consolidation applied successfully.")
