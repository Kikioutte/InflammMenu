import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const recipeFiles = process.argv.slice(2);
if (recipeFiles.length === 0) {
  throw new Error("Usage: node scripts/generate-image-prompts.mjs <lot.json> [...]");
}

for (const recipeFile of recipeFiles) {
  const catalogue = JSON.parse(await readFile(recipeFile, "utf8"));
  const prompts = catalogue.recipes.map((recipe) => {
    const visibleIngredients = recipe.ingredients
      .filter((ingredient) => !ingredient.facultatif)
      .slice(0, 9)
      .map((ingredient) => ingredient.nom);
    return {
      id: recipe.id,
      title: recipe.titre,
      output_file: `public/assets/recipes/generated/${recipe.image.nom_fichier}`,
      status: "waiting_image_generation",
      prompt: [
        `Photographie culinaire éditoriale premium, carrée, réaliste, de la recette française « ${recipe.titre} ».`,
        `Montrer fidèlement le plat fini avec uniquement les ingrédients réellement présents et visibles lorsque pertinent : ${visibleIngredients.join(", ")}.`,
        "Vaisselle artisanale en céramique crème, petite touche de textile sauge, fond minéral clair, lumière naturelle chaude venant de côté, ombres douces, palette ivoire, vert sauge et terre cuite.",
        "Cadrage trois-quarts légèrement plongeant, portion crédible, texture appétissante mais naturelle, stylisme sobre, aucune garniture absente de la recette.",
        "Ultra-photoréalisme : vraie texture de cuisson, découpes et proportions physiquement plausibles, petites irrégularités naturelles, profondeur de champ optique et couleurs alimentaires non sursaturées. Le résultat doit être indiscernable d'une photographie culinaire prise avec un appareil photo.",
        "Éviter absolument l'aspect plastique, la symétrie artificielle, les aliments dupliqués, les surfaces trop lisses, les formes impossibles, le brillant excessif et toute cuisson incohérente avec la recette.",
        "Aucun texte, logo, emballage, ustensile tenu, main ni personne. Pas de collage, pas d'illustration, pas de cadre de téléphone.",
      ].join(" "),
    };
  });
  const range = basename(recipeFile).match(/pilot-(r\d{3}-r\d{3})/)?.[1];
  if (!range) throw new Error(`${recipeFile}: plage introuvable`);
  const output = `research/image-prompts-${range}.json`;
  await writeFile(output, `${JSON.stringify({
    meta: {
      generated_at: new Date().toISOString(),
      recipe_file: basename(recipeFile),
      count: prompts.length,
      target: "JPEG 900x900, qualité 82-88, <= 350 Ko",
    },
    prompts,
  }, null, 2)}\n`);
  console.log(`${prompts.length} prompts créés dans ${output}.`);
}
