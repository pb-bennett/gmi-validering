// M2: ChangeSets, editing session state, proposed dataset, batch eligibility
// and dataset diff for source-preserving GMI editing.
//
// Acceptance criteria covered (planning report §9.2): T6 (batch eligibility),
// T7 (conflicts, undo/redo/discard), T14 field-editing part (reimport of the
// proposed copy) and T17 (diffGmiDatasets). All data is fabricated: the M0
// fixtures plus in-memory synthetic GMI built below. The opt-in private corpus
// test (GMI_EDIT_CORPUS) reports counts only.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { GMI_EDIT_FIXTURE_DIR, sha256Hex } from './helpers/gmiEditFixtures.mjs';
import { discoverGmiFiles, loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import {
  GMI_CHANGE_SET_MODES, GMI_CONFLICT_POLICIES,
  compileGmiEffectiveEdits, createGmiBatchCorrection, createGmiEditSession, createGmiFieldChangeSet,
  createGmiObjectCorrection, createGmiProposedCache, createGmiSourceDocument, diffGmiDatasets,
  discardAllGmiEdits, discardGmiChangeSet, editGmiFields, evaluateGmiBatchEligibility, getGmiDocumentDataset,
  getGmiEditCell, getGmiProposedBytes, getGmiProposedState, getGmiSourceBytes, isGmiChangeSet,
  isGmiFieldEditReservedColumn, listGmiEditCells, redoGmiEdit, revalidateGmiEditSession,
  stageGmiChangeSet, summarizeGmiEditSession, undoGmiEdit, validateGmiDataset,
} from '../src/lib/gmi-edit/index.mjs';
import { internalGmiSourceState } from '../src/lib/gmi-edit/sourceDocument.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { runGmiValidationV2 } from '../src/lib/validation-v2/validationRunner.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';

const REFERENCE_DATE = '2026-11-09';

// ------------------------------------------------------------------ data

// Line rows: Tema;Material;SDR;Trykklasse;S_HYPERLINK;Merknad
// Expected SDR applicability is noted per row (Validator policy).
const LINE_ROWS = [
  'VL;PE;;PN10;;',            // 0 APPLICABLE, SDR missing
  'VL;PE; ;PN10;;Merk 1',     // 1 APPLICABLE, SDR whitespace-only (missing)
  'VL;PE;11.0;PN16;;',        // 2 APPLICABLE, SDR populated
  'SP;PVC;;;;',               // 3 gravity: NOT_APPLICABLE
  'VL;;;;;',                  // 4 material missing: UNRESOLVED
  'VL;XYZ;;;;',               // 5 invalid material: UNRESOLVED
  ';PE;;;;',                  // 6 Tema missing: UNRESOLVED
  'VL;BET;;;;',               // 7 concrete (not SDR family): NOT_APPLICABLE
  'VLVAR;PE;;;;',             // 8 special hydraulic class: EXPECTED -> unresolved
];
const POINT_ROWS = [
  'KUM;h:1( link:"Attachments\\SYNT_M2_1.jpg" ) ;Kum 1',
  'KUM;;Kum 2',
];

function buildSyntheticGmi({ lineRows = LINE_ROWS, pointRows = POINT_ROWS } = {}) {
  const out = [
    '[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!',
    '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    'COSYS_EPSG 25832', 'COSYSVER_EPSG 5941', 'PRODUCER Syntetisk M2',
    '[L_]', '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    '_FIELDNAMES Tema;Material;SDR;Trykklasse;S_HYPERLINK;Merknad;',
    '[P_]', '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    '_FIELDNAMES Tema;S_HYPERLINK;Merknad;',
    '[+L_]',
  ];
  lineRows.forEach((row, k) => {
    out.push(`:L ${k + 1}`, '_EXTENT 581900 6565900 582100 6566100 ', `_FIELDVALUES ${row};`,
      `GUID 5ec0e000-0000-4000-8000-${String(9000 + k).padStart(12, '0')}`, '/XYZ',
      `581940.000 ${6566000 + k}.000 101.000`, `581945.000 ${6566000 + k}.500 101.250`);
  });
  out.push('[+P_]');
  pointRows.forEach((row, k) => {
    out.push(`:P ${k + 1}`, `_FIELDVALUES ${row};`, `GUID 5ec0e000-0000-4000-8000-${String(9500 + k).padStart(12, '0')}`, '/XYZ', `581950.000 ${6566100 + k}.000 102.000`);
  });
  out.push('[END]', '');
  return new Uint8Array(Buffer.from(out.join('\r\n'), 'latin1'));
}

const fixtureBytes = async (name) => new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, `${name}.gmi`)));

function syntheticSession(options) {
  const bytes = buildSyntheticGmi(options);
  const document = createGmiSourceDocument(bytes, { filename: 'synthetic-m2.gmi' });
  assert.equal(document.editable, true, `synthetic document editable (${document.status} ${document.reasons})`);
  return { bytes, document, session: createGmiEditSession(document, { layerId: 'layer-m2' }) };
}

function stage(session, built) {
  assert.equal(built.ok, true, `ChangeSet built: ${JSON.stringify(built.rejections)}`);
  const staged = stageGmiChangeSet(session, built.changeSet);
  assert.equal(staged.ok, true, `staged: ${staged.code}`);
  return staged.session;
}

const line = (sourceIndex, extra = {}) => ({ scope: 'line', sourceIndex, ...extra });
const codes = (result) => result.rejections.map((entry) => entry.code);
const cellOf = (session, sourceIndex, field, scope = 'line') => getGmiEditCell(session, { scope, sourceIndex, field });

/** Every proposal is checked against the independent M0 oracle and the diff. */
function assertProposedExact(session, expected, cache = createGmiProposedCache()) {
  const proposed = getGmiProposedState(session, { cache });
  assert.equal(proposed.ok, true, `proposed ok: ${JSON.stringify(proposed.rejections)}`);
  const diff = diffGmiDatasets(getGmiDocumentDataset(session.document), proposed.dataset);
  assert.deepEqual(diff.structural, [], 'no header, geometry, GUID, id, extent or column change');
  assert.deepEqual(
    diff.changes.map((change) => [change.scope, change.sourceIndex, change.field, change.original, change.proposed]),
    expected.map(({ scope = 'line', sourceIndex, field, original, lexeme }) => [scope, sourceIndex, field, original, lexeme]),
  );
  const reference = loadGmiDocument(getGmiSourceBytes(session.document));
  const oracle = verifyCellChanges(reference, getGmiProposedBytes(proposed), expected.map(({ scope = 'line', sourceIndex, field, lexeme }) => ({ scope, sourceIndex, field, lexeme })));
  assert.equal(oracle.ok, true, `M0 oracle: ${oracle.failures}`);
  return { proposed, diff };
}

// ------------------------------------------------------- single / batch

test('single-object correction: several columns of one object, identity-guarded, exact proposed cells', () => {
  const { session, document } = syntheticSession();
  const guid = document.parser.linesParsed[2].guid;
  const built = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, objectId: 3, guid, values: { Material: 'PE100', Merknad: 'Rettet' }, mode: GMI_CHANGE_SET_MODES.OVERWRITE, label: 'Material PE100 · Linje 3' });
  assert.equal(built.ok, true);
  const { changeSet } = built;
  assert(isGmiChangeSet(changeSet) && Object.isFrozen(changeSet) && Object.isFrozen(changeSet.cells[0]));
  assert.equal(changeSet.origin, 'object-editor');
  assert.deepEqual(changeSet.cells.map((cell) => [cell.field, cell.original, cell.previous, cell.next, cell.overwritesPopulated]), [
    ['Material', 'PE', 'PE', 'PE100', true],
    ['Merknad', '', '', 'Rettet', false],
  ]);
  const next = stage(session, built);
  assert.equal(session.changeSets.length, 0, 'previous session value is unchanged');
  assertProposedExact(next, [
    { sourceIndex: 2, field: 'Material', original: 'PE', lexeme: 'PE100' },
    { sourceIndex: 2, field: 'Merknad', original: '', lexeme: 'Rettet' },
  ]);
  // The proposed bytes equal a direct, single M1 application to the original.
  const direct = editGmiFields(document, [
    { target: { scope: 'line', sourceIndex: 2, field: 'Material' }, expected: 'PE', lexeme: 'PE100' },
    { target: { scope: 'line', sourceIndex: 2, field: 'Merknad' }, expected: '', lexeme: 'Rettet' },
  ]);
  assert.deepEqual(getGmiProposedBytes(getGmiProposedState(next, { cache: createGmiProposedCache() })), direct.bytes);
});

test('fill-missing is the default: populated values are never overwritten without explicit overwrite mode', () => {
  const { session } = syntheticSession();
  const built = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, values: { SDR: '17.0', Merknad: 'Ny' } });
  assert.equal(built.changeSet.mode, 'fill-missing');
  assert.deepEqual(built.changeSet.cells.map((cell) => cell.field), ['Merknad']);
  assert.deepEqual(built.changeSet.skipped.map((entry) => [entry.field, entry.reason, entry.current]), [['SDR', 'populated', '11.0']]);
  const onlyPopulated = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, values: { SDR: '17.0' } });
  const staged = stageGmiChangeSet(session, onlyPopulated.changeSet);
  assert.equal(staged.ok, true);
  assert.equal(staged.staged, false, 'a set with nothing to apply is a valid no-op, not staged');
  assert.equal(staged.session, session);
  const overwrite = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, values: { SDR: '17.0' }, mode: 'overwrite' });
  assert.equal(overwrite.changeSet.counts.populatedOverwrites, 1);
});

test('multi-object batch correction with explicit targets; irregular objects are skipped, not rejected', async () => {
  const { session } = syntheticSession();
  const built = createGmiBatchCorrection(session, { field: 'Merknad', lexeme: 'Kontrollert', targets: [line(0), line(3), line(4), line(1)] });
  assert.equal(built.ok, true);
  assert.equal(built.changeSet.origin, 'batch');
  assert.deepEqual(built.changeSet.cells.map((cell) => cell.sourceIndex), [0, 3, 4], 'deterministic order; line 1 is populated');
  assert.deepEqual(built.changeSet.skipped.map((entry) => [entry.sourceIndex, entry.reason]), [[1, 'populated']]);
  assert.equal(built.changeSet.objectCount, 3);
  const next = stage(session, built);
  assertProposedExact(next, [0, 3, 4].map((sourceIndex) => ({ sourceIndex, field: 'Merknad', original: '', lexeme: 'Kontrollert' })));

  const irregular = createGmiSourceDocument(await fixtureBytes('guard-irregular-objects'));
  const irregularSession = createGmiEditSession(irregular);
  const count = irregular.parser.points.length;
  const batch = createGmiBatchCorrection(irregularSession, { field: 'Merknad', lexeme: 'M2', mode: 'overwrite', targets: Array.from({ length: count }, (_, sourceIndex) => ({ scope: 'point', sourceIndex })) });
  assert.equal(batch.ok, true);
  assert(batch.changeSet.cells.length >= 1);
  assert(batch.changeSet.skipped.length >= 1 && batch.changeSet.skipped.every((entry) => entry.reason === 'object-not-editable'));
  assert.equal(batch.changeSet.cells.length + batch.changeSet.skipped.length, count);
  const proposed = getGmiProposedState(stage(irregularSession, batch), { cache: createGmiProposedCache() });
  assert.equal(proposed.ok, true);
});

// --------------------------------------------------------- conflicts (T7)

test('multiple edits to the same cell compile to exactly one M1 edit against the original lexeme', () => {
  let { session } = syntheticSession();
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' } }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '13.6' }, conflictPolicy: 'replace' }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '17.0' }, conflictPolicy: 'replace' }));
  const compiled = compileGmiEffectiveEdits(session);
  assert.deepEqual(compiled.edits.map((edit) => [edit.target.sourceIndex, edit.target.field, edit.expected, edit.lexeme]), [[0, 'SDR', '', '17.0']]);
  assert.deepEqual(cellOf(session, 0, 'SDR').history.map((entry) => [entry.changeSetId, entry.previous, entry.next]), [['cs-1', '', '11.0'], ['cs-2', '11.0', '13.6'], ['cs-3', '13.6', '17.0']]);
  const { proposed, diff } = assertProposedExact(session, [{ sourceIndex: 0, field: 'SDR', original: '', lexeme: '17.0' }]);
  assert.equal(proposed.editCount, 1);
  assert.equal(diff.counts.cells, 1, 'superseded values are not differences');
});

test('conflicts: default skip reports the conflict; explicit replace overwrites; outcomes are reproducible', () => {
  const run = (policy) => {
    let { session } = syntheticSession();
    session = stage(session, createGmiBatchCorrection(session, { field: 'SDR', lexeme: '11.0', targets: [line(0), line(1)], label: 'A' }));
    const built = createGmiBatchCorrection(session, { field: 'SDR', lexeme: '17.0', targets: [line(1), line(3)], conflictPolicy: policy, label: 'B' });
    return { session, built, after: stage(session, built) };
  };
  const skip = run(undefined);
  assert.equal(skip.built.changeSet.conflictPolicy, 'skip');
  assert.deepEqual(skip.built.changeSet.cells.map((cell) => cell.sourceIndex), [3]);
  assert.deepEqual(skip.built.changeSet.skipped.map((entry) => [entry.sourceIndex, entry.reason, entry.conflictsWith, entry.current]), [[1, 'conflict', ['cs-1'], '11.0']]);
  assert.deepEqual(skip.built.changeSet.conflicts.map((entry) => [entry.sourceIndex, entry.with, entry.resolution]), [[1, ['cs-1'], 'skipped']]);
  assert.deepEqual(skip.built.changeSet.counts, { requested: 2, applied: 1, skipped: 1, unchanged: 0, conflicting: 1, overwritten: 0, populatedOverwrites: 0, skippedByReason: { conflict: 1 } });
  assertProposedExact(skip.after, [
    { sourceIndex: 0, field: 'SDR', original: '', lexeme: '11.0' },
    { sourceIndex: 1, field: 'SDR', original: ' ', lexeme: '11.0' },
    { sourceIndex: 3, field: 'SDR', original: '', lexeme: '17.0' },
  ]);

  const replace = run(GMI_CONFLICT_POLICIES.REPLACE);
  assert.deepEqual(replace.built.changeSet.cells.map((cell) => [cell.sourceIndex, cell.previous, cell.next, cell.overwrote]), [
    [1, '11.0', '17.0', { changeSetId: 'cs-1', lexeme: '11.0' }],
    [3, '', '17.0', null],
  ]);
  assert.equal(replace.built.changeSet.counts.overwritten, 1);
  assert.deepEqual(replace.built.changeSet.conflicts.map((entry) => entry.resolution), ['replaced']);
  assertProposedExact(replace.after, [
    { sourceIndex: 0, field: 'SDR', original: '', lexeme: '11.0' },
    { sourceIndex: 1, field: 'SDR', original: ' ', lexeme: '17.0' },
    { sourceIndex: 3, field: 'SDR', original: '', lexeme: '17.0' },
  ]);
  // Reproducible: the same operations give the same ChangeSets and history.
  assert.deepEqual(JSON.parse(JSON.stringify(run('replace').after.changeSets)), JSON.parse(JSON.stringify(replace.after.changeSets)));

  // Replace never lets fill-missing overwrite a populated delivered value.
  let { session } = syntheticSession();
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, values: { SDR: '' }, mode: 'overwrite' }));
  const refill = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, values: { SDR: '17.0' }, conflictPolicy: 'replace' });
  assert.deepEqual(refill.changeSet.skipped.map((entry) => entry.reason), ['populated']);
});

test('an unchanged proposed value is a valid no-op, also when it equals an earlier proposal', () => {
  let { session } = syntheticSession();
  const same = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, values: { SDR: '11.0' }, mode: 'overwrite' });
  assert.equal(same.ok, true);
  assert.deepEqual(same.changeSet.unchanged.map((entry) => [entry.field, entry.current]), [['SDR', '11.0']]);
  assert.equal(stageGmiChangeSet(session, same.changeSet).staged, false);
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' } }));
  const again = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' } });
  assert.deepEqual([again.changeSet.unchanged.length, again.changeSet.conflicts.length], [1, 0], 'same value is not a conflict');
});

test('undo, redo, discard one and discard all recompute effective values from the history', () => {
  const { session: start, bytes } = syntheticSession();
  const cache = createGmiProposedCache();
  const a = stage(start, createGmiObjectCorrection(start, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' }, label: 'A' }));
  const b = stage(a, createGmiObjectCorrection(a, { scope: 'line', sourceIndex: 0, values: { SDR: '17.0' }, conflictPolicy: 'replace', label: 'B' }));
  const c = stage(b, createGmiObjectCorrection(b, { scope: 'line', sourceIndex: 3, values: { Merknad: 'C' }, label: 'C' }));
  assert.deepEqual(summarizeGmiEditSession(c), { changeSetCount: 3, redoCount: 0, touchedCells: 2, changedCells: 2, changedObjects: 2, canUndo: true, canRedo: false });

  const u1 = undoGmiEdit(c).session;
  assert.equal(cellOf(u1, 3, 'Merknad').proposed, '');
  const u2 = undoGmiEdit(u1).session;
  assert.equal(cellOf(u2, 0, 'SDR').proposed, '11.0', 'undoing B restores A\'s proposal');
  assert.equal(u2.stateKey, a.stateKey);
  const r1 = redoGmiEdit(u2).session;
  assert.equal(cellOf(r1, 0, 'SDR').proposed, '17.0');
  assert.deepEqual(r1.redo.map((changeSet) => changeSet.label), ['C']);
  const r2 = redoGmiEdit(r1).session;
  assert.equal(r2.stateKey, c.stateKey);
  assert.equal(redoGmiEdit(r2).code, 'nothing-to-redo');

  // A new stage clears redo.
  const branched = stage(u1, createGmiObjectCorrection(u1, { scope: 'line', sourceIndex: 4, values: { Merknad: 'D' } }));
  assert.equal(branched.redo.length, 0);

  // Discard a middle set: later sets keep their cells; the redo stack is cleared.
  const withRedo = undoGmiEdit(c).session;
  const discarded = discardGmiChangeSet(withRedo, a.changeSets[0].id);
  assert.equal(discarded.ok, true);
  assert.deepEqual(discarded.affected, [b.changeSets[1].id], 'B referred to A in its conflict decision');
  assert.equal(discarded.session.redo.length, 0);
  assert.equal(cellOf(discarded.session, 0, 'SDR').proposed, '17.0');
  const discardB = discardGmiChangeSet(c, b.changeSets[1].id).session;
  assert.equal(cellOf(discardB, 0, 'SDR').proposed, '11.0');
  assert.equal(discardGmiChangeSet(c, 'cs-99').code, 'change-set-not-found');

  // Undo everything / discard all: identical to the original bytes.
  const all = discardAllGmiEdits(c);
  assert.deepEqual(all.discarded, ['cs-1', 'cs-2', 'cs-3']);
  for (const empty of [all.session, undoGmiEdit(undoGmiEdit(u1).session).session]) {
    const proposed = getGmiProposedState(empty, { cache });
    assert.equal(proposed.identical, true);
    assert.equal(proposed.verification, null);
    assert.equal(sha256Hex(getGmiProposedBytes(proposed)), sha256Hex(bytes));
  }
  assert.equal(undoGmiEdit(all.session).code, 'nothing-to-undo');
  // Earlier session values are untouched by all of this.
  assert.deepEqual(c.changeSets.map((changeSet) => changeSet.label), ['A', 'B', 'C']);
});

test('reverting a field to its original value removes it from the effective edits', () => {
  let { session, bytes } = syntheticSession();
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 1, values: { Merknad: 'Endret' }, mode: 'overwrite' }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 1, values: { Merknad: 'Merk 1' }, mode: 'overwrite', conflictPolicy: 'replace' }));
  assert.deepEqual(compileGmiEffectiveEdits(session).edits, []);
  const cell = cellOf(session, 1, 'Merknad');
  assert.deepEqual([cell.original, cell.proposed, cell.changed, cell.touched], ['Merk 1', 'Merk 1', false, true]);
  const cells = listGmiEditCells(session);
  assert.deepEqual([cells.changed.length, cells.reverted.length], [0, 1]);
  const proposed = getGmiProposedState(session, { cache: createGmiProposedCache() });
  assert.equal(proposed.identical, true);
  assert.equal(sha256Hex(getGmiProposedBytes(proposed)), sha256Hex(bytes));
  assert.equal(diffGmiDatasets(getGmiDocumentDataset(session.document), proposed.dataset).identical, true);
});

// ------------------------------------------------- stale / incompatible

test('stale, foreign and incompatible ChangeSets and targets are rejected', async () => {
  const { session, document } = syntheticSession();
  const first = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' } });
  const second = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 3, values: { Merknad: 'X' } });
  const after = stage(session, first);
  assert.equal(stageGmiChangeSet(after, second.changeSet).code, 'stale-change-set');
  assert.equal(stageGmiChangeSet(after, first.changeSet).code, 'stale-change-set');
  const other = createGmiEditSession(document);
  assert.equal(stageGmiChangeSet(other, second.changeSet).code, 'foreign-change-set');
  const otherDocument = createGmiSourceDocument(buildSyntheticGmi());
  assert.equal(stageGmiChangeSet(createGmiEditSession(otherDocument), second.changeSet).code, 'document-mismatch');

  // Target identity guards and target structure.
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, objectId: 2, values: { SDR: '11.0' } })), ['object-identity-mismatch']);
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, guid: '5ec0e000-0000-4000-8000-000000000000', values: { SDR: '11.0' } })), ['object-identity-mismatch']);
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 99, values: { SDR: '11.0' } })), ['object-not-found']);
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'polygon', sourceIndex: 0, values: { SDR: '11.0' } })), ['unknown-scope']);
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0, values: { SDR: '11.0' } })), ['field-absent'], 'no column is added');
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { sdr: '11.0' } })), ['field-absent'], 'exact column names');
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { '': 'x' } })), ['unnamed-field']);
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11;0' } })), ['lexeme-semicolon']);
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: 11 } })), ['lexeme-not-string']);
  assert.deepEqual(codes(createGmiBatchCorrection(session, { field: 'SDR', lexeme: '11.0', targets: [line(0), line(0)] })), ['duplicate-target']);
  assert.deepEqual(codes(createGmiFieldChangeSet(session, { requests: [{ scope: 'line', sourceIndex: 0, field: 'SDR', lexeme: '11.0' }], mode: 'replace-all' })), ['invalid-mode']);
  assert.deepEqual(codes(createGmiFieldChangeSet(session, { requests: [] })), ['no-requests']);
  // One bad request rejects the whole set.
  assert.deepEqual(codes(createGmiBatchCorrection(session, { field: 'SDR', lexeme: '11.0', targets: [line(0), line(50)] })), ['object-not-found']);

  const absent = createGmiEditSession(createGmiSourceDocument(await fixtureBytes('sdr-absent')));
  const absentLine = absent.document.parser.linesParsed.length ? 'line' : 'point';
  assert.deepEqual(codes(createGmiBatchCorrection(absent, { field: 'SDR', lexeme: '11.0', targets: [{ scope: absentLine, sourceIndex: 0 }] })), ['field-absent']);
  assert.equal(evaluateGmiBatchEligibility(absent, { canonicalFieldId: 'sdr' }).code, 'field-absent');

  const readOnly = createGmiEditSession(createGmiSourceDocument(await fixtureBytes('guard-repeated-section')));
  assert.equal(readOnly.editable, false);
  assert.deepEqual(codes(createGmiObjectCorrection(readOnly, { scope: 'point', sourceIndex: 0, values: { Merknad: 'x' } })), ['document-not-editable']);
  assert.equal(evaluateGmiBatchEligibility(readOnly, { canonicalFieldId: 'sdr' }).code, 'document-not-editable');
});

test('stale source bytes fail closed in M1, also behind a cached result', () => {
  let { session, document } = syntheticSession();
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' } }));
  const cache = createGmiProposedCache();
  assert.equal(getGmiProposedState(session, { cache }).ok, true);
  const state = internalGmiSourceState(document);
  const at = state.bytes.indexOf(0x56); // a 'V' in the header region is enough
  state.bytes[at] ^= 0x20;
  try {
    const stale = getGmiProposedState(session, { cache });
    assert.equal(stale.ok, false, 'a cached result is not returned for a mutated source');
    assert.deepEqual(stale.rejections.map((entry) => entry.code), ['source-bytes-mutated']);
    assert.equal(cache.stats().integrityEvictions, 1);
  } finally {
    state.bytes[at] ^= 0x20;
  }
  cache.invalidate(document);
  assert.equal(getGmiProposedState(session, { cache }).ok, true);
});

// --------------------------------------------------- column ownership

test('S_HYPERLINK is rejected through every ordinary field-editing path; M1 keeps the capability', () => {
  const { session, document } = syntheticSession();
  const owned = 'field-owned-by-photo-delivery';
  for (const field of ['S_HYPERLINK', 's_hyperlink', ' S_Hyperlink', 'S_HYPERLINK_punkt']) assert(isGmiFieldEditReservedColumn(field), field);
  assert(!isGmiFieldEditReservedColumn('Merknad'));
  const request = { scope: 'point', sourceIndex: 1, field: 'S_HYPERLINK', lexeme: 'h:1( link:"x.jpg" )' };
  assert.deepEqual(codes(createGmiFieldChangeSet(session, { requests: [request], mode: 'overwrite' })), [owned]);
  assert.deepEqual(codes(createGmiFieldChangeSet(session, { requests: [{ ...request, field: 's_hyperlink' }] })), [owned]);
  assert.deepEqual(codes(createGmiFieldChangeSet(session, { requests: [{ scope: 'point', sourceIndex: 1, field: 'Merknad', lexeme: 'ok' }, request] })), [owned], 'mixed with a valid field: whole set rejected');
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0, values: { S_HYPERLINK: '' }, mode: 'overwrite' })), [owned], 'clearing a link');
  assert.deepEqual(codes(createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0, values: { Merknad: 'x', S_HYPERLINK: '' }, mode: 'overwrite' })), [owned]);
  assert.deepEqual(codes(createGmiBatchCorrection(session, { field: 'S_HYPERLINK', lexeme: '', targets: [{ scope: 'point', sourceIndex: 0 }], mode: 'overwrite' })), [owned]);
  assert.equal(evaluateGmiBatchEligibility(session, { canonicalFieldId: 'attachmentLink' }).code, owned);
  // Smuggling skip records or eligibility summaries through the generic path is ignored.
  const smuggled = createGmiFieldChangeSet(session, { requests: [{ scope: 'point', sourceIndex: 1, field: 'Merknad', lexeme: 'ok' }], mode: 'overwrite', preSkipped: [{ field: 'S_HYPERLINK', reason: 'x' }], eligibility: { ruleId: 'fake' } });
  assert.equal(smuggled.ok, true);
  assert.deepEqual([smuggled.changeSet.skipped.length, smuggled.changeSet.eligibility], [0, null]);
  // Hand-built or copied ChangeSets cannot be staged; built ones cannot be altered.
  const fake = { ...smuggled.changeSet, cells: [{ ...smuggled.changeSet.cells[0], field: 'S_HYPERLINK', key: 'k' }] };
  assert.equal(stageGmiChangeSet(session, fake).code, 'not-a-change-set');
  assert.throws(() => { smuggled.changeSet.cells[0].field = 'S_HYPERLINK'; }, TypeError);
  assert.throws(() => { smuggled.changeSet.cells.push({}); }, TypeError);
  // The read-only inspection still shows the column (as reserved).
  const link = getGmiEditCell(session, { scope: 'point', sourceIndex: 0, field: 'S_HYPERLINK' });
  assert.deepEqual([link.ok, link.reserved, link.changed], [true, true, false]);
  // The lower-level M1 engine is unchanged and still patches S_HYPERLINK (for M7).
  const cell = link.original;
  const m1 = editGmiFields(document, [{ target: { scope: 'point', sourceIndex: 0, field: 'S_HYPERLINK' }, expected: cell, lexeme: '' }]);
  assert.equal(m1.ok, true);
});

// ------------------------------------------------------ eligibility (T6)

test('SDR eligibility: applicable / inapplicable / unresolved, missing vs populated, reason counts', () => {
  const { session } = syntheticSession();
  const result = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr', cache: createGmiProposedCache() });
  assert.equal(result.ok, true);
  assert.deepEqual([result.field, result.ruleId, result.mode], ['SDR', 'innmaling.line.sdr.valid', 'fill-missing']);
  assert.deepEqual(result.eligible.map((entry) => [entry.sourceIndex, entry.current, entry.missing, entry.overwrite]), [[0, '', true, false], [1, ' ', true, false]]);
  assert.deepEqual(result.skipped.map((entry) => [entry.sourceIndex, entry.reason, entry.applicability]), [
    [2, 'populated', 'APPLICABLE'],
    [3, 'not-applicable', 'NOT_APPLICABLE'],
    [4, 'unresolved', 'UNRESOLVED'],
    [5, 'unresolved', 'UNRESOLVED'],
    [6, 'unresolved', 'UNRESOLVED'],
    [7, 'not-applicable', 'NOT_APPLICABLE'],
    [8, 'unresolved', 'EXPECTED'],
  ]);
  assert.deepEqual(result.counts, {
    total: 9, applicable: 3, notApplicable: 2, unresolved: 4, missing: 8, populated: 1, previouslyChanged: 0,
    eligible: 2, skipped: 7, skippedByReason: { populated: 1, 'not-applicable': 2, unresolved: 4 },
  });

  // Explicit overwrite: populated applicable objects become eligible, flagged.
  const overwrite = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr', mode: 'overwrite' });
  assert.deepEqual(overwrite.eligible.map((entry) => [entry.sourceIndex, entry.overwrite]), [[0, false], [1, false], [2, true]]);
  const fill = createGmiBatchCorrection(session, { lexeme: '17.0', eligibility: result });
  assert.deepEqual(codes(createGmiBatchCorrection(session, { lexeme: '17.0', eligibility: overwrite })), ['eligibility-mode-mismatch']);
  const over = createGmiBatchCorrection(session, { lexeme: '17.0', eligibility: overwrite, mode: 'overwrite' });
  assert.deepEqual(fill.changeSet.cells.map((cell) => cell.sourceIndex), [0, 1]);
  assert.deepEqual(over.changeSet.cells.map((cell) => [cell.sourceIndex, cell.overwritesPopulated]), [[0, false], [1, false], [2, true]]);
  assert.deepEqual(fill.changeSet.eligibility.ruleId, 'innmaling.line.sdr.valid');
  assert.deepEqual(fill.changeSet.counts.skippedByReason, { populated: 1, 'not-applicable': 2, unresolved: 4 }, 'skipped objects stay in the record');
  assert.equal(fill.changeSet.counts.requested, 9);

  // Restricting to explicit (e.g. Validator finding) objects; points are out of scope.
  const restricted = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr', targets: [line(1), line(3), { scope: 'point', sourceIndex: 0 }, line(1)] });
  assert.deepEqual(restricted.eligible.map((entry) => entry.sourceIndex), [1]);
  assert.deepEqual(restricted.skipped.map((entry) => [entry.scope, entry.reason]), [['point', 'out-of-scope'], ['line', 'not-applicable']]);
  assert.equal(evaluateGmiBatchEligibility(session, { canonicalFieldId: 'material' }).code, 'unsupported-field');
});

test('pressure-class eligibility follows the Validator hydraulic policy', () => {
  const { session } = syntheticSession();
  const result = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'pressureClass' });
  assert.equal(result.field, 'Trykklasse');
  assert.deepEqual(result.eligible.map((entry) => entry.sourceIndex), [4, 5, 7], 'PRESSURE Tema with Trykklasse missing (material irrelevant)');
  const reasons = Object.fromEntries(result.skipped.map((entry) => [entry.sourceIndex, entry.reason]));
  assert.deepEqual(reasons, { 0: 'populated', 1: 'populated', 2: 'populated', 3: 'not-applicable', 6: 'unresolved', 8: 'unresolved' });
});

test('eligibility is evaluated on the current proposed dataset and is bound to that state', () => {
  let { session } = syntheticSession();
  const cache = createGmiProposedCache();
  const before = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr', cache });
  // Correct Material on line 4 (missing) and Tema on line 6 (missing); fill SDR on line 0.
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 4, values: { Material: 'PE100' } }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 6, values: { Tema: 'VL' } }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' } }));
  assert.deepEqual(codes(createGmiBatchCorrection(session, { lexeme: '17.0', eligibility: before })), ['stale-eligibility']);
  const after = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr', cache });
  assert.deepEqual(after.eligible.map((entry) => entry.sourceIndex), [1, 4, 6]);
  assert.deepEqual(after.skipped.find((entry) => entry.sourceIndex === 0).reason, 'populated', 'the staged fill counts as populated');
  assert.deepEqual(after.skipped.find((entry) => entry.sourceIndex === 0).changedBy, ['cs-3']);
  assert.equal(after.counts.previouslyChanged, 1);
  const otherSession = createGmiEditSession(session.document);
  assert.deepEqual(codes(createGmiBatchCorrection(otherSession, { lexeme: '17.0', eligibility: after })), ['foreign-eligibility']);
  assert.deepEqual(codes(createGmiBatchCorrection(session, { lexeme: '17.0', eligibility: { ...after } })), ['invalid-eligibility']);
  const filled = stage(session, createGmiBatchCorrection(session, { lexeme: '11.0', eligibility: after }));
  assertProposedExact(filled, [
    { sourceIndex: 0, field: 'SDR', original: '', lexeme: '11.0' },
    { sourceIndex: 1, field: 'SDR', original: ' ', lexeme: '11.0' },
    { sourceIndex: 4, field: 'Material', original: '', lexeme: 'PE100' },
    { sourceIndex: 4, field: 'SDR', original: '', lexeme: '11.0' },
    { sourceIndex: 6, field: 'Tema', original: '', lexeme: 'VL' },
    { sourceIndex: 6, field: 'SDR', original: '', lexeme: '11.0' },
  ].sort((a, b) => a.sourceIndex - b.sourceIndex || ['Tema', 'Material', 'SDR'].indexOf(a.field) - ['Tema', 'Material', 'SDR'].indexOf(b.field)));
});

// ---------------------------------------------------- diff (T17), T14

test('diffGmiDatasets reports exactly the effective cell changes and nothing cancelled or superseded', () => {
  let { session } = syntheticSession();
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0', Merknad: 'A' } }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 3, values: { Merknad: 'cancelled' } }));
  session = undoGmiEdit(session).session;
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { Merknad: 'B' }, mode: 'overwrite', conflictPolicy: 'replace' }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 1, values: { Merknad: 'Kum 2' }, mode: 'overwrite' }));
  const { diff } = assertProposedExact(session, [
    { scope: 'point', sourceIndex: 1, field: 'Merknad', original: 'Kum 2', lexeme: 'Kum 2' },
    { sourceIndex: 0, field: 'SDR', original: '', lexeme: '11.0' },
    { sourceIndex: 0, field: 'Merknad', original: '', lexeme: 'B' },
  ].filter((entry) => entry.original !== entry.lexeme));
  const [sdr] = diff.changes;
  assert.deepEqual(sdr, { scope: 'line', sourceIndex: 0, objectId: 1, guid: '5ec0e000-0000-4000-8000-000000009000', field: 'SDR', position: 2, original: '', proposed: '11.0', originalValue: null, proposedValue: 11 });
  assert.deepEqual(diff.counts, { cells: 2, objects: 1, byField: { SDR: 1, Merknad: 1 } });
  // Lexeme-exact: 11 vs 11.0 is a difference even though parsed values agree.
  let lexical = syntheticSession().session;
  lexical = stage(lexical, createGmiObjectCorrection(lexical, { scope: 'line', sourceIndex: 2, values: { SDR: '11' }, mode: 'overwrite' }));
  const lexicalDiff = diffGmiDatasets(getGmiDocumentDataset(lexical.document), getGmiProposedState(lexical).dataset);
  assert.deepEqual(lexicalDiff.changes.map((change) => [change.original, change.proposed, change.originalValue, change.proposedValue]), [['11.0', '11', 11, 11]]);
  // Structural differences are reported separately.
  const moved = createGmiSourceDocument(buildSyntheticGmi({ lineRows: LINE_ROWS.slice(0, 8) }));
  const structural = diffGmiDatasets(getGmiDocumentDataset(lexical.document), getGmiDocumentDataset(moved));
  assert.deepEqual(structural.structural.map((entry) => entry.code), ['object-count-changed']);
});

test('T14 (field part): the proposed copy reimports with the production parser, photo source and Validator', () => {
  let { session, document } = syntheticSession();
  const eligibility = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr' });
  session = stage(session, createGmiBatchCorrection(session, { lexeme: '11.0', eligibility }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 1, values: { Merknad: 'Kum to' }, mode: 'overwrite' }));
  const proposed = getGmiProposedState(session);
  const reparsed = new GMIParser(decodeGmiBytes(getGmiProposedBytes(proposed)));
  assert.deepEqual(reparsed.errors, []);
  assert.deepEqual(reparsed.warnings, document.parser.warnings);
  const references = (parser) => createGmiPhotoSource(parser).references.map((reference) => JSON.stringify(reference));
  assert.equal(references(document.parser).length, 1);
  assert.deepEqual(references(reparsed), references(document.parser), 'field edits never change hyperlink references');
  const direct = (() => { const { warningSummary, ...dataset } = reparsed.toObject(); void warningSummary; return dataset; })();
  const run = runGmiValidationV2({ layerId: 'layer-m2', dataset: direct, datasetRevision: getDatasetRevision(direct), sourceFormat: 'gmi', referenceDate: REFERENCE_DATE });
  const revalidated = revalidateGmiEditSession(session, { referenceDate: REFERENCE_DATE });
  assert.equal(revalidated.ok, true);
  assert.deepEqual(revalidated.revised.summary, run.summary);
  assert.deepEqual(revalidated.revised.outcomes.map((outcome) => [outcome.ruleId, outcome.objectRef.geometryScope, outcome.objectRef.sourceIndex, outcome.state]),
    run.outcomes.map((outcome) => [outcome.ruleId, outcome.objectRef.geometryScope, outcome.objectRef.sourceIndex, outcome.state]));
  const sdrState = (validation, sourceIndex) => validation.outcomes.find((outcome) => outcome.ruleId === 'innmaling.line.sdr.valid' && outcome.objectRef.sourceIndex === sourceIndex).state;
  assert.notEqual(sdrState(revalidated.original, 0), 'PASS');
  assert.equal(sdrState(revalidated.revised, 0), 'PASS');
  assert.notEqual(revalidated.original.datasetRevision, revalidated.revised.datasetRevision);
});

// ------------------------------------------------ caching and immutability

test('proposed results are memoized per effective state; invalidation is explicit', () => {
  let { session, document } = syntheticSession();
  const cache = createGmiProposedCache({ maxEntriesPerDocument: 2 });
  const empty = getGmiProposedState(session, { cache });
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' } }));
  const first = getGmiProposedState(session, { cache });
  assert.deepEqual(cache.stats(), { hits: 0, misses: 2, computations: 2, invalidations: 0, integrityEvictions: 0 });
  // Getters, inspection and eligibility on the same state never recompute.
  for (let k = 0; k < 5; k++) {
    assert.equal(getGmiProposedState(session, { cache }), first);
    summarizeGmiEditSession(session); listGmiEditCells(session); cellOf(session, 0, 'SDR');
  }
  evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr', cache });
  assert.equal(cache.stats().computations, 2);
  assert.equal(cache.stats().hits, 6);
  // Undo + redo reaches the same effective state: same result object.
  const redone = redoGmiEdit(undoGmiEdit(session).session).session;
  assert.notEqual(redone, session);
  assert.equal(getGmiProposedState(redone, { cache }), first);
  assert.equal(getGmiProposedState(undoGmiEdit(session).session, { cache }), empty);
  // Same dataset object -> stable datasetRevision and memoized validation.
  const v1 = validateGmiDataset(first.dataset, { layerId: 'layer-m2', referenceDate: REFERENCE_DATE });
  assert.equal(validateGmiDataset(first.dataset, { layerId: 'layer-m2', referenceDate: REFERENCE_DATE }), v1);
  assert.equal(revalidateGmiEditSession(session, { cache, referenceDate: REFERENCE_DATE }).revised, v1);
  // A different effective state is a new computation; LRU keeps two entries.
  const third = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 3, values: { Merknad: 'x' } }));
  getGmiProposedState(third, { cache });
  assert.equal(cache.stats().computations, 3);
  assert.equal(cache.size(document), 2);
  assert.notEqual(getGmiProposedState(undoGmiEdit(session).session, { cache }), empty, 'evicted entry is recomputed');
  // Explicit invalidation.
  const before = cache.stats().computations;
  cache.invalidate(document);
  assert.equal(cache.size(document), 0);
  const recomputed = getGmiProposedState(session, { cache });
  assert.notEqual(recomputed, first);
  assert.deepEqual(getGmiProposedBytes(recomputed), getGmiProposedBytes(first));
  cache.clear();
  getGmiProposedState(session, { cache });
  assert.equal(cache.stats().computations, before + 2);
  assert.equal(cache.stats().invalidations, 2);
  // Returned bytes are copies; mutating them cannot reach the cached state.
  const bytes = getGmiProposedBytes(recomputed);
  bytes.fill(0);
  assert.notDeepEqual(getGmiProposedBytes(recomputed), bytes);
});

test('the original source document, its bytes and its dataset are never mutated', () => {
  const { bytes, document } = syntheticSession();
  const hash = sha256Hex(bytes);
  const dataset = getGmiDocumentDataset(document);
  const snapshot = JSON.stringify(dataset);
  let session = createGmiEditSession(document);
  session = stage(session, createGmiBatchCorrection(session, { lexeme: '11.0', eligibility: evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr' }) }));
  session = stage(session, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, values: { Material: 'PE80' }, mode: 'overwrite' }));
  session = undoGmiEdit(session).session;
  session = redoGmiEdit(session).session;
  revalidateGmiEditSession(session, { referenceDate: REFERENCE_DATE });
  discardAllGmiEdits(session);
  assert.equal(sha256Hex(getGmiSourceBytes(document)), hash);
  assert.equal(sha256Hex(bytes), hash, 'caller buffer untouched');
  assert.equal(JSON.stringify(getGmiDocumentDataset(document)), snapshot);
  assert.equal(getGmiDocumentDataset(document), dataset);
  assert(Object.isFrozen(session) && Object.isFrozen(session.changeSets));
});

test('every editable M0 fixture: a multi-object session compiles to one verified edit set with an exact diff', async () => {
  const names = (await readdir(GMI_EDIT_FIXTURE_DIR)).filter((name) => name.endsWith('.gmi'));
  let exercised = 0;
  for (const name of names) {
    const bytes = new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, name)));
    const document = createGmiSourceDocument(bytes);
    if (!document.editable) continue;
    let session = createGmiEditSession(document);
    const expected = [];
    for (const [scope, collection] of [['point', 'points'], ['line', 'linesParsed']]) {
      document.parser[collection].forEach((object, sourceIndex) => {
        if (sourceIndex % 2) return;
        const lexemes = Object.entries(object.attributes).map(([field]) => field).filter((field) => field && !isGmiFieldEditReservedColumn(field));
        const field = lexemes.at(-1);
        if (!field) return;
        const cell = getGmiEditCell(session, { scope, sourceIndex, field });
        if (!cell.ok) return;
        const built = createGmiObjectCorrection(session, { scope, sourceIndex, objectId: cell.objectId, guid: cell.guid, values: { [field]: 'M2' }, mode: 'overwrite' });
        assert.equal(built.ok, true, `${name}: ${JSON.stringify(built.rejections)}`);
        session = stage(session, built);
        if (cell.original !== 'M2') expected.push({ scope, sourceIndex, field, original: cell.original, lexeme: 'M2' });
      });
    }
    if (!expected.length) continue;
    exercised++;
    assertProposedExact(session, expected);
    assert.equal(sha256Hex(getGmiSourceBytes(document)), sha256Hex(bytes), name);
  }
  assert(exercised >= 10, `exercised ${exercised} fixtures`);
});

// ------------------------------------------------------- private corpus

const corpusDirectories = (process.env.GMI_EDIT_CORPUS || '').split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);

test('private corpus (M2): eligibility-driven SDR fill + object correction, exact diff, cache, revalidation; files unchanged',
  { skip: corpusDirectories.length ? false : 'set GMI_EDIT_CORPUS to run', timeout: 1800000 }, async () => {
    const files = await discoverGmiFiles(corpusDirectories);
    assert(files.length > 0);
    const before = new Map();
    for (const filename of files) before.set(filename, sha256Hex(await readFile(filename)));
    const seen = new Set();
    const stats = { files: files.length, unique: 0, editable: 0, readOnly: 0, sdrSessions: 0, sdrCells: 0, objectCorrections: 0, exactDiffs: 0, cacheHits: 0, revalidated: 0, failures: {}, maxProposedMs: 0, maxCachedMs: 0 };
    const bump = (key) => { stats.failures[key] = (stats.failures[key] || 0) + 1; };
    for (const filename of files) {
      const bytes = new Uint8Array(await readFile(filename));
      const hash = sha256Hex(bytes);
      if (seen.has(hash)) continue;
      seen.add(hash);
      stats.unique++;
      const document = createGmiSourceDocument(bytes);
      if (!document.editable) { stats.readOnly++; continue; }
      stats.editable++;
      const cache = createGmiProposedCache();
      let session = createGmiEditSession(document, { layerId: 'corpus' });
      const expected = new Map();
      const eligibility = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr', cache });
      if (eligibility.ok && eligibility.eligible.length) {
        const built = createGmiBatchCorrection(session, { lexeme: '11.0', eligibility });
        if (!built.ok) { bump(`sdr-build:${codes(built)}`); continue; }
        session = stageGmiChangeSet(session, built.changeSet).session;
        stats.sdrSessions++; stats.sdrCells += built.changeSet.cells.length;
        for (const cell of built.changeSet.cells) expected.set(cell.key, [cell.scope, cell.sourceIndex, cell.field, cell.original, cell.next]);
      }
      // One object correction on the first editable non-reserved cell.
      outer: for (const [scope, collection] of [['line', 'linesParsed'], ['point', 'points']]) {
        for (let sourceIndex = 0; sourceIndex < document.parser[collection].length; sourceIndex++) {
          for (const field of Object.keys(document.parser[collection][sourceIndex].attributes)) {
            if (!field || isGmiFieldEditReservedColumn(field) || expected.has(JSON.stringify([scope, sourceIndex, field]))) continue;
            const cell = getGmiEditCell(session, { scope, sourceIndex, field });
            if (!cell.ok) continue;
            const built = createGmiObjectCorrection(session, { scope, sourceIndex, objectId: cell.objectId, guid: cell.guid, values: { [field]: cell.original.trim() === '' ? 'M2' : '' }, mode: 'overwrite' });
            if (!built.ok) { bump(`object-build:${codes(built)}`); break outer; }
            session = stageGmiChangeSet(session, built.changeSet).session;
            stats.objectCorrections++;
            const [entry] = built.changeSet.cells;
            expected.set(entry.key, [entry.scope, entry.sourceIndex, entry.field, entry.original, entry.next]);
            break outer;
          }
        }
      }
      let t = performance.now();
      const proposed = getGmiProposedState(session, { cache });
      stats.maxProposedMs = Math.max(stats.maxProposedMs, performance.now() - t);
      if (!proposed.ok) { bump(`proposed:${proposed.stage}`); continue; }
      t = performance.now();
      if (getGmiProposedState(session, { cache }) === proposed) stats.cacheHits++;
      stats.maxCachedMs = Math.max(stats.maxCachedMs, performance.now() - t);
      const diff = diffGmiDatasets(getGmiDocumentDataset(document), proposed.dataset);
      const got = diff.changes.map((change) => JSON.stringify([change.scope, change.sourceIndex, change.field, change.original, change.proposed])).sort();
      const want = [...expected.values()].map((entry) => JSON.stringify(entry)).sort();
      if (diff.structural.length === 0 && JSON.stringify(got) === JSON.stringify(want)) stats.exactDiffs++; else bump('diff');
      const revalidated = revalidateGmiEditSession(session, { cache, referenceDate: REFERENCE_DATE });
      if (revalidated.ok) stats.revalidated++; else bump('revalidate');
      if (sha256Hex(getGmiSourceBytes(document)) !== hash) bump('source-mutated');
    }
    let unchanged = 0;
    for (const filename of files) if (sha256Hex(await readFile(filename)) === before.get(filename)) unchanged++;
    stats.maxProposedMs = Math.round(stats.maxProposedMs);
    stats.maxCachedMs = Math.round(stats.maxCachedMs * 1000) / 1000;
    console.log(`[gmi-edit M2 corpus] ${JSON.stringify(stats)}; unchanged ${unchanged}/${files.length}`);
    assert.equal(unchanged, files.length);
    assert.deepEqual(stats.failures, {});
    assert.equal(stats.exactDiffs, stats.editable);
    assert.equal(stats.cacheHits, stats.editable);
  });
