import { evidenceProvenance, normalizeCaptureTime } from './photoCaptureMetadata.mjs';
import { evidenceValuesConflict } from './photoEvidenceAdoption.mjs';
import { filenameCaptureTimeWrite, localCalendarDate, planFilenameCaptureSuggestions } from './photoFilenameCaptureTime.mjs';
import { isEstimatedCaptureTime, photoEstimatedDateModel } from './photoEstimatedDates.mjs';

// M5 (Batch C): batch capture-date completion in «Fullfør opplysninger». Pure planning over the layer's photos; the
// session writes only what one explicit button chose, and every step has an undo. Counts are unique photos (assets).
// Order of evidence: usable EXIF/GML values first, then filename dates, then optional technical completion of accepted
// partial values, then an optional estimated date for photos with no date evidence at all.

const PRECISION_RANK = Object.freeze({ date: 0, minute: 1, second: 2, fraction: 3 });
// Complete values, values without seconds and date-only values are always offered and counted apart.
export const capturePrecisionGroup = (value) => value.precision === 'date' ? 'date' : value.precision === 'minute' ? 'minute' : 'complete';
const SOURCE_ORDER = Object.freeze({ gml: 0, exif: 1 });

const uniqueAssets = (photos) => [...new Map(photos.map((photo) => [photo.assetId || photo.id, photo])).values()];
const open = (photo) => !photo.captureMetadata?.captureTime && !photo.captureMetadata?.captureTimeCleared
  && photo.spatial?.exifRead?.state !== 'pending';
const row = (photo, value, provenance, extra = {}) => Object.freeze({ assetId: photo.assetId || photo.id, photoId: photo.id,
  filename: photo.originalFilename ?? null, value, provenance: Object.freeze(provenance), group: capturePrecisionGroup(value), ...extra });

// Step 1. A usable EXIF or GML value that is not accepted yet. Disagreeing sources are never batch-adopted (they stay
// row choices). When the sources agree, the most precise value wins (DC3); at equal precision GML comes first (M3).
export function planSourceCaptureAdoption(photos) {
  return uniqueAssets(photos).filter(open).flatMap((photo) => {
    const usable = (photo.metadataEvidence || []).filter((item) => item.field === 'captureTime' && item.value && item.kind in SOURCE_ORDER);
    if (!usable.length || evidenceValuesConflict(usable, 'captureTime')) return [];
    const chosen = [...usable].sort((a, b) => PRECISION_RANK[b.value.precision] - PRECISION_RANK[a.value.precision]
      || SOURCE_ORDER[a.kind] - SOURCE_ORDER[b.kind])[0];
    return [row(photo, chosen.value, { ...evidenceProvenance(chosen, usable), via: 'completion' })];
  });
}

// Step 2. Filename dates (M1 rules) for photos with no usable EXIF or GML capture time.
export function planLayerFilenameCaptureSuggestions(photos, { today = localCalendarDate() } = {}) {
  const sourceEvidence = new Map(uniqueAssets(photos).map((photo) => [photo.assetId || photo.id,
    (photo.metadataEvidence || []).filter((item) => item.kind === 'gml')]));
  const plan = planFilenameCaptureSuggestions(photos, { draftGmlEvidenceByAsset: sourceEvidence, today });
  const byAsset = new Map(uniqueAssets(photos).map((photo) => [photo.assetId || photo.id, photo]));
  return [...plan.complete, ...plan.dateOnly].map((suggestion) => {
    const write = filenameCaptureTimeWrite(suggestion, 0);
    return row(byAsset.get(suggestion.assetId), write.value, { ...write.provenance, via: 'completion' });
  });
}

// Step 3 (C2). Accepted values with a date only or no seconds are completed technically: noon for a date, 00 seconds
// for a minute. Known components and any offset are kept exactly; the original provenance is kept and marked. Estimated
// dates already carry 12:00:00 and are not offered (DC1).
export function technicalCaptureCompletion(accepted) {
  const value = accepted?.value;
  if (!value || isEstimatedCaptureTime(accepted) || accepted.provenance?.technical) return null;
  const completed = value.precision === 'date' ? normalizeCaptureTime(`${value.iso}T12:00:00`)
    : value.precision === 'minute' ? normalizeCaptureTime(value.iso.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/, '$1:00')) : null;
  if (!completed) return null;
  return { value: completed, provenance: { ...accepted.provenance, technical: { kind: value.precision === 'date' ? 'noon' : 'seconds', from: value } } };
}
export function planTechnicalCaptureCompletion(photos) {
  return uniqueAssets(photos).flatMap((photo) => {
    const completion = technicalCaptureCompletion(photo.captureMetadata?.captureTime);
    return completion ? [row(photo, completion.value, completion.provenance, { kind: completion.provenance.technical.kind, from: completion.provenance.technical.from })] : [];
  });
}

// The whole Opptakstid flow for one layer. Steps with nothing to offer are empty.
export function planCaptureCompletion(photos, { today = localCalendarDate() } = {}) {
  const groups = (rows) => Object.freeze({ complete: rows.filter((item) => item.group === 'complete'),
    minute: rows.filter((item) => item.group === 'minute'), date: rows.filter((item) => item.group === 'date') });
  const technical = planTechnicalCaptureCompletion(photos);
  return Object.freeze({
    source: groups(planSourceCaptureAdoption(photos)),
    filename: groups(planLayerFilenameCaptureSuggestions(photos, { today })),
    technical: Object.freeze({ noon: technical.filter((item) => item.kind === 'noon'), seconds: technical.filter((item) => item.kind === 'seconds') }),
    estimate: photoEstimatedDateModel(photos, { today }),
  });
}

// The rows one choice authorises. `choice`: { step: 'source'|'filename'|'technical', groups: [...] }.
export function selectedCaptureCompletionRows(plan, { step, groups = [] } = {}) {
  const lists = plan?.[step];
  if (!lists || step === 'estimate') return [];
  return [...new Set(groups)].flatMap((group) => Object.hasOwn(lists, group) ? lists[group] : []);
}
// What a reviewed choice would write, for comparing it with a re-plan at the moment of writing.
export const captureCompletionSignature = (rows) => JSON.stringify(rows.map(({ assetId, value, provenance }) => [assetId, value, provenance]));
