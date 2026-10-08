export const photoSourceLabel = (kind) => ({ gml: 'GML', exif: 'EXIF', manual: 'Manuell', gmi: 'GMI' })[kind] || kind || 'Ukjent';
export function photoCurrentSource(photo) {
  const current = photo.spatial.current;
  const basis = photo.spatial.candidates.find((candidate) => candidate.id === current?.basis?.candidateId);
  return current ? photoSourceLabel(basis?.kind || current.basis.kind) : null;
}
export function photoCaptureTime(photo) {
  const times = [...new Set(photo.spatial.candidates.filter((candidate) => candidate.kind === 'gml')
    .map((candidate) => candidate.raw?.photographedAtText).filter(Boolean))];
  // Show source text, without interpreting timezone or treating file modification as capture time.
  return times.length === 1 ? times[0] : null;
}
