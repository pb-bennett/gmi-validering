import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PHOTO_EDIT_HISTORY_LIMIT, canRedoPhotoEdit, canUndoPhotoEdit, changedPhotoIds, createPhotoEditState, effectiveCurrent,
  effectiveDirection, effectivePhoto, emptyPhotoEditState, photoEditChanges, photoEditIsActive, photoEditReducer, photoEditValue,
} from '../src/lib/photos/photoEditSession.mjs';
import { photoPositionSourceKind } from '../src/lib/photos/photoMarkerPresentation.mjs';

const at = (longitude, latitude = 59) => ({ crs: 'EPSG:4326', longitude, latitude });
const current = (position, kind = 'candidate') => Object.freeze({ position, basis: kind === 'candidate' ? { kind, candidateId: 'gmi-1' } : { kind }, acceptance: 'explicit-candidate', acceptedAt: 1 });
const photos = {
  a: { id: 'a', spatial: { candidates: [{ id: 'gmi-1', kind: 'gmi' }], current: current(at(10)) }, direction: { current: { degrees: 42, basis: { kind: 'exif' } } } },
  b: { id: 'b', spatial: { candidates: [], current: null }, direction: { current: null } },
  // A repeated asset: two occurrences of the same file.
  c1: { id: 'c1', assetId: 'c', spatial: { candidates: [], current: current(at(11), 'manual') }, direction: { current: null } },
  c2: { id: 'c2', assetId: 'c', spatial: { candidates: [], current: current(at(12), 'manual') }, direction: { current: null } },
};
const ticket = Object.freeze({ id: 'edit-1', layerId: 'layer', generation: 0, baseline: Object.freeze(Object.fromEntries(Object.values(photos)
  .map((photo) => [photo.id, Object.freeze({ current: photo.spatial.current, direction: photo.direction.current })]))) });
const run = (state, ...actions) => actions.reduce(photoEditReducer, state);
const start = () => photoEditReducer(emptyPhotoEditState, { type: 'start', ticket });
const stage = (photoId, field, value, extra = {}) => ({ type: 'stage', photoId, field, value, at: 1000, ...extra });

test('start captures comparison values from baseline identities; empty state is inactive', () => {
  const state = start();
  assert(photoEditIsActive(state)); assert(!photoEditIsActive(emptyPhotoEditState));
  assert.deepEqual(state.baseline.a, { position: at(10), direction: 42 });
  assert.deepEqual(state.baseline.b, { position: null, direction: null });
  assert.deepEqual(changedPhotoIds(state), []);
  assert(!canUndoPhotoEdit(state) && !canRedoPhotoEdit(state));
  assert.equal(photoEditReducer(state, { type: 'end' }), emptyPhotoEditState);
});

test('stage move and direction for multiple photos; effective overlay is staged manual while saved values remain', () => {
  const state = run(start(), stage('a', 'position', at(10.001)), stage('a', 'direction', 90), stage('b', 'position', at(13)), stage('b', 'direction', 359.6));
  assert.deepEqual(changedPhotoIds(state).sort(), ['a', 'b']);
  assert.equal(photoEditValue(state, 'b', 'direction'), 0, 'interactive edits normalize to integer degrees');
  const a = effectivePhoto(photos.a, state);
  assert.equal(a.spatial.current.acceptance, 'staged');
  assert.equal(photoPositionSourceKind(a), 'manual', 'a staged move shows the provenance it will have after save');
  assert.deepEqual(a.spatial.current.position, at(10.001));
  assert.equal(a.direction.current.degrees, 90);
  assert.deepEqual(a.staged, { position: true, direction: true });
  assert.strictEqual(a.saved.current, photos.a.spatial.current);
  assert.strictEqual(a.saved.direction, photos.a.direction.current);
  assert.strictEqual(a.spatial.candidates, photos.a.spatial.candidates, 'evidence is never copied or altered');
  assert.strictEqual(effectivePhoto(photos.c1, state), photos.c1, 'unchanged photos keep identity');
  assert.strictEqual(effectiveCurrent(photos.c1, state), photos.c1.spatial.current);
  assert.strictEqual(effectiveDirection(photos.c1, state), null);
  assert(Object.isFrozen(state) && Object.isFrozen(state.staged) && Object.isFrozen(state.past));
});

test('repeated occurrences of one asset are staged independently', () => {
  const state = run(start(), stage('c1', 'position', at(20)), stage('c1', 'direction', 10));
  assert.deepEqual(changedPhotoIds(state), ['c1']);
  assert.strictEqual(effectivePhoto(photos.c2, state), photos.c2);
  assert.deepEqual(photoEditChanges(state), [{ photoId: 'c1', position: at(20), degrees: 10 }]);
});

test('staging the baseline value removes the key; invalid, unknown and no-op stages are ignored', () => {
  let state = run(start(), stage('a', 'direction', 90));
  state = photoEditReducer(state, stage('a', 'direction', 42, { at: 5000 }));
  assert.deepEqual(changedPhotoIds(state), [], 'changed count stays truthful');
  assert.equal(state.past.length, 2, 'returning to baseline is still an undoable step');
  const before = state;
  for (const action of [stage('a', 'direction', NaN), stage('a', 'position', at(500)), stage('missing', 'direction', 1), stage('a', 'colour', 1), stage('a', 'direction', 42)]) {
    assert.strictEqual(photoEditReducer(before, action), before);
  }
});

test('undo and redo walk history in order, select nothing themselves and report the affected occurrence', () => {
  let state = run(start(), stage('a', 'position', at(10.5)), stage('b', 'direction', 30, { at: 3000 }), stage('a', 'direction', 100, { at: 5000 }));
  state = photoEditReducer(state, { type: 'undo' });
  assert.equal(photoEditValue(state, 'a', 'direction'), 42);
  assert.deepEqual(state.lastChange, { type: 'undo', photoId: 'a', field: 'direction' });
  state = photoEditReducer(state, { type: 'undo' });
  assert.equal(photoEditValue(state, 'b', 'direction'), null);
  assert.deepEqual(changedPhotoIds(state), ['a']);
  state = photoEditReducer(state, { type: 'undo' });
  assert.deepEqual(changedPhotoIds(state), []);
  assert(!canUndoPhotoEdit(state) && canRedoPhotoEdit(state));
  assert.strictEqual(photoEditReducer(state, { type: 'undo' }), state, 'nothing to undo');
  state = run(state, { type: 'redo' }, { type: 'redo' });
  assert.deepEqual(photoEditValue(state, 'a', 'position'), at(10.5));
  assert.equal(photoEditValue(state, 'b', 'direction'), 30);
  assert.deepEqual(state.lastChange, { type: 'redo', photoId: 'b', field: 'direction' });
  assert.equal(state.future.length, 1);
});

test('a new stage after undo clears redo', () => {
  let state = run(start(), stage('a', 'direction', 90), stage('a', 'direction', 91, { at: 3000 }), { type: 'undo' });
  assert(canRedoPhotoEdit(state));
  state = photoEditReducer(state, stage('b', 'direction', 5, { at: 4000 }));
  assert(!canRedoPhotoEdit(state));
  assert.equal(photoEditValue(state, 'a', 'direction'), 90);
});

test('keyboard nudges coalesce within 1 s on the same occurrence and field, and split beyond it', () => {
  const key = 'a:direction:keyboard';
  let state = run(start(), stage('a', 'direction', 43, { coalesceKey: key, at: 0 }), stage('a', 'direction', 44, { coalesceKey: key, at: 400 }),
    stage('a', 'direction', 45, { coalesceKey: key, at: 900 }));
  assert.equal(state.past.length, 1);
  assert.equal(state.past[0].before, 42); assert.equal(state.past[0].after, 45);
  state = photoEditReducer(state, stage('a', 'direction', 46, { coalesceKey: key, at: 2000 }));
  assert.equal(state.past.length, 2, 'beyond the window starts a new step');
  state = photoEditReducer(state, stage('b', 'direction', 1, { coalesceKey: 'b:direction:keyboard', at: 2100 }));
  assert.equal(state.past.length, 3, 'another occurrence never merges');
  state = run(state, { type: 'undo' }, { type: 'undo' });
  assert.equal(photoEditValue(state, 'a', 'direction'), 45);
  // Nudging back to the starting value removes the merged step entirely.
  state = run(start(), stage('a', 'direction', 43, { coalesceKey: key, at: 0 }), stage('a', 'direction', 42, { coalesceKey: key, at: 100 }));
  assert.equal(state.past.length, 0);
  assert.deepEqual(changedPhotoIds(state), []);
  // A pointer gesture never coalesces.
  state = run(start(), stage('a', 'direction', 43, { at: 0 }), stage('a', 'direction', 44, { at: 10 }));
  assert.equal(state.past.length, 2);
});

test('history is capped and the oldest steps drop first', () => {
  let state = start();
  for (let i = 1; i <= PHOTO_EDIT_HISTORY_LIMIT + 25; i++) state = photoEditReducer(state, stage('a', 'direction', i % 360 === 42 ? 43 : i % 360, { at: i * 2000 }));
  assert.equal(state.past.length, PHOTO_EDIT_HISTORY_LIMIT);
  while (canUndoPhotoEdit(state)) state = photoEditReducer(state, { type: 'undo' });
  assert.notEqual(photoEditValue(state, 'a', 'direction'), 42, 'steps beyond the cap cannot be undone');
});

test('reconcile and drop remove staged values and history for missing occurrences', () => {
  let state = run(start(), stage('a', 'position', at(10.3)), stage('b', 'direction', 9, { at: 3000 }), { type: 'undo' });
  const kept = photoEditReducer(state, { type: 'reconcile', livePhotoIds: Object.keys(photos) });
  assert.strictEqual(kept, state, 'no missing occurrences is a no-op');
  state = photoEditReducer(state, { type: 'reconcile', livePhotoIds: ['b', 'c1', 'c2'] });
  assert.deepEqual(changedPhotoIds(state), []);
  assert.equal(state.past.length, 0); assert.equal(state.future.length, 1);
  assert.equal(state.baseline.a, undefined);
  state = photoEditReducer(state, { type: 'drop', photoIds: ['b'] });
  assert.equal(state.future.length, 0);
  assert.strictEqual(photoEditReducer(state, { type: 'drop', photoIds: ['nope'] }), state);
});

test('photoEditChanges is the exact apply shape', () => {
  const state = run(start(), stage('a', 'direction', 7), stage('b', 'position', at(14), { at: 3000 }));
  assert.deepEqual(photoEditChanges(state).sort((x, y) => x.photoId.localeCompare(y.photoId)), [
    { photoId: 'a', degrees: 7 }, { photoId: 'b', position: at(14) }]);
});
