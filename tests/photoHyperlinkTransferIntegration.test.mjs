// Batch 1B.2B: FOTO/Rettinger integration of an active «Flytt til punktobjekt» transfer, on the real owners
// (Rettinger session registry, FOTO session with the owner-level guard bound, loaded-GMI sources, Validator, delivery
// planner). The transaction itself stays internal and test-only. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { DATE, LOK_SLU, cell, transferFixture, w } from './helpers/photoHyperlinkTransferFixtures.mjs';
import { gmiPhotoAssociations, gmiPointPosition } from '../src/lib/photos/gmiPhotoSource.mjs';
import { buildPhotoMapItems } from '../src/lib/photos/photoMapFeatures.mjs';
import { photoPositionProvenanceKind, photoPositionSourceKind } from '../src/lib/photos/photoMarkerPresentation.mjs';
import { photoWorkspaceView } from '../src/lib/photos/photoWorkspaceView.mjs';
import { photoDeliveryOptions, photoDeliveryToggleTarget, togglePhotoDelivery } from '../src/lib/photos/photoDeliveryChoice.mjs';
import { readErrors } from '../src/lib/photos/photoImportPresentation.mjs';
import { photoHyperlinkTransferView } from '../src/lib/photos/photoHyperlinkTransfer.mjs';
import { PHOTO_TRANSFER_POSITION_TEXT } from '../src/lib/photos/photoHyperlinkTransferEligibility.mjs';
import {
  PHOTO_HYPERLINK_TRANSFER_ACTIVE, PHOTO_HYPERLINK_TRANSFER_LOCK_TEXT, PHOTO_HYPERLINK_TRANSFER_SOURCE_LOCK_TEXT,
  applyPhotoHyperlinkTransfer, bindPhotoHyperlinkTransferGuard, photoHyperlinkTransferLinkLayer, photoHyperlinkTransferPresentation,
  photoHyperlinkTransferScope, photoHyperlinkTransferViews, photoTransferObjectLabel,
} from '../src/lib/photos/photoHyperlinkTransferScope.mjs';
import { PHOTO_LINK_REVIEW_WRITABLE, detectPhotoLinkReview, emptyPhotoLinkReviewChoices, photoLinkReviewDecisions, reducePhotoLinkReviewChoices } from '../src/lib/photos/photoHyperlinkReview.mjs';
import { buildGmiFieldExport, getGmiExportReadiness, validateGmiDataset } from '../src/lib/gmi-edit/index.mjs';
import { captureDeliverySnapshot, buildDeliveryPlan } from '../src/lib/delivery/index.mjs';
import { gmiChangeSetCellViews, gmiChangeSetDependents, gmiChangeSetTableScope, gmiEditMessage, gmiHyperlinkTransferSummary, indexGmiChangedCells, summarizeGmiChangeSet } from '../src/lib/gmiEditView.mjs';
import { saveStagedSource } from './helpers/photoSourceDraft.mjs';

const REFERENCE_DATE = '2026-11-21';
const views = (f) => photoHyperlinkTransferViews({ registry: f.registry, photoSession: f.session, photoLayerId: f.layerId });
const presentationOf = (f) => photoHyperlinkTransferPresentation(views(f), f.session.getLayer(f.layerId));
const shownPhotos = (f) => applyPhotoHyperlinkTransfer(f.photos(), presentationOf(f));
const occurrenceOf = (f, filename, number) => f.photos().find((photo) => photo.originalFilename === filename && photo.occurrence?.objectKey === f.object(number).objectKey);
const guarded = async (fixture) => { const f = await fixture(); bindPhotoHyperlinkTransferGuard(f.session, f.registry); return f; };
const refused = (result) => [result.ok, result.error];

test('LOK Punkt 293 -> SLU Punkt 108: FOTO shows the recipient as proposed owner at its GMI position; the original stays for comparison', async () => {
  const f = await guarded(LOK_SLU);
  const fotoBefore = f.fotoState();
  assert.equal(views(f), null, 'no active transfer, no proposed FOTO view');
  assert.equal(applyPhotoHyperlinkTransfer(f.photos(), presentationOf(f)).length, f.photos().length);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const transfers = views(f);
  assert.deepEqual(transfers.views.map((view) => view.status), ['current']);
  const movedId = transfers.views[0].occurrences[0].photoId;
  const live = f.photos(), shown = applyPhotoHyperlinkTransfer(live, presentationOf(f));
  // One entry per occurrence, same order, no duplicate: only the moved one is a new (overlay) object.
  assert.deepEqual(shown.map((photo) => photo.id), live.map((photo) => photo.id));
  const moved = shown.find((photo) => photo.id === movedId);
  for (const [index, photo] of shown.entries()) {
    if (photo.id === movedId) continue;
    assert.equal(photo.hyperlinkTransfer, undefined);
    assert.equal(photo, live[index], 'unrelated photos are the session objects themselves');
  }
  // Proposed owner: the recipient's Tema and identifier, not the original LOK.
  const recipient = f.object(108), lok = f.object(293);
  assert.equal(moved.occurrence.objectKey, recipient.objectKey);
  assert.match(photoTransferObjectLabel(moved.occurrence.object), /^SLU\b.*Punkt 108$/);
  assert.doesNotMatch(photoTransferObjectLabel(moved.occurrence.object), /LOK/);
  // Proposed position: the recipient's authoritative GMI position, GMI provenance, the distinct transfer provenance.
  assert.deepEqual(moved.spatial.current.position, gmiPointPosition(f.source(), recipient).position);
  assert.equal(moved.spatial.current.basis.kind, 'hyperlink-transfer');
  assert.equal(photoPositionProvenanceKind(moved), 'gmi');
  assert.equal(photoPositionSourceKind(moved), 'gmi');
  assert.equal(moved.hyperlinkTransfer.status, 'proposed');
  assert.equal(moved.hyperlinkTransfer.provenance.kind, 'hyperlink-transfer');
  assert.equal(moved.hyperlinkTransfer.provenance.method, 'user-approved-hyperlink-transfer');
  assert.equal(moved.hyperlinkTransfer.provenance.approvedAt, DATE.toISOString());
  // Original kept for comparison: owner, accepted position and the source's GMI position.
  assert.equal(moved.hyperlinkTransfer.original.occurrence.objectKey, lok.objectKey);
  assert.equal(moved.hyperlinkTransfer.original.current, null);
  assert.deepEqual(moved.hyperlinkTransfer.originalGmiPosition, gmiPointPosition(f.source(), lok).position);
  // The accepted FOTO record is unchanged: the overlay is presentation only.
  const accepted = f.session.getPhoto(movedId);
  assert.equal(accepted.occurrence.objectKey, lok.objectKey);
  assert.equal(accepted.spatial.current, null);
  assert.equal(f.fotoState(), fotoBefore);
  // Map: exactly one marker for the moved occurrence, at the recipient (the main map uses the same overlay getter).
  const layer = f.session.getLayer(f.layerId);
  const items = buildPhotoMapItems([layer], (id) => applyPhotoHyperlinkTransfer(f.session.getLayerPhotos(id), presentationOf(f)));
  assert.equal(new Set(items.map((item) => item.photo.id)).size, items.length);
  const recipientPosition = gmiPointPosition(f.source(), recipient).position;
  assert.deepEqual(items.filter((item) => item.photo.id === movedId).map((item) => item.feature.geometry.coordinates),
    [[recipientPosition.longitude, recipientPosition.latitude]]);
  // Koblinger: the proposed ledger names the recipient; the accepted ledger still names the original owner.
  const linkLayer = photoHyperlinkTransferLinkLayer(layer, transfers);
  assert.deepEqual(gmiPhotoAssociations(linkLayer, movedId).map((link) => link.object.objectKey), [recipient.objectKey]);
  assert.deepEqual(gmiPhotoAssociations(layer, movedId).map((link) => link.object.objectKey), [lok.objectKey]);
  // List: the same rows; the moved occurrence is now placed (proposed) and nothing is counted twice.
  const view = photoWorkspaceView(shown);
  assert.equal(view.rows.length, shown.length);
  assert.equal(view.counts.placed, 1);
});

test('the proposed view refreshes on commit, undo, redo and discard, and is derived once per FOTO/Rettinger change', async () => {
  const f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const first = views(f);
  assert.equal(views(f), first, 'unchanged owners: the cached derivation');
  const movedId = first.views[0].occurrences[0].photoId;
  assert(f.registry.undo(f.handle).ok);
  assert.equal(views(f), null);
  assert.equal(shownPhotos(f).find((photo) => photo.id === movedId).occurrence.objectKey, f.object(293).objectKey);
  assert.equal(f.session.getLayerDelivery(f.layerId).byPhotoId[movedId].transferLocked, undefined, 'the lock is lifted by undo');
  assert(f.registry.redo(f.handle).ok);
  const redone = views(f);
  assert.notEqual(redone, first);
  assert.equal(redone.views[0].status, 'current');
  assert.equal(shownPhotos(f).find((photo) => photo.id === movedId).occurrence.objectKey, f.object(108).objectKey);
  assert.equal(f.session.getLayerDelivery(f.layerId).byPhotoId[movedId].transferLocked, true);
  assert(f.registry.discard(f.handle, f.history().changeSets.at(-1).id).ok);
  assert.equal(views(f), null);
  assert.equal(f.history().changeSets.length, 0);
});

test('several transfers and shared photographs: each moved occurrence is shown once on its recipient; siblings keep their object and are locked', async () => {
  const f = await guarded(() => transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_SHARED.png'), w(2, 'SYNT_OWN.png')) },
    { number: 108, fcode: 'SLU', hyperlink: '' },
    { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_SHARED.png')) },
    { number: 13, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_TOP.png')) },
    { number: 14, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_FREE.png')) },
  ], { names: ['SYNT_SHARED.png', 'SYNT_OWN.png', 'SYNT_TOP.png', 'SYNT_FREE.png'] }));
  const fotoBefore = f.fotoState();
  const first = f.commit([f.move(293, 'SYNT_SHARED.png', 108), f.move(13, 'SYNT_TOP.png', 14)]);
  assert.equal(first.ok, true, JSON.stringify(first));
  const sharedOnLok = occurrenceOf(f, 'SYNT_SHARED.png', 293), sharedOnKum = occurrenceOf(f, 'SYNT_SHARED.png', 12);
  let shown = shownPhotos(f);
  const byId = new Map(shown.map((photo) => [photo.id, photo]));
  assert.equal(byId.get(sharedOnLok.id).occurrence.objectKey, f.object(108).objectKey);
  assert.equal(byId.get(sharedOnKum.id).occurrence.objectKey, f.object(12).objectKey, 'the shared photo stays on its other object');
  assert.deepEqual([byId.get(sharedOnKum.id).hyperlinkTransfer.status, byId.get(sharedOnKum.id).hyperlinkTransfer.locked], ['sibling', true]);
  assert.equal(byId.get(occurrenceOf(f, 'SYNT_TOP.png', 13).id).occurrence.objectKey, f.object(14).objectKey);
  assert.equal(byId.get(occurrenceOf(f, 'SYNT_FREE.png', 14).id).hyperlinkTransfer, undefined);
  assert.equal(shown.length, f.photos().length);
  // A later (cumulative) transfer is still possible with the guard bound: the transaction never writes FOTO.
  const second = f.commit([f.move(293, 'SYNT_OWN.png', 108)]);
  assert.equal(second.ok, true, JSON.stringify(second));
  shown = shownPhotos(f);
  assert.deepEqual(shown.filter((photo) => photo.hyperlinkTransfer?.status === 'proposed').map((photo) => photo.originalFilename).sort(),
    ['SYNT_OWN.png', 'SYNT_SHARED.png', 'SYNT_TOP.png']);
  // The sibling is protected like the moved occurrence; an unrelated photo is not.
  assert.deepEqual(refused(f.session.setDeliveryIntent(f.layerId, [sharedOnKum.id], 'transfer')), [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE]);
  assert.equal(f.session.setDeliveryIntent(f.layerId, [occurrenceOf(f, 'SYNT_FREE.png', 14).id], 'transfer').ok, true);
  assert.equal(views(f).views[0].status, 'current', 'an unrelated delivery choice does not invalidate the transfer');
  // Undo the second transfer: the first is shown again exactly.
  assert(f.registry.undo(f.handle).ok);
  assert.equal(shownPhotos(f).find((photo) => photo.originalFilename === 'SYNT_OWN.png').occurrence.objectKey, f.object(293).objectKey);
  assert.equal(shownPhotos(f).find((photo) => photo.id === sharedOnLok.id).occurrence.objectKey, f.object(108).objectKey);
  assert.notEqual(f.fotoState(), fotoBefore, 'only the explicit unrelated delivery choice changed FOTO');
});

test('Rettinger history presents a transfer as a photograph hyperlink transfer with its objects and reference count', async () => {
  const f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  f.stageField(2, 'Syntetisk merknad');
  assert(f.commit([f.move(293, 'SYNT_LOK_C.png', 108)]).ok);
  const inspected = f.registry.inspect(f.handle);
  const [t1, field, t2] = inspected.changeSets;
  assert.deepEqual(inspected.changeSets.map((entry) => entry.origin), ['photo-hyperlink-transfer', 'object-editor', 'photo-hyperlink-transfer']);
  const s1 = gmiHyperlinkTransferSummary(t1), s2 = gmiHyperlinkTransferSummary(t2);
  assert.deepEqual(s1.rows.map((row) => [row.filenames, row.from.label, row.to.label, row.references]), [[['SYNT_LOK_B.png'], 'Punkt 293', 'Punkt 108', 1]]);
  assert.deepEqual([s1.referencesLabel, s1.objectsLabel, s1.earlierTransfers], ['1 bildereferanse flyttet', '2 punkter', 0]);
  assert.deepEqual([s2.transfers, s2.newTransfers, s2.earlierTransfers, s2.referencesLabel], [2, 1, 1, '2 bildereferanser flyttet']);
  // Not an empty field correction: the S_HYPERLINK cells are its fields, original against proposed.
  const summary = summarizeGmiChangeSet(t1);
  assert.deepEqual([summary.title, summary.fields, summary.objects], ['Flytt bildelenke til punktobjekt', ['S_HYPERLINK'], 2]);
  const effective = indexGmiChangedCells(inspected.cells.changed).byKey;
  const cells = gmiChangeSetCellViews(t1, effective);
  assert.deepEqual(cells.map((cell) => [cell.field, cell.superseded]), [['S_HYPERLINK', true], ['S_HYPERLINK', true]], 'the later cumulative transfer supersedes it');
  assert(cells.every((cell) => cell.original !== cell.next));
  assert.deepEqual(gmiChangeSetCellViews(t2, effective).map((cell) => cell.superseded), [false, false]);
  // Ordinary corrections are unchanged and keep their place in the history.
  assert.equal(gmiHyperlinkTransferSummary(field), null);
  assert.deepEqual(summarizeGmiChangeSet(field).fields, ['Merknad']);
  assert(gmiChangeSetDependents(inspected.changeSets, t1.id).some((entry) => entry.id === t2.id));
  // Undo/redo/discard explain themselves in Norwegian.
  const refusal = f.registry.discard(f.handle, t1.id);
  assert.equal(refusal.code, 'transfer-set-has-later-transfers');
  assert.match(gmiEditMessage(refusal.code), /senere flytting/);
  assert(f.registry.undo(f.handle).ok);
  assert.deepEqual(f.registry.inspect(f.handle).changeSets.map((entry) => entry.id), [t1.id, field.id]);
  assert.equal(f.registry.inspect(f.handle).status.redoCount, 1);
});

test('Batch 1B.4B: «Vis detaljer» shows the geometry a history entry changed; a transfer changes points only', async () => {
  const f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  f.stageField(2, 'Syntetisk merknad');
  const [transfer, field] = f.registry.inspect(f.handle).changeSets;
  assert.equal(gmiHyperlinkTransferSummary(transfer).objectsLabel, '2 punkter');
  assert.equal(gmiChangeSetTableScope(transfer), 'point', 'the two S_HYPERLINK point cells select Punkter');
  assert.equal(gmiChangeSetTableScope(field), 'point');
  // Ordinary entries: a line-only correction selects Ledninger; a mixed or empty entry keeps the current tab.
  assert.equal(gmiChangeSetTableScope({ cells: [{ scope: 'line', sourceIndex: 0 }, { scope: 'line', sourceIndex: 4 }] }), 'line');
  assert.equal(gmiChangeSetTableScope({ cells: [{ scope: 'line', sourceIndex: 0 }, { scope: 'point', sourceIndex: 1 }] }), null);
  assert.equal(gmiChangeSetTableScope({ cells: [] }), null);
  assert.equal(gmiChangeSetTableScope(null), null);
});

test('conflicting FOTO delivery choices are refused for transferred photographs, unrelated photographs stay available', async () => {
  const f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const movedId = views(f).views[0].occurrences[0].photoId, other = occurrenceOf(f, 'SYNT_KUM_1.png', 12).id;
  const before = f.fotoState();
  for (const intent of ['transfer', 'exclude']) {
    const result = f.session.setDeliveryIntent(f.layerId, [movedId], intent);
    assert.deepEqual([result.ok, result.error, result.invalidIds, result.message], [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE, [movedId], PHOTO_HYPERLINK_TRANSFER_LOCK_TEXT]);
  }
  assert.deepEqual(refused(f.session.setPhotoDeliveryExclusion(f.layerId, [movedId], { scope: 'photo', include: false })), [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE]);
  const entry = f.session.getLayerDelivery(f.layerId).byPhotoId[movedId];
  assert.equal(entry.transferLocked, true);
  assert(photoDeliveryOptions(entry).every((option) => option.disabled));
  assert.equal(photoDeliveryToggleTarget(entry), null);
  const toggled = togglePhotoDelivery(f.session, f.layerId, movedId);
  assert.deepEqual([toggled.ok, toggled.reason], [false, PHOTO_HYPERLINK_TRANSFER_LOCK_TEXT]);
  assert.equal(f.fotoState(), before, 'nothing written');
  assert.equal(f.session.getPhotoDeliverySnapshot(f.layerId).stateKey, JSON.parse(before).delivery, 'the lock is not part of the delivery state');
  assert.equal(f.session.setDeliveryIntent(f.layerId, [other], 'transfer').ok, true, 'an unrelated photograph is not locked');
  assert(f.registry.undo(f.handle).ok);
  assert.equal(f.session.setDeliveryIntent(f.layerId, [movedId], 'transfer').ok, true, 'undo in Rettinger lifts the lock');
});

test('placement and direction changes of transferred photographs are refused at the owner; the edit session stays open', async () => {
  const f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const moved = f.session.getPhoto(views(f).views[0].occurrences[0].photoId), other = occurrenceOf(f, 'SYNT_KUM_1.png', 12);
  const before = f.fotoState();
  const position = { crs: 'EPSG:4326', longitude: 10.4, latitude: 59.2 };
  const ticket = f.session.beginPhotoEdits(f.layerId);
  for (const change of [{ photoId: moved.id, position }, { photoId: moved.id, degrees: 90 }]) {
    const result = f.session.applyPhotoEdits(ticket, [change]);
    assert.deepEqual([result.ok, result.error, result.lockedIds], [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE, [moved.id]]);
    assert.equal(f.session.photoEditsAreLive(ticket), true);
  }
  assert.deepEqual(f.session.acceptCandidates(f.layerId, [{ photoId: moved.id, candidateId: `gmi-position:${moved.occurrence.key}` }]), []);
  const positioning = f.session.applyPhotoPositioning(f.layerId, { kind: 'exif', memberIds: f.session.getLayer(f.layerId).photoIds,
    requests: [{ photoId: moved.id, candidateId: `${moved.assetId}:exif`, expectedCurrent: null }] });
  assert.deepEqual(refused(positioning), [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE]);
  assert.equal(f.fotoState(), before);
  // Unrelated photographs keep every action.
  assert.equal(f.session.applyPhotoEdits(ticket, [{ photoId: other.id, position }]).ok, true);
  assert.deepEqual(f.session.acceptCandidates(f.layerId, [{ photoId: other.id, candidateId: `gmi-position:${other.occurrence.key}` }]), [other.id]);
  assert.equal(views(f).views[0].status, 'current');
});

test('rechecking, rebinding, removing or re-associating the transfer source is refused; an unrelated source can still be added', async () => {
  const f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const source = f.source(), movedId = views(f).views[0].occurrences[0].photoId;
  const before = f.fotoState();
  // Legacy recheck entry point: the wizard shows the refusal where the review would have been.
  assert.equal(f.session.recheckLayerSource(f.layerId, source.id), false);
  assert.equal(f.session.getSnapshot().sourceReviews[f.layerId].errorCode, PHOTO_HYPERLINK_TRANSFER_ACTIVE);
  assert.equal(readErrors[PHOTO_HYPERLINK_TRANSFER_ACTIVE], PHOTO_HYPERLINK_TRANSFER_SOURCE_LOCK_TEXT);
  f.session.cancelLayerSourceReview(f.layerId);
  // Recheck or rebind from the loaded GMI layer.
  const ticket = f.sources.begin('survey');
  assert.equal(await f.session.stageLayerSource(f.layerId, { binding: ticket.binding, read: () => f.sources.read(ticket), isLive: () => f.sources.isLive(ticket.binding) }, 'gmi'), false);
  assert.equal(f.session.getSnapshot().sourceReviews[f.layerId].errorCode, PHOTO_HYPERLINK_TRANSFER_ACTIVE);
  f.session.cancelLayerSourceReview(f.layerId);
  // Removal, staged in the wizard or direct.
  const workflow = f.session.beginSourceWorkflow(f.layerId);
  const removal = f.session.stageSourceWorkflowRemoval(workflow, source.id);
  assert.deepEqual([removal.ok, removal.error, removal.message], [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE, PHOTO_HYPERLINK_TRANSFER_SOURCE_LOCK_TEXT]);
  assert.equal(f.session.removeGmiSource(f.layerId, source.id, { confirmed: true }), false);
  // A second GMI file that would add an occurrence of the transferred photograph is refused when staged.
  assert(await f.session.stageLayerSource(f.layerId, gmiFile([{ tema: 'KUM', hyperlink: 'h:1(link:"SYNT_LOK_B.png") ' }], 'second.gmi'), 'gmi'));
  const blocked = f.session.stageSourceWorkflowSource(workflow, f.session.getSnapshot().sourceReviews[f.layerId]);
  assert.deepEqual(refused(blocked), [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE]);
  f.session.cancelLayerSourceReview(f.layerId);
  assert.equal(f.fotoState(), before, 'nothing written');
  // Position review offers nothing for the transferred photograph, and a forged request is refused at the save.
  const plan = f.session.reviewSourceWorkflowPositions(workflow);
  const row = plan.rows.find((entry) => entry.photoId === movedId);
  assert.deepEqual([row.transferLocked, row.options.length, row.defaultChoice], [true, 0, '']);
  assert(plan.rows.filter((entry) => entry.photoId !== movedId).every((entry) => !entry.transferLocked));
  assert.deepEqual(refused(f.session.commitSourceWorkflow(workflow, { plan, requests: [{ photoId: movedId, candidateId: 'forged' }] })), [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE]);
  // An unrelated GMI source (another photograph) is added through the same wizard transaction.
  assert(await f.session.stageLayerSource(f.layerId, gmiFile([{ tema: 'KUM', hyperlink: 'h:1(link:"SYNT_KUM_1.png") ' }], 'third.gmi'), 'gmi'));
  const added = saveStagedSource(f.session, workflow, f.session.getSnapshot().sourceReviews[f.layerId]);
  assert.equal(added.ok, true, JSON.stringify(added));
  f.session.endSourceWorkflow(workflow);
  assert.equal(f.session.getLayer(f.layerId).spatialSources.filter((item) => item.kind === 'gmi').length, 2);
  assert.equal(views(f).views[0].status, 'current', 'the transfer stays verified');
  // After undo the source is free again.
  assert(f.registry.undo(f.handle).ok);
  assert.equal(f.session.recheckLayerSource(f.layerId, source.id), true);
});

test('removing transferred photographs or their FOTO layer is refused; unrelated photographs can be removed; a failing guard fails closed', async () => {
  const f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const movedId = views(f).views[0].occurrences[0].photoId, other = occurrenceOf(f, 'SYNT_KUM_1.png', 12).id;
  const members = f.session.getLayer(f.layerId).photoIds;
  assert.deepEqual(f.session.removeLayerPhotos(f.layerId, [movedId, other], { confirmed: true }), [], 'all or nothing');
  assert.deepEqual(f.session.removeLayerAssets(f.layerId, [f.assetOf('SYNT_LOK_B.png')], { confirmed: true }), []);
  assert.equal(f.session.getLayer(f.layerId).photoIds, members);
  assert.equal(f.session.deleteLayer(f.layerId), false);
  assert(f.session.getLayer(f.layerId));
  const lock = f.session.getHyperlinkTransferLock(f.layerId);
  assert.deepEqual([lock.photoIds, lock.sourceIds], [[movedId], [f.source().id]]);
  assert.deepEqual(f.session.removeLayerPhotos(f.layerId, [other], { confirmed: true }), [other]);
  assert.equal(views(f).views[0].status, 'current');
  // A guard that cannot answer refuses rather than allowing a possibly conflicting write.
  const previous = f.session.setHyperlinkTransferGuard(() => { throw new Error('registry unavailable'); });
  const unrelated = f.photos().find((photo) => photo.originalFilename === 'SYNT_LOK_A.png');
  assert.deepEqual(refused(f.session.setDeliveryIntent(f.layerId, [unrelated.id], 'transfer')), [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE]);
  f.session.setHyperlinkTransferGuard(previous);
  assert(f.registry.undo(f.handle).ok);
  assert.equal(f.session.getHyperlinkTransferLock(f.layerId), null);
  assert.equal(f.session.deleteLayer(f.layerId), true);
});

test('the read-only review applies the transaction\'s accepted-position and occurrence rules', async () => {
  const review = (f) => {
    const model = detectPhotoLinkReview({ source: f.source(), photos: f.photos(), delivery: f.session.getLayerDelivery(f.layerId), liveSource: true });
    return (filename, from, to) => {
      const row = model.rows.find((entry) => entry.parserId === from), group = row.groups.find((entry) => entry.assetId === f.assetOf(filename));
      let choices = reducePhotoLinkReviewChoices(emptyPhotoLinkReviewChoices(), { type: 'select', objectKey: row.objectKey, groupKey: group.key, selected: true }, model);
      choices = reducePhotoLinkReviewChoices(choices, { type: 'target', objectKey: row.objectKey, groupKey: group.key, targetKey: f.object(to).objectKey }, model);
      return photoLinkReviewDecisions(model, choices)[0];
    };
  };
  // A manual placement exactly at the source point is still an explicit choice: «Må avklares», and the transaction agrees.
  let f = await LOK_SLU();
  const lokB = occurrenceOf(f, 'SYNT_LOK_B.png', 293);
  assert(f.session.applyPhotoEdits(f.session.beginPhotoEdits(f.layerId), [{ photoId: lokB.id, position: gmiPointPosition(f.source(), f.object(293)).position }]).ok);
  let decision = review(f)('SYNT_LOK_B.png', 293, 108);
  assert.equal(decision.resolved, false);
  assert.deepEqual(decision.blocking.filter((entry) => entry.code.startsWith('accepted-position')).map((entry) => [entry.code, entry.text]),
    [['accepted-position', PHOTO_TRANSFER_POSITION_TEXT['accepted-position']]]);
  let result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]);
  assert.equal(result.ok, false);
  assert((result.blockers || []).some((entry) => entry.code === 'accepted-position'), JSON.stringify(result));
  // A GMI-derived placement at the source object is «Avklart», and the transaction commits it.
  f = await transferFixture([{ number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_P1.png')) }, { number: 108, fcode: 'SLU', hyperlink: '' }],
    { names: ['SYNT_P1.png'], placeAtGmi: true });
  decision = review(f)('SYNT_P1.png', 293, 108);
  assert.equal(decision.resolved, true, JSON.stringify(decision.blocking));
  assert.equal(f.commit([f.move(293, 'SYNT_P1.png', 108)]).ok, true);
  // A shared photograph placed at its other object: blocked by both, with its own explanation.
  const shared = () => transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_SHARED.png')) }, { number: 108, fcode: 'SLU', hyperlink: '' },
    { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_SHARED.png')) },
  ], { names: ['SYNT_SHARED.png'], placeAtGmi: true });
  f = await shared();
  decision = review(f)('SYNT_SHARED.png', 293, 108);
  assert(decision.blocking.some((entry) => entry.code === 'accepted-position-other' && entry.text === PHOTO_TRANSFER_POSITION_TEXT['accepted-position-other']));
  result = f.commit([f.move(293, 'SYNT_SHARED.png', 108)]);
  assert.equal(result.ok, false);
  // No FOTO occurrence on the source object (removed in FOTO, the photograph kept by its other occurrence): blocked by both.
  f = await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_SHARED.png')) }, { number: 108, fcode: 'SLU', hyperlink: '' },
    { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_SHARED.png')) },
  ], { names: ['SYNT_SHARED.png'] });
  assert.deepEqual(f.session.removeLayerPhotos(f.layerId, [occurrenceOf(f, 'SYNT_SHARED.png', 293).id], { confirmed: true }).length, 1);
  decision = review(f)('SYNT_SHARED.png', 293, 108);
  assert(decision.blocking.some((entry) => entry.code === 'photo-occurrence-missing'), JSON.stringify(decision.blocking));
  result = f.commit([f.move(293, 'SYNT_SHARED.png', 108)]);
  assert.equal(result.ok, false, JSON.stringify(result));
});

test('stale or invalid proposed FOTO views are never shown as proposed; the lock stays until undo in Rettinger', async () => {
  // FOTO changed after the commit (a write that bypassed the guard): conflict.
  let f = await LOK_SLU();
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const movedId = views(f).views[0].occurrences[0].photoId;
  assert(f.session.setDeliveryIntent(f.layerId, [movedId], 'transfer').ok);
  bindPhotoHyperlinkTransferGuard(f.session, f.registry);
  assert.equal(views(f).views[0].status, 'conflict');
  let shown = shownPhotos(f).find((photo) => photo.id === movedId);
  assert.deepEqual([shown.hyperlinkTransfer.status, shown.hyperlinkTransfer.locked], ['conflict', true]);
  assert.equal(shown.occurrence.objectKey, f.object(293).objectKey, 'fail closed: the original association is shown');
  assert.match(shown.hyperlinkTransfer.text, /Rettinger/);
  assert.equal(f.session.setDeliveryIntent(f.layerId, [movedId], 'keep-link').ok, false);
  assert(f.registry.undo(f.handle).ok);
  assert.equal(views(f), null);
  // The FOTO source is no longer live-bound: the view cannot be read, nothing proposed is shown, the guard still holds.
  f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  f.session.reconcileLoadedGmiBindings(() => false);
  assert.equal(photoHyperlinkTransferView(f.owners).status, 'unavailable');
  shown = shownPhotos(f).find((photo) => photo.originalFilename === 'SYNT_LOK_B.png');
  assert.deepEqual([shown.hyperlinkTransfer.status, shown.occurrence.objectKey], ['unavailable', f.object(293).objectKey]);
  assert.equal(photoHyperlinkTransferScope(f.registry, f.layerId).active, true);
  assert.equal(f.session.deleteLayer(f.layerId), false);
});

test('Validator evaluates the actual Foreslått dataset; undo and redo restore the previous and the transferred results', async () => {
  const f = await guarded(LOK_SLU);
  const originalBytes = Buffer.from(f.registry.originalBytes(f.handle).bytes);
  const originalLinks = f.layers.survey.data.points.map((point) => point.attributes.S_HYPERLINK);
  const findings = (run) => run.ruleResults.flatMap((entry) => entry.findings.map((finding) => [entry.rule.ruleId, finding.objectRef?.sourceIndex ?? null, finding.reasonCode, finding.canonicalFieldId ?? null]));
  const before = f.registry.revalidate(f.handle, { referenceDate: REFERENCE_DATE });
  const statuses = f.publications.length;
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  assert.equal(f.publications.length, statuses + 1, 'one Rettinger publication: the revision signal');
  const revision = f.registry.revision(f.handle);
  assert.equal(revision.hyperlinkTransfer.transfers, 1);
  const run = f.registry.revalidate(f.handle, { referenceDate: REFERENCE_DATE });
  // Foreslått contains the transferred hyperlink; the original is unchanged.
  assert.doesNotMatch(run.proposed.dataset.points[0].attributes.S_HYPERLINK, /SYNT_LOK_B/);
  assert.match(run.proposed.dataset.points[1].attributes.S_HYPERLINK, /SYNT_LOK_B\.png/);
  assert.deepEqual(f.layers.survey.data.points.map((point) => point.attributes.S_HYPERLINK), originalLinks);
  assert.equal(Buffer.compare(Buffer.from(f.registry.originalBytes(f.handle).bytes), originalBytes), 0);
  // The revised run is the ordinary Validator run of that dataset: nothing is marked corrected by the transfer.
  assert.equal(run.revised, validateGmiDataset(run.proposed.dataset, { layerId: 'survey', referenceDate: REFERENCE_DATE }));
  assert.deepEqual(findings(run.original), findings(before.original));
  assert.notEqual(run.revised.datasetRevision, run.original.datasetRevision);
  const transferred = findings(run.revised);
  // Undo: the previous Foreslått result; redo: the transferred one, at the same revision.
  assert(f.registry.undo(f.handle).ok);
  const undone = f.registry.revalidate(f.handle, { referenceDate: REFERENCE_DATE });
  assert.equal(undone.proposed.identical, true);
  assert.deepEqual(findings(undone.revised), findings(before.revised));
  assert.equal(f.registry.revision(f.handle).hyperlinkTransfer, null);
  assert(f.registry.redo(f.handle).ok);
  const redone = f.registry.revalidate(f.handle, { referenceDate: REFERENCE_DATE });
  assert.equal(redone.revised.datasetRevision, run.revised.datasetRevision);
  assert.deepEqual(findings(redone.revised), transferred);
});

// Batch 1B.3A (deliberate contract update): the delivery path composes a verified transfer in every mode; the
// unattested low-level field export still refuses. Batch 1B.4A (deliberate contract update): the review dialog saves
// through photoHyperlinkReviewSave only (scanned in photoHyperlinkTransferTransaction.test.mjs); no other FOTO or
// Rettinger surface reaches the transaction.
test('exports compose an active transfer only through the verified delivery path; only the review save reaches the transaction', async () => {
  const f = await guarded(LOK_SLU);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  assert.equal((await buildGmiFieldExport(f.registry, f.handle, { date: DATE })).code, 'hyperlink-transfer-unverified');
  assert(getGmiExportReadiness(f.registry, f.handle).blocking.includes('hyperlink-transfer-unverified'));
  for (const mode of ['gmi-only', 'photos-only', 'split', 'combined']) {
    // Kun GML med bilder: the previously unplaced moved photograph needs the explicit inclusion (verification refinement).
    const snapshot = captureDeliverySnapshot({ mode, registry: f.registry, handle: mode === 'photos-only' ? undefined : f.handle,
      photoSession: f.session, photoLayerId: mode === 'gmi-only' ? undefined : f.layerId, includeTransferredUnplaced: mode === 'photos-only' });
    const plan = await buildDeliveryPlan(snapshot, { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: syntheticContext }, { now: () => DATE });
    assert.deepEqual([plan.status, plan.errors.map((entry) => entry.code)], ['ready', []], mode);
  }
  assert.equal(PHOTO_LINK_REVIEW_WRITABLE, true);
  const root = new URL('../src/', import.meta.url);
  const dialog = await readFile(new URL('components/photos/PhotoHyperlinkReviewDialog.js', root), 'utf8');
  assert(!/commitPhotoHyperlinkTransfer|commitHyperlinkTransfer\(/.test(dialog), 'the dialog saves through the save module only');
  for (const file of ['app/page.js', 'components/MapInner.js', 'components/photos/usePhotoHyperlinkTransfers.js', 'components/photos/PhotoWorkspaceInspector.js',
    'components/gmi-edit/GmiChangeList.js', 'components/gmi-edit/GmiChangeSetDetail.js', 'lib/photos/photoHyperlinkTransferScope.mjs']) {
    const text = await readFile(new URL(file, root), 'utf8');
    assert(!/commitPhotoHyperlinkTransfer|commitHyperlinkTransfer\(/.test(text), `${file} must not reach the transaction`);
  }
});
