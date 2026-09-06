import assert from 'node:assert/strict';

export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
export const METRICS = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'];
export const SCENARIOS = ['new', 'returning'];
export const STAGES = ['baseline', 'after'];

export function readMeasurement(lhr) {
  assert.ok(!lhr.runtimeError, JSON.stringify(lhr.runtimeError));
  assert.equal(lhr.configSettings.formFactor, 'mobile');
  assert.equal(lhr.configSettings.throttlingMethod, 'simulate');
  const scores = Object.fromEntries(CATEGORIES.map(key => {
    const value = lhr.categories[key]?.score;
    assert.ok(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1, `Invalid score: ${key}`);
    return [key, Math.round(value * 100)];
  }));
  const metrics = Object.fromEntries(METRICS.map(key => {
    const value = lhr.audits[key]?.numericValue;
    assert.ok(typeof value === 'number' && Number.isFinite(value) && value >= 0, `Invalid metric: ${key}`);
    return [key, value];
  }));
  const networkErrors = (lhr.audits['network-requests']?.details?.items || [])
    .filter(item => /^https?:/.test(item.url) && (item.statusCode >= 400 || item.statusCode === 0))
    .map(item => ({ url: item.url, status: item.statusCode }));
  const consoleErrors = lhr.audits['errors-in-console']?.details?.items || [];
  assert.equal(networkErrors.length, 0, `Network errors: ${JSON.stringify(networkErrors)}`);
  assert.equal(consoleErrors.length, 0, `Console errors: ${JSON.stringify(consoleErrors)}`);
  return { scores, metrics, warnings: lhr.runWarnings || [], cpuBenchmark: lhr.environment.benchmarkIndex };
}

export function summarize(results, runs) {
  assert.ok(Number.isInteger(runs) && runs >= 3 && runs <= 7 && runs % 2 === 1);
  assert.equal(results.length, SCENARIOS.length * STAGES.length * runs, 'The campaign must be complete');
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return SCENARIOS.flatMap(scenario => STAGES.map(stage => {
    const samples = results.filter(row => row.scenario === scenario && row.stage === stage);
    assert.equal(samples.length, runs, `Incomplete group: ${scenario}/${stage}`);
    assert.deepEqual(samples.map(row => row.run).sort((a, b) => a - b), Array.from({ length: runs }, (_, index) => index + 1), 'Each sample must be unique');
    const scores = Object.fromEntries(CATEGORIES.map(key => [key, median(samples.map(row => row.scores[key]))]));
    return {
      scenario, stage, scores,
      metrics: Object.fromEntries(METRICS.map(key => [key, median(samples.map(row => row.metrics[key]))])),
      performanceRange: [Math.min(...samples.map(row => row.scores.performance)), Math.max(...samples.map(row => row.scores.performance))],
      medianTargetReached: CATEGORIES.every(key => scores[key] >= 95),
      everyRunReachedTarget: samples.every(row => CATEGORIES.every(key => row.scores[key] >= 95)),
    };
  }));
}

export function markdownReport(metadata, medians) {
  const lines = [
    '# Comparaison Lighthouse mobile', '',
    `Avant : \`${metadata.stages.baseline.sha}\`. Après : \`${metadata.stages.after.sha}\`.`, '',
    `${metadata.runs} passages à froid par version et parcours. Lighthouse ${metadata.lighthouse}, Chromium ${metadata.browserVersion}. Profil mobile simulé par défaut, même runner, exécution séquentielle.`, '',
    '| Parcours | Version | Performance (min–max) | FCP | LCP | TBT | CLS | A11y / BP / SEO |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of medians) {
    const ms = key => Math.round(row.metrics[key]);
    lines.push(`| ${row.scenario === 'new' ? 'Premier lancement' : 'Retour avec semaine'} | ${row.stage === 'baseline' ? 'Avant' : 'Après'} | ${row.scores.performance} (${row.performanceRange.join('–')}) | ${ms('first-contentful-paint')} ms | ${ms('largest-contentful-paint')} ms | ${ms('total-blocking-time')} ms | ${row.metrics['cumulative-layout-shift'].toFixed(4)} | ${row.scores.accessibility} / ${row.scores['best-practices']} / ${row.scores.seo} |`);
  }
  const after = medians.filter(row => row.stage === 'after');
  lines.push('', `Objectif ≥95 dans les quatre catégories et les deux parcours : **${after.every(row => row.medianTargetReached) ? 'atteint sur les médianes' : 'non atteint sur les médianes'}**.`, '',
    `Tous les passages après correction ≥95 : **${after.every(row => row.everyRunReachedTarget) ? 'oui' : 'non'}**.`, '',
    'Mesures de laboratoire sur les builds Pages servis localement ; aucun test de l’hébergement publié, aucun INP terrain et aucune certification WCAG. Les scores de campagnes exécutées sur des machines différentes ne sont pas directement comparables.', '',
    'Le job échoue si un audit est incomplet, si le parcours attendu ne s’affiche pas ou si une erreur console/réseau est détectée. Le seuil 95 est un objectif publié dans ce rapport, pas un remplacement des tests fonctionnels.', '');
  return lines.join('\n');
}
