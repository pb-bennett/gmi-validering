// Presentation only: evidence and current positions remain owned by photoSession.
export function newPhotoCandidateCount(review, photos) {
  if (!review?.source || !review.ledger) return 0;
  return review.ledger.matches.filter((match) => {
    if (match.status !== 'matched') return false;
    const entry = review.source.entries.find((item) => item.id === match.entryId);
    const photo = photos.find((item) => item.id === match.photoId);
    // Matched invalid evidence is also attached as a diagnostic candidate.
    return entry && photo && !photo.spatial.candidates.some((candidate) =>
      candidate.sourceId === review.source.id && candidate.sourceEntryId === match.entryId);
  }).length;
}
