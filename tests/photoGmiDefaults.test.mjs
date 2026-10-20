import assert from 'node:assert/strict';
import test from 'node:test';
import { planPhotoSourcePositions, photoSourcePositionChoices, photoSourceProposalKinds } from '../src/lib/photos/photoPositioning.mjs';

const position = { crs: 'EPSG:4326', longitude: 10, latitude: 60 };
const source = { id: 'source', kind: 'gmi', fingerprint: 'bytes', associationLedger: { reverseIndexes: { byPhotoId: {} } } };
const occurrence = { key: 'point', sourceId: source.id, sourceFingerprint: source.fingerprint };
const gmi = { id: 'gmi', kind: 'gmi', sourceId: source.id, status: 'viable', position, provenance: occurrence };
const photo = (candidates = [gmi]) => ({ id: 'photo', originalFilename: 'a.jpg', occurrence, preview: {}, spatial: { current: null, candidates, exifRead: { state: 'no-gps' } } });

test('30 distinct unplaced photos have 30 initial occurrence-specific GMI proposals', () => {
  const photos = Array.from({ length: 30 }, (_, index) => ({ ...photo(), id: `photo-${index}` }));
  const plan = planPhotoSourcePositions(photos, [source]);
  assert.equal(Object.values(photoSourcePositionChoices(plan)).filter(Boolean).length, 30);
});

for (const [label, candidate, sources, ownOccurrence] of [
  ['unusable', { ...gmi, status: 'unavailable' }, [source], occurrence],
  ['malformed coordinates', { ...gmi, position: { ...position, latitude: NaN } }, [source], occurrence],
  ['removed source', gmi, [], occurrence],
  ['stale fingerprint', gmi, [{ ...source, fingerprint: 'changed' }], occurrence],
  ['wrong occurrence', gmi, [source], { ...occurrence, key: 'other' }],
  ['missing occurrence', gmi, [source], null],
  ['missing occurrence and candidate provenance', { ...gmi, provenance: null }, [source], null],
]) test(`${label} GMI evidence is neither proposed nor offered as a bulk source`, () => {
  const plan = planPhotoSourcePositions([{ ...photo([candidate]), occurrence: ownOccurrence }], sources);
  assert.equal(plan.rows[0].defaultChoice, '');
  assert.deepEqual(photoSourceProposalKinds(plan.rows), []);
});

test('multiple GMI candidates for one occurrence require review', () => {
  const plan = planPhotoSourcePositions([photo([gmi, { ...gmi, id: 'second' }])], [source]);
  assert.equal(plan.rows[0].options.length, 2);
  assert.equal(plan.rows[0].defaultChoice, '');
});

test('source actions follow only the visible reviewed rows, including one usable option among unavailable rows', () => {
  const exif = { id: 'exif', kind: 'exif', status: 'viable', position };
  const plan = planPhotoSourcePositions([{ ...photo([]), id: 'empty' }, photo([exif])], []);
  assert.deepEqual(photoSourceProposalKinds(plan.rows), ['exif']);
  assert.deepEqual(photoSourceProposalKinds(plan.rows.slice(0, 1)), []);
  assert.deepEqual(photoSourceProposalKinds([]), []);
});

test('refresh preserves an exact choice and empty choices; changed/disappeared evidence requires review', () => {
  const previous = planPhotoSourcePositions([photo()], [source]);
  const choices = photoSourcePositionChoices(previous);
  const same = planPhotoSourcePositions([photo([{ ...gmi }])], [source]);
  assert.deepEqual(photoSourcePositionChoices(same, previous, choices), choices);
  assert.deepEqual(photoSourcePositionChoices(same, previous, { photo: '' }), { photo: '' });
  for (const candidates of [[], [{ ...gmi, position: { ...position, longitude: 11 } }]]) {
    const next = planPhotoSourcePositions([photo(candidates)], [source]);
    assert.deepEqual(photoSourcePositionChoices(next, previous, choices), { photo: '' });
  }
});

test('confirming new GMI seeds its proposal over an earlier automatic EXIF default, preserving explicit choices', () => {
  const exif = { id: 'exif', kind: 'exif', status: 'viable', position };
  const previous = planPhotoSourcePositions([photo([exif])], []);
  const next = planPhotoSourcePositions([photo([exif, gmi])], [source]);
  const choices = photoSourcePositionChoices(previous);
  assert.deepEqual(choices, { photo: 'exif' });
  assert.deepEqual(photoSourcePositionChoices(next, previous, choices, null, { newGmiSourceId: source.id }), { photo: 'gmi' });
  for (const choice of ['exif', '']) assert.deepEqual(photoSourcePositionChoices(next, previous, { photo: choice }, null,
    { newGmiSourceId: source.id, editedIds: new Set(['photo']) }), { photo: choice });
});
