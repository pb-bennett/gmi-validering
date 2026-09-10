import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const api = await import('../src/lib/validation-v2/index.js');
const { GMIParser } = await import('../src/lib/parsing/gmiParser.js');
const { decodeGmiBytes } = await import('../src/lib/parsing/gmiDecoding.js');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');
const root = path.resolve('tests/fixtures/gmi-v32');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

test('Batch 2 synthetic oracle asserts exact completed outcomes and suppression', async () => {
  const fixtures = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
  const runs = new Map();
  for (const expected of manifest.batch2Expectations) {
    if (!runs.has(expected.fixture)) {
      const fixture = fixtures.get(expected.fixture);
      const dataset = new GMIParser(decodeGmiBytes(await readFile(path.join(root, fixture.file)))).toObject();
      runs.set(expected.fixture, api.runGmiValidationV2({ layerId: fixture.id, dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: manifest.oracleReferenceDate }));
    }
    const [geometryScope, sourceIndex] = expected.ref.split(':');
    const outcome = runs.get(expected.fixture).outcomes.find((item) => item.ruleId === expected.ruleId && item.objectRef.geometryScope === geometryScope && item.objectRef.sourceIndex === Number(sourceIndex));
    assert.ok(outcome, `${expected.fixture} ${expected.ref} ${expected.ruleId}`);
    assert.equal(outcome.state, expected.outcome);
    assert.equal(outcome.reasonCode, expected.reason);
  }
  const result = runs.get('batch2-oracle');
  for (const ruleId of ['innmaling.point.width.integer', 'innmaling.point.attachment-link.policy', 'innmaling.point.type-tema.compatible']) {
    const dependent = result.outcomes.find((item) => item.ruleId === ruleId && item.objectRef.sourceIndex === 2);
    assert.equal(dependent.state, 'NOT_EVALUATED', ruleId);
    assert.equal(dependent.reasonCode, 'DEPENDENT_TEMA_UNRESOLVED', ruleId);
  }
  assert.deepEqual(result.schemaFindings.map((item) => [item.geometryScope, item.reasonCode]), [['point', 'SCHEMA_TEMA_SFCODE_COEXISTENCE']]);
});
