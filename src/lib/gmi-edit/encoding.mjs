// Byte characteristics and replacement-value encoding policy for
// source-preserving GMI editing (M1).
//
// The upload path decodes GMI with the WHATWG 'iso-8859-1' label, which is
// windows-1252: every byte maps to exactly one UTF-16 code unit. Offsets in the
// decoded text therefore equal byte offsets, and unchanged bytes are never
// re-encoded (patch.mjs copies original subarrays). Only the replacement value
// of an edited field is encoded here, explicitly, under a strict policy:
//
//   encoding class   editable  replacement characters
//   ascii            yes       U+0020-U+007E, U+00A0-U+00FF (one byte each)
//   single-byte      yes       U+0020-U+007E, U+00A0-U+00FF (one byte each)
//   utf8-likely      yes       U+0020-U+007E only (ASCII never breaks UTF-8)
//   utf8-bom         no        -
//   utf16-bom        no        -
//
// Always rejected: ';' (the only field separator; GMI has no escaping), CR, LF,
// every other C0 control including TAB, DEL, C1 controls U+0080-U+009F and the
// Windows-1252-only printable characters (€, †, ˜ ...), and anything outside
// U+0000-U+00FF. Nothing is normalized, transliterated or silently replaced.
import { decodeGmiBytes } from '../parsing/gmiDecoding.js';

export const GMI_ENCODING_POLICIES = Object.freeze({
  ascii: Object.freeze({ encodingClass: 'ascii', editable: true, latin1: true }),
  'single-byte': Object.freeze({ encodingClass: 'single-byte', editable: true, latin1: true }),
  'utf8-likely': Object.freeze({ encodingClass: 'utf8-likely', editable: true, latin1: false }),
  'utf8-bom': Object.freeze({ encodingClass: 'utf8-bom', editable: false, latin1: false }),
  'utf16-bom': Object.freeze({ encodingClass: 'utf16-bom', editable: false, latin1: false }),
});

let decoderChecked = false;

/**
 * The span index relies on the upload decoder being a 1:1 single-byte decoder
 * that is the identity on U+0000-U+007F and U+00A0-U+00FF. Checked once; a
 * different runtime decoder makes every document read-only instead of wrong.
 */
export function gmiDecoderIsSingleByteIdentity() {
  if (decoderChecked) return decoderChecked === 'ok';
  const all = Uint8Array.from({ length: 256 }, (_, byte) => byte);
  const text = decodeGmiBytes(all);
  let ok = text.length === 256;
  const seen = new Set();
  for (let byte = 0; ok && byte < 256; byte++) {
    const code = text.charCodeAt(byte);
    if (seen.has(code)) ok = false;
    seen.add(code);
    if ((byte < 0x80 || byte >= 0xa0) && code !== byte) ok = false;
  }
  decoderChecked = ok ? 'ok' : 'failed';
  return ok;
}

function isValidUtf8(bytes) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Raw byte characteristics. Pure; does not decode the document.
 * @param {Uint8Array} bytes
 */
export function describeGmiBytes(bytes) {
  let nonAsciiBytes = 0, crlf = 0, lf = 0, cr = 0;
  const c1 = new Set();
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte >= 0x80) nonAsciiBytes++;
    if (byte >= 0x80 && byte <= 0x9f) c1.add(byte);
    if (byte === 0x0d) {
      if (bytes[i + 1] === 0x0a) { crlf++; i++; } else cr++;
    } else if (byte === 0x0a) lf++;
  }
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf8'
    : (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff) ? 'utf16' : null;
  const kinds = [crlf && 'crlf', lf && 'lf', cr && 'cr'].filter(Boolean);
  const eolKind = kinds.length === 0 ? 'none' : kinds.length === 1 ? kinds[0] : 'mixed';
  const last = bytes[bytes.length - 1];
  const encodingClass = bom === 'utf8' ? 'utf8-bom' : bom ? 'utf16-bom'
    : nonAsciiBytes === 0 ? 'ascii' : isValidUtf8(bytes) ? 'utf8-likely' : 'single-byte';
  return Object.freeze({
    size: bytes.length,
    bom,
    encodingClass,
    nonAsciiBytes,
    c1Bytes: Object.freeze([...c1].sort((a, b) => a - b)),
    eol: Object.freeze({ kind: eolKind, crlf, lf, cr, final: last === 0x0a || last === 0x0d }),
  });
}

const reject = (code, detail = {}) => Object.freeze({ ok: false, code, ...detail });

/**
 * Validate one replacement field lexeme and encode it for the document's
 * encoding class. Never throws for bad input; returns a rejection code.
 * @param {string} lexeme exact new lexeme (not trimmed, not coerced)
 * @param {string} encodingClass from describeGmiBytes
 * @returns {{ok: true, bytes: Uint8Array} | {ok: false, code: string, index?: number, codePoint?: number, nfcRepresentable?: boolean}}
 */
export function validateGmiFieldLexeme(lexeme, encodingClass) {
  if (typeof lexeme !== 'string') return reject('lexeme-not-string');
  const policy = GMI_ENCODING_POLICIES[encodingClass];
  if (!policy?.editable) return reject('encoding-not-editable', { encodingClass: String(encodingClass) });
  if (!gmiDecoderIsSingleByteIdentity()) return reject('decoder-not-single-byte');
  const bytes = new Uint8Array(lexeme.length);
  for (let index = 0; index < lexeme.length; index++) {
    const code = lexeme.charCodeAt(index);
    if (code === 0x3b) return reject('lexeme-semicolon', { index });
    if (code === 0x0a || code === 0x0d) return reject('lexeme-line-break', { index });
    if (code < 0x20 || code === 0x7f) return reject('lexeme-control-character', { index, codePoint: code });
    if (code < 0x7f) { bytes[index] = code; continue; }
    if (!policy.latin1) return reject('lexeme-non-ascii-in-utf8', { index, codePoint: lexeme.codePointAt(index) });
    if (code <= 0x9f) return reject('lexeme-c1-control', { index, codePoint: code });
    if (code <= 0xff) { bytes[index] = code; continue; }
    const codePoint = lexeme.codePointAt(index);
    const normalized = lexeme.normalize('NFC');
    const nfcRepresentable = normalized !== lexeme && validateGmiFieldLexeme(normalized, encodingClass).ok;
    return reject('lexeme-unrepresentable', { index, codePoint, nfcRepresentable });
  }
  return Object.freeze({ ok: true, bytes });
}

/**
 * Validate raw replacement bytes (for applyGmiPatches): they must be exactly
 * the encoding of a lexeme that validateGmiFieldLexeme accepts.
 */
export function validateGmiReplacementBytes(bytes, encodingClass) {
  if (!(bytes instanceof Uint8Array)) return reject('replacement-not-bytes');
  const lexeme = decodeGmiBytes(bytes);
  const result = validateGmiFieldLexeme(lexeme, encodingClass);
  if (!result.ok) return result;
  if (result.bytes.length !== bytes.length || result.bytes.some((byte, i) => byte !== bytes[i])) return reject('replacement-not-canonical');
  return Object.freeze({ ok: true, bytes: result.bytes, lexeme });
}

/**
 * Whether an edited output may carry this encoding class, given the source's.
 * A single-byte or ASCII source must not become valid multibyte UTF-8 (a
 * reader that sniffs encodings would then see different characters); a UTF-8
 * source must stay valid UTF-8. BOM state is checked separately.
 */
export function gmiEncodingClassTransitionAllowed(sourceClass, outputClass) {
  if (sourceClass === outputClass) return true;
  if (sourceClass === 'ascii') return outputClass === 'single-byte';
  if (sourceClass === 'single-byte') return outputClass === 'ascii';
  if (sourceClass === 'utf8-likely') return outputClass === 'ascii';
  return false;
}
