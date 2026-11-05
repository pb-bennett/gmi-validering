import { allCaptureTimesAgree } from './photoCaptureMetadata.mjs';

const hasValue = (item) => item.value !== null && item.value !== undefined;
// GML 0° may mean "not recorded". It stays evidence, but cannot speak against another source
// and is not offered by default. EXIF 0° with a true reference is ordinary evidence.
const questionableZero = (item) => item.status === 'usable-zero';

// The one definition of "these sources disagree", shared by adoption and the inspector.
export const evidenceValuesConflict = (evidence, field) => field === 'captureTime'
  ? !allCaptureTimesAgree(evidence.map((item) => item.value))
  : new Set(evidence.map((item) => String(item.value))).size > 1;

// All legitimate normalized sources participate in conflict detection, even when
// the explicit action requests only EXIF or only GML. No source wins by ranking.
// includeZero is an explicit request for questionable zeros from the requested source; those
// then take part in conflict detection, so a real heading from another source still blocks them.
export function evidenceEligibility(photo, field, kind = 'exif', { includeZero = false } = {}) {
  const accepted = field === 'direction' ? photo.direction.current : photo.captureMetadata[field];
  if (accepted) return { status: 'alreadyAccepted' };
  const evidence = (field === 'direction' ? photo.directionEvidence : photo.metadataEvidence) || [];
  const relevant = evidence.filter((item) => item.field === field);
  const requested = relevant.filter((item) => item.kind === kind);
  const usable = relevant.filter((item) => hasValue(item) && (!questionableZero(item) || (includeZero && item.kind === kind)));
  if (evidenceValuesConflict(usable, field)) return { status: 'conflicting' };
  if (!requested.length) return { status: 'missing' };
  const fullPrecision = (item) => field !== 'captureTime' || ['second', 'fraction'].includes(item.value.precision);
  const candidates = requested.filter((item) => usable.includes(item));
  const candidate = candidates.find(fullPrecision) || candidates[0];
  if (!candidate) {
    if (requested.some(questionableZero)) return { status: 'zeroNeedsReview' };
    return { status: requested.some((item) => item.status === 'unsupported-reference') ? 'unsupportedReference' : 'unusable' };
  }
  if (!fullPrecision(candidate)) return { status: 'insufficientPrecision' };
  return { status: 'eligible', evidence: candidate, agreeingEvidence: usable };
}

export function planEvidenceAdoption(photos, field, kind = 'exif', photoIds = photos.map((photo) => photo.id), options = {}) {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const occurrences = new Map();
  for (const photo of photos) occurrences.set(photo.assetId, (occurrences.get(photo.assetId) || 0) + 1);
  const counts = { inspected: 0, eligible: 0, alreadyAccepted: 0, missing: 0, unusable: 0,
    insufficientPrecision: 0, conflicting: 0, unsupportedReference: 0, zeroNeedsReview: 0, stale: 0, repeatedApplications: 0 };
  const targets = [], seen = new Set(), missingAssets = new Set();
  for (const id of new Set(photoIds)) {
    const photo = byId.get(id);
    if (!photo) { counts.stale++; continue; }
    const owner = field === 'direction' ? photo.id : photo.assetId;
    if (seen.has(owner)) continue;
    seen.add(owner); counts.inspected++;
    const result = evidenceEligibility(photo, field, kind, options);
    counts[result.status]++;
    if (field === 'direction' && result.status === 'missing') missingAssets.add(photo.assetId);
    if (result.status === 'eligible') {
      targets.push({ photoId: photo.id, assetId: photo.assetId, ...result });
      if (field === 'direction' && occurrences.get(photo.assetId) > 1) counts.repeatedApplications++;
    }
  }
  return { field, kind, counts: { ...counts, missingAssets: missingAssets.size }, targets };
}
