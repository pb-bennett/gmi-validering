// Field-editing session state for source-preserving GMI editing (M2).
//
// A session is an immutable value:
//   { kind, document, layerId, editable, changeSets (ordered, active),
//     redo (stack, last = next to redo), stateKey }
// Every transition (stage, undo, redo, discard, discard all) returns a new
// session and leaves the previous one and the source document untouched, so
// state transitions are deterministic and testable without React or Zustand.
// A store only needs to hold the current session value.
//
// The effective value of a cell is the `next` of the last active ChangeSet
// containing it, otherwise the delivered (`original`) lexeme. Effective edits
// are compiled as one edit per changed cell, with the original source lexeme
// as `expected`, and applied once against the original (proposed.mjs).
//
// `stateKey` identifies the exact active history (ordered ChangeSet ids). A
// ChangeSet is built against one stateKey and can be staged only on that state
// of the same session lineage (stale or foreign sets are refused).
//
// Batch 1B.2A: the same history also holds hyperlink transfer sets
// (`kind: 'gmi-hyperlink-transfer-set'`, internal, not user-reachable yet).
// A transfer set is one history entry that carries a complete verified
// S_HYPERLINK transfer plan against the ORIGINAL document plus the
// corresponding FOTO ownership/position/provenance record. Sets are
// cumulative: each holds every active transfer decision, so the effective
// transfer state is exactly the last active transfer set and undo/redo of
// that one entry restores or reapplies GMI and FOTO state together. Ordinary
// field ChangeSets never touch S_HYPERLINK (the reserved guard is unchanged)
// and transfer sets touch nothing else, so the two never overlap.
//
// While a transfer is active, compileGmiEffectiveEdits fails closed
// ('hyperlink-transfer-active'): consumers that only know field edits (M7
// delivery removal, field export) cannot silently drop the transfer. The
// proposed state uses compileGmiProposedEdits (field + transfer edits).
import {
  GMI_CHANGE_SET_MODES, buildGmiChangeSet, compareGmiCells, computeGmiEffectiveCells,
  gmiChangeSetProvenance, isGmiChangeSet, isGmiFieldEditReservedColumn,
} from './changeSet.mjs';
import { validateGmiFieldLexeme } from './encoding.mjs';
import { isGmiSourceDocument } from './sourceDocument.mjs';
import { gmiCellKey, resolveGmiCell } from './targets.mjs';

const sessions = new WeakMap();   // session -> { lineage }
const derived = new WeakMap();    // session -> memoized effective state
const transferSets = new WeakMap(); // transfer set -> { document, lineage, stateKey }

export const GMI_HYPERLINK_TRANSFER_SET_KIND = 'gmi-hyperlink-transfer-set';
const HYPERLINK_FIELD = 'S_HYPERLINK';

export const isGmiHyperlinkTransferSet = (value) => transferSets.has(value);
const historyProvenance = (entry) => gmiChangeSetProvenance(entry) || transferSets.get(entry) || null;
const lastTransferSet = (entries) => entries.findLast((entry) => transferSets.has(entry)) || null;

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
const plainCopy = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

const fail = (code, detail = {}) => Object.freeze({ ok: false, code, ...detail });

function lineageOf(session) {
  const state = sessions.get(session);
  if (!state) throw new TypeError('not a GMI edit session');
  return state.lineage;
}

export const isGmiEditSession = (value) => sessions.has(value);

const stateKeyOf = (changeSets) => JSON.stringify(changeSets.map((changeSet) => changeSet.id));

function makeSession(lineage, changeSets, redo) {
  const session = Object.freeze({
    kind: 'gmi-edit-session',
    document: lineage.document,
    layerId: lineage.layerId,
    editable: lineage.document.editable,
    changeSets: Object.freeze([...changeSets]),
    redo: Object.freeze([...redo]),
    stateKey: stateKeyOf(changeSets),
  });
  sessions.set(session, { lineage });
  return session;
}

/**
 * Start an empty session for one immutable source document.
 * @param {object} document GmiSourceDocument (M1)
 * @param {{layerId?: string}} [options] layerId is used for validation runs
 */
export function createGmiEditSession(document, { layerId = 'gmi-edit-session' } = {}) {
  if (!isGmiSourceDocument(document)) throw new TypeError('createGmiEditSession expects a GmiSourceDocument');
  if (typeof layerId !== 'string' || !layerId.trim()) throw new TypeError('layerId must be a non-empty string');
  return makeSession({ document, layerId, nextSequence: 1 }, [], []);
}

function effectiveState(session) {
  lineageOf(session);
  let state = derived.get(session);
  if (!state) {
    const fieldSets = session.changeSets.filter((entry) => !transferSets.has(entry));
    const cells = computeGmiEffectiveCells(fieldSets);
    const ordered = [...cells.values()].sort(compareGmiCells);
    const changed = ordered.filter((entry) => entry.proposed !== entry.original);
    const edits = changed.map((entry) => Object.freeze({
      target: Object.freeze({ scope: entry.scope, sourceIndex: entry.sourceIndex, field: entry.field, objectId: entry.objectId, guid: entry.guid }),
      expected: entry.original,
      lexeme: entry.proposed,
    }));
    const fieldKey = JSON.stringify(changed.map((entry) => [entry.scope, entry.sourceIndex, entry.field, entry.original, entry.proposed]));
    // The active transfer is the last transfer set; its plan is complete and was made against the original document.
    const transfer = lastTransferSet(session.changeSets);
    const hyperlinkEdits = transfer ? transfer.edits : Object.freeze([]);
    // Byte identity of the proposed copy: unchanged for field-only sessions, extended by the transfer plan otherwise.
    const effectiveKey = transfer ? JSON.stringify({ fields: fieldKey, hyperlinkTransfer: transfer.planKey }) : fieldKey;
    state = { cells, ordered, changed, edits: Object.freeze(edits), fieldKey, transfer, hyperlinkEdits, effectiveKey };
    derived.set(session, state);
  }
  return state;
}

/** Internal for sibling modules: Map<cellKey, entry> of touched cells. */
export function gmiSessionEffectiveCells(session) {
  return effectiveState(session).cells;
}

// ---------------------------------------------------------------- building

function buildContext(session) {
  const lineage = lineageOf(session);
  const sequence = lineage.nextSequence++;
  return { document: session.document, lineage, stateKey: session.stateKey, effective: effectiveState(session).cells, id: `cs-${sequence}`, sequence };
}

/**
 * Build (but do not stage) a ChangeSet from explicit cell requests against
 * the current session state. See changeSet.mjs `buildGmiChangeSet` for the
 * spec. Every ChangeSet defaults to mode 'fill-missing' and conflict policy
 * 'skip'; overwriting populated values and replacing earlier proposals both
 * require an explicit option.
 */
export function createGmiFieldChangeSet(session, spec) {
  // Eligibility-derived skip records are only accepted from the batch path,
  // where the eligibility basis is checked.
  const { preSkipped, eligibility, ...rest } = spec && typeof spec === 'object' ? spec : {};
  void preSkipped; void eligibility;
  return buildGmiChangeSet(buildContext(session), spec && typeof spec === 'object' ? rest : spec);
}

/**
 * One object, one or more columns: `values` maps exact delivered column names
 * to new lexemes. Identity guards (`objectId`, `guid`) are recommended.
 */
export function createGmiObjectCorrection(session, { scope, sourceIndex, objectId, guid, values, ...options } = {}) {
  if (!values || typeof values !== 'object') return Object.freeze({ ok: false, rejections: Object.freeze([Object.freeze({ code: 'no-requests' })]) });
  const identity = {};
  if (objectId !== undefined) identity.objectId = objectId;
  if (guid !== undefined) identity.guid = guid;
  const requests = Object.entries(values).map(([field, lexeme]) => ({ scope, sourceIndex, field, lexeme, ...identity }));
  return buildGmiChangeSet(buildContext(session), { origin: 'object-editor', ...options, requests });
}

/**
 * One column, one lexeme, many objects. Targets are either explicit
 * (`targets: [{scope, sourceIndex, objectId?, guid?}]`) or an eligibility
 * result from evaluateGmiBatchEligibility on this exact session state; then
 * only its eligible objects are requested and its skipped objects are kept
 * in the ChangeSet record.
 * Opt-in `manualTargets` plus `allowApplicabilityOverride: true` may include
 * only technically resolved not-applicable/unresolved entries from that exact
 * eligibility/session. This does not authorize populated-value overwrite or
 * conflict replacement; those still require their separate options.
 */
export function createGmiBatchCorrection(session, { field, lexeme, targets, eligibility, manualTargets = [], allowApplicabilityOverride = false, ...options } = {}) {
  const reject = (code, detail = {}) => Object.freeze({ ok: false, rejections: Object.freeze([Object.freeze({ code, ...detail })]) });
  if (isGmiFieldEditReservedColumn(field)) return reject('field-owned-by-photo-delivery', { field });
  if (targets && eligibility) return reject('ambiguous-targets');
  if (!Array.isArray(manualTargets)) return reject('invalid-manual-targets');
  if (manualTargets.length && (!eligibility || allowApplicabilityOverride !== true)) return reject('manual-override-not-approved');
  let requests, preSkipped, eligibilitySummary = null;
  if (eligibility) {
    const basis = gmiEligibilityBasis(eligibility);
    if (!basis) return reject('invalid-eligibility');
    if (basis.lineage !== lineageOf(session)) return reject('foreign-eligibility');
    if (basis.stateKey !== session.stateKey) return reject('stale-eligibility');
    if (manualTargets.length && basis.session !== session) return reject('stale-eligibility');
    const column = field ?? eligibility.field;
    if (column !== eligibility.field) return reject('eligibility-field-mismatch');
    const mode = options.mode ?? GMI_CHANGE_SET_MODES.FILL_MISSING;
    if (mode !== eligibility.mode) return reject('eligibility-mode-mismatch', { eligibilityMode: eligibility.mode, mode });
    // Only genuine, technically resolved M2 exclusions may be overridden. The
    // ordinary builder still enforces original-value, conflict and M1 safety.
    const manual = [], seen = new Set();
    const skippedTargets = new Map(eligibility.skipped.map((row) => [`${row.scope}:${row.sourceIndex}`, row]));
    for (const target of manualTargets) {
      if (!Number.isInteger(target?.sourceIndex)) return reject('invalid-manual-targets');
      const entry = skippedTargets.get(`${target?.scope}:${target?.sourceIndex}`);
      if (!entry?.key || !['not-applicable', 'unresolved'].includes(entry.reason)) return reject('manual-target-not-allowed');
      if (mode === GMI_CHANGE_SET_MODES.FILL_MISSING && (!entry.missing || entry.original.trim() !== '')) return reject('manual-overwrite-not-approved');
      if (seen.has(entry.key)) return reject('duplicate-target');
      seen.add(entry.key); manual.push(entry);
    }
    if (!eligibility.eligible.length && !manual.length) return reject('no-eligible-objects');
    requests = [...eligibility.eligible, ...manual].map((entry) => ({ scope: entry.scope, sourceIndex: entry.sourceIndex, objectId: entry.objectId, guid: entry.guid, field: column, lexeme }));
    preSkipped = eligibility.skipped.filter((entry) => !seen.has(entry.key)).map((entry) => ({ key: entry.key, scope: entry.scope, sourceIndex: entry.sourceIndex, field: column, position: entry.position, reason: entry.reason, ...(entry.applicability ? { applicability: entry.applicability } : {}) }));
    eligibilitySummary = { ruleId: eligibility.ruleId, canonicalFieldId: eligibility.canonicalFieldId, counts: eligibility.counts,
      normallyEligible: eligibility.eligible.map((entry) => ({ key: entry.key, scope: entry.scope, sourceIndex: entry.sourceIndex })),
      manualOverrides: manual.map((entry) => ({ key: entry.key, scope: entry.scope, sourceIndex: entry.sourceIndex,
        objectId: entry.objectId, reason: entry.reason, applicability: entry.applicability, evidence: entry.evidence,
        original: entry.original, current: entry.current })),
    };
  } else {
    if (!Array.isArray(targets)) return reject('no-requests');
    requests = targets.map((target) => {
      const request = { scope: target?.scope, sourceIndex: target?.sourceIndex, field, lexeme };
      if (target && 'objectId' in target) request.objectId = target.objectId;
      if (target && 'guid' in target) request.guid = target.guid;
      return request;
    });
  }
  return buildGmiChangeSet(buildContext(session), { origin: 'batch', ...options, requests, preSkipped, eligibility: eligibilitySummary });
}

// Eligibility results register their basis here (eligibility.mjs).
const eligibilityBases = new WeakMap();
export function registerGmiEligibilityBasis(result, session) {
  eligibilityBases.set(result, { lineage: lineageOf(session), stateKey: session.stateKey, session });
}
export const gmiEligibilityBasis = (result) => (result && typeof result === 'object' && eligibilityBases.get(result)) || null;

// ------------------------------------------------- hyperlink transfer sets

/** The active hyperlink transfer set (the last one in the active history), or null. */
export function activeGmiHyperlinkTransferSet(session) {
  return effectiveState(session).transfer;
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Internal (Batch 1B.2A): build, but do not stage, one hyperlink transfer
 * history entry against this exact session state. The caller supplies a
 * READY transfer plan made against the session's original document without a
 * session basis (hyperlink edits only), cumulative over the active transfer
 * set, plus the FOTO record of the same transfers. This function checks the
 * structural contract only; the bytes are verified independently every time
 * the proposed state is computed (proposed.mjs).
 *
 * spec = { planKey, documentFingerprint, photoSourceId, photoSourceFingerprint,
 *          decisions, transfers, cells, edits, photo, previousTransferSetId,
 *          label?, createdAt? }
 * @returns {{ok: true, transferSet} | {ok: false, rejections}}
 */
export function createGmiHyperlinkTransferSet(session, spec) {
  const lineage = lineageOf(session);
  const { document } = session;
  const reject = (code, detail = {}) => Object.freeze({ ok: false, rejections: Object.freeze([Object.freeze({ code, ...detail })]) });
  if (!spec || typeof spec !== 'object') return reject('invalid-spec');
  if (!document.editable) return reject('document-not-editable');
  if (typeof spec.planKey !== 'string' || !spec.planKey) return reject('invalid-plan');
  if (spec.documentFingerprint !== document.fingerprint) return reject('document-mismatch');
  if (typeof spec.photoSourceId !== 'string' || typeof spec.photoSourceFingerprint !== 'string') return reject('invalid-photo-source');
  const active = effectiveState(session).transfer;
  if ((spec.previousTransferSetId ?? null) !== (active?.id ?? null)) return reject('stale-transfer-basis');
  if (active && (active.basis.photoSourceId !== spec.photoSourceId || active.basis.photoSourceFingerprint !== spec.photoSourceFingerprint)) return reject('transfer-source-changed');
  const { decisions, transfers, cells, edits, photo } = spec;
  if (!Array.isArray(decisions) || !decisions.length || !Array.isArray(transfers) || transfers.length !== decisions.length) return reject('invalid-transfers');
  if (!Array.isArray(edits) || !edits.length || !Array.isArray(cells) || cells.length !== edits.length) return reject('invalid-edits');
  // Cumulative: every active transfer stays exactly as it was.
  if (active) for (const previous of active.transfers) {
    const next = transfers.find((transfer) => transfer.transferKey === previous.transferKey);
    if (!next || next.toObjectKey !== previous.toObjectKey || !sameJson(next.referenceIds, previous.referenceIds)) return reject('transfer-history-mismatch', { transferKey: previous.transferKey });
  }
  const keys = new Set();
  for (const [index, edit] of edits.entries()) {
    if (edit?.target?.field !== HYPERLINK_FIELD) return reject('transfer-edit-outside-hyperlink', { index });
    const resolved = resolveGmiCell(document, edit.target);
    if (!resolved.ok) return reject(resolved.code, { index });
    const { cell } = resolved;
    if (keys.has(cell.key)) return reject('duplicate-target', { index });
    keys.add(cell.key);
    if (edit.expected !== cell.lexeme) return reject('expected-mismatch', { index });
    if (typeof edit.lexeme !== 'string' || edit.lexeme === cell.lexeme) return reject('invalid-edit', { index });
    const encoded = validateGmiFieldLexeme(edit.lexeme, document.encoding.encodingClass);
    if (!encoded.ok) return reject(encoded.code, { index });
    const planned = cells[index];
    if (planned?.scope !== cell.scope || planned.sourceIndex !== cell.sourceIndex || planned.original !== cell.lexeme || planned.proposed !== edit.lexeme) return reject('cell-edit-mismatch', { index });
  }
  const photoKeys = Array.isArray(photo?.transfers) ? photo.transfers.map((entry) => entry?.transferKey).sort() : null;
  if (!photoKeys || !sameJson(photoKeys, transfers.map((transfer) => transfer.transferKey).sort())) return reject('photo-transfer-mismatch');

  const sequence = lineage.nextSequence++;
  const hyperlinkCells = cells.map((entry, index) => ({
    key: gmiCellKey(edits[index].target), scope: entry.scope, sourceIndex: entry.sourceIndex, field: HYPERLINK_FIELD,
    objectId: entry.objectId ?? edits[index].target.objectId ?? null, guid: entry.guid ?? edits[index].target.guid ?? null, objectKey: entry.objectKey ?? null,
    original: entry.original, proposed: entry.proposed,
    removedReferences: plainCopy(entry.removedReferences ?? []), addedReferences: plainCopy(entry.addedReferences ?? []),
  }));
  const transferSet = deepFreeze({
    kind: GMI_HYPERLINK_TRANSFER_SET_KIND,
    id: `cs-${sequence}`,
    sequence,
    origin: 'photo-hyperlink-transfer',
    label: typeof spec.label === 'string' ? spec.label : null,
    createdAt: spec.createdAt ?? null,
    mode: null,
    conflictPolicy: null,
    basis: { stateKey: session.stateKey, documentFingerprint: document.fingerprint, photoSourceId: spec.photoSourceId,
      photoSourceFingerprint: spec.photoSourceFingerprint, previousTransferSetId: active?.id ?? null },
    fields: [HYPERLINK_FIELD],
    objectCount: new Set(hyperlinkCells.map((entry) => `${entry.scope}:${entry.sourceIndex}`)).size,
    // Ordinary field cells: none. A transfer set owns only its hyperlink cells.
    cells: [],
    hyperlinkCells,
    edits: edits.map((edit) => ({ target: { scope: edit.target.scope, sourceIndex: edit.target.sourceIndex, field: HYPERLINK_FIELD,
      objectId: edit.target.objectId, guid: edit.target.guid }, expected: edit.expected, lexeme: edit.lexeme })),
    planKey: spec.planKey,
    decisions: plainCopy(decisions),
    transfers: plainCopy(transfers),
    photo: plainCopy(photo),
    skipped: [],
    unchanged: [],
    conflicts: [],
    eligibility: null,
    intent: null,
    counts: {
      requested: decisions.length, applied: hyperlinkCells.length, skipped: 0, unchanged: 0, conflicting: 0, overwritten: 0, populatedOverwrites: 0,
      skippedByReason: {}, transfers: transfers.length, newTransfers: transfers.length - (active?.transfers.length ?? 0), hyperlinkCells: hyperlinkCells.length,
      movedReferences: hyperlinkCells.reduce((sum, entry) => sum + entry.addedReferences.length, 0),
    },
  });
  transferSets.set(transferSet, { document, lineage, stateKey: session.stateKey });
  return Object.freeze({ ok: true, transferSet });
}

/** Internal (Batch 1B.2A): append a transfer set built on this exact session state. Pure; returns a new session. */
export function stageGmiHyperlinkTransferSet(session, transferSet) {
  const lineage = lineageOf(session);
  const provenance = transferSets.get(transferSet);
  if (!provenance) return fail('not-a-transfer-set');
  if (provenance.document !== session.document) return fail('document-mismatch');
  if (provenance.lineage !== lineage) return fail('foreign-change-set');
  if (provenance.stateKey !== session.stateKey) return fail('stale-change-set');
  if (session.changeSets.includes(transferSet)) return fail('already-staged');
  if ((transferSet.basis.previousTransferSetId ?? null) !== (effectiveState(session).transfer?.id ?? null)) return fail('stale-transfer-basis');
  return Object.freeze({ ok: true, session: makeSession(lineage, [...session.changeSets, transferSet], []), staged: true });
}

// ------------------------------------------------------------- transitions

/**
 * Append a ChangeSet built on this exact session state. A set with no applied
 * cells (everything skipped or unchanged) is a valid no-op and is not added.
 * @returns {{ok: true, session, staged: boolean} | {ok: false, code}}
 */
export function stageGmiChangeSet(session, changeSet) {
  const lineage = lineageOf(session);
  if (!isGmiChangeSet(changeSet)) return fail('not-a-change-set');
  const provenance = gmiChangeSetProvenance(changeSet);
  if (provenance.document !== session.document) return fail('document-mismatch');
  if (provenance.lineage !== lineage) return fail('foreign-change-set');
  if (provenance.stateKey !== session.stateKey) return fail('stale-change-set');
  if (session.changeSets.some((active) => active.id === changeSet.id)) return fail('already-staged');
  if (changeSet.cells.some((cell) => isGmiFieldEditReservedColumn(cell.field))) return fail('field-owned-by-photo-delivery');
  if (!changeSet.cells.length) return Object.freeze({ ok: true, session, staged: false, reason: 'no-effective-cells' });
  return Object.freeze({ ok: true, session: makeSession(lineage, [...session.changeSets, changeSet], []), staged: true });
}

export const canUndoGmiEdit = (session) => session.changeSets.length > 0;
export const canRedoGmiEdit = (session) => session.redo.length > 0;

/** Remove the last active ChangeSet onto the redo stack. */
export function undoGmiEdit(session) {
  const lineage = lineageOf(session);
  if (!session.changeSets.length) return fail('nothing-to-undo');
  const last = session.changeSets.at(-1);
  return Object.freeze({ ok: true, session: makeSession(lineage, session.changeSets.slice(0, -1), [...session.redo, last]), changeSetId: last.id });
}

/** Re-apply the most recently undone ChangeSet. */
export function redoGmiEdit(session) {
  const lineage = lineageOf(session);
  if (!session.redo.length) return fail('nothing-to-redo');
  const next = session.redo.at(-1);
  // Undo restores exactly the state the set was built on; anything else
  // (which the transitions here cannot produce) is refused.
  if (historyProvenance(next)?.stateKey !== session.stateKey) return fail('stale-change-set');
  return Object.freeze({ ok: true, session: makeSession(lineage, [...session.changeSets, next], session.redo.slice(0, -1)), changeSetId: next.id });
}

/**
 * Remove one active ChangeSet (anywhere in the history). Effective values are
 * recomputed from the remaining sets. The redo stack is cleared because its
 * sets were built on a history that no longer exists. `affected` lists later
 * sets whose conflict decisions referred to the discarded set (their cells
 * are not widened; skipped cells stay skipped).
 */
export function discardGmiChangeSet(session, changeSetId) {
  const lineage = lineageOf(session);
  const index = session.changeSets.findIndex((changeSet) => changeSet.id === changeSetId);
  if (index < 0) return fail('change-set-not-found');
  // Transfer sets are cumulative: a later one still carries the discarded decisions.
  if (transferSets.has(session.changeSets[index]) && session.changeSets.slice(index + 1).some((entry) => transferSets.has(entry))) return fail('transfer-set-has-later-transfers');
  const remaining = session.changeSets.filter((_, k) => k !== index);
  const affected = session.changeSets.slice(index + 1)
    .filter((changeSet) => changeSet.conflicts.some((conflict) => conflict.with.includes(changeSetId)))
    .map((changeSet) => changeSet.id);
  return Object.freeze({ ok: true, session: makeSession(lineage, remaining, []), discarded: changeSetId, affected: Object.freeze(affected) });
}

/** Forkast alle: back to the original delivery, no redo. */
export function discardAllGmiEdits(session) {
  const lineage = lineageOf(session);
  return Object.freeze({ ok: true, session: makeSession(lineage, [], []), discarded: Object.freeze(session.changeSets.map((changeSet) => changeSet.id)) });
}

// -------------------------------------------------------------- inspection

/**
 * The single list of M1 edits for the current state: one edit per cell whose
 * proposed lexeme differs from the delivered one, with the original source
 * lexeme as `expected`. Reverted cells produce no edit. `effectiveKey` is the
 * cache identity of the effective state (independent of how it was reached).
 */
export function compileGmiEffectiveEdits(session) {
  const state = effectiveState(session);
  // Field-only consumers must not produce output that silently omits an active transfer.
  if (state.transfer) return fail('hyperlink-transfer-active', { transferSetId: state.transfer.id });
  const checked = checkFieldEdits(state);
  if (!checked.ok) return checked;
  return Object.freeze({ ok: true, edits: state.edits, effectiveKey: state.effectiveKey });
}

function checkFieldEdits(state) {
  const keys = new Set();
  for (const edit of state.edits) {
    if (isGmiFieldEditReservedColumn(edit.target.field)) return fail('field-owned-by-photo-delivery');
    const key = gmiCellKey(edit.target);
    if (keys.has(key)) return fail('overlapping-effective-edits');
    keys.add(key);
  }
  return Object.freeze({ ok: true, keys });
}

/**
 * Every edit of the proposed copy: the effective field edits plus, when a
 * hyperlink transfer is active, its S_HYPERLINK cell edits (one per cell,
 * expected = original lexeme). `transfer` is the active transfer set; the
 * proposed state verifies its bytes independently (proposed.mjs).
 * `effectiveKey` equals compileGmiEffectiveEdits' key when no transfer is active.
 */
export function compileGmiProposedEdits(session) {
  const state = effectiveState(session);
  const checked = checkFieldEdits(state);
  if (!checked.ok) return checked;
  for (const edit of state.hyperlinkEdits) {
    if (edit.target.field !== HYPERLINK_FIELD) return fail('transfer-edit-outside-hyperlink');
    if (checked.keys.has(gmiCellKey(edit.target))) return fail('field-edit-overlaps-hyperlink');
  }
  return Object.freeze({ ok: true, edits: Object.freeze([...state.edits, ...state.hyperlinkEdits]), fieldEdits: state.edits,
    hyperlinkEdits: state.hyperlinkEdits, transfer: state.transfer, effectiveKey: state.effectiveKey });
}

/** Cache/download identity of the session's proposed copy (fields and any active transfer). */
export const gmiSessionEffectiveKey = (session) => effectiveState(session).effectiveKey;

/**
 * Revision signal for consumers of the proposed state (Validator recomputation,
 * export preparation, FOTO association/position views). Changes whenever the
 * history, the proposed bytes or the active transfer change.
 */
export function gmiSessionRevision(session) {
  const state = effectiveState(session);
  return Object.freeze({ stateKey: session.stateKey, effectiveKey: state.effectiveKey,
    hyperlinkTransfer: state.transfer ? Object.freeze({ transferSetId: state.transfer.id, planKey: state.transfer.planKey,
      transfers: state.transfer.transfers.length }) : null });
}

const transferCellsOf = (state) => (state.transfer ? state.transfer.hyperlinkCells : []);

/**
 * Original versus proposed for one cell, with its ChangeSet history. Works
 * for any resolvable cell, including untouched and reserved ones.
 */
export function getGmiEditCell(session, { scope, sourceIndex, field }) {
  const resolved = resolveGmiCell(session.document, { scope, sourceIndex, field });
  if (!resolved.ok) return resolved;
  const { cell } = resolved;
  const state = effectiveState(session);
  const entry = state.cells.get(cell.key) || null;
  const transferCell = transferCellsOf(state).find((candidate) => candidate.key === cell.key) || null;
  const history = [];
  let previousTransfer = cell.lexeme;
  for (const changeSet of session.changeSets) {
    if (transferSets.has(changeSet)) {
      const touched = changeSet.hyperlinkCells.find((candidate) => candidate.key === cell.key);
      const next = touched ? touched.proposed : cell.lexeme;
      if (touched || previousTransfer !== cell.lexeme) history.push(Object.freeze({ changeSetId: changeSet.id, label: changeSet.label, previous: previousTransfer, next }));
      previousTransfer = next;
      continue;
    }
    const touched = changeSet.cells.find((candidate) => candidate.key === cell.key);
    if (touched) history.push(Object.freeze({ changeSetId: changeSet.id, label: changeSet.label, previous: touched.previous, next: touched.next }));
  }
  const proposed = transferCell ? transferCell.proposed : entry ? entry.proposed : cell.lexeme;
  return Object.freeze({
    ok: true,
    key: cell.key, scope: cell.scope, sourceIndex: cell.sourceIndex, field: cell.field, objectId: cell.objectId, guid: cell.guid,
    original: cell.lexeme,
    proposed,
    changed: proposed !== cell.lexeme,
    touched: Boolean(entry || transferCell),
    reserved: isGmiFieldEditReservedColumn(cell.field),
    history: Object.freeze(history),
  });
}

/** Every touched cell: `changed` (proposed differs) and `reverted` (back to original). */
export function listGmiEditCells(session) {
  const state = effectiveState(session);
  const view = (entry) => Object.freeze({
    key: entry.key, scope: entry.scope, sourceIndex: entry.sourceIndex, field: entry.field, objectId: entry.objectId, guid: entry.guid,
    original: entry.original, proposed: entry.proposed, changeSetId: entry.changeSetId, touchedBy: Object.freeze([...entry.touchedBy]),
  });
  // Active transfer cells are changed cells too (reserved column, owned by the transfer set).
  const transferView = (entry) => Object.freeze({
    key: entry.key, scope: entry.scope, sourceIndex: entry.sourceIndex, field: entry.field, objectId: entry.objectId, guid: entry.guid,
    original: entry.original, proposed: entry.proposed, changeSetId: state.transfer.id, touchedBy: Object.freeze([state.transfer.id]), hyperlinkTransfer: true,
  });
  // Field cells keep their established order; transfer cells join by object (stable sort by scope and source index).
  const scopeOrder = { point: 0, line: 1 };
  const changed = state.transfer ? [...state.changed.map(view), ...transferCellsOf(state).map(transferView)]
    .sort((a, b) => (scopeOrder[a.scope] - scopeOrder[b.scope]) || (a.sourceIndex - b.sourceIndex)) : state.changed.map(view);
  return Object.freeze({
    changed: Object.freeze(changed),
    reverted: Object.freeze(state.ordered.filter((entry) => entry.proposed === entry.original).map(view)),
  });
}

/** Counts for a change list / banner. */
export function summarizeGmiEditSession(session) {
  const state = effectiveState(session);
  const transferCells = transferCellsOf(state);
  return Object.freeze({
    changeSetCount: session.changeSets.length,
    redoCount: session.redo.length,
    touchedCells: state.cells.size + transferCells.length,
    changedCells: state.changed.length + transferCells.length,
    changedObjects: new Set([...state.changed, ...transferCells].map((entry) => `${entry.scope}:${entry.sourceIndex}`)).size,
    canUndo: canUndoGmiEdit(session),
    canRedo: canRedoGmiEdit(session),
  });
}
