import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const {
  clearValidationV2FieldDataCache,
  composeFieldInformation,
  getFieldInformation,
  getValidationV2FieldDataCacheStats,
  getValidationV2FieldDataSummary,
  getValidationRule,
  runGmiValidationV2,
} = api;
const { createValidationV2Input } = await import('../src/lib/validation-v2/uiIntegration.js');
const { GMI_SOURCE_LEXEMES } = await import('../src/lib/parsing/gmiLexicalEvidence.js');

function makeLayer(id, points, fieldKeys = ['Høydereferanse']) {
  return {
    id,
    data: {
      format: 'GMI',
      fieldAnalysis: { points: Object.fromEntries(fieldKeys.map((key) => [key, {}])), lines: {} },
      points,
      lines: [],
    },
  };
}

function runLayer(layer) {
  const input = createValidationV2Input(layer);
  return { input, result: runGmiValidationV2(input) };
}

function addLexeme(attributes, field, lexeme) {
  Object.defineProperty(attributes, GMI_SOURCE_LEXEMES, {
    value: Object.freeze({ [field]: lexeme }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return attributes;
}

test('field information composes documentation with executable rule metadata', () => {
  const rule = getValidationRule('innmaling.common.height-reference.valid');
  const field = composeFieldInformation({
    canonicalFieldId: 'heightReference',
    geometryScope: 'point',
    rule,
  });
  assert.equal(field.displayName, 'Høydereferanse');
  assert.equal(field.directGmiSourceKey, 'Høydereferanse');
  assert.equal(field.required, true);
  assert.deepEqual(field.allowedValues, rule.allowedValues);
  assert.notEqual(field.allowedValues, getFieldInformation('heightReference').valueInfo);

  const tema = composeFieldInformation({
    canonicalFieldId: 'tema',
    geometryScope: 'point',
    rule: getValidationRule('innmaling.point.tema.required'),
  });
  assert.deepEqual(tema.allowedValues, []);
  assert.equal(tema.description, null);
  assert.equal(getFieldInformation('tema').documentationStatus, 'PARTIAL');
});

test('field data is lazy, cached, current-result-bound, and does not mutate the result', () => {
  clearValidationV2FieldDataCache();
  const layer = makeLayer('field-data-cache', [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG' } }]);
  const { input, result } = runLayer(layer);
  const before = JSON.stringify(result);
  assert.equal(getValidationV2FieldDataCacheStats(input.dataset).size, 0);
  const first = getValidationV2FieldDataSummary({
    ...input,
    result,
    geometryScope: 'point',
    canonicalFieldId: 'heightReference',
    rule: getValidationRule('innmaling.common.height-reference.valid'),
  });
  const second = getValidationV2FieldDataSummary({
    ...input,
    result,
    geometryScope: 'point',
    canonicalFieldId: 'heightReference',
    rule: getValidationRule('innmaling.common.height-reference.valid'),
  });
  assert.equal(first, second);
  assert.equal(getValidationV2FieldDataCacheStats(input.dataset).size, 1);
  assert.equal(first.objectCount, 1);
  assert.equal(first.withValueCount, 1);
  assert.equal(first.missingCount, 0);
  assert.equal(first.unresolvedCount, 0);
  assert.equal(first.sourceColumn, 'Høydereferanse');
  assert.equal(first.rows[0].ruleAcceptance, 'Gyldig');
  assert.equal(JSON.stringify(result), before);
  assert.throws(() => getValidationV2FieldDataSummary({
    ...input,
    result: { ...result, datasetRevision: 'stale' },
    geometryScope: 'point',
    canonicalFieldId: 'heightReference',
    rule: getValidationRule('innmaling.common.height-reference.valid'),
  }), /current Validator 2\.0 result/);
});

test('delivered lexemes remain separate and current evaluator semantics are reused', () => {
  clearValidationV2FieldDataCache();
  const lexemes = ['1', '01', '1.0', ' 1', '1 '];
  const points = lexemes.map((lexeme) => ({
    attributes: addLexeme({ Synbarhet: 1 }, 'Synbarhet', lexeme),
  }));
  const layer = makeLayer('lexeme-data', points, ['Synbarhet']);
  const { input, result } = runLayer(layer);
  const summary = getValidationV2FieldDataSummary({
    ...input,
    result,
    geometryScope: 'point',
    canonicalFieldId: 'visibility',
    rule: getValidationRule('innmaling.common.visibility.valid'),
  });
  assert.equal(summary.uniqueValueCount, 5);
  assert.equal(summary.rows.length, 5);
  assert.deepEqual(summary.rows.map((row) => row.deliveredValue).sort(), lexemes.map(JSON.stringify).sort());
  assert.equal(summary.rows.find((row) => row.deliveredValue === '"1"').ruleAcceptance, 'Gyldig');
  assert.equal(summary.rows.filter((row) => row.ruleAcceptance === 'Ugyldig').length, 4);
});

test('missing and unresolved field data preserve deliberate buckets', () => {
  const layer = makeLayer('missing-data', [
    { attributes: { Høydereferanse: '' } },
    { attributes: { Høydereferanse: null } },
    { attributes: {} },
  ]);
  const { input, result } = runLayer(layer);
  const summary = getValidationV2FieldDataSummary({
    ...input,
    result,
    geometryScope: 'point',
    canonicalFieldId: 'heightReference',
    rule: getValidationRule('innmaling.common.height-reference.valid'),
  });
  assert.equal(summary.objectCount, 3);
  assert.equal(summary.withValueCount, 0);
  assert.equal(summary.missingCount, 3);
  assert.equal(summary.unresolvedCount, 0);
  assert.deepEqual(summary.rows.map((row) => row.deliveredValue).sort(), ['⟨tom⟩', '⟨null⟩', '⟨ikke levert⟩'].sort());

  const unresolvedLayer = {
    id: 'unresolved-data',
    data: { format: 'GMI', points: [{ attributes: null }], lines: [] },
  };
  const unresolved = runLayer(unresolvedLayer);
  const unresolvedSummary = getValidationV2FieldDataSummary({
    ...unresolved.input,
    result: unresolved.result,
    geometryScope: 'point',
    canonicalFieldId: 'heightReference',
    rule: getValidationRule('innmaling.common.height-reference.valid'),
  });
  assert.equal(unresolvedSummary.missingCount, 0);
  assert.equal(unresolvedSummary.unresolvedCount, 1);
  assert.equal(unresolvedSummary.rows[0].deliveredValue, '⟨kan ikke fastslås⟩');
});

test('field data caps visible rows and keeps cache bounded', () => {
  clearValidationV2FieldDataCache();
  const points = Array.from({ length: 501 }, (_, index) => ({
    attributes: { Høydereferanse: `VALUE_${index}` },
  }));
  const layer = makeLayer('large-field-data', points);
  const { input, result } = runLayer(layer);
  const summary = getValidationV2FieldDataSummary({
    ...input,
    result,
    geometryScope: 'point',
    canonicalFieldId: 'heightReference',
    rule: getValidationRule('innmaling.common.height-reference.valid'),
  });
  assert.equal(summary.uniqueValueCount, 501);
  assert.equal(summary.rows.length, 500);
  assert.equal(summary.omittedRowCount, 1);
  assert.equal(summary.maxVisibleRows, 500);

  const cacheRules = api.getValidationRules().slice(0, 9);
  for (const rule of cacheRules) {
    getValidationV2FieldDataSummary({
      ...input,
      result,
      geometryScope: 'point',
      canonicalFieldId: rule.canonicalFieldId,
      rule,
    });
  }
  assert.equal(getValidationV2FieldDataCacheStats(input.dataset).size, 8);
});

test('field data stays geometry-local and reuses the existing line binding', () => {
  const layer = {
    id: 'line-field-data',
    data: {
      format: 'GMI',
      fieldAnalysis: { points: {}, lines: { Dimensjon: {} } },
      points: [],
      lines: [{ attributes: { Dimensjon: 110 } }],
    },
  };
  const { input, result } = runLayer(layer);
  const summary = getValidationV2FieldDataSummary({
    ...input,
    result,
    geometryScope: 'line',
    canonicalFieldId: 'dimension',
    rule: getValidationRule('innmaling.line.dimension.required'),
  });
  assert.equal(summary.geometryScope, 'line');
  assert.equal(summary.sourceColumn, 'Dimensjon');
  assert.equal(summary.objectCount, 1);
  assert.equal(summary.withValueCount, 1);
});

test('field information modal has the approved dialog, tabs, lazy data seam, and bounded table contract', async () => {
  const source = await readFile(new URL(
    '../src/components/validation-v2/ValidationV2FieldInfoModal.js', import.meta.url,
  ), 'utf8');
  const workspace = await readFile(new URL(
    '../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url,
  ), 'utf8');
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby/);
  assert.match(source, /Escape/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /getValidationV2FieldDataSummary/);
  assert.match(source, /Viser \{summary\.maxVisibleRows\} av/);
  assert.match(source, /Levert verdi/);
  assert.match(source, /Regelverdi/);
  assert.match(workspace, /composeFieldInformation/);
  assert.match(workspace, /ValidationV2FieldInfoModal/);
  assert.match(workspace, /onInfo/);
});
