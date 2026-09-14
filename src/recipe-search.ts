export function normalizeSearch(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae").toLowerCase();
}

// One insertion, deletion, substitution or adjacent transposition. Short words
// remain exact, and this matcher is never used for food identity or exclusions.
function nearWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
    || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export function matchesRecipeSearch(text: string, query: string): boolean {
  const haystack = normalizeSearch(text);
  const tokens = normalizeSearch(query).match(/[a-z0-9]+/g) ?? [];
  const words = haystack.match(/[a-z0-9]+/g) ?? [];
  return tokens.every((token) => haystack.includes(token) || words.some((word) => nearWord(token, word)));
}
