// M0 reference harness for source-preserving GMI editing.
//
// TEST-ONLY. This is a port of the planning prototype (docs/agent-reports/
// 20261108-gmi-editing-combined-delivery-planning.md §4.1, §9) so fixtures and
// private corpora can be measured before the production M1 library exists.
// It is not the M1 API and must not be imported from src/. M1 must pass the
// same checks with its own implementation (see the pending tests).
//
// Rules the harness enforces:
// - Original bytes are never mutated or re-encoded; output is built by
//   concatenating original subarrays with explicitly encoded patch bytes.
// - Spans are derived by an independent index that mirrors GMIParser's control
//   flow, then reconciled lexeme-for-lexeme with the production parser.
// - Anything that cannot be reconciled is reported, never repaired.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { GMIParser } from '../../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../../src/lib/parsing/gmiDecoding.js';
import { GMI_SOURCE_LEXEMES } from '../../src/lib/parsing/gmiLexicalEvidence.js';
import { extractHyperlinkOccurrences } from '../../src/lib/hyperlinkFilenames.mjs';
import { createGmiPhotoSource } from '../../src/lib/photos/gmiPhotoSource.mjs';
import { encodeSingleByte, sha256Hex } from './gmiEditFixtures.mjs';

export const MAX_HARNESS_GMI_BYTES = 10 * 1024 * 1024;
const SCOPES = [['point', 'points', '[+P_]', ':P '], ['line', 'linesParsed', '[+L_]', ':L ']];

// --- 1-2. raw bytes, hash and encoding characteristics --------------------

function isValidUtf8(bytes) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch { return false; }
}

export function describeGmiBytes(bytes) {
  let nonAscii = 0, crlf = 0, lf = 0, cr = 0;
  const c1 = new Set();
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte >= 0x80) nonAscii++;
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
    : nonAscii === 0 ? 'ascii' : isValidUtf8(bytes) ? 'utf8-likely' : 'single-byte';
  return {
    size: bytes.length, sha256: sha256Hex(bytes), bom, encodingClass, nonAsciiBytes: nonAscii,
    c1Bytes: [...c1].sort((a, b) => a - b),
    eol: { kind: eolKind, crlf, lf, cr, final: last === 0x0a || last === 0x0d },
  };
}

// --- 4. independent span index --------------------------------------------
// Mirrors GMIParser._parseInternal: header loop, last-wins definitions, data
// sections ending at a raw line starting with '[', property loop ending at ':'
// or '[', and /XYZ ending the property scan. Offsets are char offsets in the
// decoded text, which equal byte offsets because the decoder is 1:1.

function splitLines(text) {
  const lines = [];
  let start = 0;
  const re = /\r?\n/g;
  let match;
  while ((match = re.exec(text))) {
    lines.push({ text: text.slice(start, match.index), start, end: match.index });
    start = match.index + match[0].length;
  }
  lines.push({ text: text.slice(start), start, end: text.length });
  return lines;
}

function fieldSpans(lineRecord) {
  const raw = lineRecord.text;
  const markerIndex = raw.indexOf('_FIELDVALUES');
  let regionStart = markerIndex + '_FIELDVALUES'.length;
  if (raw[regionStart] === ' ' || raw[regionStart] === '\t') regionStart++;
  const spans = [];
  let cursor = regionStart;
  for (;;) {
    const next = raw.indexOf(';', cursor);
    if (next === -1) { spans.push([lineRecord.start + cursor, lineRecord.start + raw.length]); break; }
    spans.push([lineRecord.start + cursor, lineRecord.start + next]);
    cursor = next + 1;
  }
  return { regionStart: lineRecord.start + regionStart, spans };
}

export function indexGmiSource(text) {
  const lines = splitLines(text);
  const index = {
    lines, sectionCounts: {}, definitions: { point: [], line: [] },
    fieldNames: { point: [], line: [] }, objects: { point: [], line: [] }, numericIndexHeader: false,
  };
  let i = 0;
  if (lines[0]?.text === '[GMIFILE_ASCII]') {
    i++;
    while (i < lines.length && lines[i].text && !lines[i].text.startsWith('[')) {
      if (/^_INDEX\s+\d/.test(lines[i].text.trim())) index.numericIndexHeader = true;
      i++;
    }
  }
  for (; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();
    const section = trimmed.match(/^\[[^\]]*\]/)?.[0];
    if (section && lines[i].text.startsWith('[')) index.sectionCounts[section] = (index.sectionCounts[section] || 0) + 1;
    const definitionScope = trimmed.startsWith('[L_]') ? 'line' : trimmed.startsWith('[P_]') ? 'point' : null;
    if (definitionScope) {
      i++;
      while (i < lines.length && !lines[i].text.startsWith('[')) {
        const definitionLine = lines[i].text.trim();
        if (definitionLine.startsWith('_FIELDNAMES')) {
          const names = definitionLine.substring(11).split(';').map((name) => name.trim());
          index.fieldNames[definitionScope] = names;
          index.definitions[definitionScope].push({ line: i, names });
        }
        i++;
      }
      i--;
      continue;
    }
    const data = SCOPES.find(([, , marker]) => trimmed.startsWith(marker));
    if (!data) continue;
    const [scope, , , objectMarker] = data;
    i++;
    while (i < lines.length && !lines[i].text.startsWith('[')) {
      if (!lines[i].text.trim().startsWith(objectMarker)) { i++; continue; }
      const object = { scope, headerLine: i, fieldValueLines: [], fieldNames: index.fieldNames[scope] };
      i++;
      while (i < lines.length && !lines[i].text.startsWith(':') && !lines[i].text.startsWith('[')) {
        const property = lines[i].text.trim();
        if (property.startsWith('_FIELDVALUES')) object.fieldValueLines.push({ line: i, ...fieldSpans(lines[i]) });
        else if (property === '/XYZ') break;
        i++;
      }
      index.objects[scope].push(object);
    }
    i--;
  }
  return index;
}

// --- 3-4. load, parse and reconcile ----------------------------------------

function objectIssues(object) {
  const issues = [];
  const names = object.fieldNames;
  if (object.fieldValueLines.length === 0) issues.push('no-fieldvalues');
  if (object.fieldValueLines.length > 1) issues.push('multiple-fieldvalues');
  const active = object.fieldValueLines.at(-1);
  if (active && active.spans.length > names.length) issues.push('more-values-than-names');
  if (active && active.spans.length < names.length) issues.push('fewer-values-than-names');
  return issues;
}

// Field name -> span for the active (parser last-wins) _FIELDVALUES line.
// Duplicate names map to the last position, as in the parser.
export function cellSpans(object) {
  const active = object.fieldValueLines.at(-1);
  const map = new Map();
  if (!active) return map;
  object.fieldNames.forEach((name, position) => {
    if (position < active.spans.length) map.set(name, { position, span: active.spans[position] });
  });
  return map;
}

export function loadGmiDocument(bytes, { label = 'gmi', indexer = indexGmiSource } = {}) {
  const frozen = Uint8Array.from(bytes);
  const describe = describeGmiBytes(frozen);
  const document = { label, bytes: frozen, describe, status: null, reasons: [], mismatches: [], counts: {} };
  if (frozen.length > MAX_HARNESS_GMI_BYTES) return Object.assign(document, { status: 'too-large', reasons: ['too-large'] });
  const text = decodeGmiBytes(frozen);
  document.text = text;
  if (text.length !== frozen.length) document.reasons.push('decoded-length-mismatch');
  let parser;
  try { parser = new GMIParser(text); } catch {
    return Object.assign(document, { status: 'parser-error', reasons: [...document.reasons, 'parser-throws'] });
  }
  document.parser = parser;
  if (parser.errors.length) return Object.assign(document, { status: 'parser-error', reasons: [...document.reasons, 'parser-errors'] });
  const index = indexer(text);
  document.index = index;

  // Reconciliation gate: same object counts, same field names, every parser
  // lexeme equals its independently indexed span.
  let lexemes = 0;
  for (const [scope, collection] of SCOPES) {
    const parsed = parser[collection], indexed = index.objects[scope];
    const parserNames = scope === 'line' ? parser.lineFieldNames : parser.pointFieldNames;
    if (!isDeepStrictEqual(parserNames, index.fieldNames[scope])) document.mismatches.push({ scope, code: 'field-names' });
    if (parsed.length !== indexed.length) { document.mismatches.push({ scope, code: 'object-count', parsed: parsed.length, indexed: indexed.length }); continue; }
    parsed.forEach((object, sourceIndex) => {
      const indexedObject = indexed[sourceIndex];
      indexedObject.issues = objectIssues(indexedObject);
      const parserLexemes = object.attributes?.[GMI_SOURCE_LEXEMES];
      const spans = cellSpans(indexedObject);
      if (!parserLexemes) {
        if (spans.size) document.mismatches.push({ scope, sourceIndex, code: 'missing-parser-lexemes' });
        return;
      }
      const names = Object.keys(parserLexemes);
      if (names.length !== spans.size) document.mismatches.push({ scope, sourceIndex, code: 'lexeme-count' });
      for (const name of names) {
        const cell = spans.get(name);
        lexemes++;
        if (!cell || text.slice(cell.span[0], cell.span[1]) !== parserLexemes[name]) {
          document.mismatches.push({ scope, sourceIndex, code: 'lexeme-span' });
        }
      }
    });
  }
  // Parser field_shape warnings must be exactly the indexed over-long
  // _FIELDVALUES lines (every parsed line is checked, including overwritten ones).
  const overLong = Object.values(index.objects).flat()
    .reduce((sum, object) => sum + object.fieldValueLines.filter((entry) => entry.spans.length > object.fieldNames.length).length, 0);
  const shapeWarnings = parser.warningSummary.classes.field_shape || 0;
  if (shapeWarnings !== overLong) document.mismatches.push({ code: 'field-shape-warnings', parser: shapeWarnings, indexed: overLong });
  const otherWarnings = parser.warningSummary.total - shapeWarnings;

  document.counts = {
    points: parser.points.length, lines: parser.linesParsed.length, lexemes,
    nonEditableObjects: Object.values(index.objects).flat().filter((object) => object.issues?.length).length,
    otherParserWarnings: otherWarnings,
  };
  if (document.mismatches.length) return Object.assign(document, { status: 'not-reconcilable', reasons: [...document.reasons, 'reconciliation-failed'] });

  // File-level fail-closed rules (planning report §4.3).
  const reasons = [...document.reasons];
  if (describe.bom) reasons.push('bom');
  if (describe.eol.kind === 'mixed') reasons.push('mixed-eol');
  if (describe.eol.kind === 'cr') reasons.push('cr-only-eol');
  if (index.numericIndexHeader) reasons.push('numeric-index-header');
  for (const marker of ['[L_]', '[P_]', '[+L_]', '[+P_]']) if ((index.sectionCounts[marker] || 0) > 1) { reasons.push('repeated-section'); break; }
  if (otherWarnings) reasons.push('parser-warnings');
  document.reasons = [...new Set(reasons)];
  document.status = document.reasons.length ? 'unsupported' : 'reconciled';
  return document;
}

export const gmiDocumentFromFile = async (filename, options) => loadGmiDocument(new Uint8Array(await readFile(filename)), options);

// --- patch splice (reference, not M1) -------------------------------------

export function applyReferencePatches(original, patches) {
  const sorted = [...patches].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let k = 0; k < sorted.length; k++) {
    const patch = sorted[k];
    if (!(patch.start >= 0 && patch.end >= patch.start && patch.end <= original.length)) throw new Error('patch-out-of-range');
    if (k && sorted[k - 1].end > patch.start) throw new Error('patch-overlap');
    if (patch.expect && !bytesEqual(original.subarray(patch.start, patch.end), patch.expect)) throw new Error('patch-expect-mismatch');
  }
  const parts = [];
  let cursor = 0;
  for (const patch of sorted) {
    parts.push(original.subarray(cursor, patch.start), patch.bytes);
    cursor = patch.end;
  }
  parts.push(original.subarray(cursor));
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Patch bytes are encoded explicitly for the file's encoding class. The
// reference harness only accepts ASCII into UTF-8-likely files (report §4.4).
export function encodeLexeme(document, lexeme) {
  if (/[;\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/.test(lexeme)) throw new Error('lexeme-forbidden-character');
  if (document.describe.encodingClass === 'utf8-likely' && /[^\x00-\x7f]/.test(lexeme)) throw new Error('lexeme-non-ascii-in-utf8');
  return encodeSingleByte(lexeme);
}

const cellPatch = (document, span, lexeme) => ({
  start: span[0], end: span[1], bytes: encodeLexeme(document, lexeme), expect: document.bytes.subarray(span[0], span[1]),
});

// --- 5. no-change identity through reconciliation -------------------------
// Every cell is re-emitted from the *parser* lexeme, encoded independently,
// at its *indexed* span. Identity proves index, parser and encoder agree.

export function checkNoOpIdentity(document) {
  const patches = [];
  for (const [scope, collection] of SCOPES) {
    document.parser[collection].forEach((object, sourceIndex) => {
      const lexemes = object.attributes?.[GMI_SOURCE_LEXEMES];
      if (!lexemes) return;
      const spans = cellSpans(document.index.objects[scope][sourceIndex]);
      for (const [name, lexeme] of Object.entries(lexemes)) {
        const { span } = spans.get(name);
        patches.push({ start: span[0], end: span[1], bytes: encodeSingleByte(lexeme), expect: document.bytes.subarray(span[0], span[1]) });
      }
    });
  }
  const output = applyReferencePatches(document.bytes, patches);
  return { patches: patches.length, identical: bytesEqual(output, document.bytes), sha256: sha256Hex(output) };
}

// --- post-condition verifier ----------------------------------------------

function byteLines(bytes) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0x0a) { lines.push(bytes.subarray(start, i + 1)); start = i + 1; }
  lines.push(bytes.subarray(start));
  return lines;
}

const lexemesOf = (object) => ({ ...(object.attributes?.[GMI_SOURCE_LEXEMES] || {}) });
const objectShape = (object) => ({ id: object.id, type: object.type, guid: object.guid, extent: object.extent, coordinates: object.coordinates });

/**
 * Reparse output and prove that it differs from the original only in the
 * intended cells. `intended` is [{ scope, sourceIndex, field, lexeme }].
 * Returns { ok, failures[] } with codes only (no file content).
 */
export function verifyCellChanges(document, output, intended, { patchedLines = null } = {}) {
  const failures = [];
  const fail = (code) => failures.push(code);
  // Byte containment independent of the splice: compare LF-terminated lines.
  const before = byteLines(document.bytes), after = byteLines(output);
  if (before.length !== after.length) fail('line-count-changed');
  else {
    const allowed = new Set(patchedLines ?? intended.map(({ scope, sourceIndex }) => document.index.objects[scope][sourceIndex].fieldValueLines.at(-1).line));
    before.forEach((bytes, line) => { if (!bytesEqual(bytes, after[line]) && !allowed.has(line)) fail('unpatched-line-changed'); });
  }
  let reparsed;
  try { reparsed = new GMIParser(decodeGmiBytes(output)); } catch { fail('reparse-throws'); return { ok: false, failures }; }
  if (reparsed.errors.length) fail('reparse-errors');
  if (reparsed.warnings.length !== document.parser.warnings.length) fail('reparse-warnings-changed');
  if (!isDeepStrictEqual(reparsed.header, document.parser.header)) fail('header-changed');
  if (!isDeepStrictEqual(reparsed.lineFieldNames, document.parser.lineFieldNames) || !isDeepStrictEqual(reparsed.pointFieldNames, document.parser.pointFieldNames)) fail('field-names-changed');
  const targets = new Map(intended.map((cell) => [`${cell.scope}:${cell.sourceIndex}:${cell.field}`, cell.lexeme]));
  for (const [scope, collection] of SCOPES) {
    const original = document.parser[collection], revised = reparsed[collection];
    if (original.length !== revised.length) { fail('object-count-changed'); continue; }
    original.forEach((object, sourceIndex) => {
      const next = revised[sourceIndex];
      if (!isDeepStrictEqual(objectShape(object), objectShape(next))) fail('object-identity-or-geometry-changed');
      const was = lexemesOf(object), now = lexemesOf(next);
      if (!isDeepStrictEqual(Object.keys(was), Object.keys(now))) { fail('lexeme-names-changed'); return; }
      for (const field of Object.keys(was)) {
        const key = `${scope}:${sourceIndex}:${field}`;
        if (targets.has(key)) {
          if (now[field] !== targets.get(key)) fail('target-lexeme-wrong');
        } else if (now[field] !== was[field]) fail('untargeted-lexeme-changed');
        if (!targets.has(key) && !isDeepStrictEqual(object.attributes[field], next.attributes[field])) fail('untargeted-value-changed');
      }
    });
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)], reparsed };
}

// --- 6. narrowly targeted single-cell change ------------------------------

const editable = (document, scope, sourceIndex) => !document.index.objects[scope][sourceIndex].issues?.length;

/** First empty SDR in a line (prototype rule), else the first empty non-hyperlink, named cell. */
export function chooseSingleCellTarget(document) {
  const candidates = [];
  for (const [scope, collection] of [...SCOPES].reverse()) {
    document.parser[collection].forEach((object, sourceIndex) => {
      if (!editable(document, scope, sourceIndex)) return;
      for (const [field, lexeme] of Object.entries(lexemesOf(object))) {
        if (field === '' || field === 'S_HYPERLINK' || lexeme.trim() !== '') continue;
        candidates.push({ scope, sourceIndex, field, lexeme: field === 'SDR' ? '11.0' : 'M0TEST', priority: field === 'SDR' ? 0 : 1 });
      }
    });
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0] ? (({ priority, ...cell }) => cell)(candidates[0]) : null;
}

export function applyCellChanges(document, cells) {
  const patches = cells.map((cell) => {
    if (!editable(document, cell.scope, cell.sourceIndex)) throw new Error('object-not-editable');
    if (cell.field === '') throw new Error('trailing-empty-field-not-targetable');
    const entry = cellSpans(document.index.objects[cell.scope][cell.sourceIndex]).get(cell.field);
    if (!entry) throw new Error('field-absent');
    return cellPatch(document, entry.span, cell.lexeme);
  });
  return { output: applyReferencePatches(document.bytes, patches), patches };
}

export function checkSingleCellChange(document, target = chooseSingleCellTarget(document)) {
  if (!target) return { applicable: false };
  const { output, patches } = applyCellChanges(document, [target]);
  const [patch] = patches;
  const prefixIntact = bytesEqual(output.subarray(0, patch.start), document.bytes.subarray(0, patch.start));
  const suffixIntact = bytesEqual(output.subarray(output.length - (document.bytes.length - patch.end)), document.bytes.subarray(patch.end));
  const verification = verifyCellChanges(document, output, [target]);
  return { applicable: true, target, output, prefixIntact, suffixIntact, ...verification, ok: verification.ok && prefixIntact && suffixIntact };
}

// --- 7. hyperlink wrapper removal -----------------------------------------
// Whole-wrapper only, wrapper plus its following whitespace. A wrapper with
// more than one link member, invalid grammar and non-photo targets are never
// removed. If no wrapper remains, the lexeme becomes ''. A bare (unwrapped)
// value is cleared. Ordinals are NOT renumbered here (open decision Q3).

export function planWrapperRemoval(lexeme, wrapperOrdinal) {
  const extracted = extractHyperlinkOccurrences(lexeme);
  const record = extracted.sources[0];
  if (!record || !record.validGrammar) return { ok: false, reason: 'invalid-grammar' };
  const occurrences = extracted.occurrences;
  if (occurrences.length === 1 && occurrences[0].wrapperOrdinal === null) {
    return wrapperOrdinal === null ? { ok: true, lexeme: '', removed: occurrences } : { ok: false, reason: 'no-such-wrapper' };
  }
  const members = record.members.filter((member) => member.wrapperOrdinal === wrapperOrdinal);
  if (!members.length) return { ok: false, reason: 'no-such-wrapper' };
  const links = members.filter((member) => member.key === 'link');
  if (links.length !== 1) return { ok: false, reason: 'multi-link-wrapper' };
  const { wrapperStart, wrapperEnd } = members[0];
  let end = wrapperEnd;
  while (end < lexeme.length && /\s/.test(lexeme[end])) end++;
  let next = lexeme.slice(0, wrapperStart) + lexeme.slice(end);
  if (!extractHyperlinkOccurrences(next).sources[0].members.length) next = '';
  return { ok: true, lexeme: next, removed: links, removedRange: [wrapperStart, end] };
}

/** Lexeme-level proof: retained wrappers (raw text, members, sign metadata) are unchanged and in order. */
export function verifyWrapperRemoval(before, after, wrapperOrdinal) {
  const was = extractHyperlinkOccurrences(before).sources[0];
  const now = extractHyperlinkOccurrences(after).sources[0];
  if (after === '') return { ok: was.members.every((member) => member.wrapperOrdinal === wrapperOrdinal || member.wrapperOrdinal === null) };
  if (!now.validGrammar) return { ok: false, reason: 'grammar-broken' };
  const keep = (members) => members.filter((member) => member.wrapperOrdinal !== wrapperOrdinal);
  const view = (members) => members.map(({ key, referenceRaw, rawMember, rawWrapper, wrapperNumber, metadata }) => ({ key, referenceRaw, rawMember, rawWrapper, wrapperNumber, metadata }));
  const ok = isDeepStrictEqual(view(keep(was.members)), view(now.members));
  return ok ? { ok } : { ok, reason: 'retained-wrapper-changed' };
}

const isPhotoTarget = (reference) => reference.targetValid;

/**
 * Remove, in one patch set, the first removable photo wrapper from every
 * S_HYPERLINK value (bare photo paths are cleared). Reparse and prove that
 * only those cells changed and that the remaining references, via the
 * production createGmiPhotoSource, are the original multiset minus the removed.
 */
export function checkHyperlinkRemoval(document, { choose = 'first' } = {}) {
  const source = createGmiPhotoSource(document.parser, null);
  const cells = [], removedKeys = [], stats = { values: 0, removable: 0, rejected: {}, lexemeChecks: 0, lexemeFailures: 0 };
  const byObject = new Map();
  for (const reference of source.references) {
    if (!byObject.has(reference.objectKey)) byObject.set(reference.objectKey, []);
    byObject.get(reference.objectKey).push(reference);
  }
  for (const object of Object.values(source.objectsByKey)) {
    const lexeme = object.rawFields.S_HYPERLINK;
    if (lexeme === undefined || !lexeme.trim()) continue;
    if (!editable(document, object.geometryScope, object.sourceIndex)) continue;
    stats.values++;
    const extracted = extractHyperlinkOccurrences(lexeme);
    if (!extracted.sources[0].validGrammar) { stats.rejected['invalid-grammar'] = (stats.rejected['invalid-grammar'] || 0) + 1; continue; }
    // Lexeme-level proof for every wrapper position.
    const ordinals = [...new Set(extracted.sources[0].members.map((member) => member.wrapperOrdinal))];
    for (const ordinal of ordinals) {
      const plan = planWrapperRemoval(lexeme, ordinal);
      if (!plan.ok) continue;
      stats.lexemeChecks++;
      if (!verifyWrapperRemoval(lexeme, plan.lexeme, ordinal).ok) stats.lexemeFailures++;
    }
    const references = byObject.get(object.objectKey) || [];
    const candidates = references.filter(isPhotoTarget);
    const picked = choose === 'last' ? candidates.at(-1) : candidates[0];
    if (!picked) { stats.rejected['no-photo-target'] = (stats.rejected['no-photo-target'] || 0) + 1; continue; }
    const plan = planWrapperRemoval(lexeme, picked.wrapperOrdinal);
    if (!plan.ok) { stats.rejected[plan.reason] = (stats.rejected[plan.reason] || 0) + 1; continue; }
    stats.removable++;
    cells.push({ scope: object.geometryScope, sourceIndex: object.sourceIndex, field: 'S_HYPERLINK', lexeme: plan.lexeme });
    removedKeys.push(...references.filter((reference) => reference.wrapperOrdinal === picked.wrapperOrdinal).map((reference) => `${reference.objectKey}|${reference.rawWrapper ?? reference.rawMember}`));
  }
  if (!cells.length) return { applicable: false, stats };
  const { output } = applyCellChanges(document, cells);
  const verification = verifyCellChanges(document, output, cells);
  const failures = [...verification.failures];
  if (verification.reparsed) {
    const after = createGmiPhotoSource(verification.reparsed, null);
    const key = (reference) => `${reference.objectKey}|${reference.rawWrapper ?? reference.rawMember}|${reference.rawMember}|${JSON.stringify(reference.metadata)}`;
    const expected = source.references.filter((reference) => !removedKeys.includes(`${reference.objectKey}|${reference.rawWrapper ?? reference.rawMember}`)).map(key).sort();
    // Multiset equality also proves every non-photo, ambiguous or invalid link survived.
    if (!isDeepStrictEqual(after.references.map(key).sort(), expected)) failures.push('remaining-references-changed');
    if (source.issues.length !== after.issues.length) failures.push('photo-source-issues-changed');
  }
  if (stats.lexemeFailures) failures.push('lexeme-level-removal-failed');
  return { applicable: true, stats, cells, output, ok: failures.length === 0, failures: [...new Set(failures)], removedReferences: removedKeys.length };
}

// --- 8. corpus scan (read-only, aggregate counts only) --------------------

export async function discoverGmiFiles(directories) {
  const found = [];
  const walk = async (directory) => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && /\.gmi$/i.test(entry.name)) found.push(filename);
    }
  };
  for (const directory of directories) await walk(directory);
  return found.sort();
}

const bump = (counter, key, by = 1) => { counter[key] = (counter[key] || 0) + by; };

/**
 * Runs every reference check on each byte-unique file. Returns aggregate
 * statistics only. Never writes, renames or normalizes any input; the caller
 * asserts that by hashing before and after.
 */
export async function scanGmiCorpus(files) {
  const stats = {
    files: files.length, uniqueFiles: 0, duplicateFiles: 0, status: {}, reasons: {}, encodingClass: {}, eolKind: {},
    c1Files: 0, objects: 0, lexemes: 0, mismatchCodes: {}, nonEditableObjects: 0,
    noOp: { checked: 0, identical: 0 },
    singleCell: { applicable: 0, ok: 0, notApplicable: 0, sdrTargets: 0, failures: {} },
    hyperlink: { files: 0, values: 0, removed: 0, ok: 0, lexemeChecks: 0, lexemeFailures: 0, rejected: {}, failures: {} },
    harnessErrors: {},
  };
  const seen = new Set();
  for (const filename of files) {
    let bytes;
    try {
      if ((await stat(filename)).size > MAX_HARNESS_GMI_BYTES) { bump(stats.status, 'too-large'); stats.uniqueFiles++; continue; }
      bytes = new Uint8Array(await readFile(filename));
    } catch { bump(stats.status, 'unreadable'); continue; }
    const digest = sha256Hex(bytes);
    if (seen.has(digest)) { stats.duplicateFiles++; continue; }
    seen.add(digest);
    stats.uniqueFiles++;
    try {
      const document = loadGmiDocument(bytes);
      bump(stats.status, document.status);
      for (const reason of document.reasons) bump(stats.reasons, reason);
      bump(stats.encodingClass, document.describe.encodingClass);
      bump(stats.eolKind, document.describe.eol.kind);
      if (document.describe.c1Bytes.length) stats.c1Files++;
      for (const mismatch of document.mismatches) bump(stats.mismatchCodes, mismatch.code);
      if (document.status !== 'reconciled' && document.status !== 'unsupported') continue;
      stats.objects += document.counts.points + document.counts.lines;
      stats.lexemes += document.counts.lexemes;
      stats.nonEditableObjects += document.counts.nonEditableObjects;
      const noOp = checkNoOpIdentity(document);
      stats.noOp.checked++;
      if (noOp.identical && noOp.sha256 === document.describe.sha256) stats.noOp.identical++;
      const single = checkSingleCellChange(document);
      if (!single.applicable) stats.singleCell.notApplicable++;
      else {
        stats.singleCell.applicable++;
        if (single.target.field === 'SDR') stats.singleCell.sdrTargets++;
        if (single.ok) stats.singleCell.ok++;
        for (const code of single.failures) bump(stats.singleCell.failures, code);
      }
      const removal = checkHyperlinkRemoval(document);
      stats.hyperlink.values += removal.stats.values;
      stats.hyperlink.lexemeChecks += removal.stats.lexemeChecks;
      stats.hyperlink.lexemeFailures += removal.stats.lexemeFailures;
      for (const [code, count] of Object.entries(removal.stats.rejected)) bump(stats.hyperlink.rejected, code, count);
      if (removal.applicable) {
        stats.hyperlink.files++;
        stats.hyperlink.removed += removal.removedReferences;
        if (removal.ok) stats.hyperlink.ok++;
        for (const code of removal.failures) bump(stats.hyperlink.failures, code);
      }
    } catch (error) {
      bump(stats.harnessErrors, error?.message?.replace(/[^a-z-]/gi, '').slice(0, 40) || 'unknown');
    }
  }
  return stats;
}
