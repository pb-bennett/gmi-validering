import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createGeminiSourceLookup, geminiFieldText, getGeminiPopupRows, createGeminiPopupContent } from '../src/lib/gemini-wfs/geminiPopupContent.mjs';
import { lineValues, pointValues } from './fixtures/gemini-wfs/popupProfile.mjs';

const record = (values = {}, point = false, z = 0) => Object.freeze({
  key: point ? 'point-key' : 'line-key', typeName: point ? 'gemini:VA_MPNT' : 'gemini:VA_LINE',
  attributes: Object.freeze(Object.fromEntries(Object.entries(values).map(([name, value]) =>
    [name, Object.freeze(value && typeof value === 'object' ? value : { state: 'text', rawText: value })]))),
  geometry: Object.freeze({ type: point ? 'Point' : 'LineString', dimension: z === null ? 2 : 3,
    coordinates: Object.freeze(point ? z === null ? [1, 2] : [1, 2, z] : [[1, 2, 0], [3, 4, 0]]) }),
});
const pair = (lines = [], points = []) => ({ lines: { source: { records: lines } }, points: { source: { records: points } } });

test('lookup resolves both source keys to original immutable records and rejects missing/wrong type', () => {
  const line = record(lineValues), point = record(pointValues, true), result = pair([line], [point]);
  const before = JSON.stringify(result), lookup = createGeminiSourceLookup(result);
  assert.strictEqual(lookup(line.key, line.typeName), line);
  assert.strictEqual(lookup(point.key, point.typeName), point);
  for (const key of [undefined, null, '', 'missing', '__proto__']) assert.equal(lookup(key, line.typeName), null);
  assert.equal(lookup(line.key, point.typeName), null);
  assert.equal(JSON.stringify(result), before);
  assert.equal(createGeminiSourceLookup(null)('missing', line.typeName), null);
});

test('duplicate keys fail closed for any multiplicity, including across sides', () => {
  const line = record(), point = { ...record({}, true), key: line.key };
  for (const result of [pair([line, line]), pair([line, line, line]), pair([line], [point])]) {
    assert.equal(createGeminiSourceLookup(result)(line.key, line.typeName), null);
  }
});

test('result replacement derives a new lookup without transformed/cached old records', async () => {
  const old = record({ LSID: '0001' }), next = record({ LSID: '0002' });
  assert.strictEqual(createGeminiSourceLookup(pair([old]))(old.key, old.typeName), old);
  assert.strictEqual(createGeminiSourceLookup(pair([next]))(old.key, old.typeName), next);
  const source = await readFile(new URL('../src/components/gemini-wfs/GeminiReferenceLayer.js', import.meta.url), 'utf8');
  assert.match(source, /useMemo\(\(\) => createGeminiSourceLookup\(result\), \[result\]\)/);
});

test('M2 absent/nil/empty/whitespace omitted, zero values retained, title fallback exact', () => {
  const source = record({ NIL: { state: 'nil', rawText: '' }, EMPTY: { state: 'empty', rawText: '' },
    SPACE: '  ', ZERO: 0, TEXT_ZERO: '0', FCODE: '001', FCODE_TITLE: 'Rør ÆØÅ' });
  for (const key of ['MISSING', 'NIL', 'EMPTY', 'SPACE']) assert.equal(geminiFieldText(source, key), null);
  assert.equal(geminiFieldText(source, 'ZERO'), '0'); assert.equal(geminiFieldText(source, 'TEXT_ZERO'), '0');
  assert.equal(geminiFieldText(source, 'FCODE_TITLE', 'FCODE'), 'Rør ÆØÅ');
  assert.equal(geminiFieldText(source, 'NIL', 'FCODE'), '001');
});

test('line curated fields prefer titles and retain source precision/leading zero ID', () => {
  const source = record(lineValues), before = JSON.stringify(source);
  assert.deepEqual(getGeminiPopupRows(source), [
    ['Type', lineValues.FCODE_TITLE], ['Nettype', 'Vann'], ['Dimensjon', '160.00'], ['Materiale', 'PE'],
    ['År', '1980'], ['Status', 'I drift'], ['Eier', 'Færder ÆØÅ'], ['Ansvarlig', lineValues.RESPONSIBLE_TITLE],
    ['Lengde', '0'], ['Gemini-ID', '000123'],
  ].map(([label, value]) => ({ label, value })));
  assert.equal(JSON.stringify(source), before);
});

test('point fields retain distinct types, function/style, dimensions and independent cover/geometry zero', () => {
  const source = record(pointValues, true);
  assert.deepEqual(Object.fromEntries(getGeminiPopupRows(source).map(({ label, value }) => [label, value])), {
    Type: 'Avløpskum', Punkttype: 'Kum ÆØÅ', Funksjon: 'Inspeksjon', Utførelse: 'Betong', Stasjon: '0007',
    Bredde: '0', Lengde: '1.50', 'Kote lokk': '17.75', Geometrikote: '0', År: '2001', Status: 'I drift',
    Eier: 'Færder ÆØÅ', Ansvarlig: 'Kommunen', 'Gemini-ID': '000456',
  });
});

test('cover and geometry never substitute, interpolate, or hide disagreement', () => {
  const rows = (values, z) => Object.fromEntries(getGeminiPopupRows(record(values, true, z)).map(({ label, value }) => [label, value]));
  assert.deepEqual(rows({ COVER_Z: '17.75' }, 12.5), { 'Kote lokk': '17.75', Geometrikote: '12.5' });
  assert.deepEqual(rows({ COVER_Z: '0' }, null), { 'Kote lokk': '0' });
  assert.deepEqual(rows({}, 0), { Geometrikote: '0' });
  assert.deepEqual(rows({}, null), {});
});

test('semantic content uses inert text with no provider links, raw internals or survey actions', async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.textContent = ''; }
    appendChild(child) { this.children.push(child); }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  try {
    const source = record(lineValues), before = JSON.stringify(source), dom = createGeminiPopupContent(source);
    const nodes = (node) => [node, ...node.children.flatMap(nodes)];
    assert.equal(dom.tag, 'section'); assert.equal(dom.children[0].tag, 'h2');
    assert.equal(dom.children[0].textContent, 'Eksisterende ledning');
    assert(nodes(dom).some((node) => node.textContent === 'Gemini WFS · eksisterende anlegg'));
    assert.equal(nodes(dom).filter((node) => node.textContent === lineValues.RESPONSIBLE_TITLE).length, 1);
    assert(!nodes(dom).some((node) => ['img', 'a', 'button', 'script'].includes(node.tag)));
    assert(!JSON.stringify(dom).includes('HIDDEN_')); assert.equal(JSON.stringify(source), before);
    assert.equal(createGeminiPopupContent(record({}, true)).children[0].textContent, 'Eksisterende punkt');
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
  const source = await readFile(new URL('../src/lib/gemini-wfs/geminiPopupContent.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|href|createFeaturePopupContent|fetch\(/);
});
