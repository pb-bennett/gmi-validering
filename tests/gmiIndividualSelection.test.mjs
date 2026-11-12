import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGmiSourceDocument, createGmiEditSession, createGmiObjectCorrection, stageGmiChangeSet, getGmiEditCell, getGmiSourceBytes } from '../src/lib/gmi-edit/index.mjs';
import { gmiIndividualSelection } from '../src/lib/gmiBatchInspectorView.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { gmiSelectedFeatureIds } from '../src/lib/gmiEditSelection.mjs';

test('B3 source order, boundaries, stale membership/session and independent individual ChangeSets', async () => {
  const bytes = gmiFieldBatchFixture();
  const document = await loadGmiSourceDocument(bytes);
  let session = createGmiEditSession(document, { layerId: 'b3' });
  const binding = { layerId: 'b3', sessionId: 'session-b3', fingerprint: document.fingerprint };
  const selection = { binding, scope: 'point', keys: ['point:4', 'point:1', 'point:3', 'point:0', 'point:2'], host: { kind: 'rettinger' }, origin: { kind: 'validator' } };
  const snapshot = structuredClone(selection);
  const view = () => ({ document, session, handle: binding });
  const itinerary = (target, selected = selection, identity = binding) => gmiIndividualSelection(view(), selected, target, identity);
  assert.deepEqual(itinerary(null).targets.map(t => t.sourceIndex), [0, 1, 2, 3, 4]);
  assert.equal(itinerary({ scope: 'point', sourceIndex: 0 }).index, 0);
  assert.equal(itinerary({ scope: 'point', sourceIndex: 4 }).index, 4);
  assert.equal(itinerary({ scope: 'point', sourceIndex: 9 }).index, -1);
  assert.equal(itinerary(null, { ...selection, keys: ['point:99'] }).ok, false);
  assert.equal(itinerary(null, null).ok, false);
  assert.equal(itinerary(null, { ...selection, keys: [] }).ok, false);
  assert.equal(itinerary(null, { ...selection, binding: { ...binding, sessionId: 'new' } }).ok, false);
  assert.deepEqual(itinerary(null, { ...selection, scope: 'line', keys: ['line:2', 'line:0', 'line:1'] }).targets.map(t => t.sourceIndex), [0, 1, 2]);
  assert.equal(gmiIndividualSelection({ ...view(), handle: { ...binding, sessionId: 'replacement' } }, selection, null, binding).ok, false);
  const halos = [...gmiSelectedFeatureIds(selection, 'b3')];
  const changes = [];
  for (const index of [0, 2]) {
    const result = createGmiObjectCorrection(session, { scope: 'point', sourceIndex: index,
      values: { Merknad: `Separate ${index}` }, mode: 'fill-missing', label: `B3 ${index}` });
    assert.equal(result.ok, true);
    const staged = stageGmiChangeSet(session, result.changeSet);
    assert.equal(staged.ok, true);
    session = staged.session;
    changes.push(result.changeSet);
    assert.equal(itinerary(null).ok, true, 'editing revision preserves source identity');
  }
  assert.notEqual(changes[0].id, changes[1].id);
  assert.deepEqual(changes.map(c => c.cells.map(cell => cell.sourceIndex)), [[0], [2]]);
  assert.equal(getGmiEditCell(session, { scope: 'point', sourceIndex: 0, field: 'Merknad' }).proposed, 'Separate 0');
  assert.equal(getGmiEditCell(session, { scope: 'point', sourceIndex: 2, field: 'Merknad' }).proposed, 'Separate 2');
  assert.equal(getGmiEditCell(session, { scope: 'point', sourceIndex: 4, field: 'Merknad' }).proposed, '');
  assert.deepEqual(selection, snapshot);
  assert.deepEqual([...gmiSelectedFeatureIds(selection, 'b3')], halos);
  assert.deepEqual(getGmiSourceBytes(document), bytes);
});
