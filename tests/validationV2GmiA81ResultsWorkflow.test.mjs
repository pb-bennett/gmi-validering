import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
register('./esmJsLoader.mjs', import.meta.url);
const api = await import('../src/lib/validation-v2/index.js');
const { createValidationV2ViewController } = await import('../src/lib/validation-v2/validationViewController.js');
const { getValidationV2GeometryView } = await import('../src/lib/validation-v2/uiIntegration.js');
const counts = ({ passCount = 0, checkCount = 0, failCount = 0, notEvaluatedCount = 0, dependencyReviewCount = 0 } = {}) => ({ evaluatedCount: passCount + checkCount + failCount + notEvaluatedCount, passCount, checkCount, failCount, notEvaluatedCount, dependencyReviewCount, indeterminateCount: 0 });
test('aggregate result semantics are Pass, Sjekk, Feil with failure precedence', () => { for (const [input, expected, label] of [[{ passCount: 1 }, 'PASS', 'Pass'], [{ checkCount: 1 }, 'CHECK', 'Sjekk'], [{ passCount: 1, checkCount: 1 }, 'CHECK', 'Sjekk'], [{ passCount: 1, checkCount: 1, failCount: 1 }, 'FAIL', 'Feil']]) { const status = api.getValidationV2AggregateStatus(counts(input)); assert.equal(status.enum, expected); assert.equal(status.label, label); } });
test('suppressed outcomes do not create a visible owner status, while genuine dependencies do', () => {
  assert.equal(api.getValidationV2AggregateStatus(counts({ notEvaluatedCount: 4 })).enum, null);
  assert.equal(api.getValidationV2AggregateStatus(counts({ passCount: 2, notEvaluatedCount: 4 })).label, 'Pass');
  assert.equal(api.getValidationV2AggregateStatus(counts({ dependencyReviewCount: 4 })).label, 'Sjekk');
  assert.equal(api.getValidationV2AggregateStatus(counts({ passCount: 2, dependencyReviewCount: 4 })).label, 'Sjekk');
  assert.equal(api.getValidationV2AggregateStatus(counts({ failCount: 1, notEvaluatedCount: 4 })).label, 'Feil');
  assert.equal(api.getValidationV2AggregateStatus(counts({ checkCount: 1, notEvaluatedCount: 4 })).label, 'Sjekk');
});
test('non-evaluated owners are omitted from field presentations without changing real owner statuses', () => {
  const rules = api.getValidationRules();
  const typeRule = rules.find((rule) => rule.ruleId === 'innmaling.point.type.valid');
  const compatibilityRule = rules.find((rule) => rule.ruleId === 'innmaling.point.type-tema.compatible');
  const presentations = api.getValidationV2PresentationRules([
    { rule: typeRule, geometryBreakdown: { point: counts({ passCount: 2, notEvaluatedCount: 4 }) } },
    { rule: compatibilityRule, geometryBreakdown: { point: counts({ notEvaluatedCount: 6 }) } },
  ], 'point');
  assert.deepEqual(presentations.map((item) => [item.rule.ruleId, item.status.label]), [['innmaling.point.type.valid', 'Pass']]);
});
test('presentation filtering, sorting and active universes use canonical fields', () => { const results = api.getValidationRules().map((rule) => ({ rule, geometryBreakdown: { point: counts({ passCount: 1 }), line: counts({ passCount: 1 }) } })); const point = api.getValidationV2PresentationRules(results, 'point'); const line = api.getValidationV2PresentationRules(results, 'line'); const uniqueFields = (scope) => new Set(api.getValidationRules().filter((rule) => rule.geometryScopes.includes(scope)).map((rule) => rule.canonicalFieldId)).size; assert.equal(point.length, uniqueFields('point')); assert.equal(line.length, uniqueFields('line')); assert.equal(api.filterValidationV2RulePresentations(point, { statusFilter: api.ValidationV2StatusFilter.PASS }).length, point.length); });

test('Type is one field with both owners, worst status and deduplicated object counts', () => {
  const data = { points: [
    { attributes: { Tema: 'DIV', Type: null } },
    { attributes: { Tema: 'DIV', Type: 'FORAKLOSS' } },
    { attributes: { Tema: 'DIV', Type: 'BAD' } },
    { attributes: { Tema: 'DIV', Type: 'DB11' } },
  ], lines: [], fieldAnalysis: { points: { Tema: {}, Type: {} }, lines: {} } };
  const result = api.runGmiValidationV2({ layerId: 'grouped-type', dataset: data, datasetRevision: 'grouped-type', sourceFormat: 'gmi' });
  const presentations = api.getValidationV2PresentationRules(result.ruleResults, 'point');
  const type = presentations.filter((item) => item.displayName === 'Type');
  assert.equal(type.length, 1);
  assert.deepEqual(type[0].rules.map((rule) => rule.ruleId), ['innmaling.point.type.valid', 'innmaling.point.type-tema.compatible']);
  assert.equal(presentations.some((item) => item.displayName === 'Type passer til Tema'), false);
  assert.equal(type[0].status.label, 'Feil');
  assert.deepEqual([type[0].counts.evaluatedCount, type[0].counts.failCount, type[0].counts.passCount], [4, 3, 1]);
  assert.equal(type[0].counts.failCount + type[0].counts.checkCount + type[0].counts.passCount, 4);
  const field = { canonicalFieldId: 'type', displayName: 'Type' };
  const model = api.buildFieldDiagnosticsForRules({ result, rules: type[0].rules, field, geometryScope: 'point' });
  assert.equal(model.diagnostics.some((item) => item.ruleIds.includes('innmaling.point.type.valid')), true);
  const compatibility = model.diagnostics.find((item) => item.ruleIds.includes('innmaling.point.type-tema.compatible'));
  assert.deepEqual(compatibility.relationshipPairs, [{ type: 'FORAKLOSS', tema: 'DIV', count: 1 }]);
});
test('one run feeds both geometry views without a rerun', () => { const data = { points: [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG' } }], lines: [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG' } }], fieldAnalysis: { points: { Høydereferanse: {} }, lines: { Høydereferanse: {} } } }; let calls = 0; const controller = createValidationV2ViewController((input) => { calls += 1; return api.runGmiValidationV2(input); }); const result = controller.run({ layerId: 'tabs', dataset: data, datasetRevision: 'tabs-rev', sourceFormat: 'gmi' }).result; const line = controller.selectGeometry('line'); assert.equal(calls, 1); assert.equal(line.result, result); assert.equal(getValidationV2GeometryView(result, 'line').summary.objectCount, 1); });
test('schema Tema/S_FCODE coexistence remains a visible geometry-local Sjekk',()=>{const data={points:[{attributes:{Tema:'KUM',S_FCODE:'KUM'}}],lines:[],fieldAnalysis:{points:{Tema:{},S_FCODE:{}},lines:{}}};const result=api.runGmiValidationV2({layerId:'schema-check',dataset:data,datasetRevision:'schema-check',sourceFormat:'gmi'});const view=getValidationV2GeometryView(result,'point');assert.deepEqual(view.schemaFindings.map(x=>x.reasonCode),['SCHEMA_TEMA_SFCODE_COEXISTENCE']);assert.equal(view.summary.schemaCheckCount,1);assert.equal(view.summary.checkCount>=1,true);});
test('workspace and details UI expose only Pass/Sjekk/Feil status vocabulary',async()=>{const files=await Promise.all(['../src/components/validation-v2/ValidationV2Workspace.js','../src/components/validation-v2/ValidationV2RuleList.js'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));const source=files.join('\n');assert.doesNotMatch(source,/Må rettes|Må vurderes|Ikke oppfylt|Delvis oppfylt|ValidationV2StatusFilter\.(?:NOT_MET|PARTIALLY_MET|MET)|status\.enum !== 'MET'/);assert.match(source,/label="Pass"/);assert.match(source,/label="Feil"/);assert.match(source,/Sjekk:/);});
