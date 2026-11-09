// M1: production gmi-edit library — negative tests, fail-closed policies and
// the coordinate-warning decision. Acceptance criteria T1-T4/T8 against the
// M0 fixtures and the reference harness are in tests/gmiEditCorpus.test.mjs.
//
// Variants of the committed fixtures are built in memory only; no fixture or
// corpus file is written.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { GMI_EDIT_FIXTURE_DIR, encodeSingleByte, sha256Hex } from './helpers/gmiEditFixtures.mjs';
import { loadGmiDocument } from './helpers/gmiEditHarness.mjs';
import {
  MAX_GMI_EDIT_BYTES, applyGmiPatches, computeGmiSourceFingerprint, createGmiSourceDocument, editGmiFields,
  getGmiSourceBytes, listGmiObjectCells, loadGmiSourceDocument, planGmiFieldPatches, resolveGmiCell, verifyGmiEdit,
} from '../src/lib/gmi-edit/index.mjs';
import { internalGmiSourceState } from '../src/lib/gmi-edit/sourceDocument.mjs';
import { reconcileGmiSourceIndex } from '../src/lib/gmi-edit/sourceIndex.mjs';
import { MAX_PHOTO_GMI_BYTES, gmiSourceFingerprint } from '../src/lib/photos/gmiPhotoSource.mjs';

const fixture = async (id) => new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, `${id}.gmi`)));
const CORE = await fixture('core-crlf-latin1');
const NO_GUID = await fixture('no-guid');
const SDR_EMPTY = await fixture('sdr-empty');
const latin1 = (bytes) => new TextDecoder('iso-8859-1').decode(bytes);
const bytesEqual = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);
const codes = (result) => (result.rejections || result.failures).map((entry) => entry.code);

/** In-memory variant of a fixture: edit its lines (0-based, EOL kept). */
function variant(bytes, mutate) {
  const text = latin1(bytes);
  const lines = text.split('\r\n');
  mutate(lines);
  return encodeSingleByte(lines.join('\r\n'));
}
const edit = (document, scope, sourceIndex, field, next) => {
  const resolved = resolveGmiCell(document, { scope, sourceIndex, field });
  assert(resolved.ok, `${scope}:${sourceIndex}:${field} ${resolved.code}`);
  return { target: { scope, sourceIndex, field }, expected: resolved.cell.lexeme, lexeme: next };
};
const splice = (bytes, start, end, replacement) => Uint8Array.from([...bytes.subarray(0, start), ...replacement, ...bytes.subarray(end)]);
const offsetOf = (bytes, text, from = 0) => latin1(bytes).indexOf(text, from);

// --- wrong targets and identity ----------------------------------------

test('wrong or ambiguous targets are refused with specific codes', () => {
  const document = createGmiSourceDocument(CORE);
  const code = (target) => resolveGmiCell(document, target).code;
  assert.equal(code(null), 'invalid-target');
  assert.equal(code({ scope: 'text', sourceIndex: 0, field: 'SDR' }), 'unknown-scope');
  assert.equal(code({ scope: 'line', sourceIndex: -1, field: 'SDR' }), 'invalid-source-index');
  assert.equal(code({ scope: 'line', sourceIndex: 1.5, field: 'SDR' }), 'invalid-source-index');
  assert.equal(code({ scope: 'line', sourceIndex: 3, field: 'SDR' }), 'object-not-found');
  assert.equal(code({ scope: 'point', sourceIndex: 0, field: 'SDR' }), 'field-absent', 'point section has no SDR');
  assert.equal(code({ scope: 'line', sourceIndex: 0, field: 5 }), 'invalid-field');
  assert.equal(code({ scope: 'line', sourceIndex: 0, field: 'sdr' }), 'field-absent', 'exact delivered column name');
  // Identity guards: :L number and GUID are checked when given.
  assert.equal(code({ scope: 'line', sourceIndex: 1, field: 'SDR', objectId: 1 }), 'object-identity-mismatch');
  assert.equal(code({ scope: 'line', sourceIndex: 1, field: 'SDR', guid: document.parser.linesParsed[0].guid }), 'object-identity-mismatch');
  const guarded = resolveGmiCell(document, { scope: 'line', sourceIndex: 1, field: 'SDR', objectId: 2, guid: document.parser.linesParsed[1].guid });
  assert(guarded.ok);
  assert.deepEqual({ ...guarded.cell }, {
    key: JSON.stringify(['line', 1, 'SDR']), scope: 'line', sourceIndex: 1, field: 'SDR', position: 4, line: 24,
    start: guarded.cell.start, end: guarded.cell.start, lexeme: '', objectId: 2, guid: '5ec0e000-0000-4000-8000-0000000003ea',
  });
  // Objects without GUID: guid null matches, any GUID does not.
  const noGuid = createGmiSourceDocument(NO_GUID);
  assert(resolveGmiCell(noGuid, { scope: 'point', sourceIndex: 1, field: 'Kumform', guid: null }).ok);
  assert.equal(resolveGmiCell(noGuid, { scope: 'point', sourceIndex: 1, field: 'Kumform', guid: 'x' }).code, 'object-identity-mismatch');
  // A verified output for one cell does not verify a claim about another.
  const merknad = editGmiFields(document, [edit(document, 'line', 1, 'Merknad', 'endret')]);
  assert(merknad.ok);
  const claimed = verifyGmiEdit(document, merknad.bytes, [{ target: { scope: 'line', sourceIndex: 1, field: 'SDR' }, lexeme: 'endret' }]);
  assert.equal(claimed.ok, false);
  for (const expected of ['byte-outside-target-changed', 'untargeted-segment-changed', 'target-segment-wrong', 'target-lexeme-wrong', 'untargeted-lexeme-changed', 'untargeted-value-changed']) {
    assert(codes(claimed).includes(expected), expected);
  }
  assert.equal(claimed.outputDocument, null);
});

test('objects with identical values, coordinates, ids and no GUID are addressed by source position only', () => {
  // Three byte-identical :P 1 objects, no GUID lines.
  const bytes = variant(CORE, (lines) => {
    const block = lines.slice(37, 42).filter((line) => !line.startsWith('GUID'));
    lines.splice(37, 15, ...block, ...block, ...block);
  });
  const document = createGmiSourceDocument(bytes);
  assert(document.editable, document.reasons.join());
  assert.equal(document.parser.points.length, 3);
  assert(document.parser.points.every((point) => point.id === 1 && point.guid === null && point.attributes.Kumform === 'S'));
  const result = editGmiFields(document, [edit(document, 'point', 1, 'Kumform', 'R')]);
  assert(result.ok, JSON.stringify(result.rejections));
  assert.deepEqual(result.verification.outputDocument.parser.points.map((point) => point.attributes.Kumform), ['S', 'R', 'S']);
  // The changed byte lies on the second object's _FIELDVALUES line.
  const { index } = internalGmiSourceState(document);
  const line = index.lines[index.objects.point[1].fieldValueLines[0].line];
  assert(result.patches[0].start >= line.start && result.patches[0].end <= line.end);
  // The same bytes do not verify as an edit of the first or third object.
  for (const sourceIndex of [0, 2]) {
    assert.equal(verifyGmiEdit(document, result.bytes, [{ target: { scope: 'point', sourceIndex, field: 'Kumform' }, lexeme: 'R' }]).ok, false);
  }
  // Reconciliation catches a span pointed at identical text in a sibling object.
  const { text, parser } = internalGmiSourceState(document);
  const copy = structuredClone(index);
  copy.objects.point[0].fieldValueLines[0] = structuredClone(index.objects.point[1].fieldValueLines[0]);
  const mismatches = reconcileGmiSourceIndex({ text, parser, index: copy }).mismatches.map((m) => m.code);
  assert(mismatches.includes('fieldvalues-line-outside-object') && mismatches.includes('fieldvalues-line-shared'), mismatches.join());
});

// --- stale and missing preconditions ------------------------------------

test('stale or missing expected values reject the whole edit set and return no bytes', () => {
  const document = createGmiSourceDocument(CORE);
  const good = edit(document, 'line', 1, 'SDR', '11.0');
  const stale = { ...edit(document, 'line', 2, 'SDR', '11.0'), expected: '11.0' };
  const result = editGmiFields(document, [good, stale]);
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'plan');
  assert.deepEqual(result.rejections.map(({ editIndex, code }) => ({ editIndex, code })), [{ editIndex: 1, code: 'stale-expected-value' }]);
  assert.equal('bytes' in result, false);
  const { expected, ...missing } = good;
  void expected;
  assert.deepEqual(codes(editGmiFields(document, [missing])), ['missing-expected-value']);
  // The precondition is the exact lexeme: a trimmed whitespace-only value is stale.
  const sdr = createGmiSourceDocument(SDR_EMPTY);
  assert.equal(resolveGmiCell(sdr, { scope: 'line', sourceIndex: 1, field: 'SDR' }).cell.lexeme, ' ');
  assert.deepEqual(codes(editGmiFields(sdr, [{ target: { scope: 'line', sourceIndex: 1, field: 'SDR' }, expected: '', lexeme: '11.0' }])), ['stale-expected-value']);
  // An edit to the same value is an explicit no-op: identical bytes, verified.
  const same = editGmiFields(document, [edit(document, 'line', 0, 'SDR', '11.0')]);
  assert(same.ok && bytesEqual(same.bytes, CORE));
  assert.deepEqual([same.verification.summary.targetedCells, same.verification.summary.changedCells], [1, 0]);
  assert.deepEqual(codes(editGmiFields(document, 'x')), ['invalid-edits']);
  assert.deepEqual(codes(editGmiFields(document, [null])), ['invalid-edit']);
});

// --- overlapping edits and raw patch guards ------------------------------

test('overlapping edits and unsafe raw patches are refused by the splice', async () => {
  const document = createGmiSourceDocument(CORE);
  const sdr = edit(document, 'line', 1, 'SDR', '11.0');
  assert.deepEqual(codes(editGmiFields(document, [sdr, { ...sdr, lexeme: '17.0' }])), ['duplicate-target']);
  const plan = planGmiFieldPatches(document, [sdr, edit(document, 'line', 1, 'Merknad', 'ny')]);
  assert(plan.ok);
  const [patch, merknad] = plan.patches;
  const apply = (patches) => applyGmiPatches(document, patches);
  assert.deepEqual(codes(apply([patch, patch])), ['overlapping-patches']);
  // Order does not matter for valid, disjoint patches.
  assert(bytesEqual(apply([merknad, patch]).bytes, apply([patch, merknad]).bytes));
  const { cellsByStart } = internalGmiSourceState(document);
  const cell = (start) => cellsByStart.get(start);
  const tema = resolveGmiCell(document, { scope: 'line', sourceIndex: 0, field: 'Tema' }).cell;
  const material = resolveGmiCell(document, { scope: 'line', sourceIndex: 0, field: 'Material' }).cell;
  const raw = (start, end, replacement = Uint8Array.of(0x58), expected = getGmiSourceBytes(document).slice(start, end)) => ({ start, end, expected, replacement });
  // Ranges must be exactly one editable field-value span.
  assert.deepEqual(codes(apply([raw(tema.start, material.end)])), ['range-not-a-field-value'], 'two cells and their separator');
  assert.deepEqual(codes(apply([raw(tema.start, tema.end + 1)])), ['range-not-a-field-value'], 'value plus separator');
  const coordinate = offsetOf(CORE, '581945.000');
  assert.deepEqual(codes(apply([raw(coordinate, coordinate + 1, Uint8Array.of(0x36))])), ['range-not-a-field-value'], 'coordinate');
  const version = offsetOf(CORE, '_VERSION 2') + 9;
  assert.deepEqual(codes(apply([raw(version, version + 1, Uint8Array.of(0x33))])), ['range-not-a-field-value'], 'header');
  const trailing = internalGmiSourceState(document).objects.line[0].cells.at(-1);
  assert.equal(trailing.reason, 'unnamed-field');
  assert.deepEqual(codes(apply([raw(trailing.start, trailing.end)])), ['range-not-a-field-value'], 'structural trailing slot');
  for (const range of [[-1, 0], [0, CORE.length + 1], [5, 4], [1.5, 2]]) assert.deepEqual(codes(apply([raw(...range)])), ['invalid-range']);
  // Preconditions are mandatory and exact.
  assert.deepEqual(codes(apply([{ ...raw(tema.start, tema.end), expected: undefined }])), ['missing-precondition']);
  assert.deepEqual(codes(apply([{ ...raw(tema.start, tema.end), expected: Uint8Array.of(0x53, 0x50) }])), ['stale-precondition']);
  // Replacement bytes must be a valid lexeme for the source encoding.
  const replace = (bytes) => codes(apply([raw(tema.start, tema.end, bytes)]));
  assert.deepEqual(replace(Uint8Array.of(0x41, 0x3b, 0x42)), ['lexeme-semicolon']);
  assert.deepEqual(replace(Uint8Array.of(0x41, 0x0d, 0x0a)), ['lexeme-line-break']);
  assert.deepEqual(replace(Uint8Array.of(0x41, 0x0a)), ['lexeme-line-break']);
  assert.deepEqual(replace(Uint8Array.of(0x86)), ['lexeme-unrepresentable'], 'Windows-1252-only byte');
  assert.deepEqual(replace(Uint8Array.of(0x81)), ['lexeme-c1-control']);
  assert.deepEqual(replace([0x41]), ['replacement-not-bytes']);
  assert.equal(cell(tema.start).field, 'Tema');
  assert.deepEqual(codes(applyGmiPatches(createGmiSourceDocument(await fixture('guard-mixed-eol')), [])), ['document-not-editable']);
});

// --- independent verifier: coordinates, header, metadata, EOL ------------

test('the verifier rejects coordinate, header, metadata, GUID and line-ending changes a splice could hide', async () => {
  const document = createGmiSourceDocument(CORE);
  const verify = (bytes, changes = []) => verifyGmiEdit(document, bytes, changes);
  const has = (result, ...expected) => { assert.equal(result.ok, false); for (const code of expected) assert(codes(result).includes(code), `${code} in ${codes(result)}`); };
  const at = (text) => offsetOf(CORE, text);
  has(verify(splice(CORE, at('581945.000'), at('581945.000') + 1, [0x36])), 'byte-outside-target-changed', 'unpatched-line-changed', 'geometry-changed');
  has(verify(splice(CORE, at('_VERSION 2') + 9, at('_VERSION 2') + 10, [0x33])), 'header-changed', 'unpatched-line-changed');
  // Section _EXTENT padding is invisible to the parser; the byte proofs still catch it.
  const padding = offsetOf(CORE, '!!!!', at('[L_]'));
  const metadata = verify(splice(CORE, padding, padding + 1, [0x3f]));
  has(metadata, 'byte-outside-target-changed', 'unpatched-line-changed');
  assert(!codes(metadata).includes('header-changed'), 'reparse alone would have accepted it');
  has(verify(splice(CORE, at('0000000003e9') + 11, at('0000000003e9') + 12, [0x61])), 'object-identity-changed');
  // CRLF -> LF on one untouched line.
  const eol = at('\r\n');
  has(verify(splice(CORE, eol, eol + 1, [])), 'unpatched-line-changed', 'byte-outside-target-changed', 'output-not-editable');
  // CRLF -> LF on the edited line itself, with a correct edit claimed.
  const sdr = edit(document, 'line', 1, 'SDR', '11.0');
  const edited = editGmiFields(document, [sdr]);
  assert(edited.ok);
  const lineEnd = offsetOf(edited.bytes, '\r\n', offsetOf(edited.bytes, '_FIELDVALUES VL;VL;PE;160'));
  has(verifyGmiEdit(document, splice(edited.bytes, lineEnd, lineEnd + 1, []), [sdr]), 'eol-changed', 'byte-outside-target-changed');
  // A metadata change *before* a correctly edited target.
  const beforeTarget = verifyGmiEdit(document, splice(edited.bytes, padding, padding + 1, [0x3f]), [sdr]);
  has(beforeTarget, 'byte-outside-target-changed', 'unpatched-line-changed');
  assert(!codes(beforeTarget).includes('target-bytes-wrong'), 'the target itself is still correct');
  // A separator injected in the target value changes the field count.
  const sdrCell = resolveGmiCell(document, sdr.target).cell;
  has(verifyGmiEdit(document, splice(CORE, sdrCell.start, sdrCell.end, [0x31, 0x3b, 0x30]), [sdr]), 'target-bytes-wrong', 'field-count-changed');
  // An unclaimed second change on the same line.
  const merknad = resolveGmiCell(document, { scope: 'line', sourceIndex: 1, field: 'Merknad' }).cell;
  const shifted = merknad.start + 4;
  has(verifyGmiEdit(document, splice(edited.bytes, shifted, shifted + 1, [0x58]), [sdr]), 'untargeted-segment-changed', 'untargeted-lexeme-changed');
  // Truncation, wrong type, unchanged bytes for a claimed change, invalid claims.
  has(verify(CORE.subarray(0, CORE.length - 10)), 'byte-outside-target-changed', 'line-count-changed');
  has(verify([...CORE]), 'output-not-bytes');
  has(verify(CORE, [sdr]), 'target-bytes-wrong');
  has(verify(CORE, [{ target: sdr.target, lexeme: 'a;b' }]), 'change-lexeme-invalid');
  has(verify(CORE, [{ target: { scope: 'line', sourceIndex: 9, field: 'SDR' }, lexeme: '1' }]), 'change-target-invalid');
  has(verifyGmiEdit(createGmiSourceDocument(await fixture('guard-repeated-section')), CORE, []), 'document-not-editable');
  assert(verify(CORE).ok, 'the original verifies as a no-change edit');
});

// --- coordinate-warning policy -------------------------------------------

test('coordinate-warning policy: malformed vertex lines stay byte-identical and editing elsewhere is allowed', () => {
  // Masked real shapes "9.9 9.9 9.9 a" and "9.9 9.9 9.9 a9a 9.9".
  const bytes = variant(CORE, (lines) => {
    assert.equal(lines[21], '581945.000 6566010.000 101.250');
    lines[21] += ' a';
    assert.equal(lines[46], '581950.000 6566014.000 102.000');
    lines[46] += ' a1b 0.5';
  });
  const reference = loadGmiDocument(bytes);
  assert.equal(reference.status, 'unsupported', 'M0 reference keeps these read-only');
  assert.deepEqual(reference.reasons, ['parser-warnings']);
  const document = createGmiSourceDocument(bytes);
  assert.equal(document.status, 'reconciled', document.reasons.join());
  assert.deepEqual([document.counts.coordinateWarnings, document.counts.malformedCoordinateLines, document.counts.unaccountedWarnings], [2, 2, 0]);
  assert.deepEqual([...document.parser.warnings], ['Invalid coordinate at line 22: "581945.000 6566010.000 101.250 a"', 'Invalid coordinate at line 47: "581950.000 6566014.000 102.000 a1b 0.5"']);
  assert.equal(document.parser.linesParsed[0].coordinates.length, 1, 'parser skips the vertex; we do not reinterpret it');
  assert.equal(document.parser.points[1].coordinates.length, 0);
  // Edits on the objects that own malformed lines and elsewhere.
  const result = editGmiFields(document, [edit(document, 'line', 0, 'Merknad', 'Rettet'), edit(document, 'point', 1, 'Kumform', 'R'), edit(document, 'line', 1, 'SDR', '11.0')]);
  assert(result.ok, JSON.stringify(result.rejections));
  assert.equal(result.verification.summary.malformedCoordinateLinesPreserved, 2);
  assert.deepEqual([...result.verification.outputDocument.parser.warnings], [...document.parser.warnings], 'same warnings, same lines, same order');
  assert.deepEqual(result.verification.outputDocument.parser.warningSummary, document.parser.warningSummary);
  const out = latin1(result.bytes).split('\r\n');
  assert.equal(out[21], '581945.000 6566010.000 101.250 a');
  assert.equal(out[46], '581950.000 6566014.000 102.000 a1b 0.5');
  // Repairing or normalizing a malformed line is rejected.
  const malformed = (text, from) => offsetOf(bytes, text, from);
  const repaired = splice(bytes, malformed(' a\r\n'), malformed(' a\r\n') + 2, []);
  const repair = verifyGmiEdit(document, repaired, []);
  for (const code of ['warnings-changed', 'geometry-changed', 'malformed-coordinate-line-changed', 'byte-outside-target-changed']) assert(codes(repair).includes(code), code);
  const blanked = splice(bytes, malformed(' a1b 0.5'), malformed(' a1b 0.5') + 8, encodeSingleByte('        '));
  assert(codes(verifyGmiEdit(document, blanked, [])).includes('malformed-coordinate-line-changed'));
  // A new malformed line (an added warning) is rejected too.
  const added = splice(bytes, offsetOf(bytes, '581960.000 6566021.000 103.000') + 30, offsetOf(bytes, '581960.000 6566021.000 103.000') + 30, encodeSingleByte(' x'));
  assert(codes(verifyGmiEdit(document, added, [])).includes('warnings-changed'));
  // The warning gate fails closed when a predicted warning does not match the parser.
  const state = internalGmiSourceState(document);
  const tampered = structuredClone(state.index);
  tampered.predictedWarnings.pop();
  const mismatches = reconcileGmiSourceIndex({ text: state.text, parser: state.parser, index: tampered }).mismatches.map((m) => m.code);
  assert(mismatches.includes('coordinate-warning-count'), mismatches.join());
  const moved = structuredClone(state.index);
  moved.predictedWarnings[0].message = moved.predictedWarnings[0].message.replace('line 22', 'line 23');
  assert(reconcileGmiSourceIndex({ text: state.text, parser: state.parser, index: moved }).mismatches.some((m) => m.code === 'warning-prediction'));
});

test('other parser warnings keep a document read-only (the no-object file class)', () => {
  const bytes = variant(CORE, (lines) => lines.splice(14, 38));
  const document = createGmiSourceDocument(bytes);
  assert.deepEqual([document.parser.points.length, document.parser.linesParsed.length], [0, 0]);
  assert.equal(document.status, 'unsupported');
  assert.deepEqual([...document.reasons], ['parser-warnings']);
  assert.deepEqual({ ...document.counts.unaccountedWarningClasses }, { other: 1 });
  assert.equal(loadGmiDocument(bytes).status, 'unsupported', 'same as the reference harness');
  assert.deepEqual(codes(editGmiFields(document, [])), ['document-not-editable']);
  assert(bytesEqual(getGmiSourceBytes(document), bytes), 'still readable');
});

// --- other fail-closed structures ----------------------------------------

test('unsupported structures are read-only with explicit reasons; field-level hazards block only that field', () => {
  const status = (bytes) => { const document = createGmiSourceDocument(bytes); return [document.status, [...document.reasons]]; };
  assert.deepEqual(status(variant(CORE, (lines) => { lines[3] = '_INDEX 1024'; })), ['unsupported', ['numeric-index-header']]);
  assert.deepEqual(status(variant(CORE, (lines) => { lines[0] = '[GMIFILE_ASCII] '; })), ['unsupported', ['nonstandard-signature-line']]);
  assert.deepEqual(status(variant(CORE, (lines) => { lines.splice(10, 0, lines[10]); })), ['unsupported', ['repeated-fieldnames']]);
  assert.deepEqual(status(variant(CORE, (lines) => { lines.splice(42, 0, '[+P_]'); })), ['unsupported', ['repeated-section']]);
  assert.deepEqual(status(variant(CORE, (lines) => { lines.splice(1, 2, `${lines[1]}\n${lines[2]}`); })), ['unsupported', ['mixed-eol']]);
  const large = createGmiSourceDocument(new Uint8Array(MAX_GMI_EDIT_BYTES + 1));
  assert.deepEqual([large.status, [...large.reasons], large.editable, large.parser], ['too-large', ['too-large'], false, null]);
  // No separator after _FIELDVALUES: the first value cannot be edited safely; the rest can.
  const noSeparator = createGmiSourceDocument(variant(CORE, (lines) => { lines[17] = lines[17].replace('_FIELDVALUES ', '_FIELDVALUES'); }));
  assert(noSeparator.editable);
  assert.equal(resolveGmiCell(noSeparator, { scope: 'line', sourceIndex: 0, field: 'S_FCODE' }).code, 'no-value-separator');
  assert(editGmiFields(noSeparator, [edit(noSeparator, 'line', 0, 'Tema', 'SP')]).ok);
  // Duplicate column names: that column is ambiguous; others stay editable.
  const duplicate = createGmiSourceDocument(variant(CORE, (lines) => { lines[13] = lines[13].replace('Kumform', 'Merknad'); }));
  assert(duplicate.editable);
  assert.equal(resolveGmiCell(duplicate, { scope: 'point', sourceIndex: 0, field: 'Merknad' }).code, 'duplicate-field-name');
  assert(editGmiFields(duplicate, [edit(duplicate, 'point', 0, 'Type', 'Kum')]).ok);
  assert.deepEqual(listGmiObjectCells(duplicate, 'point', 0).filter((cell) => !cell.editable).map((cell) => cell.reason), ['duplicate-field-name', 'duplicate-field-name', 'unnamed-field']);
});

test('the engine itself does not own columns: S_HYPERLINK values can be patched (for M7); column ownership is M2 policy', () => {
  const document = createGmiSourceDocument(CORE);
  const result = editGmiFields(document, [edit(document, 'line', 0, 'S_HYPERLINK', '')]);
  assert(result.ok, JSON.stringify(result.rejections));
  assert.equal(result.verification.outputDocument.parser.linesParsed[0].attributes.S_HYPERLINK, null);
});

// --- immutability and identity --------------------------------------------

test('the source document is immutable and never shares its buffer', async () => {
  const input = Uint8Array.from(CORE);
  const document = createGmiSourceDocument(input, { filename: 'core.gmi' });
  input.fill(0);
  assert(bytesEqual(getGmiSourceBytes(document), CORE), 'input mutation after creation has no effect');
  const copy = getGmiSourceBytes(document);
  copy.fill(0);
  assert(bytesEqual(getGmiSourceBytes(document), CORE));
  assert.notEqual(getGmiSourceBytes(document), getGmiSourceBytes(document));
  assert(Object.isFrozen(document) && Object.isFrozen(document.reasons) && Object.isFrozen(document.counts));
  assert.throws(() => { document.status = 'x'; }, TypeError);
  assert.throws(() => { document.parser.header.COSYS_EPSG = 4326; }, TypeError, 'parser result is frozen');
  assert.throws(() => { document.parser.linesParsed[0].attributes.SDR = 17; }, TypeError);
  assert.throws(() => { document.parser.points.push({}); }, TypeError);
  assert.equal(document.filename, 'core.gmi');
  assert.equal(document.fingerprint, null);
  // Accidental mutation of the private buffer is detected before apply and verify.
  const state = internalGmiSourceState(document);
  const sdr = edit(document, 'line', 1, 'SDR', '11.0');
  state.bytes[3] ^= 1;
  assert.deepEqual(codes(editGmiFields(document, [sdr])), ['source-bytes-mutated']);
  assert.deepEqual(codes(verifyGmiEdit(document, CORE, [])), ['source-bytes-mutated']);
  state.bytes[3] ^= 1;
  assert(editGmiFields(document, [sdr]).ok);
  assert.throws(() => createGmiSourceDocument('text'), TypeError);
  assert(createGmiSourceDocument(CORE.buffer.slice(CORE.byteOffset, CORE.byteOffset + CORE.byteLength)).editable, 'ArrayBuffer input');
});

test('source fingerprint matches the FOTO GMI source identity', async () => {
  assert.equal(MAX_GMI_EDIT_BYTES, MAX_PHOTO_GMI_BYTES);
  for (const name of (await readdir(GMI_EDIT_FIXTURE_DIR)).filter((entry) => entry.endsWith('.gmi'))) {
    const bytes = new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, name)));
    const fingerprint = await computeGmiSourceFingerprint(bytes);
    assert.equal(fingerprint, `sha256:${sha256Hex(bytes)}`);
    assert.equal(fingerprint, await gmiSourceFingerprint(new File([bytes], name)));
    const document = await loadGmiSourceDocument(bytes, { filename: name });
    assert.equal(document.fingerprint, fingerprint);
  }
});

test('gmi-edit stays a browser-safe core: no node:, test, photo or UI imports; the harness stays test-only', async () => {
  const directory = path.resolve('src/lib/gmi-edit');
  const files = (await readdir(directory)).filter((name) => name.endsWith('.mjs'));
  assert.deepEqual(files.sort(), ['encoding.mjs', 'index.mjs', 'patch.mjs', 'sourceDocument.mjs', 'sourceIndex.mjs', 'targets.mjs', 'verify.mjs']);
  for (const name of files) {
    const source = await readFile(path.join(directory, name), 'utf8');
    for (const [, specifier] of source.matchAll(/from\s+'([^']+)'/g)) {
      assert(specifier.startsWith('./') || specifier.startsWith('../parsing/'), `${name} imports ${specifier}`);
    }
  }
  const walk = async (dir) => (await readdir(dir, { withFileTypes: true })).flatMap((entry) => entry.isDirectory() ? [] : [path.join(dir, entry.name)]);
  for (const file of await walk(path.resolve('src/lib/gmi-edit'))) assert(!(await readFile(file, 'utf8')).includes('gmiEditHarness'));
});
