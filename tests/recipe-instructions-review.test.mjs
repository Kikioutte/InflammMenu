import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RECIPES } from '../src/recipes.ts';
import { audit, beforeInstructionsReview } from './helpers/recipe-instructions-review.mjs';
const catalogue = JSON.parse(readFileSync(new URL('../src/data/recettes-anti-inflammatoires.json', import.meta.url), 'utf8'));
const v1 = RECIPES.filter((recipe) => !recipe.id.startsWith('catalog-'));
// The October 1 audit remains a historical journal for r001-r1257 and V1.
// Additions receive their own dated journal rather than rewriting this evidence.
const all = [...catalogue.recipes.filter((recipe) => Number(recipe.id.slice(1)) <= 1257), ...v1];
const byId = new Map(all.map((recipe) => [recipe.id, recipe]));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('every catalogue and V1 recipe has an individual evidenced review with verified before/after hashes', () => {
  assert.equal(audit.recipes.length, 1293);
  assert.equal(new Set(audit.recipes.map((r) => r.id)).size, 1293);
  assert.deepEqual([...byId.keys()].sort(), audit.recipes.map((r) => r.id).sort());
  for (const review of audit.recipes) {
    const current = byId.get(review.id);
    const before = beforeInstructionsReview(current);
    assert.ok(review.evidence.length > 25, review.id);
    assert.equal(hash(current), review.afterSha256, `${review.id}: reviewed output`);
    assert.equal(hash(before), review.beforeSha256, `${review.id}: original input`);
    for (const field of ['id', 'ingredients', 'image']) assert.deepEqual(current[field], before[field], `${review.id}.${field} preserved`);
    const nutrition = review.kind === 'v1' ? 'nutrition' : 'nutrition_par_portion';
    assert.deepEqual(current[nutrition], before[nutrition], `${review.id}: nutrition preserved`);
  }
});

test('the dated October 5 journal covers exactly the 64 additions and binds their source inventories to their final recipes', () => {
  const inventory = JSON.parse(readFileSync(new URL('../research/recipes-r1258-r1321-inventory.json', import.meta.url),'utf8'));
  const addedReview = JSON.parse(readFileSync(new URL('../research/recipe-instructions-review-2026-10-05.json', import.meta.url),'utf8'));
  const added = catalogue.recipes.slice(1257,1321);
  assert.equal(inventory.fiches.length,64);
  assert.equal(addedReview.recipes.length,64);
  assert.equal(added.length,64);
  assert.deepEqual(addedReview.recipes.map((review) => review.id),added.map((recipe) => recipe.id));
  assert.equal(new Set(addedReview.recipes.map((review) => review.id)).size,64);
  const union = [...audit.recipes,...addedReview.recipes].map((review) => review.id);
  assert.equal(new Set(union).size,1357);
  assert.deepEqual(union.sort(),[...catalogue.recipes,...v1].map((recipe) => recipe.id).sort());
  for (const [index,review] of addedReview.recipes.entries()) {
    assert.equal(review.sourceInventorySha256,hash(inventory.fiches[index]),`${review.id}: reviewed source inventory`);
    assert.equal(review.afterSha256,hash(added[index]),`${review.id}: final reviewed card`);
    assert.equal(review.culinaryTested,false,`${review.id}: no physical kitchen test is claimed`);
    assert.ok(typeof review.evidence === 'string' && review.evidence.length > 25,`${review.id}: individual review evidence`);
  }
});

test('known contradictory generated phrases are removed from cooking steps', () => {
  for (const recipe of all) {
    const steps = (recipe.etapes ?? recipe.steps).join(' ');
    assert.doesNotMatch(steps, /au cœur de (?:le |les )/, recipe.id);
    assert.doesNotMatch(steps, /Tailler les petits pois en petits morceaux réguliers de 1 cm/, recipe.id);
    assert.doesNotMatch(steps, /(?:amandes|noisettes|noix) concassés\b/, recipe.id);
  }
});

test('identified safety corrections remain explicit and the wrap requires cooking equipment', () => {
  for (const id of ['r240','r782','r793','r852','r976','r1002','r1008','r1018','r1025','r1033']) {
    const recipe = byId.get(id);
    assert.match(recipe.etapes.join(' '), /cuire à la vapeur/i, id);
    assert.ok(recipe.temps.cuisson > 0, id);
    assert.ok(recipe.app.planner.equipment.includes('steamer'), id);
  }
  for (const id of ['r675','r681','r688','r698','r702','r706','r709']) assert.match(byId.get(id).etapes.join(' '), /30 min(?:utes)? à franche ébullition/, id);
  assert.match(byId.get('r103').etapes.join(' '), /ébullition/);
  const wrap = byId.get('wrap-dinde-crudites-houmous');
  assert.match(wrap.steps.join(' '), /74 °C/);
  assert.ok(wrap.equipment.includes('hob'));
  for (const recipe of catalogue.recipes) assert.doesNotMatch(recipe.app.review.caution ?? '', /coquillages fermés avant cuisson à écarter/, recipe.id);
});

test('follow-up review preserves original hashes, unique change paths and exact change counts', () => {
  const changed = audit.recipes.filter((review) => review.changes.length);
  const summary = audit.followupSummary;
  assert.equal(summary.recipesReviewed, all.length);
  assert.equal(summary.recipesWithChanges, changed.length);
  assert.equal(summary.recipesWithStepChanges, changed.filter((review) => review.changes.some((change) => ['steps', 'etapes'].includes(change.path))).length);
  assert.equal(summary.recipesWithOtherChanges, changed.filter((review) => review.changes.some((change) => !['steps', 'etapes'].includes(change.path))).length);
  assert.equal(summary.recipesUnchanged, all.length - changed.length);
  assert.equal(summary.recipesWithInitialReservations, audit.recipes.filter((review) => review.flags.length).length);
  assert.equal(summary.culinaryTested, false);
  assert.equal(summary.followupRecipesCount, 14);
  assert.deepEqual(summary.newlyExcludedFromPlanner, ['r036', 'r041', 'r248', 'r264']);
  for (const review of audit.recipes) {
    assert.equal(new Set(review.changes.map((change) => change.path)).size, review.changes.length, `${review.id}: one final delta per path`);
    assert.equal(review.sourceHash, review.beforeSha256, `${review.id}: original evidence retained`);
  }
  for (const id of summary.followupRecipes) {
    const review = audit.recipes.find((item) => item.id === id);
    assert.equal(review.followupReview.culinaryTested, false, id);
    assert.ok(review.followupReview.resolution.length > 30, id);
    assert.ok(review.followupReview.remainingLimitations.length, id);
    for (const source of review.followupReview.sources) {
      assert.match(source.url, /^https:\/\//, id);
      assert.equal(source.accessed_at, '2026-10-02', id);
      assert.ok(source.supports.length > 30, id);
    }
  }
  const excludedByFollowup = catalogue.recipes.filter((recipe) => {
    const original = beforeInstructionsReview(recipe);
    return original.app.planner.eligible && !recipe.app.planner.eligible;
  }).map((recipe) => recipe.id);
  assert.deepEqual(excludedByFollowup, summary.newlyExcludedFromPlanner);
});

test('unvalidated fermentation and shiitake protocols are visibly suspended without replacement safety timers', () => {
  for (const id of ['r023', 'r036', 'r041']) {
    const recipe = byId.get(id);
    assert.equal(recipe.app.planner.eligible, false, id);
    assert.equal(recipe.app.review.status, 'caution', id);
    assert.match(recipe.etapes[0], /suspendu|suspendue/i, id);
    assert.match(recipe.etapes[0], /ne pas préparer/i, id);
    assert.match(recipe.app.review.caution, /non testée|aucun essai physique/i, id);
  }
  const cabbage = byId.get('r023');
  assert.equal(cabbage.temps.repos, 0);
  assert.match(cabbage.etapes.join(' '), /https:\/\/nchfp\.uga\.edu\/how\/ferment\/recipes\/sauerkraut\//);
  assert.match(cabbage.etapes.join(' '), /dans son intégralité/);
  assert.doesNotMatch(cabbage.etapes.join(' '), /laisser à température ambiante|goûter au bout|seul ratio|condition absolue/i);
  assert.doesNotMatch(cabbage.conservation, /6 mois|six mois|7 jours|sept jours/i);
  assert.doesNotMatch(cabbage.seo.meta_description, /méthode détaillée et sûre/i);
  for (const id of ['r036', 'r041']) {
    assert.doesNotMatch(byId.get(id).etapes.join(' '), /(?:frémir|saisir|cuire).*\b\d+\s*minutes/i, id);
    assert.match(byId.get(id).app.review.caution, /durées affichées.*estimations.*pas un barème/i, id);
  }
});

test('homemade conservation promises and fixed juice yield are removed conservatively', () => {
  for (const id of ['r026', 'r031', 'r032']) {
    const recipe = byId.get(id);
    assert.match(recipe.conservation, /4 °C maximum/, id);
    assert.match(recipe.conservation, /48 heures/, id);
    assert.doesNotMatch(recipe.conservation, /(?:3 jours à température ambiante|1 semaine|3 semaines|\d+ mois)/, id);
    assert.equal(recipe.app.review.status, 'caution', id);
  }
  assert.doesNotMatch(byId.get('r026').conseils.join(' '), /conserver à l'air libre/i);
  assert.match(byId.get('r031').conseils[0], /ne constituent pas un procédé de conservation validé/);
  assert.doesNotMatch(byId.get('r032').conseils[0], /une à deux fois par jour|0,5 à 1/);
  const juice = byId.get('r042');
  assert.match(juice.conservation, /consommation immédiate/);
  assert.doesNotMatch(juice.conservation, /7 jours|3 mois/);
  assert.match(juice.etapes[0], /Laver et brosser/);
  assert.match(juice.etapes.at(-1), /dix portions égales/);
  assert.match(juice.etapes.at(-1), /n’est pas garanti à 30 ml/);
  assert.match(juice.app.review.caution, /Jus non pasteurisé.*privilégier un jus pasteurisé/);
  assert.match(juice.app.review.caution, /congélation n’éliminent pas/);
});

test('sprout recipes require an identified complete cooking protocol and remain suspended', () => {
  for (const id of ['r229', 'r248', 'r264']) {
    const recipe = byId.get(id);
    assert.equal(recipe.app.planner.eligible, false, id);
    assert.equal(recipe.app.review.status, 'caution', id);
    assert.match(recipe.etapes[0], /Recette suspendue.*produit identifié/, id);
    assert.match(recipe.etapes[0], /ne sont pas des seuils de sécurité/, id);
    assert.match(recipe.etapes[1], /fabricant fournit un protocole de cuisson complète/, id);
    assert.match(recipe.etapes[1], /absence de consignes.*ne pas préparer/i, id);
    assert.doesNotMatch(recipe.etapes[1], /\b(?:3|20|25)\s*minutes/, id);
  }
});

test('missing oven parameters remain explicitly incomplete and CREAMi uses ready-to-eat buckwheat only', () => {
  for (const id of ['r481', 'r487', 'r496']) {
    const recipe = byId.get(id);
    assert.equal(recipe.app.planner.eligible, false, id);
    assert.match(recipe.etapes[0], /Recette incomplète.*température du four/, id);
    assert.match(recipe.app.review.caution, /température de four et découpe à définir et tester/, id);
    assert.doesNotMatch(recipe.etapes.join(' '), /\d+\s*°C/, id);
  }
  const creami = byId.get('r606');
  assert.match(creami.etapes[0], /explicitement déclaré prêt à consommer par le fabricant/);
  assert.match(creami.etapes[0], /si le produit exige une cuisson.*ne pas préparer/);
  assert.deepEqual(creami.temps, { preparation: 15, cuisson: 0, repos: 1440, total: 1455 });
  assert.equal(creami.app.planner.active_minutes, 15);
  assert.equal(creami.app.planner.eligible, false);
  assert.equal(creami.portions, 6);
  assert.deepEqual(creami.app.planner.equipment, []);
  for (const invariant of ['MAX FILL', '24 heures', 'NC501EU', 'FULL', 'LITE ICE CREAM']) {
    assert.ok(creami.etapes.join(' ').includes(invariant), invariant);
  }
});
