// Batch 1B.2B: the one accepted-position rule for «Flytt til punktobjekt».
//
// Used by the read-only pairing review (photoHyperlinkReview) and by the
// transaction (photoHyperlinkTransfer), so the review never reports a pairing
// as «Avklart» when the transaction would refuse it.
//
// A transfer gives the moved occurrence the recipient's GMI position. The only
// accepted position it may replace is the source object's own GMI position
// (the GMI candidate of exactly that object in exactly that source). Anything
// else is an explicit choice that must not be silently replaced:
// - a manual placement, even at the same point (a near-zero distance is not
//   permission);
// - an EXIF or GML candidate, or any other basis;
// - a GMI candidate of another object.
// Another occurrence of the same photograph that is placed anywhere blocks too
// (shared photographs: the planner's FOTO facts are per photograph).
// Unplaced occurrences never block.
import { photoPositionDistance } from './photoPositioning.mjs';

const SAME_POSITION_METRES = 0.01;

/** Whether `photo`'s accepted position is exactly the source object's own GMI position. */
export function photoPositionIsSourceGmi(photo, { sourceObjectKey, sourceFingerprint, sourcePosition }) {
  const current = photo?.spatial?.current;
  if (!current || current.basis?.kind !== 'candidate' || !sourcePosition) return false;
  const candidate = photo.spatial.candidates?.find((item) => item.id === current.basis.candidateId);
  if (candidate?.kind !== 'gmi' || candidate.provenance?.objectKey !== sourceObjectKey
    || (sourceFingerprint && candidate.provenance?.sourceFingerprint !== sourceFingerprint)) return false;
  const distance = photoPositionDistance(current.position, sourcePosition);
  return distance !== null && distance <= SAME_POSITION_METRES;
}

/**
 * The first accepted position among `photos` (every FOTO occurrence of one photograph) that a transfer from
 * `sourceObjectKey` would have to replace or leave inconsistent, or null.
 * Codes: 'accepted-position' (the moved occurrence itself), 'accepted-position-other' (another occurrence).
 */
export function photoTransferPositionConflict(photos, { sourceObjectKey, sourceFingerprint = null, sourcePosition = null }) {
  for (const photo of photos || []) {
    if (!photo?.spatial?.current) continue;
    if (photoPositionIsSourceGmi(photo, { sourceObjectKey, sourceFingerprint, sourcePosition })) continue;
    const own = photo.occurrence?.objectKey === sourceObjectKey && (!sourceFingerprint || photo.occurrence?.sourceFingerprint === sourceFingerprint);
    return Object.freeze({ code: own ? 'accepted-position' : 'accepted-position-other', photoId: photo.id });
  }
  return null;
}

export const PHOTO_TRANSFER_POSITION_TEXT = Object.freeze({
  'accepted-position': 'Bildet har en akseptert plassering som ikke er dette punktobjektets GMI-posisjon (for eksempel manuell, EXIF eller GML). Flytting ville erstatte den med mottakerens posisjon, og det gjøres ikke automatisk. Behold bildelenken uendret.',
  'accepted-position-other': 'Samme bilde er også plassert et annet sted i FOTO. Flytting støttes ikke for bilder med flere plasseringer. Behold bildelenken uendret.',
});
