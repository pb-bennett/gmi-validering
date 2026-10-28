import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
register('./esmJsLoader.mjs', import.meta.url);
const { createGeminiClient, decodeGeminiXml } = await import('../src/lib/gemini-wfs/geminiClient.mjs');
const { GeminiGmlError } = await import('../src/lib/gemini-wfs/parseGeminiGml.mjs');

const bbox = [579200, 6559100, 579400, 6559300];
const credentials = { username: randomUUID(), password: ` ${randomUUID()} ` };
const xmlResponse = (text = '<synthetic/>', headers = {}) => new Response(text, { headers: { 'Content-Type': 'application/xml', ...headers } });
const parsed = (type) => ({ records: [{ typeName: type }], counts: { records: 1 } });
const parseGml = (text) => parsed(text === 'lines' ? 'gemini:VA_LINE' : 'gemini:VA_MPNT');
const buildDisplay = () => ({ type: 'FeatureCollection', features: [] });
const makeClient = (options = {}) => createGeminiClient({
  fetchProxy: async (_url, init) => xmlResponse(JSON.parse(init.body).featureType), parseGml, buildDisplay, ...options,
});
const code = (expected) => (error) => {
  assert.equal(error.code, expected);
  const safe = JSON.stringify(error) + error.message;
  assert(!safe.includes(credentials.username)); assert(!safe.includes(credentials.password)); return true;
};

test('exactly two concurrent same-origin POSTs with the M1 contract and no other credential channels', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const client = makeClient({ fetchProxy: async (url, init) => {
    calls.push({ url, init }); await gate;
    return xmlResponse(JSON.parse(init.body).featureType);
  } });
  const pending = client({ bbox, credentials });
  assert.equal(calls.length, 2);
  release();
  const pair = await pending;
  assert.deepEqual(pair.counts, { lines: 1, points: 1, total: 2 });
  assert.equal(pair.lines.source.records[0].typeName, 'gemini:VA_LINE');
  assert.equal(pair.points.source.records[0].typeName, 'gemini:VA_MPNT');
  for (const [index, { url, init }] of calls.entries()) {
    assert.equal(url, '/api/gemini-wfs');
    assert.equal(init.method, 'POST'); assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(), ['bbox', 'connectionId', 'featureType', 'password', 'username']);
    assert.equal(body.connectionId, 'faerder-va-basis');
    assert.equal(body.featureType, index === 0 ? 'lines' : 'points');
    assert.deepEqual(body.bbox, bbox);
    assert(body.username === credentials.username && body.password === credentials.password, 'Credentials preserved only in body');
  }
  assert(!JSON.stringify(pair).includes(credentials.username));
});
test('approved UTF-8, utf8, ASCII and absent charsets decode deliberately', () => {
  for (const mime of ['application/xml', 'text/xml;charset=UTF-8', 'application/gml+xml; charset="utf8"']) {
    assert.equal(decodeGeminiXml(new TextEncoder().encode('<title>ÆØÅ</title>'), mime), '<title>ÆØÅ</title>');
  }
  assert.equal(decodeGeminiXml(new TextEncoder().encode('<ascii/>'), 'application/xml;charset=US-ASCII'), '<ascii/>');
});
test('unsupported or inconsistent encoding, invalid UTF8 and HTML are safe failures', () => {
  for (const mime of ['application/xml;charset=iso-8859-1', 'application/xml;charset=utf-16', 'application/xml;foo=bar', 'application/xml;charset=utf8;charset=utf8']) {
    assert.throws(() => decodeGeminiXml(new Uint8Array(), mime), code('unsupported_response_encoding'));
  }
  assert.throws(() => decodeGeminiXml(new Uint8Array([0xff]), 'application/xml'), code('unsupported_response_encoding'));
  assert.throws(() => decodeGeminiXml(new Uint8Array([0xe9]), 'application/xml;charset=us-ascii'), code('unsupported_response_encoding'));
  assert.throws(() => decodeGeminiXml(new TextEncoder().encode('<?xml version="1.0" encoding="UTF-16"?><a/>'), 'application/xml'), code('unsupported_response_encoding'));
  assert.throws(() => decodeGeminiXml(new TextEncoder().encode('<?xml version="1.0" encoding="US-ASCII"?><a>æ</a>'), 'application/xml'), code('unsupported_response_encoding'));
  assert.throws(() => decodeGeminiXml(new Uint8Array(), 'text/html'), code('unsupported_upstream_mime'));
});
test('empty parsed collections are valid complete pairs', async () => {
  const client = makeClient({ parseGml: () => ({ records: [], counts: { records: 0 } }) });
  assert.deepEqual((await client({ bbox, credentials })).counts, { lines: 0, points: 0, total: 0 });
});
test('wrong feature type, parser and display failures reject the pair without partial data', async () => {
  await assert.rejects(makeClient({ parseGml: () => parsed('gemini:VA_MPNT') })({ bbox, credentials }), code('unexpected_feature_type'));
  await assert.rejects(makeClient({ parseGml: () => { throw new GeminiGmlError('invalid-xml'); } })({ bbox, credentials }), (error) => {
    assert.equal(error.parserCode, 'invalid-xml'); return code('gml_parser_error')(error);
  });
  await assert.rejects(makeClient({ buildDisplay: () => { throw new Error(credentials.password); } })({ bbox, credentials }), code('display_projection_error'));
  await assert.rejects(makeClient({ parseGml: () => { throw new Error(credentials.password); } })({ bbox, credentials }), code('gml_parser_error'));
});
test('proxy error codes are allowlisted and provider messages/exception text never escape', async () => {
  for (const [status, expected] of [[401, 'authentication_failed'], [403, 'permission_denied'], [429, 'provider_rate_limited'], [504, 'timeout'], [500, 'proxy_request_failed']]) {
    const client = makeClient({ fetchProxy: async () => new Response(credentials.password, { status }) });
    await assert.rejects(client({ bbox, credentials }), code(expected));
  }
  const client = makeClient({ fetchProxy: async () => Response.json({ code: 'response_too_large', message: credentials.password }, { status: 502 }) });
  await assert.rejects(client({ bbox, credentials }), code('response_too_large'));
  await assert.rejects(makeClient({ fetchProxy: async () => { throw new Error(credentials.password); } })({ bbox, credentials }), code('proxy_request_failed'));
  await assert.rejects(makeClient({ fetchProxy: async () => Response.json({ code: credentials.password }, { status: 502 }) })({ bbox, credentials }), code('proxy_request_failed'));
});
test('one failed request cancels its sibling; ignoring transport cannot delay failure', async () => {
  const signals = [];
  const client = makeClient({ fetchProxy: async (_url, init) => {
    signals.push(init.signal);
    if (JSON.parse(init.body).featureType === 'lines') return new Response('', { status: 401 });
    return new Promise(() => {});
  } });
  await assert.rejects(client({ bbox, credentials }), code('authentication_failed'));
  assert.equal(signals.length, 2); assert(signals.every((signal) => signal.aborted));
});
test('deadline and cancellation cover stalled transports and stalled response streams', async () => {
  await assert.rejects(makeClient({ timeoutMs: 10, fetchProxy: () => new Promise(() => {}) })({ bbox, credentials }), code('timeout'));
  await assert.rejects(makeClient({ timeoutMs: 10, fetchProxy: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/xml' } }) })({ bbox, credentials }), code('timeout'));
  const controller = new AbortController();
  const pending = makeClient({ fetchProxy: () => new Promise(() => {}) })({ bbox, credentials, signal: controller.signal });
  controller.abort(); await assert.rejects(pending, code('request_aborted'));
  let called = 0;
  await assert.rejects(makeClient({ fetchProxy: () => { called++; } })({ bbox, credentials, signal: controller.signal }), code('request_aborted'));
  assert.equal(called, 0);
});
test('declared and streamed sizes are bounded even with misleading/missing content-length', async () => {
  await assert.rejects(makeClient({ fetchProxy: async () => xmlResponse('lines', { 'Content-Length': String(3 * 1024 * 1024 + 1) }) })({ bbox, credentials }), code('response_too_large'));
  for (const headers of [{}, { 'Content-Length': '1' }]) {
    await assert.rejects(makeClient({ fetchProxy: async () => xmlResponse(new Uint8Array(3 * 1024 * 1024 + 1), headers) })({ bbox, credentials }), code('response_too_large'));
  }
  await assert.rejects(makeClient({ fetchProxy: async () => xmlResponse('', { 'Content-Length': 'invalid' }) })({ bbox, credentials }), code('invalid_upstream_response'));
});
test('invalid bbox/credentials fail before dispatch; password whitespace is preserved', async () => {
  let called = 0;
  const client = makeClient({ fetchProxy: () => { called++; } });
  await assert.rejects(client({ bbox, credentials: null }), code('invalid_credentials'));
  for (const username of ['', 'a:b', 'a\n', 'a\u200b', '\ud800']) {
    await assert.rejects(client({ bbox, credentials: { username, password: 'synthetic' } }), code('invalid_credentials'));
  }
  await assert.rejects(client({ bbox: [0, 0, 1, 1], credentials }), code('invalid_bbox'));
  assert.equal(called, 0);
});
