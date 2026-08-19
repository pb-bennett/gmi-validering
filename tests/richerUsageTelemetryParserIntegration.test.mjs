import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const [
  { GMIParser },
  { KOFParser },
  { SOSIParser },
  { getDatasetCoordinate },
  { transformPipes },
  { getMapSourceProjection, projectCoordinateToWgs84 },
] = await Promise.all([
  import('../src/lib/parsing/gmiParser.js'),
  import('../src/lib/parsing/kofParser.js'),
  import('../src/lib/parsing/sosiParser.js'),
  import('../src/lib/tracking/datasetCoordinate.js'),
  import('../src/lib/3d/transformGMIData.js'),
  import('../src/lib/map/coordinateProjection.js'),
]);

import {
  buildLegacyTrackRequestBody,
  completeSuccessfulUpload,
  deriveUploadTelemetry,
  isTestModeEnabled,
} from '../src/lib/telemetry/uploadTelemetry.mjs';
import {
  classifyCrs,
  classifyParserWarnings,
} from '../src/lib/telemetry/classifiers.mjs';
import { createWarningSummary } from '../src/lib/telemetry/warnings.mjs';

const countSummaryClasses = (summary) =>
  Object.values(summary.classes).reduce((sum, count) => sum + count, 0);

const assertWarningSync = (parsed) => {
  assert.equal(parsed.warnings.length, parsed.warningSummary.total);
  assert.equal(countSummaryClasses(parsed.warningSummary), parsed.warningSummary.total);
  assert.notEqual(classifyParserWarnings(parsed.warningSummary), null);
};

const gmiWarningFixture = `[GMIFILE_ASCII]
COSYS_EPSG 25832
[L_]
_FIELDNAMES CODE
[+L_]
:L 1
_FIELDVALUES one;extra
/XYZ
not-a-coordinate
1 2 3
`;

const kofPoint = '05 1 6650000 550000 10';

const parseSosiStub = (crsName) =>
  new SOSIParser('synthetic-sosi-input', () => ({
    parse: () => ({
      dumps: () => ({
        ...(crsName === undefined
          ? {}
          : { crs: { properties: { name: crsName } } }),
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10, 60, 1] },
            properties: {},
          },
        ],
      }),
    }),
  })).parse();

test('real GMI parser keeps display warnings synchronized with safe summary', () => {
  const parsed = new GMIParser(gmiWarningFixture).toObject();

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.crsContext.crsStatus, 'declared');
  assert.match(parsed.warnings[0], /More _FIELDVALUES/);
  assert.match(parsed.warnings[1], /Invalid coordinate/);
  assert.equal(parsed.warningSummary.classes.field_shape, 1);
  assert.equal(parsed.warningSummary.classes.coordinate, 1);
  assertWarningSync(parsed);
});

test('real KOF parser distinguishes declarations, inference, missing CRS, and geometry warnings', () => {
  const declared = new KOFParser(`00 KOORDSYS 22\n${kofPoint}`).parse();
  assert.equal(declared.points.length, 1);
  assert.equal(declared.crsContext.crsStatus, 'declared');
  assert.equal(declared.crsContext.epsg, 25832);
  assertWarningSync(declared);

  const projection = new KOFParser(`00 Projeksjon: UTM 33\n${kofPoint}`).parse();
  assert.equal(projection.crsContext.crsStatus, 'declared');
  assert.equal(projection.crsContext.epsg, 25833);
  assertWarningSync(projection);

  const inferred = new KOFParser(kofPoint).parse();
  assert.equal(inferred.crsContext.crsStatus, 'inferred');
  assert.equal(inferred.warningSummary.classes.crs, 1);
  assert.match(inferred.warnings[0], /Antar EPSG:25832/);
  assertWarningSync(inferred);

  const missing = new KOFParser('05 1 100 200 0').parse();
  assert.equal(missing.crsContext.crsStatus, 'missing');
  assertWarningSync(missing);

  const shortLine = new KOFParser(`09 91\n${kofPoint}\n09 99`).parse();
  assert.equal(shortLine.crsContext.crsStatus, 'inferred');
  assert.equal(shortLine.warningSummary.classes.geometry, 1);
  assert.match(shortLine.warnings[0], /for få punkter/);
  assertWarningSync(shortLine);
});

test('SOSI parser uses strict declared CRS handling at its parser boundary', () => {
  const supported = parseSosiStub('EPSG:25832');
  assert.equal(supported.points.length, 1);
  assert.equal(supported.crsContext.crsStatus, 'declared');
  assert.equal(supported.crsContext.epsg, 25832);

  const missing = parseSosiStub();
  assert.equal(missing.crsContext.crsStatus, 'missing');

  for (const crsName of [
    'prefix EPSG:25832',
    'EPSG:25832 suffix',
    'EPSG 25832',
    'not-a-crs',
  ]) {
    const malformed = parseSosiStub(crsName);
    assert.equal(malformed.crsContext.crsStatus, 'invalid');
    assert.equal(malformed.crsContext.epsg, null);
  }

  const unsupported = parseSosiStub('EPSG:3857');
  assert.equal(unsupported.crsContext.crsStatus, 'unsupported');
  assert.equal(unsupported.crsContext.epsgCategory, 'other');
  assert.equal(getDatasetCoordinate(unsupported), null);
});

test('SOSI production coordinates reach the 2D map in the correct CRS and order', () => {
  const parsed = new SOSIParser('representative-sosi-input', () => ({
    parse: () => ({
      dumps: () => ({
        crs: { properties: { name: 'EPSG:25832' } },
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              // sosijs GeoJSON output is [x, y] = [easting, northing].
              coordinates: [
                [597000, 6643000, 12.5],
                [597010, 6643010, 12.4],
              ],
            },
            properties: { objekttypenavn: 'Vannledning' },
          },
        ],
      }),
    }),
  })).parse();

  assert.equal(parsed.header.SRID, 'EPSG:25832');
  assert.equal(parsed.header.COSYS_EPSG, 25832);
  assert.equal(parsed.crsContext.crsStatus, 'declared');
  assert.equal(parsed.crsContext.epsg, 25832);
  assert.deepEqual(parsed.lines[0].coordinates[0], {
    x: 597000,
    y: 6643000,
    z: 12.5,
  });
  assert.equal(getMapSourceProjection(parsed), 'EPSG:25832');

  const [lng, lat] = projectCoordinateToWgs84(
    parsed,
    parsed.lines[0].coordinates[0].x,
    parsed.lines[0].coordinates[0].y,
  );
  assert.ok(lng > 10.7 && lng < 10.8);
  assert.ok(lat > 59.9 && lat < 60.0);

  const [swappedLng, swappedLat] = projectCoordinateToWgs84(
    parsed,
    parsed.lines[0].coordinates[0].y,
    parsed.lines[0].coordinates[0].x,
  );
  assert.ok(Math.abs(swappedLng - lng) > 1);
  assert.ok(Math.abs(swappedLat - lat) > 1);

  const kof = new KOFParser(
    '00 KOORDSYS 22\n05 1 6643000 597000 12.5',
  ).parse();
  const [kofLng, kofLat] = projectCoordinateToWgs84(
    kof,
    kof.points[0].coordinates[0].x,
    kof.points[0].coordinates[0].y,
  );
  assert.ok(Math.abs(kofLng - lng) < 1e-9);
  assert.ok(Math.abs(kofLat - lat) < 1e-9);

  const threeD = transformPipes(parsed.lines, parsed.header);
  assert.deepEqual(threeD.center, [597005, 6643005, 12.45]);
  assert.equal(threeD.pipes.length, 1);
  assert.equal(threeD.pipes[0].start[0], -5);
  assert.ok(Math.abs(threeD.pipes[0].start[1] - 0.05) < 1e-12);
  assert.equal(threeD.pipes[0].start[2], 5);
});

test('dataset coordinate uses parser-owned shared operational CRS provenance', () => {
  const inferred = new KOFParser(kofPoint).parse();
  const datasetCoordinate = getDatasetCoordinate(inferred);
  assert.deepEqual(datasetCoordinate, {
    x: 550000,
    y: 6650000,
    epsg: 25832,
    sampleCount: 1,
  });

  const unsupported = {
    format: 'GMI',
    header: { COSYS_EPSG: 3857 },
    points: [{ coordinates: [{ x: 1, y: 2 }] }],
    lines: [],
  };
  assert.equal(getDatasetCoordinate(unsupported), null);
});

test('parser errors produce no success telemetry', () => {
  const failed = {
    errors: [{ type: 'PARSE_ERROR', message: 'synthetic failure' }],
    points: [],
    lines: [],
    format: 'gmi',
  };
  assert.equal(
    deriveUploadTelemetry({
      parsedData: failed,
      fileName: 'synthetic.gmi',
      fileSize: 1,
      crs: classifyCrs({ header: { COSYS_EPSG: 25832 } }),
      warningSummary: createWarningSummary(),
    }),
    null,
  );
});

test('legacy track body remains unchanged and telemetry failure cannot suppress completion', () => {
  const datasetCoord = { x: 550000, y: 6650000, epsg: 25832, sampleCount: 1 };
  assert.deepEqual(buildLegacyTrackRequestBody(datasetCoord), {
    eventType: 'upload_success',
    datasetCoord,
  });
  assert.deepEqual(Object.keys(buildLegacyTrackRequestBody(null)).sort(), [
    'datasetCoord',
    'eventType',
  ]);

  const trackingCalls = [];
  let completionCalls = 0;
  const result = completeSuccessfulUpload({
    deriveTelemetry: () => {
      throw new Error('forced classifier failure');
    },
    datasetCoord,
    hydrated: true,
    trackUploadSuccess: (coordinate) => trackingCalls.push(coordinate),
    onComplete: () => {
      completionCalls += 1;
    },
  });

  assert.equal(result, null);
  assert.deepEqual(trackingCalls, [datasetCoord]);
  assert.equal(completionCalls, 1);
});

test('test mode defaults off, persists as a setting, and skips tracking without skipping completion', () => {
  assert.equal(isTestModeEnabled(undefined), false);
  assert.equal(isTestModeEnabled({ testMode: false }), false);
  assert.equal(isTestModeEnabled({ testMode: true }), true);

  let deriveCalls = 0;
  let trackingCalls = 0;
  let completionCalls = 0;
  const result = completeSuccessfulUpload({
    testMode: true,
    deriveTelemetry: () => {
      deriveCalls += 1;
      return { shouldNotBeBuilt: true };
    },
    datasetCoord: { x: 1, y: 2, epsg: 4326 },
    trackUploadSuccess: () => {
      trackingCalls += 1;
    },
    onComplete: () => {
      completionCalls += 1;
    },
  });

  assert.equal(result, null);
  assert.equal(deriveCalls, 0);
  assert.equal(trackingCalls, 0);
  assert.equal(completionCalls, 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      buildLegacyTrackRequestBody(null),
      'test',
    ),
    false,
  );
});
