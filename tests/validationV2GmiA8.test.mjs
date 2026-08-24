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
  ['innmaling.common.height-reference.valid', 'Høydereferanse er gyldig', 'heightReference', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '5, 7', ['BUNN_INNVENDIG', 'PÅ_BAKKEN', 'SENTER', 'TOPP_INNVENDIG', 'TOPP_UTVENDIG', 'UKJENT', 'UNDERKANT_UTVENDIG'], ValueComparisonPolicy.EXACT],
  ['innmaling.common.installation-year.required', 'Anleggsår er oppgitt', 'installationYear', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5–6', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.capture-date.required', 'Datafangstdato er oppgitt', 'captureDate', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5–6', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.surveyed-by.required', 'Innmålt av er oppgitt', 'surveyedBy', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5–6', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.case-number.required', 'Saksnummer er oppgitt', 'caseNumber', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5–6', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.horizontal-accuracy.required', 'Nøyaktighet XY er oppgitt', 'horizontalAccuracy', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 8', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.vertical-accuracy.required', 'Nøyaktighet høyde Z er oppgitt', 'verticalAccuracy', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 8', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.max-horizontal-deviation.required', 'Maksavvik horisontalt er oppgitt', 'maxHorizontalDeviation', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 10', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.max-vertical-deviation.required', 'Maksavvik vertikalt er oppgitt', 'maxVerticalDeviation', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 10', [], ValueComparisonPolicy.NONE],
  ['innmaling.common.positioning-condition.valid', 'Stedfestingsforhold er gyldig', 'positioningCondition', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '5, 8–9', ['DELV_LUKK_GRØ', 'I_TUNNEL', 'I_VANN', 'IKKE_STEDF', 'LUKK_GRØ', 'OVERFL_VANN', 'POS_FRA_KUM', 'PÅVI', 'ÅPEN_GRØ', 'ÅPEN_KUM'], ValueComparisonPolicy.EXACT],
  ['innmaling.common.positioning-cause.valid', 'Stedfestingsårsak er gyldig', 'positioningCause', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '5, 9', ['FJERN', 'FLYTT_DELV', 'FLYTT_HELT', 'NYTT', 'PÅVI', 'UENDR'], ValueComparisonPolicy.EXACT],
  ['innmaling.common.visibility.valid', 'Synbarhet er gyldig', 'visibility', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '5, 9', ['0', '1', '2', '3'], ValueComparisonPolicy.INTEGER_CODE_STRING],
];

const POINT = [
  ['innmaling.point.tema.required', 'Punktobjekt har Tema', 'tema', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 11–13', [], ValueComparisonPolicy.NONE],
  ['innmaling.point.inside-outside.valid', 'Punktets innvendig/utvendig-kode er gyldig', 'insideOutside', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '5, 15', ['ID', 'OD'], ValueComparisonPolicy.EXACT],
  ['innmaling.point.wall-thickness.required', 'Punktets tykkelse er oppgitt', 'wallThickness', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 15', [], ValueComparisonPolicy.NONE],
  ['innmaling.point.nobb-vavvs-number.required', 'Punktets NOBB/VAVVS-nummer er oppgitt', 'nobbVavvsNumber', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 17', [], ValueComparisonPolicy.NONE],
  ['innmaling.point.nobb-vavvs-frame-number.required', 'Rammens NOBB/VAVVS-nummer er oppgitt', 'nobbVavvsFrameNumber', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '5, 18', [], ValueComparisonPolicy.NONE],
];

const LINE = [
  ['innmaling.line.tema.required', 'Ledning har Tema', 'tema', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '6, 19–21', [], ValueComparisonPolicy.NONE],
  ['innmaling.line.dimension.required', 'Ledningens dimensjon er oppgitt', 'dimension', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '6, 23', [], ValueComparisonPolicy.NONE],
  ['innmaling.line.network-type.valid', 'Nett-type er gyldig', 'networkType', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '6, 21–22', ['F', 'H', 'O', 'S', 'S6'], ValueComparisonPolicy.EXACT],
  ['innmaling.line.inside-outside.valid', 'Ledningens innvendig/utvendig-kode er gyldig', 'insideOutside', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '6, 23', ['ID', 'OD'], ValueComparisonPolicy.EXACT],
  ['innmaling.line.pipe-shape.valid', 'Rørform er gyldig', 'pipeShape', RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, RuleCategory.REQUIRED_ALLOWED_VALUE, '6, 23–24', ['A', 'E', 'F', 'R', 'S', 'T', 'X'], ValueComparisonPolicy.EXACT],
  ['innmaling.line.nobb-vavvs-number.required', 'Ledningens NOBB/VAVVS-nummer er oppgitt', 'nobbVavvsNumber', RuleEvaluatorKind.REQUIRED, RuleCategory.REQUIRED_FIELD, '6, 25', [], ValueComparisonPolicy.NONE],
];

const INVENTORY = [
  ...COMMON.map((entry) => ({ entry, scopes: ['point', 'line'] })),
  ...POINT.map((entry) => ({ entry, scopes: ['point'] })),
  ...LINE.map((entry) => ({ entry, scopes: ['line'] })),
];
const NEW_INVENTORY = INVENTORY.filter(({ entry: [ruleId] }) =>
  !ruleId.includes('.height-reference.') &&
  !ruleId.endsWith('.point.tema.required') &&
  !ruleId.endsWith('.line.tema.required')
);

const COMMON_ATTRIBUTES = {
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
  'Høydereferanse', 'Anleggsår', 'Datafangstdato', 'Innmålt_av', 'Saksnummer',
  'Nøyaktighet', 'NøyaktighetHøyde', 'MaksAvvikHorisontalt', 'MaksAvvikVertikalt',
  'Stedfestingsforhold', 'Stedfestingsårsak', 'Synbarhet', 'Tema',
  'InnvendigUtvendig', 'Tykkelse', 'NOBB-VAVVS-nr', 'NOBB-VAVVS-nr-ramme',
];
const PARSER_LINE_FIELDS = [
  'Høydereferanse', 'Anleggsår', 'Datafangstdato', 'Innmålt_av', 'Saksnummer',
  'Nøyaktighet', 'NøyaktighetHøyde', 'MaksAvvikHorisontalt', 'MaksAvvikVertikalt',
  'Stedfestingsforhold', 'Stedfestingsårsak', 'Synbarhet', 'Tema', 'Dimensjon',
  'Nett_type', 'InnvendigUtvendig', 'Rørform', 'NOBB-VAVVS-nr',
];
const PARSER_POINT_DEFAULTS = [
  'TOPP_INNVENDIG', '2020', '24.08.2026', 'surveyor', 'case-1', '1', '2', '3', '4',
  'I_VANN', 'NYTT', '0', 'VL', 'ID', '10', '1234567', '7654321',
];
const PARSER_LINE_DEFAULTS = [
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

test('A8 registry is exactly the reviewed 23-rule inventory', () => {
  const rules = getValidationRules();
  assert.equal(rules.length, 23);
  assert.deepEqual(rules.map((rule) => rule.ruleId), INVENTORY.map(({ entry: [ruleId] }) => ruleId));
  assert.equal(rules.filter((rule) => rule.geometryScopes.includes('point')).length, 17);
  assert.equal(rules.filter((rule) => rule.geometryScopes.includes('line')).length, 18);
  assert.equal(rules.filter((rule) => rule.geometryScopes.length === 2).length, 12);
  assert.equal(rules.filter((rule) => rule.geometryScopes.length === 1 && rule.geometryScopes[0] === 'point').length, 5);
  assert.equal(rules.filter((rule) => rule.geometryScopes.length === 1 && rule.geometryScopes[0] === 'line').length, 6);

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
  assert.equal(new Set(rules.map((rule) => rule.ruleId)).size, 23);
  assert.equal(rules.filter((rule) => rule.valueComparison === ValueComparisonPolicy.INTEGER_CODE_STRING).length, 1);
  assert.equal(rules.find((rule) => rule.canonicalFieldId === 'visibility').valueComparison, ValueComparisonPolicy.INTEGER_CODE_STRING);
  assert.equal(api.validateRuleRegistry(), true);
});

test('real GMI parser preserves source lexemes without changing ordinary attributes', () => {
  for (const lexeme of ['0', '1', '2', '3']) {
    const { parsed, result } = runParsedGmi({ pointOverrides: { Synbarhet: lexeme } });
    const pointAttributes = parsed.points[0].attributes;
    assert.equal(pointAttributes.Synbarhet, Number(lexeme));
    assert.equal(pointAttributes.Høydereferanse, 'TOPP_INNVENDIG');
    assert.equal(pointAttributes.Stedfestingsforhold, 'I_VANN');
    assert.equal(pointAttributes.Stedfestingsårsak, 'NYTT');
    assert.equal(Object.keys(pointAttributes).includes('gmiSourceLexemes'), false);
    assert.equal(JSON.stringify(pointAttributes).includes('gmiSourceLexemes'), false);
    assert.equal(pointAttributes[GMI_SOURCE_LEXEMES].Synbarhet, lexeme);
    const schemaBinding = api.bindGmiLayerSchema({
      layerId: 'parsed-a8',
      dataset: parsed,
      datasetRevision: 'revision-parsed-a8',
      sourceFormat: 'gmi',
    });
    const extracted = api.extractGmiObjectFieldValue({
      layerId: 'parsed-a8',
      dataset: parsed,
      datasetRevision: 'revision-parsed-a8',
      sourceFormat: 'gmi',
      schemaBinding,
      objectRef: api.createObjectRef({
        layerId: 'parsed-a8',
        datasetRevision: 'revision-parsed-a8',
        geometryScope: 'point',
        objectIndex: 0,
      }),
      canonicalFieldId: 'visibility',
    });
    assert.equal(extracted.sourceValue, Number(lexeme));
    assert.equal(extracted.sourceLexeme, lexeme);
    assert.equal(ruleResult(result, 'innmaling.common.visibility.valid').geometryBreakdown.point.passCount, 1);
    assert.equal(ruleResult(result, 'innmaling.common.visibility.valid').geometryBreakdown.line.passCount, 1);
  }
});

test('real GMI Synbarhet lexemes reject lossy numeric spellings end to end', () => {
  for (const lexeme of ['01', '1.0', '-0', '1.5', '4', ' 1', '1 ', 'x1', '1x']) {
    const { parsed, result } = runParsedGmi({ pointOverrides: { Synbarhet: lexeme } });
    const visibility = ruleResult(result, 'innmaling.common.visibility.valid');
    assert.deepEqual(parsed.errors, [], lexeme);
    assert.equal(visibility.geometryBreakdown.point.failCount, 1, lexeme);
    assert.equal(visibility.findings[0].reasonCode, RuleReasonCode.VALUE_NOT_ALLOWED, lexeme);
  }
});

test('real GMI exact enum lexemes preserve whitespace failures and exact passes', () => {
  const exact = runParsedGmi();
  for (const ruleId of [
    'innmaling.common.height-reference.valid',
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

test('lexical evidence stays outside schema binding, unknown fields, and telemetry-visible data', () => {
  const { parsed, result } = runParsedGmi({ pointOverrides: { Synbarhet: '01' } });
  assert(result.sourceFieldDiagnostics.every((diagnostic) =>
    diagnostic.sourceKey !== 'gmiSourceLexemes'
  ));
  assert.equal(result.sourceFieldDiagnostics.some((diagnostic) =>
    diagnostic.sourceKey === String(GMI_SOURCE_LEXEMES)
  ), false);
  assert.equal(Object.keys(parsed.points[0]).includes('gmiSourceLexemes'), false);
  assert.equal(JSON.stringify(parsed).includes('gmiSourceLexemes'), false);
  assert.equal(JSON.stringify(parsed).includes('Symbol(gmiSourceLexemes)'), false);
  assert.equal(parsed.points[0].attributes.Synbarhet, 1);
  assert.equal(result.ruleResults.flatMap((candidate) => candidate.findings)
    .some((finding) => finding.canonicalFieldId === 'gmiSourceLexemes'), false);

  const applicationCopy = { ...parsed, crsContext: { ...parsed.crsContext } };
  const copiedResult = run(applicationCopy, 'parsed-copy');
  assert.equal(
    ruleResult(copiedResult, 'innmaling.common.visibility.valid').findings[0].reasonCode,
    RuleReasonCode.VALUE_NOT_ALLOWED,
  );
});

test('every new A8 practical rule implements the required state matrix', () => {
  for (const { entry, scopes } of NEW_INVENTORY) {
    const [ruleId, , canonicalFieldId, evaluatorKind, , , allowedValues] = entry;
    const scope = scopes[0];
    const sourceAttributes = scope === 'point' ? { ...POINT_ATTRIBUTES } : { ...LINE_ATTRIBUTES };
    const sourceKey = {
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

test('A8 code rules remain exact and only Synbarhet accepts parser integer codes', () => {
  const visibility = getValidationRules().find((rule) => rule.canonicalFieldId === 'visibility');
  for (const value of [0, 1, 2, 3, '0', '1', '2', '3']) {
    assert.equal(
      evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: value }, visibility.allowedValues, visibility.valueComparison).state,
      EvaluationState.PASS,
      String(value),
    );
  }
  for (const value of [-0, 4, '1.0', true, false, 1.5, 'x1', '1x', '01']) {
    assert.equal(
      evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: value }, visibility.allowedValues, visibility.valueComparison).reasonCode,
      RuleReasonCode.VALUE_NOT_ALLOWED,
      String(value),
    );
  }
  const height = getValidationRules().find((rule) => rule.canonicalFieldId === 'heightReference');
  assert.equal(
    evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: 1 }, height.allowedValues, height.valueComparison).state,
    EvaluationState.FAIL,
  );
  assert.equal(
    evaluateRequiredAllowedValue({ state: ObjectValueState.VALUE_PRESENT, sourceValue: 'TOPP_INNVENDIG ' }, height.allowedValues, height.valueComparison).state,
    EvaluationState.FAIL,
  );
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
  assert.equal(pointState.result.summary.totalRules, 23);
  assert.equal(pointState.result.ruleResults[0].findings[0]?.objectRef, lineState.result.ruleResults[0].findings[0]?.objectRef);
  assert.deepEqual(lineState.geometryView.ruleResults.map((candidate) => candidate.rule.geometryScopes), [
    ...COMMON.map(() => ['point', 'line']),
    ...LINE.map(() => ['line']),
  ]);

  const source = await readFile(
    new URL('../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /getValidationRules/);
  assert.match(source, /result\?\.summary\?\.totalRules \?\? getValidationRules\(\)\.length/);
  assert.doesNotMatch(source, /3 regler/);
  assert.match(source, /MAX_VISIBLE_GROUP_OBJECTS = 15/);
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
  assert.equal(result.summary.totalRules, 23);
  assert.equal(result.summary.evaluatedPointCount, 1500);
  assert.equal(result.summary.evaluatedLineCount, 1500);
  assert.equal(result.ruleResults.flatMap((candidate) => candidate.findings).length, 0);
  assertReconciliation(result);
  // Keep this observation visible without making the test machine-speed dependent.
  assert(elapsedMilliseconds >= 0);
  assert.equal(result.ruleResults.every((candidate) => candidate.findings.length <= 3000), true);
});
