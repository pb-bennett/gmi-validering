import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GEMINI_FEATURE_NAMESPACE, GEMINI_GML_LIMITS, GeminiGmlError,
  normalizeGeminiCrs, parseGeminiGml,
} from '../src/lib/gemini-wfs/parseGeminiGml.mjs';
import { collection } from './fixtures/gemini-wfs/syntheticProfile.mjs';

test('profile namespace is the user-confirmed XSD URI and browser limits are fixed', () => {
  assert.equal(GEMINI_FEATURE_NAMESPACE, 'http://www.powel.com/gemini');
  assert.deepEqual(GEMINI_GML_LIMITS, { bytes: 3 * 1024 * 1024, features: 2000,
    coordinates: 100000, nodes: 300000, depth: 16, fieldsPerFeature: 128 });
  assert.equal(Object.isFrozen(GEMINI_GML_LIMITS), true);
});

test('input types, unsafe declarations and byte excess fail before XML parser invocation', () => {
  let calls = 0;
  const parseXml = () => { calls += 1; throw new Error('Parser must not run'); };
  for (const input of [null, {}, new Uint8Array([60])]) {
    assert.throws(() => parseGeminiGml(input, { parseXml }), { code: 'invalid-xml' });
  }
  for (const input of ['<!DOCTYPE root>' + collection(), '<!ENTITY x "test">' + collection()]) {
    assert.throws(() => parseGeminiGml(input, { parseXml }), { code: 'unsafe-xml' });
  }
  assert.throws(() => parseGeminiGml('ø'.repeat(GEMINI_GML_LIMITS.bytes / 2 + 1), { parseXml }), { code: 'parser-limit' });
  assert.equal(calls, 0);
});

test('injected XML parser exceptions are sanitized rather than returned or logged', (t) => {
  const logs = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args));
  const detail = 'UNTRUSTED_XML_PROVIDER_DETAIL';
  let caught;
  try { parseGeminiGml(collection(), { parseXml: () => { throw new Error(detail); } }); }
  catch (error) { caught = error; }
  assert.equal(caught.code, 'invalid-xml');
  assert.equal(String(caught).includes(detail), false);
  assert.equal(JSON.stringify(caught).includes(detail), false);
  assert.equal(logs.length, 0);
});

test('missing native XML parser has an explicit error, not server-side XML fallback', () => {
  if (typeof globalThis.DOMParser !== 'function') {
    assert.throws(() => parseGeminiGml(collection()), { code: 'xml-parser-unavailable' });
  }
});

test('CRS spellings normalize only the supported EPSG syntax', () => {
  for (const value of ['EPSG:25832', 'urn:ogc:def:crs:EPSG::25832',
    'http://www.opengis.net/def/crs/EPSG/0/25832', 'https://www.opengis.net/def/crs/epsg/0/25832']) {
    assert.equal(normalizeGeminiCrs(value), 'EPSG:25832');
  }
  for (const value of [null, '', '25832', 'https://attacker.invalid/25832', 'EPSG:25832junk']) {
    assert.equal(normalizeGeminiCrs(value), null);
  }
});

test('error codes and messages are fixed and do not reflect unknown caller input', () => {
  const error = new GeminiGmlError('UNTRUSTED_ERROR_CONTENT');
  assert.equal(error.name, 'GeminiGmlError');
  assert.equal(error.code, 'invalid-xml');
  assert.equal(String(error).includes('UNTRUSTED_ERROR_CONTENT'), false);
});
