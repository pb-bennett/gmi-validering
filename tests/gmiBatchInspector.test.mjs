import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGmiSourceDocument, createGmiEditSession, stageGmiChangeSet, undoGmiEdit, redoGmiEdit, discardAllGmiEdits, getGmiSourceBytes, getGmiProposedState, getGmiEditCell } from '../src/lib/gmi-edit/index.mjs';
import { prepareGmiBatchReview } from '../src/lib/gmiEditBatchView.mjs';
import { gmiSelectionTargets, gmiBatchScopeState, planGmiInspectorBatch } from '../src/lib/gmiBatchInspectorView.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import { getGmiProposedBytes } from '../src/lib/gmi-edit/index.mjs';
import { readFile } from 'node:fs/promises';
import { gmiInspectorFields, gmiFieldInspectorRows, gmiInspectorMixedFields, gmiBatchDatasetFindings } from '../src/lib/gmiBatchInspectorView.mjs';
import { prepareGmiFieldBatch, buildGmiFieldBatch, dryRunGmiFieldBatch } from '../src/lib/gmiFieldBatchPlan.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';

test('G4 field choices use capabilities for both scopes, explain unavailable columns and start without a field', async () => {
  const document = await loadGmiSourceDocument(gmiFieldBatchFixture());
  const view = { document, handle: { layerId: 'g4' } };
  for (const scope of ['point', 'line']) {
    const fields = gmiInspectorFields(view, scope);
    assert(fields.some((field) => field.sourceKey === 'Merknad' && !field.disabled));
    assert(fields.some((field) => !field.sourceKey && field.disabled && field.explanation.includes('Finnes ikke i filen')));
  }
  const component = await readFile(new URL('../src/components/gmi-edit/GmiBatchInspector.js', import.meta.url), 'utf8');
  assert.match(component, /\[field, setField\] = useState\(''\)/);
  assert.doesNotMatch(component, /initialField|GMI_BATCH_FIELDS/);
  const input = await readFile(new URL('../src/components/gmi-edit/GmiFieldValueInput.js', import.meta.url), 'utf8');
  assert.match(input, /domain\.options\.map/);
  assert.match(input, /<select/);
});

test('G4 point presentation preserves exclusions, manual applicability, exact values and dataset consequences', async () => {
  const document = await loadGmiSourceDocument(gmiFieldBatchFixture());
  const session = createGmiEditSession(document, { layerId: 'g4' });
  const handle = { layerId: 'g4', sessionId: 'g4-session', fingerprint: document.fingerprint };
  const view = { document, session, handle };
  const selection = { binding: handle, scope: 'point', keys: ['point:0', 'point:1', 'point:2'] };
  const prepared = await prepareGmiFieldBatch(view, { scope: 'point', sourceKey: 'InnvendigUtvendig', operation: 'set', value: 'OD', selection });
  assert.equal(prepared.ok, true);
  const candidate = buildGmiFieldBatch(session, prepared.preview);
  const batch = await dryRunGmiFieldBatch(session, candidate);
  assert.equal(batch.ok, true);
  const rows = gmiFieldInspectorRows(prepared.preview, batch, selection, false, null);
  assert.deepEqual(rows['point:0'].change, { from: '', to: 'OD', overwrites: false });
  assert.deepEqual(rows['point:2'].change, { from: 'ID', to: 'OD', overwrites: true });
  assert.deepEqual(gmiInspectorMixedFields(prepared.preview, batch.dryRun.current.dataset, batch.changeSet), ['Tema', 'InnvendigUtvendig']);
  assert(gmiBatchDatasetFindings(batch.dryRun).every((finding) => finding.reason && !finding.reason.includes('REQUIRED_')));
  const narrowed = { ...selection, keys: ['point:0'] };
  assert.equal(gmiFieldInspectorRows(prepared.preview, batch, narrowed, false, null)['point:1'].outcome, 'excluded');
  assert.equal(gmiFieldInspectorRows(prepared.preview, batch, selection, false, 'stale')['point:0'].outcome, 'stale');
  const manual = await prepareGmiFieldBatch(view, { scope: 'point', sourceKey: 'Kumform', operation: 'set', value: 'R', selection });
  const excluded = manual.preview.rows.find((row) => row.key === 'point:0');
  assert.equal(excluded.reason, 'not-applicable');
  const presentation = gmiFieldInspectorRows(manual.preview, null, selection, true, null)['point:0'];
  assert.equal(presentation.outcome, 'skipped');
  assert.equal(presentation.canManual, true);
  assert.equal(presentation.detail, 'Gjelder ikke ifølge Validator');
  assert.deepEqual(presentation.hypothetical.change, { from: '', to: 'R' });
});

test('G4 mixed gate compares only objects that change in the checked ChangeSet', async () => {
  const document = await loadGmiSourceDocument(gmiFieldBatchFixture());
  const session = createGmiEditSession(document, { layerId: 'g4-mixed' });
  const handle = { layerId: 'g4-mixed', sessionId: 'g4-mixed-session', fingerprint: document.fingerprint };
  const view = { document, session, handle };
  const dataset = getGmiProposedState(session).dataset;
  const mixed = async (scope, indices, sourceKey, operation, value) => {
    const selection = { binding: handle, scope, keys: indices.map((index) => `${scope}:${index}`) };
    const prepared = await prepareGmiFieldBatch(view, { scope, sourceKey, operation, value, selection });
    assert.equal(prepared.ok, true, `${sourceKey} preview`);
    const candidate = buildGmiFieldBatch(session, prepared.preview);
    assert.equal(candidate.ok, true, `${sourceKey} batch`);
    const changing = candidate.changeSet.cells.map((cell) => cell.sourceIndex);
    return { changing, fields: gmiInspectorMixedFields(prepared.preview, dataset, candidate.changeSet) };
  };
  // Fill-missing: one empty and one populated line. Only the empty one changes.
  assert.deepEqual(await mixed('line', [0, 1], 'Material', 'fill-missing', 'PVC'), { changing: [0], fields: [] });
  // A skipped object with another Tema (VL vs SP) does not make the change mixed.
  assert.deepEqual(await mixed('line', [0, 2], 'Material', 'fill-missing', 'PE'), { changing: [0], fields: [] });
  // Mixed across the selection (empty, blank, populated) but uniform among the changing objects.
  assert.deepEqual(await mixed('point', [0, 1, 3], 'InnvendigUtvendig', 'fill-missing', 'OD'), { changing: [0, 1], fields: [] });
  // Two changing objects with different Tema still raise Tema.
  assert.deepEqual(await mixed('line', [0, 2], 'Merknad', 'set', 'Kontrollert'), { changing: [0, 2], fields: ['Tema'] });
  // Set mode: an object that already has the value is unchanged and ignored (VL PE vs SP unlisted).
  assert.deepEqual(await mixed('line', [1, 2], 'Material', 'set', 'PE'), { changing: [2], fields: [] });
  // Set mode overwriting different existing values still raises the edited field.
  assert.deepEqual(await mixed('line', [0, 1, 2], 'Merknad', 'set', 'Kontrollert'), { changing: [0, 1, 2], fields: ['Tema', 'Merknad'] });
  assert.deepEqual(await mixed('point', [0, 2], 'InnvendigUtvendig', 'set', 'OD'), { changing: [0, 2], fields: ['Tema', 'InnvendigUtvendig'] });
  // A single changing object is never mixed, and no ChangeSet means no mix.
  assert.deepEqual(await mixed('point', [2], 'InnvendigUtvendig', 'set', 'OD'), { changing: [2], fields: [] });
  assert.deepEqual(gmiInspectorMixedFields(null, dataset, null), []);
});

test('S3 one severity symbol mapping is shared by the object editor, batch inspector, risk dialog and table', async () => {
  const source = (file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const icon = await source('components/gmi-edit/GmiSeverityIcon.js');
  assert.match(icon, /error: XCircleIcon, warning: WarningIcon, success: CheckCircleIcon/);
  assert.match(icon, /weight="regular" aria-hidden="true"/);
  for (const file of ['components/gmi-edit/GmiObjectEditor.js', 'components/gmi-edit/GmiBatchInspector.js', 'components/LayerDataTable.js']) {
    const text = await source(file);
    assert.match(text, /import GmiSeverityIcon\b.*from '\.\/(gmi-edit\/)?GmiSeverityIcon'/, file);
    assert.doesNotMatch(text, /WarningCircleIcon|WarningOctagonIcon|XCircleIcon/, `${file} must use the shared mapping`);
  }
  const editor = await source('components/gmi-edit/GmiObjectEditor.js');
  assert.match(editor, /icon=\{GMI_SEVERITY_ICONS\[tone\]\}/);
  // Selectors used by the M5A browser checks stay on the finding control.
  assert.match(editor, /data-severity=\{finding\.state\} data-transition=\{finding\.transition\}/);
  const inspector = await source('components/gmi-edit/GmiBatchInspector.js');
  assert.match(inspector, /<GmiSeverityIcon tone=\{tone\} size=\{14\} \/>\{newCount\(count, label\)\}/, 'severity count pills');
  assert.match(inspector, /<GmiSeverityIcon tone=\{tone\} size=\{16\} \/>\{title\}/, 'risk dialog groups');
  assert.match(inspector, /<GmiSeverityIcon tone=\{finding\.tone\} size=\{13\} \/><strong>\{finding\.severity\}/, 'inspected-object findings');
  assert.match(await source('components/LayerDataTable.js'), /<GmiSeverityIcon tone=\{first\.tone\} size=\{13\} \/>/);
  // The compact accent is an alias of the existing yellow-700, not a new colour.
  assert.match(await source('app/globals.css'), /--gmi-validation-compact-warning-text: var\(--gmi-validation-rule-count-warning-text\);/);
  assert.doesNotMatch(await source('components/gmi-edit/gmiEdit.css'), /gmi-review-hypothetical \{ opacity/);
});

test('G4 hydraulic fill preserves M2 populated exclusions even when the listed value is equal', async () => {
  const { view, selection } = await setup([0, 1]);
  const prepared = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey: 'SDR', operation: 'fill-missing', value: '11.0', selection });
  assert.equal(prepared.ok, true);
  const batch = buildGmiFieldBatch(view.session, prepared.preview);
  const rows = gmiFieldInspectorRows(prepared.preview, batch, selection, true, null);
  assert.equal(rows['line:1'].outcome, 'skipped');
  assert.equal(rows['line:1'].canManual, false);
  assert.equal(rows['line:1'].detail, 'Har allerede verdi «11.0»');
});

async function setup(indices = [0, 2, 6, 7]) {
  const bytes = gmiEditBatchFixture(), document = await loadGmiSourceDocument(bytes);
  const session = createGmiEditSession(document, { layerId: 'r4' });
  const binding = { layerId: 'r4', sessionId: 'session-r4', fingerprint: document.fingerprint };
  const view = { document, session, handle: { ...binding } };
  const selection = { binding, scope: 'line', keys: indices.map((i) => `line:${i}`) };
  const exact = gmiSelectionTargets(view, selection);
  assert.equal(exact.ok, true);
  const preview = await prepareGmiBatchReview(view, { canonicalFieldId: 'sdr', mode: 'fill-missing', lexeme: '11', targets: exact.targets });
  assert.equal(preview.ok, true);
  return { bytes, view, selection, review: { preview, binding, keys: selection.keys } };
}

test('R4 exact source targets reject foreign identity, malformed keys and absent point objects', async () => {
  const { view, selection } = await setup([0, 7]);
  assert.deepEqual(gmiSelectionTargets(view, selection).targets, [0, 7].map((sourceIndex) => ({ scope: 'line', sourceIndex, objectId: sourceIndex + 1, guid: null })));
  for (const field of ['layerId', 'sessionId', 'fingerprint']) assert.equal(gmiSelectionTargets(view, { ...selection, binding: { ...selection.binding, [field]: 'foreign' } }).ok, false);
  for (const keys of [[], ['line:9999'], ['line:01'], ['point:0'], ['line:0', 'line:0']]) assert.equal(gmiSelectionTargets(view, { ...selection, keys }).ok, false);
  assert.equal(gmiSelectionTargets(view, { ...selection, scope: 'point', keys: ['point:0'] }).code, 'invalid-targets');
});

test('R4 selected, eligible, skipped, manual, changed and new FEIL counts use M5B results', async () => {
  const { view, selection, review } = await setup();
  assert.equal(review.preview.eligibility.counts.total, 4);
  const ordinary = planGmiInspectorBatch(view, selection, review);
  assert.equal(ordinary.ok, true);
  assert.deepEqual(ordinary.counts, { selected: 4, eligible: 3, manual: 0, changed: 3, unchanged: 0, skipped: 1, excluded: 0, newErrors: 1, newChecks: 0 });
  const excluded = review.preview.skippedRows.find((row) => row.sourceIndex === 2);
  assert.equal(planGmiInspectorBatch(view, selection, review, new Set([excluded.key]), false, false).counts.manual, 0);
  const overridden = planGmiInspectorBatch(view, selection, review, new Set([excluded.key]), false, true);
  assert.equal(overridden.ok, true); assert.equal(overridden.counts.manual, 1); assert.equal(overridden.counts.changed, 4);
  assert.equal(overridden.changeSet.eligibility.manualOverrides.length, 1);
});

test('R4 shrinking rebuilds the exact subset; expansion and every history transition block stale staging', async () => {
  const { bytes, view, selection, review } = await setup([0, 7]);
  const smaller = { ...selection, keys: ['line:7'] };
  const plan = planGmiInspectorBatch(view, smaller, review);
  assert.equal(plan.ok, true); assert.deepEqual(plan.changeSet.cells.map((cell) => cell.sourceIndex), [7]);
  const expanded = { ...selection, keys: [...selection.keys, 'line:6'] };
  assert.equal(gmiBatchScopeState(view, expanded, review), 'expanded');
  assert.equal(planGmiInspectorBatch(view, expanded, review).ok, false);
  const staged = stageGmiChangeSet(view.session, plan.changeSet).session;
  assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), getGmiProposedBytes(getGmiProposedState(staged)), [{ scope: 'line', sourceIndex: 7, field: 'SDR', lexeme: '11' }]).failures, []);
  assert.equal(getGmiProposedState(staged).dataset.lines[7].attributes.SDR, 11);
  assert.equal(getGmiEditCell(staged, { scope: 'line', sourceIndex: 0, field: 'SDR' }).proposed, '');
  const undone = undoGmiEdit(staged).session, redone = redoGmiEdit(undone).session;
  assert.equal(getGmiEditCell(undone, { scope: 'line', sourceIndex: 7, field: 'SDR' }).proposed, ' ');
  assert.equal(getGmiProposedState(redone).dataset.lines[7].attributes.SDR, 11);
  for (const session of [staged, undone, redone, discardAllGmiEdits(staged).session]) assert.equal(planGmiInspectorBatch({ ...view, session }, smaller, review).code, 'stale-session');
  assert.deepEqual(getGmiSourceBytes(view.document), bytes);
});

test('R4 unchanged values, populated skips and hard manual limits stay M5B decisions', async () => {
  const { view, selection } = await setup([1, 2]);
  const preview = await prepareGmiBatchReview(view, { canonicalFieldId: 'sdr', mode: 'overwrite', lexeme: '11.0', targets: gmiSelectionTargets(view, selection).targets });
  const review = { preview, binding: selection.binding, keys: selection.keys };
  const plan = planGmiInspectorBatch(view, selection, review);
  assert.equal(plan.counts.unchanged, 1); assert.equal(plan.counts.changed, 0); assert.equal(plan.counts.skipped, 1);
  const fill = await prepareGmiBatchReview(view, { canonicalFieldId: 'sdr', mode: 'fill-missing', lexeme: '11', targets: [{ scope: 'line', sourceIndex: 1 }] });
  const forbidden = planGmiInspectorBatch(view, { ...selection, keys: ['line:1'] }, { preview: fill, binding: selection.binding, keys: ['line:1'] }, new Set([fill.skippedRows[0].key]), false, true);
  assert.equal(forbidden.ok, false);
  for (const canonicalFieldId of ['pressureClass', 'ringStiffness']) {
    const result = await prepareGmiBatchReview(view, { canonicalFieldId, mode: 'overwrite', lexeme: canonicalFieldId === 'pressureClass' ? 'PN16' : 'SN8', targets: gmiSelectionTargets(view, selection).targets });
    assert.equal(result.ok, true); assert.equal(result.eligibility.counts.total, 2);
  }
});
