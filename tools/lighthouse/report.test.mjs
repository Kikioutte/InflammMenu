import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIES, METRICS, readMeasurement, summarize } from './report.mjs';

function report() {
  return {
    categories: Object.fromEntries(CATEGORIES.map(key => [key, { score: 0.95 }])),
    audits: Object.fromEntries(METRICS.map(key => [key, { numericValue: 100 }])),
    configSettings: { formFactor: 'mobile', throttlingMethod: 'simulate' },
    environment: { benchmarkIndex: 1000 }, runWarnings: [],
  };
}
const campaign = () => ['new', 'returning'].flatMap(scenario => ['baseline', 'after'].flatMap(stage => [1, 2, 3].map(run => ({ scenario, stage, run, ...readMeasurement(report()) }))));

test('un audit absent, invalide ou non mobile ne devient jamais un score valide', () => {
  for (const change of [r => { r.categories.performance.score = null; }, r => { r.audits['total-blocking-time'].numericValue = NaN; }, r => { r.runtimeError = { code: 'NO_FCP' }; }, r => { r.configSettings.formFactor = 'desktop'; }]) {
    const value = report(); change(value); assert.throws(() => readMeasurement(value));
  }
});

test('les erreurs réseau et console invalident une mesure', () => {
  const network = report(); network.audits['network-requests'] = { details: { items: [{ url: 'http://127.0.0.1/assets/app.js', statusCode: 404 }] } };
  assert.throws(() => readMeasurement(network), /Network errors/);
  const consoleError = report(); consoleError.audits['errors-in-console'] = { details: { items: [{ description: 'Application failed' }] } };
  assert.throws(() => readMeasurement(consoleError), /Console errors/);
});

test('un rapport produit après avertissement de chargement ne devient pas une mesure valide', () => {
  const value = report(); value.runWarnings = ['The page loaded too slowly to finish within the time limit. Results may be incomplete.'];
  assert.throws(() => readMeasurement(value), /Lighthouse warning/);
});

test('une campagne partielle ou des passages dupliqués ne produisent pas de médiane', () => {
  assert.throws(() => summarize(campaign().slice(1), 3));
  const duplicate = campaign(); duplicate[1].run = 1;
  assert.throws(() => summarize(duplicate, 3), /unique/);
});

test('un seul bon passage ne suffit pas à atteindre 95 et la plage reste visible', () => {
  const rows = campaign();
  rows.filter(row => row.scenario === 'returning' && row.stage === 'after').forEach((row, index) => { row.scores.performance = [79, 99, 80][index]; });
  const returning = summarize(rows, 3).find(row => row.scenario === 'returning' && row.stage === 'after');
  assert.equal(returning.scores.performance, 80);
  assert.deepEqual(returning.performanceRange, [79, 99]);
  assert.equal(returning.medianTargetReached, false);
  assert.equal(returning.everyRunReachedTarget, false);
});

test('le seuil exige les quatre catégories et distingue médiane et stabilité', () => {
  const rows = campaign(); rows[0].scores.performance = 94;
  const summary = summarize(rows, 3);
  assert.equal(summary[0].medianTargetReached, true);
  assert.equal(summary[0].everyRunReachedTarget, false);
  for (const row of rows) row.scores.accessibility = 94;
  assert.ok(summarize(rows, 3).every(row => !row.medianTargetReached));
});
