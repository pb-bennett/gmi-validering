import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGmiFieldBatch, dryRunGmiFieldBatch, getGmiFieldBatchApproval, gmiFieldBatchValues, prepareGmiFieldBatch } from '../src/lib/gmiFieldBatchPlan.mjs';
import { summarizeGmiChangeSet } from '../src/lib/gmiEditView.mjs';
import { gmiBatchRiskReasons, gmiFieldInspectorRows } from '../src/lib/gmiBatchInspectorView.mjs';
import { buildGmiBatchSelection, prepareGmiBatchReview } from '../src/lib/gmiEditBatchView.mjs';
import { compileGmiEffectiveEdits, createGmiEditSession, createGmiObjectCorrection, getGmiProposedBytes, getGmiProposedState,
  getGmiSourceBytes, loadGmiSourceDocument, redoGmiEdit, stageGmiChangeSet, undoGmiEdit } from '../src/lib/gmi-edit/index.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

const immediate = { yieldWork: async () => {}, referenceDate: '2026-11-13' };
async function setup(bytes = gmiFieldBatchFixture()) {
  const document = await loadGmiSourceDocument(bytes);
  assert(document.editable);
  return { bytes, document, session: createGmiEditSession(document, { layerId: 'g6' }),
    handle: { layerId: 'g6', sessionId: 'g6-session', fingerprint: document.fingerprint } };
}
const selected = (view, scope, indices) => ({ scope, keys: indices.map(i => `${scope}:${i}`), binding: { ...view.handle } });
async function preview(view, selection, sourceKey, operation, value, match) {
  const result = await prepareGmiFieldBatch(view, { selection, scope: selection.scope, sourceKey, operation, value, match }, immediate);
  assert(result.ok, result.code);
  return result.preview;
}
function stageAndVerify(view, batch) {
  assert(batch.ok, batch.code);
  const staged = stageGmiChangeSet(view.session, batch.changeSet);
  assert(staged.ok);
  const proposed = getGmiProposedState(staged.session);
  assert(proposed.ok);
  const edits = compileGmiEffectiveEdits(staged.session);
  assert(edits.ok);
  assert.deepEqual(verifyCellChanges(loadGmiDocument(view.bytes), getGmiProposedBytes(proposed),
    edits.edits.map(({ target, lexeme }) => ({ ...target, lexeme }))).failures, []);
  assert.deepEqual(getGmiSourceBytes(view.document), view.bytes);
  return staged.session;
}

test('replace selects exact effective lexemes, counts whitespace/case separately and cannot include nonmatches', async () => {
  for (const scope of ['point', 'line']) {
    const notes = ['x', ' x', 'x ', 'X', 'x', '', ' '];
    const view = await setup(gmiFieldBatchFixture({ [`${scope}Fields`]: ['Tema', 'Merknad'],
      [scope === 'point' ? 'points' : 'lines']: notes.map(note => [scope === 'point' ? 'KUM' : 'VL', note]) }));
    const selection = selected(view, scope, notes.map((_, i) => i));
    assert.deepEqual(gmiFieldBatchValues(view, selection, 'Merknad').values,
      [['x', 2], [' x', 1], ['x ', 1], ['X', 1], ['', 1], [' ', 1]].map(([lexeme, count]) => ({ lexeme, count })));
    for (const match of ['x', ' x', 'x ', 'X', '', ' ']) {
      const plan = await preview(view, selection, 'Merknad', 'replace', 'new', match);
      const batch = buildGmiFieldBatch(view.session, plan);
      assert.deepEqual(batch.changeSet.cells.map(cell => cell.sourceIndex), notes.flatMap((note, i) => note === match ? [i] : []));
      assert.equal(batch.changeSet.intent.operation, 'replace');
      assert.equal(batch.changeSet.intent.match, match);
      assert.equal(batch.changeSet.intent.excluded.mismatch, notes.filter(note => note !== match).length);
      assert(Object.isFrozen(batch.changeSet.intent));
      assert.match(batch.changeSet.label, /^Erstatt /);
      assert.match(summarizeGmiChangeSet(batch.changeSet).title, /^Erstatt /);
      const nonmatch = notes.findIndex(note => note !== match);
      assert.equal(buildGmiFieldBatch(view.session, plan, { included: new Set([`${scope}:${nonmatch}`]),
        replace: true, approvals: { allowApplicabilityOverride: true } }).code, 'target-not-allowed');
      stageAndVerify(view, batch);
    }
    const noChange = await preview(view, selection, 'Merknad', 'replace', 'x', 'x');
    assert.equal(buildGmiFieldBatch(view.session, noChange).code, 'no-requests');
    const invalid = await prepareGmiFieldBatch(view, { selection, scope, sourceKey: 'Merknad', operation: 'replace', value: 'new', match: 'not present' }, immediate);
    assert.equal(invalid.code, 'match-not-found');
  }
});

test('clear preserves empty/whitespace-only cells, checks required fields and uses the existing new-FEIL gate', async () => {
  const view = await setup(gmiFieldBatchFixture({ pointFields: ['Tema', 'InnvendigUtvendig', 'Bredde'],
    points: [['LOK', 'ID', '100'], ['LOK', 'OD', '100'], ['LOK', '', '100'], ['LOK', ' ', '100']] }));
  const selection = selected(view, 'point', [0, 1, 2, 3]);
  const plan = await preview(view, selection, 'InnvendigUtvendig', 'clear');
  assert.deepEqual(plan.rows.map(row => row.reason), [null, null, 'already-empty', 'already-empty']);
  assert(plan.rows.slice(2).every(row => !row.canInclude && !row.defaultIncluded));
  let batch = buildGmiFieldBatch(view.session, plan);
  assert.equal(getGmiFieldBatchApproval(view.session, batch, immediate).code, 'dry-run-required');
  batch = await dryRunGmiFieldBatch(view.session, batch, immediate);
  assert(batch.ok, batch.code);
  assert(batch.dryRun.diff.newCounts.fail >= 2);
  assert(gmiBatchRiskReasons({ changeSetCounts: batch.changeSet.counts, newFail: batch.dryRun.diff.newCounts.fail }).includes('new-fail'));
  assert(getGmiFieldBatchApproval(view.session, batch, immediate).ok);
  assert.deepEqual(batch.changeSet.cells.map(cell => [cell.sourceIndex, cell.next]), [[0, ''], [1, '']]);
  assert.equal(batch.changeSet.intent.operation, 'clear');
  assert.equal(batch.changeSet.intent.value, '');
  assert.equal(batch.changeSet.intent.match, null);
  assert.equal(batch.changeSet.intent.excluded.notApplicable, 2);
  assert.match(summarizeGmiChangeSet(batch.changeSet).title, /^Tøm /);
  const table = gmiFieldInspectorRows(plan, batch, selection, true, false);
  assert.equal(table['point:2'].outcome, 'skipped');
  assert.match(table['point:2'].detail, /Allerede tom/);
  assert.equal(buildGmiFieldBatch(view.session, plan, { included: new Set(['point:2']) }).code, 'target-not-allowed');
  const staged = stageAndVerify(view, batch);
  const undone = undoGmiEdit(staged);
  assert(undone.ok);
  assert.deepEqual(getGmiProposedBytes(getGmiProposedState(undone.session)), view.bytes);
  const redone = redoGmiEdit(undone.session);
  assert(redone.ok);
  assert.deepEqual(getGmiProposedBytes(getGmiProposedState(redone.session)), getGmiProposedBytes(getGmiProposedState(staged)));
});

test('replace/clear keep conflicts, effective-value identity, source refusals and applicability safeguards', async () => {
  let view = await setup();
  const prior = createGmiObjectCorrection(view.session, { scope: 'line', sourceIndex: 1, values: { Merknad: 'staged' }, mode: 'overwrite' });
  view = { ...view, session: stageGmiChangeSet(view.session, prior.changeSet).session };
  const selection = selected(view, 'line', [0, 1, 2]);
  assert(gmiFieldBatchValues(view, selection, 'Merknad').values.some(entry => entry.lexeme === 'staged'));
  for (const operation of ['replace', 'clear']) {
    const plan = await preview(view, selection, 'Merknad', operation, operation === 'clear' ? '' : 'new', 'staged');
    assert.equal(plan.rows[1].reason, 'conflict');
    const included = new Set(['line:1']);
    const skipped = buildGmiFieldBatch(view.session, plan, { included });
    assert.equal(skipped.changeSet.cells.length, 0);
    const batch = buildGmiFieldBatch(view.session, plan, { included, replace: true });
    assert.equal(batch.changeSet.conflicts[0].resolution, 'replaced');
    stageAndVerify(view, batch);
  }
  const pointSelection = selected(view, 'point', [0, 2, 4]);
  const applicability = await preview(view, pointSelection, 'Kumform', 'clear');
  assert.equal(applicability.rows[0].reason, 'already-empty');
  assert.equal(applicability.rows[1].defaultIncluded, true);
  const reserved = await prepareGmiFieldBatch(view, { scope: 'point', targets: [{ scope: 'point', sourceIndex: 0 }], sourceKey: 'Tema', operation: 'replace', value: 'KUM', match: 'LOK' }, immediate);
  assert(reserved.ok, 'ordinary Tema is unchanged; linked editing remains covered by existing refusals');
  const invalid = await prepareGmiFieldBatch(view, { selection, scope: 'line', sourceKey: 'Merknad', operation: 'clear', value: 'not empty' }, immediate);
  assert.equal(invalid.code, 'invalid-clear-value');
});

test('new operations retain genuine hydraulic eligibility and exact numeric spellings', async () => {
  const view = await setup(gmiEditBatchFixture());
  for (const field of ['SDR', 'Trykklasse', 'Ringstivhet']) {
    const selection = selected(view, 'line', [0, 1, 2, 3, 4, 5, 6, 7]);
    const legacy = await prepareGmiBatchReview(view, { canonicalFieldId: { SDR: 'sdr', Trykklasse: 'pressureClass', Ringstivhet: 'ringStiffness' }[field],
      mode: 'overwrite', lexeme: '', targets: selection.keys.map((key, sourceIndex) => ({ scope: 'line', sourceIndex })) }, immediate);
    assert(legacy.ok);
    const plan = await preview(view, selection, field, 'clear');
    const allowed = new Set(legacy.rows.filter(row => row.current.trim() !== '').map(row => row.key));
    const batch = buildGmiFieldBatch(view.session, plan);
    if (batch.ok) {
      assert(batch.changeSet.eligibility);
      assert(batch.changeSet.cells.every(cell => allowed.has(cell.key) && cell.next === ''));
      stageAndVerify(view, batch);
    } else assert.equal(batch.code, 'no-requests');
    const values = gmiFieldBatchValues(view, selection, field).values.filter(entry => entry.lexeme.trim());
    if (!values.length) continue;
    const match = values[0].lexeme;
    const replacement = field === 'SDR' ? '11,0' : '8';
    const replace = await preview(view, selection, field, 'replace', replacement, match);
    const eligible = new Set(legacy.rows.filter(row => row.current === match && row.current !== replacement).map(row => row.key));
    const result = buildGmiFieldBatch(view.session, replace);
    if (result.ok) {
      assert(result.changeSet.eligibility);
      assert.deepEqual(result.changeSet.cells.map(cell => cell.key), [...eligible]);
      assert(result.changeSet.cells.every(cell => cell.next === replacement));
      stageAndVerify(view, result);
    } else assert.equal(result.code, 'no-requests');
    // Existing hydraulic selection builder still determines its eligible objects.
    assert.equal(buildGmiBatchSelection(view.session, legacy, new Set(legacy.rows.map(row => row.key))).ok, true);
  }
});

test('selection/session changes and rebuilt decisions invalidate exact dry-run approval', async () => {
  const view = await setup();
  const selection = selected(view, 'line', [0, 1]);
  const plan = await preview(view, selection, 'Merknad', 'replace', 'new', 'old');
  const first = buildGmiFieldBatch(view.session, plan);
  const checked = await dryRunGmiFieldBatch(view.session, first, immediate);
  assert(checked.ok);
  assert(getGmiFieldBatchApproval(view.session, checked, immediate).ok);
  selection.keys = ['line:0'];
  assert.equal(getGmiFieldBatchApproval(view.session, checked, immediate).ok, false);
  assert.equal(buildGmiFieldBatch(view.session, plan, { included: new Set(['line:1']) }).code, 'stale-selection');
  selection.keys = ['line:0', 'line:1', 'line:2'];
  assert.equal(buildGmiFieldBatch(view.session, plan).code, 'stale-session');
});

test('hydraulic non-applicable/unresolved populated targets never become automatic clear/replace targets', async () => {
  const view = await setup(gmiEditBatchFixture({ rows: [
    ['VLVAR', 'PE', '11', '', ''], ['SP', 'PVC', '11', '', ''], ['VL', 'PE', '11', '', ''], ['', 'PE', '11', '', ''],
  ] }));
  const selection = selected(view, 'line', [0, 1, 2, 3]);
  const legacy = await prepareGmiBatchReview(view, { canonicalFieldId: 'sdr', mode: 'overwrite', lexeme: '',
    targets: [0, 1, 2, 3].map(sourceIndex => ({ scope: 'line', sourceIndex })) }, immediate);
  assert(legacy.ok);
  for (const operation of ['clear', 'replace']) {
    const plan = await preview(view, selection, 'SDR', operation, operation === 'clear' ? '' : '11,0', '11');
    for (const skipped of legacy.skippedRows) {
      const row = plan.rows.find(entry => entry.sourceIndex === skipped.sourceIndex);
      assert.equal(row.reason, skipped.reason);
      assert.equal(row.defaultIncluded, false);
    }
    const batch = buildGmiFieldBatch(view.session, plan);
    assert.deepEqual(batch.changeSet.cells.map(cell => cell.sourceIndex), legacy.rows.map(row => row.sourceIndex));
    stageAndVerify(view, batch);
    const manual = plan.rows.find(row => row.reason === 'unresolved');
    assert(manual);
    assert.equal(buildGmiFieldBatch(view.session, plan, { included: new Set([manual.key]), replace: true }).code, 'manual-override-not-approved');
  }
});

test('structurally blocked cells, reserved identifiers and linked Tema remain unavailable to G6', async () => {
  const view = await setup(gmiFieldBatchFixture({ pointFields: ['Tema', 'Merknad', 'GUID'],
    points: [['KUM', 'old', 'synthetic-1'], ['KUM']] }));
  const selection = selected(view, 'point', [0, 1]);
  assert.equal(gmiFieldBatchValues(view, selection, 'Merknad').blocked, 1);
  const clear = await preview(view, selection, 'Merknad', 'clear');
  assert.equal(clear.rows[1].canInclude, false);
  assert.equal(clear.rows[1].status, 'source-refused');
  assert.equal(buildGmiFieldBatch(view.session, clear, { included: new Set(['point:1']),
    approvals: { allowApplicabilityOverride: true } }).code, 'target-not-allowed');
  stageAndVerify(view, buildGmiFieldBatch(view.session, clear));
  const linked = await setup(gmiFieldBatchFixture({ pointFields: ['Tema', 'S_FCODE'], points: [['KUM', 'KUM']] }));
  for (const operation of ['clear', 'replace']) {
    const options = { scope: 'point', targets: [{ scope: 'point', sourceIndex: 0 }], operation,
      value: operation === 'clear' ? '' : 'LOK', match: 'KUM' };
    assert.equal((await prepareGmiFieldBatch(view, { ...options, sourceKey: 'GUID' }, immediate)).code, 'identifier-column');
    assert.equal((await prepareGmiFieldBatch(linked, { ...options, sourceKey: 'Tema' }, immediate)).code, 'linked-tema-not-supported');
  }
});
