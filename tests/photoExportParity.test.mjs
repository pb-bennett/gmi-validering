import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnosticKey, forEachMatrixFixture, MATRIX_LAYOUTS, MATRIX_PROFILES, matrixConfiguration, matrixFixture, matrixScenarios } from './helpers/photoExportMatrix.mjs';
import { exportFixture } from './helpers/photoExportFixtures.mjs';
import { capturePhotoExportSnapshot, buildPhotoExportPlan } from '../src/lib/photos/export/photoExportPlan.mjs';
import { photoExportReadiness } from '../src/lib/photos/export/photoExportReadiness.mjs';
import { PHOTO_EXPORT_PLAN_ONLY_ERRORS, evaluatePhotoExportRules } from '../src/lib/photos/export/photoExportRules.mjs';

const BANNED = /validert|godkjent|sertifisert|garantert/i;
const sorted = (items) => items.map(diagnosticKey).sort();
const scenarios = matrixScenarios();

// Readiness and the plan must block on exactly the same {code, assetId, occurrenceId} for the same canonical state.
// The one plan-only error the matrix can produce is projection-failed beside invalid-crs, which both sides report:
// the plan then has no valid CRS to project into. Anything else plan-only fails the test; see the end of this file.
for (const profile of [...MATRIX_PROFILES, '']) for (const layout of Object.keys(MATRIX_LAYOUTS)) {
  const selected = scenarios.filter((item) => item.profile === profile && item.layout === layout);
  if (selected.length) test(`parity ${profile || 'no profile'} / ${layout}: readiness and plan block identically in ${selected.length} scenarios`, async () => {
    await forEachMatrixFixture(selected, async (fixture, scenario) => {
      const label = JSON.stringify(scenario), configuration = matrixConfiguration(scenario);
      const plan = await buildPhotoExportPlan(fixture.snapshot(), configuration);
      const readiness = photoExportReadiness(fixture.photos(), configuration);
      const planOnly = plan.errors.filter((error) => PHOTO_EXPORT_PLAN_ONLY_ERRORS.includes(error.code));
      const shared = plan.errors.filter((error) => !planOnly.includes(error));
      const noCrs = shared.some((error) => error.code === 'invalid-crs');
      assert.deepEqual([...new Set(planOnly.map((error) => error.code))], noCrs && plan.counts.placed ? ['projection-failed'] : [], label);
      assert.deepEqual(sorted(readiness.blocking), sorted(shared), label);
      assert.equal(new Set(sorted(plan.errors)).size, plan.errors.length, `each rule reports once: ${label}`);
      assert.equal(readiness.levels.generation, plan.errors.length ? 'blocked' : 'possible', label);
      assert.equal(readiness.status === 'blocked', plan.errors.length > 0, label);
      assert.deepEqual(readiness.excluded.map((row) => row.occurrenceId).sort(), plan.excluded.map((row) => row.occurrenceId).sort(), label);
      assert.equal(readiness.counts.placed, plan.counts.placed, label);
      for (const item of [...readiness.blocking, ...readiness.recommendations, ...readiness.notes, ...plan.errors]) assert(!BANNED.test(item.message), item.message);
    });
  });
}

test('matrix size guards against scenarios being dropped by accident', () => {
  assert.equal(scenarios.filter((item) => item.photographer === 'valid' && item.context === 'valid' && item.crs === 'EPSG:25832' && item.profile).length, 6 * 7 * 4 * 3);
  assert(scenarios.length > 1700);
  assert.equal(new Set(scenarios.map((item) => JSON.stringify(item))).size, scenarios.length);
});

test('the shared rules give the same result from the plan snapshot and from readiness input', async () => {
  const f = await matrixFixture({ layout: 'repeated', time: 'minute', direction: 'none' });
  try {
    const snapshot = f.snapshot(), configuration = { profile: 'legacy2019', crs: 'EPSG:25832' };
    const direct = evaluatePhotoExportRules({ ...configuration, assets: snapshot.assets, occurrences: snapshot.occurrences });
    assert.deepEqual(sorted(direct.errors), sorted(photoExportReadiness(f.photos(), configuration).blocking));
    assert.deepEqual(sorted(direct.errors), sorted((await buildPhotoExportPlan(snapshot, configuration)).errors));
  } finally { f.session.clear(); }
});

test('ownership: asset rules count once, occurrence rules per occurrence, and unplaced occurrences never block', async () => {
  const counts = async (options, configuration) => {
    const f = await matrixFixture(options);
    try {
      const plan = await buildPhotoExportPlan(f.snapshot(), configuration), by = (code) => plan.errors.filter((error) => error.code === code).length;
      return { time: by('capture-time-required'), direction: by('direction-required'), xml: by('invalid-xml-text') };
    } finally { f.session.clear(); }
  };
  const legacy = { profile: 'legacy2019', crs: 'EPSG:25832' };
  assert.deepEqual(await counts({ layout: 'repeated', time: 'none', direction: 'none', photographer: 'xmlInvalid' }, legacy), { time: 1, direction: 2, xml: 1 });
  assert.deepEqual(await counts({ layout: 'twoAssets', time: 'none', direction: 'none', photographer: 'xmlInvalid' }, legacy), { time: 2, direction: 2, xml: 2 });
  assert.deepEqual(await counts({ layout: 'repeatedOnePlaced', time: 'none', direction: 'none', photographer: 'xmlInvalid' }, legacy), { time: 1, direction: 1, xml: 1 });
  assert.deepEqual(await counts({ layout: 'oneOfTwoPlaced', time: 'none', direction: 'none', photographer: 'xmlInvalid' }, legacy), { time: 1, direction: 1, xml: 1 });
  assert.deepEqual(await counts({ layout: 'nonePlaced', time: 'none', direction: 'none', photographer: 'xmlInvalid' }, legacy), { time: 0, direction: 0, xml: 0 });
});

test('the established error order survives the extraction', async () => {
  const f = await matrixFixture({ layout: 'twoAssets', time: 'none', direction: 'none', photographer: 'xmlInvalid' });
  try {
    const plan = await buildPhotoExportPlan(f.snapshot(), { profile: 'legacy2019', crs: 'EPSG:4326' }, { transform() { return [NaN, NaN]; } });
    const [a, b] = f.ids;
    assert.deepEqual(plan.errors.map((error) => `${error.code}:${error.assetId ?? error.occurrenceId ?? ''}`), [
      'invalid-crs:',
      `capture-time-required:${a}`, `invalid-xml-text:${a}`, `capture-time-required:${b}`, `invalid-xml-text:${b}`,
      `projection-failed:${a}`, `direction-required:${a}`, `projection-failed:${b}`, `direction-required:${b}`]);
  } finally { f.session.clear(); }
});

// The documented differences: these need file bytes, a projection or a built plan, so only the plan can report them.
test('legitimate difference: an unreadable original blocks the plan while readiness says generation is possible, pending files', async () => {
  const f = await exportFixture({ files: [new File([], 'empty.png', { type: 'image/png' })] });
  try {
    const plan = await f.plan({ profile: 'gemini-legacy2019' });
    assert.deepEqual(plan.errors.map((error) => error.code), ['missing-file']);
    const { status, levels, blocking } = photoExportReadiness(f.session.getLayerPhotos(f.layerId), { profile: 'gemini-legacy2019' });
    assert.deepEqual(blocking, []); assert.equal(levels.generation, 'possible'); assert.notEqual(status, 'blocked');
    assert(levels.pendingChecks.includes('original-files'));
  } finally { f.session.clear(); }
});

test('legitimate difference: projection failure and a stale plan are plan-only', async () => {
  const f = await exportFixture({ repeated: true });
  try {
    const failed = await f.plan({ profile: 'gemini-legacy2019' }, { transform() { return [NaN, Infinity]; } });
    assert.deepEqual([...new Set(failed.errors.map((error) => error.code))], ['projection-failed']);
    const snapshot = capturePhotoExportSnapshot(f.session, f.layerId);
    f.session.fillMissingPhotoValues(f.layerId, 'photographer', 'Changed');
    f.session.setCaptureMetadata(f.layerId, f.ids, 'photographer', 'Changed Again');
    const stale = await buildPhotoExportPlan(snapshot, { profile: 'gemini-legacy2019' });
    assert.deepEqual(stale.errors.map((error) => error.code), ['stale-plan']);
    const readiness = photoExportReadiness(f.session.getLayerPhotos(f.layerId), { profile: 'gemini-legacy2019' });
    assert.deepEqual(readiness.blocking, []);
    assert(readiness.levels.pendingChecks.includes('projection'));
  } finally { f.session.clear(); }
});
