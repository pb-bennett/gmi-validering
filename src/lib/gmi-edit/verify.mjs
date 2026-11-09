// Independent post-edit verification for source-preserving GMI editing (M1).
//
// verifyGmiEdit(document, outputBytes, changes) decides whether outputBytes is
// exactly the source with the intended field changes and nothing else. It does
// not trust the patch engine or its patches: it works from the immutable
// source, the intended (target, lexeme) list and the output bytes alone.
//
//   1. byte containment   walk source and output in step; bytes outside the
//                         intended cell spans must be identical and in order,
//                         and each intended span must hold the encoded lexeme.
//   2. line/field level   split both on LF bytes; same line count; untouched
//                         lines and every EOL byte-identical; on edited lines
//                         the prefix up to the value region and every untargeted
//                         ';'-separated segment byte-identical.
//   3. reparse            the production GMIParser on the decoded output must
//                         give no errors, identical warnings (text, order and
//                         class counts), header, field names, object counts,
//                         ids, types, GUIDs, extents and coordinates; every
//                         untargeted lexeme and value unchanged; every target
//                         exactly the new lexeme.
//   4. structure          the output, loaded as a new source document, must be
//                         editable, reconcile, keep the indexed section, object,
//                         _FIELDVALUES, coordinate and malformed-coordinate line
//                         structure, EOL counts, BOM state and an allowed
//                         encoding class.
//   5. malformed vertices every malformed coordinate line that the parser warns
//                         about is byte-identical (no repair or normalization).
//
// Any failure rejects the output. Failure records carry codes, cell keys and
// line numbers only, never file content.
import { GMIParser } from '../parsing/gmiParser.js';
import { decodeGmiBytes } from '../parsing/gmiDecoding.js';
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';
import { gmiEncodingClassTransitionAllowed, validateGmiFieldLexeme } from './encoding.mjs';
import { GMI_SOURCE_STATUS, createGmiSourceDocument, gmiSourceIntact, internalGmiSourceState } from './sourceDocument.mjs';
import { GMI_GEOMETRY_SCOPES } from './sourceIndex.mjs';
import { resolveGmiCell } from './targets.mjs';

const MARKER = Uint8Array.from('_FIELDVALUES', (char) => char.charCodeAt(0));

// Plain-data deep equality (browser-safe; no node:util).
export function gmiDeepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let k = 0; k < keysA.length; k++) {
    if (keysA[k] !== keysB[k]) return false;
    if (!gmiDeepEqual(a[keysA[k]], b[keysB[k]])) return false;
  }
  return true;
}

function rangeEqual(a, aStart, b, bStart, length) {
  if (length < 0 || aStart + length > a.length || bStart + length > b.length) return false;
  for (let i = 0; i < length; i++) if (a[aStart + i] !== b[bStart + i]) return false;
  return true;
}

function bytesEqual(a, b) {
  return a.length === b.length && rangeEqual(a, 0, b, 0, a.length);
}

// LF-terminated byte lines: content excludes the EOL (CRLF or LF).
function byteLines(bytes) {
  const lines = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === 0x0a) {
      const hasLf = i < bytes.length;
      const contentEnd = hasLf && i > start && bytes[i - 1] === 0x0d ? i - 1 : i;
      lines.push({ start, contentEnd, end: hasLf ? i + 1 : i });
      start = i + 1;
      if (!hasLf) break;
    }
  }
  return lines;
}

function indexOfBytes(bytes, from, to, needle) {
  outer: for (let i = from; i + needle.length <= to; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

// Byte-level _FIELDVALUES segmentation (independent of the text index).
function fieldSegments(bytes, line) {
  const marker = indexOfBytes(bytes, line.start, line.contentEnd, MARKER);
  if (marker < 0) return null;
  let region = marker + MARKER.length;
  if (region < line.contentEnd && (bytes[region] === 0x20 || bytes[region] === 0x09)) region++;
  const segments = [];
  let cursor = region;
  for (let i = region; i <= line.contentEnd; i++) {
    if (i === line.contentEnd || bytes[i] === 0x3b) { segments.push([cursor, i]); cursor = i + 1; }
  }
  return { region, segments };
}

function structureSignature(index) {
  const objects = {};
  for (const { scope } of GMI_GEOMETRY_SCOPES) {
    objects[scope] = index.objects[scope].map((object) => ({
      headerLine: object.headerLine,
      xyzLine: object.xyzLine,
      fieldNames: [...object.fieldNames],
      fieldValueLines: object.fieldValueLines.map((entry) => ({ line: entry.line, separator: entry.separator, spans: entry.spans.length })),
      coordinateLines: [...object.coordinateLines],
      malformedCoordinateLines: [...object.malformedCoordinateLines],
    }));
  }
  return {
    lineCount: index.lineCount,
    signatureExact: index.signatureExact,
    headerEnd: index.headerEnd,
    definitionSections: index.definitionSections,
    dataSections: index.dataSections,
    fieldNameLines: index.fieldNameLines,
    predictedWarnings: index.predictedWarnings.map((warning) => ({ warningClass: warning.warningClass, line: warning.line })),
    objects,
  };
}

const lexemesOf = (object) => object.attributes?.[GMI_SOURCE_LEXEMES] || {};

/**
 * @param {object} document source GmiSourceDocument (must be editable)
 * @param {Uint8Array} output candidate edited bytes
 * @param {Array<{target: {scope, sourceIndex, field}, lexeme: string}>} changes intended changes
 * @returns {{ok: boolean, failures: object[], summary: object, outputDocument: object|null}}
 */
export function verifyGmiEdit(document, output, changes) {
  const failures = [];
  const fail = (code, detail = {}) => failures.push(Object.freeze({ code, ...detail }));
  const done = (outputDocument = null, summary = {}) => {
    const unique = [];
    const seen = new Set();
    for (const failure of failures) {
      const key = JSON.stringify(failure);
      if (!seen.has(key)) { seen.add(key); unique.push(failure); }
    }
    return Object.freeze({ ok: unique.length === 0, failures: Object.freeze(unique), summary: Object.freeze(summary), outputDocument: unique.length ? null : outputDocument });
  };

  const state = internalGmiSourceState(document);
  if (!document.editable) { fail('document-not-editable'); return done(); }
  if (!gmiSourceIntact(document)) { fail('source-bytes-mutated'); return done(); }
  if (!(output instanceof Uint8Array)) { fail('output-not-bytes'); return done(); }
  if (!Array.isArray(changes)) { fail('invalid-changes'); return done(); }
  const source = state.bytes;

  // Intended cells, resolved and encoded independently of any patch.
  const cells = [];
  const keys = new Set();
  changes.forEach((change, changeIndex) => {
    const resolved = resolveGmiCell(document, change?.target);
    if (!resolved.ok) { fail('change-target-invalid', { changeIndex, reason: resolved.code }); return; }
    const encoded = validateGmiFieldLexeme(change.lexeme, document.encoding.encodingClass);
    if (!encoded.ok) { fail('change-lexeme-invalid', { changeIndex, reason: encoded.code }); return; }
    if (keys.has(resolved.cell.key)) { fail('change-duplicate-target', { changeIndex }); return; }
    keys.add(resolved.cell.key);
    cells.push({ ...resolved.cell, next: change.lexeme, bytes: encoded.bytes });
  });
  if (failures.length) return done();
  cells.sort((a, b) => a.start - b.start);

  // 1. Byte containment.
  let s = 0, o = 0;
  for (const cell of cells) {
    if (!rangeEqual(source, s, output, o, cell.start - s)) fail('byte-outside-target-changed');
    o += cell.start - s;
    if (!rangeEqual(cell.bytes, 0, output, o, cell.bytes.length)) fail('target-bytes-wrong', { cell: cell.key });
    o += cell.bytes.length;
    s = cell.end;
  }
  if (source.length - s !== output.length - o || !rangeEqual(source, s, output, o, source.length - s)) fail('byte-outside-target-changed');

  // 2. Line and field level.
  const sourceLines = byteLines(source), outputLines = byteLines(output);
  const cellsByLine = new Map();
  for (const cell of cells) {
    if (!cellsByLine.has(cell.line)) cellsByLine.set(cell.line, []);
    cellsByLine.get(cell.line).push(cell);
  }
  const lineBytes = (bytes, line) => bytes.subarray(line.start, line.end);
  const eolBytes = (bytes, line) => bytes.subarray(line.contentEnd, line.end);
  if (sourceLines.length !== outputLines.length) fail('line-count-changed');
  else {
    sourceLines.forEach((line, number) => {
      const out = outputLines[number];
      const targets = cellsByLine.get(number);
      if (!targets) {
        if (!bytesEqual(lineBytes(source, line), lineBytes(output, out))) fail('unpatched-line-changed', { line: number + 1 });
        return;
      }
      if (!bytesEqual(eolBytes(source, line), eolBytes(output, out))) fail('eol-changed', { line: number + 1 });
      const before = fieldSegments(source, line), after = fieldSegments(output, out);
      if (!before || !after) { fail('fieldvalues-line-structure-changed', { line: number + 1 }); return; }
      if (before.region - line.start !== after.region - out.start || !rangeEqual(source, line.start, output, out.start, before.region - line.start)) {
        fail('fieldvalues-prefix-changed', { line: number + 1 });
      }
      if (before.segments.length !== after.segments.length) { fail('field-count-changed', { line: number + 1 }); return; }
      const byPosition = new Map(targets.map((cell) => [cell.position, cell]));
      before.segments.forEach(([start, end], position) => {
        const [outStart, outEnd] = after.segments[position];
        const was = source.subarray(start, end), now = output.subarray(outStart, outEnd);
        const cell = byPosition.get(position);
        if (!cell) { if (!bytesEqual(was, now)) fail('untargeted-segment-changed', { line: number + 1, position }); return; }
        if (start !== cell.start || end !== cell.end) fail('target-span-mismatch', { cell: cell.key });
        if (!bytesEqual(now, cell.bytes)) fail('target-segment-wrong', { cell: cell.key });
      });
    });
  }

  // 3. Reparse against the frozen source parser result.
  const baseline = state.parser;
  let reparsed = null;
  try { reparsed = new GMIParser(decodeGmiBytes(output)); } catch { fail('reparse-throws'); }
  if (reparsed) {
    if (reparsed.errors.length) fail('reparse-errors');
    if (!gmiDeepEqual(reparsed.warnings, baseline.warnings)) fail('warnings-changed');
    if (!gmiDeepEqual(reparsed.warningSummary, baseline.warningSummary)) fail('warning-summary-changed');
    if (!gmiDeepEqual(reparsed.header, baseline.header)) fail('header-changed');
    if (!gmiDeepEqual(reparsed.lineFieldNames, baseline.lineFieldNames) || !gmiDeepEqual(reparsed.pointFieldNames, baseline.pointFieldNames)) fail('field-names-changed');
    const targets = new Map(cells.map((cell) => [cell.key, cell]));
    for (const { scope, collection } of GMI_GEOMETRY_SCOPES) {
      const was = baseline[collection], now = reparsed[collection];
      if (was.length !== now.length) { fail('object-count-changed', { scope }); continue; }
      was.forEach((object, sourceIndex) => {
        const next = now[sourceIndex];
        if (!Object.is(object.id, next.id) || object.type !== next.type || object.guid !== next.guid) fail('object-identity-changed', { scope, sourceIndex });
        if (object.extent !== next.extent) fail('object-extent-changed', { scope, sourceIndex });
        if (!gmiDeepEqual(object.coordinates, next.coordinates)) fail('geometry-changed', { scope, sourceIndex });
        if (!gmiDeepEqual(Object.keys(object.attributes), Object.keys(next.attributes))) fail('attribute-keys-changed', { scope, sourceIndex });
        const lexemesWas = lexemesOf(object), lexemesNow = lexemesOf(next);
        if (!gmiDeepEqual(Object.keys(lexemesWas), Object.keys(lexemesNow))) { fail('field-set-changed', { scope, sourceIndex }); return; }
        for (const field of Object.keys(lexemesWas)) {
          const key = JSON.stringify([scope, sourceIndex, field]);
          const target = targets.get(key);
          if (target) {
            if (lexemesNow[field] !== target.next) fail('target-lexeme-wrong', { cell: key });
          } else {
            if (lexemesNow[field] !== lexemesWas[field]) fail('untargeted-lexeme-changed', { cell: key });
            if (!gmiDeepEqual(object.attributes[field], next.attributes[field])) fail('untargeted-value-changed', { cell: key });
          }
        }
      });
    }
  }

  // 4. Structure of the output as a new source document.
  let outputDocument = null;
  if (reparsed && !reparsed.errors.length) {
    outputDocument = createGmiSourceDocument(output, { filename: document.filename });
    if (outputDocument.status !== GMI_SOURCE_STATUS.RECONCILED) {
      fail('output-not-editable', { status: outputDocument.status, reasons: [...outputDocument.reasons] });
    } else {
      const outputState = internalGmiSourceState(outputDocument);
      if (!gmiDeepEqual(structureSignature(outputState.index), structureSignature(state.index))) fail('structure-changed');
      const was = document.encoding, now = outputDocument.encoding;
      if (was.bom !== now.bom) fail('bom-changed');
      if (!gmiDeepEqual(was.eol, now.eol)) fail('eol-changed');
      if (!gmiEncodingClassTransitionAllowed(was.encodingClass, now.encodingClass)) fail('encoding-class-drift', { from: was.encodingClass, to: now.encodingClass });
      const { counts: a } = document, { counts: b } = outputDocument;
      for (const key of ['points', 'lines', 'lexemes', 'nonEditableObjects', 'editableCells', 'fieldShapeWarnings', 'coordinateWarnings', 'malformedCoordinateLines']) {
        if (a[key] !== b[key]) fail('structure-changed', { count: key });
      }
    }
  }

  // 5. Malformed coordinate lines are byte-identical.
  let malformedLines = 0;
  if (sourceLines.length === outputLines.length) {
    for (const { scope } of GMI_GEOMETRY_SCOPES) {
      for (const object of state.index.objects[scope]) {
        for (const line of object.malformedCoordinateLines) {
          malformedLines++;
          if (!bytesEqual(lineBytes(source, sourceLines[line]), lineBytes(output, outputLines[line]))) fail('malformed-coordinate-line-changed', { line: line + 1 });
        }
      }
    }
  }

  if (!gmiSourceIntact(document)) fail('source-bytes-mutated');
  return done(outputDocument, {
    changedCells: cells.filter((cell) => cell.next !== cell.lexeme).length,
    targetedCells: cells.length,
    linesTouched: cellsByLine.size,
    byteDelta: output.length - source.length,
    malformedCoordinateLinesPreserved: malformedLines,
  });
}
