// Field ChangeSets for source-preserving GMI editing (M2).
//
// A ChangeSet is a frozen, explicit proposal: a list of exact source cells
// (scope, parser-order source index, delivered column) with their delivered
// lexeme (`original`), the proposed value they replaced when the set was built
// (`previous`) and the new lexeme (`next`). It is never a rewritten file. All
// proposed output is compiled from the ordered ChangeSet history and applied
// once, against the immutable original source (proposed.mjs).
//
// Resolution happens once, when the set is built, against one exact session
// state (`basis`). Selections are resolved to explicit cells; conflicts with
// earlier ChangeSets are resolved by the set's conflict policy; skipped cells
// are recorded with a reason. A later discard or undo never widens a set.
//
// Column ownership: ordinary field editing never changes S_HYPERLINK (or any
// S_HYPERLINK* alias). Photo delivery (M7) owns that column and uses the M1
// engine directly. The guard is applied at build time here, again at stage
// time (session.mjs) and again when edits are compiled; there is no option to
// disable it.
import { validateGmiFieldLexeme } from './encoding.mjs';
import { GMI_GEOMETRY_SCOPES } from './sourceIndex.mjs';
import { gmiCellKey, resolveGmiCell } from './targets.mjs';

export const GMI_CHANGE_SET_MODES = Object.freeze({
  /** Default. Writes only cells whose delivered value is missing (trim() === ''). */
  FILL_MISSING: 'fill-missing',
  /** Explicit. May replace populated values. */
  OVERWRITE: 'overwrite',
});

export const GMI_CONFLICT_POLICIES = Object.freeze({
  /** Default. Cells already changed by an earlier active ChangeSet are skipped. */
  SKIP: 'skip',
  /** Explicit. The new set replaces earlier proposed values. */
  REPLACE: 'replace',
});

export const GMI_SKIP_REASONS = Object.freeze({
  CONFLICT: 'conflict',
  POPULATED: 'populated',
  OBJECT_NOT_EDITABLE: 'object-not-editable',
  NOT_APPLICABLE: 'not-applicable',
  UNRESOLVED: 'unresolved',
  OUT_OF_SCOPE: 'out-of-scope',
});

const RESERVED_PREFIX = 'S_HYPERLINK';

/**
 * True for columns that ordinary field editing must never change. Matching is
 * case-insensitive and covers aliases such as S_HYPERLINK_punkt.
 */
export function isGmiFieldEditReservedColumn(field) {
  return typeof field === 'string' && field.trim().toUpperCase().startsWith(RESERVED_PREFIX);
}

/** Parser-equivalent missing: the parser trims, then maps '' to null. */
export const isGmiMissingLexeme = (lexeme) => typeof lexeme !== 'string' || lexeme.trim() === '';

const SCOPE_ORDER = new Map(GMI_GEOMETRY_SCOPES.map(({ scope }, index) => [scope, index]));

/** Deterministic cell order: scope (point, line), source index, column position. */
export function compareGmiCells(a, b) {
  return (SCOPE_ORDER.get(a.scope) - SCOPE_ORDER.get(b.scope))
    || (a.sourceIndex - b.sourceIndex)
    || ((a.position ?? 0) - (b.position ?? 0))
    || (a.field < b.field ? -1 : a.field > b.field ? 1 : 0);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

// ChangeSet -> { document, lineage, stateKey }. Only sets built here are
// stageable; frozen sets cannot be altered after build.
const registry = new WeakMap();

export const isGmiChangeSet = (value) => registry.has(value);

/** Internal: provenance of a ChangeSet for session.mjs. */
export function gmiChangeSetProvenance(changeSet) {
  return registry.get(changeSet) || null;
}

/**
 * Effective cell state of an ordered ChangeSet list: per cell, the `next` of
 * the last ChangeSet containing it. Returns Map<cellKey, entry>.
 */
export function computeGmiEffectiveCells(changeSets) {
  const cells = new Map();
  for (const changeSet of changeSets) {
    for (const cell of changeSet.cells) {
      const entry = cells.get(cell.key);
      if (entry) {
        entry.proposed = cell.next;
        entry.changeSetId = changeSet.id;
        entry.touchedBy.push(changeSet.id);
      } else {
        cells.set(cell.key, {
          key: cell.key, scope: cell.scope, sourceIndex: cell.sourceIndex, field: cell.field, position: cell.position,
          objectId: cell.objectId, guid: cell.guid, original: cell.original, proposed: cell.next,
          changeSetId: changeSet.id, touchedBy: [changeSet.id],
        });
      }
    }
  }
  return cells;
}

const rejected = (rejections) => deepFreeze({ ok: false, rejections });

const RESOLVE_SKIPS = new Set(['object-not-editable']);

/**
 * Internal builder used by session.mjs. `context` is
 * `{ document, lineage, stateKey, effective: Map, id, sequence }`.
 *
 * spec = {
 *   requests: [{ scope, sourceIndex, field, lexeme, objectId?, guid? }],
 *   mode?: 'fill-missing' (default) | 'overwrite',
 *   conflictPolicy?: 'skip' (default) | 'replace',
 *   origin?, label?, createdAt?,
 *   preSkipped?: [{ scope, sourceIndex, field, reason, ... }],  // from eligibility
 *   eligibility?: { ruleId, canonicalFieldId, counts },          // summary only
 * }
 *
 * Returns `{ ok: true, changeSet }` or `{ ok: false, rejections }`. A set is
 * rejected as a whole for invalid requests, stale or incompatible targets,
 * absent columns, invalid lexemes, duplicates and reserved columns. Objects
 * whose source structure is irregular are skipped, not rejected.
 */
export function buildGmiChangeSet(context, spec) {
  const { document, effective } = context;
  if (!spec || typeof spec !== 'object') return rejected([{ code: 'invalid-spec' }]);
  const mode = spec.mode ?? GMI_CHANGE_SET_MODES.FILL_MISSING;
  const conflictPolicy = spec.conflictPolicy ?? GMI_CONFLICT_POLICIES.SKIP;
  const rejections = [];
  if (!Object.values(GMI_CHANGE_SET_MODES).includes(mode)) rejections.push({ code: 'invalid-mode' });
  if (!Object.values(GMI_CONFLICT_POLICIES).includes(conflictPolicy)) rejections.push({ code: 'invalid-conflict-policy' });
  if (!Array.isArray(spec.requests) || spec.requests.length === 0) rejections.push({ code: 'no-requests' });
  if (!document.editable) rejections.push({ code: 'document-not-editable', status: document.status });
  if (rejections.length) return rejected(rejections);

  const resolvedRequests = [];
  const preSkipped = [];
  const seen = new Map();
  spec.requests.forEach((request, requestIndex) => {
    const fail = (code, detail = {}) => rejections.push({ requestIndex, code, ...detail });
    if (!request || typeof request !== 'object') { fail('invalid-request'); return; }
    if (isGmiFieldEditReservedColumn(request.field)) { fail('field-owned-by-photo-delivery', { field: request.field }); return; }
    const target = { scope: request.scope, sourceIndex: request.sourceIndex, field: request.field };
    if ('objectId' in request) target.objectId = request.objectId;
    if ('guid' in request) target.guid = request.guid;
    const resolved = resolveGmiCell(document, target);
    if (!resolved.ok) {
      if (RESOLVE_SKIPS.has(resolved.code)) {
        const key = Number.isInteger(request.sourceIndex) ? gmiCellKey(target) : null;
        if (key && seen.has(key)) { fail('duplicate-target', { firstRequestIndex: seen.get(key) }); return; }
        if (key) seen.set(key, requestIndex);
        preSkipped.push({ key, scope: request.scope, sourceIndex: request.sourceIndex, field: request.field, reason: GMI_SKIP_REASONS.OBJECT_NOT_EDITABLE });
        return;
      }
      fail(resolved.code);
      return;
    }
    const { cell } = resolved;
    if (seen.has(cell.key)) { fail('duplicate-target', { firstRequestIndex: seen.get(cell.key) }); return; }
    seen.set(cell.key, requestIndex);
    const encoded = validateGmiFieldLexeme(request.lexeme, document.encoding.encodingClass);
    if (!encoded.ok) { fail(encoded.code, { index: encoded.index ?? null }); return; }
    resolvedRequests.push({ cell, next: request.lexeme });
  });
  for (const entry of spec.preSkipped || []) {
    if (isGmiFieldEditReservedColumn(entry.field)) rejections.push({ code: 'field-owned-by-photo-delivery', field: entry.field });
  }
  if (rejections.length) return rejected(rejections);

  const cells = [], unchanged = [], conflicts = [];
  const skipped = [...preSkipped, ...(spec.preSkipped || []).map((entry) => ({ ...entry }))];
  for (const { cell, next } of resolvedRequests) {
    const entry = effective.get(cell.key) || null;
    const original = cell.lexeme;
    const current = entry ? entry.proposed : original;
    const base = { key: cell.key, scope: cell.scope, sourceIndex: cell.sourceIndex, field: cell.field, position: cell.position, objectId: cell.objectId, guid: cell.guid };
    if (next === current) { unchanged.push({ ...base, current }); continue; }
    if (entry) {
      const conflictWith = [...entry.touchedBy];
      if (conflictPolicy === GMI_CONFLICT_POLICIES.SKIP) {
        skipped.push({ ...base, reason: GMI_SKIP_REASONS.CONFLICT, current, conflictsWith: conflictWith });
        conflicts.push({ ...base, with: conflictWith, resolution: 'skipped' });
        continue;
      }
      // Replace: earlier proposals may be replaced, but fill-missing still
      // protects populated delivered values.
      if (mode === GMI_CHANGE_SET_MODES.FILL_MISSING && !isGmiMissingLexeme(original)) {
        skipped.push({ ...base, reason: GMI_SKIP_REASONS.POPULATED, current, conflictsWith: conflictWith });
        conflicts.push({ ...base, with: conflictWith, resolution: 'skipped' });
        continue;
      }
      conflicts.push({ ...base, with: conflictWith, resolution: 'replaced' });
      cells.push({ ...base, original, previous: current, next, overwrote: { changeSetId: entry.changeSetId, lexeme: current }, overwritesPopulated: !isGmiMissingLexeme(current) });
      continue;
    }
    if (mode === GMI_CHANGE_SET_MODES.FILL_MISSING && !isGmiMissingLexeme(original)) {
      skipped.push({ ...base, reason: GMI_SKIP_REASONS.POPULATED, current });
      continue;
    }
    cells.push({ ...base, original, previous: current, next, overwrote: null, overwritesPopulated: !isGmiMissingLexeme(current) });
  }
  cells.sort(compareGmiCells);
  skipped.sort((a, b) => compareGmiCells(a, b) || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0));
  unchanged.sort(compareGmiCells);
  conflicts.sort(compareGmiCells);

  const skippedByReason = {};
  for (const entry of skipped) skippedByReason[entry.reason] = (skippedByReason[entry.reason] || 0) + 1;
  const changeSet = deepFreeze({
    kind: 'gmi-field-change-set',
    id: context.id,
    sequence: context.sequence,
    origin: typeof spec.origin === 'string' ? spec.origin : 'api',
    label: typeof spec.label === 'string' ? spec.label : null,
    createdAt: spec.createdAt ?? null,
    mode,
    conflictPolicy,
    basis: { stateKey: context.stateKey },
    fields: [...new Set(resolvedRequests.map(({ cell }) => cell.field))].sort(),
    objectCount: new Set(cells.map((cell) => `${cell.scope}:${cell.sourceIndex}`)).size,
    cells,
    skipped,
    unchanged,
    conflicts,
    eligibility: spec.eligibility ?? null,
    counts: {
      requested: spec.requests.length + (spec.preSkipped?.length || 0),
      applied: cells.length,
      skipped: skipped.length,
      unchanged: unchanged.length,
      conflicting: conflicts.length,
      overwritten: cells.filter((cell) => cell.overwrote).length,
      populatedOverwrites: cells.filter((cell) => cell.overwritesPopulated).length,
      skippedByReason,
    },
  });
  registry.set(changeSet, { document, lineage: context.lineage, stateKey: context.stateKey });
  return Object.freeze({ ok: true, changeSet });
}
