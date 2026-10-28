import { GEMINI_CONNECTION_ID, GEMINI_GML_LIMITS, parseGeminiGml } from './parseGeminiGml.mjs';
import { buildGeminiMapFeatures } from './geminiMapFeatures.mjs';
import { validateGeminiBbox } from './geminiExtent.mjs';
import { GeminiServiceError, safeGeminiError, waitForGemini } from './geminiErrors.mjs';

export const GEMINI_CLIENT_TIMEOUT_MS = 20_000;
const PROXY_CODES = new Set(['invalid_request', 'request_too_large', 'unsupported_media_type', 'origin_rejected',
  'authentication_failed', 'permission_denied', 'provider_rate_limited', 'timeout', 'request_aborted',
  'upstream_failure', 'upstream_redirect', 'unsupported_upstream_mime', 'invalid_upstream_response', 'response_too_large']);

export function validateGeminiCredentials(credentials) {
  const { username, password } = credentials || {};
  if (typeof username !== 'string' || !username.length || username.length > 256 || !username.trim() ||
    /[:\p{Cc}\p{Cf}]/u.test(username) || typeof password !== 'string' || !password.length || password.length > 1024 || /\p{Cc}/u.test(password)) {
    throw new GeminiServiceError('invalid_credentials');
  }
  for (const character of username + password) {
    const code = character.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) throw new GeminiServiceError('invalid_credentials');
  }
}

function cancelBody(response) {
  if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
}

async function boundedBytes(response, signal, limit = GEMINI_GML_LIMITS.bytes) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    throw new GeminiServiceError('invalid_upstream_response');
  }
  if (length !== null && Number(length) > limit) throw new GeminiServiceError('response_too_large');
  if (!response.body) throw new GeminiServiceError('invalid_upstream_response');
  const reader = response.body.getReader();
  const chunks = []; let total = 0, complete = false;
  try {
    while (true) {
      const { done, value } = await waitForGemini(reader.read(), signal);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new GeminiServiceError('invalid_upstream_response');
      total += value.byteLength;
      if (total > limit) throw new GeminiServiceError('response_too_large');
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    complete = true; return bytes;
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function decodeGeminiXml(bytes, contentType) {
  const [type, ...parameters] = String(contentType || '').toLowerCase().split(';').map((part) => part.trim());
  if (!['application/xml', 'text/xml', 'application/gml+xml'].includes(type)) throw new GeminiServiceError('unsupported_upstream_mime');
  const match = parameters[0]?.match(/^charset\s*=\s*(?:"([a-z0-9-]+)"|([a-z0-9-]+))$/);
  const charset = parameters.length ? (match?.[1] || match?.[2]) : 'utf-8';
  if (parameters.length > 1 || !['utf-8', 'utf8', 'us-ascii'].includes(charset)) throw new GeminiServiceError('unsupported_response_encoding');
  // TextDecoder('us-ascii') aliases Windows-1252 in browsers; enforce ASCII bytes.
  if (charset === 'us-ascii' && bytes.some((byte) => byte > 127)) throw new GeminiServiceError('unsupported_response_encoding');
  let xml;
  try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new GeminiServiceError('unsupported_response_encoding'); }
  const declaration = xml.match(/^\s*<\?xml\b[^?]*\bencoding\s*=\s*(['"])([^'"]+)\1/i)?.[2].toLowerCase();
  if (declaration && (!['utf-8', 'utf8', 'us-ascii'].includes(declaration) ||
    (declaration === 'us-ascii' && bytes.some((byte) => byte > 127)))) throw new GeminiServiceError('unsupported_response_encoding');
  return xml;
}

async function proxyError(response, signal) {
  const fallback = ({ 401: 'authentication_failed', 403: 'permission_denied', 429: 'provider_rate_limited',
    504: 'timeout', 413: 'request_too_large', 499: 'request_aborted' })[response.status] || 'proxy_request_failed';
  let code = fallback;
  try {
    if (response.headers.get('content-type')?.split(';')[0].trim() === 'application/json') {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(response, signal, 4096)));
      if (PROXY_CODES.has(value.code)) code = value.code;
    }
  } catch { /* Never expose an error body or its parsing exception. */ }
  return new GeminiServiceError(code);
}

export function createGeminiClient({ fetchProxy = (...args) => globalThis.fetch(...args),
  parseGml = parseGeminiGml, buildDisplay = buildGeminiMapFeatures, timeoutMs = GEMINI_CLIENT_TIMEOUT_MS } = {}) {
  return async function fetchPair({ bbox, credentials, signal }) {
    validateGeminiBbox(bbox);
    validateGeminiCredentials(credentials);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    async function fetchType(featureType) {
      let response;
      try {
        if (controller.signal.aborted) throw new GeminiServiceError('request_aborted');
        const pending = Promise.resolve(fetchProxy('/api/gemini-wfs', {
          method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: GEMINI_CONNECTION_ID, featureType, bbox,
            username: credentials.username, password: credentials.password }),
        })).then((value) => { if (controller.signal.aborted) cancelBody(value); return value; });
        response = await waitForGemini(pending, controller.signal);
        if (response.redirected) throw new GeminiServiceError('upstream_redirect');
        if (response.status !== 200) throw await proxyError(response, controller.signal);
        const bytes = await boundedBytes(response, controller.signal);
        const xml = decodeGeminiXml(bytes, response.headers.get('content-type'));
        let source, display;
        try { source = parseGml(xml); }
        catch (error) { throw new GeminiServiceError('gml_parser_error', { parserCode: error?.code }); }
        const expected = featureType === 'lines' ? 'gemini:VA_LINE' : 'gemini:VA_MPNT';
        if (source.records.some((record) => record.typeName !== expected)) throw new GeminiServiceError('unexpected_feature_type');
        try { display = buildDisplay(source); }
        catch (error) { throw new GeminiServiceError('display_projection_error', { parserCode: error?.code }); }
        return Object.freeze({ source, display });
      } finally { cancelBody(response); }
    }
    try {
      if (signal?.aborted) abort();
      const [lines, points] = await Promise.all(['lines', 'points'].map(fetchType));
      if (controller.signal.aborted) throw new GeminiServiceError('request_aborted');
      return Object.freeze({ lines, points, counts: Object.freeze({ lines: lines.source.counts.records,
        points: points.source.counts.records, total: lines.source.counts.records + points.source.counts.records }) });
    } catch (error) {
      if (timedOut) throw new GeminiServiceError('timeout');
      if (signal?.aborted) throw new GeminiServiceError('request_aborted');
      const safe = safeGeminiError(error);
      throw new GeminiServiceError(safe.code, safe);
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
    }
  };
}

export const fetchGeminiPair = createGeminiClient();
