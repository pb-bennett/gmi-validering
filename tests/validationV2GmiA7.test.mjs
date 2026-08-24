import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const { evaluateRequiredAllowedValue } = await import(
  '../src/lib/validation-v2/ruleEvaluation.js'
);
const {
  createValidationV2Input,
  getDefaultValidationV2Geometry,
  getValidationV2GeometryRuleStatus,
  getValidationV2GeometrySummary,
  getValidationV2GeometrySelection,
  groupValidationV2Findings,
} = await import('../src/lib/validation-v2/uiIntegration.js');
const { createValidationV2ViewController } = await import(
  '../src/lib/validation-v2/validationViewController.js'
);
const {
  EvaluationState,
  ObjectValueState,
  RuleCategory,
  RuleProvenance,
  RuleReasonCode,
  RuleSeverity,
  getValidationRules,
  runGmiValidationV2,
} = api;

const HEIGHT_VALID = 'innmaling.common.height-reference.valid';
const POINT_TEMA_REQUIRED = 'innmaling.point.tema.required';
const LINE_TEMA_REQUIRED = 'innmaling.line.tema.required';
const allowedValues = [
  'BUNN_INNVENDIG',
  'PÅ_BAKKEN',
  'SENTER',
  'TOPP_INNVENDIG',
  'TOPP_UTVENDIG',
  'UKJENT',
  'UNDERKANT_UTVENDIG',
];

function makeLayer(
  id,
  {
    points = [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'VL' } }],
    lines = [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'SP' } }],
    pointSchema = { Høydereferanse: {}, Tema: {} },
    lineSchema = { Høydereferanse: {}, Tema: {} },
  } = {},
) {
  return {
    id,
    name: `Synthetic ${id}`,
    data: {
      format: 'GMI',
      fieldAnalysis: { points: pointSchema, lines: lineSchema },
      points,
      lines,
    },
  };
}

function resultFor(layer) {
  return runGmiValidationV2(createValidationV2Input(layer));
}

function ruleResult(result, ruleId) {
  return result.ruleResults.find((candidate) => candidate.rule.ruleId === ruleId);
}

test('active beta registry retains A7 rules and the combined Høydereferanse rule', () => {
  const rules = getValidationRules();
  assert.equal(rules[0].ruleId, HEIGHT_VALID);
  assert(rules.some((rule) => rule.ruleId === POINT_TEMA_REQUIRED));
  assert(rules.some((rule) => rule.ruleId === LINE_TEMA_REQUIRED));
  assert.equal(rules.some((rule) => rule.ruleId.endsWith('.required') && rule.canonicalFieldId === 'heightReference'), false);
  assert.equal(rules.some((rule) => rule.ruleId.endsWith('.allowed-value') && rule.canonicalFieldId === 'heightReference'), false);

  const heightRule = rules[0];
  assert.equal(heightRule.category, RuleCategory.REQUIRED_ALLOWED_VALUE);
  assert.equal(heightRule.provenance, RuleProvenance.STANDARD);
  assert.equal(heightRule.severity, RuleSeverity.ERROR);
  assert.deepEqual(heightRule.allowedValues, allowedValues);
});

test('combined Høydereferanse semantics keep missing and invalid FAIL reasons distinct', () => {
  const absent = resultFor(makeLayer('absent', {
    pointSchema: { Tema: {} },
    lineSchema: { Tema: {} },
    points: [{ attributes: { Tema: 'VL' } }],
    lines: [{ attributes: { Tema: 'SP' } }],
  }));
  assert.equal(ruleResult(absent, HEIGHT_VALID).failCount, 2);
  assert(ruleResult(absent, HEIGHT_VALID).findings.every(
    (finding) => finding.reasonCode === RuleReasonCode.REQUIRED_FIELD_ABSENT,
  ));

  const missing = resultFor(makeLayer('missing', {
    points: [{ attributes: { Høydereferanse: null, Tema: 'VL' } }],
    lines: [{ attributes: { Høydereferanse: '', Tema: 'SP' } }],
  }));
  assert.equal(ruleResult(missing, HEIGHT_VALID).failCount, 2);
  assert.equal(ruleResult(missing, HEIGHT_VALID).notEvaluatedCount, 0);
  assert(ruleResult(missing, HEIGHT_VALID).findings.every(
    (finding) => finding.reasonCode === RuleReasonCode.REQUIRED_VALUE_MISSING,
  ));

  const valid = resultFor(makeLayer('valid'));
  assert.equal(ruleResult(valid, HEIGHT_VALID).passCount, 2);
  assert.equal(ruleResult(valid, HEIGHT_VALID).findings.length, 0);

  const invalid = resultFor(makeLayer('invalid', {
    points: [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG ', Tema: 'VL' } }],
    lines: [{ attributes: { Høydereferanse: 'XYZ', Tema: 'SP' } }],
  }));
  assert.equal(ruleResult(invalid, HEIGHT_VALID).failCount, 2);
  assert(ruleResult(invalid, HEIGHT_VALID).findings.every(
    (finding) => finding.reasonCode === RuleReasonCode.VALUE_NOT_ALLOWED,
  ));

  for (const state of [
    ObjectValueState.BINDING_AMBIGUOUS,
    ObjectValueState.UNRESOLVED_SOURCE,
    ObjectValueState.SCHEMA_UNAVAILABLE,
  ]) {
    assert.equal(
      evaluateRequiredAllowedValue({ state }, allowedValues).state,
      EvaluationState.INDETERMINATE,
    );
  }
});

test('common Høydereferanse and geometry-specific Tema results reconcile by geometry', () => {
  const result = resultFor(makeLayer('breakdown', {
    points: [
      { attributes: { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'VL' } },
      { attributes: { Høydereferanse: 'XYZ', Tema: null } },
    ],
    lines: [{ attributes: { Høydereferanse: 'SENTER', Tema: 'SP' } }],
  }));
  const height = ruleResult(result, HEIGHT_VALID);
  assert.deepEqual(height.geometryBreakdown, {
    point: {
      evaluatedCount: 2,
      passCount: 1,
      failCount: 1,
      notEvaluatedCount: 0,
      indeterminateCount: 0,
      findingCount: 1,
    },
    line: {
      evaluatedCount: 1,
      passCount: 1,
      failCount: 0,
      notEvaluatedCount: 0,
      indeterminateCount: 0,
      findingCount: 0,
    },
  });
  assert.equal(height.passCount, 2);
  assert.equal(height.failCount, 1);
  assert.equal(height.geometryBreakdown.point.passCount + height.geometryBreakdown.line.passCount, height.passCount);
  assert.equal(height.geometryBreakdown.point.failCount + height.geometryBreakdown.line.failCount, height.failCount);

  const pointTema = ruleResult(result, POINT_TEMA_REQUIRED);
  const lineTema = ruleResult(result, LINE_TEMA_REQUIRED);
  assert.equal(pointTema.geometryBreakdown.line.evaluatedCount, 0);
  assert.equal(lineTema.geometryBreakdown.point.evaluatedCount, 0);
  assert.equal(getValidationV2GeometryRuleStatus(lineTema, 'point').label, 'Delvis oppfylt');
  assert.equal(getValidationV2GeometryRuleStatus(pointTema, 'line').label, 'Delvis oppfylt');

  const indeterminate = resultFor(makeLayer('indeterminate', {
    pointSchema: { HREF: {}, Tema: {} },
    points: [{ attributes: { HREF: 'unknown', Tema: 'VL' } }],
  }));
  const indeterminateHeight = ruleResult(indeterminate, HEIGHT_VALID);
  assert.deepEqual(indeterminateHeight.geometryBreakdown, {
    point: {
      evaluatedCount: 1,
      passCount: 0,
      failCount: 0,
      notEvaluatedCount: 0,
      indeterminateCount: 1,
      findingCount: 1,
    },
    line: {
      evaluatedCount: 1,
      passCount: 1,
      failCount: 0,
      notEvaluatedCount: 0,
      indeterminateCount: 0,
      findingCount: 0,
    },
  });
  assert.equal(indeterminateHeight.indeterminateCount, 1);
  const wholeRuleCounts = {
    evaluatedCount: indeterminateHeight.evaluatedObjectCount,
    passCount: indeterminateHeight.passCount,
    failCount: indeterminateHeight.failCount,
    notEvaluatedCount: indeterminateHeight.notEvaluatedCount,
    indeterminateCount: indeterminateHeight.indeterminateCount,
    findingCount: indeterminateHeight.findings.length,
  };
  for (const counter of Object.keys(wholeRuleCounts)) {
    assert.equal(
      indeterminateHeight.geometryBreakdown.point[counter] +
        indeterminateHeight.geometryBreakdown.line[counter],
      wholeRuleCounts[counter],
      counter,
    );
  }
});

test('one result drives both geometry tabs without rerunning and uses geometry-specific summaries', async () => {
  const layer = makeLayer('tabs', {
    points: [{ attributes: { Høydereferanse: 'XYZ', Tema: 'VL' } }],
  });
  const input = createValidationV2Input(layer);
  let runCount = 0;
  const controller = createValidationV2ViewController((runInput) => {
    runCount += 1;
    return runGmiValidationV2(runInput);
  });
  assert.equal(controller.selectLayer(layer).geometryTab, 'point');
  const runState = controller.run(input);
  const result = runState.result;
  const pointView = runState.geometryView;
  const lineView = controller.selectGeometry('line').geometryView;
  const pointSummary = getValidationV2GeometrySummary(result, 'point');
  const lineSummary = getValidationV2GeometrySummary(result, 'line');
  assert.equal(pointSummary.objectCount, 1);
  assert.equal(lineSummary.objectCount, 1);
  assert.equal(runCount, 1);
  assert.equal(pointView.result, result);
  assert.equal(lineView.result, result);
  assert.equal(pointView.ruleResults[0], result.ruleResults[0]);
  assert.equal(pointView.ruleResults[0].findings[0].objectRef, result.ruleResults[0].findings[0].objectRef);
  assert.deepEqual(pointView.ruleResults.map((rule) => rule.rule.ruleId), [
    HEIGHT_VALID,
    'innmaling.common.installation-year.required',
    'innmaling.common.capture-date.required',
    'innmaling.common.surveyed-by.required',
    'innmaling.common.case-number.required',
    'innmaling.common.horizontal-accuracy.required',
    'innmaling.common.vertical-accuracy.required',
    'innmaling.common.max-horizontal-deviation.required',
    'innmaling.common.max-vertical-deviation.required',
    'innmaling.common.positioning-condition.valid',
    'innmaling.common.positioning-cause.valid',
    'innmaling.common.visibility.valid',
    POINT_TEMA_REQUIRED,
    'innmaling.point.inside-outside.valid',
    'innmaling.point.wall-thickness.required',
    'innmaling.point.nobb-vavvs-number.required',
    'innmaling.point.nobb-vavvs-frame-number.required',
  ]);
  assert.deepEqual(lineView.ruleResults.map((rule) => rule.rule.ruleId), [
    HEIGHT_VALID,
    'innmaling.common.installation-year.required',
    'innmaling.common.capture-date.required',
    'innmaling.common.surveyed-by.required',
    'innmaling.common.case-number.required',
    'innmaling.common.horizontal-accuracy.required',
    'innmaling.common.vertical-accuracy.required',
    'innmaling.common.max-horizontal-deviation.required',
    'innmaling.common.max-vertical-deviation.required',
    'innmaling.common.positioning-condition.valid',
    'innmaling.common.positioning-cause.valid',
    'innmaling.common.visibility.valid',
    LINE_TEMA_REQUIRED,
    'innmaling.line.dimension.required',
    'innmaling.line.network-type.valid',
    'innmaling.line.inside-outside.valid',
    'innmaling.line.pipe-shape.valid',
    'innmaling.line.nobb-vavvs-number.required',
  ]);
  assert.equal(input.datasetRevision, result.datasetRevision);
  assert.equal(getDefaultValidationV2Geometry(layer), 'point');
  const linesOnly = makeLayer('lines-only', { points: [], lines: [{}] });
  const empty = makeLayer('empty', { points: [], lines: [] });
  assert.equal(getDefaultValidationV2Geometry(linesOnly), 'line');
  assert.equal(getDefaultValidationV2Geometry(empty), 'point');
  assert.equal(getValidationV2GeometrySelection(layer, 'line'), 'line');
  assert.equal(getValidationV2GeometrySelection(linesOnly, 'point'), 'point');
  assert.equal(getValidationV2GeometrySelection(empty, 'line'), 'line');
  assert.equal(getValidationV2GeometrySelection(empty, 'point'), 'point');
  assert.equal(controller.selectLayer(makeLayer('point-only', { lines: [] })).geometryTab, 'point');
  assert.equal(controller.selectGeometry('line').geometryTab, 'line');
  assert.equal(controller.selectLayer(linesOnly).geometryTab, 'line');
  assert.equal(controller.selectGeometry('point').geometryTab, 'point');
  assert.equal(controller.selectLayer(empty).geometryTab, 'point');
  assert.equal(controller.selectGeometry('line').geometryTab, 'line');
  assert.equal(controller.selectGeometry('point').geometryTab, 'point');

  const source = await readFile(
    new URL('../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /createValidationV2ViewController/);
  assert.match(source, /role="tab"/);
  assert.match(source, /controller\.selectGeometry/);
  assert.match(source, /geometrySummary/);
  assert.doesNotMatch(source, /getValidationV2GeometryRuleStatus/);
  assert.doesNotMatch(source, /height-reference\.required|height-reference\.allowed-value/);
});

test('finding groups use stable reason/value keys and retain every affected ObjectRef', () => {
  const result = resultFor(makeLayer('groups', {
    points: [
      { attributes: { Høydereferanse: null, Tema: 'VL' } },
      { attributes: { Høydereferanse: '', Tema: 'VL' } },
      { attributes: { Høydereferanse: 'XYZ', Tema: 'VL' } },
      { attributes: { Høydereferanse: 'ABC', Tema: 'VL' } },
    ],
    lines: [],
  }));
  const findings = ruleResult(result, HEIGHT_VALID).findings;
  const groups = groupValidationV2Findings(findings, 'point');
  assert.equal(groups.length, 3);
  assert.equal(groups.find((group) => group.reasonCode === RuleReasonCode.REQUIRED_VALUE_MISSING).findings.length, 2);
  assert.equal(groups.filter((group) => group.reasonCode === RuleReasonCode.VALUE_NOT_ALLOWED)
    .every((group) => group.findings.length === 1), true);
  assert.equal(groups.flatMap((group) => group.findings).length, findings.length);
  assert.equal(new Set(groups.flatMap((group) => group.findings.map((finding) => finding.objectRef.key))).size, findings.length);
});

test('finding grouping preserves signed zero, structural conflict arrays, and equal evidence', () => {
  const makeFinding = (key, observed) => ({
    ruleId: 'synthetic.rule',
    geometryScope: 'point',
    reasonCode: key,
    objectRef: { key: `layer|point|${key}|${String(observed)}`, sourceIndex: 0 },
    observed,
  });
  const signedZeroGroups = groupValidationV2Findings([
    makeFinding(RuleReasonCode.VALUE_NOT_ALLOWED, { sourceValue: 0 }),
    makeFinding(RuleReasonCode.VALUE_NOT_ALLOWED, { sourceValue: -0 }),
  ], 'point');
  assert.equal(signedZeroGroups.length, 2);

  const conflictA = ['x', 'y|string:z'];
  const conflictB = ['x|string:y', 'z'];
  const conflictGroups = groupValidationV2Findings([
    makeFinding(RuleReasonCode.TEMA_CONFLICT, { conflicts: conflictA.map((rawValue) => ({ rawValue })) }),
    makeFinding(RuleReasonCode.TEMA_CONFLICT, { conflicts: conflictB.map((rawValue) => ({ rawValue })) }),
    makeFinding(RuleReasonCode.TEMA_CONFLICT, { conflicts: conflictA.map((rawValue) => ({ rawValue })) }),
  ], 'point');
  assert.equal(conflictGroups.length, 2);
  assert.equal(conflictGroups.find((group) => group.findings.length === 2).observedValue, null);

  const identicalGroups = groupValidationV2Findings([
    makeFinding(RuleReasonCode.VALUE_NOT_ALLOWED, { sourceValue: 'XYZ' }),
    makeFinding(RuleReasonCode.VALUE_NOT_ALLOWED, { sourceValue: 'XYZ' }),
  ], 'point');
  assert.equal(identicalGroups.length, 1);
  assert.equal(identicalGroups[0].findings.length, 2);
});

test('compact rule rows expose summaries without individual object metadata', async () => {
  const source = await readFile(
    new URL('../src/components/validation-v2/ValidationV2RuleList.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /Objekter i grunnlaget/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-controls/);
  assert.match(source, /<button/);
  assert.doesNotMatch(source, /finding\.objectRef\.key|Objekt 1|Vis alle|FindingGroups/);
});

test('legacy mode is visibly Validator 1.0 and remains the default host choice', async () => {
  const source = await readFile(
    new URL('../src/components/FieldValidationSidebar.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /useState\('legacy'\)/);
  assert.match(source, /Validator 1\.0/);
  assert.match(source, /Validator 2\.0 \(beta\)/);
  assert.doesNotMatch(source, /Dagens validator/);
});
