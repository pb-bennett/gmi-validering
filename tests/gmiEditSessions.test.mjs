// M3: GMI editing-session registry, source-byte ownership, store lifecycle,
// unsaved-changes protection and the field-only revised GMI export.
//
// Part 1 drives the pure registry (createGmiEditSessions) over the real
// createLoadedGmiSources with an in-memory layer map. Part 2 uses the actual
// survey store (store.js) and the app registry singleton. All data comes from
// the fabricated M0 fixtures; no private corpus file is read.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { GMI_EDIT_FIXTURE_DIR, sha256Hex } from './helpers/gmiEditFixtures.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import {
  GMI_EDIT_LAYER_STATES as S, buildGmiFieldExport, createGmiEditSessions, createGmiExportBlob, createGmiObjectCorrection,
  createGmiProposedCache, getGmiExportBytes, getGmiExportReadiness, gmiExportNames, isGmiFieldExport, recordGmiExportDownload,
} from '../src/lib/gmi-edit/index.mjs';
import { createLoadedGmiSources, isLoadedGmiSurveyLayer, loadedGmiSources } from '../src/lib/photos/loadedGmiSource.mjs';
import { createGmiPhotoSource, gmiSourceFingerprint } from '../src/lib/photos/gmiPhotoSource.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { GMI_SOURCE_LEXEMES } from '../src/lib/parsing/gmiLexicalEvidence.js';
import { createGmiEditUnloadGuard, gmiEditSessions } from '../src/lib/gmiEditSessions.mjs';

register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');

const fixture = async (name) => new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, `${name}.gmi`)));
const CORE = await fixture('core-crlf-latin1');
const SDR_EMPTY = await fixture('sdr-empty');
const MIXED_EOL = await fixture('guard-mixed-eol');
const DATE = new Date('2026-11-09T10:11:12Z');   // 11:11:12 in Europe/Oslo (CET)

// Line :L 2 (sourceIndex 1) of core-crlf-latin1 has an empty SDR.
const SDR_TARGET = { scope: 'line', sourceIndex: 1, field: 'SDR' };

function parse(bytes) {
  const parser = new GMIParser(decodeGmiBytes(bytes));
  const { warningSummary, ...data } = parser.toObject();
  void warningSummary;
  return { parser, data };
}

const snapshotData = (data) => JSON.stringify(data) + JSON.stringify([...data.points, ...data.lines].map((object) => object.attributes[GMI_SOURCE_LEXEMES] ?? null));

function harness({ cache = createGmiProposedCache(), wrapSources } = {}) {
  const layers = {};
  const getLayer = (id) => layers[id] ?? null;
  const base = createLoadedGmiSources({ getLayer });
  const calls = { readBytes: 0, read: 0 };
  const sources = wrapSources ? wrapSources(base, calls) : {
    ...base,
    readBytes: (ticket) => { calls.readBytes++; return base.readBytes(ticket); },
    read: (ticket) => { calls.read++; return base.read(ticket); },
  };
  const changes = [];
  const registry = createGmiEditSessions({ sources, getLayer, isGmiLayer: isLoadedGmiSurveyLayer, cache, onChange: (id, status) => changes.push([id, status]) });
  return {
    layers, sources: base, registry, cache, calls, changes,
    add(id, bytes, { name = `${id}.gmi`, file = new File([bytes], name), registerSource = true } = {}) {
      const { parser, data } = parse(bytes);
      layers[id] = { id, name, file: { name, format: 'GMI' }, data };
      if (registerSource) base.register(id, data, file, createGmiPhotoSource(parser));
      return layers[id];
    },
    remove(id) { delete layers[id]; base.reconcile(); registry.reconcile(); },
  };
}

async function openOk(registry, layerId, expected) {
  const result = await registry.open(layerId, expected);
  assert.equal(result.ok, true, `open ${layerId}: ${result.code}`);
  return result.handle;
}

function stageSdr(registry, handle, lexeme = '11.0', target = SDR_TARGET) {
  const { session } = registry.getSession(handle);
  const built = createGmiObjectCorrection(session, { scope: target.scope, sourceIndex: target.sourceIndex, values: { [target.field]: lexeme }, mode: 'overwrite', label: `SDR ${lexeme}`, createdAt: '2026-11-09T10:00:00Z' });
  assert.equal(built.ok, true, JSON.stringify(built.rejections));
  const staged = registry.stage(handle, built.changeSet);
  assert.equal(staged.ok, true, staged.code);
  return staged;
}

const bytesEqual = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);

// ===================================================== part 1: registry

test('describe distinguishes unsupported, unavailable, unloaded, editable and read-only layers', async () => {
  const h = harness();
  assert.equal(h.registry.describe('missing').state, S.UNSUPPORTED);
  h.layers.kof = { id: 'kof', file: { name: 'a.kof', format: 'KOF' }, data: { format: 'KOF' } };
  assert.equal(h.registry.describe('kof').state, S.UNSUPPORTED);
  assert.equal((await h.registry.open('kof')).code, 'unsupported-layer');
  h.add('plain', CORE, { registerSource: false });   // e.g. parser errors: no source retained
  assert.equal(h.registry.describe('plain').state, S.UNAVAILABLE);
  assert.equal((await h.registry.open('plain')).code, 'source-unavailable');
  h.add('a', CORE);
  assert.equal(h.registry.describe('a').state, S.UNLOADED);
  assert.equal(h.calls.readBytes, 0, 'describing never reads bytes');
  await openOk(h.registry, 'a');
  assert.equal(h.registry.describe('a').state, S.EDITABLE);
  h.add('ro', MIXED_EOL);
  const ro = await openOk(h.registry, 'ro');
  const status = h.registry.describe('ro');
  assert.equal(status.state, S.READ_ONLY);
  assert(status.reasons.includes('mixed-eol'));
  assert.equal(getGmiExportReadiness(h.registry, ro).blocking[0], 'document-read-only');
  assert.equal((await buildGmiFieldExport(h.registry, ro, { date: DATE })).code, 'document-read-only');
});

test('opening binds the exact registered File and its SHA-256, and reuses one session per layer', async () => {
  const h = harness();
  const file = new File([CORE], 'leveranse.gmi');
  h.add('a', CORE, { file });
  const [first, second] = await Promise.all([h.registry.open('a'), h.registry.open('a')]);
  assert.equal(h.calls.readBytes, 1, 'concurrent opens share one load');
  assert.strictEqual(first.handle, second.handle);
  const handle = first.handle;
  assert.equal(handle.layerId, 'a');
  assert.equal(handle.fingerprint, `sha256:${sha256Hex(CORE)}`);
  assert.equal(handle.fingerprint, await gmiSourceFingerprint(file), 'same identity as FOTO');
  assert.equal(handle.inputId, h.sources.begin('a').binding.inputId);
  assert(Object.isFrozen(handle));
  assert.strictEqual((await h.registry.open('a')).handle, handle);
  assert.strictEqual(h.registry.getHandle('a'), handle);
  assert.equal(h.calls.readBytes, 1, 'reuse does not re-read');
  assert.equal((await h.registry.open('a', { fingerprint: `sha256:${'0'.repeat(64)}` })).code, 'fingerprint-mismatch');
  assert.equal((await h.registry.open('a', { inputId: 'other' })).code, 'source-identity-mismatch');
  assert.strictEqual((await h.registry.open('a', { fingerprint: handle.fingerprint, inputId: handle.inputId })).handle, handle);
  // Copies and edited handles are refused; only the issued handle works.
  assert.equal(h.registry.getSession({ ...handle }).code, 'invalid-handle');
  assert.equal(h.registry.getSession(null).code, 'invalid-handle');
  const { session } = h.registry.getSession(handle);
  assert.equal(session.layerId, 'a');
  assert.equal(session.document.fingerprint, handle.fingerprint);
});

test('readBytes returns fresh copies of the imported bytes; registry views never expose shared buffers', async () => {
  const h = harness();
  h.add('a', CORE);
  const ticket = h.sources.begin('a');
  const one = await h.sources.readBytes(ticket), two = await h.sources.readBytes(ticket);
  assert(bytesEqual(one, CORE) && one !== two && one.buffer !== two.buffer);
  one.fill(0);
  assert(bytesEqual(await h.sources.readBytes(ticket), CORE));
  await assert.rejects(h.sources.readBytes({ binding: ticket.binding }), { code: 'stale-loaded-gmi' });
  const handle = await openOk(h.registry, 'a');
  const original = h.registry.originalBytes(handle).bytes;
  assert(bytesEqual(original, CORE));
  original.fill(7);
  assert(bytesEqual(h.registry.originalBytes(handle).bytes, CORE));
  const payload = await buildGmiFieldExport(h.registry, handle, { date: DATE });
  const exported = getGmiExportBytes(payload);
  exported.fill(1);
  assert(bytesEqual(getGmiExportBytes(payload), CORE), 'export bytes are copies');
  assert(bytesEqual(new Uint8Array(await createGmiExportBlob(payload).arrayBuffer()), CORE));
  assert.equal(Object.keys(payload).includes('bytes'), false);
});

test('missing, unreadable, mismatched or stale source bytes are refused', async () => {
  // Unreadable File (e.g. changed on disk after selection).
  const unreadable = new File([CORE], 'gone.gmi');
  unreadable.arrayBuffer = async () => { throw new DOMException('NotReadableError'); };
  const h = harness();
  h.add('gone', CORE, { file: unreadable });
  const gone = await h.registry.open('gone');
  assert.equal(gone.code, 'loaded-gmi-unreadable');
  assert.equal(h.registry.describe('gone').state, S.ERROR);
  assert.equal(h.registry.describe('gone').error, 'loaded-gmi-unreadable');

  // A registered File that is not the file the layer was parsed from.
  h.add('other', CORE, { file: new File([SDR_EMPTY], 'other.gmi') });
  assert.equal((await h.registry.open('other')).code, 'layer-data-mismatch');

  // Layer removed while the bytes were being read.
  h.add('racing', CORE);
  const pending = h.registry.open('racing');
  h.remove('racing');
  assert.equal((await pending).code, 'source-stale');
  assert.deepEqual(h.registry.layerIds().includes('racing'), false);

  // Layer data replaced after opening: the session is invalidated, not re-bound.
  h.add('a', CORE);
  const handle = await openOk(h.registry, 'a');
  stageSdr(h.registry, handle);
  h.layers.a = { ...h.layers.a, data: { ...h.layers.a.data } };
  assert.equal(h.registry.getSession(handle).code, 'source-stale');
  const notice = h.registry.describe('a');
  assert.equal(notice.state, S.INVALIDATED);
  assert.equal(notice.discardedChangeSets, 1);
  assert.equal(notice.discardedUnsaved, true);
  assert.equal((await h.registry.open('a')).code, 'source-unavailable', 'no silent reattachment to replaced data');
});

test('one layer is edited without affecting another; identical files in two layers stay independent', async () => {
  const h = harness();
  h.add('a', CORE, { name: 'same.gmi' });
  h.add('b', CORE, { name: 'same.gmi' });
  h.add('c', SDR_EMPTY);
  const a = await openOk(h.registry, 'a'), b = await openOk(h.registry, 'b'), c = await openOk(h.registry, 'c');
  assert.equal(a.fingerprint, b.fingerprint);
  assert.notEqual(a.sessionId, b.sessionId);
  assert.notEqual(a.inputId, b.inputId);
  assert.notStrictEqual(h.registry.resolve(a).document, h.registry.resolve(b).document, 'separate documents (and cache keys)');
  stageSdr(h.registry, a);
  assert.equal(h.registry.describe('a').changeSetCount, 1);
  assert.equal(h.registry.describe('b').changeSetCount, 0);
  assert.equal(h.registry.describe('c').changeSetCount, 0);
  assert.equal(h.registry.proposed(b).identical, true);
  assert.equal(h.registry.proposed(a).identical, false);
  // A handle never reaches another layer's session.
  assert.equal(h.registry.getSession({ ...a, layerId: 'b' }).code, 'invalid-handle');
  const fromA = h.registry.getSession(a).session;
  const foreign = createGmiObjectCorrection(fromA, { ...SDR_TARGET, values: { SDR: '17.0' }, mode: 'overwrite' });
  assert.equal(h.registry.stage(b, foreign.changeSet).code, 'document-mismatch');
  // Disposing one leaves the other untouched.
  assert.equal(h.registry.dispose('a').code, 'unsaved-changes');
  assert.equal(h.registry.dispose('a', { discardUnsaved: true }).ok, true);
  assert.equal(h.registry.getSession(a).code, 'session-disposed');
  assert.equal(h.registry.getSession(b).ok, true);
  assert.equal(h.registry.describe('b').state, S.EDITABLE);
  // Reopening layer a creates a new session; the old handle stays dead.
  const a2 = await openOk(h.registry, 'a');
  assert.notEqual(a2.sessionId, a.sessionId);
  assert.equal(h.registry.describe('a').changeSetCount, 0);
  assert.equal(h.registry.getSession(a).code, 'stale-session');
});

test('stage, undo, redo and discard go through M2 and publish lightweight status', async () => {
  const h = harness();
  h.add('a', CORE);
  const handle = await openOk(h.registry, 'a');
  const statuses = () => h.changes.filter(([id]) => id === 'a').map(([, status]) => status);
  const before = statuses().length;
  const staged = stageSdr(h.registry, handle);
  assert.equal(staged.staged, true);
  assert.equal(staged.status.changeSetCount, 1);
  assert.equal(staged.status.changedCells, 1);
  assert.equal(staged.status.unsaved, true);
  assert.equal(statuses().length, before + 1);
  assert.equal(h.cache.stats().computations, 0, 'staging never computes the proposed copy or revalidates');
  const second = stageSdr(h.registry, handle, '17.0', { scope: 'line', sourceIndex: 0, field: 'SDR' });
  assert.equal(second.status.changeSetCount, 2);
  const undone = h.registry.undo(handle);
  assert.equal(undone.status.changeSetCount, 1);
  assert.equal(undone.status.canRedo, true);
  const redone = h.registry.redo(handle);
  assert.equal(redone.status.changeSetCount, 2);
  assert.equal(h.registry.undo(handle).ok, true);
  assert.equal(h.registry.redo(handle).ok, true);
  const [firstSet] = h.registry.inspect(handle).changeSets;
  const discarded = h.registry.discard(handle, firstSet.id);
  assert.equal(discarded.status.changeSetCount, 1);
  assert.equal(discarded.status.redoCount, 0);
  assert.equal(h.registry.discard(handle, 'cs-unknown').code, 'change-set-not-found');
  const cleared = h.registry.discardAll(handle);
  assert.equal(cleared.status.changeSetCount, 0);
  assert.equal(cleared.status.unsaved, false);
  assert.equal(h.registry.undo(handle).code, 'nothing-to-undo');
  const revisions = statuses().map((status) => status.revision);
  assert.deepEqual(revisions, [...revisions].sort((x, y) => x - y), 'revisions increase');
  for (const status of statuses()) {
    assert(Object.isFrozen(status));
    for (const value of Object.values(status)) assert(!ArrayBuffer.isView(value), 'no bytes in status');
    assert(JSON.stringify(status).length < 2000, 'status stays small');
  }
  // M2 views through the registry.
  stageSdr(h.registry, handle);
  const cell = h.registry.cell(handle, SDR_TARGET);
  assert.deepEqual([cell.original, cell.proposed, cell.changed], ['', '11.0', true]);
  assert.equal(h.registry.inspect(handle).cells.changed.length, 1);
  const { diff } = h.registry.diff(handle);
  assert.deepEqual(diff.changes.map((change) => [change.field, change.original, change.proposed]), [['SDR', '', '11.0']]);
  const eligibility = h.registry.eligibility(handle, { canonicalFieldId: 'sdr' });
  assert.equal(eligibility.ok, true);
  const revalidated = h.registry.revalidate(handle, { referenceDate: '2026-11-09' });
  assert.equal(revalidated.ok, true);
  assert.notEqual(revalidated.original.datasetRevision, revalidated.revised.datasetRevision);
});

test('disposal invalidates the proposed cache; removal leaves no session or downloadable proposal', async () => {
  const h = harness();
  h.add('a', CORE);
  const handle = await openOk(h.registry, 'a');
  stageSdr(h.registry, handle);
  const { document } = h.registry.resolve(handle);
  assert.equal(h.registry.proposed(handle).ok, true);
  assert.equal(h.cache.size(document), 1);
  const invalidations = h.cache.stats().invalidations;
  h.remove('a');
  assert.equal(h.cache.size(document), 0);
  assert.equal(h.cache.stats().invalidations, invalidations + 1);
  assert.equal(h.registry.layerIds().length, 0);
  assert.equal(h.registry.describe('a').state, S.UNSUPPORTED, 'removed layers leave no notice');
  assert.deepEqual(h.changes.at(-1), ['a', null]);
  for (const call of [() => h.registry.getSession(handle), () => h.registry.proposed(handle), () => h.registry.diff(handle)]) assert.equal(call().code, 'session-disposed');
  assert.equal((await buildGmiFieldExport(h.registry, handle, { date: DATE })).code, 'session-disposed');
  assert.equal(h.registry.stage(handle, null).code, 'session-disposed');
  // clear(): everything goes, no blocking.
  h.add('b', CORE); h.add('c', CORE);
  stageSdr(h.registry, await openOk(h.registry, 'b'));
  await openOk(h.registry, 'c');
  h.registry.clear();
  assert.equal(h.registry.layerIds().length, 0);
  assert.equal(h.registry.hasUnsavedChanges(), false);
});

test('no-op export is the exact original file; the original layer and source stay untouched', async () => {
  const h = harness();
  const layer = h.add('a', CORE, { name: 'Leveranse æøå.gmi' });
  const data = layer.data, dataSnapshot = snapshotData(data);
  const handle = await openOk(h.registry, 'a');
  const readiness = getGmiExportReadiness(h.registry, handle);
  assert.deepEqual([readiness.ready, readiness.notes], [true, ['no-changes']]);
  const payload = await buildGmiFieldExport(h.registry, handle, { date: DATE });
  assert.equal(payload.ok, true, payload.code);
  assert(isGmiFieldExport(payload));
  assert.equal(payload.identical, true);
  assert(bytesEqual(getGmiExportBytes(payload), CORE));
  assert.equal(payload.fingerprint, handle.fingerprint);
  assert.equal(payload.size, CORE.length);
  assert.equal(payload.filename, '20261109-111112.gmi');
  assert.equal(payload.mimeType, 'application/octet-stream');
  assert.deepEqual(payload.summary.changes, []);
  assert.equal(payload.source.filename, 'Leveranse æøå.gmi');
  assert.strictEqual(h.layers.a.data, data);
  assert.equal(snapshotData(data), dataSnapshot);
  assert(bytesEqual(await h.sources.readBytes(h.sources.begin('a')), CORE));
});

test('modified export: only the approved value spans differ, it reparses independently, and the summary is exact', async () => {
  const h = harness();
  const layer = h.add('a', CORE);
  const dataSnapshot = snapshotData(layer.data);
  const handle = await openOk(h.registry, 'a');
  stageSdr(h.registry, handle);
  const { session } = h.registry.getSession(handle);
  const merknad = createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0, values: { Merknad: 'Rettet på stedet' }, mode: 'overwrite', label: 'Merknad' });
  assert.equal(h.registry.stage(handle, merknad.changeSet).ok, true);
  const payload = await buildGmiFieldExport(h.registry, handle, { date: DATE, label: 'Rettet SDR på kum' });
  assert.equal(payload.ok, true, payload.code);
  assert.equal(payload.filename, '20261109-111112-Rettet-SDR-paa-kum.gmi');
  assert.equal(payload.identical, false);
  const out = getGmiExportBytes(payload);
  assert.equal(payload.fingerprint, `sha256:${sha256Hex(out)}`);
  assert.equal(out.length, CORE.length + '11.0'.length + 'Rettet på stedet'.length - session.document.parser.points[0].attributes[GMI_SOURCE_LEXEMES].Merknad.length);
  // Independent M0 oracle: byte containment by line plus full reparse.
  const reference = loadGmiDocument(CORE);
  const oracle = verifyCellChanges(reference, out, [
    { ...SDR_TARGET, lexeme: '11.0' },
    { scope: 'point', sourceIndex: 0, field: 'Merknad', lexeme: 'Rettet på stedet' },
  ]);
  assert.equal(oracle.ok, true, String(oracle.failures));
  // Single-byte encoding preserved: å is one byte 0xE5.
  assert(out.includes(0xe5));
  const reparsed = new GMIParser(decodeGmiBytes(out));
  assert.deepEqual(reparsed.errors, []);
  assert.equal(reparsed.linesParsed[1].attributes[GMI_SOURCE_LEXEMES].SDR, '11.0');
  assert.deepEqual(reparsed.linesParsed.map((line) => [line.guid, line.coordinates]), layer.data.lines.map((line) => [line.guid, line.coordinates]));
  // Prefix up to the first edit is identical, including the header and CRLF.
  const firstDiff = out.findIndex((byte, i) => byte !== CORE[i]);
  assert(firstDiff > CORE.indexOf(0x5b, 10), 'header untouched');
  assert(isDeepStrictEqual(out.subarray(0, firstDiff), CORE.subarray(0, firstDiff)));
  assert.equal(payload.summary.changeSetCount, 2);
  assert.deepEqual(payload.summary.changes.map((change) => [change.scope, change.sourceIndex, change.field, change.original, change.proposed]), [
    ['point', 0, 'Merknad', session.document.parser.points[0].attributes[GMI_SOURCE_LEXEMES].Merknad, 'Rettet på stedet'],
    ['line', 1, 'SDR', '', '11.0'],
  ]);
  assert.deepEqual(payload.summary.changeSets.map((entry) => [entry.label, entry.applied]), [['SDR 11.0', 1], ['Merknad', 1]]);
  assert.equal(payload.source.fingerprint, handle.fingerprint);
  // Nothing written back.
  assert.equal(snapshotData(h.layers.a.data), dataSnapshot);
  assert(bytesEqual(h.registry.originalBytes(handle).bytes, CORE));
  assert(bytesEqual(await h.sources.readBytes(h.sources.begin('a')), CORE));
  assert(bytesEqual(getGmiExportBytes(await buildGmiFieldExport(h.registry, handle, { date: DATE })), out), 'deterministic');
});

test('export refuses after source invalidation, on a changed File and when the session moves during export', async () => {
  const h = harness();
  h.add('a', CORE);
  const handle = await openOk(h.registry, 'a');
  stageSdr(h.registry, handle);
  h.layers.a = { ...h.layers.a, data: { ...h.layers.a.data } };
  assert.equal((await buildGmiFieldExport(h.registry, handle, { date: DATE })).code, 'source-stale');
  assert.equal(getGmiExportReadiness(h.registry, handle).blocking[0], 'session-disposed');

  // The File re-reads with different bytes at export time (open hashes it
  // twice: readBytes and the shared FOTO fingerprint).
  let reads = 0;
  // Changing only on the third read: open succeeds, export refuses.
  const later = new File([CORE], 'later.gmi');
  later.arrayBuffer = async () => (++reads > 2 ? SDR_EMPTY : CORE).slice().buffer;
  const h3 = harness();
  h3.add('c', CORE, { file: later });
  const c = await openOk(h3.registry, 'c');
  stageSdr(h3.registry, c);
  assert.equal((await buildGmiFieldExport(h3.registry, c, { date: DATE })).code, 'source-fingerprint-mismatch');

  // A stage while the export awaits the source check.
  const h4 = harness();
  h4.add('d', CORE);
  const d = await openOk(h4.registry, 'd');
  const exporting = buildGmiFieldExport(h4.registry, d, { date: DATE });
  stageSdr(h4.registry, d);
  assert.equal((await exporting).code, 'state-changed');
  assert.equal((await buildGmiFieldExport(h4.registry, d, { date: new Date('x') })).code, 'invalid-date');
  assert.equal(recordGmiExportDownload(h4.registry, { ok: true }).code, 'not-an-export');
});

test('open refuses a File whose second read differs from the first', async () => {
  let reads = 0;
  const file = new File([CORE], 'flip.gmi');
  file.arrayBuffer = async () => (++reads > 1 ? SDR_EMPTY : CORE).slice().buffer;
  const h = harness();
  h.add('a', CORE, { file });
  assert.equal((await h.registry.open('a')).code, 'source-fingerprint-mismatch');
});

test('unsaved-changes semantics: effective changes not yet downloaded; reverted edits and redo stacks do not count', async () => {
  const h = harness();
  h.add('a', CORE);
  const handle = await openOk(h.registry, 'a');
  assert.equal(h.registry.hasUnsavedChanges(), false);
  stageSdr(h.registry, handle);
  assert.equal(h.registry.hasUnsavedChanges(), true);
  assert.deepEqual(h.registry.unsavedLayers().map((entry) => [entry.layerId, entry.changeSetCount, entry.changedCells]), [['a', 1, 1]]);
  // Revert the same cell: two staged sets, no effective change.
  const { session } = h.registry.getSession(handle);
  const revert = createGmiObjectCorrection(session, { ...SDR_TARGET, values: { SDR: '' }, mode: 'overwrite', conflictPolicy: 'replace' });
  assert.equal(h.registry.stage(handle, revert.changeSet).ok, true);
  assert.equal(h.registry.describe('a').changeSetCount, 2);
  assert.equal(h.registry.hasUnsavedChanges(), false);
  assert.equal(h.registry.dispose('a').ok, true, 'nothing to lose');
  // Download semantics.
  const again = await openOk(h.registry, 'a');
  stageSdr(h.registry, again);
  const payload = await buildGmiFieldExport(h.registry, again, { date: DATE });
  assert.equal(h.registry.hasUnsavedChanges(), true, 'building an export is not a download');
  assert.equal(recordGmiExportDownload(h.registry, payload).ok, true);
  assert.equal(h.registry.hasUnsavedChanges(), false);
  assert.equal(h.registry.describe('a').downloaded, true);
  assert.deepEqual(getGmiExportReadiness(h.registry, again).notes, ['already-downloaded']);
  stageSdr(h.registry, again, '17.0', { scope: 'line', sourceIndex: 0, field: 'SDR' });
  assert.equal(h.registry.hasUnsavedChanges(), true, 'new edits after the download');
  assert.equal(recordGmiExportDownload(h.registry, payload).code, 'export-stale');
  h.registry.undo(again);
  assert.equal(h.registry.hasUnsavedChanges(), false, 'back to the downloaded state (redo stack alone does not count)');
});

test('the beforeunload guard is attached only while unsaved changes exist', async () => {
  const h = harness();
  const target = new EventTarget();
  const guard = createGmiEditUnloadGuard(target, h.registry);
  const unload = () => { const event = new Event('beforeunload', { cancelable: true }); target.dispatchEvent(event); return event.defaultPrevented; };
  guard.sync();
  assert.equal(guard.attached, false);
  assert.equal(unload(), false);
  h.add('a', CORE);
  const handle = await openOk(h.registry, 'a');
  guard.sync();
  assert.equal(guard.attached, false, 'an open session alone does not warn');
  stageSdr(h.registry, handle);
  guard.sync();
  assert.equal(guard.attached, true);
  assert.equal(unload(), true);
  recordGmiExportDownload(h.registry, await buildGmiFieldExport(h.registry, handle, { date: DATE }));
  guard.sync();
  assert.equal(guard.attached, false);
  assert.equal(unload(), false);
  guard.dispose();
});

test('gmiExportNames follows the FOTO timestamp and label convention', () => {
  assert.equal(gmiExportNames({ date: DATE }).filename, '20261109-111112.gmi');
  assert.equal(gmiExportNames({ date: new Date('2026-07-01T22:30:00Z') }).filename, '20260702-003000.gmi');
  assert.equal(gmiExportNames({ date: DATE, label: '  Å/../CON: x ' }).filename, '20261109-111112-Aa-CON-x.gmi');
  assert.throws(() => gmiExportNames({ date: 'today' }), TypeError);
});

// ======================================================= part 2: store

async function addStoreLayer(bytes, name = 'Synthetic edit.gmi') {
  const file = new File([bytes], name);
  const { parser, data } = parse(new Uint8Array(await file.arrayBuffer()));
  const id = useStore.getState().addLayer({ file: { name, format: 'GMI' }, data, sourceInput: { file, evidence: createGmiPhotoSource(parser) } });
  return { id, data };
}
const resetStore = () => useStore.getState().resetAll({ discardGmiEdits: true });

test('store: sessions bind to survey layers; status is lightweight, not persisted, and does not touch layers', async (t) => {
  resetStore(); t.after(resetStore);
  const { id, data } = await addStoreLayer(CORE);
  assert.equal(gmiEditSessions.describe(id).state, S.UNLOADED);
  const handle = await openOk(gmiEditSessions, id);
  const layersBefore = useStore.getState().layers;
  stageSdr(gmiEditSessions, handle);
  const state = useStore.getState();
  assert.strictEqual(state.layers, layersBefore, 'status updates never replace layers');
  assert.strictEqual(state.layers[id].data, data);
  const status = state.gmiEditStatus[id];
  assert.equal(status.state, S.EDITABLE);
  assert.equal(status.changeSetCount, 1);
  assert.equal(status.unsaved, true);
  assert(JSON.stringify(state.gmiEditStatus).length < 2000);
  assert.equal(JSON.stringify(state.gmiEditStatus).includes('GMIFILE'), false);
  // Persistence keeps settings, ui and lastActive only (no localStorage in node).
  const source = await readFile(path.resolve('src/lib/store.js'), 'utf8');
  const partialize = source.slice(source.indexOf('partialize:'), source.indexOf('migrate:'));
  assert(partialize.length > 0);
  assert.equal(/gmiEdit|layers|bytes/.test(partialize), false);
  // Ordinary layer UI changes keep the session.
  useStore.getState().toggleLayerVisibility(id);
  assert.equal(gmiEditSessions.getSession(handle).ok, true);
});

test('store: removeLayer and resetAll block on unsaved edits unless explicitly discarded', async (t) => {
  resetStore(); t.after(resetStore);
  const { id } = await addStoreLayer(CORE);
  const { id: other } = await addStoreLayer(CORE);
  const handle = await openOk(gmiEditSessions, id);
  const otherHandle = await openOk(gmiEditSessions, other);
  stageSdr(gmiEditSessions, handle);
  const blocked = useStore.getState().removeLayer(id);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'gmi-edits-pending');
  assert.deepEqual(blocked.layers.map((entry) => entry.layerId), [id]);
  assert(useStore.getState().layers[id], 'layer kept');
  assert.equal(gmiEditSessions.getSession(handle).ok, true, 'session kept');
  // The other layer has no unsaved edits and can be removed.
  assert.equal(useStore.getState().removeLayer(other).ok, true);
  assert.equal(gmiEditSessions.getSession(otherHandle).code, 'session-disposed');
  assert.equal(other in useStore.getState().gmiEditStatus, false);
  assert.equal(gmiEditSessions.getSession(handle).ok, true, 'independent');
  assert.equal(useStore.getState().resetAll().code, 'gmi-edits-pending');
  assert(useStore.getState().layers[id]);
  const removed = useStore.getState().removeLayer(id, { discardGmiEdits: true });
  assert.equal(removed.ok, true);
  assert.equal(useStore.getState().layers[id], undefined);
  assert.equal(gmiEditSessions.getSession(handle).code, 'session-disposed');
  assert.deepEqual(useStore.getState().gmiEditStatus, {});
  assert.equal((await buildGmiFieldExport(gmiEditSessions, handle, { date: DATE })).code, 'session-disposed');
  assert.equal(loadedGmiSources.available(id), false);
});

test('store: reset clears every session; reimporting the same file creates a new, unrelated session', async (t) => {
  resetStore(); t.after(resetStore);
  const { id } = await addStoreLayer(CORE, 'same.gmi');
  const handle = await openOk(gmiEditSessions, id);
  stageSdr(gmiEditSessions, handle);
  assert.equal(useStore.getState().resetAll({ discardGmiEdits: true }).ok, true);
  assert.deepEqual(gmiEditSessions.layerIds(), []);
  assert.deepEqual(useStore.getState().gmiEditStatus, {});
  assert.equal(gmiEditSessions.getSession(handle).code, 'session-disposed');
  const { id: again } = await addStoreLayer(CORE, 'same.gmi');
  assert.notEqual(again, id);
  const fresh = await openOk(gmiEditSessions, again);
  assert.equal(fresh.fingerprint, handle.fingerprint);
  assert.notEqual(fresh.inputId, handle.inputId);
  assert.equal(gmiEditSessions.describe(again).changeSetCount, 0, 'no edits carried over by name or bytes');
  assert.equal(useStore.getState().resetAll().ok, true, 'no unsaved edits: reset proceeds');
});

test('store: replaced layer data invalidates the session and records a notice', async (t) => {
  resetStore(); t.after(resetStore);
  const { id, data } = await addStoreLayer(CORE);
  const handle = await openOk(gmiEditSessions, id);
  stageSdr(gmiEditSessions, handle);
  useStore.setState((state) => ({ layers: { ...state.layers, [id]: { ...state.layers[id], data: { ...data } } } }));
  assert.equal(gmiEditSessions.getSession(handle).code, 'session-disposed');
  const notice = useStore.getState().gmiEditStatus[id];
  assert.equal(notice.state, S.INVALIDATED);
  assert.equal(notice.discardedChangeSets, 1);
  assert.equal(gmiEditSessions.hasUnsavedChanges(), false);
  useStore.getState().removeLayer(id);
  assert.equal(id in useStore.getState().gmiEditStatus, false);
});
