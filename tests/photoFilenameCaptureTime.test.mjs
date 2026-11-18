import test from 'node:test';
import assert from 'node:assert/strict';
import { FILENAME_CAPTURE_PATTERNS, filenameCaptureTimeWrite, parseFilenameCaptureTime, planFilenameCaptureSuggestions, selectedFilenameCaptureWrites } from '../src/lib/photos/photoFilenameCaptureTime.mjs';
import { contractorFilenameTimes } from './helpers/photoContractorFilenameFixtures.mjs';

const today = '2026-11-17';
const parse = (name) => parseFilenameCaptureTime(name, { today });

test('every approved pattern parses its examples with exact precision and no offset', () => {
  const expected = { second: '2026-10-14T14:33:02', minute: '2026-10-14T14:33', date: '2026-10-14' };
  for (const pattern of FILENAME_CAPTURE_PATTERNS) for (const example of pattern.examples) {
    const result = parse(`${example}.jpg`);
    assert(result, example);
    assert.equal(result.pattern, pattern.id, example);
    assert.equal(result.precision, pattern.precision, example);
    assert.equal(result.value.iso, expected[pattern.precision], example);
    assert.equal(result.value.offset, null); assert.equal(result.value.timezoneKnown, false);
    assert.equal(result.raw, `${example}.jpg`);
  }
});

test('date-only and minute values never gain midnight, seconds or a zone', () => {
  const date = parse('KUM12_20261014.JPG');
  assert.deepEqual({ ...date.value }, { iso: '2026-10-14', precision: 'date', timezoneKnown: false, offset: null });
  assert(!date.value.iso.includes('T'));
  const minute = parse('20261014_1433.jpg');
  assert.equal(minute.value.iso, '2026-10-14T14:33'); assert.equal(minute.value.precision, 'minute');
  assert.equal(parse('14.10.2026_1433.jpg').value.iso, '2026-10-14T14:33');
  assert.equal(parse('20261014T143302.jpg').value.iso, '2026-10-14T14:33:02');
  assert.equal(parse('20261014_143302_1.jpg').token, '20261014_143302');
});

test('only a single two-digit sequence suffix after a compact minute changes the pattern', () => {
  const sequence = parse('IMG_20261014_1433-01.jpg');
  assert.equal(sequence.pattern, 'ymd-hm-compact-seq');
  assert.equal(sequence.token, '20261014_1433');
  assert.equal(sequence.template, 'IMG_20261014_####-01.jpg');
  for (const name of ['20261014_1433_011.jpg', '20261014_1433_01_02.jpg']) {
    assert.equal(parse(name).pattern, 'ymd-hm-compact', name);
    assert.equal(parse(name).value.iso, '2026-10-14T14:33', name);
  }
  assert.equal(parse('14.10.2026_1433_01.jpg').pattern, 'dmy-hm');
  assert.equal(parse('20261014_143302_01.jpg').pattern, 'ymd-hms-compact');
  assert.equal(parse('20261014_14-33_01.jpg').pattern, 'ymd-compact');
  assert.equal(parse('20261014_2026_01_02.jpg'), null, 'an overlapping supported year still triggers the conflict check');
});

test('boundaries: digit runs, non-adjacent times and conflicting dates give nothing extra', () => {
  assert.equal(parse('KUM12320261014.jpg'), null);
  assert.equal(parse('202610141433.jpg'), null, '12-digit run');
  assert.equal(parse('2026101414330.jpg'), null);
  // A time elsewhere in the name never becomes the capture time.
  assert.equal(parse('20261014_KUM_143302.jpg').value.iso, '2026-10-14');
  assert.equal(parse('20261014__143302.jpg').value.iso, '2026-10-14');
  assert.equal(parse('20261014_1433021.jpg').value.iso, '2026-10-14');
  assert.equal(parse('20261014_20261015.jpg'), null);
  assert.equal(parse('20261014_KUM_2026-10-14.jpg').value.iso, '2026-10-14', 'identical repeats are allowed');
  assert.equal(parse('20261014_143302_20261014_143303.jpg'), null, 'conflicting times');
  // Separated times must use one separator throughout.
  assert.equal(parse('2026-10-14_14-33.02.jpg').value.precision, 'date');
  assert.equal(parse('folder/20261014.jpg').raw, '20261014.jpg');
  assert.equal(parse('2026101412.jpg'), null);
});

test('calendar, clock and plausibility validation are strict', () => {
  for (const name of ['20250229.jpg', '20261301.jpg', '20261100.jpg', '20260431.jpg', '30.02.2026.jpg',
    '20261014_2400.jpg', '20261014_2360.jpg', '20261014_143360.jpg', '19991231.jpg', '21000101.jpg',
    '20261119.jpg', '2027-01-01_12-00-00.jpg']) assert.equal(parse(name), null, name);
  assert.equal(parse('20240229.jpg').value.iso, '2024-02-29');
  assert.equal(parse('20000229.jpg').value.iso, '2000-02-29');
  assert.equal(parse('20261118.jpg').value.iso, '2026-11-18', 'import day plus one');
  assert.equal(parse('20261014_2359.jpg').value.iso, '2026-10-14T23:59');
  assert.equal(parseFilenameCaptureTime('20991231.jpg').value.iso, '2099-12-31', 'without today only the year range applies');
});

test('ambiguous and non-capture names are rejected', () => {
  for (const name of ['261014_1433.jpg', '14-10-2026.jpg', '10-14-2026.jpg', '14_10_2026.jpg', 'PXL_20261014_143302123.jpg',
    'pxl_20261014_143302.jpg', 'IMG-20261014-WA0001.jpg', 'IMG_1234.JPG', 'DSC01234.jpg', 'KUM12.jpg', '', null])
    assert.equal(parseFilenameCaptureTime(name, { today }), null, String(name));
});

const asset = (id, originalFilename, extra = {}) => ({ id, originalFilename, captureMetadata: { captureTime: null, photographer: null },
  metadataEvidence: [], spatial: { exifRead: { state: 'ready' } }, ...extra });

test('contractor filename suggestions preserve the same minute alone and in a batch', () => {
  const photos = contractorFilenameTimes.map(([name]) => asset(name, name));
  const batch = planFilenameCaptureSuggestions(photos, { today });
  assert.equal(batch.complete.length, 12);
  assert.deepEqual(batch.dateOnly, []);
  for (const [index, [filename, iso]] of contractorFilenameTimes.entries()) {
    const single = planFilenameCaptureSuggestions([photos[index]], { today });
    assert.deepEqual(single.dateOnly, []);
    assert.deepEqual(single.complete, [batch.complete[index]]);
    const token = filename.split('_').slice(1, 3).join('_');
    assert.deepEqual(batch.complete[index], {
      assetId: filename, filename, pattern: 'ymd-hm-compact-seq', token,
      value: { iso, precision: 'minute', timezoneKnown: false, offset: null },
    });
  }
});

test('planner offers only photos without usable EXIF, draft GML, accepted or removed time', () => {
  const exif = (value) => [{ id: 'exif:captureTime', field: 'captureTime', kind: 'exif', value }];
  const plan = planFilenameCaptureSuggestions([
    asset('a', '20261014_143302.jpg'),
    asset('b', '20261014.jpg'),
    asset('c', '20261014_1433.jpg', { metadataEvidence: exif({ iso: '2026-10-14', precision: 'date' }) }),
    asset('d', '20261014_1433.jpg', { metadataEvidence: exif(null) }),
    asset('e', '20261014.jpg'),
    asset('f', '20261014.jpg', { captureMetadata: { captureTime: { value: { iso: '2026-10-14' } } } }),
    asset('g', '20261014.jpg', { captureMetadata: { captureTime: null, captureTimeCleared: true } }),
    asset('h', 'IMG_1234.jpg'),
    asset('i', '20261014.jpg', { spatial: { exifRead: { state: 'pending' } } }),
    asset('j', 'IMG_9.jpg', { spatial: { exifRead: { state: 'pending' } } }),
    asset('a', '20261014_143302.jpg'),
  ], { today, draftGmlEvidenceByAsset: new Map([['e', [{ field: 'captureTime', kind: 'gml', value: { iso: '2026-10-14', precision: 'date' } }]]]) });
  assert.deepEqual(plan.complete.map((item) => item.assetId), ['a', 'd']);
  assert.deepEqual(plan.dateOnly.map((item) => item.assetId), ['b']);
  assert.equal(plan.missing, 4); assert.equal(plan.pending, 1);
  assert.deepEqual(Object.keys(plan.complete[0]).sort(), ['assetId', 'filename', 'pattern', 'token', 'value']);
});

test('sequence-counter guard downgrades consecutive HHmm suffixes to the date', () => {
  const names = ['20261014_0001.jpg', '20261014_0002.jpg', '20261014_0003.jpg', '20261014_1433.jpg', '20261015_0001.jpg', '20261015_0002.jpg'];
  const plan = planFilenameCaptureSuggestions(names.map((name, index) => asset(String(index), name)), { today });
  assert.deepEqual(plan.dateOnly.map((item) => [item.filename, item.value.iso, item.pattern, item.token, item.downgraded]), [
    ['20261014_0001.jpg', '2026-10-14', 'ymd-compact', '20261014', 'sequence-counter'],
    ['20261014_0002.jpg', '2026-10-14', 'ymd-compact', '20261014', 'sequence-counter'],
    ['20261014_0003.jpg', '2026-10-14', 'ymd-compact', '20261014', 'sequence-counter'],
    ['20261014_1433.jpg', '2026-10-14', 'ymd-compact', '20261014', 'sequence-counter'],
  ]);
  // Two in a row are not a run; seconds and separated times are never downgraded.
  assert.deepEqual(plan.complete.map((item) => item.value.iso), ['2026-10-15T00:01', '2026-10-15T00:02']);
  const seconds = planFilenameCaptureSuggestions(['20261014_000001.jpg', '20261014_000002.jpg', '20261014_000003.jpg'].map((name, index) => asset(String(index), name)), { today });
  assert.equal(seconds.complete.length, 3);
});

test('counter downgrade follows the entire qualifying run and only its matching templates', () => {
  for (const suffix of ['', '_01']) {
    const clocks = suffix ? ['0001', '0002', '0003'] : ['0010', '0011', '0012', '0013'];
    const counters = clocks.map((clock, index) => `${index === 3 ? 'C' : 'A'}_20261014_${clock}${suffix}.jpg`);
    counters.push(`A_20261014_1433${suffix}.jpg`);
    const unrelated = [`B_20261014_1433${suffix}.jpg`, 'A_20261015_0010.jpg', 'A_20261015_0011.jpg'];
    const plan = planFilenameCaptureSuggestions([...counters, ...unrelated].map((name, index) => asset(String(index), name)), { today });
    assert.deepEqual(plan.dateOnly.map((item) => item.filename), counters);
    assert.deepEqual(plan.complete.map((item) => item.filename), unrelated);
    assert.equal(plan.complete[0].value.iso, '2026-10-14T14:33');
    assert.deepEqual(plan.dateOnly[0], {
      assetId: '0', filename: counters[0], pattern: 'ymd-compact', token: '20261014', downgraded: 'sequence-counter',
      value: { iso: '2026-10-14', precision: 'date', timezoneKnown: false, offset: null },
    });
  }
});

test('counter detection requires three distinct values starting at 0010 or earlier', () => {
  const names = ['A_20261014_0001.jpg', 'B_20261014_0001.jpg', 'A_20261014_0002.jpg',
    'A_20261014_0011.jpg', 'A_20261014_0012.jpg', 'A_20261014_0013.jpg'];
  const plan = planFilenameCaptureSuggestions(names.map((name, index) => asset(String(index), name)), { today });
  assert.deepEqual(plan.dateOnly, []);
  assert.deepEqual(plan.complete.map((item) => item.filename), names);
});

test('writes are filename provenance without acceptance, and the choices are independent', () => {
  const plan = planFilenameCaptureSuggestions([asset('a', '20261014_1433.jpg'), asset('b', '14.10.2026.jpg')], { today });
  const write = filenameCaptureTimeWrite(plan.complete[0], 5);
  assert.deepEqual(JSON.parse(JSON.stringify(write)), { value: { iso: '2026-10-14T14:33', precision: 'minute', timezoneKnown: false, offset: null },
    provenance: { kind: 'filename', raw: '20261014_1433.jpg', token: '20261014_1433', pattern: 'ymd-hm-compact', via: 'import-suggestion' }, acceptedAt: 5 });
  assert(!('acceptance' in write));
  assert.deepEqual(selectedFilenameCaptureWrites(plan, {}), []);
  assert.deepEqual(selectedFilenameCaptureWrites(plan, { complete: true }).map(([id]) => id), ['a']);
  assert.deepEqual(selectedFilenameCaptureWrites(plan, { dateOnly: true }).map(([id]) => id), ['b']);
  assert.deepEqual(selectedFilenameCaptureWrites(plan, { complete: true, dateOnly: true }).map(([id]) => id), ['a', 'b']);
});
