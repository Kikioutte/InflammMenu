import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const BASE = '/InflammMenu/';
export const ORIGIN = 'http://127.0.0.1:4193';
export const URL = `${ORIGIN}${BASE}`;
export const hash = value => createHash('sha256').update(value).digest('hex');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...args) => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();

export function options(argv = process.argv.slice(2)) {
  const [beforePath, afterPath, resultPath, ...flags] = argv;
  assert(beforePath && afterPath && resultPath, 'Usage: node compare.mjs BASELINE_BUILD CANDIDATE_BUILD OUTPUT --baseline-ref=SHA [--prepare-only]');
  const value = name => flags.find(flag => flag.startsWith(`${name}=`))?.slice(name.length + 1);
  const baselineRef = value('--baseline-ref');
  assert(baselineRef, '--baseline-ref is required; never infer a historical revision');
  for (const flag of flags) assert(flag === '--prepare-only' || /^--baseline-ref=.+$/.test(flag), `Unknown option: ${flag}`);
  return {
    baselinePath: resolve(beforePath), candidatePath: resolve(afterPath), output: resolve(resultPath),
    baselineRef, prepareOnly: flags.includes('--prepare-only'),
  };
}

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(resolve(directory, entry.name), name));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(name);
  }
  return files.sort();
}

async function digestFile(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function buildManifest(directory) {
  const manifest = [];
  for (const path of await filesIn(directory)) {
    const file = resolve(directory, path);
    const info = await stat(file);
    manifest.push({ path, bytes: info.size, sha256: await digestFile(file) });
  }
  return manifest;
}

export async function prepareCampaign(config) {
  assert.notEqual(config.baselinePath, config.candidatePath, 'Build directories must differ');
  await mkdir(config.output, { recursive: true });
  const baselineSha = git('rev-parse', `${config.baselineRef}^{commit}`);
  const candidateSha = git('rev-parse', 'HEAD');
  const diff = git('diff', '--binary', 'HEAD', '--', 'src', 'public', 'index.html', 'scripts', 'package.json', 'package-lock.json');
  // Include new, untracked source modules as well as the tracked diff. The
  // build manifest remains the authoritative identity of the measured bytes.
  const sourceManifest = [];
  for (const path of await filesIn(resolve(projectRoot, 'src'))) {
    sourceManifest.push({ path: `src/${path}`, sha256: await digestFile(resolve(projectRoot, 'src', path)) });
  }
  // Both builds deliberately use one synthetic fixture. Verify that the
  // catalogue, profile contract and generator have not changed since baseline.
  const sharedFiles = ['src/domain.ts', 'src/engine.ts', 'src/recipes.ts', 'src/data/planner-recipes.json', 'src/data/recettes-anti-inflammatoires.json'];
  const sourceHashes = {};
  for (const path of sharedFiles) {
    const bytes = await readFile(resolve(projectRoot, path));
    const baseline = execFileSync('git', ['show', `${baselineSha}:${path}`], { cwd: projectRoot, maxBuffer: 24 * 1024 * 1024 });
    assert.equal(hash(bytes), hash(baseline), `Shared measurement fixture requires unchanged ${path}`);
    sourceHashes[path] = hash(bytes);
  }
  const { generateWeeklyPlan } = await import(pathToFileURL(resolve(projectRoot, 'src/engine.ts')));
  const { RECIPES } = await import(pathToFileURL(resolve(projectRoot, 'src/recipes.ts')));
  const { DEFAULT_APP_STATE } = await import(pathToFileURL(resolve(projectRoot, 'src/storage.ts')));
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const startsOn = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const planOptions = { seed: 'lh95-returning', startsOn, generatedAt: today.toISOString() };
  const profile = { ...DEFAULT_APP_STATE.profile, firstName: 'Camille' };
  const fixture = { ...DEFAULT_APP_STATE, profile, currentPlan: generateWeeklyPlan(RECIPES, profile, planOptions), onboardingCompleted: true };
  assert(fixture.currentPlan.meals.length > 0);
  const stages = {
    baseline: { path: config.baselinePath, sha: baselineSha, source: 'committed-baseline' },
    after: { path: config.candidatePath, sha: candidateSha, source: 'working-tree-build' },
  };
  for (const [name, stage] of Object.entries(stages)) {
    const manifest = await buildManifest(stage.path);
    const html = await readFile(resolve(stage.path, 'index.html'), 'utf8');
    const worker = await readFile(resolve(stage.path, 'sw.js'), 'utf8');
    assert(html.includes('/InflammMenu/assets/'), 'Expected a completed Pages build');
    assert(!worker.includes('__SHELL_VERSION__'), 'Build precache must be generated first');
    assert(!worker.includes('entry-after-interrupted-update.js') && !html.includes('inflamm-menu-test-version'), 'A PWA test fixture remains in the build; prepare a clean snapshot before measuring');
    stage.htmlSha256 = hash(html);
    stage.manifestSha256 = hash(JSON.stringify(manifest));
    stage.entry = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
    stage.shellVersion = worker.match(/const SHELL_CACHE = `\$\{SHELL_CACHE_PREFIX\}([^`]+)`/)?.[1];
    stage.fixtureSha256 = hash(JSON.stringify(fixture));
    await writeFile(resolve(config.output, `${name}-build-manifest.json`), JSON.stringify(manifest, null, 2));
  }
  const metadata = {
    startedAt: today.toISOString(), node: process.version, lighthouse: '13.4.1', runs: 3, stages,
    sourceHashes, sourceManifestSha256: hash(JSON.stringify(sourceManifest)), sourceWorkingDiffSha256: hash(diff),
    sourceWorkingTreeModified: git('status', '--porcelain', '--', 'src', 'public', 'index.html', 'scripts', 'package.json', 'package-lock.json').length > 0,
    fixtureSource: 'current generator and catalogue checked byte-identical to baseline', planOptions,
    prepareOnly: config.prepareOnly, serving: 'same local static server; Pages base; real service worker; deterministic gzip level6 precomputed before timing',
    compression: { algorithm: 'gzip', level: 6, precomputed: true, productionComparison: 'Pages serves gzip; CDN compression bytes and latency are not reproduced exactly' },
  };
  await writeFile(resolve(config.output, 'metadata.json'), JSON.stringify(metadata, null, 2));
  await writeFile(resolve(config.output, 'fixture.json'), JSON.stringify(fixture, null, 2));
  await writeFile(resolve(config.output, 'source-manifest.json'), JSON.stringify(sourceManifest, null, 2));
  await writeFile(resolve(config.output, 'candidate-source.diff'), diff);
  return { ...config, metadata, fixture, stages };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

export async function startServer(directory) {
  const requests = [];
  // Github Pages serves compressed text assets. Prepare the same deterministic
  // encoding for both snapshots before a browser is launched or a timer starts.
  // Compression must never become part of either measured critical path.
  const compressed = new Map();
  for (const name of await filesIn(directory)) {
    if (!/\.(?:html|m?js|css|json|webmanifest|svg|txt|xml)$/.test(name)) continue;
    const raw = await readFile(resolve(directory, name));
    compressed.set(name, { raw, gzip: gzipSync(raw, { level: 6 }) });
  }
  const server = createServer(async (request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new globalThis.URL(request.url, ORIGIN).pathname); }
    catch { response.writeHead(400).end(); return; }
    if (!pathname.startsWith(BASE) || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404).end(); return; }
    const relativePath = pathname.slice(BASE.length) || 'index.html';
    const file = resolve(directory, relativePath);
    const within = relative(directory, file);
    if (isAbsolute(within) || within.startsWith('..') || pathname.includes('\0')) { response.writeHead(403).end(); return; }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw Error('Not a file');
      const representations = compressed.get(within);
      const gzip = representations && /\bgzip\b/.test(request.headers['accept-encoding'] ?? '');
      const bytes = gzip ? representations.gzip : representations?.raw;
      response.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': bytes?.length ?? info.size, 'Cache-Control': 'no-cache',
        ...(representations ? { Vary: 'Accept-Encoding' } : {}), ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
      });
      requests.push({ path: pathname, status: 200, bytes: bytes?.length ?? info.size, uncompressedBytes: info.size, encoding: gzip ? 'gzip' : 'identity', at: Date.now() });
      if (request.method === 'HEAD') response.end();
      else if (bytes) response.end(bytes);
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
      requests.push({ path: pathname, status: 404, at: Date.now() });
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(4193, '127.0.0.1', resolveReady); });
  return { requests, close: () => new Promise((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections(); }) };
}

export async function inspectPage(page, scenario, fixture) {
  // Some Lighthouse accessibility audits move through the document and can
  // trigger a lazy image after the timed navigation has already finished.
  // Verify the displayed result after decoding; this does not alter the LHR.
  await page.evaluate(async () => {
    const required = Array.from(document.images).filter(image => {
      const rect = image.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
      return image.loading !== 'lazy' || visible;
    });
    let timeout;
    try {
      await Promise.race([
        Promise.all(required.map(image => image.decode())),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Visible images did not decode after audit')), 10000); }),
      ]);
    } finally { clearTimeout(timeout); }
  });
  const check = await page.evaluate(() => ({
    text: document.body.innerText,
    onboarding: Boolean(document.querySelector('[data-testid="onboarding-view"]')),
    home: Boolean(document.querySelector('[data-testid="home-view"]')),
    state: JSON.parse(localStorage.getItem('inflamm-menu:app-state') || 'null'),
    incompleteImages: Array.from(document.images).filter(image => {
      const rect = image.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
      return (image.loading !== 'lazy' || visible) && (!image.complete || image.naturalWidth === 0);
    }).map(image => image.src),
  }));
  assert.equal(check.incompleteImages.length, 0, `Images incomplete: ${JSON.stringify(check.incompleteImages)}`);
  if (scenario === 'returning') {
    assert(check.home && check.text.includes('Camille') && !check.onboarding, 'Returning home must actually render');
    assert.deepEqual(check.state?.currentPlan, fixture.currentPlan, 'Measured home must retain the common complete plan');
  } else {
    assert(check.onboarding, 'The onboarding must actually render');
    assert.equal(check.state?.onboardingCompleted ?? false, false);
  }
  return { activeWeek: scenario === 'returning' ? fixture.currentPlan.startsOn : null, incompleteImages: 0 };
}
