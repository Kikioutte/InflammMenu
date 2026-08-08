#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path): return (ROOT / path).read_text(encoding="utf-8")
def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
def once(text, old, new, label):
    count = text.count(old)
    if count != 1: raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)

planner = read("scripts/generate-planner-recipes.mjs")
planner = once(planner, 'import { readFile, writeFile } from "node:fs/promises";', 'import { mkdir, readFile, writeFile } from "node:fs/promises";', "planner fs imports")
planner = once(planner, 'const outputUrl = new URL("src/data/planner-recipes.json", root);', 'const outputUrl = new URL("src/data/planner-recipes.json", root);\nconst cautionsUrl = new URL("public/data/planner-cautions.json", root);', "cautions output")
planner = planner.replace('    ...(recipe.app.review.caution ? { caution: recipe.app.review.caution } : {}),\n', '')
start = planner.find('assert(recipes.length > 0')
if start < 0: raise RuntimeError("planner output block not found")
planner = planner[:start] + '''assert(recipes.length > 0, "projection planificateur vide");
const cautions = Object.fromEntries(catalogue.recipes
  .filter((recipe) => !recipe.app.duplicate_of && recipe.app.planner.eligible && recipe.app.review.caution)
  .map((recipe) => [`catalog-${recipe.id}`, recipe.app.review.caution]));
const serialized = `${JSON.stringify(recipes)}\\n`;
const serializedCautions = `${JSON.stringify(cautions)}\\n`;
if (process.argv.includes("--check")) {
  const [current, currentCautions] = await Promise.all([
    readFile(outputUrl, "utf8").catch(() => ""),
    readFile(cautionsUrl, "utf8").catch(() => ""),
  ]);
  assert.equal(current, serialized, "planner-recipes.json n'est pas synchronisé avec le catalogue");
  assert.equal(currentCautions, serializedCautions, "planner-cautions.json n'est pas synchronisé avec le catalogue");
  console.log(`Projection planificateur valide : ${recipes.length} recettes, ${Buffer.byteLength(serialized)} octets, ${Object.keys(cautions).length} précautions hors ligne.`);
} else {
  await mkdir(new URL("./", cautionsUrl), { recursive: true });
  await Promise.all([
    writeFile(outputUrl, serialized),
    writeFile(cautionsUrl, serializedCautions),
  ]);
  console.log(`Projection planificateur générée : ${recipes.length} recettes, ${Buffer.byteLength(serialized)} octets, ${Object.keys(cautions).length} précautions hors ligne.`);
}
'''
write("scripts/generate-planner-recipes.mjs", planner)

catalog = read("src/catalog.ts")
catalog = once(catalog, 'export const CATALOGUE_CACHE_NAME = "inflamm-menu-catalogue-v1";\n', 'export const CATALOGUE_CACHE_NAME = "inflamm-menu-catalogue-v1";\nconst plannerCautionsUrl = `${import.meta.env?.BASE_URL ?? "/"}data/planner-cautions.json`;\nlet plannerCautionsPromise: Promise<Record<string, string>> | null = null;\n\nexport function loadPlannerCaution(recipeId: string): Promise<string | undefined> {\n  plannerCautionsPromise ??= fetch(plannerCautionsUrl, { headers: { Accept: "application/json" } })\n    .then((response) => {\n      if (!response.ok) throw new Error(`Précautions indisponibles (${response.status})`);\n      return response.json() as Promise<Record<string, string>>;\n    })\n    .catch((error) => { plannerCautionsPromise = null; throw error; });\n  return plannerCautionsPromise.then((cautions) => cautions[recipeId]);\n}\n', "planner caution loader")
write("src/catalog.ts", catalog)

prototype = read("src/Prototype.tsx")
prototype = once(prototype, '  loadCatalogue,\n  cacheCatalogueForOffline,', '  loadCatalogue,\n  loadPlannerCaution,\n  cacheCatalogueForOffline,', "Prototype caution import")
prototype = once(prototype, '  const [catalogueRecipe, setCatalogueRecipe] = useState<CatalogueRecipe | undefined>();\n  useEffect(() => {', '  const [catalogueRecipe, setCatalogueRecipe] = useState<CatalogueRecipe | undefined>();\n  const [offlineCaution, setOfflineCaution] = useState<string | undefined>(recipe.caution);\n  useEffect(() => {\n    if (!recipe.id.startsWith("catalog-")) { setOfflineCaution(recipe.caution); return; }\n    let active = true;\n    void loadPlannerCaution(recipe.id).then((caution) => { if (active) setOfflineCaution(caution); }).catch(() => undefined);\n    return () => { active = false; };\n  }, [recipe.id, recipe.caution]);\n  useEffect(() => {', "offline caution effect")
prototype = once(prototype, '  const displayedCaution = recipe.caution ?? catalogueReview?.caution;', '  const displayedCaution = recipe.caution ?? offlineCaution ?? catalogueReview?.caution;', "displayed offline caution")
write("src/Prototype.tsx", prototype)

sw = read("public/sw.js")
sw = once(sw, '  if (url.pathname.endsWith("recettes-anti-inflammatoires.json")) {\n    event.respondWith(cacheFirst(request, CATALOGUE_CACHE));\n    return;\n  }', '  if (url.pathname.endsWith("recettes-anti-inflammatoires.json")) {\n    event.respondWith(cacheFirst(request, CATALOGUE_CACHE));\n    return;\n  }\n  if (url.pathname.endsWith("planner-cautions.json")) {\n    event.respondWith(cacheFirst(request, SHELL_CACHE));\n    return;\n  }', "service worker caution cache")
write("public/sw.js", sw)

precache = read("scripts/generate-precache.mjs")
precache = once(precache, 'const references = new Set([\n  normalizedBase,\n  `${normalizedBase}index.html`,\n  `${normalizedBase}manifest.webmanifest`,\n]);', 'const references = new Set([\n  normalizedBase,\n  `${normalizedBase}index.html`,\n  `${normalizedBase}manifest.webmanifest`,\n]);\nconst plannerCautionsPath = `${normalizedBase}data/planner-cautions.json`;\nif (existsSync(outputFileFor(plannerCautionsPath))) references.add(plannerCautionsPath);', "precache cautions")
write("scripts/generate-precache.mjs", precache)

print("Planner cautions split into a precached offline asset.")
