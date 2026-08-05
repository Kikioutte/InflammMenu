import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const previousLots = [
  "r051-r075",
  "r076-r100",
  "r101-r125",
  "r126-r150",
  "r151-r175",
  "r176-r200",
  "r201-r225",
  "r226-r250",
  "r251-r275",
  "r276-r300",
  "r301-r325",
  "r326-r350",
  "r351-r375",
  "r376-r400",
  "r426-r450",
  "r451-r475",
];

const [draft, ...previousMaps] = await Promise.all([
  readFile(new URL("research/pilot-r476-r500.draft.json", root), "utf8").then(JSON.parse),
  ...previousLots.map((lot) =>
    readFile(new URL(`research/ciqual-map-${lot}.json`, root), "utf8").then(JSON.parse),
  ),
]);

const known = new Map();
for (let index = 0; index < previousMaps.length; index += 1) {
  for (const entry of previousMaps[index].ingredients) {
    if (!known.has(entry.ingredient_id)) {
      known.set(entry.ingredient_id, {
        lot: previousLots[index],
        entry,
      });
    }
  }
}

const ciqual = (code, rationale, reviewStatus = "validated", extra = {}) => ({
  selected_ciqual_code: code,
  grams_per_normalized_unit: 1,
  review_status: reviewStatus,
  rationale,
  source_note: "Anses, Table Ciqual 2025, version 2025-11-03; correspondance contrôlée pour ce lot.",
  ...extra,
});

const newMappings = {
  "agar-agar": ciqual(
    "11085",
    "Agar séché; les valeurs Ciqual manquantes sont neutralisées et signalées. À 2 g par recette, leur effet sur l'estimation énergétique reste mineur.",
    "caution",
    {
      nutrient_overrides: {
        energy_kcal: {
          value: 0,
          note: "Énergie non renseignée dans Ciqual; valeur technique à zéro susceptible de sous-estimer légèrement l'apport.",
        },
        carbohydrate_g: {
          value: 0,
          note: "Glucides non renseignés dans Ciqual; valeur technique à zéro susceptible de sous-estimer légèrement l'apport.",
        },
        fiber_g: {
          value: 0,
          note: "Fibres non renseignées dans Ciqual; valeur technique à zéro qui sous-estime probablement les fibres de l'agar.",
        },
      },
    },
  ),
  "betterave-jaune-cuite": ciqual(
    "20003",
    "Betterave rouge cuite utilisée comme proxy de la variété jaune cuite.",
    "caution",
  ),
  "farine-avoine": ciqual(
    "9310",
    "Avoine crue utilisée pour la farine d'avoine pure; composition proche, mouture différente.",
    "caution",
  ),
  "yaourt-brebis": ciqual(
    "19554",
    "Yaourt nature au lait de brebis à environ 3 % de matière grasse.",
  ),
};

const ingredientIds = [
  ...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.id))),
].sort();

let reusedCount = 0;
const ingredients = ingredientIds.map((ingredientId) => {
  let entry;
  if (known.has(ingredientId)) {
    const match = known.get(ingredientId);
    entry = structuredClone(match.entry);
    entry.batch_reuse_source = match.lot;
    entry.batch_reuse_note = "Réutilisé uniquement à identifiant canonique strictement identique.";
    const units = new Set(
      draft.recipes.flatMap((recipe) =>
        recipe.ingredients
          .filter((ingredient) => ingredient.id === ingredientId)
          .map((ingredient) => ingredient.unite_normalisee),
      ),
    );
    entry.grams_per_unit = {
      ...(entry.grams_per_unit ?? {}),
      ...(units.has("g") ? { g: 1 } : {}),
      ...(units.has("ml") ? { ml: 1 } : {}),
    };
    reusedCount += 1;
  } else {
    if (!newMappings[ingredientId]) throw new Error(`${ingredientId}: correspondance absente`);
    entry = { ingredient_id: ingredientId, ...newMappings[ingredientId] };
  }

  if (ingredientId === "rooibos-feuilles") {
    entry.occurrence_overrides = {
      ...(entry.occurrence_overrides ?? {}),
      r476: {
        grams_total: 1,
        source_note: "Proxy aqueux pour une infusion filtrée; les feuilles ne sont pas consommées.",
      },
    };
  }
  if (ingredientId === "hibiscus-seche") {
    entry.occurrence_overrides = {
      ...(entry.occurrence_overrides ?? {}),
      r480: {
        grams_total: 1,
        source_note: "Proxy aqueux pour une infusion filtrée; les fleurs ne sont pas consommées.",
      },
    };
  }
  if (ingredientId === "orange") {
    entry.occurrence_overrides = {
      ...(entry.occurrence_overrides ?? {}),
      r482: {
        grams_total: 400,
        source_note: "La recette annonce environ 400 ml de jus d'orange; masse assimilée à 400 g.",
      },
    };
  }
  if (ingredientId === "pamplemousse-rose") {
    entry.occurrence_overrides = {
      ...(entry.occurrence_overrides ?? {}),
      r482: {
        grams_total: 150,
        source_note: "La recette annonce environ 150 ml de jus de pamplemousse; masse assimilée à 150 g.",
      },
    };
  }

  return entry;
});

const output = {
  meta: {
    schema_version: "1.0.0",
    lot: "r476-r500",
    status: "reviewed-with-cautions",
    ingredient_count: ingredients.length,
    reused_count: reusedCount,
    ciqual_source: "Anses, Table Ciqual 2025",
    ciqual_version: "2025-11-03",
    ciqual_doi: "https://doi.org/10.57745/RDMHWY",
    review_note: "Réutilisation limitée aux identifiants identiques; unités g/ml sécurisées; infusions filtrées et quatre nouvelles correspondances relues.",
  },
  ingredients,
};

await writeFile(
  new URL("research/ciqual-map-r476-r500.json", root),
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log(
  `${ingredients.length} correspondances : ${reusedCount} réutilisées, ${ingredients.length - reusedCount} nouvelles.`,
);
