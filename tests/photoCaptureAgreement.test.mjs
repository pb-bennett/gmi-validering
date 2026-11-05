import assert from 'node:assert/strict';
import test from 'node:test';
import { allCaptureTimesAgree, captureTimesAgree, normalizeCaptureTime } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { evidenceEligibility, planEvidenceAdoption } from '../src/lib/photos/photoEvidenceAdoption.mjs';
import { photoMetadataConflict } from '../src/lib/photos/photoPresentation.mjs';
import { exifCaptureEvidence } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { evidenceSession, settleExif } from './helpers/photoEvidenceFixtures.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';

const value = (iso) => { const result = normalizeCaptureTime(iso); assert(result, iso); return result; };
const agree = (a, b) => captureTimesAgree(value(a), value(b));

for (const [a, b, expected, reason] of [
  ['2026-05-12T14:33:02.012', '2026-05-12T14:33:02', true, 'subseconds against whole seconds (corpus case)'],
  ['2026-05-12T14:33:02.000', '2026-05-12T14:33:02', true, 'zero fraction'],
  ['2026-05-12T14:33:02.012', '2026-05-12T14:33:02.5', true, 'subseconds are ignored, the approved comparison stops at whole seconds'],
  ['2026-05-12T14:33:02+02:00', '2026-05-12T14:33:02', true, 'an offset adds information'],
  ['2026-05-12T14:33:02Z', '2026-05-12T14:33:02', true, 'an unknown offset does not contradict UTC'],
  ['2026-05-12T14:33:02', '2026-05-12', true, 'date-only is less precise, not contradictory'],
  ['2026-05-12T14:33:02', '2026-05-12T14:33', true, 'minute precision is less precise, not contradictory'],
  ['2026-05-12T14:33+02:00', '2026-05-12T14:33:02.5+02:00', true, 'shared precision with equal offsets'],
  ['2026-05-12T14:33:02Z', '2026-05-12T14:33:02+00:00', true, 'two spellings of the same offset'],
  ['2026-05-12T14:33:02', '2026-05-12T14:33:03', false, 'no tolerance'],
  ['2026-05-12T14:33:59', '2026-05-12T14:34', false, 'a different minute'],
  ['2026-05-12', '2026-05-13T00:30:00', false, 'a different date'],
  ['2026-05-12T12:33:02Z', '2026-05-12T14:33:02+02:00', false, 'same instant, but the exported clocks differ'],
  ['2026-05-12T14:33:02+01:00', '2026-05-12T14:33:02+02:00', false, 'known offsets differ'],
  ['2026-05-12T14:33:02Z', '2026-05-12T14:33:02+02:00', false, 'UTC is a known offset'],
  ['2026-05-12T14:33+01:00', '2026-05-12T14:33:02+02:00', false, 'known offsets differ at minute precision'],
]) test(`captureTimesAgree: ${a} and ${b}: ${reason}`, () => {
  assert.equal(agree(a, b), expected);
  assert.equal(agree(b, a), expected, 'agreement is symmetric');
});

test('every pair must agree, because agreement is not transitive', () => {
  const all = (...items) => allCaptureTimesAgree(items.map(value));
  const unknown = '2026-05-12T14:33:02';
  assert(agree(unknown, `${unknown}+01:00`) && agree(unknown, `${unknown}+02:00`));
  assert.equal(all(unknown, `${unknown}+01:00`, `${unknown}+02:00`), false);
  assert(agree('2026-05-12T14:33', '2026-05-12T14:33:02') && agree('2026-05-12T14:33', '2026-05-12T14:33:03'));
  assert.equal(all('2026-05-12T14:33', '2026-05-12T14:33:02', '2026-05-12T14:33:03'), false);
  assert.equal(all('2026-05-12', '2026-05-12T14:33', '2026-05-12T14:33:02.5', '2026-05-12T14:33:02+02:00'), true);
  assert.equal(all(), true); assert.equal(all(unknown), true);
});

const evidence = (kind, iso) => ({ id: `${kind}:${iso}`, field: 'captureTime', kind, value: iso ? value(iso) : null });
const photo = (...items) => ({ id: 'p', assetId: 'a', captureMetadata: { captureTime: null }, metadataEvidence: items });

test('adoption and the inspector use one definition of conflict across the whole grid', () => {
  const times = ['2026-05-12', '2026-05-12T14:33', '2026-05-12T14:33:02', '2026-05-12T14:33:02.000', '2026-05-12T14:33:02.012', '2026-05-12T14:33:03',
    '2026-05-12T14:33:02Z', '2026-05-12T14:33:02+00:00', '2026-05-12T14:33:02+01:00', '2026-05-12T14:33:02+02:00', '2026-05-12T12:33:02Z', '2026-05-13'];
  for (const a of times) for (const b of times) for (const c of [null, ...times]) {
    const subject = photo(evidence('exif', a), evidence('gml', b), ...(c ? [evidence('gml', c)] : []));
    for (const kind of ['exif', 'gml']) assert.equal(evidenceEligibility(subject, 'captureTime', kind).status === 'conflicting', photoMetadataConflict(subject, 'captureTime'), `${a} ${b} ${c}`);
  }
});

test('unusable evidence never creates or hides a conflict', () => {
  const subject = photo(evidence('exif', '2026-05-12T14:33:02.5'), evidence('gml', null));
  assert.equal(photoMetadataConflict(subject, 'captureTime'), false);
  assert.equal(evidenceEligibility(subject, 'captureTime', 'exif').status, 'eligible');
  assert.equal(evidenceEligibility(subject, 'captureTime', 'gml').status, 'unusable');
});

test('photographer conflicts keep exact comparison', () => {
  const name = (kind, text) => ({ id: kind, field: 'photographer', kind, value: text });
  assert.equal(photoMetadataConflict({ metadataEvidence: [name('a', 'Kari'), name('b', 'Kari')] }, 'photographer'), false);
  assert.equal(photoMetadataConflict({ metadataEvidence: [name('a', 'Kari'), name('b', 'Ola')] }, 'photographer'), true);
});

test('mixed precision: the requested source must carry seconds itself, and the coarser source is never upgraded', () => {
  const minuteGml = photo(evidence('exif', '2026-05-12T14:33:02.5'), evidence('gml', '2026-05-12T14:33'));
  const exif = evidenceEligibility(minuteGml, 'captureTime', 'exif');
  assert.equal(exif.status, 'eligible'); assert.equal(exif.evidence.value.iso, '2026-05-12T14:33:02.5');
  assert.equal(evidenceEligibility(minuteGml, 'captureTime', 'gml').status, 'insufficientPrecision');
  const dateExif = photo(evidence('exif', '2026-05-12'), evidence('gml', '2026-05-12T14:33:02'));
  assert.equal(evidenceEligibility(dateExif, 'captureTime', 'exif').status, 'insufficientPrecision');
  assert.equal(evidenceEligibility(dateExif, 'captureTime', 'gml').evidence.value.iso, '2026-05-12T14:33:02');
});

test('several agreeing sources of the requested kind offer the one with seconds', () => {
  const subject = photo(evidence('gml', '2026-05-12T14:33'), evidence('gml', '2026-05-12T14:33:02'));
  assert.equal(evidenceEligibility(subject, 'captureTime', 'gml').evidence.value.iso, '2026-05-12T14:33:02');
});

test('agreement never moves information between sources: the requested value is used exactly', () => {
  const subject = photo(evidence('exif', '2026-05-12T14:33:02.012'), evidence('gml', '2026-05-12T14:33:02+02:00'));
  const exif = evidenceEligibility(subject, 'captureTime', 'exif');
  assert.equal(exif.evidence.value.iso, '2026-05-12T14:33:02.012');
  assert.equal(exif.evidence.value.timezoneKnown, false); assert.equal(exif.evidence.value.offset, null);
  assert.equal(evidenceEligibility(subject, 'captureTime', 'gml').evidence.value.iso, '2026-05-12T14:33:02+02:00');
  assert.deepEqual(exif.agreeingEvidence.map((item) => item.kind), ['exif', 'gml']);
});

test('an accepted time stays accepted whatever the sources say', () => {
  const accepted = { value: value('2026-05-12T14:33:02'), provenance: { kind: 'manual' } };
  const subject = { ...photo(evidence('exif', '2026-05-12T14:33:03'), evidence('gml', '2026-05-12T14:33:04')), captureMetadata: { captureTime: accepted } };
  assert.equal(evidenceEligibility(subject, 'captureTime').status, 'alreadyAccepted');
  assert.equal(planEvidenceAdoption([subject], 'captureTime').counts.alreadyAccepted, 1);
  assert.equal(photoMetadataConflict(subject, 'captureTime'), true, 'the sources still disagree, and the inspector keeps saying so');
});

const jpeg = (name, options) => new File([gpsJpeg({ noLocation: true, captureTime: '2026:05:12 14:33:02', ...options })], name, { type: 'image/jpeg' });
const sourceWith = (entries) => async () => ({ entries: entries.map(([fotolink, photographedAtText]) => ({ id: fotolink, status: 'invalid', position: null, raw: { fotolink, photographedAtText } })) });

async function attached(session, photos) {
  session.importFiles(photos);
  const layer = session.createLayer();
  await settleExif(session, layer.id);
  assert(await session.stageLayerSource(layer.id, new File(['source'], 'source.gml')));
  assert(session.applyLayerSource(layer.id));
  return layer.id;
}

test('session: same-second EXIF and GML adopt from either source, with both provenances kept', async () => {
  for (const [kind, iso] of [['exif', '2026-05-12T14:33:02.012'], ['gml', '2026-05-12T14:33:02']]) {
    const session = evidenceSession({ parseGml: sourceWith([['a.jpg', '2026-05-12T14:33:02']]) });
    try {
      const layerId = await attached(session, [jpeg('a.jpg', { subsecond: '012' })]);
      assert.equal(photoMetadataConflict(session.getLayerPhotos(layerId)[0], 'captureTime'), false);
      const { counts } = session.adoptSourceEvidence(layerId, 'captureTime', kind);
      assert.equal(counts.adopted, 1); assert.equal(counts.conflicting, 0);
      const accepted = session.getLayerPhotos(layerId)[0].captureMetadata.captureTime;
      assert.equal(accepted.value.iso, iso); assert.equal(accepted.provenance.kind, kind);
      assert.deepEqual(accepted.provenance.evidence.map((item) => item.kind).sort(), ['exif', 'gml']);
    } finally { session.clear(); }
  }
});

test('session: genuine differences stay conflicts and nothing is adopted', async () => {
  for (const [tags, gml] of [
    [{}, '2026-05-12T14:33:03'],
    [{ offsetTime: '+01:00' }, '2026-05-12T14:33:02+02:00'],
    [{ offsetTime: '+02:00' }, '2026-05-12T12:33:02Z'],
  ]) {
    const session = evidenceSession({ parseGml: sourceWith([['a.jpg', gml]]) });
    try {
      const layerId = await attached(session, [jpeg('a.jpg', tags)]);
      for (const kind of ['exif', 'gml']) {
        const { counts } = session.adoptSourceEvidence(layerId, 'captureTime', kind);
        assert.equal(counts.conflicting, 1); assert.equal(counts.adopted, 0);
      }
      const [live] = session.getLayerPhotos(layerId);
      assert.equal(live.captureMetadata.captureTime, null);
      assert.equal(photoMetadataConflict(live, 'captureTime'), true);
    } finally { session.clear(); }
  }
});

test('session: an unknown offset on one side does not block, and the offset is not copied across', async () => {
  const session = evidenceSession({ parseGml: sourceWith([['a.jpg', '2026-05-12T14:33:02']]) });
  try {
    const layerId = await attached(session, [jpeg('a.jpg', { offsetTime: '+02:00' })]);
    assert.equal(session.adoptSourceEvidence(layerId, 'captureTime', 'gml').counts.adopted, 1);
    const { value: accepted } = session.getLayerPhotos(layerId)[0].captureMetadata.captureTime;
    assert.equal(accepted.iso, '2026-05-12T14:33:02'); assert.equal(accepted.timezoneKnown, false);
  } finally { session.clear(); }
});

test('session: a malformed supplementary tag no longer loses the clock, and it agrees with GML to the second', async () => {
  const tags = { DateTimeOriginal: '2026:05:12 14:33:02', OffsetTimeOriginal: '  :  ', SubSecTimeOriginal: 'abc' };
  const session = evidenceSession({ parseGml: sourceWith([['a.jpg', '2026-05-12T14:33:02']]),
    extractGps: async () => ({ state: 'no-gps', errorCode: null, candidate: null, metadataEvidence: exifCaptureEvidence(tags) }) });
  try {
    const layerId = await attached(session, [jpeg('a.jpg')]);
    assert.equal(session.adoptSourceEvidence(layerId, 'captureTime', 'exif').counts.adopted, 1);
    const accepted = session.getLayerPhotos(layerId)[0].captureMetadata.captureTime;
    assert.equal(accepted.value.iso, '2026-05-12T14:33:02'); assert.equal(accepted.value.precision, 'second');
    assert.equal(accepted.value.timezoneKnown, false);
    assert.deepEqual(accepted.provenance.raw, tags);
  } finally { session.clear(); }
});
