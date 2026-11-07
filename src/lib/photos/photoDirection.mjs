import { immutable } from './photoSpatial.mjs';

// Source headings stay as evidence, and the accepted value records where it came from. Before a layer owns an
// occurrence its direction is unknown; the session then assigns one by photoAutoMetadata's rules.
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

// Unit 1 and reference 1 are clockwise degrees from geographic north, the only form used without conversion.
// 0 is an ordinary north heading. An absent direction yields no evidence, never a zero.
export function gmlDirectionEvidence(source, entry) {
  const raw = entry.raw?.direction;
  if (!raw || [raw.valueText, raw.unitText, raw.referenceText].every((text) => text === null || text === undefined)) return immutable([]);
  const text = raw.valueText?.trim();
  const degrees = /^\d+(?:\.\d+)?$/.test(text ?? '') ? normalizeExactPhotoDirection(Number(text)) : null;
  const verified = raw.unitText?.trim() === '1' && raw.referenceText?.trim() === '1';
  const status = degrees === null ? 'invalid' : !verified ? 'unsupported-reference' : 'usable';
  return immutable([{ id: `${source.id}:${entry.id}:direction`, field: 'direction', kind: 'gml', tag: 'retningsverdi',
    sourceId: source.id, sourceFilename: source.filename, sourceEntryId: entry.id, raw, status,
    value: status === 'usable' ? degrees : null }]);
}

// `acceptance: 'auto'` marks a value the session chose and may replace with a better source. Every other
// acceptance is a person's decision and is never replaced. The degrees keep the precision of the source.
export function acceptEvidencePhotoDirection(evidence, agreeingEvidence = [evidence], acceptedAt = Date.now(), acceptance = 'source') {
  return immutable({ current: { degrees: evidence.value, basis: { kind: evidence.kind, evidenceId: evidence.id,
    tag: evidence.tag, raw: evidence.raw, ...(evidence.sourceId ? { sourceId: evidence.sourceId, sourceFilename: evidence.sourceFilename,
      sourceEntryId: evidence.sourceEntryId } : {}), evidence: agreeingEvidence }, acceptance, acceptedAt } });
}

// No source gave a heading. The basis keeps this apart from a 0° a source actually reported.
export const acceptDefaultPhotoDirection = (acceptedAt = Date.now()) => immutable({ current: {
  degrees: 0, basis: { kind: 'default' }, acceptance: 'auto', acceptedAt } });
export const isDefaultPhotoDirection = (current) => current?.basis?.kind === 'default';

const decimals = (item) => String(item.raw?.valueText ?? item.value).trim().split('.')[1]?.length ?? 0;
export const directionSeparation = (a, b) => { const gap = Math.abs(a - b) % 360; return Math.min(gap, 360 - gap); };
// Two headings differ only when the gap exceeds what the coarser source can express, whether it rounded or truncated
// (123 and 123.9), and what a whole-degree display can show. The smallest angle counts, so 359.9 and 0.1 are neighbours.
export function directionsAgree(a, b) {
  const lastPlace = 10 ** -Math.min(decimals(a), decimals(b));
  return directionSeparation(a.value, b.value) <= Math.max(lastPlace * (1 - 1e-9), 0.5);
}

// Norwegian compass sectors of 45°, clockwise from geographic north.
const COMPASS_LETTERS = Object.freeze(['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV']);
const COMPASS_WORDS = Object.freeze(['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest']);
const compassSector = (normalized) => Math.round(normalized / 45) % 8;

export function photoDirectionLabel(degrees) {
  // Whole degrees on screen. Accepted values and their evidence keep the precision of the source.
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
