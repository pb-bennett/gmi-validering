// Batch 1B.1: pure S_HYPERLINK transfer planner and independent verifier.
// Synthetic data only: every name, filename, signature and GUID is fabricated;
// only the grammar shapes follow the observed delivered values.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeSingleByte } from './helpers/gmiEditFixtures.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import { photosFor } from './helpers/gmiHyperlinkRemovalFixtures.mjs';
import {
  GMI_HYPERLINK_TRANSFER_STATUS, buildGmiHyperlinkTransferProposal, createGmiEditSession, createGmiObjectCorrection,
  editGmiFields, getGmiSourceBytes, gmiHyperlinkCellLayout, isGmiHyperlinkTransferPlan, loadGmiSourceDocument,
  planGmiHyperlinkRemoval, planGmiHyperlinkTransfer, stageGmiChangeSet, verifyGmiHyperlinkTransfer,
} from '../src/lib/gmi-edit/index.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource, reviewGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { detectPhotoLinkReview, photoLinkReviewDecisions, reducePhotoLinkReviewChoices, emptyPhotoLinkReviewChoices } from '../src/lib/photos/photoHyperlinkReview.mjs';

const POINT_FIELDS = ['S_FCODE', 'Type', 'AnleggsID', 'S_HYPERLINK', 'Merknad', 'Kumform'];
const SOURCE_ID = 'photo-gmi-transfer';
const BINDING = Object.freeze({ layerId: 'layer-synthetic', inputId: 'input-synthetic', live: true });

const w = (n, path, sign = null) => `h:${n}(link:"Attachments\\${path}"${sign ? ` sign:"${sign}"` : ''})`;
const cell = (...wrappers) => wrappers.map((wrapper) => `${wrapper} `).join('');
const guidOf = (n) => `5ec0e000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** points: { number, fcode, hyperlink, merknad?, guid? (false = none), xyz? } */
function gmiText(points, { eol = '\r\n', lines = [] } = {}) {
  const extent = '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!';
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', extent,
    'COSYS_EPSG 25832', 'COSYSVER_EPSG 5941', 'PRODUCER Syntetisk testprodusent'];
  if (lines.length) out.push('[L_]', extent, '_FIELDNAMES S_FCODE;S_HYPERLINK;Merknad;');
  out.push('[P_]', extent, `_FIELDNAMES ${POINT_FIELDS.join(';')};`);
  if (lines.length) {
    out.push('[+L_]');
    lines.forEach((line, index) => {
      out.push(`:L ${index + 1}`, '_EXTENT 581900 6565900 582100 6566100 ', `_FIELDVALUES VL;${line.hyperlink};Linje ${index + 1};`,
        `GUID ${guidOf(900 + index)}`, '/XYZ', '581941.000 6566007.000 101.000', '581946.000 6566010.000 101.250');
    });
  }
  out.push('[+P_]');
  points.forEach((point, index) => {
    out.push(`:P ${point.number ?? index + 1}`,
      `_FIELDVALUES ${point.fcode ?? 'KUM'};Kum;SYNT-R${index + 1};${point.hyperlink ?? ''};${point.merknad ?? `Punkt ${index + 1}`};S;`);
    if (point.guid !== false) out.push(`GUID ${point.guid ?? guidOf(index + 1)}`);
    out.push('/XYZ', point.xyz ?? `${581940 + index * 7}.000 ${6566000 + index * 7}.000 ${100 + index}.250`);
  });
  out.push('[END]');
  return out.join(eol) + eol;
}

async function setup(points, { photos = null, eol, lines, utf8 = false, binding = BINDING } = {}) {
  const text = gmiText(points, { eol, lines });
  const bytes = utf8 ? new Uint8Array(Buffer.from(text, 'utf8')) : encodeSingleByte(text);
  const document = await loadGmiSourceDocument(bytes, { filename: 'transfer.gmi' });
  assert.equal(document.editable, true, `fixture must be editable: ${document.reasons.join(',')}`);
  const parsed = createGmiPhotoSource(document.parser, document.fingerprint);
  const names = photos ?? [...new Set(parsed.references.filter((reference) => reference.targetValid).map((reference) => reference.filename))];
  const withIds = Object.freeze({ ...parsed, id: SOURCE_ID,
    references: Object.freeze(parsed.references.map((reference) => Object.freeze({ ...reference, id: `${SOURCE_ID}:${reference.id}` }))) });
  const photoList = Array.isArray(names[0]) ? names.map(([id, name]) => ({ id, originalFilename: name, sourceRelativePath: null })) : photosFor(names);
  const source = Object.freeze({ ...withIds, ...(binding ? { loadedBinding: binding } : {}), associationLedger: reviewGmiPhotoSource(withIds, photoList) });
  return { bytes, text, document, source };
}

const objectAt = (source, number) => Object.values(source.objectsByKey).find((object) => object.geometryScope === 'point' && object.parserId === number);

/** The explicit «Flytt til punktobjekt» decision for the photo `filename` on object number `from`, to object number `to`. */
function move(ctx, from, filename, to, overrides = {}) {
  const sourceObject = objectAt(ctx.source, from), recipient = objectAt(ctx.source, to) ?? overrides.recipientObject;
  const edge = Object.values(ctx.source.associationLedger.associationsById).find((candidate) => candidate.objectKey === sourceObject.objectKey
    && candidate.referenceIds.some((id) => ctx.source.references.find((reference) => reference.id === id)?.filename === filename));
  const referenceIds = edge ? [...edge.referenceIds]
    : ctx.source.references.filter((reference) => reference.objectKey === sourceObject.objectKey && reference.filename === filename).map((reference) => reference.id);
  return {
    sourceFingerprint: ctx.source.fingerprint, sourceId: ctx.source.id, sourceObjectKey: sourceObject.objectKey,
    assetId: edge?.photoId ?? `asset-missing-${filename}`, referenceIds,
    recipient: { objectKey: recipient.objectKey, scope: recipient.geometryScope, sourceIndex: recipient.sourceIndex, parserId: recipient.parserId, guid: recipient.guid },
    ...overrides,
  };
}

function photoState(ctx, transfers, override = {}) {
  const byAssetId = {};
  for (const transfer of transfers) {
    const ids = ctx.source.associationLedger.reverseIndexes.byPhotoId[transfer.assetId] || [];
    byAssetId[transfer.assetId] = { deliveryStatuses: ['keep-link'], acceptedAlternativePosition: false,
      occurrenceObjectKeys: ids.map((id) => ctx.source.associationLedger.associationsById[id].objectKey), ...(override[transfer.assetId] || {}) };
  }
  return { byAssetId };
}

const plan = (ctx, transfers, extra = {}) => planGmiHyperlinkTransfer(ctx.document, {
  photoSource: ctx.source, transfers, photoState: photoState(ctx, transfers, extra.photoStateOverride), ...extra });
const authorize = (p) => ({ transferKeys: p.transfers.map((transfer) => transfer.transferKey) });
const codes = (p) => [...new Set(p.blockers.map((blocker) => blocker.code))].sort();

/** Byte oracle independent of the engine: original with exactly the planned cell spans replaced. */
function assertOnlyCellsChanged(ctx, output, p, extra = []) {
  const reference = loadGmiDocument(ctx.bytes);
  const intended = [...extra, ...p.cells.map((entry) => ({ scope: entry.scope, sourceIndex: entry.sourceIndex, field: 'S_HYPERLINK', lexeme: entry.proposed }))];
  assert.deepEqual(verifyCellChanges(reference, output, intended).failures, [], 'M0 reference verifier');
  if (extra.length) return;
  const spans = p.cells.map((entry) => [entry.start, entry.end, encodeSingleByte(entry.proposed)]).sort((a, b) => a[0] - b[0]);
  const parts = []; let cursor = 0;
  for (const [start, end, next] of spans) { parts.push(ctx.bytes.subarray(cursor, start), next); cursor = end; }
  parts.push(ctx.bytes.subarray(cursor));
  assert.equal(Buffer.compare(Buffer.concat(parts.map((part) => Buffer.from(part))), Buffer.from(output)), 0, 'bytes outside planned spans identical');
}

function propose(ctx, p, options = {}) {
  const result = buildGmiHyperlinkTransferProposal(p, { authorization: authorize(p), ...options });
  assert.equal(result.ok, true, JSON.stringify(result.rejections));
  return result;
}

const outputSource = (bytes) => createGmiPhotoSource(new GMIParser(decodeGmiBytes(bytes)), null);
const rawOf = (bytes, sourceIndex) => Object.values(outputSource(bytes).objectsByKey).find((object) => object.geometryScope === 'point' && object.sourceIndex === sourceIndex).hyperlinkRaw;

// ---------------------------------------------------------------------------

test('LOK Punkt 293 -> SLU Punkt 108: exact group removed, appended to the recipient with sign metadata, verified bytes', async () => {
  const lok = cell(w(1, 'SYNT_LOK_A.jpg', 'Feltmåler A'), w(2, 'SYNT_LOK_B.jpg', 'Feltmåler A'), w(3, 'SYNT_LOK_C.jpg'));
  const slu = cell(w(1, 'SYNT_SLU_1.jpg', 'Feltmåler B'));
  const ctx = await setup([
    { number: 293, fcode: 'LOK', hyperlink: lok, xyz: '581950.000 6566010.000 101.250' },
    { number: 108, fcode: 'SLU', hyperlink: slu, xyz: '581950.100 6566010.150 100.900' },
    { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_KUM_1.jpg')), xyz: '581960.000 6566020.000 99.000' },
  ]);
  const transfer = move(ctx, 293, 'SYNT_LOK_B.jpg', 108);
  const p = plan(ctx, [transfer]);
  assert.equal(p.status, GMI_HYPERLINK_TRANSFER_STATUS.READY, JSON.stringify(p.blockers));
  assert.equal(isGmiHyperlinkTransferPlan(p), true);
  assert.equal(Object.isFrozen(p) && Object.isFrozen(p.cells[0]) && Object.isFrozen(p.edits), true);
  assert.deepEqual(p.cells.map((entry) => [entry.sourceIndex, entry.original, entry.proposed]), [
    [0, lok, cell(w(1, 'SYNT_LOK_A.jpg', 'Feltmåler A'), w(2, 'SYNT_LOK_C.jpg'))],
    [1, slu, cell(w(1, 'SYNT_SLU_1.jpg', 'Feltmåler B'), w(2, 'SYNT_LOK_B.jpg', 'Feltmåler A'))],
  ]);
  assert.equal(p.edits.length, 2, 'one edit per cell');
  assert.deepEqual(p.counts, { transfers: 1, cells: 2, sourceCells: 1, recipientCells: 1, chainCells: 0, movedReferences: 1, blockers: 0, warnings: p.warnings.length });
  assert(p.warnings.some((warning) => warning.code === 'recipient-existing-links-retained' && warning.count === 1));
  assert.deepEqual(Object.keys(p.transfers[0]).sort(), ['assetId', 'decisionKey', 'fromObjectKey', 'outputReferenceIds', 'referenceIds', 'toObjectKey', 'transferKey']);
  assert(!JSON.stringify(p).includes('"transfer"') && !/deliveryIntent|"gml"/i.test(JSON.stringify(p)), 'no delivery intent is planned');

  const result = propose(ctx, p);
  assertOnlyCellsChanged(ctx, result.bytes, p);
  assert.equal(result.verification.transfer.movedReferences, 1);
  // The predicted output reference id resolves to the moved photograph on the recipient.
  const after = outputSource(result.bytes);
  const moved = after.references.find((reference) => `${SOURCE_ID}:${reference.id}` === p.transfers[0].outputReferenceIds[0]);
  assert.equal(moved.objectKey, transfer.recipient.objectKey);
  assert.equal(moved.filename, 'SYNT_LOK_B.jpg');
  assert.deepEqual(moved.metadata.map((entry) => entry.raw), ['sign:"Feltmåler A"']);
  assert.deepEqual(getGmiSourceBytes(ctx.document), ctx.bytes, 'original bytes untouched');
});

test('empty recipient cell receives the wrapper with the source file trailing convention; untouched unrelated cells', async () => {
  const ctx = await setup([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_E_1.jpg', 'Feltmåler A')) },
    { number: 2, fcode: 'SLU', hyperlink: '' },
    { number: 3, fcode: 'TOP', hyperlink: `${w(1, 'SYNT_NT_1.jpg')} ${w(2, 'SYNT_NT_2.jpg')}` },     // no trailing space
    { number: 4, fcode: 'KUM', hyperlink: '' },
  ]);
  const p = plan(ctx, [move(ctx, 1, 'SYNT_E_1.jpg', 2), move(ctx, 3, 'SYNT_NT_2.jpg', 4)]);
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  // Source 3 keeps M7's established composition (the retained wrapper keeps its own following separator);
  // the empty recipient 4 takes source 3's trailing convention (none).
  assert.deepEqual(p.cells.map((entry) => entry.proposed), ['', cell(w(1, 'SYNT_E_1.jpg', 'Feltmåler A')), `${w(1, 'SYNT_NT_1.jpg')} `, w(1, 'SYNT_NT_2.jpg')]);
  const result = propose(ctx, p);
  assertOnlyCellsChanged(ctx, result.bytes, p);
});

test('recipient with several hyperlinks and metadata keeps them verbatim, in order, and appends after the last one', async () => {
  const recipient = ` ${w(1, 'SYNT_R_1.jpg', 'Feltmåler B')} ${w(2, 'SYNT_R_2.pdf')}  ${w(3, 'SYNT R (3).jpg', 'Feltmåler B')}   `;
  const ctx = await setup([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_S_1.jpg', 'Feltmåler A')) },
    { number: 2, fcode: 'KUM', hyperlink: recipient },
  ]);
  const p = plan(ctx, [move(ctx, 1, 'SYNT_S_1.jpg', 2)]);
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  assert.equal(p.cells[1].proposed, ` ${w(1, 'SYNT_R_1.jpg', 'Feltmåler B')} ${w(2, 'SYNT_R_2.pdf')}  ${w(3, 'SYNT R (3).jpg', 'Feltmåler B')} ${w(4, 'SYNT_S_1.jpg', 'Feltmåler A')}   `);
  assertOnlyCellsChanged(ctx, propose(ctx, p).bytes, p);
});

test('several photographs to one recipient from one and from several sources: deterministic source-order append', async () => {
  const ctx = await setup([
    { number: 5, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_K_1.jpg')) },
    { number: 6, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_A_1.jpg'), w(2, 'SYNT_A_2.jpg', 'Feltmåler A'), w(3, 'SYNT_A_3.jpg')) },
    { number: 7, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_B_1.jpg', 'Feltmåler B')) },
  ]);
  const transfers = [move(ctx, 7, 'SYNT_B_1.jpg', 5), move(ctx, 6, 'SYNT_A_3.jpg', 5), move(ctx, 6, 'SYNT_A_1.jpg', 5)];
  const p = plan(ctx, transfers);
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  assert.equal(p.cells[0].proposed, cell(w(1, 'SYNT_K_1.jpg'), w(2, 'SYNT_A_1.jpg'), w(3, 'SYNT_A_3.jpg'), w(4, 'SYNT_B_1.jpg', 'Feltmåler B')));
  assert.equal(p.cells[1].proposed, cell(w(1, 'SYNT_A_2.jpg', 'Feltmåler A')));
  assert.equal(p.cells[2].proposed, '');
  const reversed = plan(ctx, [...transfers].reverse());
  assert.equal(reversed.planKey, p.planKey, 'input order does not change the plan');
  assert.deepEqual(reversed.edits, p.edits);
  assert.deepEqual(plan(ctx, transfers), p, 'deterministic');
  assertOnlyCellsChanged(ctx, propose(ctx, p).bytes, p);
});

test('independent sources and recipients compose in one plan and one proposal', async () => {
  const ctx = await setup([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_I_1.jpg'), w(2, 'SYNT_I_2.jpg')) },
    { number: 2, fcode: 'SLU', hyperlink: '' },
    { number: 3, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_J_1.jpg')) },
    { number: 4, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_K_9.jpg')) },
    { number: 5, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_UNTOUCHED.jpg', 'Feltmåler A')) },
  ]);
  const p = plan(ctx, [move(ctx, 1, 'SYNT_I_1.jpg', 2), move(ctx, 3, 'SYNT_J_1.jpg', 4)]);
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  assert.deepEqual(p.cells.map((entry) => entry.sourceIndex), [0, 1, 2, 3]);
  const result = propose(ctx, p);
  assertOnlyCellsChanged(ctx, result.bytes, p);
  assert.equal(rawOf(result.bytes, 4), cell(w(1, 'SYNT_UNTOUCHED.jpg', 'Feltmåler A')));
});

test('chains and cycles: a cell that loses and gains references gets ONE edit composed against the original basis', async () => {
  const a = cell(w(1, 'SYNT_CA_1.jpg'), w(2, 'SYNT_CA_2.jpg', 'Feltmåler A'));
  const b = cell(w(1, 'SYNT_CB_1.jpg', 'Feltmåler B'), w(2, 'SYNT_CB_2.jpg'));
  const c = cell(w(1, 'SYNT_CC_1.jpg'));
  const ctx = await setup([{ number: 1, fcode: 'LOK', hyperlink: a }, { number: 2, fcode: 'SLU', hyperlink: b }, { number: 3, fcode: 'KUM', hyperlink: c }]);
  // Chain A -> B -> C, and C -> A closes a cycle.
  const p = plan(ctx, [move(ctx, 1, 'SYNT_CA_1.jpg', 2), move(ctx, 2, 'SYNT_CB_1.jpg', 3), move(ctx, 3, 'SYNT_CC_1.jpg', 1)]);
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  assert.equal(p.edits.length, 3);
  assert.equal(new Set(p.edits.map((edit) => edit.target.sourceIndex)).size, 3, 'no cell is edited twice');
  assert.equal(p.counts.chainCells, 3);
  assert.deepEqual(p.cells.map((entry) => entry.proposed), [
    cell(w(1, 'SYNT_CA_2.jpg', 'Feltmåler A'), w(2, 'SYNT_CC_1.jpg')),
    cell(w(1, 'SYNT_CB_2.jpg'), w(2, 'SYNT_CA_1.jpg')),
    cell(w(1, 'SYNT_CB_1.jpg', 'Feltmåler B')),
  ]);
  assert(p.edits.every((edit, index) => edit.expected === [a, b, c][index]), 'every edit is against the original lexeme');
  // Swap: A and B exchange their only photographs.
  const swap = await setup([{ number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_SA.jpg')) }, { number: 2, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_SB.jpg')) }]);
  const sp = plan(swap, [move(swap, 1, 'SYNT_SA.jpg', 2), move(swap, 2, 'SYNT_SB.jpg', 1)]);
  assert.deepEqual(sp.cells.map((entry) => entry.proposed), [cell(w(1, 'SYNT_SB.jpg')), cell(w(1, 'SYNT_SA.jpg'))]);
  assertOnlyCellsChanged(ctx, propose(ctx, p).bytes, p);
  assertOnlyCellsChanged(swap, propose(swap, sp).bytes, sp);
});

test('repeated references of one confident group move together; a partial group and unselected references stay', async () => {
  const lok = cell(w(1, 'SYNT_REP.jpg', 'Feltmåler A'), w(2, 'SYNT_OTHER.jpg'), w(3, 'SYNT_REP.jpg'));
  const ctx = await setup([{ number: 1, fcode: 'LOK', hyperlink: lok }, { number: 2, fcode: 'KUM', hyperlink: '' }]);
  const full = move(ctx, 1, 'SYNT_REP.jpg', 2);
  assert.equal(full.referenceIds.length, 2);
  const p = plan(ctx, [full]);
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  assert.equal(p.cells[0].proposed, cell(w(1, 'SYNT_OTHER.jpg')));
  assert.equal(p.cells[1].proposed, cell(w(1, 'SYNT_REP.jpg', 'Feltmåler A'), w(2, 'SYNT_REP.jpg')));
  assert(p.warnings.some((warning) => warning.code === 'repeated-references-carried' && warning.count === 2));
  assert.equal(p.transfers[0].outputReferenceIds.length, 2);
  assertOnlyCellsChanged(ctx, propose(ctx, p).bytes, p);
  const partial = plan(ctx, [{ ...full, referenceIds: [full.referenceIds[0]] }]);
  assert.equal(partial.status, 'blocked');
  assert.deepEqual(codes(partial), ['removal:reference-set-mismatch']);
  assert.deepEqual([partial.cells, partial.edits, partial.transfers], [[], [], []], 'a blocked plan carries no edits');
});

test('photograph already on the recipient, filename collisions and the same photograph twice to one recipient block', async () => {
  const ctx = await setup([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_DUP.jpg')) },
    { number: 2, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_DUP.jpg', 'Feltmåler B')) },
    { number: 3, fcode: 'TOP', hyperlink: cell(w(1, 'SYNT_DUP.jpg')) },
    { number: 4, fcode: 'KUM', hyperlink: '' },
    { number: 5, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_COLL.jpg')) },
    { number: 6, fcode: 'KUM', hyperlink: 'h:1(link:"https://example.invalid/SYNT_COLL.jpg") ' },
  ], { photos: ['SYNT_DUP.jpg', 'SYNT_COLL.jpg'] });
  assert.deepEqual(codes(plan(ctx, [move(ctx, 1, 'SYNT_DUP.jpg', 2)])), ['recipient-already-links-photo', 'recipient-has-photo-placement']);
  assert.deepEqual(codes(plan(ctx, [move(ctx, 1, 'SYNT_DUP.jpg', 4), move(ctx, 3, 'SYNT_DUP.jpg', 4)])), ['duplicate-recipient-photo']);
  // Recipient 6 has an unresolved (unsafe, unmatched) reference with the same filename: never silently merged.
  assert.equal(ctx.source.associationLedger.reverseIndexes.byObjectKey[objectAt(ctx.source, 6).objectKey], undefined);
  const collision = plan(ctx, [move(ctx, 5, 'SYNT_COLL.jpg', 6)]);
  assert.deepEqual(codes(collision), ['recipient-filename-collision']);
});

test('unsupported recipient and source grammar block explicitly; nothing is repaired or normalized', async () => {
  const cases = [
    ['bare', 'Attachments\\SYNT_BARE.jpg', 'recipient-hyperlink-shape'],
    ['malformed', 'h:1(link:"Attachments\\SYNT_BAD.jpg" ', 'recipient-hyperlink-shape'],
    ['multi-link', 'h:1(link:"Attachments\\SYNT_ML_1.jpg" link:"Attachments\\SYNT_ML_2.jpg") ', 'recipient-hyperlink-shape'],
    ['whitespace-only', '   ', 'recipient-hyperlink-shape'],
    ['comma separator', `${w(1, 'SYNT_CS_1.jpg')}, ${w(2, 'SYNT_CS_2.jpg')} `, 'recipient-hyperlink-shape'],
    ['non-contiguous', cell(w(1, 'SYNT_NC_1.jpg'), w(3, 'SYNT_NC_3.jpg')), 'recipient-ordinals-not-contiguous'],
    ['sign-only wrapper', 'h:1(sign:"Feltmåler A") ', 'recipient-hyperlink-shape'],
  ];
  for (const [label, hyperlink, code] of cases) {
    const ctx = await setup([{ number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_G.jpg')) }, { number: 2, fcode: 'KUM', hyperlink }], { photos: ['SYNT_G.jpg'] });
    const p = plan(ctx, [move(ctx, 1, 'SYNT_G.jpg', 2)]);
    assert.deepEqual(codes(p), [code], label);
  }
  // Sources: bare paths are never wrapped into an invented representation; multi-link cells are not split.
  const bare = await setup([{ number: 1, fcode: 'LOK', hyperlink: 'Attachments\\SYNT_SB.jpg' }, { number: 2, fcode: 'KUM', hyperlink: '' }]);
  assert(codes(plan(bare, [move(bare, 1, 'SYNT_SB.jpg', 2)])).includes('source-reference-bare'));
  const multi = await setup([{ number: 1, fcode: 'LOK', hyperlink: `${w(1, 'SYNT_M1.jpg')} h:2(link:"Attachments\\SYNT_M2.jpg" link:"Attachments\\SYNT_M3.jpg") ` },
    { number: 2, fcode: 'KUM', hyperlink: '' }]);
  assert(codes(plan(multi, [move(multi, 1, 'SYNT_M1.jpg', 2)])).includes('source-hyperlink-shape'));
  // Layout helper evidence.
  assert.deepEqual(gmiHyperlinkCellLayout('').wrappers, []);
  assert.equal(gmiHyperlinkCellLayout(cell(w(1, 'x.jpg'), w(3, 'y.jpg'))).contiguous, false);
});

test('missing and ambiguous assets, stale basis, FOTO-only sources and conflicting FOTO state block', async () => {
  const points = [{ number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_X.jpg'), w(2, 'SYNT_Y.jpg')) }, { number: 2, fcode: 'KUM', hyperlink: '' }];
  const missing = await setup(points, { photos: ['SYNT_Y.jpg'] });
  assert(codes(plan(missing, [move(missing, 1, 'SYNT_X.jpg', 2)])).includes('removal:association-not-confident'));
  const ambiguous = await setup(points, { photos: [['copy-1', 'SYNT_X.jpg'], ['copy-2', 'SYNT_X.jpg'], ['y', 'SYNT_Y.jpg']] });
  const ambiguousCodes = codes(plan(ambiguous, [move(ambiguous, 1, 'SYNT_X.jpg', 2)]));
  assert(ambiguousCodes.includes('removal:association-not-confident') && ambiguousCodes.includes('removal:reference-not-confident'));
  const unresolved = plan(missing, [{ ...move(missing, 1, 'SYNT_X.jpg', 2), assetId: null }]);
  assert.deepEqual(codes(unresolved), ['transfer-asset-missing']);

  const ctx = await setup(points);
  const transfer = move(ctx, 1, 'SYNT_X.jpg', 2);
  assert(codes(plan(ctx, [{ ...transfer, sourceFingerprint: 'sha256:stale' }])).includes('removal:stale-source-fingerprint'));
  assert.deepEqual(codes(plan(ctx, [transfer], { expectedBasis: { documentFingerprint: 'sha256:other' } })), ['stale-basis']);
  for (const binding of [null, { ...BINDING, live: false }]) {
    const fotoOnly = await setup(points, { binding });
    assert.deepEqual(codes(plan(fotoOnly, [move(fotoOnly, 1, 'SYNT_X.jpg', 2)])), ['photo-source-not-live-bound']);
  }
  const conflict = (override) => codes(plan(ctx, [transfer], { photoStateOverride: { [transfer.assetId]: override } }));
  assert.deepEqual(conflict({ deliveryStatuses: ['transfer'] }), ['delivery-conflict'], 'existing GML decision');
  assert.deepEqual(conflict({ deliveryStatuses: ['keep-link', 'exclude'] }), ['delivery-conflict'], 'existing Ikke decision');
  assert.deepEqual(conflict({ acceptedAlternativePosition: true }), ['accepted-position']);
  assert.deepEqual(conflict({ occurrenceObjectKeys: [transfer.sourceObjectKey, transfer.recipient.objectKey] }), ['recipient-has-photo-placement']);
  assert.deepEqual(codes(planGmiHyperlinkTransfer(ctx.document, { photoSource: ctx.source, transfers: [transfer] })), ['photo-state-missing']);
  assert.deepEqual(codes(plan(ctx, [transfer], { ordinalPolicy: 'preserve' })), ['ordinal-policy-unsupported']);
});

test('recipient identity: explicit, same-source point object, current identity guards and unique GUID', async () => {
  const ctx = await setup([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_ID.jpg')) },
    { number: 2, fcode: 'KUM', hyperlink: '' },
    { number: 3, fcode: 'KUM', hyperlink: '', guid: false },
  ], { lines: [{ hyperlink: '' }] });
  const transfer = move(ctx, 1, 'SYNT_ID.jpg', 2);
  const recipient = transfer.recipient;
  const variant = (patch) => codes(plan(ctx, [{ ...transfer, recipient: { ...recipient, ...patch } }]));
  assert.deepEqual(variant({ sourceIndex: 2 }), ['recipient-identity-mismatch']);
  assert.deepEqual(variant({ parserId: 99 }), ['recipient-identity-mismatch']);
  assert.deepEqual(variant({ guid: guidOf(77) }), ['recipient-identity-mismatch']);
  assert.deepEqual(variant({ objectKey: 'guid:not-there' }), ['recipient-not-found']);
  assert.deepEqual(variant({ objectKey: transfer.sourceObjectKey }), ['recipient-has-photo-placement', 'recipient-is-source']);
  const line = Object.values(ctx.source.objectsByKey).find((object) => object.geometryScope === 'line');
  assert(variant({ objectKey: line.objectKey, scope: 'line', sourceIndex: 0, parserId: 1, guid: line.guid }).includes('recipient-not-point'));
  assert.deepEqual(codes(plan(ctx, [move(ctx, 1, 'SYNT_ID.jpg', 3)])), ['recipient-identity']);
  assert.deepEqual(codes(plan(ctx, [{ ...transfer, recipient: null }])), ['recipient-missing'], 'recipients are never chosen automatically');
  assert.deepEqual(codes(plan(ctx, [{ ...transfer, recipient: { objectKey: recipient.objectKey } }])), ['recipient-identity-incomplete']);
});

test('removal half equals the unchanged M7 planner for every source cell', async () => {
  const lok = cell(w(1, 'SYNT_M7_1.jpg', 'Feltmåler A'), w(2, 'SYNT_M7_2.jpg'), w(4, 'SYNT_M7_4.jpg', 'Feltmåler A'));
  const ctx = await setup([{ number: 1, fcode: 'LOK', hyperlink: lok }, { number: 2, fcode: 'KUM', hyperlink: '' }]);
  const transfer = move(ctx, 1, 'SYNT_M7_2.jpg', 2);
  const p = plan(ctx, [transfer]);
  const m7 = planGmiHyperlinkRemoval(ctx.document, { photoSource: ctx.source, selections: [{ sourceFingerprint: transfer.sourceFingerprint,
    objectKey: transfer.sourceObjectKey, assetId: transfer.assetId, referenceIds: transfer.referenceIds, sourceId: transfer.sourceId }] });
  assert.equal(m7.status, 'ready');
  assert.equal(p.cells[0].proposed, m7.cells[0].proposed);
  assert.deepEqual(p.cells[0].ordinalChanges, m7.cells[0].ordinalChanges, 'established M7 renumbering of source cells');
  assert(p.warnings.some((warning) => warning.code === 'original-ordinals-not-contiguous' && warning.origin === 'removal'));
});

test('M2 field edits compose with the transfer in one verified proposal; stale sessions are refused; nothing is staged', async () => {
  const ctx = await setup([{ number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_S.jpg')) }, { number: 2, fcode: 'KUM', hyperlink: '' }]);
  const recipient = objectAt(ctx.source, 2);
  let session = createGmiEditSession(ctx.document);
  const correction = createGmiObjectCorrection(session, { scope: 'point', sourceIndex: recipient.sourceIndex, objectId: recipient.parserId,
    guid: recipient.guid, values: { Merknad: 'Syntetisk merknad' }, mode: 'overwrite' });
  assert.equal(correction.ok, true, JSON.stringify(correction.rejections));
  session = stageGmiChangeSet(session, correction.changeSet).session;
  const stateKey = session.stateKey, changeSets = session.changeSets.length;
  const p = plan(ctx, [move(ctx, 1, 'SYNT_S.jpg', 2)], { session });
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  assert.equal(p.basis.session.fieldEditCount, 1);
  const result = propose(ctx, p, { session });
  assert.equal(result.fieldEditCount, 1);
  assert.equal(result.verification.transfer.authorizedFieldEdits, 1);
  assertOnlyCellsChanged(ctx, result.bytes, p, [{ scope: 'point', sourceIndex: recipient.sourceIndex, field: 'Merknad', lexeme: 'Syntetisk merknad' }]);
  assert.equal(session.stateKey, stateKey, 'planning and proposing never stage, undo or publish');
  assert.equal(session.changeSets.length, changeSets);
  assert.deepEqual(buildGmiHyperlinkTransferProposal(p, { authorization: authorize(p) }).rejections, [{ code: 'session-required' }]);
  const later = createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0, objectId: 1, guid: guidOf(1), values: { Merknad: 'Ny' }, mode: 'overwrite' });
  const staged = stageGmiChangeSet(session, later.changeSet).session;
  assert.deepEqual(buildGmiHyperlinkTransferProposal(p, { session: staged, authorization: authorize(p) }).rejections, [{ code: 'stale-session-state' }]);
  assert.deepEqual(codes(plan(ctx, [move(ctx, 1, 'SYNT_S.jpg', 2)], { session, expectedBasis: { sessionEffectiveKey: 'old' } })), ['stale-basis']);
});

test('proposal gates: forged, blocked and unauthorized plans; empty plans keep the original bytes identical', async () => {
  const ctx = await setup([{ number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_P.jpg')) }, { number: 2, fcode: 'KUM', hyperlink: '' }]);
  const p = plan(ctx, [move(ctx, 1, 'SYNT_P.jpg', 2)]);
  assert.throws(() => { p.edits[0].lexeme = 'tampered'; }, TypeError, 'plans are frozen');
  assert.deepEqual(buildGmiHyperlinkTransferProposal(JSON.parse(JSON.stringify(p)), { authorization: authorize(p) }).rejections, [{ code: 'not-a-transfer-plan' }]);
  assert.deepEqual(buildGmiHyperlinkTransferProposal(p).rejections, [{ code: 'missing-authorization' }]);
  assert.deepEqual(buildGmiHyperlinkTransferProposal(p, { authorization: { transferKeys: ['other'] } }).rejections, [{ code: 'authorization-mismatch' }]);
  const blocked = plan(ctx, [{ ...move(ctx, 1, 'SYNT_P.jpg', 2), recipient: null }]);
  assert.deepEqual(buildGmiHyperlinkTransferProposal(blocked, { authorization: { transferKeys: [] } }).rejections, [{ code: 'plan-blocked' }]);
  const empty = plan(ctx, []);
  assert.equal(empty.status, 'empty');
  const identical = buildGmiHyperlinkTransferProposal(empty);
  assert.equal(identical.identical, true);
  assert.deepEqual(identical.bytes, ctx.bytes, 'no-op output is byte-identical');
});

test('byte preservation: LF and CRLF files, Latin-1 metadata, unknown text and geometry outside the edited spans', async () => {
  for (const eol of ['\n', '\r\n']) {
    const ctx = await setup([{ number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_BÆR.jpg', 'Feltmåler Ø')), merknad: 'Ærlig ågrav' },
      { number: 2, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_KØ.jpg')) }], { eol });
    const p = plan(ctx, [move(ctx, 1, 'SYNT_BÆR.jpg', 2)]);
    assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
    const result = propose(ctx, p);
    assertOnlyCellsChanged(ctx, result.bytes, p);
    assert.equal(Buffer.from(result.bytes).includes(Buffer.from(eol === '\n' ? '\r' : '\r\n')), eol === '\r\n', 'line endings unchanged');
  }
  // UTF-8 files: non-ASCII metadata cannot be re-encoded under the M1 policy, so the plan fails closed.
  const utf8 = await setup([{ number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_U.jpg', 'Feltmåler')) }, { number: 2, fcode: 'KUM', hyperlink: '' }], { utf8: true });
  const blocked = plan(utf8, [move(utf8, 1, 'SYNT_U.jpg', 2)]);
  assert.equal(blocked.status, 'blocked');
  assert(blocked.blockers.every((blocker) => /not-encodable/.test(blocker.code)), JSON.stringify(blocked.blockers));
});

test('pure planning: no mutation of document, FOTO source, ledger or inputs', async () => {
  const ctx = await setup([{ number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_N.jpg')) }, { number: 2, fcode: 'KUM', hyperlink: '' }]);
  const transfers = [move(ctx, 1, 'SYNT_N.jpg', 2)];
  const state = photoState(ctx, transfers);
  const snapshot = JSON.stringify([ctx.source, transfers, state]);
  const p = planGmiHyperlinkTransfer(ctx.document, { photoSource: ctx.source, transfers, photoState: state });
  propose(ctx, p);
  assert.equal(JSON.stringify([ctx.source, transfers, state]), snapshot);
  assert.deepEqual(getGmiSourceBytes(ctx.document), ctx.bytes);
  assert.notEqual(p.decisions, transfers, 'the plan holds its own copy of the decisions');
});

// --- Independent verifier: planner defects and tampered proposals -----------

async function verifierCase() {
  const ctx = await setup([
    { number: 1, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_V_1.jpg', 'Feltmåler A'), w(2, 'SYNT_V_2.jpg')) },
    { number: 2, fcode: 'SLU', hyperlink: cell(w(1, 'SYNT_V_R.jpg')) },
    { number: 3, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_V_K.jpg')) },
  ]);
  const p = plan(ctx, [move(ctx, 1, 'SYNT_V_1.jpg', 2)]);
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  const contract = { photoSourceId: SOURCE_ID, transfers: p.decisions, documentFingerprint: ctx.document.fingerprint };
  const target = (sourceIndex, field = 'S_HYPERLINK') => ({ scope: 'point', sourceIndex, field });
  const original = (sourceIndex) => p.cells.find((entry) => entry.sourceIndex === sourceIndex)?.original ?? Object.values(ctx.source.objectsByKey)[sourceIndex].hyperlinkRaw;
  /** Simulate a (defective) planner: arbitrary edits through the M1 engine, then the independent verifier. */
  const tampered = (edits) => {
    const result = editGmiFields(ctx.document, edits.map(([sourceIndex, lexeme, field = 'S_HYPERLINK']) => ({
      target: target(sourceIndex, field), expected: field === 'S_HYPERLINK' ? original(sourceIndex) : `Punkt ${sourceIndex + 1}`, lexeme })));
    assert.equal(result.ok, true, JSON.stringify(result.rejections));
    return verifyGmiHyperlinkTransfer(ctx.document, result.bytes, contract);
  };
  const failureCodes = (verification) => [...new Set(verification.failures.map((failure) => failure.code))].sort();
  return { ctx, p, contract, tampered, failureCodes };
}

test('verifier accepts the planner output and rejects every simulated planner defect', async () => {
  const { ctx, p, contract, tampered, failureCodes } = await verifierCase();
  const good = editGmiFields(ctx.document, p.edits);
  assert.equal(verifyGmiHyperlinkTransfer(ctx.document, good.bytes, contract).ok, true);
  const K = cell(w(1, 'SYNT_V_K.jpg'));
  const S = cell(w(1, 'SYNT_V_2.jpg'));
  const cases = {
    'metadata dropped': [[[0, S], [1, cell(w(1, 'SYNT_V_R.jpg'), w(2, 'SYNT_V_1.jpg'))]], ['reference-content-mismatch', 'wrapper-content-mismatch']],
    'wrong recipient': [[[0, S], [2, cell(w(1, 'SYNT_V_K.jpg'), w(2, 'SYNT_V_1.jpg', 'Feltmåler A'))]], ['bytes-changed-outside-authorized-cells', 'moved-reference-count-mismatch', 'reference-count-mismatch', 'unauthorized-hyperlink-change']],
    'reference lost': [[[0, S]], ['moved-reference-count-mismatch', 'reference-count-mismatch', 'reference-total-changed']],
    'reference duplicated': [[[1, cell(w(1, 'SYNT_V_R.jpg'), w(2, 'SYNT_V_1.jpg', 'Feltmåler A'))]], ['reference-count-mismatch', 'reference-total-changed']],
    'unselected source reference moved too': [[[0, ''], [1, cell(w(1, 'SYNT_V_R.jpg'), w(2, 'SYNT_V_1.jpg', 'Feltmåler A'), w(3, 'SYNT_V_2.jpg'))]],
      ['moved-reference-count-mismatch', 'reference-count-mismatch']],
    'existing recipient reference altered': [[[0, S], [1, cell(w(1, 'SYNT_V_R2.jpg'), w(2, 'SYNT_V_1.jpg', 'Feltmåler A'))]], ['reference-content-mismatch', 'wrapper-content-mismatch']],
    'wrong append order': [[[0, S], [1, cell(w(1, 'SYNT_V_1.jpg', 'Feltmåler A'), w(2, 'SYNT_V_R.jpg'))]], ['reference-content-mismatch', 'wrapper-content-mismatch']],
    'non-contiguous ordinals': [[[0, S], [1, cell(w(1, 'SYNT_V_R.jpg'), w(3, 'SYNT_V_1.jpg', 'Feltmåler A'))]], ['ordinals-not-contiguous']],
    'stray text in cell': [[[0, S], [1, `${w(1, 'SYNT_V_R.jpg')}, ${w(2, 'SYNT_V_1.jpg', 'Feltmåler A')} `]], ['changed-cell-not-whole-wrappers']],
    'unrelated hyperlink changed': [[[0, S], [1, cell(w(1, 'SYNT_V_R.jpg'), w(2, 'SYNT_V_1.jpg', 'Feltmåler A'))], [2, `${K} `]], ['bytes-changed-outside-authorized-cells', 'unauthorized-hyperlink-change']],
    'unrelated field changed': [[[0, S], [1, cell(w(1, 'SYNT_V_R.jpg'), w(2, 'SYNT_V_1.jpg', 'Feltmåler A'))], [2, 'Endret', 'Merknad']],
      ['bytes-changed-outside-authorized-cells', 'unauthorized-field-change']],
  };
  for (const [label, [edits, expected]] of Object.entries(cases)) assert.deepEqual(failureCodes(tampered(edits)), expected, label);
});

test('verifier rejects raw byte tampering, structural changes and contract/basis disagreement', async () => {
  const { ctx, p, contract, failureCodes } = await verifierCase();
  const good = editGmiFields(ctx.document, p.edits).bytes;
  const text = decodeGmiBytes(good);
  const variant = (from, to) => encodeSingleByte(text.replace(from, to));
  assert.deepEqual(failureCodes(verifyGmiHyperlinkTransfer(ctx.document, variant('581954.000', '581954.001'), contract)), ['bytes-changed-outside-authorized-cells', 'geometry-changed']);
  assert.deepEqual(failureCodes(verifyGmiHyperlinkTransfer(ctx.document, variant('PRODUCER Syntetisk', 'PRODUCER Endret'), contract)), ['bytes-changed-outside-authorized-cells', 'header-changed']);
  assert.deepEqual(failureCodes(verifyGmiHyperlinkTransfer(ctx.document, variant(`GUID ${guidOf(3)}`, `GUID ${guidOf(33)}`), contract)), ['object-keys-changed']);
  const eol = verifyGmiHyperlinkTransfer(ctx.document, encodeSingleByte(text.replace('[END]\r\n', '[END]\n')), contract);
  assert.equal(eol.ok, false, 'end-of-line change outside the cells is rejected');
  assert.equal(verifyGmiHyperlinkTransfer(ctx.document, ctx.bytes, contract).ok, false, 'an unchanged output does not satisfy a move');
  assert.deepEqual(failureCodes(verifyGmiHyperlinkTransfer(ctx.document, good, { ...contract, documentFingerprint: 'sha256:other' })), ['contract-basis-mismatch']);
  const wrongTarget = { ...contract, transfers: [{ ...p.decisions[0], recipient: { ...p.decisions[0].recipient, sourceIndex: 2 } }] };
  assert.deepEqual(failureCodes(verifyGmiHyperlinkTransfer(ctx.document, good, wrongTarget)), ['contract-recipient-identity-mismatch']);
  const otherRecipient = Object.values(ctx.source.objectsByKey)[2];
  const disagree = { ...contract, transfers: [{ ...p.decisions[0], recipient: { objectKey: otherRecipient.objectKey } }] };
  assert.equal(verifyGmiHyperlinkTransfer(ctx.document, good, disagree).ok, false, 'planner/verifier disagreement about the recipient is detected');
  const twice = { ...contract, transfers: [p.decisions[0], p.decisions[0]] };
  assert.deepEqual(failureCodes(verifyGmiHyperlinkTransfer(ctx.document, good, twice)), ['contract-reference-claimed-twice']);
  assert.deepEqual(failureCodes(verifyGmiHyperlinkTransfer(ctx.document, good, { ...contract, photoSourceId: 'other' })), ['contract-reference-unknown']);
});

test('review decisions map onto planner input without automatic recipients (Batch 1B.2 interface)', async () => {
  const ctx = await setup([
    { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_RV_1.jpg', 'Feltmåler A'), w(2, 'SYNT_RV_2.jpg')), xyz: '581950.000 6566010.000 101.250' },
    { number: 108, fcode: 'SLU', hyperlink: '', xyz: '581950.100 6566010.150 100.900' },
  ]);
  const photos = [{ id: 'occ-1', assetId: 'asset-1-SYNT_RV_1.jpg', originalFilename: 'SYNT_RV_1.jpg', sourceRelativePath: null, spatial: { candidates: [], current: null } },
    { id: 'occ-2', assetId: 'asset-2-SYNT_RV_2.jpg', originalFilename: 'SYNT_RV_2.jpg', sourceRelativePath: null, spatial: { candidates: [], current: null } }];
  const model = detectPhotoLinkReview({ source: ctx.source, photos, liveSource: true });
  const row = model.rows[0], group = row.groups.find((entry) => entry.assetId === 'asset-1-SYNT_RV_1.jpg');
  const recipient = model.targets.find((target) => target.parserId === 108);
  let choices = reducePhotoLinkReviewChoices(emptyPhotoLinkReviewChoices(), { type: 'select', objectKey: row.objectKey, groupKey: group.key, selected: true }, model);
  assert.equal(photoLinkReviewDecisions(model, choices)[0].target, null, 'no recipient until chosen');
  choices = reducePhotoLinkReviewChoices(choices, { type: 'target', objectKey: row.objectKey, groupKey: group.key, targetKey: recipient.objectKey }, model);
  const decision = photoLinkReviewDecisions(model, choices)[0];
  const transfer = { decisionKey: decision.key, sourceFingerprint: ctx.source.fingerprint, sourceId: ctx.source.id, sourceObjectKey: decision.row.objectKey,
    assetId: decision.group.assetId, referenceIds: [...decision.referenceIds],
    recipient: { objectKey: decision.target.objectKey, scope: decision.target.geometryScope, sourceIndex: decision.target.sourceIndex,
      parserId: decision.target.parserId, guid: decision.target.guid } };
  const p = plan(ctx, [transfer]);
  assert.equal(p.status, 'ready', JSON.stringify(p.blockers));
  assert.equal(p.transfers[0].decisionKey, decision.key);
  assert.deepEqual(p.cells.map((entry) => entry.proposed), [cell(w(1, 'SYNT_RV_2.jpg')), cell(w(1, 'SYNT_RV_1.jpg', 'Feltmåler A'))]);
});

test('the transfer planner is not runtime-wired and imports no session, store or FOTO writer', async () => {
  const read = (relative) => readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
  for (const file of ['../src/lib/gmi-edit/hyperlinkTransfer.mjs', '../src/lib/gmi-edit/hyperlinkTransferVerify.mjs']) {
    const text = await read(file);
    const imports = [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    assert(!imports.some((path) => /store|photoSession|photoDelivery|components|app\//.test(path)), `${file}: ${imports.join(', ')}`);
    assert(!/stageGmiChangeSet|undoGmiEdit|redoGmiEdit|setDeliveryIntent|publish/.test(text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  }
  const verifier = await read('../src/lib/gmi-edit/hyperlinkTransferVerify.mjs');
  assert(!/hyperlinkTransfer\.mjs|hyperlinkRemoval\.mjs/.test(verifier), 'the verifier shares no planner code');
  // No application module outside the pure gmi-edit library calls the planner or builds a proposal.
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const files = (await readdir(root, { recursive: true })).filter((name) => /\.(m?js|jsx)$/.test(name) && !/^lib[\\/]gmi-edit[\\/]/.test(name));
  for (const name of files) {
    const text = await readFile(path.join(root, name), 'utf8');
    assert(!/planGmiHyperlinkTransfer|buildGmiHyperlinkTransferProposal|verifyGmiHyperlinkTransfer|hyperlinkTransfer(Verify)?\.mjs/.test(text), `${name} must not wire the transfer`);
  }
});

test('seeded random transfer sets: every ready plan passes the independent verifier and the byte oracle', async () => {
  let seed = 0x1b1;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  let ready = 0, blocked = 0;
  for (let round = 0; round < 30; round++) {
    const points = Array.from({ length: 5 }, (_, index) => {
      const count = Math.floor(random() * 4);
      const wrappers = Array.from({ length: count }, (__, k) => w(k + 1, `SYNT_R${round}_${index}_${k}.jpg`, random() < 0.5 ? 'Feltmåler A' : null));
      return { number: index + 1, fcode: pick(['LOK', 'TOP', 'KUM', 'SLU']), hyperlink: random() < 0.2 ? wrappers.join(' ') : wrappers.map((x) => `${x} `).join('') };
    });
    const ctx = await setup(points);
    const edges = Object.values(ctx.source.associationLedger.associationsById);
    const chosen = edges.filter(() => random() < 0.5);
    const transfers = chosen.map((edge) => {
      const from = ctx.source.objectsByKey[edge.objectKey].parserId;
      const to = pick([1, 2, 3, 4, 5].filter((n) => n !== from));
      const filename = ctx.source.references.find((reference) => reference.id === edge.referenceIds[0]).filename;
      return move(ctx, from, filename, to);
    });
    const p = plan(ctx, transfers);
    if (p.status === 'blocked') { blocked++; continue; }
    ready += p.status === 'ready' ? 1 : 0;
    const result = propose(ctx, p);
    if (p.status === 'ready') assertOnlyCellsChanged(ctx, result.bytes, p);
    assert.equal(outputSource(result.bytes).references.length, ctx.source.references.length, 'references are conserved');
    assert.deepEqual(plan(ctx, [...transfers].reverse()).edits, p.edits, 'order independent');
  }
  assert(ready >= 10, `enough ready rounds (${ready} ready, ${blocked} blocked)`);
});
