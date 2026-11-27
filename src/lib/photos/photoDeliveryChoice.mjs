// Direct GMI/GML delivery choices for one FOTO occurrence ("Fordel bilder til GMI/GML").
//
// Presentation and dispatch only. The canonical per-occurrence decisions stay in the photo session (M8): every write goes
// through `setDeliveryIntent` (GMI-linked occurrences) or `setCombinedDeliveryInclusion` (occurrences without a GMI link),
// for exactly one photo id, so a shared photograph's other placements are never touched. Nothing here changes a GMI
// file, a hyperlink or a photograph; the choices are used when a delivery is exported.
import { PHOTO_DELIVERY_REASON_TEXT, PHOTO_DELIVERY_STATUS_LABELS, summarizePhotoDelivery } from './photoDeliveryIntent.mjs';
import { PHOTO_DELIVERY_COLOURS, photoDeliveryColourState } from './photoMarkerPresentation.mjs';
import { PHOTO_POSITION_TOLERANCE_METRES, photoPositionDistance } from './photoPositioning.mjs';
import { isPhotoPosition } from './photoSpatial.mjs';
import { isDefaultPhotoDirection } from './photoDirection.mjs';
import { PHOTO_HYPERLINK_TRANSFER_LOCK_TEXT } from './photoHyperlinkTransferLock.mjs';

const option = (key, apply, { active = false, disabled = false, reason = null } = {}) =>
  Object.freeze({ key, label: PHOTO_DELIVERY_COLOURS[key].short, apply, active, disabled, reason });

const LINE_LINK = PHOTO_DELIVERY_REASON_TEXT['linked-without-occurrence'];

/** Pure, reviewable command. Only the session may apply its writes. IDs are occurrence IDs;
 * photo scope expands them through the layer's asset identities, independently of filters. */
export function planPhotoExclusion(delivery, layer, photoIds, { scope = 'photo', include = false, visibleIds = photoIds } = {}) {
  const blocked = [], writes = [], affected = [];
  const fail = (photoId, reason) => blocked.push({ photoId, reason, text: PHOTO_DELIVERY_REASON_TEXT[reason]
    || ({ 'stale-occurrence': 'Plasseringen finnes ikke lenger i fotolaget.',
      'invalid-selection': 'Velg minst én gyldig plassering.',
      'links-without-occurrence': 'Bildet har GMI-lenker uten FOTO-plassering, for eksempel en ledning eller en fjernet plassering. Lenken og filen beholdes.' })[reason]
    || 'Leveringsvalget må gjennomgås før bildet kan endres.' });
  if (!layer || !delivery || !['photo', 'occurrences'].includes(scope) || typeof include !== 'boolean'
    || !Array.isArray(photoIds) || !photoIds.length || new Set(photoIds).size !== photoIds.length) fail(null, 'invalid-selection');
  const selected = new Set(Array.isArray(photoIds) ? photoIds : []), visible = new Set(visibleIds || []);
  const assets = new Set();
  for (const id of selected) {
    const entry = delivery?.byPhotoId[id];
    if (!layer?.photoIds.includes(id) || !entry) fail(id, 'stale-occurrence');
    else assets.add(entry.assetId);
  }
  if (!blocked.length) {
    if (scope === 'photo' && !include) for (const link of delivery.linksWithoutOccurrence || []) {
      if (assets.has(link.assetId)) blocked.push({ assetId: link.assetId, objectLabel: link.objectLabel,
        reason: 'links-without-occurrence', text: 'Bildet har en GMI-lenke uten FOTO-plassering. Lenken og filen beholdes.' });
    }
    for (const id of layer.photoIds) {
      const entry = delivery.byPhotoId[id];
      if (!(scope === 'photo' ? assets.has(entry?.assetId) : selected.has(id))) continue;
      affected.push({ photoId: id, assetId: entry.assetId, objectLabel: entry.association.objectLabel });
      if (entry.status === 'review') { fail(id, entry.reason); continue; }
      if (entry.linked && !entry.canTransfer) { fail(id, entry.association.state); continue; }
      if (!entry.linked && !entry.canInclude) { fail(id, 'linked-without-occurrence'); continue; }
      if (entry.linked) {
        if ((!include && entry.status !== 'exclude') || (include && entry.status === 'exclude')) writes.push({ photoId: id,
          decision: include ? null : { kind: 'gmi', occurrenceKey: entry.association.occurrenceKey, intent: 'exclude' } });
      } else if (entry.status !== (include ? 'include' : 'not-selected')) {
        writes.push({ photoId: id, decision: include ? { kind: 'unlinked', include: true } : null });
      }
    }
  }
  const additional = affected.filter((item) => writes.some((write) => write.photoId === item.photoId)
    && (!selected.has(item.photoId) || !visible.has(item.photoId)));
  return { ok: !blocked.length, scope, include, stateKey: delivery?.stateKey, blocked, writes: blocked.length ? [] : writes,
    affected, additional, needsConfirmation: !blocked.length && additional.length > 0, assetCount: assets.size,
    occurrenceCount: affected.length, changedCount: blocked.length ? 0 : writes.length };
}

/**
 * The valid destinations of one occurrence, in display order. A GMI-linked occurrence offers GMI, GML and exclusion; one without
 * a GMI reference offers «Ikke med» and GML and never an invalid GMI destination. A photo linked from a GMI object without
 * its own FOTO placement (a line) stays in GMI.
 */
export function photoDeliveryOptions(entry) {
  if (!entry) return [];
  // Batch 1B.2B: a photograph moved by an active Rettinger transfer keeps its delivery state (the session refuses changes).
  if (entry.transferLocked) return photoDeliveryOptions({ ...entry, transferLocked: false }).map((item) => Object.freeze({ ...item,
    disabled: true, reason: item.active ? null : PHOTO_HYPERLINK_TRANSFER_LOCK_TEXT }));
  if (entry.linked) {
    return [option('gmi', { kind: 'intent', intent: 'keep-link' }, { active: entry.status === 'keep-link' }),
      option('gml', { kind: 'intent', intent: 'transfer' }, { active: entry.status === 'transfer', disabled: !entry.canTransfer,
        reason: entry.canTransfer ? null : `Kan ikke overføres nå: ${PHOTO_DELIVERY_REASON_TEXT[entry.association.state] || 'GMI-koblingen er ikke sikker.'}` }),
      option('excluded', { kind: 'intent', intent: 'exclude' }, { active: entry.status === 'exclude', disabled: !entry.canTransfer,
        reason: entry.canTransfer ? null : `Kan ikke tas ut nå: ${PHOTO_DELIVERY_REASON_TEXT[entry.association.state] || 'GMI-koblingen er ikke sikker.'}` })];
  }
  if (entry.linkedWithoutOccurrence) {
    // Only an inclusion made before the GMI link appeared can be cleared here; otherwise the link simply stays in GMI.
    const review = entry.status === 'review';
    return [option('gmi', review ? { kind: 'inclusion', include: false } : null, { active: !review, disabled: !review, reason: review ? null : LINE_LINK })];
  }
  return [option('excluded', { kind: 'inclusion', include: false }, { active: entry.status === 'not-selected' }),
    option('gml', { kind: 'inclusion', include: true }, { active: entry.status === 'include', disabled: !entry.canInclude })];
}

/**
 * One explicit occurrence step: GMI → GML → Ikke → GMI. Review states require an inspector choice;
 * direct clicks never clear stale evidence or skip an unavailable destination.
 */
export function photoDeliveryToggleTarget(entry) {
  if (entry?.transferLocked) return null;
  const available = photoDeliveryOptions(entry).filter((item) => !item.disabled && item.apply);
  if (entry?.status === 'review') return null;
  if (entry?.linked) {
    if (!entry.canTransfer) return null;
    const next = { 'keep-link': 'gml', transfer: 'excluded', exclude: 'gmi' }[entry.status];
    return available.find((item) => item.key === next) || null;
  }
  return available.find((item) => !item.active) || null;
}

/** Why a click cannot change this occurrence, or null. */
export function photoDeliveryUnavailableReason(entry) {
  if (!entry || photoDeliveryToggleTarget(entry)) return null;
  if (entry.transferLocked) return PHOTO_HYPERLINK_TRANSFER_LOCK_TEXT;
  if (entry.status === 'review') return `${PHOTO_DELIVERY_REASON_TEXT[entry.reason] || 'Leveringsvalget krever gjennomgang.'} Avklar leveringsvalget i kontrollpanelet.`;
  return photoDeliveryOptions(entry).find((item) => item.reason)?.reason || 'Leveringsvalget kan ikke endres for denne plasseringen.';
}

/** Destination key for presentation (gmi, gml, excluded, review). */
export const photoDeliveryDestination = (entry) => photoDeliveryColourState(entry?.status);

/** Short status text for one occurrence: «GMI», «GML», «Ikke», «Gjennomgå». */
export const photoDeliveryShortLabel = (entry) => entry ? PHOTO_DELIVERY_COLOURS[photoDeliveryDestination(entry)].short : null;

/** Full planned-state text for accessible names and announcements. */
export const photoDeliveryStatusText = (entry) => entry ? PHOTO_DELIVERY_STATUS_LABELS[entry.status] || PHOTO_DELIVERY_COLOURS.review.label : null;

/** Writes exactly one occurrence's choice through the canonical M8 session actions. */
export function applyPhotoDeliveryChoice(session, layerId, photoId, choice) {
  if (!choice?.apply || choice.disabled) return { ok: false, error: 'unavailable', changedIds: [] };
  return choice.apply.kind === 'intent' ? session.setDeliveryIntent(layerId, [photoId], choice.apply.intent)
    : session.setCombinedDeliveryInclusion(layerId, [photoId], choice.apply.include);
}

/**
 * One click in delivery planning: reads the current entry from the session (never a stale rendered copy), then applies
 * the next destination. Returns the session result plus the entry after the change.
 */
export function togglePhotoDelivery(session, layerId, photoId) {
  const before = session.getLayerDelivery(layerId)?.byPhotoId[photoId] || null;
  if (!before) return { ok: false, error: 'stale-occurrence', changedIds: [], entry: null };
  const target = photoDeliveryToggleTarget(before);
  if (!target) return { ok: false, error: 'not-changeable', reason: photoDeliveryUnavailableReason(before), changedIds: [], entry: before };
  const result = applyPhotoDeliveryChoice(session, layerId, photoId, target);
  return { ...result, entry: session.getLayerDelivery(layerId)?.byPhotoId[photoId] || null };
}

/** Compact summary for an overlapping group, e.g. «2 plasseringer · 1 GMI · 1 GML». Presentation only, never an action. */
export function photoStackDeliverySummary(members, entries) {
  const counts = new Map();
  for (const member of members) {
    const entry = entries?.[member.id];
    const key = entry?.status === 'not-selected' ? 'notSelected' : photoDeliveryDestination(entry);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [`${members.length} ${members.length === 1 ? 'plassering' : 'plasseringer'}`,
    ...['gmi', 'gml', 'excluded', 'notSelected', 'review'].filter((key) => counts.get(key)).map((key) => `${counts.get(key)} ${key === 'notSelected' ? 'Ikke valgt' : PHOTO_DELIVERY_COLOURS[key].short}`)].join(' · ');
}

// Automatic delivery defaults. They only ever replace an untouched default state: an occurrence with a stored decision
// (GML, Ikke, an inclusion) or one whose current state the user chose explicitly (`userChosen`) is never changed.

/** An unlinked occurrence in its default «Ikke valgt» state that adopts a GML or EXIF position becomes a GML inclusion. */
export const photoPositionDefaultsToGml = (entry) => Boolean(entry) && !entry.linked && entry.status === 'not-selected'
  && !entry.explicit && !entry.userChosen && entry.canInclude;

/** The GMI object position this occurrence was placed from (its provenance), or null. */
export function photoOriginGmiPosition(photo) {
  const occurrence = photo?.occurrence;
  if (!occurrence?.key) return null;
  const candidate = photo.spatial?.candidates?.find((item) => item.kind === 'gmi' && item.provenance?.key === occurrence.key
    && item.sourceId === occurrence.sourceId);
  return isPhotoPosition(candidate?.position) ? candidate.position : null;
}

// A GMI-linked occurrence in its untouched GMI default that can still be transferred to GML.
const isUntouchedGmiDefault = (entry) => Boolean(entry?.linked) && entry.status === 'keep-link' && !entry.explicit && !entry.userChosen
  && Boolean(entry.canTransfer);

/** A direction the user set. A GMI hyperlink cannot carry a direction, so only GML delivers it. */
export const photoHasManualDirection = (photo) => photo?.direction?.current?.basis?.kind === 'manual';

/**
 * Whether accepting `degrees` as the user's direction changes the photo's direction, and so counts as a rotation for
 * delivery. A missing direction or the default placeholder counts as no direction: any value replacing it is a change
 * (also 0°, which then means north). The same value as a real saved direction is not. Shared by the session's
 * Edit-mode save and its «Fyll inn manglende» write, so the two cannot develop separate rules.
 */
export function photoDirectionChangeIsMeaningful(current, degrees) {
  if (!Number.isFinite(degrees)) return false;
  if (!current || isDefaultPhotoDirection(current)) return true;
  return degrees !== current.degrees;
}

/**
 * Batch 2C: whether accepting a changed direction (rotation) for this occurrence proposes GMI → GML, with the same
 * «untouched GMI default only» rule as a move. An explicit choice, a stored decision or an unlinked photo is unchanged.
 */
export const photoRotationProposesTransfer = (entry) => isUntouchedGmiDefault(entry);

/**
 * Whether moving a default GMI occurrence to `position` proposes GMI → GML: only when the new position is further from
 * the originating GMI point than the shared positioning tolerance. Returning to the GMI point proposes nothing.
 */
export function photoMoveProposesTransfer(photo, entry, position) {
  if (!isUntouchedGmiDefault(entry)) return false;
  const origin = photoOriginGmiPosition(photo);
  const distance = origin && isPhotoPosition(position) ? photoPositionDistance(origin, position) : null;
  return distance !== null && distance > PHOTO_POSITION_TOLERANCE_METRES;
}

/**
 * B1.1: the automatic delivery consequence of accepting `position` for one occurrence, under the same tolerance and the
 * same «never replace a stored or explicit choice» rule as the defaults above. Every occurrence is judged against its
 * own originating GMI point, so repeated photographs are decided per placement. Only the distance counts: a new
 * coordinate source at a compatible position changes nothing.
 * - 'transfer': an untouched GMI default moves away from its GMI object and becomes GML (automatic).
 * - 'restore': an automatic GML transfer comes back to its GMI object and returns to the GMI default.
 * - 'include': an untouched unlinked «Ikke valgt» occurrence adopts a GML or EXIF position (`includeUnlinked`).
 * - 'kept-explicit': the user chose GMI explicitly; the choice is kept, but the photo is moved away (review).
 * - 'kept-unavailable': moved away, but the GMI link cannot be transferred now (review).
 * - null: nothing to change.
 *
 * Batch 2C: `rotated` means the same commit accepts a changed direction. A rotation of an untouched GMI default is a
 * 'transfer' like a move (the direction can only be delivered in GML), with or without a position; `position` may then
 * be null. A return to the GMI point never restores GMI for a photo whose direction the user set (now or before),
 * because the GMI delivery would drop that direction.
 */
export function photoPositionDeliveryEffect(photo, entry, position, { includeUnlinked = false, rotated = false } = {}) {
  if (!entry) return null;
  const rotation = rotated && photoRotationProposesTransfer(entry) ? 'transfer' : null;
  if (!isPhotoPosition(position)) return rotation;
  if (!entry.linked) return includeUnlinked && photoPositionDefaultsToGml(entry) ? 'include' : null;
  const origin = photoOriginGmiPosition(photo);
  const distance = origin ? photoPositionDistance(origin, position) : null;
  if (distance === null) return rotation;
  const away = distance > PHOTO_POSITION_TOLERANCE_METRES;
  if (!away) {
    if (rotation) return rotation;
    return entry.status === 'transfer' && entry.automatic && !entry.userChosen && !rotated && !photoHasManualDirection(photo) ? 'restore' : null;
  }
  if (photoMoveProposesTransfer(photo, entry, position)) return 'transfer';
  if (entry.status !== 'keep-link') return null;
  return entry.userChosen || entry.explicit ? 'kept-explicit' : !entry.canTransfer ? 'kept-unavailable' : null;
}

/** Presentation overlay for unsaved move proposals: the proposed entries read as GML (or GMI again, `restoredIds`), marked `proposed`. */
export function photoDeliveryWithProposals(delivery, proposedIds, restoredIds = null) {
  if (!delivery || (!proposedIds?.size && !restoredIds?.size)) return delivery;
  const byPhotoId = { ...delivery.byPhotoId };
  for (const id of proposedIds || []) if (byPhotoId[id]) byPhotoId[id] = Object.freeze({ ...byPhotoId[id], status: 'transfer', intent: 'transfer', proposed: true });
  for (const id of restoredIds || []) if (byPhotoId[id]) byPhotoId[id] = Object.freeze({ ...byPhotoId[id], status: 'keep-link', intent: 'keep-link', proposed: true });
  return Object.freeze({ ...delivery, byPhotoId: Object.freeze(byPhotoId), summary: summarizePhotoDelivery(Object.values(byPhotoId)) });
}

/** Destination counts for the planning bar, by occurrence. */
export function photoDeliveryDestinationCounts(delivery) {
  const counts = { gmi: 0, gml: 0, excluded: 0, notSelected: 0, review: 0 };
  for (const entry of Object.values(delivery?.byPhotoId || {})) counts[entry.status === 'not-selected' ? 'notSelected' : photoDeliveryDestination(entry)]++;
  return counts;
}
