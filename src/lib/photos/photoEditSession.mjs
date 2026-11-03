import { normalizePhotoDirection } from './photoDirection.mjs';
import { isPhotoPosition } from './photoSpatial.mjs';

// Staged Edit-mode values live outside photoSession. Canonical records are never
// written until applyPhotoEdits, so export/readiness can never see staged values.
export const PHOTO_EDIT_HISTORY_LIMIT = 200;
export const PHOTO_EDIT_COALESCE_MS = 1000;
export const emptyPhotoEditState = Object.freeze({
  ticketId: null, layerId: null, baseline: Object.freeze({}), staged: Object.freeze({}),
  past: Object.freeze([]), future: Object.freeze([]), lastChange: null,
});

const FIELDS = ['position', 'direction'];
const freezePosition = (position) => Object.freeze({ crs: 'EPSG:4326', longitude: position.longitude, latitude: position.latitude });

function normalizeValue(field, value) {
  if (field === 'position') return isPhotoPosition(value) ? freezePosition(value) : undefined;
  if (field === 'direction') {
    const degrees = normalizePhotoDirection(value);
    return degrees === null ? undefined : degrees;
  }
  return undefined;
}

function sameValue(field, a, b) {
  if (a === b) return true;
  if (field !== 'position' || !a || !b) return false;
  return a.longitude === b.longitude && a.latitude === b.latitude;
}

export function createPhotoEditState(ticket) {
  if (!ticket) return emptyPhotoEditState;
  const baseline = Object.fromEntries(Object.entries(ticket.baseline).map(([photoId, identities]) => [photoId, Object.freeze({
    position: identities.current?.position ? freezePosition(identities.current.position) : null,
    direction: identities.direction?.degrees ?? null,
  })]));
  return Object.freeze({ ...emptyPhotoEditState, ticketId: ticket.id, layerId: ticket.layerId, baseline: Object.freeze(baseline) });
}

export function photoEditValue(state, photoId, field) {
  const staged = state.staged[photoId];
  if (staged && Object.hasOwn(staged, field)) return staged[field];
  return state.baseline[photoId]?.[field] ?? null;
}

function withValue(staged, baseline, photoId, field, value) {
  const entry = { ...(staged[photoId] || {}) };
  if (sameValue(field, value, baseline[photoId]?.[field] ?? null)) delete entry[field];
  else entry[field] = value;
  const next = { ...staged };
  if (Object.keys(entry).length) next[photoId] = Object.freeze(entry);
  else delete next[photoId];
  return Object.freeze(next);
}

function stage(state, { photoId, field, value, coalesceKey = null, at = Date.now() }) {
  if (!FIELDS.includes(field) || !state.baseline[photoId]) return state;
  const after = normalizeValue(field, value);
  if (after === undefined) return state;
  const before = photoEditValue(state, photoId, field);
  if (sameValue(field, before, after)) return state;
  const staged = withValue(state.staged, state.baseline, photoId, field, after);
  const top = state.past.at(-1);
  let past;
  if (coalesceKey && top?.coalesceKey === coalesceKey && top.photoId === photoId && top.field === field && at - top.at < PHOTO_EDIT_COALESCE_MS) {
    // Consecutive keyboard nudges merge into one undoable step; a nudge back to the start removes it.
    past = sameValue(field, top.before, after) ? state.past.slice(0, -1)
      : [...state.past.slice(0, -1), Object.freeze({ ...top, after, at })];
  } else {
    past = [...state.past, Object.freeze({ photoId, field, before, after, coalesceKey, at })];
  }
  if (past.length > PHOTO_EDIT_HISTORY_LIMIT) past = past.slice(past.length - PHOTO_EDIT_HISTORY_LIMIT);
  return Object.freeze({ ...state, staged, past: Object.freeze(past), future: Object.freeze([]),
    lastChange: Object.freeze({ type: 'stage', photoId, field }) });
}

function travel(state, direction) {
  const from = direction === 'undo' ? state.past : state.future;
  const entry = from.at(-1);
  if (!entry) return state;
  // A null "before" only occurs when the baseline had no value, so withValue removes the key.
  const value = direction === 'undo' ? entry.before : entry.after;
  const staged = withValue(state.staged, state.baseline, entry.photoId, entry.field, value);
  // A completed history step can no longer coalesce with a later keyboard nudge.
  const moved = Object.freeze({ ...entry, coalesceKey: null });
  return Object.freeze({ ...state, staged,
    past: Object.freeze(direction === 'undo' ? state.past.slice(0, -1) : [...state.past, moved]),
    future: Object.freeze(direction === 'undo' ? [...state.future, moved] : state.future.slice(0, -1)),
    lastChange: Object.freeze({ type: direction, photoId: entry.photoId, field: entry.field }) });
}

function drop(state, photoIds) {
  const removed = new Set(photoIds);
  if (![...removed].some((id) => state.baseline[id] || state.staged[id])) return state;
  const keep = (entry) => !removed.has(entry.photoId);
  return Object.freeze({ ...state,
    baseline: Object.freeze(Object.fromEntries(Object.entries(state.baseline).filter(([id]) => !removed.has(id)))),
    staged: Object.freeze(Object.fromEntries(Object.entries(state.staged).filter(([id]) => !removed.has(id)))),
    past: Object.freeze(state.past.filter(keep)), future: Object.freeze(state.future.filter(keep)),
    lastChange: null });
}

export function photoEditReducer(state, action) {
  switch (action.type) {
    case 'start': return createPhotoEditState(action.ticket);
    case 'end': return emptyPhotoEditState;
    case 'stage': return stage(state, action);
    case 'undo': return travel(state, 'undo');
    case 'redo': return travel(state, 'redo');
    case 'reconcile': {
      const live = new Set(action.livePhotoIds || []);
      return drop(state, Object.keys(state.baseline).filter((id) => !live.has(id)));
    }
    case 'drop': return drop(state, action.photoIds || []);
    default: return state;
  }
}

export const photoEditIsActive = (state) => Boolean(state?.ticketId);
export const changedPhotoIds = (state) => Object.keys(state?.staged || {});
export const canUndoPhotoEdit = (state) => Boolean(state?.past.length);
export const canRedoPhotoEdit = (state) => Boolean(state?.future.length);

export function photoEditChanges(state) {
  return Object.entries(state.staged).map(([photoId, entry]) => ({ photoId,
    ...(Object.hasOwn(entry, 'position') ? { position: entry.position } : {}),
    ...(Object.hasOwn(entry, 'direction') ? { degrees: entry.direction } : {}) }));
}

export function effectiveCurrent(photo, state) {
  const staged = state?.staged[photo.id];
  if (!staged || !Object.hasOwn(staged, 'position')) return photo.spatial.current;
  return Object.freeze({ position: staged.position, basis: Object.freeze({ kind: 'manual' }), acceptance: 'staged', acceptedAt: null });
}

export function effectiveDirection(photo, state) {
  const staged = state?.staged[photo.id];
  if (!staged || !Object.hasOwn(staged, 'direction')) return photo.direction?.current || null;
  return Object.freeze({ degrees: staged.direction, basis: Object.freeze({ kind: 'manual' }), acceptance: 'staged', acceptedAt: null });
}

// The single overlay used by map, list, inspector and filters. Unchanged photos keep identity.
export function effectivePhoto(photo, state) {
  const staged = state?.staged[photo.id];
  if (!staged) return photo;
  return Object.freeze({ ...photo,
    spatial: Object.freeze({ ...photo.spatial, current: effectiveCurrent(photo, state) }),
    direction: Object.freeze({ current: effectiveDirection(photo, state) }),
    staged: Object.freeze({ position: Object.hasOwn(staged, 'position'), direction: Object.hasOwn(staged, 'direction') }),
    saved: Object.freeze({ current: photo.spatial.current, direction: photo.direction?.current || null }) });
}
