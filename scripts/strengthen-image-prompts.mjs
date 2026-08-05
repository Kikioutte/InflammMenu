import { readdir, readFile, writeFile } from "node:fs/promises";

const researchUrl = new URL("../research/", import.meta.url);
const names = (await readdir(researchUrl)).filter((name) => /^image-prompts-r\d{3}-r\d{3}\.json$/.test(name));
const realism = " Ultra-photoréalisme : vraie texture de cuisson, découpes et proportions physiquement plausibles, petites irrégularités naturelles, profondeur de champ optique et couleurs alimentaires non sursaturées. Le résultat doit être indiscernable d'une photographie culinaire prise avec un appareil photo. Éviter absolument l'aspect plastique, la symétrie artificielle, les aliments dupliqués, les surfaces trop lisses, les formes impossibles, le brillant excessif et toute cuisson incohérente avec la recette.";
let updated = 0;

for (const name of names) {
  const url = new URL(name, researchUrl);
  const data = JSON.parse(await readFile(url, "utf8"));
  const prompts = Array.isArray(data) ? data : data.prompts;
  if (!Array.isArray(prompts)) throw new Error(`${name}: liste de prompts absente`);
  let changed = false;
  for (const entry of prompts) {
    if (!entry.prompt.includes("Ultra-photoréalisme")) {
      entry.prompt += realism;
      changed = true;
      updated += 1;
    }
  }
  if (changed) await writeFile(url, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(`${updated} prompts renforcés pour un rendu ultra-photoréaliste.`);
