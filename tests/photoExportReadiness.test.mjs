import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';
import { matrixFixture } from './helpers/photoExportMatrix.mjs';
import { exifCaptureEvidence, gmlCaptureEvidence, normalizeCaptureTime } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { exifDirectionEvidence, gmlDirectionEvidence } from '../src/lib/photos/photoDirection.mjs';
import { effectivePhoto } from '../src/lib/photos/photoEditSession.mjs';
import { classifyCaptureTime, photoExportReadiness } from '../src/lib/photos/export/photoExportReadiness.mjs';
import { PHOTO_EXPORT_IMPORT_EVIDENCE } from '../src/lib/photos/export/photoExportRules.mjs';

const gemini = { profile: 'gemini-legacy2019' }, legacy = { profile: 'legacy2019', crs: 'EPSG:25832' };
const asbuilt = { profile: 'asbuilt52', crs: 'EPSG:25832', context: syntheticContext };
const position = { position: { crs: 'EPSG:4326', longitude: 10, latitude: 59 } };
const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);

const accepted = (iso, provenance = { kind: 'exif' }) => ({ value: normalizeCaptureTime(iso), provenance });
const direction = (degrees, basis = { kind: 'exif' }) => ({ degrees, basis });
const manual = { kind: 'manual' }, bulk = { kind: 'manual', mode: 'bulk' };
function photo(id, { assetId = id, placed = true, time = null, degrees = null, photographer = null, metadataEvidence = [], directionEvidence = [], exifRead = 'no-gps', repeatGroup } = {}) {
  return { id, assetId, originalFilename: `${assetId}.jpg`, metadataEvidence, directionEvidence, repeatGroup,
    captureMetadata: { captureTime: time, photographer }, direction: { current: degrees },
    spatial: { current: placed ? position : null, exifRead: { state: exifRead } } };
}
const complete = (id, options = {}) => photo(id, { time: accepted('2026-05-12T14:33:02'), degrees: direction(90), ...options });
const source = { id: 'source', filename: 'source.gml' }, entry = { id: 'entry' };
const exifTime = (clock = '2026:05:12 14:33:02', extra = {}) => exifCaptureEvidence({ DateTimeOriginal: clock, ...extra })[0];
const gmlTime = (text) => gmlCaptureEvidence(source, { ...entry, raw: { photographedAtText: text } })[0];
const gmlDirection = (valueText) => gmlDirectionEvidence(source, { ...entry, raw: { direction: { valueText, unitText: '1', referenceText: '1' } } })[0];
const exifDirection = (degrees) => exifDirectionEvidence({ GPSImgDirection: degrees, GPSImgDirectionRef: 'T' })[0];
const codes = (items) => items.map((item) => item.code);
const recommendation = (result, code) => result.recommendations.find((item) => item.code === code);

// B. Levels
test('Gemini complete: every level is satisfied and nothing is claimed beyond the rule table', () => {
  const result = photoExportReadiness([complete('a'), complete('b')], gemini);
  assert.equal(result.status, 'ready');
  assert.equal(result.levels.generation, 'possible');
  assert.deepEqual(result.levels.pendingChecks, ['original-files', 'attachment-names', 'projection']);
  assert.deepEqual(result.levels.schema, { name: 'Skråfoto 2019', method: 'rules', assessed: true, met: true, gaps: [] });
  assert.equal(result.levels.importEvidence.profile, 'imported');
  assert.deepEqual(result.levels.importEvidence.deviations, []);
  assert.deepEqual(result.counts, { total: 2, placed: 2, excluded: 0, assets: 2, readyOccurrences: 2 });
});

test('critical: Gemini without capture times stays possible to generate and reports a schema gap', () => {
  const result = photoExportReadiness([photo('a', { degrees: direction(90) }), photo('b', { degrees: direction(90) })], gemini);
  assert.equal(result.status, 'schema-gap');
  assert.equal(result.levels.generation, 'possible');
  assert.deepEqual(result.blocking, []);
  assert.equal(result.levels.schema.met, false);
  assert.deepEqual(result.levels.schema.gaps, [{ field: 'captureTime', count: 2, missing: 2, insufficientPrecision: 0 }]);
  assert.deepEqual(result.levels.importEvidence.deviations, [{ field: 'captureTime', state: 'unconfirmed', count: 2, referenceOnly: true }]);
  assert.equal(result.counts.readyOccurrences, 2);
});

test('Gemini date-only and minute times would be omitted, so they are schema gaps counted apart from missing', () => {
  const result = photoExportReadiness([photo('a', { time: accepted('2026-05-12'), degrees: direction(90) }),
    photo('b', { time: accepted('2026-05-12T14:33'), degrees: direction(90) }), photo('c', { degrees: direction(90) }), complete('d')], gemini);
  assert.equal(result.status, 'schema-gap'); assert.equal(result.levels.generation, 'possible');
  assert.deepEqual(result.levels.schema.gaps, [{ field: 'captureTime', count: 3, missing: 1, insufficientPrecision: 2 }]);
  assert.equal(result.tasks.captureTime.counts.partial, 2);
});

test('Gemini without direction blocks, and reports the gap and the untested deviation', () => {
  const result = photoExportReadiness([complete('a', { degrees: null })], gemini);
  assert.equal(result.status, 'blocked'); assert.equal(result.levels.generation, 'blocked');
  assert.deepEqual(codes(result.blocking), ['direction-required']);
  assert.deepEqual(result.levels.schema.gaps, [{ field: 'direction', count: 1 }]);
  assert.deepEqual(result.levels.importEvidence.deviations, [{ field: 'direction', state: 'untested', count: 1, referenceOnly: false }]);
  assert.equal(result.counts.readyOccurrences, 0);
});

test('Legacy and AsBuilt block on capture time, and level 1 implies level 2 for the fields they cover', () => {
  for (const configuration of [legacy, asbuilt]) {
    const ready = photoExportReadiness([complete('a')], configuration);
    assert.equal(ready.status, 'ready'); assert.equal(ready.levels.schema.met, true);
    assert.deepEqual(ready.levels.importEvidence, { profile: 'none', deviations: [], recorded: PHOTO_EXPORT_IMPORT_EVIDENCE[configuration.profile] });
    const missing = photoExportReadiness([complete('a', { time: null })], configuration);
    assert.equal(missing.status, 'blocked'); assert.deepEqual(codes(missing.blocking), ['capture-time-required']);
    assert.equal(missing.levels.schema.met, false); assert.deepEqual(missing.levels.importEvidence.deviations, []);
  }
  assert.equal(photoExportReadiness([complete('a')], legacy).levels.schema.name, 'Skråfoto 2019');
  assert.equal(photoExportReadiness([complete('a')], asbuilt).levels.schema.name, 'AsBuilt 5.2');
});

test('direction is optional for AsBuilt in both generation and schema, but an invalid value still blocks', () => {
  const result = photoExportReadiness([complete('a', { degrees: null })], asbuilt);
  assert.equal(result.status, 'ready'); assert.deepEqual(result.levels.schema.gaps, []);
  assert.equal(result.tasks.direction.requirement, 'optional'); assert.equal(result.tasks.direction.schemaRequired, false);
  assert.deepEqual(codes(photoExportReadiness([complete('a', { degrees: direction(400) })], asbuilt).blocking), ['invalid-direction']);
});

test('missing AsBuilt context blocks and is a schema gap with its fields named', () => {
  const result = photoExportReadiness([complete('a')], { ...asbuilt, context: { ...syntheticContext, projectName: ' ', horizontalMethod: 'nope' } });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.tasks.context, { required: true, missingFields: ['projectName', 'horizontalMethod'] });
  assert.deepEqual(result.levels.schema.gaps, [{ field: 'context', count: 2 }]);
  assert.equal(result.counts.readyOccurrences, 0, 'a delivery-wide problem blocks every occurrence');
  assert.deepEqual(photoExportReadiness([complete('a')], legacy).tasks.context, { required: false, missingFields: [] });
});

test('no placed occurrences: blocked, nothing to assess, and no claim that a schema is met', () => {
  for (const photos of [[], [photo('a', { placed: false })]]) {
    const result = photoExportReadiness(photos, gemini);
    assert.equal(result.status, 'blocked'); assert.deepEqual(codes(result.blocking), ['no-placed-photos']);
    assert.equal(result.levels.schema.assessed, false); assert.equal(result.levels.schema.met, false); assert.deepEqual(result.levels.schema.gaps, []);
  }
});

test('several occurrences of one asset: time counts once and direction per occurrence', () => {
  const shared = { assetId: 'asset' };
  const result = photoExportReadiness([photo('a', shared), photo('b', shared), photo('c', { ...shared, placed: false })], legacy);
  assert.deepEqual(codes(result.blocking).sort(), ['capture-time-required', 'direction-required', 'direction-required']);
  assert.deepEqual(result.levels.schema.gaps, [{ field: 'captureTime', count: 1, missing: 1, insufficientPrecision: 0 }, { field: 'direction', count: 2 }]);
  assert.deepEqual(result.counts, { total: 3, placed: 2, excluded: 1, assets: 1, readyOccurrences: 0 });
  assert.deepEqual(result.excluded, [{ occurrenceId: 'c', assetId: 'asset', reason: 'unplaced' }]);
  assert.equal(result.tasks.captureTime.items.length, 1); assert.equal(result.tasks.direction.items.length, 2);
  assert.deepEqual(result.tasks.placement, { unplaced: 1, occurrenceIds: ['c'] });
  assert.equal(photoExportReadiness([complete('a', shared), complete('b', shared)], gemini).notes.find((note) => note.code === 'shared-attachments').count, 1);
});

test('an unplaced occurrence does not count against scope, and its asset stays out unless placed elsewhere', () => {
  const result = photoExportReadiness([complete('a'), photo('b', { placed: false })], legacy);
  assert.equal(result.status, 'ready'); assert.equal(result.counts.excluded, 1); assert.equal(result.counts.assets, 1);
});

test('status order: blocked, then schema gap, then recommendations, then ready', () => {
  const noted = { time: accepted('1999-01-01T00:00:00') };
  assert.equal(photoExportReadiness([complete('a', { ...noted, degrees: null })], { ...gemini, now: NOW }).status, 'blocked');
  assert.equal(photoExportReadiness([complete('a', { time: null, exifRead: 'pending' })], { ...gemini, now: NOW }).status, 'schema-gap');
  assert.equal(photoExportReadiness([complete('a', noted)], { ...gemini, now: NOW }).status, 'recommendations');
  assert.equal(photoExportReadiness([complete('a')], { ...gemini, now: NOW }).status, 'ready');
});

test('no profile chosen: blocked, with no requirement or evidence invented for it', () => {
  const result = photoExportReadiness([complete('a')], { crs: 'EPSG:25832' });
  assert.deepEqual(codes(result.blocking), ['invalid-profile']);
  assert.equal(result.levels.schema.name, null); assert.equal(result.levels.schema.met, false);
  assert.equal(result.levels.importEvidence.profile, 'none'); assert.equal(result.tasks.captureTime.requirement, null);
});

test('the evidence table records only what real imports showed', () => {
  assert.deepEqual(PHOTO_EXPORT_IMPORT_EVIDENCE['gemini-legacy2019'], { profile: 'imported', missingCaptureTime: 'unconfirmed', missingDirection: 'untested', renamedGml: 'untested', referenceOnly: ['missingCaptureTime'] });
  assert.deepEqual(PHOTO_EXPORT_IMPORT_EVIDENCE.legacy2019, { profile: 'none' });
  assert.deepEqual(PHOTO_EXPORT_IMPORT_EVIDENCE.asbuilt52, { profile: 'none' });
  assert.equal(photoExportReadiness([complete('a')], gemini).levels.importEvidence.recorded.renamedGml, 'untested');
});

// Classification
const classify = (options, requirement) => classifyCaptureTime(photo('a', options), requirement);
test('classifyCaptureTime: accepted, and accepted values too coarse to export', () => {
  const full = classify({ time: accepted('2026-05-12T14:33:02.5+02:00'), metadataEvidence: [exifTime('2026:05:13 01:00:00')] }, 'required');
  assert.equal(full.state, 'accepted'); assert.equal(full.blocking, false); assert.equal(full.accepted.value.iso, '2026-05-12T14:33:02.5+02:00');
  for (const iso of ['2026-05-12', '2026-05-12T14:33']) {
    const result = classify({ time: accepted(iso, manual), metadataEvidence: [exifTime()] }, 'required');
    assert.equal(result.state, 'partial'); assert.equal(result.replacesAccepted, true); assert.equal(result.blocking, true);
    assert.deepEqual(result.adoptableKinds, [], 'evidence cannot be adopted over an accepted value');
  }
});

test('classifyCaptureTime: unaccepted EXIF is adoptable, which is not the same as having no evidence', () => {
  const result = classify({ metadataEvidence: [exifTime()] }, 'recommended');
  assert.equal(result.state, 'adoptable'); assert.deepEqual(result.adoptableKinds, ['exif']); assert.equal(result.sourcesAgree, false);
  assert.equal(result.accepted, null); assert.equal(result.blocking, false);
  assert.equal(result.evidence[0].value.iso, '2026-05-12T14:33:02'); assert.equal(result.evidence[0].kind, 'exif'); assert.equal(result.evidence[0].raw.DateTimeOriginal, '2026:05:12 14:33:02');
  assert.equal(classify({}, 'recommended').state, 'none');
  assert.equal(classify({ metadataEvidence: [exifTime()] }, 'required').blocking, true);
});

test('classifyCaptureTime respects M1 agreement: subseconds and unknown offsets are not conflicts', () => {
  const agreeing = classify({ metadataEvidence: [exifTime('2026:05:12 14:33:02', { SubSecTimeOriginal: '012' }), gmlTime('2026-05-12T14:33:02')] });
  assert.equal(agreeing.state, 'adoptable'); assert.deepEqual(agreeing.adoptableKinds, ['exif', 'gml']); assert.equal(agreeing.sourcesAgree, true);
  const conflict = classify({ metadataEvidence: [exifTime(), gmlTime('2026-05-12T14:33:03')] });
  assert.equal(conflict.state, 'conflict'); assert.equal(conflict.evidence.length, 2); assert.deepEqual(conflict.adoptableKinds, []);
  assert.equal(classify({ metadataEvidence: [exifTime('2026:05:12 14:33:02', { OffsetTimeOriginal: '+01:00' }), gmlTime('2026-05-12T14:33:02+02:00')] }).state, 'conflict');
});

test('classifyCaptureTime: coarse, unusable and pending evidence', () => {
  assert.equal(classify({ metadataEvidence: [gmlTime('2026-05-12T14:33')] }).state, 'partial');
  const unusable = classify({ metadataEvidence: [gmlTime('uncertain')] });
  assert.equal(unusable.state, 'unusable'); assert.equal(unusable.evidence[0].raw, 'uncertain'); assert.equal(unusable.evidence[0].value, null);
  assert.equal(classify({ exifRead: 'pending' }).state, 'pending');
  assert.equal(classify({ exifRead: 'pending', metadataEvidence: [gmlTime('2026-05-12T14:33')] }).state, 'pending', 'EXIF may still supply seconds');
  const early = classify({ exifRead: 'pending', metadataEvidence: [gmlTime('2026-05-12T14:33:02')] });
  assert.equal(early.state, 'adoptable'); assert.equal(early.sourcePending, true);
});

test('capture-time task counts every state once per asset', () => {
  const { counts } = photoExportReadiness([complete('a'), photo('b', { metadataEvidence: [exifTime()] }), photo('c', { metadataEvidence: [exifTime(), gmlTime('2025-01-01T00:00:00')] }),
    photo('d', { metadataEvidence: [gmlTime('2026-05-12')] }), photo('e', { metadataEvidence: [gmlTime('?')] }), photo('f', { exifRead: 'pending' }), photo('g')], { ...gemini, now: NOW }).tasks.captureTime;
  assert.deepEqual(counts, { accepted: 1, adoptable: 1, conflict: 1, partial: 1, unusable: 1, pending: 1, none: 1 });
});

test('available evidence is stated plainly, naming the source', () => {
  const note = (photos, configuration = gemini) => photoExportReadiness(photos, configuration).notes.find((item) => item.code === 'capture-time-in-source')?.message;
  assert.equal(note([photo('a', { metadataEvidence: [exifTime()] }), photo('b', { metadataEvidence: [exifTime(), gmlTime('2026-05-12T14:33:02')] })]), '2 bilder mangler opptakstid, men tiden finnes i EXIF.');
  assert.equal(note([photo('a', { metadataEvidence: [gmlTime('2026-05-12T14:33:02')] })], legacy), '1 bilder mangler opptakstid, men tiden finnes i GML.');
  assert.equal(note([photo('a', { metadataEvidence: [exifTime()] }), photo('b', { metadataEvidence: [gmlTime('2026-05-12T14:33:02')] })]), '2 bilder mangler opptakstid, men tiden finnes i kildene.');
  assert.equal(note([photo('a')]), undefined);
  assert.equal(note([photo('a', { metadataEvidence: [exifTime()], placed: false })]), undefined, 'scope follows the plan');
});

// Direction safeguards
test('unaccepted GML 0° never satisfies a direction requirement, and is reported apart', () => {
  const result = photoExportReadiness([complete('a', { degrees: null, directionEvidence: [gmlDirection('0')] })], gemini);
  assert.equal(result.status, 'blocked'); assert.deepEqual(codes(result.blocking), ['direction-required']);
  assert.equal(result.tasks.direction.counts['zero-review'], 1); assert.equal(result.tasks.direction.counts.accepted, 0);
  assert.equal(result.tasks.direction.items[0].state, 'zero-review');
});

test('direction task separates what can be adopted, reviewed, resolved or only entered', () => {
  const { counts, items } = photoExportReadiness([complete('a'), complete('b', { degrees: null, directionEvidence: [exifDirection(45), gmlDirection('0')] }),
    complete('c', { degrees: null, directionEvidence: [exifDirection(45), gmlDirection('90')] }), complete('d', { degrees: null, directionEvidence: [gmlDirection('12.5')] }),
    complete('e', { degrees: null }), complete('f', { degrees: null, exifRead: 'pending' }), complete('g', { degrees: direction(400) }),
    complete('h', { degrees: null, directionEvidence: exifDirectionEvidence({ GPSImgDirection: 45, GPSImgDirectionRef: 'M' }) })], legacy).tasks.direction;
  assert.deepEqual(counts, { accepted: 1, adoptable: 2, conflict: 1, 'zero-review': 0, unsupported: 1, unusable: 0, invalid: 1, pending: 1, none: 1 });
  assert.deepEqual(items.find((item) => item.occurrenceId === 'b').adoptableKinds, ['exif'], 'a real EXIF heading is adoptable past GML 0°');
  assert.equal(items.find((item) => item.occurrenceId === 'b').zeroNeedsReview, true);
});

test('photographer task follows the profile', () => {
  const name = { value: 'Kari', provenance: { kind: 'exif' } }, source = [{ id: 'exif:photographer', field: 'photographer', kind: 'exif', value: 'Ola' }];
  const photos = [complete('a', { photographer: name }), complete('b', { metadataEvidence: source })];
  assert.deepEqual(photoExportReadiness(photos, legacy).tasks.photographer, { requirement: 'optional', accepted: 1, adoptable: 1 });
  assert.equal(photoExportReadiness(photos, gemini).tasks.photographer.requirement, 'omitted');
  assert(photoExportReadiness(photos, gemini).notes.some((note) => note.code === 'photographer-omitted'));
  assert(!photoExportReadiness(photos, legacy).notes.some((note) => note.code === 'photographer-omitted'));
});

// C. Recommendations
test('capture-time-utc: Gemini and accepted UTC only, explained without calling it local time', () => {
  const utc = complete('a', { time: accepted('2026-05-12T12:33:02Z') });
  const item = recommendation(photoExportReadiness([utc, complete('b')], gemini), 'capture-time-utc');
  assert.equal(item.count, 1); assert.deepEqual(item.assetIds, ['a']);
  assert.equal(item.message, '1 bilder har tid i UTC. Gemini VA får klokkeslettet uten tidssone, altså UTC og ikke lokal tid.');
  assert.equal(recommendation(photoExportReadiness([utc], legacy), 'capture-time-utc'), undefined, 'Legacy keeps the marker');
  assert.equal(recommendation(photoExportReadiness([complete('a', { time: accepted('2026-05-12T14:33:02+00:00') })], gemini), 'capture-time-utc').count, 1);
});

test('an unknown or other offset is never classified as UTC, and unaccepted UTC evidence does not count', () => {
  for (const iso of ['2026-05-12T14:33:02', '2026-05-12T14:33:02+02:00', '2026-05-12T14:33:02-03:30']) {
    assert.equal(recommendation(photoExportReadiness([complete('a', { time: accepted(iso) })], gemini), 'capture-time-utc'), undefined, iso);
  }
  assert.equal(recommendation(photoExportReadiness([photo('a', { degrees: direction(90), metadataEvidence: [gmlTime('2026-05-12T12:33:02Z')] })], gemini), 'capture-time-utc'), undefined);
  assert.equal(recommendation(photoExportReadiness([complete('a', { time: accepted('2026-05-12T12:33Z') })], gemini), 'capture-time-utc'), undefined, 'a minute time is omitted, so no UTC clock is exported');
});

test('capture-time-implausible: boundaries, injected now and no host timezone', () => {
  const flagged = (iso, now = NOW) => Boolean(recommendation(photoExportReadiness([complete('a', { time: accepted(iso) })], { ...gemini, now }), 'capture-time-implausible'));
  assert.equal(flagged('1999-12-31T23:59:59'), true);
  assert.equal(flagged('2000-01-01T00:00:00'), false);
  assert.equal(flagged('1999-12-31'), true);
  assert.equal(flagged('2026-11-05T12:00:00Z'), false, 'exactly now');
  assert.equal(flagged('2026-11-05T12:00:01Z'), true);
  assert.equal(flagged('2026-11-05T13:00:00+01:00'), false, 'the same instant');
  assert.equal(flagged('2026-11-05T13:00:01+01:00'), true);
  assert.equal(flagged('2026-11-05T02:00:01-10:00'), true);
  // Unknown offset: only a time that is in the future everywhere, so a photo taken a moment ago is never flagged.
  assert.equal(flagged('2026-11-06T02:00:00'), false);
  assert.equal(flagged('2026-11-06T02:00:01'), true);
  assert.equal(flagged('2026-11-05'), false);
  assert.equal(flagged('2030-01-01'), true);
  assert.equal(flagged('2026-11-05T12:00:01Z', new Date(NOW + 1000)), false, 'a Date is accepted as now');
  assert.equal(flagged('2030-01-01', null), false, 'without an injected now the future check is skipped, not read from the clock');
  assert.equal(flagged('1999-01-01', null), true);
});

test('capture-time-bulk: repeated bulk values only, counted by provenance and not by equal values', () => {
  const time = '2026-05-12T14:33:02', item = (id, provenance) => complete(id, { time: accepted(time, provenance) });
  const found = (photos) => recommendation(photoExportReadiness(photos, gemini), 'capture-time-bulk');
  assert.equal(found([item('a', bulk), item('b', bulk), item('c', bulk)]).count, 3);
  assert.deepEqual(found([item('a', bulk), item('b', bulk)]).groups, [{ value: time, count: 2 }]);
  assert.equal(found([item('a', bulk)]), undefined, 'one photo repeats nothing');
  assert.equal(found([item('a', { kind: 'exif' }), item('b', { kind: 'exif' })]), undefined, 'independently captured equal values');
  assert.equal(found([item('a', manual), item('b', manual)]), undefined, 'individually entered values');
  assert.equal(found([item('a', bulk), complete('b', { time: accepted('2026-05-12T14:33:03', bulk) })]), undefined, 'different bulk values');
  assert.equal(found([item('a', bulk), item('a2', { kind: 'exif' }), item('b', bulk)]).count, 2);
  assert.equal(found([item('a', { ...bulk }), { ...item('b', bulk), assetId: 'a' }]), undefined, 'one asset counts once');
  assert.equal(found([{ ...item('a', bulk), spatial: { current: null } }, item('b', bulk)]), undefined, 'unplaced assets are out of scope');
});

test('direction-all-zero: at least 5 placed and at least half exactly 0°', () => {
  const set = (zero, other, extra = []) => [...Array.from({ length: zero }, (_, i) => complete(`z${i}`, { degrees: direction(0) })), ...Array.from({ length: other }, (_, i) => complete(`o${i}`)), ...extra];
  const found = (photos, configuration = gemini) => recommendation(photoExportReadiness(photos, configuration), 'direction-all-zero');
  assert.equal(found(set(4, 0)), undefined, '4 placed');
  assert.equal(found(set(5, 0)).count, 5);
  assert.equal(found(set(3, 2)).count, 3, '3 of 5 is over half');
  assert.equal(found(set(2, 3)), undefined, '2 of 5 is under half');
  assert.equal(found(set(3, 3)).count, 3, 'exactly half');
  assert.equal(found(set(3, 4)), undefined, 'just under half');
  assert.equal(found(set(4, 1)).message, '4 bilder peker nøyaktig mot nord. Kontroller at dette stemmer.');
  assert.equal(found(set(3, 1, [complete('u', { degrees: null })])).count, 3, 'unknown direction is placed, and is not a zero');
  assert.equal(found(set(2, 0, [complete('u1', { degrees: null }), complete('u2', { degrees: null }), complete('u3', { degrees: null })])), undefined);
  assert.equal(found(set(4, 0, [complete('p', { degrees: direction(0), placed: false })])), undefined, 'unplaced is out of scope');
  assert.equal(found(set(3, 0, [complete('n1', { degrees: direction(.1) }), complete('n2', { degrees: direction(359.9) }), complete('n3', { degrees: direction(1) })])).count, 3, 'near north is not exactly 0°');
  assert.equal(found(set(4, 0, [complete('g', { degrees: null, directionEvidence: [gmlDirection('0')] }), complete('h', { degrees: null, directionEvidence: [gmlDirection('0')] })])).count, 4, 'unaccepted GML 0° is not counted');
});

test('direction-bulk: repeated bulk directions per occurrence, by provenance', () => {
  const found = (photos) => recommendation(photoExportReadiness(photos, gemini), 'direction-bulk');
  assert.equal(found([complete('a', { degrees: direction(90, bulk) }), complete('b', { degrees: direction(90, bulk) })]).count, 2);
  assert.equal(found([complete('a', { degrees: direction(90, bulk) }), complete('b', { assetId: 'a', degrees: direction(90, bulk) })]).count, 2, 'direction belongs to the occurrence');
  assert.equal(found([complete('a', { degrees: direction(90, bulk) })]), undefined);
  assert.equal(found([complete('a', { degrees: direction(90) }), complete('b', { degrees: direction(90) })]), undefined);
  assert.equal(found([complete('a', { degrees: direction(90, manual) }), complete('b', { degrees: direction(90, manual) })]), undefined);
  assert.equal(found([complete('a', { degrees: direction(90, bulk) }), complete('b', { degrees: direction(91, bulk) })]), undefined);
  assert.equal(found([complete('a', { degrees: direction(0, bulk) }), complete('b', { degrees: direction(0, bulk) })]).count, 2, 'north is a value like any other');
});

test('evidence-pending counts placed assets still being read', () => {
  const result = photoExportReadiness([complete('a', { exifRead: 'pending' }), complete('b', { assetId: 'a', exifRead: 'pending' }), complete('c', { exifRead: 'pending', placed: false }), complete('d')], gemini);
  const item = recommendation(result, 'evidence-pending');
  assert.equal(item.count, 1); assert.equal(item.message, 'Leser fortsatt bildedata for 1 bilder.'); assert.equal(item.label, 'Bildedata leses');
});

test('recommendations never block and never touch accepted values', () => {
  const photos = Array.from({ length: 6 }, (_, i) => complete(`a${i}`, { time: accepted('2026-05-12T12:33:02Z', bulk), degrees: direction(0, bulk) }));
  const result = photoExportReadiness(photos, { ...gemini, now: NOW });
  assert.deepEqual(codes(result.recommendations), ['capture-time-utc', 'capture-time-bulk', 'direction-all-zero', 'direction-bulk']);
  assert.equal(result.status, 'recommendations'); assert.deepEqual(result.blocking, []); assert.equal(result.levels.generation, 'possible');
  assert.equal(photos[0].captureMetadata.captureTime.value.iso, '2026-05-12T12:33:02Z');
});

// D. Purity
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
};

test('purity: synchronous, no mutation, no clock, no identifiers, no file bytes', (t) => {
  const forbidden = (name) => () => { throw new Error(`Readiness must not call ${name}`); };
  t.mock.method(globalThis.crypto, 'randomUUID', forbidden('randomUUID'));
  t.mock.method(Date, 'now', forbidden('Date.now'));
  t.mock.method(Blob.prototype, 'arrayBuffer', forbidden('arrayBuffer'));
  t.mock.method(Blob.prototype, 'text', forbidden('text'));
  t.mock.method(Blob.prototype, 'slice', forbidden('slice'));
  const photos = deepFreeze([complete('a', { file: new File(['original'], 'a.jpg') }), photo('b', { metadataEvidence: [exifTime()], directionEvidence: [gmlDirection('0')] }), photo('c', { placed: false })]);
  const before = JSON.stringify(photos);
  for (const configuration of [gemini, legacy, asbuilt]) {
    const first = photoExportReadiness(photos, { ...configuration, now: NOW });
    assert.equal(typeof first.then, 'undefined');
    assert.deepEqual(photoExportReadiness(photos, { ...configuration, now: NOW }), first, 'same input, same result');
  }
  assert.equal(JSON.stringify(photos), before);
});

test('purity: real session state is untouched, and readiness reads no original', async (t) => {
  const f = await matrixFixture({ layout: 'repeated', time: 'none', direction: 'none' });
  try {
    const { session, layerId } = f, read = t.mock.method(Blob.prototype, 'arrayBuffer');
    const before = session.getSnapshot(), photos = session.getLayerPhotos(layerId);
    photoExportReadiness(photos, { ...gemini, now: NOW });
    assert.strictEqual(session.getSnapshot(), before);
    assert.equal(read.mock.callCount(), 0);
    assert.deepEqual(session.getLayerPhotos(layerId), photos);
  } finally { f.session.clear(); }
});

test('purity: the module holds no clock, hashing, identifiers, file reads or session access', async () => {
  const code = (await readFile(new URL('../src/lib/photos/export/photoExportReadiness.mjs', import.meta.url), 'utf8')).replace(/^\s*\/\/.*$/gm, '');
  for (const banned of [/Date\.now/, /randomUUID/, /digestHex/, /arrayBuffer/, /photoSession/, /adoptSourceEvidence/, /fillMissingPhotoValues/, /setCaptureMetadata/, /\bawait\b/, /\basync\b/]) assert(!banned.test(code), String(banned));
});

test('staged edits are not accepted data: readiness reads what is saved', () => {
  const saved = complete('a', { degrees: null });
  const editing = { ticketId: 't', staged: { a: { direction: 90, position: position.position } } };
  const effective = effectivePhoto(saved, editing);
  assert.equal(effective.direction.current.acceptance, 'staged');
  assert.deepEqual(codes(photoExportReadiness([effective], gemini).blocking), ['direction-required']);
  const unplaced = photo('b', { placed: false, time: accepted('2026-05-12T14:33:02'), degrees: direction(90) });
  const placedInEdit = effectivePhoto(unplaced, { ticketId: 't', staged: { b: { position: position.position } } });
  assert(placedInEdit.spatial.current);
  assert.deepEqual(codes(photoExportReadiness([placedInEdit], gemini).blocking), ['no-placed-photos']);
});
