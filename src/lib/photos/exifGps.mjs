import { immutable } from './photoSpatial.mjs';

const TAGS = ['GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef', 'GPSMapDatum', 'GPSAltitude', 'GPSAltitudeRef', 'GPSDOP', 'GPSHPositioningError'];
const OPTIONS = {
  tiff: true, ifd0: { pick: [0x8825] }, ifd1: false, exif: false, gps: { pick: TAGS },
  xmp: false, icc: false, iptc: false, jfif: false, ihdr: false,
  makerNote: false, userComment: false, interop: false,
  translateKeys: true, translateValues: false, reviveValues: false,
  sanitize: false, mergeOutput: true, silentErrors: false, chunked: true,
};

export function normalizeExifGps(tags = {}) {
  const raw = immutable(Object.fromEntries(TAGS.filter((key) => tags[key] !== undefined).map((key) => [key, tags[key]])));
  if (!Object.keys(raw).length) return immutable({ state: 'no-gps', errorCode: null, candidate: null });
  const invalid = (errorCode) => immutable({ state: 'invalid', errorCode, candidate: { status: 'invalid', position: null, raw, errorCode } });
  const dms = (value, ref, positive, negative, limit) => {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)
      || value[0] < 0 || value[0] > limit || value[1] < 0 || value[1] >= 60 || value[2] < 0 || value[2] >= 60
      || ![positive, negative].includes(ref)) return null;
    const result = value[0] + value[1] / 60 + value[2] / 3600;
    return result <= limit ? result * (ref === negative ? -1 : 1) : null;
  };
  const latitude = dms(raw.GPSLatitude, raw.GPSLatitudeRef, 'N', 'S', 90);
  const longitude = dms(raw.GPSLongitude, raw.GPSLongitudeRef, 'E', 'W', 180);
  if (latitude === null || longitude === null) return invalid('invalid-gps-pair');
  if (raw.GPSMapDatum !== undefined && typeof raw.GPSMapDatum !== 'string') return invalid('unsupported-gps-datum');
  const datum = raw.GPSMapDatum?.trim();
  if (datum && !/^WGS\s*[-_]?\s*84$/i.test(datum)) return invalid('unsupported-gps-datum');
  return immutable({
    state: 'viable', errorCode: null,
    candidate: {
      status: 'viable', raw, position: { crs: 'EPSG:4326', longitude, latitude },
      issues: latitude === 0 && longitude === 0 ? ['questionable-zero-gps'] : [],
      crsResolution: { sourceCrs: 'EPSG:4326', explicitDatum: datum || null, method: datum ? 'explicit-gps-datum' : 'exif-gps-map-assumption' },
    },
  });
}

export async function readExifGps(file, { parse } = {}) {
  try {
    // Header detection prevents a MIME/extension mismatch from promising another container.
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    if (!jpeg && !png) {
      const supportedName = /\.(jpe?g|png)$/i.test(file.name || '') || ['image/jpeg', 'image/png'].includes(file.type);
      return immutable({ state: supportedName ? 'error' : 'unsupported-format', errorCode: supportedName ? 'invalid-image-header' : 'unsupported-gps-format', candidate: null });
    }
    const reader = parse || (await import('exifr/dist/full.esm.mjs')).parse;
    return normalizeExifGps(await reader(file, OPTIONS));
  } catch {
    return immutable({ state: 'error', errorCode: 'gps-read-failed', candidate: null });
  }
}

export function exifGpsMessage(state, errorCode) {
  if (state === 'skipped-duplicate') return 'GPS leses bare hvis bildet legges til likevel.';
  if (errorCode === 'unsupported-gps-datum') return 'GPS har et koordinatsystem som ikke støttes.';
  return ({ pending: 'Leser EXIF GPS …', viable: 'EXIF GPS er tilgjengelig som kandidat.', 'no-gps': 'Ingen EXIF GPS funnet.', invalid: 'Ugyldige eller ufullstendige GPS-data.', error: 'GPS-data kunne ikke leses.', 'unsupported-format': 'GPS-lesing støttes foreløpig for JPEG og PNG.' })[state] || 'GPS-status er ukjent.';
}
