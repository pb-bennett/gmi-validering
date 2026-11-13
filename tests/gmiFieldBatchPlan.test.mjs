import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { prepareGmiFieldBatch, buildGmiFieldBatch } from '../src/lib/gmiFieldBatchPlan.mjs';
import { gmiSelectionTargets } from '../src/lib/gmiBatchInspectorView.mjs';
import { buildGmiBatchSelection, prepareGmiBatchReview } from '../src/lib/gmiEditBatchView.mjs';
import { compileGmiEffectiveEdits, createGmiBatchCorrection, createGmiEditSession, createGmiFieldChangeSet, createGmiObjectCorrection,
  discardAllGmiEdits, getGmiDocumentDataset, getGmiEditCell, getGmiProposedBytes, getGmiProposedState,
  getGmiSourceBytes, loadGmiSourceDocument, redoGmiEdit, stageGmiChangeSet, undoGmiEdit } from '../src/lib/gmi-edit/index.mjs';
import { internalGmiSourceState } from '../src/lib/gmi-edit/sourceDocument.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

const immediate = { yieldWork: async () => {} };
async function setup(bytes = gmiFieldBatchFixture()) {
  const document = await loadGmiSourceDocument(bytes);
  assert.equal(document.editable, true);
  const session = createGmiEditSession(document, { layerId: 'g2' });
  return { bytes, document, session, handle: { layerId: 'g2', sessionId: 'g2-session', fingerprint: document.fingerprint } };
}
function selection(view, scope, indices) {
  return { scope, keys: indices.map((index) => `${scope}:${index}`), binding: { ...view.handle } };
}
function targets(view, scope, indices) {
  const result = gmiSelectionTargets(view, selection(view, scope, indices));
  assert.equal(result.ok, true, result.code);
  return result.targets;
}
async function prepare(view, scope, sourceKey, operation, value, indices, extra = {}) {
  const result = await prepareGmiFieldBatch(view, { scope, sourceKey, operation, value, targets: targets(view, scope, indices), ...extra }, immediate);
  assert.equal(result.ok, true, result.code);
  return result.preview;
}
function verify(view, result) {
  assert.equal(result.ok, true, result.code || JSON.stringify(result.rejections));
  const staged = stageGmiChangeSet(view.session, result.changeSet);
  assert.equal(staged.ok, true);
  const proposed = getGmiProposedState(staged.session);
  assert.equal(proposed.ok, true);
  const compiled = compileGmiEffectiveEdits(staged.session);
  assert.equal(compiled.ok, true);
  const edits = compiled.edits.map(({ target, lexeme }) => ({ ...target, lexeme }));
  assert.deepEqual(verifyCellChanges(loadGmiDocument(view.bytes), getGmiProposedBytes(proposed), edits).failures, []);
  assert.deepEqual(getGmiSourceBytes(view.document), view.bytes);
  return staged.session;
}

test('multiple points: exact approved subset and original lexemes; Validator owns custom-code verdicts', async () => {
  const view = await setup();
  const fill = await prepare(view, 'point', 'InnvendigUtvendig', 'fill-missing', 'od', [3, 2, 1, 0]);
  assert.deepEqual(fill.rows.map((row) => row.key), ['point:0', 'point:1', 'point:2', 'point:3']);
  assert.deepEqual(fill.rows.map((row) => row.reason), [null, null, 'operation-mismatch', 'operation-mismatch']);
  assert.equal(fill.lexeme, 'OD');
  assert.deepEqual(fill.rows.map((row) => row.original), ['', ' ', 'ID', 'delivered-code']);
  const result = buildGmiFieldBatch(view.session, fill, { included: new Set(['point:1']) });
  assert.deepEqual(result.changeSet.cells.map(({ scope, sourceIndex, field, next }) => [scope, sourceIndex, field, next]), [['point', 1, 'InnvendigUtvendig', 'OD']]);
  verify(view, result);
  const set = await prepare(view, 'point', 'InnvendigUtvendig', 'set', 'ID', [0, 1, 2, 3]);
  assert.equal(set.rows[2].reason, 'unchanged');
  const replaced = buildGmiFieldBatch(view.session, set);
  assert.deepEqual(replaced.changeSet.cells.map((cell) => cell.sourceIndex), [0, 1, 3]);
  verify(view, replaced);
  // D3 deliberately replaces the strict-list gate: safe custom lexemes reach the real Validator.
  const custom = await prepare(view, 'point', 'InnvendigUtvendig', 'set', 'unlisted', [0]);
  assert.equal(custom.lexeme, 'UNLISTED');
  assert.equal(custom.rows[0].proposedOutcome.state, 'FAIL');
  assert(custom.rows[0].findings.some((finding) => finding.state === 'FAIL' && finding.batchIntroduced));
  assert.equal((await prepareGmiFieldBatch(view, { scope: 'point', sourceKey: 'InnvendigUtvendig', operation: 'set', value: 'a;b', targets: targets(view, 'point', [0]) }, immediate)).code, 'lexeme-semicolon');
});

test('D3 numeric SDR offers accept equivalent spellings without rewriting the chosen lexeme or eligibility', async () => {
  const view = await setup(gmiEditBatchFixture());
  for (const value of ['11', '11.0', '11,0']) {
    const preview = await prepare(view, 'line', 'SDR', 'fill-missing', value, [0, 7]);
    assert.equal(preview.lexeme, value);
    const batch = buildGmiFieldBatch(view.session, preview);
    assert.equal(batch.ok, true);
    assert(batch.changeSet.eligibility, 'hydraulic eligibility remains the owner');
    assert(batch.changeSet.cells.every((cell) => cell.next === value));
    verify(view, batch);
  }
});

test('multiple lines: Material fill and overwrite, free text, unchanged cells and all bytes outside patches', async () => {
  const view = await setup();
  const fill = await prepare(view, 'line', 'Material', 'fill-missing', 'PE100', [0, 1, 2]);
  assert.deepEqual(fill.rows.map((row) => row.defaultIncluded), [true, false, false]);
  verify(view, buildGmiFieldBatch(view.session, fill));
  const set = await prepare(view, 'line', 'Material', 'set', 'PE100', [0, 1, 2]);
  const result = buildGmiFieldBatch(view.session, set);
  assert.equal(result.changeSet.cells.length, 3);
  assert.equal(result.changeSet.counts.populatedOverwrites, 2);
  verify(view, result);
  const note = await prepare(view, 'line', 'Merknad', 'set', 'Kontrollert', [0, 1, 2]);
  assert.equal(buildGmiFieldBatch(view.session, note).changeSet.cells.length, 3);
  verify(view, buildGmiFieldBatch(view.session, note));
  const unchanged = await prepare(view, 'line', 'Merknad', 'set', 'old', [1]);
  assert.equal(unchanged.rows[0].reason, 'unchanged');
  assert.equal(buildGmiFieldBatch(view.session, unchanged).code, 'no-requests');
});

test('Validator applicability owns defaults and manual inclusion remains explicit', async () => {
  const view = await setup();
  const preview = await prepare(view, 'point', 'Kumform', 'set', 'R', [0, 2, 4]);
  assert.equal(preview.rows[0].applicability, 'NOT_APPLICABLE');
  assert.equal(preview.rows[0].defaultIncluded, false);
  assert.equal(preview.rows[2].applicability, 'UNRESOLVED');
  assert.equal(preview.rows[2].defaultIncluded, false);
  const row = preview.rows[0];
  assert.deepEqual(row.governingOutcome.diagnosticFacts.explanationContextFieldIds, ['tema']);
  assert(row.governingOutcome.diagnosticFacts.context.some((entry) => entry.fieldId === 'tema' && entry.value === 'LOK'));
  const included = new Set(['point:0', 'point:4']);
  assert.equal(buildGmiFieldBatch(view.session, preview, { included }).code, 'manual-override-not-approved');
  const result = buildGmiFieldBatch(view.session, preview, { included, approvals: { allowApplicabilityOverride: true } });
  assert.equal(result.changeSet.cells.length, 2);
  verify(view, result);
});

test('effective context and new/resolved findings come from the existing per-object Validator', async () => {
  let view = await setup();
  const correction = createGmiObjectCorrection(view.session, { scope: 'point', sourceIndex: 0, values: { Tema: 'KUM' }, mode: 'overwrite' });
  view = { ...view, session: stageGmiChangeSet(view.session, correction.changeSet).session };
  const preview = await prepare(view, 'point', 'Kumform', 'set', 'R', [0]);
  assert.equal(preview.rows[0].applicability, 'APPLICABLE');
  assert.equal(preview.rows[0].defaultIncluded, true);
  const inside = await prepare(view, 'point', 'InnvendigUtvendig', 'set', 'OD', [0]);
  assert(inside.rows[0].findings.some((finding) => finding.batchIntroduced));
  const shape = await prepare(view, 'line', 'Rørform', 'set', 'R', [0]);
  assert(shape.rows[0].findings.some((finding) => finding.batchIntroduced && finding.fields.includes('VertikalDimensjon')));
  const valid = await prepare(view, 'point', 'InnvendigUtvendig', 'set', 'ID', [3]);
  assert(valid.rows[0].resolvedFindings.some((finding) => finding.fields.includes('InnvendigUtvendig')));
});

test('conflicts default-excluded, explicit skip/replace reuse M2, fill protects both original and current', async () => {
  let view = await setup();
  const first = createGmiObjectCorrection(view.session, { scope: 'line', sourceIndex: 0, values: { Merknad: 'earlier' } });
  view = { ...view, session: stageGmiChangeSet(view.session, first.changeSet).session };
  const preview = await prepare(view, 'line', 'Merknad', 'set', 'later', [0, 1]);
  assert.equal(preview.rows[0].reason, 'conflict');
  assert.deepEqual(preview.rows[0].changedBy, [first.changeSet.id]);
  const included = new Set(['line:0', 'line:1']);
  const skip = buildGmiFieldBatch(view.session, preview, { included });
  assert.equal(skip.changeSet.cells.length, 1);
  assert.equal(skip.changeSet.conflicts[0].resolution, 'skipped');
  verify(view, skip);
  const replace = buildGmiFieldBatch(view.session, preview, { included, replace: true });
  assert.equal(replace.changeSet.cells.length, 2);
  assert.equal(replace.changeSet.conflicts[0].resolution, 'replaced');
  verify(view, replace);
  const fill = await prepare(view, 'line', 'Merknad', 'fill-missing', 'new', [0]);
  assert.equal(fill.rows[0].reason, 'operation-mismatch');
  assert.equal(buildGmiFieldBatch(view.session, fill, { included: new Set(['line:0']), replace: true }).code, 'target-not-allowed');
  const clear = createGmiObjectCorrection(view.session, { scope: 'line', sourceIndex: 1, values: { Merknad: '' }, mode: 'overwrite' });
  view = { ...view, session: stageGmiChangeSet(view.session, clear.changeSet).session };
  const cleared = await prepare(view, 'line', 'Merknad', 'fill-missing', 'new', [1]);
  assert.equal(cleared.rows[0].reason, 'operation-mismatch');
});

test('setup refusals, invalid targets and selection identity fail closed', async () => {
  const view = await setup();
  const base = { scope: 'point', sourceKey: 'Merknad', operation: 'set', value: 'new', targets: targets(view, 'point', [0]) };
  for (const [patch, code] of [[{ sourceKey: 'absent' }, 'field-absent'], [{ operation: 'clear' }, 'invalid-clear-value'],
    [{ operation: 'replace' }, 'invalid-match'], [{ operation: 'insert-column' }, 'unsupported-operation'], [{ targets: [] }, 'invalid-targets'],
    [{ targets: 'invalid' }, 'invalid-targets'], [{ targets: null }, 'invalid-targets'],
    [{ targets: [base.targets[0], base.targets[0]] }, 'invalid-targets'], [{ targets: [{ scope: 'line', sourceIndex: 0 }] }, 'invalid-targets'],
    [{ value: 'a;b' }, 'lexeme-semicolon']]) {
    assert.equal((await prepareGmiFieldBatch(view, { ...base, ...patch }, immediate)).code, code);
  }
  const selected = selection(view, 'point', [0, 1]);
  const fromSelection = await prepareGmiFieldBatch(view, { ...base, targets: undefined, selection: selected }, immediate);
  assert.equal(fromSelection.ok, true);
  assert.equal((await prepareGmiFieldBatch(view, { ...base, selection: selected, targets: 'xx' }, immediate)).code, 'invalid-targets');
  assert.equal((await prepareGmiFieldBatch(view, null, immediate)).code, 'invalid-options');
  for (const property of ['layerId', 'fingerprint', 'sessionId']) {
    assert.equal((await prepareGmiFieldBatch(view, { ...base, selection: { ...selected, binding: { ...selected.binding, [property]: 'foreign' } } }, immediate)).code, 'stale-session');
  }
  assert.equal((await prepareGmiFieldBatch({ ...view, handle: { ...view.handle, fingerprint: 'foreign' } }, base, immediate)).code, 'stale-session');
  const invalid = await prepareGmiFieldBatch(view, { ...base, targets: [{ scope: 'point', sourceIndex: 999 },
    { ...base.targets[0], objectId: 999 }, { ...targets(view, 'point', [1])[0], guid: 'foreign' }] }, immediate);
  assert.equal(invalid.ok, true);
  assert.deepEqual(invalid.preview.rows.map((row) => row.reason), ['object-identity-mismatch', 'object-identity-mismatch', 'object-not-found']);
  assert(invalid.preview.rows.every((row) => !row.canInclude));
  assert.equal(buildGmiFieldBatch(view.session, invalid.preview, { included: new Set(['point:0']) }).code, 'target-not-allowed');
});

test('reserved, identifier, duplicate and unnamed columns cannot enter planning', async () => {
  const view = await setup(gmiFieldBatchFixture({ pointFields: ['Tema', 'S_FCODE', 'GUID', 'AnleggsID', 'S_HYPERLINK', 'Merknad', 'Merknad'],
    points: [['LOK', 'LOK', 'synthetic-guid', '', '', '', '']] }));
  for (const [sourceKey, code] of [['GUID', 'identifier-column'], ['AnleggsID', 'individual-only'], ['S_HYPERLINK', 'field-owned-by-photo-delivery'],
    ['Merknad', 'duplicate-field-name'], ['', 'unnamed-field']]) {
    const result = await prepareGmiFieldBatch(view, { scope: 'point', sourceKey, operation: 'set', value: 'LOK', targets: targets(view, 'point', [0]) }, immediate);
    assert.equal(result.code, code);
  }
});

test('exact physical aliases and unknown columns remain distinct and editable without borrowing canonical rules', async () => {
  const view = await setup(gmiFieldBatchFixture({ pointFields: ['Tema', 'merknad', 'DIM', 'Dato', 'custom'],
    points: [['LOK', '', '', '', '']] }));
  for (const sourceKey of ['merknad', 'DIM', 'Dato', 'custom']) {
    const preview = await prepare(view, 'point', sourceKey, 'set', 'synthetic text', [0]);
    assert.equal(preview.column.sourceKey, sourceKey);
    if (sourceKey !== 'merknad') {
      assert.equal(preview.column.domain, null);
      assert.equal(preview.rows[0].governingOutcome, null);
    }
    const result = buildGmiFieldBatch(view.session, preview);
    assert.equal(result.changeSet.cells[0].field, sourceKey);
    verify(view, result);
  }
  assert.equal(gmiSelectionTargets(view, selection(view, 'point', [0]), { lineOnly: true }).code, 'line-only');
  assert.deepEqual(targets(view, 'point', [0]), [{ scope: 'point', sourceIndex: 0, objectId: 1, guid: null }]);
});

test('M1 irregular object refusals remain per-object and cannot be manually included', async () => {
  const bytes = new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, 'guard-irregular-objects.gmi')));
  const view = await setup(bytes);
  const dataset = getGmiDocumentDataset(view.document);
  const scope = dataset.lines.length ? 'line' : 'point';
  const objects = dataset[scope === 'line' ? 'lines' : 'points'];
  const fields = view.document.parser[scope === 'line' ? 'lineFieldNames' : 'pointFieldNames'];
  const sourceKey = fields.find((field) => field === 'Merknad') || fields.find((field) => field !== '');
  const preview = await prepare(view, scope, sourceKey, 'set', sourceKey === 'Tema' ? (scope === 'line' ? 'VL' : 'KUM') : 'new', objects.map((_, index) => index));
  const refused = preview.rows.filter((row) => row.status === 'source-refused');
  assert(refused.length > 0);
  for (const row of refused) assert.equal(buildGmiFieldBatch(view.session, preview, { included: new Set([row.key]), approvals: { allowApplicabilityOverride: true } }).code, 'target-not-allowed');
});

test('all hydraulic fields retain legacy M2 rows, numeric lexemes, eligibility, manual rules and exact resulting cells', async () => {
  const view = await setup(gmiEditBatchFixture());
  for (const [canonicalFieldId, sourceKey, value] of [['sdr', 'SDR', '11'], ['pressureClass', 'Trykklasse', 'PN16'], ['ringStiffness', 'Ringstivhet', 'SN8']]) {
    for (const operation of ['fill-missing', 'set']) {
      const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      const exact = targets(view, 'line', indices);
      const mode = operation === 'set' ? 'overwrite' : 'fill-missing';
      const legacy = await prepareGmiBatchReview(view, { canonicalFieldId, mode, lexeme: value, targets: exact }, immediate);
      const preview = await prepare(view, 'line', sourceKey, operation, value, indices);
      assert.deepEqual(preview.hydraulicReview.rows, legacy.rows);
      assert.deepEqual(preview.hydraulicReview.skippedRows, legacy.skippedRows);
      const included = new Set(preview.rows.filter((row) => row.defaultIncluded).map((row) => row.key));
      const result = buildGmiFieldBatch(view.session, preview, { included });
      if (!included.size) { assert.equal(result.code, 'no-requests'); continue; }
      const legacyKeys = new Set(preview.rows.filter((row) => included.has(row.key)).map((row) => row.cellKey));
      const expected = buildGmiBatchSelection(view.session, legacy, legacyKeys);
      assert.equal(result.ok, true);
      assert.deepEqual(result.changeSet.cells, expected.changeSet.cells);
      assert.deepEqual(result.changeSet.skipped, expected.changeSet.skipped);
      assert.deepEqual(result.changeSet.eligibility, expected.changeSet.eligibility);
      assert(result.changeSet.eligibility, 'hydraulic builds must carry genuine eligibility, never explicit-target generic builds');
      verify(view, result);
      const manual = preview.rows.find((row) => row.canInclude && ['not-applicable', 'unresolved'].includes(row.reason));
      if (manual) {
        const choices = new Set([manual.key]);
        assert.equal(buildGmiFieldBatch(view.session, preview, { included: choices }).code, 'manual-override-not-approved');
        const overridden = buildGmiFieldBatch(view.session, preview, { included: choices, approvals: { allowApplicabilityOverride: true } });
        assert.equal(overridden.ok, true);
        assert.equal(overridden.changeSet.eligibility.manualOverrides.length, 1);
      }
    }
  }
  const invalid = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey: 'SDR', operation: 'set', value: '11',
    targets: [{ ...targets(view, 'line', [0])[0], objectId: -1 }] }, immediate);
  assert.equal(invalid.code, 'object-identity-mismatch');
  let lower = await setup(gmiFieldBatchFixture({ lineFields: ['Tema', 'Material', 'sdr'], lines: [['VL', 'PE', '']] }));
  const earlier = createGmiObjectCorrection(lower.session, { scope: 'line', sourceIndex: 0, values: { sdr: '9' } });
  lower = { ...lower, session: stageGmiChangeSet(lower.session, earlier.changeSet).session };
  const lowerPreview = await prepare(lower, 'line', 'sdr', 'set', '11', [0]);
  assert.equal(lowerPreview.rows[0].defaultIncluded, false);
  const chosen = new Set(['line:0']);
  const skip = buildGmiFieldBatch(lower.session, lowerPreview, { included: chosen });
  assert.equal(skip.changeSet.conflicts[0].resolution, 'skipped');
  const replace = buildGmiFieldBatch(lower.session, lowerPreview, { included: chosen, replace: true });
  assert.equal(replace.changeSet.cells[0].field, 'sdr');
  assert.equal(replace.changeSet.conflicts[0].resolution, 'replaced');
  assert(replace.changeSet.eligibility);
  verify(lower, replace);
});

test('stale session, source, selection cancellation and forged preview cannot build', async () => {
  const view = await setup();
  const preview = await prepare(view, 'point', 'Merknad', 'set', 'new', [0]);
  const result = buildGmiFieldBatch(view.session, preview);
  const staged = stageGmiChangeSet(view.session, result.changeSet).session;
  const undone = undoGmiEdit(staged).session;
  for (const session of [staged, undone, redoGmiEdit(undone).session, discardAllGmiEdits(staged).session, createGmiEditSession(view.document)]) {
    assert.equal(buildGmiFieldBatch(session, preview).code, 'stale-session');
  }
  assert.equal(buildGmiFieldBatch(view.session, { ...preview }).code, 'invalid-preview');
  assert.equal(buildGmiFieldBatch(view.session, preview, { included: new Set(['point:999']) }).code, 'invalid-targets');
  let live = true, yields = 0;
  const many = await setup(gmiFieldBatchFixture({ points: Array.from({ length: 45 }, () => ['LOK', '', '', '', '', '']) }));
  const cancelled = await prepareGmiFieldBatch(many, { scope: 'point', sourceKey: 'Merknad', operation: 'set', value: 'new', targets: targets(many, 'point', Array.from({ length: 45 }, (_, index) => index)) },
    { yieldWork: async () => { if (++yields === 2) live = false; }, isLive: () => live });
  assert.equal(cancelled.code, 'stale-session');
  assert.equal(yields, 2, 'yield initially and after 20 objects');
  yields = 0;
  const mutated = await prepareGmiFieldBatch(many, { scope: 'point', sourceKey: 'Merknad', operation: 'set', value: 'new', targets: targets(many, 'point', [0]) },
    { yieldWork: async () => { if (++yields === 1) many.session = createGmiEditSession(many.document, { layerId: 'g2' }); } });
  assert.equal(mutated.code, 'stale-session');
  live = true;
  const prepared = await prepareGmiFieldBatch(view, { scope: 'point', sourceKey: 'Merknad', operation: 'set', value: 'new', targets: targets(view, 'point', [0]) }, { ...immediate, isLive: () => live });
  live = false;
  assert.equal(buildGmiFieldBatch(view.session, prepared.preview).code, 'stale-session');
  const priorHandle = view.handle;
  view.handle = { ...priorHandle, sessionId: 'replaced' };
  assert.equal(buildGmiFieldBatch(view.session, preview).code, 'stale-session');
  view.handle = priorHandle;
  internalGmiSourceState(view.document).bytes[0] ^= 1;
  assert.equal(buildGmiFieldBatch(view.session, preview).code, 'stale-session');
});

test('bound selection may narrow; widened membership or rebound source invalidates the preview', async () => {
  const view = await setup();
  const current = selection(view, 'point', [0, 1]);
  const prepared = await prepareGmiFieldBatch(view, { scope: 'point', sourceKey: 'Merknad', operation: 'set', value: 'new', selection: current }, immediate);
  assert.equal(prepared.ok, true);
  current.keys = ['point:1'];
  const narrowed = buildGmiFieldBatch(view.session, prepared.preview);
  assert.equal(narrowed.ok, true);
  assert.deepEqual(narrowed.changeSet.cells.map((cell) => cell.sourceIndex), [1]);
  assert.equal(buildGmiFieldBatch(view.session, prepared.preview, { included: new Set(['point:0']) }).code, 'stale-selection');
  current.keys.push('point:2');
  assert.equal(buildGmiFieldBatch(view.session, prepared.preview).code, 'stale-session');
  current.keys = ['point:1'];
  current.binding = { ...current.binding, sessionId: 'replacement' };
  assert.equal(buildGmiFieldBatch(view.session, prepared.preview).code, 'stale-session');
});

test('intent is optional, copied, deeply frozen and passes through all existing builders', async () => {
  const view = await setup();
  const request = { scope: 'point', sourceIndex: 0, field: 'Merknad', lexeme: 'new' };
  const intent = { operation: 'set', sourceKey: 'Merknad', value: 'new', scope: 'point', excluded: { notApplicable: 0, user: 1, mismatch: 2 } };
  const explicit = createGmiFieldChangeSet(view.session, { requests: [request], intent });
  assert.equal(explicit.ok, true);
  assert(Object.isFrozen(explicit.changeSet.intent));
  assert(Object.isFrozen(explicit.changeSet.intent.excluded));
  assert(!Object.isFrozen(intent));
  intent.excluded.user = 9;
  assert.equal(explicit.changeSet.intent.excluded.user, 1);
  assert.equal(explicit.changeSet.intent.match, null);
  for (const result of [createGmiFieldChangeSet(view.session, { requests: [request] }),
    createGmiObjectCorrection(view.session, { scope: 'point', sourceIndex: 0, values: { Merknad: 'new' } }),
    createGmiBatchCorrection(view.session, { field: 'Merknad', lexeme: 'new', targets: [{ scope: 'point', sourceIndex: 0 }] })]) {
    assert.equal(result.ok, true);
    assert.equal(result.changeSet.intent, null);
  }
  assert.equal(createGmiFieldChangeSet(view.session, { requests: [request], intent: { bad: true } }).rejections[0].code, 'invalid-intent');
  const preview = await prepare(view, 'point', 'InnvendigUtvendig', 'fill-missing', 'OD', [0, 1, 2, 3]);
  const result = buildGmiFieldBatch(view.session, preview, { included: new Set(['point:1']) });
  assert.deepEqual(result.changeSet.intent.excluded, { notApplicable: 0, user: 1, mismatch: 2 });
});

test('date, year and numeric values remain Validator-judged; dataset-only checks remain deferred', async () => {
  const view = await setup();
  for (const value of ['11.11.2026', '2026-11-11', '20261111']) {
    const preview = await prepare(view, 'point', 'Datafangstdato', 'set', value, [0]);
    assert.equal(buildGmiFieldBatch(view.session, preview).changeSet.cells[0].next, value);
  }
  const year = await prepare(view, 'point', 'Anleggsår', 'set', 'not-year', [0]);
  assert(year.rows[0].findings.some((finding) => finding.batchIntroduced && finding.state === 'FAIL'));
  const number = await prepare(view, 'line', 'Dimensjon', 'set', 'invalid-number', [0]);
  assert(number.rows[0].findings.some((finding) => finding.batchIntroduced && finding.state === 'FAIL'));
  assert.equal(buildGmiFieldBatch(view.session, number).counts.newErrors, 1);
  const datasetContext = await setup(gmiFieldBatchFixture({ pointFields: ['Tema', 'Anleggsår', 'Stedfestingsårsak', 'Merknad'],
    points: [['LOK', '2026', 'UENDR', '']] }));
  const deferred = await prepare(datasetContext, 'point', 'Anleggsår', 'set', '2025', [0]);
  assert.equal(deferred.rows[0].deferred, true);
});

test('synthetic planner performance at 100, 1,000 and all selected objects, both geometries', { timeout: 180000 }, async (t) => {
  const count = 1200;
  const view = await setup(gmiFieldBatchFixture({ points: Array.from({ length: count }, () => ['LOK', '', '', '', '', '']),
    lines: Array.from({ length: count }, () => ['VL', 'PE', '', '', '', '', '160', 'S', '']) }));
  for (const scope of ['point', 'line']) {
    for (const size of [100, 1000, count]) {
      const start = performance.now();
      const preview = await prepare(view, scope, 'Merknad', 'set', 'Kontrollert', Array.from({ length: size }, (_, index) => index));
      const planned = performance.now();
      const result = buildGmiFieldBatch(view.session, preview);
      assert.equal(result.changeSet.cells.length, size);
      t.diagnostic(`${scope} ${size}: prepare ${(planned - start).toFixed(1)} ms; build ${(performance.now() - planned).toFixed(1)} ms`);
    }
  }
});
