import assert from 'node:assert/strict';
import { appendFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import puppeteer from 'puppeteer-core';
import { options, prepareCampaign, startServer, inspectPage, URL, hash } from './campaign.mjs';
import { markdownReport, readMeasurement, summarize } from './report.mjs';

const campaign = await prepareCampaign(options());
const { metadata, fixture, stages, output } = campaign;
metadata.chromeExecutable = process.env.CHROME_PATH || chromium.executablePath();
console.log(JSON.stringify({ prepared: true, ...metadata }));
if (campaign.prepareOnly) process.exit(0);
const results = [];
try {
  for (let run = 1; run <= metadata.runs; run++) {
    for (const scenario of ['new', 'returning']) {
      for (const name of run % 2 ? ['baseline', 'after'] : ['after', 'baseline']) {
        const stage = stages[name];
        const prefix = resolve(output, `${scenario}-${name}-${run}`);
        const server = await startServer(stage.path);
        let chrome;
        let connection;
        try {
          assert.equal(hash(await (await fetch(URL)).text()), stage.htmlSha256, 'Exact build must be served');
          chrome = await launch({ chromePath: metadata.chromeExecutable, port: 9225, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'] });
          connection = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9225', defaultViewport: null });
          metadata.browserVersion = await connection.version();
          if (scenario === 'returning') {
            const seedPage = await connection.newPage();
            await seedPage.goto(`${URL}manifest.webmanifest`, { waitUntil: 'load' });
            await seedPage.evaluate(state => localStorage.setItem('inflamm-menu:app-state', JSON.stringify(state)), fixture);
            assert.equal(await seedPage.evaluate(() => navigator.serviceWorker.getRegistrations().then(list => list.length)), 0);
            await seedPage.close();
          }
          const appPage = await connection.newPage();
          console.log(`LIGHTHOUSE_START ${run}/${metadata.runs} ${scenario} ${name}`);
          const result = await lighthouse(URL, {
            port: chrome.port, output: ['json', 'html'], logLevel: 'error',
            onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
            maxWaitForLoad: 30000, disableStorageReset: scenario === 'returning',
          }, undefined, appPage);
          assert(result?.lhr, 'Lighthouse must produce a report');
          await writeFile(`${prefix}.json`, result.report[0]);
          await writeFile(`${prefix}.html`, result.report[1]);
          const measurement = readMeasurement(result.lhr);
          assert.equal(appPage.isClosed(), false);
          assert.equal(appPage.url(), URL);
          const verified = await inspectPage(appPage, scenario, fixture);
          const row = { scenario, stage: name, run, date: result.lhr.fetchTime, ...measurement, verified: { htmlSha256: stage.htmlSha256, ...verified } };
          results.push(row);
          await writeFile(resolve(output, 'results.json'), JSON.stringify({ metadata, results }, null, 2));
          console.log(`LIGHTHOUSE_RESULT ${JSON.stringify(row)}`);
        } finally {
          await writeFile(`${prefix}-requests.json`, JSON.stringify(server.requests, null, 2));
          if (connection) await connection.disconnect();
          if (chrome) await chrome.kill();
          await server.close();
        }
      }
    }
  }
  const medians = summarize(results, metadata.runs);
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({ metadata, medians, results }, null, 2));
  await writeFile(resolve(output, 'metadata.json'), JSON.stringify(metadata, null, 2));
  const markdown = markdownReport(metadata, medians);
  await writeFile(resolve(output, 'summary.md'), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(`LIGHTHOUSE_SUMMARY ${JSON.stringify(medians)}`);
} catch (error) {
  await writeFile(resolve(output, 'failure.txt'), String(error.stack || error));
  throw error;
}
