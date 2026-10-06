import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'exifr/dist/full.esm.mjs';
import { normalizeExifGps, readExifGps } from '../src/lib/photos/exifGps.mjs';
import { gpsJpeg, gpsPng, noGpsPng } from './helpers/photoGpsFixtures.mjs';
// Actual exifr parser; the byte-reader substitution accounts for Node's missing FileReader.
const read = (bytes, name = 'gps.jpg') => readExifGps(new File([bytes], name), { parse: async (file, options) => parse(new Uint8Array(await file.arrayBuffer()), options) });

for (const littleEndian of [true, false]) test(`actual JPEG parser preserves DMS/ref and handles TIFF endian=${littleEndian}`, async () => {
  const result = await read(gpsJpeg({ littleEndian }));
  assert.equal(result.state, 'viable');
  assert.deepEqual(result.candidate.raw.GPSLatitude, [59, 13, 30.44]);
  assert.equal(result.candidate.raw.GPSLatitudeRef, 'N');
  assert(Math.abs(result.candidate.position.longitude - 10.43555) < 1e-9);
  assert(!('latitude' in result.candidate.raw));
});
test('actual PNG EXIF parsing is viable; genuine no-GPS PNG differs from unsupported WebP', async () => {
  assert.equal((await read(gpsPng(), 'gps.png')).state, 'viable');
  assert.equal((await read(noGpsPng(), 'none.png')).state, 'no-gps');
  assert.equal((await read(Buffer.from('RIFF0000WEBP'), 'preview.webp')).state, 'unsupported-format');
});
test('partial GPS, missing refs, bad rational denominator and explicit unknown datum are invalid', async () => {
  for (const options of [{ partial: true }, { latRef: '?' }, { denominator: 0 }, { datum: 'OSGB36' }]) assert.equal((await read(gpsJpeg(options))).state, 'invalid');
  assert.equal((await read(gpsJpeg({ datum: 'WGS-84' }))).state, 'viable');
});
test('truncated metadata errors are observable rather than absent GPS', async () => {
  const truncated = gpsJpeg().subarray(0, 35);
  assert.equal((await read(truncated)).state, 'error');
  assert.equal((await read(Buffer.from('corrupt'))).state, 'error');
  assert.equal((await readExifGps({ slice() { throw new Error('unreadable'); } })).state, 'error');
});
test('hemisphere refs, finite bounds, optional spatial tags and suspicious zero are preserved', async () => {
  const result = await read(gpsJpeg({ latRef: 'S', lonRef: 'W' }));
  assert(result.candidate.position.latitude < 0 && result.candidate.position.longitude < 0);
  const zero = await read(gpsJpeg({ latitude: [0, 0, 0], longitude: [0, 0, 0] }));
  assert.deepEqual(zero.candidate.issues, ['questionable-zero-gps']);
  const raw = { GPSLatitude: [91, 0, 0], GPSLongitude: [10, 0, 0], GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' };
  assert.equal(normalizeExifGps(raw).state, 'invalid');
  const optional = normalizeExifGps({ ...raw, GPSLatitude: [59, 0, 0], GPSAltitude: 22, GPSAltitudeRef: 0, GPSDOP: 1.2, GPSHPositioningError: 3, DateTimeOriginal: 'ignored', GPSImgDirection: 40 });
  assert.equal(optional.candidate.raw.GPSAltitude, 22);
  assert(!('DateTimeOriginal' in optional.candidate.raw));
  assert(!('GPSImgDirection' in optional.candidate.raw));
});
