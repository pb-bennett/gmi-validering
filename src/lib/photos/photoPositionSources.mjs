import { immutable } from './photoSpatial.mjs';
import { matchPhotoReferences, photoReferenceKey } from './photoReferenceMatching.mjs';
import { photoPositionDistance, PHOTO_POSITION_TOLERANCE_METRES } from './photoPositioning.mjs';

// Source adapters supply entries with reference, raw evidence, and normalized position.
// Neither this ledger nor a source adapter owns photo assets or accepts positions.
export function reviewPhotoSource(source, photos) {
  const ledger = matchPhotoReferences(source.entries, photos);
  const conflicts = [], unplaced = [];
  for (const match of ledger.matches) {
    if (match.status !== 'matched') continue;
    const entry = source.entries.find((item) => item.id === match.entryId);
    if (entry.status !== 'viable') continue;
    const current = photos.find((photo) => photo.id === match.photoId).spatial.current;
    if (!current) { unplaced.push(match.photoId); continue; }
    // About one centimetre horizontally; comparisons never accept a position.
    const metres = photoPositionDistance(entry.position, current.position);
    if (metres > PHOTO_POSITION_TOLERANCE_METRES) conflicts.push({ photoId: match.photoId, entryId: entry.id, distanceMetres: metres });
  }
  return immutable({ ledger, conflicts, unplacedPhotoIds: unplaced });
}

export function duplicatePhotoNames(photos) {
  const buckets = new Map();
  for (const photo of photos) {
    const key = photoReferenceKey(photo.originalFilename).basename.toLowerCase();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(photo);
  }
  return immutable([...buckets.values()].filter((group) => group.length > 1).map((group) => ({
    filename: group[0].originalFilename, photoIds: group.map((photo) => photo.id),
  })));
}

// Filenames identify collisions, never file content. Keep every incoming File distinct.
export function photoAppendPolicy(photos, existingPhotos, overrideIds = new Set()) {
  const targets = new Map();
  for (const photo of existingPhotos) {
    const key = photoReferenceKey(photo.originalFilename).basename.toLowerCase();
    if (!targets.has(key)) targets.set(key, []);
    targets.get(key).push(photo.id);
  }
  const targetCollisions = photos.flatMap((photo) => {
    const existingPhotoIds = targets.get(photoReferenceKey(photo.originalFilename).basename.toLowerCase());
    return existingPhotoIds ? [{ photoId: photo.id, filename: photo.originalFilename, existingPhotoIds }] : [];
  });
  const collisions = new Set(targetCollisions.map((item) => item.photoId));
  const skippedIds = photos.filter((photo) => collisions.has(photo.id) && !overrideIds.has(photo.id)).map((photo) => photo.id);
  const skipped = new Set(skippedIds);
  return immutable({ targetCollisions, skippedIds,
    appendableIds: photos.filter((photo) => !skipped.has(photo.id)).map((photo) => photo.id),
    overrideIds: photos.filter((photo) => collisions.has(photo.id) && overrideIds.has(photo.id)).map((photo) => photo.id),
    newCount: photos.length - targetCollisions.length,
  });
}

// Batch actions are all-or-nothing in the UI. Multiple candidates require a source ID.
export function photoBatchCandidateRequests(photos, selectedIds, kind, sourceId = null) {
  if (!selectedIds.length) return null;
  const requests = [];
  for (const photoId of new Set(selectedIds)) {
    const photo = photos.find((item) => item.id === photoId);
    const candidates = photo?.spatial.candidates.filter((item) => item.kind === kind && item.status === 'viable'
      && (!sourceId || item.sourceId === sourceId)) || [];
    if (candidates.length !== 1) return null;
    requests.push({ photoId, candidateId: candidates[0].id });
  }
  return requests;
}

export function prunePhotoSource(source, remainingIds) {
  const alive = new Set(remainingIds);
  const matches = source.ledger.matches.map((match) => {
    const photoIds = match.photoIds.filter((id) => alive.has(id));
    if (match.status === 'matched' && !alive.has(match.photoId)) {
      return { entryId: match.entryId, status: 'unmatched', photoIds: [], reason: 'photo-removed', method: match.method };
    }
    return { ...match, photoIds };
  });
  return immutable({ ...source, ledger: {
    ...source.ledger, matches,
    unmatchedPhotoIds: source.ledger.unmatchedPhotoIds.filter((id) => alive.has(id)),
    summary: { ...source.ledger.summary,
      matchedCount: matches.filter((match) => match.status === 'matched').length,
      unmatchedCount: matches.filter((match) => match.status === 'unmatched').length,
      viablePlacementCount: matches.filter((match) => match.status === 'matched'
        && source.entries.find((entry) => entry.id === match.entryId).status === 'viable').length,
    },
  } });
}
