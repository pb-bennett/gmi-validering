import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import dns from 'node:dns/promises';
import https from 'node:https';
import { register } from 'node:module';
import { normalizeGeminiWfsUrl } from '../src/lib/gemini-wfs/geminiConnection.mjs';
import { resolveWfsDestination, fetchPinnedWfs } from '../src/lib/gemini-wfs/wfsPinnedTransport.mjs';
import { createWfsProxyHandler } from '../src/lib/gemini-wfs/wfsProxyHandler.mjs';
import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import { WFS_MAX_RESPONSE_BYTES } from '../src/lib/gemini-wfs/wfsProxyPolicy.mjs';

const publicAddress = { address: '8.8.8.8', family: 4 };
const url = TEST_CONNECTION.url + '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature';
const options = () => ({ signal: new AbortController().signal,
  headers: { Authorization: 'Basic synthetic-only', Accept: 'application/xml', Cookie: 'must-not-forward' } });
const xml = '<synthetic/>';
function transport({ status = 200, bytes = Buffer.from(xml), headers = {} } = {}) {
  const calls = [];
  const request = (target, init, done) => {
    calls.push({ target, init });
    const result = Readable.from([bytes]);
    result.statusCode = status;
    result.headers = { 'content-type': 'application/xml', ...headers };
    const outgoing = new EventEmitter();
    outgoing.end = () => queueMicrotask(() => done(result));
    return outgoing;
  };
  return { calls, request };
}

test('Gemini profile accepts configured tenants/resources and rejects arbitrary URL forms', () => {
  assert.equal(normalizeGeminiWfsUrl('https://other-town.geminisuite.com/portal/api/proxy/map/network.wfs'),
    'https://other-town.geminisuite.com/portal/api/proxy/map/network.wfs');
  for (const value of [
    'http://tenant.geminisuite.com/portal/api/proxy/map/a.wfs', 'file:///etc/passwd', 'data:text/plain,test',
    'https://user:pass@tenant.geminisuite.com/portal/api/proxy/map/a.wfs',
    TEST_CONNECTION.url + '#fragment', TEST_CONNECTION.url + '?REQUEST=GetCapabilities', TEST_CONNECTION.url + '?',
    TEST_CONNECTION.url.replace('.com/', '.com:444/'), TEST_CONNECTION.url.replace('tenant.', 'tenant.evil.'),
    TEST_CONNECTION.url.replace('tenant.geminisuite.com', 'localhost'),
    TEST_CONNECTION.url.replace('tenant.geminisuite.com', '127.0.0.1'),
    TEST_CONNECTION.url.replace('tenant.geminisuite.com', '2130706433'),
    TEST_CONNECTION.url.replace('tenant.geminisuite.com', '[::1]'),
    TEST_CONNECTION.url.replace('tenant.geminisuite.com', 'tenant.geminisuite.com.evil.test'),
    TEST_CONNECTION.url.replace('va-basis.wfs', '%2e%2e/a.wfs'), TEST_CONNECTION.url.replace('va-basis.wfs', '../a.wfs'),
    TEST_CONNECTION.url.replace('va-basis.wfs', 'a.wfs/other'), TEST_CONNECTION.url.replace('https://', 'https:\\'),
    ' ' + TEST_CONNECTION.url, TEST_CONNECTION.url + '\n', TEST_CONNECTION.url + '\r\n',
  ]) assert.throws(() => normalizeGeminiWfsUrl(value), 'must reject unsafe/non-profile URL');
});

test('DNS rejects private, local, link-local, mapped and mixed results before transport', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.1.2', '192.168.1.1', '169.254.169.254',
    '100.64.1.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1']) {
    const family = address.includes(':') ? 6 : 4;
    await assert.rejects(resolveWfsDestination(url, { lookup: async () => [publicAddress, { address, family }] }), { code: 'invalid_request' });
  }
  for (const entries of [[], null, [{ address: '8.8.8.8', family: 6 }]]) {
    await assert.rejects(resolveWfsDestination(url, { lookup: async () => entries }), { code: 'invalid_request' });
  }
});

test('validated address is pinned with original TLS host, without pooling/caller headers/re-resolution', async () => {
  const h = transport(); let lookups = 0;
  const response = await fetchPinnedWfs(url, options(), { request: h.request,
    lookup: async () => { lookups++; return [publicAddress]; } });
  assert.equal(await response.text(), xml);
  assert.equal(lookups, 1); assert.equal(h.calls.length, 1);
  const { target, init } = h.calls[0];
  assert.equal(target.hostname, 'tenant.geminisuite.com');
  assert.equal(init.servername, target.hostname); assert.equal(init.agent, false);
  assert.deepEqual(Object.keys(init.headers).sort(), ['Accept', 'Authorization']);
  assert.equal(init.method, 'GET');
  for (const all of [false, true]) {
    init.lookup(target.hostname, { all }, (error, value, family) => {
      assert.equal(error, null); assert.deepEqual(value, all ? [publicAddress] : publicAddress.address);
      assert.equal(family, 4);
    });
  }
  init.lookup('unvalidated.invalid', {}, (error) => assert.equal(error.code, 'invalid_request'));
});

for (const status of [301, 302, 303, 307, 308, 401]) {
  test(`pinned transport never follows ${status} or reads its provider body`, async () => {
    const h = transport({ status });
    const response = await fetchPinnedWfs(url, options(), { request: h.request, lookup: async () => [publicAddress] });
    assert.equal(response.status, status); assert.equal(response.body, null); assert.equal(h.calls.length, 1);
  });
}

test('compressed bytes are decoded before the existing bounded handler contract', async () => {
  const h = transport({ bytes: gzipSync(xml), headers: { 'content-encoding': 'gzip' } });
  const response = await fetchPinnedWfs(url, options(), { request: h.request, lookup: async () => [publicAddress] });
  assert.equal(await response.text(), xml);
});

test('abort during lookup cannot open a late socket', async () => {
  let release; const signal = new AbortController();
  const h = transport();
  const pending = fetchPinnedWfs(url, { ...options(), signal: signal.signal }, {
    request: h.request, lookup: () => new Promise((resolve) => { release = resolve; }),
  });
  signal.abort(); release([publicAddress]);
  await assert.rejects(pending); assert.equal(h.calls.length, 0);
});

test('invalid upstream status is a safe transport rejection', async () => {
  const h = transport({ status: 999 });
  await assert.rejects(fetchPinnedWfs(url, options(), { request: h.request, lookup: async () => [publicAddress] }), { code: 'invalid_upstream_response' });
});

test('decoded oversized response remains bounded through the pinned transport and M1', async () => {
  const h = transport({ bytes: gzipSync(Buffer.alloc(WFS_MAX_RESPONSE_BYTES + 1, 65)),
    headers: { 'content-encoding': 'gzip' } });
  const handle = createWfsProxyHandler({ fetchUpstream: (target, init) => fetchPinnedWfs(target, init,
    { request: h.request, lookup: async () => [publicAddress] }) });
  const response = await handle(new Request('https://app.invalid/api/gemini-wfs', {
    method: 'POST', headers: { Origin: 'https://app.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId: TEST_CONNECTION.id, connectionUrl: TEST_CONNECTION.url,
      featureType: 'lines', bbox: [579300, 6559200, 579500, 6559400], username: 'invented', password: 'invented' }),
  }));
  assert.equal(response.status, 502); assert.equal((await response.json()).code, 'response_too_large');
});

test('real POST route uses pinned transport and keeps browser auth/cookies out of Gemini', async (t) => {
  register('./esmJsLoader.mjs', import.meta.url);
  t.mock.method(dns, 'lookup', async () => [publicAddress]);
  const h = transport(); t.mock.method(https, 'request', h.request);
  const route = await import('../src/app/api/gemini-wfs/route.js');
  const response = await route.POST(new Request('https://app.invalid/api/gemini-wfs', {
    method: 'POST', headers: { Origin: 'https://app.invalid', 'Content-Type': 'application/json',
      Cookie: '_vercel_jwt=synthetic', Authorization: 'Bearer untrusted' },
    body: JSON.stringify({ connectionId: TEST_CONNECTION.id, connectionUrl: TEST_CONNECTION.url,
      featureType: 'lines', bbox: [579300, 6559200, 579500, 6559400], username: 'invented', password: 'secret-for-test-only' }),
  }));
  assert.equal(response.status, 200); assert.equal(await response.text(), xml);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(Object.keys(h.calls[0].init.headers).sort(), ['Accept', 'Authorization']);
  const expected = 'Basic ' + Buffer.from('invented:secret-for-test-only', 'utf8').toString('base64');
  assert.ok(h.calls[0].init.headers.Authorization === expected, 'only server-created Basic reaches the validated tenant');
});

test('configured URL profile fails before an injected upstream is called', async () => {
  let calls = 0;
  const handle = createWfsProxyHandler({ fetchUpstream: () => { calls++; throw new Error('unexpected'); } });
  const response = await handle(new Request('https://app.invalid/api/gemini-wfs', {
    method: 'POST', headers: { Origin: 'https://app.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId: TEST_CONNECTION.id, connectionUrl: 'https://evil.invalid/a.wfs',
      featureType: 'lines', bbox: [579300, 6559200, 579500, 6559400], username: 'invented', password: 'invented' }),
  }));
  assert.equal(response.status, 400); assert.equal(calls, 0);
});
