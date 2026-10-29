import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGeminiGml } from '../src/lib/gemini-wfs/parseGeminiGml.mjs';
import { parseNodeXml } from '../src/lib/gemini-wfs/nodeXmlParser.mjs';
import { createGeminiGmlChecks } from './browser/geminiGmlChecks.mjs';
import { collection, feature, field } from './fixtures/gemini-wfs/syntheticProfile.mjs';

test('same M2 source/display contract with the production Node XML adapter (synthetic only)', async (t) => {
  for (const [name, check] of createGeminiGmlChecks((xml) => parseGeminiGml(xml, { parseXml: parseNodeXml }))) {
    await t.test(name, check);
  }
});

test('Node adapter stops on malformed XML without diagnostics or resource loading', (t) => {
  const logs = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => { requests += 1; throw new Error('Unexpected resource load'); });
  for (const xml of ['<a/>trailing', '<a/><b/>', '<a x=unquoted/>', '<a><b></a>',
    '<a x="1" x="2"/>', '<a>&unknown;</a>', '<unbound:a/>', '<a></a garbage>',
    '<?xml invalid?>' + collection(), '<!--before--><?xml version="1.0"?>' + collection(),
    '<?xml version="1.0"?><?xml version="1.0"?>' + collection()]) {
    assert.throws(() => parseGeminiGml(xml, { parseXml: parseNodeXml }), { code: 'invalid-xml' });
  }
  const xml = collection([feature({ fields: field('TITLE', '<script src="https://blocked.invalid/x"/>') })], {
    attributes: 'xsi:schemaLocation="http://www.powel.com/gemini https://blocked.invalid/schema"',
  });
  const source = parseGeminiGml(xml, { parseXml: parseNodeXml });
  assert.equal(source.counts.points, 1);
  assert.equal(requests, 0);
  assert.deepEqual(logs, []);
});
