#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Repair the generated calendar regression test so the source itself contains
# no accidental control characters or invalid cross-realm browser assertions.
# ---------------------------------------------------------------------------
engine_tests_path = ROOT / "tests/engine.test.mjs"
engine_tests = engine_tests_path.read_text(encoding="utf-8")
marker = 'test("calendar export escapes isolated carriage returns, folds long lines and declares its timezone"'
position = engine_tests.find(marker)
if position < 0:
    raise RuntimeError("calendar regression test marker not found")
prefix = engine_tests[:position]
if prefix.endswith("\\n\\n"):
    prefix = prefix[:-4]
prefix = prefix.rstrip() + "\n\n"
calendar_test = '''test("calendar export escapes isolated carriage returns, folds long lines and declares its timezone", async () => {
  const { planToCalendar } = await import("../src/engine.ts");
  const recipe = {
    id: "calendar-recipe", title: `Plat${String.fromCharCode(13)}X-EVIL:1 ${"é".repeat(90)}`, mealTypes: ["lunch"], diet: ["classic"],
    prepMinutes: 1, costPerPortion: 1, seasons: ["all-year"], equipment: [], allergens: [], tags: [],
    ingredients: [{ id: "ingredient", name: "Ingredient", quantity: 1, unit: "piece", category: "grocery" }],
    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",
  };
  const plan = {
    id: "week", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",
    profileSnapshot: {}, version: 1, estimatedCost: 1,
    meals: [{ id: "slot", dayIndex: 0, mealType: "lunch", recipeId: recipe.id, portions: 1, source: "generated" }],
  };
  const calendar = planToCalendar(plan, [recipe]);
  assert.equal(calendar.includes("\\r\\nX-EVIL:"), false);
  assert.ok(calendar.includes("Plat\\\\nX-EVIL:1"));
  assert.ok(calendar.includes("BEGIN:VTIMEZONE\\r\\nTZID:Europe/Paris"));
  for (const line of calendar.split("\\r\\n")) {
    assert.ok(Buffer.byteLength(line) <= 75, `calendar line exceeds 75 octets: ${Buffer.byteLength(line)}`);
  }
});
'''
engine_tests_path.write_text(prefix + calendar_test, encoding="utf-8")

runtime_path = ROOT / "tests/mobile-runtime.spec.ts"
runtime = runtime_path.read_text(encoding="utf-8")
old = '''  const transform = await current.evaluate((element) => getComputedStyle(element).transform);
  expect(transform === "none" || new DOMMatrixReadOnly(transform).m41 === 0).toBe(true);'''
new = '''  const translateX = await current.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
  });
  expect(translateX).toBeCloseTo(0, 0);'''
if old in runtime:
    runtime = runtime.replace(old, new, 1)
elif "const translateX = await current.evaluate" not in runtime:
    raise RuntimeError("reduced-motion browser assertion marker not found")
runtime_path.write_text(runtime, encoding="utf-8")


# ---------------------------------------------------------------------------
# Keep strict imports while remaining compatible with the historical wrapper
# `{ state: <raw app state> }`. An empty or foreign wrapper is still rejected.
# ---------------------------------------------------------------------------
storage_path = ROOT / "src/storage.ts"
storage = storage_path.read_text(encoding="utf-8")
storage = replace_once(
    storage,
    '''  } else {
    if (!Object.keys(parsed).some((key) => RECOGNIZED_STATE_KEYS.has(key))) {
      throw new Error("Ce fichier ne contient aucune donnée Inflamm’Menu reconnue.");
    }
    candidate = parsed;
  }''',
    '''  } else {
    const rawCandidate = isRecord(parsed.state) ? parsed.state : parsed;
    if (!Object.keys(rawCandidate).some((key) => RECOGNIZED_STATE_KEYS.has(key))) {
      throw new Error("Ce fichier ne contient aucune donnée Inflamm’Menu reconnue.");
    }
    candidate = rawCandidate;
  }''',
    "legacy raw-state wrapper",
)
storage_path.write_text(storage, encoding="utf-8")


# ---------------------------------------------------------------------------
# Update legacy tests to express the tightened invariants rather than relying
# on a duplicate current/history plan or an intentionally incomplete recipe.
# ---------------------------------------------------------------------------
storage_tests_path = ROOT / "tests/storage.test.mjs"
storage_tests = storage_tests_path.read_text(encoding="utf-8")
if 'from "node:fs/promises"' not in storage_tests:
    storage_tests = replace_once(
        storage_tests,
        'import assert from "node:assert/strict";\nimport test from "node:test";',
        'import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport test from "node:test";',
        "storage test readFile import",
    )

storage_tests = replace_once(
    storage_tests,
    '''  const migrated = migrateAppState(state({ currentPlan, history: [currentPlan] }));

  assert.equal(migrated?.currentPlan?.meals[0].locked, true);
  assert.equal(migrated?.currentPlan?.meals[1].completed, true);
  assert.equal(migrated?.history[0].meals[0].locked, true);''',
    '''  const archivedPlan = {
    ...currentPlan,
    id: "week-2026-07-27-archive",
    startsOn: "2026-07-27",
    generatedAt: "2026-07-27T00:00:00.000Z",
  };
  const migrated = migrateAppState(state({ currentPlan, history: [archivedPlan] }));

  assert.equal(migrated?.currentPlan?.meals[0].locked, true);
  assert.equal(migrated?.currentPlan?.meals[1].completed, true);
  assert.equal(migrated?.history[0].meals[0].locked, true);''',
    "non-duplicated archived plan fixture",
)

storage_tests = replace_once(
    storage_tests,
    '''    customRecipes: [{ id: "sans-prefixe", title: "x" }, { id: "perso-1", title: "Ma version", mealTypes: ["lunch"], ingredients: [], steps: [], prepMinutes: 10, costPerPortion: 2 }],''',
    '''    customRecipes: [
      { id: "sans-prefixe", title: "x" },
      {
        id: "perso-1",
        title: "Ma version",
        mealTypes: ["lunch"],
        diet: ["classic", "vegetarian", "no-pork"],
        prepMinutes: 10,
        costPerPortion: 2,
        seasons: ["all-year"],
        equipment: [],
        allergens: [],
        tags: ["maison"],
        ingredients: [{ id: "carrot", name: "Carotte", quantity: 100, unit: "g", category: "fruit-vegetable" }],
        nutrition: { calories: 100, protein: 2, fiber: 3, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },
        description: "Une version personnelle valide.",
        steps: ["Préparer les ingrédients."],
        conservation: "À consommer rapidement.",
        image: "/assets/recipe-placeholder.svg",
      },
    ],''',
    "complete personal recipe fixture",
)
storage_tests_path.write_text(storage_tests, encoding="utf-8")

print("Generated calendar, storage compatibility and reduced-motion tests corrected.")
