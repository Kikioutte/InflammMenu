#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# CSP, SEO and a proper GitHub Pages fallback.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = index_path.read_text(encoding="utf-8")
index = index.replace("; upgrade-insecure-requests\" />", "\" />")
if 'rel="canonical"' not in index:
    index = replace_once(
        index,
        '    <meta name="description" content="Des menus anti-inflammatoires personnalisés pour toute la semaine." />',
        '    <meta name="description" content="Des menus anti-inflammatoires personnalisés pour toute la semaine." />\n'
        '    <link rel="canonical" href="https://kikioutte.github.io/InflammMenu/" />\n'
        '    <link rel="icon" type="image/png" sizes="192x192" href="/icons/app-icon-192.png" />',
        "canonical and favicon",
    )
if 'property="og:url"' not in index:
    index = replace_once(
        index,
        '    <meta property="og:type" content="website" />',
        '    <meta property="og:type" content="website" />\n'
        '    <meta property="og:url" content="https://kikioutte.github.io/InflammMenu/" />',
        "Open Graph URL",
    )
index = index.replace('content="/og.png"', 'content="/og.jpg"')
index_path.write_text(index, encoding="utf-8")

(ROOT / "public/robots.txt").write_text(
    "User-agent: *\nAllow: /InflammMenu/\nSitemap: https://kikioutte.github.io/InflammMenu/sitemap.xml\n",
    encoding="utf-8",
)
(ROOT / "public/sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    '  <url><loc>https://kikioutte.github.io/InflammMenu/</loc></url>\n'
    '</urlset>\n',
    encoding="utf-8",
)

pages_path = ROOT / "scripts/prepare-github-pages.mjs"
pages = pages_path.read_text(encoding="utf-8")
if "Create the GitHub Pages SPA fallback" not in pages:
    pages += '''\n\n// Create the GitHub Pages SPA fallback after every path has been rebased.\nconst { copyFile } = await import("node:fs/promises");\nawait copyFile(new URL("../dist/pages/index.html", import.meta.url), new URL("../dist/pages/404.html", import.meta.url));\n'''
pages_path.write_text(pages, encoding="utf-8")


# ---------------------------------------------------------------------------
# RFC 5545: safe newlines, explicit timezone and UTF-8 line folding.
# ---------------------------------------------------------------------------
engine_path = ROOT / "src/engine.ts"
engine = engine_path.read_text(encoding="utf-8")
old_escape = '    .replace(/\\r?\\n/g, "\\\\n")'
new_escape = '    .replace(/\\r\\n|\\r|\\n/g, "\\\\n")'
if old_escape in engine:
    engine = engine.replace(old_escape, new_escape, 1)
elif new_escape not in engine:
    raise RuntimeError("calendar newline escaping marker not found")

old_return = '''  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InflammMenu//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Inflamm’Menu",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\\r\\n");'''
new_return = '''  const foldLine = (line: string): string[] => {
    const folded: string[] = [];
    let current = "";
    let currentBytes = 0;
    let limit = 75;
    for (const character of line) {
      const characterBytes = new TextEncoder().encode(character).byteLength;
      if (current && currentBytes + characterBytes > limit) {
        folded.push(folded.length ? ` ${current}` : current);
        current = character;
        currentBytes = characterBytes;
        limit = 74;
      } else {
        current += character;
        currentBytes += characterBytes;
      }
    }
    folded.push(folded.length ? ` ${current}` : current);
    return folded;
  };

  const calendarLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InflammMenu//FR",
    "CALSCALE:GREGORIAN",
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
    ...events.flatMap((event) => event.split("\\r\\n")),
    "END:VCALENDAR",
  ];
  return [...calendarLines.flatMap(foldLine), ""].join("\\r\\n");'''
if old_return in engine:
    engine = engine.replace(old_return, new_return, 1)
elif "const foldLine = (line: string)" not in engine:
    raise RuntimeError("calendar output marker not found")
engine_path.write_text(engine, encoding="utf-8")

engine_test_path = ROOT / "tests/engine.test.mjs"
engine_tests = engine_test_path.read_text(encoding="utf-8")
if "calendar export escapes isolated carriage returns" not in engine_tests:
    engine_tests += r'''\n\ntest("calendar export escapes isolated carriage returns, folds long lines and declares its timezone", async () => {\n  const { planToCalendar } = await import("../src/engine.ts");\n  const recipe = {\n    id: "calendar-recipe", title: `Plat\\rX-EVIL:1 ${"é".repeat(90)}`, mealTypes: ["lunch"], diet: ["classic"],\n    prepMinutes: 1, costPerPortion: 1, seasons: ["all-year"], equipment: [], allergens: [], tags: [],\n    ingredients: [{ id: "ingredient", name: "Ingredient", quantity: 1, unit: "piece", category: "grocery" }],\n    nutrition: { calories: 1, protein: 1, fiber: 1, estimated: true, note: "Valeurs nutritionnelles estimatives par portion, à titre indicatif." },\n    description: "", steps: ["Faire"], conservation: "", image: "/assets/recipe-placeholder.svg",\n  };\n  const plan = {\n    id: "week", startsOn: "2026-08-03", generatedAt: "2026-08-03T00:00:00.000Z",\n    profileSnapshot: {}, version: 1, estimatedCost: 1,\n    meals: [{ id: "slot", dayIndex: 0, mealType: "lunch", recipeId: recipe.id, portions: 1, source: "generated" }],\n  };\n  const calendar = planToCalendar(plan, [recipe]);\n  assert.doesNotMatch(calendar, /\\r\\nX-EVIL:/);\n  assert.match(calendar, /Plat\\\\nX-EVIL:1/);\n  assert.match(calendar, /BEGIN:VTIMEZONE\\r\\nTZID:Europe\\/Paris/);\n  for (const line of calendar.split("\\r\\n")) {\n    assert.ok(Buffer.byteLength(line) <= 75, `calendar line exceeds 75 octets: ${Buffer.byteLength(line)}`);\n  }\n});\n'''
engine_test_path.write_text(engine_tests, encoding="utf-8")


# ---------------------------------------------------------------------------
# Live UI state, accessible tabs, Android notifications and stable React keys.
# ---------------------------------------------------------------------------
prototype_path = ROOT / "src/Prototype.tsx"
prototype = prototype_path.read_text(encoding="utf-8")
prototype = prototype.replace('<li key={step}><b>{index + 1}</b>', '<li key={`${index}-${step}`}><b>{index + 1}</b>')
prototype = prototype.replace(
    '<div id="library-panel" role="tabpanel" aria-labelledby={`library-tab-${mode}`}>',
    '<div id="library-panel" role="tabpanel" tabIndex={0} aria-labelledby={`library-tab-${mode}`}>',
)
old_history = '          history: current.currentPlan ? [current.currentPlan, ...current.history].slice(0, HISTORY_LIMIT) : current.history,'
new_history = '          history: current.currentPlan ? [current.currentPlan, ...current.history.filter((item) => item.id !== current.currentPlan?.id)].slice(0, HISTORY_LIMIT) : current.history,'
if old_history in prototype:
    prototype = prototype.replace(old_history, new_history, 1)
elif new_history not in prototype:
    raise RuntimeError("new week history de-duplication marker not found")

old_notification = '''    try {
      new Notification("À lancer ce soir", {
        body: due.map((item) => `${item.recipe.title} — ${formatRecipeDuration(item.minutes)} de repos`).join("\\n"),
        tag: `inflamm-menu-${today}`,
      });
      remindedOn.current = today;
    } catch {
      // A revoked or platform-level permission must not break the application.
    }'''
new_notification = '''    const showReminder = async () => {
      const options = {
        body: due.map((item) => `${item.recipe.title} — ${formatRecipeDuration(item.minutes)} de repos`).join("\\n"),
        tag: `inflamm-menu-${today}`,
      };
      try {
        const registration = "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration()
          : undefined;
        if (registration?.showNotification) await registration.showNotification("À lancer ce soir", options);
        else new Notification("À lancer ce soir", options);
        remindedOn.current = today;
      } catch {
        // A revoked or platform-level permission must not break the application.
      }
    };
    void showReminder();'''
if old_notification in prototype:
    prototype = prototype.replace(old_notification, new_notification, 1)
elif "registration?.showNotification" not in prototype:
    raise RuntimeError("notification compatibility marker not found")

# Reserve intrinsic dimensions for square recipe images while keeping CSS in control.
prototype = prototype.replace('src={recipe.image} alt="" loading="lazy" decoding="async"', 'src={recipe.image} alt="" width={900} height={900} loading="lazy" decoding="async"')
prototype = prototype.replace('src={recipe.image} alt={recipe.title} decoding="async"', 'src={recipe.image} alt={recipe.title} width={900} height={900} decoding="async"')
prototype = prototype.replace('src={catalogueImageFor(recipe)} alt="" loading="lazy" decoding="async"', 'src={catalogueImageFor(recipe)} alt="" width={900} height={900} loading="lazy" decoding="async"')
prototype = prototype.replace('src={catalogueImageFor(recipe)} alt={recipe.image.alt || recipe.titre}', 'src={catalogueImageFor(recipe)} alt={recipe.image.alt || recipe.titre} width={900} height={900}')
prototype_path.write_text(prototype, encoding="utf-8")


# ---------------------------------------------------------------------------
# Respect prefers-reduced-motion in the protected mobile runtime.
# ---------------------------------------------------------------------------
mobile_scroll_path = ROOT / "src/mobile/MobileScroll.tsx"
mobile_scroll = mobile_scroll_path.read_text(encoding="utf-8")
if "function prefersReducedMotion()" not in mobile_scroll:
    mobile_scroll = replace_once(
        mobile_scroll,
        '''function shouldIgnoreScrollDrag(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest('[data-scroll-drag="ignore"]'))
  );
}''',
        '''function shouldIgnoreScrollDrag(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest('[data-scroll-drag="ignore"]'))
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}''',
        "reduced motion helper",
    )
    mobile_scroll = replace_once(
        mobile_scroll,
        '    const clamped = Math.max(-scrollPhysics.maxOverdrag, Math.min(scrollPhysics.maxOverdrag, value));',
        '    const clamped = prefersReducedMotion() ? 0 : Math.max(-scrollPhysics.maxOverdrag, Math.min(scrollPhysics.maxOverdrag, value));',
        "reduced rubber band",
    )
    mobile_scroll = replace_once(
        mobile_scroll,
        '''  const rubberBand = useCallback((distance: number) => {
    return distance * scrollPhysics.overdragScale;
  }, []);''',
        '''  const rubberBand = useCallback((distance: number) => {
    return prefersReducedMotion() ? 0 : distance * scrollPhysics.overdragScale;
  }, []);''',
        "reduced overdrag",
    )
    mobile_scroll = replace_once(
        mobile_scroll,
        '''  const releaseVelocity = useCallback(() => {
    const samples = dragSamplesRef.current;''',
        '''  const releaseVelocity = useCallback(() => {
    if (prefersReducedMotion()) return 0;
    const samples = dragSamplesRef.current;''',
        "reduced release velocity",
    )
    mobile_scroll = replace_once(
        mobile_scroll,
        '''  const springBack = useCallback((initialVelocity = 0) => {
    stopInertia();

    let position = overscrollRef.current;''',
        '''  const springBack = useCallback((initialVelocity = 0) => {
    stopInertia();
    if (prefersReducedMotion()) {
      setRubberBand(0);
      return;
    }

    let position = overscrollRef.current;''',
        "reduced spring",
    )
    mobile_scroll = replace_once(
        mobile_scroll,
        '''  const startMomentum = useCallback((scroll: HTMLDivElement, initialVelocity: number) => {
    let velocity = initialVelocity;''',
        '''  const startMomentum = useCallback((scroll: HTMLDivElement, initialVelocity: number) => {
    if (prefersReducedMotion()) {
      updateThumb(true);
      return;
    }
    let velocity = initialVelocity;''',
        "reduced momentum",
    )
mobile_scroll_path.write_text(mobile_scroll, encoding="utf-8")

flow_path = ROOT / "src/mobile/FlowStack.tsx"
flow = flow_path.read_text(encoding="utf-8")
if "useReducedMotion" not in flow:
    flow = replace_once(
        flow,
        'import { AnimatePresence, motion, useIsPresent } from "motion/react";',
        'import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";',
        "motion reduced import",
    )
    flow = replace_once(
        flow,
        '''  const isPresent = useIsPresent();
  const isActive = isTop && isPresent;''',
        '''  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();
  const isActive = isTop && isPresent;''',
        "FlowScene reduced motion",
    )
    flow = replace_once(flow, '      initial={isTop ? "enter" : false}', '      initial={reduceMotion ? false : isTop ? "enter" : false}', "reduced initial")
    flow = replace_once(
        flow,
        '''      animate={{
        x: isTop ? swipeX : parkedX,
        scale: isTop ? 1 : 0.985,
      }}
      exit="exit"
      transition={{ type: "spring", stiffness: 360, damping: 38, mass: 0.9 }}''',
        '''      animate={{
        x: reduceMotion ? 0 : isTop ? swipeX : parkedX,
        scale: reduceMotion ? 1 : isTop ? 1 : 0.985,
      }}
      exit={reduceMotion ? { x: 0, scale: 1 } : "exit"}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 38, mass: 0.9 }}''',
        "reduced FlowScene transition",
    )
flow_path.write_text(flow, encoding="utf-8")

runtime_test_path = ROOT / "tests/mobile-runtime.spec.ts"
runtime_tests = runtime_test_path.read_text(encoding="utf-8")
if "reduced motion disables momentum" not in runtime_tests:
    runtime_tests += '''\n\ntest("reduced motion disables momentum and spring transitions", async ({ page }) => {\n  await page.emulateMedia({ reducedMotion: "reduce" });\n  await page.goto("/tests/runtime-fixture.html");\n  const parent = page.getByTestId("mobile-scroll");\n  await drag(page, parent, 0, -140, 4);\n  const afterRelease = await parent.evaluate((element) => element.scrollTop);\n  await page.waitForTimeout(300);\n  expect(await parent.evaluate((element) => element.scrollTop)).toBeCloseTo(afterRelease, 0);\n  expect(Math.abs(Number(await parent.getAttribute("data-overscroll")))).toBeLessThan(0.1);\n\n  await page.goto("/tests/runtime-fixture.html?fixture=flow");\n  await page.getByRole("button", { name: "Push level 2" }).click();\n  const current = page.getByTestId("flow-current");\n  await expect(current).toBeVisible();\n  const transform = await current.evaluate((element) => getComputedStyle(element).transform);\n  expect(transform === "none" || new DOMMatrixReadOnly(transform).m41 === 0).toBe(true);\n});\n'''
runtime_test_path.write_text(runtime_tests, encoding="utf-8")


# ---------------------------------------------------------------------------
# Standalone Sites test, focus visibility and static regression assertions.
# ---------------------------------------------------------------------------
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["scripts"]["test:sites"] = "npm run build && node --test tests/sites-worker.test.mjs"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

css_path = ROOT / "src/prototype.css"
css = css_path.read_text(encoding="utf-8")
if "Audit remediation: explicit keyboard focus" not in css:
    css += '''\n\n/* Audit remediation: explicit keyboard focus and reduced-motion completion. */\n:where(button, a, input, textarea, select, [tabindex]):focus-visible {\n  outline: 3px solid var(--terracotta);\n  outline-offset: 3px;\n}\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after { transition-duration: .01ms !important; }\n}\n'''
css_path.write_text(css, encoding="utf-8")

service_test_path = ROOT / "tests/service-worker.test.mjs"
service_tests = service_test_path.read_text(encoding="utf-8")
if "does not require HTTPS rewriting during local validation" not in service_tests:
    service_tests += '''\n\ntest("document CSP does not require HTTPS rewriting during local validation", async () => {\n  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");\n  assert.match(html, /Content-Security-Policy/);\n  assert.doesNotMatch(html, /upgrade-insecure-requests/);\n  assert.match(html, /object-src 'none'/);\n});\n'''
if "publishes canonical metadata and a Pages fallback" not in service_tests:
    service_tests += '''\n\ntest("publishes canonical metadata and a Pages fallback", async () => {\n  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");\n  const pages = await readFile(new URL("../scripts/prepare-github-pages.mjs", import.meta.url), "utf8");\n  assert.match(html, /rel="canonical"/);\n  assert.match(html, /property="og:url"/);\n  assert.match(html, /rel="icon"/);\n  assert.match(pages, /404\\.html/);\n});\n'''
service_test_path.write_text(service_tests, encoding="utf-8")

print("Final CSP, calendar, accessibility and compatibility hotfix applied.")
