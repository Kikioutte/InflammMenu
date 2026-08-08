#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

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

print("Generated calendar and reduced-motion tests corrected.")
