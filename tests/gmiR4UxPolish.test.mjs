import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGmiSourceDocument, createGmiEditSession, stageGmiChangeSet, getGmiSourceBytes, getGmiProposedState, getGmiProposedBytes } from '../src/lib/gmi-edit/index.mjs';
import { prepareGmiBatchReview } from '../src/lib/gmiEditBatchView.mjs';
import { gmiSelectionTargets, gmiBatchScopeState, planGmiInspectorBatch, gmiBatchReviewRows, gmiBatchSkipSummary, gmiBatchFindingList } from '../src/lib/gmiBatchInspectorView.mjs';
import { gmiObjectNumber, gmiObjectMatchesQuery, describeGmiObject, summarizeGmiChangeSet, gmiObjectCountLabel, gmiChangeSetCellViews } from '../src/lib/gmiEditView.mjs';
import { deriveLayerTableRows } from '../src/lib/layerTableRows.mjs';
import { applyColumnFocus } from '../src/lib/objectTablePresentation.js';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

// Fixture lines (index → :L number = index + 1): 0 VL/PE empty SDR, 1 VL/PE SDR 11.0,
// 2 SP/PVC (gravity: SDR not recommended), 6 VL/PE with Ringstivhet SN8, 7 VL/PE SDR ' '.
async function setup(indices) {
  const bytes = gmiEditBatchFixture(), document = await loadGmiSourceDocument(bytes);
  const session = createGmiEditSession(document, { layerId: 'ux' });
  const binding = { layerId: 'ux', sessionId: 'session-ux', fingerprint: document.fingerprint };
  const view = { document, session, handle: { ...binding } };
  const selection = { binding, scope: 'line', keys: indices.map((i) => `line:${i}`) };
  const preview = await prepareGmiBatchReview(view, { canonicalFieldId: 'sdr', mode: 'fill-missing', lexeme: '11', targets: gmiSelectionTargets(view, selection).targets });
  assert.equal(preview.ok, true);
  return { bytes, view, selection, review: { preview, binding, keys: [...selection.keys] } };
}
const rowsFor = (review, plan, selection, advanced = false, stale = null) => gmiBatchReviewRows({ review, plan, selection, advanced, stale });

test('excluded objects never show a change or findings; the staged ChangeSet is the only source of «Endres»', async () => {
  const { view, selection, review } = await setup([0, 6, 7]);
  const full = planGmiInspectorBatch(view, selection, review);
  assert.equal(full.counts.newErrors, 1, 'Ledning 7 (SN8) would get SDR+Ringstivhet FEIL');
  // The reported case: uncheck one previewed object (here Ledning 7) after the preview.
  const smaller = { ...selection, keys: ['line:0', 'line:7'] };
  const plan = planGmiInspectorBatch(view, smaller, review);
  const rows = rowsFor(review, plan, smaller);
  assert.deepEqual(rows['line:6'], { outcome: 'excluded', detail: '', findings: [] });
  assert.equal(rows['line:6'].change, undefined);
  assert.equal(rows['line:6'].hypothetical, undefined);
  assert.deepEqual(plan.changeSet.cells.map((cell) => cell.sourceIndex), [0, 7]);
  for (const key of ['line:0', 'line:7']) assert.equal(rows[key].outcome, 'change');
  assert.deepEqual(rows['line:7'].change, { from: ' ', to: '11', overwrites: false });
  // Counts follow the actual operation: the excluded candidate's FEIL is gone.
  assert.equal(plan.counts.newErrors, 0); assert.equal(plan.counts.excluded, 1); assert.equal(plan.counts.changed, 2);
  // Every «Endres» record corresponds exactly to a staged cell and vice versa.
  const changing = Object.entries(rows).filter(([, row]) => ['change', 'manual'].includes(row.outcome)).map(([key]) => key).sort();
  assert.deepEqual(changing, plan.changeSet.cells.map((cell) => `${cell.scope}:${cell.sourceIndex}`).sort());
});

test('re-adding a removed object invalidates the preview and shows no values for any object', async () => {
  const { view, selection, review } = await setup([0, 7]);
  const shrunk = { ...selection, keys: ['line:0'] };
  assert.equal(planGmiInspectorBatch(view, shrunk, review).ok, true);
  const readded = { ...selection, keys: ['line:0', 'line:7'] };
  // Re-adding is still a subset of the snapshot; the inspector latches «expanded» on any addition.
  assert.equal(gmiBatchScopeState(view, readded, review), null);
  const stale = rowsFor(review, null, readded, false, 'expanded');
  assert.deepEqual(stale, { 'line:0': { outcome: 'stale', detail: '', findings: [] }, 'line:7': { outcome: 'stale', detail: '', findings: [] } });
  const wider = { ...selection, keys: ['line:0', 'line:7', 'line:2'] };
  assert.equal(gmiBatchScopeState(view, wider, review), 'expanded');
  assert.equal(rowsFor(review, null, wider, false, 'expanded')['line:2'].outcome, 'added');
  assert(Object.values(rowsFor(review, null, wider, false, 'expanded')).every((row) => !row.change && !row.hypothetical));
});

test('skipped, manual and hypothetical outcomes stay distinct; hypotheticals are never counted', async () => {
  const { view, selection, review } = await setup([0, 1, 2]);
  const plan = planGmiInspectorBatch(view, selection, review);
  const rows = rowsFor(review, plan, selection);
  assert.equal(rows['line:1'].outcome, 'skipped'); assert.equal(rows['line:1'].detail, 'Har allerede verdi «11.0»');
  assert.equal(rows['line:2'].outcome, 'skipped'); assert.equal(rows['line:2'].detail, 'SDR anbefales ikke for selvfallsledninger (Tema SP)');
  assert.equal(rows['line:2'].hypothetical, null, 'no hypothetical without advanced mode');
  assert.equal(plan.counts.newChecks, 0);
  // Advanced mode: a permitted candidate shows a labelled hypothetical; populated values never do.
  const advanced = rowsFor(review, planGmiInspectorBatch(view, selection, review, new Set(), false, true), selection, true);
  assert.equal(advanced['line:2'].canManual, true);
  assert.deepEqual(advanced['line:2'].hypothetical.change, { from: '', to: '11' });
  assert(advanced['line:2'].hypothetical.findings.some((finding) => finding.introduced && finding.severity === 'SJEKK'));
  assert.equal(advanced['line:1'].canManual, false); assert.equal(advanced['line:1'].hypothetical, null);
  // Manual inclusion turns the hypothetical into an actual, counted change.
  const key = review.preview.skippedRows.find((row) => row.sourceIndex === 2).key;
  const manualPlan = planGmiInspectorBatch(view, selection, review, new Set([key]), false, true);
  const manual = rowsFor(review, manualPlan, selection, true);
  assert.equal(manual['line:2'].outcome, 'manual'); assert.equal(manual['line:2'].manualOn, true);
  assert.deepEqual(manual['line:2'].change, { from: '', to: '11', overwrites: false });
  assert.equal(manualPlan.counts.manual, 1); assert.equal(manualPlan.counts.newChecks, 1);
  assert.equal(manualPlan.changeSet.eligibility.manualOverrides.length, 1);
});

test('nothing eligible: skipped objects keep reasons and manual candidates; a failed construction is shown as invalid', async () => {
  const { view, selection, review } = await setup([1, 2]);
  const plan = planGmiInspectorBatch(view, selection, review, new Set(), false, true);
  assert.equal(plan.ok, false); assert.equal(plan.included.size, 0);
  const rows = rowsFor(review, plan, selection, true);
  assert.equal(rows['line:1'].outcome, 'skipped'); assert.equal(rows['line:2'].canManual, true);
  const failed = rowsFor(review, { ok: false, code: 'invalid-targets', included: new Set([review.preview.skippedRows[0].key]) }, selection);
  assert.equal(failed['line:1'].outcome, 'stale');
});

test('new FEIL and SJEKK counts and lists come from changing cells only, most severe first', async () => {
  const findings = gmiBatchFindingList([
    { key: 'a', state: 'CHECK', batchIntroduced: false, reason: 'old check' },
    { key: 'b', state: 'CHECK', batchIntroduced: true, reason: 'new check' },
    { key: 'c', state: 'FAIL', batchIntroduced: false, reason: 'old fail' },
    { key: 'd', state: 'FAIL', batchIntroduced: true, reason: 'new fail' },
  ]);
  assert.deepEqual(findings.map((finding) => finding.key), ['d', 'c', 'b', 'a']);
  assert.deepEqual(findings.map((finding) => finding.tone), ['error', 'error', 'warning', 'warning']);
  const { view, selection, review } = await setup([0, 6]);
  const withSix = rowsFor(review, planGmiInspectorBatch(view, selection, review), selection);
  assert.equal(withSix['line:6'].findings[0].severity, 'FEIL'); assert.equal(withSix['line:6'].findings[0].introduced, true);
});

test('skip summaries name the actual applicability reason from M5B evidence', () => {
  const facts = (applicabilityReason, classification, context) => ({ evidence: { diagnosticFacts: { applicabilityReason, classification, context } } });
  assert.equal(gmiBatchSkipSummary({ reason: 'not-applicable', ...facts('MATERIAL_FAMILY_NOT_RECOMMENDED', 'PRESSURE', [{ fieldId: 'material', value: 'BET' }]) }, 'SDR'), 'SDR anbefales ikke for material BET');
  assert.equal(gmiBatchSkipSummary({ reason: 'not-applicable', ...facts('SPECIAL_HYDRAULIC_CONTEXT', 'SPECIAL', [{ fieldId: 'tema', value: 'VLVAR' }]) }, 'SDR'), 'Spesiell hydraulisk klasse (Tema VLVAR) – vurder manuelt');
  assert.equal(gmiBatchSkipSummary({ reason: 'conflict' }, 'SDR'), 'Endret av en tidligere retting');
  assert.equal(gmiBatchSkipSummary({ reason: 'unresolved', ...facts(null, null, [{ fieldId: 'tema', value: 'X' }]) }, 'Trykklasse'), 'Uavklart om Trykklasse gjelder (Tema X)');
});

test('staging the reviewed plan is source-safe and the ChangeSet summary matches exactly the staged objects', async () => {
  const { bytes, view, selection, review } = await setup([0, 6, 7]);
  const current = { ...selection, keys: ['line:0', 'line:7'] };
  const plan = planGmiInspectorBatch(view, current, review);
  const staged = stageGmiChangeSet(view.session, plan.changeSet).session;
  assert.deepEqual(getGmiSourceBytes(view.document), bytes, 'original bytes untouched');
  assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), getGmiProposedBytes(getGmiProposedState(staged)),
    [0, 7].map((sourceIndex) => ({ scope: 'line', sourceIndex, field: 'SDR', lexeme: '11' }))).failures, []);
  const summary = summarizeGmiChangeSet(plan.changeSet);
  assert.deepEqual({ title: summary.title, fields: [...summary.fields], objects: summary.objects, objectsLabel: summary.objectsLabel },
    { title: 'Fyll SDR · 11', fields: ['SDR'], objects: 2, objectsLabel: '2 ledninger' });
  assert.deepEqual(gmiChangeSetCellViews(plan.changeSet, null).map((cell) => [cell.object, cell.original, cell.next]),
    [['Ledning 1', '', '11'], ['Ledning 8', ' ', '11']]);
  assert.equal(gmiObjectCountLabel(1, 'point'), '1 punkt'); assert.equal(gmiObjectCountLabel(3, null), '3 objekter');
});

test('object numbers come from source object identity and survive sorting, filtering and search', () => {
  assert.deepEqual({ ...gmiObjectNumber('line', 37, 38) }, { text: '38', numbered: true, label: 'Ledning 38', sortValue: 38 });
  assert.deepEqual({ ...gmiObjectNumber('point', 4, null) }, { text: '(5)', numbered: false, label: 'Punkt nr. 5 i filen', sortValue: 5 });
  assert.equal(gmiObjectNumber('line', 37, 38).label, describeGmiObject('line', 37, 38));
  for (const query of ['38', '#38', 'nr 38', 'nr. 38', 'l38', 'l 38', 'ledning 38']) assert.equal(gmiObjectMatchesQuery(query, 'line', 37, 38), true, query);
  for (const query of ['3', '380', 'p38', 'punkt 38', 'pe', '']) assert.equal(gmiObjectMatchesQuery(query, 'line', 37, 38), false, query);
  assert.equal(gmiObjectMatchesQuery('p5', 'point', 4, null), true);
  // Object number 99 lives at source index 0: identity, not row position.
  const lines = [{ id: 99, attributes: { Tema: 'VL', Merknad: 'a' } }, { id: 38, attributes: { Tema: 'SP', Merknad: '38 m' } }, { id: 7, attributes: { Tema: 'VL', Merknad: 'b' } }];
  const ids = lines.map((line) => line.id);
  const identityMatches = (item, query) => gmiObjectMatchesQuery(query, 'line', item.__index, ids[item.__index]);
  const searched = deriveLayerTableRows({ dataset: { lines }, tab: 'ledninger', searchQuery: '99', identityMatches }).searchedItems;
  assert.deepEqual(searched.map((row) => row.__index), [0]);
  // Ordinary attribute search still works and is merely extended: "38" also finds the Merknad "38 m".
  assert.deepEqual(deriveLayerTableRows({ dataset: { lines }, tab: 'ledninger', searchQuery: '38', identityMatches }).searchedItems.map((row) => row.__index), [1]);
  assert.deepEqual(deriveLayerTableRows({ dataset: { lines }, tab: 'ledninger', searchQuery: 'vl', identityMatches }).searchedItems.map((row) => row.__index), [0, 2]);
  const filtered = deriveLayerTableRows({ dataset: { lines }, tab: 'ledninger', filters: { hiddenCodes: [], hiddenTypes: [], feltHiddenValues: [{ objectType: 'lines', fieldName: 'Tema', value: 'SP' }] }, identityMatches });
  assert.deepEqual(filtered.items.map((row) => gmiObjectNumber('line', row.__index, ids[row.__index]).text), ['99', '7']);
  assert.deepEqual(deriveLayerTableRows({ dataset: { lines }, tab: 'ledninger', searchQuery: '99' }).searchedItems.length, 0, 'without Rettinger identity, search is unchanged');
});

test('column focus is a display-only order that keeps fixed identity first and never rewrites the saved order', () => {
  const saved = Object.freeze(['S_FCODE', 'Tema', 'Material', 'Merknad', 'SDR', 'Ringstivhet']);
  assert.deepEqual(applyColumnFocus(saved, ['SDR'], ['S_FCODE']), ['S_FCODE', 'SDR', 'Tema', 'Material', 'Merknad', 'Ringstivhet']);
  assert.deepEqual(applyColumnFocus(saved, ['Ringstivhet', 'SDR'], ['S_FCODE']), ['S_FCODE', 'Ringstivhet', 'SDR', 'Tema', 'Material', 'Merknad']);
  assert.equal(applyColumnFocus(saved, [], ['S_FCODE']), saved);
  assert.deepEqual(applyColumnFocus(['Tema', 'SDR'], ['Absent', 'SDR'], ['S_FCODE']), ['SDR', 'Tema']);
  assert.deepEqual([...saved], ['S_FCODE', 'Tema', 'Material', 'Merknad', 'SDR', 'Ringstivhet']);
});
