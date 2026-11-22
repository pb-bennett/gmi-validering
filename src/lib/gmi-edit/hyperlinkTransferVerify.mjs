// Independent verifier for S_HYPERLINK reference transfers (Batch 1B.1).
//
// verifyGmiHyperlinkTransfer(document, outputBytes, contract) decides whether
// outputBytes is exactly the original document with the contracted reference
// moves (and any authorized ordinary field edits) and nothing else.
//
// It deliberately does NOT use the transfer planner, the M7 removal planner or
// their composition helpers, and it never reads a plan's proposed lexemes. Its
// inputs are the immutable original document, the output bytes and the
// contract: the explicit decisions as the caller supplied them
// ({ sourceObjectKey, assetId, referenceIds, recipient: { objectKey } }) plus
// the authorized ordinary field edits. Shared production infrastructure only:
// the GMI parser (via a fresh source document), the hyperlink extractor and
// the FOTO evidence factory, all run afresh on original AND output.
//
// Checks:
//   1. structure    output loads as a reconciled, editable GMI document;
//                   header, field names, object keys, scopes, source indexes,
//                   parser ids, GUIDs and raw geometry unchanged.
//   2. contract     every contracted reference exists in the original on the
//                   named source object, is a wrapped `link:` member, is
//                   claimed once; recipients exist, are other point objects.
//   3. references   per object, the output references equal the expected
//                   list: original minus moved-out references, in order, then
//                   (recipients) moved-in references ordered by source scope,
//                   source index, wrapper and member ordinal. Raw member text,
//                   metadata (`sign:` ...), filename and the digit-free wrapper
//                   text must match; nothing is lost or duplicated.
//   4. cells        changed cells hold whole wrappers only, whitespace-only
//                   separators, ordinals exactly 1..n; every other
//                   S_HYPERLINK cell is byte-identical.
//   5. fields       every non-S_HYPERLINK lexeme equals the original, or the
//                   authorized edit's lexeme.
//   6. bytes        outside the authorized cell spans, original and output
//                   bytes are identical and in order.
// Batch 1B.3A: `contract.removals` adds M7 delivery removals (photographs
// delivered through GML or excluded) composed in the same output. A removed
// reference must exist on the named object in the original, be a `link:`
// member and be claimed once (by one transfer or one removal); in the output it
// is gone from that object and appears nowhere else. Expected per object:
// original minus moved-out and removed references, in order, then moved-in
// references. The removals come from the caller's delivery decisions, never
// from a plan.
// Failure records carry codes and object keys only, never file content.
import { extractHyperlinkOccurrences } from '../hyperlinkFilenames.mjs';
import { createGmiPhotoSource } from '../photos/gmiPhotoSource.mjs';
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';
import { createGmiSourceDocument, getGmiSourceBytes, gmiSourceIntact, isGmiSourceDocument } from './sourceDocument.mjs';
import { resolveGmiCell } from './targets.mjs';
import { gmiDeepEqual } from './verify.mjs';

const FIELD = 'S_HYPERLINK';
const SCOPE_RANK = { point: 0, line: 1 };
const COLLECTIONS = { point: 'points', line: 'linesParsed' };

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const memberView = (reference) => JSON.stringify([reference.key, reference.referenceRaw, reference.rawMember,
  reference.metadata.map((entry) => entry.raw), reference.filename, reference.targetValid]);
const digitFree = (raw) => (raw === null ? null : raw.replace(/^(h:)\d+\(/i, '$1#('));

function outputBytesOf(output) {
  if (output instanceof Uint8Array) return output;
  if (isGmiSourceDocument(output)) return getGmiSourceBytes(output);
  return null;
}

function wrapperNumbers(raw) {
  const members = extractHyperlinkOccurrences(raw).sources[0]?.members || [];
  return [...new Map(members.filter((member) => member.wrapperOrdinal !== null).map((member) => [member.wrapperOrdinal, member])).values()];
}

// Whole-wrapper text check on a changed cell, from raw text only.
function wholeWrapperCell(raw) {
  if (raw === '') return true;
  const extracted = extractHyperlinkOccurrences(raw);
  const record = extracted.sources[0];
  if (extracted.sources.length !== 1 || !record?.validGrammar || !/^h:/i.test(raw.trim())) return false;
  let rest = raw;
  for (const wrapper of wrapperNumbers(raw).sort((a, b) => b.wrapperStart - a.wrapperStart)) {
    rest = rest.slice(0, wrapper.wrapperStart) + rest.slice(wrapper.wrapperEnd);
  }
  return /^\s*$/.test(rest);
}

/**
 * @param {object} document the immutable ORIGINAL GmiSourceDocument
 * @param {Uint8Array|object} output proposed bytes (or a GmiSourceDocument of them)
 * @param {object} contract
 * @param {string|null} contract.photoSourceId the FOTO source id prefixing reference ids
 * @param {string} [contract.documentFingerprint] when given, must equal the original's fingerprint
 * @param {Array<object>} contract.transfers the explicit decisions
 * @param {Array<{target: {scope, sourceIndex, field}, lexeme: string}>} [contract.fieldEdits]
 * @param {Array<{objectKey: string, referenceIds: string[]}>} [contract.removals] Batch 1B.3A delivery removals
 */
export function verifyGmiHyperlinkTransfer(document, output, contract = {}) {
  const failures = [];
  const fail = (code, detail = {}) => failures.push({ code, ...detail });
  const finish = (summary = {}) => {
    const unique = [...new Map(failures.map((entry) => [JSON.stringify(entry), entry])).values()];
    return Object.freeze({ ok: unique.length === 0, failures: Object.freeze(unique.map((entry) => Object.freeze(entry))), summary: Object.freeze(summary) });
  };
  if (!isGmiSourceDocument(document) || !document.editable) { fail('invalid-original-document'); return finish(); }
  if (!gmiSourceIntact(document)) { fail('source-bytes-mutated'); return finish(); }
  if ('documentFingerprint' in contract && contract.documentFingerprint !== document.fingerprint) { fail('contract-basis-mismatch'); return finish(); }
  const bytes = outputBytesOf(output);
  if (!bytes) { fail('invalid-output'); return finish(); }
  const outputDocument = createGmiSourceDocument(bytes);
  if (!outputDocument.editable) { fail('output-not-reconciled', { detail: outputDocument.status }); return finish(); }

  // 1. Structure.
  const original = document.parser, revised = outputDocument.parser;
  if (!gmiDeepEqual(original.header, revised.header)) fail('header-changed');
  if (!gmiDeepEqual(original.pointFieldNames, revised.pointFieldNames) || !gmiDeepEqual(original.lineFieldNames, revised.lineFieldNames)) fail('field-names-changed');
  const before = createGmiPhotoSource(original, null), after = createGmiPhotoSource(revised, null);
  const keysBefore = Object.keys(before.objectsByKey).sort(cmp), keysAfter = Object.keys(after.objectsByKey).sort(cmp);
  if (keysBefore.length !== keysAfter.length || keysBefore.some((key, index) => key !== keysAfter[index])) { fail('object-keys-changed'); return finish(); }
  for (const key of keysBefore) {
    const was = before.objectsByKey[key], now = after.objectsByKey[key];
    if (was.geometryScope !== now.geometryScope || was.sourceIndex !== now.sourceIndex || was.parserId !== now.parserId || was.guid !== now.guid) fail('object-identity-changed', { objectKey: key });
    if (!gmiDeepEqual(was.rawGeometry, now.rawGeometry) || was.extent !== now.extent) fail('geometry-changed', { objectKey: key });
  }

  // 2. Contract, resolved against the ORIGINAL only.
  const prefix = contract.photoSourceId == null ? '' : `${contract.photoSourceId}:`;
  const byId = new Map(before.references.map((reference) => [reference.id, reference]));
  const transfers = Array.isArray(contract.transfers) ? contract.transfers : null;
  if (!transfers) { fail('contract-invalid'); return finish(); }
  const structuralFailures = failures.length;
  const movedTo = new Map();          // original (unprefixed) reference id -> recipient objectKey
  for (const transfer of transfers) {
    const sourceKey = transfer?.sourceObjectKey, recipientKey = transfer?.recipient?.objectKey;
    const recipient = before.objectsByKey[recipientKey];
    if (!before.objectsByKey[sourceKey]) { fail('contract-source-unknown', { objectKey: sourceKey ?? null }); continue; }
    if (!recipient || recipient.geometryScope !== 'point' || recipientKey === sourceKey) { fail('contract-recipient-invalid', { objectKey: recipientKey ?? null }); continue; }
    const guard = transfer.recipient;
    if (('sourceIndex' in guard && guard.sourceIndex !== recipient.sourceIndex) || ('parserId' in guard && guard.parserId !== recipient.parserId)
      || ('guid' in guard && (guard.guid ?? null) !== recipient.guid)) { fail('contract-recipient-identity-mismatch', { objectKey: recipientKey }); continue; }
    if (before.objectsByKey[sourceKey].geometryScope !== 'point') fail('contract-source-not-point', { objectKey: sourceKey });
    if (!Array.isArray(transfer.referenceIds) || !transfer.referenceIds.length) { fail('contract-references-invalid', { objectKey: sourceKey }); continue; }
    for (const id of transfer.referenceIds) {
      const local = typeof id === 'string' && id.startsWith(prefix) ? id.slice(prefix.length) : null;
      const reference = local && byId.get(local);
      if (!reference || reference.objectKey !== sourceKey) { fail('contract-reference-unknown', { objectKey: sourceKey }); continue; }
      if (reference.key !== 'link' || reference.wrapperOrdinal === null) { fail('contract-reference-not-wrapped-link', { objectKey: sourceKey }); continue; }
      if (movedTo.has(local)) { fail('contract-reference-claimed-twice', { objectKey: sourceKey }); continue; }
      movedTo.set(local, recipientKey);
    }
  }
  // Batch 1B.3A: delivery removals, resolved against the ORIGINAL only.
  const removed = new Set();          // original (unprefixed) reference ids removed from the delivery
  const removalObjects = new Set();
  const removals = contract.removals === undefined ? [] : Array.isArray(contract.removals) ? contract.removals : null;
  if (!removals) { fail('contract-invalid'); return finish(); }
  for (const removal of removals) {
    const objectKey = removal?.objectKey;
    if (!before.objectsByKey[objectKey]) { fail('contract-removal-object-unknown', { objectKey: objectKey ?? null }); continue; }
    if (!Array.isArray(removal.referenceIds) || !removal.referenceIds.length) { fail('contract-references-invalid', { objectKey }); continue; }
    for (const id of removal.referenceIds) {
      const local = typeof id === 'string' && id.startsWith(prefix) ? id.slice(prefix.length) : null;
      const reference = local && byId.get(local);
      if (!reference || reference.objectKey !== objectKey) { fail('contract-reference-unknown', { objectKey }); continue; }
      if (reference.key !== 'link') { fail('contract-reference-not-link', { objectKey }); continue; }
      if (movedTo.has(local) || removed.has(local)) { fail('contract-reference-claimed-twice', { objectKey }); continue; }
      removed.add(local);
      removalObjects.add(objectKey);
    }
  }
  if (failures.length > structuralFailures) return finish();

  // 3. Expected reference lists per object.
  const grouped = (source) => {
    const map = new Map();
    for (const reference of source.references) map.set(reference.objectKey, [...(map.get(reference.objectKey) || []), reference]);
    return map;
  };
  const refsBefore = grouped(before), refsAfter = grouped(after);
  const incoming = new Map();
  for (const [id, recipientKey] of movedTo) incoming.set(recipientKey, [...(incoming.get(recipientKey) || []), byId.get(id)]);
  for (const list of incoming.values()) {
    list.sort((a, b) => {
      const sa = before.objectsByKey[a.objectKey], sb = before.objectsByKey[b.objectKey];
      return SCOPE_RANK[sa.geometryScope] - SCOPE_RANK[sb.geometryScope] || sa.sourceIndex - sb.sourceIndex
        || a.wrapperOrdinal - b.wrapperOrdinal || a.memberOrdinal - b.memberOrdinal;
    });
  }
  const affected = new Set([...[...movedTo.keys()].map((id) => byId.get(id).objectKey), ...incoming.keys(), ...removalObjects]);
  let moved = 0;
  for (const key of keysBefore) {
    const was = before.objectsByKey[key], now = after.objectsByKey[key];
    const expected = [...(refsBefore.get(key) || []).filter((reference) => !movedTo.has(reference.id) && !removed.has(reference.id)), ...(incoming.get(key) || [])];
    const actual = refsAfter.get(key) || [];
    if (!affected.has(key)) {
      if (was.hyperlinkRaw !== now.hyperlinkRaw) fail('unauthorized-hyperlink-change', { objectKey: key });
      continue;
    }
    if (expected.length !== actual.length) { fail('reference-count-mismatch', { objectKey: key }); continue; }
    expected.forEach((reference, index) => {
      const next = actual[index];
      if (memberView(reference) !== memberView(next)) fail('reference-content-mismatch', { objectKey: key });
      if (next.wrapperOrdinal === null || digitFree(reference.rawWrapper) !== digitFree(next.rawWrapper)) fail('wrapper-content-mismatch', { objectKey: key });
      if (incoming.get(key)?.includes(reference)) moved++;
    });
    if (!wholeWrapperCell(now.hyperlinkRaw)) fail('changed-cell-not-whole-wrappers', { objectKey: key });
    const numbers = wrapperNumbers(now.hyperlinkRaw).sort((a, b) => a.wrapperOrdinal - b.wrapperOrdinal).map((member) => member.wrapperNumber);
    if (!numbers.every((number, index) => number === index + 1)) fail('ordinals-not-contiguous', { objectKey: key });
    if (!actual.length && now.hyperlinkRaw !== '') fail('cleared-cell-not-empty', { objectKey: key });
  }
  if (moved !== movedTo.size) fail('moved-reference-count-mismatch');
  if (before.references.length - removed.size !== after.references.length) fail('reference-total-changed');

  // 5. Every other field.
  const authorized = new Map();
  for (const edit of Array.isArray(contract.fieldEdits) ? contract.fieldEdits : []) {
    if (edit?.target?.field === FIELD) { fail('field-edit-targets-hyperlink'); continue; }
    authorized.set(JSON.stringify([edit?.target?.scope, edit?.target?.sourceIndex, edit?.target?.field]), edit?.lexeme);
  }
  for (const [scope, collection] of Object.entries(COLLECTIONS)) {
    original[collection].forEach((object, sourceIndex) => {
      const lexBefore = object.attributes?.[GMI_SOURCE_LEXEMES] || {}, lexAfter = revised[collection][sourceIndex]?.attributes?.[GMI_SOURCE_LEXEMES] || {};
      const names = [...new Set([...Object.keys(lexBefore), ...Object.keys(lexAfter)])];
      for (const field of names) {
        if (field === FIELD) continue;
        const cellKey = JSON.stringify([scope, sourceIndex, field]);
        const want = authorized.has(cellKey) ? authorized.get(cellKey) : lexBefore[field];
        if (lexAfter[field] !== want) fail('unauthorized-field-change', { scope, sourceIndex, field });
      }
    });
  }

  // 6. Byte containment outside the authorized cell spans.
  const cellTargets = [
    ...[...affected].map((key) => ({ scope: before.objectsByKey[key].geometryScope, sourceIndex: before.objectsByKey[key].sourceIndex, field: FIELD })),
    ...[...authorized.keys()].map((cellKey) => { const [scope, sourceIndex, field] = JSON.parse(cellKey); return { scope, sourceIndex, field }; }),
  ];
  const spans = [];
  for (const target of cellTargets) {
    const was = resolveGmiCell(document, target), now = resolveGmiCell(outputDocument, target);
    if (!was.ok || !now.ok) { fail('authorized-cell-unresolvable', { scope: target.scope, sourceIndex: target.sourceIndex, field: target.field }); continue; }
    spans.push({ a: [was.cell.start, was.cell.end], b: [now.cell.start, now.cell.end] });
  }
  if (!failures.some((entry) => entry.code === 'authorized-cell-unresolvable')) {
    spans.sort((x, y) => x.a[0] - y.a[0]);
    const source = getGmiSourceBytes(document);
    let cursorA = 0, cursorB = 0, contained = true;
    const segmentEqual = (aStart, aEnd, bStart, bEnd) => {
      if (aEnd - aStart !== bEnd - bStart) return false;
      for (let i = 0; i < aEnd - aStart; i++) if (source[aStart + i] !== bytes[bStart + i]) return false;
      return true;
    };
    for (const span of spans) {
      if (span.b[0] < cursorB || !segmentEqual(cursorA, span.a[0], cursorB, span.b[0])) { contained = false; break; }
      cursorA = span.a[1]; cursorB = span.b[1];
    }
    if (contained && !segmentEqual(cursorA, source.length, cursorB, bytes.length)) contained = false;
    if (!contained) fail('bytes-changed-outside-authorized-cells');
  }

  return finish({ movedReferences: movedTo.size, removedReferences: removed.size, affectedCells: affected.size, authorizedFieldEdits: authorized.size,
    referencesBefore: before.references.length, referencesAfter: after.references.length });
}
