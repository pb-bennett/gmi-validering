import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGmiSourceDocument, createGmiEditSession, stageGmiChangeSet, undoGmiEdit, redoGmiEdit, discardAllGmiEdits, getGmiSourceBytes, getGmiProposedState, getGmiEditCell } from '../src/lib/gmi-edit/index.mjs';
import { prepareGmiBatchReview } from '../src/lib/gmiEditBatchView.mjs';
import { gmiSelectionTargets, gmiBatchScopeState, planGmiInspectorBatch } from '../src/lib/gmiBatchInspectorView.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import { getGmiProposedBytes } from '../src/lib/gmi-edit/index.mjs';
import { readFile } from 'node:fs/promises';
import { gmiInspectorFields, gmiFieldInspectorRows, gmiInspectorMixedFields, gmiBatchDatasetFindings, gmiBatchDatasetTransitions, gmiObjectFindingTransitions } from '../src/lib/gmiBatchInspectorView.mjs';
import { getGmiFieldBatchApproval } from '../src/lib/gmiFieldBatchPlan.mjs';
import { batchReviewSortValue } from '../src/lib/gmiTableReviewPresentation.mjs';
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
  assert.match(input, /<ObjectFieldValueInput id=\{id\} domain=\{column\?\.domain\}/);
  assert.match(input, /options\.map/);
  assert.match(input, /<select/);
  assert.match(component, /Boolean\(field && column && !column\.disabled\)/);
  assert.match(component, /const dirty = Boolean\(lexeme \|\| review \|\| mode !== 'fill-missing'\)/);
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

async function transitionCase(sourceKey, value, indices) {
  const lineFields = ['Tema', 'Material', 'Merknad', 'SDR', 'Trykklasse', 'Ringstivhet', 'Dimensjon', 'Rørform', 'VertikalDimensjon', 'Anleggsår'];
  const base = ['VL', 'PE', '', '', '', '', '160', 'S', ''];
  const document = await loadGmiSourceDocument(gmiFieldBatchFixture({ lineFields, lines: [[...base, ''], [...base, 'ugyldig'], [...base, '2999']] }));
  const session = createGmiEditSession(document, { layerId: 's2' });
  const handle = { layerId: 's2', sessionId: 's2-session', fingerprint: document.fingerprint };
  const view = { document, session, handle };
  const selection = { binding: handle, scope: 'line', keys: indices.map((index) => `line:${index}`) };
  const prepared = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey, operation: 'set', value, selection });
  assert.equal(prepared.ok, true);
  const batch = await dryRunGmiFieldBatch(session, buildGmiFieldBatch(session, prepared.preview));
  assert.equal(batch.ok, true);
  return { session, batch, rows: gmiFieldInspectorRows(prepared.preview, batch, selection, false, null) };
}

test('S2 SJEKK → FEIL is shown once as «Forverret» but still counts as a new FEIL for approval', async () => {
  // Line 0: empty Anleggsår (SJEKK) → «ugyldig» (FEIL). Line 2: future year (FEIL) → «ugyldig» (FEIL, other reason).
  const { session, batch, rows } = await transitionCase('Anleggsår', 'ugyldig', [0, 2]);
  // Safety: approval data and gate counts are untouched; the worsened FEIL is an introduced FEIL.
  assert.deepEqual(batch.dryRun.diff.newCounts, { fail: 2, check: 0 });
  assert.deepEqual(batch.datasetCounts.introduced, { fail: 2, check: 0 });
  assert.equal(getGmiFieldBatchApproval(session, batch).dryRun.diff.newCounts.fail, 2, 'the risk dialog gate still fires');
  const transitions = gmiBatchDatasetTransitions(batch.dryRun);
  assert.equal(gmiBatchDatasetTransitions(batch.dryRun), transitions, 'cached per dry run');
  assert.deepEqual(transitions.counts, { newFail: 1, newCheck: 0, worsened: 1, improved: 0, resolvedFail: 1, resolvedCheck: 0 });
  assert.equal(transitions.worsened[0].objectRef.sourceIndex, 0);
  assert.equal(transitions.worsened[0].label, 'Forverret: SJEKK → FEIL');
  assert.equal(transitions.added[0].objectRef.sourceIndex, 2, 'a same-severity reason change stays new + resolved');
  assert.equal(transitions.resolved[0].objectRef.sourceIndex, 2);
  assert.equal(transitions.added.length + transitions.worsened.length, batch.dryRun.introduced.length, 'every introduced finding is shown exactly once');
  // Per object (Data Table and inspected object).
  const [worse] = rows['line:0'].findings;
  assert.deepEqual([worse.transition, worse.label, worse.tone, worse.introduced, worse.previousSeverity], ['worsened', 'Forverret: SJEKK → FEIL', 'error', true, 'SJEKK']);
  assert.equal(rows['line:0'].findings.length, 1, 'the resolved SJEKK is not listed again');
  assert.equal(rows['line:0'].resolvedCount, 0);
  assert(rows['line:0'].existingCount > 0, 'unchanged findings are counted, not listed');
  assert.deepEqual(rows['line:2'].findings.map((finding) => finding.label), ['FEIL (ny)']);
  assert.equal(rows['line:2'].resolvedCount, 1);
  assert.equal(batchReviewSortValue(rows['line:0'], 'batchFindings'), 0, 'sorting is unchanged');
});

test('S2 FEIL → SJEKK is shown once as «Forbedret» and the remaining SJEKK stays visible', async () => {
  const { batch, rows } = await transitionCase('Anleggsår', '1800', [1]);
  const transitions = gmiBatchDatasetTransitions(batch.dryRun);
  assert.deepEqual(transitions.counts, { newFail: 0, newCheck: 0, worsened: 0, improved: 1, resolvedFail: 0, resolvedCheck: 0 });
  assert.deepEqual([transitions.improved[0].label, transitions.improved[0].note, transitions.improved[0].tone], ['Forbedret: FEIL → SJEKK', 'SJEKK gjenstår', 'warning']);
  const [better] = rows['line:1'].findings;
  assert.deepEqual([better.transition, better.label, better.tone, better.note], ['improved', 'Forbedret: FEIL → SJEKK', 'warning', 'SJEKK gjenstår']);
  assert.equal(batchReviewSortValue(rows['line:1'], 'batchFindings'), 1, 'still sorts with new SJEKK');
});

test('S2 unchanged existing findings never hide new ones; only existing findings read «Ingen nye funn»', async () => {
  const { batch, rows } = await transitionCase('Merknad', 'Kontrollert', [0, 1]);
  assert.deepEqual(batch.dryRun.diff.newCounts, { fail: 0, check: 0 });
  for (const key of ['line:0', 'line:1']) {
    assert.deepEqual(rows[key].findings, [], `${key}: nothing new`);
    assert(rows[key].existingCount > 0, `${key}: existing findings are kept as a count`);
  }
  // Existing FEIL + new SJEKK: the new SJEKK leads, the FEIL is secondary.
  const mixed = gmiObjectFindingTransitions({ findings: [
    { key: 'old', ruleId: 'r1', state: 'FAIL', batchIntroduced: false, reason: 'gammel feil' },
    { key: 'new', ruleId: 'r2', state: 'CHECK', batchIntroduced: true, reason: 'ny sjekk' }], resolvedFindings: [] });
  assert.deepEqual(mixed.findings.map((finding) => [finding.label, finding.reason]), [['SJEKK (ny)', 'ny sjekk']]);
  assert.deepEqual(mixed.existing.map((finding) => [finding.severity, finding.transition]), [['FEIL', 'existing']]);
  // Ranking: new FEIL, worsened, new SJEKK, improved. Hydraulic rows (currentFindings/otherFindings) pair the same way.
  const ranked = gmiObjectFindingTransitions({
    findings: [{ key: 'c', ruleId: 'c', state: 'CHECK', batchIntroduced: true }, { key: 'w', ruleId: 'w', state: 'FAIL', batchIntroduced: true },
      { key: 'i', ruleId: 'i', state: 'CHECK', batchIntroduced: true }, { key: 'f', ruleId: 'f', state: 'FAIL', batchIntroduced: true }],
    otherFindings: [{ key: 'o', ruleId: 'o', state: 'CHECK' }],
    currentFindings: [{ key: 'w0', ruleId: 'w', state: 'CHECK' }, { key: 'i0', ruleId: 'i', state: 'FAIL' }, { key: 'o', ruleId: 'o', state: 'CHECK' }, { key: 'gone', ruleId: 'g', state: 'FAIL' }] });
  assert.deepEqual(ranked.findings.map((finding) => `${finding.transition}:${finding.key}`), ['new:f', 'worsened:w', 'new:c', 'improved:i']);
  assert.deepEqual([ranked.existingCount, ranked.resolvedCount, ranked.resolved[0].key], [1, 1, 'gone']);
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
