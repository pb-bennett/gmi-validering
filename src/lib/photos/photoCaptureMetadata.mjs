import { immutable } from './photoSpatial.mjs';

export const emptyCaptureMetadata = () => immutable({ captureTime: null, photographer: null });

// Calendar validation never uses the host timezone. Offsets stay as supplied;
// local camera times are not silently converted to UTC.
export function normalizeCaptureTime(input) {
  if (typeof input !== 'string') return null;
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/);
  if (!match) return null;
  const [, y, m, d, h, min, sec, fraction, zone] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    || Number(h || 0) > 23 || Number(min || 0) > 59 || Number(sec || 0) > 59) return null;
  if (zone && zone !== 'Z' && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59
    || (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0))) return null;
  return immutable({ iso: `${y}-${m}-${d}${h === undefined ? '' : `T${h}:${min}${sec === undefined ? '' : `:${sec}${fraction || ''}`}${zone || ''}`}`,
    precision: h === undefined ? 'date' : sec === undefined ? 'minute' : fraction ? 'fraction' : 'second',
    timezoneKnown: Boolean(zone), offset: zone || null });
}

// The recorded clock to whole seconds. Subseconds never decide agreement, because a source may simply
// not carry them, and nothing here reads the host timezone or converts between offsets.
const wallClock = (value) => value.iso.replace(/(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/, '');
const zone = (value) => value.offset?.replace(/^[+-]00:00$/, 'Z') ?? null;

// Agreement is the same clock at the lower precision of the two, with no known difference in offset.
// 12:33:02Z and 14:33:02+02:00 are the same instant but stay distinct: their exported clocks differ.
export function captureTimesAgree(a, b) {
  const clocks = [wallClock(a), wallClock(b)], zones = [zone(a), zone(b)];
  return (clocks[0].startsWith(clocks[1]) || clocks[1].startsWith(clocks[0]))
    && (!zones[0] || !zones[1] || zones[0] === zones[1]);
}

// Every pair must agree. Agreement is not transitive: +01:00 and +02:00 can both match an unknown
// offset, and 14:33:02 and 14:33:03 can both match 14:33, without matching each other.
export const allCaptureTimesAgree = (values) => values.every((value, index) =>
  values.slice(index + 1).every((other) => captureTimesAgree(value, other)));

export function normalizePhotographer(input) {
  return typeof input === 'string' ? input.replace(/\s+/gu, ' ').trim() || null : null;
}

// A valid DateTimeOriginal survives a malformed supplementary tag. The clock then simply knows less:
// no offset means timezone unknown, no subsecond means second precision. Raw tags stay with the evidence.
function exifCaptureValue(clock, subsecond, offset) {
  let value = normalizeCaptureTime(clock);
  if (!value) return { value: null, issues: [] };
  const issues = [];
  const extend = (suffix, valid, issue) => {
    const extended = valid ? normalizeCaptureTime(`${value.iso}${suffix}`) : null;
    if (extended) value = extended; else issues.push(issue);
  };
  if (subsecond !== undefined) extend(`.${subsecond}`, /^\d{1,9}$/.test(String(subsecond)), 'invalid-subsecond');
  if (offset !== undefined) extend(offset, /^(Z|[+-]\d{2}:\d{2})$/.test(String(offset)), 'invalid-offset');
  return { value, issues };
}

export function exifCaptureEvidence(tags = {}) {
  const evidence = [];
  if (tags.DateTimeOriginal !== undefined) {
    const raw = Object.fromEntries(['DateTimeOriginal', 'SubSecTimeOriginal', 'OffsetTimeOriginal'].filter((key) => tags[key] !== undefined).map((key) => [key, tags[key]]));
    const base = typeof tags.DateTimeOriginal === 'string' ? tags.DateTimeOriginal.trim().replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T') : '';
    evidence.push({ id: 'exif:captureTime', field: 'captureTime', kind: 'exif', tag: 'DateTimeOriginal', raw, ...exifCaptureValue(base, tags.SubSecTimeOriginal, tags.OffsetTimeOriginal) });
  }
  if (tags.Artist !== undefined) evidence.push({ id: 'exif:photographer', field: 'photographer', kind: 'exif', tag: 'Artist', raw: tags.Artist, value: normalizePhotographer(tags.Artist) });
  return immutable(evidence);
}

export function gmlCaptureEvidence(source, entry) {
  const raw = entry.raw?.photographedAtText;
  return raw == null || raw === '' ? [] : immutable([{ id: `${source.id}:${entry.id}:captureTime`, field: 'captureTime', kind: 'gml',
    sourceId: source.id, sourceFilename: source.filename, sourceEntryId: entry.id, raw, value: normalizeCaptureTime(raw) }]);
}
