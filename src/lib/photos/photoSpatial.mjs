// Only plain metadata crosses the photo session boundary. Files stay private.
export function immutable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Object.freeze(Array.from(value, immutable));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutable(item)])));
}

export function isPhotoPosition(position) {
  return position?.crs === 'EPSG:4326'
    && Number.isFinite(position.longitude) && Math.abs(position.longitude) <= 180
    && Number.isFinite(position.latitude) && Math.abs(position.latitude) <= 90;
}

export const emptySpatial = () => immutable({
  candidates: [], current: null, exifRead: { state: 'pending', errorCode: null },
});

export function createPhotoCandidate(candidate) {
  if (!candidate.id || !candidate.kind) throw new Error('Candidate identity is required');
  if (candidate.status === 'viable' && !isPhotoPosition(candidate.position)) throw new Error('Invalid candidate position');
  return immutable(candidate);
}

export function acceptPhotoCandidate(spatial, candidateId, acceptance = 'explicit-candidate', acceptedAt = Date.now()) {
  const candidate = spatial.candidates.find((item) => item.id === candidateId);
  if (candidate?.status !== 'viable' || !isPhotoPosition(candidate.position)) return null;
  return Object.freeze({
    ...spatial,
    current: immutable({ position: candidate.position, basis: { kind: 'candidate', candidateId }, acceptance, acceptedAt }),
  });
}

export function photoSpatialCounts(photos) {
  const placedCount = photos.filter((photo) => isPhotoPosition(photo.spatial?.current?.position)).length;
  return {
    placedCount, unplacedCount: photos.length - placedCount,
    exifCandidateCount: photos.filter((photo) => photo.spatial?.candidates.some((item) => item.kind === 'exif' && item.status === 'viable')).length,
  };
}
