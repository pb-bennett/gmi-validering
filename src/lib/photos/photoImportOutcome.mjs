import { getFeatureHoverParts } from '../map/featureHoverLabel.mjs';
import { gmiObjectLabel } from './gmiPhotoSource.mjs';

// This policy is used for both the projected plan and the guarded commit plan.
export function importPlacementRequests(plan, placement, eligibleIds = plan.rows.map((row) => row.photoId)) {
  const eligible = new Set(eligibleIds);
  const usable = (item) => item.status === 'viable' && !item.issues?.includes('questionable-zero-gps');
  return plan.rows.flatMap((row) => {
    if (row.current || !eligible.has(row.photoId) || placement.kind === 'none') return [];
    let options = row.options.filter((item) => item.kind === placement.kind && usable(item));
    if (!options.length && placement.exifFallback) options = row.options.filter((item) => item.kind === 'exif' && usable(item));
    return options.length === 1 ? [{ photoId: row.photoId, candidateId: options[0].id }] : [];
  });
}
export function gmiObjectContext(object) {
  if (!object) return '';
  const parts = getFeatureHoverParts({ properties: object.attributes, geometry: { type: object.geometryScope === 'point' ? 'Point' : 'LineString' } }).slice(0, 2);
  const anleggsId = object.identifiers?.AnleggsID;
  if (anleggsId !== null && anleggsId !== undefined && String(anleggsId).trim()) parts.push(`AnleggsID ${anleggsId}`);
  return parts.join(' · ') || gmiObjectLabel(object);
}
export function previewImportPlacement({ plan, placement, gmiReview, excludedPhotos = [] }) {
  const requests = new Set(importPlacementRequests(plan, placement).map((item) => item.photoId));
  const groups = Map.groupBy(plan.rows, (row) => row.assetId);
  const rows = [...groups].map(([assetId, occurrences]) => {
    const first = occurrences[0];
    const resolutions = gmiReview?.associationLedger.resolutions.filter((row) => row.photoIds.includes(assetId)) || [];
    const linked = resolutions.some((row) => row.status === 'confident');
    const placed = occurrences.every((row) => row.current || requests.has(row.photoId));
    const questionable = occurrences.some((row) => row.options.some((candidate) => candidate.issues?.includes('questionable-zero-gps')));
    const status = placed ? 'placed' : resolutions.some((row) => row.status === 'ambiguous') ? 'ambiguous'
      : questionable ? 'questionable-gps' : linked ? 'linked-no-position' : gmiReview ? 'not-referenced' : 'no-position';
    const sourceObjects = gmiReview ? resolutions.filter((row) => row.status === 'confident').map((row) => gmiReview.source.objectsByKey[row.objectKey]) : [];
    const objects = sourceObjects.map(gmiObjectContext);
    const canUseExifFallback = occurrences.some((row) => !row.current && !row.options.some((candidate) => candidate.kind === placement.kind)
      && row.options.some((candidate) => candidate.kind === 'exif' && !candidate.issues?.includes('questionable-zero-gps')));
    const reason = status === 'linked-no-position' && sourceObjects.every((object) => object.geometryScope === 'line')
      ? 'Koblet til en ledning – får ikke posisjon automatisk.' : null;
    return { ...first, assetId, status, linked, reason, canUseExifFallback, objects: [...new Set(objects)], occurrences: occurrences.length };
  });
  return [...rows, ...excludedPhotos.map((photo) => ({ assetId: photo.assetId || photo.id, filename: photo.originalFilename, thumbnailUrl: photo.preview.thumbnailUrl, status: 'excluded', reason: photo.importExclusionReason, objects: [] }))];
}
export function summarizeImportOutcome(rows, gmiReview) {
  const included = rows.filter((row) => row.status !== 'excluded');
  const placed = included.filter((row) => row.status === 'placed').length;
  return { total: included.length, placed, unplaced: included.length - placed,
    autoLinked: included.filter((row) => row.linked).length,
    attention: rows.filter((row) => row.status !== 'placed'),
    repeatedPhotos: included.filter((row) => row.occurrences > 1).length,
    missingReferences: gmiReview?.associationLedger.resolutions.filter((row) => row.status === 'unmatched' && row.reason === 'no-owner-layer-photo').map((row) => gmiReview.source.references.find((ref) => ref.id === row.referenceId)) || [] };
}
