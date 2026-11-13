// Direct GMI/GML delivery choices for one FOTO occurrence ("Fordel bilder til GMI/GML").
//
// Presentation and dispatch only. The canonical per-occurrence decisions stay in the photo session (M8): every write goes
// through `setDeliveryIntent` (GMI-linked occurrences) or `setCombinedDeliveryInclusion` (occurrences without a GMI link),
// for exactly one photo id, so a shared photograph's other placements are never touched. Nothing here changes a GMI
// file, a hyperlink or a photograph; the choices are used when a delivery is exported.
import { PHOTO_DELIVERY_REASON_TEXT, PHOTO_DELIVERY_STATUS_LABELS } from './photoDeliveryIntent.mjs';
import { PHOTO_DELIVERY_COLOURS, photoDeliveryColourState } from './photoMarkerPresentation.mjs';

const option = (key, apply, { active = false, disabled = false, reason = null } = {}) =>
  Object.freeze({ key, label: PHOTO_DELIVERY_COLOURS[key].short, apply, active, disabled, reason });

const LINE_LINK = PHOTO_DELIVERY_REASON_TEXT['linked-without-occurrence'];
const STALE_TRANSFER = 'Plasseringen var valgt for GML med en GMI-lenke som ikke finnes lenger. Velg GML for å ta den med, eller koble kilden på nytt.';

/**
 * The valid destinations of one occurrence, in display order. A GMI-linked occurrence offers GMI and GML; one without
 * a GMI reference offers «Ikke med» and GML and never an invalid GMI destination. A photo linked from a GMI object without
 * its own FOTO placement (a line) stays in GMI.
 */
export function photoDeliveryOptions(entry) {
  if (!entry) return [];
  if (entry.linked) {
    return [option('gmi', { kind: 'intent', intent: 'keep-link' }, { active: entry.status === 'keep-link' }),
      option('gml', { kind: 'intent', intent: 'transfer' }, { active: entry.status === 'transfer', disabled: !entry.canTransfer,
        reason: entry.canTransfer ? null : `Kan ikke overføres nå: ${PHOTO_DELIVERY_REASON_TEXT[entry.association.state] || 'GMI-koblingen er ikke sikker.'}` })];
  }
  if (entry.linkedWithoutOccurrence) {
    // Only an inclusion made before the GMI link appeared can be cleared here; otherwise the link simply stays in GMI.
    const review = entry.status === 'review';
    return [option('gmi', review ? { kind: 'inclusion', include: false } : null, { active: !review, disabled: !review, reason: review ? null : LINE_LINK })];
  }
  const staleTransfer = entry.status === 'review' && entry.reason === 'link-removed';
  return [option('excluded', { kind: 'inclusion', include: false }, { active: entry.status === 'not-selected', disabled: staleTransfer, reason: staleTransfer ? STALE_TRANSFER : null }),
    option('gml', { kind: 'inclusion', include: true }, { active: entry.status === 'include', disabled: !entry.canInclude })];
}

/**
 * The destination one click moves to: the other valid option. A decision that needs review resolves to its safe default
 * (GMI for a linked occurrence, «Ikke med» otherwise) when that is available. Null when nothing can change.
 */
export function photoDeliveryToggleTarget(entry) {
  const available = photoDeliveryOptions(entry).filter((item) => !item.disabled && item.apply);
  if (entry?.status === 'review') return available[0] || null;
  return available.find((item) => !item.active) || null;
}

/** Why a click cannot change this occurrence, or null. */
export function photoDeliveryUnavailableReason(entry) {
  if (!entry || photoDeliveryToggleTarget(entry)) return null;
  return photoDeliveryOptions(entry).find((item) => item.reason)?.reason || 'Leveringsvalget kan ikke endres for denne plasseringen.';
}

/** Destination key for presentation (gmi, gml, excluded, review). */
export const photoDeliveryDestination = (entry) => photoDeliveryColourState(entry?.status);

/** Short status text for one occurrence: «GMI», «GML», «Ikke med», «Gjennomgå». */
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
 * the other destination. Returns the session result plus the entry after the change.
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
    const key = photoDeliveryDestination(entries?.[member.id]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [`${members.length} ${members.length === 1 ? 'plassering' : 'plasseringer'}`,
    ...['gmi', 'gml', 'excluded', 'review'].filter((key) => counts.get(key)).map((key) => `${counts.get(key)} ${PHOTO_DELIVERY_COLOURS[key].short}`)].join(' · ');
}

/** Destination counts for the planning bar, by occurrence. */
export function photoDeliveryDestinationCounts(delivery) {
  const counts = { gmi: 0, gml: 0, excluded: 0, review: 0 };
  for (const entry of Object.values(delivery?.byPhotoId || {})) counts[photoDeliveryDestination(entry)]++;
  return counts;
}
