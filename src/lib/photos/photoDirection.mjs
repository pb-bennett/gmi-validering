import { immutable } from './photoSpatial.mjs';

// Source headings are evidence only. Unknown is never an implicit north heading.
export const emptyDirection = () => Object.freeze({ current: null });

export function normalizePhotoDirection(degrees) {
  if (!Number.isFinite(degrees)) return null;
  return ((Math.round(degrees % 360) % 360) + 360) % 360;
}

export function acceptManualPhotoDirection(degrees, acceptedAt = Date.now()) {
  const normalized = normalizePhotoDirection(degrees);
  return normalized === null ? null : immutable({ current: {
    degrees: normalized, basis: { kind: 'manual' }, acceptance: 'manual', acceptedAt,
  } });
}

export function exifDirectionEvidence(tags = {}) {
  if (tags.GPSImgDirection === undefined && tags.GPSImgDirectionRef === undefined) return immutable([]);
  const raw = Object.fromEntries(['GPSImgDirection', 'GPSImgDirectionRef'].filter((key) => tags[key] !== undefined).map((key) => [key, tags[key]]));
  const degrees = tags.GPSImgDirection;
  const valid = typeof degrees === 'number' && Number.isFinite(degrees) && degrees >= 0 && degrees <= 360;
  const status = !valid ? 'invalid' : tags.GPSImgDirectionRef !== 'T' ? 'unsupported-reference' : 'usable';
  return immutable([{ id: 'exif:direction', field: 'direction', kind: 'exif', tag: 'GPSImgDirection', raw, status,
    value: status === 'usable' ? (degrees === 360 ? 0 : degrees) : null }]);
}

export function acceptEvidencePhotoDirection(evidence, agreeingEvidence = [evidence], acceptedAt = Date.now()) {
  return immutable({ current: { degrees: evidence.value, basis: { kind: evidence.kind, evidenceId: evidence.id,
    tag: evidence.tag, raw: evidence.raw, evidence: agreeingEvidence }, acceptance: 'source', acceptedAt } });
}

export function photoDirectionLabel(degrees) {
  const normalized = normalizePhotoDirection(degrees);
  if (normalized === null) return 'Ikke angitt';
  const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(normalized / 45) % 8];
  return `${normalized}° ${cardinal}`;
}
