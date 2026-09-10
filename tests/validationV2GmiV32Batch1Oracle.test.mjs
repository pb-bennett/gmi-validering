import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);
const api = await import('../src/lib/validation-v2/index.js');
const { GMIParser } = await import('../src/lib/parsing/gmiParser.js');
const { decodeGmiBytes } = await import('../src/lib/parsing/gmiDecoding.js');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');
const root = path.resolve('tests/fixtures/gmi-v32');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

test('Batch 1 synthetic oracle asserts exact completed outcomes', async () => {
  const byId = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
  const runs = new Map();
  for (const expected of manifest.batch1Expectations) {
    let result = runs.get(expected.fixture);
    if (!result) {
      const fixture = byId.get(expected.fixture);
      const dataset = new GMIParser(decodeGmiBytes(await readFile(path.join(root, fixture.file)))).toObject();
      result = api.runGmiValidationV2({ layerId: expected.fixture, dataset,
        datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: manifest.oracleReferenceDate });
      runs.set(expected.fixture, result);
    }
    const [geometryScope, sourceIndex] = expected.ref.split(':');
    const actual = result.outcomes.find((outcome) => outcome.ruleId === expected.ruleId &&
      outcome.objectRef.geometryScope === geometryScope && outcome.objectRef.sourceIndex === Number(sourceIndex));
    assert.ok(actual, `${expected.fixture} ${expected.ref} ${expected.ruleId}`);
    assert.equal(actual.state, expected.outcome);
    assert.equal(actual.reasonCode, expected.reason);
  }
});

test('schema coexistence is geometry-local and is not copied to object outcomes', async () => {
  const fixture = manifest.fixtures.find((item) => item.id === 'point-applicability-tema');
  const dataset = new GMIParser(decodeGmiBytes(await readFile(path.join(root, fixture.file)))).toObject();
  const result = api.runGmiValidationV2({ layerId: fixture.id, dataset,
    datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi' });
  assert.deepEqual(result.schemaFindings.map((finding) => [finding.geometryScope, finding.state, finding.reasonCode]),
    [['point', 'CHECK', 'SCHEMA_TEMA_SFCODE_COEXISTENCE']]);
  assert.equal(result.outcomes.some((outcome) => outcome.reasonCode === 'SCHEMA_TEMA_SFCODE_COEXISTENCE'), false);
});

test('Tema invalidity takes precedence over disagreement and leaves identity unresolved', () => {
  const text = ['[GMIFILE_ASCII]', '[P_]', '_FIELDNAMES Tema;S_FCODE', '[+P_]', ':P 1',
    '_FIELDVALUES KUM;BAD', '/XYZ', '1 2 3', ''].join('\n');
  const dataset = new GMIParser(text).toObject();
  const result = api.runGmiValidationV2({ layerId: 'tema-precedence', dataset,
    datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi' });
  const tema = result.outcomes.find((outcome) => outcome.ruleId === 'innmaling.point.tema.required');
  assert.deepEqual([tema.state, tema.reasonCode], ['FAIL', 'TEMA_INVALID']);
});
