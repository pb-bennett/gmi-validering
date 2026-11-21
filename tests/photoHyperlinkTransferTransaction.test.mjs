// Batch 1B.2A: internal «Flytt til punktobjekt» transaction on the real owners
// (Rettinger session registry, FOTO session, loaded-GMI sources, delivery
// planner). Synthetic data only: every name, filename, signature and GUID is
// fabricated; the grammar follows the observed delivered S_HYPERLINK shapes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';
import { gmiPointPosition } from '../src/lib/photos/gmiPhotoSource.mjs';
import {
  GMI_HYPERLINK_TRANSFER_SET_KIND, activeGmiHyperlinkTransferSet, buildGmiFieldExport, compileGmiEffectiveEdits, compileGmiProposedEdits,
  getGmiExportReadiness, getGmiSourceBytes, isGmiHyperlinkTransferSet,
  planGmiHyperlinkRemoval,
} from '../src/lib/gmi-edit/index.mjs';
import { createGmiHyperlinkTransferSet } from '../src/lib/gmi-edit/session.mjs';
import { getGmiProposedState, createGmiProposedCache } from '../src/lib/gmi-edit/proposed.mjs';
import { captureDeliverySnapshot, buildDeliveryPlan } from '../src/lib/delivery/index.mjs';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import {
  PHOTO_HYPERLINK_TRANSFER_PROVENANCE, commitPhotoHyperlinkTransfer, photoHyperlinkTransferDecision,
  photoHyperlinkTransferView,
} from '../src/lib/photos/photoHyperlinkTransfer.mjs';
import { PHOTO_LINK_REVIEW_WRITABLE, detectPhotoLinkReview, emptyPhotoLinkReviewChoices, photoLinkReviewDecisions, reducePhotoLinkReviewChoices } from '../src/lib/photos/photoHyperlinkReview.mjs';
import { DATE, LOK_SLU, cell, codesOf, transferFixture, w } from './helpers/photoHyperlinkTransferFixtures.mjs';

// ---------------------------------------------------------------------------

test('LOK Punkt 293 -> SLU Punkt 108: one history entry, verified proposed GMI, FOTO view on the recipient, nothing else changed', async () => {
  const f = await LOK_SLU();
  const fotoBefore = f.fotoState(), files = f.photos().map((photo) => f.session.getFile(photo.id));
  const publications = f.publications.length;
  const result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]);
  assert.equal(result.ok, true, JSON.stringify(result));
  // One coupled history entry, published once.
  assert.equal(f.publications.length, publications + 1);
  const session = f.history();
  assert.equal(session.changeSets.length, 1);
  const [entry] = session.changeSets;
  assert.equal(entry.kind, GMI_HYPERLINK_TRANSFER_SET_KIND);
  assert.equal(isGmiHyperlinkTransferSet(entry), true);
  assert.equal(Object.isFrozen(entry) && Object.isFrozen(entry.photo.transfers[0]), true);
  assert.equal(entry.cells.length, 0, 'no ordinary field cells');
  assert.deepEqual(entry.hyperlinkCells.map((item) => item.sourceIndex), [0, 1]);
  // Proposed GMI: exact group moved with its sign metadata, recipient link retained.
  assert.deepEqual(f.proposedLinks(), [
    `h:1(link:"Attachments\\SYNT_LOK_A.png" sign:"Feltmåler A") h:2(link:"Attachments\\SYNT_LOK_C.png")`,
    `h:1(link:"Attachments\\SYNT_SLU_1.png" sign:"Feltmåler B") h:2(link:"Attachments\\SYNT_LOK_B.png" sign:"Feltmåler A")`,
    `h:1(link:"Attachments\\SYNT_KUM_1.png")`,
  ]);
  // Original bytes immutable.
  const original = f.registry.originalBytes(f.handle);
  assert.equal(Buffer.compare(Buffer.from(original.bytes), Buffer.from(f.bytes)), 0);
  assert.equal(Buffer.compare(Buffer.from(getGmiSourceBytes(f.registry.resolve(f.handle).document)), Buffer.from(f.bytes)), 0);
  // FOTO accepted state, files, capture metadata and delivery untouched.
  assert.equal(f.fotoState(), fotoBefore);
  assert.deepEqual(f.photos().map((photo) => f.session.getFile(photo.id)), files);
  // FOTO view of the proposed state: recipient ownership, recipient position, transfer provenance, still delivered as linked GMI.
  const view = photoHyperlinkTransferView(f.owners);
  assert.equal(view.status, 'current', JSON.stringify(view));
  assert.equal(view.occurrences.length, 1);
  const [moved] = view.occurrences;
  const recipient = f.object(108), lok = f.object(293);
  assert.equal(moved.objectKey, recipient.objectKey);
  assert.equal(moved.fromObjectKey, lok.objectKey);
  assert.equal(moved.assetId, f.assetOf('SYNT_LOK_B.png'));
  assert.deepEqual(moved.proposedPosition, gmiPointPosition(f.source(), recipient).position);
  assert.deepEqual(moved.originalGmiPosition, gmiPointPosition(f.source(), lok).position);
  assert.equal(moved.originalPosition, null, 'the unplaced FOTO occurrence keeps its original (absent) accepted position');
  assert.equal(moved.provenance.kind, PHOTO_HYPERLINK_TRANSFER_PROVENANCE);
  assert.equal(moved.provenance.method, 'user-approved-hyperlink-transfer');
  assert.equal(moved.provenance.approvedAt, DATE.toISOString());
  assert.deepEqual(moved.delivery, { status: 'keep-link', changed: false });
  assert.deepEqual(f.session.getLayerDelivery(f.layerId).byPhotoId[moved.photoId].status, 'keep-link');
  // Re-derived FOTO evidence of the proposed bytes: the photo belongs to the recipient only.
  const edges = Object.values(view.proposedSource.associationLedger.associationsById);
  assert.deepEqual(edges.filter((edge) => edge.photoId === moved.assetId).map((edge) => [edge.objectKey, edge.referenceIds]), [[recipient.objectKey, moved.outputReferenceIds]]);
  // Revision signal for Validator, export and FOTO views.
  assert.equal(result.revision.hyperlinkTransfer.transferSetId, entry.id);
  assert.notEqual(result.revision.effectiveKey, '[]');
});

test('several transfers, several recipients and a chain commit as one entry; a later commit is cumulative; undo/redo are coupled', async () => {
  const f = await transferFixture([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_A1.png'), w(2, 'SYNT_A2.png')) },
    { number: 2, fcode: 'SLU', hyperlink: cell(w(1, 'SYNT_B1.png')) },
    { number: 3, fcode: 'KUM', hyperlink: '' },
    { number: 4, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_D1.png')) },
    { number: 5, fcode: 'KUM', hyperlink: '' },
  ], { names: ['SYNT_A1.png', 'SYNT_A2.png', 'SYNT_B1.png', 'SYNT_D1.png'] });
  const original = f.proposedLinks();
  const fotoBefore = f.fotoState();
  // Chain 1 -> 2 -> 3 (2 loses its own photo and gains one) plus an independent 4 -> 5.
  const first = f.commit([f.move(1, 'SYNT_A1.png', 2), f.move(2, 'SYNT_B1.png', 3), f.move(4, 'SYNT_D1.png', 5)]);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.transfers.length, 3);
  const afterFirst = f.proposedLinks();
  assert.deepEqual(afterFirst, [
    `h:1(link:"Attachments\\SYNT_A2.png")`, `h:1(link:"Attachments\\SYNT_A1.png")`, `h:1(link:"Attachments\\SYNT_B1.png")`, '', `h:1(link:"Attachments\\SYNT_D1.png")`,
  ]);
  // A second commit plans every active decision again from the original: 1 -> 5 joins the recipient of 4. Incoming
  // wrappers follow source-object order (the 1B.1 append contract), so point 1's photo precedes point 4's.
  const second = f.commit([f.move(1, 'SYNT_A2.png', 5)]);
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.transfers.length, 4);
  assert.equal(second.newTransferKeys.length, 1);
  assert.equal(f.history().changeSets.length, 2);
  const afterSecond = f.proposedLinks();
  assert.deepEqual(afterSecond, [
    '', `h:1(link:"Attachments\\SYNT_A1.png")`, `h:1(link:"Attachments\\SYNT_B1.png")`, '', `h:1(link:"Attachments\\SYNT_A2.png") h:2(link:"Attachments\\SYNT_D1.png")`,
  ]);
  assert.equal(photoHyperlinkTransferView(f.owners).occurrences.length, 4);
  const secondKey = f.registry.revision(f.handle).effectiveKey;
  // Undo the second entry: the first is intact, GMI and FOTO view together.
  assert(f.registry.undo(f.handle).ok);
  assert.deepEqual(f.proposedLinks(), afterFirst);
  assert.equal(photoHyperlinkTransferView(f.owners).occurrences.length, 3);
  // Undo the first: the original links, no transfer view.
  assert(f.registry.undo(f.handle).ok);
  assert.deepEqual(f.proposedLinks(), original);
  assert.equal(f.registry.proposed(f.handle).identical, true);
  assert.equal(photoHyperlinkTransferView(f.owners).status, 'none');
  // Redo both: the same verified change, byte for byte.
  assert(f.registry.redo(f.handle).ok);
  assert(f.registry.redo(f.handle).ok);
  assert.deepEqual(f.proposedLinks(), afterSecond);
  assert.equal(f.registry.revision(f.handle).effectiveKey, secondKey);
  assert.equal(photoHyperlinkTransferView(f.owners).status, 'current');
  assert.equal(f.fotoState(), fotoBefore, 'FOTO accepted state never changes');
  // Cumulative entries: discarding the earlier transfer while a later one carries it is refused.
  assert.equal(f.registry.discard(f.handle, f.history().changeSets[0].id).code, 'transfer-set-has-later-transfers');
});

test('a recipient with unrelated hyperlinks keeps them; repeated references move together; a shared photo stays on its other object', async () => {
  const f = await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_REP.png', 'Feltmåler A'), w(2, 'SYNT_SHARED.png'), w(3, 'SYNT_REP.png', 'Feltmåler A')) },
    { number: 108, fcode: 'SLU', hyperlink: cell(w(1, 'SYNT_X1.png', 'Feltmåler B'), w(2, 'SYNT_X2.png')) },
    { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_SHARED.png')) },
  ], { names: ['SYNT_REP.png', 'SYNT_SHARED.png', 'SYNT_X1.png', 'SYNT_X2.png'] });
  const repeated = f.move(293, 'SYNT_REP.png', 108);
  assert.equal(repeated.referenceIds.length, 2, 'the complete repeated group');
  // A partial repeated group is refused.
  const partial = f.commit([{ ...repeated, referenceIds: [repeated.referenceIds[0]] }]);
  assert.equal(partial.ok, false);
  assert(codesOf(partial).includes('removal:reference-set-mismatch'), JSON.stringify(partial));
  assert.equal(f.history().changeSets.length, 0);
  const result = f.commit([repeated, f.move(293, 'SYNT_SHARED.png', 108)]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(f.proposedLinks(), [
    '',
    `h:1(link:"Attachments\\SYNT_X1.png" sign:"Feltmåler B") h:2(link:"Attachments\\SYNT_X2.png") h:3(link:"Attachments\\SYNT_REP.png" sign:"Feltmåler A") h:4(link:"Attachments\\SYNT_SHARED.png") h:5(link:"Attachments\\SYNT_REP.png" sign:"Feltmåler A")`,
    `h:1(link:"Attachments\\SYNT_SHARED.png")`,
  ]);
  const view = photoHyperlinkTransferView(f.owners);
  assert.equal(view.status, 'current', JSON.stringify(view));
  const shared = f.assetOf('SYNT_SHARED.png');
  const edges = Object.values(view.proposedSource.associationLedger.associationsById).filter((edge) => edge.photoId === shared).map((edge) => edge.objectKey).sort();
  assert.deepEqual(edges, [f.object(108).objectKey, f.object(12).objectKey].sort(), 'the shared photo stays on KUM and arrives on SLU');
  const rep = view.occurrences.find((entry) => entry.assetId === f.assetOf('SYNT_REP.png'));
  assert.equal(rep.outputReferenceIds.length, 2, 'both repeated references arrive');
  // The other occurrence of the shared photo is untouched in FOTO.
  const kumOccurrence = f.photos().find((photo) => photo.assetId === shared && photo.occurrence?.objectKey === f.object(12).objectKey);
  assert(kumOccurrence);
  assert.equal(view.occurrences.some((entry) => entry.photoId === kumOccurrence.id), false);
});

test('ordinary Rettinger corrections compose with a transfer and survive its undo; field-only consumers fail closed', async () => {
  const f = await LOK_SLU();
  f.stageField(2, 'Retting før flytting');
  const result = f.commit([f.move(293, 'SYNT_LOK_A.png', 108)]);
  assert.equal(result.ok, true, JSON.stringify(result));
  f.stageField(1, 'Retting etter flytting');
  const proposed = f.registry.proposed(f.handle);
  assert.deepEqual(proposed.dataset.points.map((point) => point.attributes.Merknad), ['Punkt 1', 'Retting etter flytting', 'Retting før flytting']);
  assert.equal(proposed.fieldEditCount, 2);
  assert.equal(proposed.hyperlinkTransfer.transferSetId, result.transferSetId);
  // Field-only consumers cannot silently drop the transfer.
  assert.equal(compileGmiEffectiveEdits(f.history()).code, 'hyperlink-transfer-active');
  const compiled = compileGmiProposedEdits(f.history());
  assert.equal(compiled.ok, true);
  assert.deepEqual([compiled.fieldEdits.length, compiled.hyperlinkEdits.length], [2, 2]);
  const removal = planGmiHyperlinkRemoval(f.registry.resolve(f.handle).document, { photoSource: f.source(), session: f.history(), selections: [] });
  assert.equal(removal.status, 'blocked');
  assert(removal.blockers.some((entry) => entry.code === 'session-not-compilable'), JSON.stringify(removal.blockers));
  // Undo the later field edit, then the transfer: the earlier correction remains alone.
  assert(f.registry.undo(f.handle).ok);
  assert(f.registry.undo(f.handle).ok);
  const after = f.registry.proposed(f.handle);
  assert.equal(after.hyperlinkTransfer, null);
  assert.deepEqual(after.dataset.points.map((point) => point.attributes.Merknad), ['Punkt 1', 'Punkt 2', 'Retting før flytting']);
  assert.equal(compileGmiEffectiveEdits(f.history()).ok, true);
  assert.equal(f.history().changeSets.length, 1);
  // Discarding the (last) transfer set out of order keeps a later ordinary correction.
  assert(f.registry.redo(f.handle).ok);
  f.stageField(0, 'Retting etter ny flytting');
  const transferId = f.history().changeSets[1].id;
  assert(f.registry.discard(f.handle, transferId).ok);
  assert.equal(activeGmiHyperlinkTransferSet(f.history()), null);
  assert.deepEqual(f.registry.proposed(f.handle).dataset.points.map((point) => point.attributes.Merknad), ['Retting etter ny flytting', 'Punkt 2', 'Retting før flytting']);
});

test('eligibility stays conservative: delivery choices, accepted positions, recipient duplicates, grammar, FOTO-only and implicit recipients block', async () => {
  // GML decision on the photo.
  let f = await LOK_SLU();
  const lokB = f.photos().find((photo) => photo.originalFilename === 'SYNT_LOK_B.png' && photo.occurrence);
  assert(f.session.setDeliveryIntent(f.layerId, [lokB.id], 'transfer').ok);
  let result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]);
  assert.deepEqual([result.ok, codesOf(result)], [false, ['delivery-conflict']]);
  // Ikke med i leveransen.
  f = await LOK_SLU();
  assert(f.session.setDeliveryIntent(f.layerId, [f.photos().find((photo) => photo.originalFilename === 'SYNT_LOK_B.png' && photo.occurrence).id], 'exclude').ok);
  assert.deepEqual(codesOf(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)])), ['delivery-conflict']);
  // Accepted manual position elsewhere.
  f = await LOK_SLU();
  const photo = f.photos().find((item) => item.originalFilename === 'SYNT_LOK_B.png' && item.occurrence);
  assert(f.session.setDeliveryIntent(f.layerId, [photo.id], 'keep-link').ok);
  assert(f.session.applyPhotoEdits(f.session.beginPhotoEdits(f.layerId), [{ photoId: photo.id, position: { crs: 'EPSG:4326', longitude: 10.43, latitude: 59.22 } }]).ok);
  result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]);
  assert(codesOf(result).includes('accepted-position'), JSON.stringify(result));
  // Recipient already links the photo.
  f = await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_DUP.png')) },
    { number: 108, fcode: 'SLU', hyperlink: cell(w(1, 'SYNT_DUP.png')) },
  ], { names: ['SYNT_DUP.png'] });
  result = f.commit([f.move(293, 'SYNT_DUP.png', 108)]);
  assert(codesOf(result).includes('recipient-already-links-photo'), JSON.stringify(result));
  assert(codesOf(result).includes('recipient-has-photo-placement'), JSON.stringify(result));
  // Unsupported recipient grammar (bare value).
  f = await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_G1.png')) },
    { number: 108, fcode: 'SLU', hyperlink: 'Attachments\\SYNT_BARE.png' },
  ], { names: ['SYNT_G1.png', 'SYNT_BARE.png'] });
  result = f.commit([f.move(293, 'SYNT_G1.png', 108)]);
  assert(codesOf(result).some((code) => code.startsWith('recipient-hyperlink-shape')), JSON.stringify(result));
  // No implicit recipient.
  f = await LOK_SLU();
  const noRecipient = { ...f.move(293, 'SYNT_LOK_B.png', 108) }; delete noRecipient.recipient;
  assert.deepEqual(codesOf(f.commit([noRecipient])), ['recipient-missing']);
  // Missing photograph (no imported asset).
  f = await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_NOFILE.png')) }, { number: 108, fcode: 'SLU', hyperlink: '' },
  ], { names: ['SYNT_OTHER.png'] });
  const missing = f.move(293, 'SYNT_OTHER.png', 108);
  result = f.commit([{ ...missing, referenceIds: f.source().references.map((reference) => reference.id) }]);
  assert.equal(result.ok, false);
  assert(codesOf(result).some((code) => code.startsWith('removal:')), JSON.stringify(result));
  // FOTO-only: the FOTO source is no longer bound to the live layer.
  f = await LOK_SLU();
  const transfer = f.move(293, 'SYNT_LOK_B.png', 108);
  const expected = f.basis();
  f.session.reconcileLoadedGmiBindings(() => false);
  result = f.commit([transfer], { expected });
  assert.deepEqual([result.ok, result.code], [false, 'photo-source-not-live-bound']);
  assert.equal(f.history().changeSets.length, 0);
});

test('accepted placement at the source GMI position is not an alternative position and is preserved as original evidence', async () => {
  const f = await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_P1.png')) }, { number: 108, fcode: 'SLU', hyperlink: '' },
  ], { names: ['SYNT_P1.png'], placeAtGmi: true });
  const placed = f.photos().find((photo) => photo.occurrence);
  assert(placed.spatial.current);
  const fotoBefore = f.fotoState();
  const result = f.commit([f.move(293, 'SYNT_P1.png', 108)]);
  assert.equal(result.ok, true, JSON.stringify(result));
  const [entry] = photoHyperlinkTransferView(f.owners).occurrences;
  assert.deepEqual(entry.originalPosition, JSON.parse(JSON.stringify(placed.spatial.current)));
  assert.deepEqual(entry.proposedPosition, gmiPointPosition(f.source(), f.object(108)).position);
  assert.equal(f.fotoState(), fotoBefore, 'no position -> GML default, no FOTO write');
  assert.equal(f.session.getLayerDelivery(f.layerId).byPhotoId[placed.id].status, 'keep-link');
});

test('stale state between review and commit is refused without a history entry or publication', async () => {
  let f = await LOK_SLU();
  const transfer = f.move(293, 'SYNT_LOK_B.png', 108);
  // GMI history moved on after the basis was captured.
  let expected = f.basis();
  f.stageField(2, 'Ny retting');
  let count = f.publications.length;
  let result = f.commit([transfer], { expected });
  assert.deepEqual([result.ok, result.code, result.detail], [false, 'stale-basis', ['sessionStateKey']]);
  assert.equal(f.history().changeSets.length, 1);
  assert.equal(f.publications.length, count);
  // FOTO changed after the basis was captured (an unrelated delivery choice).
  f = await LOK_SLU();
  expected = f.basis();
  const other = f.photos().find((photo) => photo.originalFilename === 'SYNT_KUM_1.png' && photo.occurrence);
  assert(f.session.setDeliveryIntent(f.layerId, [other.id], 'exclude').ok);
  result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108)], { expected });
  assert.deepEqual([result.ok, result.code, result.detail], [false, 'stale-basis', ['photoBasisKey']]);
  // Missing basis.
  result = commitPhotoHyperlinkTransfer({ ...f.owners, transfers: [f.move(293, 'SYNT_LOK_B.png', 108)] });
  assert.equal(result.code, 'expected-basis-required');
  // A change during the transaction (between verification and commit) is caught by the recheck.
  f = await LOK_SLU();
  count = f.publications.length;
  result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108)], { fault: (stage) => { if (stage === 'recheck') f.stageField(2, 'Samtidig retting'); } });
  assert.deepEqual([result.ok, result.stage, result.code], [false, 'recheck', 'stale-basis']);
  assert.equal(f.history().changeSets.length, 1, 'only the concurrent ordinary correction');
  assert.equal(activeGmiHyperlinkTransferSet(f.history()), null);
  // A handle that is not the registry's own (copied or forged).
  f = await LOK_SLU();
  const stale = { ...f.handle };
  result = commitPhotoHyperlinkTransfer({ ...f.owners, handle: stale, transfers: [f.move(293, 'SYNT_LOK_B.png', 108)], expected: f.basis() });
  assert.deepEqual([result.ok, result.code], [false, 'invalid-handle']);
});

test('failures injected at every stage, and while publishing, leave every owner unchanged', async () => {
  for (const stage of ['context', 'plan', 'photo', 'compose', 'verify', 'recheck', 'commit']) {
    const f = await LOK_SLU();
    const fotoBefore = f.fotoState(), sessionBefore = f.history(), count = f.publications.length;
    const result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108)], { fault: (name) => { if (name === stage) throw new Error(`injected ${stage}`); } });
    assert.deepEqual([result.ok, result.stage, result.code], [false, stage, 'transaction-failed']);
    assert.equal(f.history(), sessionBefore, `${stage}: session value unchanged`);
    assert.equal(f.publications.length, count, `${stage}: nothing published`);
    assert.equal(f.fotoState(), fotoBefore);
  }
  // Publication fails after the new session was assigned: rolled back and the previous state republished.
  const f = await LOK_SLU();
  const sessionBefore = f.history();
  f.faults.commit = () => { throw new Error('injected publish'); };
  const result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]);
  assert.deepEqual([result.ok, result.stage, result.code], [false, 'commit', 'commit-failed']);
  assert.equal(f.history(), sessionBefore);
  assert.equal(f.publications.at(-1).stateKey, sessionBefore.stateKey, 'observers see the restored state');
  assert.equal(f.registry.proposed(f.handle).identical, true);
  f.faults.commit = null;
  assert.equal(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok, true, 'a clean retry succeeds');
});

test('the stored entry is verified on every computation: a forged entry that disagrees with its decisions yields no proposed bytes', async () => {
  const f = await LOK_SLU();
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const real = activeGmiHyperlinkTransferSet(f.history());
  assert(f.registry.undo(f.handle).ok);
  const session = f.history();
  // Same structure, but the recipient receives a different photograph than the recorded decision says.
  const forgedLexeme = real.edits[1].lexeme.replace('SYNT_LOK_B.png', 'SYNT_LOK_C.png');
  const forged = createGmiHyperlinkTransferSet(session, { planKey: 'forged', documentFingerprint: real.basis.documentFingerprint,
    photoSourceId: real.basis.photoSourceId, photoSourceFingerprint: real.basis.photoSourceFingerprint, decisions: real.decisions, transfers: real.transfers,
    cells: real.hyperlinkCells.map((item, index) => ({ ...item, proposed: index === 1 ? forgedLexeme : item.proposed })),
    edits: real.edits.map((edit, index) => ({ ...edit, lexeme: index === 1 ? forgedLexeme : edit.lexeme })), photo: real.photo, previousTransferSetId: null });
  assert.equal(forged.ok, true, JSON.stringify(forged.rejections));
  const committed = f.registry.commitHyperlinkTransfer(f.handle, { session, transferSet: forged.transferSet });
  assert.equal(committed.ok, true);
  const proposed = getGmiProposedState(f.history(), { cache: createGmiProposedCache() });
  assert.deepEqual([proposed.ok, proposed.stage], [false, 'verify-transfer']);
  assert.equal(photoHyperlinkTransferView(f.owners).status, 'invalid');
  // Structural forgeries are refused at build time.
  const edits = real.edits.map((edit) => ({ ...edit, target: { ...edit.target, field: 'Merknad' } }));
  assert.equal(createGmiHyperlinkTransferSet(session, { ...real, ...real.basis, planKey: 'x', cells: real.hyperlinkCells, edits }).rejections[0].code, 'transfer-edit-outside-hyperlink');
  assert.equal(createGmiHyperlinkTransferSet(session, { ...real, ...real.basis, planKey: 'x', cells: real.hyperlinkCells, edits: real.edits, previousTransferSetId: 'cs-999' }).rejections[0].code, 'stale-transfer-basis');
});

test('FOTO changes after the commit turn the transfer view into a conflict; undo restores the original view', async () => {
  const f = await LOK_SLU();
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const moved = photoHyperlinkTransferView(f.owners).occurrences[0];
  assert(f.session.setDeliveryIntent(f.layerId, [moved.photoId], 'transfer').ok);
  const view = photoHyperlinkTransferView(f.owners);
  assert.equal(view.status, 'conflict');
  assert.deepEqual(view.conflicts.map((entry) => entry.code), ['photo-delivery-changed']);
  assert(f.registry.undo(f.handle).ok);
  assert.equal(photoHyperlinkTransferView(f.owners).status, 'none');
});

test('exports fail closed while a transfer is active, invalidate earlier plans, and recover after undo', async () => {
  const f = await LOK_SLU();
  const capture = (mode) => captureDeliverySnapshot({ mode, registry: f.registry, handle: mode === 'photos-only' ? undefined : f.handle,
    photoSession: f.session, photoLayerId: mode === 'gmi-only' ? undefined : f.layerId });
  const build = (snapshot) => buildDeliveryPlan(snapshot, { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: syntheticContext }, { now: () => DATE });
  const before = capture('gmi-only');
  assert.equal(before.isLive(), true);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  assert.equal(before.isLive(), false, 'a snapshot captured before the transfer is stale');
  assert.equal((await buildGmiFieldExport(f.registry, f.handle, { date: DATE })).code, 'hyperlink-transfer-export-unsupported');
  assert(getGmiExportReadiness(f.registry, f.handle).blocking.includes('hyperlink-transfer-export-unsupported'));
  for (const mode of ['gmi-only', 'photos-only', 'split', 'combined']) {
    const plan = await build(capture(mode));
    assert.equal(plan.status, 'blocked', mode);
    assert.deepEqual(plan.errors.map((entry) => entry.code), ['hyperlink-transfer-export-unsupported'], mode);
  }
  assert(f.registry.undo(f.handle).ok);
  const export_ = await buildGmiFieldExport(f.registry, f.handle, { date: DATE });
  assert.equal(export_.ok, true);
  assert.equal(export_.identical, true);
});

test('Validator revalidation runs on the proposed dataset of the transfer; nothing is reported as resolved by the commit', async () => {
  const f = await LOK_SLU();
  const originalRun = f.registry.revalidate(f.handle, { referenceDate: '2026-11-21' });
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const run = f.registry.revalidate(f.handle, { referenceDate: '2026-11-21' });
  assert.equal(run.ok, true);
  assert.notEqual(run.proposed.dataset, originalRun.proposed.dataset, 'a new proposed dataset');
  assert.equal(run.revised.datasetRevision, getDatasetRevision(run.proposed.dataset));
  assert.notEqual(run.revised.datasetRevision, run.original.datasetRevision);
  assert.equal(run.original.datasetRevision, originalRun.original.datasetRevision, 'the original run is unchanged');
});

test('review decisions map onto the transaction through the adapter without automatic recipients', async () => {
  const f = await LOK_SLU();
  const model = detectPhotoLinkReview({ source: f.source(), photos: f.photos(), delivery: f.session.getLayerDelivery(f.layerId), liveSource: true });
  const row = model.rows.find((entry) => entry.parserId === 293);
  const group = row.groups.find((entry) => entry.assetId === f.assetOf('SYNT_LOK_B.png'));
  let choices = reducePhotoLinkReviewChoices(emptyPhotoLinkReviewChoices(), { type: 'select', objectKey: row.objectKey, groupKey: group.key, selected: true }, model);
  assert.equal(photoHyperlinkTransferDecision(photoLinkReviewDecisions(model, choices)[0], f.source()), null, 'no recipient, no transfer');
  choices = reducePhotoLinkReviewChoices(choices, { type: 'target', objectKey: row.objectKey, groupKey: group.key, targetKey: f.object(108).objectKey }, model);
  const [decision] = photoLinkReviewDecisions(model, choices);
  assert.equal(decision.resolved, true, JSON.stringify(decision.blocking));
  const transfer = photoHyperlinkTransferDecision(decision, f.source());
  const result = f.commit([transfer]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.transfers[0].decisionKey, decision.key);
});

test('no user-facing write entry point: the transaction is reachable only from tests; the review stays read-only', async () => {
  assert.equal(PHOTO_LINK_REVIEW_WRITABLE, false);
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const owners = new Set([path.join('lib', 'photos', 'photoHyperlinkTransfer.mjs'), path.join('lib', 'gmi-edit', 'hyperlinkTransferCommit.mjs'),
    path.join('lib', 'gmi-edit', 'index.mjs'), path.join('lib', 'gmi-edit', 'editSessions.mjs'), path.join('lib', 'gmi-edit', 'session.mjs')]);
  const files = (await readdir(root, { recursive: true })).filter((name) => /\.(m?js|jsx)$/.test(name));
  // Batch 1B.2B (deliberate contract update): the FOTO presentation/guard module reads the proposed view, and only the
  // view. It may import photoHyperlinkTransferView and nothing that writes; everything else stays as before.
  const scopeModule = path.join('lib', 'photos', 'photoHyperlinkTransferScope.mjs');
  const scopeText = await readFile(path.join(root, scopeModule), 'utf8');
  assert.deepEqual([...scopeText.matchAll(/import \{([^}]*)\} from '\.\/photoHyperlinkTransfer\.mjs'/g)].map((match) => match[1].trim()), ['photoHyperlinkTransferView']);
  assert(!/commitPhotoHyperlinkTransfer|commitHyperlinkTransfer|hyperlinkTransferCommit|createGmiHyperlinkTransferSet|stageGmiHyperlinkTransferSet/.test(scopeText));
  for (const name of files) {
    if (owners.has(name) || name === scopeModule) continue;
    const text = await readFile(path.join(root, name), 'utf8');
    assert(!/photoHyperlinkTransfer(\.mjs)?['"]|hyperlinkTransferCommit|commitPhotoHyperlinkTransfer|commitHyperlinkTransfer|planGmiHyperlinkTransferCommit|buildGmiHyperlinkTransferCommit|createGmiHyperlinkTransferSet|stageGmiHyperlinkTransferSet/.test(text), `${name} must not wire the transfer`);
  }
  const dialog = await readFile(path.join(root, 'components', 'photos', 'PhotoHyperlinkReviewDialog.js'), 'utf8');
  assert(!/Lagre endringer/.test(dialog), 'the review dialog has no save control');
});
