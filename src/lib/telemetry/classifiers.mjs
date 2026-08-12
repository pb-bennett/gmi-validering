import { classifyCrs, classifyEpsgCategory } from './crs.mjs';
import { classifyParserWarnings } from './warnings.mjs';

export const TELEMETRY_KEYS = Object.freeze([
  'fileFormat',
  'extensionCategory',
  'fileSizeBucket',
  'objectCountBucket',
  'coordinateCountBucket',
  'objectMix',
  'crsStatus',
  'epsgCategory',
  'coordinateStatus',
  'xyQuality',
  'zQuality',
  'parserWarningBucket',
  'parserWarningClass',
]);

export const TELEMETRY_DOMAINS = Object.freeze({
  fileFormat: Object.freeze(['gmi', 'sosi', 'kof']),
  extensionCategory: Object.freeze([
    'gmi',
    'sos',
    'sosi',
    'kof',
    'txt',
    'other',
    'none',
  ]),
  fileSizeBucket: Object.freeze([
    'lt_100_kib',
    '100_kib_to_lt_1_mib',
    '1_mib_to_lt_10_mib',
    '10_mib_to_lt_50_mib',
    'gte_50_mib',
  ]),
  objectCountBucket: Object.freeze([
    '1',
    '2_to_10',
    '11_to_100',
    '101_to_1000',
    '1001_to_10000',
    'gte_10001',
  ]),
  coordinateCountBucket: Object.freeze([
    '0',
    '1_to_10',
    '11_to_100',
    '101_to_1000',
    '1001_to_10000',
    '10001_to_100000',
    'gte_100001',
  ]),
  objectMix: Object.freeze([
    'points_only',
    'lines_only',
    'points_and_lines',
  ]),
  crsStatus: Object.freeze([
    'declared',
    'inferred',
    'assumed',
    'missing',
    'invalid',
    'unsupported',
  ]),
  epsgCategory: Object.freeze([
    'epsg_25832',
    'epsg_25833',
    'epsg_4326',
    'other',
    'missing',
  ]),
  coordinateStatus: Object.freeze([
    'available',
    'no_valid_xy',
    'invalid_or_out_of_range',
    'crs_missing',
    'crs_invalid',
    'crs_unsupported',
  ]),
  xyQuality: Object.freeze([
    'all_objects_have_valid_xy',
    'some_objects_missing_valid_xy',
    'no_objects_have_valid_xy',
  ]),
  zQuality: Object.freeze([
    'all_coordinates_have_nonzero_z',
    'some_coordinates_missing_or_zero_z',
    'all_coordinates_missing_or_zero_z',
    'not_applicable',
  ]),
  parserWarningBucket: Object.freeze(['0', '1', '2_to_5', 'gte_6']),
  parserWarningClass: Object.freeze([
    'none',
    'coordinate',
    'geometry',
    'field_shape',
    'crs',
    'multiple',
    'other',
  ]),
});

const isFiniteNonNegativeInteger = (value) =>
  Number.isInteger(value) && Number.isFinite(value) && value >= 0;

const classifyRange = (value, ranges) => {
  if (!isFiniteNonNegativeInteger(value)) return null;
  return ranges.find(({ min, max }) => value >= min && value <= max)?.value ||
    ranges[ranges.length - 1].value;
};

export const classifyFileFormat = (format) => {
  const normalized = typeof format === 'string' ? format.toLowerCase() : '';
  return TELEMETRY_DOMAINS.fileFormat.includes(normalized)
    ? normalized
    : null;
};

export const classifyExtension = (fileName) => {
  if (typeof fileName !== 'string' || fileName.length === 0) return 'none';
  const extension = fileName.toLowerCase().split('.').pop();
  if (!extension || extension === fileName.toLowerCase()) return 'none';
  return TELEMETRY_DOMAINS.extensionCategory.includes(extension)
    ? extension
    : 'other';
};

export const classifyFileSize = (bytes) =>
  classifyRange(bytes, [
    { min: 0, max: 100 * 1024 - 1, value: 'lt_100_kib' },
    {
      min: 100 * 1024,
      max: 1024 * 1024 - 1,
      value: '100_kib_to_lt_1_mib',
    },
    {
      min: 1024 * 1024,
      max: 10 * 1024 * 1024 - 1,
      value: '1_mib_to_lt_10_mib',
    },
    {
      min: 10 * 1024 * 1024,
      max: 50 * 1024 * 1024 - 1,
      value: '10_mib_to_lt_50_mib',
    },
    { min: 50 * 1024 * 1024, max: Infinity, value: 'gte_50_mib' },
  ]);

export const classifyObjectCount = (count) =>
  count === 0
    ? null
    : classifyRange(count, [
        { min: 1, max: 1, value: '1' },
        { min: 2, max: 10, value: '2_to_10' },
        { min: 11, max: 100, value: '11_to_100' },
        { min: 101, max: 1000, value: '101_to_1000' },
        { min: 1001, max: 10000, value: '1001_to_10000' },
        { min: 10001, max: Infinity, value: 'gte_10001' },
      ]);

export const classifyCoordinateCount = (count) =>
  classifyRange(count, [
    { min: 0, max: 0, value: '0' },
    { min: 1, max: 10, value: '1_to_10' },
    { min: 11, max: 100, value: '11_to_100' },
    { min: 101, max: 1000, value: '101_to_1000' },
    { min: 1001, max: 10000, value: '1001_to_10000' },
    { min: 10001, max: 100000, value: '10001_to_100000' },
    { min: 100001, max: Infinity, value: 'gte_100001' },
  ]);

export const classifyObjectMix = (points, lines) => {
  const hasPoints = Array.isArray(points) && points.length > 0;
  const hasLines = Array.isArray(lines) && lines.length > 0;
  if (hasPoints && hasLines) return 'points_and_lines';
  if (hasPoints) return 'points_only';
  if (hasLines) return 'lines_only';
  return null;
};

const allObjects = (data = {}) => [
  ...(Array.isArray(data.points) ? data.points : []),
  ...(Array.isArray(data.lines) ? data.lines : []),
];

const hasValidXy = (feature) =>
  Array.isArray(feature?.coordinates) &&
  feature.coordinates.some(
    (coordinate) =>
      Number.isFinite(coordinate?.x) && Number.isFinite(coordinate?.y),
  );

export const classifyXyQuality = (data) => {
  const objects = allObjects(data);
  const validObjectCount = objects.filter(hasValidXy).length;
  if (validObjectCount === objects.length && objects.length > 0) {
    return 'all_objects_have_valid_xy';
  }
  if (validObjectCount === 0) return 'no_objects_have_valid_xy';
  return 'some_objects_missing_valid_xy';
};

const isValidZ = (value) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number !== 0;
};

export const classifyZQuality = (data = {}) => {
  let coordinateCount = 0;
  let validZCount = 0;
  for (const feature of allObjects(data)) {
    if (!Array.isArray(feature?.coordinates)) continue;
    for (const coordinate of feature.coordinates) {
      coordinateCount += 1;
      if (isValidZ(coordinate?.z)) validZCount += 1;
    }
  }
  if (coordinateCount === 0) return 'not_applicable';
  if (validZCount === coordinateCount) {
    return 'all_coordinates_have_nonzero_z';
  }
  if (validZCount === 0) return 'all_coordinates_missing_or_zero_z';
  return 'some_coordinates_missing_or_zero_z';
};

export const isUsableDatasetCoordinate = (coordinate) => {
  if (!coordinate || !Number.isInteger(coordinate.epsg)) return false;
  if (
    !Number.isFinite(coordinate.x) ||
    !Number.isFinite(coordinate.y)
  ) {
    return false;
  }
  if (coordinate.epsg === 4326) {
    return coordinate.x >= -180 && coordinate.x <= 180 &&
      coordinate.y >= -90 && coordinate.y <= 90;
  }
  if (coordinate.epsg === 25832 || coordinate.epsg === 25833) {
    return coordinate.x >= 100000 && coordinate.x <= 900000 &&
      coordinate.y >= 0 && coordinate.y <= 10000000;
  }
  return false;
};

export const classifyCoordinateStatus = ({
  crsStatus,
  xyQuality,
  operationalCoordinateAvailable,
} = {}) => {
  if (crsStatus === 'missing') return 'crs_missing';
  if (crsStatus === 'invalid') return 'crs_invalid';
  if (crsStatus === 'unsupported') return 'crs_unsupported';
  if (xyQuality === 'no_objects_have_valid_xy') return 'no_valid_xy';
  return operationalCoordinateAvailable
    ? 'available'
    : 'invalid_or_out_of_range';
};

const isAllowedValue = (key, value) =>
  typeof value === 'string' && TELEMETRY_DOMAINS[key]?.includes(value);

export const buildUploadTelemetry = (reducedValues) => {
  if (!reducedValues || typeof reducedValues !== 'object') return null;
  if (Array.isArray(reducedValues)) return null;
  const keys = Object.keys(reducedValues).sort();
  const expectedKeys = [...TELEMETRY_KEYS].sort();
  if (keys.length !== expectedKeys.length) return null;
  if (keys.some((key, index) => key !== expectedKeys[index])) return null;
  if (
    TELEMETRY_KEYS.some(
      (key) => !isAllowedValue(key, reducedValues[key]),
    )
  ) {
    return null;
  }
  return Object.fromEntries(
    TELEMETRY_KEYS.map((key) => [key, reducedValues[key]]),
  );
};

export {
  classifyCrs,
  classifyEpsgCategory,
  classifyParserWarnings,
};
