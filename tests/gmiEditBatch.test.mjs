import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { prepareGmiBatchReview, initialGmiBatchSelection, buildGmiBatchSelection } from '../src/lib/gmiEditBatchView.mjs';
import { createGmiSourceDocument, createGmiEditSession, createGmiObjectCorrection, stageGmiChangeSet, getGmiEditCell,
  getGmiProposedState, getGmiProposedBytes, getGmiSourceBytes, undoGmiEdit, redoGmiEdit, discardAllGmiEdits, discardGmiChangeSet,
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
