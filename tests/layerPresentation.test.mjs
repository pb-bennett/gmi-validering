import assert from 'node:assert/strict';
import test from 'node:test';
import { getLayerType, getWorkspaceLayerEntries } from '../src/lib/layerPresentation.mjs';

test('badge types use reliable source/parsed formats including FOTO, not filenames', () => {
  for (const type of ['GMI', 'SOSI', 'KOF']) {
    assert.equal(getLayerType({ file: { format: type, name: 'wrong.ext' } }), type);
    assert.equal(getLayerType({ data: { format: type } }), type);
  }
  assert.equal(getLayerType({ type: 'FOTO', photoIds: ['id'] }), 'FOTO');
  assert.equal(getLayerType({ file: { format: 'KOF' }, data: { format: 'GMI' } }), 'KOF');
  assert.equal(getLayerType({ file: { name: 'looks-like.gmi' } }), null);
  assert.equal(getLayerType({ file: { format: 'unknown' }, data: { format: 'SOSI' } }), 'SOSI');
});

test('combined sidebar entries preserve survey order/references without inserting FOTO into survey features', () => {
  const surveyLayers = { a: { file: { format: 'GMI' } }, b: { data: { format: 'SOSI' } } };
  const surveyOrder = Object.freeze(['b', 'a']);
  const photoLayers = [{ id: 'photo-2', type: 'FOTO' }, { id: 'photo-1', type: 'FOTO' }];
  const entries = getWorkspaceLayerEntries(surveyLayers, surveyOrder, photoLayers);
  assert.deepEqual(entries.map((e) => e.id), ['photo-2', 'photo-1', 'b', 'a']);
  assert.deepEqual(entries.map((e) => e.kind), ['photo', 'photo', 'survey', 'survey']);
  assert.strictEqual(entries[2].layer, surveyLayers.b);
  assert.deepEqual(Object.keys(surveyLayers), ['a', 'b']);
  assert.deepEqual(surveyOrder, ['b', 'a']);
});
