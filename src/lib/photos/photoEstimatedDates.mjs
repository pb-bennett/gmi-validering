import { normalizeCaptureTime } from './photoCaptureMetadata.mjs';
import { evidenceValuesConflict } from './photoEvidenceAdoption.mjs';
import { localCalendarDate, parseFilenameCaptureTime } from './photoFilenameCaptureTime.mjs';

export const ESTIMATED_DATE_HELP = 'Anslått dato. Kl. 12:00:00 lagres og eksporteres som teknisk standard, ikke målt opptakstid.';
export const isEstimatedCaptureTime = (accepted) => accepted?.provenance?.estimated === true;

// DC2 (approved 2026-11-19): a proposal needs at least 3 known dates covering at least 25 % of the layer's unique
// photos. A spread of up to 7 days is prefilled; 8–31 days is shown but must be chosen explicitly; more gives none.
export const ESTIMATE_MIN_BASIS = 3;
export const ESTIMATE_MIN_SHARE = 0.25;
export const ESTIMATE_PREFILL_DAYS = 7;
export const ESTIMATE_MAX_DAYS = 31;

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
export const captureDateSpreadDays = (first, last) => Math.round(dayNumber(last) - dayNumber(first));

// The median calendar date; with an even count the lower middle date, as the former midpoint rounded towards the
// earlier day. Invalid dates give null.
export function medianCaptureDate(dates) {
  if (!dates?.length || dates.some((date) => normalizeCaptureTime(date)?.precision !== 'date')) return null;
  const sorted = [...dates].sort();
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

// Any source that gives this photo a date (EXIF, GML or its filename): such photos are completed from that evidence,
// never estimated, and are left out of both the basis and the targets until they are accepted.
const hasDateEvidence = (photo, today) => (photo.metadataEvidence || []).some((item) => item.field === 'captureTime' && item.value)
  || Boolean(parseFilenameCaptureTime(photo.originalFilename, { today }));

// C3: the basis is unique photos with an accepted, non-estimated date of any precision (filename and technically
// completed values included), except automatically accepted values whose sources disagree. The targets are unique
// photos with no accepted value, no removal by the user, no date evidence and no EXIF read in progress.
export function photoEstimatedDateModel(photos, { today = localCalendarDate() } = {}) {
  const unique = [...new Map(photos.map((photo) => [photo.assetId || photo.id, photo])).values()];
  const known = unique.flatMap((photo) => {
    const accepted = photo.captureMetadata?.captureTime;
    if (!accepted || isEstimatedCaptureTime(accepted)) return [];
    if (accepted.acceptance === 'auto' && evidenceValuesConflict((photo.metadataEvidence || []).filter((item) => item.field === 'captureTime' && item.value), 'captureTime')) return [];
    const value = normalizeCaptureTime(accepted.value.iso);
    return value ? [value.iso.slice(0, 10)] : [];
  }).sort();
  const targets = unique.filter((photo) => !photo.captureMetadata?.captureTime && !photo.captureMetadata?.captureTimeCleared
    && photo.spatial?.exifRead?.state !== 'pending' && !hasDateEvidence(photo, today));
  const first = known[0] ?? null, last = known.at(-1) ?? null;
  const spreadDays = first ? captureDateSpreadDays(first, last) : null;
  const enough = known.length >= ESTIMATE_MIN_BASIS && known.length >= ESTIMATE_MIN_SHARE * unique.length;
  const proposal = !enough ? null : spreadDays <= ESTIMATE_PREFILL_DAYS ? 'prefill' : spreadDays <= ESTIMATE_MAX_DAYS ? 'confirm' : null;
  const median = medianCaptureDate(known);
  return Object.freeze({ basis: known.length, unique: unique.length, first, last, spreadDays, median, proposal,
    reason: !enough ? 'insufficient' : proposal ? null : 'spread', suggestedDate: proposal ? median : null,
    missing: targets.length, targetIds: Object.freeze(targets.map((photo) => photo.id)) });
}

export const estimatedDateReviewSignature = (model) => JSON.stringify([
  model.targetIds, model.basis, model.unique, model.first, model.last, model.proposal, model.suggestedDate,
]);
