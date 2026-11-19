// FOTO correctness slice 1: automatic delivery defaults (GML positions → GML, moves away from the GMI point → GML)
// and delivery filters reacting at once. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { photoSourcePositionChoices, selectedPhotoSourcePositions } from '../src/lib/photos/photoPositioning.mjs';
import { photoDeliveryWithProposals, photoMoveProposesTransfer, photoOriginGmiPosition, togglePhotoDelivery } from '../src/lib/photos/photoDeliveryChoice.mjs';
import { photoWorkspaceView } from '../src/lib/photos/photoWorkspaceView.mjs';
import { DEFAULT_PHOTO_FILTER } from '../src/lib/photos/photoWorkspaceState.mjs';
import { createPhotoEditState, effectivePhoto, photoEditReducer } from '../src/lib/photos/photoEditSession.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
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
  assert.deepEqual(result.deliveryIds, [id('gps.png')]);
  const entries = session.getLayerDelivery(layer.id).byPhotoId;
  assert.equal(entries[id('gps.png')].status, 'include');
  assert.equal(entries[id('linked.png')].status, 'keep-link');
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

test('a saved move away from the originating GMI point proposes and commits GML; rotation or a return does not', async () => {
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
    { photoId: kum4.id, position: photoOriginGmiPosition(kum4), degrees: 45 },
    { photoId: shared.id, position: { ...photoOriginGmiPosition(shared), latitude: photoOriginGmiPosition(shared).latitude + 0.0005 } },
  ]);
  assert(result.ok);
  assert.deepEqual([...result.transferIds].sort(), [kum2.id, shared.id].sort());
  assert.equal(status(kum2), 'transfer');
  assert.equal(status(kum3), 'keep-link', 'rotation alone keeps GMI');
  assert.equal(status(kum4), 'keep-link', 'back at the GMI point keeps GMI');
  assert.equal(status(shared), 'transfer');
  assert.equal(status(sibling), 'keep-link', 'the other placement of the shared photograph is untouched');
  const moved = session.getPhoto(kum2.id);
  assert.equal(moved.occurrence.key, kum2.occurrence.key, 'GMI object relationship kept as provenance');
  assert.deepEqual(moved.spatial.current.position, far);
  const snapshot = session.getPhotoDeliverySnapshot(layer.id);
  assert.deepEqual(snapshot.transfers.map((item) => item.photoId).sort(), [kum2.id, shared.id].sort());
  assert.equal(snapshot.counts.retainedOccurrences, 4);
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
  const keyBefore = session.getPhotoDeliverySnapshot(layer.id).stateKey;
  const conflicted = session.applyPhotoEdits(ticket, [{ photoId: k4.id, position: away(k4) }]);
  assert.equal(conflicted.ok, false);
  assert.equal(status(k4), 'keep-link');
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
