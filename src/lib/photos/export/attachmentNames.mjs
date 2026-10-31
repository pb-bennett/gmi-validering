const encode = (text) => new TextEncoder().encode(text);
export async function digestHex(value, algorithm = 'SHA-256') {
  if (!globalThis.crypto?.subtle) throw new Error('Eksport krever HTTPS eller localhost for sikker hashing.');
  const bytes = typeof value === 'string' ? encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest(algorithm, bytes))].map((n) => n.toString(16).padStart(2, '0')).join('');
}

// RFC 9562 UUIDv5: fixed DNS namespace + application-specific semantic key.
export async function exportGuid(key) {
  const namespace = Uint8Array.from('6ba7b8109dad11d180b400c04fd430c8'.match(/../g), (n) => parseInt(n, 16));
  const name = encode(`gmi-validator:experimental-photo-export:v1:${key}`);
  const bytes = new Uint8Array(namespace.length + name.length);
  bytes.set(namespace); bytes.set(name, namespace.length);
  const hash = await digestHex(bytes, 'SHA-1');
  const parts = hash.slice(0, 32).split('');
  parts[12] = '5'; parts[16] = ((parseInt(parts[16], 16) & 3) | 8).toString(16);
  const hex = parts.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const compareExportKeys = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fold = (name) => name.normalize('NFC').toUpperCase().toLowerCase();
function safeParts(original) {
  let name = [...original.normalize('NFC')].map((char) => {
    const n = char.codePointAt(0);
    return n < 32 || n === 127 || n === 0xfffe || n === 0xffff || (n >= 0xd800 && n <= 0xdfff) || '<>:"/\\|?*%#'.includes(char) ? '_' : char;
  }).join('').replace(/^[ .]+|[ .]+$/g, '') || 'photo';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : '';
  if (encode(extension).length > 32) throw new Error('Filtypen er for lang for sikker eksport.');
  return { stem: dot > 0 ? name.slice(0, dot) : name, extension };
}
function fitName({ stem, extension }, suffix) {
  const chars = [...stem];
  while (encode(chars.join('') + suffix + extension).length > 180) chars.pop();
  return `${chars.join('') || 'photo'}${suffix}${extension}`;
}
export async function planAttachmentNames(assets) {
  const rows = await Promise.all(assets.map(async (asset) => ({ ...asset, parts: safeParts(asset.originalFilename), hash: await digestHex(asset.assetId), suffixLength: 0 })));
  for (;;) {
    const buckets = new Map();
    for (const row of rows) {
      row.name = fitName(row.parts, row.suffixLength ? `--${row.hash.slice(0, row.suffixLength)}` : '');
      const key = fold(row.name);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(row);
    }
    const collisions = [...buckets.values()].filter((bucket) => bucket.length > 1);
    if (!collisions.length) return rows.map((row) => ({ assetId: row.assetId, filename: row.name, path: `Attachments/${row.name}`, renamed: row.name !== row.originalFilename }));
    for (const bucket of collisions) for (const row of bucket) {
      if (row.suffixLength === 64) throw new Error('Kan ikke lage entydige vedleggsnavn.');
      row.suffixLength = row.suffixLength ? Math.min(64, row.suffixLength + 4) : 12;
    }
  }
}
