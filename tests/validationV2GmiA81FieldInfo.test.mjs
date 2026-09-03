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
const {
  EXPECTED_LINE_TEMA_VALUES,
  EXPECTED_MATERIAL_VALUES,
  EXPECTED_POINT_TEMA_VALUES,
  EXPECTED_TYPE_VALUES,
} = await import('./fixtures/validationV2GmiV32DomainValues.mjs');
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
  assert.deepEqual(tema.allowedValues, EXPECTED_POINT_TEMA_VALUES);
  assert.equal(tema.description, null);
  assert.equal(getFieldInformation('tema').documentationStatus, 'COMPLETE');
  assert.deepEqual(composeFieldInformation({
    canonicalFieldId: 'tema',
    geometryScope: 'line',
    rule: getValidationRule('innmaling.line.tema.required'),
  }).allowedValues, EXPECTED_LINE_TEMA_VALUES);
  const type = composeFieldInformation({
    canonicalFieldId: 'type',
    geometryScope: 'point',
    rule: getValidationRule('innmaling.point.type.valid'),
  });
  assert.equal(type.required, false);
  assert.equal(type.requiredness, 'NOT_REQUIRED');
  assert.deepEqual(type.allowedValues, EXPECTED_TYPE_VALUES);

  for (const [canonicalFieldId, ruleId] of [
    ['measurementMethod', 'innmaling.common.measurement-method.required'],
    ['heightMeasurementMethod', 'innmaling.common.height-measurement-method.required'],
    ['verticalLevel', 'innmaling.common.vertical-level.required'],
  ]) {
    const presenceOnly = composeFieldInformation({
      canonicalFieldId,
      geometryScope: 'line',
      rule: getValidationRule(ruleId),
    });
    assert.equal(presenceOnly.requiredness, 'REQUIRED', canonicalFieldId);
    if (canonicalFieldId === 'measurementMethod' || canonicalFieldId === 'heightMeasurementMethod' || canonicalFieldId === 'verticalLevel') {
      assert.equal(presenceOnly.allowedValues.length,
        canonicalFieldId === 'measurementMethod' ? 69 : canonicalFieldId === 'heightMeasurementMethod' ? 35 : 7);
      assert.equal(Object.keys(getFieldInformation(canonicalFieldId).valueInfo).length,
        canonicalFieldId === 'measurementMethod' ? 69 : canonicalFieldId === 'heightMeasurementMethod' ? 35 : 7);
    } else {
      assert.deepEqual(presenceOnly.allowedValues, [], canonicalFieldId);
      assert.deepEqual(getFieldInformation(canonicalFieldId).valueInfo, {}, canonicalFieldId);
    }
  }
});

test('v3.2 Field Info has the reviewed field and per-value provenance', () => {
  const sourceContract = {
    heightReference: [['appendix-a', '4, 6'], ['main-instruction', '10, 13–18']],
    measurementMethod: [['appendix-a', '4, 6–7, 23–25']],
    heightMeasurementMethod: [['appendix-a', '4, 7, 25–27']],
    verticalLevel: [['appendix-a', '4, 9']],
    installationYear: [['appendix-a', '4, 6']],
    captureDate: [['appendix-a', '4, 6']],
    surveyedBy: [['appendix-a', '4, 6']],
    caseNumber: [['appendix-a', '4, 6']],
    horizontalAccuracy: [['appendix-a', '4, 6'], ['main-instruction', '10']],
    verticalAccuracy: [['appendix-a', '4, 6'], ['main-instruction', '10']],
    maxHorizontalDeviation: [['appendix-a', '4, 6'], ['main-instruction', '5, 10']],
    maxVerticalDeviation: [['appendix-a', '4, 6'], ['main-instruction', '5, 10']],
    positioningCondition: [['appendix-a', '4, 7–8']],
    positioningCause: [['appendix-a', '4, 8'], ['main-instruction', '9–10, 18']],
    visibility: [['appendix-a', '4, 8']],
    tema: [['appendix-a', '4, 10–12; line 16–19']],
    insideOutside: [['appendix-a', '4, 14; line 21']],
    wallThickness: [['appendix-a', '5, 9; line 16']],
    material: [['appendix-a', '5, 19–21']],
    type: [['appendix-a', '4, 12–14']],
    nobbVavvsNumber: [['appendix-a', '5, 10; line 16']],
    nobbVavvsFrameNumber: [['appendix-a', '5, 10']],
    dimension: [['appendix-a', '5, 16']],
    networkType: [['appendix-a', '5, 19']],
    pipeShape: [['appendix-a', '5, 21']],
  };
  for (const [fieldId, expected] of Object.entries(sourceContract)) {
    const sources = getFieldInformation(fieldId).sources;
    assert.deepEqual(sources.map(({ documentId, pages }) => [documentId, pages]), expected, fieldId);
    for (const source of sources) {
      assert.equal(source.version, source.documentId === 'appendix-a'
        ? '3.2 / 01.08.2026'
        : '3.2 / august 2026', fieldId);
    }
  }

  const valueSourceContract = {
    measurementMethod: {
      values: ['10', '11', '12', '13', '14', '15', '18', '19', '20', '21', '22', '23', '24', '30', '31', '32', '33', '34', '35', '36', '37', '38', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '77', '78', '79', '80', '81', '82', '90', '91', '92', '93', '94', '95', '96', '97', '99'],
      source: ['appendix-a', '23–25'],
    },
    heightMeasurementMethod: {
      values: ['10', '11', '12', '13', '14', '15', '18', '19', '20', '21', '22', '23', '24', '36', '60', '61', '62', '63', '64', '66', '67', '68', '69', '70', '74', '78', '79', '90', '91', '92', '93', '94', '95', '96', '99'],
      source: ['appendix-a', '25–27'],
    },
    verticalLevel: {
      values: ['UNDER_GRUNN', 'PÅ_GRUNN_VANNOVERF', 'OVER_GRUNN', 'PÅ_BUNN', 'I_VANNSØYL', 'SLISSING', 'UNDER_BUNN'],
      source: ['appendix-a', '4, 9'],
    },
    heightReference: {
      values: ['BUNN_INNVENDIG', 'PÅ_BAKKEN', 'SENTER', 'TOPP_INNVENDIG', 'TOPP_UTVENDIG', 'UKJENT', 'UNDERKANT_UTVENDIG'],
      source: ['main-instruction', '10, 13–18'],
    },
    positioningCondition: {
      values: ['DELV_LUKK_GRØ', 'I_TUNNEL', 'I_VANN', 'IKKE_STEDF', 'LUKK_GRØ', 'OVERFL_VANN', 'POS_FRA_KUM', 'PÅVI', 'ÅPEN_GRØ', 'ÅPEN_KUM'],
      source: ['appendix-a', '7–8'],
    },
    positioningCause: {
      values: ['FJERN', 'FLYTT_DELV', 'FLYTT_HELT', 'NYTT', 'PÅVI', 'UENDR'],
      source: ['appendix-a', '8'],
    },
    visibility: {
      values: ['0', '1', '2', '3'],
      source: ['appendix-a', '8'],
    },
    insideOutside: {
      values: ['ID', 'OD'],
      source: ['appendix-a', '14, 21'],
    },
    networkType: {
      values: ['F', 'H', 'O', 'S', 'S6', 'O1', 'O2', 'S7'],
      source: ['appendix-a', '19'],
    },
    pipeShape: {
      values: ['A', 'E', 'F', 'R', 'S', 'T', 'X'],
      source: ['appendix-a', '21'],
    },
    material: {
      values: EXPECTED_MATERIAL_VALUES,
      source: ['appendix-a', '19–21'],
    },
    type: {
      values: EXPECTED_TYPE_VALUES,
      source: ['appendix-a', '12–14'],
    },
  };
  for (const [fieldId, { values, source }] of Object.entries(valueSourceContract)) {
    const valueInfo = getFieldInformation(fieldId).valueInfo;
    assert.deepEqual(Object.keys(valueInfo), values, fieldId);
    for (const value of values) {
      assert.deepEqual(valueInfo[value].sources.map(({ documentId, pages }) => [documentId, pages]),
        [source], `${fieldId}.${value}`);
    }
  }

  const temaValueInfo = getFieldInformation('tema').byGeometry;
  for (const [geometryScope, values, source] of [
    ['point', EXPECTED_POINT_TEMA_VALUES, ['appendix-a', '10–12']],
    ['line', EXPECTED_LINE_TEMA_VALUES, ['appendix-a', '16–19']],
  ]) {
    const valueInfo = temaValueInfo[geometryScope].valueInfo;
    assert.deepEqual(Object.keys(valueInfo), values, `tema.${geometryScope}`);
    for (const value of values) {
      assert.deepEqual(valueInfo[value].sources.map(({ documentId, pages }) => [documentId, pages]),
        [source], `tema.${geometryScope}.${value}`);
    }
  }

  assert.match(getFieldInformation('visibility').description, /Utgått/);
  assert.deepEqual(getFieldInformation('visibility').sources[0].auditSourceRuleIds, []);
  assert.match(getFieldInformation('nobbVavvsNumber').description, /valgfritt/);
  assert.deepEqual(getFieldInformation('nobbVavvsNumber').sources[0].auditSourceRuleIds, []);
  assert.equal(getFieldInformation('horizontalAccuracy').documentedFormat, 'Heltall');
  assert.equal(getFieldInformation('material').description, 'Materialet på ledningen.');
  assert.deepEqual(getFieldInformation('material').qualifications, []);
  assert.equal(getFieldInformation('material').sources[0].title,
    'Innmålingsinstruks Vedlegg A – Spesifikasjon innmålingsfil');
  assert.equal(composeFieldInformation({
    canonicalFieldId: 'visibility', geometryScope: 'point', rule: null,
  }), null);
  const pointThickness = composeFieldInformation({
    canonicalFieldId: 'wallThickness', geometryScope: 'point',
    rule: getValidationRule('innmaling.point.wall-thickness.required'),
  });
  const lineThickness = composeFieldInformation({
    canonicalFieldId: 'wallThickness', geometryScope: 'line',
    rule: getValidationRule('innmaling.line.wall-thickness.required'),
  });
  assert.equal(pointThickness.documentedFormat, 'Heltall');
  assert.equal(lineThickness.documentedFormat, 'Tall');
  assert.notEqual(pointThickness.description, lineThickness.description);
  assert.deepEqual(composeFieldInformation({
    canonicalFieldId: 'material', geometryScope: 'line',
    rule: getValidationRule('innmaling.line.material.required'),
  }).allowedValues, EXPECTED_MATERIAL_VALUES);
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
  const lexemes = ['F', 'O1', ' O1', 'o1', 'O1 '];
  const lines = lexemes.map((lexeme) => ({
    attributes: addLexeme({ Nett_type: lexeme }, 'Nett_type', lexeme),
  }));
  const layer = makeLayer('lexeme-data', [], ['Nett_type']);
  layer.data.lines = lines;
  layer.data.fieldAnalysis.lines = { Nett_type: {} };
  const { input, result } = runLayer(layer);
  const summary = getValidationV2FieldDataSummary({
    ...input,
    result,
    geometryScope: 'line',
    canonicalFieldId: 'networkType',
    rule: getValidationRule('innmaling.line.network-type.valid'),
  });
  assert.equal(summary.uniqueValueCount, 5);
  assert.equal(summary.rows.length, 5);
  assert.deepEqual(summary.rows.map((row) => row.deliveredValue).sort(), lexemes.map(JSON.stringify).sort());
  assert.equal(summary.rows.find((row) => row.deliveredValue === '"F"').ruleAcceptance, 'Gyldig');
  assert.equal(summary.rows.filter((row) => row.ruleAcceptance === 'Ugyldig').length, 3);
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
