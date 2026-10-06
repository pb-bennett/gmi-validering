// Small synthetic containers, independent from the real/private photo corpus.
export function gpsTiff({ littleEndian = true, latitude = [59, 13, 30.44], longitude = [10, 26, 7.98], latRef = 'N', lonRef = 'E', datum, denominator = 1000000, partial = false } = {}) {
  const fields = [
    [1, 2, 2, Buffer.from(`${latRef}\0`)],
    [2, 5, 3, latitude],
    ...(!partial ? [[3, 2, 2, Buffer.from(`${lonRef}\0`)], [4, 5, 3, longitude]] : []),
    ...(datum ? [[18, 2, datum.length + 1, Buffer.from(`${datum}\0`)]] : []),
  ];
  const data = Buffer.alloc(512);
  const short = (offset, value) => littleEndian ? data.writeUInt16LE(value, offset) : data.writeUInt16BE(value, offset);
  const long = (offset, value) => littleEndian ? data.writeUInt32LE(value, offset) : data.writeUInt32BE(value, offset);
  data.write(littleEndian ? 'II' : 'MM'); short(2, 42); long(4, 8);
  short(8, 1); short(10, 0x8825); short(12, 4); long(14, 1); long(18, 26); long(22, 0);
  short(26, fields.length);
  let tail = 26 + 2 + fields.length * 12 + 4;
  fields.forEach(([tag, type, count, value], index) => {
    const offset = 28 + index * 12;
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
