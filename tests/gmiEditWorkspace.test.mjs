// M4: Rettinger workspace view helpers, object corrections through M2, Data
// Table proposed views, and the lifecycle wiring of layer removal and reset.
//
// Library parts run against the fabricated M0 fixtures and the real M2/M3
// APIs. UI wiring that cannot run in node (page.js, LayerPanel, DataDisplay)
// is checked as a source contract so no caller can silently force a discard.
// Browser behaviour is covered by tests/gmiEditWorkspaceUi.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { register } from 'node:module';
import { prepareValidatorCorrection } from '../src/lib/gmiValidatorEditing.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import {
  GMI_EDIT_LAYER_STATES, GMI_EXPORT_FAILURES, buildGmiFieldExport, createGmiEditSessions, createGmiExportBlob, createGmiObjectCorrection,
  createGmiProposedCache, getGmiExportBytes, listGmiObjectCells, recordGmiExportDownload,
} from '../src/lib/gmi-edit/index.mjs';
import { createLoadedGmiSources, isLoadedGmiSurveyLayer } from '../src/lib/photos/loadedGmiSource.mjs';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { gmiSelectionBinding } from '../src/lib/gmiEditSelection.mjs';
import {
  GMI_EDIT_TABLE_VIEW_BY, GMI_EDIT_TABLE_VIEWS, gmiTableViewAfterStage, gmiTableViewControls, describeGmiEditStatus, describeGmiObject, gmiChangeSetCellViews, gmiChangeSetDependents, gmiEditDownloadState,
  gmiEditFieldPolicy, gmiEditMessage, gmiLexemeSegments, gmiObjectCorrectionLabel, gmiProposedViewForStatus, gmiSkipReasonLabel,
  indexGmiChangedCells, planGmiObjectForm, summarizeGmiEditCounts,
} from '../src/lib/gmiEditView.mjs';

register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');
const { gmiEditSessions } = await import('../src/lib/gmiEditSessions.mjs');
const { photoSession } = await import('../src/lib/photos/photoSession.mjs');

const fixture = async (name) => new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, `${name}.gmi`)));
const CORE = await fixture('core-crlf-latin1');
const MIXED_EOL = await fixture('guard-mixed-eol');
const DATE = new Date('2026-11-09T10:11:12Z');
const source = (file) => readFile(path.resolve(file), 'utf8');

function parse(bytes) {
  const parser = new GMIParser(decodeGmiBytes(bytes));
  const { warningSummary, ...data } = parser.toObject();
  void warningSummary;
  return { parser, data };
}

function harness({ cache = createGmiProposedCache() } = {}) {
  const layers = {};
  const getLayer = (id) => layers[id] ?? null;
  const sources = createLoadedGmiSources({ getLayer });
  const statuses = {};
  const registry = createGmiEditSessions({ sources, getLayer, isGmiLayer: isLoadedGmiSurveyLayer, cache, onChange: (id, status) => { if (status) statuses[id] = status; else delete statuses[id]; } });
  return {
    layers, registry, cache, statuses,
    add(id, bytes, name = `${id}.gmi`) {
      const { parser, data } = parse(bytes);
      layers[id] = { id, name, file: { name, format: 'GMI' }, data };
      sources.register(id, data, new File([bytes], name), createGmiPhotoSource(parser));
      return layers[id];
    },
  };
}

async function open(h, id) {
  const result = await h.registry.open(id);
  assert.equal(result.ok, true, result.code);
  return result.handle;
}

/** The rows the object editor shows for one object (same derivation as GmiObjectEditor). */
function editorRows(registry, handle, scope, sourceIndex) {
  const { document } = registry.resolve(handle);
  return listGmiObjectCells(document, scope, sourceIndex).filter((cell) => cell.field !== '').map((cell) => {
    const policy = gmiEditFieldPolicy(cell);
    const current = policy.editable ? registry.cell(handle, { scope, sourceIndex, field: cell.field }) : null;
    return { field: cell.field, editable: policy.editable && current?.ok, reason: policy.reason, original: current?.ok ? current.original : cell.lexeme,
      proposed: current?.ok ? current.proposed : cell.lexeme, touched: Boolean(current?.touched) };
  });
}

/** Form → review → stage, exactly as the editor does it. */
function correct(registry, handle, { scope, sourceIndex, drafts, allowOverwrite = false, allowReplace = false }) {
  const rows = editorRows(registry, handle, scope, sourceIndex).filter((row) => row.editable);
  const { document, session } = registry.resolve(handle);
  const plan = planGmiObjectForm(rows, drafts, document.encoding.encodingClass);
  const object = (scope === 'line' ? document.parser.linesParsed : document.parser.points)[sourceIndex];
  const built = createGmiObjectCorrection(session, {
    scope, sourceIndex, objectId: object.id, guid: object.guid ?? null, values: plan.values,
    mode: plan.needsOverwrite.length && allowOverwrite ? 'overwrite' : 'fill-missing',
    conflictPolicy: plan.needsReplace.length && allowReplace ? 'replace' : 'skip',
    label: gmiObjectCorrectionLabel(Object.keys(plan.values), scope, sourceIndex, object.id), createdAt: DATE.toISOString(),
  });
  return { plan, built, stage: () => registry.stage(handle, built.changeSet) };
}

// ============================================================ field policy

test('field policy: S_HYPERLINK aliases, identifiers and engine reasons are read-only with a Norwegian reason', () => {
  const editable = { field: 'Material', editable: true, reason: null };
  assert.deepEqual({ ...gmiEditFieldPolicy(editable) }, { editable: true, reason: null });
  for (const field of ['S_HYPERLINK', 's_hyperlink', ' S_HYPERLINK_punkt ']) {
    const policy = gmiEditFieldPolicy({ field, editable: true, reason: null });
    assert.equal(policy.editable, false);
    assert.equal(policy.reason, 'field-owned-by-photo-delivery');
  }
  for (const field of ['GUID', 's_guid', 'LokalId', 'OBJID', 'ID']) assert.equal(gmiEditFieldPolicy({ field, editable: true }).reason, 'identifier-column', field);
  assert.equal(gmiEditFieldPolicy({ field: 'AnleggsID', editable: true }).editable, true, 'business attributes stay editable');
  for (const reason of ['object-not-editable', 'duplicate-field-name', 'no-value', 'document-not-editable']) {
    const policy = gmiEditFieldPolicy({ field: 'Merknad', editable: false, reason });
    assert.equal(policy.reason, reason);
    assert.notEqual(gmiEditMessage(reason, null), null, reason);
  }
  assert.equal(gmiEditFieldPolicy(null).reason, 'field-absent');
});

test('messages: every export failure, open failure and skip reason has Norwegian text; raw codes never leak', () => {
  for (const code of [...GMI_EXPORT_FAILURES, 'unsupported-layer', 'source-unavailable', 'layer-data-mismatch', 'stale-change-set', 'unsaved-changes', 'export-stale']) {
    const text = gmiEditMessage(code, null);
    assert.equal(typeof text, 'string', code);
    assert.equal(text.includes(code), false);
  }
  assert.equal(gmiEditMessage('Error: boom'), 'Handlingen kunne ikke fullføres.');
  for (const reason of ['conflict', 'populated', 'object-not-editable']) assert.notEqual(gmiSkipReasonLabel(reason), 'Hoppet over');
  for (const state of Object.values(GMI_EDIT_LAYER_STATES)) {
    const view = describeGmiEditStatus({ state, reasons: ['mixed-eol'], error: 'loaded-gmi-unreadable', discardedChangeSets: 2, discardedUnsaved: true });
    assert.equal(typeof view.label, 'string');
    assert.equal(view.editable, state === 'editable');
  }
  assert.match(describeGmiEditStatus({ state: 'invalidated', discardedChangeSets: 2, discardedUnsaved: true }).message, /2 rettinger ble forkastet uten å være lastet ned/);
  assert.match(describeGmiEditStatus({ state: 'read-only', reasons: ['mixed-eol'] }).message, /blandede linjeskift/);
});

test('form plan: several fields, explicit overwrite/replace needs, exact whitespace and refused lexemes', () => {
  const rows = [
    { field: 'Material', original: 'PE', proposed: 'PE', touched: false },
    { field: 'SDR', original: '', proposed: '', touched: false },
    { field: 'Merknad', original: 'x', proposed: 'y', touched: true },
    { field: 'Dimensjon', original: '110', proposed: '110', touched: false },
  ];
  const plan = planGmiObjectForm(rows, { Material: 'PE100', SDR: ' 11.0 ', Merknad: 'y', Dimensjon: '110' }, 'single-byte');
  assert.deepEqual({ ...plan.values }, { Material: 'PE100', SDR: ' 11.0 ' }, 'unchanged drafts are not requests; whitespace is kept exactly');
  assert.deepEqual([...plan.needsOverwrite], ['Material']);
  assert.deepEqual([...plan.needsReplace], []);
  assert.equal(plan.valid, true);
  const replace = planGmiObjectForm(rows, { Merknad: 'z' }, 'single-byte');
  assert.deepEqual([...replace.needsReplace], ['Merknad']);
  assert.deepEqual([...replace.needsOverwrite], ['Merknad']);
  for (const [value, pattern] of [['a;b', /Semikolon/], ['a\tb', /kontrolltegn/], ['5 €', /«€»/], ['å'.normalize('NFD'), /flere deler/]]) {
    const bad = planGmiObjectForm(rows, { Material: value }, 'single-byte');
    assert.equal(bad.valid, false);
    assert.match(bad.problems.Material, pattern);
  }
  assert.match(planGmiObjectForm(rows, { Material: 'Rør' }, 'utf8-likely').problems.Material, /UTF-8/);
  assert.equal(planGmiObjectForm(rows, {}, 'ascii').valid, false, 'nothing edited');
  assert.deepEqual(gmiLexemeSegments(' 11.0  '), [{ text: ' ', whitespace: true }, { text: '11.0', whitespace: false }, { text: '  ', whitespace: true }]);
  assert.deepEqual(gmiLexemeSegments(''), []);
  assert.equal(describeGmiObject('line', 1, 2), 'Ledning 2');
  assert.equal(describeGmiObject('point', 4, null), 'Punkt nr. 5 i filen');
});

// ===================================================== M2 integration

test('object editor flow: inspect originals, edit several fields, explicit overwrite, review, stage, return to proposed values', async () => {
  const h = harness();
  h.add('a', CORE);
  const handle = await open(h, 'a');
  const before = editorRows(h.registry, handle, 'line', 1);
  const byField = Object.fromEntries(before.map((row) => [row.field, row]));
  assert.equal(byField.SDR.original, '');
  assert.equal(byField.Material.original, 'PE');
  assert.equal(byField.S_HYPERLINK.editable, false);
  assert.equal(byField.S_HYPERLINK.reason, 'field-owned-by-photo-delivery');

  // Populated Material without the explicit overwrite choice: M2 skips it (fill-missing default), SDR is applied.
  const unconfirmed = correct(h.registry, handle, { scope: 'line', sourceIndex: 1, drafts: { SDR: '11.0', Material: 'PE100' } });
  assert.deepEqual([...unconfirmed.plan.needsOverwrite], ['Material']);
  assert.deepEqual(unconfirmed.built.changeSet.cells.map((cell) => cell.field), ['SDR']);
  assert.deepEqual(unconfirmed.built.changeSet.skipped.map((cell) => [cell.field, cell.reason]), [['Material', 'populated']]);

  // With the explicit choice: both fields in one ChangeSet, populated overwrite flagged for review.
  const confirmed = correct(h.registry, handle, { scope: 'line', sourceIndex: 1, drafts: { SDR: '11.0', Material: 'PE100' }, allowOverwrite: true });
  assert.equal(confirmed.built.changeSet.label, 'Material, SDR · Ledning 2');
  assert.deepEqual(confirmed.built.changeSet.cells.map((cell) => [cell.field, cell.previous, cell.next, cell.overwritesPopulated]),
    [['Material', 'PE', 'PE100', true], ['SDR', '', '11.0', false]]);
  // The unconfirmed set was built on the same state but never staged; staging the reviewed one works.
  const staged = confirmed.stage();
  assert.equal(staged.ok, true);
  assert.equal(staged.status.changeSetCount, 1);
  assert.equal(unconfirmed.stage().code, 'stale-change-set', 'a review built on an older state cannot be staged');

  // Returning to the object shows the current proposals, not the originals.
  const after = Object.fromEntries(editorRows(h.registry, handle, 'line', 1).map((row) => [row.field, row]));
  assert.equal(after.Material.proposed, 'PE100');
  assert.equal(after.Material.original, 'PE');
  assert.equal(after.Material.touched, true);
  // Editing it again needs the explicit replace choice.
  const again = correct(h.registry, handle, { scope: 'line', sourceIndex: 1, drafts: { Material: 'PE80' }, allowOverwrite: true });
  assert.deepEqual(again.built.changeSet.skipped.map((cell) => cell.reason), ['conflict']);
  const replaced = correct(h.registry, handle, { scope: 'line', sourceIndex: 1, drafts: { Material: 'PE80' }, allowOverwrite: true, allowReplace: true });
  assert.equal(replaced.built.changeSet.cells[0].overwrote.changeSetId, 'cs-2');

  // The imported layer data is untouched.
  assert.equal(h.layers.a.data.lines[1].attributes.Material, 'PE');
  assert.equal(h.layers.a.data.lines[1].attributes.SDR, null);
});

test('prohibited and structurally unsafe edits are refused by the engine even if a caller bypasses the UI', async () => {
  const h = harness();
  h.add('a', CORE);
  const handle = await open(h, 'a');
  const { session } = h.registry.getSession(handle);
  const codes = (values) => createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 1, values, mode: 'overwrite' }).rejections?.map((entry) => entry.code);
  assert.deepEqual(codes({ S_HYPERLINK: '' }), ['field-owned-by-photo-delivery']);
  assert.deepEqual(codes({ NyKolonne: 'x' }), ['field-absent']);
  assert.deepEqual(codes({ Merknad: 'a;b' }), ['lexeme-semicolon']);
  assert.deepEqual(createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 1, objectId: 99, values: { SDR: '11.0' } }).rejections.map((entry) => entry.code), ['object-identity-mismatch']);
  h.add('ro', MIXED_EOL);
  const ro = await open(h, 'ro');
  assert.equal(h.statuses.ro.state, 'read-only');
  const rows = editorRows(h.registry, ro, 'line', 0);
  assert(rows.length > 0 && rows.every((row) => !row.editable), 'read-only documents are inspectable, never editable');
  assert(rows.filter((row) => row.field !== 'S_HYPERLINK').every((row) => row.reason === 'document-not-editable'));
});

test('change list: dependents warn about later corrections on the same object; nothing is removed automatically', async () => {
  const h = harness();
  h.add('a', CORE);
  const handle = await open(h, 'a');
  correct(h.registry, handle, { scope: 'line', sourceIndex: 2, drafts: { Material: 'PE' }, allowOverwrite: true }).stage();      // cs-1 Material
  correct(h.registry, handle, { scope: 'point', sourceIndex: 1, drafts: { Kumform: 'R' } }).stage();                              // cs-2 other object
  correct(h.registry, handle, { scope: 'line', sourceIndex: 2, drafts: { SDR: '11.0' } }).stage();                                // cs-3 SDR, same object
  const { changeSets } = h.registry.inspect(handle);
  assert.deepEqual(changeSets.map((changeSet) => changeSet.id), ['cs-1', 'cs-2', 'cs-3']);
  const dependents = gmiChangeSetDependents(changeSets, 'cs-1');
  assert.deepEqual(dependents.map((entry) => [entry.id, [...entry.reasons]]), [['cs-3', ['same-object']]]);
  assert.deepEqual(gmiChangeSetDependents(changeSets, 'cs-2'), []);
  assert.deepEqual(gmiChangeSetDependents(changeSets, 'cs-3'), []);
  const discarded = h.registry.discard(handle, 'cs-1');
  assert.equal(discarded.ok, true);
  assert.deepEqual(h.registry.inspect(handle).changeSets.map((changeSet) => changeSet.id), ['cs-2', 'cs-3'], 'later sets are kept');
  // Superseded cells are marked in the list.
  correct(h.registry, handle, { scope: 'point', sourceIndex: 1, drafts: { Kumform: 'K' }, allowReplace: true }).stage();
  const inspected = h.registry.inspect(handle);
  const effective = new Map([...inspected.cells.changed, ...inspected.cells.reverted].map((cell) => [cell.key, cell]));
  assert.equal(gmiChangeSetCellViews(inspected.changeSets[0], effective)[0].superseded, true);
  assert.equal(gmiChangeSetCellViews(inspected.changeSets.at(-1), effective)[0].superseded, false);
  // Undo / redo / discard all through the registry.
  assert.equal(h.registry.undo(handle).ok, true);
  assert.equal(h.statuses.a.canRedo, true);
  assert.equal(h.registry.redo(handle).ok, true);
  assert.equal(h.registry.discardAll(handle).ok, true);
  assert.equal(h.statuses.a.changeSetCount, 0);
  assert.equal(h.statuses.a.unsaved, false);
});

test('Data Table proposed view: verified once per published revision, exact changed cells, correct object identity', async () => {
  const cache = createGmiProposedCache();
  const h = harness({ cache });
  h.add('a', CORE);
  const handle = await open(h, 'a');
  const empty = gmiProposedViewForStatus(h.registry, h.statuses.a);
  assert.equal(empty.ok, true);
  assert.equal(empty.identical, true);
  assert.equal(empty.changed.byKey.size, 0);
  correct(h.registry, handle, { scope: 'line', sourceIndex: 1, drafts: { SDR: '11.0', Merknad: 'Rettet å' }, allowOverwrite: true }).stage();
  const status = h.statuses.a;
  const computations = cache.stats().computations;
  const view = gmiProposedViewForStatus(h.registry, status);
  assert.equal(cache.stats().computations, computations + 1, 'one verified M1 run for the new revision');
  for (let i = 0; i < 25; i++) assert.strictEqual(gmiProposedViewForStatus(h.registry, status), view, 'renders reuse the revision view');
  assert.equal(cache.stats().computations, computations + 1);
  assert.deepEqual([...view.changed.byObject.keys()], ['line:1']);
  assert.deepEqual([...view.changed.byObject.get('line:1').keys()], ['SDR', 'Merknad']);
  // Proposed rows keep the original order and identity (table index = parser source index).
  assert.equal(view.dataset.lines.length, h.layers.a.data.lines.length);
  view.dataset.lines.forEach((line, index) => {
    assert.equal(line.id, h.layers.a.data.lines[index].id);
    assert.equal(line.guid, h.layers.a.data.lines[index].guid);
  });
  assert.equal(view.dataset.lines[1].attributes.SDR, 11);
  assert.equal(view.dataset.lines[1].attributes.Merknad, 'Rettet å');
  assert.equal(h.layers.a.data.lines[1].attributes.SDR, null, 'Original mode data is the imported layer data');
  assert.equal(gmiProposedViewForStatus(h.registry, null), null);
  assert.equal(gmiProposedViewForStatus(h.registry, { state: 'unavailable' }), null);
  assert.equal(indexGmiChangedCells([]).byKey.size, 0);
  assert.equal(GMI_EDIT_TABLE_VIEWS.CHANGED, 'changed');
});

test('download: payload bytes equal the Blob, unrelated bytes are preserved, unchanged export is byte-identical', async () => {
  const h = harness();
  h.add('a', CORE, 'Leveranse.gmi');
  const handle = await open(h, 'a');
  const unchanged = await buildGmiFieldExport(h.registry, handle, { date: DATE });
  assert.equal(unchanged.ok, true);
  assert.deepEqual(getGmiExportBytes(unchanged), CORE);
  assert.equal(summarizeGmiEditCounts(h.statuses.a), null);
  correct(h.registry, handle, { scope: 'line', sourceIndex: 1, drafts: { SDR: '11.0', Material: 'PE100' }, allowOverwrite: true }).stage();
  assert.equal(gmiEditDownloadState(h.statuses.a), 'unsaved');
  assert.equal(summarizeGmiEditCounts(h.statuses.a), '1 retting · 2 felt i 1 objekt');
  const payload = await buildGmiFieldExport(h.registry, handle, { date: DATE, label: 'Rettinger' });
  assert.equal(payload.filename, '20261109-111112-Rettinger.gmi');
  const blobBytes = new Uint8Array(await createGmiExportBlob(payload).arrayBuffer());
  assert.deepEqual(blobBytes, getGmiExportBytes(payload));
  const oracle = verifyCellChanges(loadGmiDocument(CORE), blobBytes, [
    { scope: 'line', sourceIndex: 1, field: 'Material', lexeme: 'PE100' }, { scope: 'line', sourceIndex: 1, field: 'SDR', lexeme: '11.0' }]);
  assert.deepEqual(oracle.failures, []);
  assert.equal(recordGmiExportDownload(h.registry, payload).ok, true);
  assert.equal(gmiEditDownloadState(h.statuses.a), 'downloaded');
  // A new edit makes it unsaved again; recording the old payload is refused (stale revision).
  correct(h.registry, handle, { scope: 'point', sourceIndex: 1, drafts: { Kumform: 'R' } }).stage();
  assert.equal(recordGmiExportDownload(h.registry, payload).code, 'export-stale');
  assert.equal(gmiEditDownloadState(h.statuses.a), 'unsaved');
});

// ===================================================== store lifecycle

async function addStoreLayer(bytes, name = 'Synthetic edit.gmi') {
  const file = new File([bytes], name);
  const { parser, data } = parse(new Uint8Array(await file.arrayBuffer()));
  const id = useStore.getState().addLayer({ file: { name, format: 'GMI' }, data, sourceInput: { file, evidence: createGmiPhotoSource(parser) } });
  return { id, data };
}
const resetStore = () => useStore.getState().resetAll({ discardGmiEdits: true });

// H1 only prepares the host plumbing. H2 will publish selectionContext from Validator requests.
function publishSelectionInspection(id, key, geometryScope = 'line') {
  const state = useStore.getState();
  useStore.setState({ objectTableInspection: Object.freeze({ kind: 'contextual-object-set', layerId: id, geometryScope,
    selectionContext: Object.freeze({ key }), activeView: 'focus', context: { source: 'validation-v2-field' } }),
    ui: { ...state.ui, layerDataTable: { ...state.ui.layerDataTable, layerId: id, isOpen: true } } });
}

test('H1 store host writes use the live inspection and binding; host changes replace membership', async (t) => {
  resetStore(); t.after(resetStore);
  const { id } = await addStoreLayer(CORE), store = () => useStore.getState();
  await gmiEditSessions.open(id);
  const binding = gmiSelectionBinding(id, gmiEditSessions.describe(id));
  const host = { kind: 'inspection', key: `${id}|line|sdr` };
  const add = (key, owner = host, expected = binding, scope = 'line') => store().changeGmiEditSelection(id, { type: 'add', scope, keys: [key] }, expected, owner);
  add('line:1'); assert.equal(store().gmiEditSelection, null, 'no open host');
  publishSelectionInspection(id, host.key);
  add('line:1', { ...host, key: 'other' }); assert.equal(store().gmiEditSelection, null);
  add('line:1', host, { ...binding, sessionId: 'stale' }); assert.equal(store().gmiEditSelection, null);
  add('point:0', host, binding, 'point'); assert.equal(store().gmiEditSelection, null, 'inspection geometry must match');
  add('line:1');
  const inspected = store().gmiEditSelection;
  assert.deepEqual(inspected.keys, ['line:1']); assert.deepEqual(inspected.host, host);
  store().setObjectTableInspectionView('scope');
  publishSelectionInspection(id, host.key);
  assert.equal(store().gmiEditSelection, inspected, 'scope and same-field diagnostic replacement retain the snapshot');
  store().openGmiEditWorkspace(id);
  store().changeGmiEditSelection(id, { type: 'add', scope: 'line', keys: ['line:0'] }, binding);
  assert.deepEqual(store().gmiEditSelection.keys, ['line:0']);
  assert.equal(store().gmiEditSelection.host.kind, 'rettinger');
  add('line:1'); assert.deepEqual(store().gmiEditSelection.keys, ['line:1']);
  publishSelectionInspection(id, `${id}|line|material`);
  assert.equal(store().gmiEditSelection, null, 'another field invalidates even with Rettinger open');
  add('line:2'); assert.equal(store().gmiEditSelection, null, 'old-host events cannot recreate it');
});

test('H1 store invalidates inspection selections on every host/source/session exit', async (t) => {
  resetStore(); t.after(resetStore);
  const transitions = {
    'table close': () => useStore.getState().closeLayerDataTable(),
    'Validator table close': () => useStore.getState().closeValidatorOwnedObjectTable(),
    'ordinary table open': (id) => useStore.getState().openLayerDataTable(id),
    'table hidden with inspection retained': () => useStore.setState((state) => ({ ui: { ...state.ui, layerDataTable: { ...state.ui.layerDataTable, isOpen: false } } })),
    'table moved to another layer': () => useStore.setState((state) => ({ ui: { ...state.ui, layerDataTable: { ...state.ui.layerDataTable, layerId: 'other' } } })),
    'inspection layer changed': (id, host) => publishSelectionInspection('other', host.key),
    'inspection geometry changed': (id, host) => publishSelectionInspection(id, host.key, 'point'),
    'session replaced': async (id) => { assert.equal(gmiEditSessions.dispose(id).ok, true); await gmiEditSessions.open(id); },
    'source data replaced': (id) => useStore.setState((state) => ({ layers: { ...state.layers, [id]: { ...state.layers[id], data: parse(CORE).data } } })),
    'layer removed': (id) => useStore.getState().removeLayer(id),
    'reset': () => resetStore(),
  };
  for (const [name, transition] of Object.entries(transitions)) {
    resetStore();
    const { id } = await addStoreLayer(CORE);
    await gmiEditSessions.open(id);
    const binding = gmiSelectionBinding(id, gmiEditSessions.describe(id)), host = { kind: 'inspection', key: `${id}|line|sdr` };
    publishSelectionInspection(id, host.key);
    useStore.getState().changeGmiEditSelection(id, { type: 'add', scope: 'line', keys: ['line:1'] }, binding, host);
    assert(useStore.getState().gmiEditSelection, name);
    await transition(id, host);
    assert.equal(useStore.getState().gmiEditSelection, null, name);
    useStore.getState().changeGmiEditSelection(id, { type: 'add', scope: 'line', keys: ['line:2'] }, binding, host);
    assert.equal(useStore.getState().gmiEditSelection, null, `${name}: stale events refused`);
  }
});

test('U4 view controls hide ordinary empty sessions, disable proposed modes in Rettinger and respect inspections', () => {
  const status = { state: 'editable', changeSetCount: 0 };
  const ordinary = gmiTableViewControls({ status, view: 'changed' });
  assert.equal(ordinary.visible, false); assert.equal(ordinary.effectiveView, 'original');
  const workspace = gmiTableViewControls({ status, view: 'proposed', inRettinger: true });
  assert.equal(workspace.visible, true); assert.equal(workspace.effectiveView, 'original');
  assert.deepEqual(workspace.modes.map(({ key, disabled }) => [key, disabled]), [['original', false], ['proposed', true], ['changed', true]]);
  for (const mode of workspace.modes.slice(1)) assert.match(mode.description, /Legg til en retting/);
  for (const state of ['editable', 'read-only']) {
    for (const view of Object.values(GMI_EDIT_TABLE_VIEWS)) {
      const controls = gmiTableViewControls({ status: { state, changeSetCount: 2 }, view });
      assert.equal(controls.visible, true); assert.equal(controls.effectiveView, view);
      assert(controls.modes.every((mode) => !mode.disabled));
    }
  }
  for (const state of [undefined, 'loading', 'unavailable', 'invalidated', 'error', 'unsupported']) {
    const controls = gmiTableViewControls({ status: { state, changeSetCount: 2 }, view: 'changed', inRettinger: true });
    assert.equal(controls.visible, false); assert.equal(controls.effectiveView, 'original');
  }
  assert.equal(gmiTableViewControls({ status: { ...status, changeSetCount: 1 }, view: 'proposed', inRettinger: true, isInspection: true }).visible, false);
});

test('U4 history derives Original at zero without changing stored view or intent; redo restores every choice', async (t) => {
  resetStore(); t.after(resetStore);
  const { id } = await addStoreLayer(CORE), store = () => useStore.getState();
  const { handle } = await gmiEditSessions.open(id), { session } = gmiEditSessions.getSession(handle);
  const built = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 1, values: { SDR: '11.0' } });
  assert.equal(gmiEditSessions.stage(handle, built.changeSet).ok, true);
  const controls = () => gmiTableViewControls({ status: store().gmiEditStatus[id], view: store().gmiEditTableView[id], inRettinger: true });
  for (const by of ['auto', 'user']) for (const view of ['original', 'proposed', 'changed']) {
    store().setGmiEditTableView(id, view, { by });
    const preference = store().gmiEditTableView, intent = store().gmiEditTableViewBy;
    assert.equal(controls().effectiveView, view);
    assert.equal(gmiEditSessions.undo(handle).ok, true);
    assert.equal(controls().effectiveView, 'original');
    assert.equal(store().gmiEditTableView, preference); assert.equal(store().gmiEditTableViewBy, intent);
    assert.equal(gmiEditSessions.redo(handle).ok, true);
    assert.equal(controls().effectiveView, view);
    assert.equal(store().gmiEditTableView, preference); assert.equal(store().gmiEditTableViewBy, intent);
  }
  store().setGmiEditTableView(id, 'changed');
  assert.equal(gmiEditSessions.undo(handle).ok, true);
  store().setGmiEditTableView(id, 'original');
  assert.equal(gmiEditSessions.redo(handle).ok, true);
  assert.equal(controls().effectiveView, 'original', 'explicit Original during the empty state supersedes the earlier preference');
});

test('store: Rettinger view state is not persisted, follows layer removal and reset, and a refused reset changes nothing', async (t) => {
  resetStore(); t.after(resetStore);
  const { id } = await addStoreLayer(CORE);
  const { id: other } = await addStoreLayer(CORE, 'Other.gmi');
  useStore.getState().openGmiEditWorkspace(id);
  useStore.getState().setGmiEditTableView(id, 'proposed');
  useStore.getState().setGmiEditTableView(other, 'changed');
  assert.deepEqual(useStore.getState().gmiEditWorkspace, { layerId: id });
  assert.equal(useStore.getState().ui.fieldValidationOpen, false);
  const handle = (await gmiEditSessions.open(id)).handle;
  const { session } = gmiEditSessions.getSession(handle);
  gmiEditSessions.stage(handle, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 1, values: { SDR: '11.0' } }).changeSet);

  const before = useStore.getState(), photoBefore = photoSession.getSnapshot();
  assert.equal(before.resetAll().code, 'gmi-edits-pending');
  assert.equal(before.removeLayer(id).code, 'gmi-edits-pending');
  const after = useStore.getState();
  for (const key of ['layers', 'layerOrder', 'ui', 'gmiEditWorkspace', 'gmiEditTableView', 'gmiEditStatus', 'objectTableInspection']) assert.strictEqual(after[key], before[key], key);
  assert.strictEqual(photoSession.getSnapshot(), photoBefore, 'FOTO session untouched by a refused reset');

  useStore.getState().removeLayer(other);
  assert.deepEqual(Object.keys(useStore.getState().gmiEditTableView), [id], 'removed layer view state dropped');
  useStore.getState().requestGmiEditObject(id, 'line', 1);
  const request = useStore.getState().gmiEditObjectRequest;
  useStore.getState().clearGmiEditObjectRequest({ ...request });
  assert.strictEqual(useStore.getState().gmiEditObjectRequest, request, 'only the handled request is cleared');
  assert.equal(useStore.getState().removeLayer(id, { discardGmiEdits: true }).ok, true);
  assert.equal(useStore.getState().gmiEditWorkspace, null);
  assert.equal(useStore.getState().gmiEditObjectRequest, null);

  const persisted = await source('src/lib/store.js');
  const partialize = persisted.slice(persisted.indexOf('partialize:'), persisted.indexOf('migrate:'));
  assert.equal(/gmiEdit/.test(partialize), false);
});

test('callers: removal and reset inspect the result; discarding is only reachable after an explicit confirmation', async () => {
  const page = await source('src/app/page.js');
  const reset = page.slice(page.indexOf('const handleReset = ('), page.indexOf('const openAppInfo'));
  const block = reset.indexOf('gmiEditRemovalBlock(null');
  assert(block > 0, 'reset asks for the GMI decision');
  for (const cleanup of ['setPhotoImport(null)', 'endPhotoEditSession()', "dispatchPhotoWorkspace({ type: 'exit' })", 'closeDataInspector()', 'resetAll(']) {
    assert(reset.indexOf(cleanup) > block, `${cleanup} runs only after the GMI decision`);
  }
  assert.match(reset, /if \(blocked\) \{ setResetConfirm\(\{ layers: blocked\.layers \}\); return; \}/);
  assert.match(page, /onConfirm=\{\(\) => handleReset\(\{ discardGmiEdits: true \}\)\}/);
  assert.equal((page.match(/discardGmiEdits: true/g) || []).length, 1, 'one confirmed discard path in the page');

  const panel = await source('src/components/LayerPanel.js');
  assert.match(panel, /removeLayer\(layerId, removeWarning \? \{ discardGmiEdits: true \} : undefined\)/);
  assert.match(panel, /result\.code === 'gmi-edits-pending'\) \{ setRemoveWarning\(result\.layers\); return; \}/);
  assert.equal((await source('src/components/DataDisplay.js')).includes('discardGmiEdits'), false, 'the legacy reset never forces a discard');

  // No other production caller may pass discardGmiEdits.
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(m?js|jsx)$/.test(entry.name)) files.push(full);
    }
  };
  await walk(path.resolve('src'));
  const callers = [];
  const code = (text) => text.split('\n').filter((line) => !/^\s*(\/\/|\*)/.test(line)).join('\n');
  for (const file of files) if (code(await readFile(file, 'utf8')).includes('discardGmiEdits: true')) callers.push(path.relative(path.resolve('.'), file).replaceAll('\\', '/'));
  assert.deepEqual(callers.sort(), ['src/app/page.js', 'src/components/LayerPanel.js']);
});


test('M5C store navigation retains sessions and staged edits; proposed inspections reject other layers and history revisions', async (t) => {
  resetStore(); t.after(resetStore);
  const { id, data } = await addStoreLayer(CORE);
  const { id: other } = await addStoreLayer(CORE, 'Other validator layer.gmi');
  const { handle } = await gmiEditSessions.open(id);
  const initial = gmiEditSessions.getSession(handle).session;
  const correction = createGmiObjectCorrection(initial, { scope: 'line', sourceIndex: 1, values: { SDR: '11.0' } });
  assert.equal(gmiEditSessions.stage(handle, correction.changeSet).ok, true);
  const session = gmiEditSessions.getSession(handle).session;
  const validation = gmiEditSessions.revalidate(handle, { referenceDate: '2026-11-09' });
  useStore.getState().openGmiValidator(id, 'proposed', 'innmaling.line.sdr.valid', 'line');
  assert.equal(useStore.getState().gmiValidatorDatasets[id], 'proposed');
  assert.equal(useStore.getState().gmiValidatorDatasets[other], undefined, 'other layers still default to Original');
  const request = { ok: true, layerId: id, session, sessionId: handle.sessionId, fingerprint: session.document.fingerprint, ruleId: 'innmaling.line.sdr.valid', canonicalFieldId: 'sdr', targets: [{ scope: 'line', sourceIndex: 1 }] };
  useStore.getState().openGmiEditWorkspace(id, request);
  assert.equal(useStore.getState().gmiEditWorkspace.correction, request);
  assert.equal(gmiEditSessions.getSession(handle).session, session);
  assert.equal(session.changeSets.length, 1);
  assert.equal(data.lines[1].attributes.SDR, null);
  const { createObjectRef } = await import('../src/lib/validation-v2/objectRef.js');
  const datasetRevision = validation.revised.datasetRevision;
  const inspection = { scope: { kind: 'exact-object-set', layerId: id, datasetRevision, geometryScope: 'line',
    objectRefs: [createObjectRef({ layerId: id, datasetRevision, geometryScope: 'line', objectIndex: 1 })] },
    editBasis: { layerId: id, session, datasetRevision }, context: { title: 'Foreslaatt SDR', source: 'validation-v2-diagnostic' } };
  assert.equal(useStore.getState().openObjectTable(inspection), true);
  assert.equal(useStore.getState().objectTableInspection.editBasis.session, session);
  assert.equal(useStore.getState().openObjectTable({ ...inspection, editBasis: { ...inspection.editBasis, layerId: other } }), false);
  assert.equal(gmiEditSessions.undo(handle).ok, true);
  assert.equal(useStore.getState().openObjectTable(inspection), false, 'no stale proposed object table');
  useStore.getState().removeLayer(id, { discardGmiEdits: true });
  assert.equal(useStore.getState().gmiValidatorDatasets[id], undefined);
  assert.equal(useStore.getState().gmiValidatorFocus, null);
  useStore.getState().setGmiValidatorDataset(other, 'proposed');
  resetStore();
  assert.deepEqual(useStore.getState().gmiValidatorDatasets, {});
});


test('S5 view intent: staging turns an automatic Original into Foreslått and keeps an explicit choice', () => {
  const { ORIGINAL, PROPOSED, CHANGED } = GMI_EDIT_TABLE_VIEWS, { USER, AUTO } = GMI_EDIT_TABLE_VIEW_BY;
  assert.equal(gmiTableViewAfterStage(undefined, undefined), PROPOSED, 'unset view defaults to Original and is automatic');
  assert.equal(gmiTableViewAfterStage(ORIGINAL, undefined), PROPOSED);
  assert.equal(gmiTableViewAfterStage(ORIGINAL, AUTO), PROPOSED, 'handoff Original');
  assert.equal(gmiTableViewAfterStage(ORIGINAL, USER), ORIGINAL, 'explicit Original is respected');
  for (const by of [USER, AUTO, undefined]) {
    assert.equal(gmiTableViewAfterStage(PROPOSED, by), PROPOSED);
    assert.equal(gmiTableViewAfterStage(CHANGED, by), CHANGED, 'Kun endrede is never replaced');
  }
});

test('S5 store: the view switch after staging respects user choices, exact inspections, layer removal and reset', async (t) => {
  resetStore(); t.after(() => { useStore.setState({ objectTableInspection: null }); resetStore(); });
  const { id } = await addStoreLayer(CORE);
  const { id: other } = await addStoreLayer(CORE, 'Other.gmi');
  const store = () => useStore.getState();
  store().openGmiEditWorkspace(id);
  // First stage, nothing chosen yet: automatic switch.
  store().showGmiEditProposedAfterStage(id);
  assert.equal(store().gmiEditTableView[id], 'proposed');
  assert.equal(store().gmiEditTableViewBy[id], 'auto');
  // Toolbar choices default to `user`; an explicit Original survives later stages.
  store().setGmiEditTableView(id, 'original');
  assert.equal(store().gmiEditTableViewBy[id], 'user');
  const chosen = store().gmiEditTableView;
  store().showGmiEditProposedAfterStage(id); store().showGmiEditProposedAfterStage(id);
  assert.strictEqual(store().gmiEditTableView, chosen, 'explicit Original kept through repeated stages');
  store().setGmiEditTableView(id, 'changed');
  store().showGmiEditProposedAfterStage(id);
  assert.equal(store().gmiEditTableView[id], 'changed');
  // An automatic Original (workspace) switches again; the other layer is untouched.
  store().setGmiEditTableView(id, 'original', { by: 'auto' });
  store().showGmiEditProposedAfterStage(id);
  assert.equal(store().gmiEditTableView[id], 'proposed');
  assert.equal(store().gmiEditTableView[other], undefined);
  // Exact Validator inspections have no view modes: nothing is rewritten.
  store().setGmiEditTableView(id, 'original', { by: 'auto' });
  for (const kind of ['exact-object-set', 'contextual-object-set']) {
    useStore.setState({ objectTableInspection: { kind } });
    const before = store();
    store().showGmiEditProposedAfterStage(id);
    assert.strictEqual(store().gmiEditTableView, before.gmiEditTableView, kind);
    assert.strictEqual(store().gmiEditTableViewBy, before.gmiEditTableViewBy, kind);
  }
  useStore.setState({ objectTableInspection: null });
  store().setGmiEditTableView(other, 'original');
  store().removeLayer(other);
  assert.deepEqual(Object.keys(store().gmiEditTableViewBy), [id], 'removed layer intent dropped');
  resetStore();
  assert.deepEqual(store().gmiEditTableViewBy, {});
});

test('S5 wiring: object and batch staging switch the view; column focus starts at Felt and survives the ChangeSet handover', async () => {
  const workspace = await source('src/components/gmi-edit/GmiEditWorkspace.js');
  assert.match(workspace, /const showStagedResult = \(\) => useStore\.getState\(\)\.showGmiEditProposedAfterStage\(layerId\);/);
  assert.match(workspace, /<GmiObjectEditor [\s\S]*?onStaged=\{showStagedResult\}/);
  assert.match(workspace, /onStaged=\{\(changeSet\) => \{ setTab\('changes'\); setActiveChangeSetId\(changeSet\.id\); setNotice\(null\); showStagedResult\(\); \}\}/);
  // «Vis i Foreslått» and the toolbar are explicit choices (default `by`).
  assert.match(workspace, /setGmiEditTableView\(layerId, GMI_EDIT_TABLE_VIEWS\.PROPOSED\);/);
  const table = await source('src/components/LayerDataTable.js');
  assert.match(table, /onClick=\{\(\) => setGmiEditTableView\(layerId, mode\.key\)\}/);
  assert.match(table, /columnFocusOff !== columnFocusSignature/);
  assert.doesNotMatch(table, /columnFocusOff !== columnFocus\.key|setColumnFocusOff\(columnFocus\.key\)/, 'off choice is not keyed on batch:/change-set:');
  const inspector = await source('src/components/gmi-edit/GmiBatchInspector.js');
  // Choosing a field alone never makes the inspector dirty.
  assert.match(inspector, /const dirty = Boolean\(lexeme \|\| review \|\| mode !== 'fill-missing'\);/);
  assert.match(inspector, /setField\(event\.target\.value\); setFocusChoice\(event\.target\.value\);/);
  assert.match(inspector, /if \(!focusField \|\| stagedFocusOwner\) return undefined;/);
  const detail = await source('src/components/gmi-edit/GmiChangeSetDetail.js');
  assert.match(detail, /if \(variant === 'staged'\) successRef\.current\?\.focus\(\);/);
  assert.match(await source('src/components/gmi-edit/GmiObjectEditor.js'), /ref=\{messageRef\} tabIndex=\{-1\}/);
});

test('R5 store handoff is atomic behind the draft guard and rechecks source/session before accepting', async (t) => {
  resetStore(); t.after(() => { useStore.setState({ gmiEditWorkspaceGuard: null }); resetStore(); });
  const { id } = await addStoreLayer(gmiEditBatchFixture());
  const { handle } = await gmiEditSessions.open(id);
  const session = gmiEditSessions.getSession(handle).session;
  const run = gmiEditSessions.revalidate(handle, { referenceDate: '2026-11-09' }).original;
  const request = { ...prepareValidatorCorrection(session, run, ['innmaling.line.sdr.valid']), sessionId: handle.sessionId };
  assert.equal(request.ok, true);
  useStore.getState().openGmiEditWorkspace(id);
  const binding = { layerId: id, sessionId: handle.sessionId, fingerprint: handle.fingerprint };
  useStore.getState().changeGmiEditSelection(id, { type: 'add', scope: 'line', keys: ['line:1'] }, binding);
  useStore.getState().setGmiEditTableView(id, 'proposed');
  let continuation;
  useStore.setState({ gmiEditWorkspaceGuard: (run) => { continuation = run; } });
  const before = useStore.getState();
  assert.equal(before.openGmiEditWorkspace(id, request).ok, true);
  for (const key of ['gmiEditWorkspace', 'gmiEditSelection', 'ui', 'gmiEditTableView']) assert.equal(useStore.getState()[key], before[key], 'guard cancellation preserves ' + key);
  // Explicit approval accepts exactly the prepared source set, with no engine mutation.
  continuation();
  const accepted = useStore.getState();
  assert.deepEqual(accepted.gmiEditSelection.keys, request.targets.map(t => `${t.scope}:${t.sourceIndex}`));
  assert.equal(accepted.gmiEditSelection.origin.kind, 'validator');
  assert.equal(accepted.gmiEditSelection.showOnly, true);
  assert.equal(accepted.gmiEditTableView[id], 'original');
  // S5: the handoff's Original is automatic, so the next stage may show Foreslått.
  assert.equal(accepted.gmiEditTableViewBy[id], 'auto', 'handoff resets an explicit view choice');
  assert.equal(gmiEditSessions.getSession(handle).session, session);
  const selected = accepted.gmiEditSelection;
  accepted.changeGmiEditSelection(id, { type: 'add', scope: 'line', keys: ['line:1'] }, binding);
  assert.equal(useStore.getState().gmiEditSelection, selected);
  accepted.openGmiEditWorkspace(id, request);
  assert.equal(gmiEditSessions.stage(handle, createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11' } }).changeSet).ok, true);
  continuation();
  assert.equal(useStore.getState().gmiEditSelection, selected);
  assert.match(useStore.getState().gmiEditHandoffError, /Kildegrunnlaget/);
  assert.equal(useStore.getState().openGmiEditWorkspace(id, request).ok, false);
  useStore.getState().removeLayer(id, { discardGmiEdits: true });
  assert.equal(useStore.getState().openGmiEditWorkspace(id, request).ok, false);
});
