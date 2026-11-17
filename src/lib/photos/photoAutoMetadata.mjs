import { completeCaptureValue, evidenceProvenance } from './photoCaptureMetadata.mjs';
import { acceptDefaultPhotoDirection, acceptEvidencePhotoDirection } from './photoDirection.mjs';
import { isXmlText } from './export/exportContract.mjs';
import { immutable } from './photoSpatial.mjs';

// The FOTO metadata policy: available source values are used without being asked for, GML before EXIF, and a person
// only steps in to correct something or to supply what no source has. Each plan returns the value to write, or null
// to leave things alone, which keeps a repeated run from changing identities. Evidence is never altered here.
// Capture time is the exception (M3, D1): only EXIF is adopted automatically. A GML capture time is used only through
// the explicit wizard decision, so a declined GML value stays evidence and no publication can adopt it later.
const replaceable = (accepted) => !accepted || accepted.acceptance === 'auto';
const preferred = (items) => items.find((item) => item.kind === 'gml') || items.find((item) => item.kind === 'exif') || null;

// A time without seconds is left as evidence: seconds, timezones and placeholder times are never made up.
// Only an empty value or an automatic EXIF value may be written; any other accepted value is a decision.
export function planAutoCaptureTime(metadata, evidence, acceptedAt = Date.now()) {
  const accepted = metadata.captureTime;
  if (metadata.captureTimeCleared || (accepted && (accepted.acceptance !== 'auto' || accepted.provenance?.kind !== 'exif'))) return null;
  const usable = evidence.filter((item) => item.field === 'captureTime' && item.value);
  const chosen = usable.find((item) => item.kind === 'exif' && completeCaptureValue(item.value)) || null;
  if (!chosen || metadata.captureTime?.provenance.evidenceId === chosen.id) return null;
  return immutable({ value: chosen.value, provenance: evidenceProvenance(chosen, usable), acceptance: 'auto', acceptedAt });
}

// Only EXIF Artist names a photographer. A name no delivery could carry stays evidence, as it would be refused if typed.
export function planAutoPhotographer(metadata, evidence, acceptedAt = Date.now()) {
  if (metadata.photographerCleared || !replaceable(metadata.photographer)) return null;
  const usable = evidence.filter((item) => item.field === 'photographer' && item.value && isXmlText(item.value));
  const chosen = usable.find((item) => item.kind === 'exif');
  if (!chosen || metadata.photographer?.provenance.evidenceId === chosen.id) return null;
  return immutable({ value: chosen.value, provenance: evidenceProvenance(chosen, usable), acceptance: 'auto', acceptedAt });
}

// The default waits for the EXIF read, so a heading still being read is never exported as a default.
export function planAutoDirection(direction, evidence, { exifPending = false, acceptedAt = Date.now() } = {}) {
  const { current } = direction;
  if (!replaceable(current)) return null;
  const usable = evidence.filter((item) => item.field === 'direction' && item.status === 'usable');
  const chosen = preferred(usable);
  if (chosen) return current?.basis.evidenceId === chosen.id ? null : acceptEvidencePhotoDirection(chosen, usable, acceptedAt, 'auto');
  return current || exifPending ? null : acceptDefaultPhotoDirection(acceptedAt);
}
