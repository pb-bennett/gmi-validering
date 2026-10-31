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

export function normalizePhotographer(input) {
  return typeof input === 'string' ? input.replace(/\s+/gu, ' ').trim() || null : null;
}

export function exifCaptureEvidence(tags = {}) {
  const evidence = [];
  if (tags.DateTimeOriginal !== undefined) {
    const raw = Object.fromEntries(['DateTimeOriginal', 'SubSecTimeOriginal', 'OffsetTimeOriginal'].filter((key) => tags[key] !== undefined).map((key) => [key, tags[key]]));
    const base = typeof tags.DateTimeOriginal === 'string' ? tags.DateTimeOriginal.trim().replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T') : '';
    const sub = tags.SubSecTimeOriginal;
    const offset = tags.OffsetTimeOriginal;
    const validExtras = (sub === undefined || /^\d{1,9}$/.test(String(sub))) && (offset === undefined || /^(Z|[+-]\d{2}:\d{2})$/.test(String(offset)));
    const value = validExtras ? normalizeCaptureTime(`${base}${sub === undefined ? '' : `.${sub}`}${offset === undefined ? '' : offset}`) : null;
    evidence.push({ id: 'exif:captureTime', field: 'captureTime', kind: 'exif', tag: 'DateTimeOriginal', raw, value });
  }
  if (tags.Artist !== undefined) evidence.push({ id: 'exif:photographer', field: 'photographer', kind: 'exif', tag: 'Artist', raw: tags.Artist, value: normalizePhotographer(tags.Artist) });
  return immutable(evidence);
}

export function gmlCaptureEvidence(source, entry) {
  const raw = entry.raw?.photographedAtText;
  return raw == null || raw === '' ? [] : immutable([{ id: `${source.id}:${entry.id}:captureTime`, field: 'captureTime', kind: 'gml',
    sourceId: source.id, sourceFilename: source.filename, sourceEntryId: entry.id, raw, value: normalizeCaptureTime(raw) }]);
}
