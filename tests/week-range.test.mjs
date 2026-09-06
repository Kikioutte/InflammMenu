import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { formatWeekRange } from '../src/view-format.ts';

test('les plages de semaine restent identiques au format français antérieur dans trois fuseaux', () => {
  const moduleUrl = new URL('../src/view-format.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    const { formatWeekRange } = await import(${JSON.stringify(moduleUrl)});
    let checked = 0;
    for (let year = 2024; year <= 2027; year++) {
      for (let date = new Date(year, 0, 1); date.getFullYear() === year; date.setDate(date.getDate() + 1)) {
        const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        end.setDate(end.getDate() + 6);
        const a = date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
        const b = end.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
        const expected = date.getMonth() === end.getMonth()
          ? date.getDate() + '–' + end.getDate() + ' ' + b
          : date.getDate() + ' ' + a + ' – ' + end.getDate() + ' ' + b;
        const input = year + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
        assert.equal(formatWeekRange(input), expected, input + ' ' + process.env.TZ);
        checked++;
      }
    }
    console.log(checked);
  `;
  for (const TZ of ['UTC', 'Europe/Paris', 'America/New_York']) {
    const count = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(Number(count.trim()), 1461);
  }
});

test('les dates invalides restent rejetées', () => {
  for (const input of ['', 'invalide', '2026-NaN-01', '999999-01-01']) assert.throws(() => formatWeekRange(input), RangeError);
});

test('le libellé de semaine ne réinitialise aucun formatteur international au rendu', (t) => {
  const original = Date.prototype.toLocaleDateString;
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'DateTimeFormat');
  t.after(() => { Date.prototype.toLocaleDateString = original; Object.defineProperty(Intl, 'DateTimeFormat', descriptor); });
  Date.prototype.toLocaleDateString = () => { throw Error('Formatage coûteux au rendu'); };
  Object.defineProperty(Intl, 'DateTimeFormat', { configurable: true, value: () => { throw Error('Initialisation ICU au rendu'); } });
  assert.equal(formatWeekRange('2026-08-31'), '31 août – 6 sept');
  assert.equal(formatWeekRange('2026-09-07'), '7–13 sept');
  assert.equal(formatWeekRange('2026-12-28'), '28 déc – 3 janv');
});
