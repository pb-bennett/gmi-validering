import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runGmiValidationV2, getValidationRule } from '../src/lib/validation-v2/index.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { buildFieldDiagnostics, renderValidationV2Diagnostic } from '../src/lib/validation-v2/diagnostics.js';

const POSITIONING_CAUSE = 'Stedfestings\u00e5rsak';

function run(points = [], lines = []) {
  const fields = (objects) => Object.fromEntries([...new Set(objects.flatMap(Object.keys))].map((key) => [key, {}]));
  const dataset = { points: points.map((attributes) => ({ attributes })), lines: lines.map((attributes) => ({ attributes })), fieldAnalysis: { points: fields(points), lines: fields(lines) } };
  return runGmiValidationV2({ layerId: 'real-data-polish', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-21' });
}

function outcome(result, ruleId, index, geometryScope = 'point') {
  return result.outcomes.find((item) => item.ruleId === ruleId && item.objectRef.geometryScope === geometryScope && item.objectRef.sourceIndex === index);
}

test('S_HYPERLINK LOK/TOP findings share one deduplicated exact-object diagnostic', () => {
  const result = run([
    { Tema: 'LOK', S_HYPERLINK: 'a' }, { Tema: 'LOK', S_HYPERLINK: 'b' },
    { Tema: 'TOP', S_HYPERLINK: 'c' }, { Tema: 'TOP', S_HYPERLINK: 'd' }, { Tema: 'TOP', S_HYPERLINK: 'e' },
  ]);
  const rule = getValidationRule('innmaling.point.attachment-link.policy');
  const model = buildFieldDiagnostics({ result, rule, field: { canonicalFieldId: 'attachmentLink', displayName: 'S_HYPERLINK' }, geometryScope: 'point', summary: { objectCount: 5 } });
  assert.equal(model.diagnostics.length, 1);
  assert.equal(model.diagnostics[0].count, 5);
  assert.deepEqual(model.diagnostics[0].exactObjectRefs.map((ref) => ref.sourceIndex), [0, 1, 2, 3, 4]);
  assert.equal(model.diagnostics[0].hasCompleteExactObjectRefs, true);
  assert.match(renderValidationV2Diagnostic(model.diagnostics[0]), /5 objekter/);
});

test('Bredde INR and Adkomst SLU are optional supported contexts', () => {
  const result = run([
    { Tema: 'INR' }, { Tema: 'INR', Bredde: '25' }, { Tema: 'INR', Bredde: 'bad' },
    { Tema: 'SLU' }, { Tema: 'SLU', Adkomst: 'ST' }, { Tema: 'SLU', Adkomst: 'BAD' },
    { Tema: 'KUM' }, { Tema: 'KUM', Adkomst: 'ST' }, { Tema: 'KUM', Adkomst: 'BAD' },
  ]);
  assert.deepEqual([0, 1, 2].map((index) => outcome(result, 'innmaling.point.width.integer', index).state), ['PASS', 'PASS', 'FAIL']);
  assert.deepEqual([3, 4, 5].map((index) => outcome(result, 'innmaling.point.access.valid', index).state), ['PASS', 'PASS', 'FAIL']);
  assert.deepEqual([6, 7, 8].map((index) => outcome(result, 'innmaling.point.access.valid', index).state), ['CHECK', 'PASS', 'FAIL']);
});

test('UENDR Ledning softens only missing Tykkelse, SDR and Ringstivhet requirements', () => {
  const causes = ['NYTT', 'UENDR', 'UENDR', 'UENDR', 'UENDR', 'UENDR', 'UENDR'];
  const result = run([], [
    { Tema: 'VL', Material: 'PE100', Stedfestingsårsak: 'NYTT' },
    { Tema: 'VL', Material: 'PE100', Stedfestingsårsak: 'UENDR' },
    { Tema: 'VL', Material: 'PE100', Stedfestingsårsak: 'UENDR', Tykkelse: '10', SDR: '11.0' },
    { Tema: 'VL', Material: 'PE100', Stedfestingsårsak: 'UENDR', Tykkelse: 'bad', SDR: 'bad' },
    { Tema: 'AF', Material: 'PVC', Stedfestingsårsak: 'UENDR' },
    { Tema: 'AF', Material: 'PVC', Stedfestingsårsak: 'UENDR', Ringstivhet: 'SN8' },
    { Tema: 'AF', Material: 'PVC', Stedfestingsårsak: 'UENDR', Ringstivhet: 'SN7' },
  ].map((line, index) => ({ ...line, [POSITIONING_CAUSE]: causes[index] })));
  const line = (ruleId, index) => outcome(result, ruleId, index, 'line');
  assert.equal(line('innmaling.line.wall-thickness.required', 0).state, 'FAIL');
  assert.equal(line('innmaling.line.sdr.valid', 0).state, 'FAIL');
  assert.equal(line('innmaling.line.wall-thickness.required', 1).state, 'CHECK');
  assert.equal(line('innmaling.line.wall-thickness.required', 1).reasonCode, 'EXISTING_INFRASTRUCTURE_VALUE_MISSING');
  assert.equal(line('innmaling.line.sdr.valid', 1).state, 'CHECK');
  assert.equal(line('innmaling.line.wall-thickness.required', 2).state, 'PASS');
  assert.equal(line('innmaling.line.sdr.valid', 2).state, 'PASS');
  assert.equal(line('innmaling.line.wall-thickness.required', 3).state, 'FAIL');
  assert.equal(line('innmaling.line.sdr.valid', 3).state, 'FAIL');
  assert.equal(line('innmaling.line.ring-stiffness.valid', 4).state, 'CHECK');
  assert.equal(line('innmaling.line.ring-stiffness.valid', 5).state, 'PASS');
  assert.equal(line('innmaling.line.ring-stiffness.valid', 6).state, 'FAIL');
  assert.equal(line('innmaling.line.dimension.required', 1).state, 'FAIL');
});

test('constrained table headers render a visible ellipsis while retaining the full title', async () => {
  const source = await readFile(new URL('../src/components/LayerDataTable.js', import.meta.url), 'utf8');
  assert.match(source, /function visibleHeaderLabel/);
  assert.match(source, /}…`/);
  assert.match(source, /title=\{fullHeaderLabel \|\| undefined\}/);
  assert.match(source, /line-clamp-2 leading-3/);
});
