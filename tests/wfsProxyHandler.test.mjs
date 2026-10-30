import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import test from 'node:test';
import { createWfsProxyHandler } from '../src/lib/gemini-wfs/wfsProxyHandler.mjs';
import { WFS_MAX_REQUEST_BYTES, WFS_MAX_RESPONSE_BYTES } from '../src/lib/gemini-wfs/wfsProxyPolicy.mjs';

const origin = 'https://validator.example.test';
const xml = '<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" numberReturned="0"/>';
const makeBody = (overrides = {}) => ({
  connectionId: 'gemini-wfs', connectionUrl: TEST_CONNECTION.url, featureType: 'lines',
  bbox: [579300, 6559200, 579900, 6559800],
  username: randomUUID(), password: ` ${randomUUID()}:e\u0301æ  `, ...overrides,
});
function makeRequest({ body = makeBody(), raw = JSON.stringify(body), headers = {},
  method = 'POST', url = `${origin}/api/gemini-wfs`, signal } = {}) {
  const requestHeaders = new Headers({
    'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'same-origin',
  });
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) requestHeaders.delete(key); else requestHeaders.set(key, value);
  }
  return new Request(url, {
    method, headers: requestHeaders, signal,
    ...(!['GET', 'HEAD'].includes(method) ? { body: raw, duplex: 'half' } : {}),
  });
}
const xmlResponse = (headers = {}, value = xml) => new Response(value, {
  headers: { 'Content-Type': 'application/gml+xml; charset=UTF-8', ...headers },
});
function harness(fetchUpstream = async () => xmlResponse(), options = {}) {
  const calls = [];
  return {
    calls,
    handle: createWfsProxyHandler({ ...options, fetchUpstream: (...args) => {
      calls.push(args); return fetchUpstream(...args);
    } }),
  };
}
function assertSafeHeaders(response, success = false) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  if (!success) assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  for (const key of ['set-cookie', 'location', 'www-authenticate', 'etag', 'last-modified',
    'expires', 'age', 'access-control-allow-origin', 'authorization', 'content-encoding']) {
    assert.equal(response.headers.has(key), false);
  }
}
async function assertError(response, code, status) {
  assert.equal(response.status, status);
  assertSafeHeaders(response);
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  assert.deepEqual(Object.keys(result).sort(), ['code', 'message', 'ok']);
  return result;
}

for (const [selector, type] of [['lines', 'gemini:VA_LINE'], ['points', 'gemini:VA_MPNT']]) {
  test(`successful ${selector}: fixed URL, exact request-local Basic bytes and raw XML only`, async () => {
    const body = makeBody({ featureType: selector });
    const incomingAuth = randomUUID();
    const cookie = `_vercel_jwt=${randomUUID()}; app_session=${randomUUID()}`;
    const h = harness(async () => xmlResponse({
      'Set-Cookie': randomUUID(), Location: 'https://attacker.example.test',
      'WWW-Authenticate': 'Basic', 'Cache-Control': 'public, max-age=10000',
      ETag: 'untrusted', Expires: 'Wed, 21 Oct 2030 07:28:00 GMT',
      'X-Provider-Detail': randomUUID(),
    }));
    const response = await h.handle(makeRequest({ body, headers: {
      Authorization: incomingAuth, Cookie: cookie, 'X-Wms-Auth': incomingAuth,
      'X-Arbitrary-Header': randomUUID(),
    } }));
    assert.equal(response.status, 200);
    assertSafeHeaders(response, true);
    assert.equal(response.headers.get('x-provider-detail'), null);
    assert.equal(response.headers.get('content-type'), 'application/gml+xml; charset=utf-8');
    assert.equal(await response.text(), xml);
    assert.equal(h.calls.length, 1);
    const [target, options] = h.calls[0];
    const url = new URL(target);
    assert.equal(url.origin, 'https://tenant.geminisuite.com');
    assert.equal(url.pathname, '/portal/api/proxy/map/va-basis.wfs');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: type,
      SRSNAME: 'EPSG:25832', BBOX: '579300,6559200,579900,6559800,EPSG:25832',
    });
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.body, undefined);
    assert.deepEqual(Object.keys(options.headers).sort(), ['Accept', 'Authorization']);
    const expected = `Basic ${Buffer.from(`${body.username}:${body.password}`, 'utf8').toString('base64')}`;
    // Boolean comparisons avoid printing generated authentication data on failure.
    assert.ok(options.headers.Authorization === expected, 'server must preserve exact credential bytes');
    assert.ok(options.headers.Authorization !== incomingAuth);
    assert.equal(target.includes(body.username), false);
    assert.equal(target.includes(body.password), false);
    assert.equal(options.headers.Cookie, undefined);
  });
}

test('invented credentials match an independent UTF-8 byte vector after JSON decoding', async () => {
  // Deliberately invented: spaces, non-ASCII, decomposed accent, colon,
  // backslash, quote, plus and percent. Never use real credentials here.
  const body = makeBody({ username: ' u\u00e6 ', password: ' p:e\u0301\\"+% ' });
  const raw = JSON.stringify(body).replace('æ', '\\u00e6');
  const expectedBytes = Buffer.from([
    0x20, 0x75, 0xc3, 0xa6, 0x20, 0x3a, 0x20, 0x70, 0x3a,
    0x65, 0xcc, 0x81, 0x5c, 0x22, 0x2b, 0x25, 0x20,
  ]);
  const h = harness();
  assert.equal((await h.handle(makeRequest({ raw }))).status, 200);
  assert.equal(h.calls.length, 1);
  const headers = new Headers(h.calls[0][1].headers);
  const synthetic = headers.get('authorization');
  assert.ok(synthetic.startsWith('Basic '));
  // Boolean assertions keep even synthetic encoded values out of failures.
  assert.ok(Buffer.from(synthetic.slice(6), 'base64').equals(expectedBytes),
    'Basic must contain exactly the independent UTF-8 bytes');
  assert.equal([...headers.keys()].filter((key) => key === 'authorization').length, 1);
});

test('one handler keeps concurrent users request-local without sharing credentials or payloads', async () => {
  const inputs = [makeBody(), makeBody({ featureType: 'points' })];
  const h = harness();
  const responses = await Promise.all(inputs.map((body) => h.handle(makeRequest({ body }))));
  assert(responses.every((response) => response.status === 200));
  for (let index = 0; index < inputs.length; index += 1) {
    const expected = `Basic ${Buffer.from(`${inputs[index].username}:${inputs[index].password}`).toString('base64')}`;
    assert.ok(h.calls[index][1].headers.Authorization === expected);
  }
  assert.ok(h.calls[0][1].headers.Authorization !== h.calls[1][1].headers.Authorization);
});

test('invalid requests fail before fetch, including malformed UTF-8 and duplicate JSON keys', async () => {
  const h = harness();
  for (const options of [
    { body: makeBody({ connectionUrl: 'https://attacker.invalid/a.wfs' }) }, { body: makeBody({ url: 'https://attacker.example.test' }) },
    { body: makeBody({ password: '' }) }, { body: makeBody({ bbox: [579900, 6559200, 579300, 6559800] }) },
    { raw: '{"password":' }, { raw: 'null' }, { raw: '{"featureType":"lines","featureType":"points"}' },
    { raw: new Uint8Array([0xc3, 0x28]) }, { raw: '' },
  ]) await assertError(await h.handle(makeRequest(options)), 'invalid_request', 400);
  assert.equal(h.calls.length, 0);
});

test('unknown fields for hosts, paths, operations and all WFS options never reach fetch', async () => {
  const h = harness();
  for (const key of ['url', 'host', 'hostname', 'path', 'port', 'headers', 'xml',
    'operation', 'version', 'crs', 'FILTER', 'CQL', 'outputFormat', 'startIndex', 'COUNT']) {
    await assertError(await h.handle(makeRequest({ body: makeBody({ [key]: 'untrusted' }) })), 'invalid_request', 400);
  }
  assert.equal(h.calls.length, 0);
});

test('header, query and method denials return safe errors without fetch', async () => {
  const h = harness();
  for (const headers of [{ 'Content-Type': null }, { 'Content-Type': 'text/plain' },
    { 'Content-Type': 'application/json; charset=utf-16' }, { 'Content-Encoding': 'gzip' }]) {
    await assertError(await h.handle(makeRequest({ headers })), 'unsupported_media_type', 415);
  }
  for (const headers of [{ Origin: null }, { Origin: 'https://attacker.example.test' },
    { 'Sec-Fetch-Site': 'cross-site' }]) {
    await assertError(await h.handle(makeRequest({ headers })), 'origin_rejected', 403);
  }
  await assertError(await h.handle(makeRequest({ url: `${origin}/api/gemini-wfs?url=untrusted` })), 'invalid_request', 400);
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) {
    const response = await h.handle(makeRequest({ method }));
    assert.equal(response.headers.get('allow'), 'POST');
    await assertError(response, 'method_not_allowed', 405);
  }
  assert.equal(h.calls.length, 0);
});

test('Next dev loopback alias passes header policy while hostile origins stop before any upstream call', async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    const h = harness();
    const local = (headers = {}, raw) => makeRequest({ url: 'http://localhost:3000/api/gemini-wfs',
      headers: { Origin: 'http://127.0.0.1:3000', Host: '127.0.0.1:3000', ...headers }, ...(raw === undefined ? {} : { raw }) });
    await assertError(await h.handle(local({}, '{}')), 'invalid_request', 400);
    assert.equal(h.calls.length, 0);
    assert.equal((await h.handle(local())).status, 200);
    assert.equal(h.calls.length, 1);
    for (const headers of [
      { Origin: 'https://attacker.example.test', 'X-Forwarded-Host': 'attacker.example.test' },
      { 'Sec-Fetch-Site': 'cross-site' }, { Host: 'localhost:3000' },
    ]) await assertError(await h.handle(local(headers)), 'origin_rejected', 403);
    process.env.NODE_ENV = 'production';
    await assertError(await h.handle(local()), 'origin_rejected', 403);
    assert.equal(h.calls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test('request body is bounded by both declared and actual streamed bytes', async () => {
  const h = harness();
  await assertError(await h.handle(makeRequest({ headers: {
    'Content-Length': String(WFS_MAX_REQUEST_BYTES + 1),
  } })), 'request_too_large', 413);
  let cancelled = false;
  const raw = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(WFS_MAX_REQUEST_BYTES + 1)); },
    cancel() { cancelled = true; },
  });
  await assertError(await h.handle(makeRequest({ raw })), 'request_too_large', 413);
  assert.equal(cancelled, true);
  for (const length of ['abc', '1,2', '-1', '0', '1']) {
    await assertError(await h.handle(makeRequest({ headers: { 'Content-Length': length } })), 'invalid_request', 400);
  }
  assert.equal(h.calls.length, 0);
});

for (const [status, code, resultStatus] of [
  [301, 'upstream_redirect', 502], [302, 'upstream_redirect', 502],
  [303, 'upstream_redirect', 502], [304, 'upstream_redirect', 502],
  [307, 'upstream_redirect', 502], [308, 'upstream_redirect', 502],
  [401, 'authentication_failed', 401], [403, 'permission_denied', 403],
  [429, 'provider_rate_limited', 429], [500, 'upstream_failure', 502],
  [503, 'upstream_failure', 502], [204, 'invalid_upstream_response', 502],
  [206, 'invalid_upstream_response', 502],
]) {
  test(`upstream ${status} maps to ${code} without reading or forwarding the provider error`, async () => {
    const input = makeBody();
    let read = false, cancelled = false;
    // A response-like object avoids Response's eager synthetic stream pull.
    const provider = { status, headers: new Headers({
      Location: `https://attacker.example.test/${encodeURIComponent(input.password)}`,
      'WWW-Authenticate': input.username, 'Set-Cookie': input.username,
      'Retry-After': input.username, 'Cache-Control': 'public, max-age=9999',
    }), body: { locked: false, cancel: async () => { cancelled = true; },
      getReader() { read = true; throw new Error(input.password); } } };
    const h = harness(async () => provider);
    const result = await assertError(await h.handle(makeRequest({ body: input })), code, resultStatus);
    assert.equal(h.calls.length, 1);
    assert.equal(read, false);
    assert.equal(cancelled, true);
    assert.equal(JSON.stringify(result).includes(input.password), false);
    assert.equal(JSON.stringify(result).includes(input.username), false);
  });
}

test('fetch exceptions are sanitized and never logged, even when carrying credentials', async (t) => {
  const input = makeBody();
  const authorization = `Basic ${Buffer.from(`${input.username}:${input.password}`).toString('base64')}`;
  const logged = [];
  for (const method of ['log', 'debug', 'info', 'warn', 'error']) t.mock.method(console, method, (...args) => logged.push(args));
  const h = harness(async () => { throw Object.assign(new Error(input.password), {
    username: input.username, Authorization: authorization, cause: input,
  }); });
  const response = await h.handle(makeRequest({ body: input }));
  const result = await assertError(response, 'upstream_failure', 502);
  const safe = JSON.stringify({ result, headers: [...response.headers], logged });
  assert.equal(safe.includes(input.username), false);
  assert.equal(safe.includes(input.password), false);
  assert.equal(safe.includes(authorization), false);
  assert.equal(logged.length, 0);
});

test('missing/unsupported MIME, HTML login pages and unsafe charset are rejected', async () => {
  for (const mime of [null, 'text/html', 'image/svg+xml', 'application/json',
    'application/octet-stream', 'application/xml; charset=utf-7']) {
    const h = harness(async () => {
      const response = xmlResponse({}, '<html>login</html>');
      if (mime === null) response.headers.delete('content-type'); else response.headers.set('content-type', mime);
      return response;
    });
    await assertError(await h.handle(makeRequest()), mime === 'text/html' ? 'invalid_upstream_response' : 'unsupported_upstream_mime', 502);
  }
});

test('all three approved MIME types preserve raw bytes; M1 performs no XML parsing', async () => {
  const bytes = new Uint8Array([0x3c, 0x78, 0x3e, 0xc3, 0xa6]);
  for (const mime of ['application/xml', 'text/xml', 'application/gml+xml']) {
    const h = harness(async () => xmlResponse({ 'Content-Type': mime }, bytes));
    const response = await h.handle(makeRequest());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), mime);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  }
});

test('oversized declared responses fail before reading, and oversized streams cancel', async () => {
  let cancelled = false;
  const h = harness(async () => xmlResponse({ 'Content-Length': String(WFS_MAX_RESPONSE_BYTES + 1) },
    new ReadableStream({ cancel() { cancelled = true; } })));
  await assertError(await h.handle(makeRequest()), 'response_too_large', 502);
  assert.equal(cancelled, true);
  cancelled = false;
  const streamed = harness(async () => xmlResponse({}, new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(WFS_MAX_RESPONSE_BYTES));
      controller.enqueue(new Uint8Array([1]));
    }, cancel() { cancelled = true; },
  })));
  await assertError(await streamed.handle(makeRequest()), 'response_too_large', 502);
  assert.equal(cancelled, true);
});

test('Content-Length may be absent; uncompressed mismatches and malformed lengths are rejected', async () => {
  for (const length of ['abc', '-1', '1,2', '0', '1', String(xml.length + 1)]) {
    const h = harness(async () => xmlResponse({ 'Content-Length': length }));
    await assertError(await h.handle(makeRequest()), 'invalid_upstream_response', 502);
  }
  for (const headers of [{}, { 'Content-Length': String(Buffer.byteLength(xml)) },
    // Fetch decodes compression; declared compressed length need not equal bytes read.
    { 'Content-Length': '1', 'Content-Encoding': 'gzip' }]) {
    const h = harness(async () => xmlResponse(headers));
    const response = await h.handle(makeRequest());
    assert.equal(response.status, 200);
    assertSafeHeaders(response, true);
    assert.equal(await response.text(), xml);
  }
});

test('empty, absent, nonbyte and failed upstream streams are sanitized transport errors', async () => {
  for (const create of [
    () => xmlResponse({}, ''), () => new Response(null, { headers: { 'Content-Type': 'text/xml' } }),
    () => xmlResponse({}, new ReadableStream({ start(controller) { controller.enqueue('not bytes'); controller.close(); } })),
    () => xmlResponse({ 'Content-Encoding': 'unknown' }),
  ]) {
    const h = harness(async () => create());
    await assertError(await h.handle(makeRequest()), 'invalid_upstream_response', 502);
  }
  const h = harness(async () => xmlResponse({}, new ReadableStream({
    start(controller) { controller.error(new Error(randomUUID())); },
  })));
  await assertError(await h.handle(makeRequest()), 'upstream_failure', 502);
});

test('deadline aborts a stalled fetch even if the injected transport ignores cancellation', async () => {
  let signal;
  const h = harness(async (_url, options) => { signal = options.signal; return new Promise(() => {}); }, { timeoutMs: 15 });
  await assertError(await h.handle(makeRequest()), 'timeout', 504);
  assert.equal(signal.aborted, true);
});

test('deadline includes response body read and does not wait for a stalled cancel', async () => {
  let cancelled = false;
  const h = harness(async () => xmlResponse({}, new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([60])); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  })), { timeoutMs: 15 });
  await assertError(await h.handle(makeRequest()), 'timeout', 504);
  assert.equal(cancelled, true);
});

test('deadline also bounds a stalled request upload before credentials reach fetch', async () => {
  let cancelled = false;
  const h = harness(undefined, { timeoutMs: 15 });
  const raw = new ReadableStream({ cancel() { cancelled = true; } });
  await assertError(await h.handle(makeRequest({ raw })), 'timeout', 504);
  assert.equal(cancelled, true);
  assert.equal(h.calls.length, 0);
});

test('pre-aborted client never calls fetch; in-flight cancellation aborts upstream', async () => {
  const early = new AbortController(); early.abort(new Error(randomUUID()));
  const h = harness();
  await assertError(await h.handle(makeRequest({ signal: early.signal })), 'request_aborted', 499);
  assert.equal(h.calls.length, 0);
  const client = new AbortController();
  let upstreamSignal;
  const running = harness(async (_url, options) => {
    upstreamSignal = options.signal; client.abort(new Error(randomUUID()));
    throw new Error(randomUUID());
  });
  await assertError(await running.handle(makeRequest({ signal: client.signal })), 'request_aborted', 499);
  assert.equal(upstreamSignal.aborted, true);
});

test('client cancellation while reading response cancels that stream', async () => {
  const client = new AbortController();
  let cancelled = false;
  const h = harness(async () => xmlResponse({}, new ReadableStream({
    pull() { client.abort(); }, cancel() { cancelled = true; },
  })));
  await assertError(await h.handle(makeRequest({ signal: client.signal })), 'request_aborted', 499);
  // Cancellation can precede body handoff in an injected/late transport.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('thin App Router exports Node/dynamic POST and safely denies all other supported methods', async (t) => {
  register('./esmJsLoader.mjs', import.meta.url);
  let calls = 0;
  const upstreamStatus = 200;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return upstreamStatus === 200 ? xmlResponse() : new Response(null, { status: upstreamStatus });
  });
  const route = await import('../src/app/api/gemini-wfs/route.js');
  assert.equal(route.runtime, 'nodejs');
  assert.equal(route.dynamic, 'force-dynamic');
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) {
    const response = await route[method](makeRequest({ method }));
    await assertError(response, 'method_not_allowed', 405);
  }
  assert.equal(calls, 0);
  assert.equal(typeof route.POST, 'function');
});
