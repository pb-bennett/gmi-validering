// M7: source-preserving S_HYPERLINK reference removal composer.
// Synthetic data only. The opt-in private corpus test prints counts only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { GMI_EDIT_FIXTURE_DIR, sha256Hex } from './helpers/gmiEditFixtures.mjs';
import { loadGmiDocument, planWrapperRemoval, verifyCellChanges, verifyWrapperRemoval } from './helpers/gmiEditHarness.mjs';
import {
  buildGmiText, edgesOf, latin1Bytes, link, objectKeyAt, photosFor, selectByFilename, selectionFor,
  sessionPhotoSource, utf8Bytes, wrappers,
} from './helpers/gmiHyperlinkRemovalFixtures.mjs';
import {
  GMI_HYPERLINK_ORDINAL_POLICIES, applyGmiHyperlinkRemoval, createGmiEditSession, createGmiObjectCorrection,
  getGmiProposedBytes, getGmiProposedState, getGmiSourceBytes, isGmiHyperlinkRemovalPlan, loadGmiSourceDocument,
  planGmiHyperlinkRemoval, stageGmiChangeSet, verifyGmiHyperlinkRemoval,
} from '../src/lib/gmi-edit/index.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';

const fixtureBytes = async (name) => new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, name)));
const loadFixture = async (name) => { const bytes = await fixtureBytes(name); return { bytes, document: await loadGmiSourceDocument(bytes, { filename: name }) }; };

function allImageNames(document) {
  const source = createGmiPhotoSource(document.parser, document.fingerprint);
  return [...new Set(source.references.filter((reference) => reference.targetValid).map((reference) => reference.filename))];
}

const authorize = (plan) => ({ selectionKeys: plan.selections.map((selection) => selection.selectionKey) });

// Byte containment oracle: output differs from input only inside the intended
// S_HYPERLINK spans, and each span holds the planned lexeme (M0 reference
// verifier, independent of the production engine).
function assertContained(bytes, output, plan, extra = []) {
  const reference = loadGmiDocument(bytes);
  const intended = [...extra, ...plan.cells.map((cell) => ({ scope: cell.scope, sourceIndex: cell.sourceIndex, field: 'S_HYPERLINK', lexeme: cell.proposed }))];
  const result = verifyCellChanges(reference, output, intended);
  assert.deepEqual(result.failures, [], 'M0 reference verifier');
  // Raw byte walk: everything outside the cell spans is identical and ordered.
  const spans = plan.cells.map((cell) => [cell.start, cell.end, latin1Bytes(cell.proposed)]).sort((a, b) => a[0] - b[0]);
  if (!extra.length) {
    const parts = []; let cursor = 0;
    for (const [start, end, next] of spans) { parts.push(bytes.subarray(cursor, start), next); cursor = end; }
    parts.push(bytes.subarray(cursor));
    const expected = Buffer.concat(parts.map((part) => Buffer.from(part)));
    assert.equal(Buffer.compare(expected, Buffer.from(output)), 0, 'bytes outside the planned spans are identical');
  }
}

function reparse(output) {
  const parser = new GMIParser(decodeGmiBytes(output));
  assert.deepEqual(parser.errors, []);
  return createGmiPhotoSource(parser, null);
}

test('first, middle, last and only wrapper removal match the M0 oracle; sign metadata preserved (preserve and renumber)', async () => {
  const { bytes, document } = await loadFixture('hyperlink-families.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  const five = objectKeyAt(source, 'point', 12);    // SYNT_FEM_1..5, alternating sign
  const only = objectKeyAt(source, 'point', 6);     // one wrapper
  const cases = [[five, 'SYNT_FEM_1.jpg', 0], [five, 'SYNT_FEM_3.jpg', 2], [five, 'SYNT_FEM_5.jpg', 4], [only, 'SYNT_F6_1.jpg', 0]];
  for (const [objectKey, filename, wrapperOrdinal] of cases) {
    for (const ordinalPolicy of Object.values(GMI_HYPERLINK_ORDINAL_POLICIES)) {
      const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selectByFilename(source, objectKey, filename)], ordinalPolicy });
      assert.equal(plan.status, 'ready', `${filename} ${ordinalPolicy}: ${JSON.stringify(plan.blockers)}`);
      const [cell] = plan.cells;
      const oracle = planWrapperRemoval(cell.original, wrapperOrdinal);
      assert(oracle.ok);
      if (ordinalPolicy === 'preserve') assert.equal(cell.proposed, oracle.lexeme);
      else assert.equal(cell.proposed.replace(/h:\d+\(/g, 'h:#('), oracle.lexeme.replace(/h:\d+\(/g, 'h:#('));
      if (ordinalPolicy === 'preserve') assert(verifyWrapperRemoval(cell.original, cell.proposed, wrapperOrdinal).ok);
      const numbers = [...cell.proposed.matchAll(/h:(\d+)\(/g)].map((match) => Number(match[1]));
      if (ordinalPolicy === 'renumber') assert.deepEqual(numbers, numbers.map((_, index) => index + 1));
      if (ordinalPolicy === 'preserve') assert.equal(cell.ordinalChanges.length, 0);
      // sign metadata survives byte for byte
      const signs = (value) => [...value.matchAll(/sign:"[^"]*"/g)].map((match) => match[0]);
      const removedSign = cell.removedReferences[0].rawWrapper.match(/sign:"[^"]*"/)?.[0];
      const expectedSigns = signs(cell.original); if (removedSign) expectedSigns.splice(expectedSigns.indexOf(removedSign), 1);
      assert.deepEqual(signs(cell.proposed), expectedSigns);
      const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
      assert(result.ok, JSON.stringify(result.rejections));
      assertContained(bytes, result.bytes, plan);
      assert.equal(result.verification.hyperlink.removedReferences, 1);
    }
  }
  const only1 = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selectByFilename(source, only, 'SYNT_F6_1.jpg')] });
  assert.equal(only1.cells[0].proposed, '');
  assert.equal(only1.counts.clearedCells, 1);
});

test('every wrapper position of every observed grammar family (T9), with multiple remaining wrappers', async () => {
  const { bytes, document } = await loadFixture('hyperlink-families.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  let removals = 0;
  const multiLink = objectKeyAt(source, 'point', 22);
  for (const edge of edgesOf(source).filter((candidate) => candidate.objectKey !== multiLink)) {
    for (const ordinalPolicy of ['renumber', 'preserve']) {
      const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selectionFor(source, edge)], ordinalPolicy });
      assert.equal(plan.status, 'ready', JSON.stringify(plan.blockers));
      // Exact lexeme against the independent M0 oracle (wrapper + following whitespace).
      const [cell] = plan.cells;
      const oracle = planWrapperRemoval(cell.original, cell.removedReferences[0].wrapperOrdinal);
      assert(oracle.ok);
      const digitsFree = (value) => value.replace(/h:\d+\(/g, 'h:#(');
      if (ordinalPolicy === 'preserve') {
        assert.equal(cell.proposed, oracle.lexeme);
        assert(verifyWrapperRemoval(cell.original, cell.proposed, cell.removedReferences[0].wrapperOrdinal).ok);
      } else assert.equal(digitsFree(cell.proposed), digitsFree(oracle.lexeme));
      const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
      assert(result.ok, JSON.stringify(result.rejections));
      assertContained(bytes, result.bytes, plan);
      const before = createGmiPhotoSource(document.parser), after = reparse(result.bytes);
      assert.equal(after.references.length, before.references.length - edge.referenceIds.length);
      removals++;
    }
  }
  assert(removals >= 100, `covered ${removals} removals`);
});

test('renumbering changes only digits; preserve keeps gaps; both are explicit', async () => {
  const value = wrappers([link('Attachments\\R_1.jpg', 'Måler'), link('Attachments\\R_2.jpg'), link('Attachments\\R_3.jpg', 'Måler'), link('Attachments\\R_4.jpg')]);
  const bytes = latin1Bytes(buildGmiText({ points: [{ hyperlink: value }] }));
  const document = await loadGmiSourceDocument(bytes);
  const source = sessionPhotoSource(document, photosFor(['R_1.jpg', 'R_2.jpg', 'R_3.jpg', 'R_4.jpg']));
  const key = objectKeyAt(source, 'point', 0);
  const selections = [selectByFilename(source, key, 'R_1.jpg'), selectByFilename(source, key, 'R_3.jpg')];
  const renumber = planGmiHyperlinkRemoval(document, { photoSource: source, selections });
  assert.equal(renumber.ordinalPolicy, 'renumber');
  assert.equal(renumber.cells[0].proposed, 'h:1(link:"Attachments\\R_2.jpg") h:2(link:"Attachments\\R_4.jpg") ');
  assert.deepEqual(renumber.cells[0].ordinalChanges, [{ wrapperOrdinal: 1, from: '2', to: '1' }, { wrapperOrdinal: 3, from: '4', to: '2' }]);
  const preserve = planGmiHyperlinkRemoval(document, { photoSource: source, selections, ordinalPolicy: 'preserve' });
  assert.equal(preserve.cells[0].proposed, 'h:2(link:"Attachments\\R_2.jpg") h:4(link:"Attachments\\R_4.jpg") ');
  assert.equal(preserve.counts.ordinalChanges, 0);
  assert(preserve.warnings.some((warning) => warning.code === 'gemini-g4-unverified'));
  for (const plan of [renumber, preserve]) {
    const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
    assert(result.ok, JSON.stringify(result.rejections));
    assertContained(bytes, result.bytes, plan);
  }
  const bad = planGmiHyperlinkRemoval(document, { photoSource: source, selections, ordinalPolicy: 'gap-fill' });
  assert.equal(bad.status, 'blocked');
  assert.equal(bad.blockers[0].code, 'invalid-ordinal-policy');
});

test('bare single-path values are cleared; mixed bare text is never treated as one path', async () => {
  const { bytes, document } = await loadFixture('hyperlink-families.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  for (const [index, filename] of [[13, 'SYNT_BARE_1.jpg'], [14, 'SYNT_BARE_2.jpg']]) {
    const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selectByFilename(source, objectKeyAt(source, 'point', index), filename)] });
    assert.equal(plan.status, 'ready', JSON.stringify(plan.blockers));
    assert.equal(plan.cells[0].proposed, '');
    assert.equal(plan.cells[0].removedReferences[0].bare, true);
    const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
    assert(result.ok);
    assertContained(bytes, result.bytes, plan);
  }
  const mixed = latin1Bytes(buildGmiText({ points: [{ hyperlink: 'Attachments\\M_1.jpg Attachments\\M_2.jpg' }] }));
  const mixedDocument = await loadGmiSourceDocument(mixed);
  const mixedSource = sessionPhotoSource(mixedDocument, photosFor(['M_2.jpg']));
  const [edge] = edgesOf(mixedSource);
  assert(edge, 'the FOTO resolver accepts the basename');
  const plan = planGmiHyperlinkRemoval(mixedDocument, { photoSource: mixedSource, selections: [selectionFor(mixedSource, edge)] });
  assert.equal(plan.status, 'blocked');
  assert.deepEqual(plan.blockers.map((blocker) => blocker.code), ['bare-value-not-single-path']);
});

test('multi-link wrappers are rejected; non-image, directory-only, invalid, ambiguous and unmatched references are never removed', async () => {
  const { document } = await loadFixture('hyperlink-families.gmi');
  const names = allImageNames(document);
  const source = sessionPhotoSource(document, photosFor(names));
  const multi = objectKeyAt(source, 'point', 22);
  const multiPlan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selectByFilename(source, multi, 'SYNT_ML_1.jpg')] });
  assert.equal(multiPlan.status, 'blocked');
  assert.deepEqual(multiPlan.blockers.map((blocker) => blocker.code), ['multi-link-wrapper']);
  assert.equal(multiPlan.edits.length, 0);

  // Mixed photo/pdf/sos: the photos go, PDF and SOS stay byte-identical.
  const mixed = objectKeyAt(source, 'point', 17);
  const plan = planGmiHyperlinkRemoval(document, { photoSource: source,
    selections: [selectByFilename(source, mixed, 'SYNT_MIX_1.jpg'), selectByFilename(source, mixed, 'SYNT_MIX_3.jpg')] });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.cells[0].proposed, 'h:1(link:"Attachments\\SYNT_MIX_2.pdf") h:2(link:"Attachments\\SYNT_MIX_4.sos") ');
  assert.deepEqual(plan.cells[0].retainedReferences.map((reference) => reference.filename), ['SYNT_MIX_2.pdf', 'SYNT_MIX_4.sos']);

  // Forged selections for references without a confident edge.
  const forged = (index, predicate) => {
    const objectKey = objectKeyAt(source, 'point', index);
    const reference = source.references.find((candidate) => candidate.objectKey === objectKey && predicate(candidate));
    return { sourceFingerprint: source.fingerprint, objectKey, assetId: 'asset-forged', referenceIds: [reference.id] };
  };
  for (const [index, predicate, expected] of [
    [15, () => true, 'reference-not-confident'],                                    // pdf
    [16, () => true, 'reference-not-confident'],                                    // sos
    [18, () => true, 'reference-not-confident'],                                    // directory-only
    [17, (reference) => reference.filename === 'SYNT_MIX_2.pdf', 'reference-not-confident'],
  ]) {
    const blocked = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [forged(index, predicate)] });
    assert.equal(blocked.status, 'blocked');
    const codes = blocked.blockers.map((blocker) => blocker.code);
    assert(codes.includes('association-not-confident') && codes.includes(expected), codes.join());
  }
  // Invalid grammar yields no reference at all.
  assert.equal(source.references.filter((reference) => reference.objectKey === objectKeyAt(source, 'point', 23)).length, 0);

  // Ambiguous (two candidate photos) and unmatched (no photo) never form edges.
  const ambiguousSource = sessionPhotoSource(document, [...photosFor(names), { id: 'asset-dup', originalFilename: 'SYNT_F6_1.jpg', sourceRelativePath: null }]);
  const onlyKey = objectKeyAt(ambiguousSource, 'point', 6);
  const onlyRef = ambiguousSource.references.find((reference) => reference.objectKey === onlyKey);
  assert.equal(ambiguousSource.associationLedger.reverseIndexes.byReferenceId[onlyRef.id].status, 'ambiguous');
  const ambiguous = planGmiHyperlinkRemoval(document, { photoSource: ambiguousSource,
    selections: [{ sourceFingerprint: document.fingerprint, objectKey: onlyKey, assetId: 'asset-dup', referenceIds: [onlyRef.id] }] });
  assert.deepEqual(ambiguous.blockers.map((blocker) => blocker.code).sort(), ['association-not-confident', 'reference-not-confident']);
  const unmatchedSource = sessionPhotoSource(document, []);
  const unmatched = planGmiHyperlinkRemoval(document, { photoSource: unmatchedSource,
    selections: [{ sourceFingerprint: document.fingerprint, objectKey: onlyKey, assetId: 'asset-x', referenceIds: [onlyRef.id] }] });
  assert.equal(unmatched.status, 'blocked');
});

test('stale fingerprint, object identity, raw wrapper and ledger grouping mismatches block the plan', async () => {
  const { document } = await loadFixture('hyperlink-families.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  const objectKey = objectKeyAt(source, 'point', 2);
  const good = selectByFilename(source, objectKey, 'SYNT_F2_2.jpg');
  const codes = (plan) => plan.blockers.map((blocker) => blocker.code);

  assert.deepEqual(codes(planGmiHyperlinkRemoval(document, { photoSource: source, selections: [{ ...good, sourceFingerprint: 'sha256:00', key: undefined }] })), ['stale-source-fingerprint']);
  assert(codes(planGmiHyperlinkRemoval(document, { photoSource: source, selections: [{ ...good, key: '["x"]' }] })).includes('occurrence-key-mismatch'));
  const other = await loadGmiSourceDocument(await fixtureBytes('shared-photo.gmi'));
  assert.deepEqual(codes(planGmiHyperlinkRemoval(other, { photoSource: source, selections: [good] })), ['photo-source-fingerprint-mismatch']);
  const unfingerprinted = await import('../src/lib/gmi-edit/index.mjs').then((m) => m.createGmiSourceDocument(getGmiSourceBytes(document)));
  assert(codes(planGmiHyperlinkRemoval(unfingerprinted, { photoSource: source, selections: [good] })).includes('document-fingerprint-unavailable'));

  const tamperObject = (patch) => Object.freeze({ ...source, objectsByKey: { ...source.objectsByKey, [objectKey]: { ...source.objectsByKey[objectKey], ...patch } } });
  for (const patch of [{ sourceIndex: 3 }, { guid: '5ec0e000-0000-4000-8000-000000000000' }, { parserId: 99 }, { hyperlinkRaw: 'h:1(link:"x.jpg") ' }]) {
    assert.deepEqual(codes(planGmiHyperlinkRemoval(document, { photoSource: tamperObject(patch), selections: [good] })), ['object-evidence-mismatch'], JSON.stringify(patch));
  }
  const tamperReference = (patch) => Object.freeze({ ...source, references: source.references.map((reference) => (reference.id === good.referenceIds[0] ? { ...reference, ...patch } : reference)) });
  for (const patch of [{ rawWrapper: 'h:2(link:"Attachments\\SYNT_F2_2.jpg")' }, { referenceRaw: 'Attachments\\SYNT_F2_9.jpg' }, { wrapperOrdinal: 0 }, { rawStart: 1 }]) {
    assert.deepEqual(codes(planGmiHyperlinkRemoval(document, { photoSource: tamperReference(patch), selections: [good] })), ['reference-evidence-mismatch'], JSON.stringify(patch));
  }
  // Stale ledger: edge grouping disagrees with the selection.
  const twoRefs = { ...good, referenceIds: [...good.referenceIds, selectByFilename(source, objectKey, 'SYNT_F2_1.jpg').referenceIds[0]] };
  assert(codes(planGmiHyperlinkRemoval(document, { photoSource: source, selections: [twoRefs] })).includes('reference-set-mismatch'));
  // Not live / unknown source id / not accepted asset.
  assert(codes(planGmiHyperlinkRemoval(document, { photoSource: Object.freeze({ ...source, loadedBinding: { live: false } }), selections: [good] })).includes('photo-source-not-live'));
  assert(codes(planGmiHyperlinkRemoval(document, { photoSource: source, selections: [{ ...good, sourceId: 'photo-gmi-other' }] })).includes('photo-source-mismatch'));
  assert(codes(planGmiHyperlinkRemoval(document, { photoSource: source, selections: [good], acceptedAssetIds: [] })).includes('asset-not-accepted'));
  assert.equal(planGmiHyperlinkRemoval(document, { photoSource: source, selections: [good], acceptedAssetIds: [good.assetId] }).status, 'ready');
  // Duplicate selection.
  assert(codes(planGmiHyperlinkRemoval(document, { photoSource: source, selections: [good, { ...good }] })).includes('duplicate-selection'));
});

test('a shared photograph is removed only from the selected object; links elsewhere and the file reference stay', async () => {
  const { bytes, document } = await loadFixture('shared-photo.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  const line = objectKeyAt(source, 'line', 0), point = objectKeyAt(source, 'point', 0);
  const fromPoint = selectByFilename(source, point, 'SYNT_DELT_1.jpg');
  const fromLine = selectByFilename(source, line, 'SYNT_DELT_1.jpg');
  assert.equal(fromPoint.assetId, fromLine.assetId);

  const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [fromPoint] });
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.cells.map((cell) => cell.objectKey), [point]);
  assert.deepEqual(plan.warnings.find((warning) => warning.code === 'photo-linked-elsewhere'), { code: 'photo-linked-elsewhere', assetId: fromPoint.assetId, retainedObjectKeys: [line] });
  const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
  assert(result.ok);
  assertContained(bytes, result.bytes, plan);
  const after = reparse(result.bytes);
  assert.equal(after.objectsByKey[line].hyperlinkRaw, source.objectsByKey[line].hyperlinkRaw);
  assert.equal(after.objectsByKey[point].hyperlinkRaw, 'h:1(link:"Attachments\\SYNT_EGEN_2.jpg") ');

  const reverse = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [fromLine] });
  assert.deepEqual(reverse.cells.map((cell) => [cell.scope, cell.proposed]), [['line', '']]);
  const both = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [fromLine, fromPoint] });
  assert.equal(both.cells.length, 2);
  assert(!both.warnings.some((warning) => warning.code === 'photo-linked-elsewhere'));
});

test('duplicate references within one value follow the ledger grouping; ambiguous ownership is rejected', async () => {
  const value = wrappers([link('Attachments\\D_A.jpg', 'Måler'), link('Attachments\\D_B.jpg'), link('Attachments\\D_A.jpg')]);
  const bytes = latin1Bytes(buildGmiText({ points: [{ hyperlink: value }] }));
  const document = await loadGmiSourceDocument(bytes);
  const source = sessionPhotoSource(document, photosFor(['D_A.jpg', 'D_B.jpg']));
  const key = objectKeyAt(source, 'point', 0);
  const selection = selectByFilename(source, key, 'D_A.jpg');
  assert.equal(selection.referenceIds.length, 2, 'the ledger groups both copies');
  const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selection] });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.cells[0].proposed, 'h:1(link:"Attachments\\D_B.jpg") ');
  assert.equal(plan.counts.removedReferences, 2);
  const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
  assert(result.ok);
  assert.equal(result.verification.hyperlink.removedReferences, 2);

  // Only one copy selected: the grouping disagrees.
  const partial = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [{ ...selection, key: undefined, referenceIds: [selection.referenceIds[0]] }] });
  assert(partial.blockers.some((blocker) => blocker.code === 'reference-set-mismatch'));

  // Contradictory ledger: one copy confident, the other ambiguous.
  const ledger = source.associationLedger;
  const [edgeId] = Object.keys(ledger.associationsById).filter((id) => ledger.associationsById[id].photoId === selection.assetId);
  const [keep, other] = selection.referenceIds;
  const contradictory = {
    ...ledger,
    associationsById: { ...ledger.associationsById, [edgeId]: { ...ledger.associationsById[edgeId], referenceIds: [keep] } },
    reverseIndexes: { ...ledger.reverseIndexes, byReferenceId: { ...ledger.reverseIndexes.byReferenceId,
      [other]: { referenceId: other, objectKey: key, status: 'ambiguous', photoIds: [selection.assetId, 'asset-x'] } } },
  };
  const blocked = planGmiHyperlinkRemoval(document, { photoSource: source, associationLedger: contradictory,
    selections: [{ ...selection, key: undefined, referenceIds: [keep] }] });
  assert.deepEqual(blocked.blockers.map((blocker) => blocker.code), ['ambiguous-duplicate-reference']);
});

test('composition with staged M2 field corrections: one verified application against the original; stale state refused', async () => {
  const { bytes, document } = await loadFixture('shared-photo.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  const point = objectKeyAt(source, 'point', 0);
  let session = createGmiEditSession(document, { layerId: 'layer-m7' });
  const correction = createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0, values: { Merknad: 'Rettet M7' }, mode: 'overwrite' });
  assert(correction.ok);
  session = stageGmiChangeSet(session, correction.changeSet).session;
  const lineFix = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11.0' }, mode: 'overwrite' });
  session = stageGmiChangeSet(session, lineFix.changeSet).session;
  // M2 still refuses S_HYPERLINK, unchanged.
  assert.equal(createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0, values: { S_HYPERLINK: '' }, mode: 'overwrite' }).ok, false);

  const selection = selectByFilename(source, point, 'SYNT_EGEN_2.jpg');
  const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selection], session });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.basis.session.fieldEditCount, 2);
  const result = applyGmiHyperlinkRemoval(plan, { session, authorization: authorize(plan) });
  assert(result.ok, JSON.stringify(result.rejections));
  assert.equal(result.fieldEditCount, 2);
  assertContained(bytes, result.bytes, plan, [
    { scope: 'point', sourceIndex: 0, field: 'Merknad', lexeme: 'Rettet M7' },
    { scope: 'line', sourceIndex: 0, field: 'SDR', lexeme: '11.0' },
  ]);
  const reparsed = new GMIParser(decodeGmiBytes(result.bytes));
  assert.equal(reparsed.points[0].attributes.Merknad, 'Rettet M7');
  assert.equal(reparsed.points[0].attributes.S_HYPERLINK.trim(), 'h:1(link:"Attachments\\SYNT_DELT_1.jpg" sign:"Feltmåler A")');
  // The M2 proposal is unaffected, and the original is unchanged.
  assert.equal(sha256Hex(getGmiSourceBytes(document)), sha256Hex(bytes));
  assert.notEqual(sha256Hex(getGmiProposedBytes(getGmiProposedState(session))), sha256Hex(result.bytes));

  // Stale: another correction after planning.
  const later = createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 1, values: { Merknad: 'Senere' }, mode: 'overwrite' });
  const laterSession = stageGmiChangeSet(session, later.changeSet).session;
  assert.equal(applyGmiHyperlinkRemoval(plan, { session: laterSession, authorization: authorize(plan) }).rejections[0].code, 'stale-session-state');
  assert.equal(applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) }).rejections[0].code, 'session-required');
  const noSession = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selection] });
  assert.equal(applyGmiHyperlinkRemoval(noSession, { session, authorization: authorize(noSession) }).rejections[0].code, 'session-not-in-plan-basis');
  // Planning against another document's session is refused.
  const otherSession = createGmiEditSession(await loadGmiSourceDocument(bytes));
  assert.equal(planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selection], session: otherSession }).blockers[0].code, 'session-document-mismatch');
});

test('empty selection is a byte-identical no-op (with and without M2 edits)', async () => {
  const { bytes, document } = await loadFixture('hyperlink-families.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [] });
  assert.equal(plan.status, 'empty');
  assert.equal(plan.ok, true);
  const result = applyGmiHyperlinkRemoval(plan);
  assert(result.ok && result.identical);
  assert.equal(sha256Hex(result.bytes), sha256Hex(bytes));

  let session = createGmiEditSession(document);
  const correction = createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0, values: { Merknad: 'X' }, mode: 'overwrite' });
  session = stageGmiChangeSet(session, correction.changeSet).session;
  const withSession = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [], session });
  const composed = applyGmiHyperlinkRemoval(withSession, { session });
  assert(composed.ok && !composed.identical);
  assert.equal(sha256Hex(composed.bytes), sha256Hex(getGmiProposedBytes(getGmiProposedState(session))));
});

test('encoding and line endings are preserved; unrepresentable retained text blocks instead of re-encoding', async () => {
  for (const name of ['core-crlf-latin1.gmi', 'core-lf-latin1.gmi', 'no-guid.gmi', 'merknad-quotes.gmi', 'cp1252-c1-bytes.gmi', 'utf8-no-bom.gmi']) {
    const { bytes, document } = await loadFixture(name);
    const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
    const selections = edgesOf(source).map((edge) => selectionFor(source, edge));
    assert(selections.length, name);
    const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections });
    assert.equal(plan.status, 'ready', `${name}: ${JSON.stringify(plan.blockers)}`);
    const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
    assert(result.ok, `${name}: ${JSON.stringify(result.rejections)}`);
    assert.deepEqual(result.document.encoding.eol, document.encoding.eol, name);
    assert.equal(result.document.encoding.bom, document.encoding.bom);
    assertContained(bytes, result.bytes, plan);
    assert.equal(reparse(result.bytes).references.filter((reference) => reference.targetValid).length, 0, `${name}: every photo link removed`);
  }
  // Latin-1 sign retained beside a removed wrapper: the 0xE5 byte survives.
  const latin = latin1Bytes(buildGmiText({ points: [{ hyperlink: wrappers([link('Attachments\\E_1.jpg'), link('Attachments\\E_2.jpg', 'Feltmåler')]) }] }));
  const latinDocument = await loadGmiSourceDocument(latin);
  const latinSource = sessionPhotoSource(latinDocument, photosFor(['E_1.jpg']));
  const latinPlan = planGmiHyperlinkRemoval(latinDocument, { photoSource: latinSource, selections: edgesOf(latinSource).map((edge) => selectionFor(latinSource, edge)) });
  const latinResult = applyGmiHyperlinkRemoval(latinPlan, { authorization: authorize(latinPlan) });
  assert(latinResult.ok);
  assert(Buffer.from(latinResult.bytes).includes(Buffer.from([0x65, 0x6c, 0x74, 0x6d, 0xe5])));
  // LF twin differs from CRLF output only by EOL bytes.
  const crlf = latin1Bytes(buildGmiText({ points: [{ hyperlink: wrappers([link('Attachments\\T_1.jpg'), link('Attachments\\T_2.jpg')]) }] }));
  const lf = latin1Bytes(buildGmiText({ points: [{ hyperlink: wrappers([link('Attachments\\T_1.jpg'), link('Attachments\\T_2.jpg')]) }], eol: '\n' }));
  const outputs = [];
  for (const variant of [crlf, lf]) {
    const variantDocument = await loadGmiSourceDocument(variant);
    const variantSource = sessionPhotoSource(variantDocument, photosFor(['T_1.jpg']));
    const variantPlan = planGmiHyperlinkRemoval(variantDocument, { photoSource: variantSource, selections: edgesOf(variantSource).map((edge) => selectionFor(variantSource, edge)) });
    const variantResult = applyGmiHyperlinkRemoval(variantPlan, { authorization: authorize(variantPlan) });
    assert(variantResult.ok);
    outputs.push(Buffer.from(variantResult.bytes).toString('latin1'));
  }
  assert.equal(outputs[0].replaceAll('\r\n', '\n'), outputs[1]);
  assert(!outputs[1].includes('\r'));

  // A Windows-1252 0x86 byte in a RETAINED wrapper: M1 refuses to encode the
  // lexeme, so the removal blocks (no re-encoding, no weakened safeguard).
  const c1Text = buildGmiText({ points: [{ hyperlink: wrappers([link('Attachments\\C_1.jpg'), link('Attachments\\C_2.jpg', 'X\u0086Y')]) }] });
  const c1Bytes = Uint8Array.from(c1Text, (char) => (char === '\u0086' ? 0x86 : char.charCodeAt(0)));
  const c1Document = await loadGmiSourceDocument(c1Bytes);
  assert(c1Document.editable);
  const c1Source = sessionPhotoSource(c1Document, photosFor(['C_1.jpg']));
  const c1Plan = planGmiHyperlinkRemoval(c1Document, { photoSource: c1Source, selections: edgesOf(c1Source).map((edge) => selectionFor(c1Source, edge)) });
  assert.deepEqual(c1Plan.blockers.map((blocker) => [blocker.code, blocker.detail]), [['retained-lexeme-not-encodable', 'lexeme-unrepresentable']]);
  // Removing the wrapper that carries the C1 byte is fine.
  const c1Other = sessionPhotoSource(c1Document, photosFor(['C_2.jpg']));
  const c1Removal = planGmiHyperlinkRemoval(c1Document, { photoSource: c1Other, selections: edgesOf(c1Other).map((edge) => selectionFor(c1Other, edge)) });
  assert.equal(c1Removal.status, 'ready');
  assert(applyGmiHyperlinkRemoval(c1Removal, { authorization: authorize(c1Removal) }).ok);

  // UTF-8 file with non-ASCII text in a retained wrapper: blocked (M1 ASCII-only policy).
  const utf = utf8Bytes(buildGmiText({ points: [{ hyperlink: wrappers([link('Attachments\\U_1.jpg'), link('Attachments\\U_2.jpg', 'Feltmåler')]) }] }));
  const utfDocument = await loadGmiSourceDocument(utf);
  assert.equal(utfDocument.encoding.encodingClass, 'utf8-likely');
  const utfSource = sessionPhotoSource(utfDocument, photosFor(['U_1.jpg']));
  const utfPlan = planGmiHyperlinkRemoval(utfDocument, { photoSource: utfSource, selections: edgesOf(utfSource).map((edge) => selectionFor(utfSource, edge)) });
  assert.deepEqual(utfPlan.blockers.map((blocker) => blocker.detail), ['lexeme-non-ascii-in-utf8']);
});

test('rejection is atomic, authorization is exact, and output is independent of selection order', async () => {
  const { bytes, document } = await loadFixture('hyperlink-families.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  const selections = edgesOf(source).filter((_, index) => index % 3 === 0).map((edge) => selectionFor(source, edge))
    .filter((selection) => selection.objectKey !== objectKeyAt(source, 'point', 22));
  const forward = planGmiHyperlinkRemoval(document, { photoSource: source, selections });
  const reversed = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [...selections].reverse() });
  const shuffled = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [...selections].sort(() => 0.5 - Math.random()) });
  assert.equal(forward.status, 'ready');
  assert.equal(forward.planKey, reversed.planKey);
  assert.equal(forward.planKey, shuffled.planKey);
  assert.deepEqual(forward.cells, reversed.cells);
  const a = applyGmiHyperlinkRemoval(forward, { authorization: authorize(forward) });
  const b = applyGmiHyperlinkRemoval(reversed, { authorization: { selectionKeys: [...authorize(forward).selectionKeys].reverse() } });
  assert.equal(sha256Hex(a.bytes), sha256Hex(b.bytes));
  assertContained(bytes, a.bytes, forward);

  // One bad selection blocks everything: no cells, no edits, no bytes.
  const multi = selectByFilename(source, objectKeyAt(source, 'point', 22), 'SYNT_ML_1.jpg');
  const mixed = planGmiHyperlinkRemoval(document, { photoSource: source, selections: [...selections, multi] });
  assert.equal(mixed.status, 'blocked');
  assert.equal(mixed.ok, false);
  assert.deepEqual([mixed.cells.length, mixed.edits.length], [0, 0]);
  const refused = applyGmiHyperlinkRemoval(mixed, { authorization: authorize(mixed) });
  assert.equal(refused.ok, false);
  assert.equal(refused.bytes, undefined);
  assert.equal(refused.rejections[0].code, 'plan-blocked');

  // Authorization must name exactly the planned selections (M9 contract).
  assert.equal(applyGmiHyperlinkRemoval(forward).rejections[0].code, 'missing-authorization');
  assert.equal(applyGmiHyperlinkRemoval(forward, { authorization: { selectionKeys: authorize(forward).selectionKeys.slice(1) } }).rejections[0].code, 'authorization-mismatch');
  assert.equal(applyGmiHyperlinkRemoval({ ...forward }, { authorization: authorize(forward) }).rejections[0].code, 'not-a-removal-plan');
  assert(isGmiHyperlinkRemovalPlan(forward));
  assert(Object.isFrozen(forward) && Object.isFrozen(forward.cells[0]) && Object.isFrozen(forward.edits[0].target));
});

test('inputs are never modified: source bytes, FOTO source and ledger are unchanged', async () => {
  const { bytes, document } = await loadFixture('hyperlink-families.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  const snapshot = JSON.stringify(source);
  const selections = edgesOf(source).map((edge) => selectionFor(source, edge)).filter((selection) => selection.objectKey !== objectKeyAt(source, 'point', 22));
  const selectionSnapshot = JSON.stringify(selections);
  const plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections });
  const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
  assert(result.ok);
  assert.equal(JSON.stringify(source), snapshot);
  assert.equal(JSON.stringify(selections), selectionSnapshot);
  assert.equal(sha256Hex(getGmiSourceBytes(document)), sha256Hex(bytes));
  assert.equal(sha256Hex(await fixtureBytes('hyperlink-families.gmi')), sha256Hex(bytes));
  result.bytes.fill(0);
  assert.equal(sha256Hex(getGmiSourceBytes(document)), sha256Hex(bytes));
  // Reimport: references equal the original multiset minus the removed ones.
  const before = createGmiPhotoSource(document.parser);
  const removed = new Set(plan.selections.flatMap((selection) => selection.referenceIds.map((id) => id.slice(`${source.id}:`.length))));
  const again = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
  const after = reparse(again.bytes);
  const view = (reference) => [reference.objectKey, reference.rawMember];
  assert.deepEqual(after.references.map(view), before.references.filter((reference) => !removed.has(reference.id)).map(view));
});

test('the independent reference verifier rejects output that does not match the plan selections', async () => {
  const { document } = await loadFixture('hyperlink-families.gmi');
  const source = sessionPhotoSource(document, photosFor(allImageNames(document)));
  const key = objectKeyAt(source, 'point', 12);
  const planFor = (filename, ordinalPolicy = 'renumber') =>
    planGmiHyperlinkRemoval(document, { photoSource: source, selections: [selectByFilename(source, key, filename)], ordinalPolicy });
  const first = planFor('SYNT_FEM_1.jpg'), second = planFor('SYNT_FEM_2.jpg');
  const firstOutput = applyGmiHyperlinkRemoval(first, { authorization: authorize(first) }).document;
  const secondOutput = applyGmiHyperlinkRemoval(second, { authorization: authorize(second) }).document;
  assert(verifyGmiHyperlinkRemoval(document, firstOutput, first).ok);
  const wrong = verifyGmiHyperlinkRemoval(document, secondOutput, first);
  assert.equal(wrong.ok, false);
  assert(wrong.failures.some((failure) => failure.code === 'retained-reference-changed'));
  // Renumbered output does not satisfy a preserve plan.
  const preserve = planFor('SYNT_FEM_1.jpg', 'preserve');
  const mismatch = verifyGmiHyperlinkRemoval(document, firstOutput, preserve);
  assert(mismatch.failures.some((failure) => failure.code === 'ordinal-changed-under-preserve'));
  // Preserve output does not satisfy a renumber plan.
  const preserveOutput = applyGmiHyperlinkRemoval(preserve, { authorization: authorize(preserve) }).document;
  assert(verifyGmiHyperlinkRemoval(document, preserveOutput, first).failures.some((failure) => failure.code === 'ordinals-not-contiguous'));
  // The unmodified original fails every non-empty plan.
  assert(verifyGmiHyperlinkRemoval(document, document, first).failures.some((failure) => failure.code === 'retained-reference-count-mismatch'));
  // A plan for another document is refused.
  const other = await loadGmiSourceDocument(await fixtureBytes('shared-photo.gmi'));
  assert.equal(verifyGmiHyperlinkRemoval(other, firstOutput, first).failures[0].code, 'not-a-plan-for-document');
});

// --- optional private corpus (counts only; never commit data) -------------
const corpus = process.env.GMI_EDIT_CORPUS;
test('private corpus: confident photo references removed with verified, contained output (counts only)', { skip: !corpus && 'GMI_EDIT_CORPUS not set', timeout: 30 * 60 * 1000 }, async () => {
  const roots = corpus.split(path.delimiter).filter(Boolean);
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.gmi$/i.test(entry.name)) files.push(full);
    }
  };
  for (const root of roots) await walk(root);
  const hashes = new Map();
  for (const file of files) hashes.set(file, sha256Hex(await readFile(file)));
  const seen = new Set();
  const counts = { files: files.length, unique: 0, editable: 0, withEdges: 0, plansReady: 0, plansBlocked: 0, blockerCodes: {},
    removedReferences: 0, cells: 0, clearedCells: 0, ordinalChanges: 0, verified: 0, failures: 0, sharedWarnings: 0 };
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(file));
    const hash = sha256Hex(bytes);
    if (seen.has(hash)) continue;
    seen.add(hash); counts.unique++;
    const document = await loadGmiSourceDocument(bytes);
    if (!document.editable) continue;
    counts.editable++;
    const names = allImageNames(document);
    const source = sessionPhotoSource(document, photosFor(names));
    const edges = edgesOf(source);
    if (!edges.length) continue;
    counts.withEdges++;
    // Every other confident edge (deterministic), so retained neighbours exist.
    const selections = edges.filter((_, index) => index % 2 === 0).map((edge) => selectionFor(source, edge));
    let plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections });
    if (!plan.ok) {
      counts.plansBlocked++;
      for (const blocker of plan.blockers) counts.blockerCodes[blocker.code] = (counts.blockerCodes[blocker.code] || 0) + 1;
      const blockedKeys = new Set(plan.blockers.map((blocker) => blocker.selectionKey));
      plan = planGmiHyperlinkRemoval(document, { photoSource: source, selections: selections.filter((selection) => !blockedKeys.has(selection.key)) });
      if (!plan.ok) continue;
    }
    counts.plansReady++;
    const result = applyGmiHyperlinkRemoval(plan, { authorization: authorize(plan) });
    if (!result.ok) { counts.failures++; continue; }
    const reference = loadGmiDocument(bytes);
    const check = verifyCellChanges(reference, result.bytes, plan.cells.map((cell) => ({ scope: cell.scope, sourceIndex: cell.sourceIndex, field: 'S_HYPERLINK', lexeme: cell.proposed })));
    if (!check.ok) { counts.failures++; continue; }
    counts.verified++;
    counts.removedReferences += plan.counts.removedReferences;
    counts.cells += plan.counts.cells;
    counts.clearedCells += plan.counts.clearedCells;
    counts.ordinalChanges += plan.counts.ordinalChanges;
    counts.sharedWarnings += plan.warnings.filter((warning) => warning.code === 'photo-linked-elsewhere').length;
    assert.equal(sha256Hex(getGmiSourceBytes(document)), hash);
  }
  for (const file of files) assert.equal(sha256Hex(await readFile(file)), hashes.get(file), 'corpus file unchanged');
  assert.equal((await Promise.all(files.map((file) => stat(file)))).length, files.length);
  console.log(`M7 corpus: ${JSON.stringify(counts)}`);
  assert.equal(counts.failures, 0);
});
