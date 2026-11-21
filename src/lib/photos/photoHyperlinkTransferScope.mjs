// Batch 1B.2B: what an active «Flytt til punktobjekt» transfer means for FOTO.
//
// Ownership stays as Batch 1B.2A recorded it: the Rettinger (M2) history entry
// is the only owner of a transfer; FOTO accepted records are never rewritten.
// This module only reads:
// - `photoHyperlinkTransferScope`: which FOTO layer, GMI source and photographs
//   an active transfer protects (the guard input for photoSession);
// - `photoHyperlinkTransferPresentation` / `applyPhotoHyperlinkTransfer`: the
//   verified proposed view (photoHyperlinkTransferView) as a presentation
//   overlay on FOTO photos, so the list, map and inspector show the recipient
//   as the proposed owner at the recipient's GMI position, with the original
//   association kept for comparison. The overlay is a new object per photo; the
//   session's records are untouched and nothing here is ever written back.
import { gmiObjectContext } from './photoImportOutcome.mjs';
import { photoHyperlinkTransferView } from './photoHyperlinkTransfer.mjs';

export { PHOTO_HYPERLINK_TRANSFER_ACTIVE, PHOTO_HYPERLINK_TRANSFER_LAYER_LOCK_TEXT, PHOTO_HYPERLINK_TRANSFER_LOCK_TEXT,
  PHOTO_HYPERLINK_TRANSFER_SOURCE_LOCK_TEXT } from './photoHyperlinkTransferLock.mjs';

const EMPTY_SCOPE = Object.freeze({ active: false, entries: Object.freeze([]), transferSetIds: Object.freeze([]),
  sourceIds: Object.freeze([]), sourceFingerprints: Object.freeze([]), assetIds: Object.freeze([]), photoIds: Object.freeze([]) });

/**
 * The active transfers whose FOTO record belongs to `photoLayerId`, from the Rettinger registry
 * (registry.activeHyperlinkTransfers, side-effect free). `assetIds`: every photograph a transfer moved; all of
 * its occurrences are protected, because the transaction's eligibility was checked on all of them.
 */
export function photoHyperlinkTransferScope(registry, photoLayerId) {
  if (!registry || typeof registry.activeHyperlinkTransfers !== 'function' || !photoLayerId) return EMPTY_SCOPE;
  const entries = registry.activeHyperlinkTransfers().filter((entry) => entry.transferSet.photo?.layerId === photoLayerId);
  if (!entries.length) return EMPTY_SCOPE;
  const unique = (values) => Object.freeze([...new Set(values.filter(Boolean))]);
  const transfers = entries.flatMap((entry) => entry.transferSet.photo.transfers);
  return Object.freeze({
    active: true, entries: Object.freeze(entries),
    transferSetIds: unique(entries.map((entry) => entry.transferSet.id)),
    sourceIds: unique(entries.map((entry) => entry.transferSet.photo.sourceId)),
    sourceFingerprints: unique(entries.map((entry) => entry.transferSet.photo.sourceFingerprint)),
    assetIds: unique(transfers.map((entry) => entry.assetId)),
    photoIds: unique(transfers.map((entry) => entry.photoId)),
  });
}

/**
 * Bind the FOTO session's owner-level guard to the Rettinger registry: every guarded FOTO write asks this
 * provider for the layer's scope at the moment it runs, so programmatic callers are refused like the UI.
 */
export function bindPhotoHyperlinkTransferGuard(photoSession, registry) {
  photoSession.setHyperlinkTransferGuard((layerId) => {
    const scope = photoHyperlinkTransferScope(registry, layerId);
    return scope.active ? scope : null;
  });
}

/** «SLU · Kum · AnleggsID R-2 · Punkt 108»: the FOTO object context plus the point number. */
export function photoTransferObjectLabel(object) {
  if (!object) return 'Ukjent objekt';
  const context = gmiObjectContext(object);
  const point = `${object.geometryScope === 'line' ? 'Ledning' : 'Punkt'} ${object.parserId}`;
  return context && !context.includes(point) ? `${context} · ${point}` : context || point;
}

/**
 * The verified proposed FOTO view of every active transfer on `photoLayerId`, or null. One entry per transfer set
 * (several GMI layers could in principle hold one each); a set that is not 'current' is reported, never shown.
 */
const viewCache = new WeakMap();   // photoSession -> Map<photoLayerId, { key, value }>
export function photoHyperlinkTransferViews({ registry, photoSession, photoLayerId }) {
  const scope = photoHyperlinkTransferScope(registry, photoLayerId);
  if (!scope.active) return null;
  // The view depends only on the FOTO publication (snapshot identity) and the exact Rettinger session values; the
  // workspace and the main map ask for it on the same render, so the derivation runs once per change.
  const key = [photoSession.getSnapshot?.() ?? null, ...scope.entries.flatMap((entry) => [entry.handle, entry.session])];
  let cache = viewCache.get(photoSession);
  if (!cache) viewCache.set(photoSession, cache = new Map());
  const cached = cache.get(photoLayerId);
  if (cached && cached.key.length === key.length && cached.key.every((item, index) => item === key[index]) && key[0] !== null) return cached.value;
  const value = Object.freeze({ scope, views: Object.freeze(scope.entries.map((entry) => photoHyperlinkTransferView({ registry, handle: entry.handle, photoSession, photoLayerId }))) });
  cache.set(photoLayerId, { key, value });
  return value;
}

const STATUS_TEXT = Object.freeze({
  conflict: 'FOTO er endret etter flyttingen. Foreslått eier og posisjon vises ikke; angre eller forkast flyttingen i Rettinger.',
  invalid: 'Flyttingen kan ikke bekreftes mot Foreslått GMI. Foreslått eier og posisjon vises ikke; angre eller forkast flyttingen i Rettinger.',
  unavailable: 'Flyttingen kan ikke leses mot gjeldende FOTO-kilde. Foreslått eier og posisjon vises ikke; angre eller forkast flyttingen i Rettinger.',
});

/**
 * Per photo id: how the transfer applies to that occurrence. `status` 'proposed' when the view is current (the
 * overlay shows the recipient), otherwise the view status with a fail-closed explanation. Every protected
 * occurrence (`locked`) gets an entry, also siblings of a moved photograph that were not moved themselves.
 */
export function photoHyperlinkTransferPresentation(transfers, layer) {
  const byPhotoId = new Map();
  if (!transfers?.scope?.active || !layer) return byPhotoId;
  const assetIds = new Set(transfers.scope.assetIds);
  for (const view of transfers.views) {
    const current = view.status === 'current';
    const objects = view.proposedSource?.objectsByKey || {};
    for (const entry of view.occurrences || []) {
      byPhotoId.set(entry.photoId, Object.freeze({
        status: current ? 'proposed' : view.status, moved: true, locked: true, transferSetId: view.transferSetId, transferKey: entry.transferKey,
        text: current ? null : STATUS_TEXT[view.status] || STATUS_TEXT.unavailable,
        fromObjectKey: entry.fromObjectKey, toObjectKey: entry.toObjectKey,
        recipient: objects[entry.toObjectKey] || null, recipientLabel: photoTransferObjectLabel(objects[entry.toObjectKey]),
        proposedPosition: entry.proposedPosition, provenance: entry.provenance,
        originalPosition: entry.originalPosition, originalGmiPosition: entry.originalGmiPosition,
        outputReferenceIds: entry.outputReferenceIds, toOccurrenceKey: entry.toOccurrenceKey,
      }));
    }
    if (!['current', 'conflict'].includes(view.status)) {
      // An invalid or unreadable view has no trustworthy occurrence list; every protected photograph is marked.
      for (const photoId of transfers.scope.photoIds) if (!byPhotoId.has(photoId)) byPhotoId.set(photoId, Object.freeze({
        status: view.status, moved: true, locked: true, transferSetId: view.transferSetId ?? null, text: STATUS_TEXT[view.status] || STATUS_TEXT.unavailable }));
    }
  }
  for (const photoId of layer.photoIds) {
    if (byPhotoId.has(photoId) || !assetIds.has(layer.assetIdsByPhotoId?.[photoId])) continue;
    byPhotoId.set(photoId, Object.freeze({ status: 'sibling', moved: false, locked: true, text: null }));
  }
  return byPhotoId;
}

/**
 * Presentation overlay: a moved occurrence with a current view is shown on the recipient (occurrence object and key)
 * at the recipient's GMI position, with `hyperlinkTransfer` carrying the original for comparison. Every other photo
 * keeps its own object; protected ones carry `hyperlinkTransfer` for the lock explanation. No photo is added or
 * removed, so no marker or list row is duplicated.
 */
export function applyPhotoHyperlinkTransfer(photos, presentation) {
  if (!presentation?.size) return photos;
  return photos.map((photo) => {
    const transfer = presentation.get(photo.id);
    if (!transfer) return photo;
    if (transfer.status !== 'proposed' || !transfer.recipient) return Object.freeze({ ...photo, hyperlinkTransfer: transfer });
    const original = Object.freeze({ occurrence: photo.occurrence, current: photo.spatial?.current ?? null });
    return Object.freeze({
      ...photo,
      occurrence: Object.freeze({ ...photo.occurrence, key: transfer.toOccurrenceKey, objectKey: transfer.toObjectKey, object: transfer.recipient,
        referenceIds: transfer.outputReferenceIds }),
      spatial: Object.freeze({ ...photo.spatial, current: Object.freeze({ position: transfer.proposedPosition,
        basis: Object.freeze({ kind: 'hyperlink-transfer', transferKey: transfer.transferKey }), acceptance: 'user-approved-hyperlink-transfer',
        acceptedAt: transfer.provenance?.approvedAt ?? null, origin: 'gmi', provenance: transfer.provenance }) }),
      hyperlinkTransfer: Object.freeze({ ...transfer, original }),
    });
  });
}

/**
 * The layer as the proposed view sees it, for presentation of GMI links only (Koblinger): the transfer's FOTO source
 * carries the association ledger re-derived from the proposed GMI. Never passed to a session action.
 */
export function photoHyperlinkTransferLinkLayer(layer, transfers) {
  const current = transfers?.views?.filter((view) => view.status === 'current') || [];
  if (!layer || !current.length) return layer;
  const byId = new Map(current.map((view) => [view.proposedSource.id, view.proposedSource]));
  return Object.freeze({ ...layer, spatialSources: Object.freeze(layer.spatialSources.map((source) => byId.has(source.id)
    ? Object.freeze({ ...source, objectsByKey: byId.get(source.id).objectsByKey, references: byId.get(source.id).references,
      associationLedger: byId.get(source.id).associationLedger }) : source)) });
}
