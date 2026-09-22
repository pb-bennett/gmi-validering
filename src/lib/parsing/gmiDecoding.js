export const GMI_CANONICAL_ENCODING = 'iso-8859-1';

/** Decode GMI bytes exactly as the browser upload path does. */
export function decodeGmiBytes(bytes) {
  return new TextDecoder(GMI_CANONICAL_ENCODING).decode(bytes);
}
