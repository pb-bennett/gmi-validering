// Server-side policy for one registered WFS connection, not a URL proxy.
export const WFS_MAX_REQUEST_BYTES = 16 * 1024;
export const WFS_MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
export const WFS_TIMEOUT_MS = 15_000;
export const WFS_MAX_SIDE_METRES = 2_000;
export const WFS_MAX_AREA_SQUARE_METRES = 4_000_000;
export const WFS_MAX_USERNAME_LENGTH = 256;
export const WFS_MAX_PASSWORD_LENGTH = 1024;

const CONNECTIONS = new Map([
  ['faerder-va-basis', 'https://faerder.geminisuite.com/portal/api/proxy/map/va-basis.wfs'],
]);
const FEATURE_TYPES = new Map([
  ['lines', 'gemini:VA_LINE'],
  ['points', 'gemini:VA_MPNT'],
]);
const BODY_KEYS = new Set(['connectionId', 'featureType', 'bbox', 'username', 'password']);
const XML_TYPES = new Set(['application/xml', 'text/xml', 'application/gml+xml']);
const XML_CHARSETS = new Set(['utf-8', 'utf8', 'us-ascii']);
const ERRORS = Object.freeze({
  invalid_request: [400, 'Invalid WFS request'],
  request_too_large: [413, 'WFS request body is too large'],
  unsupported_media_type: [415, 'WFS requests require application/json'],
  origin_rejected: [403, 'WFS request origin is not allowed'],
  method_not_allowed: [405, 'Only POST is allowed'],
  authentication_failed: [401, 'Gemini authentication failed'],
  permission_denied: [403, 'Gemini access was denied'],
  provider_rate_limited: [429, 'Gemini request limit reached'],
  timeout: [504, 'WFS request timed out'],
  request_aborted: [499, 'WFS request was cancelled'],
  upstream_failure: [502, 'WFS upstream request failed'],
  upstream_redirect: [502, 'WFS upstream redirect rejected'],
  unsupported_upstream_mime: [502, 'Unsupported WFS response content type'],
  invalid_upstream_response: [502, 'Invalid WFS upstream response'],
  response_too_large: [502, 'WFS response is too large; request a smaller area'],
});

export class WfsProxyError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(ERRORS, code) ? code : 'upstream_failure';
    super(ERRORS[safeCode][1]);
    this.name = 'WfsProxyError';
    this.code = safeCode;
  }
}

export function getWfsSafeHeaders(contentType) {
  return {
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  };
}

export function getWfsErrorResult(error) {
  // Never copy an upstream exception's message, cause, URL, headers or body.
  const code = error instanceof WfsProxyError && Object.hasOwn(ERRORS, error.code)
    ? error.code : 'upstream_failure';
  return {
    status: ERRORS[code][0],
    body: { ok: false, code, message: ERRORS[code][1] },
    headers: {
      ...getWfsSafeHeaders('application/json; charset=utf-8'),
      ...(code === 'method_not_allowed' ? { Allow: 'POST' } : {}),
    },
  };
}

export function validateWfsRequestHeaders(request) {
  if (request.method !== 'POST') throw new WfsProxyError('method_not_allowed');
  const url = new URL(request.url);
  if (url.search) throw new WfsProxyError('invalid_request');
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(contentType.trim())) {
    throw new WfsProxyError('unsupported_media_type');
  }
  const encoding = request.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    throw new WfsProxyError('unsupported_media_type');
  }

  let origin;
  try {
    origin = new URL(request.headers.get('origin'));
  } catch {
    throw new WfsProxyError('origin_rejected');
  }
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username || origin.password || origin.pathname !== '/' ||
    origin.search || origin.hash || origin.origin !== url.origin
  ) {
    throw new WfsProxyError('origin_rejected');
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite.toLowerCase().trim() !== 'same-origin') {
    throw new WfsProxyError('origin_rejected');
  }
}

function validateCredential(value, maximumLength, username = false) {
  if (
    typeof value !== 'string' || !value.length || value.length > maximumLength ||
    /\p{Cc}/u.test(value) ||
    (username && (!value.trim() || value.includes(':') || /\p{Cf}/u.test(value)))
  ) {
    throw new WfsProxyError('invalid_request');
  }
  // Iteration combines valid surrogate pairs; lone surrogates would change
  // under UTF-8 encoding and must not silently change authentication bytes.
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new WfsProxyError('invalid_request');
    }
  }
}

export function validateWfsBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || ![...bbox].every(Number.isFinite)) {
    throw new WfsProxyError('invalid_request');
  }
  const [minX, minY, maxX, maxY] = bbox;
  const width = maxX - minX;
  const height = maxY - minY;
  if (
    minX < 100_000 || maxX > 900_000 || minY < 0 || maxY > 10_000_000 ||
    width <= 0 || height <= 0 ||
    width > WFS_MAX_SIDE_METRES || height > WFS_MAX_SIDE_METRES ||
    width * height > WFS_MAX_AREA_SQUARE_METRES
  ) {
    throw new WfsProxyError('invalid_request');
  }
}

// JSON.parse has already checked syntax. Scan strings iteratively to reject
// duplicate top-level keys, including escaped spellings, without recursion.
function rejectDuplicateKeys(raw) {
  const seen = new Set();
  let depth = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '"') {
      const start = index;
      index += 1;
      while (index < raw.length && raw[index] !== '"') {
        index += raw[index] === '\\' ? 2 : 1;
      }
      if (depth === 1 && /^\s*:/.test(raw.slice(index + 1))) {
        const key = JSON.parse(raw.slice(start, index + 1));
        if (seen.has(key)) throw new WfsProxyError('invalid_request');
        seen.add(key);
      }
    } else if (character === '{' || character === '[') {
      depth += 1;
    } else if (character === '}' || character === ']') {
      depth -= 1;
    }
  }
}

export function parseWfsRequest(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new WfsProxyError('invalid_request');
  }
  rejectDuplicateKeys(raw);
  return body;
}

// Returns only a credential-free URL; never return the input as loggable state.
export function validateWfsRequestBody(body) {
  if (
    !body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).length !== BODY_KEYS.size ||
    !Object.keys(body).every((key) => BODY_KEYS.has(key)) ||
    !CONNECTIONS.has(body.connectionId) || !FEATURE_TYPES.has(body.featureType)
  ) {
    throw new WfsProxyError('invalid_request');
  }
  validateCredential(body.username, WFS_MAX_USERNAME_LENGTH, true);
  validateCredential(body.password, WFS_MAX_PASSWORD_LENGTH);
  validateWfsBbox(body.bbox);
  const url = new URL(CONNECTIONS.get(body.connectionId));
  url.search = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: FEATURE_TYPES.get(body.featureType),
    SRSNAME: 'EPSG:25832',
    BBOX: `${body.bbox.join(',')},EPSG:25832`,
  }).toString();
  return url.toString();
}

export function getWfsContentType(value) {
  if (typeof value !== 'string') return null;
  const [type, ...parameters] = value.split(';').map((part) => part.trim().toLowerCase());
  if (!XML_TYPES.has(type) || parameters.length > 1) return null;
  if (!parameters.length) return type;
  const match = parameters[0].match(/^charset\s*=\s*(?:"([a-z0-9-]+)"|([a-z0-9-]+))$/);
  const charset = match?.[1] || match?.[2];
  return XML_CHARSETS.has(charset) ? `${type}; charset=${charset}` : null;
}

export function validateWfsUpstreamStatus(status) {
  if (status >= 300 && status < 400) throw new WfsProxyError('upstream_redirect');
  if (status === 401) throw new WfsProxyError('authentication_failed');
  if (status === 403) throw new WfsProxyError('permission_denied');
  if (status === 429) throw new WfsProxyError('provider_rate_limited');
  if (status >= 500) throw new WfsProxyError('upstream_failure');
  if (status !== 200) throw new WfsProxyError('invalid_upstream_response');
}
