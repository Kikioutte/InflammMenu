import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { options, prepareCampaign, startServer, inspectPage, URL, hash } from './campaign.mjs';

// Separate from Lighthouse: three paired samples, a fresh context each time,
// mobile viewport and CPU x4. Native timers/performance remain untouched.
const campaign = await prepareCampaign(options());
const { metadata, stages, fixture, output } = campaign;
metadata.measurement = 'catalogue-visible and generation-visible; mobile 390x844; CPU x4; no network throttling';
metadata.generationSeed = Date.parse(metadata.startedAt);
metadata.chromeExecutable = process.env.CHROME_PATH || 'Playwright default Chromium headless executable';
if (campaign.prepareOnly) { console.log(JSON.stringify({ prepared: true, ...metadata })); process.exit(0); }
const results = [];
const expectedPlans = new Map();
let browser;

async function measureClick(page, text, targetSelector) {
  return page.evaluate(({ text, targetSelector }) => new Promise((resolveDone, reject) => {
    const current = document.querySelector('[data-flow-current="true"]') ?? document;
    const button = Array.from(current.querySelectorAll('button')).find(item => item.textContent.trim() === text);
    if (!button) { reject(Error(`Missing action: ${text}`)); return; }
    const started = performance.now();
    const longTasks = [];
    const performanceObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
    });
    performanceObserver.observe({ type: 'longtask' });
    let done = false;
    const timeout = setTimeout(() => finish(Error(`Timed out: ${text}`)), 30000);
    const observer = new MutationObserver(() => {
      const target = document.querySelector(targetSelector);
      if (target && !done) {
        done = true;
        requestAnimationFrame(() => requestAnimationFrame(() => finish()));
      }
    });
    function finish(error) {
      clearTimeout(timeout);
      observer.disconnect();
      for (const entry of performanceObserver.takeRecords()) longTasks.push({ start: entry.startTime, duration: entry.duration });
      performanceObserver.disconnect();
      if (error) reject(error);
      else resolveDone({ durationMs: performance.now() - started, longestTaskMs: Math.max(0, ...longTasks.filter(item => item.start >= started).map(item => item.duration)), longTasks });
    }
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    button.click();
  }), { text, targetSelector });
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  metadata.browserVersion = browser.version();
  for (let run = 1; run <= metadata.runs; run++) {
    for (const name of run % 2 ? ['baseline', 'after'] : ['after', 'baseline']) {
      const stage = stages[name];
      const server = await startServer(stage.path);
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
      const errors = [];
      try {
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(String(error)));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.goto(`${URL}manifest.webmanifest`);
        await page.evaluate(state => localStorage.setItem('inflamm-menu:app-state', JSON.stringify(state)), fixture);
        const response = await page.goto(URL);
        assert.equal(hash(await response.text()), stage.htmlSha256);
        await page.getByTestId('home-view').waitFor();
        // Finish installation before measuring interactions so shell downloads
        // do not overlap the catalogue request differently across versions.
        await page.evaluate(async () => { await navigator.serviceWorker.ready; await document.fonts.ready; });
        await page.waitForFunction(() => Array.from(document.images).every(image => image.loading === 'lazy' || image.complete));
        await inspectPage(page, 'returning', fixture);
        console.log(`INTERACTION_START ${run}/${metadata.runs} ${name}`);
        const catalogue = await measureClick(page, 'Recette', '[data-flow-current="true"] .catalogue-card');
        const cards = await page.locator('[data-flow-current="true"] .catalogue-card').count();
        assert(cards > 0, 'Catalogue must render actual recipes');
        const catalogueResources = await page.evaluate(() => performance.getEntriesByType('resource')
          .filter(entry => entry.name.includes('recettes-anti-inflammatoires'))
          .map(entry => ({ name: entry.name, duration: entry.duration, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize })));
        assert(catalogueResources.length > 0, 'A real catalogue download must be measured');
        // The catalogue metric ends when cards/text are painted. Finish its
        // image work outside either action timer before measuring generation.
        await page.waitForLoadState('networkidle');
        await page.evaluate(async () => {
          await Promise.all(Array.from(document.images).filter(image => {
            const rect = image.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
          }).map(image => image.decode()));
        });
        await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Accueil', exact: true }).click();
        await page.getByRole('button', { name: 'Créer une autre semaine', exact: true }).click();
        await page.getByRole('button', { name: 'Créer ma semaine', exact: true }).waitFor();
        await page.evaluate(seed => { Date.now = () => seed; }, metadata.generationSeed);
        const generation = await measureClick(page, 'Créer ma semaine', '[data-flow-current="true"] .success-state h1');
        await page.getByRole('button', { name: 'Voir ma semaine', exact: true }).click();
        await page.getByTestId('week-view').waitFor();
        await page.waitForFunction(previousId => {
          const state = JSON.parse(localStorage.getItem('inflamm-menu:app-state') || 'null');
          return state?.currentPlan?.id && state.currentPlan.id !== previousId;
        }, fixture.currentPlan.id);
        const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('inflamm-menu:app-state')).currentPlan);
        const stablePlan = { ...plan, generatedAt: '<generation timestamp excluded from equality>' };
        const planHash = hash(JSON.stringify(stablePlan));
        if (expectedPlans.has(run)) assert.equal(planHash, expectedPlans.get(run), 'Both builds must generate the identical menu');
        else expectedPlans.set(run, planHash);
        assert.equal(errors.length, 0, JSON.stringify(errors));
        const row = { stage: name, run, profile: 'current default profile, 2 people', catalogue: { ...catalogue, cards, resources: catalogueResources }, generation: { ...generation, planHash }, errors };
        results.push(row);
        await writeFile(resolve(output, `plan-${name}-${run}.json`), JSON.stringify(plan, null, 2));
        await writeFile(resolve(output, 'interactions.json'), JSON.stringify({ metadata, results }, null, 2));
        console.log(`INTERACTION_RESULT ${JSON.stringify(row)}`);
      } finally {
        await writeFile(resolve(output, `interaction-${name}-${run}-requests.json`), JSON.stringify(server.requests, null, 2));
        await context.close();
        await server.close();
      }
    }
  }
  assert.equal(results.length, metadata.runs * 2);
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = Object.fromEntries(['baseline', 'after'].map(name => {
    const rows = results.filter(row => row.stage === name);
    return [name, { catalogueMs: median(rows.map(row => row.catalogue.durationMs)), generationMs: median(rows.map(row => row.generation.durationMs)), generationLongestTaskMs: median(rows.map(row => row.generation.longestTaskMs)) }];
  }));
  await writeFile(resolve(output, 'interactions-summary.json'), JSON.stringify({ metadata, summary, results }, null, 2));
  const lines = ['# Interactions mesurées', '', metadata.measurement, '', '| Version | Cartes/textes du catalogue rendus | Semaine prête | Plus longue tâche pendant génération |', '| --- | ---: | ---: | ---: |', ...Object.entries(summary).map(([name, row]) => `| ${name} | ${Math.round(row.catalogueMs)} ms | ${Math.round(row.generationMs)} ms | ${Math.round(row.generationLongestTaskMs)} ms |`), '', 'Médianes de trois passages alternés ; cache du catalogue froid ; installation du shell terminée avant les interactions. La génération inclut le délai applicatif de 50 ms et le rendu. Le chronométrage du catalogue inclut téléchargement, validation, filtres et premier rendu des cartes/textes, sans attendre le décodage des photos ; il ne prétend pas isoler le seul parse JSON. Les requêtes/photos du catalogue sont terminées hors chronomètre avant de mesurer la génération. Horloge performance native, Date.now fixé seulement pour rendre la graine de génération commune. Ces mesures ne sont ni Lighthouse ni un INP terrain.', ''];
  await writeFile(resolve(output, 'interactions-summary.md'), lines.join('\n'));
  console.log(`INTERACTION_SUMMARY ${JSON.stringify(summary)}`);
} catch (error) {
  await writeFile(resolve(output, 'failure.txt'), String(error.stack || error));
  throw error;
} finally { if (browser) await browser.close(); }
