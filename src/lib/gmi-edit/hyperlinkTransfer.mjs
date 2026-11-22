// Source-preserving S_HYPERLINK reference transfer between point objects
// (Batch 1B.1: pure planner; NOT runtime-wired).
//
// Pure library. Plans the relocation of exact photograph reference groups from
// one point object's S_HYPERLINK cell to an explicitly chosen point object's
// S_HYPERLINK cell in the same immutable GMI source. Nothing here stages an M2
// ChangeSet, writes FOTO session or delivery state, records history or
// modifies source bytes.
//
//   planGmiHyperlinkTransfer(document, request)          -> frozen plan (no bytes)
//   buildGmiHyperlinkTransferProposal(plan, options)     -> verified proposed bytes or refusal
//   verifyGmiHyperlinkTransfer(...)                      see hyperlinkTransferVerify.mjs
//
// Composition (one basis, one edit per cell):
// - The removal half is the unchanged M7 planner (planGmiHyperlinkRemoval),
//   run once against the ORIGINAL document with the transfers as M7
//   selections. M7 eligibility therefore applies unchanged: confident ledger
//   edge, the complete edge reference set (repeated references stay
//   together), fresh-evidence agreement, whole one-link wrappers, whitespace
//   separators, encodability, 'renumber' ordinals.
// - The addition half is new. For every recipient cell the base lexeme is the
//   M7 proposed lexeme when that cell also loses references (a chain), or the
//   original lexeme otherwise. Both are derived from the original document
//   only; previously patched output is never patched again. Incoming wrappers
//   are appended after the last retained wrapper, so every cell has exactly ONE
//   edit: { expected: original lexeme, lexeme: composed lexeme }.
// - Proposals compose the M2 session's field edits and these S_HYPERLINK
//   edits in ONE M1 editGmiFields call, then run the independent transfer
//   verifier against the original bytes.
//
// Addition grammar (only what M7 and the observed delivered values support):
// - Recipient cell: exactly '' or whole `h:N(...)` wrappers, each with exactly
//   one `link:` member, whitespace-only separators and trailing text, and
//   original ordinals exactly 1..n. Anything else blocks; nothing is repaired.
// - An incoming wrapper is the source wrapper's raw text verbatim (link path,
//   `sign:` and any other metadata, inner spacing) with only its `h:N` digits
//   set to its new position. Paths are not rewritten: source and recipient are
//   in the same GMI, so the attachment base is the same.
// - Incoming wrappers are ordered by source object (scope, source index), then
//   by source wrapper/member ordinal; each is preceded by one U+0020 space.
//   The recipient's original leading and trailing whitespace stay where they
//   were. An originally empty recipient takes the trailing whitespace of the
//   first incoming reference's source cell (the source file's own convention).
//
// Batch 1B.3A (export composition): `request.removals` optionally adds M7
// delivery removals (photographs delivered through GML or excluded) to the SAME
// plan. They join the single M7 removal half, so a cell that loses moved
// references, loses delivery-removed references and receives moved references
// still gets exactly one edit composed from the original lexeme. A cell touched
// only by delivery removals takes M7's proposed lexeme unchanged (the M7
// contract applies to it as it does without a transfer). Overlapping claims
// (a removal of a transferred occurrence or reference) block.
//
// Conservative FOTO boundaries (blocking, not reinterpreted): non-GMI delivery
// decisions, accepted alternative positions, a recipient that already links or
// places the same photograph, FOTO-only sources without a live loaded-GMI
// binding, missing/ambiguous/unsafe matches. A transfer never sets a delivery
// intent and never invokes the position -> GML default; FOTO ownership,
// placement and provenance belong to the Batch 1B.2 transaction.
import { extractHyperlinkOccurrences } from '../hyperlinkFilenames.mjs';
import { createGmiPhotoSource } from '../photos/gmiPhotoSource.mjs';
import { validateGmiFieldLexeme } from './encoding.mjs';
import {
  GMI_HYPERLINK_FIELD, GMI_HYPERLINK_ORDINAL_POLICIES, GMI_HYPERLINK_REMOVAL_STATUS,
  gmiHyperlinkSelectionKey, planGmiHyperlinkRemoval,
} from './hyperlinkRemoval.mjs';
import { verifyGmiHyperlinkTransfer } from './hyperlinkTransferVerify.mjs';
import { editGmiFields } from './patch.mjs';
import { getGmiProposedState } from './proposed.mjs';
import { compileGmiEffectiveEdits, isGmiEditSession } from './session.mjs';
import { getGmiSourceBytes, gmiObjectLexemes, gmiSourceIntact, isGmiSourceDocument } from './sourceDocument.mjs';
import { gmiCellKey, resolveGmiCell } from './targets.mjs';

export const GMI_HYPERLINK_TRANSFER_STATUS = Object.freeze({
  READY: 'ready',
  EMPTY: 'empty',
  BLOCKED: 'blocked',
});

/** The only FOTO delivery status a transferred photograph may carry (Batch 1B.1 boundary). */
export const GMI_HYPERLINK_TRANSFER_DELIVERY_STATUS = 'keep-link';

const plans = new WeakMap();      // plan -> { document }
const SCOPE_ORDER = { point: 0, line: 1 };
const OBJECT_EVIDENCE_FIELDS = ['geometryScope', 'sourceIndex', 'parserId', 'guid', 'hyperlinkRaw'];

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (values) => [...new Set(values)].sort(compareStrings);
const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const isString = (value) => typeof value === 'string' && value.length > 0;
const plainCopy = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/** Transfer identity: the FOTO occurrence identity of the moved group (equals the M7 selection key). */
export const gmiHyperlinkTransferKey = gmiHyperlinkSelectionKey;

function compareBlockers(a, b) {
  return compareStrings(a.transferKey ?? '', b.transferKey ?? '') || compareStrings(a.code, b.code)
    || compareStrings(a.objectKey ?? '', b.objectKey ?? '') || compareStrings(a.referenceId ?? '', b.referenceId ?? '')
    || compareStrings(String(a.detail ?? ''), String(b.detail ?? ''));
}

function renumberWrapper(raw, number) {
  const match = /^(h:)(\d+)(\()/i.exec(raw);
  return match[1] + String(number) + raw.slice(match[1].length + match[2].length);
}

/**
 * Whole-wrapper layout of one S_HYPERLINK lexeme, or a blocking code. Accepts
 * exactly '' or `h:N(...)` wrappers with one link each, whitespace-only
 * separators and trailing text. `contiguous` reports ordinals exactly 1..n.
 */
export function gmiHyperlinkCellLayout(lexeme) {
  if (typeof lexeme !== 'string') return { ok: false, code: 'non-string' };
  if (lexeme === '') return { ok: true, empty: true, leading: '', trailing: '', wrappers: [], contiguous: true };
  if (!lexeme.trim()) return { ok: false, code: 'whitespace-only' };
  if (!/^h\s*:/i.test(lexeme.trim())) return { ok: false, code: 'bare-value' };
  const extracted = extractHyperlinkOccurrences(lexeme);
  const record = extracted.sources[0];
  if (extracted.sources.length !== 1 || !record?.validGrammar || !record.members.length) return { ok: false, code: 'invalid-grammar' };
  const byOrdinal = new Map();
  for (const member of record.members) {
    if (member.wrapperOrdinal === null) return { ok: false, code: 'bare-value' };
    if (!byOrdinal.has(member.wrapperOrdinal)) {
      byOrdinal.set(member.wrapperOrdinal, { ordinal: member.wrapperOrdinal, start: member.wrapperStart, end: member.wrapperEnd,
        raw: member.rawWrapper, number: member.wrapperNumber, links: [] });
    }
    if (member.key === 'link') byOrdinal.get(member.wrapperOrdinal).links.push(member);
  }
  const wrappers = [...byOrdinal.values()].sort((a, b) => a.ordinal - b.ordinal);
  for (const wrapper of wrappers) {
    if (!/^h:\d+\(/i.test(wrapper.raw) || lexeme.slice(wrapper.start, wrapper.end) !== wrapper.raw) return { ok: false, code: 'invalid-grammar' };
    if (wrapper.links.length === 0) return { ok: false, code: 'wrapper-without-link' };
    if (wrapper.links.length > 1) return { ok: false, code: 'multi-link-wrapper' };
  }
  for (let index = 1; index < wrappers.length; index++) {
    if (!/^\s*$/.test(lexeme.slice(wrappers[index - 1].end, wrappers[index].start))) return { ok: false, code: 'unsupported-separator' };
  }
  const leading = lexeme.slice(0, wrappers[0].start), trailing = lexeme.slice(wrappers.at(-1).end);
  if (!/^\s*$/.test(leading) || !/^\s*$/.test(trailing)) return { ok: false, code: 'unsupported-separator' };
  return { ok: true, empty: false, leading, trailing, wrappers,
    contiguous: wrappers.every((wrapper, index) => wrapper.number === index + 1) };
}

function normalizeTransfer(input, index) {
  if (!input || typeof input !== 'object') return { index, invalid: 'invalid-transfer' };
  const { sourceFingerprint, sourceObjectKey, assetId, sourceId = null, decisionKey = null } = input;
  const referenceIds = Array.isArray(input.referenceIds) ? [...input.referenceIds] : null;
  const recipient = input.recipient && typeof input.recipient === 'object' ? input.recipient : null;
  if (!isString(sourceFingerprint) || !isString(sourceObjectKey)) return { index, invalid: 'invalid-transfer' };
  if (!isString(assetId)) return { index, invalid: 'transfer-asset-missing' };
  if (!referenceIds || !referenceIds.length || referenceIds.some((id) => !isString(id))) return { index, invalid: 'invalid-transfer-references' };
  if (!recipient || !isString(recipient.objectKey)) return { index, invalid: 'recipient-missing' };
  if (!Number.isInteger(recipient.sourceIndex) || !Number.isInteger(recipient.parserId) || !('guid' in recipient)) return { index, invalid: 'recipient-identity-incomplete' };
  const unique = sortedUnique(referenceIds);
  const transferKey = gmiHyperlinkTransferKey({ sourceFingerprint, objectKey: sourceObjectKey, assetId });
  return { index, transferKey, decisionKey, sourceFingerprint, sourceObjectKey, assetId, sourceId, referenceIds: unique,
    duplicateReferenceIds: unique.length !== referenceIds.length,
    recipient: { objectKey: recipient.objectKey, scope: recipient.scope ?? 'point', sourceIndex: recipient.sourceIndex,
      parserId: recipient.parserId, guid: recipient.guid ?? null } };
}

// Batch 1B.3A: one M7 delivery removal (an M8 removal selection). The M7 planner validates it in full; this only
// records a deterministic copy for the plan and the overlap checks.
function normalizeRemoval(input) {
  const { sourceFingerprint = null, objectKey = null, assetId = null, sourceId = null } = input && typeof input === 'object' ? input : {};
  const referenceIds = Array.isArray(input?.referenceIds) ? sortedUnique(input.referenceIds) : [];
  const selectionKey = isString(sourceFingerprint) && isString(objectKey) && isString(assetId)
    ? gmiHyperlinkSelectionKey({ sourceFingerprint, objectKey, assetId }) : null;
  return { selectionKey, sourceFingerprint, objectKey, assetId, sourceId, referenceIds, occurrenceKey: input?.occurrenceKey ?? input?.key ?? null };
}

// Deterministic decision order, independent of input order: by transfer identity, then by full content.
function sortDecisions(decisions) {
  const keyOf = (decision) => JSON.stringify([decision?.sourceFingerprint ?? null, decision?.sourceObjectKey ?? null, decision?.assetId ?? null]);
  return decisions.map((decision) => [keyOf(decision), JSON.stringify(decision), decision])
    .sort((a, b) => compareStrings(a[0], b[0]) || compareStrings(a[1], b[1])).map((entry) => entry[2]);
}

function referenceIdPrefix(photoSource) {
  const prefix = photoSource.id == null ? '' : `${photoSource.id}:`;
  if (prefix && photoSource.references.length && photoSource.references.every((reference) => reference.id.startsWith(prefix))) return prefix;
  return '';
}

const outputReferenceId = (prefix, objectKey, wrapperOrdinal, memberOrdinal) =>
  `${prefix}${objectKey}:${GMI_HYPERLINK_FIELD}:0:${wrapperOrdinal}:${memberOrdinal}`;

function finalizePlan(document, plan) {
  const blockers = [...plan.blockers].sort(compareBlockers);
  const blocked = blockers.length > 0;
  const cells = blocked ? [] : plan.cells;
  const edits = blocked ? [] : plan.edits;
  const transfers = blocked ? [] : plan.transfers;
  const status = blocked ? GMI_HYPERLINK_TRANSFER_STATUS.BLOCKED : edits.length ? GMI_HYPERLINK_TRANSFER_STATUS.READY : GMI_HYPERLINK_TRANSFER_STATUS.EMPTY;
  const counts = {
    transfers: plan.decisions.length,
    cells: cells.length,
    sourceCells: cells.filter((cell) => cell.removedReferences.length).length,
    recipientCells: cells.filter((cell) => cell.addedReferences.length).length,
    chainCells: cells.filter((cell) => cell.removedReferences.length && cell.addedReferences.length).length,
    movedReferences: cells.reduce((sum, cell) => sum + cell.addedReferences.length, 0),
    blockers: blockers.length,
    warnings: plan.warnings.length,
  };
  // Batch 1B.3A: delivery removals are part of the plan identity only when supplied, so plans without them keep
  // exactly their previous keys and counts.
  const withRemovals = Array.isArray(plan.removals);
  if (withRemovals) {
    counts.deliveryRemovals = plan.removals.length;
    counts.deliveryCells = cells.filter((cell) => cell.deliveryRemovedReferences?.length).length;
    counts.deliveryRemovedReferences = cells.reduce((sum, cell) => sum + (cell.deliveryRemovedReferences?.length ?? 0), 0);
  }
  const planKey = JSON.stringify([plan.basis.documentFingerprint, plan.basis.session?.effectiveKey ?? null, plan.ordinalPolicy,
    plan.decisions.map((decision) => [decision.transferKey, decision.referenceIds, decision.recipient?.objectKey ?? null]),
    edits.map((edit) => [edit.target.scope, edit.target.sourceIndex, edit.expected, edit.lexeme]), status,
    ...(withRemovals ? [plan.removals.map((removal) => [removal.selectionKey, removal.referenceIds])] : [])]);
  const frozen = deepFreeze({
    kind: 'gmi-hyperlink-transfer-plan',
    ok: !blocked,
    status,
    ordinalPolicy: plan.ordinalPolicy,
    basis: plan.basis,
    decisions: plan.decisions,
    ...(withRemovals ? { removals: plan.removals } : {}),
    transfers,
    cells,
    edits,
    counts,
    warnings: [...plan.warnings].sort((a, b) => compareStrings(a.code, b.code) || compareStrings(a.objectKey ?? a.transferKey ?? a.assetId ?? '', b.objectKey ?? b.transferKey ?? b.assetId ?? '')),
    blockers,
    planKey,
  });
  plans.set(frozen, { document });
  return frozen;
}

export const isGmiHyperlinkTransferPlan = (value) => plans.has(value);

function photoStateIssues(photoState, transfer) {
  const entry = photoState?.byAssetId && Object.hasOwn(photoState.byAssetId, transfer.assetId) ? photoState.byAssetId[transfer.assetId] : null;
  if (!entry || typeof entry !== 'object') return ['photo-state-missing'];
  const issues = [];
  if (!Array.isArray(entry.deliveryStatuses) || entry.deliveryStatuses.some((status) => status !== GMI_HYPERLINK_TRANSFER_DELIVERY_STATUS)) issues.push('delivery-conflict');
  if (entry.acceptedAlternativePosition !== false) issues.push('accepted-position');
  if (!Array.isArray(entry.occurrenceObjectKeys)) issues.push('photo-state-missing');
  else if (entry.occurrenceObjectKeys.includes(transfer.recipient.objectKey)) issues.push('recipient-has-photo-placement');
  return issues;
}

const aliasColumns = (object) => Object.keys(object.attributes || {}).filter((key) => /^S_HYPERLINK/i.test(key) && key !== GMI_HYPERLINK_FIELD);

/**
 * Plan the transfer of photograph reference groups between point objects.
 *
 * @param {object} document the immutable ORIGINAL GmiSourceDocument (with fingerprint)
 * @param {object} request
 * @param {object} request.photoSource FOTO GMI source as stored by the photo session
 *   (id, fingerprint, objectsByKey, references, associationLedger, loadedBinding)
 * @param {Array<object>} request.transfers explicit «Flytt til punktobjekt» decisions:
 *   { sourceFingerprint, sourceObjectKey, assetId, referenceIds, sourceId?, decisionKey?,
 *     recipient: { objectKey, scope?: 'point', sourceIndex, parserId, guid } }
 * @param {{byAssetId: Object<string, {deliveryStatuses: string[], acceptedAlternativePosition: boolean,
 *   occurrenceObjectKeys: string[]}>}} request.photoState read-only FOTO facts for every transferred asset
 * @param {object} [request.session] the M2 edit session whose effective field edits the proposal also carries
 * @param {{documentFingerprint?: string, photoSourceFingerprint?: string, sessionEffectiveKey?: string|null}} [request.expectedBasis]
 * @param {'renumber'} [request.ordinalPolicy='renumber'] the only supported policy
 * @param {Array<object>} [request.removals] Batch 1B.3A: M7 delivery removal selections (GML/Ikke) composed in the
 *   same plan: { sourceFingerprint, objectKey, assetId, referenceIds, sourceId?, key?|occurrenceKey? }
 * @param {Iterable<string>} [request.acceptedAssetIds] passed to the M7 removal half
 * @returns frozen plan; `status` 'ready' | 'empty' | 'blocked'. A blocked plan has no cells, transfers or edits.
 */
export function planGmiHyperlinkTransfer(document, request = {}) {
  if (!isGmiSourceDocument(document)) throw new TypeError('planGmiHyperlinkTransfer expects a GmiSourceDocument');
  const { photoSource = null, transfers: rawTransfers, session = null, photoState = null, expectedBasis = null,
    ordinalPolicy = GMI_HYPERLINK_ORDINAL_POLICIES.RENUMBER, removals: rawRemovals = null, acceptedAssetIds = null } = request || {};
  const removals = Array.isArray(rawRemovals) ? rawRemovals.map(normalizeRemoval)
    .sort((a, b) => compareStrings(a.selectionKey ?? '', b.selectionKey ?? '') || compareStrings(JSON.stringify(a.referenceIds), JSON.stringify(b.referenceIds))) : null;
  const base = {
    ordinalPolicy,
    basis: {
      documentFingerprint: document.fingerprint ?? null,
      documentSize: document.size,
      photoSourceId: photoSource?.id ?? null,
      photoSourceFingerprint: photoSource?.fingerprint ?? null,
      liveBinding: photoSource?.loadedBinding ? plainCopy(photoSource.loadedBinding) : null,
      session: null,
    },
    decisions: Array.isArray(rawTransfers) ? sortDecisions(plainCopy(rawTransfers)) : [],
    ...(removals ? { removals: removals.map(({ selectionKey, objectKey, assetId, referenceIds }) => ({ selectionKey, objectKey, assetId, referenceIds })) } : {}),
    transfers: [], cells: [], edits: [], warnings: [], blockers: [],
  };
  const done = (extra = {}) => finalizePlan(document, { ...base, ...extra });
  const global = [];
  if (ordinalPolicy !== GMI_HYPERLINK_ORDINAL_POLICIES.RENUMBER) global.push({ code: 'ordinal-policy-unsupported', detail: String(ordinalPolicy) });
  if (!Array.isArray(rawTransfers)) global.push({ code: 'invalid-transfers' });
  if (rawRemovals !== null && !Array.isArray(rawRemovals)) global.push({ code: 'invalid-removals' });
  if (!document.editable) global.push({ code: 'document-not-editable', detail: document.status });
  if (!isString(document.fingerprint)) global.push({ code: 'document-fingerprint-unavailable' });
  if (!gmiSourceIntact(document)) global.push({ code: 'source-bytes-mutated' });
  if (!photoSource || photoSource.kind !== 'gmi' || !photoSource.objectsByKey || !Array.isArray(photoSource.references)) global.push({ code: 'invalid-photo-source' });
  else if (photoSource.loadedBinding?.live !== true) global.push({ code: 'photo-source-not-live-bound' });
  if (session !== null && (!isGmiEditSession(session) || session.document !== document)) global.push({ code: 'session-document-mismatch' });
  if (expectedBasis) {
    if ('documentFingerprint' in expectedBasis && expectedBasis.documentFingerprint !== document.fingerprint) global.push({ code: 'stale-basis', detail: 'documentFingerprint' });
    if ('photoSourceFingerprint' in expectedBasis && expectedBasis.photoSourceFingerprint !== photoSource?.fingerprint) global.push({ code: 'stale-basis', detail: 'photoSourceFingerprint' });
  }
  if (global.length) return done({ blockers: global });

  let proposed = null;
  if (session) {
    const compiled = compileGmiEffectiveEdits(session);
    if (!compiled.ok) return done({ blockers: [{ code: 'session-not-compilable', detail: compiled.code }] });
    proposed = getGmiProposedState(session);
    if (!proposed.ok) return done({ blockers: [{ code: 'session-proposal-failed', detail: proposed.stage }] });
    base.basis.session = { stateKey: session.stateKey, effectiveKey: compiled.effectiveKey, fieldEditCount: compiled.edits.length };
  }
  if (expectedBasis && 'sessionEffectiveKey' in expectedBasis && (expectedBasis.sessionEffectiveKey ?? null) !== (base.basis.session?.effectiveKey ?? null)) {
    return done({ blockers: [{ code: 'stale-basis', detail: 'sessionEffectiveKey' }] });
  }

  const fresh = createGmiPhotoSource(document.parser, document.fingerprint);
  const prefix = referenceIdPrefix(photoSource);
  const freshById = new Map(fresh.references.map((reference) => [reference.id, reference]));
  const ledger = photoSource.associationLedger;
  const blockers = [], warnings = [];

  // 1. Normalize and check each decision on its own.
  const valid = [];
  rawTransfers.map(normalizeTransfer).forEach((transfer) => {
    if (transfer.invalid) blockers.push({ code: transfer.invalid, detail: String(transfer.index) });
    else valid.push(transfer);
  });
  valid.sort((a, b) => compareStrings(a.transferKey, b.transferKey));
  const seen = new Set();
  const eligible = [];
  for (const transfer of valid) {
    const block = (code, detail = {}) => blockers.push({ code, transferKey: transfer.transferKey, ...detail });
    const before = blockers.length;
    if (seen.has(transfer.transferKey)) { block('duplicate-transfer'); continue; }
    seen.add(transfer.transferKey);
    if (transfer.duplicateReferenceIds) block('duplicate-transfer-reference');
    const source = fresh.objectsByKey[transfer.sourceObjectKey];
    const recipientKey = transfer.recipient.objectKey;
    const recipient = fresh.objectsByKey[recipientKey];
    if (source) {
      if (source.geometryScope !== 'point') block('source-not-point');
      if (source.identityIssues.length) block('source-identity', { detail: source.identityIssues.join(',') });
      if (aliasColumns(source).length) block('source-hyperlink-alias-columns');
      const layout = gmiHyperlinkCellLayout(source.hyperlinkRaw);
      if (!layout.ok) block('source-hyperlink-shape', { detail: layout.code });
    }
    if (recipientKey === transfer.sourceObjectKey) block('recipient-is-source');
    else if (!recipient) block('recipient-not-found');
    else {
      const supplied = photoSource.objectsByKey[recipientKey];
      if (!supplied || OBJECT_EVIDENCE_FIELDS.some((field) => !Object.is(supplied[field] ?? null, recipient[field] ?? null))) block('recipient-evidence-mismatch');
      if (recipient.geometryScope !== 'point' || transfer.recipient.scope !== 'point') block('recipient-not-point');
      else if (transfer.recipient.sourceIndex !== recipient.sourceIndex || transfer.recipient.parserId !== recipient.parserId
        || transfer.recipient.guid !== recipient.guid) block('recipient-identity-mismatch');
      if (recipient.identityIssues.length) block('recipient-identity', { detail: recipient.identityIssues.join(',') });
      if (!Array.isArray(recipient.rawGeometry) || recipient.rawGeometry.length !== 1) block('recipient-geometry-invalid');
      if (aliasColumns(recipient).length) block('recipient-hyperlink-alias-columns');
      // The same photograph already on the recipient (any confident edge), judged on the original basis.
      const existing = (ledger?.reverseIndexes?.byObjectKey?.[recipientKey] || []).map((id) => ledger.associationsById[id]?.photoId);
      if (existing.includes(transfer.assetId)) block('recipient-already-links-photo');
    }
    for (const referenceId of transfer.referenceIds) {
      const evidence = referenceId.startsWith(prefix) ? freshById.get(referenceId.slice(prefix.length)) : null;
      if (evidence && evidence.wrapperOrdinal === null) block('source-reference-bare', { referenceId });
    }
    for (const code of photoStateIssues(photoState, transfer)) block(code);
    if (blockers.length === before) eligible.push(transfer);
  }
  // Cross-decision: one photograph proposed twice for one recipient.
  const byRecipientAsset = new Map();
  for (const transfer of eligible) {
    const key = JSON.stringify([transfer.recipient.objectKey, transfer.assetId]);
    byRecipientAsset.set(key, [...(byRecipientAsset.get(key) || []), transfer]);
  }
  for (const group of byRecipientAsset.values()) {
    if (group.length > 1) for (const transfer of group) blockers.push({ code: 'duplicate-recipient-photo', transferKey: transfer.transferKey });
  }

  // Batch 1B.3A: a delivery removal never claims a transferred occurrence or reference (M7 refuses overlapping
  // references too, but an overlap is reported here as what it is).
  const transferKeys = new Set(valid.map((transfer) => transfer.transferKey));
  const transferReferences = new Set(valid.flatMap((transfer) => transfer.referenceIds));
  for (const removal of removals || []) {
    if (removal.selectionKey && transferKeys.has(removal.selectionKey)) blockers.push({ code: 'removal-overlaps-transfer', selectionKey: removal.selectionKey, transferKey: removal.selectionKey });
    else if (removal.referenceIds.some((id) => transferReferences.has(id))) blockers.push({ code: 'removal-overlaps-transfer', selectionKey: removal.selectionKey ?? undefined });
  }

  // 2. Removal half: the unchanged M7 planner over every valid decision (and, Batch 1B.3A, every delivery removal).
  const removal = planGmiHyperlinkRemoval(document, {
    photoSource, session,
    ordinalPolicy: GMI_HYPERLINK_ORDINAL_POLICIES.RENUMBER,
    ...(acceptedAssetIds !== null ? { acceptedAssetIds } : {}),
    selections: [...valid.map((transfer) => ({ sourceFingerprint: transfer.sourceFingerprint, objectKey: transfer.sourceObjectKey,
      assetId: transfer.assetId, referenceIds: transfer.referenceIds, sourceId: transfer.sourceId })),
    ...(rawRemovals || []).map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))],
  });
  if (removal.status === GMI_HYPERLINK_REMOVAL_STATUS.BLOCKED) {
    for (const entry of removal.blockers) {
      const { selectionKey, ...rest } = entry;
      const owner = !selectionKey ? {} : transferKeys.has(selectionKey) ? { transferKey: selectionKey } : { selectionKey };
      blockers.push({ ...rest, code: `removal:${entry.code}`, ...owner });
    }
  }
  if (blockers.length) return done({ blockers });
  for (const warning of removal.warnings) warnings.push({ ...plainCopy(warning), origin: 'removal' });

  // 3. Addition half: compose every affected cell once against the original basis.
  const removalCells = new Map(removal.cells.map((cell) => [cell.objectKey, cell]));
  const incomingByRecipient = new Map();
  for (const transfer of eligible) {
    const source = fresh.objectsByKey[transfer.sourceObjectKey];
    const removed = (removalCells.get(transfer.sourceObjectKey)?.removedReferences || []).filter((reference) => reference.selectionKey === transfer.transferKey);
    if (removed.length !== transfer.referenceIds.length) { blockers.push({ code: 'removal-reference-count-mismatch', transferKey: transfer.transferKey }); continue; }
    if (removed.length > 1) warnings.push({ code: 'repeated-references-carried', transferKey: transfer.transferKey, count: removed.length });
    const list = incomingByRecipient.get(transfer.recipient.objectKey) || [];
    for (const reference of removed) list.push({ transfer, source, reference, evidence: freshById.get(reference.referenceId.slice(prefix.length)) });
    incomingByRecipient.set(transfer.recipient.objectKey, list);
  }
  const affected = sortedUnique([...removalCells.keys(), ...incomingByRecipient.keys()]);
  const cells = [], edits = [];
  const referenceMoves = new Map();       // old reference id -> new reference id (moved references)
  for (const objectKey of affected) {
    const object = fresh.objectsByKey[objectKey];
    const removalCell = removalCells.get(objectKey) || null;
    const incoming = (incomingByRecipient.get(objectKey) || []).sort((a, b) =>
      SCOPE_ORDER[a.source.geometryScope] - SCOPE_ORDER[b.source.geometryScope] || a.source.sourceIndex - b.source.sourceIndex
      || a.reference.wrapperOrdinal - b.reference.wrapperOrdinal || a.reference.memberOrdinal - b.reference.memberOrdinal);
    const blockCell = (code, detail = {}) => {
      const keys = sortedUnique([...(removalCell?.removedReferences || []).map((reference) => reference.selectionKey), ...incoming.map((entry) => entry.transfer.transferKey)]);
      for (const key of keys) blockers.push({ code, ...(transferKeys.has(key) ? { transferKey: key } : { selectionKey: key }), objectKey, ...detail });
    };
    const resolved = resolveGmiCell(document, { scope: object.geometryScope, sourceIndex: object.sourceIndex,
      field: GMI_HYPERLINK_FIELD, objectId: object.parserId, guid: object.guid });
    if (!resolved.ok) { blockCell('hyperlink-cell-not-editable', { detail: resolved.code }); continue; }
    const { cell } = resolved;
    if (cell.lexeme !== object.hyperlinkRaw) { blockCell('hyperlink-lexeme-mismatch'); continue; }
    // Batch 1B.3A: removed references split by purpose. A cell touched only by delivery removals is the M7 result
    // as it stands (no transfer layout rule applies to it), composed in the same single edit list.
    const movedOut = (removalCell?.removedReferences || []).filter((reference) => transferKeys.has(reference.selectionKey));
    const deliveryRemoved = (removalCell?.removedReferences || []).filter((reference) => !transferKeys.has(reference.selectionKey));
    const deliveryView = (reference) => ({ referenceId: reference.referenceId, selectionKey: reference.selectionKey, assetId: reference.assetId,
      referenceRaw: reference.referenceRaw, rawWrapper: reference.rawWrapper, filename: reference.filename, bare: reference.bare });
    if (!incoming.length && !movedOut.length) {
      cells.push({
        key: cell.key, scope: cell.scope, sourceIndex: cell.sourceIndex, objectId: cell.objectId, guid: cell.guid, objectKey,
        field: GMI_HYPERLINK_FIELD, start: cell.start, end: cell.end, original: cell.lexeme, proposed: removalCell.proposed,
        removedReferences: [], deliveryRemovedReferences: deliveryRemoved.map(deliveryView), addedReferences: [],
        ordinalChanges: plainCopy(removalCell.ordinalChanges),
      });
      continue;
    }
    if (proposed && gmiObjectLexemes(proposed.document, cell.scope, cell.sourceIndex)?.[GMI_HYPERLINK_FIELD] !== cell.lexeme) {
      blockCell('hyperlink-changed-by-field-edits'); continue;
    }
    const originalLayout = gmiHyperlinkCellLayout(cell.lexeme);
    if (!originalLayout.ok) { blockCell('recipient-hyperlink-shape', { detail: originalLayout.code }); continue; }
    if (!removalCell && !originalLayout.contiguous) { blockCell('recipient-ordinals-not-contiguous'); continue; }
    const baseLexeme = removalCell ? removalCell.proposed : cell.lexeme;
    const baseLayout = removalCell ? gmiHyperlinkCellLayout(baseLexeme) : originalLayout;
    if (!baseLayout.ok || !baseLayout.contiguous) { blockCell('composition-base-invalid', { detail: baseLayout.code ?? 'ordinals' }); continue; }
    let lexeme = baseLexeme;
    const addedReferences = [];
    if (incoming.length) {
      const retained = baseLayout.wrappers.length;
      const added = incoming.map((entry, index) => renumberWrapper(entry.reference.rawWrapper, retained + index + 1));
      if (retained) {
        const end = baseLayout.wrappers.at(-1).end;
        lexeme = baseLexeme.slice(0, end) + added.map((text) => ` ${text}`).join('') + baseLexeme.slice(end);
      } else {
        const trailing = originalLayout.empty ? gmiHyperlinkCellLayout(incoming[0].source.hyperlinkRaw).trailing : originalLayout.trailing;
        lexeme = added.join(' ') + trailing;
      }
      incoming.forEach((entry, index) => {
        const newId = outputReferenceId(prefix, objectKey, retained + index, entry.reference.memberOrdinal);
        referenceMoves.set(entry.reference.referenceId, newId);
        addedReferences.push({ referenceId: entry.reference.referenceId, outputReferenceId: newId, transferKey: entry.transfer.transferKey,
          assetId: entry.transfer.assetId, fromObjectKey: entry.transfer.sourceObjectKey, referenceRaw: entry.reference.referenceRaw,
          filename: entry.reference.filename, rawWrapper: entry.reference.rawWrapper, proposedWrapper: added[index],
          wrapperNumber: retained + index + 1 });
      });
    }
    // Planner self-check (the independent verifier runs separately on bytes).
    const after = gmiHyperlinkCellLayout(lexeme);
    const expectedCount = baseLayout.wrappers.length + incoming.length;
    if (!after.ok || !after.contiguous || after.wrappers.length !== expectedCount) { blockCell('transfer-self-check-failed'); continue; }
    // Filename collisions in the final cell: duplicates are allowed only where they already existed
    // among the retained references or travel together inside one moved group.
    const names = new Map();
    for (const wrapper of after.wrappers.slice(0, baseLayout.wrappers.length)) {
      const key = extractHyperlinkOccurrences(wrapper.raw).occurrences[0]?.normalizedKey;
      if (key) names.set(key, [...(names.get(key) || []), 'retained']);
    }
    incoming.forEach((entry) => {
      const key = entry.evidence?.normalizedKey;
      if (key) names.set(key, [...(names.get(key) || []), entry.transfer.transferKey]);
    });
    const collision = [...names.values()].some((owners) => new Set(owners).size > 1 && owners.some((owner) => owner !== 'retained'));
    if (collision) { blockCell('recipient-filename-collision'); continue; }
    const encoded = validateGmiFieldLexeme(lexeme, document.encoding.encodingClass);
    if (!encoded.ok) { blockCell('transfer-lexeme-not-encodable', { detail: encoded.code }); continue; }
    if (incoming.length && originalLayout.wrappers.length) warnings.push({ code: 'recipient-existing-links-retained', objectKey, count: originalLayout.wrappers.length });
    cells.push({
      key: cell.key, scope: cell.scope, sourceIndex: cell.sourceIndex, objectId: cell.objectId, guid: cell.guid, objectKey,
      field: GMI_HYPERLINK_FIELD, start: cell.start, end: cell.end, original: cell.lexeme, proposed: lexeme,
      removedReferences: movedOut.map((reference) => ({ referenceId: reference.referenceId,
        transferKey: reference.selectionKey, assetId: reference.assetId, referenceRaw: reference.referenceRaw, rawWrapper: reference.rawWrapper })),
      ...(removals ? { deliveryRemovedReferences: deliveryRemoved.map(deliveryView) } : {}),
      addedReferences,
      ordinalChanges: removalCell ? plainCopy(removalCell.ordinalChanges) : [],
    });
  }
  if (blockers.length) return done({ blockers });
  cells.sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || a.sourceIndex - b.sourceIndex);
  for (const cell of cells) {
    edits.push({ target: { scope: cell.scope, sourceIndex: cell.sourceIndex, field: GMI_HYPERLINK_FIELD, objectId: cell.objectId, guid: cell.guid },
      expected: cell.original, lexeme: cell.proposed });
  }
  const transfers = eligible.map((transfer) => ({
    transferKey: transfer.transferKey, decisionKey: transfer.decisionKey, assetId: transfer.assetId,
    fromObjectKey: transfer.sourceObjectKey, toObjectKey: transfer.recipient.objectKey, referenceIds: transfer.referenceIds,
    outputReferenceIds: transfer.referenceIds.map((id) => referenceMoves.get(id)),
  }));
  return done({ transfers, cells, edits, warnings });
}

const refused = (stage, rejections) => Object.freeze({ ok: false, stage,
  rejections: Object.freeze(rejections.map((entry) => Object.freeze({ ...entry }))) });

/**
 * Build the proposed revised bytes for a ready plan, composed with the M2
 * session's field edits when the plan was made with one. Pure: the source
 * document, the session and every FOTO structure stay untouched; nothing is
 * published or recorded. Returns bytes only after M1 verification and the
 * independent transfer verifier pass:
 *   { ok: true, bytes, document, identical, planKey, verification }
 * otherwise { ok: false, stage, rejections }.
 *
 * @param {object} plan from planGmiHyperlinkTransfer
 * @param {object} options
 * @param {object} [options.session] required iff the plan has a session basis
 * @param {{transferKeys: string[]}} options.authorization must equal the plan's transfer keys
 */
export function buildGmiHyperlinkTransferProposal(plan, { session = null, authorization = null } = {}) {
  if (!isGmiHyperlinkTransferPlan(plan)) return refused('authorize', [{ code: 'not-a-transfer-plan' }]);
  const { document } = plans.get(plan);
  if (plan.status === GMI_HYPERLINK_TRANSFER_STATUS.BLOCKED) return refused('authorize', [{ code: 'plan-blocked' }]);
  const planned = sortedUnique(plan.transfers.map((transfer) => transfer.transferKey));
  if (planned.length || authorization !== null) {
    const keys = Array.isArray(authorization?.transferKeys) ? sortedUnique(authorization.transferKeys) : null;
    if (!keys || keys.length !== authorization.transferKeys.length) return refused('authorize', [{ code: 'missing-authorization' }]);
    if (!sameList(keys, planned)) return refused('authorize', [{ code: 'authorization-mismatch' }]);
  }
  if (!gmiSourceIntact(document)) return refused('authorize', [{ code: 'source-bytes-mutated' }]);
  let fieldEdits = [];
  if (plan.basis.session) {
    if (!session || !isGmiEditSession(session) || session.document !== document) return refused('compose', [{ code: 'session-required' }]);
    const compiled = compileGmiEffectiveEdits(session);
    if (!compiled.ok) return refused('compose', [{ code: 'session-not-compilable', detail: compiled.code }]);
    if (compiled.effectiveKey !== plan.basis.session.effectiveKey) return refused('compose', [{ code: 'stale-session-state' }]);
    fieldEdits = compiled.edits;
  } else if (session) {
    return refused('compose', [{ code: 'session-not-in-plan-basis' }]);
  }
  const hyperlinkKeys = new Set(plan.edits.map((edit) => gmiCellKey(edit.target)));
  for (const edit of fieldEdits) {
    if (edit.target.field === GMI_HYPERLINK_FIELD || hyperlinkKeys.has(gmiCellKey(edit.target))) return refused('compose', [{ code: 'field-edit-overlaps-hyperlink' }]);
  }
  const edits = [...fieldEdits, ...plan.edits];
  if (!edits.length) {
    return Object.freeze({ ok: true, kind: 'gmi-hyperlink-transfer-proposal', identical: true, planKey: plan.planKey,
      bytes: getGmiSourceBytes(document), document, fieldEditCount: 0, verification: Object.freeze({ field: null, transfer: null }) });
  }
  const result = editGmiFields(document, edits);
  if (!result.ok) return refused(result.stage, result.rejections);
  const transfer = verifyGmiHyperlinkTransfer(document, result.bytes, {
    documentFingerprint: plan.basis.documentFingerprint,
    photoSourceId: plan.basis.photoSourceId,
    transfers: plan.decisions,
    fieldEdits: fieldEdits.map((edit) => ({ target: edit.target, lexeme: edit.lexeme })),
  });
  if (!transfer.ok) return refused('verify-transfer', transfer.failures);
  return Object.freeze({
    ok: true, kind: 'gmi-hyperlink-transfer-proposal', identical: false, planKey: plan.planKey,
    bytes: result.bytes, document: result.verification.outputDocument, fieldEditCount: fieldEdits.length,
    verification: Object.freeze({ field: result.verification.summary, transfer: transfer.summary }),
  });
}
