import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { exportFixture } from './helpers/photoExportFixtures.mjs';
import { PHOTO_EXPORT_PROFILES } from '../src/lib/photos/export/exportContract.mjs';
import { groupPhotoExportDiagnostics, photoExportDiagnosticLabel } from '../src/lib/photos/export/photoExportDiagnostics.mjs';
import { PHOTO_EXPORT_IMPORT_EVIDENCE, PHOTO_EXPORT_PROFILE_METADATA, PHOTO_EXPORT_REQUIREMENTS, PHOTO_EXPORT_SCHEMA_REQUIREMENTS,
  evaluatePhotoExportRules, isValidExportDirection, normalizeExportContext } from '../src/lib/photos/export/photoExportRules.mjs';

const PROFILE_IDS = Object.keys(PHOTO_EXPORT_PROFILES).sort();
const source = (file) => readFile(new URL(`../src/lib/photos/export/${file}`, import.meta.url), 'utf8');

test('every table covers exactly the supported profiles', () => {
  for (const table of [PHOTO_EXPORT_PROFILE_METADATA, PHOTO_EXPORT_REQUIREMENTS, PHOTO_EXPORT_SCHEMA_REQUIREMENTS, PHOTO_EXPORT_IMPORT_EVIDENCE]) {
    assert.deepEqual(Object.keys(table).sort(), PROFILE_IDS);
    assert(Object.isFrozen(table)); assert(Object.values(table).every(Object.isFrozen));
  }
});

test('requirements match the approved table', () => {
  assert.deepEqual(PHOTO_EXPORT_REQUIREMENTS, {
    'gemini-legacy2019': { direction: 'required', captureTime: 'recommended', photographer: 'omitted', context: false },
    legacy2019: { direction: 'required', captureTime: 'required', photographer: 'optional', context: false },
    asbuilt52: { direction: 'optional', captureTime: 'required', photographer: 'omitted', context: true },
  });
});

test('schema requirements stand apart from what blocks: Gemini needs a time in the schema, not in the profile', () => {
  assert.equal(PHOTO_EXPORT_REQUIREMENTS['gemini-legacy2019'].captureTime, 'recommended');
  assert.equal(PHOTO_EXPORT_SCHEMA_REQUIREMENTS['gemini-legacy2019'].captureTime, true);
  assert.equal(PHOTO_EXPORT_SCHEMA_REQUIREMENTS['gemini-legacy2019'].schema, 'Skråfoto 2019');
  assert.equal(PHOTO_EXPORT_SCHEMA_REQUIREMENTS.asbuilt52.schema, 'AsBuilt 5.2');
  assert.equal(PHOTO_EXPORT_SCHEMA_REQUIREMENTS.asbuilt52.direction, false);
});

test('Gemini is the only primary profile, and tier metadata leaves the export contract alone', () => {
  assert.deepEqual(Object.entries(PHOTO_EXPORT_PROFILE_METADATA).filter(([, item]) => item.tier === 'primary').map(([id]) => id), ['gemini-legacy2019']);
  assert.deepEqual(Object.values(PHOTO_EXPORT_PROFILE_METADATA).map((item) => item.tier).sort(), ['advanced', 'advanced', 'primary']);
  for (const profile of Object.values(PHOTO_EXPORT_PROFILES)) assert.equal(profile.tier, undefined);
});

const asset = (assetId, captureTime = null, photographer = null) => ({ assetId, originalFilename: `${assetId}.jpg`, metadata: { captureTime, photographer } });
const row = (occurrenceId, assetId, direction = null, current = {}) => ({ occurrenceId, assetId, direction, current });

test('rules are profile-driven and carry the established codes and owners', () => {
  const evaluate = (profile, overrides = {}) => evaluatePhotoExportRules({ profile, crs: 'EPSG:25832', context: {}, assets: [asset('a')], occurrences: [row('o', 'a')], ...overrides });
  assert.deepEqual(evaluate('gemini-legacy2019').errors.map(({ code, occurrenceId }) => [code, occurrenceId]), [['direction-required', 'o']]);
  assert.deepEqual(evaluate('legacy2019').errors.map(({ code, assetId, occurrenceId }) => [code, assetId, occurrenceId]), [['capture-time-required', 'a', undefined], ['direction-required', undefined, 'o']]);
  assert.deepEqual([...new Set(evaluate('asbuilt52').errors.map((item) => item.code))], ['invalid-context', 'capture-time-required']);
  assert.deepEqual(evaluate('gemini-legacy2019', { crs: 'EPSG:4326' }).errors.map((item) => item.code), ['direction-required'], 'Gemini fixes its own CRS');
  assert(evaluate('legacy2019', { crs: 'EPSG:4326' }).errors.some((item) => item.code === 'invalid-crs'));
});

test('direction-required names no profile and suggests no value', () => {
  for (const profile of ['gemini-legacy2019', 'legacy2019']) {
    const { message } = evaluatePhotoExportRules({ profile, crs: 'EPSG:25832', assets: [asset('a')], occurrences: [row('o', 'a')] }).errors.find((item) => item.code === 'direction-required');
    assert.equal(message, 'a.jpg (o): godtatt retning kreves for denne eksportprofilen.');
    assert(!/Legacy|Gemini|0°/.test(message));
  }
});

test('invalid-direction bounds: 0 is valid north, 360 is not an export value', () => {
  for (const degrees of [0, .001, 359.999]) assert.equal(isValidExportDirection({ degrees }), true, degrees);
  for (const degrees of [-.001, 360, 400, NaN, Infinity, undefined]) assert.equal(isValidExportDirection({ degrees }), false, degrees);
  assert.equal(isValidExportDirection(null), false);
});

test('the rules module never reads a Gemini policy from anywhere but the table', async () => {
  const code = await source('photoExportRules.mjs');
  assert(!/captureTime === 'blocking|gemini.*capture-time/i.test(code));
  assert.equal(evaluatePhotoExportRules({ profile: 'gemini-legacy2019', assets: [asset('a')], occurrences: [row('o', 'a', { degrees: 0 })] }).errors.length, 0, 'explicit north and no time do not block Gemini');
});

test('context is trimmed the way the plan always trimmed it', () => {
  assert.deepEqual(Object.values(normalizeExportContext({ projectName: '  x  ', datasetName: 7 })).filter(Boolean), ['7', 'x']);
  assert.equal(normalizeExportContext(undefined).projectName, '');
});

// F10: every code the export code can emit has a readable label.
test('every diagnostic code has a human label', async () => {
  const files = await Promise.all(['photoExportPlan.mjs', 'photoExportRules.mjs', 'photoExportReadiness.mjs', 'exportContract.mjs'].map(source));
  const emitted = new Set(files.flatMap((code) => [...code.matchAll(/(?:code: |\berror\(|\badd\()'([a-z0-9-]+)'/g)].map((match) => match[1])));
  assert(emitted.size >= 30, `found ${emitted.size} codes`);
  for (const code of emitted) assert.notEqual(photoExportDiagnosticLabel(code), code, `${code} has no label`);
});

test('labels make no certification claim, and unknown codes still render', () => {
  assert.equal(photoExportDiagnosticLabel('not-a-code'), 'not-a-code');
  assert.equal(groupPhotoExportDiagnostics([{ code: 'compatibility-time' }])[0].label, 'Opptakstid i Gemini-filen');
});

test('F14: the Gemini time warning no longer calls a UTC clock local time, and stays honest about what is omitted', async () => {
  const f = await exportFixture({ time: '2026-05-12T12:33:02Z' });
  try {
    const { message } = (await f.plan({ profile: 'gemini-legacy2019' })).warnings.find((item) => item.code === 'compatibility-time');
    assert.equal(message, '0 features uten full opptakstid får ikke opptakstid i GML-filen. 1 tidssone-suffikser fjernes, og klokkeslettet endres ikke: UTC-tid blir stående som UTC, uten tidssone. Brøkdelsekunder utelates for å matche referansen. Godtatte data endres ikke.');
    assert(!/lokal/i.test(message));
  } finally { f.session.clear(); }
});

test('accepted data stays canonical: the plan keeps the Z value and only the serializer strips it', async () => {
  const f = await exportFixture({ time: '2026-05-12T12:33:02Z' });
  try {
    const plan = await f.plan({ profile: 'gemini-legacy2019' });
    assert.equal(plan.assets[0].metadata.captureTime.value.iso, '2026-05-12T12:33:02Z');
  } finally { f.session.clear(); }
});
