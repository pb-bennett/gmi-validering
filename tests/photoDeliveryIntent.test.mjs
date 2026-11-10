// M8: FOTO combined-delivery intent per occurrence. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { parseGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { photoWorkspaceView } from '../src/lib/photos/photoWorkspaceView.mjs';
import { DEFAULT_PHOTO_FILTER } from '../src/lib/photos/photoWorkspaceState.mjs';
import { photoDeliveryOccurrenceKey } from '../src/lib/photos/photoDeliveryIntent.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import {
  applyGmiHyperlinkRemoval, createGmiEditSession, createGmiObjectCorrection, getGmiProposedBytes, getGmiProposedState,
  gmiHyperlinkSelectionKey, loadGmiSourceDocument, planGmiHyperlinkRemoval, stageGmiChangeSet,
} from '../src/lib/gmi-edit/index.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const point = (longitude = 10) => ({ crs: 'EPSG:4326', longitude, latitude: 60 });
const KUM1 = '00000000-0000-4000-8000-000000000001', KUM2 = '00000000-0000-4000-8000-000000000002', KUM3 = '00000000-0000-4000-8000-000000000003';
// Kum 1 and Kum 2 share a.jpg; Kum 3 has b.jpg; a line links a.jpg and c.jpg (no FOTO occurrence); d.jpg is unlinked.
const DEFAULT_OBJECTS = [
  { guid: KUM1, label: 'Kum 1', hyperlink: 'h:1(link:"Attachments\\a.jpg" sign:"Måler") h:2(link:"Attachments\\b2.jpg") ', xyz: '581930 6566000 1' },
  { guid: KUM2, label: 'Kum 2', hyperlink: 'h:1(link:"Attachments\\a.jpg") ', xyz: '582030 6566100 1' },
  { guid: KUM3, label: 'Kum 3', hyperlink: 'h:1(link:"Attachments\\b.jpg") h:2(link:"Attachments\\rapport.pdf") ', xyz: '582050 6566120 1' },
  { scope: 'line', guid: '00000000-0000-4000-8000-000000000010', label: 'Ledning', hyperlink: 'h:1(link:"Attachments\\a.jpg") h:2(link:"Attachments\\c.jpg") ' },
];

async function setup({ names = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], objects = DEFAULT_OBJECTS, loaded = false } = {}) {
  let next = 0;
  const session = createPhotoSession({ createId: () => `id-${++next}`, yieldJob: tick,
    urls: { createObjectURL: () => `blob:${next}`, revokeObjectURL: () => {} },
    createThumbnail: async () => ({ dimensions: { width: 3, height: 2 }, thumbnailBlob: new Blob(['thumb']) }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position: point(), raw: {} } }) });
  const files = names.map((name) => new File(['image'], name, { type: 'image/jpeg', lastModified: 1 }));
  session.importFiles(files);
  const layer = session.createLayer();
  for (let count = 0; count < 100 && session.getLayerPhotos(layer.id).some((photo) => photo.preview.state === 'pending' || photo.spatial.exifRead.state === 'pending'); count++) await tick();
  const gmi = gmiFile(objects, 'leveranse.gmi');
  const bytes = new Uint8Array(await gmi.arrayBuffer());
  let live = true;
  const binding = { layerId: 'survey-1', datasetRevision: 'rev-1', inputId: 'input-1', filename: 'leveranse.gmi' };
  const ticket = session.beginSourceWorkflow(layer.id);
  const input = loaded ? { binding, read: () => parseGmiPhotoSource(gmi), isLive: () => live } : gmi;
  assert(await session.stageLayerSource(layer.id, input, 'gmi'));
  assert(session.saveSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
  session.endSourceWorkflow(ticket);
  const photos = () => session.getLayerPhotos(layer.id);
  const byObject = (guid) => photos().find((photo) => photo.occurrence?.object.guid === guid);
  const byName = (name) => photos().filter((photo) => photo.originalFilename === name);
  const delivery = () => session.getLayerDelivery(layer.id);
  const status = (photo) => delivery().byPhotoId[photo.id].status;
  return { session, layer, bytes, byObject, byName, photos, delivery, status, setLive: (value) => { live = value; } };
}

test('defaults: GMI-linked occurrences keep their link, unlinked occurrences are not included, line-only links stay in the GMI', async () => {
  const { delivery, status, byObject, byName } = await setup();
  for (const guid of [KUM1, KUM2, KUM3]) assert.equal(status(byObject(guid)), 'keep-link');
  assert.equal(status(byName('d.jpg')[0]), 'not-selected');
  const [c] = byName('c.jpg');
  const entry = delivery().byPhotoId[c.id];
  assert.equal(entry.status, 'keep-link');
  assert.equal(entry.reason, 'linked-without-occurrence');
  assert.equal(entry.canInclude, false);
  assert.equal(entry.canTransfer, false);
  const { summary } = delivery();
  assert.deepEqual(summary.occurrences, { 'keep-link': 4, transfer: 0, include: 0, 'not-selected': 1, review: 0 });
  assert.deepEqual(summary.assets, { 'keep-link': 3, transfer: 0, include: 0, 'not-selected': 1, review: 0 });
  assert.equal(summary.active, false);
});

test('shared photograph: Kum 1 transfers, Kum 2 keeps its link; bulk scope is exact per occurrence', async () => {
  const { session, layer, byObject, status, delivery } = await setup();
  const kum1 = byObject(KUM1), kum2 = byObject(KUM2);
  assert.equal(kum1.assetId, kum2.assetId);
  const result = session.setDeliveryIntent(layer.id, [kum1.id], 'transfer');
  assert.deepEqual(result, { ok: true, changedIds: [kum1.id], unchangedIds: [] });
  assert.equal(status(kum1), 'transfer');
  assert.equal(status(kum2), 'keep-link', 'the sibling occurrence of the same asset is untouched');
  const { summary } = delivery();
  assert.equal(summary.occurrences.transfer, 1);
  assert.equal(summary.assets.transfer, 1);
  assert.equal(summary.assets['keep-link'], 3, 'the shared asset is counted as both transferred and retained');
  const snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.deepEqual(snapshot.assets.transferredAndRetained, [kum1.assetId]);
  // Bulk: Kum 2 and Kum 3 together; Kum 1 is not in the selection and stays as it is.
  const kum3 = byObject(KUM3);
  assert.deepEqual(session.setDeliveryIntent(layer.id, [kum2.id, kum3.id], 'transfer').changedIds, [kum2.id, kum3.id]);
  assert.deepEqual(session.setDeliveryIntent(layer.id, [kum2.id], 'keep-link').changedIds, [kum2.id]);
  assert.deepEqual([status(kum1), status(kum2), status(kum3)], ['transfer', 'keep-link', 'transfer']);
});

test('invalid and stale identities are rejected atomically; reapplying a value is a silent no-op', async () => {
  const { session, layer, byObject, byName, status } = await setup();
  const kum1 = byObject(KUM1), d = byName('d.jpg')[0], c = byName('c.jpg')[0];
  let publishes = 0;
  session.subscribe(() => { publishes++; });
  const cases = [
    [() => session.setDeliveryIntent(layer.id, [kum1.id], 'both'), 'invalid-intent'],
    [() => session.setDeliveryIntent('photo-layer-missing', [kum1.id], 'transfer'), 'layer-not-found'],
    [() => session.setDeliveryIntent(layer.id, [], 'transfer'), 'invalid-selection'],
    [() => session.setDeliveryIntent(layer.id, [kum1.id, kum1.id], 'transfer'), 'invalid-selection'],
    [() => session.setDeliveryIntent(layer.id, [kum1.id, 'gone'], 'transfer'), 'stale-occurrence'],
    [() => session.setDeliveryIntent(layer.id, [kum1.id, d.id], 'transfer'), 'not-gmi-linked'],
    [() => session.setDeliveryIntent(layer.id, [c.id], 'keep-link'), 'not-gmi-linked'],
    [() => session.setCombinedDeliveryInclusion(layer.id, [d.id], 'yes'), 'invalid-inclusion'],
    [() => session.setCombinedDeliveryInclusion(layer.id, [d.id, kum1.id], true), 'gmi-linked-occurrence'],
    [() => session.setCombinedDeliveryInclusion(layer.id, [c.id], true), 'linked-without-occurrence'],
  ];
  for (const [run, error] of cases) {
    const result = run();
    assert.equal(result.ok, false);
    assert.equal(result.error, error);
    assert.deepEqual(result.changedIds, []);
  }
  assert.equal(publishes, 0, 'no rejected call publishes');
  assert.equal(status(kum1), 'keep-link');
  assert.equal(status(d), 'not-selected');
  // Reapplying the current (default) value changes nothing and does not publish.
  assert.deepEqual(session.setDeliveryIntent(layer.id, [kum1.id], 'keep-link'), { ok: true, changedIds: [], unchangedIds: [kum1.id] });
  assert.deepEqual(session.setCombinedDeliveryInclusion(layer.id, [d.id], false).changedIds, []);
  assert.equal(publishes, 0);
  assert.deepEqual(session.setCombinedDeliveryInclusion(layer.id, [d.id], true).changedIds, [d.id]);
  assert.deepEqual(session.setCombinedDeliveryInclusion(layer.id, [d.id], true).changedIds, []);
  assert.equal(publishes, 1);
  assert.equal(status(d), 'include');
});

test('positioning, metadata, edit and source-recheck actions never change delivery decisions', async () => {
  const { session, layer, byObject, byName, delivery } = await setup();
  const kum1 = byObject(KUM1), kum2 = byObject(KUM2), d = byName('d.jpg')[0];
  session.setDeliveryIntent(layer.id, [kum1.id], 'transfer');
  session.setCombinedDeliveryInclusion(layer.id, [d.id], true);
  const before = JSON.stringify(delivery().byPhotoId);
  const keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  // Positioning: accept GMI candidates through the source workflow, then edit position and direction.
  const ticket = session.beginSourceWorkflow(layer.id);
  const plan = session.reviewSourceWorkflowPositions(ticket);
  const requests = plan.rows.flatMap((row) => { const option = row.options.find((item) => item.kind === 'gmi'); return option ? [{ photoId: row.photoId, candidateId: option.id }] : []; });
  assert(session.applySourceWorkflowPositions(ticket, plan, requests).ok);
  session.endSourceWorkflow(ticket);
  assert(session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: kum1.id, position: point(12), degrees: 90 }, { photoId: d.id, position: point(13) }]).ok);
  session.acceptCandidates(layer.id, [{ photoId: kum2.id, candidateId: session.getPhoto(kum2.id).spatial.candidates.find((item) => item.kind === 'exif').id }]);
  assert(session.setCaptureMetadata(layer.id, [kum1.id], 'photographer', 'Feltmåler').ok);
  assert(session.fillMissingPhotoValues(layer.id, 'captureTime', '2026-08-01T10:00:00', null).ok);
  session.adoptSourceEvidence(layer.id, 'direction', 'exif');
  // Re-check the GMI source (same ledger): occurrences keep their identity.
  const recheck = session.beginSourceWorkflow(layer.id);
  const sourceId = session.getLayer(layer.id).spatialSources.find((source) => source.kind === 'gmi').id;
  assert(session.recheckLayerSource(layer.id, sourceId));
  session.endSourceWorkflow(recheck);
  session.setLayerVisibility(layer.id, false);
  assert.equal(JSON.stringify(delivery().byPhotoId), before);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore);
  assert.equal(session.getPhoto(kum1.id).direction.current.degrees, 90, 'the edits did happen');
});

test('source removal, unavailable sources and lost associations mark transfers for review; keep-link resolves them', async () => {
  const context = await setup({ loaded: true });
  const { session, layer, byObject, status, delivery } = context;
  const kum1 = byObject(KUM1), kum2 = byObject(KUM2);
  session.setDeliveryIntent(layer.id, [kum1.id], 'transfer');
  // The loaded survey layer goes away: the decision needs review and gives no removal selection.
  context.setLive(false);
  session.reconcileLoadedGmiBindings(() => false);
  assert.equal(status(kum1), 'review');
  assert.equal(delivery().byPhotoId[kum1.id].reason, 'source-not-live');
  assert.equal(status(kum2), 'keep-link');
  let snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.deepEqual(snapshot.removalSelections, []);
  assert.equal(snapshot.unresolved.length, 1);
  assert.equal(snapshot.unresolved[0].decision, 'transfer');
  assert.equal(snapshot.unresolved[0].reason, 'source-not-live');
  assert.equal(snapshot.readiness.decisionsResolved, false);
  assert.equal(session.setDeliveryIntent(layer.id, [kum2.id], 'transfer').error, 'association-unavailable');
  // Removing the GMI source keeps the evidence on the occurrence but the decision stays unresolved.
  const sourceId = session.getLayer(layer.id).spatialSources.find((source) => source.kind === 'gmi').id;
  assert(session.removeGmiSource(layer.id, sourceId, { confirmed: true }));
  assert.equal(delivery().byPhotoId[kum1.id].reason, 'source-missing');
  assert.equal(session.getPhoto(kum1.id).occurrence.objectKey, `guid:${KUM1}`, 'evidence kept for explanation');
  snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.equal(snapshot.included.length, 0, 'a transfer is never reinterpreted as an unlinked inclusion');
  assert.equal(session.setCombinedDeliveryInclusion(layer.id, [kum1.id], true).error, 'gmi-linked-occurrence');
  assert.deepEqual(session.setDeliveryIntent(layer.id, [kum1.id], 'keep-link').changedIds, [kum1.id]);
  assert.equal(status(kum1), 'keep-link');
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).unresolved.length, 0);
});

test('removing an occurrence removes its decision; removing the asset prunes the ledger and stale transfers need review', async () => {
  const { session, layer, byObject, byName, delivery } = await setup();
  const kum1 = byObject(KUM1), kum2 = byObject(KUM2), kum3 = byObject(KUM3), d = byName('d.jpg')[0];
  session.setDeliveryIntent(layer.id, [kum1.id, kum3.id], 'transfer');
  session.setCombinedDeliveryInclusion(layer.id, [d.id], true);
  session.removeLayerPhotos(layer.id, [kum1.id, d.id], { confirmed: true });
  assert.equal(delivery().byPhotoId[kum1.id], undefined);
  const snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.deepEqual(snapshot.transfers.map((item) => item.photoId), [kum3.id]);
  assert.deepEqual(snapshot.included, []);
  const removed = snapshot.linksWithoutOccurrence.find((item) => item.objectKey === `guid:${KUM1}`);
  assert.equal(removed.reason, 'placement-removed', 'the GMI link of a removed placement is reported, not lost');
  assert.equal(delivery().byPhotoId[kum2.id].status, 'keep-link');
  // The occurrence id is gone: a later call with it is stale.
  assert.equal(session.setDeliveryIntent(layer.id, [kum1.id], 'transfer').error, 'stale-occurrence');
});

test('an inclusion on a photo that later gains a GMI link needs review; ambiguous GMI references are flagged, never linked', async () => {
  // d.jpg is first unlinked and included, then a GMI arrives that links it to Kum 4.
  const { session, layer, byName, status, delivery } = await setup({ objects: [{ guid: KUM1, label: 'Kum 1', hyperlink: 'h:1(link:"a.jpg") ', xyz: '581930 6566000 1' }] });
  const [d] = byName('d.jpg');
  session.setCombinedDeliveryInclusion(layer.id, [d.id], true);
  const ticket = session.beginSourceWorkflow(layer.id);
  assert(await session.stageLayerSource(layer.id, gmiFile([{ guid: KUM3, label: 'Kum 4', hyperlink: 'h:1(link:"d.jpg") ', xyz: '582000 6566000 1' }], 'second.gmi'), 'gmi'));
  assert(session.saveSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
  session.endSourceWorkflow(ticket);
  assert(session.getPhoto(d.id).occurrence, 'the record became a GMI occurrence');
  assert.equal(status(d), 'review');
  assert.equal(delivery().byPhotoId[d.id].reason, 'decision-type-changed');
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).unresolved[0].decision, 'include');
  assert.deepEqual(session.setDeliveryIntent(layer.id, [d.id], 'keep-link').changedIds, [d.id]);
  assert.equal(status(d), 'keep-link');

  // Ambiguous: two imported files with the same name referenced once.
  const ambiguous = await setup({ names: ['x.jpg', 'x.jpg'], objects: [{ guid: KUM2, label: 'Kum 5', hyperlink: 'h:1(link:"x.jpg") ', xyz: '581930 6566000 1' }] });
  const entries = Object.values(ambiguous.delivery().byPhotoId);
  assert(entries.every((entry) => !entry.linked && entry.status === 'not-selected' && entry.ambiguousGmiReference));
  assert.equal(ambiguous.session.setDeliveryIntent(ambiguous.layer.id, [entries[0].photoId], 'transfer').error, 'not-gmi-linked');
  assert(ambiguous.session.setCombinedDeliveryInclusion(ambiguous.layer.id, [entries[0].photoId], true).ok);
  assert(ambiguous.session.getPhotoDeliverySnapshot(ambiguous.layer.id).readiness.issues.includes('included-photo-ambiguously-referenced'));
});

test('M9 snapshot: deterministic, stale-detectable, and its removal selections are exactly what M7 accepts', async () => {
  const { session, layer, bytes, byObject, byName } = await setup();
  const kum1 = byObject(KUM1), kum3 = byObject(KUM3), d = byName('d.jpg')[0];
  session.setDeliveryIntent(layer.id, [kum3.id, kum1.id], 'transfer');
  session.setCombinedDeliveryInclusion(layer.id, [d.id], true);
  const snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.equal(snapshot.stateKey, session.getPhotoDeliverySnapshot(layer.id).stateKey);
  assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.removalSelections[0]));
  assert(session.isPhotoDeliverySnapshotCurrent(snapshot));
  const source = session.getLayer(layer.id).spatialSources.find((item) => item.kind === 'gmi');
  assert.deepEqual(snapshot.sources.map((item) => [item.sourceId, item.fingerprint, item.live, item.transferCount, item.retainedCount]),
    [[source.id, source.fingerprint, true, 2, 1]]);
  assert.deepEqual(snapshot.counts, { transferOccurrences: 2, retainedOccurrences: 1, includedOccurrences: 1, unresolvedOccurrences: 0,
    linksWithoutOccurrence: 2, transferredAssets: 2, includedAssets: 1 });
  assert.deepEqual(snapshot.linksWithoutOccurrence.map((item) => item.reason), ['line-object', 'line-object']);
  for (const selection of snapshot.removalSelections) {
    assert.equal(selection.key, gmiHyperlinkSelectionKey(selection), 'occurrence key = M7 selection key');
    assert.equal(selection.key, photoDeliveryOccurrenceKey(selection));
  }
  // M7 accepts the selections against the exact GMI bytes, without any adaptation.
  const document = await loadGmiSourceDocument(bytes);
  assert.equal(document.fingerprint, source.fingerprint);
  const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: snapshot.removalSelections });
  assert.equal(plan.status, 'ready', JSON.stringify(plan.blockers));
  assert.deepEqual(plan.cells.map((cell) => cell.objectKey).sort(), [`guid:${KUM1}`, `guid:${KUM3}`]);
  const result = applyGmiHyperlinkRemoval(plan, { authorization: { selectionKeys: snapshot.removalSelections.map((item) => item.key) } });
  assert(result.ok);
  const parser = new GMIParser(decodeGmiBytes(result.bytes));
  const link = (guid) => parser.points.find((object) => object.guid === guid).attributes.S_HYPERLINK.trim();
  assert.equal(link(KUM1), 'h:1(link:"Attachments\\b2.jpg")', 'Kum 1 loses only the a.jpg wrapper (renumbered)');
  assert.equal(link(KUM2), 'h:1(link:"Attachments\\a.jpg")', 'Kum 2 keeps the shared photo');
  assert.equal(link(KUM3), 'h:1(link:"Attachments\\rapport.pdf")', 'the PDF stays');
  // Any decision change makes the snapshot stale.
  session.setDeliveryIntent(layer.id, [kum3.id], 'keep-link');
  assert.equal(session.isPhotoDeliverySnapshotCurrent(snapshot), false);
  assert.equal(session.isPhotoDeliverySnapshotCurrent(session.getPhotoDeliverySnapshot(layer.id)), true);
  assert.equal(session.isPhotoDeliverySnapshotCurrent({ ...snapshot, layerId: 'gone' }), false);
});

test('workspace filter and counts by delivery status; occurrences and assets counted separately', async () => {
  const { session, layer, byObject, byName, photos, delivery } = await setup();
  session.setDeliveryIntent(layer.id, [byObject(KUM1).id], 'transfer');
  session.setCombinedDeliveryInclusion(layer.id, [byName('d.jpg')[0].id], true);
  const view = (deliveryFilter) => photoWorkspaceView(photos(), { filter: { ...DEFAULT_PHOTO_FILTER, delivery: deliveryFilter } }, { delivery: delivery() });
  assert.deepEqual(view('all').counts.delivery, { all: 5, 'keep-link': 3, transfer: 1, include: 1, 'not-selected': 0, review: 0 });
  assert.deepEqual(view('transfer').rows.map((photo) => photo.id), [byObject(KUM1).id]);
  assert.deepEqual(view('include').rows.map((photo) => photo.originalFilename), ['d.jpg']);
  assert.equal(view('keep-link').rows.length, 3);
  assert.deepEqual(view('transfer').summary, ['Overføres til GML']);
  assert.equal(view('transfer').filterActive, true);
  // Without delivery entries only "all" matches (no accidental filtering elsewhere).
  assert.equal(photoWorkspaceView(photos(), { filter: DEFAULT_PHOTO_FILTER }).rows.length, 5);
});

test('standalone FOTO export, original GMI bytes and Rettinger state are unaffected by delivery decisions', async () => {
  const { session, layer, bytes, byObject, byName } = await setup();
  const ticket = session.beginSourceWorkflow(layer.id);
  const plan = session.reviewSourceWorkflowPositions(ticket);
  assert(session.applySourceWorkflowPositions(ticket, plan, plan.rows.flatMap((row) => {
    const option = row.options.find((item) => item.kind === 'gmi') || row.options.find((item) => item.kind === 'exif');
    return option ? [{ photoId: row.photoId, candidateId: option.id }] : [];
  })).ok);
  session.endSourceWorkflow(ticket);
  const now = () => new Date('2026-11-09T12:00:00Z');
  const exportPlan = async () => JSON.stringify(await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layer.id), { profile: 'legacy2019', crs: 'EPSG:25832' }, { now }));
  // A complete layer serializes; with missing metadata the plan (rows, blockers, names) is compared instead.
  assert(session.fillMissingPhotoValues(layer.id, 'captureTime', '2026-08-01T10:00:00').ok);
  assert(session.fillMissingPhotoValues(layer.id, 'direction', 45).ok);
  assert(session.fillMissingPhotoValues(layer.id, 'photographer', 'Feltmåler').ok);
  const exportXml = async () => {
    const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layer.id), { profile: 'legacy2019', crs: 'EPSG:25832' }, { now });
    try { return serializePhotoExport(plan); } catch { return JSON.stringify(plan); }
  };
  const exportSnapshot = capturePhotoExportSnapshot(session, layer.id);
  const before = await exportXml();
  assert(before.startsWith('<'), 'the standalone export serializes to GML');
  const gmiBefore = Buffer.from(bytes).toString('latin1');
  const document = await loadGmiSourceDocument(bytes);
  let editSession = createGmiEditSession(document, { layerId: 'survey-1' });
  editSession = stageGmiChangeSet(editSession, createGmiObjectCorrection(editSession, { scope: 'point', sourceIndex: 1, values: { Type: 'DFOT' }, mode: 'overwrite' }).changeSet).session;
  const proposedBefore = Buffer.from(getGmiProposedBytes(getGmiProposedState(editSession))).toString('latin1');

  session.setDeliveryIntent(layer.id, [byObject(KUM1).id, byObject(KUM3).id], 'transfer');
  session.setCombinedDeliveryInclusion(layer.id, [byName('d.jpg')[0].id], true);

  assert.equal(exportSnapshot.isLive(), true, 'an open export snapshot is not invalidated by a delivery decision');
  assert.equal(await exportXml(), before, 'the standalone export is byte-identical and still contains every occurrence');
  assert.equal((await exportPlan()).length > 0, true);
  assert.equal(Buffer.from(bytes).toString('latin1'), gmiBefore);
  assert.equal(Buffer.from(getGmiProposedBytes(getGmiProposedState(editSession))).toString('latin1'), proposedBefore);
  assert.equal(new GMIParser(decodeGmiBytes(bytes)).points.find((object) => object.guid === KUM1).attributes.S_HYPERLINK.includes('a.jpg'), true, 'no hyperlink is changed in M8');
});

test('clearing the session and deleting the layer drop every decision', async () => {
  const { session, layer, byObject } = await setup();
  const kum1 = byObject(KUM1);
  session.setDeliveryIntent(layer.id, [kum1.id], 'transfer');
  session.deleteLayer(layer.id);
  assert.equal(session.getLayerDelivery(layer.id), null);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id), null);
  session.clear();
});
