import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUploadTelemetry,
  classifyCoordinateCount,
  classifyCoordinateStatus,
  classifyCrs,
  classifyEpsgCategory,
  classifyExtension,
  classifyFileFormat,
  classifyFileSize,
  classifyObjectCount,
  classifyObjectMix,
  classifyXyQuality,
  classifyZQuality,
  TELEMETRY_KEYS,
} from '../src/lib/telemetry/classifiers.mjs';
import {
  classifyParserWarnings,
  createWarningSummary,
  recordWarning,
} from '../src/lib/telemetry/warnings.mjs';

const kib = 1024;
const mib = 1024 * kib;

const fixtureData = {
  points: [
    { coordinates: [{ x: 1, y: 2, z: 10 }] },
    { coordinates: [{ x: 3, y: 4, z: 0 }] },
  ],
  lines: [{ coordinates: [{ x: 5, y: 6, z: null }] }],
};

const validTelemetry = {
  fileFormat: 'gmi',
  extensionCategory: 'gmi',
  fileSizeBucket: 'lt_100_kib',
  objectCountBucket: '2_to_10',
  coordinateCountBucket: '1_to_10',
  objectMix: 'points_and_lines',
  crsStatus: 'declared',
  epsgCategory: 'epsg_25832',
  coordinateStatus: 'available',
  xyQuality: 'all_objects_have_valid_xy',
  zQuality: 'some_coordinates_missing_or_zero_z',
  parserWarningBucket: '0',
  parserWarningClass: 'none',
};

test('classifies every fixed extension category without returning the filename', () => {
  assert.equal(classifyExtension('map.GMI'), 'gmi');
  assert.equal(classifyExtension('archive.data.SOS'), 'sos');
  assert.equal(classifyExtension('archive.data.SOSI'), 'sosi');
  assert.equal(classifyExtension('map.KOF'), 'kof');
  assert.equal(classifyExtension('notes.TXT'), 'txt');
  assert.equal(classifyExtension('map.unknown'), 'other');
  assert.equal(classifyExtension('no-extension'), 'none');
  assert.equal(classifyExtension(''), 'none');
  assert.equal(classifyExtension(null), 'none');
});

test('classifies formats and all exact file-size boundaries', () => {
  assert.deepEqual(
    ['GMI', 'SOSI', 'KOF'].map(classifyFileFormat),
    ['gmi', 'sosi', 'kof'],
  );
  assert.equal(classifyFileFormat('other'), null);

  assert.deepEqual(
    [0, 100 * kib - 1, 100 * kib, mib - 1, mib, 10 * mib - 1, 10 * mib, 50 * mib - 1, 50 * mib].map(classifyFileSize),
    [
      'lt_100_kib',
      'lt_100_kib',
      '100_kib_to_lt_1_mib',
      '100_kib_to_lt_1_mib',
      '1_mib_to_lt_10_mib',
      '1_mib_to_lt_10_mib',
      '10_mib_to_lt_50_mib',
      '10_mib_to_lt_50_mib',
      'gte_50_mib',
    ],
  );
  assert.equal(classifyFileSize(-1), null);
  assert.equal(classifyFileSize(1.5), null);
});

test('classifies every object and coordinate-count boundary', () => {
  assert.deepEqual(
    [1, 2, 10, 11, 100, 101, 1000, 1001, 10000, 10001].map(
      classifyObjectCount,
    ),
    [
      '1',
      '2_to_10',
      '2_to_10',
      '11_to_100',
      '11_to_100',
      '101_to_1000',
      '101_to_1000',
      '1001_to_10000',
      '1001_to_10000',
      'gte_10001',
    ],
  );
  assert.equal(classifyObjectCount(0), null);

  assert.deepEqual(
    [0, 1, 10, 11, 100, 101, 1000, 1001, 10000, 10001, 100000, 100001].map(
      classifyCoordinateCount,
    ),
    [
      '0',
      '1_to_10',
      '1_to_10',
      '11_to_100',
      '11_to_100',
      '101_to_1000',
      '101_to_1000',
      '1001_to_10000',
      '1001_to_10000',
      '10001_to_100000',
      '10001_to_100000',
      'gte_100001',
    ],
  );
});

test('classifies all object mixes and quality outcomes', () => {
  assert.equal(classifyObjectMix([{ coordinates: [] }], []), 'points_only');
  assert.equal(classifyObjectMix([], [{ coordinates: [] }]), 'lines_only');
  assert.equal(
    classifyObjectMix([{ coordinates: [] }], [{ coordinates: [] }]),
    'points_and_lines',
  );
  assert.equal(classifyObjectMix([], []), null);

  assert.equal(classifyXyQuality({ points: [{ coordinates: [{ x: 1, y: 2 }] }] }), 'all_objects_have_valid_xy');
  assert.equal(
    classifyXyQuality({
      points: [{ coordinates: [{ x: 1, y: 2 }] }, { coordinates: [] }],
    }),
    'some_objects_missing_valid_xy',
  );
  assert.equal(classifyXyQuality({ points: [{ coordinates: [] }] }), 'no_objects_have_valid_xy');

  assert.equal(classifyZQuality({ points: [{ coordinates: [{ z: 1 }] }] }), 'all_coordinates_have_nonzero_z');
  assert.equal(classifyZQuality({ points: [{ coordinates: [{ z: 1 }, { z: 0 }] }] }), 'some_coordinates_missing_or_zero_z');
  assert.equal(classifyZQuality({ points: [{ coordinates: [{ z: null }] }] }), 'all_coordinates_missing_or_zero_z');
  assert.equal(classifyZQuality({ points: [{ coordinates: [] }] }), 'not_applicable');
});

test('uses corrected CRS provenance and EPSG categories', () => {
  assert.deepEqual(
    classifyCrs({ header: { COSYS_EPSG: 25832 }, sourceFormat: 'GMI' }),
    { crsStatus: 'declared', epsg: 25832, epsgCategory: 'epsg_25832' },
  );
  assert.deepEqual(
    classifyCrs({ header: { COSYSVER_EPSG: 25833 }, sourceFormat: 'GMI' }),
    { crsStatus: 'declared', epsg: 25833, epsgCategory: 'epsg_25833' },
  );
  assert.deepEqual(
    classifyCrs({ sourceFormat: 'KOF', heuristicEpsg: 25832 }),
    { crsStatus: 'inferred', epsg: 25832, epsgCategory: 'epsg_25832' },
  );
  assert.deepEqual(
    classifyCrs({
      header: { COSYS_EPSG: 25832 },
      sourceFormat: 'KOF',
      sourceCrs: { crsStatus: 'inferred', epsg: 25832 },
    }),
    { crsStatus: 'inferred', epsg: 25832, epsgCategory: 'epsg_25832' },
  );
  assert.deepEqual(
    classifyCrs({
      header: { KOORDSYS: 22 },
      sourceFormat: 'KOF',
    }),
    { crsStatus: 'declared', epsg: 25832, epsgCategory: 'epsg_25832' },
  );
  assert.deepEqual(
    classifyCrs({
      header: { Projeksjon: 'UTM 33' },
      sourceFormat: 'KOF',
    }),
    { crsStatus: 'declared', epsg: 25833, epsgCategory: 'epsg_25833' },
  );
  assert.deepEqual(
    classifyCrs({ header: { SRID: 'EPSG:4326' }, sourceFormat: 'SOSI' }),
    { crsStatus: 'declared', epsg: 4326, epsgCategory: 'epsg_4326' },
  );
  assert.deepEqual(
    classifyCrs({ sourceFormat: 'GMI', userChoice: 25833 }),
    { crsStatus: 'assumed', epsg: 25833, epsgCategory: 'epsg_25833' },
  );
  assert.deepEqual(
    classifyCrs({ header: { COSYS_EPSG: 'not-a-code' }, sourceFormat: 'GMI', userChoice: 25832 }),
    { crsStatus: 'assumed', epsg: 25832, epsgCategory: 'epsg_25832' },
  );
  assert.deepEqual(
    classifyCrs({ sourceFormat: 'GMI' }),
    { crsStatus: 'missing', epsg: null, epsgCategory: 'missing' },
  );
  assert.deepEqual(
    classifyCrs({ header: { COSYS_EPSG: 'not-a-code' }, sourceFormat: 'GMI' }),
    { crsStatus: 'invalid', epsg: null, epsgCategory: 'missing' },
  );
  assert.deepEqual(
    classifyCrs({ header: { COSYS_EPSG: 3857 }, sourceFormat: 'GMI' }),
    { crsStatus: 'unsupported', epsg: 3857, epsgCategory: 'other' },
  );
  assert.deepEqual(
    [25832, 25833, 4326, 3857, null].map(classifyEpsgCategory),
    ['epsg_25832', 'epsg_25833', 'epsg_4326', 'other', 'missing'],
  );
});

test('classifies coordinate status without sending coordinate values', () => {
  assert.equal(classifyCoordinateStatus({ crsStatus: 'missing' }), 'crs_missing');
  assert.equal(classifyCoordinateStatus({ crsStatus: 'invalid' }), 'crs_invalid');
  assert.equal(classifyCoordinateStatus({ crsStatus: 'unsupported' }), 'crs_unsupported');
  assert.equal(
    classifyCoordinateStatus({
      crsStatus: 'declared',
      xyQuality: 'no_objects_have_valid_xy',
      operationalCoordinateAvailable: false,
    }),
    'no_valid_xy',
  );
  assert.equal(
    classifyCoordinateStatus({
      crsStatus: 'declared',
      xyQuality: 'some_objects_missing_valid_xy',
      operationalCoordinateAvailable: false,
    }),
    'invalid_or_out_of_range',
  );
  assert.equal(
    classifyCoordinateStatus({
      crsStatus: 'declared',
      xyQuality: 'all_objects_have_valid_xy',
      operationalCoordinateAvailable: true,
    }),
    'available',
  );
});

test('reduces parser warnings by fixed class and bucket only', () => {
  const summary = createWarningSummary();
  const displayWarnings = [];
  recordWarning(displayWarnings, summary, 'coordinate', 'arbitrary source line');
  recordWarning(displayWarnings, summary, 'geometry', 'another arbitrary warning');
  assert.deepEqual(classifyParserWarnings(summary), {
    parserWarningBucket: '2_to_5',
    parserWarningClass: 'multiple',
  });
  assert.equal(JSON.stringify(classifyParserWarnings({
    total: 1,
    classes: { coordinate: 1 },
    warnings: ['filename-secret', 'raw coordinate secret'],
  })).includes('filename-secret'), false);

  for (const [total, bucket] of [[0, '0'], [1, '1'], [5, '2_to_5'], [6, 'gte_6']]) {
    const boundarySummary = createWarningSummary();
    boundarySummary.total = total;
    boundarySummary.classes.other = total;
    assert.equal(
      classifyParserWarnings(boundarySummary).parserWarningBucket,
      bucket,
    );
  }

  for (const invalidSummary of [
    { total: -1, classes: createWarningSummary().classes },
    { total: 1, classes: { ...createWarningSummary().classes, coordinate: -1 } },
    { total: 1, classes: { ...createWarningSummary().classes, coordinate: 0 } },
    { total: 0, classes: { ...createWarningSummary().classes, coordinate: 1 } },
    { total: 1, classes: { coordinate: 1 } },
  ]) {
    assert.equal(classifyParserWarnings(invalidSummary), null);
  }
});

test('final telemetry has exactly the thirteen browser keys and no prohibited values', () => {
  const telemetry = buildUploadTelemetry(validTelemetry);
  assert.deepEqual(Object.keys(telemetry), TELEMETRY_KEYS);
  assert.equal(Object.keys(telemetry).length, 13);
  assert.equal(
    JSON.stringify(telemetry).includes('filename-secret'),
    false,
  );
  assert.equal(
    buildUploadTelemetry({
      ...validTelemetry,
      filename: 'filename-secret',
    }),
    null,
  );
  assert.equal(
    buildUploadTelemetry({
      ...validTelemetry,
      exactFileSize: 123,
    }),
    null,
  );
  assert.equal(
    buildUploadTelemetry({
      ...validTelemetry,
      coordinates: [{ x: 1, y: 2 }],
    }),
    null,
  );
  assert.equal(
    buildUploadTelemetry({
      ...validTelemetry,
      rawWarnings: ['arbitrary warning'],
    }),
    null,
  );
  assert.equal(
    buildUploadTelemetry({
      ...validTelemetry,
      parserWarningClass: 'arbitrary warning text',
    }),
    null,
  );
  assert.deepEqual(classifyXyQuality(fixtureData), 'all_objects_have_valid_xy');
});

test('parser errors cannot be represented as successful warning telemetry', () => {
  const failedParse = {
    errors: [{ type: 'PARSE_ERROR', message: 'raw parser error' }],
    warningSummary: createWarningSummary(),
  };
  assert.equal(failedParse.errors.length > 0, true);
  assert.equal(buildUploadTelemetry(validTelemetry).parserWarningClass, 'none');
});
