import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLayerTableReveal } from '../src/lib/layerTableReveal.mjs';

const all = [0, 1, 2, 3].map((__index) => ({ __index }));
const classify = (overrides = {}) => classifyLayerTableReveal({ targets: [{ sourceIndex: 2 }],
  sortedRows: all.map((original) => ({ original })), allRows: all, filteredRows: all, searchedRows: all, ...overrides });
test('visible target resolves in final sorted order, including multi-object corrections', () => {
  assert.deepEqual(classify(), { kind: 'visible', index: 2, sourceIndex: 2 });
  assert.deepEqual(classify({ sortedRows: [...all].reverse(), targets: [{ sourceIndex: 1 }, { sourceIndex: 3 }] }),
    { kind: 'visible', index: 0, sourceIndex: 3 });
});
test('Tema/Felt filter, search and selected-only exclusions are explained without mutation', () => {
  const remaining = all.filter((row) => row.__index !== 2);
  assert.deepEqual(classify({ sortedRows: remaining, filteredRows: remaining, searchedRows: remaining }), { kind: 'hidden', reasons: ['filter'] });
  assert.deepEqual(classify({ sortedRows: remaining, searchedRows: remaining }), { kind: 'hidden', reasons: ['search'] });
  assert.deepEqual(classify({ sortedRows: remaining, showOnly: true }), { kind: 'hidden', reasons: ['selected-only'] });
  assert.deepEqual(classify({ sortedRows: remaining, filteredRows: remaining, searchedRows: remaining, showOnly: true }),
    { kind: 'hidden', reasons: ['filter', 'selected-only'] });
  assert.equal(all.length, 4);
});
test('absent target cannot offer a filter repair', () => {
  assert.deepEqual(classify({ targets: [{ sourceIndex: 99 }] }), { kind: 'absent' });
});
