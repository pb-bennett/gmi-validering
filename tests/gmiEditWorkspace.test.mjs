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
import {
  GMI_EDIT_TABLE_VIEWS, describeGmiEditStatus, describeGmiObject, gmiChangeSetCellViews, gmiChangeSetDependents, gmiEditDownloadState,
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
