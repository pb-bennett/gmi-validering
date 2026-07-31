/**
 * Public tracking request contract. Keep this module free of framework,
 * network, persistence, and environment dependencies so it can be tested
 * independently.
 */
export const TRACKING_MAX_BODY_BYTES = 1024;
export const TRACKING_EVENT_TYPES = Object.freeze(['upload_success']);
export const TRACKING_EPSG_CODES = Object.freeze([25832, 25833, 4326]);

const TRACKING_COORDINATE_KEYS = new Set([
  'x',
  'y',
  'epsg',
  'sampleCount',
]);
const TRACKING_REQUEST_KEYS = new Set(['eventType', 'datasetCoord']);

export class TrackingRequestPolicyError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'TrackingRequestPolicyError';
    this.status = status;
    this.code = code;
  }
}

const invalidRequest = () =>
  new TrackingRequestPolicyError(400, 'invalid_request');

const isRecord = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value);

const hasOnlyKeys = (value, allowedKeys) =>
  Object.keys(value).every((key) => allowedKeys.has(key));

const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

const validateCoordinate = (value) => {
  if (!isRecord(value) || !hasOnlyKeys(value, TRACKING_COORDINATE_KEYS)) {
    throw invalidRequest();
  }

  if (
    !Object.prototype.hasOwnProperty.call(value, 'x') ||
    !Object.prototype.hasOwnProperty.call(value, 'y') ||
    !Object.prototype.hasOwnProperty.call(value, 'epsg')
  ) {
    throw invalidRequest();
  }

  const { x, y, epsg, sampleCount } = value;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !Number.isInteger(epsg) ||
    !TRACKING_EPSG_CODES.includes(epsg)
  ) {
    throw invalidRequest();
  }

  if (
    sampleCount !== undefined &&
    (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 200)
  ) {
    throw invalidRequest();
  }

  if (epsg === 4326) {
    if (x < -180 || x > 180 || y < -90 || y > 90) {
      throw invalidRequest();
    }
  } else if (
    // Deliberately broad UTM-style bounds, while rejecting implausible
    // values that could amplify upstream work or create bad aggregate keys.
    x < 100_000 ||
    x > 900_000 ||
    y < 0 ||
    y > 10_000_000
  ) {
    throw invalidRequest();
  }

  return {
    x,
    y,
    epsg,
    ...(sampleCount === undefined ? {} : { sampleCount }),
  };
};

const contentTypeIsJson = (contentType) => {
  if (typeof contentType !== 'string') return false;
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json';
};

export const validateTrackingHeaders = ({
  contentType,
  secFetchSite,
  origin,
  requestOrigin,
}) => {
  if (!contentTypeIsJson(contentType)) {
    throw new TrackingRequestPolicyError(415, 'unsupported_media_type');
  }

  if (
    typeof secFetchSite === 'string' &&
    secFetchSite
      .split(',')
      .some((value) => value.trim().toLowerCase() === 'cross-site')
  ) {
    throw new TrackingRequestPolicyError(403, 'cross_site_request');
  }

  if (origin !== undefined && origin !== null && origin !== '') {
    if (typeof requestOrigin !== 'string' || requestOrigin === '') {
      throw new TrackingRequestPolicyError(403, 'origin_mismatch');
    }

    let suppliedOrigin;
    try {
      const parsedOrigin = new URL(origin);
      if (
        parsedOrigin.pathname !== '/' ||
        parsedOrigin.search ||
        parsedOrigin.hash ||
        parsedOrigin.username ||
        parsedOrigin.password
      ) {
        throw new Error('Origin must not contain a path or credentials');
      }
      suppliedOrigin = parsedOrigin.origin;
    } catch {
      throw new TrackingRequestPolicyError(403, 'origin_mismatch');
    }

    if (suppliedOrigin !== requestOrigin) {
      throw new TrackingRequestPolicyError(403, 'origin_mismatch');
    }
  }
};

export const validateTrackingRequest = (body) => {
  if (!isRecord(body) || !hasOnlyKeys(body, TRACKING_REQUEST_KEYS)) {
    throw invalidRequest();
  }

  if (
    !Object.prototype.hasOwnProperty.call(body, 'eventType') ||
    typeof body.eventType !== 'string' ||
    !TRACKING_EVENT_TYPES.includes(body.eventType)
  ) {
    throw invalidRequest();
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'datasetCoord') &&
    body.datasetCoord !== null
  ) {
    return {
      eventType: body.eventType,
      datasetCoord: validateCoordinate(body.datasetCoord),
    };
  }

  return {
    eventType: body.eventType,
    datasetCoord: null,
  };
};

export const parseTrackingRequest = ({ rawBody, contentType }) => {
  if (typeof rawBody !== 'string') throw invalidRequest();

  if (!contentTypeIsJson(contentType)) {
    throw new TrackingRequestPolicyError(415, 'unsupported_media_type');
  }

  const bodySize = new TextEncoder().encode(rawBody).byteLength;
  if (bodySize > TRACKING_MAX_BODY_BYTES) {
    throw new TrackingRequestPolicyError(413, 'body_too_large');
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw invalidRequest();
  }

  return validateTrackingRequest(body);
};

export const getTrackingErrorResponse = (error) => {
  if (error instanceof TrackingRequestPolicyError) {
    const messages = {
      body_too_large: 'Tracking request body is too large',
      cross_site_request: 'Tracking request is not allowed',
      invalid_request: 'Invalid tracking request',
      origin_mismatch: 'Tracking request is not allowed',
      unsupported_media_type: 'Tracking request must use application/json',
    };

    return {
      status: error.status,
      body: { ok: false, error: messages[error.code] || 'Invalid tracking request' },
    };
  }

  return {
    status: 500,
    body: { ok: false, error: 'Tracking temporarily unavailable' },
  };
};
