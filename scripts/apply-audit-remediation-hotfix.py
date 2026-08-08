#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

index_path = ROOT / "index.html"
index = index_path.read_text(encoding="utf-8")
index = index.replace("; upgrade-insecure-requests\" />", "\" />")
index_path.write_text(index, encoding="utf-8")

# Make the offline-safety contract executable in the static service-worker suite.
test_path = ROOT / "tests/service-worker.test.mjs"
tests = test_path.read_text(encoding="utf-8")
if "does not require HTTPS rewriting during local validation" not in tests:
    tests += '''\n\ntest("document CSP does not require HTTPS rewriting during local validation", async () => {\n  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");\n  assert.match(html, /Content-Security-Policy/);\n  assert.doesNotMatch(html, /upgrade-insecure-requests/);\n  assert.match(html, /object-src 'none'/);\n});\n'''
test_path.write_text(tests, encoding="utf-8")

# RFC 5545: an isolated carriage return must never become a new content line.
engine_path = ROOT / "src/engine.ts"
engine = engine_path.read_text(encoding="utf-8")
old_escape = '    .replace(/\\r?\\n/g, "\\\\n")'
new_escape = '    .replace(/\\r\\n|\\r|\\n/g, "\\\\n")'
if old_escape in engine:
    engine = engine.replace(old_escape, new_escape, 1)
elif new_escape not in engine:
    raise RuntimeError("calendar newline escaping marker not found")

# Supply an explicit Europe/Paris timezone definition for strict calendar clients.
old_calendar = '''    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Inflamm’Menu",
    ...events,'''
new_calendar = '''    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Inflamm’Menu",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Paris",
    "X-LIC-LOCATION:Europe/Paris",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events,'''
if old_calendar in engine:
    engine = engine.replace(old_calendar, new_calendar, 1)
elif '"BEGIN:VTIMEZONE"' not in engine:
    raise RuntimeError("calendar timezone insertion marker not found")
engine_path.write_text(engine, encoding="utf-8")

engine_test_path = ROOT / "tests/engine.test.mjs"
engine_tests = engine_test_path.read_text(encoding="utf-8")
if "calendar export escapes isolated carriage returns" not in engine_tests:
    engine_tests += r'''\n\ntest("calendar export escapes isolated carriage returns and declares its timezone", async () => {\n  const { planToCalendar } = await import("../src/engine.ts");\n  const recipe = {\n    id: "calendar-recipe", title: "Plat\\rX-EVIL:1", mealTypes: ["lunch"], diet: ["classic"],\n    prepMinutes: 1, costPerPortion: 1, seasons: ["all-year"], equipment: [], allergens: [], tags: [],\n    ingredients: [{ id: "ingredient", name: "Ingredient", quantity: 1, unit: "piece", category: "grocery" }],\n    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },\n    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",\n  };\n  const plan = {\n    id: "week", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",\n    profileSnapshot: {}, version: 1, estimatedCost: 1,\n    meals: [{ id: "slot", dayIndex: 0, mealType: "lunch", recipeId: recipe.id, portions: 1, source: "generated" }],\n  };\n  const calendar = planToCalendar(plan, [recipe]);\n  assert.doesNotMatch(calendar, /\\r\\nX-EVIL:/);\n  assert.match(calendar, /Plat\\\\nX-EVIL:1/);\n  assert.match(calendar, /BEGIN:VTIMEZONE\\r\\nTZID:Europe\\/Paris/);\n});\n'''
engine_test_path.write_text(engine_tests, encoding="utf-8")

print("Final CSP and calendar hotfix applied.")
