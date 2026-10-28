import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  WFS_MAX_PASSWORD_LENGTH,
  WFS_MAX_USERNAME_LENGTH,
  WFS_TIMEOUT_MS,
  WfsProxyError,
  getWfsContentType,
  getWfsErrorResult,
  parseWfsRequest,
  validateWfsBbox,
  validateWfsRequestBody,
  validateWfsRequestHeaders,
} from '../src/lib/gemini-wfs/wfsProxyPolicy.mjs';

const origin = 'https://validator.example.test';
const body = (overrides = {}) => ({
  connectionId: 'faerder-va-basis', featureType: 'lines',
  bbox: [579300, 6559200, 579900, 6559800],
  username: randomUUID(), password: randomUUID(), ...overrides,
});
const invalid = (value) => assert.throws(() => validateWfsRequestBody(value), {
  name: 'WfsProxyError', code: 'invalid_request',
});

test('registered line and point requests produce only the exact fixed WFS contract', () => {
  for (const [selector, type] of [['lines', 'gemini:VA_LINE'], ['points', 'gemini:VA_MPNT']]) {
    const input = body({ featureType: selector, bbox: [579300.25, 6559200.5, 579900.75, 6559800] });
    const serialized = validateWfsRequestBody(input);
    const url = new URL(serialized);
    assert.equal(url.origin, 'https://faerder.geminisuite.com');
    assert.equal(url.pathname, '/portal/api/proxy/map/va-basis.wfs');
    assert.equal(url.port, '');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
      TYPENAMES: type, SRSNAME: 'EPSG:25832',
      BBOX: '579300.25,6559200.5,579900.75,6559800,EPSG:25832',
    });
    assert.equal(serialized.includes(input.username), false);
    assert.equal(serialized.includes(input.password), false);
  }
  assert.equal(WFS_TIMEOUT_MS, 15_000);
});

test('only known connection IDs, selectors and exactly the five allowed fields are accepted', () => {
  for (const value of [null, [], {}, 'text', body({ connectionId: '__proto__' }),
    body({ connectionId: 'other' }), body({ connectionId: 'https://attacker.example.test' }),
    body({ featureType: 'gemini:VA_LINE' }), body({ featureType: ['lines', 'points'] })]) invalid(value);
  for (const key of ['url', 'hostname', 'host', 'path', 'port', 'headers', 'Authorization',
    'operation', 'request', 'version', 'crs', 'FILTER', 'CQL', 'outputFormat', 'startIndex', 'COUNT', 'xml']) {
    invalid(body({ [key]: 'untrusted' }));
  }
  for (const key of ['connectionId', 'featureType', 'bbox', 'username', 'password']) {
    const input = body(); delete input[key]; invalid(input);
  }
});

test('credentials are bounded strings without unsafe controls, colon in username or lone surrogates', () => {
  for (const username of [null, 2, {}, '', '   ', 'a:b', 'a\r\nb', 'a\u0000b', 'a\u0085b',
    'a\u202eb', '\ud800', '\udfff', 'x'.repeat(WFS_MAX_USERNAME_LENGTH + 1)]) invalid(body({ username }));
  for (const password of [null, 2, {}, '', 'a\nb', 'a\tb', 'a\u007fb', '\ud800',
    'x'.repeat(WFS_MAX_PASSWORD_LENGTH + 1)]) invalid(body({ password }));
  validateWfsRequestBody(body({ username: 'x'.repeat(WFS_MAX_USERNAME_LENGTH),
    password: 'x'.repeat(WFS_MAX_PASSWORD_LENGTH) }));
  // Spaces, colons, combining characters and valid surrogate pairs are not normalized.
  const input = body({ username: 'æ\u{1f642}', password: '  :e\u0301\u{1f642}  ' });
  validateWfsRequestBody(input);
  assert.ok(input.password === '  :e\u0301\u{1f642}  ');
});

test('BBOX rejects nonnumbers, nonfinite, reversed, degenerate, implausible and excessive areas', () => {
  for (const bbox of [null, {}, [], [1, 2, 3], [1, 2, 3, 4, 5], new Array(4),
    ['579300', 6559200, 579900, 6559800], [579300, null, 579900, 6559800],
    [NaN, 6559200, 579900, 6559800], [579300, 6559200, Infinity, 6559800],
    [579900, 6559200, 579300, 6559800], [579300, 6559800, 579900, 6559200],
    [579300, 6559200, 579300, 6559800], [579300, 6559200, 579900, 6559200],
    [99999, 6559200, 100001, 6559800], [899999, 6559200, 900001, 6559800],
    [579300, -1, 579900, 1], [579300, 9999999, 579900, 10000001],
    [579300, 6559200, 581301, 6559800], [579300, 6559200, 579900, 6561201],
    [579300, 6559200, 582300, 6562200]]) {
    assert.throws(() => validateWfsBbox(bbox), { code: 'invalid_request' });
  }
  validateWfsBbox([579300, 6559200, 581300, 6561200]); // Exactly 4 km².
  validateWfsBbox([100000, 0, 100001, 1]);
  validateWfsBbox([899999, 9999999, 900000, 10000000]);
});

test('malformed JSON and duplicate top-level keys (including escaped keys) fail safely', () => {
  for (const raw of ['', '{', '{"password":}', 'NaN', '[1,]']) {
    assert.throws(() => parseWfsRequest(raw), { code: 'invalid_request' });
  }
  const raw = JSON.stringify(body());
  for (const duplicate of ['"featureType":"points"', '"feature\\u0054ype":"points"']) {
    assert.throws(() => parseWfsRequest(raw.replace('{', `{${duplicate},`)), { code: 'invalid_request' });
  }
  validateWfsRequestBody(parseWfsRequest(JSON.stringify(body({ password: ':"{}[]\\' }))));
});

const request = ({ method = 'POST', url = `${origin}/api/gemini-wfs`, headers = {} } = {}) =>
  new Request(url, { method, headers: {
    'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'same-origin', ...headers,
  } });

test('POST, JSON and exact origin checks follow same-origin application patterns', () => {
  validateWfsRequestHeaders(request());
  validateWfsRequestHeaders(request({ headers: { 'Content-Type': 'Application/JSON; charset="UTF-8"' } }));
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.throws(() => validateWfsRequestHeaders(request({ method })), { code: 'method_not_allowed' });
  }
  for (const value of ['', 'text/plain', 'application/x-www-form-urlencoded',
    'application/json; charset=utf-16', 'application/json; other=1']) {
    assert.throws(() => validateWfsRequestHeaders(request({ headers: { 'Content-Type': value } })),
      { code: 'unsupported_media_type' });
  }
  const missing = request(); missing.headers.delete('content-type');
  assert.throws(() => validateWfsRequestHeaders(missing), { code: 'unsupported_media_type' });
  for (const value of ['', 'null', 'https://attacker.example.test', `${origin}/path`,
    `${origin}?x=1`, `${origin}#x`, 'https://user@validator.example.test', `${origin}:8443`]) {
    assert.throws(() => validateWfsRequestHeaders(request({ headers: { Origin: value } })), { code: 'origin_rejected' });
  }
  const noOrigin = request(); noOrigin.headers.delete('origin');
  assert.throws(() => validateWfsRequestHeaders(noOrigin), { code: 'origin_rejected' });
  for (const value of ['cross-site', 'same-site', 'none', '']) {
    assert.throws(() => validateWfsRequestHeaders(request({ headers: { 'Sec-Fetch-Site': value } })),
      { code: 'origin_rejected' });
  }
  const noFetchSite = request(); noFetchSite.headers.delete('sec-fetch-site');
  validateWfsRequestHeaders(noFetchSite);
  assert.throws(() => validateWfsRequestHeaders(request({ headers: { 'Content-Encoding': 'gzip' } })),
    { code: 'unsupported_media_type' });
});

test('queries and spoofed forwarding headers cannot widen origin or target', () => {
  for (const query of ['?url=https://attacker.example.test', '?SERVICE=WFS', '?x=1&x=2']) {
    assert.throws(() => validateWfsRequestHeaders(request({ url: `${origin}/api/gemini-wfs${query}` })),
      { code: 'invalid_request' });
  }
  assert.throws(() => validateWfsRequestHeaders(request({ headers: {
    Origin: 'https://attacker.example.test', 'X-Forwarded-Host': 'attacker.example.test',
    'X-Forwarded-Proto': 'https',
  } })), { code: 'origin_rejected' });
  validateWfsRequestHeaders(request({ url: 'http://localhost:3000/api/gemini-wfs', headers: { Origin: 'http://localhost:3000' } }));
});

test('MIME allowlist accepts only the narrow XML/GML types and safe declared charsets', () => {
  for (const type of ['application/xml', 'text/xml', 'application/gml+xml']) {
    assert.equal(getWfsContentType(type), type);
    assert.equal(getWfsContentType(`${type}; charset="UTF-8"`), `${type}; charset=utf-8`);
  }
  assert.equal(getWfsContentType('text/xml; charset=us-ascii'), 'text/xml; charset=us-ascii');
  for (const value of [null, '', 'text/html', 'image/svg+xml', 'application/json',
    'application/octet-stream', 'application/vnd.ogc.gml', 'text/xml; charset=utf-7',
    'text/xml; charset=utf-16', 'text/xml; charset=utf-8; charset=utf-8',
    'application/gml+xml; version=3.2']) assert.equal(getWfsContentType(value), null);
});

test('loggable validation exceptions and error results never copy sensitive values', () => {
  const input = body({ url: 'https://attacker.example.test' });
  let caught;
  try { validateWfsRequestBody(input); } catch (error) { caught = error; }
  const providerError = Object.assign(new Error(input.password), { username: input.username, headers: input });
  for (const value of [caught, providerError, new WfsProxyError(input.password)]) {
    const safe = getWfsErrorResult(value);
    const text = JSON.stringify(safe);
    assert.equal(text.includes(input.password), false);
    assert.equal(text.includes(input.username), false);
    assert.equal(text.includes('attacker'), false);
  }
  assert.equal(caught.message.includes(input.password), false);
  assert.equal(JSON.stringify(caught).includes(input.username), false);
});
