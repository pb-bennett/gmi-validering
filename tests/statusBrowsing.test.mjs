import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { STATUS_LABELS, getStatusLabel, formatStatusChoice } from '../src/lib/statusDomain.mjs';

register('./esmJsLoader.mjs', import.meta.url);
const { SOSIParser } = await import('../src/lib/parsing/sosiParser.js');
const { createAttributeColumnAccessors } = await import('../src/lib/objectTablePresentation.js');
const sources = Object.fromEntries(await Promise.all(['Sidebar', 'LayerPanel', 'MapInner'].map(async (name) =>
  [name, await readFile(new URL(`../src/components/${name}.js`, import.meta.url), 'utf8')])));

// Exercise the existing embedded field discovery and map predicate without a React/browser runtime.
const sidebarAnalysis = sources.Sidebar.split('// Analyze fields separately for points and lines')[1].split('    return {')[0];
const layerAnalysis = sources.LayerPanel.split('    const analysis = {')[1].split('    return analysis;')[0];
const analyzeSidebar = new Function('data', `${sidebarAnalysis}; return fieldAnalysis;`);
const analyzeLayer = new Function('data', `const analysis = {${layerAnalysis}; return analysis;`);
const mapPredicate = sources.MapInner.split('const isHiddenByFeltFilter = useCallback(')[1].split('    [feltFilterActive, feltHiddenValues]')[0].trim().replace(/,$/, '');
const hiddenByFilter = new Function('feltFilterActive', 'feltHiddenValues', `return (${mapPredicate});`);

test('status domain labels and raw unknown fallback never invent missing values', () => {
  assert.equal(Object.keys(STATUS_LABELS).length, 13);
  for (const [code, label] of [['D', 'Drift'], ['N', 'Nedlagt'], ['EF', 'Erstattet fjernet'], ['MIDLUTED', 'Midlertidig ute av drift']]) {
    assert.equal(getStatusLabel(code), label);
    assert.equal(formatStatusChoice(code), `${code} · ${label}`);
  }
  for (const code of ['XYZ', 'constructor', '__proto__']) {
    assert.equal(getStatusLabel(code), code);
    assert.equal(formatStatusChoice(code), code);
  }
  for (const missing of [undefined, null, '', '   ']) {
    assert.equal(getStatusLabel(missing), null);
    assert.equal(formatStatusChoice(missing), null);
  }
});

const codes = ['D', 'N', 'F', 'EF', 'EN', 'XYZ'];
const data = {
  points: codes.map((Status) => ({ attributes: { Status } })).concat({ attributes: {} }),
  lines: codes.map((Status) => ({ attributes: { Status } })).concat({ attributes: {} }),
};

test('both existing field lists discover canonical Status and keep every distinct code', () => {
  for (const analyze of [analyzeSidebar, analyzeLayer]) {
    const analysis = analyze(data);
    for (const geometry of ['points', 'lines']) {
      assert.ok(analysis[geometry].fieldOrder.includes('Status'));
      for (const code of codes) assert.equal(analysis[geometry].fields.Status.valueCounts[code], 1);
    }
    assert.equal(analyze({ points: [{ attributes: {} }], lines: [] }).points.fieldOrder.includes('Status'), false);
  }
  assert.equal(analyzeSidebar(data).points.fields.Status.valueCounts['(Mangler)'], 1);
  for (const name of ['Sidebar', 'LayerPanel']) {
    assert.match(sources[name], /fieldName === 'Status' \? formatStatusChoice\(value\) : value/);
    assert.match(sources[name], /item\.value === value/);
  }
});

test('existing map filtering preserves exact codes, geometry, missing values and layer/global scope', () => {
  const hide = (value, objectType) => ({ fieldName: 'Status', value, objectType });
  for (const objectType of ['points', 'lines']) {
    for (const target of codes) {
      const rules = codes.filter((code) => code !== target).map((code) => hide(code, objectType));
      const global = hiddenByFilter(true, rules);
      for (const Status of codes) {
        assert.equal(global({ properties: { Status } }, objectType), Status !== target);
        const feature = { properties: { Status, _layerFeltHiddenValues: rules } };
        assert.equal(hiddenByFilter(false, [])(feature, objectType), Status !== target);
        assert.equal(global(feature, objectType === 'points' ? 'lines' : 'points'), false);
      }
      assert.equal(global({ properties: {} }, objectType), false);
      assert.equal(hiddenByFilter(false, rules)({ properties: { Status: 'N' } }, objectType), false);
      assert.equal(global({ properties: { Status: target, _layerFeltHiddenValues: [hide(target, objectType)] } }, objectType), true);
    }
    assert.equal(hiddenByFilter(true, [hide('(Mangler)', objectType)])({ properties: {} }, objectType), true);
  }
});

test('SOSI parser and normalized attributes expose additive Status for both geometries', () => {
  const features = [
    { geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] }, properties: { EGS_LEDNING: { status: 'D' } } },
    { geometry: { type: 'Point', coordinates: [1, 2] }, properties: { EGS_PUNKT: { status: 'XYZ' } } },
    { geometry: { type: 'Point', coordinates: [1, 2] }, properties: { objekttypenavn: 'VADriftsdata' } },
  ];
  const parsed = new SOSIParser('', () => ({ parse: () => ({ dumps: () => ({ features }) }) })).parse();
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.lines[0].attributes.Status, 'D');
  assert.equal(parsed.points[0].attributes.Status, 'XYZ');
  assert.strictEqual(parsed.lines[0].attributes.EGS_LEDNING, features[0].properties.EGS_LEDNING);
  assert.strictEqual(parsed.points[0].attributes.EGS_PUNKT, features[1].properties.EGS_PUNKT);
  assert.equal(Object.hasOwn(parsed.points[1].attributes, 'Status'), false);
  const statusColumn = createAttributeColumnAccessors(Object.keys(parsed.lines[0].attributes)).find((column) => column.id === 'Status');
  assert.equal(statusColumn.accessorFn(parsed.lines[0]), 'D');
  assert.equal(statusColumn.accessorFn(parsed.points[0]), 'XYZ');
  assert.equal(statusColumn.accessorFn(parsed.points[1]), undefined);
});
