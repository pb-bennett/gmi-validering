// Batch 1B.2A: internal «Flytt til punktobjekt» transaction (not user-reachable).
//
// One explicit, user-approved transfer of photograph reference groups from a
// point object's S_HYPERLINK cell to another point object in the same loaded
// GMI, recorded as ONE entry in the existing Rettinger (M2) history.
//
// Ownership (see the Batch 1B.2A completion report):
// - History: the M2 session of the GMI layer is the only history owner. The
//   transfer is a `gmi-hyperlink-transfer-set` entry; undo/redo/discard of that
//   entry restore or reapply GMI and FOTO transfer state together.
// - GMI: the entry holds a complete plan against the ORIGINAL document; the
//   proposed copy composes it with field edits and verifies it independently
//   on every computation. The imported bytes are never modified.
// - FOTO: accepted FOTO state (records, assets, GMI source, delivery
//   decisions) is NOT modified. FOTO occurrences are keyed by the imported
//   source fingerprint and the FOTO GMI source must stay byte-equal to the
//   imported file (binding and delivery checks rely on it), and FOTO has no
//   history of its own. The transferred ownership, recipient position and
//   «intentional transfer» provenance are therefore recorded in the history
//   entry and exposed as a view derived from the proposed GMI
//   (photoHyperlinkTransferView). The delivery owner is untouched: the photo
//   stays «Beholdes i GMI», no GML decision is created and the position -> GML
//   default is never invoked.
// - Exports (Batch 1B.3A) compose the transfer only while this view is
//   'current'; the view also hands the delivery planner the FOTO facts the
//   planner checks (`planning`), derived exactly as at commit.
//
// Transaction: resolve live owners -> check the expected basis -> plan
// (cumulative) -> prepare FOTO record -> build the candidate session and its
// verified proposed state -> re-derive FOTO evidence from the proposed bytes
// and check that GMI and FOTO describe the same transfer -> recheck the basis
// -> commit through the registry (one publication, rollback on failure).
// Nothing live is written before the commit.
import { buildGmiHyperlinkTransferCommit, planGmiHyperlinkTransferCommit } from '../gmi-edit/hyperlinkTransferCommit.mjs';
import { activeGmiHyperlinkTransferSet } from '../gmi-edit/session.mjs';
import { createGmiPhotoSource, gmiPointPosition, reviewGmiPhotoSource } from './gmiPhotoSource.mjs';
import { photoTransferPositionConflict } from './photoHyperlinkTransferEligibility.mjs';

/** Provenance kind of a recipient placement produced by an approved hyperlink transfer. */
export const PHOTO_HYPERLINK_TRANSFER_PROVENANCE = 'hyperlink-transfer';
/** The only delivery status a transferred photograph has, before and after the transfer. */
const KEEP_LINK = 'keep-link';

const fail = (stage, code, detail = {}) => Object.freeze({ ok: false, stage, code, ...detail });
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedList = (values) => [...values].sort(compare);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plain = (value) => (value === undefined || value === null ? null : JSON.parse(JSON.stringify(value)));
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
const occurrenceKeyOf = (sourceFingerprint, objectKey, assetId) => JSON.stringify([sourceFingerprint, objectKey, assetId]);

// ------------------------------------------------------------------ context

/** The live owners and the identities a transfer is planned against, or a refusal. Read-only. */
function transferContext({ registry, handle, photoSession, photoLayerId } = {}) {
  if (!registry || typeof registry.resolve !== 'function' || !photoSession || typeof photoSession.getLayer !== 'function') return fail('context', 'invalid-context');
  const resolved = registry.resolve(handle);
  if (!resolved.ok) return fail('context', resolved.code);
  const { session, document } = resolved;
  if (!document.editable) return fail('context', 'document-not-editable');
  const layer = photoSession.getLayer(photoLayerId);
  if (!layer) return fail('context', 'photo-layer-missing');
  const bound = layer.spatialSources.filter((source) => source.kind === 'gmi' && source.fingerprint === document.fingerprint
    && source.loadedBinding?.layerId === handle.layerId && source.loadedBinding?.inputId === handle.inputId);
  if (bound.length > 1) return fail('context', 'photo-source-ambiguous');
  const source = bound[0];
  if (!source || source.loadedBinding.live !== true) return fail('context', 'photo-source-not-live-bound');
  const photos = photoSession.getLayerPhotos(photoLayerId);
  const delivery = photoSession.getLayerDelivery(photoLayerId);
  const deliverySnapshot = photoSession.getPhotoDeliverySnapshot(photoLayerId);
  if (!delivery || !deliverySnapshot) return fail('context', 'photo-layer-missing');
  const photoBasisKey = JSON.stringify([
    deliverySnapshot.stateKey, layer.photoIds,
    layer.spatialSources.map((item) => [item.id, item.kind, item.fingerprint, item.loadedBinding?.live ?? null]),
    Object.values(source.associationLedger?.associationsById || {}).map((edge) => [edge.id, edge.referenceIds]),
    photos.map((photo) => [photo.id, photo.assetId, photo.occurrence?.key ?? null, photo.occurrence?.sourceId ?? null,
      photo.spatial?.current ? [photo.spatial.current.position, photo.spatial.current.basis, photo.spatial.current.acceptance] : null]),
  ]);
  return Object.freeze({ ok: true, session, document, layer, source, photos, delivery,
    basis: Object.freeze({ documentFingerprint: document.fingerprint, photoSourceId: source.id, photoSourceFingerprint: source.fingerprint,
      sessionStateKey: session.stateKey, photoBasisKey }) });
}

/**
 * The identities a preview/review captures and a later commit must still see
 * (`expected`): document, FOTO source, session history state and FOTO basis.
 */
export function photoHyperlinkTransferBasis(owners) {
  const context = transferContext(owners);
  return context.ok ? Object.freeze({ ok: true, basis: context.basis }) : context;
}

/**
 * Batch 1B.2B adapter: one resolved «Flytt til punktobjekt» review decision
 * (photoLinkReviewDecisions) -> planner input. The recipient is the one the
 * user chose; nothing is selected automatically.
 */
export function photoHyperlinkTransferDecision(decision, source) {
  if (decision?.outcome !== 'move' || !decision.target || !decision.group?.assetId) return null;
  return Object.freeze({
    decisionKey: decision.key, sourceFingerprint: source.fingerprint, sourceId: source.id, sourceObjectKey: decision.row.objectKey,
    assetId: decision.group.assetId, referenceIds: Object.freeze([...decision.referenceIds]),
    recipient: Object.freeze({ objectKey: decision.target.objectKey, scope: decision.target.geometryScope, sourceIndex: decision.target.sourceIndex,
      parserId: decision.target.parserId, guid: decision.target.guid }),
  });
}

// ------------------------------------------------------------- FOTO facts

const assetsOf = (photos) => [...new Map(photos.map((photo) => [photo.assetId, { id: photo.assetId, assetId: photo.assetId,
  originalFilename: photo.originalFilename, sourceRelativePath: photo.sourceRelativePath ?? null }])).values()];


/** Planner FOTO facts from the single existing owners: FOTO occurrences, accepted positions and the delivery state. */
function photoStateFor(context, decisions) {
  const byAssetId = {};
  for (const decision of decisions) {
    const object = context.source.objectsByKey[decision.sourceObjectKey];
    const placement = object ? gmiPointPosition(context.source, object) : null;
    const sourcePosition = placement?.status === 'viable' ? placement.position : null;
    const occurrences = context.photos.filter((photo) => photo.assetId === decision.assetId);
    const previous = byAssetId[decision.assetId];
    byAssetId[decision.assetId] = {
      deliveryStatuses: occurrences.map((photo) => context.delivery.byPhotoId[photo.id]?.status ?? 'missing'),
      // The same rule the read-only review applies (Batch 1B.2B): only the source object's own GMI position may be replaced.
      acceptedAlternativePosition: Boolean(previous?.acceptedAlternativePosition) || Boolean(photoTransferPositionConflict(occurrences,
        { sourceObjectKey: decision.sourceObjectKey, sourceFingerprint: context.source.fingerprint, sourcePosition })),
      occurrenceObjectKeys: occurrences.filter((photo) => photo.occurrence?.sourceId === context.source.id).map((photo) => photo.occurrence.objectKey),
    };
  }
  return { byAssetId };
}

/** The proposed GMI's FOTO evidence: the factory and reviewer FOTO uses, on the proposed bytes, with the source's id scheme. */
function deriveSource(context, document) {
  const parsed = createGmiPhotoSource(document.parser, document.fingerprint ?? null);
  const id = context.source.id;
  const withIds = Object.freeze({ ...parsed, id, references: Object.freeze(parsed.references.map((reference) => Object.freeze({ ...reference, id: `${id}:${reference.id}` }))) });
  return Object.freeze({ ...withIds, associationLedger: reviewGmiPhotoSource(withIds, assetsOf(context.photos)) });
}

const edgePairs = (source) => new Map(Object.values(source.associationLedger.associationsById)
  .map((edge) => [JSON.stringify([edge.objectKey, edge.photoId]), sortedList(edge.referenceIds)]));

/**
 * FOTO record of a plan: per transfer the moved occurrence, its original
 * position evidence, the recipient position and the transfer provenance.
 * Earlier transfers keep the record they were committed with.
 */
function preparePhotoRecord(context, plan, evidence, previous, approvedAt) {
  const blockers = [];
  const previousByKey = new Map((previous?.photo.transfers || []).map((entry) => [entry.transferKey, entry]));
  const transfers = plan.transfers.map((transfer) => {
    const block = (code, detail = {}) => { blockers.push({ code, transferKey: transfer.transferKey, ...detail }); return null; };
    const matches = context.photos.filter((photo) => photo.assetId === transfer.assetId && photo.occurrence?.sourceId === context.source.id
      && photo.occurrence.objectKey === transfer.fromObjectKey);
    // The FOTO model has one occurrence per (source object, asset); anything else cannot be moved safely.
    if (!matches.length) return block('photo-occurrence-missing');
    if (matches.length > 1) return block('photo-occurrence-ambiguous');
    const [photo] = matches;
    if (photo.occurrence.key !== occurrenceKeyOf(context.source.fingerprint, transfer.fromObjectKey, transfer.assetId)) return block('photo-occurrence-identity');
    if (!sameJson(sortedList(photo.occurrence.referenceIds || []), sortedList(transfer.referenceIds))) return block('photo-occurrence-references-differ');
    const recipient = evidence.objectsByKey[transfer.toObjectKey];
    const placement = recipient ? gmiPointPosition(evidence, recipient) : null;
    if (placement?.status !== 'viable') return block('recipient-position-unavailable', { detail: placement?.errorCode ?? 'missing' });
    const original = previousByKey.get(transfer.transferKey);
    const originalPosition = plain(photo.spatial?.current ?? null);
    if (original && !sameJson(original.originalPosition, originalPosition)) return block('photo-state-changed-since-transfer');
    const sourceObject = context.source.objectsByKey[transfer.fromObjectKey];
    const sourcePlacement = sourceObject ? gmiPointPosition(context.source, sourceObject) : null;
    return {
      transferKey: transfer.transferKey, decisionKey: transfer.decisionKey ?? null, assetId: transfer.assetId, photoId: photo.id,
      fromObjectKey: transfer.fromObjectKey, toObjectKey: transfer.toObjectKey,
      fromOccurrenceKey: photo.occurrence.key, toOccurrenceKey: occurrenceKeyOf(context.source.fingerprint, transfer.toObjectKey, transfer.assetId),
      referenceIds: sortedList(transfer.referenceIds), outputReferenceIds: sortedList(transfer.outputReferenceIds),
      // Original evidence, kept for review and undo: the accepted FOTO position (unchanged by the transfer) and the source GMI position.
      originalPosition, originalGmiPosition: plain(sourcePlacement?.status === 'viable' ? sourcePlacement.position : null),
      proposedPosition: plain(placement.position),
      provenance: original ? plain(original.provenance) : {
        kind: PHOTO_HYPERLINK_TRANSFER_PROVENANCE, method: 'user-approved-hyperlink-transfer', decisionKey: transfer.decisionKey ?? null,
        fromObjectKey: transfer.fromObjectKey, toObjectKey: transfer.toObjectKey, sourceId: context.source.id,
        sourceFingerprint: context.source.fingerprint, approvedAt,
      },
      delivery: { status: KEEP_LINK, changed: false },
    };
  });
  if (blockers.length) return { ok: false, blockers };
  return { ok: true, record: { layerId: context.layer.id, sourceId: context.source.id, sourceFingerprint: context.source.fingerprint,
    basisKey: context.basis.photoBasisKey, transfers: transfers.sort((a, b) => compare(a.transferKey, b.transferKey)) } };
}

/**
 * GMI and FOTO describe the same transfer: the proposed bytes' FOTO evidence
 * equals the original evidence with exactly the transferred groups moved, and
 * the FOTO record names the same groups, objects and recipient positions.
 */
function crossCheck(context, transfers, record, derived) {
  const failures = [];
  const original = edgePairs(deriveSource(context, context.document));
  const proposed = edgePairs(derived);
  const expected = new Map(original);
  for (const transfer of transfers) {
    const from = JSON.stringify([transfer.fromObjectKey, transfer.assetId]), to = JSON.stringify([transfer.toObjectKey, transfer.assetId]);
    if (!sameJson(original.get(from), sortedList(transfer.referenceIds))) failures.push({ code: 'source-group-mismatch', transferKey: transfer.transferKey });
    expected.delete(from);
    if (expected.has(to)) failures.push({ code: 'recipient-already-linked', transferKey: transfer.transferKey });
    expected.set(to, sortedList(transfer.outputReferenceIds));
  }
  const keys = sortedList(new Set([...expected.keys(), ...proposed.keys()]));
  for (const key of keys) {
    const want = expected.get(key), have = proposed.get(key);
    if (!want || !have) { failures.push({ code: 'association-set-mismatch', detail: key }); continue; }
    // Retained references in renumbered source cells change id (M7 renumbering); only the moved groups are exact.
    if (want.length !== have.length) failures.push({ code: 'association-reference-count-mismatch', detail: key });
  }
  for (const transfer of transfers) {
    const want = sortedList(transfer.outputReferenceIds), have = proposed.get(JSON.stringify([transfer.toObjectKey, transfer.assetId]));
    if (!sameJson(want, have)) failures.push({ code: 'moved-references-mismatch', transferKey: transfer.transferKey });
  }
  const byKey = new Map(record.transfers.map((entry) => [entry.transferKey, entry]));
  if (byKey.size !== transfers.length) failures.push({ code: 'photo-record-count-mismatch' });
  for (const transfer of transfers) {
    const entry = byKey.get(transfer.transferKey);
    if (!entry || entry.assetId !== transfer.assetId || entry.fromObjectKey !== transfer.fromObjectKey || entry.toObjectKey !== transfer.toObjectKey
      || !sameJson(entry.outputReferenceIds, sortedList(transfer.outputReferenceIds))) { failures.push({ code: 'photo-record-mismatch', transferKey: transfer.transferKey }); continue; }
    const recipient = derived.objectsByKey[transfer.toObjectKey];
    const placement = recipient && gmiPointPosition(derived, recipient);
    if (placement?.status !== 'viable' || !sameJson(plain(placement.position), entry.proposedPosition)) failures.push({ code: 'photo-position-mismatch', transferKey: transfer.transferKey });
    if (entry.delivery.status !== KEEP_LINK || entry.delivery.changed !== false) failures.push({ code: 'photo-delivery-changed', transferKey: transfer.transferKey });
  }
  return failures;
}

/** FOTO state that has moved away from a committed transfer record since it was committed. */
function photoConflicts(context, record) {
  const conflicts = [];
  for (const entry of record.transfers) {
    const photo = context.photos.find((item) => item.id === entry.photoId);
    if (!photo || photo.assetId !== entry.assetId || photo.occurrence?.key !== entry.fromOccurrenceKey) { conflicts.push({ code: 'photo-occurrence-changed', transferKey: entry.transferKey }); continue; }
    if (!sameJson(plain(photo.spatial?.current ?? null), entry.originalPosition)) conflicts.push({ code: 'photo-position-changed', transferKey: entry.transferKey });
    const statuses = context.photos.filter((item) => item.assetId === entry.assetId).map((item) => context.delivery.byPhotoId[item.id]?.status);
    if (statuses.some((status) => status !== KEEP_LINK)) conflicts.push({ code: 'photo-delivery-changed', transferKey: entry.transferKey });
    if (context.photos.some((item) => item.assetId === entry.assetId && item.occurrence?.objectKey === entry.toObjectKey)) conflicts.push({ code: 'recipient-has-photo-placement', transferKey: entry.transferKey });
  }
  return conflicts;
}

// -------------------------------------------------------------- transaction

/**
 * Commit explicit transfer decisions as one coupled history entry.
 *
 * @param {object} options
 * @param {object} options.registry the Rettinger session registry (createGmiEditSessions)
 * @param {object} options.handle the GMI layer's session handle
 * @param {object} options.photoSession the FOTO session
 * @param {string} options.photoLayerId the FOTO layer whose live GMI source is the handle's file
 * @param {Array<object>} options.transfers NEW explicit decisions (planner input shape; see photoHyperlinkTransferDecision)
 * @param {object} options.expected the basis captured at review (photoHyperlinkTransferBasis); required
 * @param {string} [options.label] history label (Norwegian, user-facing later)
 * @param {() => Date} [options.now]
 * @param {(stage: string) => void} [options.fault] test seam: a throw at any stage must leave everything unchanged
 * @returns {{ok: true, transferSetId, newTransferKeys, transfers, revision} | {ok: false, stage, code, blockers?, rejections?}}
 */
export function commitPhotoHyperlinkTransfer({ registry, handle, photoSession, photoLayerId, transfers, expected, label = null, now = () => new Date(), fault = null } = {}) {
  let stage = 'context';
  const step = (name) => { stage = name; fault?.(name); };
  try {
    step('context');
    const owners = { registry, handle, photoSession, photoLayerId };
    const context = transferContext(owners);
    if (!context.ok) return context;
    if (!expected || typeof expected !== 'object') return fail('basis', 'expected-basis-required');
    const stale = Object.keys(context.basis).filter((key) => expected[key] !== context.basis[key]);
    if (stale.length) return fail('basis', 'stale-basis', { detail: Object.freeze(stale) });
    if (!Array.isArray(transfers) || !transfers.length) return fail('basis', 'no-transfers');
    for (const transfer of transfers) {
      if (transfer?.sourceId !== context.source.id || transfer.sourceFingerprint !== context.source.fingerprint) return fail('basis', 'foreign-transfer-source');
    }

    step('plan');
    const previous = activeGmiHyperlinkTransferSet(context.session);
    const decisions = [...(previous ? previous.decisions : []), ...transfers];
    const planned = planGmiHyperlinkTransferCommit(context.session, { photoSource: context.source, transfers, photoState: photoStateFor(context, decisions),
      expectedBasis: { documentFingerprint: expected.documentFingerprint, photoSourceFingerprint: expected.photoSourceFingerprint, sessionStateKey: expected.sessionStateKey } });
    if (!planned.ok) return fail(planned.stage, planned.stage === 'plan' ? 'transfer-blocked' : planned.rejections[0]?.code ?? 'transfer-refused',
      { blockers: planned.rejections });

    step('photo');
    // Recipient positions come from the recipient's authoritative GMI geometry. A transfer never changes geometry
    // (the verifier proves it); the cross-check below compares them with the proposed bytes' own evidence.
    const createdAt = now().toISOString();
    const record = preparePhotoRecord(context, planned.plan, context.source, previous, createdAt);
    if (!record.ok) return fail('photo', 'photo-transfer-blocked', { blockers: Object.freeze(record.blockers.map((entry) => Object.freeze(entry))) });

    step('compose');
    const built = buildGmiHyperlinkTransferCommit(context.session, planned, { photo: record.record, createdAt,
      label: typeof label === 'string' && label.trim() ? label : `Flytt ${planned.plan.transfers.length === 1 ? 'bildelenke' : `${planned.plan.transfers.length} bildelenker`} til punktobjekt` });
    if (!built.ok) return fail(built.stage, built.rejections[0]?.code ?? 'compose-failed', { rejections: built.rejections });

    step('verify');
    const derived = deriveSource(context, built.proposed.document);
    const failures = crossCheck(context, built.transferSet.transfers, built.transferSet.photo, derived);
    if (failures.length) return fail('verify', 'transfer-photo-mismatch', { rejections: deepFreeze(failures) });

    step('recheck');
    const again = transferContext(owners);
    if (!again.ok) return again;
    if (again.session !== context.session || Object.keys(context.basis).some((key) => again.basis[key] !== context.basis[key])) return fail('recheck', 'stale-basis');

    step('commit');
    const committed = registry.commitHyperlinkTransfer(handle, { session: context.session, transferSet: built.transferSet });
    if (!committed.ok) return fail('commit', committed.code);
    const revision = registry.revision(handle);
    return Object.freeze({ ok: true, transferSetId: built.transferSet.id, newTransferKeys: planned.newTransferKeys,
      transfers: built.transferSet.photo.transfers, revision: revision.ok ? revision : null });
  } catch {
    // Every write happens in the registry commit, which restores itself; before it nothing live was written.
    return fail(stage, 'transaction-failed');
  }
}

// --------------------------------------------------------------------- view

/**
 * FOTO view of the active transfer for the proposed state: which occurrence
 * belongs to which recipient, its proposed position and provenance, the
 * original position evidence, and the proposed GMI's re-derived FOTO
 * evidence. `status`:
 * - 'none': no active transfer (original FOTO associations apply);
 * - 'current': the transfer is verified and FOTO still matches its record;
 * - 'conflict': FOTO state changed since the commit (consumers must fail closed);
 * - 'invalid': the proposed state or its FOTO evidence does not verify;
 * - 'unavailable': the owners cannot be resolved (`code`).
 * A 'current' view also carries `planning` (Batch 1B.3A): the live FOTO GMI source, the planner's FOTO facts for
 * the active decisions and the layer's assets, for the export composition and revision checks.
 * Read-only; never writes FOTO or GMI state.
 */
export function photoHyperlinkTransferView(owners) {
  const context = transferContext(owners);
  if (!context.ok) return Object.freeze({ status: 'unavailable', code: context.code });
  const revisionResult = owners.registry.revision(owners.handle);
  const revision = revisionResult.ok ? revisionResult : null;
  const set = activeGmiHyperlinkTransferSet(context.session);
  if (!set) return Object.freeze({ status: 'none', revision, occurrences: Object.freeze([]), conflicts: Object.freeze([]) });
  if (set.photo.layerId !== context.layer.id || set.photo.sourceId !== context.source.id) {
    return Object.freeze({ status: 'unavailable', code: 'transfer-owned-by-other-photo-layer', revision, transferSetId: set.id });
  }
  const proposed = owners.registry.proposed(owners.handle);
  if (!proposed.ok) return Object.freeze({ status: 'invalid', code: proposed.stage ?? 'verification-failed', revision, transferSetId: set.id });
  const derived = deriveSource(context, proposed.document);
  const failures = crossCheck(context, set.transfers, set.photo, derived);
  if (failures.length) return Object.freeze({ status: 'invalid', code: 'transfer-photo-mismatch', revision, transferSetId: set.id, conflicts: deepFreeze(failures) });
  const conflicts = photoConflicts(context, set.photo);
  // The live source is passed by reference (it is the session's own value and is never written here).
  const planning = conflicts.length ? null : Object.freeze({ photoSource: context.source, photoState: deepFreeze(photoStateFor(context, set.decisions)),
    assets: deepFreeze(assetsOf(context.photos)), photoLayerId: context.layer.id });
  return Object.freeze({
    status: conflicts.length ? 'conflict' : 'current', revision, transferSetId: set.id, planKey: set.planKey, proposedSource: derived, planning,
    occurrences: deepFreeze(set.photo.transfers.map((entry) => ({ ...plain(entry), occurrenceKey: entry.toOccurrenceKey, objectKey: entry.toObjectKey }))),
    conflicts: deepFreeze(conflicts),
  });
}
