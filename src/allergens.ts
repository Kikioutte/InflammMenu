const ALLERGEN_ALIASES: Readonly<Record<string, string>> = {
  cacahuete: "arachides",
  cacahuetes: "arachides",
  crustace: "crustaces",
  crustaces: "crustaces",
  lactose: "lait",
  laitages: "lait",
  noix: "fruits-a-coque",
  "fruit-a-coque": "fruits-a-coque",
  noisette: "fruits-a-coque",
  noisettes: "fruits-a-coque",
  amande: "fruits-a-coque",
  amandes: "fruits-a-coque",
  oeufs: "oeuf",
  soya: "soja",
};

export function canonicalAllergen(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .trim()
    .toLowerCase()
    .replace(/[ _]+/g, "-");
  return ALLERGEN_ALIASES[normalized] ?? normalized;
}

export function canonicalAllergens(values: readonly string[]): string[] {
  return [...new Set(values.map(canonicalAllergen).filter(Boolean))];
}
