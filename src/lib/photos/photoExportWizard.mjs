import { groupPhotoExportDiagnostics } from './export/photoExportDiagnostics.mjs';
import { photoExportReadiness } from './export/photoExportReadiness.mjs';
import { photoCompletionStatus, photoReadingNote, photosBeingRead, singularCopy } from './photoCompletion.mjs';

// Readiness presentation for the export wizard. Rules stay in readiness and names stay in the plan, so nothing here
// decides what blocks an export or composes a filename, and nothing here writes to the session.

// The label is left out on purpose: it cannot change readiness, so typing in the field must not recompute it. Without
// `now`, a capture time in the future would go unreported.
export const photoExportDeliveryReadiness = (photos, { profile, crs, context }, now = Date.now()) => photoExportReadiness(photos, { profile, crs, context, now });

const lines = (items) => Object.freeze(items.map(({ code, label, message }) => Object.freeze({ code, label, text: singularCopy(message) })));

function excludedText({ placed, excluded }) {
  if (!placed) return 'Ingen bilder er plassert ennå. Bare plasserte bilder kan eksporteres.';
  return excluded ? singularCopy(`${excluded} plasseringer mangler posisjon og blir ikke med.`) : null;
}

// The first screen. `reading` comes first and looks at the whole layer: readiness only counts placed photos, whereas a
// plan goes stale when any member finishes. Until the read ends, readiness can report blockers that are not real, because
// a default direction waits for the read, so nothing it derives from those photos is passed on.
export function photoExportDeliveryModel({ photos, readiness }) {
  const reading = photosBeingRead(photos);
  const shared = { excludedText: excludedText(readiness.counts) };
  if (reading) {
    return Object.freeze({ ...shared, state: 'reading', heading: photoCompletionStatus(readiness, reading).text, blockers: Object.freeze([]), checks: lines([]), notes: lines([]),
      advance: Object.freeze({ enabled: false, reason: photoReadingNote(reading) }) });
  }
  const { status: state, text: heading } = photoCompletionStatus(readiness);
  const blocked = state === 'blocked';
  return Object.freeze({ ...shared, state, heading, blockers: Object.freeze(groupPhotoExportDiagnostics(readiness.blocking)), checks: lines(readiness.recommendations), notes: lines(readiness.notes),
    advance: Object.freeze({ enabled: !blocked, reason: blocked ? 'Rett det som mangler for å gå videre.' : null }) });
}
