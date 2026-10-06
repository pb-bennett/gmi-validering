import { immutable, isPhotoPosition } from './photoSpatial.mjs';
import { matchPhotoReferences } from './photoReferenceMatching.mjs';

export const PHOTO_POSITION_TOLERANCE_METRES = 0.01;
export function photoPositionDistance(a, b) {
  if (!isPhotoPosition(a) || !isPhotoPosition(b)) return null;
  const latitude = (a.latitude + b.latitude) / 2;
  return Math.hypot((a.latitude - b.latitude) * 111320,
    (a.longitude - b.longitude) * 111320 * Math.cos(latitude * Math.PI / 180));
}

// A frozen review projection, never a second authority for photo coordinates.
export function planPhotoPositioning(photos, { kind, source = null }) {
  const ledger = kind === 'gml' && source ? matchPhotoReferences(source.entries, photos) : null;
  const rows = photos.map((photo) => {
    let proposal = null, action = 'unavailable';
    if (kind === 'gml' && ledger) {
      const edges = ledger.matches.filter((match) => match.photoIds.includes(photo.id));
      const match = edges.find((edge) => edge.status === 'matched');
      if (edges.some((edge) => edge.status === 'ambiguous')) action = 'ambiguous';
      else if (!match) action = 'unmatched';
      else {
        const entry = source.entries.find((item) => item.id === match.entryId);
        proposal = immutable({ ...entry, id: `${source.id}:${entry.id}`, kind, sourceId: source.id, sourceEntryId: entry.id });
      }
    } else if (kind === 'exif') {
      const candidates = photo.spatial.candidates.filter((candidate) => candidate.kind === 'exif'
        && candidate.status === 'viable' && isPhotoPosition(candidate.position));
      if (candidates.length === 1) proposal = candidates[0];
      else if (candidates.length > 1) action = 'ambiguous';
    }
    const eligible = proposal?.status === 'viable' && isPhotoPosition(proposal.position);
    const current = photo.spatial.current;
    const distanceMetres = eligible && current ? photoPositionDistance(current.position, proposal.position) : null;
    if (eligible) action = !current ? 'place' : distanceMetres > PHOTO_POSITION_TOLERANCE_METRES ? 'move' : 'same';
    return Object.freeze({ photoId: photo.id, filename: photo.originalFilename, thumbnailUrl: photo.preview.thumbnailUrl,
      current, currentKind: photo.spatial.candidates.find((item) => item.id === current?.basis.candidateId)?.kind || current?.basis.kind,
      proposal, eligible: Boolean(eligible), action, distanceMetres,
      alternatives: Object.freeze(photo.spatial.candidates.filter((item) => item.status === 'viable' && isPhotoPosition(item.position))),
      exifState: photo.spatial.exifRead.state });
  });
  // Keep current object identity for the session's optimistic confirmation guard.
  return Object.freeze({ kind, sourceId: source?.id || null, ledger, rows: Object.freeze(rows),
    memberIds: Object.freeze(photos.map((photo) => photo.id)),
    defaultSelectedIds: Object.freeze(rows.filter((row) => row.eligible).map((row) => row.photoId)) });
}

export function summarizePhotoPositioning(plan, selectedIds) {
  const selected = new Set(selectedIds);
  const rows = plan.rows.filter((row) => row.eligible && selected.has(row.photoId));
  return immutable({ selectedCount: rows.length, placeCount: rows.filter((row) => row.action === 'place').length,
    moveCount: rows.filter((row) => row.action === 'move').length, sameCount: rows.filter((row) => row.action === 'same').length,
    unavailableCount: plan.rows.filter((row) => !row.eligible).length,
    deselectedCount: plan.rows.filter((row) => row.eligible && !selected.has(row.photoId)).length });
}

export function photoPositioningRequests(plan, selectedIds) {
  const selected = new Set(selectedIds);
  return plan.rows.filter((row) => row.eligible && selected.has(row.photoId)).map((row) => ({
    photoId: row.photoId, candidateId: row.proposal.id, expectedCurrent: row.current,
  }));
}
