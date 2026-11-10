import assert from 'node:assert/strict';
import test from 'node:test';
import { runGmiValidationV2, createGmiObjectValidator } from '../src/lib/validation-v2/validationRunner.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { buildFieldDiagnostics, renderValidationV2Diagnostic } from '../src/lib/validation-v2/diagnostics.js';

const ruleId = 'innmaling.point.inside-outside.valid';
function run(records, schema = []) {
  const dataset = { points: records.map((attributes) => ({ attributes })), lines: [],
    fieldAnalysis: { points: Object.fromEntries([...new Set([...schema, ...records.flatMap(Object.keys)])].map((key) => [key, {}])), lines: {} } };
  const original = structuredClone(dataset);
  const input = { layerId: 'inside-outside-width', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-11-10' };
  const result = runGmiValidationV2(input);
  assert.deepEqual(dataset, original);
  return { input, result };
}
const outcomes = (result) => result.outcomes.filter((item) => item.ruleId === ruleId);
const findings = (result) => result.ruleResults.find((item) => item.rule.ruleId === ruleId).findings;

test('point qualifier follows width presence including blank values, numeric zero and invalid dimensions', () => {
  for (const Tema of ['KUM', 'LOK', 'DIV', 'GRN', 'GUT']) {
    for (const Bredde of [undefined, null, '', '   ']) {
      for (const qualifier of [undefined, null, '', '  ', 'ID', 'OD', 'BAD']) {
        const { result } = run([{ Tema, ...(Bredde === undefined ? {} : { Bredde }),
          ...(qualifier === undefined ? {} : { InnvendigUtvendig: qualifier }) }]);
        const expected = qualifier === 'BAD' ? 'FAIL' : ['ID', 'OD'].includes(qualifier) ? 'CHECK' : 'PASS';
        assert.equal(outcomes(result)[0].state, expected, `${Tema}/${Bredde}/${qualifier}`);
        assert.equal(findings(result).length, expected === 'PASS' ? 0 : 1);
      }
    }
    for (const Bredde of [0, '0', 1600, '1600', 'BAD', -1]) {
      const records = [undefined, '', '   ', 'ID', 'OD', 'BAD', 'id', 'OD '].map((qualifier) => ({ Tema, Bredde,
        ...(qualifier === undefined ? {} : { InnvendigUtvendig: qualifier }) }));
      const { input, result } = run(records);
      const expected = ['FAIL', 'FAIL', 'FAIL', Tema === 'LOK' ? 'CHECK' : 'PASS', Tema === 'KUM' ? 'CHECK' : 'PASS', 'FAIL', 'FAIL', 'FAIL'];
      assert.deepEqual(outcomes(result).map((item) => item.state), expected, `${Tema}/${Bredde}`);
      const local = createGmiObjectValidator(input);
      records.forEach((_, sourceIndex) => {
        assert.deepEqual(outcomes(local.evaluate({ geometryScope: 'point', sourceIndex })), [outcomes(result)[sourceIndex]]);
        assert.equal(findings(result).filter((item) => item.objectRef.sourceIndex === sourceIndex).length, expected[sourceIndex] === 'PASS' ? 0 : 1);
      });
    }
  }
});

test('case-normalized field binding and resolved Tema fallback preserve code validation and recommendations', () => {
  const { result } = run([
    { S_FCODE: 'KUM', bredde: '1000', innvendigutvendig: 'OD' },
    { S_FCODE: 'LOK', bredde: '600', innvendigutvendig: 'ID' },
    { Tema: 'KUM', S_FCODE: 'LOK', bredde: '600', innvendigutvendig: 'ID' },
    { Tema: 'BAD', bredde: '600', innvendigutvendig: 'OD' },
  ]);
  assert.deepEqual(outcomes(result).map((item) => item.state), ['CHECK', 'CHECK', 'PASS', 'PASS']);
});

test('Bredde requirements remain independent and valid dates/vertical levels remain accepted', () => {
  const { result } = run(['GUT', 'KUM', 'LOK'].map((Tema) => ({ Tema, Datafangstdato: '2026-05-28',
    Vertikalnivå: Tema === 'KUM' ? 'UNDER_GRUNN' : 'OVER_GRUNN' })));
  assert.deepEqual(outcomes(result).map((item) => item.state), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(result.outcomes.filter((item) => item.ruleId === 'innmaling.point.width.integer').map((item) => item.state), ['CHECK', 'FAIL', 'FAIL']);
  for (const id of ['capture-date', 'vertical-level']) {
    assert.deepEqual(result.outcomes.filter((item) => item.ruleId === `innmaling.common.${id}.required`).map((item) => item.state), ['PASS', 'PASS', 'PASS']);
  }
});

test('Norwegian diagnostics distinguish missing width, missing qualifier and both Tema conventions', () => {
  const { result } = run([
    { Tema: 'KUM', Bredde: '1000', InnvendigUtvendig: 'OD' },
    { Tema: 'LOK', Bredde: '600', InnvendigUtvendig: 'ID' },
    { Tema: 'DIV', Bredde: '600' },
    { Tema: 'GRN', InnvendigUtvendig: 'ID' },
  ]);
  const rule = result.ruleResults.find((item) => item.rule.ruleId === ruleId).rule;
  const model = buildFieldDiagnostics({ result, rule, field: { canonicalFieldId: 'insideOutside', displayName: 'InnvendigUtvendig' }, geometryScope: 'point' });
  const messages = model.diagnostics.map(renderValidationV2Diagnostic);
  assert.equal(messages.length, 4);
  for (const text of ['KUM har InnvendigUtvendig = OD', 'LOK har InnvendigUtvendig = ID', 'Bredde er oppgitt, men InnvendigUtvendig mangler', 'InnvendigUtvendig er oppgitt uten Bredde']) {
    assert.ok(messages.some((message) => message.includes(text)), text);
  }
});
