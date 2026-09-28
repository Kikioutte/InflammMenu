#!/usr/bin/env node
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadStartupGraph } from "./startup-graph.mjs";

/**
 * The planner's validated, synchronous registry still waits for its two split
 * modules. Discover those downloads in HTML, without inlining the planner or
 * changing when its runtime validation runs. Manifest identities, not hashed
 * filename guesses, select this deliberately small critical graph.
 */
export async function prepareStartupPreloads(output) {
  const directory = path.resolve(output);
  const graph = await loadStartupGraph(directory);
  const { index, entryTagStart, basePath, requiredPreloads, modulePreloads } = graph;
  assert(requiredPreloads.length > 0, "Aucun module critique à précharger.");
  assert(new Set(requiredPreloads).size === requiredPreloads.length, "Modules critiques dupliqués.");
  assert(Number.isInteger(entryTagStart) && entryTagStart >= 0, "Point d’insertion de l’entrée invalide.");
  const required = new Set(requiredPreloads);
  const removals = modulePreloads.filter((entry) => required.has(entry.file)).map((entry) => {
    assert(Number.isInteger(entry.tagEnd) && entry.tagEnd > entry.tagStart, "Balise de préchargement incomplète.");
    const lineStart = index.lastIndexOf("\n", entry.tagStart - 1) + 1;
    const nextLine = index.indexOf("\n", entry.tagEnd);
    const lineEnd = nextLine === -1 ? index.length : nextLine;
    // Removing complete whitespace-only lines keeps repeat runs byte-identical.
    const ownsLine = /^[\t ]*$/.test(index.slice(lineStart, entry.tagStart))
      && /^[\t \r]*$/.test(index.slice(entry.tagEnd, lineEnd));
    return ownsLine
      ? { start: lineStart, end: nextLine === -1 ? lineEnd : lineEnd + 1 }
      : { start: entry.tagStart, end: entry.tagEnd };
  }).sort((left, right) => left.start - right.start);
  for (let offset = 1; offset < removals.length; offset += 1) {
    assert(removals[offset - 1].end <= removals[offset].start, "Balises de préchargement superposées.");
  }
  const lineStart = index.lastIndexOf("\n", entryTagStart - 1) + 1;
  const prefix = index.slice(lineStart, entryTagStart);
  const entryOwnsLine = /^[\t ]*$/.test(prefix);
  const insertion = entryOwnsLine ? lineStart : entryTagStart;
  const indentation = entryOwnsLine ? prefix : "";
  assert(removals.every((range) => range.end <= insertion || range.start >= entryTagStart), "L’entrée recoupe un préchargement.");
  const removedBefore = removals.filter((range) => range.end <= insertion)
    .reduce((bytes, range) => bytes + range.end - range.start, 0);
  let updated = index;
  for (const range of [...removals].reverse()) updated = updated.slice(0, range.start) + updated.slice(range.end);
  const escapeAttribute = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const links = (entryOwnsLine ? "" : "\n") + requiredPreloads.map((file) => `${indentation}<link rel="modulepreload" crossorigin href="${escapeAttribute(`${basePath}${file}`)}">`).join("\n") + "\n";
  const at = insertion - removedBefore;
  updated = updated.slice(0, at) + links + updated.slice(at);
  if (updated !== index) await writeFile(path.join(directory, "index.html"), updated);
  return { files: requiredPreloads, changed: updated !== index };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { files } = await prepareStartupPreloads(process.argv[2] ?? "dist/client");
  console.log(`Préchargement critique préparé : ${files.length} modules séparés, avant l’entrée.`);
}
