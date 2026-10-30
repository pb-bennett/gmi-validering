import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createWfsProxyHandler } from '../src/lib/gemini-wfs/wfsProxyHandler.mjs';
import { canValidateGeminiHtml, WFS_MAX_RESPONSE_BYTES } from '../src/lib/gemini-wfs/wfsProxyPolicy.mjs';
import { GEMINI_GML_LIMITS } from '../src/lib/gemini-wfs/parseGeminiGml.mjs';
import { collection, featureArrayCollection, feature, field, partialZLine, independentPoint } from './fixtures/gemini-wfs/syntheticProfile.mjs';

const origin = 'https://validator.example.test';
const endpoint = 'https://tenant.geminisuite.com/portal/api/proxy/map/va-basis.wfs';
function request(overrides = {}, signal) {
  return new Request(`${origin}/api/gemini-wfs`, {
    method: 'POST', signal,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ connectionId: 'gemini-wfs', connectionUrl: TEST_CONNECTION.url, featureType: 'lines',
      bbox: [579300, 6559200, 579900, 6559800], username: randomUUID(), password: randomUUID(), ...overrides }),
  });
}
const upstream = (body, headers = {}, status = 200) => new Response(body, {
  status, headers: { 'Content-Type': 'text/html', ...headers },
});
async function expectError(response, code, status = 502) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal((await response.json()).code, code);
  assert.equal(response.headers.has('server-timing'), false);
}

for (const [wrapper, wrap] of [['wfs:member', collection], ['gml:featureMembers', featureArrayCollection]]) {
  for (const [side, object] of [['lines', partialZLine], ['points', independentPoint]]) {
    test(`guarded text/html ${side} with ${wrapper}: validates fully, relabels, preserves exact bytes and safe headers`, async () => {
      const bytes = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?>' + wrap([object]));
      const handle = createWfsProxyHandler({ fetchUpstream: async () => upstream(bytes, {
        'Set-Cookie': 'untrusted', Authorization: 'untrusted', 'WWW-Authenticate': 'Basic',
        Location: 'https://blocked.invalid', 'X-Provider-Detail': 'untrusted',
        'Server-Timing': 'untrusted', 'Content-Length': String(bytes.length),
      }) });
      const response = await handle(request({ featureType: side }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/gml+xml; charset=utf-8');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
      assert.match(response.headers.get('server-timing'), /^gemini-validation;dur=\d+\.\d$/);
      assert.deepEqual([...response.headers.keys()].sort(), [
        'cache-control', 'content-security-policy', 'content-type', 'server-timing', 'x-content-type-options',
      ]);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    });
  }
}

const invalidProfiles = [
  ['HTML page', '<html><body>PRIVATE_PROVIDER_DETAIL</body></html>'],
  ['login form', '<html><form><input name="password"/></form></html>'],
  ['app shell', '<div id="app"><script src="https://blocked.invalid/app.js"/></div>'],
  ['malformed XML', featureArrayCollection([partialZLine]).replace('</gml:posList>', '</gml:pos>')],
  ['OWS exception', '<o:ExceptionReport xmlns:o="http://www.opengis.net/ows/1.1"><o:ExceptionText>PRIVATE_PROVIDER_DETAIL</o:ExceptionText></o:ExceptionReport>'],
  ['unknown XML', '<root/>'],
  ['foreign feature namespace', featureArrayCollection([independentPoint], { ns: 'urn:foreign' })],
  ['unsupported type', featureArrayCollection([feature({ type: 'OTHER' })])],
  ['unsupported geometry', featureArrayCollection([feature({ geometry: '<gml:Polygon/>' })])],
  ['mixed wrapper', featureArrayCollection([independentPoint]).replace('</wfs:FeatureCollection>', `<wfs:member>${partialZLine}</wfs:member></wfs:FeatureCollection>`)],
  ['bad CRS', collection([feature({ crs: 'EPSG:4326' })])],
  ['unsafe external DTD', '<!DOCTYPE x SYSTEM "https://blocked.invalid/secret">' + collection()],
  ['ENTITY declaration', '<!ENTITY x "PRIVATE_PROVIDER_DETAIL">' + collection()],
  ['parser feature limit', featureArrayCollection(Array.from({ length: GEMINI_GML_LIMITS.features + 1 }, (_, i) => feature({ id: `synthetic.${i}` })))],
  ['parser depth limit', '<a>'.repeat(20) + '</a>'.repeat(20)],
  ['duplicate IDs', collection([independentPoint, independentPoint])],
  ['field profile violation', collection([feature({ fields: field('PSID', '1') + field('PSID', '2') })])],
  ['missing ID', collection([feature({ id: '' })])],
  ['processing instruction', '<?xml-stylesheet href="https://blocked.invalid/style"?>' + collection()],
];
for (const [name, xml] of invalidProfiles) {
  test(`text/html rejects ${name} without returning provider content`, async () => {
    const handle = createWfsProxyHandler({ fetchUpstream: async () => upstream(xml) });
    const response = await handle(request());
    const safe = await response.clone().text();
    await expectError(response, 'invalid_upstream_response');
    assert.equal(safe.includes('PRIVATE_PROVIDER_DETAIL'), false);
    assert.equal(safe.includes(xml), false);
  });
}

test('exception is bound to an admitted Gemini profile, HTTPS upstream, HTTP 200 and observed plain MIME', async () => {
  const valid = { connectionId: 'gemini-wfs', url: endpoint + '?SERVICE=WFS', status: 200, contentType: 'text/html' };
  assert.equal(canValidateGeminiHtml(valid), true);
  for (const change of [
    { connectionId: '' }, { url: 'https://blocked.invalid/portal/api/proxy/map/va-basis.wfs' },
    { url: endpoint + '/other' }, { url: endpoint.replace('https:', 'http:') }, { url: endpoint + '#fragment' },
    { url: endpoint.replace('https://', 'https://user:password@') }, { url: 'invalid' },
    { status: 201 }, { status: 302 }, { contentType: null }, { contentType: 'application/xhtml+xml' },
    { contentType: 'text/html; charset=utf-8' }, { contentType: 'text/html; charset=utf-7' },
    { contentType: 'text/html; charset=us-ascii' }, { contentType: 'text/html, application/xml' },
  ]) assert.equal(canValidateGeminiHtml({ ...valid, ...change }), false);
  let calls = 0;
  const handle = createWfsProxyHandler({ fetchUpstream: async () => { calls += 1; return upstream(collection()); } });
  await expectError(await handle(request({ connectionId: '' })), 'invalid_request', 400);
  await expectError(await handle(request({ upstream: endpoint })), 'invalid_request', 400);
  assert.equal(calls, 0);
  for (const status of [201, 206, 302, 401, 500]) {
    const handleStatus = createWfsProxyHandler({ fetchUpstream: async () => upstream(collection(), {}, status) });
    const response = await handleStatus(request());
    assert.notEqual(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  }
  for (const mime of ['text/html; charset=utf-8', 'text/html; charset=utf-7', 'application/xhtml+xml']) {
    const handleMime = createWfsProxyHandler({ fetchUpstream: async () => upstream(collection(), { 'Content-Type': mime }) });
    await expectError(await handleMime(request()), 'unsupported_upstream_mime');
  }
});

test('redirected or differently resolved transport cannot use fallback', async () => {
  for (const properties of [{ redirected: true }, { url: 'https://blocked.invalid/response' }]) {
    const response = upstream(collection());
    for (const [key, value] of Object.entries(properties)) Object.defineProperty(response, key, { value });
    const handle = createWfsProxyHandler({ fetchUpstream: async () => response });
    await expectError(await handle(request()), 'upstream_redirect');
  }
});

test('fallback rejects invalid UTF-8, unsupported XML encodings and unsupported transport encoding', async () => {
  for (const xml of [new Uint8Array([0xc3, 0x28]),
    '<?xml version="1.0" encoding="UTF-16"?>' + collection(),
    '<?xml version="1.0" encoding="us-ascii"?>' + collection([feature({ fields: field('TITLE', '\u00e6') })])]) {
    const handle = createWfsProxyHandler({ fetchUpstream: async () => upstream(xml) });
    await expectError(await handle(request()), 'invalid_upstream_response');
  }
  const handle = createWfsProxyHandler({ fetchUpstream: async () => upstream(collection(), { 'Content-Encoding': 'unknown' }) });
  await expectError(await handle(request()), 'invalid_upstream_response');
});

test('fallback respects declared and streamed 3 MiB limits, cancels unread bodies', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) { if (!declared) controller.enqueue(new Uint8Array(WFS_MAX_RESPONSE_BYTES + 1)); },
      cancel() { cancelled = true; },
    });
    const handle = createWfsProxyHandler({ fetchUpstream: async () => upstream(stream,
      declared ? { 'Content-Length': String(WFS_MAX_RESPONSE_BYTES + 1) } : {}) });
    await expectError(await handle(request()), 'response_too_large');
    assert.equal(cancelled, true);
  }
});

test('fallback timeout and client abort cancel a stalled body without waiting for cancellation', async () => {
  for (const timeout of [true, false]) {
    const client = new AbortController();
    let cancelled = false;
    const handle = createWfsProxyHandler({ timeoutMs: timeout ? 20 : 15000,
      fetchUpstream: async () => upstream(new ReadableStream({
        pull() { if (!timeout) client.abort(); },
        cancel() { cancelled = true; return new Promise(() => {}); },
      })),
    });
    await expectError(await handle(request({}, client.signal)), timeout ? 'timeout' : 'request_aborted', timeout ? 504 : 499);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cancelled, true);
  }
});

test('synchronous validation elapsed time remains inside deadline before publication', async (t) => {
  const samples = [0, 0, 25, 25];
  t.mock.method(performance, 'now', () => samples.shift() ?? 25);
  const handle = createWfsProxyHandler({ timeoutMs: 20, fetchUpstream: async () => upstream(collection([independentPoint])) });
  await expectError(await handle(request()), 'timeout', 504);
});

test('pending client abort after synchronous validation prevents publication', async () => {
  const client = new AbortController();
  const handle = createWfsProxyHandler({ fetchUpstream: async () => {
    setImmediate(() => client.abort());
    return upstream(collection([independentPoint]));
  } });
  await expectError(await handle(request({}, client.signal)), 'request_aborted', 499);
});

test('fallback error/logging never contains credentials, Authorization or parser/provider detail', async (t) => {
  const logs = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args));
  const username = randomUUID(), password = randomUUID();
  let authorization;
  const handle = createWfsProxyHandler({ fetchUpstream: async (_url, options) => {
    authorization = options.headers.Authorization;
    return upstream(`<root>${username} ${password} ${authorization} PRIVATE_PROVIDER_DETAIL<broken></root>`);
  } });
  const response = await handle(request({ username, password }));
  const safe = await response.clone().text();
  await expectError(response, 'invalid_upstream_response');
  for (const secret of [username, password, authorization, 'PRIVATE_PROVIDER_DETAIL']) assert.equal(safe.includes(secret), false);
  assert.deepEqual(logs, []);
});

test('synthetic near-observed-size pair provides aggregate validation timing only', async (t) => {
  const xml = featureArrayCollection(Array.from({ length: 1200 }, (_, i) => feature({
    type: 'VA_LINE', id: `synthetic.${i}`, xyz: '579300 6559200 0 579400 6559300 0 579500 6559400 0 579600 6559500 0',
    fields: field('LSID', 'synthetic') + field('TITLE', 'x'.repeat(350)),
  })));
  const points = featureArrayCollection(Array.from({ length: 1200 }, (_, i) => feature({
    id: `synthetic.point.${i}`, fields: field('PSID', 'synthetic') + field('COVER_Z', '17.75'),
  })));
  const handle = createWfsProxyHandler({ fetchUpstream: async (url) => upstream(
    new URL(url).searchParams.get('TYPENAMES') === 'gemini:VA_LINE' ? xml : points,
  ) });
  const start = performance.now();
  const pair = await Promise.all([handle(request()), handle(request({ featureType: 'points' }))]);
  for (const response of pair) assert.equal(response.status, 200);
  t.diagnostic(`Synthetic transport/validation only: ${Buffer.byteLength(xml)} line bytes, ${Buffer.byteLength(points)} point bytes, pair ${Math.round(performance.now() - start)} ms; ${pair.map((response) => response.headers.get('server-timing')).join('; ')}`);
});
