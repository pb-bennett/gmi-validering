import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { BATCH1_INTEGERS, BATCH1_LISTS } from './fixtures/validationV2GmiV32Batch1.mjs';

register('./esmJsLoader.mjs', import.meta.url);
const api = await import('../src/lib/validation-v2/index.js');
const { GMIParser } = await import('../src/lib/parsing/gmiParser.js');
const { GMI_SOURCE_LEXEMES } = await import('../src/lib/parsing/gmiLexicalEvidence.js');
const { getDatasetRevision } = await import('../src/lib/validation-v2/datasetRevision.js');
const { evaluateAllowedValue, evaluateIntegerFormat } = await import('../src/lib/validation-v2/ruleEvaluation.js');
const { createValidationV2ViewController } = await import('../src/lib/validation-v2/validationViewController.js');
const { getValidationV2GeometryView, createValidationV2Input } = await import('../src/lib/validation-v2/uiIntegration.js');
const { POINT_FIELD_APPLICABILITY_POLICY } = await import('../src/lib/validation-v2/registry/pointFieldApplicability.js');
const ALL_NEW = [...BATCH1_INTEGERS, ...BATCH1_LISTS];
const TYPE_RULE = 'innmaling.point.type.valid';
const TEMA_RULE = 'innmaling.point.tema.required';
const RELATIONSHIP = 'innmaling.point.type-tema.compatible';

function parse(attributes, geometry = 'point') {
  const token = geometry === 'point' ? 'P' : 'L';
  const text = ['[GMIFILE_ASCII]', `[${token}_]`, `_FIELDNAMES ${Object.keys(attributes).join(';')}`,
    `[+${token}_]`, `:${token} 1`, `_FIELDVALUES ${Object.values(attributes).join(';')}`,
    '/XYZ', '1 2 3', ...(geometry === 'line' ? ['2 3 4'] : []), ''].join('\n');
  const data = new GMIParser(text).toObject();
  assert.deepEqual(data.errors, []);
  return data;
}
function runtime(attributes, lineAttributes = null) {
  return {
    format: 'GMI', points: [{ attributes }], lines: lineAttributes ? [{ attributes: lineAttributes }] : [],
    fieldAnalysis: {
      points: Object.fromEntries(Object.keys(attributes).map(key => [key, {}])),
      lines: Object.fromEntries(Object.keys(lineAttributes || {}).map(key => [key, {}])),
    },
  };
}
function run(dataset, layerId = 'batch1-layer') {
  return api.runGmiValidationV2({ dataset, layerId, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi' });
}
function ruleResult(result, id) {
  const found = result.ruleResults.find(x => x.rule.ruleId === id);
  assert.ok(found, id);
  return found;
}
function outcome(result, id, state, reason = null) {
  const r = ruleResult(result, id);
  assert.deepEqual([r.passCount, r.failCount, r.notEvaluatedCount, r.indeterminateCount], {
    PASS: [1, 0, 0, 0], FAIL: [0, 1, 0, 0], NOT_EVALUATED: [0, 0, 1, 0], INDETERMINATE: [0, 0, 0, 1],
  }[state], id);
  if (reason) assert.equal(r.findings[0].reasonCode, reason, id);
  return r;
}
function fildata(dataset, result, id, field, geometryScope = 'point', layerId = 'batch1-layer') {
  return api.getValidationV2FieldDataSummary({ dataset, result, layerId, geometryScope, canonicalFieldId: field, ruleId: id });
}
function identity(dataset, result, geometryScope = 'point') {
  const refs = api.createGmiObjectRefs({ dataset, layerId: result.layerId, datasetRevision: result.datasetRevision, sourceFormat: 'gmi' });
  return api.resolveGmiTemaIdentity({ dataset, layerId: result.layerId, datasetRevision: result.datasetRevision,
    sourceFormat: 'gmi', schemaBinding: result.schemaBinding, objectRef: geometryScope === 'point' ? refs.pointRefs[0] : refs.lineRefs[0] });
}

test('exact ten new rule contracts, registry/result/geometry counts and no new evaluator kind', () => {
  const rules = api.getValidationRules();
  assert.equal(rules.length, 41);
  assert.equal(rules.filter(x => x.geometryScopes.includes('point')).length, 34);
  assert.equal(rules.filter(x => x.geometryScopes.includes('line')).length, 21);
  assert.equal(rules.filter(x => x.evaluatorKind === 'INTEGER_FORMAT').length, 10);
  for (const [id, field, , , pages, values] of ALL_NEW) {
    const r = api.getValidationRule(id);
    assert.equal(r.canonicalFieldId, field);
    assert.deepEqual(r.geometryScopes, ['point']);
    assert.equal(r.evaluatorKind, values ? 'ALLOWED_VALUE' : 'INTEGER_FORMAT');
    assert.equal(r.category, values ? 'ALLOWED_VALUE' : 'VALUE_FORMAT');
    assert.equal(r.severity, 'ERROR');
    assert.equal(r.provenance, 'STANDARD');
    assert.deepEqual(r.source, { document: 'Innmålingsinstruks Vedlegg A', pages });
    assert.deepEqual(r.allowedValues, values);
    assert.equal(r.valueComparison, values ? 'EXACT' : undefined);
    assert.equal(r.inputFieldIds, undefined);
  }
  const empty = run({ points: [], lines: [], fieldAnalysis: { points: {}, lines: {} } });
  assert.equal(empty.ruleResults.length, 41);
  assert.equal(getValidationV2GeometryView(empty, 'point').ruleResults.length, 34);
  assert.equal(getValidationV2GeometryView(empty, 'line').ruleResults.length, 21);
  for (const r of empty.ruleResults) assert.equal(r.evaluatedObjectCount, 0);
});

for (const [id, field, key, unit, pages] of BATCH1_INTEGERS) {
  test(`${key}: all original integer spellings, no domain or identifier-length inference`, () => {
    for (const value of ['0', '-0', '-1', '+1000', '01000', '1', '1234567', '12345678', '9999999999999999999999999999999999']) {
      const d = parse({ [key]: value });
      assert.equal(d.points[0].attributes[GMI_SOURCE_LEXEMES][key], value);
      outcome(run(d), id, 'PASS');
    }
    for (const value of ['1000.0', '1.5', '1,5', '1e3', '1E3', ' 1000', '1000 ', ' 1000 ', '1000mm', '--1', '+', 'abc']) {
      const d = parse({ [key]: value });
      assert.equal(d.points[0].attributes[GMI_SOURCE_LEXEMES][key], value);
      outcome(run(d), id, 'FAIL', 'VALUE_NOT_INTEGER');
    }
    for (const value of [0, -0, -1, 1000, 1000.0, '01000', '+1']) outcome(run(runtime({ [key]: value })), id, 'PASS');
    for (const value of [1.5, NaN, Infinity, -Infinity, true, {}, '1.0']) outcome(run(runtime({ [key]: value })), id, 'FAIL', 'VALUE_NOT_INTEGER');
    outcome(run(runtime({ [key]: 9007199254740992 })), id, 'INDETERMINATE', 'NUMERIC_PRECISION_UNAVAILABLE');
  });

  test(`${key}: Field Info separates point format, source requiredness and line metadata; Fildata shares evaluator`, () => {
    const info = api.composeFieldInformation({ canonicalFieldId: field, geometryScope: 'point', rule: api.getValidationRule(id) });
    assert.equal(info.required, false);
    assert.equal(info.requiredness, 'NOT_REQUIRED');
    assert.equal(info.documentationStatus, 'PARTIAL');
    assert.equal(info.documentedFormat, 'Heltall');
    assert.equal(info.units, unit);
    assert.equal(info.range, null);
    assert.deepEqual(info.allowedValues, []);
    assert.ok(info.sources.some(s => s.pages === pages && s.auditSourceRuleIds.includes(id)));
    assert.match(info.qualifications.map(x => x.text).join(' '), /levert heltallsformat/);
    for (const [value, label] of [['01000', 'Gyldig'], ['1000.0', 'Ugyldig'], ['   ', '-']]) {
      const d = parse({ [key]: value });
      const summary = fildata(d, run(d), id, field);
      assert.equal(summary.rows.length, 1);
      assert.equal(summary.rows[0].ruleAcceptance, label);
      assert.equal(summary.rows[0].deliveredValue, value === '   ' ? '⟨null⟩' : JSON.stringify(value));
    }
    const unsafe = runtime({ [key]: 9007199254740992 });
    assert.equal(fildata(unsafe, run(unsafe), id, field).rows[0].ruleAcceptance, 'Må vurderes');
  });
}

for (const [id, field, key, , pages, values] of BATCH1_LISTS) {
  test(`${key}: exact complete source list, including parser padding and no-lexeme fallback`, () => {
    assert.deepEqual(api.getValidationRule(id).allowedValues, values);
    const info = api.composeFieldInformation({ canonicalFieldId: field, geometryScope: 'point', rule: api.getValidationRule(id) });
    assert.deepEqual(info.allowedValues, values);
    assert.deepEqual(Object.keys(info.valueInfo), values);
    assert.equal(info.required, false);
    assert.equal(info.sources[0].pages, pages);
    assert.match(info.qualifications.map(x => x.text).join(' '), /manuell/);
    for (const value of values) {
      for (const dataset of [parse({ [key]: value }), runtime({ [key]: value })]) {
        const result = run(dataset);
        outcome(result, id, 'PASS');
        assert.equal(fildata(dataset, result, id, field).rows[0].ruleAcceptance, 'Gyldig');
      }
      for (const bad of [` ${value}`, `${value} `, value.toLowerCase()]) {
        const d = parse({ [key]: bad });
        const result = run(d);
        outcome(result, id, 'FAIL', 'VALUE_NOT_ALLOWED');
        assert.equal(fildata(d, result, id, field).rows[0].deliveredValue, JSON.stringify(bad));
        assert.equal(fildata(d, result, id, field).rows[0].ruleAcceptance, 'Ugyldig');
      }
    }
    for (const bad of ['0', '1', 'D0', 'LEGACY', 'explanatory text']) outcome(run(parse({ [key]: bad })), id, 'FAIL', 'VALUE_NOT_ALLOWED');
  });
}

test('all ten rules preserve missing values, direct/case-only binding and schema uncertainty', () => {
  for (const [id, , key, , , values] of ALL_NEW) {
    const valid = values ? values[0] : '1';
    for (const value of [null, undefined, '']) outcome(run(runtime({ [key]: value })), id, 'NOT_EVALUATED');
    outcome(run(runtime({})), id, 'NOT_EVALUATED');
    outcome(run(parse({ [key]: '   ' })), id, 'NOT_EVALUATED');
    const propertyAbsent = runtime({});
    propertyAbsent.fieldAnalysis.points[key] = {};
    outcome(run(propertyAbsent), id, 'NOT_EVALUATED');
    outcome(run(runtime({ [key.toUpperCase()]: valid })), id, 'PASS');
    const direct = run(runtime({ [key.toUpperCase()]: undefined, [key]: valid }));
    outcome(direct, id, 'PASS');
    assert.equal(direct.schemaBinding.bindings.find(x => x.geometryScope === 'point' && x.canonicalFieldId === api.getValidationRule(id).canonicalFieldId).preferredSourceKey, key);
    outcome(run(runtime({ [key.toUpperCase()]: valid, [key.toLowerCase()]: 'bad' })), id, 'INDETERMINATE', 'BINDING_AMBIGUOUS');
    outcome(run({ points: [{}], lines: [] }), id, 'INDETERMINATE', 'SCHEMA_UNAVAILABLE');
  }
  for (const evaluate of [evaluateIntegerFormat, value => evaluateAllowedValue(value, ['AN'])]) {
    for (const reason of ['BINDING_AMBIGUOUS', 'SCHEMA_UNAVAILABLE', 'UNRESOLVED_SOURCE']) {
      assert.deepEqual(evaluate({ state: reason }), { state: 'INDETERMINATE', reasonCode: reason });
    }
  }
});

test('all ten rules are isolated from lines, other objects, layers and revisions', () => {
  const bad = Object.fromEntries(ALL_NEW.map(([, , key]) => [key, 'bad']));
  const d = runtime(bad, Object.fromEntries(ALL_NEW.map(([, , key, , , values]) => [key, values ? values[0] : 1])));
  const result = run(d);
  for (const [id, field] of ALL_NEW) {
    const r = outcome(result, id, 'FAIL');
    assert.equal(r.geometryBreakdown.line.evaluatedCount, 0);
    const finding = r.findings[0];
    assert.equal(finding.ruleId, id);
    assert.equal(finding.canonicalFieldId, field);
    assert.equal(finding.objectRef.layerId, 'batch1-layer');
    assert.equal(finding.objectRef.datasetRevision, result.datasetRevision);
    assert.equal(finding.objectRef.geometryScope, 'point');
    assert.equal(finding.objectRef.sourceIndex, 0);
    assert.equal(fildata(d, result, id, field).rows[0].ruleAcceptance, 'Ugyldig');
    assert.throws(() => fildata(d, result, id, field, 'point', 'other-layer'), /layer|current|ownership/i);
    const replacement = runtime(bad);
    assert.throws(() => fildata(replacement, result, id, field), /revision|current|ownership/i);
  }
  const lineDataset = { ...d, points: [] };
  const onlyLines = run(lineDataset);
  for (const [id] of ALL_NEW) assert.equal(ruleResult(onlyLines, id).evaluatedObjectCount, 0);
  const refs = api.createGmiObjectRefs({ dataset: lineDataset, layerId: result.layerId, datasetRevision: getDatasetRevision(lineDataset), sourceFormat: 'gmi' });
  assert.throws(() => api.resolveGmiTemaIdentity({ dataset: lineDataset, layerId: 'other-layer', datasetRevision: result.datasetRevision,
    schemaBinding: result.schemaBinding, sourceFormat: 'gmi', objectRef: refs.lineRefs[0] }), /layer|ownership/i);
});

const PADDED_CODES = [
  [TEMA_RULE, 'tema', 'Tema', 'KUM'], [TYPE_RULE, 'type', 'Type', 'KSTA'],
  ['innmaling.point.manhole-shape.valid', 'manholeShape', 'Kumform', 'R'],
  ['innmaling.point.construction-method.valid', 'constructionMethod', 'Byggemetode', 'B'],
  ['innmaling.point.cone.valid', 'cone', 'Kjegle', 'U'],
];
test('real-parser padded existing point codes fail, with original Fildata evidence and no fabricated compatibility failure', () => {
  for (const [id, field, key, code] of PADDED_CODES) {
    for (const value of [` ${code}`, `${code} `, ` ${code} `]) {
      const d = parse({ Tema: 'KUM', Type: 'KSTA', [key]: value });
      assert.equal(d.points[0].attributes[key], code); // The parser still trims its typed value.
      assert.equal(d.points[0].attributes[GMI_SOURCE_LEXEMES][key], value);
      const result = run(d);
      outcome(result, id, 'FAIL', 'VALUE_NOT_ALLOWED');
      const summary = fildata(d, result, id, field);
      assert.equal(summary.rows[0].deliveredValue, JSON.stringify(value));
      assert.equal(summary.rows[0].ruleAcceptance, 'Ugyldig');
      if (key === 'Type' || key === 'Tema') {
        const relation = outcome(result, RELATIONSHIP, 'NOT_EVALUATED');
        assert.equal(relation.findings.length, 0);
      } else outcome(result, RELATIONSHIP, 'PASS');
    }
    outcome(run(parse({ Tema: 'KUM', Type: 'KSTA', [key]: code })), id, 'PASS');
    outcome(run(runtime({ Tema: 'KUM', Type: 'KSTA', [key]: code })), id, 'PASS');
  }
});

test('Tema original direct/fallback agreement, conflict and exact validation are shared by point and line', () => {
  for (const [geometry, code, other, id] of [['point', 'KUM', 'KRN', TEMA_RULE], ['line', 'VL', 'SP', 'innmaling.line.tema.required']]) {
    for (const [attributes, state, preferred, lexeme, expected, reason] of [
      [{ Tema: code }, 'RESOLVED', 'Tema', code, 'PASS', null],
      [{ S_FCODE: code }, 'RESOLVED', 'S_FCODE', code, 'PASS', null],
      [{ Tema: '', S_FCODE: code }, 'RESOLVED', 'S_FCODE', code, 'PASS', null],
      [{ Tema: code, S_FCODE: code }, 'RESOLVED', 'Tema', code, 'PASS', null],
      [{ Tema: ` ${code} ` }, 'RESOLVED', 'Tema', ` ${code} `, 'FAIL', 'VALUE_NOT_ALLOWED'],
      [{ S_FCODE: ` ${code} ` }, 'RESOLVED', 'S_FCODE', ` ${code} `, 'FAIL', 'VALUE_NOT_ALLOWED'],
      [{ Tema: '', S_FCODE: ` ${code} ` }, 'RESOLVED', 'S_FCODE', ` ${code} `, 'FAIL', 'VALUE_NOT_ALLOWED'],
      [{ Tema: ` ${code} `, S_FCODE: ` ${code} ` }, 'RESOLVED', 'Tema', ` ${code} `, 'FAIL', 'VALUE_NOT_ALLOWED'],
      [{ Tema: code, S_FCODE: other }, 'CONFLICT', null, 'UNAVAILABLE', 'INDETERMINATE', 'TEMA_CONFLICT'],
      [{ Tema: code, S_FCODE: ` ${code} ` }, 'CONFLICT', null, 'UNAVAILABLE', 'INDETERMINATE', 'TEMA_CONFLICT'],
      [{ Tema: ` ${code} `, S_FCODE: code }, 'CONFLICT', null, 'UNAVAILABLE', 'INDETERMINATE', 'TEMA_CONFLICT'],
    ]) {
      const d = parse(attributes, geometry), result = run(d), resolved = identity(d, result, geometry);
      assert.equal(resolved.state, state);
      assert.equal(resolved.preferredSourceKey, preferred);
      assert.equal(resolved.sourceLexeme, lexeme);
      assert.equal(resolved.layerId, result.layerId);
      assert.equal(resolved.datasetRevision, result.datasetRevision);
      assert.ok(Object.isFrozen(resolved));
      outcome(result, id, expected, reason);
      const summary = fildata(d, result, id, 'tema', geometry);
      assert.equal(summary.rows[0].ruleAcceptance, { PASS: 'Gyldig', FAIL: 'Ugyldig', INDETERMINATE: 'Må vurderes' }[expected]);
      if (state === 'RESOLVED') assert.equal(summary.rows[0].deliveredValue, JSON.stringify(lexeme));
      else assert.deepEqual(resolved.conflicts.map(x => x.sourceLexeme), Object.values(attributes));
    }
  }
});

test('owned lexemes outrank deliberately different runtime values through compatibility prerequisites and pair evaluation', () => {
  const attributes = { Tema: 'KRN', Type: 'bad' };
  Object.defineProperty(attributes, GMI_SOURCE_LEXEMES, { value: { Tema: 'KUM', Type: 'KSTA' } });
  const d = runtime(attributes), result = run(d);
  outcome(result, TEMA_RULE, 'PASS');
  outcome(result, TYPE_RULE, 'PASS');
  outcome(result, RELATIONSHIP, 'PASS');
  assert.equal(fildata(d, result, TEMA_RULE, 'tema').rows[0].ruleAcceptance, 'Gyldig');
  const padded = parse({ Tema: ' KUM ', Type: ' KSTA ' });
  const paddedResult = run(padded);
  outcome(paddedResult, RELATIONSHIP, 'NOT_EVALUATED');
  const paddedTemaFinding = ruleResult(paddedResult, TEMA_RULE).findings[0];
  assert.equal(JSON.stringify(paddedTemaFinding).includes('sourceLexeme'), false);
  const conflict = parse({ Tema: 'KUM', S_FCODE: ' KUM ', Type: 'KSTA' });
  outcome(run(conflict), RELATIONSHIP, 'INDETERMINATE', 'TEMA_CONFLICT');
});

test('existing requiredness stays separate and point format does not change line thickness', () => {
  for (const [formatId, , key] of BATCH1_INTEGERS.slice(0, 5)) {
    const requiredId = formatId.replace('.point.', key === 'Tykkelse' ? '.point.' : '.common.').replace('.integer', '.required');
    const missing = run(runtime({}));
    outcome(missing, requiredId, 'FAIL', 'REQUIRED_FIELD_ABSENT');
    outcome(missing, formatId, 'NOT_EVALUATED');
    const malformed = run(runtime({ [key]: '1.5' }));
    outcome(malformed, requiredId, 'PASS');
    outcome(malformed, formatId, 'FAIL', 'VALUE_NOT_INTEGER');
  }
  const line = parse({ Tykkelse: '1.5' }, 'line');
  outcome(run(line), 'innmaling.line.wall-thickness.required', 'PASS');
  const lineInfo = api.composeFieldInformation({ canonicalFieldId: 'wallThickness', geometryScope: 'line', rule: api.getValidationRule('innmaling.line.wall-thickness.required') });
  assert.equal(lineInfo.documentedFormat, 'Tall');
  assert.equal(lineInfo.required, true);
  assert.match(api.getFieldInformation('externalHeight').qualifications.map(x => x.text).join(' '), /SOURCE_CONFLICT.*side 5.*side 9/);
});

test('accepted direct and case-only duplicate keys agree only on identical source lexemes', () => {
  const duplicateCases = [
    ['Nøyaktighet', 'NØYAKTIGHET', '1', '1.0', 'innmaling.point.horizontal-accuracy.integer', 'horizontalAccuracy', 'Må vurderes'],
    ['Eier', 'EIER', 'AN', ' AN', 'innmaling.point.owner.valid', 'owner', 'Må vurderes'],
    ['Kumform', 'KUMFORM', 'R', ' R', 'innmaling.point.manhole-shape.valid', 'manholeShape', 'Må vurderes'],
    ['Type', 'TYPE', 'KSTA', ' KSTA', TYPE_RULE, 'type', 'Må vurderes'],
  ];
  for (const [directKey, caseOnlyKey, directValue, caseOnlyValue, ruleId, field, acceptance] of duplicateCases) {
    const malformed = parse({ [directKey]: directValue, [caseOnlyKey]: caseOnlyValue, Tema: 'KUM' });
    const result = run(malformed);
    outcome(result, ruleId, 'INDETERMINATE', 'BINDING_AMBIGUOUS');
    assert.equal(fildata(malformed, result, ruleId, field).rows[0].ruleAcceptance, acceptance);
  }

  const equivalentCases = [
    ['Nøyaktighet', 'NØYAKTIGHET', '1', '1', 'innmaling.point.horizontal-accuracy.integer', 'horizontalAccuracy'],
    ['Eier', 'EIER', 'AN', 'AN', 'innmaling.point.owner.valid', 'owner'],
    ['Kumform', 'KUMFORM', 'R', 'R', 'innmaling.point.manhole-shape.valid', 'manholeShape'],
    ['Type', 'TYPE', 'KSTA', 'KSTA', TYPE_RULE, 'type'],
  ];
  for (const [directKey, caseOnlyKey, value, duplicateValue, ruleId, field] of equivalentCases) {
    const duplicate = parse({ [directKey]: value, [caseOnlyKey]: duplicateValue, Tema: 'KUM' });
    const result = run(duplicate);
    outcome(result, ruleId, 'PASS');
    assert.equal(fildata(duplicate, result, ruleId, field).rows[0].ruleAcceptance, 'Gyldig');
  }
});

test('lexically conflicting Type duplicate blocks Type/Tema compatibility', () => {
  const duplicate = parse({ Type: 'KSTA', TYPE: ' KSTA', Tema: 'KUM' });
  const result = run(duplicate);
  outcome(result, TYPE_RULE, 'INDETERMINATE', 'BINDING_AMBIGUOUS');
  // Structural ambiguity follows the established relationship policy: it is
  // indeterminate, never a fabricated compatibility failure or pass.
  outcome(result, RELATIONSHIP, 'INDETERMINATE', 'BINDING_AMBIGUOUS');
  assert.equal(ruleResult(result, RELATIONSHIP).findings.some(f => f.reasonCode === 'TYPE_TEMA_INCOMPATIBLE'), false);
});

test('Eier Field Info distinguishes source scope from active rule scope', () => {
  const field = api.getFieldInformation('owner');
  assert.deepEqual(field.appliesTo, ['point', 'line']);
  const ruleInfo = api.composeFieldInformation({
    canonicalFieldId: 'owner',
    geometryScope: 'point',
    rule: api.getValidationRule('innmaling.point.owner.valid'),
  });
  assert.deepEqual(ruleInfo.appliesTo, ['point', 'line']);
  assert.deepEqual(api.getValidationRule('innmaling.point.owner.valid').geometryScopes, ['point']);
  assert.match(ruleInfo.qualifications.map(x => x.text).join(' '), /Kilde-feltet gjelder punkt og ledning.*regelen er punkt-only/);
});

test('applicability remains metadata-only and all new supplied checks are Tema-independent', async () => {
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.policyRevision, '2026-09-04.3');
  assert.equal(POINT_FIELD_APPLICABILITY_POLICY.cells.length, 88);
  assert.deepEqual(POINT_FIELD_APPLICABILITY_POLICY.cells.reduce((acc, x) => ({ ...acc, [x.state]: (acc[x.state] || 0) + 1 }), {}),
    { APPLICABLE: 71, NOT_APPLICABLE: 9, UNKNOWN: 8 });
  for (const tema of [{}, { Tema: 'KUM' }, { Tema: 'KRN' }, { Tema: 'KMR' }, { Tema: 'SUMP' }, { Tema: 'unknown' }, { Tema: 'KUM', S_FCODE: 'KRN' }]) {
    const d = runtime({ ...tema, ...Object.fromEntries(ALL_NEW.map(([, , key]) => [key, 'bad'])) });
    const result = run(d);
    for (const [id] of ALL_NEW) outcome(result, id, 'FAIL');
    assert.equal(result.ruleResults.filter(x => /applicability/.test(x.rule.ruleId)).length, 0);
  }
  for (const name of ['ruleEvaluation.js', 'validationRunner.js', 'fieldData.js', 'temaIdentity.js', 'registry/rules.js']) {
    const source = await readFile(new URL(`../src/lib/validation-v2/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /pointFieldApplicability|getPointFieldApplicability/);
  }
});

test('tab selection reuses completed results; summaries contain no source lexemes', () => {
  let calls = 0;
  const controller = createValidationV2ViewController(input => { calls++; return api.runGmiValidationV2(input); });
  const data = parse({ Tema: ' KUM ', Eier: ' AN ', Utvendig_høyde: '1000.0' });
  const input = createValidationV2Input({ id: 'batch1-layer', data });
  const completed = controller.run(input).result;
  assert.equal(controller.selectGeometry('line').result, completed);
  assert.equal(controller.selectGeometry('point').result, completed);
  assert.equal(calls, 1);
  assert.equal(completed.ruleResults.length, 41);
  assert.doesNotMatch(JSON.stringify(completed.summary), /sourceLexeme| KUM | AN |1000\.0/);
});
