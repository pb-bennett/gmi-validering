// Batch 1B.3A: export composition, revision reimport and delivery verification for active «Flytt til punktobjekt»
// hyperlink transfers, on the real owners (Rettinger registry, FOTO session, loaded-GMI sources, delivery planner).
// Synthetic data only (see tests/helpers/photoHyperlinkTransferFixtures.mjs): every name, filename, signature and GUID
// is fabricated.
import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync } from 'fflate';
import { syntheticContext, exportFixture } from './helpers/photoExportFixtures.mjs';
import { saveStagedSource } from './helpers/photoSourceDraft.mjs';
import { DATE, LOK_SLU, cell, gmiText, transferFixture, w } from './helpers/photoHyperlinkTransferFixtures.mjs';
import { latin1Bytes } from './helpers/gmiHyperlinkRemovalFixtures.mjs';
import { commitPhotoHyperlinkTransfer, photoHyperlinkTransferBasis } from '../src/lib/photos/photoHyperlinkTransfer.mjs';
import { captureDeliverySnapshot, buildDeliveryPlan, getDeliveryGmiBytes, getDeliveryGml, recordDeliveryDownload, deliveryTransferredUnplaced } from '../src/lib/delivery/index.mjs';
import { buildDeliveryPackage } from '../src/lib/delivery/deliveryPackage.mjs';
import { deliveryCorrectionCounts, deliveryFieldCorrectionCount, deliveryReport, deliverySummary, deliveryMessage, deliveryDiagnostics } from '../src/lib/delivery/deliveryWizard.mjs';
import { deriveRevisionPhotoSource, verifyRevisionAssociations } from '../src/lib/delivery/deliveryRevision.mjs';
import {
  applyGmiDeliveryComposition, buildGmiFieldExport, createGmiSourceDocument, editGmiFields, getGmiExportReadiness, getGmiSourceBytes,
  planGmiDeliveryComposition, verifyGmiHyperlinkTransfer,
} from '../src/lib/gmi-edit/index.mjs';
import { activeGmiHyperlinkTransferSet } from '../src/lib/gmi-edit/session.mjs';
import { computeGmiSourceFingerprint } from '../src/lib/gmi-edit/sourceDocument.mjs';
import { bindPhotoHyperlinkTransferGuard, photoHyperlinkTransferViews } from '../src/lib/photos/photoHyperlinkTransferScope.mjs';
import { PHOTO_LINK_REVIEW_WRITABLE } from '../src/lib/photos/photoHyperlinkReview.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { gmiCellKey } from '../src/lib/gmi-edit/targets.mjs';

const MODES = ['gmi-only', 'photos-only', 'split', 'combined'];
const capture = (f, mode, extra = {}) => captureDeliverySnapshot({ mode, registry: f.registry, handle: mode === 'photos-only' ? undefined : f.handle,
  photoSession: f.session, photoLayerId: f.layerId, ...extra });
const build = (snapshot) => buildDeliveryPlan(snapshot, { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: syntheticContext }, { now: () => DATE });
const plan = (f, mode, extra) => build(capture(f, mode, extra));
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const fieldLines = (bytes, decode = latin1) => decode(bytes).split(/\r?\n/).filter((line) => line.startsWith('_FIELDVALUES'));
const linksOf = (bytes, decode) => fieldLines(bytes, decode).map((line) => line.split(';')[3]);
const notesOf = (bytes, decode) => fieldLines(bytes, decode).map((line) => line.split(';')[4]);
const ready = (p, label = '') => { assert.equal(p.status, 'ready', `${label} ${JSON.stringify(p.errors)}`); return p; };
const codes = (p) => p.errors.map((item) => item.code);
const originalBytes = (f) => getGmiSourceBytes(f.registry.resolve(f.handle).document);
const sameBytes = (a, b) => a.length === b.length && a.every((byte, index) => byte === b[index]);
const photoOf = (f, filename, parserId = null) => f.photos().find((photo) => photo.originalFilename === filename
  && (parserId === null || photo.occurrence?.object?.parserId === parserId));
const historyIds = (f) => f.history().changeSets.map((entry) => entry.id);
const guarded = (f) => { bindPhotoHyperlinkTransferGuard(f.session, f.registry); return f; };

/** Three point objects with photographs on each; placed at their own GMI positions so GML decisions are possible. */
const MIXED = () => transferFixture([
  { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_B.png', 'Feltmåler A'), w(3, 'SYNT_LOK_C.png')), xyz: '581950.000 6566010.000 101.250' },
  { number: 108, fcode: 'SLU', hyperlink: cell(w(1, 'SYNT_SLU_1.png', 'Feltmåler B')), xyz: '581950.100 6566010.150 100.900' },
  { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_KUM_1.png')), xyz: '581964.000 6566024.000 99.000' },
], { names: ['SYNT_LOK_A.png', 'SYNT_LOK_B.png', 'SYNT_LOK_C.png', 'SYNT_SLU_1.png', 'SYNT_KUM_1.png'], placeAtGmi: true });

test('LOK Punkt 293 -> SLU Punkt 108: every delivery mode composes the active transfer; nothing is mutated or published', async () => {
  const f = guarded(await LOK_SLU());
  assert.equal(PHOTO_LINK_REVIEW_WRITABLE, true);   // Batch 1B.4A: the review is writable; the export contract is unchanged
  const before = originalBytes(f);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const fotoBefore = f.fotoState(), publications = f.publications.length, history = historyIds(f);
  const plans = {};
  // The moved photograph was unplaced before the transfer: Kun GML med bilder places it only with the explicit
  // inclusion (verification refinement); the decision-free default is tested separately below.
  for (const mode of MODES) plans[mode] = ready(await plan(f, mode, mode === 'photos-only' ? { includeTransferredUnplaced: true } : undefined), mode);
  const expectedLinks = [cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_C.png')),
    cell(w(1, 'SYNT_SLU_1.png', 'Feltmåler B'), w(2, 'SYNT_LOK_B.png', 'Feltmåler A')), cell(w(1, 'SYNT_KUM_1.png'))];
  for (const mode of ['gmi-only', 'split', 'combined']) {
    const bytes = getDeliveryGmiBytes(plans[mode]);
    assert.deepEqual(linksOf(bytes), expectedLinks, mode);
    const warningCodes = plans[mode].warnings.map((item) => item.code);
    // Batch 1B.4B (deliberate update): neither the A5 «not import-tested» note nor a tested-import claim is shown.
    assert(!warningCodes.some((code) => /^gemini-/.test(code)), `${mode}: no import-test status warning`);
    const shown = deliveryDiagnostics(plans[mode]);
    assert(![...shown.warnings, ...shown.info].some((item) => /importtest|testet oppsett|akseptanse/.test(item.text)), mode);
    assert.equal(plans[mode].counts.hyperlinkTransfers, 1);
    assert.equal(plans[mode].counts.movedReferences, 1);
    const mapping = plans[mode].gmiSummary.hyperlinkTransfer.occurrenceMapping;
    assert.equal(mapping.length, 1);
    assert.notEqual(mapping[0].revisedOccurrenceKey, mapping[0].proposedOccurrenceKey, 'the revised source has its own fingerprint');
    assert.equal(JSON.parse(mapping[0].revisedOccurrenceKey)[1], f.object(108).objectKey);
    assert.equal(JSON.parse(mapping[0].revisedOccurrenceKey)[0], `sha256:${Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')}`);
  }
  assert(sameBytes(getDeliveryGmiBytes(plans['gmi-only']), getDeliveryGmiBytes(plans.combined)), 'standalone and combined agree without delivery removals');
  // Combined package: the moved photograph's attachment is its original file, byte for byte (EXIF included).
  const zip = unzipSync(new Uint8Array(await (await buildDeliveryPackage(plans.combined)).arrayBuffer()));
  const moved = photoOf(f, 'SYNT_LOK_B.png');
  assert(sameBytes(zip['Attachments/SYNT_LOK_B.png'], new Uint8Array(await f.session.getAssetFile(moved.assetId).arrayBuffer())));
  assert(sameBytes(zip[plans.combined.naming.gmiFilename], getDeliveryGmiBytes(plans.combined)));
  assert.deepEqual(Object.keys(zip).filter((name) => name.startsWith('Attachments/')).sort(), plans.combined.attachments.map((item) => item.path).sort());
  // Photo-only GML: the moved occurrence at the recipient's GMI position, as Foreslått shows it.
  const gml = plans['photos-only'].photoPlan.occurrences;
  assert.deepEqual(gml.map((row) => row.occurrenceId), [moved.id]);
  assert.equal(gml[0].positionProvenance.acceptance, 'user-approved-hyperlink-transfer');
  assert.equal(gml[0].sourceContext.objectKey, f.object(108).objectKey);
  assert.deepEqual([Number(gml[0].point.easting).toFixed(2), Number(gml[0].point.northing).toFixed(2)], ['581950.10', '6566010.15']);
  assert.match(getDeliveryGml(plans['photos-only']), /SYNT_LOK_B\.png/);
  assert.equal(moved.spatial.current, null, 'the accepted FOTO record stays unplaced');
  // Report and summary name the moved photograph and stay separate from GML/Ikke.
  assert.match(deliveryReport({ plan: plans.combined }), /Flyttet til et annet punktobjekt:\r\nSYNT_LOK_B\.png · Punkt 293 .*→ Punkt 108 .*: 1 bildereferanse/);
  assert.deepEqual(deliverySummary({ plan: plans.combined }).find(([label]) => label === 'Flyttede bildelenker'), ['Flyttede bildelenker', '1 bilde · 1 bildereferanse flyttet til et annet punktobjekt i GMI']);
  // Download does not commit or discard the transfer, and the FOTO lock stays.
  assert(recordDeliveryDownload(plans.combined).ok);
  assert.deepEqual(historyIds(f), history);
  assert.equal(f.session.setDeliveryIntent(f.layerId, [moved.id], 'exclude').error, 'hyperlink-transfer-active');
  // Nothing was written: original bytes, FOTO accepted state, history; export planning published nothing.
  assert(sameBytes(originalBytes(f), before));
  assert.equal(f.fotoState(), fotoBefore);
  assert.equal(f.publications.length, publications + 1, 'only the download record publishes (unsaved flag)');
  assert(f.registry.revision(f.handle).hyperlinkTransfer, 'the transfer stays active in Foreslått');
});

test('one composition: a cell that loses a moved reference, receives one and loses a GML reference; Ikke on the recipient; field edits', async () => {
  const f = await MIXED();
  assert(f.session.setDeliveryIntent(f.layerId, [photoOf(f, 'SYNT_LOK_C.png').id], 'transfer').ok, 'LOK C to GML');
  assert(f.session.setDeliveryIntent(f.layerId, [photoOf(f, 'SYNT_SLU_1.png').id], 'exclude').ok, 'SLU 1 Ikke med');
  f.stageField(2, 'Rettet merknad');
  const result = f.commit([f.move(293, 'SYNT_LOK_B.png', 108), f.move(12, 'SYNT_KUM_1.png', 293)]);
  assert(result.ok, JSON.stringify(result));
  const before = originalBytes(f), fotoBefore = f.fotoState();
  const combined = ready(await plan(f, 'combined'), 'combined');
  const bytes = getDeliveryGmiBytes(combined);
  assert.deepEqual(linksOf(bytes), [
    cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_KUM_1.png')),     // lost B (moved) and C (GML), received KUM_1
    cell(w(1, 'SYNT_LOK_B.png', 'Feltmåler A')),                              // lost SLU_1 (Ikke), received B
    '',                                                                       // lost KUM_1 (moved)
  ]);
  assert.deepEqual(notesOf(bytes), ['Punkt 1', 'Punkt 2', 'Rettet merknad'], 'the ordinary correction is composed');
  assert.equal(combined.gmiSummary.fieldEditCount, 1);
  assert.deepEqual(combined.photoPlan.occurrences.map((row) => row.occurrenceId), [photoOf(f, 'SYNT_LOK_C.png').id], 'only the GML decision is in GML');
  assert.deepEqual(combined.attachments.map((item) => item.path).sort(),
    ['Attachments/SYNT_KUM_1.png', 'Attachments/SYNT_LOK_A.png', 'Attachments/SYNT_LOK_B.png', 'Attachments/SYNT_LOK_C.png'], 'SLU_1 (Ikke) is not delivered');
  assert.notEqual(combined.attachments.find((item) => item.path.endsWith('SYNT_LOK_C.png')).retained, true, 'C is delivered by GML only');
  assert.deepEqual([combined.counts.transferredReferences, combined.counts.excludedReferences, combined.counts.movedReferences, combined.counts.hyperlinkTransferAssets], [1, 1, 2, 2]);
  assert.equal(combined.counts.retainedReferences, 3);
  // Split: the same hyperlink composition, the field correction explicitly excluded.
  const split = ready(await plan(f, 'split', { includeFieldChanges: false }), 'split');
  assert.deepEqual(linksOf(getDeliveryGmiBytes(split)), linksOf(bytes));
  assert.deepEqual(notesOf(getDeliveryGmiBytes(split)), ['Punkt 1', 'Punkt 2', 'Punkt 3']);
  assert.deepEqual(codes(await plan(f, 'split')), ['field-exclusion-required']);
  // Standalone GMI: transfer and field edit, delivery choices not applied.
  const gmiOnly = ready(await plan(f, 'gmi-only'), 'gmi-only');
  assert.deepEqual(linksOf(getDeliveryGmiBytes(gmiOnly)), [cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_C.png'), w(3, 'SYNT_KUM_1.png')),
    cell(w(1, 'SYNT_SLU_1.png', 'Feltmåler B'), w(2, 'SYNT_LOK_B.png', 'Feltmåler A')), '']);
  // The exported bytes pass the independent verifier against the original and the decisions, and the revision reads back.
  const document = f.registry.resolve(f.handle).document;
  const set = activeGmiHyperlinkTransferSet(f.history());
  const removals = f.session.getPhotoDeliverySnapshot(f.layerId).removalSelections.map((item) => ({ objectKey: item.objectKey, referenceIds: item.referenceIds }));
  const fieldEdits = [{ target: { scope: 'point', sourceIndex: 2, field: 'Merknad' }, lexeme: 'Rettet merknad' }];
  const checked = verifyGmiHyperlinkTransfer(document, bytes, { photoSourceId: set.basis.photoSourceId, transfers: set.decisions, removals, fieldEdits });
  assert.equal(checked.ok, true, JSON.stringify(checked.failures));
  assert.deepEqual([checked.summary.movedReferences, checked.summary.removedReferences], [2, 2]);
  assert(sameBytes(originalBytes(f), before));
  assert.equal(f.fotoState(), fotoBefore);
});

test('empty recipients, several transfers to one recipient and independent transfers', async () => {
  const f = await transferFixture([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_E_A.png'), w(2, 'SYNT_E_B.png', 'Feltmåler A')) },
    { number: 2, fcode: 'KUM', hyperlink: '' },
    { number: 3, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_E_X.png')) },
    { number: 4, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_E_Y.png')) },
    { number: 5, fcode: 'SLU', hyperlink: '' },
  ], { names: ['SYNT_E_A.png', 'SYNT_E_B.png', 'SYNT_E_X.png', 'SYNT_E_Y.png'] });
  assert(f.commit([f.move(1, 'SYNT_E_A.png', 2), f.move(1, 'SYNT_E_B.png', 2), f.move(3, 'SYNT_E_X.png', 5)]).ok);
  const expected = ['', cell(w(1, 'SYNT_E_A.png'), w(2, 'SYNT_E_B.png', 'Feltmåler A')), '', cell(w(1, 'SYNT_E_Y.png')), cell(w(1, 'SYNT_E_X.png'))];
  for (const mode of ['gmi-only', 'combined', 'split']) assert.deepEqual(linksOf(getDeliveryGmiBytes(ready(await plan(f, mode), mode))), expected, mode);
  const combined = await plan(f, 'combined');
  assert.deepEqual([combined.counts.hyperlinkTransfers, combined.counts.hyperlinkTransferAssets, combined.counts.movedReferences], [3, 3, 3]);
  assert.equal(combined.counts.includedAssets, 4, 'every retained photograph is packaged once');
});

test('chains, cycles and swaps compose once per cell, also with an Ikke removal in a cycle cell', async () => {
  const f = await MIXED();
  assert(f.session.setDeliveryIntent(f.layerId, [photoOf(f, 'SYNT_LOK_C.png').id], 'exclude').ok);
  // Swap LOK B <-> SLU 1 and a chain KUM 1 -> LOK.
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108), f.move(108, 'SYNT_SLU_1.png', 293), f.move(12, 'SYNT_KUM_1.png', 293)]).ok);
  const combined = ready(await plan(f, 'combined'));
  assert.deepEqual(linksOf(getDeliveryGmiBytes(combined)), [
    cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_SLU_1.png', 'Feltmåler B'), w(3, 'SYNT_KUM_1.png')),
    cell(w(1, 'SYNT_LOK_B.png', 'Feltmåler A')),
    '',
  ]);
  assert(!combined.attachments.some((item) => item.path.endsWith('SYNT_LOK_C.png')), 'Ikke med: not delivered');
  // Cycle in one commit, then a second cumulative commit: the composition follows the active (last) entry.
  const g = await LOK_SLU();
  assert(g.commit([g.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  assert(g.commit([g.move(108, 'SYNT_SLU_1.png', 293)]).ok);
  assert.deepEqual(linksOf(getDeliveryGmiBytes(ready(await plan(g, 'combined')))), [
    cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_C.png'), w(3, 'SYNT_SLU_1.png', 'Feltmåler B')),
    cell(w(1, 'SYNT_LOK_B.png', 'Feltmåler A')), cell(w(1, 'SYNT_KUM_1.png'))]);
});

test('repeated references move together; a shared photograph keeps its sibling occurrence; nothing is deduplicated or multiplied', async () => {
  const f = await transferFixture([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_R.png'), w(2, 'SYNT_R.png', 'Feltmåler A')) },
    { number: 2, fcode: 'KUM', hyperlink: '' },
    { number: 3, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_S.png')) },
    { number: 4, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_S.png')) },
    { number: 5, fcode: 'SLU', hyperlink: '' },
  ], { names: ['SYNT_R.png', 'SYNT_S.png'] });
  assert.equal(f.photos().filter((photo) => photo.originalFilename === 'SYNT_S.png').length, 2, 'two occurrences of the shared photograph');
  assert(f.commit([f.move(1, 'SYNT_R.png', 2), f.move(3, 'SYNT_S.png', 5)]).ok);
  for (const mode of ['gmi-only', 'combined']) {
    const p = ready(await plan(f, mode), mode);
    assert.deepEqual(linksOf(getDeliveryGmiBytes(p)), ['', cell(w(1, 'SYNT_R.png'), w(2, 'SYNT_R.png', 'Feltmåler A')), '', cell(w(1, 'SYNT_S.png')), cell(w(1, 'SYNT_S.png'))], mode);
    assert.deepEqual([p.counts.hyperlinkTransfers, p.counts.hyperlinkTransferAssets, p.counts.movedReferences], [2, 2, 3], mode);
    const mapping = p.gmiSummary.hyperlinkTransfer.occurrenceMapping;
    assert.deepEqual(mapping.map((row) => row.localReferenceIds.length).sort(), [1, 2], 'the repeated group arrives with both references');
  }
  const combined = await plan(f, 'combined');
  assert.deepEqual(combined.attachments.map((item) => item.path), ['Attachments/SYNT_R.png', 'Attachments/SYNT_S.png'], 'one attachment per photograph');
  assert.equal(combined.counts.gmiPlacements, 3, 'R on 2; S on 4 (sibling) and 5 (moved)');
  assert.equal(combined.counts.retainedReferences, 4);
  // The sibling occurrence keeps its own association and is protected; it was never moved.
  const presentation = photoHyperlinkTransferViews({ registry: f.registry, photoSession: f.session, photoLayerId: f.layerId });
  assert.equal(presentation.views[0].status, 'current');
  assert.equal(presentation.views[0].occurrences.length, 2);
});

test('stale bases: delivery choices, field edits, undo and redo after planning invalidate the plan; redo reproduces the bytes', async () => {
  const f = await MIXED();
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const first = ready(await plan(f, 'combined'));
  const firstBytes = getDeliveryGmiBytes(first);
  // A delivery choice on an unrelated photograph after planning.
  assert(f.session.setDeliveryIntent(f.layerId, [photoOf(f, 'SYNT_KUM_1.png').id], 'exclude').ok);
  assert.equal(first.isLive(), false);
  assert.throws(() => getDeliveryGmiBytes(first), { code: 'stale-plan' });
  const excluded = ready(await plan(f, 'combined'));
  assert.deepEqual(linksOf(getDeliveryGmiBytes(excluded))[2], '', 'the new choice is composed');
  assert(f.session.setDeliveryIntent(f.layerId, [photoOf(f, 'SYNT_KUM_1.png').id], 'keep-link').ok);
  const again = ready(await plan(f, 'combined'));
  assert(sameBytes(getDeliveryGmiBytes(again), firstBytes), 'same decisions, same bytes');
  // An ordinary correction after planning.
  f.stageField(1, 'Ny merknad');
  assert.equal(again.isLive(), false);
  const withField = ready(await plan(f, 'combined'));
  assert(f.registry.undo(f.handle).ok);   // undo the correction
  assert.equal(withField.isLive(), false);
  // Undo the transfer: exports are the ordinary (untransferred) delivery again.
  const transferred = ready(await plan(f, 'combined'));
  assert(f.registry.undo(f.handle).ok);
  assert.equal(transferred.isLive(), false);
  const undone = ready(await plan(f, 'combined'));
  assert.equal(undone.counts.hyperlinkTransfers, 0);
  assert(sameBytes(getDeliveryGmiBytes(undone), originalBytes(f)), 'no transfer and no choices: byte-identical no-op');
  assert(!undone.warnings.some((item) => /^gemini-/.test(item.code)));
  // Redo: the transfer is composed again, byte-identical to the first plan.
  assert(f.registry.redo(f.handle).ok);
  assert.equal(undone.isLive(), false);
  assert(sameBytes(getDeliveryGmiBytes(ready(await plan(f, 'combined'))), firstBytes));
  // Photo-only GML is stale after a Rettinger transition too.
  const photosOnly = ready(await plan(f, 'photos-only'));
  assert(f.registry.undo(f.handle).ok);
  assert.equal(photosOnly.isLive(), false);
});

test('fail closed: unverified FOTO state, missing attachments and unattested field exports leave every owner unchanged', async () => {
  const f = await LOK_SLU();
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  // Low-level field export without the delivery planner's FOTO attestation.
  assert.equal((await buildGmiFieldExport(f.registry, f.handle, { date: DATE })).code, 'hyperlink-transfer-unverified');
  assert.equal((await buildGmiFieldExport(f.registry, f.handle, { date: DATE, hyperlinkTransfer: { transferSetId: 'cs-x', planKey: 'x' } })).code, 'hyperlink-transfer-unverified');
  assert(getGmiExportReadiness(f.registry, f.handle).blocking.includes('hyperlink-transfer-unverified'));
  const set = activeGmiHyperlinkTransferSet(f.history());
  const attested = getGmiExportReadiness(f.registry, f.handle, { hyperlinkTransfer: { transferSetId: set.id, planKey: set.planKey } });
  assert.deepEqual([attested.ready, attested.notes.includes('hyperlink-transfer-included')], [true, true]);
  // A missing original file of a retained (moved) photograph blocks; no bytes.
  const moved = photoOf(f, 'SYNT_LOK_B.png');
  const getAssetFile = f.session.getAssetFile;
  const empty = new File([], 'SYNT_LOK_B.png');
  f.session.getAssetFile = (assetId) => (assetId === moved.assetId ? empty : getAssetFile(assetId));
  try {
    const missing = await plan(f, 'combined');
    assert.equal(missing.status, 'blocked');
    assert(codes(missing).includes('missing-attachment'));
    assert.equal(missing.gmiSummary, null);
    assert.throws(() => getDeliveryGmiBytes(missing), { code: 'blocked-plan' });
  } finally { f.session.getAssetFile = getAssetFile; }
  // FOTO changed behind the (unbound) guard: the transfer's FOTO record no longer matches, so no mode exports it.
  const fotoBefore = f.fotoState(), history = historyIds(f), publications = f.publications.length;
  assert(f.session.setDeliveryIntent(f.layerId, [moved.id], 'exclude').ok);
  for (const mode of MODES) {
    const blocked = await plan(f, mode);
    assert.deepEqual(codes(blocked), ['hyperlink-transfer-photo-unverified'], mode);
    assert.match(deliveryMessage(blocked.errors[0]), /kan ikke bekreftes mot FOTO/);
  }
  assert.deepEqual(historyIds(f), history);
  assert.equal(f.publications.length, publications);
  assert.notEqual(f.fotoState(), fotoBefore, 'only the bypassing FOTO write changed FOTO');
});

test('the composition planner refuses overlapping or unsupported combinations rather than guessing', async () => {
  const f = await LOK_SLU();
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const view = photoHyperlinkTransferViews({ registry: f.registry, photoSession: f.session, photoLayerId: f.layerId }).views[0];
  const session = f.history();
  const { photoSource, photoState } = view.planning;
  const edge = (objectKey, filename) => Object.values(photoSource.associationLedger.associationsById)
    .find((item) => item.objectKey === objectKey && item.photoId === f.assetOf(filename));
  const selection = (number, filename) => { const objectKey = f.object(number).objectKey, found = edge(objectKey, filename);
    return { key: JSON.stringify([photoSource.fingerprint, objectKey, found.photoId]), sourceId: photoSource.id, sourceFingerprint: photoSource.fingerprint,
      objectKey, assetId: found.photoId, referenceIds: found.referenceIds }; };
  // A delivery removal of the transferred occurrence itself.
  const overlap = planGmiDeliveryComposition(session, { photoSource, photoState, removals: [selection(293, 'SYNT_LOK_B.png')] });
  assert.equal(overlap.ok, false);
  assert(overlap.blockers.some((item) => item.code === 'removal-overlaps-transfer'));
  // The wrong FOTO source, missing FOTO facts, and no transfer at all.
  assert.deepEqual(planGmiDeliveryComposition(session, { photoSource: { ...photoSource, id: 'other' }, photoState }).blockers.map((item) => item.code), ['transfer-source-mismatch']);
  assert(planGmiDeliveryComposition(session, { photoSource, photoState: { byAssetId: {} } }).blockers.some((item) => item.code === 'photo-state-missing'));
  const g = await LOK_SLU();
  assert.deepEqual(planGmiDeliveryComposition(g.history(), { photoSource: g.source(), photoState }).blockers.map((item) => item.code), ['no-active-transfer']);
  // Authorization and session basis of the apply step.
  const ok = planGmiDeliveryComposition(session, { photoSource, photoState, removals: [selection(12, 'SYNT_KUM_1.png')] });
  assert.equal(ok.ok, true, JSON.stringify(ok.blockers));
  assert.equal(applyGmiDeliveryComposition(ok, { session, authorization: { transferKeys: ok.transferKeys, removalKeys: [] } }).rejections[0].code, 'authorization-mismatch');
  assert.equal(applyGmiDeliveryComposition(ok, { session, authorization: { transferKeys: ok.transferKeys } }).rejections[0].code, 'missing-authorization');
  f.stageField(0, 'Senere retting');
  assert.equal(applyGmiDeliveryComposition(ok, { session: f.history(), authorization: { transferKeys: ok.transferKeys, removalKeys: ok.removalKeys } }).rejections[0].code, 'stale-session-state');
  const applied = applyGmiDeliveryComposition(ok, { session, authorization: { transferKeys: ok.transferKeys, removalKeys: ok.removalKeys } });
  assert.equal(applied.ok, true);
  assert.deepEqual(linksOf(applied.bytes)[2], '');
});

test('tampered output or contract: the independent verifier refuses every deviation from the original and the decisions', async () => {
  const f = await MIXED();
  assert(f.session.setDeliveryIntent(f.layerId, [photoOf(f, 'SYNT_SLU_1.png').id], 'exclude').ok);
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const combined = ready(await plan(f, 'combined'));
  const document = f.registry.resolve(f.handle).document;
  const set = activeGmiHyperlinkTransferSet(f.history());
  const removals = f.session.getPhotoDeliverySnapshot(f.layerId).removalSelections.map((item) => ({ objectKey: item.objectKey, referenceIds: item.referenceIds }));
  const contract = { documentFingerprint: document.fingerprint, photoSourceId: set.basis.photoSourceId, transfers: set.decisions, removals };
  const good = getDeliveryGmiBytes(combined);
  assert.equal(verifyGmiHyperlinkTransfer(document, good, contract).ok, true);
  const lexemes = linksOf(good);
  const target = (sourceIndex, field = 'S_HYPERLINK') => ({ scope: 'point', sourceIndex, field });
  const original = (sourceIndex, field = 'S_HYPERLINK') => fieldLines(getGmiSourceBytes(document))[sourceIndex].split(';')[field === 'S_HYPERLINK' ? 3 : 4];
  const tamper = (cells) => {
    const edits = Object.entries(cells).map(([key, lexeme]) => { const [sourceIndex, field] = key.split(':'); return { target: target(Number(sourceIndex), field), expected: original(Number(sourceIndex), field), lexeme }; });
    const result = editGmiFields(document, edits);
    assert(result.ok, JSON.stringify(result.rejections));
    return result.bytes;
  };
  const failing = (bytes, override = {}) => {
    const result = verifyGmiHyperlinkTransfer(document, bytes, { ...contract, ...override });
    assert.equal(result.ok, false);
    return result.failures.map((item) => item.code);
  };
  const base = { 0: lexemes[0], 1: lexemes[1] };
  // The Ikke reference left on the recipient.
  assert(failing(tamper({ ...base, 1: cell(w(1, 'SYNT_SLU_1.png', 'Feltmåler B'), w(2, 'SYNT_LOK_B.png', 'Feltmåler A')) })).includes('reference-count-mismatch'));
  // The moved reference also left on the source (duplicated).
  assert(failing(tamper({ ...base, 0: cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_B.png', 'Feltmåler A'), w(3, 'SYNT_LOK_C.png')) })).length);
  // Metadata dropped from the moved wrapper.
  assert(failing(tamper({ ...base, 1: cell(w(1, 'SYNT_LOK_B.png')) })).includes('reference-content-mismatch'));
  // Non-contiguous ordinals on the source.
  assert(failing(tamper({ ...base, 0: cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(3, 'SYNT_LOK_C.png')) })).includes('ordinals-not-contiguous'));
  // An unrelated hyperlink and an unauthorized field changed.
  assert(failing(tamper({ ...base, 2: '' })).length);
  assert(failing(tamper({ ...base, '2:Merknad': 'Ikke godkjent' })).includes('unauthorized-field-change'));
  // A byte outside every authorized cell (geometry).
  const text = latin1(good).replace('581964.000 6566024.000 99.000', '581964.000 6566024.000 99.001');
  assert(failing(new Uint8Array(Buffer.from(text, 'latin1'))).some((code) => ['geometry-changed', 'bytes-changed-outside-authorized-cells'].includes(code)));
  // No change at all for an authorized move and removal.
  assert(failing(getGmiSourceBytes(document)).length);
  // Contract tampering: a removal claiming the moved reference, or naming another object.
  assert(failing(good, { removals: [...removals, { objectKey: f.object(293).objectKey, referenceIds: set.decisions[0].referenceIds }] }).includes('contract-reference-claimed-twice'));
  assert(failing(good, { removals: [{ objectKey: f.object(12).objectKey, referenceIds: removals[0].referenceIds }] }).includes('contract-reference-unknown'));
  assert(failing(good, { removals: [] }).length, 'an undeclared removal is refused');
  // The revision association check refuses a ledger that does not follow the decisions.
  const revisedSource = deriveRevisionPhotoSource(createGmiSourceDocument(good), { sourceId: 'revision', fingerprint: await computeGmiSourceFingerprint(good),
    assets: f.photos().map((photo) => ({ assetId: photo.assetId, originalFilename: photo.originalFilename })) });
  assert.equal(verifyRevisionAssociations({ originalSource: f.source(), revisedSource, transfers: set.transfers, removals: f.session.getPhotoDeliverySnapshot(f.layerId).removalSelections }).ok, true);
  assert.deepEqual(verifyRevisionAssociations({ originalSource: f.source(), revisedSource, transfers: set.transfers, removals: [] }).failures.map((item) => item.code), ['revision-association-missing']);
  assert(verifyRevisionAssociations({ originalSource: f.source(), revisedSource, transfers: [], removals: f.session.getPhotoDeliverySnapshot(f.layerId).removalSelections }).failures.length);
});

test('revised GMI reimport: the app parser and FOTO association machinery read the transferred links on the recipient', async () => {
  const f = await LOK_SLU();
  const fingerprintBefore = f.registry.resolve(f.handle).document.fingerprint;
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const combined = ready(await plan(f, 'combined'));
  const bytes = getDeliveryGmiBytes(combined);
  // Import the revised file as a new GMI layer next to the original.
  const file = new File([bytes], 'transfer-revidert.gmi');
  const parser = new GMIParser(decodeGmiBytes(bytes)), data = parser.toObject();
  assert.deepEqual(parser.points.map((point) => point.attributes.S_HYPERLINK ?? ''), linksOf(bytes).map((value) => value.trim()), 'structurally valid for the app parser');
  f.layers.revised = { id: 'revised', type: 'GMI', file: { name: file.name, format: 'GMI' }, data };
  f.sources.register('revised', data, file, createGmiPhotoSource(parser));
  const opened = await f.registry.open('revised');
  assert(opened.ok, opened.code);
  const revisedDocument = f.registry.resolve(opened.handle).document;
  assert.equal(revisedDocument.editable, true);
  assert.notEqual(revisedDocument.fingerprint, fingerprintBefore, 'original and revised sources are distinct');
  assert.equal(f.registry.resolve(f.handle).document.fingerprint, fingerprintBefore, 'the original layer is untouched');
  assert((await f.registry.verifySource(f.handle)).ok);
  assert.equal(activeGmiHyperlinkTransferSet(f.registry.getSession(opened.handle).session), null, 'the revision carries no transfer of its own');
  // The revised layer exports on its own as a byte-identical no-op, although the photo layer is bound to the transferred
  // original; a coordinated package of the revised layer with that photo layer is refused.
  const revisedCapture = (mode) => captureDeliverySnapshot({ mode, registry: f.registry, handle: opened.handle, photoSession: f.session, photoLayerId: f.layerId });
  const revisedOnly = ready(await build(revisedCapture('gmi-only')), 'revised gmi-only');
  assert(sameBytes(getDeliveryGmiBytes(revisedOnly), bytes));
  assert.equal(revisedOnly.counts.hyperlinkTransfers, 0);
  assert.deepEqual(codes(await build(revisedCapture('combined'))), ['hyperlink-transfer-other-gmi']);
  // A fresh FOTO layer with the same photographs, sourced from the revised GMI.
  const names = f.photos().map((photo) => photo.originalFilename);
  const g = await exportFixture({ names: [...new Set(names)], unplaced: true });
  const ticket = g.session.beginSourceWorkflow(g.layerId), sourceTicket = f.sources.begin('revised');
  assert(await g.session.stageLayerSource(g.layerId, { binding: sourceTicket.binding, read: () => f.sources.read(sourceTicket), isLive: () => f.sources.isLive(sourceTicket.binding) }, 'gmi'));
  assert(saveStagedSource(g.session, ticket, g.session.getSnapshot().sourceReviews[g.layerId]).ok);
  g.session.endSourceWorkflow(ticket);
  const revisedSource = g.session.getLayer(g.layerId).spatialSources.find((item) => item.kind === 'gmi');
  assert.equal(revisedSource.fingerprint, revisedDocument.fingerprint);
  const reimported = g.session.getLayerPhotos(g.layerId).find((photo) => photo.originalFilename === 'SYNT_LOK_B.png');
  assert.equal(reimported.occurrence.objectKey, f.object(108).objectKey, 'the transferred link is on the recipient');
  assert(!g.session.getLayerPhotos(g.layerId).some((photo) => photo.originalFilename === 'SYNT_LOK_B.png' && photo.occurrence?.objectKey === f.object(293).objectKey),
    'the old source no longer holds the moved group');
  // The occurrence mapping recorded by the export names exactly the reimported occurrence and its references.
  const [mapping] = combined.gmiSummary.hyperlinkTransfer.occurrenceMapping;
  assert.equal(reimported.occurrence.key, mapping.revisedOccurrenceKey);
  assert.deepEqual([...reimported.occurrence.referenceIds].map((id) => id.slice(revisedSource.id.length + 1)).sort(), mapping.localReferenceIds);
  const [transfer] = activeGmiHyperlinkTransferSet(f.history()).photo.transfers;
  assert.deepEqual(transfer.outputReferenceIds.map((id) => id.slice(transfer.outputReferenceIds[0].indexOf(':') + 1)), mapping.localReferenceIds,
    'predicted output references equal the reimported ones (no delivery removal on the recipient)');
  // The whole association ledger follows the decisions, and every original asset still resolves.
  const checked = verifyRevisionAssociations({ originalSource: f.source(), revisedSource, transfers: activeGmiHyperlinkTransferSet(f.history()).transfers });
  assert.equal(checked.ok, true, JSON.stringify(checked.failures));
  assert.equal(Object.keys(revisedSource.associationLedger.associationsById).length, 5);
  // Wrapper ordinals regenerate: the reimported references on the source are renumbered contiguously.
  const lok = Object.values(revisedSource.objectsByKey).find((object) => object.parserId === 293);
  assert.equal(lok.hyperlinkRaw, cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_C.png')));
});

test('LF line endings and a UTF-8 file with ASCII links export byte-exactly outside the composed cells', async () => {
  const lf = await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_LF_A.png', 'Feltmåler A'), w(2, 'SYNT_LF_B.png')) },
    { number: 108, fcode: 'SLU', hyperlink: '' },
  ], { names: ['SYNT_LF_A.png', 'SYNT_LF_B.png'], eol: '\n' });
  assert(lf.commit([lf.move(293, 'SYNT_LF_A.png', 108)]).ok);
  const lfBytes = getDeliveryGmiBytes(ready(await plan(lf, 'combined')));
  assert(!lfBytes.includes(13), 'no CR introduced');
  assert.deepEqual(linksOf(lfBytes), [cell(w(1, 'SYNT_LF_B.png')), cell(w(1, 'SYNT_LF_A.png', 'Feltmåler A'))]);
  const utf8 = (text) => new TextEncoder().encode(text);
  const decode = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const u = await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_U_A.png', 'Feltmaaler A'), w(2, 'SYNT_U_B.png')), note: 'Måling ved kum' },
    { number: 108, fcode: 'SLU', hyperlink: cell(w(1, 'SYNT_U_C.png')), note: 'Sluk ø' },
  ], { names: ['SYNT_U_A.png', 'SYNT_U_B.png', 'SYNT_U_C.png'], encode: utf8 });
  assert.equal(u.registry.resolve(u.handle).document.encoding.encodingClass, 'utf8-likely');
  assert(u.commit([u.move(293, 'SYNT_U_B.png', 108)]).ok);
  for (const mode of ['gmi-only', 'combined']) {
    const bytes = getDeliveryGmiBytes(ready(await plan(u, mode), mode));
    assert.deepEqual(linksOf(bytes, decode), [cell(w(1, 'SYNT_U_A.png', 'Feltmaaler A')), cell(w(1, 'SYNT_U_C.png'), w(2, 'SYNT_U_B.png'))], mode);
    assert.deepEqual(notesOf(bytes, decode), ['Måling ved kum', 'Sluk ø'], `${mode}: UTF-8 text outside the cells is preserved`);
  }
});

test('export composition never edits a cell twice and keeps the reserved-column guard', async () => {
  const f = await MIXED();
  assert(f.session.setDeliveryIntent(f.layerId, [photoOf(f, 'SYNT_LOK_C.png').id], 'exclude').ok);
  f.stageField(0, 'Retting på LOK');
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108), f.move(12, 'SYNT_KUM_1.png', 293)]).ok);
  const view = photoHyperlinkTransferViews({ registry: f.registry, photoSession: f.session, photoLayerId: f.layerId }).views[0];
  const removals = f.session.getPhotoDeliverySnapshot(f.layerId).removalSelections;
  const composition = planGmiDeliveryComposition(f.history(), { photoSource: view.planning.photoSource, photoState: view.planning.photoState, removals });
  assert.equal(composition.ok, true, JSON.stringify(composition.blockers));
  const keys = composition.cells.map((entry) => gmiCellKey(entry));
  assert.equal(new Set(keys).size, keys.length, 'one edit per S_HYPERLINK cell');
  const lok = composition.cells.find((entry) => entry.objectKey === f.object(293).objectKey);
  assert.deepEqual([lok.removedReferences.length, lok.deliveryRemovedReferences.length, lok.addedReferences.length], [1, 1, 1]);
  assert.equal(lok.original, cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_B.png', 'Feltmåler A'), w(3, 'SYNT_LOK_C.png')), 'expected = the original lexeme');
  assert.equal(composition.fieldEditCount, 1);
  assert.equal(composition.counts.deliveryRemovedReferences, 1);
});

// Verification refinement (after Batch 1B.3A): the GML-only inclusion policy, split-delivery counts and the
// multiple-transfer restriction.

test('Kun GML med bilder: a moved photograph that was unplaced before the transfer enters GML only with the explicit inclusion', async () => {
  const f = guarded(await LOK_SLU());
  // Every other photograph is placed at its own GMI position; the moved one stays unplaced in FOTO.
  const others = f.photos().filter((photo) => photo.occurrence && photo.originalFilename !== 'SYNT_LOK_B.png');
  assert.equal(f.session.acceptCandidates(f.layerId, others.map((photo) => ({ photoId: photo.id, candidateId: `gmi-position:${photo.occurrence.key}` }))).length, others.length);
  const scope = { registry: f.registry, photoSession: f.session, photoLayerId: f.layerId };
  assert.equal(deliveryTransferredUnplaced(scope), null, 'nothing to decide without a transfer');
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const moved = photoOf(f, 'SYNT_LOK_B.png');
  const decision = deliveryTransferredUnplaced(scope);
  assert.deepEqual([decision.occurrences, decision.assets], [1, 1]);
  const fotoBefore = f.fotoState(), history = historyIds(f);
  // Default, no decision: the accepted (unplaced) record is exported, so the standalone rule leaves the photograph out, and it is named.
  const withheld = ready(await plan(f, 'photos-only'));
  assert(!withheld.photoPlan.occurrences.some((row) => row.occurrenceId === moved.id));
  assert(withheld.photoPlan.excluded.some((row) => row.occurrenceId === moved.id && row.reason === 'unplaced'));
  assert.doesNotMatch(getDeliveryGml(withheld), /SYNT_LOK_B\.png/);
  assert.equal(withheld.photoPlan.occurrences.length, others.length, 'every other placed photograph is exported as before');
  assert.equal(withheld.warnings.find((item) => item.code === 'hyperlink-transfer-unplaced-withheld')?.occurrenceId, moved.id);
  assert(deliveryDiagnostics(withheld).warnings.some((item) => item.code === 'hyperlink-transfer-unplaced-withheld'), 'Bør kontrolleres, not information');
  assert.match(deliveryMessage('hyperlink-transfer-unplaced-withheld'), /Bekreft i Innhold/);
  assert.deepEqual(deliverySummary({ plan: withheld }).find(([label]) => label === 'Flyttede bildelenker'),
    ['Flyttede bildelenker', '1 bilde ikke tatt med (uplassert før flyttingen, ikke bekreftet)']);
  assert.match(deliveryReport({ plan: withheld }), /Flyttet til et annet punktobjekt:\r\nSYNT_LOK_B\.png · Punkt 293 .*→ Punkt 108 .*: ikke tatt med i GML/);
  // Explicit inclusion: the recipient's GMI position as Foreslått shows it, with the transfer's provenance.
  const included = ready(await plan(f, 'photos-only', { includeTransferredUnplaced: true }));
  const row = included.photoPlan.occurrences.find((item) => item.occurrenceId === moved.id);
  assert.equal(row.positionProvenance.acceptance, 'user-approved-hyperlink-transfer');
  assert.equal(row.sourceContext.objectKey, f.object(108).objectKey);
  assert(!included.warnings.some((item) => item.code === 'hyperlink-transfer-unplaced-withheld'));
  assert.deepEqual(deliverySummary({ plan: included }).find(([label]) => label === 'Flyttede bildelenker'),
    ['Flyttede bildelenker', '1 bilde plassert på mottakerens GMI-posisjon i GML']);
  assert.match(deliveryReport({ plan: included }), /: 1 bildereferanse · plassert på mottakerens GMI-posisjon i GML/);
  // The inclusion is a delivery decision only: FOTO accepted state and history stay unchanged.
  assert.equal(f.fotoState(), fotoBefore);
  assert.equal(photoOf(f, 'SYNT_LOK_B.png').spatial.current, null);
  assert.deepEqual(historyIds(f), history);
  // GMI and coordinated modes ignore it: moved photographs stay «Beholdes i GMI», with the same bytes either way.
  for (const mode of ['gmi-only', 'combined', 'split']) {
    const a = ready(await plan(f, mode), mode), b = ready(await plan(f, mode, { includeTransferredUnplaced: true }), mode);
    assert(sameBytes(getDeliveryGmiBytes(a), getDeliveryGmiBytes(b)), mode);
    assert(!b.warnings.some((item) => item.code === 'hyperlink-transfer-unplaced-withheld'), mode);
  }
  // The decision belongs to one transfer state: undo removes it and makes the plan stale. Redo restores the identical
  // state (same key, as with the split exclusion); a new capture needs the inclusion again.
  assert(f.registry.undo(f.handle).ok);
  assert.equal(included.isLive(), false);
  assert.equal(deliveryTransferredUnplaced(scope), null);
  assert(f.registry.redo(f.handle).ok);
  assert.equal(deliveryTransferredUnplaced(scope).key, decision.key);
  assert(!(await plan(f, 'photos-only')).photoPlan.occurrences.some((item) => item.occurrenceId === moved.id), 'no inclusion carried by the registry');
});

test('Kun GML med bilder: a moved photograph accepted at its source GMI position needs no extra decision', async () => {
  const f = guarded(await MIXED());
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  assert.equal(deliveryTransferredUnplaced({ registry: f.registry, photoSession: f.session, photoLayerId: f.layerId }), null);
  const photosOnly = ready(await plan(f, 'photos-only'));
  const row = photosOnly.photoPlan.occurrences.find((item) => item.occurrenceId === photoOf(f, 'SYNT_LOK_B.png').id);
  assert.equal(row.positionProvenance.acceptance, 'user-approved-hyperlink-transfer', 'the explicit recipient position stays valid Foreslått evidence');
  assert.deepEqual([Number(row.point.easting).toFixed(2), Number(row.point.northing).toFixed(2)], ['581950.10', '6566010.15']);
  assert(!photosOnly.warnings.some((item) => item.code === 'hyperlink-transfer-unplaced-withheld'));
});

test('Delt levering: field corrections are left out by explicit confirmation, moved links are always included, and counted apart', async () => {
  const f = await MIXED();
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  const view = () => ({ session: f.history(), changedCells: f.registry.inspect(f.handle).cells.changed });
  // A transfer alone is a history entry with changed S_HYPERLINK cells, but no field correction.
  assert.equal(f.registry.inspect(f.handle).status.changeSetCount, 1, 'Rettinger still counts the history entry');
  assert.deepEqual({ ...deliveryCorrectionCounts(view()) }, { fieldChangeSets: 0, fieldCells: 0, movedPhotos: 1, movedReferences: 1 });
  const transferOnly = ready(await plan(f, 'split'), 'split without field corrections needs no exclusion');
  const movedLinks = linksOf(getDeliveryGmiBytes(transferOnly));
  assert.notDeepEqual(movedLinks, linksOf(originalBytes(f)));
  // With a field correction: the exclusion is required and counts the field correction only; the transfer stays included.
  f.stageField(1, 'Rettet merknad');
  assert.deepEqual({ ...deliveryCorrectionCounts(view()) }, { fieldChangeSets: 1, fieldCells: 1, movedPhotos: 1, movedReferences: 1 });
  assert.equal(f.registry.inspect(f.handle).status.changedCells, 3, 'status counts the two transfer cells too');
  assert.deepEqual(codes(await plan(f, 'split')), ['field-exclusion-required']);
  const split = ready(await plan(f, 'split', { includeFieldChanges: false }));
  assert.deepEqual(linksOf(getDeliveryGmiBytes(split)), movedLinks, 'Flyttede bildelenker inkluderes');
  assert.deepEqual(notesOf(getDeliveryGmiBytes(split)), notesOf(originalBytes(f)), 'Feltrettinger utelates');
  assert.notDeepEqual(notesOf(getDeliveryGmiBytes(ready(await plan(f, 'combined')))), notesOf(originalBytes(f)), 'combined keeps the correction');
  const review = { plan: split, fieldCount: deliveryCorrectionCounts(view()).fieldCells };
  const summary = Object.fromEntries(deliverySummary(review));
  assert.equal(summary.Rettinger, '1 feltretting utelates (uttrykkelig valgt)');
  assert.equal(summary['Flyttede bildelenker'], 'Inkluderes: 1 bilde · 1 bildereferanse flyttet til et annet punktobjekt i GMI');
  const report = deliveryReport(review);
  assert.match(report, /Rettinger: 1 feltretting utelates/);
  assert.match(report, /Flyttede bildelenker: Inkluderes: 1 bilde/);
  assert.deepEqual(split.gmiSummary.changeSets.map((item) => item.id), [activeGmiHyperlinkTransferSet(f.history()).id], 'only the transfer entry is delivered');
});

test('Batch 1B.4B: Kontroll and the TXT report count field corrections apart from moved photo links in every mode', async () => {
  const rows = (review) => Object.fromEntries(deliverySummary(review));
  const reviewOf = async (f, mode, extra) => {
    const counts = deliveryCorrectionCounts({ session: f.history(), changedCells: f.registry.inspect(f.handle).cells.changed });
    return { plan: ready(await plan(f, mode, extra), mode), fieldCount: counts.fieldCells };
  };
  // The observed real-data shape: Kun GMI's diff holds the two S_HYPERLINK cells of one transfer and no field edit.
  assert.equal(deliveryFieldCorrectionCount({ gmiSummary: { changedCells: 2, changes: [{ field: 'S_HYPERLINK' }, { field: 'S_HYPERLINK' }] } }), 0);
  assert.equal(deliveryFieldCorrectionCount({ gmiSummary: null }), 0, 'zero without a GMI export');

  const transferOnly = await MIXED();
  assert(transferOnly.commit([transferOnly.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  for (const mode of ['gmi-only', 'combined', 'split']) {
    const review = await reviewOf(transferOnly, mode);
    assert.equal(deliveryFieldCorrectionCount(review.plan), 0, mode);
    assert.equal(rows(review).Rettinger, 'Ingen feltrettinger', `${mode}: two S_HYPERLINK cells are not field corrections`);
    assert.match(rows(review)['Flyttede bildelenker'], /1 bilde · 1 bildereferanse flyttet til et annet punktobjekt i GMI$/, mode);
    const report = deliveryReport(review);
    assert.match(report, /\r\nRettinger: Ingen feltrettinger\r\n/, mode);
    assert.doesNotMatch(report, /feltretting(er)? tas med/, mode);
  }
  assert.equal(rows(await reviewOf(transferOnly, 'photos-only', { includeTransferredUnplaced: true })).Rettinger, 'Ingen GMI-eksport; rettingene beholdes i Rettinger');

  // Mixed: one field correction and the transfer, each counted once.
  transferOnly.stageField(1, 'Rettet merknad');
  for (const mode of ['gmi-only', 'combined']) {
    const review = await reviewOf(transferOnly, mode);
    assert.equal(rows(review).Rettinger, '1 feltretting tas med', mode);
    assert.match(rows(review)['Flyttede bildelenker'], /^1 bilde · 1 bildereferanse/, mode);
    assert.match(deliveryReport(review), /Rettinger: 1 feltretting tas med\r\n/, mode);
  }
  const split = await reviewOf(transferOnly, 'split', { includeFieldChanges: false });
  assert.equal(rows(split).Rettinger, '1 feltretting utelates (uttrykkelig valgt)');
  assert.match(rows(split)['Flyttede bildelenker'], /^Inkluderes: 1 bilde/);

  // Field-only: no transfer row, the field correction counted as before.
  const fieldOnly = await MIXED();
  fieldOnly.stageField(1, 'Rettet merknad');
  for (const mode of ['gmi-only', 'combined']) {
    const review = await reviewOf(fieldOnly, mode);
    assert.equal(rows(review).Rettinger, '1 feltretting tas med', mode);
    assert.equal(rows(review)['Flyttede bildelenker'], undefined, mode);
  }
  assert.equal(rows(await reviewOf(fieldOnly, 'split', { includeFieldChanges: false })).Rettinger, '1 feltretting utelates (uttrykkelig valgt)');
});

test('hyperlink-transfer-multiple: many photographs in one transfer set are supported; active transfers in two GMI files block only Kun GML med bilder', async () => {
  // One GMI file, two commits: the second set is cumulative and holds both photograph decisions.
  const f = guarded(await MIXED());
  assert(f.commit([f.move(293, 'SYNT_LOK_B.png', 108)]).ok);
  assert(f.commit([f.move(12, 'SYNT_KUM_1.png', 293)]).ok);
  assert.equal(f.history().changeSets.length, 2, 'two history entries');
  assert.equal(activeGmiHyperlinkTransferSet(f.history()).transfers.length, 2, 'the active set holds both decisions');
  for (const mode of MODES) {
    const p = ready(await plan(f, mode), mode);
    assert.equal(p.counts.hyperlinkTransfers, 2, mode);
  }
  // A second GMI file bound to the same photo layer, with its own active transfer.
  const g = guarded(await transferFixture([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_M_A.png'), w(2, 'SYNT_M_B.png')) },
    { number: 108, fcode: 'SLU', hyperlink: '' },
  ], { names: ['SYNT_M_A.png', 'SYNT_M_B.png', 'SYNT_N_A.png', 'SYNT_N_B.png'] }));
  const bytes = latin1Bytes(gmiText([
    { number: 501, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_N_A.png'), w(2, 'SYNT_N_B.png')), xyz: '581990.000 6566050.000 98.000' },
    { number: 502, fcode: 'KUM', hyperlink: '', xyz: '581995.000 6566055.000 97.000' },
  ]));
  const file = new File([bytes], 'andre.gmi'), parser = new GMIParser(decodeGmiBytes(bytes)), data = parser.toObject();
  g.layers.second = { id: 'second', type: 'GMI', file: { name: file.name, format: 'GMI' }, data };
  g.sources.register('second', data, file, createGmiPhotoSource(parser));
  const opened = await g.registry.open('second');
  assert(opened.ok, opened.code);
  const ticket = g.session.beginSourceWorkflow(g.layerId), sourceTicket = g.sources.begin('second');
  assert(await g.session.stageLayerSource(g.layerId, { binding: sourceTicket.binding, read: () => g.sources.read(sourceTicket), isLive: () => g.sources.isLive(sourceTicket.binding) }, 'gmi'));
  assert(saveStagedSource(g.session, ticket, g.session.getSnapshot().sourceReviews[g.layerId]).ok);
  g.session.endSourceWorkflow(ticket);
  assert(g.commit([g.move(293, 'SYNT_M_B.png', 108)]).ok);
  const second = g.session.getLayer(g.layerId).spatialSources.find((item) => item.kind === 'gmi' && item.loadedBinding?.layerId === 'second');
  const objectOf = (number) => Object.values(second.objectsByKey).find((item) => item.parserId === number);
  const assetId = g.assetOf('SYNT_N_B.png');
  const edge = Object.values(second.associationLedger.associationsById).find((item) => item.objectKey === objectOf(501).objectKey && item.photoId === assetId);
  const recipient = objectOf(502);
  const owners = { registry: g.registry, handle: opened.handle, photoSession: g.session, photoLayerId: g.layerId };
  const basis = photoHyperlinkTransferBasis(owners);
  assert(basis.ok, basis.code);
  const committed = commitPhotoHyperlinkTransfer({ ...owners, expected: basis.basis, now: () => DATE, transfers: [{ decisionKey: 'decision-501-N_B', sourceFingerprint: second.fingerprint,
    sourceId: second.id, sourceObjectKey: objectOf(501).objectKey, assetId, referenceIds: [...edge.referenceIds],
    recipient: { objectKey: recipient.objectKey, scope: 'point', sourceIndex: recipient.sourceIndex, parserId: recipient.parserId, guid: recipient.guid } }] });
  assert(committed.ok, JSON.stringify(committed));
  const views = photoHyperlinkTransferViews({ registry: g.registry, photoSession: g.session, photoLayerId: g.layerId }).views;
  assert.deepEqual(views.map((view) => view.status), ['current', 'current'], 'FOTO verifies both transfers');
  const captureFor = (mode, handle) => captureDeliverySnapshot({ mode, registry: g.registry, handle, photoSession: g.session, photoLayerId: g.layerId });
  // Blocked: Kun GML med bilder cannot honour transfers from two GMI files at once.
  assert.deepEqual(codes(await build(captureFor('photos-only', undefined))), ['hyperlink-transfer-multiple']);
  assert.match(deliveryMessage('hyperlink-transfer-multiple'), /bare ta med flyttinger fra én GMI-fil/);
  assert.equal(deliveryTransferredUnplaced({ registry: g.registry, photoSession: g.session, photoLayerId: g.layerId }), null);
  // Supported: each GMI file's own Kun GMI carries exactly its own transfer. Both sets have the id of their session's
  // first history entry, so this also proves the FOTO view is matched to its own session, not by id.
  assert.equal(activeGmiHyperlinkTransferSet(g.registry.getSession(opened.handle).session).id, activeGmiHyperlinkTransferSet(g.history()).id);
  const expectedOwn = { survey: [cell(w(1, 'SYNT_M_A.png')), cell(w(1, 'SYNT_M_B.png'))], second: [cell(w(1, 'SYNT_N_A.png')), cell(w(1, 'SYNT_N_B.png'))] };
  for (const handle of [g.handle, opened.handle]) {
    const own = ready(await build(captureFor('gmi-only', handle)), handle.layerId);
    assert.equal(own.counts.hyperlinkTransfers, 1, handle.layerId);
    assert.deepEqual(linksOf(getDeliveryGmiBytes(own)), expectedOwn[handle.layerId], handle.layerId);
  }
  // Coordinated packages keep the existing, more specific refusal.
  assert.deepEqual(codes(await build(captureFor('combined', g.handle))), ['hyperlink-transfer-other-gmi']);
  assert.deepEqual(codes(await build(captureFor('split', opened.handle))), ['hyperlink-transfer-other-gmi']);
});
