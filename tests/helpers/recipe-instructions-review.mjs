import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const audit = JSON.parse(readFileSync(new URL('../../research/recipe-instructions-review-2026-10-01.json', import.meta.url), 'utf8'));
const byId = new Map(audit.recipes.map((recipe) => [recipe.id, recipe]));

/** Reconstruct the untouched source for historical invariants, verifying each reviewed delta. */
export function beforeInstructionsReview(recipe) {
  const review = byId.get(recipe.id);
  if (!review) return structuredClone(recipe);
  const result = structuredClone(recipe);
  for (const change of review.changes) {
    const keys = change.path.split('.');
    let target = result;
    for (const key of keys.slice(0, -1)) target = target[key];
    const key = keys.at(-1);
    assert.deepEqual(target[key], change.after, `${recipe.id}.${change.path}: unexpected change after the editorial review`);
    if (Object.hasOwn(change, "before")) target[key] = structuredClone(change.before);
    else delete target[key];
  }
  return result;
}
export { audit };
