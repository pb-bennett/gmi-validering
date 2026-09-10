import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);
const { GMIParser } = await import('../src/lib/parsing/gmiParser.js');
const { decodeGmiBytes, GMI_CANONICAL_ENCODING } = await import('../src/lib/parsing/gmiDecoding.js');
const root = path.resolve('tests/fixtures/gmi-v32');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

test('synthetic GMI manifest is complete, internally consistent and privacy-safe', async () => {
  assert.equal(manifest.fieldCoverage.length, 41);
  assert.equal(manifest.encoding, GMI_CANONICAL_ENCODING);
  assert.equal(new Set(manifest.fieldCoverage.map(([field]) => field)).size, 41);
  const fixtureIds = manifest.fixtures.map((fixture) => fixture.id);
  assert.equal(new Set(fixtureIds).size, fixtureIds.length);
  const scenarioIds = manifest.scenarioOracle.map((scenario) => scenario.id);
  assert.equal(new Set(scenarioIds).size, scenarioIds.length);
  const known = new Set(scenarioIds);
  for (const fixture of manifest.fixtures) {
    for (const scenarioId of fixture.scenarios) assert(known.has(scenarioId));
    const bytes = await readFile(path.join(root, fixture.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
    const text = decodeGmiBytes(bytes);
    for (const forbidden of ['REF_FILES', 'GUID ', 'SID ', 'C:\\GitHub', '127.0.0.1']) assert(!text.includes(forbidden));
  }
});

test('synthetic parseable fixtures have the documented parser structure', async () => {
  for (const fixture of manifest.fixtures.filter((fixture) => fixture.parser === 'success')) {
    const text = decodeGmiBytes(await readFile(path.join(root, fixture.file)));
    const parsed = new GMIParser(text).toObject();
    assert.equal(parsed.points.length, fixture.points, fixture.id);
    assert.equal(parsed.lines.length, fixture.lines, fixture.id);
    assert.equal(parsed.errors.length, 0, fixture.id);
    const headers = new Set([...Object.keys(parsed.fieldAnalysis.points), ...Object.keys(parsed.fieldAnalysis.lines)]);
    for (const header of fixture.headers) assert(headers.has(header), `${fixture.id}: ${header}`);
  }
});

test('synthetic parser-error fixtures preserve documented current parser behavior', async () => {
  for (const fixture of manifest.fixtures.filter((fixture) => fixture.parser === 'throw')) {
    const text = decodeGmiBytes(await readFile(path.join(root, fixture.file)));
    assert.throws(() => new GMIParser(text), fixture.id);
  }
});
