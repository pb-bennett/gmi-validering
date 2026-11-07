import { allCaptureTimesAgree, completeCaptureValue } from './photoCaptureMetadata.mjs';
import { directionsAgree } from './photoDirection.mjs';

const hasValue = (item) => item.value !== null && item.value !== undefined;

// The one definition of "these sources disagree", shared by adoption, readiness and the inspector.
// Precision alone is never a disagreement. Every pair must agree, because agreement is not transitive.
export const evidenceValuesConflict = (evidence, field) => {
  if (field === 'captureTime') return !allCaptureTimesAgree(evidence.map((item) => item.value));
  if (field === 'direction') return evidence.some((item, index) => evidence.slice(index + 1).some((other) => !directionsAgree(item, other)));
  return new Set(evidence.map((item) => String(item.value))).size > 1;
};

// This is the explicit route, for a value that automatic acceptance left alone. All legitimate
// normalized sources take part in conflict detection, even when only EXIF or only GML is requested.
export function evidenceEligibility(photo, field, kind = 'exif') {
  const accepted = field === 'direction' ? photo.direction.current : photo.captureMetadata[field];
  if (accepted) return { status: 'alreadyAccepted' };
  const evidence = (field === 'direction' ? photo.directionEvidence : photo.metadataEvidence) || [];
  const relevant = evidence.filter((item) => item.field === field);
  const requested = relevant.filter((item) => item.kind === kind);
  const usable = relevant.filter(hasValue);
  if (evidenceValuesConflict(usable, field)) return { status: 'conflicting' };
  if (!requested.length) return { status: 'missing' };
  const fullPrecision = (item) => field !== 'captureTime' || completeCaptureValue(item.value);
  const candidates = requested.filter((item) => usable.includes(item));
  const candidate = candidates.find(fullPrecision) || candidates[0];
  if (!candidate) return { status: requested.some((item) => item.status === 'unsupported-reference') ? 'unsupportedReference' : 'unusable' };
  if (!fullPrecision(candidate)) return { status: 'insufficientPrecision' };
  return { status: 'eligible', evidence: candidate, agreeingEvidence: usable };
}

export function planEvidenceAdoption(photos, field, kind = 'exif', photoIds = photos.map((photo) => photo.id)) {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const occurrences = new Map();
  for (const photo of photos) occurrences.set(photo.assetId, (occurrences.get(photo.assetId) || 0) + 1);
  const counts = { inspected: 0, eligible: 0, alreadyAccepted: 0, missing: 0, unusable: 0,
    insufficientPrecision: 0, conflicting: 0, unsupportedReference: 0, stale: 0, repeatedApplications: 0 };
  const targets = [], seen = new Set(), missingAssets = new Set();
  for (const id of new Set(photoIds)) {
    const photo = byId.get(id);
    if (!photo) { counts.stale++; continue; }
    const owner = field === 'direction' ? photo.id : photo.assetId;
    if (seen.has(owner)) continue;
    seen.add(owner); counts.inspected++;
    const result = evidenceEligibility(photo, field, kind);
    counts[result.status]++;
    if (field === 'direction' && result.status === 'missing') missingAssets.add(photo.assetId);
    if (result.status === 'eligible') {
      targets.push({ photoId: photo.id, assetId: photo.assetId, ...result });
      if (field === 'direction' && occurrences.get(photo.assetId) > 1) counts.repeatedApplications++;
    }
  }
  return { field, kind, counts: { ...counts, missingAssets: missingAssets.size }, targets };
}
