// G8 follow-up: linked Tema/S_FCODE in the individual object editor (synthetic fixtures only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGmiEffectiveEdits, createGmiEditSession, createGmiObjectCorrection, getGmiEditCell, getGmiProposedBytes,
  getGmiProposedState, getGmiSourceBytes, listGmiObjectCells, loadGmiSourceDocument, redoGmiEdit, stageGmiChangeSet,
  undoGmiEdit } from '../src/lib/gmi-edit/index.mjs';
import { describeGmiEditColumns, gmiLinkedTemaChangeSetComplete, gmiLinkedTemaPair } from '../src/lib/gmiEditFields.mjs';
import { gmiEditFieldPolicy, gmiEditMessage, gmiLinkedTemaGroup, planGmiObjectForm } from '../src/lib/gmiEditView.mjs';
import { gmiEditObjectReviewConsequences, gmiEditObjectReviewErrors } from '../src/lib/gmiEditValidation.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { cellSpans, loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

async function setup(scope = 'point', rows = [['LOK', 'ANB']], fields = ['Tema', 'S_FCODE']) {
  const bytes = gmiFieldBatchFixture({ [`${scope}Fields`]: fields, [scope === 'point' ? 'points' : 'lines']: rows });
  const document = await loadGmiSourceDocument(bytes);
  return { bytes, document, session: createGmiEditSession(document, { layerId: 'g8-object' }),
    handle: { layerId: 'g8-object', sessionId: 'g8-object-session', fingerprint: document.fingerprint } };
}

/** Mirrors GmiObjectEditor's rowsFor against a plain session (no registry). */
function objectRows(view, scope, sourceIndex) {
  const columns = describeGmiEditColumns(view, scope).columns;
  return listGmiObjectCells(view.document, scope, sourceIndex).filter((cell) => cell.field !== '' || cell.lexeme).map((cell) => {
    const policy = gmiEditFieldPolicy(cell);
    const current = policy.editable ? getGmiEditCell(view.session, { scope, sourceIndex, field: cell.field }) : null;
    const original = current?.ok ? current.original : (cell.parserLexeme ?? cell.lexeme);
    return { field: cell.field, position: cell.position,
      domain: columns.find((column) => column.position === cell.position && column.sourceKey === cell.field)?.domain || null,
      editable: policy.editable && Boolean(current?.ok), reason: policy.editable && !current?.ok ? current?.code : policy.reason,
      original, proposed: current?.ok ? current.proposed : original, changed: Boolean(current?.ok && current.changed),
      touched: Boolean(current?.ok && current.touched), history: current?.ok ? current.history : [] };
  });
}

function form(view, scope, sourceIndex, drafts) {
  const rows = objectRows(view, scope, sourceIndex);
  const linked = gmiLinkedTemaGroup(rows, gmiLinkedTemaPair(view, scope));
  return { rows, linked, plan: planGmiObjectForm(rows.filter((row) => row.editable), drafts, view.document.encoding.encodingClass, linked) };
}

const both = (value) => ({ Tema: value, S_FCODE: value });

/** Same policy as GmiObjectEditor.buildReview. */
function build(view, scope, sourceIndex, plan, { allowOverwrite = true, allowReplace = false } = {}) {
  return createGmiObjectCorrection(view.session, { scope, sourceIndex, values: plan.values,
    mode: plan.needsOverwrite.length && allowOverwrite ? 'overwrite' : 'fill-missing',
    conflictPolicy: plan.needsReplace.length && allowReplace ? 'replace' : 'skip' });
}

function verify(view, session) {
  const proposed = getGmiProposedState(session);
  assert(proposed.ok, proposed.code);
  const compiled = compileGmiEffectiveEdits(session);
  assert(compiled.ok);
  const edits = compiled.edits.map(({ target, lexeme }) => ({ ...target, lexeme }));
  const oracle = loadGmiDocument(view.bytes), output = getGmiProposedBytes(proposed);
  assert.deepEqual(verifyCellChanges(oracle, output, edits).failures, []);
  const patches = edits.map((edit) => ({ span: cellSpans(oracle.index.objects[edit.scope][edit.sourceIndex]).get(edit.field).span,
    replacement: Buffer.from(edit.lexeme, 'latin1') })).sort((a, b) => a.span[0] - b.span[0]);
  let originalOffset = 0, outputOffset = 0;
  for (const { span: [start, end], replacement } of patches) {
    const length = start - originalOffset;
    assert.deepEqual(output.slice(outputOffset, outputOffset + length), view.bytes.slice(originalOffset, start), 'bytes outside approved value spans');
    outputOffset += length;
    assert.deepEqual(output.slice(outputOffset, outputOffset + replacement.length), new Uint8Array(replacement));
    originalOffset = end;
    outputOffset += replacement.length;
  }
  assert.deepEqual(output.slice(outputOffset), view.bytes.slice(originalOffset), 'trailing bytes outside approved value spans');
  assert.deepEqual(getGmiSourceBytes(view.document), view.bytes, 'original source bytes unchanged');
  return output;
}

test('G8 object editor: the pair is one logical field and cannot be split', async () => {
  const view = await setup('point', [['LOK', 'ANB', 'x']], ['Tema', 'S_FCODE', 'Merknad']);
  const { linked, plan } = form(view, 'point', 0, {});
  assert.deepEqual(linked.keys, ['Tema', 'S_FCODE']);
  assert.equal(linked.editable, true);
  assert.equal(linked.disagreement, true);
  assert.equal(linked.originalDisagreement, true);
  assert.equal(linked.proposed, null, 'no common value is invented for a disagreeing pair');
  assert.equal(plan.valid, false);

  const together = form(view, 'point', 0, both('KUM')).plan;
  assert.deepEqual(together.edited, ['Tema'], 'one logical edit');
  assert.deepEqual(together.values, both('KUM'));
  assert.equal(together.valid, true);

  for (const drafts of [{ Tema: 'KUM' }, { S_FCODE: 'KUM' }, { Tema: 'KUM', S_FCODE: 'LOK' }]) {
    const split = form(view, 'point', 0, drafts).plan;
    assert.equal(split.valid, false);
    assert.deepEqual(split.values, {}, 'no physical value is requested alone');
    assert.equal(split.problems.Tema, gmiEditMessage('linked-tema-split'));
  }
  // Other fields keep their ordinary path alongside the linked field.
  const mixed = form(view, 'point', 0, { ...both('KUM'), Merknad: 'y' }).plan;
  assert.deepEqual(mixed.values, { Merknad: 'y', ...both('KUM') });
});

test('G8 object editor: both physical values change in one ChangeSet, resolve TEMA_CONFLICT, preserve bytes and undo/redo together', async () => {
  for (const [scope, row, value] of [['point', ['LOK', 'ANB'], 'KUM'], ['line', ['VL', 'OV'], 'SP']]) {
    const view = await setup(scope, [row]);
    const { rows, linked, plan } = form(view, scope, 0, both(value));
    assert.deepEqual(plan.needsOverwrite, ['Tema', 'S_FCODE']);
    const result = build(view, scope, 0, plan);
    assert(result.ok);
    assert.deepEqual(result.changeSet.cells.map((cell) => [cell.field, cell.previous, cell.next]), [['Tema', row[0], value], ['S_FCODE', row[1], value]]);
    assert.equal(result.changeSet.objectCount, 1);
    assert(gmiLinkedTemaChangeSetComplete(result.changeSet, linked.keys, 1));
    const consequences = gmiEditObjectReviewConsequences({ view, scope, sourceIndex: 0, rows,
      values: Object.fromEntries(result.changeSet.cells.map((cell) => [cell.field, cell.next])) });
    assert(consequences.resolved.some((finding) => finding.key.includes('TEMA_CONFLICT')), `${scope}: TEMA_CONFLICT resolved`);
    assert(!consequences.newChecks.some((finding) => finding.key.includes('TEMA_CONFLICT')));
    assert(consequences.resolved.every((finding) => !finding.key.includes('|dependency|')), 'dependency notes are counted, not listed');
    assert(consequences.unblocked > 0, 'Tema-dependent checks become assessable');
    const staged = stageGmiChangeSet(view.session, result.changeSet);
    assert(staged.staged);
    const output = verify(view, staged.session);
    const undone = undoGmiEdit(staged.session);
    assert.deepEqual(getGmiProposedBytes(getGmiProposedState(undone.session)), view.bytes, 'undo restores both fields');
    assert.deepEqual(['Tema', 'S_FCODE'].map((field) => getGmiEditCell(undone.session, { scope, sourceIndex: 0, field }).proposed), row);
    const redone = redoGmiEdit(undone.session);
    assert.deepEqual(verify(view, redone.session), output, 'redo restores both fields');
    assert.deepEqual(['Tema', 'S_FCODE'].map((field) => getGmiEditCell(redone.session, { scope, sourceIndex: 0, field }).proposed), [value, value]);
  }
});

test('G8 object editor: one partner already correct is unchanged while the other changes', async () => {
  const view = await setup('point', [['KUM', 'LOK']]);
  const { linked, plan } = form(view, 'point', 0, both('KUM'));
  assert.deepEqual(plan.values, both('KUM'), 'the no-op partner is still requested');
  assert.deepEqual(plan.needsOverwrite, ['S_FCODE']);
  const result = build(view, 'point', 0, plan);
  assert.deepEqual(result.changeSet.cells.map((cell) => cell.field), ['S_FCODE']);
  assert.deepEqual(result.changeSet.unchanged.map((cell) => cell.field), ['Tema']);
  assert(gmiLinkedTemaChangeSetComplete(result.changeSet, linked.keys, 1));
  verify(view, stageGmiChangeSet(view.session, result.changeSet).session);
  // Both already equal: nothing is edited.
  assert.equal(form(view, 'point', 0, both('LOK')).plan.edited.length, 1);
  const agreeing = await setup('point', [['KUM', 'KUM']]);
  assert.equal(form(agreeing, 'point', 0, both('KUM')).plan.edited.length, 0);
});

test('G8 object editor: missing, ambiguous or unsafe partners and stale identity refuse the whole change', async () => {
  // Partner has no value slot in this object.
  const missing = await setup('point', [['LOK']]);
  const blocked = form(missing, 'point', 0, both('KUM'));
  assert.equal(blocked.linked.editable, false);
  assert.equal(blocked.plan.valid, false);
  assert.deepEqual(blocked.plan.values, {});
  assert(blocked.plan.problems.Tema);
  // Duplicate physical partner: the binding is ambiguous.
  const duplicate = await setup('point', [['LOK', 'LOK', 'LOK']], ['Tema', 'S_FCODE', 'S_FCODE']);
  // Tema alone is still an editable 'linked-tema' column here; the pair must fail closed.
  assert.equal(describeGmiEditColumns(duplicate, 'point').columns.find((column) => column.sourceKey === 'Tema').editable, true);
  assert.deepEqual(gmiLinkedTemaPair(duplicate, 'point'), { ok: false, code: 'field-binding-unresolved', keys: ['Tema', 'S_FCODE'] });
  const ambiguous = form(duplicate, 'point', 0, both('KUM'));
  assert.equal(ambiguous.linked.editable, false);
  assert.equal(ambiguous.linked.reason, 'field-binding-unresolved');
  assert.deepEqual(ambiguous.plan.values, {});
  assert.deepEqual(form(duplicate, 'point', 0, { Tema: 'KUM' }).plan.values, {}, 'Tema cannot be edited alone either');
  // Identity guard: a mismatched object id rejects every request.
  const view = await setup('point', [['LOK', 'ANB']]);
  const { plan } = form(view, 'point', 0, both('KUM'));
  const wrong = createGmiObjectCorrection(view.session, { scope: 'point', sourceIndex: 0, objectId: 'wrong', values: plan.values, mode: 'overwrite' });
  assert.equal(wrong.ok, false);
  // Fail closed if a lower layer ever skipped or dropped one physical cell.
  const ok = build(view, 'point', 0, plan).changeSet;
  const [first, second] = ok.cells;
  assert.equal(gmiLinkedTemaChangeSetComplete({ ...ok, cells: [first], skipped: [{ ...second, reason: 'object-not-editable' }] }, ['Tema', 'S_FCODE'], 1), false);
  assert.equal(gmiLinkedTemaChangeSetComplete({ ...ok, cells: [first] }, ['Tema', 'S_FCODE'], 1), false);
  assert.equal(gmiLinkedTemaChangeSetComplete({ ...ok, cells: [first, { ...second, next: 'LOK' }] }, ['Tema', 'S_FCODE'], 1), false);
  // Stale session: a ChangeSet built before another correction cannot be staged.
  const other = createGmiObjectCorrection(view.session, { scope: 'point', sourceIndex: 0, values: { S_FCODE: 'LOK' }, mode: 'overwrite' });
  const moved = stageGmiChangeSet(view.session, other.changeSet).session;
  const stale = stageGmiChangeSet(moved, ok);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'stale-change-set');
});

test('G8 object editor: earlier corrections of either cell need replacement approval for the whole pair', async () => {
  const view = await setup('point', [['LOK', 'LOK']]);
  const earlier = createGmiObjectCorrection(view.session, { scope: 'point', sourceIndex: 0, values: { S_FCODE: 'ANB' }, mode: 'overwrite' });
  view.session = stageGmiChangeSet(view.session, earlier.changeSet).session;
  const { linked, plan } = form(view, 'point', 0, both('KUM'));
  assert.equal(linked.disagreement, true);
  assert.equal(linked.originalDisagreement, false);
  assert.equal(linked.changed, true);
  assert.deepEqual(plan.needsReplace, ['S_FCODE']);
  const skipped = build(view, 'point', 0, plan);
  assert(skipped.ok);
  assert.equal(gmiLinkedTemaChangeSetComplete(skipped.changeSet, linked.keys, 1), false, 'skip policy would split the pair, so it is refused');
  const replaced = build(view, 'point', 0, plan, { allowReplace: true });
  assert(gmiLinkedTemaChangeSetComplete(replaced.changeSet, linked.keys, 1));
  assert.deepEqual(replaced.changeSet.cells.map((cell) => [cell.field, cell.next, Boolean(cell.overwrote)]), [['Tema', 'KUM', false], ['S_FCODE', 'KUM', true]]);
  const after = stageGmiChangeSet(view.session, replaced.changeSet).session;
  verify(view, after);
  const history = gmiLinkedTemaGroup(objectRows({ ...view, session: after }, 'point', 0), gmiLinkedTemaPair(view, 'point')).history;
  assert.deepEqual(history.map((entry) => entry.changeSetId), [earlier.changeSet.id, replaced.changeSet.id], 'one entry per ChangeSet, newest last');
  // A touched partner that is already correct still makes the logical field a conflict (G8 policy).
  const touched = form(view, 'point', 0, both('ANB'));
  assert.deepEqual(touched.plan.needsReplace, ['S_FCODE']);
  const restored = build(view, 'point', 0, touched.plan, { allowReplace: true });
  assert.deepEqual(restored.changeSet.cells.map((cell) => cell.field), ['Tema']);
  assert.deepEqual(restored.changeSet.unchanged.map((cell) => cell.field), ['S_FCODE']);
  assert(gmiLinkedTemaChangeSetComplete(restored.changeSet, linked.keys, 1));
  // The delivered value may be restored when both originals agree, even outside the domain.
  assert.equal(touched.linked.original, 'LOK');
});

test('G8 object editor: geometry domains are authoritative; one-column files keep ordinary editing', async () => {
  for (const [scope, invalid, valid] of [['point', 'SP', 'KUM'], ['line', 'KUM', 'SP']]) {
    const view = await setup(scope, [['', '']]);
    const refused = form(view, scope, 0, both(invalid)).plan;
    assert.equal(refused.valid, false);
    assert.equal(refused.problems.Tema, gmiEditMessage('value-out-of-domain'));
    assert.deepEqual(refused.values, {});
    assert(form(view, scope, 0, both(valid)).plan.valid);
    for (const field of ['Tema', 'S_FCODE']) {
      const single = await setup(scope, [['']], [field]);
      const { linked, plan } = form(single, scope, 0, { [field]: 'custom code' });
      assert.equal(gmiLinkedTemaPair(single, scope), null);
      assert.equal(linked, null);
      assert.deepEqual(plan.values, { [field]: 'custom code' }, 'single-column behavior unchanged');
      const result = build(single, scope, 0, plan);
      assert.equal(result.changeSet.cells.length, 1);
      verify(single, stageGmiChangeSet(single.session, result.changeSet).session);
    }
  }
});

test('G8 object editor: review reports new FEIL and keeps the existing new-FEIL helper semantics', async () => {
  const view = await setup('point', [['LOK', 'LOK', '']], ['Tema', 'S_FCODE', 'Kumform']);
  const { rows, plan } = form(view, 'point', 0, both('KUM'));
  const result = build(view, 'point', 0, plan);
  const values = Object.fromEntries(result.changeSet.cells.map((cell) => [cell.field, cell.next]));
  const consequences = gmiEditObjectReviewConsequences({ view, scope: 'point', sourceIndex: 0, rows, values });
  assert(consequences.newErrors.some((finding) => /manhole-shape/.test(finding.ruleId)));
  assert.deepEqual(gmiEditObjectReviewErrors({ view, scope: 'point', sourceIndex: 0, rows, values }), consequences.newErrors);
  assert(Array.isArray(consequences.newChecks));
  // An inconsistent pair is only SJEKK: a split edit would not be caught by the new-FEIL gate alone.
  const split = gmiEditObjectReviewConsequences({ view, scope: 'point', sourceIndex: 0, rows, values: { S_FCODE: 'KUM' } });
  assert(split.newChecks.some((finding) => finding.key.includes('TEMA_CONFLICT')));
  assert(!split.newErrors.some((finding) => finding.key.includes('TEMA_CONFLICT')));
});
