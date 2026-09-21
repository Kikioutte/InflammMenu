import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { options, startServer, URL } from './campaign.mjs';

test('la campagne exige une référence explicite et refuse les options inconnues', () => {
  assert.throws(() => options(['before', 'after', 'out']), /baseline-ref/);
  assert.throws(() => options(['before', 'after', 'out', '--baseline-ref=abc', '--unexpected']), /Unknown option/);
  const parsed = options(['before', 'after', 'out', '--baseline-ref=abc', '--prepare-only']);
  assert.equal(parsed.baselineRef, 'abc');
  assert.equal(parsed.prepareOnly, true);
  assert.throws(() => options(['before', 'after', 'out', '--baseline-ref=abc', '--candidate-ref=def']), /Unknown option/);
});

test('le serveur conserve la base Pages et ne remplace jamais un JS absent par du HTML', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'inflamm-measurement-server-'));
  await mkdir(resolve(directory, 'assets'));
  await writeFile(resolve(directory, 'index.html'), '<!doctype html><title>fixture</title>');
  await writeFile(resolve(directory, 'assets/app.js'), 'export const valid = true;');
  const server = await startServer(directory);
  try {
    const document = await fetch(URL);
    assert.equal(document.status, 200);
    assert.match(document.headers.get('content-type'), /^text\/html/);
    const script = await fetch(`${URL}assets/app.js`);
    assert.match(script.headers.get('content-type'), /^text\/javascript/);
    assert.equal(script.headers.get('content-encoding'), 'gzip');
    assert.equal(await script.text(), 'export const valid = true;');
    const identity = await fetch(`${URL}assets/app.js`, { headers: { 'Accept-Encoding': 'identity' } });
    assert.equal(identity.headers.get('content-encoding'), null);
    assert.equal(await identity.text(), 'export const valid = true;');
    assert.equal((await fetch(`${URL}assets/missing.js`)).status, 404);
    assert.equal((await fetch(`${URL}%2e%2e%2foutside`)).status, 403);
    assert.equal((await fetch(URL.replace('/InflammMenu/', '/'))).status, 404);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
