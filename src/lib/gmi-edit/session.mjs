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
import {
  GMI_CHANGE_SET_MODES, buildGmiChangeSet, compareGmiCells, computeGmiEffectiveCells,
  gmiChangeSetProvenance, isGmiChangeSet, isGmiFieldEditReservedColumn,
} from './changeSet.mjs';
import { isGmiSourceDocument } from './sourceDocument.mjs';
import { gmiCellKey, resolveGmiCell } from './targets.mjs';

const sessions = new WeakMap();   // session -> { lineage }
const derived = new WeakMap();    // session -> memoized effective state

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
    const cells = computeGmiEffectiveCells(session.changeSets);
    const ordered = [...cells.values()].sort(compareGmiCells);
    const changed = ordered.filter((entry) => entry.proposed !== entry.original);
    const edits = changed.map((entry) => Object.freeze({
      target: Object.freeze({ scope: entry.scope, sourceIndex: entry.sourceIndex, field: entry.field, objectId: entry.objectId, guid: entry.guid }),
      expected: entry.original,
      lexeme: entry.proposed,
    }));
    const effectiveKey = JSON.stringify(changed.map((entry) => [entry.scope, entry.sourceIndex, entry.field, entry.original, entry.proposed]));
    state = { cells, ordered, changed, edits: Object.freeze(edits), effectiveKey };
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
 */
export function createGmiBatchCorrection(session, { field, lexeme, targets, eligibility, ...options } = {}) {
  const reject = (code, detail = {}) => Object.freeze({ ok: false, rejections: Object.freeze([Object.freeze({ code, ...detail })]) });
  if (isGmiFieldEditReservedColumn(field)) return reject('field-owned-by-photo-delivery', { field });
  if (targets && eligibility) return reject('ambiguous-targets');
  let requests, preSkipped, eligibilitySummary = null;
  if (eligibility) {
    const basis = gmiEligibilityBasis(eligibility);
    if (!basis) return reject('invalid-eligibility');
    if (basis.lineage !== lineageOf(session)) return reject('foreign-eligibility');
    if (basis.stateKey !== session.stateKey) return reject('stale-eligibility');
    const column = field ?? eligibility.field;
    if (column !== eligibility.field) return reject('eligibility-field-mismatch');
    const mode = options.mode ?? GMI_CHANGE_SET_MODES.FILL_MISSING;
    if (mode !== eligibility.mode) return reject('eligibility-mode-mismatch', { eligibilityMode: eligibility.mode, mode });
    if (!eligibility.eligible.length) return reject('no-eligible-objects');
    requests = eligibility.eligible.map((entry) => ({ scope: entry.scope, sourceIndex: entry.sourceIndex, objectId: entry.objectId, guid: entry.guid, field: column, lexeme }));
    preSkipped = eligibility.skipped.map((entry) => ({ key: entry.key, scope: entry.scope, sourceIndex: entry.sourceIndex, field: column, position: entry.position, reason: entry.reason, ...(entry.applicability ? { applicability: entry.applicability } : {}) }));
    eligibilitySummary = { ruleId: eligibility.ruleId, canonicalFieldId: eligibility.canonicalFieldId, counts: eligibility.counts };
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
  eligibilityBases.set(result, { lineage: lineageOf(session), stateKey: session.stateKey });
}
export const gmiEligibilityBasis = (result) => (result && typeof result === 'object' && eligibilityBases.get(result)) || null;

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
  if (gmiChangeSetProvenance(next).stateKey !== session.stateKey) return fail('stale-change-set');
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
  const keys = new Set();
  for (const edit of state.edits) {
    if (isGmiFieldEditReservedColumn(edit.target.field)) return fail('field-owned-by-photo-delivery');
    const key = gmiCellKey(edit.target);
    if (keys.has(key)) return fail('overlapping-effective-edits');
    keys.add(key);
  }
  return Object.freeze({ ok: true, edits: state.edits, effectiveKey: state.effectiveKey });
}

/**
 * Original versus proposed for one cell, with its ChangeSet history. Works
 * for any resolvable cell, including untouched and reserved ones.
 */
export function getGmiEditCell(session, { scope, sourceIndex, field }) {
  const resolved = resolveGmiCell(session.document, { scope, sourceIndex, field });
  if (!resolved.ok) return resolved;
  const { cell } = resolved;
  const entry = effectiveState(session).cells.get(cell.key) || null;
  const history = [];
  for (const changeSet of session.changeSets) {
    const touched = changeSet.cells.find((candidate) => candidate.key === cell.key);
    if (touched) history.push(Object.freeze({ changeSetId: changeSet.id, label: changeSet.label, previous: touched.previous, next: touched.next }));
  }
  const proposed = entry ? entry.proposed : cell.lexeme;
  return Object.freeze({
    ok: true,
    key: cell.key, scope: cell.scope, sourceIndex: cell.sourceIndex, field: cell.field, objectId: cell.objectId, guid: cell.guid,
    original: cell.lexeme,
    proposed,
    changed: proposed !== cell.lexeme,
    touched: Boolean(entry),
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
  return Object.freeze({
    changed: Object.freeze(state.changed.map(view)),
    reverted: Object.freeze(state.ordered.filter((entry) => entry.proposed === entry.original).map(view)),
  });
}

/** Counts for a change list / banner. */
export function summarizeGmiEditSession(session) {
  const state = effectiveState(session);
  return Object.freeze({
    changeSetCount: session.changeSets.length,
    redoCount: session.redo.length,
    touchedCells: state.cells.size,
    changedCells: state.changed.length,
    changedObjects: new Set(state.changed.map((entry) => `${entry.scope}:${entry.sourceIndex}`)).size,
    canUndo: canUndoGmiEdit(session),
    canRedo: canRedoGmiEdit(session),
  });
}
