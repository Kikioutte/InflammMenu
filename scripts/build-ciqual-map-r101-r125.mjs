import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [draft, prior] = await Promise.all([
  readFile(new URL("research/pilot-r101-r125.draft.json", root), "utf8").then(JSON.parse),
  readFile(new URL("research/ciqual-map-r051-r075.json", root), "utf8").then(JSON.parse),
]);

const priorById = new Map(prior.ingredients.map((entry) => [entry.ingredient_id, entry]));
const occurrenceOverrides = {
  eau: { r113: { grams_total: 1, source_note: "L'infusion de thé est comptée séparément avec le profil Ciqual du thé noir infusé." } },
  peche: { r103: { grams_total: 20, source_note: "Équivalent ingéré prudent pour une pêche infusée puis jetée; extraction réelle non mesurée." } },
  citron: {
    r103:{grams_total:3.5,source_note:"10 % de la fraction comestible estimée pour l'infusion filtrée."},r109:{grams_total:3.5,source_note:"10 % de la fraction comestible estimée pour l'infusion filtrée."},r111:{grams_total:3.5,source_note:"10 % de la fraction comestible estimée pour la macération filtrée."},r113:{grams_total:3.5,source_note:"10 % de la fraction comestible estimée pour l'infusion filtrée."},r116:{grams_total:3.5,source_note:"10 % de la fraction comestible estimée pour l'infusion filtrée."},
  },
  orange: { r104:{grams_total:6.5,source_note:"10 % de la fraction comestible estimée pour le zeste filtré."},r105:{grams_total:6.5,source_note:"10 % de la fraction comestible estimée pour l'infusion filtrée."},r109:{grams_total:6.5,source_note:"10 % de la fraction comestible estimée pour l'infusion filtrée."},r123:{grams_total:6.5,source_note:"10 % de la fraction comestible estimée pour le zeste filtré."} },
  pomme: { r104:{grams_total:15,source_note:"Équivalent ingéré prudent après cuisson puis filtration; extraction non mesurée."} },
  concombre: { r111:{grams_total:15,source_note:"Équivalent ingéré prudent après macération puis filtration."} },
  framboises: { r111:{grams_total:10,source_note:"Équivalent ingéré prudent après macération puis rejet des fruits."} },
  poire: { r113:{grams_total:17,source_note:"Équivalent ingéré prudent après infusion puis filtration."} },
  mures: { r116:{grams_total:10,source_note:"Équivalent ingéré prudent après infusion puis filtration."} },
  mandarine: { r119:{grams_total:7.5,source_note:"Équivalent ingéré prudent après infusion puis filtration."} },
  prune: { r123:{grams_total:15,source_note:"Équivalent ingéré prudent après cuisson puis filtration."} },
  "gingembre-frais": { r123:{grams_total:.6,source_note:"10 % de la quantité utilisée, pour une infusion filtrée."} },
};

const ciqual = (code, grams, rationale, status = "validated", extras = {}) => ({
  selected_ciqual_code: code,
  grams_per_normalized_unit: grams,
  review_status: status,
  rationale,
  source_note: "Anses, Table Ciqual 2025, version 2025-11-03; correspondance et conversion contrôlées manuellement pour ce lot.",
  ...extras,
});

const manual = {
  badiane: ciqual("18066", 1, "Aucune entrée Ciqual exacte pour la badiane entière; eau utilisée comme proxy énergétique quasi nul pour l'étoile retirée après infusion.", "caution", { occurrence_overrides:{r113:{grams_total:1,source_note:"Proxy aqueux pour une étoile retirée; aucun nutriment propre à la badiane revendiqué."}} }),
  "betterave-cuite": ciqual("20003", 1, "Betterave rouge cuite, pesée en grammes."),
  "cacao-poudre-non-sucre": ciqual("18100", 6, "Cacao en poudre sans sucres ajoutés; 6 g par cuillère à soupe rase.", "validated", { grams_per_unit:{c_soupe:6} }),
  "cannelle-baton": ciqual("11025", 3, "Cannelle en poudre utilisée comme approximation de composition du bâton; 3 g par bâton avant correction des infusions.", "caution", { occurrence_overrides:{r104:{grams_total:.3,source_note:"Équivalent de 10 % du bâton après filtration."},r105:{grams_total:.15,source_note:"Équivalent de 10 % du demi-bâton après filtration."},r116:{grams_total:.15,source_note:"Équivalent de 10 % du demi-bâton après filtration."},r119:{grams_total:.15,source_note:"Équivalent de 10 % du demi-bâton après filtration."}} }),
  "celeri-branche": ciqual("20023", 40, "Céleri branche cru; 40 g de partie comestible par branche moyenne."),
  "chicoree-soluble-nature": ciqual("18152", 3, "Chicorée en poudre soluble; 3 g par cuillère à café rase."),
  "chou-fleur": ciqual("20016", 1, "Chou-fleur cru pesé avant cuisson."),
  "concombre": ciqual("20019", 300, "Concombre cru avec peau; 300 g de partie comestible par pièce moyenne."),
  "courge-butternut": ciqual("20138", 1, "Chair de courge butternut crue sans peau, pesée avant cuisson."),
  "datte-sechee-denoyautee": ciqual("13011", 8, "Datte sèche dénoyautée; 8 g de chair par petite datte."),
  "fraises": ciqual("13014", 1, "Fraises crues, pesées sans pédoncule."),
  "framboises": ciqual("13015", 1, "Framboises crues, pesées en grammes."),
  "gousse-vanille": ciqual("11098", 3, "Extrait aqueux de vanille utilisé comme proxy de la gousse infusée et retirée; conversion limitée à la fraction estimée.", "caution", { occurrence_overrides:{r119:{grams_total:.075,source_note:"Proxy de 10 % d'un quart de gousse après filtration."}} }),
  "graines-fenouil": ciqual("11066", 2, "Graines de fenouil; 2 g par cuillère à café.", "caution", { occurrence_overrides:{r109:{grams_total:.4,source_note:"10 % des graines estimés dans l'infusion filtrée."}} }),
  "hibiscus-seche": ciqual("18066", 1, "Aucune entrée Ciqual exacte pour l'hibiscus séché; eau utilisée comme proxy énergétique quasi nul pour l'infusion filtrée.", "caution", { occurrence_overrides:{r104:{grams_total:1,source_note:"Proxy aqueux; aucune composition propre à l'hibiscus revendiquée."}} }),
  "huile-olive-vierge-extra": ciqual("17270", 13.5, "Huile d'olive vierge extra; 13,5 g par cuillère à soupe.", "validated", { grams_per_unit:{c_soupe:13.5,c_cafe:4.5} }),
  "kefir-lait-nature": ciqual("19865", 1, "Kéfir de lait nature; densité arrondie à 1 g/ml, produit réel à vérifier."),
  "lentilles-corail-seches": ciqual("20535", 1, "Lentilles corail sèches, pesées avant trempage ou cuisson."),
  "levure-chimique-sans-gluten": ciqual("11046", 4, "Levure chimique; 4 g par cuillère à café, certification sans gluten à vérifier sur l'étiquette."),
  "mandarine": ciqual("13024", 75, "Clémentine ou mandarine crue; 75 g de chair par pièce moyenne."),
  "mangue-fraiche": ciqual("13025", 1, "Chair de mangue crue, pesée sans peau ni noyau."),
  "mures": ciqual("13029", 1, "Mûre de ronce crue, pesée en grammes."),
  "noisettes": ciqual("15004", 1, "Noisettes non salées, pesées en grammes."),
  "oignon-jaune": ciqual("20034", 110, "Oignon cru; 110 g de partie comestible par pièce moyenne."),
  "orge-monde-sec": ciqual("9320", 1, "Orge complète crue utilisée pour l'orge mondé sec; 10 % de la masse retenus pour la boisson filtrée.", "caution", { occurrence_overrides:{r105:{grams_total:6,source_note:"Équivalent nutritionnel prudent après cuisson puis filtration; extraction réelle non mesurée."}} }),
  peche: ciqual("13043", 150, "Pêche crue avec peau et sans noyau; 150 g de chair par pièce moyenne."),
  "poivre-noir-moulu": ciqual("11015", 2.3, "Poivre noir moulu; 2,3 g par cuillère à café."),
  "poudre-amande": ciqual("15041", 1, "Amande émondée non salée utilisée pour la poudre d'amande, pesée en grammes."),
  rhubarbe: ciqual("13047", 1, "Tige de rhubarbe crue, pesée en grammes avant cuisson."),
  "rooibos-feuilles": ciqual("18066", 1, "Aucune entrée Ciqual exacte pour le rooibos; eau utilisée comme proxy énergétique quasi nul pour les feuilles filtrées.", "caution", { occurrence_overrides:{r103:{grams_total:1,source_note:"Proxy aqueux pour feuilles filtrées."},r123:{grams_total:1,source_note:"Proxy aqueux pour feuilles filtrées."}} }),
  "sarrasin-decortique": ciqual("9380", 1, "Sarrasin complet cru, même grain sec; rendement de la boisson filtrée traité par occurrence.", "caution", { nutrient_overrides:{sugars_g:{value:0,note:"Sucres totaux non renseignés dans Ciqual 2025; valeur technique à 0 susceptible de sous-estimer légèrement les sucres."}}, occurrence_overrides:{r115:{grams_total:40,source_note:"Environ 40 % de la masse sèche retenus comme équivalent après mixage et filtration; rendement non mesuré."},r119:{grams_total:6,source_note:"10 % de la masse sèche retenus pour l'infusion filtrée; extraction non mesurée."}} }),
  "sauge-fraiche": ciqual("11069", .5, "Sauge fraîche; 0,5 g par feuille moyenne.", "caution", { occurrence_overrides:{r105:{grams_total:.15,source_note:"10 % de trois feuilles estimés après filtration."},r116:{grams_total:.3,source_note:"10 % de six feuilles estimés après filtration."}} }),
  "sel-fin": ciqual("11083", 6, "Sel marin utilisé comme équivalent du sel fin; 6 g par cuillère à café.", "validated", { grams_per_unit:{c_cafe:6} }),
  "the-noir-feuilles": ciqual("18154", 125, "Profil Ciqual du thé noir infusé appliqué à la boisson obtenue, et non aux feuilles sèches.", "caution", { occurrence_overrides:{r113:{grams_total:1000,source_note:"Un litre de thé noir infusé correspondant au volume final avant ajout des fruits."}} }),
  "truite-cuite": ciqual("27006", 1, "Truite rôtie ou cuite au four utilisée comme correspondance générique d'un filet de truite cuit."),
};

const ids = [...new Set(draft.recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id)))].sort();
let reusedCount = 0;
const ingredients = ids.map((id) => {
  let entry;
  if (priorById.has(id)) {
    entry = structuredClone(priorById.get(id));
    const unitsUsed = new Set(draft.recipes.flatMap((recipe) => recipe.ingredients
      .filter((ingredient) => ingredient.id === id)
      .map((ingredient) => ingredient.unite_normalisee)));
    if (unitsUsed.has("g") || unitsUsed.has("ml")) {
      entry.grams_per_unit = {
        ...(entry.grams_per_unit ?? {}),
        ...(unitsUsed.has("g") ? { g: 1 } : {}),
        ...(unitsUsed.has("ml") ? { ml: 1 } : {}),
      };
      entry.batch_conversion_note = "Nouvelle unité du lot contrôlée : 1 g/g ou 1 g/ml selon l'unité normalisée; la correspondance alimentaire reste strictement identique.";
    }
    reusedCount += 1;
  } else {
    entry = manual[id];
    if (!entry) throw new Error(`${id}: correspondance manuelle absente`);
    entry = { ingredient_id: id, ...entry };
  }
  if (occurrenceOverrides[id]) {
    entry.occurrence_overrides = { ...(entry.occurrence_overrides ?? {}), ...occurrenceOverrides[id] };
  }
  return entry;
});

const output = {
  meta: {
    schema_version: "1.0.0",
    lot: "r101-r125",
    status: "reviewed-with-cautions",
    ingredient_count: ingredients.length,
    reused_count: reusedCount,
    ciqual_source: "Anses, Table de composition nutritionnelle des aliments Ciqual 2025",
    ciqual_version: "2025-11-03",
    ciqual_doi: "https://doi.org/10.57745/RDMHWY",
    review_note: "Les correspondances réutilisées le sont uniquement à identifiant canonique strictement identique. Les nouvelles correspondances et conversions ont été relues manuellement; les infusions filtrées conservent des proxies et facteurs prudents explicitement signalés.",
  },
  ingredients,
};

await writeFile(new URL("research/ciqual-map-r101-r125.json", root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${ingredients.length} correspondances écrites : ${reusedCount} réutilisées à identifiant identique, ${ingredients.length - reusedCount} relues pour ce lot.`);
