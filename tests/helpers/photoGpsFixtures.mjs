// Small synthetic containers, independent from the real/private photo corpus.
export function gpsTiff({ littleEndian = true, latitude = [59, 13, 30.44], longitude = [10, 26, 7.98], latRef = 'N', lonRef = 'E', datum, denominator = 1000000, partial = false, captureTime, artist, subsecond, offsetTime } = {}) {
  const fields = [
    [1, 2, 2, Buffer.from(`${latRef}\0`)],
    [2, 5, 3, latitude],
    ...(!partial ? [[3, 2, 2, Buffer.from(`${lonRef}\0`)], [4, 5, 3, longitude]] : []),
    ...(datum ? [[18, 2, datum.length + 1, Buffer.from(`${datum}\0`)]] : []),
  ];
  const data = Buffer.alloc(2048);
  const short = (offset, value) => littleEndian ? data.writeUInt16LE(value, offset) : data.writeUInt16BE(value, offset);
  const long = (offset, value) => littleEndian ? data.writeUInt32LE(value, offset) : data.writeUInt32BE(value, offset);
  data.write(littleEndian ? 'II' : 'MM'); short(2, 42); long(4, 8);
  const extras = [[0x9003, captureTime], [0x9291, subsecond], [0x9011, offsetTime]].filter(([, value]) => value !== undefined);
  const ifdCount = 1 + (artist !== undefined ? 1 : 0) + (extras.length ? 1 : 0);
  const gpsStart = 8 + 2 + ifdCount * 12 + 4;
  const exifStart = gpsStart + 2 + fields.length * 12 + 4;
  let tail = exifStart + (extras.length ? 2 + extras.length * 12 + 4 : 0);
  const ascii = (at, tag, value) => {
    const bytes = Buffer.from(`${value}\0`); short(at, tag); short(at + 2, 2); long(at + 4, bytes.length);
    if (bytes.length <= 4) bytes.copy(data, at + 8);
    else { long(at + 8, tail); bytes.copy(data, tail); tail += bytes.length; }
  };
  short(8, ifdCount); short(10, 0x8825); short(12, 4); long(14, 1); long(18, gpsStart);
  let next = 22;
  if (artist !== undefined) { ascii(next, 0x013b, artist); next += 12; }
  if (extras.length) {
    short(next, 0x8769); short(next + 2, 4); long(next + 4, 1); long(next + 8, exifStart);
    short(exifStart, extras.length);
    extras.forEach(([tag, value], index) => ascii(exifStart + 2 + index * 12, tag, value));
  }
  short(gpsStart, fields.length);
  fields.forEach(([tag, type, count, value], index) => {
    const offset = gpsStart + 2 + index * 12;
    short(offset, tag); short(offset + 2, type); long(offset + 4, count);
    if (type === 2 && count <= 4) value.copy(data, offset + 8);
    else {
      long(offset + 8, tail);
      if (type === 2) { value.copy(data, tail); tail += count; }
      else { value.forEach((item) => { long(tail, Math.round(item * 1000000)); long(tail + 4, denominator); tail += 8; }); }
    }
  });
  return data.subarray(0, tail);
}

export function gpsJpeg(options) {
  const payload = Buffer.concat([Buffer.from('Exif\0\0'), gpsTiff(options)]);
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]); header.writeUInt16BE(payload.length + 2, 4);
  return Buffer.concat([header, payload, Buffer.from([0xff, 0xd9])]);
}

export const noGpsPng = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS3cAAAAASUVORK5CYII=', 'base64');

export function gpsPng(options) {
  const payload = gpsTiff(options), name = Buffer.from('eXIf');
  const head = Buffer.alloc(4); head.writeUInt32BE(payload.length);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, payload])) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  const png = noGpsPng();
  return Buffer.concat([png.subarray(0, 33), head, name, payload, checksum, png.subarray(33)]);
}
