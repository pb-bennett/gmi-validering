import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const { evaluateRequiredAllowedValue, evaluateRequiredField } = await import(
  '../src/lib/validation-v2/ruleEvaluation.js'
);
const { bindGmiLayerSchemaWithRegistry } = await import(
  '../src/lib/validation-v2/gmiLayerSchemaBinding.js'
);
const { extractGmiObjectFieldValue } = await import(
  '../src/lib/validation-v2/objectFieldValue.js'
);
const { createValidationV2ViewController } = await import(
  '../src/lib/validation-v2/validationViewController.js'
);
const { GMIParser } = await import('../src/lib/parsing/gmiParser.js');
const { GMI_SOURCE_LEXEMES } = await import('../src/lib/parsing/gmiLexicalEvidence.js');
const {
  createValidationV2Input,
  getValidationV2GeometrySummary,
} = await import('../src/lib/validation-v2/uiIntegration.js');
const {
  EvaluationState,
  ObjectValueState,
  RuleCategory,
  RuleEvaluatorKind,
  RuleReasonCode,
  RuleSeverity,
  RuleProvenance,
  ValueComparisonPolicy,
  getValidationRules,
  createObjectRef,
  runGmiValidationV2,
} = api;

const COMMON = [
  ['innmaling.common.height-reference.valid', 'Høydereferanse er gyldig', 'heightReference', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '4, 6; main 10, 13–18', ['BUNN_INNVENDIG', 'PÅ_BAKKEN', 'SENTER', 'TOPP_INNVENDIG', 'TOPP_UTVENDIG', 'UKJENT', 'UNDERKANT_UTVENDIG'], ValueComparisonPolicy.EXACT],
  ['innmaling.common.installation-year.required', 'Anleggsår er oppgitt', 'installationYear', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 6', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.capture-date.required', 'Datafangstdato er oppgitt', 'captureDate', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 6', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.surveyed-by.required', 'Innmålt av er oppgitt', 'surveyedBy', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 6', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.case-number.required', 'Saksnummer er oppgitt', 'caseNumber', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 6', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.horizontal-accuracy.required', 'Nøyaktighet XY er oppgitt', 'horizontalAccuracy', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 6; main 10', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.vertical-accuracy.required', 'Nøyaktighet høyde Z er oppgitt', 'verticalAccuracy', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 6; main 10', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.max-horizontal-deviation.required', 'Maksavvik horisontalt er oppgitt', 'maxHorizontalDeviation', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 6; main 5, 10', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.max-vertical-deviation.required', 'Maksavvik vertikalt er oppgitt', 'maxVerticalDeviation', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 6; main 5, 10', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.positioning-condition.valid', 'Stedfestingsforhold er gyldig', 'positioningCondition', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '4, 7–8', ['DELV_LUKK_GRØ', 'I_TUNNEL', 'I_VANN', 'IKKE_STEDF', 'LUKK_GRØ', 'OVERFL_VANN', 'POS_FRA_KUM', 'PÅVI', 'ÅPEN_GRØ', 'ÅPEN_KUM'], ValueComparisonPolicy.EXACT],
  ['innmaling.common.positioning-cause.valid', 'Stedfestingsårsak er gyldig', 'positioningCause', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '4, 8; main 9–10, 18', ['FJERN', 'FLYTT_DELV', 'FLYTT_HELT', 'NYTT', 'PÅVI', 'UENDR'], ValueComparisonPolicy.EXACT],
];

const SLICE3_COMMON = [
  ['innmaling.common.measurement-method.required', 'Målemetode er gyldig', 'measurementMethod', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '4, 6–7, 23–25', ['10', '11', '12', '13', '14', '15', '18', '19', '20', '21', '22', '23', '24', '30', '31', '32', '33', '34', '35', '36', '37', '38', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '77', '78', '79', '80', '81', '82', '90', '91', '92', '93', '94', '95', '96', '97', '99'], ValueComparisonPolicy.INTEGER_CODE_STRING],
  ['innmaling.common.height-measurement-method.required', 'Målemetode høyde er gyldig', 'heightMeasurementMethod', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '4, 7, 25–27', ['10', '11', '12', '13', '14', '15', '18', '19', '20', '21', '22', '23', '24', '36', '60', '61', '62', '63', '64', '66', '67', '68', '69', '70', '74', '78', '79', '90', '91', '92', '93', '94', '95', '96', '99'], ValueComparisonPolicy.INTEGER_CODE_STRING],
  ['innmaling.common.vertical-level.required', 'Vertikalnivå er gyldig', 'verticalLevel', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '4, 9', ['UNDER_GRUNN', 'PÅ_GRUNN_VANNOVERF', 'OVER_GRUNN', 'PÅ_BUNN', 'I_VANNSØYL', 'SLISSING', 'UNDER_BUNN'], ValueComparisonPolicy.EXACT],
];

const POINT = [
  ['innmaling.point.tema.required', 'Punktobjekt har Tema', 'tema', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '4, 10–12', [], ValueComparisonPolicy.NONE],
  ['innmaling.point.inside-outside.valid', 'Punktets innvendig/utvendig-kode er gyldig', 'insideOutside', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '4, 14', ['ID', 'OD'], ValueComparisonPolicy.EXACT],
  ['innmaling.point.wall-thickness.required', 'Punktets tykkelse er oppgitt', 'wallThickness', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 9', [], ValueComparisonPolicy.NONE],
];

const LINE = [
  ['innmaling.line.wall-thickness.required', 'Ledningens tykkelse er oppgitt', 'wallThickness', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 16', [], ValueComparisonPolicy.NONE],
  ['innmaling.line.tema.required', 'Ledning har Tema', 'tema', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 16–19', [], ValueComparisonPolicy.NONE],
  ['innmaling.line.dimension.required', 'Ledningens dimensjon er oppgitt', 'dimension', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 16', [], ValueComparisonPolicy.NONE],
  ['innmaling.line.material.required', 'Ledningens materiale er oppgitt', 'material', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 19', [], ValueComparisonPolicy.NONE],
  ['innmaling.line.network-type.valid', 'Nett-type er gyldig', 'networkType', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '5, 19', ['F', 'H', 'O', 'O1', 'O2', 'S', 'S6', 'S7'], ValueComparisonPolicy.EXACT],
  ['innmaling.line.inside-outside.valid', 'Ledningens innvendig/utvendig-kode er gyldig', 'insideOutside', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '5, 21', ['ID', 'OD'], ValueComparisonPolicy.EXACT],
  ['innmaling.line.pipe-shape.valid', 'Rørform er gyldig', 'pipeShape', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '5, 21', ['A', 'E', 'F', 'R', 'S', 'T', 'X'], ValueComparisonPolicy.EXACT],
];

const INVENTORY = [
  ...COMMON.map((entry) => ({ entry, scopes: ['point', 'line'] })),
  ...SLICE3_COMMON.map((entry) => ({ entry, scopes: ['point', 'line'] })),
  ...POINT.map((entry) => ({ entry, scopes: ['point'] })),
  ...LINE.map((entry) => ({ entry, scopes: ['line'] })),
];
const NEW_INVENTORY = INVENTORY.filter(({ entry: [ruleId] }) =>
  !ruleId.includes('.height-reference.') &&
  !ruleId.endsWith('.point.tema.required') &&
  !ruleId.endsWith('.line.tema.required')
);

const COMMON_ATTRIBUTES = {
  Målemetode: '10',
  MålemetodeHøyde: '10',
  Vertikalnivå: 'UNDER_GRUNN',
  Høydereferanse: 'TOPP_INNVENDIG',
  Anleggsår: 2020,
  Datafangstdato: '24.08.2026',
  Innmålt_av: 'surveyor',
  Saksnummer: 'case-1',
  Nøyaktighet: 1,
  NøyaktighetHøyde: 2,
  MaksAvvikHorisontalt: 3,
  MaksAvvikVertikalt: 4,
  Stedfestingsforhold: 'I_VANN',
  Stedfestingsårsak: 'NYTT',
  Synbarhet: 0,
};
const POINT_ATTRIBUTES = {
  ...COMMON_ATTRIBUTES,
  Tema: 'VL',
  InnvendigUtvendig: 'ID',
  Tykkelse: 10,
  'NOBB-VAVVS-nr': '1234567',
  'NOBB-VAVVS-nr-ramme': '7654321',
};
const LINE_ATTRIBUTES = {
  ...COMMON_ATTRIBUTES,
  Tema: 'SP',
  Dimensjon: 110,
  Nett_type: 'F',
  InnvendigUtvendig: 'OD',
  Rørform: 'A',
  Tykkelse: 0.5,
  Material: 'PVC-0',
  'NOBB-VAVVS-nr': '1234567',
};

function schemaFor(attributes) {
  return Object.fromEntries(Object.keys(attributes).map((key) => [key, {}]));
}

function makeDataset({
  points = [{ attributes: { ...POINT_ATTRIBUTES } }],
  lines = [{ attributes: { ...LINE_ATTRIBUTES } }],
  pointAttributes = POINT_ATTRIBUTES,
  lineAttributes = LINE_ATTRIBUTES,
  pointSchema = schemaFor(pointAttributes),
  lineSchema = schemaFor(lineAttributes),
  includeFieldAnalysis = true,
} = {}) {
  const dataset = { points, lines };
  if (includeFieldAnalysis) {
    dataset.fieldAnalysis = { points: pointSchema, lines: lineSchema };
  }
  return dataset;
}

function run(dataset, layerId = 'a8-layer') {
  return runGmiValidationV2({
    layerId,
    dataset,
    datasetRevision: `revision-${layerId}`,
    sourceFormat: 'gmi',
  });
}

function ruleResult(result, ruleId) {
  const resultForRule = result.ruleResults.find((candidate) => candidate.rule.ruleId === ruleId);
  assert(resultForRule, `missing rule result ${ruleId}`);
  return resultForRule;
}

function assertReconciliation(result) {
  for (const resultForRule of result.ruleResults) {
    const point = resultForRule.geometryBreakdown.point;
    const line = resultForRule.geometryBreakdown.line;
    assert.equal(resultForRule.evaluatedObjectCount, point.evaluatedCount + line.evaluatedCount);
    assert.equal(resultForRule.passCount, point.passCount + line.passCount);
    assert.equal(resultForRule.failCount, point.failCount + line.failCount);
    assert.equal(resultForRule.notEvaluatedCount, point.notEvaluatedCount + line.notEvaluatedCount);
    assert.equal(resultForRule.indeterminateCount, point.indeterminateCount + line.indeterminateCount);
    assert.equal(resultForRule.findings.length, resultForRule.failCount + resultForRule.indeterminateCount);
    assert.equal(point.findingCount + line.findingCount, resultForRule.findings.length);
  }
}

function oneObjectDataset(scope, attributes, schema = schemaFor(attributes)) {
  return makeDataset({
    points: scope === 'point' ? [{ attributes }] : [],
    lines: scope === 'line' ? [{ attributes }] : [],
    pointAttributes: scope === 'point' ? attributes : {},
    lineAttributes: scope === 'line' ? attributes : {},
    pointSchema: scope === 'point' ? schema : {},
    lineSchema: scope === 'line' ? schema : {},
  });
}

const PARSER_POINT_FIELDS = [
  'Målemetode', 'MålemetodeHøyde', 'Vertikalnivå',
  'Høydereferanse', 'Anleggsår', 'Datafangstdato', 'Innmålt_av', 'Saksnummer',
  'Nøyaktighet', 'NøyaktighetHøyde', 'MaksAvvikHorisontalt', 'MaksAvvikVertikalt',
  'Stedfestingsforhold', 'Stedfestingsårsak', 'Synbarhet', 'Tema',
  'InnvendigUtvendig', 'Tykkelse', 'NOBB-VAVVS-nr', 'NOBB-VAVVS-nr-ramme',
];
const PARSER_LINE_FIELDS = [
  'Målemetode', 'MålemetodeHøyde', 'Vertikalnivå',
  'Tykkelse', 'Material',
  'Høydereferanse', 'Anleggsår', 'Datafangstdato', 'Innmålt_av', 'Saksnummer',
  'Nøyaktighet', 'NøyaktighetHøyde', 'MaksAvvikHorisontalt', 'MaksAvvikVertikalt',
  'Stedfestingsforhold', 'Stedfestingsårsak', 'Synbarhet', 'Tema', 'Dimensjon',
  'Nett_type', 'InnvendigUtvendig', 'Rørform', 'NOBB-VAVVS-nr',
];
const PARSER_POINT_DEFAULTS = [
  'arbitrary-xy-method', 'arbitrary-z-method', 'UNDER_GRUNN',
  'TOPP_INNVENDIG', '2020', '24.08.2026', 'surveyor', 'case-1', '1', '2', '3', '4',
  'I_VANN', 'NYTT', '0', 'VL', 'ID', '10', '1234567', '7654321',
];
const PARSER_LINE_DEFAULTS = [
  'arbitrary-xy-method', 'arbitrary-z-method', 'UNDER_GRUNN',
  '0.5', 'PVC-0',
  'TOPP_INNVENDIG', '2020', '24.08.2026', 'surveyor', 'case-1', '1', '2', '3', '4',
  'I_VANN', 'NYTT', '0', 'SP', '110', 'F', 'OD', 'A', '1234567',
];

function createGmiFixture({ pointOverrides = {}, lineOverrides = {} } = {}) {
  const valuesFor = (fields, defaults, overrides) => fields.map((field, index) =>
    Object.prototype.hasOwnProperty.call(overrides, field) ? overrides[field] : defaults[index]
  ).join(';');
  return `[GMIFILE_ASCII]\nCOSYS_EPSG 25832\n` +
    `[P_]\n_FIELDNAMES ${PARSER_POINT_FIELDS.join(';')}\n` +
    `[+P_]\n:P 1\n_FIELDVALUES ${valuesFor(PARSER_POINT_FIELDS, PARSER_POINT_DEFAULTS, pointOverrides)}\n/XYZ\n1 2 3\n` +
    `[L_]\n_FIELDNAMES ${PARSER_LINE_FIELDS.join(';')}\n` +
    `[+L_]\n:L 1\n_FIELDVALUES ${valuesFor(PARSER_LINE_FIELDS, PARSER_LINE_DEFAULTS, lineOverrides)}\n/XYZ\n1 2 3\n`;
}

function runParsedGmi(options) {
  const parsed = new GMIParser(createGmiFixture(options)).toObject();
  assert.deepEqual(parsed.errors, []);
  return { parsed, result: run(parsed, 'parsed-a8') };
}

test('A8 registry includes the Slice 6 vertical-level allowed-value inventory', () => {
  const rules = getValidationRules();
  assert.equal(rules.length, 24);
  assert.deepEqual(rules.map((rule) => rule.ruleId), [
    ...COMMON.slice(0, 2).map(([ruleId]) => ruleId),
    ...SLICE3_COMMON.map(([ruleId]) => ruleId),
    ...COMMON.slice(2).map(([ruleId]) => ruleId),
    ...POINT.map(([ruleId]) => ruleId),
    ...LINE.map(([ruleId]) => ruleId),
  ]);
  assert.equal(rules.filter((rule) => rule.geometryScopes.includes('point')).length, 17);
  assert.equal(rules.filter((rule) => rule.geometryScopes.includes('line')).length, 21);
  assert.equal(rules.filter((rule) => rule.geometryScopes.length === 2).length, 14);
  assert.equal(rules.filter((rule) => rule.geometryScopes.length === 1 && rule.geometryScopes[0] === 'point').length, 3);
  assert.equal(rules.filter((rule) => rule.geometryScopes.length === 1 && rule.geometryScopes[0] === 'line').length, 7);

  for (const { entry, scopes } of INVENTORY) {
    const [ruleId, title, canonicalFieldId, evaluatorKind, category, pages, allowedValues, valueComparison] = entry;
    const rule = rules.find((candidate) => candidate.ruleId === ruleId);
    assert.deepEqual({
      title: rule.title,
      canonicalFieldId: rule.canonicalFieldId,
      geometryScopes: rule.geometryScopes,
      evaluatorKind: rule.evaluatorKind,
      category: rule.category,
      provenance: rule.provenance,
      source: rule.source,
      severity: rule.severity,
      allowedValues: rule.allowedValues,
      valueComparison: rule.valueComparison,
    }, {
      title,
      canonicalFieldId,
      geometryScopes: scopes,
      evaluatorKind,
      category,
      provenance: RuleProvenance.STANDARD,
      source: { document: 'Innmålingsinstruks Vedlegg A', pages },
      severity: RuleSeverity.ERROR,
      allowedValues,
      valueComparison,
    }, ruleId);
  }
  assert.equal(new Set(rules.map((rule) => rule.ruleId)).size, 24);
  assert.equal(rules.filter((rule) => rule.valueComparison === ValueComparisonPolicy.INTEGER_CODE_STRING).length, 2);
  assert.equal(rules.some((rule) => rule.canonicalFieldId === 'visibility'), false);
  assert.equal(rules.every((rule) => rule.source.document === 'Innmålingsinstruks Vedlegg A'), true);
  assert.deepEqual(rules.find((rule) => rule.ruleId === 'innmaling.line.network-type.valid').allowedValues,
    ['F', 'H', 'O', 'O1', 'O2', 'S', 'S6', 'S7']);
  assert.equal(api.validateRuleRegistry(), true);
});

test('measurement fields retain required presence and enforce current v3.2 codes', () => {
  for (const [field, ruleId] of [
    ['Målemetode', 'innmaling.common.measurement-method.required'],
    ['MålemetodeHøyde', 'innmaling.common.height-measurement-method.required'],
    ['Vertikalnivå', 'innmaling.common.vertical-level.required'],
  ]) {
    const absentAttributes = { ...LINE_ATTRIBUTES };
    delete absentAttributes[field];
    assert.equal(ruleResult(run(oneObjectDataset('line', absentAttributes)), ruleId).findings[0].reasonCode,
      RuleReasonCode.REQUIRED_FIELD_ABSENT, field);
    for (const value of [null, '']) {
      const missing = run(oneObjectDataset('line', { ...LINE_ATTRIBUTES, [field]: value }));
      assert.equal(ruleResult(missing, ruleId).findings[0].reasonCode,
        RuleReasonCode.REQUIRED_VALUE_MISSING, `${field}:${value}`);
    }
    const invalid = ruleResult(run(oneObjectDataset('line', { ...LINE_ATTRIBUTES, [field]: 'not-a-declared-code' })), ruleId);
    assert.equal(invalid.failCount, 1, field);
    assert.equal(invalid.findings[0].reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED, field);
  }
});

test('vertical level accepts exactly the v3.2 codes without normalization or geometry leakage', () => {
  const ruleId = 'innmaling.common.vertical-level.required';
  const rule = getValidationRules().find((candidate) => candidate.ruleId === ruleId);
  for (const scope of ['point', 'line']) {
    for (const value of rule.allowedValues) {
      const result = run(oneObjectDataset(scope, {
        ...(scope === 'point' ? POINT_ATTRIBUTES : LINE_ATTRIBUTES),
        Vertikalnivå: value,
      }));
      assert.equal(ruleResult(result, ruleId).geometryBreakdown[scope].passCount, 1, `${scope}:${value}`);
    }
  }

  for (const value of ['under_grunn', 'Under_Grunn', ' UNDER_GRUNN', 'UNDER_GRUNN ',
    'unknown-level', '!_VANNSØYLEN']) {
    const result = run(oneObjectDataset('line', { ...LINE_ATTRIBUTES, Vertikalnivå: value }));
    const ruleResultForValue = ruleResult(result, ruleId);
    assert.equal(ruleResultForValue.failCount, 1, value);
    assert.equal(ruleResultForValue.findings[0].reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED, value);
  }

  const mixed = run(makeDataset({
    points: [{ attributes: { ...POINT_ATTRIBUTES, Vertikalnivå: 'I_VANNSØYL' } }],
    lines: [{ attributes: { ...LINE_ATTRIBUTES, Vertikalnivå: '!_VANNSØYLEN' } }],
    pointAttributes: { ...POINT_ATTRIBUTES, Vertikalnivå: 'I_VANNSØYL' },
    lineAttributes: { ...LINE_ATTRIBUTES, Vertikalnivå: '!_VANNSØYLEN' },
  }));
  const mixedRule = ruleResult(mixed, ruleId);
  assert.equal(mixedRule.geometryBreakdown.point.passCount, 1);
  assert.equal(mixedRule.geometryBreakdown.line.failCount, 1);
});

test('measurement numeric code lexical evidence rejects near misses and keeps XY/Z 97 distinct', () => {
  const cases = [
    ['Målemetode', '97', 0],
    ['MålemetodeHøyde', '97', 1],
    ['Målemetode', '01', 1],
    ['Målemetode', ' 10', 1],
    ['Målemetode', '10 ', 1],
    ['Målemetode', '+10', 1],
    ['Målemetode', '10.0', 1],
    ['MålemetodeHøyde', '010', 1],
    ['MålemetodeHøyde', '-10', 1],
  ];
  const ruleForField = {
    Målemetode: 'innmaling.common.measurement-method.required',
    MålemetodeHøyde: 'innmaling.common.height-measurement-method.required',
  };
  for (const [field, value, expectedFailCount] of cases) {
    const result = ruleResult(run(oneObjectDataset('line', { ...LINE_ATTRIBUTES, [field]: value })), ruleForField[field]);
    assert.equal(result.failCount, expectedFailCount, `${field}:${value}`);
    if (expectedFailCount) assert.equal(result.findings[0].reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED);
  }
});

test('measurement lists cover every authoritative value in both geometries without cross-binding', () => {
  const fields = [
    ['Målemetode', 'innmaling.common.measurement-method.required'],
    ['MålemetodeHøyde', 'innmaling.common.height-measurement-method.required'],
  ];
  for (const [field, ruleId] of fields) {
    const rule = getValidationRules().find((candidate) => candidate.ruleId === ruleId);
    for (const scope of ['point', 'line']) {
      for (const value of rule.allowedValues) {
        const result = ruleResult(run(oneObjectDataset(scope, {
          ...(scope === 'point' ? POINT_ATTRIBUTES : LINE_ATTRIBUTES),
          [field]: value,
        })), ruleId);
        assert.equal(result.geometryBreakdown[scope].passCount, 1, `${scope}:${field}:${value}`);
      }
    }
  }

  const mixed = run(makeDataset({
    points: [{ attributes: { ...POINT_ATTRIBUTES, Målemetode: '97', MålemetodeHøyde: '10' } }],
    lines: [{ attributes: { ...LINE_ATTRIBUTES, Målemetode: '10', MålemetodeHøyde: '97' } }],
    pointAttributes: { ...POINT_ATTRIBUTES, Målemetode: '97', MålemetodeHøyde: '10' },
    lineAttributes: { ...LINE_ATTRIBUTES, Målemetode: '10', MålemetodeHøyde: '97' },
  }));
  assert.equal(ruleResult(mixed, 'innmaling.common.measurement-method.required').failCount, 0);
  assert.equal(ruleResult(mixed, 'innmaling.common.height-measurement-method.required').geometryBreakdown.point.passCount, 1);
  assert.equal(ruleResult(mixed, 'innmaling.common.height-measurement-method.required').geometryBreakdown.line.failCount, 1);
});

test('Slice 2 line Material and Tykkelse are independent required-presence rules', () => {
  const materialRuleId = 'innmaling.line.material.required';
  const lineThicknessRuleId = 'innmaling.line.wall-thickness.required';
  const pointThicknessRuleId = 'innmaling.point.wall-thickness.required';

  for (const [field, ruleId] of [['Material', materialRuleId], ['Tykkelse', lineThicknessRuleId]]) {
    const absentAttributes = { ...LINE_ATTRIBUTES };
    delete absentAttributes[field];
    const absent = run(oneObjectDataset('line', absentAttributes));
    assert.equal(ruleResult(absent, ruleId).findings[0].reasonCode, RuleReasonCode.REQUIRED_FIELD_ABSENT, field);
    for (const value of [null, '']) {
      const missing = run(oneObjectDataset('line', { ...LINE_ATTRIBUTES, [field]: value }));
      assert.equal(ruleResult(missing, ruleId).findings[0].reasonCode, RuleReasonCode.REQUIRED_VALUE_MISSING, `${field}:${value}`);
    }
  }

  assert.equal(ruleResult(run(oneObjectDataset('line', { ...LINE_ATTRIBUTES, Material: 'deliberately-not-a-code' })), materialRuleId).failCount, 0);
  assert.equal(ruleResult(run(oneObjectDataset('line', { ...LINE_ATTRIBUTES, Tykkelse: 'not-numeric' })), lineThicknessRuleId).failCount, 0);

  const pointWithThickness = run(oneObjectDataset('point', { ...POINT_ATTRIBUTES }));
  assert.equal(ruleResult(pointWithThickness, materialRuleId).geometryBreakdown.point.evaluatedCount, 0);
  assert.equal(ruleResult(pointWithThickness, lineThicknessRuleId).geometryBreakdown.point.evaluatedCount, 0);
  assert.equal(ruleResult(pointWithThickness, pointThicknessRuleId).passCount, 1);

  const lineWithThickness = run(oneObjectDataset('line', { ...LINE_ATTRIBUTES }));
  assert.equal(ruleResult(lineWithThickness, lineThicknessRuleId).passCount, 1);
  assert.equal(ruleResult(lineWithThickness, pointThicknessRuleId).geometryBreakdown.line.evaluatedCount, 0);
});

test('mixed point/line datasets never borrow Tykkelse values across geometry', () => {
  const pointThicknessRuleId = 'innmaling.point.wall-thickness.required';
  const lineThicknessRuleId = 'innmaling.line.wall-thickness.required';

  const pointMissing = { ...POINT_ATTRIBUTES };
  delete pointMissing.Tykkelse;
  const pointMissingResult = run(makeDataset({
    points: [{ attributes: pointMissing }],
    lines: [{ attributes: { ...LINE_ATTRIBUTES, Tykkelse: 0.5 } }],
    pointAttributes: pointMissing,
    lineAttributes: { ...LINE_ATTRIBUTES, Tykkelse: 0.5 },
  }));
  assert.equal(ruleResult(pointMissingResult, pointThicknessRuleId).geometryBreakdown.point.failCount, 1);
  assert.equal(ruleResult(pointMissingResult, pointThicknessRuleId).findings[0].reasonCode, RuleReasonCode.REQUIRED_FIELD_ABSENT);
  assert.equal(ruleResult(pointMissingResult, lineThicknessRuleId).geometryBreakdown.line.passCount, 1);

  const lineMissing = { ...LINE_ATTRIBUTES };
  delete lineMissing.Tykkelse;
  const lineMissingResult = run(makeDataset({
    points: [{ attributes: { ...POINT_ATTRIBUTES, Tykkelse: 10 } }],
    lines: [{ attributes: lineMissing }],
    pointAttributes: { ...POINT_ATTRIBUTES, Tykkelse: 10 },
    lineAttributes: lineMissing,
  }));
  assert.equal(ruleResult(lineMissingResult, pointThicknessRuleId).geometryBreakdown.point.passCount, 1);
  assert.equal(ruleResult(lineMissingResult, lineThicknessRuleId).geometryBreakdown.line.failCount, 1);
  assert.equal(ruleResult(lineMissingResult, lineThicknessRuleId).findings[0].reasonCode, RuleReasonCode.REQUIRED_FIELD_ABSENT);
});



test('real GMI exact enum lexemes preserve whitespace failures and exact passes', () => {
  const exact = runParsedGmi();
  for (const ruleId of [
    'innmaling.common.height-reference.valid',
    'innmaling.common.vertical-level.required',
    'innmaling.common.positioning-condition.valid',
    'innmaling.common.positioning-cause.valid',
    'innmaling.point.inside-outside.valid',
    'innmaling.line.inside-outside.valid',
    'innmaling.line.network-type.valid',
    'innmaling.line.pipe-shape.valid',
  ]) {
    const rule = ruleResult(exact.result, ruleId);
    assert.equal(rule.failCount, 0, ruleId);
  }

  const whitespaceCases = [
    {
      pointOverrides: { Høydereferanse: ' TOPP_INNVENDIG ' },
      ruleId: 'innmaling.common.height-reference.valid',
    },
    {
      lineOverrides: { Vertikalnivå: ' UNDER_GRUNN ' },
      ruleId: 'innmaling.common.vertical-level.required',
    },
    {
      lineOverrides: { Stedfestingsforhold: ' I_VANN ' },
      ruleId: 'innmaling.common.positioning-condition.valid',
    },
    {
      pointOverrides: { Stedfestingsårsak: ' NYTT ' },
      ruleId: 'innmaling.common.positioning-cause.valid',
    },
    {
      pointOverrides: { InnvendigUtvendig: ' ID ' },
      ruleId: 'innmaling.point.inside-outside.valid',
    },
    {
      lineOverrides: { InnvendigUtvendig: ' OD ' },
      ruleId: 'innmaling.line.inside-outside.valid',
    },
    {
      lineOverrides: { Nett_type: ' F ' },
      ruleId: 'innmaling.line.network-type.valid',
    },
    {
      lineOverrides: { Rørform: ' A ' },
      ruleId: 'innmaling.line.pipe-shape.valid',
    },
  ];
  for (const testCase of whitespaceCases) {
    const { parsed, result } = runParsedGmi(testCase);
    const rule = ruleResult(result, testCase.ruleId);
    assert.deepEqual(parsed.errors, []);
    assert.equal(rule.failCount, 1, testCase.ruleId);
    assert.equal(rule.findings[0].reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED, testCase.ruleId);
  }
});

test('real GMI measurement lexemes control numeric-code validation', () => {
  const valid = runParsedGmi({
    pointOverrides: { [PARSER_POINT_FIELDS[0]]: '97', [PARSER_POINT_FIELDS[1]]: '10' },
    lineOverrides: { [PARSER_LINE_FIELDS[0]]: '10', [PARSER_LINE_FIELDS[1]]: '36' },
  });
  for (const ruleId of [
    'innmaling.common.measurement-method.required',
    'innmaling.common.height-measurement-method.required',
  ]) {
    assert.equal(ruleResult(valid.result, ruleId).failCount, 0, ruleId);
  }
  assert.equal(valid.parsed.points[0].attributes[PARSER_POINT_FIELDS[0]], 97);
  assert.equal(valid.parsed.points[0].attributes[GMI_SOURCE_LEXEMES][PARSER_POINT_FIELDS[0]], '97');
  assert.equal(valid.parsed.lines[0].attributes[GMI_SOURCE_LEXEMES][PARSER_LINE_FIELDS[1]], '36');

  const height97 = runParsedGmi({
    pointOverrides: { [PARSER_POINT_FIELDS[0]]: '10', [PARSER_POINT_FIELDS[1]]: '97' },
    lineOverrides: { [PARSER_LINE_FIELDS[0]]: '10', [PARSER_LINE_FIELDS[1]]: '36' },
  });
  assert.equal(height97.parsed.points[0].attributes[PARSER_POINT_FIELDS[1]], 97);
  assert.equal(height97.parsed.points[0].attributes[GMI_SOURCE_LEXEMES][PARSER_POINT_FIELDS[1]], '97');
  const height97Rule = ruleResult(
    height97.result,
    'innmaling.common.height-measurement-method.required',
  );
  assert.equal(height97Rule.failCount, 1);
  assert.equal(height97Rule.findings[0].reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED);

  const cases = [
    { field: PARSER_POINT_FIELDS[0], lexeme: '01', scope: 'point', expectedValue: 1 },
    { field: PARSER_POINT_FIELDS[0], lexeme: ' 10', scope: 'point', expectedValue: 10 },
    { field: PARSER_POINT_FIELDS[1], lexeme: '10 ', scope: 'point', expectedValue: 10 },
    { field: PARSER_POINT_FIELDS[1], lexeme: '+10', scope: 'point', expectedValue: '+10' },
    { field: PARSER_LINE_FIELDS[0], lexeme: '10.0', scope: 'line', expectedValue: 10 },
  ];
  const ruleForField = {
    [PARSER_POINT_FIELDS[0]]: 'innmaling.common.measurement-method.required',
    [PARSER_POINT_FIELDS[1]]: 'innmaling.common.height-measurement-method.required',
  };
  for (const { field, lexeme, scope, expectedValue } of cases) {
    const options = {
      pointOverrides: { [PARSER_POINT_FIELDS[0]]: '97', [PARSER_POINT_FIELDS[1]]: '10' },
      lineOverrides: { [PARSER_LINE_FIELDS[0]]: '10', [PARSER_LINE_FIELDS[1]]: '36' },
    };
    options[scope === 'point' ? 'pointOverrides' : 'lineOverrides'][field] = lexeme;
    const { parsed, result } = runParsedGmi(options);
    const attributes = parsed[scope === 'point' ? 'points' : 'lines'][0].attributes;
    assert.equal(attributes[field], expectedValue, `${field}:${lexeme} parsed value`);
    assert.equal(attributes[GMI_SOURCE_LEXEMES][field], lexeme, `${field}:${lexeme} source lexeme`);
    const rule = ruleResult(result, ruleForField[field]);
    assert.equal(rule.failCount, 1, `${field}:${lexeme}`);
    assert.equal(rule.findings[0].reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED);
  }
});

test('measurement integer-code validation covers the direct no-lexeme fallback', () => {
  const ruleCases = [
    ['innmaling.common.measurement-method.required', ['10', '97'], [10, 97]],
    ['innmaling.common.height-measurement-method.required', ['10', '36'], [10, 36]],
  ];
  for (const [ruleId, validStrings, validNumbers] of ruleCases) {
    const allowedValues = getValidationRules().find((rule) => rule.ruleId === ruleId).allowedValues;
    for (const sourceValue of validStrings) {
      assert.equal(
        evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue }, allowedValues,
          ValueComparisonPolicy.INTEGER_CODE_STRING).state,
        EvaluationState.PASS,
        `${ruleId}:${sourceValue}`,
      );
    }
    for (const sourceValue of validNumbers) {
      assert.equal(
        evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue }, allowedValues,
          ValueComparisonPolicy.INTEGER_CODE_STRING).state,
        EvaluationState.PASS,
        `${ruleId}:${sourceValue}`,
      );
    }
    for (const sourceValue of ['10x', '01', 10.5, Number.MAX_SAFE_INTEGER + 1, -0]) {
      const evaluation = evaluateRequiredAllowedValue(
        { state: ObjectValueState.VALUE_PRESENT, sourceValue },
        allowedValues,
        ValueComparisonPolicy.INTEGER_CODE_STRING,
      );
      assert.equal(evaluation.state, EvaluationState.FAIL, `${ruleId}:${String(sourceValue)}`);
      assert.equal(evaluation.reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED);
    }
  }
});

test('v3.2 retires Synbarhet and makes all NOBB fields optional', () => {
  const pointAttributes = { ...POINT_ATTRIBUTES };
  const lineAttributes = { ...LINE_ATTRIBUTES };
  delete pointAttributes.Synbarhet;
  delete pointAttributes['NOBB-VAVVS-nr'];
  delete pointAttributes['NOBB-VAVVS-nr-ramme'];
  delete lineAttributes.Synbarhet;
  delete lineAttributes['NOBB-VAVVS-nr'];
  const result = run(makeDataset({
    points: [{ attributes: pointAttributes }],
    lines: [{ attributes: lineAttributes }],
    pointAttributes,
    lineAttributes,
  }));
  assert.equal(result.ruleResults.some(({ rule }) => rule.canonicalFieldId === 'visibility'), false);
  assert.equal(result.ruleResults.some(({ rule }) => rule.canonicalFieldId === 'nobbVavvsNumber'), false);
  assert.equal(result.ruleResults.some(({ rule }) => rule.canonicalFieldId === 'nobbVavvsFrameNumber'), false);
  assert.equal(result.ruleResults.flatMap(({ findings }) => findings).length, 0);
  assertReconciliation(result);
});

test('v3.2 Nett_type accepts exactly all eight authoritative values', () => {
  for (const value of ['F', 'H', 'O', 'O1', 'O2', 'S', 'S6', 'S7']) {
    const lineAttributes = { ...LINE_ATTRIBUTES, Nett_type: value };
    const result = run(makeDataset({ lines: [{ attributes: lineAttributes }], lineAttributes }));
    assert.equal(ruleResult(result, 'innmaling.line.network-type.valid').failCount, 0, value);
  }
  for (const value of ['f', 'O1 ', ' O2', 'O-1', 'S-7']) {
    const lineAttributes = { ...LINE_ATTRIBUTES, Nett_type: value };
    const result = run(makeDataset({ lines: [{ attributes: lineAttributes }], lineAttributes }));
    assert.equal(ruleResult(result, 'innmaling.line.network-type.valid').failCount, 1, value);
  }
});


test('every new A8 practical rule implements the required state matrix', () => {
  for (const { entry, scopes } of NEW_INVENTORY) {
    const [ruleId, , canonicalFieldId, evaluatorKind, , , allowedValues] = entry;
    const scope = scopes[0];
    const sourceAttributes = scope === 'point' ? { ...POINT_ATTRIBUTES } : { ...LINE_ATTRIBUTES };
    const sourceKey = {
      measurementMethod: 'Målemetode',
      heightMeasurementMethod: 'MålemetodeHøyde',
      verticalLevel: 'Vertikalnivå',
      installationYear: 'Anleggsår',
      captureDate: 'Datafangstdato',
      surveyedBy: 'Innmålt_av',
      caseNumber: 'Saksnummer',
      horizontalAccuracy: 'Nøyaktighet',
      verticalAccuracy: 'NøyaktighetHøyde',
      maxHorizontalDeviation: 'MaksAvvikHorisontalt',
      maxVerticalDeviation: 'MaksAvvikVertikalt',
      positioningCondition: 'Stedfestingsforhold',
      positioningCause: 'Stedfestingsårsak',
      visibility: 'Synbarhet',
      insideOutside: 'InnvendigUtvendig',
      wallThickness: 'Tykkelse',
      nobbVavvsNumber: 'NOBB-VAVVS-nr',
      nobbVavvsFrameNumber: 'NOBB-VAVVS-nr-ramme',
      dimension: 'Dimensjon',
      networkType: 'Nett_type',
      material: 'Material',
      pipeShape: 'Rørform',
    }[canonicalFieldId];
    const validValue = canonicalFieldId === 'visibility' ? 0 : (allowedValues[0] || sourceAttributes[sourceKey]);
    sourceAttributes[sourceKey] = validValue;
    const valid = run(oneObjectDataset(scope, sourceAttributes));
    assert.equal(ruleResult(valid, ruleId).passCount, 1, ruleId);

    const absentAttributes = { ...sourceAttributes };
    delete absentAttributes[sourceKey];
    const absent = run(oneObjectDataset(scope, absentAttributes));
    assert.equal(ruleResult(absent, ruleId).failCount, 1, ruleId);
    assert.equal(ruleResult(absent, ruleId).findings[0].reasonCode, RuleReasonCode.REQUIRED_FIELD_ABSENT, ruleId);

    for (const missingValue of [null, undefined, '']) {
      const missingAttributes = { ...sourceAttributes, [sourceKey]: missingValue };
      const missing = run(oneObjectDataset(scope, missingAttributes));
      assert.equal(ruleResult(missing, ruleId).failCount, 1, `${ruleId}:${String(missingValue)}`);
      assert.equal(ruleResult(missing, ruleId).findings[0].reasonCode, RuleReasonCode.REQUIRED_VALUE_MISSING, ruleId);
    }

    if (evaluatorKind === RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE) {
      const invalid = run(oneObjectDataset(scope, { ...sourceAttributes, [sourceKey]: 'INVALID_A8_CODE' }));
      assert.equal(ruleResult(invalid, ruleId).failCount, 1, ruleId);
      assert.equal(ruleResult(invalid, ruleId).findings[0].reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED, ruleId);
      for (const allowedValue of allowedValues) {
        const allowed = run(oneObjectDataset(scope, { ...sourceAttributes, [sourceKey]: allowedValue }));
        assert.equal(ruleResult(allowed, ruleId).passCount, 1, `${ruleId}:${allowedValue}`);
      }
    }
  }
});


test('binding uncertainty is indeterminate and unsupported aliases never satisfy A8 fields', () => {
  const ambiguousDataset = oneObjectDataset('point', {
    ...POINT_ATTRIBUTES,
    COLLISION: 'value',
  }, {
    ...schemaFor(POINT_ATTRIBUTES),
    COLLISION: {},
  });
  const ambiguousInput = {
    layerId: 'a8-layer',
    dataset: ambiguousDataset,
    datasetRevision: 'revision-a8-layer',
    sourceFormat: 'gmi',
  };
  const ambiguousBinding = bindGmiLayerSchemaWithRegistry(ambiguousInput, [
    {
      canonicalFieldId: 'installationYear',
      directGmiSourceKey: 'COLLISION',
      acceptedFallbackKeys: [],
      disabledLegacyAliases: [],
      recognizedUnresolvedKeys: [],
      mappingEvidenceConfidence: 'HIGH',
    },
    {
      canonicalFieldId: 'syntheticTarget',
      directGmiSourceKey: 'COLLISION',
      acceptedFallbackKeys: [],
      disabledLegacyAliases: [],
      recognizedUnresolvedKeys: [],
      mappingEvidenceConfidence: 'HIGH',
    },
  ]);
  const ambiguousEvidence = extractGmiObjectFieldValue({
    ...ambiguousInput,
    schemaBinding: ambiguousBinding,
    objectRef: createObjectRef({
      layerId: 'a8-layer',
      datasetRevision: 'revision-a8-layer',
      geometryScope: 'point',
      objectIndex: 0,
    }),
    canonicalFieldId: 'installationYear',
  });
  assert.equal(ambiguousEvidence.state, ObjectValueState.BINDING_AMBIGUOUS);
  assert.equal(evaluateRequiredField(ambiguousEvidence).reasonCode, RuleReasonCode.BINDING_AMBIGUOUS);

  const unresolvedSchema = { ...schemaFor(LINE_ATTRIBUTES), DIM: {} };
  delete unresolvedSchema.Dimensjon;
  const unresolved = run(oneObjectDataset('line', {
    ...LINE_ATTRIBUTES,
    DIM: 110,
  }, unresolvedSchema));
  assert.equal(ruleResult(unresolved, 'innmaling.line.dimension.required').indeterminateCount, 1);
  assert.equal(ruleResult(unresolved, 'innmaling.line.dimension.required').findings[0].reasonCode, RuleReasonCode.UNRESOLVED_SOURCE);

  const unavailable = run(makeDataset({
    points: [{}],
    lines: [],
    includeFieldAnalysis: false,
  }));
  // No schema metadata means every applicable A8 binding is uncertain, not absent.
  assert.equal(ruleResult(unavailable, 'innmaling.common.installation-year.required').indeterminateCount, 1);
  assert.equal(ruleResult(unavailable, 'innmaling.common.installation-year.required').findings[0].reasonCode, RuleReasonCode.SCHEMA_UNAVAILABLE);

  const disabledAttributes = { ...POINT_ATTRIBUTES, Tykkelse_punkt: 10 };
  delete disabledAttributes.Tykkelse;
  const disabled = run(oneObjectDataset('point', disabledAttributes, schemaFor(disabledAttributes)));
  assert.equal(ruleResult(disabled, 'innmaling.point.wall-thickness.required').indeterminateCount, 1);
  assert.equal(ruleResult(disabled, 'innmaling.point.wall-thickness.required').findings[0].reasonCode, RuleReasonCode.UNRESOLVED_SOURCE);
});

test('common and geometry-specific rules stay isolated by geometry', () => {
  const pointAttributes = { ...POINT_ATTRIBUTES };
  delete pointAttributes.Anleggsår;
  const result = run(makeDataset({
    points: [{ attributes: pointAttributes }],
    lines: [{ attributes: { ...LINE_ATTRIBUTES } }],
    pointAttributes,
    lineAttributes: LINE_ATTRIBUTES,
  }));
  const installation = ruleResult(result, 'innmaling.common.installation-year.required');
  assert.equal(installation.geometryBreakdown.point.failCount, 1);
  assert.equal(installation.geometryBreakdown.line.passCount, 1);
  assert.equal(ruleResult(result, 'innmaling.point.inside-outside.valid').geometryBreakdown.line.evaluatedCount, 0);
  assert.equal(ruleResult(result, 'innmaling.line.network-type.valid').geometryBreakdown.point.evaluatedCount, 0);

  const sharedField = run(makeDataset({
    points: [{ attributes: { ...POINT_ATTRIBUTES, InnvendigUtvendig: 'INVALID' } }],
    lines: [{ attributes: { ...LINE_ATTRIBUTES, InnvendigUtvendig: 'OD' } }],
  }));
  assert.equal(ruleResult(sharedField, 'innmaling.point.inside-outside.valid').failCount, 1);
  assert.equal(ruleResult(sharedField, 'innmaling.line.inside-outside.valid').passCount, 1);

  const dimensionAliasSchema = { ...schemaFor(LINE_ATTRIBUTES), DIM: {} };
  delete dimensionAliasSchema.Dimensjon;
  const dimensionAlias = run(makeDataset({
    lines: [{ attributes: { ...LINE_ATTRIBUTES, Dimensjon: undefined, DIM: 110 } }],
    lineAttributes: { ...LINE_ATTRIBUTES, Dimensjon: undefined, DIM: 110 },
    lineSchema: dimensionAliasSchema,
  }));
  assert.equal(ruleResult(dimensionAlias, 'innmaling.line.dimension.required').indeterminateCount, 1);
  assertReconciliation(result);
  assertReconciliation(sharedField);
});

test('all-pass, fail, indeterminate, mixed, and empty datasets preserve count equations', () => {
  const allPass = run(makeDataset());
  const fail = run(makeDataset({
    points: [{ attributes: { ...POINT_ATTRIBUTES, Saksnummer: null } }],
    pointAttributes: { ...POINT_ATTRIBUTES, Saksnummer: null },
    lines: [],
  }));
  const indeterminate = run(makeDataset({
    points: [{}],
    lines: [{}],
    includeFieldAnalysis: false,
  }));
  const mixed = run(makeDataset({
    points: [{ attributes: { ...POINT_ATTRIBUTES, Datafangstdato: '' } }],
    lines: [{ attributes: { ...LINE_ATTRIBUTES } }],
    pointAttributes: { ...POINT_ATTRIBUTES, Datafangstdato: '' },
  }));
  const empty = run(makeDataset({ points: [], lines: [] }));
  for (const result of [allPass, fail, indeterminate, mixed, empty]) assertReconciliation(result);
  assert.equal(allPass.ruleResults.flatMap((candidate) => candidate.findings).length, 0);
  assert.equal(fail.ruleResults.flatMap((candidate) => candidate.findings).length > 0, true);
  assert.equal(indeterminate.ruleResults.flatMap((candidate) => candidate.findings).length > 0, true);
  assert.equal(empty.ruleResults.every((candidate) => candidate.evaluatedObjectCount === 0), true);
  assert.equal(getValidationV2GeometrySummary(empty, 'point').findingCount, 0);
});

test('one run drives both geometry tabs, uses dynamic rule count, and preserves identity', async () => {
  const pointAttributes = { ...POINT_ATTRIBUTES, Høydereferanse: 'INVALID_A8' };
  const layer = {
    id: 'tabs-a8',
    data: { format: 'GMI', ...makeDataset({
      points: [{ attributes: pointAttributes }],
      lines: [{ attributes: { ...LINE_ATTRIBUTES } }],
      pointAttributes,
    }).fieldAnalysis, points: [{ attributes: pointAttributes }], lines: [{ attributes: { ...LINE_ATTRIBUTES } }] },
  };
  let runCount = 0;
  const controller = createValidationV2ViewController((input) => {
    runCount += 1;
    return runGmiValidationV2(input);
  });
  const input = createValidationV2Input(layer);
  const pointState = controller.run(input);
  const lineState = controller.selectGeometry('line');
  assert.equal(runCount, 1);
  assert.equal(pointState.result, lineState.result);
  assert.equal(pointState.result.datasetRevision, input.datasetRevision);
  assert.equal(pointState.result.summary.totalRules, 24);
  assert.equal(pointState.result.ruleResults[0].findings[0]?.objectRef, lineState.result.ruleResults[0].findings[0]?.objectRef);
  assert.deepEqual(lineState.geometryView.ruleResults.map((candidate) => candidate.rule.geometryScopes), [
    ...COMMON.map(() => ['point', 'line']),
    ...SLICE3_COMMON.map(() => ['point', 'line']),
    ...LINE.map(() => ['line']),
  ]);

  const source = await readFile(
    new URL('../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /getValidationRules/);
  assert.match(source, /result\?\.summary\?\.totalRules \?\? getValidationRules\(\)\.length/);
  assert.doesNotMatch(source, /3 regler/);
  assert.match(source, /ValidationV2RuleList/);
  assert.doesNotMatch(source, /FindingGroups|objectRef\.sourceIndex/);
});

test('two layers do not share bindings, values, ObjectRefs, findings, counts, or results', () => {
  const layerA = run(makeDataset({
    points: [{ attributes: { ...POINT_ATTRIBUTES, Saksnummer: null } }],
    lines: [],
  }), 'layer-a');
  const layerB = run(makeDataset({ points: [{ attributes: { ...POINT_ATTRIBUTES } }], lines: [] }), 'layer-b');
  const aFindings = layerA.ruleResults.flatMap((candidate) => candidate.findings);
  assert(aFindings.length > 0);
  assert(aFindings.every((finding) => finding.objectRef.layerId === 'layer-a'));
  assert.equal(layerB.ruleResults.flatMap((candidate) => candidate.findings).length, 0);
  assert.notEqual(layerA, layerB);
  assert.notEqual(layerA.schemaBinding, layerB.schemaBinding);
  assert.notEqual(aFindings[0].objectRef.key, 'layer-b|point|0');
  assert.equal(layerA.summary.evaluatedPointCount, 1);
  assert.equal(layerB.summary.evaluatedPointCount, 1);
});

test('unknown fields remain informational', () => {
  const pointAttributes = { ...POINT_ATTRIBUTES, UNKNOWN_A8_FIELD: 'ignored' };
  const result = run(makeDataset({
    points: [{ attributes: pointAttributes }],
    lines: [],
    pointAttributes,
    pointSchema: { ...schemaFor(pointAttributes) },
  }));
  assert(result.sourceFieldDiagnostics.some((diagnostic) => diagnostic.sourceKey === 'UNKNOWN_A8_FIELD'));
  assert.equal(result.ruleResults.flatMap((candidate) => candidate.findings).length, 0);
});

test('representative multi-thousand-object run completes with bounded finding shape', () => {
  const points = Array.from({ length: 1500 }, () => ({ attributes: { ...POINT_ATTRIBUTES } }));
  const lines = Array.from({ length: 1500 }, () => ({ attributes: { ...LINE_ATTRIBUTES } }));
  const started = process.hrtime.bigint();
  const result = run(makeDataset({ points, lines }));
  const elapsedMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(result.summary.totalRules, 24);
  assert.equal(result.summary.evaluatedPointCount, 1500);
  assert.equal(result.summary.evaluatedLineCount, 1500);
  assert.equal(result.ruleResults.flatMap((candidate) => candidate.findings).length, 0);
  assertReconciliation(result);
  // Keep this observation visible without making the test machine-speed dependent.
  assert(elapsedMilliseconds >= 0);
  assert.equal(result.ruleResults.every((candidate) => candidate.findings.length <= 3000), true);
});
