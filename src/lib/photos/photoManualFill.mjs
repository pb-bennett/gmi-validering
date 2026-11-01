import { normalizeCaptureTime, normalizePhotographer } from './photoCaptureMetadata.mjs';
import { normalizeExactPhotoDirection } from './photoDirection.mjs';
import { isXmlText } from './export/exportContract.mjs';

export const MANUAL_FILL_FIELDS = ['captureTime', 'photographer', 'direction'];

export function normalizeManualPhotoFill(field, input) {
  if (field === 'direction') return normalizeExactPhotoDirection(input);
  if (field === 'captureTime') {
    const value = normalizeCaptureTime(input);
    return value && ['second', 'fraction'].includes(value.precision) ? value : null;
  }
  if (field === 'photographer') {
    const value = normalizePhotographer(input);
    return value && isXmlText(input) ? value : null;
  }
  return null;
}

// Accepted values, not source availability, define manual fallback eligibility.
export function planManualPhotoFill(photos, field, photoIds = photos.map((photo) => photo.id)) {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const occurrences = new Map();
  for (const photo of photos) occurrences.set(photo.assetId, (occurrences.get(photo.assetId) || 0) + 1);
  const counts = { inspected: 0, eligible: 0, alreadyAccepted: 0, stale: 0, deduplicated: 0, repeatedApplications: 0 };
  const seen = new Set(), targets = [];
  for (const id of new Set(photoIds)) {
    const photo = byId.get(id);
    if (!photo) { counts.stale++; continue; }
    const owner = field === 'direction' ? photo.id : photo.assetId;
    if (seen.has(owner)) { counts.deduplicated++; continue; }
    seen.add(owner); counts.inspected++;
    const accepted = field === 'direction' ? photo.direction.current : photo.captureMetadata[field];
    if (accepted != null) { counts.alreadyAccepted++; continue; }
    counts.eligible++;
    targets.push({ photoId: photo.id, assetId: photo.assetId });
    if (field === 'direction' && occurrences.get(photo.assetId) > 1) counts.repeatedApplications++;
  }
  return { field, counts, targets };
}
