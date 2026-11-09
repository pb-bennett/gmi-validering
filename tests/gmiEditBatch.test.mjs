import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { prepareGmiBatchReview, initialGmiBatchSelection, buildGmiBatchSelection, canManuallySelectGmiBatchRow, describeGmiBatchApplicability } from '../src/lib/gmiEditBatchView.mjs';
import { createGmiSourceDocument, createGmiEditSession, createGmiObjectCorrection, stageGmiChangeSet, getGmiEditCell,
  getGmiProposedState, getGmiProposedBytes, getGmiSourceBytes, undoGmiEdit, redoGmiEdit, discardAllGmiEdits, discardGmiChangeSet, createGmiBatchCorrection, evaluateGmiBatchEligibility,
} from '../src/lib/gmi-edit/index.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';

function setup(options) {
  const bytes = gmiEditBatchFixture(options), document = createGmiSourceDocument(bytes);
  assert.equal(document.editable, true);
  return { bytes, document, session: createGmiEditSession(document, { layerId: 'm5b' }), handle: { layerId: 'm5b' } };
}
const prepare = (view, options = {}, extra) => prepareGmiBatchReview(view, { canonicalFieldId: 'sdr', lexeme: '11.0', ...options }, extra);
const change = (view, sourceIndex, values) => {
  const built = createGmiObjectCorrection(view.session, { scope: 'line', sourceIndex, values, mode: 'overwrite', conflictPolicy: 'replace' });
  assert.equal(built.ok, true);
  return { ...view, session: stageGmiChangeSet(view.session, built.changeSet).session };
};
const value = (session, sourceIndex, field = 'SDR') => getGmiEditCell(session, { scope: 'line', sourceIndex, field }).proposed;

test('M5B default fill uses M2 missing/populated/applicability/unresolved reasons', async () => {
  const view = setup(), preview = await prepare(view);
  assert.equal(preview.ok, true);
  assert.equal(preview.mode, 'fill-missing');
  assert.deepEqual(preview.rows.map((row) => row.sourceIndex), [0, 6, 7]);
  assert.deepEqual(preview.eligibility.counts.skippedByReason, { populated: 1, 'not-applicable': 2, unresolved: 3 });
  assert.equal(preview.eligibility.counts.total, 9);
  assert.equal(initialGmiBatchSelection(preview).size, 3);
});

test('Trykklasse and Ringstivhet use their existing material and Tema applicability', async () => {
  const view = setup();
  const pressure = await prepare(view, { canonicalFieldId: 'pressureClass', lexeme: 'PN16' });
  assert.deepEqual(pressure.rows.map((row) => row.sourceIndex), [0, 3, 5, 6, 7]);
  const stiffness = await prepare(view, { canonicalFieldId: 'ringStiffness', lexeme: 'SN8' });
  assert.deepEqual(stiffness.rows.map((row) => row.sourceIndex), [2]);
});

test('individual exclusions, none/all, one ChangeSet, history and independent byte/source oracle', async () => {
  const view = setup(), preview = await prepare(view), selected = initialGmiBatchSelection(preview);
  selected.delete(preview.rows[1].key);
  const built = buildGmiBatchSelection(view.session, preview, selected);
  assert.equal(built.ok, true);
  assert.equal(built.changeSet.cells.length, 2);
  assert.match(built.changeSet.label, /^Fyll SDR 11.0 · 2 ledninger$/);
  assert.match(built.changeSet.createdAt, /^\d{4}-/);
  let session = stageGmiChangeSet(view.session, built.changeSet).session;
  assert.equal(session.changeSets.length, 1);
  assert.equal(value(session, 6), '');
  assert.equal(value(session, 7), '11.0');
  const proposed = getGmiProposedState(session), bytes = getGmiProposedBytes(proposed);
  assert.deepEqual(verifyCellChanges(loadGmiDocument(view.bytes), bytes, [0, 7].map((sourceIndex) => ({ scope: 'line', sourceIndex, field: 'SDR', lexeme: '11.0' }))).failures, []);
  assert.deepEqual(getGmiSourceBytes(view.document), view.bytes);
  session = undoGmiEdit(session).session; assert.equal(value(session, 7), ' ');
  session = redoGmiEdit(session).session; assert.equal(value(session, 7), '11.0');
  const discarded = discardGmiChangeSet(session, built.changeSet.id).session;
  assert.equal(value(discarded, 0), '');
  assert.equal(value(discardAllGmiEdits(session).session, 7), ' ');
  assert.equal(buildGmiBatchSelection(view.session, preview, new Set()).ok, false);
  assert.equal(buildGmiBatchSelection(view.session, preview, new Set(preview.rows.map((row) => row.key))).changeSet.cells.length, 3);
});

test('explicit overwrite, current Material/Tema, earlier fills and explicit conflict replacement', async () => {
  let view = setup();
  view = change(view, 0, { SDR: '17.0' });
  view = change(view, 5, { Material: 'PE' });
  view = change(view, 2, { Tema: 'VL' });
  const fill = await prepare(view);
  assert(!fill.rows.some((row) => row.sourceIndex === 0));
  assert(fill.rows.some((row) => row.sourceIndex === 5));
  assert(fill.rows.some((row) => row.sourceIndex === 2));
  const overwrite = await prepare(view, { mode: 'overwrite' });
  const first = overwrite.rows.find((row) => row.sourceIndex === 0);
  assert.equal(first.original, ''); assert.equal(first.current, '17.0');
  assert(!initialGmiBatchSelection(overwrite).has(first.key));
  const selection = new Set([first.key]);
  const skipped = buildGmiBatchSelection(view.session, overwrite, selection);
  assert.equal(skipped.changeSet.cells.length, 0);
  assert.equal(skipped.changeSet.skipped[0].reason, 'conflict');
  const approved = buildGmiBatchSelection(view.session, overwrite, selection, true);
  assert.equal(approved.changeSet.cells.length, 1);
  assert.equal(approved.changeSet.conflicts.length, 1);
  assert.equal(value(stageGmiChangeSet(view.session, approved.changeSet).session, 0), '11.0');
});

test('any intervening session transition invalidates preview, even undo+redo to identical active history', async () => {
  const view = change(setup(), 0, { Material: 'PE100' });
  const preview = await prepare(view), selected = initialGmiBatchSelection(preview);
  const undone = undoGmiEdit(view.session).session, redone = redoGmiEdit(undone).session;
  for (const session of [undone, redone, discardAllGmiEdits(view.session).session, setup().session]) {
    assert.equal(buildGmiBatchSelection(session, preview, selected).code, 'stale-eligibility');
  }
  assert.equal((await prepare(view, {}, { isLive: () => false })).code, 'stale-eligibility');
  let yields = 0;
  const pending = setup({ rows: Array.from({ length: 25 }, () => ['VL', 'PE', '', '', '']) });
  assert.equal((await prepare(pending, {}, { yieldWork: async () => { yields++; }, isLive: () => yields < 2 })).code, 'stale-eligibility', 'source/session invalidation during a chunk cannot publish a late preview');
});

test('shared Validator marks new SDR/Ringstivhet FEIL and relevant SJEKK, without source mutation', async () => {
  const view = setup(), before = structuredClone(getGmiProposedState(view.session).dataset);
  const preview = await prepare(view);
  const conflict = preview.rows.find((row) => row.sourceIndex === 6).findings.find((finding) => finding.ruleId === 'innmaling.line.sdr-ring-stiffness.exclusive');
  assert.equal(conflict.state, 'FAIL'); assert.equal(conflict.batchIntroduced, true);
  assert.match(conflict.reason, /Både SDR og Ringstivhet/);
  assert(preview.rows.find((row) => row.sourceIndex === 6).otherFindings.some((finding) => finding.state === 'CHECK'), 'existing SJEKK remains inspectable');
  const invalid = await prepare(view, { lexeme: 'BAD' });
  assert(invalid.rows.some((row) => row.findings.some((finding) => finding.batchIntroduced)));
  assert.deepEqual(structuredClone(getGmiProposedState(view.session).dataset), before);
  assert.deepEqual(getGmiSourceBytes(view.document), view.bytes);
});

test('missing columns, unsupported fields, hyperlink aliases and unsafe lexemes are refused', async () => {
  const view = setup({ fields: ['Tema', 'Material'], rows: [['VL', 'PE']] });
  assert.equal((await prepare(view)).code, 'field-absent');
  for (const canonicalFieldId of ['attachmentLink', 'S_HYPERLINK_punkt', 'Material']) assert.equal((await prepare(view, { canonicalFieldId })).ok, false);
  const regular = setup(), preview = await prepare(regular);
  for (const lexeme of ['a;b', 'a\nb', '🧪']) {
    const result = buildGmiBatchSelection(regular.session, { ...preview, lexeme }, initialGmiBatchSelection(preview));
    assert.equal(result.ok, false);
  }
});

test('unsupported object structure stays skipped, and clearing an earlier value never bypasses M2 source safeguards', async () => {
  const irregular = await prepare(setup({ rows: [['VL', 'PE'], ['VL', 'PE', '', '', '']] }));
  assert.equal(irregular.eligibility.counts.skippedByReason['object-not-editable'], 1);
  assert.deepEqual(irregular.rows.map((row) => row.sourceIndex), [1]);
  const view = change(setup(), 1, { SDR: '' });
  const preview = await prepare(view), target = preview.rows.find((row) => row.sourceIndex === 1);
  assert(target);
  const result = buildGmiBatchSelection(view.session, preview, new Set([target.key]), true);
  assert.equal(result.changeSet.cells.length, 0);
  assert.equal(result.changeSet.skipped[0].reason, 'populated');
  assert.equal(value(view.session, 1), '');
});

test('empty eligible sets and chunked large lists; selection does not rerun Validator', async (t) => {
  const empty = await prepare(setup({ rows: [['SP', 'PVC', '', '', '']] }));
  assert.equal(empty.rows.length, 0);
  let yields = 0;
  const view = setup({ rows: Array.from({ length: 1000 }, () => ['VL', 'PE', '', '', '']) });
  const started = performance.now();
  const preview = await prepare(view, {}, { yieldWork: async () => { yields++; } });
  assert.equal(preview.rows.length, 1000); assert(yields >= 51);
  const selected = initialGmiBatchSelection(preview); selected.clear();
  assert.equal(selected.size, 0);
  t.diagnostic(`1000-object preview: ${Math.round(performance.now() - started)} ms; ${yields} yields`);
});

test('exclusion evidence distinguishes hydraulic context, material family and unresolved dependencies', async () => {
  const preview = await prepare(setup());
  const byIndex = (index) => preview.skippedRows.find((row) => row.sourceIndex === index);
  assert.match(byIndex(2).explanation, /hydrauliske klasse.*SDR/);
  assert.match(byIndex(2).explanation, /Tema: SP.*Material: PVC.*selvfall/);
  assert.match(byIndex(5).explanation, /Materialfamilien.*SDR/);
  assert.match(byIndex(3).explanation, /uavklart/);
  assert.match(byIndex(4).explanation, /spesiell hydraulisk klasse/);
  assert.match(byIndex(1).explanation, /allerede utfylt/);
  assert.match(describeGmiBatchApplicability({ reason: 'unresolved' }, 'SDR'), /uavklart.*ikke fastslå/);
  assert.equal(preview.eligibility.counts.skippedByReason['not-applicable'], 2);
});

test('advanced explicit manual selection preserves evidence, exact bytes, one ChangeSet and reversible history', async () => {
  const view = setup(), preview = await prepare(view);
  const selected = initialGmiBatchSelection(preview);
  const manual = preview.skippedRows.filter((row) => [2, 3, 4, 5, 8].includes(row.sourceIndex));
  for (const row of manual) selected.add(row.key);
  assert.equal(initialGmiBatchSelection(preview).size, 3, 'no manual row is selected automatically');
  assert.equal(buildGmiBatchSelection(view.session, preview, selected).ok, false, 'advanced flag required');
  const result = buildGmiBatchSelection(view.session, preview, selected, false, undefined, true);
  assert.equal(result.ok, true);
  const cs = result.changeSet;
  assert.equal(cs.cells.length, 8); assert.equal(cs.eligibility.normallyEligible.length, 3);
  assert.equal(cs.eligibility.manualOverrides.length, 5);
  assert.deepEqual(cs.eligibility.manualOverrides.map((row) => row.reason).sort(), ['not-applicable', 'not-applicable', 'unresolved', 'unresolved', 'unresolved']);
  assert.match(cs.label, /Manuelt overstyrt/);
  assert.equal(cs.eligibility.manualOverrides.find((row) => row.sourceIndex === 5).evidence.diagnosticFacts.applicabilityReason, 'MATERIAL_FAMILY_NOT_RECOMMENDED');
  const session = stageGmiChangeSet(view.session, cs).session;
  assert.equal(session.changeSets.length, 1);
  const edits = cs.cells.map((cell) => ({ scope: cell.scope, sourceIndex: cell.sourceIndex, field: cell.field, lexeme: cell.next }));
  assert.deepEqual(verifyCellChanges(loadGmiDocument(view.bytes), getGmiProposedBytes(getGmiProposedState(session)), edits).failures, []);
  assert.deepEqual(getGmiSourceBytes(view.document), view.bytes);
  assert.equal(value(undoGmiEdit(session).session, 2), '');
  assert.equal(value(redoGmiEdit(undoGmiEdit(session).session).session, 2), '11.0');
  assert.equal(value(discardGmiChangeSet(session, cs.id).session, 2), '');
  assert.deepEqual(getGmiProposedBytes(getGmiProposedState(discardAllGmiEdits(session).session)), view.bytes);
});

test('M2 manual override needs genuine exact-session eligibility and cannot widen targets or bypass technical limits', async () => {
  const view = setup({ rows: [['SP', 'PVC', '', '', 'SN8'], ['VL', 'PE'], ['VL', 'PE', '17.0', '', '']] });
  const eligibility = evaluateGmiBatchEligibility(view.session, { canonicalFieldId: 'sdr' });
  const spec = { eligibility, manualTargets: [{ scope: 'line', sourceIndex: 0 }], lexeme: '11.0', allowApplicabilityOverride: true };
  const built = createGmiBatchCorrection(view.session, spec);
  assert.equal(built.ok, true);
  assert.equal(createGmiBatchCorrection(view.session, { ...spec, allowApplicabilityOverride: false }).ok, false);
  assert.equal(createGmiBatchCorrection(view.session, { ...spec, eligibility: { ...eligibility } }).ok, false);
  assert.equal(createGmiBatchCorrection(setup().session, spec).ok, false);
  assert.equal(createGmiBatchCorrection(view.session, { ...spec, manualTargets: [{ scope: 'line', sourceIndex: '0' }] }).ok, false);
  const absent = setup({ fields: ['Tema', 'Material'], rows: [['SP', 'PVC']] });
  assert.equal(createGmiBatchCorrection(absent.session, { ...spec, eligibility: evaluateGmiBatchEligibility(absent.session, { canonicalFieldId: 'sdr' }) }).ok, false);
  for (const sourceIndex of [1, 2, 99]) assert.equal(createGmiBatchCorrection(view.session, { ...spec, manualTargets: [{ scope: 'line', sourceIndex }] }).ok, false);
  for (const field of ['GUID', 'S_HYPERLINK', 'S_HYPERLINK_punkt', 'Unknown']) assert.equal(createGmiBatchCorrection(view.session, { ...spec, field }).ok, false);
  for (const lexeme of ['x;y', 'x\ny', '🧪']) assert.equal(createGmiBatchCorrection(view.session, { ...spec, lexeme }).ok, false);
  const staged = stageGmiChangeSet(view.session, built.changeSet).session;
  const back = undoGmiEdit(staged).session;
  assert.equal(back.stateKey, view.session.stateKey);
  assert.equal(createGmiBatchCorrection(back, spec).rejections[0].code, 'stale-eligibility');
  assert.equal(stageGmiChangeSet(staged, built.changeSet).ok, false);
  const preview = await prepare(view);
  assert(!canManuallySelectGmiBatchRow(preview.skippedRows.find((row) => row.sourceIndex === 1), 'overwrite'));
  assert(preview.skippedRows.find((row) => row.sourceIndex === 0).findings.some((finding) => finding.state === 'FAIL' && finding.batchIntroduced));
});

test('manual inclusion is independent of populated overwrite and replacement approval, even with a populated earlier proposal', async () => {
  let view = setup({ rows: [['SP', 'PVC', '17.0', '', 'SN8'], ['SP', 'PVC', '', '', '']] });
  const fill = evaluateGmiBatchEligibility(view.session, { canonicalFieldId: 'sdr' });
  const request = { manualTargets: [{ scope: 'line', sourceIndex: 0 }], allowApplicabilityOverride: true, lexeme: '11.0' };
  assert.equal(createGmiBatchCorrection(view.session, { ...request, eligibility: fill }).rejections[0].code, 'manual-overwrite-not-approved');
  const overwrite = evaluateGmiBatchEligibility(view.session, { canonicalFieldId: 'sdr', mode: 'overwrite' });
  const built = createGmiBatchCorrection(view.session, { ...request, eligibility: overwrite, mode: 'overwrite' });
  assert.equal(built.changeSet.counts.populatedOverwrites, 1);
  view = change(view, 1, { SDR: '17.0' });
  const currentFill = evaluateGmiBatchEligibility(view.session, { canonicalFieldId: 'sdr' });
  assert.equal(createGmiBatchCorrection(view.session, { ...request, manualTargets: [{ scope: 'line', sourceIndex: 1 }], conflictPolicy: 'replace', eligibility: currentFill }).rejections[0].code, 'manual-overwrite-not-approved');
  const preview = await prepare(view, { mode: 'overwrite' });
  const selected = new Set([preview.skippedRows.find((row) => row.sourceIndex === 1).key]);
  const skipped = buildGmiBatchSelection(view.session, preview, selected, false, undefined, true);
  assert.equal(skipped.changeSet.cells.length, 0);
  const approved = buildGmiBatchSelection(view.session, preview, selected, true, undefined, true);
  assert.equal(approved.changeSet.counts.overwritten, 1);
  assert.equal(approved.changeSet.counts.populatedOverwrites, 1);
  assert.equal(approved.changeSet.eligibility.manualOverrides[0].current, '17.0');
});
