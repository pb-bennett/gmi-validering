import { normalizeCaptureTime } from './photoCaptureMetadata.mjs';
import { evidenceValuesConflict } from './photoEvidenceAdoption.mjs';
import { planManualPhotoFill } from './photoManualFill.mjs';

export const ESTIMATED_DATE_HELP = 'Anslått dato. Kl. 12:00:00 lagres og eksporteres som teknisk standard, ikke målt opptakstid.';
export const isEstimatedCaptureTime = (accepted) => accepted?.provenance?.estimated === true;

export function estimatedCaptureTime(date) {
  const value = normalizeCaptureTime(date);
  return value?.precision === 'date' ? normalizeCaptureTime(`${value.iso}T12:00:00`) : null;
}

// Calendar days only. UTC is an arithmetic axis here, never a conversion of the recorded clock.
// setUTCFullYear also handles years 0001–0099 without Date.UTC's 1900 adjustment.
const dayNumber = (date) => {
  const day = new Date(0);
  day.setUTCFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return day.getTime() / 86400000;
};

export function midpointCaptureDate(first, last) {
  if (normalizeCaptureTime(first)?.precision !== 'date' || normalizeCaptureTime(last)?.precision !== 'date') return null;
  // An odd number of days rounds toward the earlier calendar day.
  return new Date(Math.floor((dayNumber(first) + dayNumber(last)) / 2) * 86400000).toISOString().slice(0, 10);
}

export function photoEstimatedDateModel(photos) {
  const unique = [...new Map(photos.map((photo) => [photo.assetId, photo])).values()];
  const known = unique.flatMap((photo) => {
    const accepted = photo.captureMetadata?.captureTime;
    if (!accepted || isEstimatedCaptureTime(accepted)) return [];
    if (accepted.acceptance === 'auto' && evidenceValuesConflict((photo.metadataEvidence || []).filter((item) => item.field === 'captureTime' && item.value), 'captureTime')) return [];
    const value = normalizeCaptureTime(accepted.value.iso);
    return value ? [value.iso.slice(0, 10)] : [];
  }).sort();
  // A single reliable photo is a zero-width range: both endpoints are its recorded date.
  const first = known[0] ?? null;
  const last = known.at(-1) ?? null;
  return { first, last, suggestedDate: first ? midpointCaptureDate(first, last) : null,
    missing: planManualPhotoFill(photos, 'captureTime').counts.eligible };
}
