// All legitimate normalized sources participate in conflict detection, even when
// the explicit action requests only EXIF or only GML. No source wins by ranking.
export function evidenceEligibility(photo, field, kind = 'exif') {
  const accepted = field === 'direction' ? photo.direction.current : photo.captureMetadata[field];
  if (accepted) return { status: 'alreadyAccepted' };
  const evidence = (field === 'direction' ? photo.directionEvidence : photo.metadataEvidence) || [];
  const relevant = evidence.filter((item) => item.field === field);
  const requested = relevant.filter((item) => item.kind === kind);
  const usable = relevant.filter((item) => item.value !== null && item.value !== undefined);
  const key = (item) => field === 'captureTime'
    ? item.value.iso.replace(/\.([0-9]*?)0+(?=Z|[+-]|$)/, (_, digits) => digits ? `.${digits}` : '').replace(/\+00:00$/, 'Z')
    : String(item.value);
  if (new Set(usable.map(key)).size > 1) return { status: 'conflicting' };
  if (!requested.length) return { status: 'missing' };
  const candidate = requested.find((item) => item.value !== null && item.value !== undefined);
  if (!candidate) return { status: requested.some((item) => item.status === 'unsupported-reference') ? 'unsupportedReference' : 'unusable' };
  if (field === 'captureTime' && !['second', 'fraction'].includes(candidate.value.precision)) return { status: 'insufficientPrecision' };
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
