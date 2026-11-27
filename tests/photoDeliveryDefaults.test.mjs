// FOTO correctness slice 1: automatic delivery defaults (GML positions → GML, moves away from the GMI point → GML)
// and delivery filters reacting at once. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { photoSourcePositionChoices, selectedPhotoSourcePositions } from '../src/lib/photos/photoPositioning.mjs';
import { photoDeliveryWithProposals, photoDirectionChangeIsMeaningful, photoHasManualDirection, photoMoveProposesTransfer, photoOriginGmiPosition, photoPositionDeliveryEffect, photoRotationProposesTransfer, togglePhotoDelivery } from '../src/lib/photos/photoDeliveryChoice.mjs';
import { photoWorkspaceView } from '../src/lib/photos/photoWorkspaceView.mjs';
import { DEFAULT_PHOTO_FILTER } from '../src/lib/photos/photoWorkspaceState.mjs';
import { createPhotoEditState, effectivePhoto, photoEditReducer } from '../src/lib/photos/photoEditSession.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { exportFixture } from './helpers/photoExportFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { gpsPng, noGpsPng } from './helpers/photoGpsFixtures.mjs';
import { parseRealGml, readRealExif } from './helpers/photoEvidenceFixtures.mjs';
import { saveStagedSource } from './helpers/photoSourceDraft.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const names = Array.from({ length: 14 }, (_, index) => `foto-${String(index + 1).padStart(2, '0')}.png`);
const GMI_NAMES = names.slice(0, 5), GML_NAMES = names.slice(5);
const guid = (index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

// The application's own Skråfoto GML for the nine photographs without a GMI link (synthetic positions/times).
async function exportedSkraafotoGml() {
  const fixture = await exportFixture({ names: GML_NAMES });
  return new File([serializePhotoExport(await fixture.plan())], 'skraafoto.gml', { type: 'application/gml+xml' });
}

async function setup({ shared = false } = {}) {
  let next = 0;
  const session = createPhotoSession({ createId: () => `id-${++next}`, yieldJob: tick,
    urls: { createObjectURL: () => `blob:${next}`, revokeObjectURL: () => {} },
    createThumbnail: async () => ({ dimensions: { width: 3, height: 2 }, thumbnailBlob: new Blob(['thumb']) }),
    extractGps: async () => ({ state: 'no-gps', candidate: null }), parseGml: parseRealGml });
  session.importFiles(names.map((name) => new File([gpsPng()], name, { type: 'image/png' })));
  const layer = session.createLayer();
  for (let count = 0; count < 100 && session.getLayerPhotos(layer.id).some((photo) => photo.spatial.exifRead.state === 'pending'); count++) await tick();
  // Five revised-GMI objects, each linking one photograph; optionally a sixth object sharing foto-01.png.
  const objects = GMI_NAMES.map((name, index) => ({ guid: guid(index), label: `Kum ${index + 1}`,
    hyperlink: `h:1(link:"Attachments\\${name}") `, xyz: `${581930 + index * 20} ${6566000 + index * 20} 1` }));
  if (shared) objects.push({ guid: guid(9), label: 'Kum 10', hyperlink: `h:1(link:"Attachments\\${GMI_NAMES[0]}") `, xyz: '582100 6566200 1' });
  const ticket = session.beginSourceWorkflow(layer.id);
  assert(await session.stageLayerSource(layer.id, gmiFile(objects, 'revidert.gmi'), 'gmi'));
  assert(saveStagedSource(session, ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
  // Accept every GMI object position, as the import does.
  const plan = session.reviewSourceWorkflowPositions(ticket);
  const requests = plan.rows.flatMap((row) => { const option = row.options.find((item) => item.kind === 'gmi'); return option ? [{ photoId: row.photoId, candidateId: option.id }] : []; });
  assert(session.applySourceWorkflowPositions(ticket, plan, requests).ok);
  session.endSourceWorkflow(ticket);
  const photos = () => session.getLayerPhotos(layer.id);
  const delivery = () => session.getLayerDelivery(layer.id);
  const status = (photo) => delivery().byPhotoId[photo.id].status;
  const byName = (name) => photos().filter((photo) => photo.originalFilename === name);
  const byObject = (id) => photos().find((photo) => photo.occurrence?.object.guid === id);
  return { session, layer, photos, delivery, status, byName, byObject };
}

// The positioning wizard's own steps: add the GML source, review, keep the proposed defaults.
async function stageGml(context, file) {
  const { session, layer } = context;
  const ticket = session.beginSourceWorkflow(layer.id);
  assert(await session.stageLayerSource(layer.id, file, 'gml'));
  assert(saveStagedSource(session, ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
  return reviewPositions(context, ticket);
}

// A (re)opened wizard over sources already kept: review and keep the proposed defaults.
function reviewPositions({ session, layer }, ticket = session.beginSourceWorkflow(layer.id)) {
  const plan = session.reviewSourceWorkflowPositions(ticket);
  const choices = photoSourcePositionChoices(plan);
  const selected = selectedPhotoSourcePositions(plan, choices);
  return { ticket, plan, requests: selected.map((row) => ({ photoId: row.photoId, candidateId: row.proposal.id })), selected };
}

async function importExifDraft(names) {
  const session = createPhotoSession({ yieldJob: tick, extractGps: readRealExif,
    createThumbnail: async () => ({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['thumb']) }) });
  session.beginImport();
  session.importFiles(names.map((name) => new File([name === 'no-gps.png' ? noGpsPng() : gpsPng()], name, { type: 'image/png' })));
  for (let count = 0; count < 100 && session.getSnapshot().photos.some((photo) => photo.spatial.exifRead.state === 'pending'); count++) await tick();
  assert(session.getSnapshot().photos.every((photo) => photo.spatial.exifRead.state !== 'pending'));
  return session;
}

test('import defaults to GML only for photos actually placed from EXIF', async () => {
  const session = await importExifDraft(['gps.png', 'no-gps.png']);
  const placement = { kind: 'exif' };
  const result = session.completeImport({ placement, preview: session.previewImport({ placement }) });
  assert(result.ok);
  assert.deepEqual(result.outcome, { total: 2, placed: 1, unplaced: 1 });
  const delivery = session.getLayerDelivery(result.layer.id);
  for (const photo of session.getLayerPhotos(result.layer.id)) {
    assert.equal(delivery.byPhotoId[photo.id].status, photo.originalFilename === 'gps.png' ? 'include' : 'not-selected');
  }
  session.clear();
});

for (const workflow of ['source wizard', 'direct positioning']) test(`${workflow}: EXIF GML default respects GMI links and explicit Ikke`, async () => {
  const session = await importExifDraft(['gps.png', 'linked.png', 'line.png', 'excluded.png', 'no-gps.png']);
  const layer = session.createLayer();
  const ticket = session.beginSourceWorkflow(layer.id);
  assert(await session.stageLayerSource(layer.id, gmiFile([
    { hyperlink: 'h:1(link:"linked.png") ' },
    { scope: 'line', tema: 'VL', guid: guid(8), hyperlink: 'h:1(link:"line.png") ' },
  ]), 'gmi'));
  assert(saveStagedSource(session, ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
  const photos = session.getLayerPhotos(layer.id);
  const id = (name) => photos.find((photo) => photo.originalFilename === name).id;
  const excluded = id('excluded.png');
  // Explicitly return to Ikke before accepting the EXIF candidate.
  assert(togglePhotoDelivery(session, layer.id, excluded).ok);
  assert(togglePhotoDelivery(session, layer.id, excluded).ok);
  assert(session.getLayerDelivery(layer.id).byPhotoId[excluded].userChosen);
  const requests = photos.flatMap((photo) => {
    const candidate = photo.spatial.candidates.find((item) => item.kind === 'exif' && item.status === 'viable');
    return candidate ? [{ photoId: photo.id, candidateId: candidate.id, expectedCurrent: photo.spatial.current }] : [];
  });
  assert.equal(requests.length, 4);
  const result = workflow === 'source wizard'
    ? session.applySourceWorkflowPositions(ticket, session.reviewSourceWorkflowPositions(ticket), requests)
    : session.applyPhotoPositioning(layer.id, { kind: 'exif', memberIds: photos.map((photo) => photo.id), requests });
  assert(result.ok);
  // B1.1 (approved contract change): the GMI-linked photo accepts an EXIF position away from its GMI object, so its
  // untouched GMI default becomes an automatic GML transfer that preserves the accepted position.
  assert.deepEqual(new Set(result.deliveryIds), new Set([id('gps.png'), id('linked.png')]));
  assert.deepEqual({ gml: result.delivery.gml, gmi: result.delivery.gmi, keptExplicit: result.delivery.keptExplicit }, { gml: 2, gmi: 0, keptExplicit: 0 });
  const entries = session.getLayerDelivery(layer.id).byPhotoId;
  assert.equal(entries[id('gps.png')].status, 'include');
  assert.equal(entries[id('linked.png')].status, 'transfer');
  assert.equal(entries[id('linked.png')].automatic, true);
  assert.equal(entries[id('line.png')].status, 'keep-link');
  assert.equal(entries[id('line.png')].canInclude, false);
  assert.equal(entries[excluded].status, 'not-selected');
  assert.equal(entries[id('no-gps.png')].status, 'not-selected');
  for (const request of requests) assert.equal(session.getPhoto(request.photoId).spatial.current.basis.candidateId, request.candidateId);
  assert.equal(session.getPhoto(id('no-gps.png')).spatial.current, null);
  session.clear();
});

test('round trip: exported Skråfoto GML positions the nine unplaced photos and assigns GML; the five GMI placements stay GMI', async () => {
  const context = await setup();
  const { session, layer, photos, status, delivery } = context;
  assert.equal(photos().filter((photo) => photo.spatial.current).length, 5, '5 GMI positions');
  assert.equal(photos().filter((photo) => !photo.spatial.current).length, 9, '9 unplaced');
  for (const photo of photos()) assert.equal(status(photo), photo.occurrence ? 'keep-link' : 'not-selected');
  const gmiBefore = new Map(photos().filter((photo) => photo.occurrence).map((photo) => [photo.id, photo]));
  const { ticket, plan, requests, selected } = await stageGml(context, await exportedSkraafotoGml());
  assert.equal(selected.length, 9, 'all nine GML positions match');
  assert(selected.every((row) => row.proposal.kind === 'gml' && row.action === 'place'));
  const result = session.applySourceWorkflowPositions(ticket, plan, requests);
  assert(result.ok);
  session.endSourceWorkflow(ticket);
  assert.deepEqual([...result.deliveryIds].sort(), selected.map((row) => row.photoId).sort());
  for (const photo of photos()) {
    if (photo.occurrence) {
      assert.equal(status(photo), 'keep-link');
      const before = gmiBefore.get(photo.id);
      assert.equal(photo.spatial.current, before.spatial.current, 'GMI placement untouched');
      assert.equal(photo.occurrence.key, before.occurrence.key);
    } else {
      assert.equal(status(photo), 'include', `${photo.originalFilename} is GML`);
      assert.equal(photo.spatial.candidates.find((item) => item.id === photo.spatial.current.basis.candidateId).kind, 'gml');
    }
  }
  const snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.equal(snapshot.counts.includedOccurrences, 9);
  assert.equal(snapshot.counts.retainedOccurrences, 5);
  assert.equal(snapshot.counts.transferOccurrences, 0);
  assert.deepEqual(snapshot.readiness.issues, []);
  assert.equal(delivery().summary.occurrences['not-selected'], 0);
  // Repeat apply of the same reviewed plan is refused and changes nothing.
  const key = snapshot.stateKey;
  assert.equal(session.applySourceWorkflowPositions(ticket, plan, requests).ok, false);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, key);
});

test('GML positioning respects deliberate choices; cancellation and a refused batch change neither positions nor delivery', async () => {
  const context = await setup();
  const { session, layer, photos, status, byName } = context;
  const gml = await exportedSkraafotoGml();
  const deliberate = byName(GML_NAMES[0])[0], keptGmi = photos().find((photo) => photo.occurrence);
  // Deliberate «Ikke»: GML → Ikke by the direct cycle, distinct from the untouched default.
  assert(togglePhotoDelivery(session, layer.id, deliberate.id).ok);
  assert(togglePhotoDelivery(session, layer.id, deliberate.id).ok);
  assert.equal(status(deliberate), 'not-selected');
  assert.equal(session.getLayerDelivery(layer.id).byPhotoId[deliberate.id].userChosen, true);

  // Cancel: the wizard closes after the source is kept and positions are reviewed, without applying them.
  let staged = await stageGml(context, gml);
  const keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  session.endSourceWorkflow(staged.ticket);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore);
  assert(photos().filter((photo) => !photo.occurrence).every((photo) => !photo.spatial.current));

  // A refused batch (one stale request) writes nothing at all.
  staged = reviewPositions(context);
  assert.equal(staged.requests.length, 9);
  const bad = [...staged.requests, { photoId: keptGmi.id, candidateId: 'not-a-candidate' }];
  assert.equal(session.applySourceWorkflowPositions(staged.ticket, staged.plan, bad).ok, false);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore);
  assert(photos().filter((photo) => !photo.occurrence).every((photo) => !photo.spatial.current));

  const result = session.applySourceWorkflowPositions(staged.ticket, staged.plan, staged.requests);
  assert(result.ok);
  session.endSourceWorkflow(staged.ticket);
  assert.equal(status(deliberate), 'not-selected', 'deliberate Ikke preserved');
  assert(deliberate.id !== undefined && !result.deliveryIds.includes(deliberate.id));
  assert.equal(result.deliveryIds.length, 8);
  assert(session.getPhoto(deliberate.id).spatial.current, 'its position is still adopted');
  assert.equal(status(keptGmi), 'keep-link');
});

// Batch 2C changed one rule here: a saved rotation of an untouched GMI default now commits GML like a move away
// (a GMI hyperlink cannot carry a direction). A return to the GMI point without rotation still keeps GMI.
test('a saved move away from the originating GMI point, or a rotation, proposes and commits GML; a return does not', async () => {
  const context = await setup({ shared: true });
  const { session, layer, status, byObject, delivery } = context;
  const kum2 = byObject(guid(1)), kum3 = byObject(guid(2)), kum4 = byObject(guid(3));
  const shared = byObject(guid(0)), sibling = byObject(guid(9));
  assert.equal(shared.assetId, sibling.assetId, 'one photograph, two GMI placements');
  const origin = photoOriginGmiPosition(kum2);
  assert.deepEqual(kum2.spatial.current.position, origin);
  const far = { ...origin, longitude: origin.longitude + 0.0005 };
  // Pure proposal: rotation proposes nothing; within the shared tolerance proposes nothing.
  assert.equal(photoMoveProposesTransfer(kum2, delivery().byPhotoId[kum2.id], far), true);
  assert.equal(photoMoveProposesTransfer(kum2, delivery().byPhotoId[kum2.id], origin), false);
  assert.equal(photoMoveProposesTransfer(kum2, delivery().byPhotoId[kum2.id], { ...origin, longitude: origin.longitude + 1e-8 }), false);

  // Discard: an edit session that ends without saving changes nothing.
  const keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  const discarded = session.beginPhotoEdits(layer.id);
  session.endPhotoEdits(discarded);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore);

  const result = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [
    { photoId: kum2.id, position: far },
    { photoId: kum3.id, degrees: 90 },
    { photoId: kum4.id, position: photoOriginGmiPosition(kum4) },
    { photoId: shared.id, position: { ...photoOriginGmiPosition(shared), latitude: photoOriginGmiPosition(shared).latitude + 0.0005 } },
  ]);
  assert(result.ok);
  assert.deepEqual([...result.transferIds].sort(), [kum2.id, kum3.id, shared.id].sort());
  assert.equal(status(kum2), 'transfer');
  assert.equal(status(kum3), 'transfer', 'rotation alone commits GML (Batch 2C)');
  assert.equal(status(kum4), 'keep-link', 'back at the GMI point keeps GMI');
  assert.equal(status(shared), 'transfer');
  assert.equal(status(sibling), 'keep-link', 'the other placement of the shared photograph is untouched');
  const moved = session.getPhoto(kum2.id);
  assert.equal(moved.occurrence.key, kum2.occurrence.key, 'GMI object relationship kept as provenance');
  assert.deepEqual(moved.spatial.current.position, far);
  const snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.deepEqual(snapshot.transfers.map((item) => item.photoId).sort(), [kum2.id, kum3.id, shared.id].sort());
  assert.equal(snapshot.counts.retainedOccurrences, 3);
  assert(snapshot.assets.transferredAndRetained.includes(shared.assetId));
});

test('moves never override GML/Ikke decisions or an explicit GMI choice; a conflicting save writes nothing', async () => {
  const context = await setup();
  const { session, layer, status, byObject } = context;
  const [k1, k2, k3, k4] = [0, 1, 2, 3].map((index) => byObject(guid(index)));
  const away = (photo) => ({ ...photoOriginGmiPosition(photo), longitude: photoOriginGmiPosition(photo).longitude + 0.001 });
  assert(session.setDeliveryIntent(layer.id, [k1.id], 'exclude').ok);
  assert(session.setDeliveryIntent(layer.id, [k2.id], 'transfer').ok);
  assert(session.setDeliveryIntent(layer.id, [k3.id], 'keep-link').ok, 'explicit GMI');
  const result = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [k1, k2, k3].map((photo) => ({ photoId: photo.id, position: away(photo) })));
  assert(result.ok);
  assert.deepEqual(result.transferIds, []);
  assert.deepEqual([status(k1), status(k2), status(k3)], ['exclude', 'transfer', 'keep-link']);

  // A stale edit session (superseded and changed by another save) commits nothing, including delivery.
  const ticket = session.beginPhotoEdits(layer.id);
  assert(session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: k4.id, degrees: 10 }]).ok);
  // Batch 2C: the rotation itself committed GML; the conflicting save must change nothing after it.
  const statusBefore = status(k4), keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  assert.equal(statusBefore, 'transfer');
  const conflicted = session.applyPhotoEdits(ticket, [{ photoId: k4.id, position: away(k4) }]);
  assert.equal(conflicted.ok, false);
  assert.equal(status(k4), statusBefore);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore);
});

test('unsaved proposals follow staged edits: undo and a return to the GMI point remove them; filters use saved choices', async () => {
  const context = await setup();
  const { session, layer, photos, delivery, byObject } = context;
  const kum1 = byObject(guid(0));
  const origin = photoOriginGmiPosition(kum1);
  const ticket = session.beginPhotoEdits(layer.id);
  let state = createPhotoEditState(ticket);
  const proposals = () => {
    const effective = photos().map((photo) => effectivePhoto(photo, state));
    const ids = new Set(effective.filter((photo) => photo.staged?.position
      && photoMoveProposesTransfer(photo, delivery().byPhotoId[photo.id], photo.spatial.current.position)).map((photo) => photo.id));
    return { ids, shown: photoDeliveryWithProposals(delivery(), ids) };
  };
  state = photoEditReducer(state, { type: 'stage', photoId: kum1.id, field: 'position', value: { ...origin, latitude: origin.latitude + 0.001 } });
  let { ids, shown } = proposals();
  assert.deepEqual([...ids], [kum1.id]);
  assert.equal(shown.byPhotoId[kum1.id].status, 'transfer');
  assert.equal(shown.byPhotoId[kum1.id].proposed, true);
  assert.equal(shown.summary.occurrences.transfer, 1, 'the planning summary follows the proposal');
  assert.equal(shown.stateKey, delivery().stateKey, 'the export snapshot key is the saved one');
  assert.equal(delivery().byPhotoId[kum1.id].status, 'keep-link', 'nothing is committed before Save');
  // The delivery filter still uses saved choices while editing.
  const view = photoWorkspaceView(photos(), { activePhotoId: kum1.id, filter: { ...DEFAULT_PHOTO_FILTER, delivery: 'keep-link' } }, { delivery: delivery() });
  assert(view.rows.some((photo) => photo.id === kum1.id));
  state = photoEditReducer(state, { type: 'undo' });
  assert.equal(proposals().ids.size, 0, 'undo removes the proposal');
  state = photoEditReducer(state, { type: 'stage', photoId: kum1.id, field: 'position', value: origin });
  assert.equal(proposals().ids.size, 0, 'a move back to the GMI point proposes nothing');
  session.endPhotoEdits(ticket);
});

test('delivery filters drop a selected photograph that no longer matches, from the list and the map, at once', async () => {
  const context = await setup();
  const { session, layer, photos, delivery, byObject } = context;
  const kum1 = byObject(guid(0));
  const filter = { ...DEFAULT_PHOTO_FILTER, delivery: 'keep-link' };
  const view = () => photoWorkspaceView(photos(), { activePhotoId: kum1.id, filter }, { delivery: delivery() });
  assert(view().rows.some((photo) => photo.id === kum1.id));
  assert.equal(view().counts.delivery['keep-link'], 5);
  assert(togglePhotoDelivery(session, layer.id, kum1.id).ok);
  const after = view();
  assert.equal(after.rows.some((photo) => photo.id === kum1.id), false);
  assert.equal(after.pinned, null, 'not presented in the pinned selected section');
  assert.equal(after.visibleIds.has(kum1.id), false, 'not kept on the map either');
  assert.equal(after.counts.delivery['keep-link'], 4);
  assert.equal(after.counts.delivery.gml, 1);
  // Other criteria still pin the selection, as before.
  const placement = photoWorkspaceView(photos(), { activePhotoId: kum1.id, filter: { ...DEFAULT_PHOTO_FILTER, placement: 'unplaced' } }, { delivery: delivery() });
  assert.equal(placement.pinned?.id, kum1.id);
  assert.equal(delivery().byPhotoId[kum1.id].status, 'transfer', 'delivery state untouched by the view');
});

// B1.1: accepted positions recalculate automatic delivery decisions in every positioning workflow, with the shared
// tolerance, per occurrence, and never over an explicit choice.
test('B1.1: wizard positions restore an automatic GML transfer at the GMI object; explicit choices are kept and reported', async () => {
  const context = await setup({ shared: true });
  const { session, layer, status, byObject } = context;
  const [k1, k2, k3] = [0, 1, 2].map((index) => byObject(guid(index)));
  const sibling = byObject(guid(9));
  const away = (photo) => ({ ...photoOriginGmiPosition(photo), longitude: photoOriginGmiPosition(photo).longitude + 0.001 });
  const moved = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [k1, k2, k3].map((photo) => ({ photoId: photo.id, position: away(photo) })));
  assert.deepEqual([...moved.transferIds].sort(), [k1.id, k2.id, k3.id].sort());
  assert.equal(moved.delivery.gml, 3);
  assert(session.getLayerDelivery(layer.id).byPhotoId[k1.id].automatic, 'written by the position default');
  assert.equal(status(sibling), 'keep-link', 'the other placement of the repeated photograph is decided on its own');
  assert(session.setDeliveryIntent(layer.id, [k2.id], 'transfer').ok, 'the user confirms GML for k2');

  // The wizard returns all three to their GMI object positions.
  const ticket = session.beginSourceWorkflow(layer.id);
  const plan = session.reviewSourceWorkflowPositions(ticket);
  const requests = [k1, k2, k3].map((photo) => ({ photoId: photo.id, candidateId: plan.rows.find((row) => row.photoId === photo.id).options.find((item) => item.kind === 'gmi').id }));
  const keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  const preview = session.previewSourceWorkflowDelivery(ticket, { plan, requests });
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore, 'the Kontroll preview writes nothing');
  assert.deepEqual({ gml: preview.gml, gmi: preview.gmi, keptExplicit: preview.keptExplicit }, { gml: 0, gmi: 2, keptExplicit: 0 });
  const result = session.commitSourceWorkflow(ticket, { plan, requests });
  assert(result.ok);
  session.endSourceWorkflow(ticket);
  assert.equal(result.receipt.gmiDelivery, preview.gmi, 'Kontroll and Endringer lagret agree');
  assert.deepEqual([status(k1), status(k2), status(k3)], ['keep-link', 'transfer', 'keep-link'], 'the explicit GML choice is kept');

  // An explicit GMI choice moved away is kept and identified for review.
  assert(session.setDeliveryIntent(layer.id, [k1.id], 'keep-link').ok);
  const kept = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: k1.id, position: away(k1) }]);
  assert.deepEqual(kept.transferIds, []);
  assert.equal(kept.delivery.keptExplicit, 1);
  assert.equal(status(k1), 'keep-link');
});

test('B1.1: a cancelled wizard and a refused commit change no delivery decision', async () => {
  const context = await setup();
  const { session, layer, byObject } = context;
  const k1 = byObject(guid(0));
  const away = { ...photoOriginGmiPosition(k1), longitude: photoOriginGmiPosition(k1).longitude + 0.001 };
  assert(session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: k1.id, position: away }]).ok);
  const keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  const ticket = session.beginSourceWorkflow(layer.id);
  const plan = session.reviewSourceWorkflowPositions(ticket);
  const requests = [{ photoId: k1.id, candidateId: plan.rows.find((row) => row.photoId === k1.id).options.find((item) => item.kind === 'gmi').id }];
  assert.equal(session.previewSourceWorkflowDelivery(ticket, { plan, requests }).gmi, 1);
  session.endSourceWorkflow(ticket);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore, 'cancel keeps the automatic GML transfer');
  assert.equal(session.previewSourceWorkflowDelivery(ticket, { plan, requests }), null, 'no preview for an ended workflow');
});

test('B1.1: only distance counts for a move — a new source at a compatible position changes no delivery', () => {
  const origin = { crs: 'EPSG:4326', latitude: 59.9, longitude: 10.7 };
  const photo = { occurrence: { key: 'k', sourceId: 's' }, spatial: { candidates: [{ kind: 'gmi', sourceId: 's', provenance: { key: 'k' }, position: origin }] } };
  const entry = (patch = {}) => ({ linked: true, status: 'keep-link', explicit: false, userChosen: false, canTransfer: true, automatic: false, ...patch });
  assert.equal(photoPositionDeliveryEffect(photo, entry(), { ...origin, longitude: origin.longitude + 1e-8 }), null, 'within the shared tolerance');
  assert.equal(photoPositionDeliveryEffect(photo, entry(), { ...origin, longitude: origin.longitude + 0.001 }), 'transfer');
  assert.equal(photoPositionDeliveryEffect(photo, entry({ status: 'transfer', explicit: true, automatic: true }), origin), 'restore');
  assert.equal(photoPositionDeliveryEffect(photo, entry({ status: 'transfer', explicit: true }), origin), null, 'an explicit GML choice stays');
  assert.equal(photoPositionDeliveryEffect(photo, entry({ status: 'transfer', explicit: true, automatic: true, userChosen: true }), origin), null);
  assert.equal(photoPositionDeliveryEffect(photo, entry({ userChosen: true }), { ...origin, longitude: origin.longitude + 0.001 }), 'kept-explicit');
  assert.equal(photoPositionDeliveryEffect(photo, entry({ canTransfer: false }), { ...origin, longitude: origin.longitude + 0.001 }), 'kept-unavailable');
  assert.equal(photoPositionDeliveryEffect(photo, entry({ status: 'exclude', explicit: true }), { ...origin, longitude: origin.longitude + 0.001 }), null, 'Ikke stays Ikke');
  const unlinked = { linked: false, status: 'not-selected', explicit: false, userChosen: false, canInclude: true };
  assert.equal(photoPositionDeliveryEffect({}, unlinked, origin, { includeUnlinked: true }), 'include');
  assert.equal(photoPositionDeliveryEffect({}, unlinked, origin), null, 'manual placement of an unlinked photo keeps Ikke valgt, as before');
});

// Batch 2C: a confirmed rotation of an untouched GMI default makes the same GMI → GML transition as a move away,
// because a GMI hyperlink cannot carry a direction. Synthetic data only.
test('Batch 2C: rotation-only, move-only and combined edits commit GML; no-op, cancel and explicit GMI keep it; GML carries the direction', async () => {
  const context = await setup();
  const { session, layer, status, byObject, photos, delivery } = context;
  const [k1, k2, k3, k4, k5] = [0, 1, 2, 3, 4].map((index) => byObject(guid(index)));
  const away = (photo) => ({ ...photoOriginGmiPosition(photo), longitude: photoOriginGmiPosition(photo).longitude + 0.001 });
  const keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;

  // Opening and cancelling, and confirming nothing, change no delivery. (The same value as a real saved direction is
  // no rotation: covered by the pure helper test below. Every photo here only has the default placeholder.)
  session.endPhotoEdits(session.beginPhotoEdits(layer.id));
  assert(session.applyPhotoEdits(session.beginPhotoEdits(layer.id), []).ok);
  assert.equal(session.getPhoto(k5.id).direction.current.basis.kind, 'default');
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore);
  assert.deepEqual([k1, k2, k3, k4, k5].map(status), Array(5).fill('keep-link'));

  // Unsaved proposal: a staged rotation proposes GML; staging the saved value back, or undo, removes it.
  const ticket = session.beginPhotoEdits(layer.id);
  let state = createPhotoEditState(ticket);
  const proposed = () => photos().map((photo) => effectivePhoto(photo, state)).filter((photo) => photo.staged?.direction
    && photoPositionDeliveryEffect(photo, delivery().byPhotoId[photo.id], null, { rotated: true }) === 'transfer').map((photo) => photo.id);
  const k1Degrees = session.getPhoto(k1.id).direction.current.degrees;
  state = photoEditReducer(state, { type: 'stage', photoId: k1.id, field: 'direction', value: (k1Degrees + 123) % 360 });
  assert.deepEqual(proposed(), [k1.id]);
  assert.equal(status(k1), 'keep-link', 'nothing is committed before Save');
  state = photoEditReducer(state, { type: 'stage', photoId: k1.id, field: 'direction', value: k1Degrees });
  assert.deepEqual(proposed(), [], 'rotating back to the saved direction proposes nothing');
  state = photoEditReducer(state, { type: 'undo' });
  state = photoEditReducer(state, { type: 'undo' });
  assert.deepEqual(proposed(), [], 'undo back to the start proposes nothing');
  session.endPhotoEdits(ticket);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore, 'a discarded rotation changes nothing');

  // An explicit GMI choice is kept when the photo is rotated.
  assert(session.setDeliveryIntent(layer.id, [k4.id], 'keep-link').ok);
  const result = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [
    { photoId: k1.id, degrees: 123 },
    { photoId: k2.id, position: away(k2) },
    { photoId: k3.id, position: photoOriginGmiPosition(k3), degrees: 200 },
    { photoId: k4.id, degrees: 30 },
  ]);
  assert(result.ok);
  assert.deepEqual([...result.transferIds].sort(), [k1.id, k2.id, k3.id].sort());
  assert.deepEqual([k1, k2, k3, k4, k5].map(status), ['transfer', 'transfer', 'transfer', 'keep-link', 'keep-link']);
  const rotated = session.getPhoto(k1.id);
  assert.equal(rotated.direction.current.degrees, 123);
  assert.equal(rotated.direction.current.basis.kind, 'manual');
  assert.equal(rotated.occurrence.key, k1.occurrence.key, 'the GMI object relationship is kept as provenance');
  assert.equal(rotated.spatial.current, k1.spatial.current, 'a rotation keeps the GMI-sourced position record itself');
  assert.equal(session.getPhoto(k4.id).direction.current.degrees, 30, 'the explicit GMI photo was still rotated');
  // Follow-up rule: 0° given explicitly where only the default placeholder was is a direction (north), so it is GML.
  const zero = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: k5.id, degrees: 0 }]);
  assert.deepEqual(zero.transferIds, [k5.id]);
  // The same value again, now a real saved direction, is no rotation and changes nothing.
  const keyAfterZero = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  assert.deepEqual(session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: k4.id, degrees: 30 }]).transferIds, []);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyAfterZero);

  // A return to the GMI point does not restore GMI for a photo whose direction the user set, so the direction is
  // not silently dropped from the delivery; a moved photo without a set direction is restored as before.
  const back = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [
    { photoId: k1.id, position: photoOriginGmiPosition(k1) },
    { photoId: k2.id, position: photoOriginGmiPosition(k2) },
  ]);
  assert(back.ok);
  assert.deepEqual(back.restoredIds, [k2.id]);
  assert.deepEqual([status(k1), status(k2)], ['transfer', 'keep-link']);

  // The GML export of the transferred occurrences carries the adjusted directions.
  assert(session.fillMissingPhotoValues(layer.id, 'captureTime', '2026-08-01T10:00:00').ok);
  assert(session.fillMissingPhotoValues(layer.id, 'photographer', 'Feltmåler').ok);
  const transfers = session.getPhotoDeliverySnapshot(layer.id).transfers.map((item) => item.photoId).sort();
  assert.deepEqual(transfers, [k1.id, k3.id, k5.id].sort());
  const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layer.id), { profile: 'legacy2019', crs: 'EPSG:25832' },
    { now: () => new Date('2026-11-27T12:00:00Z'), occurrenceIds: transfers });
  assert.deepEqual(plan.errors, []);
  const xml = serializePhotoExport(plan);
  const directions = [...xml.matchAll(/<app:retningsverdi>([^<]+)<\/app:retningsverdi>/g)].map((match) => Number(match[1])).sort((a, b) => a - b);
  assert.deepEqual(directions, [0, 123, 200]);
});

test('Batch 2C: the pure rotation effect follows the move rules for explicit, stored and automatic choices', () => {
  const origin = { crs: 'EPSG:4326', latitude: 59.9, longitude: 10.7 };
  const photo = { occurrence: { key: 'k', sourceId: 's' }, spatial: { candidates: [{ kind: 'gmi', sourceId: 's', provenance: { key: 'k' }, position: origin }] } };
  const rotatedPhoto = { ...photo, direction: { current: { degrees: 90, basis: { kind: 'manual' } } } };
  const entry = (patch = {}) => ({ linked: true, status: 'keep-link', explicit: false, userChosen: false, canTransfer: true, automatic: false, ...patch });
  const automatic = entry({ status: 'transfer', explicit: true, automatic: true });
  assert.equal(photoRotationProposesTransfer(entry()), true);
  assert.equal(photoPositionDeliveryEffect(photo, entry(), null, { rotated: true }), 'transfer', 'rotation only');
  assert.equal(photoPositionDeliveryEffect(photo, entry(), origin, { rotated: true }), 'transfer', 'rotation at the GMI point');
  assert.equal(photoPositionDeliveryEffect(photo, entry(), { ...origin, longitude: origin.longitude + 0.001 }, { rotated: true }), 'transfer');
  assert.equal(photoPositionDeliveryEffect(photo, entry(), null), null, 'no position and no rotation');
  assert.equal(photoPositionDeliveryEffect(photo, entry({ userChosen: true }), null, { rotated: true }), null, 'an explicit GMI choice stays');
  assert.equal(photoPositionDeliveryEffect(photo, entry({ canTransfer: false }), null, { rotated: true }), null);
  assert.equal(photoPositionDeliveryEffect(photo, entry({ status: 'exclude', explicit: true }), null, { rotated: true }), null, 'Ikke stays Ikke');
  assert.equal(photoPositionDeliveryEffect({}, { linked: false, status: 'not-selected', canInclude: true }, null, { rotated: true }), null, 'unlinked photos are unchanged');
  assert.equal(photoPositionDeliveryEffect(photo, automatic, origin), 'restore', 'unchanged: a move back restores');
  assert.equal(photoPositionDeliveryEffect(photo, automatic, origin, { rotated: true }), null, 'a rotated move back keeps GML');
  assert.equal(photoPositionDeliveryEffect(rotatedPhoto, automatic, origin), null, 'a set direction keeps GML');
  assert.equal(photoHasManualDirection(rotatedPhoto), true);
  assert.equal(photoHasManualDirection(photo), false);
  // Shared meaningfulness rule (Edit mode and «Fyll inn manglende»).
  const at = (degrees, kind) => ({ degrees, basis: { kind } });
  assert.equal(photoDirectionChangeIsMeaningful(null, 0), true, 'a missing direction: any value, also 0°');
  assert.equal(photoDirectionChangeIsMeaningful(at(0, 'default'), 0), true, 'the default placeholder is no direction');
  assert.equal(photoDirectionChangeIsMeaningful(at(90, 'manual'), 90), false, 'the same real direction again');
  assert.equal(photoDirectionChangeIsMeaningful(at(90, 'exif'), 90), false);
  assert.equal(photoDirectionChangeIsMeaningful(at(90, 'manual'), 91), true);
  assert.equal(photoDirectionChangeIsMeaningful(at(45.5, 'manual'), 46), true, 'an exact bulk value differs from its rounding');
  for (const invalid of [null, undefined, Number.NaN, Infinity]) assert.equal(photoDirectionChangeIsMeaningful(null, invalid), false);
});

// Batch 2C follow-up: «Fyll inn manglende» with a direction uses the same delivery rule as an Edit-mode rotation.
test('bulk direction: untouched GMI defaults become GML in the same write; explicit, stored GML and unlinked stay; GML carries it', async () => {
  const context = await setup();
  const { session, layer, status, byObject, byName, delivery } = context;
  const [k1, k2, k3, k4, k5] = [0, 1, 2, 3, 4].map((index) => byObject(guid(index)));
  const unlinked = byName(GML_NAMES[0])[0];
  assert(session.setDeliveryIntent(layer.id, [k3.id], 'keep-link').ok, 'explicit GMI');
  assert(session.setDeliveryIntent(layer.id, [k4.id], 'transfer').ok, 'explicit GML');
  const unlinkedBefore = status(unlinked);
  const keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  assert.deepEqual([k1, k2, k5].map((photo) => session.getPhoto(photo.id).direction.current.basis.kind), ['default', 'default', 'default']);

  // Failure and no-op: an invalid value, an empty selection and a non-direction field change no delivery.
  for (const input of [400, -1, 'nord', null]) {
    const refused = session.fillMissingPhotoValues(layer.id, 'direction', input, [k1.id, k2.id]);
    assert.equal(refused.ok, false, String(input));
    assert.equal(refused.transferIds, undefined);
  }
  assert.deepEqual(session.fillMissingPhotoValues(layer.id, 'direction', 45, []).transferIds, []);
  for (const [field, value] of [['photographer', 'Feltmåler'], ['captureTime', '2026-08-01T10:00:00']]) {
    const other = session.fillMissingPhotoValues(layer.id, field, value, [k5.id]);
    assert(other.ok && other.counts.adopted === 1, field);
    assert.equal(other.transferIds, undefined, `${field} has no delivery effect`);
  }
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyBefore);
  assert.equal(session.getPhoto(k1.id).direction.current.basis.kind, 'default', 'nothing was written by the refused fills');

  // One operation, several qualifying photos, a mixed selection.
  const filled = session.fillMissingPhotoValues(layer.id, 'direction', 45, [k1.id, k2.id, k3.id, k4.id, unlinked.id]);
  assert(filled.ok);
  assert.equal(filled.counts.adopted, 5);
  assert.deepEqual([...filled.transferIds].sort(), [k1.id, k2.id].sort());
  assert.equal(filled.delivery.gml, 2);
  assert.deepEqual([status(k1), status(k2), status(k3), status(k4), status(k5)], ['transfer', 'transfer', 'keep-link', 'transfer', 'keep-link']);
  assert.equal(status(unlinked), unlinkedBefore, 'an unlinked photo keeps its delivery state');
  assert.equal(delivery().byPhotoId[k3.id].userChosen || delivery().byPhotoId[k3.id].explicit, true, 'the explicit GMI choice is kept');
  for (const photo of [k1, k2, k3, k4, unlinked]) assert.equal(session.getPhoto(photo.id).direction.current.degrees, 45);
  const filledPhoto = session.getPhoto(k1.id);
  assert.equal(filledPhoto.direction.current.basis.kind, 'manual');
  assert.equal(filledPhoto.occurrence.key, k1.occurrence.key, 'the GMI object relationship is kept as provenance');
  assert.equal(filledPhoto.spatial.current, k1.spatial.current, 'the GMI-sourced position record itself is kept');
  const snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.deepEqual(snapshot.transfers.map((item) => item.photoId).sort(), [k1.id, k2.id, k4.id].sort());

  // Repeating the fill finds nothing missing: no new transfer and no state change.
  const keyAfter = snapshot.stateKey;
  const again = session.fillMissingPhotoValues(layer.id, 'direction', 90, [k1.id, k2.id, k3.id, k4.id, unlinked.id]);
  assert(again.ok);
  assert.equal(again.counts.adopted, 0);
  assert.deepEqual(again.transferIds, []);
  assert.equal(session.getPhotoDeliverySnapshot(layer.id).stateKey, keyAfter);
  assert.equal(session.getPhoto(k1.id).direction.current.degrees, 45);

  // A bulk-filled direction is the user's: a move back to the GMI point does not restore GMI (and drop it);
  // a move away of the untouched k5 still transfers, and its plain return still restores.
  const origin = (photo) => photoOriginGmiPosition(photo);
  const back = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: k1.id, position: origin(k1) },
    { photoId: k5.id, position: { ...origin(k5), longitude: origin(k5).longitude + 0.001 } }]);
  assert(back.ok);
  assert.deepEqual(back.restoredIds, []);
  assert.deepEqual(back.transferIds, [k5.id]);
  assert.equal(status(k1), 'transfer');
  const returned = session.applyPhotoEdits(session.beginPhotoEdits(layer.id), [{ photoId: k5.id, position: origin(k5) }]);
  assert.deepEqual(returned.restoredIds, [k5.id], 'the move rule is unchanged for a photo without a set direction');

  // The gemini-legacy2019 GML of the transferred occurrences carries the filled direction.
  assert(session.fillMissingPhotoValues(layer.id, 'captureTime', '2026-08-01T10:00:00').ok);
  assert(session.fillMissingPhotoValues(layer.id, 'photographer', 'Feltmåler').ok);
  const transfers = session.getPhotoDeliverySnapshot(layer.id).transfers.map((item) => item.photoId).sort();
  assert.deepEqual(transfers, [k1.id, k2.id, k4.id].sort());
  const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layer.id), { profile: 'gemini-legacy2019' },
    { now: () => new Date('2026-11-27T12:00:00Z'), occurrenceIds: transfers });
  assert.deepEqual(plan.errors, []);
  const xml = serializePhotoExport(plan);
  assert.deepEqual([...xml.matchAll(/<app:retningsverdi>([^<]+)<\/app:retningsverdi>/g)].map((match) => Number(match[1])), [45, 45, 45]);
});
