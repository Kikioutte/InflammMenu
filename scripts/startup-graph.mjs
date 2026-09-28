import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

// These dynamic imports are awaited by planner-catalog at module evaluation:
// they block the initial application just like static dependencies. Other
// dynamic imports (secondary screens, recovery, catalogue) remain deferred.
export const BLOCKING_STARTUP_SOURCES = ["src/planner-source.ts", "src/catalog-validation.ts"];
// Baseline 83caa0d Pages: 2,260,576 raw / 406,225 gzip bytes, seven critical JS
// files. Headroom: 6.2% raw / 4.6% gzip. Never derive ceilings from a new build.
export const STARTUP_BUDGET = { rawBytes: 2_400_000, gzipBytes: 425_000 };
const origin = "https://startup-build.invalid";

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/\b([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]));
}

function tags(index, name) {
  // Build HTML is generated, not arbitrary markup. Respect quoted > characters
  // so attribute order/quotes do not affect dependency discovery or offsets.
  return [...index.matchAll(new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi"))]
    .map((match) => ({ ...attributes(match[0]), tagStart: match.index, tagEnd: match.index + match[0].length }));
}

function safeFile(file) {
  assert(typeof file === "string" && file && !file.includes("\\") && !file.startsWith("/")
    && !file.split("/").includes("..") && path.posix.normalize(file) === file, `chemin de build invalide : ${file}`);
  return file;
}

/** Discover the complete known critical JavaScript graph without requiring
 * preloads yet: also used by the post-build HTML preparation step. */
export async function loadStartupGraph(output) {
  const index = await readFile(path.join(output, "index.html"), "utf8");
  const manifest = JSON.parse(await readFile(path.join(output, ".vite/manifest.json"), "utf8"));
  const keysByFile = new Map();
  for (const [key, value] of Object.entries(manifest)) {
    safeFile(value.file);
    const keys = keysByFile.get(value.file) ?? [];
    keysByFile.set(value.file, [...keys, key]);
  }
  const scripts = tags(index, "script").filter((tag) => tag.src && (!tag.type || /^(module|(?:text|application)\/javascript)$/i.test(tag.type)));
  assert(scripts.length, "bundle d'entrée introuvable");
  const firstUrl = new URL(scripts[0].src, `${origin}/`);
  assert.equal(firstUrl.origin, origin, "script initial externe interdit");
  const matching = [...keysByFile.keys()].filter((file) => firstUrl.pathname.endsWith(`/${file}`));
  assert.equal(matching.length, 1, "le script d'entrée doit correspondre à un fichier unique du manifeste");
  const basePath = firstUrl.pathname.slice(0, -matching[0].length);
  function fileFor(reference) {
    const url = new URL(reference, `${origin}${basePath}`);
    assert.equal(url.origin, origin, `dépendance initiale externe interdite : ${reference}`);
    assert(url.pathname.startsWith(basePath), `dépendance hors base ${basePath} : ${reference}`);
    const file = safeFile(decodeURIComponent(url.pathname.slice(basePath.length)));
    assert(/\.m?js$/i.test(file), `dépendance initiale non JavaScript : ${reference}`);
    assert(keysByFile.has(file), `dépendance absente du manifeste : ${file}`);
    return file;
  }
  const entryFiles = [...new Set(scripts.map((tag) => fileFor(tag.src)))];
  const modulePreloads = tags(index, "link").filter((tag) => tag.rel?.toLowerCase().split(/\s+/).includes("modulepreload"))
    .map((tag) => { assert(tag.href, "modulepreload sans href"); return { file: fileFor(tag.href), tagStart: tag.tagStart, tagEnd: tag.tagEnd }; });
  const scriptPreloads = tags(index, "link").filter((tag) => tag.rel?.toLowerCase().split(/\s+/).includes("preload") && tag.as?.toLowerCase() === "script")
    .map((tag) => { assert(tag.href, "preload script sans href"); return { file: fileFor(tag.href), tagStart: tag.tagStart, tagEnd: tag.tagEnd }; });
  function closure(rootKeys) {
    const keys = new Set();
    const visit = (key) => {
      if (keys.has(key)) return;
      const item = manifest[key];
      assert(item, `import statique absent du manifeste : ${key}`);
      assert(/\.m?js$/i.test(item.file), `import statique non JavaScript : ${key}`);
      keys.add(key);
      for (const dependency of item.imports ?? []) visit(dependency);
    };
    for (const key of rootKeys) visit(key);
    return keys;
  }
  const entryKeys = entryFiles.flatMap((file) => keysByFile.get(file));
  const staticEntryKeys = closure(entryKeys);
  const dynamicFromEntry = new Set([...staticEntryKeys].flatMap((key) => manifest[key].dynamicImports ?? []));
  const blockingKeys = BLOCKING_STARTUP_SOURCES.map((source) => {
    const matches = Object.keys(manifest).filter((key) => key === source || manifest[key].src === source);
    assert.equal(matches.length, 1, `racine bloquante introuvable ou ambiguë : ${source}`);
    const key = matches[0];
    assert(staticEntryKeys.has(key) || dynamicFromEntry.has(key), `racine bloquante sans lien avec l'entrée : ${source}`);
    return key;
  });
  const requiredPreloads = [...new Set([...closure(blockingKeys)].map((key) => manifest[key].file))].sort();
  // Always count blockers, even when HTML forgot a preload. Missing preloads
  // must fail independently instead of producing an artificially small total.
  const initialKeys = closure([...entryKeys, ...blockingKeys, ...[...modulePreloads, ...scriptPreloads].flatMap(({ file }) => keysByFile.get(file))]);
  const initialPaths = [...new Set([...initialKeys].map((key) => manifest[key].file))].sort();
  const initialFiles = await Promise.all(initialPaths.map(async (file) => {
    const contents = await readFile(path.join(output, file));
    return { file, rawBytes: contents.byteLength, gzipBytes: gzipSync(contents, { level: 6 }).byteLength };
  }));
  return {
    index, entryTagStart: scripts[0].tagStart, entryFiles, basePath, modulePreloads, scriptPreloads, requiredPreloads, initialFiles,
    initialSources: [...initialKeys].map((key) => ({ key, src: manifest[key].src ?? "", file: manifest[key].file })),
    rawBytes: initialFiles.reduce((sum, file) => sum + file.rawBytes, 0),
    gzipBytes: initialFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
  };
}

export function validateStartupGraph(graph) {
  for (const { key, src, file } of graph.initialSources) {
    assert(!/(?:^|\/)secondary-views(?:[-.]|$)/.test(`${key} ${src} ${file}`), "les écrans secondaires sont dans le graphe initial");
    assert(!/(?:^|\/)catalogue-[^/\s]+\.m?js|recettes-anti-inflammatoires[^\s]*\.json/.test(`${key} ${src} ${file}`), "le catalogue complet est dans le graphe initial");
  }
  assert(graph.rawBytes <= STARTUP_BUDGET.rawBytes, `JavaScript initial total trop lourd : ${graph.rawBytes} octets (plafond ${STARTUP_BUDGET.rawBytes})`);
  assert(graph.gzipBytes <= STARTUP_BUDGET.gzipBytes, `JavaScript initial total gzip trop lourd : ${graph.gzipBytes} octets (plafond ${STARTUP_BUDGET.gzipBytes})`);
  for (const file of graph.requiredPreloads) {
    const links = graph.modulePreloads.filter((preload) => preload.file === file);
    assert.equal(links.length, 1, `préchargement bloquant absent ou dupliqué : ${file}`);
    assert(links[0].tagStart < graph.entryTagStart, `préchargement bloquant après le script d'entrée : ${file}`);
  }
}
