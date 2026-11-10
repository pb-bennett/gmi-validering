import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { captureTimeFields, composeCaptureTime, CAPTURE_TIMEZONE_OPTIONS, hasPlaceholderSeconds } from '../src/lib/photos/photoCaptureTimeInput.mjs';
import { normalizeCaptureTime } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { formatPhotoCaptureTime, formatPhotoCoordinates, formatPhotoMoveDistance, photoCaptureTimeStatus, photoDirectionSourceLabel, photoMetadataConflict,
  photoMetadataSourceLabel, photoPlacementBasisLabel } from '../src/lib/photos/photoPresentation.mjs';
import { resolvePhotoLocate } from '../src/lib/photos/photoMapFeatures.mjs';

test('capture time is shown exactly as recorded, with precision and unknown-timezone notes and no host conversion', () => {
  assert.deepEqual(formatPhotoCaptureTime(normalizeCaptureTime('2026-05-12T14:33:02')), { text: '12.05.2026 14:33:02', notes: ['tidssone ukjent'] });
  assert.deepEqual(formatPhotoCaptureTime(normalizeCaptureTime('2026-05-12T14:33:02+02:00')), { text: '12.05.2026 14:33:02 (+02:00)', notes: [] });
  assert.deepEqual(formatPhotoCaptureTime(normalizeCaptureTime('2026-05-12T23:59:59Z')), { text: '12.05.2026 23:59:59 UTC', notes: [] });
  assert.deepEqual(formatPhotoCaptureTime(normalizeCaptureTime('2026-05-12T14:33')), { text: '12.05.2026 14:33', notes: ['uten sekunder', 'tidssone ukjent'] });
  assert.deepEqual(formatPhotoCaptureTime(normalizeCaptureTime('2026-05-12')), { text: '12.05.2026', notes: ['bare dato'] });
  assert.equal(formatPhotoCaptureTime(normalizeCaptureTime('2026-09-17T10:30:02.125+02:00')).text, '17.09.2026 10:30:02,125 (+02:00)');
  assert.equal(formatPhotoCaptureTime(null), null);
});

test('the capture-time chip separates accepted, available in a source and unknown', () => {
  const evidence = (value) => ({ field: 'captureTime', value: value ? normalizeCaptureTime(value) : null });
  const accepted = { value: normalizeCaptureTime('2026-05-12T14:33:02'), provenance: { kind: 'manual' } };
  assert.equal(photoCaptureTimeStatus({ captureMetadata: { captureTime: accepted }, metadataEvidence: [evidence('2026-05-12T14:33:03')] }), 'Opptakstid kjent');
  assert.equal(photoCaptureTimeStatus({ captureMetadata: { captureTime: null }, metadataEvidence: [evidence('2026-05-12T14:33:02')] }), 'Opptakstid i kilde');
  assert.equal(photoCaptureTimeStatus({ captureMetadata: { captureTime: null }, metadataEvidence: [evidence(null)] }), 'Uten opptakstid');
  assert.equal(photoCaptureTimeStatus({ captureMetadata: { captureTime: null }, metadataEvidence: [{ field: 'photographer', value: 'Kari' }] }), 'Uten opptakstid');
  assert.equal(photoCaptureTimeStatus({ captureMetadata: { captureTime: null }, metadataEvidence: [] }), 'Uten opptakstid');
  assert.equal(photoCaptureTimeStatus({}), 'Uten opptakstid');
});

test('a minute-precision value has placeholder seconds until the time field changes', () => {
  const minute = normalizeCaptureTime('2026-05-12T14:33');
  const fields = captureTimeFields(minute.iso);
  assert.equal(hasPlaceholderSeconds(minute, fields), true);
  assert.equal(hasPlaceholderSeconds(minute, { ...fields, date: '2026-05-13', zone: '+02:00' }), true, 'other fields do not supply seconds');
  assert.equal(hasPlaceholderSeconds(minute, { ...fields, time: '14:33:41' }), false);
  assert.equal(hasPlaceholderSeconds(minute, { ...fields, time: '' }), false, 'clearing the time saves a date and invents nothing');
  for (const iso of ['2026-05-12', '2026-05-12T14:33:00', '2026-05-12T14:33:02.5']) {
    const value = normalizeCaptureTime(iso);
    assert.equal(hasPlaceholderSeconds(value, captureTimeFields(iso)), false, iso);
  }
  assert.equal(hasPlaceholderSeconds(undefined, fields), false);
});

test('the import preview uses the shared capture-time formatter, with no host-date conversion', async () => {
  const preview = await readFile(new URL('../src/components/photos/PhotoImportPreview.js', import.meta.url), 'utf8');
  assert(preview.includes('formatPhotoCaptureTime(item.value)'));
  assert(!preview.includes('toLocaleString(\'nb-NO\', { timeZone'));
});

test('native date/time/timezone fields round-trip; Unknown is the default and offsets are never guessed', () => {
  assert.equal(CAPTURE_TIMEZONE_OPTIONS[0].value, '');
  assert.equal(CAPTURE_TIMEZONE_OPTIONS[0].label, 'Ukjent tidssone');
  assert.deepEqual(captureTimeFields(null), { date: '', time: '', zone: '', customOffset: '' });
  assert.deepEqual(captureTimeFields('2026-05-12T14:33:02'), { date: '2026-05-12', time: '14:33:02', zone: '', customOffset: '' });
  assert.deepEqual(captureTimeFields('2026-05-12T14:33+01:00'), { date: '2026-05-12', time: '14:33:00', zone: '+01:00', customOffset: '' });
  assert.deepEqual(captureTimeFields('2026-05-12T14:33:02Z'), { date: '2026-05-12', time: '14:33:02', zone: 'Z', customOffset: '' });
  assert.deepEqual(captureTimeFields('2026-05-12T14:33:02-03:30'), { date: '2026-05-12', time: '14:33:02', zone: 'other', customOffset: '-03:30' });
  assert.equal(composeCaptureTime({ date: '2026-05-12', time: '14:33:02' }).value.iso, '2026-05-12T14:33:02');
  assert.equal(composeCaptureTime({ date: '2026-05-12', time: '14:33' }).value.iso, '2026-05-12T14:33:00', 'step=1 always means seconds');
  assert.equal(composeCaptureTime({ date: '2026-05-12', time: '14:33:02', zone: '+02:00' }).value.iso, '2026-05-12T14:33:02+02:00');
  assert.equal(composeCaptureTime({ date: '2026-05-12', time: '14:33:02', zone: 'other', customOffset: ' +05:45 ' }).value.iso, '2026-05-12T14:33:02+05:45');
  assert.equal(composeCaptureTime({ date: '2026-05-12' }).value.precision, 'date');
  assert.equal(composeCaptureTime({ date: '' }).error, 'missing-date');
  assert.equal(composeCaptureTime({ date: '2026-05-12', time: '14:33:02', zone: 'other', customOffset: '0530' }).error, 'invalid-offset');
  assert.equal(composeCaptureTime({ date: '2026-05-12', zone: 'Z' }).error, 'offset-without-time');
  assert.equal(composeCaptureTime({ date: '2026-02-30', time: '10:00:00' }).error, 'invalid-value');
});

test('provenance labels for position, direction and capture metadata', () => {
  assert.equal(photoPlacementBasisLabel(null), null);
  assert.equal(photoPlacementBasisLabel({ acceptance: 'staged', basis: { kind: 'manual' } }), 'Endret – ikke lagret');
  assert.equal(photoPlacementBasisLabel({ acceptance: 'manual', basis: { kind: 'manual' } }), 'Manuelt plassert');
  assert.equal(photoPlacementBasisLabel({ acceptance: 'explicit-candidate', basis: { kind: 'candidate' } }), 'Valgt fra kildeposisjon');
  assert.equal(photoDirectionSourceLabel({ acceptance: 'manual', basis: { kind: 'manual' } }), 'Manuell');
  assert.equal(photoDirectionSourceLabel({ acceptance: 'manual', basis: { kind: 'manual', mode: 'bulk' } }), 'Manuell (samme verdi for flere)');
  assert.equal(photoDirectionSourceLabel({ acceptance: 'source', basis: { kind: 'exif' } }), 'EXIF bilderetning (sann nord)');
  assert.equal(photoDirectionSourceLabel({ acceptance: 'staged', basis: { kind: 'manual' } }), 'Endret – ikke lagret');
  assert.equal(photoMetadataSourceLabel('captureTime', { kind: 'exif' }), 'EXIF DateTimeOriginal');
  assert.equal(photoMetadataSourceLabel('photographer', { kind: 'exif' }), 'EXIF Artist');
  assert.equal(photoMetadataSourceLabel('captureTime', { kind: 'gml', sourceFilename: 'a.gml' }), 'GML · a.gml');
  assert.equal(photoMetadataSourceLabel('captureTime', { kind: 'manual', mode: 'bulk' }), 'Manuell (samme verdi for flere)');
  assert.equal(formatPhotoCoordinates({ latitude: 59.2250296, longitude: -10.4354292 }), '59.2250296° N, 10.4354292° V (WGS84)');
  assert.equal(formatPhotoCoordinates(null), 'Ingen posisjon');
  assert.equal(formatPhotoMoveDistance(27.34), 'ca. 27,3 m');
  const evidence = (value) => ({ field: 'captureTime', value: value ? normalizeCaptureTime(value) : null });
  assert.equal(photoMetadataConflict({ metadataEvidence: [evidence('2026-05-12T14:33:02'), evidence('2026-05-12T14:33:02')] }, 'captureTime'), false);
  assert.equal(photoMetadataConflict({ metadataEvidence: [evidence('2026-05-12T14:33:02'), evidence('2026-05-13T08:00:00'), evidence(null)] }, 'captureTime'), true);
});

test('locate in Edit mode uses the staged (displayed) position; candidates and membership checks are unchanged', () => {
  const position = { crs: 'EPSG:4326', longitude: 10, latitude: 59 }, staged = { ...position, longitude: 10.5 };
  const session = { getLayer: () => ({ photoIds: ['p'] }), getPhoto: () => ({ spatial: { current: { position }, candidates: [] } }) };
  assert.strictEqual(resolvePhotoLocate(session, { kind: 'photo', layerId: 'l', photoId: 'p', position: staged }), staged);
  assert.strictEqual(resolvePhotoLocate(session, { kind: 'photo', layerId: 'l', photoId: 'p' }), position);
  assert.equal(resolvePhotoLocate(session, { kind: 'photo', layerId: 'l', photoId: 'other', position: staged }), null);
  assert.strictEqual(resolvePhotoLocate(session, { kind: 'photo', layerId: 'l', photoId: 'p', position: { latitude: 99 } }), position, 'an invalid override falls back');
});

test('inspector is read-only by construction; metadata writes live only in the focused dialog', async () => {
  const read = (name) => readFile(new URL(`../src/components/photos/${name}`, import.meta.url), 'utf8');
  const [inspector, dialog, tools] = await Promise.all([read('PhotoWorkspaceInspector.js'), read('PhotoCaptureMetadataDialog.js'), read('PhotoWorkspaceToolsMenu.js')]);
  assert.doesNotMatch(inspector, /setCaptureMetadata|adoptSourceEvidence|applyPhotoEdits|acceptCandidates|<input|<select|<textarea/);
  assert.equal((inspector.match(/Rediger opptaksdata…/g) || []).length, 1);
  assert.match(dialog, /photoSession\.setCaptureMetadata\(/);
  assert.doesNotMatch(dialog, /applyPhotoEdits|beginPhotoEdits/, 'capture metadata is never part of the Edit transaction');
  const labels = [...tools.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['Legg til bilder…', 'Juster plassering og retning', 'Koble og posisjoner bilder…', 'Kilder og koblinger', 'Fullfør opplysninger…', 'Eksporter…', 'Velg samlet levering', 'Fjern bilder fra laget…']);
  // M8: the one write the inspector embeds is the per-occurrence delivery choice. It calls only the two explicit
  // delivery actions; capture metadata, positions and directions are still never written from the inspector.
  const delivery = await read('PhotoDeliveryControls.js');
  assert.match(inspector, /<PhotoDeliveryControls /);
  const calls = [...delivery.matchAll(/photoSession\.(\w+)\(/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(calls)].sort(), ['setCombinedDeliveryInclusion', 'setDeliveryIntent']);
  assert.doesNotMatch(delivery, /setCaptureMetadata|adoptSourceEvidence|applyPhotoEdits|acceptCandidates|fillMissingPhotoValues|removeLayerPhotos/);
  assert(!labels.some((label) => /opptaksdata/i.test(label)), 'photo-specific actions stay out of Verktøy');
  assert.match(tools, /'Fullfør opplysninger…'/);
});
