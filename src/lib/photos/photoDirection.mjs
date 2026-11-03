import { immutable } from './photoSpatial.mjs';

// Source headings are evidence only. Unknown is never an implicit north heading.
export const emptyDirection = () => Object.freeze({ current: null });

export function normalizePhotoDirection(degrees) {
  if (!Number.isFinite(degrees)) return null;
  return ((Math.round(degrees % 360) % 360) + 360) % 360;
}

export function normalizeExactPhotoDirection(degrees) {
  return Number.isFinite(degrees) && degrees >= 0 && degrees <= 360 ? (degrees === 360 || degrees === 0 ? 0 : degrees) : null;
}

export function acceptManualPhotoDirection(degrees, acceptedAt = Date.now(), { mode = null } = {}) {
  const normalized = mode === 'bulk' ? normalizeExactPhotoDirection(degrees) : normalizePhotoDirection(degrees);
  return normalized === null ? null : immutable({ current: {
    degrees: normalized, basis: { kind: 'manual', ...(mode ? { mode } : {}) }, acceptance: 'manual', acceptedAt,
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

// Norwegian compass sectors of 45°, clockwise from geographic north.
const COMPASS_LETTERS = Object.freeze(['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV']);
const COMPASS_WORDS = Object.freeze(['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest']);
const compassSector = (normalized) => Math.round(normalized / 45) % 8;

export function photoDirectionLabel(degrees) {
  // Exact accepted values (EXIF or bulk fill) keep their decimals; interactive edits are integers.
  const exact = normalizeExactPhotoDirection(degrees);
  if (exact !== null && !Number.isInteger(exact)) {
    return `${exact.toLocaleString('nb-NO', { maximumFractionDigits: 3 })}° ${COMPASS_LETTERS[compassSector(exact)]}`;
  }
  const normalized = normalizePhotoDirection(degrees);
  if (normalized === null) return 'Ikke angitt';
  return `${normalized}° ${COMPASS_LETTERS[compassSector(normalized)]}`;
}

export function photoDirectionCompassWord(degrees) {
  const normalized = normalizePhotoDirection(degrees);
  return normalized === null ? null : COMPASS_WORDS[compassSector(normalized)];
}

// Full words for assistive technology, e.g. slider aria-valuetext.
export function photoDirectionSpokenLabel(degrees) {
  const normalized = normalizePhotoDirection(degrees);
  if (normalized === null) return 'Ikke angitt';
  return `${normalized} ${normalized === 1 ? 'grad' : 'grader'}, ${COMPASS_WORDS[compassSector(normalized)]}`;
}
