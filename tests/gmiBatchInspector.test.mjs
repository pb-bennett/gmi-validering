import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGmiSourceDocument, createGmiEditSession, stageGmiChangeSet, undoGmiEdit, redoGmiEdit, discardAllGmiEdits, getGmiSourceBytes, getGmiProposedState, getGmiEditCell } from '../src/lib/gmi-edit/index.mjs';
import { prepareGmiBatchReview } from '../src/lib/gmiEditBatchView.mjs';
import { gmiSelectionTargets, gmiBatchScopeState, planGmiInspectorBatch } from '../src/lib/gmiBatchInspectorView.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import { getGmiProposedBytes } from '../src/lib/gmi-edit/index.mjs';

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

test('R4 exact source targets reject foreign identity, malformed keys and point geometry', async () => {
  const { view, selection } = await setup([0, 7]);
  assert.deepEqual(gmiSelectionTargets(view, selection).targets, [0, 7].map((sourceIndex) => ({ scope: 'line', sourceIndex, objectId: sourceIndex + 1, guid: null })));
  for (const field of ['layerId', 'sessionId', 'fingerprint']) assert.equal(gmiSelectionTargets(view, { ...selection, binding: { ...selection.binding, [field]: 'foreign' } }).ok, false);
  for (const keys of [[], ['line:9999'], ['line:01'], ['point:0'], ['line:0', 'line:0']]) assert.equal(gmiSelectionTargets(view, { ...selection, keys }).ok, false);
  assert.equal(gmiSelectionTargets(view, { ...selection, scope: 'point', keys: ['point:0'] }).code, 'line-only');
});

test('R4 selected, eligible, skipped, manual, changed and new FEIL counts use M5B results', async () => {
  const { view, selection, review } = await setup();
  assert.equal(review.preview.eligibility.counts.total, 4);
  const ordinary = planGmiInspectorBatch(view, selection, review);
  assert.equal(ordinary.ok, true);
  assert.deepEqual(ordinary.counts, { selected: 4, eligible: 3, manual: 0, changed: 3, unchanged: 0, skipped: 1, newErrors: 1 });
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
