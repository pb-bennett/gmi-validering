// Batch 1B.4A: the writable photo hyperlink review, on the real owners (Rettinger session registry, FOTO session with
// the owner-level guard bound, loaded-GMI sources, Validator, delivery planner). The review decisions are made with
// the production reducer and saved through photoHyperlinkReviewSave, the dialog's only write route. Synthetic data
// only (see tests/helpers/photoHyperlinkTransferFixtures.mjs): every name, filename, signature and GUID is fabricated.
import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';
import { DATE, LOK_SLU, cell, transferFixture, w } from './helpers/photoHyperlinkTransferFixtures.mjs';
import { gmiPointPosition } from '../src/lib/photos/gmiPhotoSource.mjs';
import { bindPhotoHyperlinkTransferGuard, photoHyperlinkTransferPresentedPhotos, photoHyperlinkTransferViews } from '../src/lib/photos/photoHyperlinkTransferScope.mjs';
import { detectPhotoLinkReview, emptyPhotoLinkReviewChoices, photoLinkReviewCandidates, photoLinkReviewDecisions, photoLinkReviewProgress,
  reducePhotoLinkReviewChoices } from '../src/lib/photos/photoHyperlinkReview.mjs';
import { PHOTO_LINK_SAVE_BLOCKER_TEXT, capturePhotoLinkReviewBasis, photoLinkReviewSavedState, photoLinkReviewSavePlan,
  savePhotoLinkReview } from '../src/lib/photos/photoHyperlinkReviewSave.mjs';
import { photoLayerMapFit } from '../src/lib/photos/photoMapFeatures.mjs';
import { PHOTO_HYPERLINK_TRANSFER_ACTIVE } from '../src/lib/photos/photoHyperlinkTransferLock.mjs';
import { getGmiSourceBytes } from '../src/lib/gmi-edit/index.mjs';
import { buildDeliveryPlan, captureDeliverySnapshot } from '../src/lib/delivery/index.mjs';

const REFERENCE_DATE = '2026-11-21';
const guarded = async (fixture) => { const f = await fixture(); bindPhotoHyperlinkTransferGuard(f.session, f.registry); return f; };
const originalBytes = (f) => Buffer.from(getGmiSourceBytes(f.registry.resolve(f.handle).document));

/** The review exactly as the dialog builds it: live FOTO photos/delivery, the live source and the saved-transfer state. */
function review(f) {
  const saved = photoLinkReviewSavedState(photoHyperlinkTransferViews({ registry: f.registry, photoSession: f.session, photoLayerId: f.layerId }), 'survey');
  const model = detectPhotoLinkReview({ source: f.source(), photos: f.photos(), delivery: f.session.getLayerDelivery(f.layerId), liveSource: true,
    savedTransfers: saved.transfers });
  return { model, saved };
}
const rowOf = (model, number) => model.rows.find((row) => row.parserId === number);
const groupOf = (row, filename) => row.groups.find((group) => group.references[0].filename.endsWith(filename));
/** steps: [sourceNumber, filename, outcome, recipientNumber?] through the production reducer. */
function decide(f, model, steps) {
  let state = emptyPhotoLinkReviewChoices();
  for (const [number, filename, outcome, to] of steps) {
    const row = rowOf(model, number), group = groupOf(row, filename);
    const act = (action) => { state = reducePhotoLinkReviewChoices(state, { objectKey: row.objectKey, groupKey: group.key, ...action }, model); };
    act({ type: 'select', selected: true });
    act({ type: 'outcome', outcome });
    if (to !== undefined) act({ type: 'target', targetKey: f.object(to).objectKey });
  }
  return state;
}
/** Kontroll: decisions, progress and the basis captured when Kontroll opens. */
function kontroll(f, steps) {
  const { model, saved } = review(f);
  const choices = decide(f, model, steps);
  const decisions = photoLinkReviewDecisions(model, choices);
  const progress = photoLinkReviewProgress(model, decisions);
  const basis = capturePhotoLinkReviewBasis(f.owners);
  assert(basis.ok, basis.code);
  return { model, saved, choices, decisions, progress, basis: basis.basis };
}
const save = (f, k, extra = {}) => savePhotoLinkReview({ ...f.owners, model: k.model, decisions: k.decisions, progress: k.progress, expected: k.basis,
  transferStatus: k.saved.status, now: () => DATE, ...extra });
const historyIds = (f) => f.history().changeSets.map((entry) => entry.id);

/** The real-data acceptance shape in synthetic form: a LOK with one photograph and an SLU 0,16 m away without links. */
const SINGLE = () => transferFixture([
  { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_TOPP_1.jpg', 'Feltmåler A')), xyz: '581950.000 6566010.000 101.250' },
  { number: 108, fcode: 'SLU', hyperlink: '', xyz: '581950.096 6566010.128 100.900' },
  { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_KUM_1.jpg')), xyz: '581964.000 6566024.000 99.000' },
], { names: ['SYNT_TOPP_1.jpg', 'SYNT_KUM_1.jpg'] });

test('one eligible transfer: one Rettinger entry, one publication, a receipt; original bytes and accepted FOTO state unchanged', async () => {
  const f = await guarded(SINGLE);
  const before = originalBytes(f), fotoBefore = f.fotoState(), publications = f.publications.length;
  const k = kontroll(f, [[293, 'SYNT_TOPP_1.jpg', 'move', 108]]);
  assert.deepEqual([k.progress.saveReady, k.progress.saveBlocker, k.progress.moves], [true, null, 1]);
  // Kontroll evidence: ~0,16 m XY; the recipient has no existing links.
  const [decision] = k.decisions;
  assert(Math.abs(decision.distanceMetres - 0.16) < 0.001, String(decision.distanceMetres));
  assert.equal(decision.target.photoReferenceCount, 0);
  const result = save(f, k);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual({ ...result.receipt, items: result.receipt.items.map(({ filename, references, from, to }) => ({ filename, references, from, to })) }, {
    transferSetId: result.transferSetId, photographs: 1, references: 1, earlier: 0,
    items: [{ filename: 'SYNT_TOPP_1.jpg', references: 1, from: 'LOK · Punkt 293 (AnleggsID SYNT-R1)', to: 'SLU · Punkt 108 (AnleggsID SYNT-R2)' }],
  });
  assert.equal(historyIds(f).length, 1);
  assert.equal(f.publications.length, publications + 1, 'published once');
  assert.equal(Buffer.compare(originalBytes(f), before), 0, 'original GMI bytes unchanged');
  assert.equal(f.fotoState(), fotoBefore, 'accepted FOTO records, delivery and sources unchanged');
  assert.deepEqual(f.proposedLinks(), ['', cell(w(1, 'SYNT_TOPP_1.jpg', 'Feltmåler A')).trim(), cell(w(1, 'SYNT_KUM_1.jpg')).trim()]);
  assert.equal(review(f).saved.status, 'current');
});

test('several independent transfers, two to the same recipient with existing links, save as one atomic entry', async () => {
  const f = await guarded(LOK_SLU);
  const k = kontroll(f, [[293, 'SYNT_LOK_A.png', 'move', 108], [293, 'SYNT_LOK_B.png', 'move', 108], [293, 'SYNT_LOK_C.png', 'move', 12]]);
  assert.equal(k.progress.saveReady, true, JSON.stringify(k.decisions.map((entry) => entry.blocking)));
  // The recipient's existing hyperlinks are evidence (a warning), never a blocker, and are kept.
  assert(k.decisions[0].warnings.some((entry) => entry.code === 'target-existing-links'));
  const result = save(f, k);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual([result.receipt.photographs, result.receipt.references, historyIds(f).length], [3, 3, 1]);
  assert.deepEqual(f.proposedLinks(), ['',
    cell(w(1, 'SYNT_SLU_1.png', 'Feltmåler B'), w(2, 'SYNT_LOK_A.png', 'Feltmåler A'), w(3, 'SYNT_LOK_B.png', 'Feltmåler A')).trim(),
    cell(w(1, 'SYNT_KUM_1.png'), w(2, 'SYNT_LOK_C.png')).trim()]);
});

test('a cumulative save after an earlier transfer keeps it; reopening marks the saved group and refuses it as a new decision', async () => {
  const f = await guarded(LOK_SLU);
  assert(save(f, kontroll(f, [[293, 'SYNT_LOK_B.png', 'move', 108]])).ok);
  const first = f.proposedLinks();
  const { model, saved } = review(f);
  assert.equal(saved.status, 'current');
  const lok = rowOf(model, 293), savedGroup = groupOf(lok, 'SYNT_LOK_B.png');
  assert.equal(savedGroup.saved.toObjectKey, f.object(108).objectKey, 'the original association is shown with its saved transfer');
  const refused = reducePhotoLinkReviewChoices(emptyPhotoLinkReviewChoices(), { type: 'select', objectKey: lok.objectKey, groupKey: savedGroup.key, selected: true }, model);
  assert.deepEqual(refused.decisions, {}, 'a saved group cannot be selected again');
  const slu = photoLinkReviewCandidates(model, lok).find((entry) => entry.target.objectKey === f.object(108).objectKey);
  assert(slu.conflicts.some((entry) => entry.code === 'target-saved-transfers' && !entry.blocking));
  const k = kontroll(f, [[293, 'SYNT_LOK_A.png', 'move', 12]]);
  const result = save(f, k);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual([result.receipt.photographs, result.receipt.earlier, historyIds(f).length], [1, 1, 2]);
  const proposed = f.proposedLinks();
  assert.match(proposed[1], /SYNT_LOK_B\.png/); assert.match(proposed[2], /SYNT_LOK_A\.png/);
  assert.doesNotMatch(proposed[0], /SYNT_LOK_A|SYNT_LOK_B/);
  assert(f.registry.undo(f.handle).ok);
  assert.deepEqual(f.proposedLinks(), first, 'undo returns exactly to the earlier transfer');
});

/** Photographs placed at their own objects' GMI positions, so GML/Ikke decisions are possible (and moves stay eligible). */
const PLACED = () => transferFixture([
  { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_B.png', 'Feltmåler A'), w(3, 'SYNT_LOK_C.png')), xyz: '581950.000 6566010.000 101.250' },
  { number: 108, fcode: 'SLU', hyperlink: cell(w(1, 'SYNT_SLU_1.png', 'Feltmåler B')), xyz: '581950.100 6566010.150 100.900' },
  { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_KUM_1.png')), xyz: '581964.000 6566024.000 99.000' },
], { names: ['SYNT_LOK_A.png', 'SYNT_LOK_B.png', 'SYNT_LOK_C.png', 'SYNT_SLU_1.png', 'SYNT_KUM_1.png'], placeAtGmi: true });

test('blocked accepted positions, mixed outcomes and a no-op review never reach the transaction', async () => {
  const f = await guarded(PLACED);
  const publications = f.publications.length, fotoBefore = f.fotoState();
  // GML/Ikke are FOTO delivery choices: with a move, the resolved review is refused with an explanation; nothing is omitted.
  for (const outcome of ['gml', 'exclude']) {
    const mixed = kontroll(f, [[293, 'SYNT_LOK_B.png', 'move', 108], [293, 'SYNT_LOK_A.png', outcome]]);
    assert.equal(mixed.progress.allResolved, true, JSON.stringify(mixed.decisions.map((entry) => entry.blocking)));
    assert.deepEqual([mixed.progress.saveReady, mixed.progress.saveBlocker], [false, 'delivery-outcomes']);
    const refused = save(f, mixed);
    assert.deepEqual([refused.ok, refused.code, refused.message], [false, 'delivery-outcomes', PHOTO_LINK_SAVE_BLOCKER_TEXT['delivery-outcomes']]);
  }
  assert.equal(f.fotoState(), fotoBefore, 'no delivery choice was written');
  // Move plus «Behold uendret»: the keep is a no-op; only the move would be saved.
  const keep = kontroll(f, [[293, 'SYNT_LOK_B.png', 'move', 108], [293, 'SYNT_LOK_A.png', 'keep']]);
  assert.deepEqual([keep.progress.saveReady, keep.progress.keeps, photoLinkReviewSavePlan(keep.model, keep.decisions, keep.progress).transfers.length], [true, 1, 1]);
  // Only «Behold uendret»: no changes, no history entry.
  const noop = kontroll(f, [[293, 'SYNT_LOK_A.png', 'keep']]);
  assert.deepEqual([noop.progress.saveReady, noop.progress.saveBlocker], [false, 'no-changes']);
  const refusal = save(f, noop);
  assert.deepEqual([refusal.ok, refusal.code, refusal.message], [false, 'no-changes', PHOTO_LINK_SAVE_BLOCKER_TEXT['no-changes']]);
  // An unresolved move (no recipient) is refused.
  const open = kontroll(f, [[293, 'SYNT_LOK_B.png', 'move']]);
  assert.equal(save(f, open).code, 'unresolved');
  // An accepted manual position elsewhere blocks the move in Kontroll and the save.
  const photo = f.photos().find((entry) => entry.originalFilename === 'SYNT_LOK_C.png');
  const ticket = f.session.beginPhotoEdits(f.layerId);
  assert(f.session.applyPhotoEdits(ticket, [{ photoId: photo.id, position: { crs: 'EPSG:4326', longitude: 10.43, latitude: 59.22 } }]).ok);
  const blocked = kontroll(f, [[293, 'SYNT_LOK_C.png', 'move', 12]]);
  assert(blocked.decisions[0].blocking.some((entry) => entry.code === 'accepted-position'));
  assert.equal(save(f, blocked).code, 'unresolved');
  assert.deepEqual([historyIds(f).length, f.publications.length], [0, publications], 'no entry and no Rettinger publication');
});

test('stale GMI and FOTO state at save time fail closed with a Norwegian explanation; a recaptured basis saves', async () => {
  const f = await guarded(LOK_SLU);
  const k = kontroll(f, [[293, 'SYNT_LOK_B.png', 'move', 108]]);
  f.stageField(2, 'Syntetisk merknad');   // a Rettinger change after Kontroll opened
  const stale = save(f, k);
  assert.deepEqual([stale.ok, stale.code], [false, 'stale-basis']);
  assert.match(stale.message, /Grunnlaget er endret siden Kontroll ble åpnet \(Rettinger\)\. Ingen endringer er lagret, og valgene dine er beholdt\./);
  assert.equal(historyIds(f).length, 1, 'only the field correction');
  // A FOTO change (an unrelated delivery choice) is also detected.
  const k2 = kontroll(f, [[293, 'SYNT_LOK_B.png', 'move', 108]]);
  const kum = f.photos().find((entry) => entry.originalFilename === 'SYNT_KUM_1.png');
  assert.equal(f.session.setDeliveryIntent(f.layerId, [kum.id], 'exclude').ok, true);
  const staleFoto = save(f, k2);
  assert.equal(staleFoto.code, 'stale-basis');
  assert.match(staleFoto.message, /\(FOTO\)/);
  // The same choices with a basis captured again (Kontroll reopened) save; the field correction is untouched.
  const retry = save(f, { ...k2, basis: capturePhotoLinkReviewBasis(f.owners).basis });
  assert.equal(retry.ok, true, JSON.stringify(retry));
  assert.equal(historyIds(f).length, 2);
  assert.equal(f.history().changeSets[0].kind === 'gmi-hyperlink-transfer-set', false, 'unrelated corrections are not staged or rewritten');
});

test('atomic failure and retry; repeated save clicks produce one transfer', async () => {
  const f = await guarded(LOK_SLU);
  const k = kontroll(f, [[293, 'SYNT_LOK_A.png', 'move', 108], [293, 'SYNT_LOK_C.png', 'move', 12]]);
  const links = f.proposedLinks(), fotoBefore = f.fotoState();
  f.faults.commit = () => { throw new Error('synthetic publish failure'); };
  const failed = save(f, k);
  assert.deepEqual([failed.ok, failed.code], [false, 'commit-failed']);
  assert.match(failed.message, /Rettinger er satt tilbake\. Ingen endringer er lagret/);
  assert.deepEqual([historyIds(f).length, f.proposedLinks(), f.fotoState()], [0, links, fotoBefore], 'neither transfer was saved');
  f.faults.commit = null;
  const retried = save(f, k);
  assert.equal(retried.ok, true, JSON.stringify(retried));
  // A second click with the same Kontroll basis is refused: the first save changed the Rettinger state.
  const again = save(f, k);
  assert.deepEqual([again.ok, again.code, historyIds(f).length], [false, 'stale-basis', 1]);
  assert.equal(f.history().changeSets[0].transfers.length, 2, 'no duplicated transfer');
});

test('Validator evaluates the actual Foreslått dataset: source and recipient S_HYPERLINK findings are recomputed, others kept; undo, redo and discard follow', async () => {
  const f = await guarded(SINGLE);
  const findings = (run, index) => run.ruleResults.flatMap((entry) => entry.findings).filter((finding) => finding.canonicalFieldId === 'attachmentLink'
    && finding.objectRef?.geometryScope === 'point' && (index === undefined || finding.objectRef.sourceIndex === index)).map((finding) => [finding.objectRef.sourceIndex, finding.reasonCode]);
  const before = f.registry.revalidate(f.handle, { referenceDate: REFERENCE_DATE });
  assert(save(f, kontroll(f, [[293, 'SYNT_TOPP_1.jpg', 'move', 108]])).ok);
  const after = f.registry.revalidate(f.handle, { referenceDate: REFERENCE_DATE });
  assert.notEqual(after.revised.datasetRevision, before.revised.datasetRevision, 'a new Foreslått revision');
  assert.equal(after.proposed.dataset.points[0].attributes.S_HYPERLINK ?? '', '');
  assert.match(after.proposed.dataset.points[1].attributes.S_HYPERLINK, /SYNT_TOPP_1\.jpg/);
  // S_HYPERLINK is recomputed for both objects from the proposed data; unrelated objects keep their findings.
  assert.deepEqual(findings(after.original), findings(before.original), 'the original run is unchanged');
  assert.deepEqual(findings(after.revised, 2), findings(before.revised, 2), 'the unrelated KUM keeps its findings');
  // Before: the LOK carries an unexpected link and the SLU misses a required one. Foreslått resolves both by evaluation.
  assert.deepEqual([findings(before.revised, 0), findings(before.revised, 1)], [[[0, 'APPLICABILITY_UNEXPECTED_VALUE']], [[1, 'REQUIRED_VALUE_MISSING']]]);
  assert.deepEqual([findings(after.revised, 0), findings(after.revised, 1)], [[], []], 'source and recipient S_HYPERLINK results are re-evaluated from Foreslått');
  const transferred = [findings(after.revised, 0), findings(after.revised, 1)];
  assert(f.registry.undo(f.handle).ok);
  assert.equal(review(f).saved.status, 'none');
  assert.deepEqual(findings(f.registry.revalidate(f.handle, { referenceDate: REFERENCE_DATE }).revised), findings(before.revised));
  assert(f.registry.redo(f.handle).ok);
  const redone = f.registry.revalidate(f.handle, { referenceDate: REFERENCE_DATE });
  assert.deepEqual([findings(redone.revised, 0), findings(redone.revised, 1)], transferred);
  assert.equal(f.history().changeSets.length, 1, 'redo restores without duplicating');
  assert.equal(review(f).saved.status, 'current');
  assert(f.registry.discard(f.handle, f.history().changeSets[0].id).ok);
  assert.deepEqual([review(f).saved.status, f.history().changeSets.length], ['none', 0]);
});

test('after a saved transfer: FOTO locks the moved photograph only, fit-to-layer includes its Foreslått position, every delivery mode composes it', async () => {
  const f = await guarded(LOK_SLU);
  assert.equal(photoLayerMapFit(f.photos()), null, 'all synthetic photographs are unplaced before the transfer');
  assert(save(f, kontroll(f, [[293, 'SYNT_LOK_B.png', 'move', 108]])).ok);
  const moved = f.photos().find((entry) => entry.originalFilename === 'SYNT_LOK_B.png');
  const other = f.photos().find((entry) => entry.originalFilename === 'SYNT_KUM_1.png');
  assert.deepEqual([f.session.setDeliveryIntent(f.layerId, [moved.id], 'exclude').ok, f.session.setDeliveryIntent(f.layerId, [moved.id], 'exclude').error],
    [false, PHOTO_HYPERLINK_TRANSFER_ACTIVE]);
  assert.equal(f.session.setDeliveryIntent(f.layerId, [other.id], 'exclude').ok, true, 'unrelated photographs stay editable');
  assert.equal(f.session.setDeliveryIntent(f.layerId, [other.id], 'keep-link').ok, true);
  // «Fit to layer» uses what the map shows: the previously unplaced, moved photograph at the recipient's GMI position.
  const shown = photoHyperlinkTransferPresentedPhotos({ registry: f.registry, photoSession: f.session, photoLayerId: f.layerId });
  assert.deepEqual(shown.find((entry) => entry.id === moved.id).spatial.current.position, gmiPointPosition(f.source(), f.object(108)).position);
  assert.notEqual(photoLayerMapFit(shown), null);
  const capture = (mode, extra = {}) => captureDeliverySnapshot({ mode, registry: f.registry, handle: mode === 'photos-only' ? undefined : f.handle,
    photoSession: f.session, photoLayerId: mode === 'gmi-only' ? undefined : f.layerId, ...extra });
  const history = historyIds(f);
  for (const mode of ['gmi-only', 'photos-only', 'split', 'combined']) {
    const plan = await buildDeliveryPlan(capture(mode, mode === 'photos-only' ? { includeTransferredUnplaced: true } : {}),
      { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: syntheticContext }, { now: () => DATE });
    assert.deepEqual([plan.status, plan.errors.map((entry) => entry.code)], ['ready', []], mode);
    // Batch 1B.4B (deliberate update): recipient acceptance (A5) is tracked in reports, not as a user-facing warning.
    if (mode !== 'photos-only') assert(!plan.warnings.some((entry) => /^gemini-/.test(entry.code)), `${mode}: no import-test status warning`);
  }
  // GML-only without the explicit inclusion leaves the previously unplaced moved photograph out, with a warning.
  const withheld = await buildDeliveryPlan(capture('photos-only'), { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: syntheticContext }, { now: () => DATE });
  assert(withheld.warnings.some((entry) => entry.code === 'hyperlink-transfer-unplaced-withheld'));
  assert.deepEqual(historyIds(f), history, 'export planning neither discards the transfer nor releases the lock');
  assert.equal(f.session.setDeliveryIntent(f.layerId, [moved.id], 'transfer').ok, false);
});

test('Rettinger refresh signals in FOTO hooks are not memoised away by the React Compiler', async () => {
  // A `void signal` read inside useMemo is dropped by the compiler (observed in the production chunk); these modules
  // must opt out so commit, undo and redo refresh FOTO and the review immediately.
  const { readFile } = await import('node:fs/promises');
  for (const file of ['components/photos/usePhotoHyperlinkTransfers.js', 'components/photos/PhotoHyperlinkReviewDialog.js']) {
    const text = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert(/void (statuses|gmiStatuses);/.test(text), `${file} keeps its refresh signal`);
    assert(text.includes("'use no memo'"), `${file} opts out of the React Compiler`);
  }
});
