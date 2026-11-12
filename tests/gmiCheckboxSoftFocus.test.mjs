import test from 'node:test';
import assert from 'node:assert/strict';
import { gmiCheckboxSoftFocus, reduceGmiEditSelection } from '../src/lib/gmiEditSelection.mjs';
import { gmiObjectFocusIntent } from '../src/lib/gmiEditView.mjs';

test('T3 checkbox intent follows accepted membership, source identity and host, including ranges', () => {
  const binding = { layerId: 'synthetic', sessionId: 'session', fingerprint: 'bytes' };
  const context = { binding, counts: { line: 6 } };
  const target = { scope: 'line', sourceIndex: 2 };
  const first = reduceGmiEditSelection(null, { type: 'toggle', scope: 'line', key: 'line:2' }, context);
  assert.equal(gmiCheckboxSoftFocus(null, first, target, binding), true);
  assert.equal(gmiCheckboxSoftFocus(first, first, target, binding), false, 'refused/repeated write');
  const removed = reduceGmiEditSelection(first, { type: 'toggle', scope: 'line', key: 'line:2' }, context);
  assert.equal(gmiCheckboxSoftFocus(first, removed, target, binding), false, 'uncheck');
  const range = reduceGmiEditSelection(first, { type: 'range', scope: 'line', key: 'line:5', checked: true,
    orderedKeys: Array.from({ length: 6 }, (_,i) => `line:${i}`) }, context);
  assert.equal(gmiCheckboxSoftFocus(first, range, { scope: 'line', sourceIndex: 5 }, binding), true);
  assert.equal(gmiCheckboxSoftFocus(range, first, { scope: 'line', sourceIndex: 5 }, binding), false);
  assert.equal(gmiCheckboxSoftFocus(null, first, target, { ...binding, sessionId: 'replaced' }), false);
  assert.equal(gmiCheckboxSoftFocus(null, { ...first, host: { kind: 'inspection', key: 'validator' } }, target, binding), false);
  assert.equal(gmiCheckboxSoftFocus(null, null, target, binding), false);
});

test('T3 inspector intent: soft checks inspect batches, retain dirty objects, and never request a guard', () => {
  for (const dirty of [false, true]) for (const sameObject of [false, true]) {
    assert.equal(gmiObjectFocusIntent({ soft: true, batchInspector: true, dirty, sameObject }), 'inspect');
    assert.equal(gmiObjectFocusIntent({ soft: true, dirty, sameObject }), dirty && !sameObject ? 'retain' : 'focus');
  }
  assert.equal(gmiObjectFocusIntent({ soft: true }), 'focus', 'clean editor or ChangeSet details');
  assert.equal(gmiObjectFocusIntent({ dirty: true }), 'guard', 'ordinary navigation retains its guard');
  assert.equal(gmiObjectFocusIntent({}), 'guard');
  assert.equal(gmiObjectFocusIntent({ dirty: true, sameObject: true }), 'focus', 'same object retains its form');
});
