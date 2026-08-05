#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";

const researchUrl = new URL("../research/", import.meta.url);
const requestedLimit = Number.parseInt(process.argv.find((argument) => /^--limit=\d+$/.test(argument))?.split("=")[1] ?? "25", 10);
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
  throw new Error("--limit doit être compris entre 1 et 100");
}

const files = (await readdir(researchUrl))
  .filter((name) => /^image-prompts-r\d{3}-r\d{3}\.json$/.test(name))
  .sort();
const waiting = [];

for (const file of files) {
  const document = JSON.parse(await readFile(new URL(file, researchUrl), "utf8"));
  for (const entry of document.prompts ?? document) {
    if (entry.status !== "waiting_image_generation") continue;
    waiting.push({
      id: entry.id,
      title: entry.title ?? entry.titre,
      output: entry.output_file ?? `public/assets/recipes/generated/${entry.slug_fichier}`,
      prompt_file: `research/${file}`,
    });
  }
}

waiting.sort((left, right) => left.id.localeCompare(right.id));
const batch = waiting.slice(0, requestedLimit);
console.log(`${waiting.length} images en attente. Prochain lot proposé : ${batch.length} recette${batch.length > 1 ? "s" : ""}.`);
for (const entry of batch) console.log(`${entry.id} | ${entry.title} | ${entry.output} | ${entry.prompt_file}`);
