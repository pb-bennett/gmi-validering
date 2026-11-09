// M0: byte-exact GMI editing fixtures and the reference corpus harness.
//
// Tests marked "(reference)" run against the TEST-ONLY reference harness in
// tests/helpers/gmiEditHarness.mjs. Tests marked "(production)" are the M1
// acceptance criteria T1-T4 and T8: they drive the production library
// src/lib/gmi-edit and compare it with the harness, which stays an independent
// oracle. Negative and policy tests live in tests/gmiEditProduction.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { GMI_SOURCE_LEXEMES } from '../src/lib/parsing/gmiLexicalEvidence.js';
import { createGmiPhotoSource, reviewGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { extractHyperlinkOccurrences } from '../src/lib/hyperlinkFilenames.mjs';
import { gmiText, realGrammarFamilies } from './helpers/gmiPhotoFixtures.mjs';
import {
  GMI_EDIT_FIXTURE_DIR, GMI_EDIT_FIXTURES, HYPERLINK_CASES, buildGmiEditFixtureBytes, buildGmiEditManifest,
  encodeSingleByte, grammarFamilySignature, sha256Hex,
} from './helpers/gmiEditFixtures.mjs';
import {
  applyCellChanges, applyReferencePatches, bytesEqual, cellSpans, checkHyperlinkRemoval, checkNoOpIdentity,
  checkSingleCellChange, discoverGmiFiles, encodeLexeme, indexGmiSource, loadGmiDocument, planWrapperRemoval,
  chooseSingleCellTarget, scanGmiCorpus, verifyCellChanges, verifyWrapperRemoval,
} from './helpers/gmiEditHarness.mjs';
import { expectedProductionStatus, scanGmiCorpusProduction } from './helpers/gmiEditProductionCorpus.mjs';
import {
  GMI_GEOMETRY_SCOPES, applyGmiPatches, createGmiSourceDocument, editGmiFields, getGmiSourceBytes, gmiObjectLexemes,
  listGmiObjectCells, resolveGmiCell, validateGmiFieldLexeme,
} from '../src/lib/gmi-edit/index.mjs';
import { internalGmiSourceState } from '../src/lib/gmi-edit/sourceDocument.mjs';
import { reconcileGmiSourceIndex } from '../src/lib/gmi-edit/sourceIndex.mjs';

const manifest = JSON.parse(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, 'manifest.json'), 'utf8'));
const fixtureBytes = new Map(await Promise.all(manifest.fixtures.map(async (entry) =>
  [entry.id, new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, entry.file)))])));
const doc = (id) => loadGmiDocument(fixtureBytes.get(id), { label: id });
const editableIds = manifest.fixtures.filter((entry) => entry.expect.status === 'reconciled').map((entry) => entry.id);
const lexeme = (document, scope, sourceIndex, field) =>
  document.parser[scope === 'line' ? 'linesParsed' : 'points'][sourceIndex].attributes[GMI_SOURCE_LEXEMES][field];
const count = (bytes, byte) => bytes.reduce((sum, value) => sum + (value === byte ? 1 : 0), 0);
const indexOfBytes = (haystack, needle) => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
};

// --- fixture integrity ----------------------------------------------------

test('fixture manifest, committed bytes, generator and SHA-256 checksums agree', async () => {
  assert.deepEqual(manifest, buildGmiEditManifest(), 'manifest.json is stale; regenerate with node tests/helpers/gmiEditFixtures.mjs --write');
  assert.equal(manifest.fixtures.length, GMI_EDIT_FIXTURES.length);
  assert.equal(new Set(manifest.fixtures.map((entry) => entry.id)).size, manifest.fixtures.length);
  for (const entry of manifest.fixtures) {
    const bytes = fixtureBytes.get(entry.id);
    assert.equal(sha256Hex(bytes), entry.sha256, `${entry.file} checksum`);
    assert.equal(bytes.length, entry.bytes, `${entry.file} size`);
    const fixture = GMI_EDIT_FIXTURES.find((candidate) => candidate.id === entry.id);
    assert(bytesEqual(bytes, buildGmiEditFixtureBytes(fixture)), `${entry.file} differs from its generator`);
    assert(entry.description.length > 20 && entry.covers.length > 0);
  }
  const onDisk = (await readdir(GMI_EDIT_FIXTURE_DIR)).filter((name) => name.endsWith('.gmi')).sort();
  assert.deepEqual(onDisk, manifest.fixtures.map((entry) => entry.file).sort(), 'no unlisted fixture files');
});

test('fixture bytes carry the intended encodings and line endings', () => {
  const crlf = fixtureBytes.get('core-crlf-latin1'), lf = fixtureBytes.get('core-lf-latin1');
  // CRLF fixture: every LF is preceded by CR. LF fixture: no CR at all.
  assert(count(crlf, 0x0a) > 30 && [...crlf].every((byte, i) => byte !== 0x0a || crlf[i - 1] === 0x0d));
  assert.equal(count(lf, 0x0d), 0);
  assert(bytesEqual(lf, Uint8Array.from([...crlf].filter((byte, i) => !(byte === 0x0d && crlf[i + 1] === 0x0a)))), 'LF twin differs only in EOL bytes');
  // Latin-1 letters are single bytes, and the file is not UTF-8.
  assert(indexOfBytes(crlf, Uint8Array.of(0x52, 0xf8, 0x72)) >= 0, '"Rør" as 52 F8 72');
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(crlf));
  // Windows-1252-only bytes are present as raw bytes.
  const c1 = fixtureBytes.get('cp1252-c1-bytes');
  assert(count(c1, 0x86) >= 2 && count(c1, 0x98) >= 2);
  // UTF-8 without BOM uses multibyte sequences; the BOM fixture starts with EF BB BF.
  const utf8 = fixtureBytes.get('utf8-no-bom');
  assert.notEqual(utf8[0], 0xef);
  assert(indexOfBytes(utf8, Uint8Array.of(0xc3, 0xb8)) >= 0, '"ø" as C3 B8');
  assert.deepEqual([...fixtureBytes.get('guard-utf8-bom').subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(count(fixtureBytes.get('guard-cr-only'), 0x0a), 0);
  for (const entry of manifest.fixtures) {
    const document = doc(entry.id);
    assert.equal(document.describe.encodingClass, entry.expect.encodingClass, `${entry.id} encoding class`);
    assert.equal(document.describe.eol.kind, entry.expect.eolKind, `${entry.id} EOL kind`);
    assert.equal(document.describe.bom, entry.encoding === 'utf8-bom' ? 'utf8' : null);
    if (entry.expect.c1Bytes) assert.deepEqual(document.describe.c1Bytes, entry.expect.c1Bytes);
  }
});

test('git stores the fixtures without EOL conversion (narrow .gitattributes rule)', (t) => {
  let git;
  try { git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim(); git('--version'); } catch { t.skip('git unavailable'); return; }
  for (const entry of manifest.fixtures) {
    const file = `tests/fixtures/gmi-edit/${entry.file}`;
    assert.match(git('check-attr', 'text', '--', file), /: text: unset$/, `${file} must be -text`);
    // With the attribute, the clean filter is a no-op: index bytes == working bytes.
    assert.equal(git('hash-object', '--', file), git('hash-object', '--no-filters', '--', file), `${file} would be converted on add`);
  }
  // The rule is narrow: an ordinary source file is unaffected.
  assert.doesNotMatch(git('check-attr', 'text', '--', 'src/lib/parsing/gmiParser.js'), /unset/);
});

test('fixtures cover every grammar family required by the planning report', () => {
  const covered = new Set(manifest.fixtures.flatMap((entry) => entry.covers));
  for (const family of ['crlf', 'lf', 'latin1-norwegian', 'cp1252-0x86', 'cp1252-0x98', 'utf8-no-bom', 'trailing-semicolons',
    'index-extent-padding', 'section-t', 't-label-rot', 'section-y', 'section-o-coordobs', 'geometry-xyh', 'no-guid',
    'hyperlink-mid-row', 'hyperlink-1-to-6-wrappers', 'hyperlink-sign', 'hyperlink-bare', 'hyperlink-pdf', 'hyperlink-sos',
    'hyperlink-directory-only', 'shared-photo', 'merknad-odd-quotes', 'sdr-empty-cells', 'sdr-absent-column']) {
    assert(covered.has(family), `missing coverage: ${family}`);
  }
  // Every realGrammarFamilies shape appears in the committed hyperlink fixture,
  // read back from the file through the production parser.
  const hyperlinks = doc('hyperlink-families').parser.points.map((point) => point.attributes[GMI_SOURCE_LEXEMES].S_HYPERLINK);
  const signatures = new Set(hyperlinks.map(grammarFamilySignature));
  for (const family of realGrammarFamilies) assert(signatures.has(grammarFamilySignature(family)), 'real grammar family shape missing');
  const wrapperCounts = new Set(hyperlinks.map((value) => extractHyperlinkOccurrences(value).sources[0].members.filter((m) => m.key === 'link').length));
  for (const n of [1, 2, 3, 4, 5, 6]) assert(wrapperCounts.has(n), `${n} wrappers`);
  const targets = hyperlinks.flatMap((value) => extractHyperlinkOccurrences(value).occurrences.map((o) => o.referenceRaw));
  assert.deepEqual(targets.filter((target) => !target.startsWith('Attachments\\')), ['SYNT_BARE_2.jpg'], 'only the bare-filename case lacks the Attachments\\ prefix');
  // Fabricated only: no signer or filename from the real families is copied.
  const fixtureText = new TextDecoder('iso-8859-1').decode(fixtureBytes.get('hyperlink-families'));
  for (const family of realGrammarFamilies) for (const [, value] of family.matchAll(/:"([^"]+)"/g)) assert(!fixtureText.includes(value));
  // Structure expectations of specific fixtures.
  const extra = new TextDecoder('iso-8859-1').decode(fixtureBytes.get('extra-sections'));
  for (const marker of ['[T_]', '[+T_]', '[Y_]', '[+Y_]', '[O_COORDOBS]', '_rot ', '_label ', '/XYH ', '\r\n/XY\r\n']) assert(extra.includes(marker), marker);
  const noGuid = doc('no-guid');
  assert([...noGuid.parser.points, ...noGuid.parser.linesParsed].every((object) => object.guid === null));
  const sdrEmpty = doc('sdr-empty'), sdrAbsent = doc('sdr-absent');
  assert(sdrEmpty.parser.lineFieldNames.includes('SDR') && sdrEmpty.parser.linesParsed.some((line) => line.attributes.SDR === null));
  assert(!sdrAbsent.parser.lineFieldNames.includes('SDR') && sdrAbsent.parser.linesParsed.every((line) => !('SDR' in line.attributes)));
  const quotes = doc('merknad-quotes').parser.points.map((point) => point.attributes.Merknad);
  assert(quotes.some((value) => (value.match(/"/g) || []).length % 2 === 1), 'odd quote count kept in one lexeme');
});

// --- classification and reconciliation (T2) -------------------------------

test('reference harness classification matches the manifest for every fixture', () => {
  for (const entry of manifest.fixtures) {
    const document = doc(entry.id);
    assert.equal(document.status, entry.expect.status, `${entry.id} status (${document.reasons.join(',')})`);
    if (entry.expect.reasons) assert.deepEqual(document.reasons, entry.expect.reasons, `${entry.id} reasons`);
    if (entry.expect.status === 'parser-error') continue;
    assert.equal(document.counts.points, entry.expect.points, `${entry.id} points`);
    assert.equal(document.counts.lines, entry.expect.lines, `${entry.id} lines`);
    assert.equal(document.counts.nonEditableObjects, entry.expect.nonEditableObjects ?? 0, `${entry.id} non-editable objects`);
    assert.deepEqual(document.mismatches, []);
  }
});

test('T2 (reference): every parser lexeme equals its independently indexed byte span', () => {
  for (const id of [...editableIds, 'guard-mixed-eol', 'guard-repeated-section']) {
    const document = doc(id);
    assert.equal(document.text.length, document.bytes.length, `${id} 1 char per byte`);
    assert(document.counts.lexemes > 0);
    for (const [scope, collection] of [['point', 'points'], ['line', 'linesParsed']]) {
      document.parser[collection].forEach((object, sourceIndex) => {
        const lexemes = object.attributes[GMI_SOURCE_LEXEMES];
        if (!lexemes) return;
        for (const [field, { span }] of cellSpans(document.index.objects[scope][sourceIndex])) {
          // Compare raw bytes, not decoded text, at the indexed span.
          assert(bytesEqual(document.bytes.subarray(span[0], span[1]), encodeSingleByte(lexemes[field])), `${id} ${scope}:${sourceIndex}:${field}`);
        }
      });
    }
  }
  const core = doc('core-crlf-latin1');
  const sdr = cellSpans(core.index.objects.line[0]).get('SDR').span;
  assert.equal(core.text.slice(...sdr), '11.0');
  assert.equal(lexeme(core, 'line', 0, 'S_HYPERLINK'), 'h:1(link:"Attachments\\SYNT_L1_A.jpg") ');
});

test('non-reconcilable and parser-error inputs are reported and never repaired', () => {
  const original = fixtureBytes.get('core-crlf-latin1');
  const before = sha256Hex(original);
  // A deliberately wrong index (drops the last point, shifts one span) must fail the gate.
  const broken = loadGmiDocument(original, { indexer: (text) => {
    const index = indexGmiSource(text);
    index.objects.point.pop();
    index.objects.line[0].fieldValueLines[0].spans[0][1] -= 1;
    return index;
  } });
  assert.equal(broken.status, 'not-reconcilable');
  assert.deepEqual([...new Set(broken.mismatches.map((m) => m.code))].sort(), ['lexeme-span', 'object-count']);
  for (const id of ['guard-cr-only', 'guard-utf8-bom']) {
    const document = doc(id);
    assert.equal(document.status, 'parser-error');
    assert(bytesEqual(document.bytes, fixtureBytes.get(id)));
  }
  assert.equal(sha256Hex(original), before, 'input bytes untouched');
  assert.notEqual(broken.bytes, original, 'harness works on a private copy');
});

// --- no-change identity (T1) ----------------------------------------------

test('T1 (reference): no-op output rebuilt from parser lexemes at indexed spans is byte-identical', () => {
  for (const id of [...editableIds, 'guard-mixed-eol', 'guard-repeated-section']) {
    const document = doc(id);
    const result = checkNoOpIdentity(document);
    // Not a passthrough: one re-encoded patch per lexeme.
    assert.equal(result.patches, document.counts.lexemes, `${id} patch count`);
    assert(result.identical, `${id} identical`);
    assert.equal(result.sha256, manifest.fixtures.find((entry) => entry.id === id).sha256);
  }
  // Sensitivity: a one-byte span drift breaks identity, so the check is real.
  const drift = doc('cp1252-c1-bytes');
  const spans = drift.index.objects.point[0].fieldValueLines[0].spans;
  spans[4][0] += 1;
  assert.equal(checkNoOpIdentity(drift).identical, false);
});

// --- targeted changes (T3, T4, T8) ----------------------------------------

test('T3 (reference): a single-cell change is confined to its span and reparses to exactly one changed lexeme', () => {
  for (const id of editableIds) {
    const document = doc(id);
    const result = checkSingleCellChange(document);
    if (id === 'hyperlink-families' || id === 'guard-irregular-objects') { assert.equal(result.applicable, false, id); continue; }
    assert(result.applicable, id);
    assert(result.ok, `${id}: ${result.failures.join(',')}`);
    assert(result.prefixIntact && result.suffixIntact);
    assert.equal(lexeme({ parser: result.reparsed }, result.target.scope, result.target.sourceIndex, result.target.field), result.target.lexeme);
  }
  const core = doc('core-crlf-latin1');
  const result = checkSingleCellChange(core);
  assert.deepEqual(result.target, { scope: 'line', sourceIndex: 1, field: 'SDR', lexeme: '11.0' });
  assert.equal(result.output.length, core.bytes.length + 4);
  assert.equal(result.reparsed.linesParsed[1].attributes.SDR, 11);
  assert.equal(count(result.output, 0x0d), count(core.bytes, 0x0d), 'CRLF preserved');
  assert.deepEqual(result.reparsed.header, core.parser.header);
  // Windows-1252 bytes elsewhere survive an edit untouched (T8).
  const cp = doc('cp1252-c1-bytes');
  const cpResult = checkSingleCellChange(cp);
  assert(cpResult.ok);
  assert.equal(count(cpResult.output, 0x86), count(cp.bytes, 0x86));
  assert.equal(count(cpResult.output, 0x98), count(cp.bytes, 0x98));
});

test('T4 (reference): fills in first, middle and last columns, whitespace replacement and clear stay contained', () => {
  const document = doc('sdr-empty');
  const cells = [
    { scope: 'line', sourceIndex: 0, field: 'S_FCODE', lexeme: 'VL' },
    { scope: 'line', sourceIndex: 0, field: 'SDR', lexeme: '11.0' },
    { scope: 'line', sourceIndex: 0, field: 'Datafangstdato', lexeme: '2026-09-02' },
    { scope: 'line', sourceIndex: 1, field: 'SDR', lexeme: '17.0' },
    { scope: 'line', sourceIndex: 2, field: 'SDR', lexeme: '' },
  ];
  const { output } = applyCellChanges(document, cells);
  const verification = verifyCellChanges(document, output, cells);
  assert(verification.ok, verification.failures.join(','));
  assert.equal(verification.reparsed.linesParsed[2].attributes.SDR, null);
  assert.equal(verification.reparsed.linesParsed[1].attributes.SDR, 17);
  assert.throws(() => applyCellChanges(document, [{ scope: 'line', sourceIndex: 0, field: '', lexeme: 'x' }]), /trailing-empty-field/);
  assert.throws(() => applyCellChanges(doc('sdr-absent'), [{ scope: 'line', sourceIndex: 0, field: 'SDR', lexeme: '11.0' }]), /field-absent/);
});

test('T8 (reference): lexeme encoding policy', () => {
  const latin = doc('core-crlf-latin1'), utf8 = doc('utf8-no-bom');
  assert.deepEqual([...encodeLexeme(latin, 'ÆØÅ æøå')], [0xc6, 0xd8, 0xc5, 0x20, 0xe6, 0xf8, 0xe5]);
  for (const bad of ['a;b', 'a\nb', 'a\rb', 'a\x00b', 'a\x1fb']) assert.throws(() => encodeLexeme(latin, bad), /forbidden/);
  assert.throws(() => encodeLexeme(latin, 'snømann ☃'), /no single-byte encoding/);
  assert.throws(() => encodeLexeme(utf8, 'ø'), /non-ascii-in-utf8/);
  const { output } = applyCellChanges(utf8, [{ scope: 'line', sourceIndex: 0, field: 'SDR', lexeme: '11.0' }]);
  assert(verifyCellChanges(utf8, output, [{ scope: 'line', sourceIndex: 0, field: 'SDR', lexeme: '11.0' }]).ok);
  assert(indexOfBytes(output, Uint8Array.of(0xc3, 0xb8)) >= 0, 'UTF-8 sequences outside the cell survive');
});

test('verifier and splice detect violations instead of passing them', () => {
  const document = doc('core-crlf-latin1');
  const sdr = { scope: 'line', sourceIndex: 1, field: 'SDR', lexeme: '11.0' };
  // Patch Merknad but claim SDR.
  const merknad = cellSpans(document.index.objects.line[1]).get('Merknad').span;
  const wrong = applyReferencePatches(document.bytes, [{ start: merknad[0], end: merknad[1], bytes: encodeSingleByte('endret') }]);
  assert.deepEqual(verifyCellChanges(document, wrong, [sdr]).failures.sort(), ['target-lexeme-wrong', 'untargeted-lexeme-changed', 'untargeted-value-changed']);
  // Change a coordinate digit (also an unpatched line).
  const coordinate = document.text.indexOf('581940.000');
  const moved = applyReferencePatches(document.bytes, [{ start: coordinate, end: coordinate + 1, bytes: encodeSingleByte('6') }]);
  assert.deepEqual(verifyCellChanges(document, moved, []).failures.sort(), ['object-identity-or-geometry-changed', 'unpatched-line-changed']);
  // Change the header.
  const version = document.text.indexOf('_VERSION 2') + 9;
  const header = applyReferencePatches(document.bytes, [{ start: version, end: version + 1, bytes: encodeSingleByte('3') }]);
  assert(verifyCellChanges(document, header, []).failures.includes('header-changed'));
  // Convert one CRLF to LF.
  const eol = document.text.indexOf('\r\n');
  const eolChanged = applyReferencePatches(document.bytes, [{ start: eol, end: eol + 1, bytes: new Uint8Array() }]);
  assert(verifyCellChanges(document, eolChanged, []).failures.includes('unpatched-line-changed'));
  // Splice guards: overlap, stale expectation, range.
  assert.throws(() => applyReferencePatches(document.bytes, [{ start: 10, end: 20, bytes: new Uint8Array() }, { start: 15, end: 25, bytes: new Uint8Array() }]), /overlap/);
  assert.throws(() => applyReferencePatches(document.bytes, [{ start: 0, end: 1, bytes: new Uint8Array(), expect: Uint8Array.of(0x41) }]), /expect-mismatch/);
  assert.throws(() => applyReferencePatches(document.bytes, [{ start: 0, end: document.bytes.length + 1, bytes: new Uint8Array() }]), /out-of-range/);
});

test('irregular objects are not editable; the rest of the file still is', () => {
  const document = doc('guard-irregular-objects');
  assert.deepEqual(document.index.objects.point.map((object) => object.issues), [
    [], ['multiple-fieldvalues'], ['more-values-than-names'], ['fewer-values-than-names'], ['no-fieldvalues'],
  ]);
  for (const sourceIndex of [1, 2, 3, 4]) {
    assert.throws(() => applyCellChanges(document, [{ scope: 'point', sourceIndex, field: 'S_FCODE', lexeme: 'KUM' }]), /not-editable/);
  }
  const cells = [{ scope: 'point', sourceIndex: 0, field: 'Kumform', lexeme: 'R' }];
  assert(verifyCellChanges(document, applyCellChanges(document, cells).output, cells).ok);
  // Parser last-wins for the double _FIELDVALUES object is mirrored, not "fixed".
  assert.equal(document.parser.points[1].attributes.Merknad, 'Andre linje');
});

test('unparsed sections, /XYH and /XY geometry and _label/_rot survive a field change byte-for-byte', () => {
  const document = doc('extra-sections');
  const cells = [{ scope: 'line', sourceIndex: 1, field: 'SDR', lexeme: '11.0' }];
  const { output } = applyCellChanges(document, cells);
  assert(verifyCellChanges(document, output, cells).ok);
  const text = new TextDecoder('iso-8859-1').decode(output);
  const tail = (source, marker) => source.slice(source.indexOf(marker));
  assert.equal(tail(text, '[+Y_]'), tail(document.text, '[+Y_]'));
  assert.equal(text.slice(0, document.text.indexOf('[+L_]')), document.text.slice(0, document.text.indexOf('[+L_]')));
});

// --- hyperlink wrapper removal (T9, T10 GMI part) -------------------------

test('T9 (reference): removing each wrapper keeps every other link and its sign metadata byte-identical', () => {
  const document = doc('hyperlink-families');
  const values = document.parser.points.map((point) => point.attributes[GMI_SOURCE_LEXEMES].S_HYPERLINK);
  const byCase = Object.fromEntries(HYPERLINK_CASES.map((entry, index) => [entry.id, values[index]]));
  let positions = 0;
  for (const value of values) {
    const record = extractHyperlinkOccurrences(value).sources[0];
    if (!value.trim() || !record.validGrammar) continue;
    for (const ordinal of new Set(record.members.map((member) => member.wrapperOrdinal))) {
      const plan = planWrapperRemoval(value, ordinal);
      if (!plan.ok) { assert.equal(plan.reason, 'multi-link-wrapper'); continue; }
      positions++;
      assert(verifyWrapperRemoval(value, plan.lexeme, ordinal).ok);
      // Everything outside the removed range is the original text.
      if (plan.removedRange) assert.equal(plan.lexeme || value.slice(0, plan.removedRange[0]) + value.slice(plan.removedRange[1]),
        value.slice(0, plan.removedRange[0]) + value.slice(plan.removedRange[1]));
    }
  }
  assert(positions >= 50, `exercised ${positions} wrapper positions`);
  // Specific grammar outcomes.
  assert.equal(planWrapperRemoval(byCase['bare-relative-path'], null).lexeme, '');
  assert.equal(planWrapperRemoval(byCase['family-6'], 0).lexeme, '', 'last wrapper removed -> empty lexeme');
  assert.equal(planWrapperRemoval(byCase['multi-link-wrapper'], 0).reason, 'multi-link-wrapper');
  assert.equal(planWrapperRemoval(byCase['invalid-grammar'], 0).reason, 'invalid-grammar');
  assert.equal(planWrapperRemoval(byCase['no-trailing-space'], 1).lexeme, 'h:1(link:"Attachments\\SYNT_NT_1.jpg") ');
  const mixed = planWrapperRemoval(byCase['mixed-photo-pdf-sos'], 0).lexeme;
  assert.equal(mixed, byCase['mixed-photo-pdf-sos'].slice(byCase['mixed-photo-pdf-sos'].indexOf('h:2(')));
  // Ordinals are not renumbered by the reference harness (open decision Q3).
  assert.deepEqual(extractHyperlinkOccurrences(mixed).occurrences.map((o) => o.wrapperNumber), [2, 3, 4]);
  const signed = planWrapperRemoval(byCase['family-1'], 0).lexeme;
  assert.equal(extractHyperlinkOccurrences(signed).sources[0].members.filter((m) => m.key === 'sign').length, 5);
});

test('T9 (reference): file-level removal reparses to the original references minus the removed ones', () => {
  for (const choose of ['first', 'last']) {
    const document = doc('hyperlink-families');
    const result = checkHyperlinkRemoval(document, { choose });
    assert(result.applicable && result.ok, `${choose}: ${result.failures?.join(',')}`);
    assert.deepEqual(result.stats.rejected, { 'no-photo-target': 3, 'multi-link-wrapper': 1, 'invalid-grammar': 1 });
    const after = loadGmiDocument(result.output);
    assert.equal(after.status, 'reconciled');
    // Non-photo, directory-only, multi-link and invalid values are byte-identical.
    for (const id of ['pdf-signed', 'sos', 'directory-only', 'multi-link-wrapper', 'invalid-grammar']) {
      const sourceIndex = HYPERLINK_CASES.findIndex((entry) => entry.id === id);
      assert.equal(lexeme(after, 'point', sourceIndex, 'S_HYPERLINK'), lexeme(document, 'point', sourceIndex, 'S_HYPERLINK'), id);
    }
    const mixedIndex = HYPERLINK_CASES.findIndex((entry) => entry.id === 'mixed-photo-pdf-sos');
    const kept = extractHyperlinkOccurrences(lexeme(after, 'point', mixedIndex, 'S_HYPERLINK')).occurrences.map((o) => o.referenceRaw);
    assert(kept.includes('Attachments\\SYNT_MIX_2.pdf') && kept.includes('Attachments\\SYNT_MIX_4.sos'));
  }
});

test('T10 (reference, GMI part): a photo linked from two objects keeps the link that is not removed', () => {
  const document = doc('shared-photo');
  const photos = ['SYNT_DELT_1.jpg', 'SYNT_EGEN_2.jpg', 'SYNT_EGEN_3.jpg'].map((name) => ({ id: `photo:${name}`, originalFilename: name, sourceRelativePath: `Attachments\\${name}` }));
  const review = (parser) => reviewGmiPhotoSource({ ...createGmiPhotoSource(parser, 'synthetic'), id: 'shared' }, photos);
  const before = review(document.parser);
  assert.equal(before.reverseIndexes.byPhotoId['photo:SYNT_DELT_1.jpg'].length, 2, 'one photo, two objects');
  // Remove the line's link only.
  const cells = [{ scope: 'line', sourceIndex: 0, field: 'S_HYPERLINK', lexeme: planWrapperRemoval(lexeme(document, 'line', 0, 'S_HYPERLINK'), 0).lexeme }];
  const { output } = applyCellChanges(document, cells);
  const verification = verifyCellChanges(document, output, cells);
  assert(verification.ok, verification.failures.join(','));
  const after = review(verification.reparsed);
  const edges = after.reverseIndexes.byPhotoId['photo:SYNT_DELT_1.jpg'].map((id) => after.associationsById[id].objectKey);
  assert.deepEqual(edges, [`guid:${document.parser.points[0].guid}`]);
  assert.equal(after.summary.matchedReferenceCount, before.summary.matchedReferenceCount - 1);
});

test('existing realGrammarFamilies values pass removal in the shared synthetic envelope (in memory only)', () => {
  const bytes = encodeSingleByte(gmiText(realGrammarFamilies.map((hyperlink) => ({ hyperlink }))));
  const document = loadGmiDocument(bytes);
  assert.equal(document.status, 'reconciled');
  assert(checkNoOpIdentity(document).identical);
  for (const choose of ['first', 'last']) {
    const result = checkHyperlinkRemoval(document, { choose });
    assert(result.ok, result.failures?.join(','));
    assert.equal(result.stats.lexemeFailures, 0);
    assert.equal(result.removedReferences, realGrammarFamilies.length);
  }
});

test('existing gmi-v32 fixtures reconcile with the reference harness (whatever EOLs the checkout has)', async () => {
  const root = path.resolve('tests/fixtures/gmi-v32');
  const v32 = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  for (const fixture of v32.fixtures) {
    const document = loadGmiDocument(new Uint8Array(await readFile(path.join(root, fixture.file))));
    if (fixture.parser === 'throw') { assert.equal(document.status, 'parser-error', fixture.id); continue; }
    assert.deepEqual(document.mismatches, [], fixture.id);
    assert(['reconciled', 'unsupported'].includes(document.status), fixture.id);
    assert(checkNoOpIdentity(document).identical, fixture.id);
  }
});

test('fixture files are unchanged after every check above', async () => {
  for (const entry of manifest.fixtures) {
    assert.equal(sha256Hex(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, entry.file))), entry.sha256, entry.file);
  }
});

// --- optional private corpus ----------------------------------------------
// GMI_EDIT_CORPUS=<dir>[<path.delimiter><dir>...]  read-only; counts only.
// GMI_EDIT_CORPUS_STRICT=1 additionally requires zero non-reconcilable files.

const corpusDirectories = (process.env.GMI_EDIT_CORPUS || '').split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);

test('private corpus: reference checks on every byte-unique GMI; every original file unchanged',
  { skip: corpusDirectories.length ? false : 'set GMI_EDIT_CORPUS to run', timeout: 600000 }, async () => {
    const files = await discoverGmiFiles(corpusDirectories);
    assert(files.length > 0, 'GMI_EDIT_CORPUS contains no .gmi files');
    const before = new Map();
    for (const filename of files) before.set(filename, sha256Hex(await readFile(filename)));
    const stats = await scanGmiCorpus(files);
    assert.deepEqual(await discoverGmiFiles(corpusDirectories), files, 'no file added, removed or renamed');
    let unchanged = 0;
    for (const filename of files) if (sha256Hex(await readFile(filename)) === before.get(filename)) unchanged++;
    console.log(JSON.stringify({ gmiEditCorpus: { ...stats, unchangedFileHashes: unchanged } }));
    assert.equal(unchanged, files.length, 'every corpus file hash unchanged');
    assert.deepEqual(stats.harnessErrors, {}, 'harness exceptions');
    assert.equal(stats.noOp.identical, stats.noOp.checked, 'no-op identity on every reconciled file');
    assert.equal(stats.singleCell.ok, stats.singleCell.applicable, 'single-cell containment');
    assert.equal(stats.hyperlink.ok, stats.hyperlink.files, 'hyperlink removal');
    assert.equal(stats.hyperlink.lexemeFailures, 0);
    if (process.env.GMI_EDIT_CORPUS_STRICT === '1') assert.equal(stats.status['not-reconcilable'] || 0, 0, 'strict: non-reconcilable files');
  });

test('private corpus (production): M1 library agrees with the reference harness on every byte-unique GMI; files unchanged',
  { skip: corpusDirectories.length ? false : 'set GMI_EDIT_CORPUS to run', timeout: 600000 }, async () => {
    const files = await discoverGmiFiles(corpusDirectories);
    assert(files.length > 0, 'GMI_EDIT_CORPUS contains no .gmi files');
    const before = new Map();
    for (const filename of files) before.set(filename, sha256Hex(await readFile(filename)));
    const stats = await scanGmiCorpusProduction(files);
    assert.deepEqual(await discoverGmiFiles(corpusDirectories), files, 'no file added, removed or renamed');
    let unchanged = 0;
    for (const filename of files) if (sha256Hex(await readFile(filename)) === before.get(filename)) unchanged++;
    console.log(JSON.stringify({ gmiEditCorpusProduction: { ...stats, unchangedFileHashes: unchanged } }));
    assert.equal(unchanged, files.length, 'every corpus file hash unchanged');
    assert.deepEqual(stats.errors, {}, 'exceptions');
    assert.deepEqual(stats.agreement.unexpected, {}, 'production status differs from the reference outside the documented M1 policy');
    assert.equal(stats.lexemes.production, stats.lexemes.reference);
    assert.equal(stats.nonEditableObjects.production, stats.nonEditableObjects.reference);
    assert.equal(stats.spans.mismatches, 0, 'every production span equals the reference span');
    assert.deepEqual(stats.spans.mismatchCodes, {});
    assert.equal(stats.noOp.identical, stats.noOp.checked, 'T1 on every editable file');
    assert.equal(stats.noOp.readOnlyRejected, stats.production.readOnly, 'read-only files refuse edits');
    assert.equal(stats.noOp.readOnlyBytesIdentical, stats.production.readOnly, 'read-only files stay readable');
    for (const key of ['ok', 'identicalToReference', 'referenceVerifierOk']) {
      assert.equal(stats.singleCell[key], stats.singleCell.applicable, `single-cell ${key}`);
      assert.equal(stats.multiCell[key], stats.multiCell.files, `multi-cell ${key}`);
    }
    assert.equal(stats.negative.staleRejected, stats.negative.checked);
    assert.equal(stats.negative.tamperRejected, stats.negative.checked);
    assert.equal(stats.coordinatePolicy.editable, stats.coordinatePolicy.files, 'coordinate-warning files editable under the M1 policy');
    assert.equal(stats.coordinatePolicy.repairRejected, stats.coordinatePolicy.editable, 'repairing a malformed vertex line is rejected');
    assert.equal(stats.coordinatePolicy.malformedLinesPreserved, stats.coordinatePolicy.malformedLines);
    assert.equal(stats.sourceIntact, stats.uniqueFiles - (stats.production.status['too-large'] || 0), 'source documents never mutated');
  });

// --- M1 acceptance: production library (src/lib/gmi-edit) -----------------

const prod = (id) => createGmiSourceDocument(fixtureBytes.get(id), { filename: manifest.fixtures.find((entry) => entry.id === id).file });
const readOnlyIds = manifest.fixtures.filter((entry) => entry.expect.status !== 'reconciled').map((entry) => entry.id);
const edit = (document, scope, sourceIndex, field, next) => {
  const resolved = resolveGmiCell(document, { scope, sourceIndex, field });
  assert(resolved.ok, `${scope}:${sourceIndex}:${field} ${resolved.code}`);
  return { target: { scope, sourceIndex, field }, expected: resolved.cell.lexeme, lexeme: next };
};
// Byte ranges [start, end) in the source where output differs (aligned by the
// common prefix and suffix around each patch, independent of the splice).
function differingSourceRange(source, output) {
  let prefix = 0;
  while (prefix < source.length && prefix < output.length && source[prefix] === output[prefix]) prefix++;
  let suffix = 0;
  while (suffix < source.length - prefix && suffix < output.length - prefix && source[source.length - 1 - suffix] === output[output.length - 1 - suffix]) suffix++;
  return prefix === source.length && prefix === output.length ? null : [prefix, source.length - suffix];
}

test('T1 (production): a no-change export is byte-identical for every fixture; read-only fixtures stay readable but refuse edits', () => {
  for (const entry of manifest.fixtures) {
    const document = prod(entry.id);
    const original = fixtureBytes.get(entry.id);
    assert(bytesEqual(getGmiSourceBytes(document), original), `${entry.id} source bytes`);
    if (!document.editable) {
      assert(readOnlyIds.includes(entry.id), `${entry.id} unexpectedly read-only (${document.reasons})`);
      const refused = editGmiFields(document, []);
      assert.equal(refused.ok, false);
      assert.equal(refused.rejections[0].code, 'document-not-editable');
      assert.equal('bytes' in refused, false, 'no bytes from a refused export');
      continue;
    }
    const result = editGmiFields(document, []);
    assert(result.ok, `${entry.id}: ${JSON.stringify(result.rejections)}`);
    assert(bytesEqual(result.bytes, original), `${entry.id} identical`);
    assert.equal(sha256Hex(result.bytes), entry.sha256);
    assert.equal(result.verification.summary.targetedCells, 0);
    const spliced = applyGmiPatches(document, []);
    assert(spliced.ok && bytesEqual(spliced.bytes, original));
    // The output is a copy: changing it cannot reach the source.
    result.bytes[0] ^= 0xff;
    assert(bytesEqual(getGmiSourceBytes(document), original));
  }
  assert.deepEqual(readOnlyIds.sort(), ['guard-cr-only', 'guard-mixed-eol', 'guard-repeated-section', 'guard-utf8-bom']);
});

test('T2 (production): source document reconciliation matches the reference harness; unsupported inputs are read-only with reasons', () => {
  for (const entry of manifest.fixtures) {
    const document = prod(entry.id), reference = doc(entry.id);
    const expected = expectedProductionStatus(reference);
    assert.equal(expected.policy, 'same', `${entry.id}: no fixture is affected by the coordinate policy`);
    assert.equal(document.status, entry.expect.status, `${entry.id} status (${document.reasons.join(',')})`);
    assert.equal(document.status, expected.status);
    assert.equal(document.editable, entry.expect.status === 'reconciled');
    assert.equal(document.encoding.encodingClass, entry.expect.encodingClass);
    assert.equal(document.encoding.eol.kind, entry.expect.eolKind);
    assert.deepEqual(document.mismatches, []);
    if (entry.expect.reasons) assert.deepEqual([...document.reasons], entry.expect.reasons, `${entry.id} reasons`);
    if (entry.expect.status === 'parser-error') {
      assert.deepEqual([...document.reasons], ['parser-throws']);
      assert.equal(document.counts, null);
      continue;
    }
    assert.equal(document.counts.points, entry.expect.points);
    assert.equal(document.counts.lines, entry.expect.lines);
    assert.equal(document.counts.lexemes, reference.counts.lexemes);
    assert.equal(document.counts.nonEditableObjects, entry.expect.nonEditableObjects ?? 0);
    // Every production span equals the harness span, and holds the parser lexeme as raw bytes.
    const state = internalGmiSourceState(document);
    for (const { scope, collection } of GMI_GEOMETRY_SCOPES) {
      reference.parser[collection].forEach((object, sourceIndex) => {
        const referenceSpans = cellSpans(reference.index.objects[scope][sourceIndex]);
        const productionSpans = state.objects[scope][sourceIndex].spans;
        assert.equal(productionSpans.size, referenceSpans.size);
        const lexemes = gmiObjectLexemes(document, scope, sourceIndex) || {};
        for (const [field, { position, span }] of referenceSpans) {
          assert.deepEqual(productionSpans.get(field), { position, span }, `${entry.id} ${scope}:${sourceIndex}:${field}`);
          assert(bytesEqual(getGmiSourceBytes(document).subarray(...span), encodeSingleByte(lexemes[field])));
        }
      });
    }
    // Read-only documents remain inspectable but no cell resolves.
    if (!document.editable) {
      assert.equal(resolveGmiCell(document, { scope: 'point', sourceIndex: 0, field: 'S_FCODE' }).code, 'document-not-editable');
      assert(listGmiObjectCells(document, 'point', 0).every((cell) => !cell.editable && cell.reason === 'document-not-editable'));
      assert(document.parser.points.length > 0);
    }
  }
  // The gate rejects a wrong index, including a span moved to identical text in another object.
  const document = prod('core-crlf-latin1');
  const { text, parser, index } = internalGmiSourceState(document);
  const tamper = (mutate) => {
    const copy = structuredClone(index);
    mutate(copy);
    return [...new Set(reconcileGmiSourceIndex({ text, parser, index: copy }).mismatches.map((m) => m.code))].sort();
  };
  assert.deepEqual(reconcileGmiSourceIndex({ text, parser, index }).mismatches, []);
  assert.deepEqual(tamper((copy) => copy.objects.point.pop()), ['object-count']);
  assert.deepEqual(tamper((copy) => { copy.objects.line[0].fieldValueLines[0].spans[0][1] -= 1; }), ['lexeme-span', 'span-not-contiguous']);
  const sameText = tamper((copy) => {
    // line 0 and line 1 both have S_FCODE "VL": point line 0's cell at line 1's bytes.
    assert.equal(text.slice(...copy.objects.line[0].fieldValueLines[0].spans[0]), text.slice(...copy.objects.line[1].fieldValueLines[0].spans[0]));
    copy.objects.line[0].fieldValueLines[0].spans[0] = [...copy.objects.line[1].fieldValueLines[0].spans[0]];
  });
  assert(sameText.length > 0 && !sameText.includes('lexeme-span'), `identical text elsewhere is caught structurally: ${sameText}`);
  assert.deepEqual(tamper((copy) => { copy.objects.line[2].guid = 'x'; }), ['object-guid']);
});

test('T3 (production): single-cell changes stay inside their span and reparse to exactly the intended lexeme', () => {
  for (const id of editableIds) {
    const document = prod(id), reference = doc(id);
    const chosen = chooseSingleCellTarget(reference);
    const target = chosen ? { scope: chosen.scope, sourceIndex: chosen.sourceIndex, field: chosen.field } : id === 'hyperlink-families'
      ? { scope: 'point', sourceIndex: 0, field: 'Merknad' } : { scope: 'point', sourceIndex: 0, field: 'Kumform' };
    const next = chosen?.lexeme ?? 'Endret';
    const request = edit(document, target.scope, target.sourceIndex, target.field, next);
    const result = editGmiFields(document, [request]);
    assert(result.ok, `${id}: ${JSON.stringify(result.rejections)}`);
    const [patch] = result.patches;
    // Diff range within the patch range.
    const range = differingSourceRange(fixtureBytes.get(id), result.bytes);
    assert(range && range[0] >= patch.start && range[1] <= patch.end, `${id} diff ${range} within [${patch.start}, ${patch.end})`);
    // Identical to the reference splice, and accepted by the reference verifier.
    const cells = [{ ...target, lexeme: next }];
    assert(bytesEqual(result.bytes, applyCellChanges(reference, cells).output), `${id} equals reference output`);
    const referenceCheck = verifyCellChanges(reference, result.bytes, cells);
    assert(referenceCheck.ok, `${id} reference verifier: ${referenceCheck.failures}`);
    assert.equal(lexeme({ parser: referenceCheck.reparsed }, target.scope, target.sourceIndex, target.field), next);
    assert.equal(result.verification.summary.changedCells, 1);
    // The verified output reloads as an editable document with the same structure.
    assert.equal(result.verification.outputDocument.status, 'reconciled');
  }
  const core = prod('core-crlf-latin1');
  const result = editGmiFields(core, [edit(core, 'line', 1, 'SDR', '11.0')]);
  assert(result.ok);
  assert.equal(result.bytes.length, core.size + 4);
  assert.equal(result.verification.outputDocument.parser.linesParsed[1].attributes.SDR, 11);
  assert.equal(count(result.bytes, 0x0d), count(fixtureBytes.get('core-crlf-latin1'), 0x0d), 'CRLF preserved');
  assert.deepEqual(result.verification.outputDocument.parser.header, core.parser.header);
  // Irregular objects are refused; the regular one in the same file is editable.
  const irregular = prod('guard-irregular-objects');
  for (const sourceIndex of [1, 2, 3, 4]) {
    assert.equal(resolveGmiCell(irregular, { scope: 'point', sourceIndex, field: 'S_FCODE' }).code, 'object-not-editable');
  }
  assert(editGmiFields(irregular, [edit(irregular, 'point', 0, 'Kumform', 'R')]).ok);
  assert.equal(irregular.parser.points[1].attributes.Merknad, 'Andre linje', 'parser last-wins is observed, not "fixed"');
});

test('T4 (production): fills and clears in first, middle, last and trailing-empty columns, alone and together', () => {
  const document = prod('sdr-empty');
  // line 0: ['', VL, PE, 110, '', PN10, '', '', ''] + structural trailing ''.
  const edits = [
    edit(document, 'line', 0, 'S_FCODE', 'VL'), // fill, first column
    edit(document, 'line', 0, 'SDR', '11.0'), // fill, middle column
    edit(document, 'line', 0, 'Merknad', 'Fylt'), // fill between two empty columns
    edit(document, 'line', 0, 'Datafangstdato', '2026-09-02'), // fill, last (trailing-empty) column
    edit(document, 'line', 1, 'SDR', '17.0'), // replace whitespace-only value
    edit(document, 'line', 1, 'S_FCODE', ''), // clear, first column
    edit(document, 'line', 2, 'SDR', ''), // clear, middle column
    edit(document, 'line', 3, 'Datafangstdato', ''), // clear, last column
  ];
  for (const single of edits) {
    const result = editGmiFields(document, [single]);
    assert(result.ok, `${JSON.stringify(single.target)}: ${JSON.stringify(result.rejections)}`);
    const range = differingSourceRange(fixtureBytes.get('sdr-empty'), result.bytes);
    const [patch] = result.patches;
    if (range) assert(range[0] >= patch.start && range[1] <= patch.end);
  }
  const result = editGmiFields(document, edits);
  assert(result.ok, JSON.stringify(result.rejections));
  const lines = result.verification.outputDocument.parser.linesParsed;
  assert.deepEqual([lines[0].attributes.S_FCODE, lines[0].attributes.SDR, lines[0].attributes.Merknad, lines[0].attributes.Datafangstdato], ['VL', 11, 'Fylt', '2026-09-02']);
  assert.deepEqual([lines[1].attributes.S_FCODE, lines[1].attributes.SDR, lines[2].attributes.SDR, lines[3].attributes.Datafangstdato], [null, 17, null, null]);
  assert(verifyCellChanges(doc('sdr-empty'), result.bytes, edits.map((entry) => ({ ...entry.target, lexeme: entry.lexeme }))).ok, 'reference verifier agrees');
  const text = new TextDecoder('iso-8859-1').decode(result.bytes);
  assert(text.includes('_FIELDVALUES VL;VL;PE;110;11.0;PN10;;Fylt;2026-09-02;\r\n'), 'trailing ";" and CRLF kept');
  // Points: fill and clear the last column.
  const core = prod('core-crlf-latin1'), coreLf = prod('core-lf-latin1');
  const pointEdits = (target) => [edit(target, 'point', 1, 'Kumform', 'R'), edit(target, 'point', 0, 'Kumform', ''), edit(target, 'line', 2, 'SDR', '11.0')];
  const crlf = editGmiFields(core, pointEdits(core)), lf = editGmiFields(coreLf, pointEdits(coreLf));
  assert(crlf.ok && lf.ok);
  // The LF twin's edited output differs from the CRLF output only in EOL bytes.
  assert(bytesEqual(lf.bytes, Uint8Array.from([...crlf.bytes].filter((byte, i) => !(byte === 0x0d && crlf.bytes[i + 1] === 0x0a)))));
  assert.equal(count(lf.bytes, 0x0d), 0);
  // The structural trailing slot and absent columns are not targets.
  assert.equal(resolveGmiCell(document, { scope: 'line', sourceIndex: 0, field: '' }).code, 'unnamed-field');
  assert.equal(resolveGmiCell(prod('sdr-absent'), { scope: 'line', sourceIndex: 0, field: 'SDR' }).code, 'field-absent');
});

test('T8 (production): lexeme validation and per-encoding-class encoding; Windows-1252 bytes elsewhere preserved', () => {
  const ok = (value, encodingClass) => [...validateGmiFieldLexeme(value, encodingClass).bytes];
  const code = (value, encodingClass = 'single-byte') => validateGmiFieldLexeme(value, encodingClass).code;
  assert.deepEqual(ok('ÆØÅ æøå', 'single-byte'), [0xc6, 0xd8, 0xc5, 0x20, 0xe6, 0xf8, 0xe5]);
  assert.deepEqual(ok('Rør', 'ascii'), [0x52, 0xf8, 0x72]);
  assert.deepEqual(ok('', 'single-byte'), []);
  assert.deepEqual(ok('11.0', 'utf8-likely'), [0x31, 0x31, 0x2e, 0x30]);
  assert.equal(code('a;b'), 'lexeme-semicolon');
  for (const value of ['a\nb', 'a\rb', 'a\r\nb']) assert.equal(code(value), 'lexeme-line-break');
  for (const value of ['a\tb', 'a\x00b', 'a\x1fb', 'a\x7fb', '\x0b']) assert.equal(code(value), 'lexeme-control-character');
  for (const value of ['\x85', '\x80', '\x9f']) assert.equal(code(value), 'lexeme-c1-control');
  for (const value of ['€', '†', '˜', '☃', '😀', ' ']) assert.equal(code(value), 'lexeme-unrepresentable', value);
  const decomposed = validateGmiFieldLexeme('Rör', 'single-byte');
  assert.equal(decomposed.code, 'lexeme-unrepresentable');
  assert.equal(decomposed.nfcRepresentable, true, 'never normalized silently, but reported');
  assert.equal(code(11), 'lexeme-not-string');
  assert.equal(code(null), 'lexeme-not-string');
  assert.equal(code('ø', 'utf8-likely'), 'lexeme-non-ascii-in-utf8');
  assert.equal(code('a', 'utf8-bom'), 'encoding-not-editable');

  // Windows-1252 0x86/0x98 elsewhere survive, at the same positions relative to the edit.
  const cp = prod('cp1252-c1-bytes');
  const source = fixtureBytes.get('cp1252-c1-bytes');
  const result = editGmiFields(cp, [edit(cp, 'line', 0, 'SDR', '11.0'), edit(cp, 'point', 1, 'Kumform', 'Rund kum øst')]);
  assert(result.ok, JSON.stringify(result.rejections));
  assert.equal(count(result.bytes, 0x86), count(source, 0x86));
  assert.equal(count(result.bytes, 0x98), count(source, 0x98));
  assert.equal(result.bytes.length, source.length + 4 + 12);
  assert.equal(result.verification.outputDocument.encoding.encodingClass, 'single-byte');
  assert.deepEqual(result.verification.outputDocument.encoding.c1Bytes, [0x86, 0x98]);
  // A value that held a Windows-1252 character can be replaced with ASCII; writing one is refused.
  assert(editGmiFields(cp, [edit(cp, 'point', 1, 'Merknad', 'Kryss og tilde')]).ok);
  assert.equal(editGmiFields(cp, [edit(cp, 'point', 1, 'Merknad', 'Kryss †')]).rejections[0].code, 'lexeme-unrepresentable');

  // UTF-8 without BOM: ASCII edits only; multibyte sequences elsewhere intact; still valid UTF-8.
  const utf8 = prod('utf8-no-bom');
  assert.equal(editGmiFields(utf8, [edit(utf8, 'line', 0, 'Merknad', 'Rør')]).rejections[0].code, 'lexeme-non-ascii-in-utf8');
  const utf8Result = editGmiFields(utf8, [edit(utf8, 'line', 0, 'SDR', '11.0'), edit(utf8, 'line', 0, 'Merknad', 'Ror under bekk')]);
  assert(utf8Result.ok, JSON.stringify(utf8Result.rejections));
  assert(indexOfBytes(utf8Result.bytes, Uint8Array.of(0xc3, 0x98)) >= 0, '"Ø" in the untouched point Merknad');
  assert.doesNotThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(utf8Result.bytes));
  assert.equal(utf8Result.verification.outputDocument.encoding.encodingClass, 'utf8-likely');

  // ASCII file: Latin-1 letters allowed (becomes single-byte); bytes that would turn
  // the file into valid multibyte UTF-8 are refused by the verifier.
  const ascii = prod('sdr-empty');
  const latin = editGmiFields(ascii, [edit(ascii, 'line', 0, 'Merknad', 'Grøft')]);
  assert(latin.ok);
  assert.equal(latin.verification.outputDocument.encoding.encodingClass, 'single-byte');
  const drift = editGmiFields(ascii, [edit(ascii, 'line', 0, 'Merknad', 'Ã¸')]);
  assert.equal(drift.ok, false);
  assert.equal(drift.stage, 'verify');
  assert.deepEqual(drift.rejections.map((entry) => entry.code), ['encoding-class-drift']);
  assert.equal('bytes' in drift, false);
});
