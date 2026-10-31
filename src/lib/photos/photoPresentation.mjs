export const photoSourceLabel = (kind) => ({ gml: 'GML', exif: 'EXIF', manual: 'Manuell', gmi: 'GMI' })[kind] || kind || 'Ukjent';
export function photoCurrentSource(photo) {
  const current = photo.spatial.current;
  const basis = photo.spatial.candidates.find((candidate) => candidate.id === current?.basis?.candidateId);
  return current ? photoSourceLabel(basis?.kind || current.basis.kind) : null;
}
export function photoCaptureTime(photo) {
  return photo.captureMetadata?.captureTime?.value.iso || null;
}
