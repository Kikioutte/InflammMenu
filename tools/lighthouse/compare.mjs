import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import puppeteer from 'puppeteer-core';
import { markdownReport, readMeasurement, summarize } from './report.mjs';

const [beforePath, afterPath, resultPath, mode] = process.argv.slice(2);
assert.ok(beforePath && afterPath && resultPath, 'Usage: node compare.mjs BEFORE AFTER OUTPUT [--prepare-only]');
assert.ok(mode === undefined || mode === '--prepare-only');
const prepareOnly = mode === '--prepare-only';
const output = resolve(resultPath);
const stages = { baseline: { path: resolve(beforePath) }, after: { path: resolve(afterPath) } };
assert.notEqual(stages.baseline.path, stages.after.path);
const runs = 3;
const base = '/InflammMenu/';
const url = `http://127.0.0.1:4193${base}`;
const hash = value => createHash('sha256').update(value).digest('hex');
await mkdir(output, { recursive: true });

// Both builds finish before this process starts. No generation, install, build or
// test runs on this runner during the serial Lighthouse campaign.
for (const stage of Object.values(stages)) {
  stage.sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: stage.path, encoding: 'utf8' }).trim();
  assert.match(stage.sha, /^[a-f0-9]{40}$/);
  if (!prepareOnly) {
    assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: stage.path, encoding: 'utf8' }).trim(), '', 'Measurement requires an unchanged checkout');
  }
  stage.htmlSha256 = hash(await readFile(`${stage.path}/dist/pages/index.html`));
}

// Generate the same real, current weekly plan with each revision. The actual
// date is never mocked: older fixtures would be archived automatically.
const today = new Date();
const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
const startsOn = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
const options = { seed: 'lh95-returning', startsOn, generatedAt: today.toISOString() };
let fixture;
for (const stage of Object.values(stages)) {
  const source = file => pathToFileURL(`${stage.path}/src/${file}`);
  const { generateWeeklyPlan } = await import(source('engine.ts'));
  const { RECIPES } = await import(source('recipes.ts'));
  const { DEFAULT_APP_STATE } = await import(source('storage.ts'));
  const profile = { ...DEFAULT_APP_STATE.profile, firstName: 'Camille' };
  const state = { ...DEFAULT_APP_STATE, profile, currentPlan: generateWeeklyPlan(RECIPES, profile, options), onboardingCompleted: true };
  assert.equal(state.currentPlan.startsOn, startsOn);
  assert.ok(state.currentPlan.meals.length > 0);
  if (fixture) assert.deepEqual(state, fixture, 'Both versions must use identical generated data');
  else fixture = state;
  stage.fixtureSha256 = hash(JSON.stringify(state));
}
const metadata = { startedAt: new Date().toISOString(), node: process.version, lighthouse: '13.4.1', runs, stages, options, prepareOnly };
await writeFile(`${output}/metadata.json`, JSON.stringify(metadata, null, 2));
await writeFile(`${output}/fixture.json`, JSON.stringify(fixture, null, 2));
console.log(JSON.stringify({ prepared: true, ...metadata }));
if (prepareOnly) process.exit(0);

async function ready(server) {
  for (let attempt = 0; attempt < 150; attempt++) {
    assert.equal(server.exitCode, null, 'Preview exited before becoming ready');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch {}
    await delay(100);
  }
  throw new Error('Preview did not become ready');
}

async function stop(server) {
  if (server.exitCode !== null) return;
  const stopped = once(server, 'exit');
  server.kill('SIGTERM');
  const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
  try { await stopped; } finally { clearTimeout(timeout); }
}

const results = [];
try {
  for (let run = 1; run <= runs; run++) {
    for (const scenario of ['new', 'returning']) {
      // Counterbalance the second round; never select only the best passages.
      for (const name of run % 2 ? ['baseline', 'after'] : ['after', 'baseline']) {
        const stage = stages[name];
        const prefix = `${output}/${scenario}-${name}-${run}`;
        const server = spawn(process.execPath, [`${stage.path}/node_modules/vite/bin/vite.js`, 'preview', '--host', '127.0.0.1', '--port', '4193', '--strictPort', '--base', base, '--outDir', `${stage.path}/dist/pages`], { cwd: stage.path, stdio: ['ignore', 'pipe', 'pipe'] });
        let serverLog = '';
        server.stdout.on('data', data => { serverLog += data; });
        server.stderr.on('data', data => { serverLog += data; });
        let chrome;
        let connection;
        try {
          const document = await ready(server);
          assert.equal(hash(await document.text()), stage.htmlSha256, 'The exact revision must be served');
          chrome = await launch({ chromePath: chromium.executablePath(), port: 9225, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'] });
          connection = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9225', defaultViewport: null });
          metadata.browserVersion = await connection.version();
          if (scenario === 'returning') {
            const seedPage = await connection.newPage();
            await seedPage.goto(`${url}manifest.webmanifest`, { waitUntil: 'load' });
            await seedPage.evaluate(state => localStorage.setItem('inflamm-menu:app-state', JSON.stringify(state)), fixture);
            assert.equal(await seedPage.evaluate(() => navigator.serviceWorker.getRegistrations().then(list => list.length)), 0, 'The fixture must not precache the app');
            await seedPage.close();
          }
          // Lighthouse closes pages it creates itself. Supply an untouched
          // about:blank page so the same measured document remains verifiable.
          const appPage = await connection.newPage();
          console.log(`LIGHTHOUSE_START ${run}/${runs} ${scenario} ${name}`);
          const result = await lighthouse(url, { port: chrome.port, output: ['json', 'html'], logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], maxWaitForLoad: 30000, disableStorageReset: scenario === 'returning' }, undefined, appPage);
          assert.ok(result?.lhr, 'Lighthouse must produce a report');
          await writeFile(`${prefix}.json`, result.report[0]);
          await writeFile(`${prefix}.html`, result.report[1]);
          const measurement = readMeasurement(result.lhr);
          assert.equal(appPage.isClosed(), false, 'The audited page must remain inspectable');
          assert.equal(appPage.url(), url, 'The inspected page must be the measured document');
          const check = await appPage.evaluate(() => ({
            text: document.body.innerText,
            onboarding: Boolean(document.querySelector('[data-testid="onboarding-view"]')),
            state: JSON.parse(localStorage.getItem('inflamm-menu:app-state') || 'null'),
            incompleteImages: Array.from(document.images).filter(image => {
              const rect = image.getBoundingClientRect();
              const visible = rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
              return image.complete ? image.naturalWidth === 0 : image.loading !== 'lazy' || visible;
            }).map(image => image.src),
          }));
          assert.equal(check.incompleteImages.length, 0, 'Eager and visible images must finish loading');
          if (scenario === 'returning') {
            assert.ok(check.text.includes('Camille') && check.text.includes('Une semaine'), 'The returning home must render');
            assert.equal(check.onboarding, false);
            assert.equal(check.state?.currentPlan?.startsOn, startsOn, 'The week must remain active');
            assert.equal(check.state?.currentPlan?.meals?.length, fixture.currentPlan.meals.length);
          } else {
            assert.equal(check.onboarding, true, 'The onboarding must actually render');
            assert.equal(check.state?.onboardingCompleted ?? false, false);
          }
          const row = { scenario, stage: name, run, date: result.lhr.fetchTime, ...measurement, verified: { htmlSha256: stage.htmlSha256, activeWeek: scenario === 'returning' ? startsOn : null, incompleteImages: 0 } };
          results.push(row);
          await writeFile(`${output}/results.json`, JSON.stringify({ metadata, results }, null, 2));
          console.log(`LIGHTHOUSE_RESULT ${JSON.stringify(row)}`);
        } finally {
          await writeFile(`${prefix}-server.log`, serverLog);
          if (connection) await connection.disconnect();
          if (chrome) await chrome.kill();
          await stop(server);
        }
      }
    }
  }
  const medians = summarize(results, runs);
  const summary = { metadata, medians, results };
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  const markdown = markdownReport(metadata, medians);
  await writeFile(`${output}/summary.md`, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(`LIGHTHOUSE_SUMMARY ${JSON.stringify(summary)}`);
} catch (error) {
  await writeFile(`${output}/failure.txt`, String(error.stack || error));
  throw error;
}
