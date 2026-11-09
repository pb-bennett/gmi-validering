// Immutable GMI source document for source-preserving editing (M1).
//
// A document owns a private copy of the original bytes for its whole life.
// Callers never receive the internal buffer: getGmiSourceBytes returns a copy,
// and patch.mjs builds output by concatenating subarrays of the private copy
// with explicitly encoded replacement bytes. There is no serializer.
//
// Every document is readable. It is editable only when:
// - it is at most MAX_GMI_EDIT_BYTES and the decoder is 1 char per byte;
// - the production GMIParser accepts it with no errors;
// - the span index reconciles with every parser lexeme (sourceIndex.mjs);
// - no file-level fail-closed rule applies (BOM, CR-only or mixed EOL,
//   repeated L/P section or _FIELDNAMES, numeric _INDEX, non-exact signature
//   line, an encoding class without an edit policy);
// - every parser warning is accounted for: field_shape warnings belong to
//   indexed over-long objects (those objects are not editable), and coordinate
//   warnings belong to indexed malformed vertex lines (editing allowed; the
//   post-edit verifier requires those lines byte-identical and the warnings
//   unchanged). Any other warning keeps the document read-only.
import { GMIParser } from '../parsing/gmiParser.js';
import { decodeGmiBytes } from '../parsing/gmiDecoding.js';
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';
import { GMI_ENCODING_POLICIES, describeGmiBytes, gmiDecoderIsSingleByteIdentity } from './encoding.mjs';
import { GMI_GEOMETRY_SCOPES, gmiCellSpans, gmiObjectIssues, indexGmiSourceText, reconcileGmiSourceIndex } from './sourceIndex.mjs';

export const MAX_GMI_EDIT_BYTES = 10 * 1024 * 1024;

export const GMI_SOURCE_STATUS = Object.freeze({
  RECONCILED: 'reconciled',
  UNSUPPORTED: 'unsupported',
  NOT_RECONCILABLE: 'not-reconcilable',
  PARSER_ERROR: 'parser-error',
  TOO_LARGE: 'too-large',
});

const states = new WeakMap();

// Non-cryptographic integrity token (FNV-1a 32 + length). Detects accidental
// mutation of the private buffer before every apply and verification.
export function gmiBytesIntegrity(bytes) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${bytes.length}:${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Same identity format as gmiSourceFingerprint (photos/gmiPhotoSource.mjs):
 * `sha256:<hex>` with WebCrypto, otherwise `exact-bytes:<hex>`. A parity test
 * keeps the two in step so FOTO and editing share document identity.
 */
export async function computeGmiSourceFingerprint(bytes) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  return `exact-bytes:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value) || ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

// The document's own parser: never shared with a layer (the upload path writes
// assumed CRS into its parser's header). Its results are frozen after parsing.
function freezeParserResult(parser) {
  for (const key of ['header', 'points', 'linesParsed', 'warnings', 'warningSummary', 'errors', 'lineFieldNames', 'pointFieldNames', 'lines']) {
    deepFreeze(parser[key]);
  }
  return parser;
}

function toBytes(input) {
  if (input instanceof Uint8Array) return Uint8Array.from(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  if (ArrayBuffer.isView(input)) return Uint8Array.from(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
  throw new TypeError('createGmiSourceDocument expects a Uint8Array, ArrayBuffer or typed array view');
}

function fileLevelReasons(encoding, index) {
  const reasons = [];
  if (encoding.bom) reasons.push('bom');
  if (encoding.eol.kind === 'mixed') reasons.push('mixed-eol');
  if (encoding.eol.kind === 'cr') reasons.push('cr-only-eol');
  if (!GMI_ENCODING_POLICIES[encoding.encodingClass]?.editable) reasons.push('encoding-not-editable');
  if (!index.signatureExact) reasons.push('nonstandard-signature-line');
  if (index.numericIndexHeader) reasons.push('numeric-index-header');
  for (const { scope } of GMI_GEOMETRY_SCOPES) {
    if (index.definitionSections[scope].length > 1 || index.dataSections[scope].length > 1) reasons.push('repeated-section');
    // More _FIELDNAMES lines than definition sections: one section has several
    // (the parser keeps the last). Repeated sections are reported above.
    if (index.fieldNameLines[scope].length > Math.max(1, index.definitionSections[scope].length)) reasons.push('repeated-fieldnames');
  }
  return reasons;
}

// Per-field editability inside an editable object.
function cellRecords(object, issues) {
  const active = object.fieldValueLines.at(-1);
  const counts = new Map();
  for (const name of object.fieldNames) counts.set(name, (counts.get(name) || 0) + 1);
  return object.fieldNames.map((field, position) => {
    const span = active && position < active.spans.length ? active.spans[position] : null;
    let reason = null;
    if (issues.length) reason = 'object-not-editable';
    else if (field === '') reason = 'unnamed-field';
    else if (counts.get(field) > 1) reason = 'duplicate-field-name';
    else if (position === 0 && !active.separator) reason = 'no-value-separator';
    return { field, position, line: active ? active.line : null, start: span?.[0] ?? null, end: span?.[1] ?? null, reason };
  });
}

function buildDocument(input, { filename = null, fingerprint = null } = {}) {
  const bytes = toBytes(input);
  const encoding = describeGmiBytes(bytes);
  const state = { bytes, integrity: gmiBytesIntegrity(bytes), text: null, parser: null, index: null, objects: { point: [], line: [] }, cellsByStart: new Map() };
  const reasons = [], mismatches = [];
  let status, counts = null;

  const finish = () => {
    const document = Object.freeze({
      kind: 'gmi-source-document',
      filename: filename == null ? null : String(filename),
      size: bytes.length,
      fingerprint,
      encoding,
      status,
      editable: status === GMI_SOURCE_STATUS.RECONCILED,
      reasons: Object.freeze([...new Set(reasons)]),
      mismatches: Object.freeze(mismatches),
      counts: counts && Object.freeze(counts),
      parser: state.parser,
    });
    states.set(document, state);
    return document;
  };

  if (bytes.length > MAX_GMI_EDIT_BYTES) { status = GMI_SOURCE_STATUS.TOO_LARGE; reasons.push('too-large'); return finish(); }
  const text = decodeGmiBytes(bytes);
  state.text = text;
  if (text.length !== bytes.length || !gmiDecoderIsSingleByteIdentity()) {
    status = GMI_SOURCE_STATUS.NOT_RECONCILABLE;
    reasons.push('decoded-length-mismatch');
    return finish();
  }
  let parser;
  try { parser = new GMIParser(text); } catch {
    status = GMI_SOURCE_STATUS.PARSER_ERROR; reasons.push('parser-throws'); return finish();
  }
  state.parser = freezeParserResult(parser);
  if (parser.errors.length) { status = GMI_SOURCE_STATUS.PARSER_ERROR; reasons.push('parser-errors'); return finish(); }

  const index = indexGmiSourceText(text);
  state.index = index;
  const reconciliation = reconcileGmiSourceIndex({ text, parser, index });
  mismatches.push(...reconciliation.mismatches);

  let nonEditableObjects = 0, editableCells = 0;
  for (const { scope } of GMI_GEOMETRY_SCOPES) {
    for (const object of index.objects[scope]) {
      const issues = gmiObjectIssues(object);
      if (issues.length) nonEditableObjects++;
      const cells = cellRecords(object, issues);
      state.objects[scope].push(Object.freeze({ object, issues: Object.freeze(issues), cells, spans: gmiCellSpans(object) }));
    }
  }
  counts = {
    points: parser.points.length,
    lines: parser.linesParsed.length,
    lexemes: reconciliation.lexemes,
    nonEditableObjects,
    editableCells: 0,
    fieldShapeWarnings: reconciliation.warnings.fieldShape,
    coordinateWarnings: reconciliation.warnings.coordinate,
    malformedCoordinateLines: index.predictedWarnings.filter((warning) => warning.warningClass === 'coordinate').length,
    unaccountedWarnings: reconciliation.warnings.unaccounted,
    unaccountedWarningClasses: Object.freeze(reconciliation.warnings.unaccountedClasses),
  };
  if (mismatches.length) { status = GMI_SOURCE_STATUS.NOT_RECONCILABLE; reasons.push('reconciliation-failed'); return finish(); }

  reasons.push(...fileLevelReasons(encoding, index));
  if (reconciliation.warnings.unaccounted) reasons.push('parser-warnings');
  status = reasons.length ? GMI_SOURCE_STATUS.UNSUPPORTED : GMI_SOURCE_STATUS.RECONCILED;
  if (status === GMI_SOURCE_STATUS.RECONCILED) {
    for (const { scope } of GMI_GEOMETRY_SCOPES) {
      state.objects[scope].forEach((record, sourceIndex) => {
        for (const cell of record.cells) {
          if (cell.reason || cell.start === null) continue;
          editableCells++;
          state.cellsByStart.set(cell.start, Object.freeze({ scope, sourceIndex, ...cell }));
        }
      });
    }
    counts.editableCells = editableCells;
  }
  return finish();
}

/**
 * Create a source document synchronously. `fingerprint` is null unless
 * supplied by loadGmiSourceDocument. Never throws for GMI content problems;
 * the returned document is read-only with reasons instead.
 * @param {Uint8Array|ArrayBuffer} bytes original file bytes (copied)
 * @param {{filename?: string}} [options]
 */
export function createGmiSourceDocument(bytes, { filename = null } = {}) {
  return buildDocument(bytes, { filename });
}

/** Create a source document with its SHA-256 source fingerprint. */
export async function loadGmiSourceDocument(bytes, { filename = null } = {}) {
  const copy = toBytes(bytes);
  const fingerprint = await computeGmiSourceFingerprint(copy);
  return buildDocument(copy, { filename, fingerprint });
}

export const isGmiSourceDocument = (value) => states.has(value);

/** A fresh copy of the exact original bytes (never the internal buffer). */
export function getGmiSourceBytes(document) {
  return Uint8Array.from(internalGmiSourceState(document).bytes);
}

/** The decoded text exactly as the upload path decodes it (null if too large). */
export function getGmiSourceText(document) {
  return internalGmiSourceState(document).text;
}

/**
 * Internal state for the sibling gmi-edit modules (patch, verify, targets).
 * Not part of the public API; never hand the returned buffer to callers.
 */
export function internalGmiSourceState(document) {
  const state = states.get(document);
  if (!state) throw new TypeError('not a GMI source document');
  return state;
}

/** False if the private buffer no longer matches its load-time integrity token. */
export function gmiSourceIntact(document) {
  const state = internalGmiSourceState(document);
  return gmiBytesIntegrity(state.bytes) === state.integrity;
}

/** Frozen copy of the parser's source lexemes for one object (or null). */
export function gmiObjectLexemes(document, scope, sourceIndex) {
  const parser = internalGmiSourceState(document).parser;
  const config = GMI_GEOMETRY_SCOPES.find((entry) => entry.scope === scope);
  const object = config && parser?.[config.collection]?.[sourceIndex];
  const lexemes = object?.attributes?.[GMI_SOURCE_LEXEMES];
  return lexemes ? Object.freeze({ ...lexemes }) : null;
}
